import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";
import { createManagedUsername } from "../utils/usernameGenerator.js";
import { hasUnrevokedVideoCourseAccess } from "./videoCourseAccessRevocation.service.js";
import {
  createIntegrationLogger,
  getIntegrationMetricsSnapshot,
  isMolyIntegrationKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
  resolveCorrelationId,
} from "./integrationLogger.service.js";
import {
  EXTERNAL_ENTITLEMENT_STATUSES,
  ExternalIntegrationError,
  canonicalHashPayload,
  normalizeExternalId,
  normalizeJsonObject,
  normalizeNullableTimestamp,
  normalizeOptionalText,
  normalizeTimestamp,
  parsePositiveBigIntId,
  resolveExternalCourseMapping,
  runWithTransaction,
} from "./externalCourseMapping.service.js";

const defaultDb = { query, getClient };
const integrationLog = createIntegrationLogger({ component: "moly-integration" });

export const MOLY_SOURCE_SYSTEM = "moly";
export const MOLY_IDENTITY_STATUSES = new Set(["active", "revoked", "expired", "suspended"]);

const CONFLICT_TYPES_REQUIRING_QUARANTINE = new Set([
  "IDENTITY_EMAIL_COLLISION",
  "PRIVILEGED_ROLE_COLLISION",
  "IDENTITY_ALREADY_LINKED",
  "COURSE_MAPPING_MISSING",
  "ENTITLEMENT_CONFLICT",
  "UNRESOLVED_IDENTITY",
  "STALE_EVENT_CONFLICT",
  "MANUAL_REVIEW_REQUIRED",
]);

export class MolyIntegrationError extends ExternalIntegrationError {
  constructor(
    statusCode,
    errorCode,
    message,
    { details = undefined, retryable = false, conflictType = null, conflictContext = {} } = {},
  ) {
    super(statusCode, errorCode, message, details);
    this.name = "MolyIntegrationError";
    this.retryable = Boolean(retryable);
    this.conflictType = conflictType;
    this.conflictContext = conflictContext;
  }
}

const requireMolySourceSystem = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized !== MOLY_SOURCE_SYSTEM) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_SOURCE_SYSTEM",
      `source_system must be '${MOLY_SOURCE_SYSTEM}' on Moly integration endpoints.`,
    );
  }
  return MOLY_SOURCE_SYSTEM;
};

const requireMolyNamespacedId = (value, fieldName, { disallowEmail = true } = {}) => {
  const trimmed = normalizeExternalId(value, fieldName, 128);
  if (!trimmed.startsWith("moly:") || trimmed.length <= 5) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_EXTERNAL_ID",
      `${fieldName} must be namespaced with 'moly:' (for example 'moly:541').`,
    );
  }
  if (disallowEmail && trimmed.slice(5).includes("@")) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_EXTERNAL_ID",
      `${fieldName} must be an opaque canonical ID, never an email address.`,
    );
  }
  return trimmed;
};

const resolveEnvelopeIds = (body, headerMeta = {}) => {
  const eventId = normalizeExternalId(body.event_id, "event_id", 128);
  const headerIdem = headerMeta.idempotencyKey ? String(headerMeta.idempotencyKey).trim() : null;
  const bodyIdem = body.idempotency_key !== undefined && body.idempotency_key !== null
    ? normalizeExternalId(body.idempotency_key, "idempotency_key", 180)
    : null;
  if (headerIdem && bodyIdem && headerIdem !== bodyIdem) {
    throw new ExternalIntegrationError(
      400,
      "IDEMPOTENCY_KEY_CONFLICT",
      "Body idempotency_key does not match Idempotency-Key header.",
    );
  }
  const idempotencyKey = bodyIdem || headerIdem;
  if (!idempotencyKey) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "idempotency_key is required.");
  }
  const correlationId = normalizeOptionalText(
    body.correlation_id ?? headerMeta.correlationId,
    128,
    "correlation_id",
  );
  if (!correlationId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "correlation_id is required.");
  }
  return { eventId, idempotencyKey, correlationId };
};

const normalizeEmailHint = (rawEmail) => {
  const cleaned = normalizeOptionalText(rawEmail, 255, "email_hint");
  if (!cleaned) return null;
  const normalized = cleaned.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "profile.email_hint must be a valid email.");
  }
  return normalized;
};

export const parseProvisionWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const { eventId, idempotencyKey, correlationId } = resolveEnvelopeIds(rawBody, headerMeta);
  const sourceSystem = requireMolySourceSystem(rawBody.source_system);
  const externalUserId = requireMolyNamespacedId(rawBody.external_user_id, "external_user_id");
  const sourceUpdatedAt = normalizeTimestamp(rawBody.source_updated_at, "source_updated_at");
  const accountStatusRaw = typeof rawBody.account_status === "string"
    ? rawBody.account_status.trim().toLowerCase()
    : "active";
  if (!MOLY_IDENTITY_STATUSES.has(accountStatusRaw)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid account_status value.");
  }
  const profileObj = normalizeJsonObject(rawBody.profile, "profile");
  const fullName = normalizeOptionalText(profileObj.full_name, 120, "profile.full_name");
  const emailHint = normalizeEmailHint(profileObj.email_hint);
  const emailVerified = profileObj.email_verified === true;
  const metadata = normalizeJsonObject(rawBody.metadata, "metadata");

  const canonicalWire = {
    source_system: sourceSystem,
    external_user_id: externalUserId,
    source_updated_at: sourceUpdatedAt.toISOString(),
    account_status: accountStatusRaw,
    profile: {
      full_name: fullName,
      email_hint: emailHint,
      email_verified: emailVerified,
    },
    metadata,
  };

  return {
    eventType: "user.provisioned",
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    sourceUpdatedAt,
    accountStatus: accountStatusRaw,
    profile: { fullName, emailHint, emailVerified },
    metadata,
    wirePayload: canonicalWire,
    payloadHash: canonicalHashPayload({ event_type: "user.provisioned", ...canonicalWire }),
  };
};

export const parseGrantWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const { eventId, idempotencyKey, correlationId } = resolveEnvelopeIds(rawBody, headerMeta);
  const sourceSystem = requireMolySourceSystem(rawBody.source_system);
  const externalUserId = requireMolyNamespacedId(rawBody.external_user_id, "external_user_id");
  const externalCourseId = requireMolyNamespacedId(rawBody.external_course_id, "external_course_id");
  const externalGrantId = requireMolyNamespacedId(rawBody.external_grant_id, "external_grant_id");
  const status = typeof rawBody.status === "string" ? rawBody.status.trim().toLowerCase() : "active";
  if (!EXTERNAL_ENTITLEMENT_STATUSES.has(status) || status === "revoked") {
    throw new ExternalIntegrationError(
      422,
      "INVALID_ENTITLEMENT_STATUS",
      "Grant endpoint status must be active, suspended, or expired.",
    );
  }
  const validFrom = normalizeTimestamp(rawBody.valid_from, "valid_from");
  const validUntil = normalizeNullableTimestamp(rawBody.valid_until, "valid_until");
  if (validUntil && validUntil <= validFrom) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "valid_until must be later than valid_from.");
  }
  const sourceUpdatedAt = normalizeTimestamp(rawBody.source_updated_at, "source_updated_at");
  const metadata = normalizeJsonObject(rawBody.metadata, "metadata");

  const canonicalWire = {
    source_system: sourceSystem,
    external_user_id: externalUserId,
    external_course_id: externalCourseId,
    external_grant_id: externalGrantId,
    status,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil ? validUntil.toISOString() : null,
    source_updated_at: sourceUpdatedAt.toISOString(),
    metadata,
  };

  return {
    eventType: "entitlement.granted",
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    externalCourseId,
    externalGrantId,
    status,
    validFrom,
    validUntil,
    revokedAt: null,
    reason: null,
    sourceUpdatedAt,
    metadata,
    wirePayload: canonicalWire,
    payloadHash: canonicalHashPayload({ event_type: "entitlement.granted", ...canonicalWire }),
  };
};

export const parseRevokeWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const { eventId, idempotencyKey, correlationId } = resolveEnvelopeIds(rawBody, headerMeta);
  const sourceSystem = requireMolySourceSystem(rawBody.source_system);
  const externalUserId = requireMolyNamespacedId(rawBody.external_user_id, "external_user_id");
  const externalCourseId = requireMolyNamespacedId(rawBody.external_course_id, "external_course_id");
  const externalGrantId = requireMolyNamespacedId(rawBody.external_grant_id, "external_grant_id");
  const status = typeof rawBody.status === "string" ? rawBody.status.trim().toLowerCase() : "revoked";
  if (!["revoked", "suspended", "expired"].includes(status)) {
    throw new ExternalIntegrationError(
      422,
      "INVALID_ENTITLEMENT_STATUS",
      "Revoke endpoint status must be revoked, suspended, or expired.",
    );
  }
  const sourceUpdatedAt = normalizeTimestamp(rawBody.source_updated_at, "source_updated_at");
  const revokedAt = status === "revoked"
    ? normalizeTimestamp(rawBody.revoked_at ?? sourceUpdatedAt, "revoked_at")
    : null;
  const reason = normalizeOptionalText(rawBody.reason ?? rawBody.revoke_reason, 500, "reason");
  const validFrom = normalizeNullableTimestamp(rawBody.valid_from, "valid_from");
  const validUntil = normalizeNullableTimestamp(rawBody.valid_until, "valid_until");
  if (validFrom && validUntil && validUntil <= validFrom) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "valid_until must be later than valid_from.");
  }
  const metadata = normalizeJsonObject(rawBody.metadata, "metadata");

  const canonicalWire = {
    source_system: sourceSystem,
    external_user_id: externalUserId,
    external_course_id: externalCourseId,
    external_grant_id: externalGrantId,
    status,
    revoked_at: revokedAt ? revokedAt.toISOString() : null,
    reason,
    valid_from: validFrom ? validFrom.toISOString() : null,
    valid_until: validUntil ? validUntil.toISOString() : null,
    source_updated_at: sourceUpdatedAt.toISOString(),
    metadata,
  };

  return {
    eventType: "entitlement.revoked",
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    externalCourseId,
    externalGrantId,
    status,
    validFrom,
    validUntil,
    revokedAt,
    reason,
    sourceUpdatedAt,
    metadata,
    wirePayload: canonicalWire,
    payloadHash: canonicalHashPayload({ event_type: "entitlement.revoked", ...canonicalWire }),
  };
};

export const parseOwnershipQueryWirePayload = (rawBody, headerMeta = {}) => {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const correlationId = normalizeOptionalText(
    rawBody.correlation_id ?? headerMeta.correlationId,
    128,
    "correlation_id",
  );
  const subject = normalizeJsonObject(rawBody.subject, "subject");
  const subjectSource = requireMolySourceSystem(subject.source_system ?? MOLY_SOURCE_SYSTEM);
  const externalUserId = requireMolyNamespacedId(subject.external_user_id, "subject.external_user_id");
  const externalCourseIdsRaw = Array.isArray(rawBody.external_course_ids)
    ? rawBody.external_course_ids
    : [];
  const externalCourseIds = [...new Set(
    externalCourseIdsRaw.map((id, idx) => requireMolyNamespacedId(id, `external_course_ids[${idx}]`)),
  )];
  if (externalCourseIds.length > 100) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "external_course_ids cannot exceed 100 entries.");
  }

  return {
    correlationId,
    subjectSourceSystem: subjectSource,
    externalUserId,
    externalCourseIds,
  };
};

/**
 * Persists a verified Moly integration webhook event into `integration_inbox`
 * before processing. Deduplicates identical retries cleanly and raises `409` on
 * conflicting payload hashes for a reused `event_id` or `idempotency_key`.
 */
export const enqueueMolyIntegrationEvent = async (
  db = defaultDb,
  parsedEnvelope,
  { headersSnapshot = {}, maxAttempts = 5 } = {},
) => {
  const safeHeaders = {
    correlation_id: headersSnapshot.correlationId || parsedEnvelope.correlationId,
    event_timestamp: headersSnapshot.eventTimestamp || null,
    idempotency_key: headersSnapshot.idempotencyKey || parsedEnvelope.idempotencyKey,
  };

  return runWithTransaction(db, async (tx) => {
    const insertedRes = await tx.query(
      `INSERT INTO integration_inbox (
         source_system, event_id, idempotency_key, correlation_id, event_type,
         payload_hash, payload, headers_snapshot, source_updated_at, status,
         attempt_count, max_attempts, next_retry_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, 'pending', 0, $10, NOW())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        parsedEnvelope.sourceSystem,
        parsedEnvelope.eventId,
        parsedEnvelope.idempotencyKey,
        parsedEnvelope.correlationId,
        parsedEnvelope.eventType,
        parsedEnvelope.payloadHash,
        JSON.stringify(parsedEnvelope.wirePayload),
        JSON.stringify(safeHeaders),
        parsedEnvelope.sourceUpdatedAt.toISOString(),
        Math.max(1, Number(maxAttempts) || 5),
      ],
    );

    if (insertedRes.rows[0]) {
      const row = insertedRes.rows[0];
      return {
        outcome: "queued",
        httpStatus: 202,
        inbox: row,
        body: {
          success: true,
          queued: true,
          correlation_id: row.correlation_id,
          data: {
            inbox_id: Number(row.id),
            event_id: row.event_id,
            idempotency_key: row.idempotency_key,
            source_system: row.source_system,
            event_type: row.event_type,
            status: row.status,
            received_at: row.received_at,
          },
        },
      };
    }

    const existingRes = await tx.query(
      `SELECT *
       FROM integration_inbox
       WHERE source_system = $1
         AND (event_id = $2 OR idempotency_key = $3)
       ORDER BY id ASC`,
      [parsedEnvelope.sourceSystem, parsedEnvelope.eventId, parsedEnvelope.idempotencyKey],
    );
    const matches = existingRes.rows;
    if (matches.length !== 1 || matches[0].payload_hash !== parsedEnvelope.payloadHash) {
      throw new ExternalIntegrationError(
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
        "Event ID or Idempotency-Key is already bound to a different payload.",
        {
          event_id: parsedEnvelope.eventId,
          idempotency_key: parsedEnvelope.idempotencyKey,
        },
      );
    }

    const existing = matches[0];
    return {
      outcome: "duplicate",
      httpStatus: 200,
      inbox: existing,
      body: existing.response_body && typeof existing.response_body === "object"
        ? { ...existing.response_body, duplicate: true }
        : {
          success: true,
          duplicate: true,
          queued: existing.status === "pending" || existing.status === "processing",
          correlation_id: existing.correlation_id || parsedEnvelope.correlationId,
          data: {
            inbox_id: Number(existing.id),
            event_id: existing.event_id,
            idempotency_key: existing.idempotency_key,
            source_system: existing.source_system,
            event_type: existing.event_type,
            status: existing.status,
          },
        },
    };
  });
};

const isPrivilegedLocalAccount = (user) => Boolean(
  user && (user.role === "admin" || user.role === "creator" || user.management_staff_source_id !== null),
);

/**
 * Resolves/provisions a Moly student safely inside an active DB transaction.
 * Rejects auto-linking on matched emails or privileged accounts into `integration_conflicts`.
 */
export const applyMolyUserProvisionTx = async (
  tx,
  envelope,
  { recordAudit = recordAuditEvent } = {},
) => {
  const {
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    sourceUpdatedAt,
    accountStatus,
    profile,
    metadata,
  } = envelope;

  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    "moly:identity",
    externalUserId,
  ]);

  const existingIdRes = await tx.query(
    `SELECT *
     FROM external_identities
     WHERE source_system = $1 AND external_user_id = $2
     FOR UPDATE`,
    [sourceSystem, externalUserId],
  );
  const existingIdentity = existingIdRes.rows[0] || null;

  if (existingIdentity) {
    const userRes = await tx.query(
      `SELECT id, username, email, role, management_staff_source_id, is_management_managed, lms_account_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [existingIdentity.user_id],
    );
    const localUser = userRes.rows[0];
    if (!localUser) {
      throw new MolyIntegrationError(
        409,
        "ENTITLEMENT_CONFLICT",
        `Linked local user ${existingIdentity.user_id} does not exist.`,
        {
          conflictType: "MANUAL_REVIEW_REQUIRED",
          conflictContext: { externalUserId, emailHint: profile.emailHint },
        },
      );
    }
    if (isPrivilegedLocalAccount(localUser)) {
      throw new MolyIntegrationError(
        409,
        "PRIVILEGED_ROLE_COLLISION",
        `Linked local account holds privileged role '${localUser.role}'; integration updates require manual review.`,
        {
          conflictType: "PRIVILEGED_ROLE_COLLISION",
          conflictContext: {
            externalUserId,
            candidateUserId: Number(localUser.id),
            existingUserId: Number(localUser.id),
            emailHint: profile.emailHint,
            candidateRole: localUser.role,
          },
        },
      );
    }

    const storedTs = new Date(existingIdentity.source_updated_at);
    if (sourceUpdatedAt < storedTs
      || (sourceUpdatedAt.getTime() === storedTs.getTime() && accountStatus !== existingIdentity.status)) {
      await recordAudit({
        db: tx,
        actorId: null,
        action: "integration.external_identity_stale_ignored",
        entityType: "external_identity",
        entityId: Number(existingIdentity.id),
        beforeState: existingIdentity,
        afterState: existingIdentity,
        metadata: {
          correlationId,
          eventId,
          idempotencyKey,
          incomingSourceUpdatedAt: sourceUpdatedAt.toISOString(),
          storedSourceUpdatedAt: storedTs.toISOString(),
        },
      });
      return {
        outcome: "stale",
        errorCode: "STALE_EVENT",
        errorMessage: "A strictly newer source_updated_at is required to change identity status.",
        responseStatus: 200,
        data: {
          event_id: eventId,
          source_system: sourceSystem,
          external_user_id: externalUserId,
          local_user_id: Number(localUser.id),
          identity_id: Number(existingIdentity.id),
          status: existingIdentity.status,
          inbox_status: "stale",
          link_action: "stale_ignored",
          current_source_updated_at: storedTs.toISOString(),
          applied: false,
        },
      };
    }

    const updatedRes = await tx.query(
      `UPDATE external_identities
       SET status = $1,
           email_snapshot = COALESCE($2, email_snapshot),
           source_updated_at = $3,
           last_synced_at = NOW(),
           correlation_id = $4,
           metadata = external_identities.metadata || $5::jsonb
       WHERE id = $6
       RETURNING *`,
      [
        accountStatus,
        profile.emailHint,
        sourceUpdatedAt.toISOString(),
        correlationId,
        JSON.stringify(metadata || {}),
        existingIdentity.id,
      ],
    );
    const updatedIdentity = updatedRes.rows[0];

    if (profile.fullName) {
      await tx.query(
        `INSERT INTO student_profiles (user_id, full_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           full_name = COALESCE(student_profiles.full_name, EXCLUDED.full_name),
           updated_at = NOW()`,
        [localUser.id, profile.fullName],
      );
    }

    await recordAudit({
      db: tx,
      actorId: null,
      action: "integration.external_identity_synced",
      entityType: "external_identity",
      entityId: Number(updatedIdentity.id),
      beforeState: existingIdentity,
      afterState: updatedIdentity,
      metadata: { correlationId, eventId, idempotencyKey, sourceSystem },
    });

    return {
      outcome: "applied",
      responseStatus: 200,
      data: {
        event_id: eventId,
        source_system: sourceSystem,
        external_user_id: externalUserId,
        local_user_id: Number(localUser.id),
        identity_id: Number(updatedIdentity.id),
        status: updatedIdentity.status,
        link_action: "already_linked",
        source_updated_at: updatedIdentity.source_updated_at,
        applied: true,
      },
    };
  }

  if (profile.emailHint) {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      "moly:email",
      profile.emailHint,
    ]);

    const matchedUsersRes = await tx.query(
      `SELECT id, username, email, role, email_verified, management_staff_source_id, is_management_managed
       FROM users
       WHERE LOWER(email) = LOWER($1)
       ORDER BY id ASC
       FOR UPDATE`,
      [profile.emailHint],
    );
    const matchedUser = matchedUsersRes.rows[0] || null;
    if (matchedUser) {
      if (isPrivilegedLocalAccount(matchedUser)) {
        throw new MolyIntegrationError(
          409,
          "PRIVILEGED_ROLE_COLLISION",
          `Email hint matches privileged local account (role '${matchedUser.role}'); automatic linking is forbidden.`,
          {
            conflictType: "PRIVILEGED_ROLE_COLLISION",
            conflictContext: {
              externalUserId,
              emailHint: profile.emailHint,
              candidateUserId: Number(matchedUser.id),
              candidateRole: matchedUser.role,
              reason: `Matched local account holds role '${matchedUser.role}'; automatic linking is forbidden.`,
            },
          },
        );
      }

      const linkedOtherRes = await tx.query(
        `SELECT id, external_user_id
         FROM external_identities
         WHERE user_id = $1 AND source_system = $2 AND status IN ('active', 'suspended')
         LIMIT 1`,
        [matchedUser.id, sourceSystem],
      );
      if (linkedOtherRes.rows[0]) {
        throw new MolyIntegrationError(
          409,
          "IDENTITY_ALREADY_LINKED",
          `Existing local student ${matchedUser.id} is already linked to ${linkedOtherRes.rows[0].external_user_id}.`,
          {
            conflictType: "IDENTITY_ALREADY_LINKED",
            conflictContext: {
              externalUserId,
              emailHint: profile.emailHint,
              candidateUserId: Number(matchedUser.id),
              existingUserId: Number(matchedUser.id),
              existingExternalUserId: linkedOtherRes.rows[0].external_user_id,
              reason: `Local student is already linked to ${linkedOtherRes.rows[0].external_user_id}; refusing email merge.`,
            },
          },
        );
      }

      // Security invariant: never auto-link merely from matching email.
      throw new MolyIntegrationError(
        409,
        "IDENTITY_EMAIL_COLLISION",
        "Email hint matches an existing student account; manual verification or SSO linking is required.",
        {
          conflictType: "IDENTITY_EMAIL_COLLISION",
          conflictContext: {
            externalUserId,
            emailHint: profile.emailHint,
            candidateUserId: Number(matchedUser.id),
            reason: "Matching email cannot auto-link accounts without explicit verified ownership or admin review.",
          },
        },
      );
    }
  }

  const username = await createManagedUsername(tx, "moly", externalUserId, {
    email: profile.emailHint,
    fullName: profile.fullName,
  });
  const syntheticEmail = profile.emailHint
    || `ext-moly-${crypto.createHash("sha256").update(externalUserId).digest("hex").slice(0, 16)}@external.moly.invalid`;

  // Pure external learner: never mark is_management_managed = TRUE.
  const createdUserRes = await tx.query(
    `INSERT INTO users (
       username, email, password_hash, email_verified, role,
       is_management_managed, lms_account_status
     )
     VALUES ($1, $2, NULL, FALSE, 'user', FALSE, 'unmanaged')
     RETURNING id, username, email, role, is_management_managed, lms_account_status`,
    [username, syntheticEmail],
  );
  const createdUser = createdUserRes.rows[0];

  if (profile.fullName) {
    await tx.query(
      `INSERT INTO student_profiles (user_id, full_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = COALESCE(student_profiles.full_name, EXCLUDED.full_name),
         updated_at = NOW()`,
      [createdUser.id, profile.fullName],
    );
  }

  const identityRes = await tx.query(
    `INSERT INTO external_identities (
       source_system, external_user_id, user_id, status, email_snapshot,
       link_method, source_updated_at, last_synced_at, correlation_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, 'provisioned', $6, NOW(), $7, $8::jsonb)
     RETURNING *`,
    [
      sourceSystem,
      externalUserId,
      createdUser.id,
      accountStatus,
      profile.emailHint,
      sourceUpdatedAt.toISOString(),
      correlationId,
      JSON.stringify(metadata || {}),
    ],
  );
  const newIdentity = identityRes.rows[0];

  await recordAudit({
    db: tx,
    actorId: null,
    action: "integration.external_identity_provisioned",
    entityType: "external_identity",
    entityId: Number(newIdentity.id),
    beforeState: null,
    afterState: {
      identity: newIdentity,
      user: {
        id: Number(createdUser.id),
        username: createdUser.username,
        role: createdUser.role,
        isManagementManaged: createdUser.is_management_managed,
      },
    },
    metadata: { correlationId, eventId, idempotencyKey, sourceSystem },
  });

  return {
    outcome: "applied",
    responseStatus: 200,
    data: {
      event_id: eventId,
      source_system: sourceSystem,
      external_user_id: externalUserId,
      local_user_id: Number(createdUser.id),
      identity_id: Number(newIdentity.id),
      status: newIdentity.status,
      link_action: "provisioned",
      source_updated_at: newIdentity.source_updated_at,
      applied: true,
    },
  };
};

const syncCourseEnrollmentProjectionTx = async (
  tx,
  {
    userId,
    sourceSystem,
    entitlementId,
    localCourseId,
    localVideoCourseProfileId,
    isRevokeTombstone = false,
  },
) => {
  // 1. Course-level `enrollments` status reflects combined active rights across
  // Management and all external systems so revoking one never strips another.
  const anyActiveCourseRes = await tx.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1
       FROM lms_access_grants g
       JOIN users u ON u.id = g.user_id
       WHERE g.user_id = $1
         AND g.course_id = $2
         AND g.access_status = 'active'
         AND g.valid_from <= NOW()
         AND (g.valid_until IS NULL OR g.valid_until > NOW())
         AND (u.is_internal_test_account = TRUE OR u.is_management_managed = FALSE OR u.lms_account_status = 'active')
     )
     OR EXISTS (
       SELECT 1
       FROM external_entitlements ee
       JOIN external_identities ei ON ei.id = ee.external_identity_id
       WHERE ee.user_id = $1
         AND ee.local_course_id = $2
         AND ei.status = 'active'
         AND ee.status = 'active'
         AND ee.valid_from <= NOW()
         AND (ee.valid_until IS NULL OR ee.valid_until > NOW())
     )`,
    [userId, localCourseId],
  );
  const courseStillActive = anyActiveCourseRes.rows.length > 0;

  if (courseStillActive) {
    await tx.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active'`,
      [userId, localCourseId],
    );
  } else if (!isRevokeTombstone) {
    await tx.query(
      `UPDATE enrollments
       SET status = 'revoked'
       WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
      [userId, localCourseId],
    );
  }

  // 2. Scoped Record membership row (`class_enrollments`), strictly isolated by
  // `enrollment_source` and `video_course_profile_id` so Management rows are untouched
  // and mapping 1 profile never unlocks sibling profiles on the same course.
  // Keep scheduled grants projected too; request-time entitlement checks enforce
  // valid_from, so access starts on time without needing another webhook.
  const activeExternalScopeRes = await tx.query(
    `SELECT ee.id
     FROM external_entitlements ee
     JOIN external_identities ei ON ei.id = ee.external_identity_id
     WHERE ee.user_id = $1
       AND ee.source_system = $2
       AND ee.local_course_id = $3
       AND (
         ($4::bigint IS NULL AND ee.local_video_course_profile_id IS NULL)
         OR ee.local_video_course_profile_id = $4
       )
       AND ei.status = 'active'
       AND ee.status = 'active'
       AND (ee.valid_until IS NULL OR ee.valid_until > NOW())
     ORDER BY ee.source_updated_at DESC, ee.id DESC
     LIMIT 1`,
    [userId, sourceSystem, localCourseId, localVideoCourseProfileId],
  );
  const activeScopeEntitlement = activeExternalScopeRes.rows[0] || null;

  if (activeScopeEntitlement) {
    if (localVideoCourseProfileId !== null) {
      await tx.query(
        `INSERT INTO class_enrollments (
           user_id, course_id, live_class_id, video_course_profile_id,
           learning_mode, status, external_entitlement_id, enrollment_source
         )
         VALUES ($1, $2, NULL, $3, 'recording', 'active', $4, $5)
         ON CONFLICT (user_id, video_course_profile_id, enrollment_source)
         WHERE video_course_profile_id IS NOT NULL AND live_class_id IS NULL
         DO UPDATE SET
           course_id = EXCLUDED.course_id,
           status = 'active',
           learning_mode = 'recording',
           ended_at = NULL,
           external_entitlement_id = EXCLUDED.external_entitlement_id`,
        [userId, localCourseId, localVideoCourseProfileId, activeScopeEntitlement.id, sourceSystem],
      );
    } else {
      await tx.query(
        `INSERT INTO class_enrollments (
           user_id, course_id, live_class_id, video_course_profile_id,
           learning_mode, status, external_entitlement_id, enrollment_source
         )
         VALUES ($1, $2, NULL, NULL, 'recording', 'active', $3, $4)
         ON CONFLICT (user_id, course_id, enrollment_source)
         WHERE video_course_profile_id IS NULL
           AND live_class_id IS NULL
           AND management_class_alias_id IS NULL
           AND enrollment_source <> 'local'
         DO UPDATE SET
           status = 'active',
           learning_mode = 'recording',
           ended_at = NULL,
           external_entitlement_id = EXCLUDED.external_entitlement_id`,
        [userId, localCourseId, activeScopeEntitlement.id, sourceSystem],
      );
    }
  } else {
    await tx.query(
      `UPDATE class_enrollments
       SET status = 'revoked',
           ended_at = NOW()
       WHERE user_id = $1
         AND enrollment_source = $2
         AND live_class_id IS NULL
         AND status <> 'revoked'
         AND (
           ($3::bigint IS NULL AND video_course_profile_id IS NULL AND course_id = $4)
           OR video_course_profile_id = $3
         )`,
      [userId, sourceSystem, localVideoCourseProfileId, localCourseId],
    );
  }
};

const isEqualIsoWindow = (a, b) => {
  const ta = a ? new Date(a).getTime() : null;
  const tb = b ? new Date(b).getTime() : null;
  return ta === tb;
};

/**
 * Applies `entitlement.granted` or `entitlement.revoked` inside a transaction
 * with strict monotonic timestamp ordering, revoke-before-grant tombstone retention,
 * immutable offering binding, and offering-scoped Record projection.
 */
export const applyMolyEntitlementLifecycleTx = async (
  tx,
  envelope,
  { recordAudit = recordAuditEvent } = {},
) => {
  const {
    eventId,
    idempotencyKey,
    correlationId,
    sourceSystem,
    externalUserId,
    externalCourseId,
    externalGrantId,
    status,
    sourceUpdatedAt,
    reason,
    metadata,
  } = envelope;

  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    sourceSystem,
    externalGrantId,
  ]);

  const currentRes = await tx.query(
    `SELECT *
     FROM external_entitlements
     WHERE source_system = $1 AND external_grant_id = $2
     FOR UPDATE`,
    [sourceSystem, externalGrantId],
  );
  const current = currentRes.rows[0] || null;

  const identityRes = await tx.query(
    `SELECT ei.*, u.role AS local_user_role, u.management_staff_source_id
     FROM external_identities ei
     JOIN users u ON u.id = ei.user_id
     WHERE ei.source_system = $1 AND ei.external_user_id = $2
     FOR SHARE OF ei`,
    [sourceSystem, externalUserId],
  );
  const identity = identityRes.rows[0] || null;
  if (!identity) {
    throw new MolyIntegrationError(
      409,
      "UNRESOLVED_IDENTITY",
      `External user '${externalUserId}' has not been provisioned or linked yet.`,
      {
        retryable: true,
        conflictType: "UNRESOLVED_IDENTITY",
        conflictContext: { externalUserId, externalCourseId, externalGrantId },
      },
    );
  }
  if (isPrivilegedLocalAccount({
    role: identity.local_user_role,
    management_staff_source_id: identity.management_staff_source_id,
  })) {
    throw new MolyIntegrationError(
      409,
      "PRIVILEGED_ROLE_COLLISION",
      `Linked account '${identity.user_id}' holds privileged role '${identity.local_user_role}'.`,
      {
        conflictType: "PRIVILEGED_ROLE_COLLISION",
        conflictContext: {
          externalUserId,
          externalCourseId,
          externalGrantId,
          candidateUserId: Number(identity.user_id),
          existingUserId: Number(identity.user_id),
        },
      },
    );
  }
  if (status === "active" && identity.status !== "active") {
    throw new MolyIntegrationError(
      409,
      "IDENTITY_INACTIVE",
      `External identity '${externalUserId}' is '${identity.status}'; cannot activate entitlement.`,
      {
        conflictType: "MANUAL_REVIEW_REQUIRED",
        conflictContext: {
          externalUserId,
          externalCourseId,
          externalGrantId,
          existingUserId: Number(identity.user_id),
        },
      },
    );
  }

  if (current) {
    if (
      current.external_user_id !== externalUserId
      || current.external_course_id !== externalCourseId
      || Number(current.user_id) !== Number(identity.user_id)
    ) {
      throw new MolyIntegrationError(
        409,
        "ENTITLEMENT_CONFLICT",
        "Grant subject and offering are immutable and conflict with existing entitlement record.",
        {
          conflictType: "ENTITLEMENT_CONFLICT",
          conflictContext: {
            externalUserId,
            externalCourseId,
            externalGrantId,
            existingUserId: Number(current.user_id),
            candidateUserId: Number(identity.user_id),
            localCourseId: Number(current.local_course_id),
          },
        },
      );
    }

    const storedTs = new Date(current.source_updated_at);
    const sameStateAndWindow = (
      current.status === status
      && (!envelope.validFrom || isEqualIsoWindow(current.valid_from, envelope.validFrom))
      && (envelope.validUntil === undefined || envelope.validUntil === null
        ? current.valid_until === null || envelope.eventType === "entitlement.revoked"
        : isEqualIsoWindow(current.valid_until, envelope.validUntil))
      && (status !== "revoked" || current.revoke_reason === (reason ?? current.revoke_reason))
    );

    if (sourceUpdatedAt < storedTs || (sourceUpdatedAt.getTime() === storedTs.getTime() && !sameStateAndWindow)) {
      await recordAudit({
        db: tx,
        actorId: null,
        action: "integration.entitlement_stale_ignored",
        entityType: "external_entitlement",
        entityId: Number(current.id),
        beforeState: current,
        afterState: current,
        metadata: {
          correlationId,
          eventId,
          idempotencyKey,
          incomingSourceUpdatedAt: sourceUpdatedAt.toISOString(),
          storedSourceUpdatedAt: storedTs.toISOString(),
        },
      });
      return {
        outcome: "stale",
        errorCode: "STALE_EVENT",
        errorMessage: "A strictly newer source_updated_at is required to modify entitlement state.",
        responseStatus: 200,
        data: {
          event_id: eventId,
          source_system: sourceSystem,
          external_grant_id: externalGrantId,
          inbox_status: "stale",
          current_status: current.status,
          current_source_updated_at: storedTs.toISOString(),
          applied: false,
        },
      };
    }

    if (sourceUpdatedAt.getTime() === storedTs.getTime() && sameStateAndWindow) {
      return {
        outcome: "applied",
        responseStatus: 200,
        data: {
          event_id: eventId,
          source_system: sourceSystem,
          external_grant_id: externalGrantId,
          external_user_id: externalUserId,
          external_course_id: externalCourseId,
          local_user_id: Number(current.user_id),
          local_course_id: Number(current.local_course_id),
          local_video_course_profile_id: current.local_video_course_profile_id == null
            ? null
            : Number(current.local_video_course_profile_id),
          status: current.status,
          source_updated_at: storedTs.toISOString(),
          applied: true,
          duplicate_state: true,
        },
      };
    }
  }

  let mappingId = current?.course_mapping_id ? Number(current.course_mapping_id) : null;
  let localCourseId = current?.local_course_id ? Number(current.local_course_id) : null;
  let localVideoCourseProfileId = current?.local_video_course_profile_id != null
    ? Number(current.local_video_course_profile_id)
    : null;
  let localLiveClassId = current?.local_live_class_id != null
    ? Number(current.local_live_class_id)
    : null;

  if (!current || status === "active") {
    let mapping;
    try {
      mapping = await resolveExternalCourseMapping(tx, {
        sourceSystem,
        externalCourseId,
        requireActive: status === "active",
      });
    } catch (err) {
      if (err instanceof ExternalIntegrationError && err.errorCode === "COURSE_MAPPING_MISSING") {
        throw new MolyIntegrationError(422, "COURSE_MAPPING_MISSING", err.message, {
          details: err.details,
          retryable: false,
          conflictType: "COURSE_MAPPING_MISSING",
          conflictContext: {
            externalUserId,
            externalCourseId,
            externalGrantId,
            existingUserId: Number(identity.user_id),
          },
        });
      }
      throw err;
    }

    let profileSourceLiveClassId = mapping.localLiveClassId;
    if (mapping.localVideoCourseProfileId !== null && profileSourceLiveClassId === null) {
      const profileRes = await tx.query(
        "SELECT source_live_class_id FROM video_course_profiles WHERE id = $1",
        [mapping.localVideoCourseProfileId],
      );
      if (profileRes.rows[0]?.source_live_class_id != null) {
        profileSourceLiveClassId = Number(profileRes.rows[0].source_live_class_id);
      }
    }

    if (
      current
      && (
        Number(current.local_course_id) !== mapping.localCourseId
        || (current.local_video_course_profile_id == null ? null : Number(current.local_video_course_profile_id))
          !== (mapping.localVideoCourseProfileId ?? null)
      )
    ) {
      throw new MolyIntegrationError(
        409,
        "ENTITLEMENT_CONFLICT",
        "Manual course mapping destination changed for an existing grant; refusing silent reassignment.",
        {
          conflictType: "ENTITLEMENT_CONFLICT",
          conflictContext: {
            externalUserId,
            externalCourseId,
            externalGrantId,
            existingUserId: Number(current.user_id),
            localCourseId: Number(current.local_course_id),
          },
        },
      );
    }

    mappingId = mapping.id;
    localCourseId = mapping.localCourseId;
    localVideoCourseProfileId = mapping.localVideoCourseProfileId;
    localLiveClassId = profileSourceLiveClassId;
  }

  const effectiveRevokedAt = status === "revoked"
    ? (envelope.revokedAt || sourceUpdatedAt)
    : null;
  const effectiveValidFrom = envelope.validFrom
    || (current?.valid_from ? new Date(current.valid_from) : (effectiveRevokedAt || sourceUpdatedAt));
  let effectiveValidUntil = null;
  if (envelope.validUntil !== undefined && envelope.validUntil !== null) {
    effectiveValidUntil = envelope.validUntil;
  } else if (status !== "active" && current?.valid_until) {
    effectiveValidUntil = new Date(current.valid_until);
  }
  const safeValidUntil = effectiveValidUntil && effectiveValidUntil > effectiveValidFrom
    ? effectiveValidUntil
    : null;

  const upsertRes = await tx.query(
    `INSERT INTO external_entitlements (
       source_system, external_grant_id, external_user_id, external_course_id,
       user_id, local_course_id, course_mapping_id, external_identity_id,
       local_video_course_profile_id, local_live_class_id,
       status, valid_from, valid_until, revoked_at, revoke_reason,
       source_updated_at, last_event_id, correlation_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)
     ON CONFLICT (source_system, external_grant_id) DO UPDATE SET
       status = EXCLUDED.status,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       revoked_at = EXCLUDED.revoked_at,
       revoke_reason = EXCLUDED.revoke_reason,
       external_identity_id = EXCLUDED.external_identity_id,
       source_updated_at = EXCLUDED.source_updated_at,
       last_event_id = EXCLUDED.last_event_id,
       correlation_id = EXCLUDED.correlation_id,
       metadata = external_entitlements.metadata || EXCLUDED.metadata
     WHERE external_entitlements.source_updated_at < EXCLUDED.source_updated_at
     RETURNING *`,
    [
      sourceSystem,
      externalGrantId,
      externalUserId,
      externalCourseId,
      identity.user_id,
      localCourseId,
      mappingId,
      identity.id,
      localVideoCourseProfileId,
      localLiveClassId,
      status,
      effectiveValidFrom.toISOString(),
      safeValidUntil ? safeValidUntil.toISOString() : null,
      effectiveRevokedAt ? effectiveRevokedAt.toISOString() : null,
      status === "revoked" ? reason : null,
      sourceUpdatedAt.toISOString(),
      eventId,
      correlationId,
      JSON.stringify(metadata || {}),
    ],
  );
  const saved = upsertRes.rows[0];
  if (!saved) {
    throw new MolyIntegrationError(
      409,
      "ENTITLEMENT_CONFLICT",
      "Concurrent update rejected by strict source_updated_at monotonicity.",
      { retryable: true },
    );
  }

  await syncCourseEnrollmentProjectionTx(tx, {
    userId: Number(saved.user_id),
    sourceSystem,
    entitlementId: Number(saved.id),
    localCourseId: Number(saved.local_course_id),
    localVideoCourseProfileId,
    isRevokeTombstone: !current && status !== "active",
  });

  await recordAudit({
    db: tx,
    actorId: null,
    action: status === "active"
      ? "integration.entitlement_granted"
      : (!current ? "integration.entitlement_revoked_tombstone" : "integration.entitlement_revoked"),
    entityType: "external_entitlement",
    entityId: Number(saved.id),
    beforeState: current,
    afterState: saved,
    metadata: {
      correlationId,
      eventId,
      idempotencyKey,
      sourceSystem,
      localCourseId: Number(saved.local_course_id),
      localVideoCourseProfileId,
    },
  });

  return {
    outcome: "applied",
    responseStatus: 200,
    data: {
      event_id: eventId,
      source_system: sourceSystem,
      external_grant_id: saved.external_grant_id,
      external_user_id: saved.external_user_id,
      external_course_id: saved.external_course_id,
      local_user_id: Number(saved.user_id),
      local_course_id: Number(saved.local_course_id),
      local_video_course_profile_id: localVideoCourseProfileId,
      status: saved.status,
      valid_from: saved.valid_from,
      valid_until: saved.valid_until,
      ...(saved.revoked_at ? { revoked_at: saved.revoked_at } : {}),
      source_updated_at: saved.source_updated_at,
      applied: true,
    },
  };
};

const rebuildEnvelopeFromInboxRow = (row) => {
  const payload = row.payload || {};
  const meta = {
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
  };
  const withEnvelope = {
    ...payload,
    event_id: row.event_id,
    idempotency_key: row.idempotency_key,
    correlation_id: row.correlation_id,
    source_system: row.source_system,
    source_updated_at: payload.source_updated_at || row.source_updated_at,
  };
  if (row.event_type === "user.provisioned") return parseProvisionWirePayload(withEnvelope, meta);
  if (row.event_type === "entitlement.granted") return parseGrantWirePayload(withEnvelope, meta);
  if (row.event_type === "entitlement.revoked") return parseRevokeWirePayload(withEnvelope, meta);
  throw new MolyIntegrationError(
    422,
    "UNSUPPORTED_EVENT_TYPE",
    `Unsupported Moly inbox event_type: ${row.event_type}`,
    { retryable: false },
  );
};

const persistConflictAndFailure = async (
  db,
  job,
  error,
  { retryBaseSeconds = 30, recordAudit = recordAuditEvent } = {},
) => {
  const errorCode = error?.errorCode || error?.code || "WORKER_EXECUTION_ERROR";
  const errorMessage = String(error?.message || "Unknown integration worker error").slice(0, 2000);
  const httpStatus = Number(error?.statusCode) || 500;
  const isRetryable = error instanceof MolyIntegrationError
    ? error.retryable
    : !(error instanceof ExternalIntegrationError);
  const attemptsExhausted = Number(job.attempt_count) >= Number(job.max_attempts);
  const terminal = !isRetryable || attemptsExhausted;

  const conflictType = error instanceof MolyIntegrationError && error.conflictType
    ? error.conflictType
    : null;
  const ctx = (error instanceof MolyIntegrationError ? error.conflictContext : null) || {};

  return runWithTransaction(db, async (tx) => {
    // A reclaimed lease must fence off the previous worker's failure callback.
    const lease = await tx.query(
      `SELECT id FROM integration_inbox
       WHERE id = $1 AND status = 'processing' AND locked_by = $2 AND attempt_count = $3
       FOR UPDATE`,
      [job.id, job.locked_by, job.attempt_count],
    );
    if (!lease.rows[0]) return { status: "lease_lost" };
    let conflictId = null;
    if (terminal && conflictType && CONFLICT_TYPES_REQUIRING_QUARANTINE.has(conflictType)) {
      const conflictRes = await tx.query(
        `INSERT INTO integration_conflicts (
           source_system, conflict_type, status, external_user_id, external_course_id,
           external_grant_id, inbox_id, candidate_user_id, existing_user_id,
           local_course_id, email_hint, correlation_id, source_updated_at, reason, payload
         )
         VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         RETURNING id`,
        [
          job.source_system,
          conflictType,
          ctx.externalUserId || job.payload?.external_user_id || null,
          ctx.externalCourseId || job.payload?.external_course_id || null,
          ctx.externalGrantId || job.payload?.external_grant_id || null,
          job.id,
          ctx.candidateUserId || null,
          ctx.existingUserId || null,
          ctx.localCourseId || null,
          ctx.emailHint || job.payload?.profile?.email_hint || null,
          job.correlation_id || null,
          job.source_updated_at,
          ctx.reason || errorMessage,
          JSON.stringify({
            event_id: job.event_id,
            event_type: job.event_type,
            ...(ctx.candidateRole ? { candidate_role: ctx.candidateRole } : {}),
            ...(ctx.existingExternalUserId ? { existing_external_user_id: ctx.existingExternalUserId } : {}),
          }),
        ],
      );
      conflictId = Number(conflictRes.rows[0].id);
    }

    const delaySeconds = Math.min(3600, Math.max(0, Number(retryBaseSeconds) * (2 ** Math.max(0, Number(job.attempt_count) - 1))));
    const nextStatus = terminal ? "dead_letter" : "failed";
    const responseBody = {
      success: false,
      errorCode,
      message: errorMessage,
      correlation_id: job.correlation_id,
      ...(conflictId ? { conflict_id: conflictId } : {}),
    };

    const updatedRes = await tx.query(
      `UPDATE integration_inbox
       SET status = $1,
           locked_until = NULL,
           locked_by = NULL,
           next_retry_at = CASE WHEN $8::boolean THEN NOW() + ($2::double precision * INTERVAL '1 second') ELSE next_retry_at END,
           last_error_code = $3,
           last_error_message = $4,
           response_status = $5,
           response_body = $6::jsonb
       WHERE id = $7
       RETURNING *`,
      [
        nextStatus,
        delaySeconds,
        String(errorCode).slice(0, 80),
        errorMessage,
        httpStatus,
        JSON.stringify(responseBody),
        job.id,
        nextStatus === "failed",
      ],
    );

    if (terminal) {
      await recordAudit({
        db: tx,
        actorId: null,
        action: conflictId ? "integration.conflict_quarantined" : "integration.inbox_dead_lettered",
        entityType: "integration_inbox",
        entityId: Number(job.id),
        afterState: {
          status: nextStatus,
          errorCode,
          conflictId,
          attemptCount: Number(job.attempt_count),
        },
        metadata: {
          correlationId: job.correlation_id,
          eventId: job.event_id,
          sourceSystem: job.source_system,
        },
      });
    }

    return {
      inbox: updatedRes.rows[0],
      status: nextStatus,
      errorCode,
      conflictId,
      retryable: !terminal,
    };
  });
};

/**
 * Claims and processes the next due or lease-expired Moly inbox job.
 */
export const processNextMolyInboxJob = async ({
  db = defaultDb,
  workerId = "worker-moly",
  leaseSeconds = 300,
  retryBaseSeconds = 30,
  recordAudit = recordAuditEvent,
  handlers = {},
} = {}) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.inbox.halted_kill_switch");
    integrationLog.warn("inbox_halted_kill_switch", { workerId });
    return null;
  }
  const jobStartMs = Date.now();
  const claimed = await runWithTransaction(db, async (tx) => {
    const claimRes = await tx.query(
      `WITH next_job AS (
         SELECT id
         FROM integration_inbox
         WHERE source_system = $1
           AND (
             (status IN ('pending', 'failed') AND next_retry_at <= NOW())
             OR (status = 'processing' AND locked_until < NOW())
           )
         ORDER BY next_retry_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE integration_inbox inbox
       SET status = 'processing',
           locked_until = NOW() + ($2::integer * INTERVAL '1 second'),
           locked_by = $3,
           attempt_count = inbox.attempt_count + 1
       FROM next_job
       WHERE inbox.id = next_job.id
       RETURNING inbox.*`,
      [MOLY_SOURCE_SYSTEM, Math.max(10, Number(leaseSeconds) || 300), workerId],
    );
    return claimRes.rows[0] || null;
  });

  if (!claimed) return null;

  try {
    const outcome = await runWithTransaction(db, async (tx) => {
      // Hold this row through business writes and completion; SKIP LOCKED cannot
      // reclaim an in-flight transaction, even when its wall-clock lease expires.
      const lease = await tx.query(
        `SELECT id FROM integration_inbox
         WHERE id = $1 AND status = 'processing' AND locked_by = $2 AND attempt_count = $3
         FOR UPDATE`,
        [claimed.id, claimed.locked_by, claimed.attempt_count],
      );
      if (!lease.rows[0]) return { status: "lease_lost" };
      const envelope = rebuildEnvelopeFromInboxRow(claimed);
      let result;
      if (envelope.eventType === "user.provisioned") {
        const fn = handlers.applyUserProvision || applyMolyUserProvisionTx;
        result = await fn(tx, envelope, { recordAudit });
      } else {
        const fn = handlers.applyEntitlement || applyMolyEntitlementLifecycleTx;
        result = await fn(tx, envelope, { recordAudit });
      }

      const finalStatus = result.outcome === "stale" ? "stale" : "processed";
      const responseBody = {
        success: true,
        correlation_id: claimed.correlation_id,
        data: result.data,
      };
      const updatedRes = await tx.query(
        `UPDATE integration_inbox
         SET status = $1,
             locked_until = NULL,
             locked_by = NULL,
             processed_at = NOW(),
             last_error_code = $2,
             last_error_message = $3,
             response_status = $4,
             response_body = $5::jsonb
         WHERE id = $6
         RETURNING *`,
        [
          finalStatus,
          result.errorCode || null,
          result.errorMessage || null,
          result.responseStatus || 200,
          JSON.stringify(responseBody),
          claimed.id,
        ],
      );

      return {
        inbox: updatedRes.rows[0],
        status: finalStatus,
        result: responseBody,
      };
    });

    const durationMs = Date.now() - jobStartMs;
    observeIntegrationLatency("moly.inbox.job_ms", durationMs);
    recordIntegrationMetric(`moly.inbox.${outcome?.status || "unknown"}`);
    integrationLog.info(
      "inbox_job_completed",
      {
        inboxId: claimed.id,
        eventId: claimed.event_id,
        eventType: claimed.event_type,
        status: outcome?.status || "unknown",
        durationMs,
      },
      claimed.correlation_id,
    );
    return outcome;
  } catch (error) {
    const durationMs = Date.now() - jobStartMs;
    observeIntegrationLatency("moly.inbox.job_ms", durationMs);
    recordIntegrationMetric("moly.inbox.error");
    integrationLog.warn(
      "inbox_job_failed",
      {
        inboxId: claimed.id,
        eventId: claimed.event_id,
        eventType: claimed.event_type,
        errorCode: error?.errorCode || error?.code || "INBOX_ERROR",
        message: error?.message || "Inbox job failed.",
        durationMs,
      },
      claimed.correlation_id,
    );
    return persistConflictAndFailure(db, claimed, error, { retryBaseSeconds, recordAudit });
  }
};

/**
 * Drains up to `limit` pending/failed/expired-lease Moly inbox jobs cleanly.
 */
export const processAvailableMolyInboxJobs = async ({
  db = defaultDb,
  workerId = "worker-moly",
  limit = 20,
  leaseSeconds = 300,
  retryBaseSeconds = 30,
  recordAudit = recordAuditEvent,
  handlers = {},
} = {}) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.inbox.batch_halted_kill_switch");
    integrationLog.warn("inbox_batch_halted_kill_switch", { workerId, limit });
    return [];
  }
  const results = [];
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 200);
  for (let idx = 0; idx < cap; idx += 1) {
    const item = await processNextMolyInboxJob({
      db,
      workerId,
      leaseSeconds,
      retryBaseSeconds,
      recordAudit,
      handlers,
    });
    if (!item) break;
    results.push(item);
  }
  return results;
};

/**
 * Queries course ownership on CSCA-Course for a Moly external user identity across
 * both independent `external_entitlements` and Management `lms_access_grants`
 * mapped through `external_course_mappings`.
 */
export const queryCourseOwnershipForMoly = async (db = defaultDb, rawBody, headerMeta = {}) => {
  const parsed = parseOwnershipQueryWirePayload(rawBody, headerMeta);

  const identityRes = await db.query(
    `SELECT id, source_system, external_user_id, user_id, status
     FROM external_identities
     WHERE source_system = $1 AND external_user_id = $2
     LIMIT 1`,
    [parsed.subjectSourceSystem, parsed.externalUserId],
  );
  const identity = identityRes.rows[0] || null;

  const mappingsRes = parsed.externalCourseIds.length > 0
    ? await db.query(
      `SELECT external_course_id, local_course_id, local_video_course_profile_id, local_live_class_id
       FROM external_course_mappings
       WHERE source_system = $1
         AND external_course_id = ANY($2::text[])
         AND status = 'active'`,
      [parsed.subjectSourceSystem, parsed.externalCourseIds],
    )
    : await db.query(
      `SELECT external_course_id, local_course_id, local_video_course_profile_id, local_live_class_id
       FROM external_course_mappings
       WHERE source_system = $1 AND status = 'active'
       ORDER BY id ASC`,
      [parsed.subjectSourceSystem],
    );

  const mappingByExtId = new Map(mappingsRes.rows.map((m) => [m.external_course_id, m]));
  const orderedCourseIds = parsed.externalCourseIds.length > 0
    ? parsed.externalCourseIds
    : mappingsRes.rows.map((m) => m.external_course_id);

  let extGrants = [];
  let mgmtGrants = [];
  if (identity) {
    extGrants = (await db.query(
      `SELECT ee.id, ee.source_system, ee.external_grant_id, ee.local_course_id, ee.local_video_course_profile_id,
              ee.status, ee.valid_from, ee.valid_until, ee.source_updated_at
       FROM external_entitlements ee
       JOIN external_identities ei ON ei.user_id = ee.user_id
         AND ei.source_system = ee.source_system AND ei.external_user_id = ee.external_user_id
         AND (ee.external_identity_id IS NULL OR ee.external_identity_id = ei.id)
       WHERE ee.user_id = $1 AND ei.status = 'active'
       ORDER BY (ee.status = 'active') DESC, ee.source_updated_at DESC, ee.id DESC`,
      [identity.user_id],
    )).rows;

    mgmtGrants = (await db.query(
      `SELECT g.id, g.course_id AS local_course_id, g.access_status AS status,
              g.valid_from, g.valid_until, g.source_updated_at
       FROM lms_access_grants g
       JOIN users u ON u.id = g.user_id
       WHERE g.user_id = $1
         AND (u.is_internal_test_account = TRUE OR u.is_management_managed = FALSE OR u.lms_account_status = 'active')
       ORDER BY (g.access_status = 'active') DESC, g.source_updated_at DESC, g.id DESC`,
      [identity.user_id],
    )).rows;
  }

  const nowMs = Date.now();
  const isGrantActiveNow = (row) => (
    row.status === "active"
    && new Date(row.valid_from).getTime() <= nowMs
    && (!row.valid_until || new Date(row.valid_until).getTime() > nowMs)
  );

  const items = await Promise.all(orderedCourseIds.map(async (extCourseId) => {
    const map = mappingByExtId.get(extCourseId) || null;
    if (!map || !identity || identity.status !== "active") {
      return {
        external_course_id: extCourseId,
        local_course_id: map ? Number(map.local_course_id) : null,
        external_grant_id: null,
        owned: false,
        status: null,
        valid_from: null,
        valid_until: null,
        source_updated_at: null,
      };
    }

    const matchingExt = extGrants.filter(
      (g) => Number(g.local_course_id) === Number(map.local_course_id)
        && (map.local_video_course_profile_id == null
          || g.local_video_course_profile_id == null
          || Number(g.local_video_course_profile_id) === Number(map.local_video_course_profile_id)),
    );
    const matchingMgmt = mgmtGrants.filter((g) => Number(g.local_course_id) === Number(map.local_course_id));

    const bestActive = matchingExt.find(isGrantActiveNow) || matchingMgmt.find(isGrantActiveNow) || null;
    const fallbackLatest = bestActive || matchingExt[0] || matchingMgmt[0] || null;

    if (!fallbackLatest) {
      return {
        external_course_id: extCourseId,
        local_course_id: Number(map.local_course_id),
        external_grant_id: null,
        owned: false,
        status: null,
        valid_from: null,
        valid_until: null,
        source_updated_at: null,
      };
    }

    const profileAccessible = !bestActive || map.local_video_course_profile_id == null
      ? true
      : await hasUnrevokedVideoCourseAccess({
        db, userId: identity.user_id, courseId: map.local_course_id,
        profileId: map.local_video_course_profile_id,
      });
    return {
      external_course_id: extCourseId,
      local_course_id: Number(map.local_course_id),
      external_grant_id: fallbackLatest.external_grant_id || `internal-management:grant:${fallbackLatest.id}`,
      owned: Boolean(bestActive) && profileAccessible,
      status: fallbackLatest.status,
      valid_from: new Date(fallbackLatest.valid_from).toISOString(),
      valid_until: fallbackLatest.valid_until ? new Date(fallbackLatest.valid_until).toISOString() : null,
      source_updated_at: new Date(fallbackLatest.source_updated_at).toISOString(),
    };
  }));

  return {
    success: true,
    correlation_id: parsed.correlationId,
    data: {
      identity: identity
        ? {
          source_system: identity.source_system,
          external_user_id: identity.external_user_id,
          local_user_id: Number(identity.user_id),
          status: identity.status,
        }
        : {
          source_system: parsed.subjectSourceSystem,
          external_user_id: parsed.externalUserId,
          local_user_id: null,
          status: "unlinked",
        },
      items,
      checked_at: new Date(nowMs).toISOString(),
    },
  };
};

/**
 * Manually and safely binds an existing local student account to an external identity
 * (for admin conflict resolution). Refuses privileged local accounts and preserves existing email.
 */
const linkExternalIdentityTx = async (
  tx,
  {
    sourceSystem = MOLY_SOURCE_SYSTEM,
    externalUserId,
    targetUserId,
    actorId = null,
    status = "active",
    sourceUpdatedAt = new Date(),
  } = {},
  { recordAudit = recordAuditEvent } = {},
) => {
  const normalizedSource = requireMolySourceSystem(sourceSystem);
  const normalizedExtUserId = requireMolyNamespacedId(externalUserId, "externalUserId");
  const parsedTargetUserId = parsePositiveBigIntId(targetUserId, "targetUserId");
  const parsedActorId = actorId == null ? null : parsePositiveBigIntId(actorId, "actorId");
  const parsedTimestamp = normalizeTimestamp(sourceUpdatedAt, "sourceUpdatedAt");
  if (!MOLY_IDENTITY_STATUSES.has(status)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid identity status.");
  }

  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
    "moly:identity",
    normalizedExtUserId,
  ]);

    const userRes = await tx.query(
      `SELECT id, username, email, role, management_staff_source_id, is_management_managed
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [parsedTargetUserId],
    );
    const targetUser = userRes.rows[0];
    if (!targetUser) {
      throw new ExternalIntegrationError(404, "USER_NOT_FOUND", `Local user ${parsedTargetUserId} not found.`);
    }
    if (isPrivilegedLocalAccount(targetUser)) {
      throw new ExternalIntegrationError(
        409,
        "PRIVILEGED_ROLE_COLLISION",
        `Cannot link privileged account (role '${targetUser.role}') to external learner identity.`,
      );
    }

    const otherBoundRes = await tx.query(
      `SELECT id, external_user_id
       FROM external_identities
       WHERE user_id = $1 AND source_system = $2 AND status IN ('active', 'suspended') AND external_user_id <> $3
       LIMIT 1`,
      [parsedTargetUserId, normalizedSource, normalizedExtUserId],
    );
    if (otherBoundRes.rows[0]) {
      throw new ExternalIntegrationError(
        409,
        "IDENTITY_ALREADY_LINKED",
        `Local user ${parsedTargetUserId} is already linked to ${otherBoundRes.rows[0].external_user_id}.`,
      );
    }

    const existingExtRes = await tx.query(
      `SELECT *
       FROM external_identities
       WHERE source_system = $1 AND external_user_id = $2
       FOR UPDATE`,
      [normalizedSource, normalizedExtUserId],
    );
    const existing = existingExtRes.rows[0] || null;
    if (existing && Number(existing.user_id) !== parsedTargetUserId) {
      throw new ExternalIntegrationError(
        409,
        "IDENTITY_ALREADY_LINKED",
        `External identity ${normalizedExtUserId} is already bound to local user ${existing.user_id}.`,
      );
    }
    if (existing && status !== existing.status
      && parsedTimestamp.getTime() <= new Date(existing.source_updated_at).getTime()) {
      throw new ExternalIntegrationError(
        409,
        "STALE_EVENT",
        "A strictly newer source_updated_at is required to change identity status.",
      );
    }

    const savedRes = await tx.query(
      `INSERT INTO external_identities (
         source_system, external_user_id, user_id, status, email_snapshot,
         link_method, source_updated_at, last_synced_at, linked_by
       )
       VALUES ($1, $2, $3, $4, $5, 'manual', $6, NOW(), $7)
       ON CONFLICT (source_system, external_user_id) DO UPDATE SET
         status = EXCLUDED.status,
         link_method = 'manual',
         source_updated_at = GREATEST(external_identities.source_updated_at, EXCLUDED.source_updated_at),
         last_synced_at = NOW(),
         linked_by = COALESCE(EXCLUDED.linked_by, external_identities.linked_by)
       RETURNING *`,
      [
        normalizedSource,
        normalizedExtUserId,
        parsedTargetUserId,
        status,
        targetUser.email,
        parsedTimestamp.toISOString(),
        parsedActorId,
      ],
    );
    const saved = savedRes.rows[0];

    await recordAudit({
      db: tx,
      actorId: parsedActorId,
      action: "integration.external_identity_linked_manually",
      entityType: "external_identity",
      entityId: Number(saved.id),
      beforeState: existing,
      afterState: saved,
      metadata: { sourceSystem: normalizedSource, targetUserId: parsedTargetUserId },
    });

  return {
    identity: saved,
    localUser: {
      id: Number(targetUser.id),
      username: targetUser.username,
      email: targetUser.email,
      role: targetUser.role,
      isManagementManaged: Boolean(targetUser.is_management_managed),
    },
  };
};

/**
 * Manually and safely binds an existing local student account to an external identity
 * (for admin conflict resolution). Refuses privileged local accounts and preserves existing email.
 */
export const linkExternalIdentityManually = async (
  db = defaultDb,
  params = {},
  { recordAudit = recordAuditEvent } = {},
) => runWithTransaction(db, (tx) => linkExternalIdentityTx(tx, params, { recordAudit }));

export const listIntegrationConflicts = async (db = defaultDb, filters = {}) => {
  const conditions = [];
  const params = [];
  if (filters.sourceSystem) {
    params.push(requireMolySourceSystem(filters.sourceSystem));
    conditions.push(`source_system = $${params.length}`);
  }
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const res = await db.query(
    `SELECT * FROM integration_conflicts ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  return res.rows;
};

export const resolveIntegrationConflict = async (
  db = defaultDb,
  { conflictId, action, targetUserId = null, resolutionNote = null, actorId = null, replayInbox = true } = {},
  { recordAudit = recordAuditEvent } = {},
) => {
  const id = parsePositiveBigIntId(conflictId, "conflictId");
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (!["link_existing", "dismiss", "ignore", "resolved"].includes(normalizedAction)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Unsupported conflict resolution action.");
  }

  return runWithTransaction(db, async (tx) => {
    const conflictRes = await tx.query("SELECT * FROM integration_conflicts WHERE id = $1 FOR UPDATE", [id]);
    const conflict = conflictRes.rows[0];
    if (!conflict) {
      throw new ExternalIntegrationError(404, "NOT_FOUND", `Integration conflict ${id} not found.`);
    }

    let linkedIdentity = null;
    if (normalizedAction === "link_existing") {
      if (!conflict.external_user_id) {
        throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Conflict has no external_user_id to link.");
      }
      const chosenUserId = targetUserId ?? conflict.candidate_user_id;
      const linked = await linkExternalIdentityTx(
        tx,
        {
          sourceSystem: conflict.source_system,
          externalUserId: conflict.external_user_id,
          targetUserId: chosenUserId,
          actorId,
          sourceUpdatedAt: conflict.source_updated_at || new Date(),
        },
        { recordAudit },
      );
      linkedIdentity = linked.identity;
    }

    const nextStatus = normalizedAction === "dismiss"
      ? "dismissed"
      : (normalizedAction === "ignore" ? "ignored" : "resolved");
    const updatedRes = await tx.query(
      `UPDATE integration_conflicts
       SET status = $1,
           existing_user_id = COALESCE($2, existing_user_id),
           resolution_note = COALESCE($3, resolution_note),
           resolved_by = $4,
           resolved_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        nextStatus,
        linkedIdentity ? linkedIdentity.user_id : null,
        normalizeOptionalText(resolutionNote, 2000, "resolutionNote"),
        actorId == null ? null : parsePositiveBigIntId(actorId, "actorId"),
        id,
      ],
    );
    const updatedConflict = updatedRes.rows[0];

    if (replayInbox && conflict.inbox_id && nextStatus === "resolved") {
      await tx.query(
        `UPDATE integration_inbox
         SET status = 'pending',
             attempt_count = 0,
             next_retry_at = NOW(),
             locked_until = NULL,
             locked_by = NULL,
             last_error_code = NULL,
             last_error_message = NULL
         WHERE id = $1 AND status IN ('failed', 'dead_letter')`,
        [conflict.inbox_id],
      );
    }

    await recordAudit({
      db: tx,
      actorId: actorId == null ? null : parsePositiveBigIntId(actorId, "actorId"),
      action: "integration.conflict_resolved",
      entityType: "integration_conflict",
      entityId: Number(updatedConflict.id),
      beforeState: conflict,
      afterState: updatedConflict,
      metadata: { action: normalizedAction },
    });

    return { conflict: updatedConflict, identity: linkedIdentity };
  });
};

export const retryMolyInboxJob = async (
  db = defaultDb,
  { inboxId, actorId = null, correlationId = null } = {},
  { recordAudit = recordAuditEvent } = {},
) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.inbox.retry_blocked_kill_switch");
    throw new MolyIntegrationError(
      503,
      "INTEGRATION_KILL_SWITCH_ACTIVE",
      "Moly integration sync is disabled by emergency kill switch.",
    );
  }
  const id = parsePositiveBigIntId(inboxId, "inboxId");
  const parsedActorId = actorId == null ? null : parsePositiveBigIntId(actorId, "actorId");
  const corr = resolveCorrelationId(correlationId);

  return runWithTransaction(db, async (tx) => {
    const existingRes = await tx.query(
      "SELECT * FROM integration_inbox WHERE id = $1 FOR UPDATE",
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new ExternalIntegrationError(404, "NOT_FOUND", `Integration inbox item ${id} not found.`);
    }
    if (existing.status === "processed") {
      return { retried: false, alreadyProcessed: true, inbox: existing };
    }
    if (!["failed", "dead_letter", "pending"].includes(existing.status)) {
      throw new ExternalIntegrationError(
        409,
        "INBOX_RETRY_NOT_ALLOWED",
        `Cannot retry inbox item while status is '${existing.status}'.`,
      );
    }

    const updatedRes = await tx.query(
      `UPDATE integration_inbox
       SET status = 'pending',
           max_attempts = GREATEST(max_attempts, attempt_count + 3),
           next_retry_at = NOW(),
           locked_until = NULL,
           locked_by = NULL,
           last_error_code = NULL,
           last_error_message = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, source_system, event_id, idempotency_key, correlation_id, event_type,
                 COALESCE(payload->>'external_grant_id', payload->>'external_user_id') AS aggregate_id,
                 status, attempt_count, max_attempts, next_retry_at,
                 processed_at, created_at, updated_at`,
      [id],
    );
    const updated = updatedRes.rows[0];

    await recordAudit({
      db: tx,
      actorId: parsedActorId,
      action: "integration.inbox_manual_retry",
      entityType: "integration_inbox",
      entityId: Number(id),
      beforeState: {
        status: existing.status,
        attempt_count: existing.attempt_count,
        last_error_code: existing.last_error_code,
      },
      afterState: {
        status: updated.status,
        attempt_count: updated.attempt_count,
        max_attempts: updated.max_attempts,
      },
      metadata: {
        correlation_id: corr,
        event_id: existing.event_id,
      },
    });

    recordIntegrationMetric("moly.inbox.manual_retry");
    integrationLog.info(
      "inbox_manual_retry",
      {
        inboxId: Number(id),
        eventId: existing.event_id,
        previousStatus: existing.status,
        actorId: parsedActorId,
      },
      corr,
    );

    return { retried: true, inbox: updated };
  });
};

export const listMolyInboxOps = async (db = defaultDb, filters = {}) => {
  const status = typeof filters.status === "string" ? filters.status.trim().toLowerCase() : null;
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const params = [];
  const conditions = ["source_system = 'moly'"];
  if (status === "attention") {
    conditions.push("status IN ('pending', 'processing', 'failed', 'dead_letter')");
  } else if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [rowsRes, countsRes, conflictCountsRes] = await Promise.all([
    db.query(
      `SELECT id, source_system, event_id, idempotency_key, correlation_id, event_type,
              COALESCE(payload->>'external_grant_id', payload->>'external_user_id') AS aggregate_id,
              status, attempt_count, max_attempts, next_retry_at,
              locked_until, last_error_code, last_error_message, processed_at,
              created_at, updated_at
       FROM integration_inbox
       ${where}
       ORDER BY id DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    ),
    db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM integration_inbox
       WHERE source_system = 'moly'
       GROUP BY status`,
    ),
    db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM integration_conflicts
       WHERE source_system = 'moly'
       GROUP BY status`,
    ),
  ]);

  return {
    killSwitchActive: isMolyIntegrationKillSwitchActive(),
    metrics: getIntegrationMetricsSnapshot(),
    inboxCounts: Object.fromEntries(countsRes.rows.map((r) => [r.status, r.count])),
    conflictCounts: Object.fromEntries(conflictCountsRes.rows.map((r) => [r.status, r.count])),
    items: rowsRes.rows,
  };
};

export const buildReconciliationSnapshotForMoly = async (db = defaultDb, rawBody = {}) => {
  if (isMolyIntegrationKillSwitchActive()) {
    recordIntegrationMetric("moly.reconciliation.blocked_kill_switch");
    throw new MolyIntegrationError(
      503,
      "INTEGRATION_KILL_SWITCH_ACTIVE",
      "Moly integration sync is disabled by emergency kill switch.",
    );
  }
  const startMs = Date.now();
  const body = normalizeJsonObject(rawBody, "body");
  const corr = resolveCorrelationId(body.correlation_id);
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 2000);
  const filterExternalUserId = body.external_user_id
    ? requireMolyNamespacedId(body.external_user_id, "external_user_id")
    : null;
  const filterExternalCourseId = body.external_course_id
    ? normalizeExternalId(body.external_course_id, 191, "external_course_id")
    : null;

  const mappingsRes = await db.query(
    `SELECT id, source_system, external_course_id, local_course_id, local_video_course_profile_id,
            status, metadata, updated_at
     FROM external_course_mappings
     WHERE source_system IN ('moly', 'csca-course')
     ORDER BY id ASC`,
  );

  const identitiesRes = await db.query(
    `SELECT id, source_system, external_user_id, user_id, status, source_updated_at
     FROM external_identities
     WHERE source_system = 'moly'
       AND ($1::text IS NULL OR external_user_id = $1)
     ORDER BY id ASC
     LIMIT $2`,
    [filterExternalUserId, limit],
  );

  const conflictsRes = await db.query(
    `SELECT id, source_system, conflict_type, status, external_user_id, external_course_id,
            external_grant_id, candidate_user_id, existing_user_id, local_course_id,
            correlation_id, reason, created_at
     FROM integration_conflicts
     WHERE source_system = 'moly'
       AND status = 'open'
       AND ($1::text IS NULL OR external_user_id = $1)
     ORDER BY id DESC
     LIMIT $2`,
    [filterExternalUserId, limit],
  );

  const extEntRes = await db.query(
    `SELECT ee.id, ee.source_system, ee.external_user_id, ee.user_id AS local_user_id,
            ee.local_course_id, ee.local_video_course_profile_id, ee.external_grant_id,
            ee.status, ee.valid_from, ee.valid_until, ee.revoked_at, ee.source_updated_at,
            ei.status AS identity_status
     FROM external_entitlements ee
     LEFT JOIN external_identities ei
       ON ei.id = ee.external_identity_id
       OR (ei.source_system = ee.source_system AND ei.external_user_id = ee.external_user_id)
     WHERE ee.source_system = 'moly'
       AND ($1::text IS NULL OR ee.external_user_id = $1)
     ORDER BY ee.id DESC
     LIMIT $2`,
    [filterExternalUserId, limit],
  );

  const mgmtRes = await db.query(
    `SELECT ei.external_user_id, ei.status AS identity_status,
            g.id AS grant_id, g.user_id AS local_user_id, g.course_id AS local_course_id,
            g.access_status AS status, g.valid_from, g.valid_until, g.source_updated_at
     FROM external_identities ei
     JOIN lms_access_grants g ON g.user_id = ei.user_id
     WHERE ei.source_system = 'moly'
       AND ei.status = 'active'
       AND ($1::text IS NULL OR ei.external_user_id = $1)
     ORDER BY g.id DESC
     LIMIT $2`,
    [filterExternalUserId, limit],
  );

  const inboxSummaryRes = await db.query(
    `SELECT status,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (
              WHERE status IN ('pending', 'processing')
                AND created_at <= NOW() - INTERVAL '10 minutes'
            )::int AS stale_count
     FROM integration_inbox
     WHERE source_system = 'moly'
     GROUP BY status`,
  );

  const nowMs = Date.now();
  const isEntActiveNow = (row) => (
    row.status === "active"
    && row.identity_status !== "revoked"
    && (!row.valid_from || new Date(row.valid_from).getTime() <= nowMs)
    && (!row.valid_until || new Date(row.valid_until).getTime() > nowMs)
  );

  const entitlements = [];
  for (const row of extEntRes.rows) {
    let profileRevoked = false;
    if (isEntActiveNow(row) && row.local_video_course_profile_id != null && row.local_user_id != null) {
      const unrevoked = await hasUnrevokedVideoCourseAccess({
        db,
        userId: row.local_user_id,
        courseId: row.local_course_id,
        profileId: row.local_video_course_profile_id,
      });
      profileRevoked = !unrevoked;
    }
    const effectiveActive = isEntActiveNow(row) && !profileRevoked;
    const mapping = mappingsRes.rows.find((m) =>
      Number(m.local_course_id) === Number(row.local_course_id)
      && m.status === "active"
      && (m.local_video_course_profile_id == null
        || row.local_video_course_profile_id == null
        || Number(m.local_video_course_profile_id) === Number(row.local_video_course_profile_id)),
    ) || null;
    const resolvedExtCourseId = mapping
      ? (mapping.source_system === "moly"
        ? mapping.external_course_id
        : mapping.metadata?.moly_external_course_id || mapping.external_course_id)
      : null;

    if (filterExternalCourseId && resolvedExtCourseId !== filterExternalCourseId) {
      continue;
    }

    entitlements.push({
      source: "external_entitlements",
      id: Number(row.id),
      external_user_id: row.external_user_id,
      local_user_id: row.local_user_id == null ? null : Number(row.local_user_id),
      local_course_id: Number(row.local_course_id),
      local_video_course_profile_id: row.local_video_course_profile_id == null
        ? null
        : Number(row.local_video_course_profile_id),
      external_course_id: resolvedExtCourseId,
      external_grant_id: row.external_grant_id,
      status: profileRevoked ? "revoked" : row.status,
      effective_active: effectiveActive,
      identity_status: row.identity_status || "unknown",
      valid_from: row.valid_from ? new Date(row.valid_from).toISOString() : null,
      valid_until: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      source_updated_at: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
    });
  }

  for (const row of mgmtRes.rows) {
    const active = row.status === "active"
      && (!row.valid_from || new Date(row.valid_from).getTime() <= nowMs)
      && (!row.valid_until || new Date(row.valid_until).getTime() > nowMs);
    const mapping = mappingsRes.rows.find(
      (m) => Number(m.local_course_id) === Number(row.local_course_id) && m.status === "active",
    ) || null;
    const resolvedExtCourseId = mapping
      ? (mapping.source_system === "moly"
        ? mapping.external_course_id
        : mapping.metadata?.moly_external_course_id || mapping.external_course_id)
      : null;

    if (filterExternalCourseId && resolvedExtCourseId !== filterExternalCourseId) {
      continue;
    }

    entitlements.push({
      source: "lms_access_grants",
      id: Number(row.grant_id),
      external_user_id: row.external_user_id,
      local_user_id: Number(row.local_user_id),
      local_course_id: Number(row.local_course_id),
      local_video_course_profile_id: null,
      external_course_id: resolvedExtCourseId,
      external_grant_id: `internal-management:grant:${row.grant_id}`,
      status: row.status,
      effective_active: active,
      identity_status: row.identity_status || "active",
      valid_from: row.valid_from ? new Date(row.valid_from).toISOString() : null,
      valid_until: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      revoked_at: null,
      source_updated_at: row.source_updated_at ? new Date(row.source_updated_at).toISOString() : null,
    });
  }

  const inboxSummary = {};
  for (const row of inboxSummaryRes.rows) {
    inboxSummary[row.status] = { count: row.count, stale_count: row.stale_count };
  }

  observeIntegrationLatency("moly.reconciliation.snapshot_ms", Date.now() - startMs);
  recordIntegrationMetric("moly.reconciliation.snapshot_calls");
  integrationLog.info(
    "reconciliation_snapshot_generated",
    {
      identities: identitiesRes.rows.length,
      entitlements: entitlements.length,
      openConflicts: conflictsRes.rows.length,
      durationMs: Date.now() - startMs,
    },
    corr,
  );

  return {
    success: true,
    correlation_id: corr,
    data: {
      checked_at: new Date(nowMs).toISOString(),
      course_mappings: mappingsRes.rows,
      identities: identitiesRes.rows,
      open_conflicts: conflictsRes.rows,
      entitlements,
      inbox_summary: inboxSummary,
    },
  };
};
