import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getClient, query as defaultQuery } from "../db/connect.js";
import { createCourseToMolyClient } from "./courseToMolyClient.js";
import {
  DEFAULT_BROWSER_TX_TTL_SECONDS,
  DEFAULT_SSO_TTL_SECONDS,
  SsoPolicyError,
  buildSsoAuthorizeUrl,
  buildSsoCallbackUrl,
  buildSsoStartUrl,
  computePkceChallengeS256,
  constantTimeEqual,
  generateOpaqueSsoCode,
  generatePkceVerifier,
  generateSsoNonce,
  hashSsoToken,
  readSsoCookie,
  resolveSsoTtlSeconds,
  validatePkceChallenge,
  validateSsoStateParam,
  validateSsoTargetPath,
  verifyPkceVerifierS256,
} from "./ssoPathPolicy.service.js";
import { establishLoginSession, hashOpaqueToken } from "./trustedDevice.service.js";
import { bindMolyDeviceToTrustedSlot, verifyDeviceSlotProof } from "./delegatedDeviceBinding.service.js";
import { hasUnrevokedVideoCourseAccess } from "./videoCourseAccessRevocation.service.js";
import {
  EXTERNAL_LMS_ACCESS_EXISTS_SQL,
  hasEffectiveCourseEntitlement,
} from "./externalEntitlementAccess.service.js";

const LINK_TOKEN_TTL_SECONDS = 600;
const CSCA_SSO_TX_COOKIE = "csca_sso_tx";
const CSCA_SSO_LINK_COOKIE = "csca_sso_link";
const PRIVILEGED_ROLES = new Set(["admin", "creator", "teacher", "super_admin", "staff"]);
const isPrivilegedAccount = (user) => PRIVILEGED_ROLES.has(user?.role)
  || user?.management_staff_source_id != null;

function normalizeEmail(email) {
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

function normalizeNamespacedMolyId(rawId) {
  const val = String(rawId || "").trim();
  if (!val) throw new SsoPolicyError(422, "SSO_INVALID_SUBJECT", "Missing Moly user identifier.");
  return val.startsWith("moly:") ? val : `moly:${val}`;
}

function stripMolyPrefix(externalUserId) {
  const val = String(externalUserId || "").trim();
  return val.startsWith("moly:") ? val.slice(5) : val;
}

function normalizeSourceRole(role) {
  const raw = String(role || "student").trim().toLowerCase();
  if (PRIVILEGED_ROLES.has(raw)) return raw;
  return "student";
}

function sanitizeUsernameSeed(rawSeed, fallbackId) {
  const base = String(rawSeed || `moly_${fallbackId}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return base.length >= 3 ? base : `moly_${String(fallbackId).replace(/[^a-z0-9]/gi, "").slice(0, 12) || "user"}`;
}

function createDbRunner(db) {
  if (!db) {
    return {
      query: (sql, params) => defaultQuery(sql, params),
      getClient: () => getClient(),
    };
  }
  return {
    query: (sql, params) => db.query(sql, params),
    getClient: () => {
      if (typeof db.getClient === "function") return db.getClient();
      if (typeof db.connect === "function") return db.connect();
      if (db.pool && typeof db.pool.connect === "function") return db.pool.connect();
      return {
        query: (sql, params) => db.query(sql, params),
        release() {},
      };
    },
  };
}

async function runSsoTransaction(runner, work) {
  const client = await runner.getClient();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createShadowLearnerOnCourse(client, { externalUserId, email, emailVerified, displayName, username }) {
  const safeEmail = email || `${externalUserId.replace(/[^a-z0-9]/gi, "_")}@sso.moly.local`;
  const baseSeed = sanitizeUsernameSeed(username || displayName || safeEmail.split("@")[0], externalUserId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? "" : `_${crypto.randomBytes(3).toString("hex")}`;
    const candidateUsername = `${baseSeed}${suffix}`.slice(0, 50);
    await client.query("SAVEPOINT sso_shadow_user");
    try {
      const inserted = (await client.query(
        `INSERT INTO users (
           username, email, password_hash, role, oauth_provider,
           email_verified, is_locked, is_management_managed, lms_account_status,
           management_display_name
         ) VALUES (
           $1, $2, NULL, 'user', 'local',
           $3, FALSE, FALSE, 'unmanaged',
           $4
         )
         RETURNING id, username, email, role, oauth_provider, is_locked, is_management_managed, lms_account_status`,
        [candidateUsername, safeEmail, Boolean(email && emailVerified), displayName || candidateUsername],
      )).rows[0];
      await client.query("RELEASE SAVEPOINT sso_shadow_user");
      return { ...inserted, has_external_lms_access: false };
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT sso_shadow_user");
      if (error?.code === "23505" && String(error?.constraint || "").includes("username") && attempt < 4) {
        continue;
      }
      throw error;
    }
  }
  throw new SsoPolicyError(409, "SSO_PROVISION_CONFLICT", "Unable to provision shadow learner username.");
}

async function withTransaction(runner, work) {
  const conflicts = [];
  try {
    return await runSsoTransaction(runner, (client) => work({
      query: (sql, params) => client.query(sql, params),
      ssoConflicts: conflicts,
    }));
  } catch (error) {
    // Rejected account changes roll back, but their security review queue survives.
    for (const { sql, params } of conflicts) await runner.query(sql, params);
    throw error;
  }
}

async function recordConflict(client, {
  conflictType,
  externalUserId,
  candidateUserId = null,
  existingUserId = null,
  emailHint = null,
  correlationId = null,
  reason,
  payload = {},
}) {
  const persist = async (sql, params) => {
    await client.query(sql, params);
    client.ssoConflicts?.push({ sql, params });
  };
  await persist(
    `INSERT INTO integration_conflicts (
       source_system, conflict_type, status, external_user_id,
       candidate_user_id, existing_user_id, email_hint, correlation_id,
       source_updated_at, reason, payload
     ) VALUES (
       'moly', $1, 'open', $2,
       $3, $4, $5, $6,
       NOW(), $7, $8::jsonb
     )`,
    [
      conflictType,
      externalUserId,
      candidateUserId,
      existingUserId,
      emailHint,
      correlationId,
      reason,
      JSON.stringify(payload),
    ],
  );
}

export function createMolySsoService({
  db = null,
  molyClient = createCourseToMolyClient(),
  createSessionForUser = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const runner = createDbRunner(db);
  const clientFactory = () => runner.getClient();

  async function buildSession({ user, deviceToken, ipAddress, userAgent }) {
    if (typeof createSessionForUser === "function") {
      return createSessionForUser({ user, deviceToken, ipAddress, userAgent, db: runner });
    }
    return establishLoginSession({
      userId: user.id,
      deviceToken,
      ipAddress,
      userAgent,
      expiresAt: new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000),
      clientFactory,
    });
  }

  async function assertCourseLaunchEligible({
    userId,
    targetSystem = "moly",
    targetPath = "/khoa-hoc",
    scopeType = "account",
    scopedLocalCourseId = null,
  }) {
    if (targetSystem !== "moly") {
      throw new SsoPolicyError(400, "INVALID_SSO_TARGET_SYSTEM", "Course can only launch SSO toward Moly Studio.");
    }
    const safeTargetPath = validateSsoTargetPath(targetPath || "/khoa-hoc", { targetSystem: "moly" });
    const user = (await runner.query(
      `SELECT id, username, email, role, is_locked, management_staff_source_id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    )).rows[0];
    if (!user) {
      throw new SsoPolicyError(404, "USER_NOT_FOUND", "Account does not exist.");
    }
    if (user.is_locked) {
      throw new SsoPolicyError(403, "ACCOUNT_LOCKED", "Account is locked and cannot launch SSO.");
    }
    if (isPrivilegedAccount(user)) {
      throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Privileged accounts cannot launch cross-system SSO.");
    }
    if (scopeType === "course" && scopedLocalCourseId) {
      const access = await hasEffectiveCourseEntitlement({
        db: runner,
        userId: user.id,
        courseId: Number(scopedLocalCourseId),
      });
      if (!access) {
        throw new SsoPolicyError(403, "SSO_ENTITLEMENT_REVOKED", "Course access is not active for this account.");
      }
    }
    return { user, safeTargetPath };
  }

  async function checkMolyLaunchIntent({
    userId,
    targetSystem = "moly",
    targetPath = "/khoa-hoc",
    scopeType = "account",
    scopedLocalCourseId = null,
    scopedExternalCourseId = null,
    correlationId = null,
    webBaseUrl = null,
  }) {
    const { safeTargetPath } = await assertCourseLaunchEligible({
      userId,
      targetSystem,
      targetPath,
      scopeType,
      scopedLocalCourseId,
    });
    const corr = correlationId || crypto.randomUUID();
    const targetWebBase = webBaseUrl || molyClient.getConfig().webBaseUrl || env.MOLY_WEB_BASE_URL || "";
    const destinationStartUrl = targetWebBase
      ? buildSsoStartUrl({
          webBaseUrl: targetWebBase,
          targetPath: safeTargetPath,
          courseId: scopedLocalCourseId,
          offeringId: scopedExternalCourseId,
        })
      : null;

    return {
      targetSystem: "moly",
      targetPath: safeTargetPath,
      destinationStartUrl,
      correlationId: corr,
    };
  }

  async function authorizeMolySsoRequest({
    userId,
    state,
    codeChallenge,
    codeChallengeMethod = "S256",
    targetSystem = "moly",
    targetPath = "/khoa-hoc",
    scopeType = "account",
    scopedLocalCourseId = null,
    scopedExternalCourseId = null,
    deviceToken = null,
    trustedDeviceId = null,
    correlationId = null,
    webBaseUrl = null,
  }) {
    const validatedState = validateSsoStateParam(state);
    const validatedChallenge = validatePkceChallenge(codeChallenge, codeChallengeMethod);
    const { user, safeTargetPath } = await assertCourseLaunchEligible({
      userId,
      targetSystem,
      targetPath,
      scopeType,
      scopedLocalCourseId,
    });

    const ttlSeconds = resolveSsoTtlSeconds(env.MOLY_SSO_TTL_SECONDS, DEFAULT_SSO_TTL_SECONDS);
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const code = generateOpaqueSsoCode();
    const codeHash = hashSsoToken(code);
    const corr = correlationId || crypto.randomUUID();
    let resolvedTrustedDeviceId = trustedDeviceId ? Number(trustedDeviceId) : null;
    if (!resolvedTrustedDeviceId && deviceToken) {
      const devRes = await runner.query(
        `SELECT id FROM trusted_login_devices
         WHERE user_id = $1 AND device_token_hash = $2 AND revoked_at IS NULL
         LIMIT 1`,
        [user.id, hashOpaqueToken(deviceToken)],
      );
      resolvedTrustedDeviceId = devRes.rows[0]?.id ? Number(devRes.rows[0].id) : null;
    }
    const codeMetadata = resolvedTrustedDeviceId ? { trustedDeviceId: resolvedTrustedDeviceId } : {};

    await runner.query(
      `INSERT INTO integration_sso_codes (
         code_hash, source_system, source_user_id, local_user_id,
         target_system, target_path, nonce, pkce_challenge, pkce_method,
         scope_type, scoped_local_course_id, scoped_external_course_id,
         correlation_id, metadata, expires_at
       ) VALUES (
         $1, 'csca-course', $2, $3,
         'moly', $4, $5, $6, 'S256',
         $7, $8, $9,
         $10, $11::jsonb, $12
       )`,
      [
        codeHash,
        String(user.id),
        user.id,
        safeTargetPath,
        validatedState,
        validatedChallenge,
        scopeType === "course" ? "course" : "account",
        scopedLocalCourseId,
        scopedExternalCourseId,
        corr,
        JSON.stringify(codeMetadata),
        expiresAt.toISOString(),
      ],
    );

    const targetWebBase = webBaseUrl || molyClient.getConfig().webBaseUrl || env.MOLY_WEB_BASE_URL || "";
    const callbackUrl = targetWebBase
      ? buildSsoCallbackUrl({ webBaseUrl: targetWebBase, code, state: validatedState })
      : null;

    return {
      code,
      state: validatedState,
      targetSystem: "moly",
      targetPath: safeTargetPath,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: ttlSeconds,
      correlationId: corr,
      redirectUrl: callbackUrl,
      launchUrl: callbackUrl,
    };
  }

  async function issueCourseSsoCode() {
    throw new SsoPolicyError(
      400,
      "SSO_PKCE_REQUIRED",
      "Legacy non-PKCE SSO launch is disabled. Use destination-initiated PKCE browser transaction flow.",
    );
  }

  async function exchangeCourseSsoCode({
    code,
    nonce,
    codeVerifier = null,
    consumerSystem = "moly",
    consumeIp = null,
    deviceSlotProof = null,
    correlationId = null,
  }) {
    if (!code || !nonce) {
      throw new SsoPolicyError(400, "SSO_INVALID_REQUEST", "SSO code and nonce are required.");
    }
    if (!codeVerifier) {
      throw new SsoPolicyError(401, "SSO_PKCE_VERIFIER_REQUIRED", "PKCE code_verifier is required.");
    }
    if (consumerSystem !== "moly") {
      throw new SsoPolicyError(403, "SSO_CONSUMER_MISMATCH", "Consumer system mismatch.");
    }

    const codeHash = hashSsoToken(code);
    const current = now();
    const corr = correlationId || crypto.randomUUID();

    return withTransaction(runner, async (client) => {
      const ssoRow = (await client.query(
        `SELECT *
         FROM integration_sso_codes
         WHERE code_hash = $1
         FOR UPDATE`,
        [codeHash],
      )).rows[0];

      if (!ssoRow || ssoRow.source_system !== "csca-course" || ssoRow.target_system !== "moly") {
        throw new SsoPolicyError(401, "SSO_CODE_INVALID", "Invalid SSO exchange code.");
      }
      if (ssoRow.revoked_at) {
        throw new SsoPolicyError(401, "SSO_CODE_REVOKED", "SSO code has been revoked.");
      }
      if (ssoRow.used_at) {
        throw new SsoPolicyError(409, "SSO_CODE_ALREADY_USED", "SSO code has already been consumed.");
      }
      if (new Date(ssoRow.expires_at).getTime() <= current.getTime()) {
        throw new SsoPolicyError(401, "SSO_CODE_EXPIRED", "SSO code has expired.");
      }
      if (!constantTimeEqual(ssoRow.nonce, nonce)) {
        throw new SsoPolicyError(401, "SSO_STATE_MISMATCH", "SSO state/nonce verification failed.");
      }
      if (!ssoRow.pkce_challenge || String(ssoRow.pkce_method || "").toUpperCase() !== "S256") {
        throw new SsoPolicyError(400, "SSO_PKCE_REQUIRED", "Legacy non-PKCE SSO codes cannot be exchanged.");
      }
      if (!verifyPkceVerifierS256(codeVerifier, ssoRow.pkce_challenge)) {
        throw new SsoPolicyError(403, "SSO_PKCE_MISMATCH", "PKCE code_verifier verification failed.");
      }

      const user = (await client.query(
        `SELECT u.id, u.username, u.email, u.role, u.is_locked, u.email_verified, u.management_staff_source_id,
                u.management_display_name, u.is_management_managed, u.lms_account_status,
                (${EXTERNAL_LMS_ACCESS_EXISTS_SQL("u.id")}) AS has_external_lms_access
         FROM users u
         WHERE u.id = $1
         LIMIT 1`,
        [ssoRow.local_user_id],
      )).rows[0];

      if (!user || user.is_locked) {
        throw new SsoPolicyError(403, "SSO_USER_REVOKED", "Course user is inactive or locked.");
      }
      if (isPrivilegedAccount(user)) {
        throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Privileged accounts cannot authenticate across systems via SSO.");
      }

      const identities = (await client.query(
        `SELECT external_user_id, status
         FROM external_identities
         WHERE source_system = 'moly' AND user_id = $1
         ORDER BY updated_at DESC, id DESC`,
        [user.id],
      )).rows;

      if (identities.length && !identities.some((row) => row.status === "active")) {
        throw new SsoPolicyError(403, "SSO_IDENTITY_REVOKED", "Linked identity access has been revoked.");
      }

      if (ssoRow.scope_type === "course" && ssoRow.scoped_local_course_id) {
        const access = await hasEffectiveCourseEntitlement({
          db: client,
          userId: user.id,
          courseId: Number(ssoRow.scoped_local_course_id),
        });
        if (!access) {
          throw new SsoPolicyError(403, "SSO_ENTITLEMENT_REVOKED", "Course access has expired or been revoked.");
        }
      }

      const safeTargetPath = validateSsoTargetPath(ssoRow.target_path, { targetSystem: "moly" });
      const activeMolyLink = identities.find((row) => row.status === "active");

      let deviceBinding = null;
      if (deviceSlotProof) {
        const verifiedProof = verifyDeviceSlotProof(deviceSlotProof, {
          now: () => current.getTime(),
          env,
        });
        const regRes = await client.query(
          `SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings`,
        );
        if (regRes.rows[0]?.has_bindings) {
          const boundTrustedDeviceId = ssoRow.metadata?.trustedDeviceId
            ? Number(ssoRow.metadata.trustedDeviceId)
            : null;
          deviceBinding = await bindMolyDeviceToTrustedSlot({
            tx: client,
            userId: user.id,
            externalUserId: verifiedProof.externalUserId,
            molyDeviceTokenHash: verifiedProof.molyDeviceTokenHash,
            courseTrustedDeviceId: boundTrustedDeviceId,
            bindingSource: "sso_browser_tx",
            deviceName: verifiedProof.deviceName,
            userAgent: verifiedProof.userAgent,
            ipAddress: verifiedProof.ipAddress || consumeIp,
            correlationId: corr,
            metadata: { flow: "course_to_moly_sso" },
          });
        }
      }

      await client.query(
        `UPDATE integration_sso_codes
         SET used_at = $2, used_by_system = 'moly', consume_ip = $3
         WHERE id = $1 AND used_at IS NULL`,
        [ssoRow.id, current.toISOString(), consumeIp ? String(consumeIp).slice(0, 64) : null],
      );

      return {
        source_system: "csca-course",
        source_user_id: String(user.id),
        email: normalizeEmail(user.email),
        email_verified: Boolean(user.email_verified),
        username: user.username,
        display_name: user.management_display_name || user.username,
        role: user.role === "admin" ? "admin" : user.role === "creator" ? "teacher" : "student",
        linked_target_user_id: activeMolyLink ? stripMolyPrefix(activeMolyLink.external_user_id) : null,
        target_path: safeTargetPath,
        scope_type: ssoRow.scope_type,
        scoped_local_course_id: ssoRow.scoped_local_course_id ?? null,
        scoped_external_course_id: ssoRow.scoped_external_course_id ?? null,
        nonce: ssoRow.nonce,
        correlation_id: ssoRow.correlation_id || corr,
        ...(deviceBinding ? { device_binding: deviceBinding } : {}),
      };
    });
  }

  async function resolveConsumeOutcome(client, exchanged, { current, corr }) {
    const namespacedExtUserId = normalizeNamespacedMolyId(exchanged.source_user_id);
    const sourceRole = normalizeSourceRole(exchanged.role);
    const email = normalizeEmail(exchanged.email);
    const targetPath = validateSsoTargetPath(exchanged.target_path, { targetSystem: "csca-course" });
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      "moly:identity", namespacedExtUserId,
    ]);

    // 1. Canonical lookup: existing external_identities row for ('moly', 'moly:<id>')
    const existingIdentity = (await client.query(
      `SELECT ei.id, ei.user_id, ei.status,
              u.id AS u_id, u.username, u.email, u.role, u.is_locked, u.locked_reason,
              u.is_management_managed, u.lms_account_status, u.management_staff_source_id,
              (${EXTERNAL_LMS_ACCESS_EXISTS_SQL("u.id")}) AS has_external_lms_access
       FROM external_identities ei
       JOIN users u ON u.id = ei.user_id
       WHERE ei.source_system = 'moly' AND ei.external_user_id = $1
       FOR UPDATE OF ei`,
      [namespacedExtUserId],
    )).rows[0];

    if (existingIdentity) {
      if (existingIdentity.status !== "active") {
        throw new SsoPolicyError(403, "SSO_IDENTITY_REVOKED", "Linked Course identity has been revoked or suspended.");
      }
      if (existingIdentity.is_locked) {
        throw new SsoPolicyError(403, "SSO_USER_REVOKED", "Course user account is locked.");
      }
      if (isPrivilegedAccount(existingIdentity) || PRIVILEGED_ROLES.has(sourceRole)) {
        await recordConflict(client, {
          conflictType: "PRIVILEGED_ROLE_COLLISION",
          externalUserId: namespacedExtUserId,
          candidateUserId: existingIdentity.u_id,
          emailHint: email,
          correlationId: corr,
          reason: "Privileged role accounts cannot auto-sign-in across systems via SSO.",
        });
        throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Privileged accounts cannot sign in across systems via SSO.");
      }
      return {
        outcome: "AUTHENTICATED",
        user: {
          id: existingIdentity.u_id,
          username: existingIdentity.username,
          email: existingIdentity.email,
          role: existingIdentity.role,
          is_locked: existingIdentity.is_locked,
          has_external_lms_access: existingIdentity.has_external_lms_access,
        },
        targetPath,
        externalUserId: namespacedExtUserId,
      };
    }

    // Never allow privileged SSO roles to JIT-provision or merge with any existing account.
    if (PRIVILEGED_ROLES.has(sourceRole)) {
      await recordConflict(client, {
        conflictType: "PRIVILEGED_ROLE_COLLISION",
        externalUserId: namespacedExtUserId,
        emailHint: email,
        correlationId: corr,
        reason: "Privileged source role rejected by SSO policy.",
      });
      throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Privileged accounts cannot use cross-system SSO.");
    }

    // 2. If source already knows its paired Course local user ID and no conflicting active identity exists, verify safely
    // (still requires email collision check if not linked!).
    if (email) {
      const emailCandidates = (await client.query(
        `SELECT id, username, email, role, is_locked, password_hash, oauth_provider, management_staff_source_id
         FROM users
         WHERE LOWER(email) = LOWER($1)
         ORDER BY id ASC`,
        [email],
      )).rows;

      if (emailCandidates.length > 0) {
        const privilegedCandidate = emailCandidates.find(isPrivilegedAccount);
        if (privilegedCandidate) {
          await recordConflict(client, {
            conflictType: "PRIVILEGED_ROLE_COLLISION",
            externalUserId: namespacedExtUserId,
            candidateUserId: privilegedCandidate.id,
            emailHint: email,
            correlationId: corr,
            reason: "SSO email matches a privileged teacher/admin account on Course.",
          });
          throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Matching privileged account cannot be linked via SSO.");
        }

        const candidate = emailCandidates[0];
        if (candidate.is_locked) {
          throw new SsoPolicyError(403, "SSO_USER_REVOKED", "Matching Course account is locked.");
        }

        // Existing unlinked learner collision -> ALWAYS stop and require Safe Linking verification!
        const linkToken = generateOpaqueSsoCode(32);
        const linkTokenHash = hashSsoToken(linkToken);
        const linkBrowserTxToken = generateOpaqueSsoCode(32);
        const linkBrowserTxHash = hashSsoToken(linkBrowserTxToken);
        const expiresAt = new Date(current.getTime() + LINK_TOKEN_TTL_SECONDS * 1000);

        await recordConflict(client, {
          conflictType: "IDENTITY_EMAIL_COLLISION",
          externalUserId: namespacedExtUserId,
          candidateUserId: candidate.id,
          emailHint: email,
          correlationId: corr,
          reason: "Existing unlinked Course learner shares the same email; explicit verification required.",
        });

        await client.query(
          `INSERT INTO integration_sso_link_requests (
             link_token_hash, browser_tx_hash, source_system, external_user_id, candidate_user_id,
             email, source_role, target_path, sso_nonce, correlation_id, expires_at, metadata
           ) VALUES (
             $1, $2, 'moly', $3, $4,
             $5, $6, $7, $8, $9, $10, $11::jsonb
           )`,
          [
            linkTokenHash,
            linkBrowserTxHash,
            namespacedExtUserId,
            candidate.id,
            email,
            sourceRole,
            targetPath,
            exchanged.nonce || null,
            corr,
            expiresAt.toISOString(),
            JSON.stringify({
              scope_type: exchanged.scope_type || "account",
              scoped_external_course_id: exchanged.scoped_external_course_id || null,
            }),
          ],
        );

        return {
          outcome: "LINK_REQUIRED",
          linkToken,
          linkBrowserTxToken,
          email,
          targetPath,
          hasPassword: Boolean(candidate.password_hash),
          candidateUserId: candidate.id,
          correlationId: corr,
        };
      }
    }

    // 3. No collision + learner role -> create clean JIT shadow learner (`password_hash = NULL`, `link_method = 'sso'`)
    const shadowUser = await createShadowLearnerOnCourse(client, {
      externalUserId: namespacedExtUserId,
      email,
      emailVerified: exchanged.email_verified === true,
      displayName: exchanged.display_name || exchanged.username,
      username: exchanged.username,
    });

    await client.query(
      `INSERT INTO external_identities (
         source_system, external_user_id, user_id, status,
         email_snapshot, link_method, source_updated_at, last_synced_at, correlation_id
       ) VALUES (
         'moly', $1, $2, 'active',
         $3, 'sso', $4, $4, $5
       )`,
      [
        namespacedExtUserId,
        shadowUser.id,
        email,
        current.toISOString(),
        corr,
      ],
    );

    return {
      outcome: "AUTHENTICATED",
      user: shadowUser,
      targetPath,
      externalUserId: namespacedExtUserId,
      jitCreated: true,
    };
  }

  async function finalizeScopedEntitlementIfAny(userId, exchanged) {
    if (exchanged.scope_type === "course") {
      const mapping = (await runner.query(
        `SELECT ecm.local_course_id, ecm.local_video_course_profile_id, vcp.source_live_class_id
         FROM external_course_mappings ecm
         LEFT JOIN video_course_profiles vcp ON vcp.id = ecm.local_video_course_profile_id
         WHERE ecm.source_system = 'moly'
           AND ecm.external_course_id = $1
           AND ecm.status = 'active'
         LIMIT 1`,
        [exchanged.scoped_external_course_id],
      )).rows[0];
      if (!mapping?.local_video_course_profile_id) {
        throw new SsoPolicyError(409, "COURSE_MAPPING_MISSING", "An active video profile mapping is required.");
      }
      const entitlementScope = {
        db: runner, userId, courseId: mapping.local_course_id,
        liveClassId: mapping.source_live_class_id || null,
        profileId: mapping.local_video_course_profile_id,
      };
      const profileScope = {
        db: runner, userId, courseId: mapping.local_course_id,
        profileId: mapping.local_video_course_profile_id,
      };
      if (!(await hasEffectiveCourseEntitlement(entitlementScope)) || !(await hasUnrevokedVideoCourseAccess(profileScope))) {
        throw new SsoPolicyError(403, "VIDEO_COURSE_ACCESS_REVOKED", "No effective access to this video offering.");
      }
      return `/video-courses/profile-${mapping.local_video_course_profile_id}`;
    }
    return validateSsoTargetPath(exchanged.target_path, { targetSystem: "csca-course" });
  }

  async function startIncomingMolySsoTransaction({
    targetPath = null,
    courseId = null,
    offeringId = null,
    correlationId = null,
    webBaseUrl = null,
  } = {}) {
    const fallbackPath = offeringId
      ? `/video-courses/${encodeURIComponent(String(offeringId)).replace(/%3A/gi, ":")}`
      : "/courses";
    const safeTargetPath = validateSsoTargetPath(targetPath || fallbackPath, { targetSystem: "csca-course" });
    const browserTxToken = generateOpaqueSsoCode(32);
    const txTokenHash = hashSsoToken(browserTxToken);
    const state = generateSsoNonce();
    const codeVerifier = generatePkceVerifier();
    const codeChallenge = computePkceChallengeS256(codeVerifier);
    const ttlSeconds = resolveSsoTtlSeconds(env.SSO_BROWSER_TX_TTL_SECONDS, DEFAULT_BROWSER_TX_TTL_SECONDS);
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const corr = correlationId || crypto.randomUUID();

    await runner.query(
      `INSERT INTO integration_sso_browser_txs (
         tx_token_hash, direction, purpose, state,
         code_verifier, code_challenge, code_challenge_method, target_path, correlation_id, expires_at
       ) VALUES (
         $1, 'moly_to_csca_course', 'sso_login', $2,
         $3, $4, 'S256', $5, $6, $7
       )`,
      [txTokenHash, state, codeVerifier, codeChallenge, safeTargetPath, corr, expiresAt.toISOString()],
    );

    const sourceWebBase = webBaseUrl || molyClient.getConfig().webBaseUrl || env.MOLY_WEB_BASE_URL || "";
    const authorizeUrl = sourceWebBase
      ? buildSsoAuthorizeUrl({
          webBaseUrl: sourceWebBase,
          targetSystem: "csca-course",
          state,
          codeChallenge,
          codeChallengeMethod: "S256",
          targetPath: safeTargetPath,
          courseId,
          offeringId,
        })
      : null;

    return {
      cookieName: CSCA_SSO_TX_COOKIE,
      browserTxToken,
      ttlSeconds,
      state,
      targetPath: safeTargetPath,
      authorizeUrl,
      expiresAt: expiresAt.toISOString(),
      correlationId: corr,
    };
  }

  async function consumeMolySso({
    code,
    state,
    req = null,
    browserTxToken = null,
    deviceToken,
    ipAddress,
    userAgent,
    correlationId = null,
  }) {
    if (!code || !state) {
      throw new SsoPolicyError(400, "SSO_INVALID_REQUEST", "SSO code and state are required.");
    }
    const rawTxToken = browserTxToken || readSsoCookie(req, CSCA_SSO_TX_COOKIE);
    if (!rawTxToken) {
      throw new SsoPolicyError(
        403,
        "SSO_BROWSER_BINDING_REQUIRED",
        "SSO login must finish in the browser session that initiated it.",
      );
    }

    const corr = correlationId || crypto.randomUUID();
    const current = now();
    const txHash = hashSsoToken(rawTxToken);

    const boundTx = await withTransaction(runner, async (client) => {
      const txRow = (await client.query(
        `SELECT *
         FROM integration_sso_browser_txs
         WHERE tx_token_hash = $1
         FOR UPDATE`,
        [txHash],
      )).rows[0];

      if (!txRow || txRow.direction !== "moly_to_csca_course" || txRow.purpose !== "sso_login") {
        throw new SsoPolicyError(403, "SSO_BROWSER_BINDING_INVALID", "Invalid SSO browser transaction cookie.");
      }
      if (txRow.revoked_at) {
        throw new SsoPolicyError(403, "SSO_BROWSER_TX_REVOKED", "SSO browser transaction was revoked.");
      }
      if (txRow.consumed_at) {
        throw new SsoPolicyError(409, "SSO_BROWSER_TX_ALREADY_USED", "SSO browser transaction was already consumed.");
      }
      if (new Date(txRow.expires_at).getTime() <= current.getTime()) {
        throw new SsoPolicyError(401, "SSO_BROWSER_TX_EXPIRED", "SSO browser transaction has expired. Please try again.");
      }
      if (!constantTimeEqual(txRow.state, state)) {
        throw new SsoPolicyError(403, "SSO_BROWSER_STATE_MISMATCH", "SSO state does not match this browser transaction.");
      }

      await client.query(
        `UPDATE integration_sso_browser_txs
         SET consumed_at = $2
         WHERE id = $1 AND consumed_at IS NULL`,
        [txRow.id, current.toISOString()],
      );

      return {
        codeVerifier: txRow.code_verifier,
        targetPath: txRow.target_path,
      };
    });

    const exchanged = await molyClient.exchangeSsoCode({
      code,
      nonce: state,
      codeVerifier: boundTx.codeVerifier,
      consumeIp: ipAddress,
      correlationId: corr,
    });
    if (exchanged?.source_system !== "moly" || !exchanged.source_user_id
      || !constantTimeEqual(exchanged.nonce, state)) {
      throw new SsoPolicyError(502, "SSO_INVALID_RESPONSE", "SSO issuer or nonce does not match this exchange.");
    }

    const resolved = await withTransaction(runner, (client) =>
      resolveConsumeOutcome(client, exchanged, { current, corr }),
    );

    if (resolved.outcome === "LINK_REQUIRED") {
      return {
        status: "LINK_REQUIRED",
        linkToken: resolved.linkToken,
        linkBrowserTxToken: resolved.linkBrowserTxToken,
        linkCookieName: CSCA_SSO_LINK_COOKIE,
        linkCookieTtlSeconds: LINK_TOKEN_TTL_SECONDS,
        email: resolved.email,
        hasPassword: resolved.hasPassword,
        targetPath: resolved.targetPath,
        correlationId: corr,
      };
    }

    const redirectPath = await finalizeScopedEntitlementIfAny(resolved.user.id, exchanged);

    if (molyClient.isConfigured()) {
      await molyClient.bindPeerIdentity({
        externalUserId: String(resolved.user.id),
        targetUserId: stripMolyPrefix(resolved.externalUserId),
        email: resolved.user.email,
        nonce: exchanged.nonce || state,
        correlationId: corr,
      });
    }

    let molyDeviceHashForBind = null;
    if (exchanged.device_slot_proof) {
      const verified = verifyDeviceSlotProof(exchanged.device_slot_proof, {
        expectedExternalUserId: String(exchanged.source_user_id),
        now: () => current.getTime(),
        env,
      });
      molyDeviceHashForBind = verified.molyDeviceTokenHash;
    } else if (typeof exchanged.moly_device_token_hash === "string" && /^[0-9a-f]{64}$/i.test(exchanged.moly_device_token_hash.trim())) {
      molyDeviceHashForBind = exchanged.moly_device_token_hash.trim().toLowerCase();
    }

    let effectiveDeviceToken = deviceToken;
    if (molyDeviceHashForBind) {
      const { adoptMolySlotForCourseSso } = await import("./delegatedDeviceBinding.service.js");
      effectiveDeviceToken = await adoptMolySlotForCourseSso({
        db: runner,
        userId: resolved.user.id,
        molyDeviceTokenHash: molyDeviceHashForBind,
        existingCourseDeviceToken: deviceToken,
      });
    }

    const session = await buildSession({
      user: resolved.user, deviceToken: effectiveDeviceToken, ipAddress, userAgent,
    });

    if (molyDeviceHashForBind && session?.trustedDeviceId) {
      const regRes = await runner.query(
        `SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings`,
      );
      if (regRes.rows[0]?.has_bindings) {
        await bindMolyDeviceToTrustedSlot({
          db: runner,
          userId: resolved.user.id,
          externalUserId: String(exchanged.source_user_id),
          molyDeviceTokenHash: molyDeviceHashForBind,
          courseTrustedDeviceId: session.trustedDeviceId,
          bindingSource: "sso_browser_tx",
          userAgent,
          ipAddress,
          correlationId: corr,
          metadata: { flow: "moly_to_course_sso" },
        });
      }
    }

    return {
      status: "AUTHENTICATED",
      user: resolved.user,
      session,
      redirectPath,
      correlationId: corr,
    };
  }

  async function getCourseSafeLinkStatus({ req = null, linkBrowserTxToken = null } = {}) {
    const rawLinkCookie = linkBrowserTxToken || readSsoCookie(req, CSCA_SSO_LINK_COOKIE);
    if (!rawLinkCookie) {
      throw new SsoPolicyError(404, "SSO_LINK_SESSION_NOT_FOUND", "No pending link verification in this browser.");
    }
    const cookieHash = hashSsoToken(rawLinkCookie);
    const current = now();
    const row = (await runner.query(
      `SELECT l.id, l.email, l.target_path, l.expires_at, l.completed_at, (u.password_hash IS NOT NULL) AS has_password
       FROM integration_sso_link_requests l
       JOIN users u ON u.id = l.candidate_user_id
       WHERE l.browser_tx_hash = $1
         AND l.source_system = 'moly'
       ORDER BY l.id DESC
       LIMIT 1`,
      [cookieHash],
    )).rows[0];

    if (!row || row.completed_at) {
      throw new SsoPolicyError(404, "SSO_LINK_SESSION_NOT_FOUND", "Link verification session has already completed or is invalid.");
    }
    if (new Date(row.expires_at).getTime() <= current.getTime()) {
      throw new SsoPolicyError(401, "SSO_LINK_TOKEN_EXPIRED", "Verification challenge has expired.");
    }

    return {
      status: "LINK_REQUIRED",
      email: row.email,
      hasPassword: Boolean(row.has_password),
      targetPath: row.target_path,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  async function confirmCourseSafeLink({
    linkToken = "",
    password = null,
    authenticatedUser = null,
    req = null,
    linkBrowserTxToken = null,
    deviceToken,
    ipAddress,
    userAgent,
    correlationId = null,
  }) {
    const rawLinkCookie = linkBrowserTxToken || readSsoCookie(req, CSCA_SSO_LINK_COOKIE);
    if (!rawLinkCookie) {
      throw new SsoPolicyError(
        403,
        "SSO_BROWSER_BINDING_REQUIRED",
        "Account link verification must be completed in the same browser session.",
      );
    }
    const trimmedLinkToken = typeof linkToken === "string" ? linkToken.trim() : "";
    const tokenHash = trimmedLinkToken ? hashSsoToken(trimmedLinkToken) : null;
    const browserTxHash = hashSsoToken(rawLinkCookie);
    const current = now();
    const corr = correlationId || crypto.randomUUID();

    const verifiedUser = await withTransaction(runner, async (client) => {
      const linkRow = tokenHash
        ? (await client.query(
            `SELECT *
             FROM integration_sso_link_requests
             WHERE link_token_hash = $1
             FOR UPDATE`,
            [tokenHash],
          )).rows[0]
        : (await client.query(
            `SELECT *
             FROM integration_sso_link_requests
             WHERE browser_tx_hash = $1
               AND source_system = 'moly'
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE`,
            [browserTxHash],
          )).rows[0];

      if (!linkRow || linkRow.completed_at) {
        throw new SsoPolicyError(400, "SSO_LINK_TOKEN_INVALID", "Verification challenge is invalid or already used.");
      }
      if (new Date(linkRow.expires_at).getTime() <= current.getTime()) {
        throw new SsoPolicyError(401, "SSO_LINK_TOKEN_EXPIRED", "Verification challenge has expired.");
      }
      if (!linkRow.browser_tx_hash || !constantTimeEqual(linkRow.browser_tx_hash, browserTxHash)) {
        throw new SsoPolicyError(
          403,
          "SSO_BROWSER_BINDING_MISMATCH",
          "Verification challenge belongs to a different browser session.",
        );
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        "moly:identity", linkRow.external_user_id,
      ]);
      const boundIdentity = (await client.query(
        "SELECT user_id, status FROM external_identities WHERE source_system = $1 AND external_user_id = $2 FOR UPDATE",
        ["moly", linkRow.external_user_id],
      )).rows[0];
      if (boundIdentity && (Number(boundIdentity.user_id) !== Number(linkRow.candidate_user_id)
        || boundIdentity.status !== "active")) {
        throw new SsoPolicyError(409, "IDENTITY_ALREADY_LINKED", "Identity was linked elsewhere or disabled after this challenge was issued.");
      }

      const candidate = (await client.query(
        `SELECT u.id, u.username, u.email, u.role, u.password_hash, u.is_locked, u.management_staff_source_id,
                (${EXTERNAL_LMS_ACCESS_EXISTS_SQL("u.id")}) AS has_external_lms_access
         FROM users u
         WHERE u.id = $1
         FOR UPDATE OF u`,
        [linkRow.candidate_user_id],
      )).rows[0];

      if (!candidate || candidate.is_locked) {
        throw new SsoPolicyError(403, "SSO_USER_REVOKED", "Account is unavailable or locked.");
      }
      if (isPrivilegedAccount(candidate)) {
        throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Privileged accounts cannot be self-linked via SSO.");
      }

      const verifiedBySession = Boolean(
        authenticatedUser
        && Number(authenticatedUser.id) === Number(candidate.id)
        && normalizeEmail(authenticatedUser.email) === normalizeEmail(candidate.email),
      );
      let verifiedByPassword = false;
      if (!verifiedBySession) {
        if (typeof password !== "string" || !password || !candidate.password_hash) {
          throw new SsoPolicyError(401, "SSO_LINK_VERIFICATION_REQUIRED", "Password or active session verification on this account is required.");
        }
        verifiedByPassword = await bcrypt.compare(password, candidate.password_hash);
        if (!verifiedByPassword) {
          throw new SsoPolicyError(401, "INVALID_CREDENTIALS", "Incorrect account password.");
        }
      }

      // Ensure candidate isn't already bound to a different active Moly user
      const otherIdentity = (await client.query(
        `SELECT id, external_user_id
         FROM external_identities
         WHERE source_system = 'moly' AND user_id = $1 AND status IN ('active', 'suspended')
         LIMIT 1`,
        [candidate.id],
      )).rows[0];
      if (otherIdentity && otherIdentity.external_user_id !== linkRow.external_user_id) {
        throw new SsoPolicyError(409, "IDENTITY_ALREADY_LINKED", "This Course account is already linked to another Moly profile.");
      }

      await client.query(
        `INSERT INTO external_identities (
           source_system, external_user_id, user_id, status,
           email_snapshot, link_method, source_updated_at, last_synced_at, correlation_id
         ) VALUES (
           'moly', $1, $2, 'active',
           $3, 'sso', $4, $4, $5
         )
         ON CONFLICT (source_system, external_user_id) DO NOTHING`,
        [linkRow.external_user_id, candidate.id, candidate.email, current.toISOString(), corr],
      );

      await client.query(
        `UPDATE integration_sso_link_requests
         SET completed_at = $2
         WHERE id = $1`,
        [linkRow.id, current.toISOString()],
      );

      await client.query(
        `UPDATE integration_conflicts
         SET status = 'resolved', resolved_by = $2, resolved_at = $3,
             resolution_note = 'Verified by account owner via SSO safe-linking flow'
         WHERE source_system = 'moly'
           AND external_user_id = $1
           AND candidate_user_id = $2
           AND conflict_type = 'IDENTITY_EMAIL_COLLISION'
           AND status IN ('open', 'in_review')`,
        [linkRow.external_user_id, candidate.id, current.toISOString()],
      );

      return {
        candidate,
        targetPath: validateSsoTargetPath(linkRow.target_path, { targetSystem: "csca-course" }),
        externalUserId: linkRow.external_user_id,
        ssoNonce: linkRow.sso_nonce,
        scope: { ...linkRow.metadata, target_path: linkRow.target_path },
      };
    });

    const redirectPath = await finalizeScopedEntitlementIfAny(verifiedUser.candidate.id, verifiedUser.scope);
    if (molyClient.isConfigured()) {
      await molyClient.bindPeerIdentity({
        externalUserId: String(verifiedUser.candidate.id),
        targetUserId: stripMolyPrefix(verifiedUser.externalUserId),
        email: verifiedUser.candidate.email,
        nonce: verifiedUser.ssoNonce || "safe-link",
        correlationId: corr,
      });
    }
    const session = await buildSession({
      user: verifiedUser.candidate, deviceToken, ipAddress, userAgent,
    });

    return {
      status: "AUTHENTICATED",
      user: verifiedUser.candidate,
      session,
      redirectPath,
      correlationId: corr,
    };
  }

  async function bindPeerIdentityFromMoly({
    externalUserId,
    targetUserId,
    email = null,
    correlationId = null,
  }) {
    const namespacedExtUserId = normalizeNamespacedMolyId(externalUserId);
    const localCourseUserId = Number(targetUserId);
    if (!Number.isSafeInteger(localCourseUserId) || localCourseUserId <= 0) {
      throw new SsoPolicyError(422, "VALIDATION_ERROR", "Valid target_user_id is required.");
    }
    const corr = correlationId || crypto.randomUUID();
    const current = now();

    return withTransaction(runner, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        "moly:identity", namespacedExtUserId,
      ]);
      const localUser = (await client.query(
        `SELECT id, email, role, is_locked, management_staff_source_id
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [localCourseUserId],
      )).rows[0];
      if (!localUser || localUser.is_locked) {
        throw new SsoPolicyError(404, "USER_NOT_FOUND", "Target Course user does not exist or is locked.");
      }
      if (isPrivilegedAccount(localUser)) {
        throw new SsoPolicyError(403, "PRIVILEGED_ROLE_COLLISION", "Cannot bind privileged accounts.");
      }

      const byExternal = (await client.query(
        `SELECT id, user_id, status
         FROM external_identities
         WHERE source_system = 'moly' AND external_user_id = $1
         FOR UPDATE`,
        [namespacedExtUserId],
      )).rows[0];

      if (byExternal) {
        if (byExternal.status !== "active") {
          throw new SsoPolicyError(403, "SSO_IDENTITY_REVOKED", "Peer identity is not active.");
        }
        if (Number(byExternal.user_id) !== localCourseUserId) {
          throw new SsoPolicyError(409, "IDENTITY_ALREADY_LINKED", "External identity is bound to a different Course user.");
        }
        return { bound: true, existing: true, userId: localCourseUserId, externalUserId: namespacedExtUserId };
      }

      const byLocal = (await client.query(
        `SELECT id, external_user_id
         FROM external_identities
         WHERE source_system = 'moly' AND user_id = $1 AND status IN ('active', 'suspended')
         LIMIT 1`,
        [localCourseUserId],
      )).rows[0];
      if (byLocal) {
        throw new SsoPolicyError(409, "IDENTITY_ALREADY_LINKED", "Course user is already linked to a different Moly account.");
      }

      await client.query(
        `INSERT INTO external_identities (
           source_system, external_user_id, user_id, status,
           email_snapshot, link_method, source_updated_at, last_synced_at, correlation_id
         ) VALUES (
           'moly', $1, $2, 'active',
           $3, 'sso', $4, $4, $5
         )`,
        [namespacedExtUserId, localCourseUserId, normalizeEmail(email) || normalizeEmail(localUser.email), current.toISOString(), corr],
      );

      return { bound: true, existing: false, userId: localCourseUserId, externalUserId: namespacedExtUserId };
    });
  }

  return {
    CSCA_SSO_TX_COOKIE,
    CSCA_SSO_LINK_COOKIE,
    checkMolyLaunchIntent,
    authorizeMolySsoRequest,
    issueCourseSsoCode,
    exchangeCourseSsoCode,
    startIncomingMolySsoTransaction,
    consumeMolySso,
    getCourseSafeLinkStatus,
    confirmCourseSafeLink,
    bindPeerIdentityFromMoly,
  };
}
