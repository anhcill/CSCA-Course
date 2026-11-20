import crypto from "node:crypto";
import net from "node:net";
import { getClient, query } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";
import {
  allocateNextSyncRevision,
  buildV2EventEnvelope,
  insertOutboxEnvelopeIfReady,
} from "./courseCatalogSync.service.js";
import {
  DEVICE_LIMIT_LOCK_THRESHOLD,
  TRUSTED_DEVICE_LIMIT,
  describeDevice,
  listTrustedDevicesForUser,
} from "./trustedDevice.service.js";

const DEFAULT_PROOF_MAX_SKEW_MS = 5 * 60 * 1000;
const HEX_64_RE = /^[0-9a-f]{64}$/;

export class DelegatedDeviceError extends Error {
  constructor(errorCode, message, { status = 403, details = undefined } = {}) {
    super(message);
    this.name = "DelegatedDeviceError";
    this.errorCode = errorCode;
    this.status = status;
    this.details = details;
  }
}

const resolveDeviceProofSecret = (env = process.env) => (
  String(env?.MOLY_DEVICE_PROOF_SECRET || env?.MOLY_INTEGRATION_HMAC_SECRET || "").trim()
);

const normalizeIpAddress = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().replace(/^::ffff:/, "");
  return net.isIP(normalized) ? normalized : null;
};

const sha256Hex = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export const buildDeviceSlotProofCanonical = ({
  externalUserId,
  molyDeviceTokenHash,
  issuedAt,
  nonce,
}) => `v1:${String(externalUserId)}:${String(molyDeviceTokenHash)}:${String(issuedAt)}:${String(nonce)}`;

export const buildSignedDeviceSlotProof = ({
  externalUserId,
  molyDeviceTokenHash,
  deviceName = null,
  userAgent = "",
  ipAddress = null,
  issuedAt = new Date().toISOString(),
  nonce = crypto.randomBytes(16).toString("hex"),
  secret,
}) => {
  const cleanSecret = String(secret || "").trim();
  if (!cleanSecret) {
    throw new DelegatedDeviceError("DEVICE_PROOF_NOT_CONFIGURED", "Thiếu khóa ký chứng thực thiết bị.", {
      status: 500,
    });
  }
  const normalizedHash = String(molyDeviceTokenHash || "").trim().toLowerCase();
  if (!HEX_64_RE.test(normalizedHash)) {
    throw new DelegatedDeviceError("UNTRUSTED_DEVICE_PROOF", "Chứng thực thiết bị không hợp lệ.", { status: 403 });
  }
  const extUser = String(externalUserId || "").trim();
  const payload = {
    v: 1,
    source: "moly",
    externalUserId: extUser,
    molyDeviceTokenHash: normalizedHash,
    deviceName: deviceName ? String(deviceName).slice(0, 160) : describeDevice(userAgent || ""),
    userAgent: userAgent ? String(userAgent).slice(0, 1000) : "",
    ipAddress: normalizeIpAddress(ipAddress),
    issuedAt: String(issuedAt),
    nonce: String(nonce),
  };
  const signature = crypto
    .createHmac("sha256", cleanSecret)
    .update(buildDeviceSlotProofCanonical(payload))
    .digest("hex");
  return {
    ...payload,
    signature,
  };
};

export const encodeDeviceSlotProofHeader = (proofObj) => (
  Buffer.from(JSON.stringify(proofObj), "utf8").toString("base64url")
);

const decodeProofInput = (proofInput) => {
  if (!proofInput) return null;
  if (typeof proofInput === "object" && !Array.isArray(proofInput)) {
    return proofInput;
  }
  if (typeof proofInput !== "string") return null;
  const trimmed = proofInput.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  try {
    const decoded = Buffer.from(trimmed, "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

export const verifyDeviceSlotProof = (
  proofInput,
  {
    expectedExternalUserId = null,
    now = () => Date.now(),
    env = process.env,
    maxSkewMs = DEFAULT_PROOF_MAX_SKEW_MS,
  } = {},
) => {
  const parsed = decodeProofInput(proofInput);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DelegatedDeviceError("UNTRUSTED_DEVICE_PROOF", "Chứng thực thiết bị không đúng định dạng.", {
      status: 403,
    });
  }

  const v = Number(parsed.v);
  const source = String(parsed.source || "").trim();
  const externalUserId = String(parsed.externalUserId || parsed.external_user_id || "").trim();
  const molyDeviceTokenHash = String(
    parsed.molyDeviceTokenHash || parsed.moly_device_token_hash || "",
  ).trim().toLowerCase();
  const issuedAt = String(parsed.issuedAt || parsed.issued_at || "").trim();
  const nonce = String(parsed.nonce || "").trim();
  const signature = String(parsed.signature || "").trim().toLowerCase();

  if (
    v !== 1
    || source !== "moly"
    || !externalUserId
    || !HEX_64_RE.test(molyDeviceTokenHash)
    || !HEX_64_RE.test(signature)
    || !issuedAt
    || nonce.length < 8
    || nonce.length > 128
  ) {
    throw new DelegatedDeviceError("UNTRUSTED_DEVICE_PROOF", "Chứng thực thiết bị thiếu thông tin bắt buộc.", {
      status: 403,
    });
  }

  if (expectedExternalUserId && String(expectedExternalUserId).trim() !== externalUserId) {
    throw new DelegatedDeviceError(
      "UNTRUSTED_DEVICE_PROOF",
      "Chứng thực thiết bị không khớp người dùng được ủy quyền.",
      { status: 403 },
    );
  }

  const issuedMs = Date.parse(issuedAt);
  const nowMs = Number(now());
  if (!Number.isFinite(issuedMs) || Math.abs(nowMs - issuedMs) > maxSkewMs) {
    throw new DelegatedDeviceError(
      "UNTRUSTED_DEVICE_PROOF",
      "Chứng thực thiết bị đã hết hạn hoặc sai lệch thời gian.",
      { status: 403 },
    );
  }

  const secret = resolveDeviceProofSecret(env);
  if (!secret) {
    throw new DelegatedDeviceError(
      "UNTRUSTED_DEVICE_PROOF",
      "Máy chủ chưa cấu hình khóa xác thực thiết bị.",
      { status: 403 },
    );
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(buildDeviceSlotProofCanonical({ externalUserId, molyDeviceTokenHash, issuedAt, nonce }))
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new DelegatedDeviceError("UNTRUSTED_DEVICE_PROOF", "Chữ ký thiết bị không hợp lệ.", {
      status: 403,
    });
  }

  const userAgent = typeof parsed.userAgent === "string"
    ? parsed.userAgent.slice(0, 1000)
    : typeof parsed.user_agent === "string"
      ? parsed.user_agent.slice(0, 1000)
      : "";
  const deviceName = typeof parsed.deviceName === "string" && parsed.deviceName.trim()
    ? parsed.deviceName.trim().slice(0, 160)
    : typeof parsed.device_name === "string" && parsed.device_name.trim()
      ? parsed.device_name.trim().slice(0, 160)
      : describeDevice(userAgent);
  const ipAddress = normalizeIpAddress(parsed.ipAddress || parsed.ip_address || null);

  return {
    externalUserId,
    molyDeviceTokenHash,
    deviceName,
    userAgent,
    ipAddress,
    issuedAt,
    nonce,
  };
};

const isConnectedPgClient = (db) => Boolean(
  db
  && typeof db.query === "function"
  && (typeof db.release === "function" || db._connected === true || db._connecting === true),
);

const runInTransaction = async (db, work, { tx = null } = {}) => {
  if (tx && typeof tx.query === "function") {
    return work(tx);
  }
  const runner = db && typeof db.query === "function" ? db : { query, getClient };
  if (isConnectedPgClient(runner)) {
    return work(runner);
  }
  const client = typeof runner.getClient === "function"
    ? await runner.getClient()
    : typeof runner.connect === "function"
      ? await runner.connect()
      : null;

  if (!client) {
    await runner.query("BEGIN");
    try {
      const out = await work(runner);
      await runner.query("COMMIT");
      return out;
    } catch (err) {
      await runner.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  try {
    await client.query("BEGIN");
    const out = await work(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (typeof client.release === "function") client.release();
  }
};

export const emitDeviceBindingsRevokedOutbox = async ({
  db,
  userId,
  trustedDeviceId = null,
  revokedBindings = [],
  reason = "trusted_device_revoked",
  correlationId = null,
  occurredAt = new Date().toISOString(),
}) => {
  if (!Array.isArray(revokedBindings) || revokedBindings.length === 0) return null;
  const regRes = await db.query(
    `SELECT to_regclass('course_integration_outbox') IS NOT NULL AS has_outbox`,
  );
  if (!regRes.rows[0]?.has_outbox) return null;

  const rev = await allocateNextSyncRevision(db);
  const molyHashes = [...new Set(
    revokedBindings
      .map((row) => String(row.moly_device_token_hash || row.molyDeviceTokenHash || "").trim().toLowerCase())
      .filter((h) => HEX_64_RE.test(h)),
  )];
  const externalUserIds = [...new Set(
    revokedBindings
      .map((row) => String(row.external_user_id || row.externalUserId || "").trim())
      .filter(Boolean),
  )];

  const envelope = buildV2EventEnvelope({
    eventType: "device.binding.revoked",
    aggregateType: "device_binding",
    aggregateId: `${userId}:${trustedDeviceId || molyHashes[0] || "batch"}`,
    revision: rev,
    sourceUpdatedAt: occurredAt,
    occurredAt,
    deleted: true,
    deletedAt: occurredAt,
    correlationId,
    payload: {
      userId: String(userId),
      externalUserIds,
      trustedDeviceId: trustedDeviceId != null ? String(trustedDeviceId) : null,
      molyDeviceTokenHashes: molyHashes,
      reason,
      revokedAt: occurredAt,
    },
  });
  await insertOutboxEnvelopeIfReady(db, envelope);
  return envelope;
};

export const handleTrustedDeviceRevoked = async ({
  db = { query },
  userId,
  deviceId,
  revokedBy = null,
  reason = "trusted_device_revoked",
  correlationId = null,
}) => {
  const regRes = await db.query(
    `SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings,
            to_regclass('delegated_learning_sessions') IS NOT NULL AS has_sessions`,
  );
  const caps = regRes.rows[0] || {};
  let revokedBindings = [];

  if (caps.has_bindings) {
    const bindRes = await db.query(
      `UPDATE moly_device_bindings
       SET status = 'revoked',
           revoked_at = COALESCE(revoked_at, NOW()),
           revoked_reason = COALESCE(revoked_reason, $2),
           updated_at = NOW()
       WHERE trusted_device_id = $1
         AND user_id = $3
         AND (status <> 'revoked' OR revoked_at IS NULL)
       RETURNING id, external_user_id, moly_device_token_hash`,
      [deviceId, reason, userId],
    );
    revokedBindings = bindRes.rows || [];
  }

  if (caps.has_sessions) {
    const bindingIds = revokedBindings.map((r) => Number(r.id)).filter(Number.isFinite);
    if (bindingIds.length > 0) {
      await db.query(
        `UPDATE delegated_learning_sessions
         SET revoked_at = COALESCE(revoked_at, NOW()),
             revoked_reason = COALESCE(revoked_reason, $2),
             updated_at = NOW()
         WHERE user_id = $1
           AND revoked_at IS NULL
           AND (trusted_device_id = $3 OR device_binding_id = ANY($4::bigint[]))`,
        [userId, reason, deviceId, bindingIds],
      );
    } else {
      await db.query(
        `UPDATE delegated_learning_sessions
         SET revoked_at = COALESCE(revoked_at, NOW()),
             revoked_reason = COALESCE(revoked_reason, $2),
             updated_at = NOW()
         WHERE user_id = $1
           AND revoked_at IS NULL
           AND trusted_device_id = $3`,
        [userId, reason, deviceId],
      );
    }
  }

  await emitDeviceBindingsRevokedOutbox({
    db,
    userId,
    trustedDeviceId: deviceId,
    revokedBindings,
    reason,
    correlationId: correlationId || `revoke-device-${deviceId}`,
  });

  if (revokedBy && revokedBindings.length > 0) {
    await recordAuditEvent({
      db,
      actorId: revokedBy,
      action: "user.moly_device_binding.revoked",
      entityType: "trusted_login_device",
      entityId: deviceId,
      metadata: {
        userId: String(userId),
        revokedBindingIds: revokedBindings.map((r) => String(r.id)),
      },
    });
  }

  return { revokedBindings };
};

export const bindMolyDeviceToTrustedSlot = async ({
  db = { query, getClient },
  tx: outerTx = null,
  userId,
  externalUserId,
  molyDeviceTokenHash,
  courseTrustedDeviceId = null,
  bindingSource = "delegated_proof",
  deviceName = null,
  userAgent = "",
  ipAddress = null,
  deviceLimit = TRUSTED_DEVICE_LIMIT,
  enforce = true,
  correlationId = null,
  metadata = {},
} = {}) => {
  const normalizedHash = String(molyDeviceTokenHash || "").trim().toLowerCase();
  if (!userId || !HEX_64_RE.test(normalizedHash)) {
    throw new DelegatedDeviceError("UNTRUSTED_DEVICE_PROOF", "Thiếu định danh thiết bị hợp lệ.", { status: 403 });
  }
  const extUser = String(externalUserId || "").trim();
  if (!extUser) {
    throw new DelegatedDeviceError("UNTRUSTED_DEVICE_PROOF", "Thiếu định danh người dùng Moly.", { status: 403 });
  }

  const parsedLimit = Number(deviceLimit);
  const effectiveLimit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : TRUSTED_DEVICE_LIMIT;
  const cleanUa = typeof userAgent === "string" ? userAgent.slice(0, 1000) : "";
  const resolvedName = (typeof deviceName === "string" && deviceName.trim())
    ? deviceName.trim().slice(0, 160)
    : describeDevice(cleanUa);
  const cleanIp = normalizeIpAddress(ipAddress);

  const txResult = await runInTransaction(db, async (tx) => {
    const userRes = await tx.query(
      `SELECT id, role, is_locked, device_limit_attempts, locked_reason
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const user = userRes.rows[0];
    if (!user) {
      throw new DelegatedDeviceError("UNAUTHENTICATED", "Tài khoản không còn tồn tại.", { status: 401 });
    }
    if (user.is_locked) {
      const isLimitLock = user.locked_reason === "DEVICE_LIMIT_LOCKED"
        || Number(user.device_limit_attempts || 0) >= DEVICE_LIMIT_LOCK_THRESHOLD;
      throw new DelegatedDeviceError(
        isLimitLock ? "DEVICE_LIMIT_LOCKED" : "ACCOUNT_LOCKED",
        isLimitLock
          ? "Tài khoản đã bị khóa tạm thời do vượt quá số lần thử thiết bị mới cho phép. Vui lòng liên hệ quản trị viên."
          : "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        {
          status: 403,
          details: {
            locked: true,
            attempts: Number(user.device_limit_attempts || DEVICE_LIMIT_LOCK_THRESHOLD),
            deviceLimit: effectiveLimit,
          },
        },
      );
    }

    const isRestrictedLearner = user.role === "user";

    // Path A: Explicit live browser SSO link to an existing active trusted_login_devices row.
    if (courseTrustedDeviceId) {
      const courseDevRes = await tx.query(
        `SELECT id, device_source, record_access_granted_at
         FROM trusted_login_devices
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
         FOR UPDATE`,
        [courseTrustedDeviceId, userId],
      );
      const courseDev = courseDevRes.rows[0];
      if (courseDev) {
        const nextSource = courseDev.device_source === "csca_course" ? "sso_bound" : courseDev.device_source;
        await tx.query(
          `UPDATE trusted_login_devices
           SET device_source = $2,
               record_access_granted_at = COALESCE(record_access_granted_at, NOW()),
               last_seen_at = NOW(),
               last_ip = COALESCE($3, last_ip)
           WHERE id = $1`,
          [courseDev.id, nextSource, cleanIp],
        );

        const existingBindRes = await tx.query(
          `SELECT id, trusted_device_id
           FROM moly_device_bindings
           WHERE user_id = $1
             AND moly_device_token_hash = $2
             AND status = 'active'
             AND revoked_at IS NULL
           LIMIT 1`,
          [userId, normalizedHash],
        );
        let bindingId = existingBindRes.rows[0]?.id || null;
        if (bindingId) {
          await tx.query(
            `UPDATE moly_device_bindings
             SET trusted_device_id = $2,
                 binding_source = $3,
                 last_seen_at = NOW(),
                 updated_at = NOW(),
                 metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
             WHERE id = $1`,
            [bindingId, courseDev.id, bindingSource === "sso_browser_tx" ? "sso_browser_tx" : "delegated_proof", JSON.stringify(metadata || {})],
          );
        } else {
          const insBind = await tx.query(
            `INSERT INTO moly_device_bindings
               (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source, status, metadata)
             VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb)
             RETURNING id`,
            [
              userId,
              extUser,
              normalizedHash,
              courseDev.id,
              bindingSource === "sso_browser_tx" ? "sso_browser_tx" : "delegated_proof",
              JSON.stringify(metadata || {}),
            ],
          );
          bindingId = insBind.rows[0].id;
        }

        if (isRestrictedLearner && Number(user.device_limit_attempts || 0) > 0) {
          await tx.query(
            `UPDATE users SET device_limit_attempts = 0, device_limit_last_attempt_at = NULL, updated_at = NOW() WHERE id = $1`,
            [userId],
          );
        }

        return {
          enforced: Boolean(enforce && isRestrictedLearner),
          authorized: true,
          trustedDeviceId: Number(courseDev.id),
          bindingId: Number(bindingId),
          slotReused: true,
          deviceLimit: isRestrictedLearner ? effectiveLimit : null,
        };
      }
    }

    // Check existing active binding for this Moly browser cookie hash.
    const activeBindRes = await tx.query(
      `SELECT b.id AS binding_id, b.trusted_device_id, d.revoked_at AS device_revoked_at
       FROM moly_device_bindings b
       JOIN trusted_login_devices d ON d.id = b.trusted_device_id
       WHERE b.user_id = $1
         AND b.moly_device_token_hash = $2
         AND b.status = 'active'
         AND b.revoked_at IS NULL
       LIMIT 1
       FOR UPDATE OF b`,
      [userId, normalizedHash],
    );
    const activeBind = activeBindRes.rows[0];
    if (activeBind && !activeBind.device_revoked_at) {
      await tx.query(
        `UPDATE trusted_login_devices
         SET record_access_granted_at = COALESCE(record_access_granted_at, NOW()),
             last_seen_at = NOW(),
             last_ip = COALESCE($2, last_ip)
         WHERE id = $1`,
        [activeBind.trusted_device_id, cleanIp],
      );
      await tx.query(
        `UPDATE moly_device_bindings
         SET last_seen_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [activeBind.binding_id],
      );
      if (isRestrictedLearner && Number(user.device_limit_attempts || 0) > 0) {
        await tx.query(
          `UPDATE users SET device_limit_attempts = 0, device_limit_last_attempt_at = NULL, updated_at = NOW() WHERE id = $1`,
          [userId],
        );
      }
      return {
        enforced: Boolean(enforce && isRestrictedLearner),
        authorized: true,
        trustedDeviceId: Number(activeBind.trusted_device_id),
        bindingId: Number(activeBind.binding_id),
        slotReused: true,
        deviceLimit: isRestrictedLearner ? effectiveLimit : null,
      };
    }

    if (activeBind && activeBind.device_revoked_at) {
      await tx.query(
        `UPDATE moly_device_bindings
         SET status = 'revoked',
             revoked_at = COALESCE(revoked_at, NOW()),
             revoked_reason = 'trusted_device_revoked',
             updated_at = NOW()
         WHERE id = $1`,
        [activeBind.binding_id],
      );
    }

    // Previously revoked browser cookie hash must re-authenticate on Moly before reclaiming a slot.
    const revokedRes = await tx.query(
      `SELECT id FROM moly_device_bindings
       WHERE user_id = $1 AND moly_device_token_hash = $2 AND status = 'revoked'
       ORDER BY id DESC LIMIT 1`,
      [userId, normalizedHash],
    );
    if (revokedRes.rows.length > 0 && bindingSource !== "admin_rebind") {
      throw new DelegatedDeviceError(
        "DEVICE_BINDING_REVOKED",
        "Thiết bị này đã bị thu hồi quyền truy cập. Vui lòng đăng nhập lại.",
        { status: 403 },
      );
    }

    // Need a new slot in trusted_login_devices. Count all active trusted devices across both apps.
    const shouldEnforce = Boolean(enforce && isRestrictedLearner);
    const usedRes = await tx.query(
      `SELECT COUNT(*)::int AS count
       FROM trusted_login_devices
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    const usedSlots = Number(usedRes.rows[0]?.count || 0);

    if (shouldEnforce && usedSlots >= effectiveLimit) {
      const nextAttempts = Math.min(
        DEVICE_LIMIT_LOCK_THRESHOLD,
        Number(user.device_limit_attempts || 0) + 1,
      );
      const shouldLock = nextAttempts >= DEVICE_LIMIT_LOCK_THRESHOLD;

      if (shouldLock) {
        await tx.query(
          `UPDATE users
           SET device_limit_attempts = $2,
               device_limit_last_attempt_at = NOW(),
               is_locked = TRUE,
               locked_reason = 'DEVICE_LIMIT_LOCKED',
               locked_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [userId, nextAttempts],
        );
        await tx.query(
          `UPDATE user_sessions
           SET revoked_at = COALESCE(revoked_at, NOW())
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
        const allRevokedBindings = (
          await tx.query(
            `UPDATE moly_device_bindings
             SET status = 'revoked',
                 revoked_at = COALESCE(revoked_at, NOW()),
                 revoked_reason = 'device_limit_locked',
                 updated_at = NOW()
             WHERE user_id = $1 AND status = 'active'
             RETURNING id, external_user_id, moly_device_token_hash`,
            [userId],
          )
        ).rows;
        await tx.query(
          `UPDATE delegated_learning_sessions
           SET revoked_at = COALESCE(revoked_at, NOW()),
               revoked_reason = 'device_limit_locked',
               updated_at = NOW()
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
        await emitDeviceBindingsRevokedOutbox({
          db: tx,
          userId,
          revokedBindings: allRevokedBindings,
          reason: "device_limit_locked",
          correlationId,
        });
      } else {
        await tx.query(
          `UPDATE users
           SET device_limit_attempts = $2,
               device_limit_last_attempt_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [userId, nextAttempts],
        );
      }

      const existingDevices = await listTrustedDevicesForUser(userId, null, tx);
      await recordAuditEvent({
        db: tx,
        actorId: userId,
        action: shouldLock ? "user.moly_device.limit_locked" : "user.moly_device.rejected",
        entityType: "trusted_login_device",
        metadata: {
          usedSlots,
          deviceLimit: effectiveLimit,
          attemptCount: nextAttempts,
          locked: shouldLock,
          deviceName: resolvedName,
        },
      });

      if (shouldLock) {
        return {
          __rejectedError: new DelegatedDeviceError(
            "DEVICE_LIMIT_LOCKED",
            "Tài khoản đã bị khóa do thử truy cập vượt quá giới hạn thiết bị quá 3 lần. Vui lòng liên hệ quản trị viên.",
            {
              status: 403,
              details: {
                locked: true,
                attempts: nextAttempts,
                usedSlots,
                deviceLimit: effectiveLimit,
                devices: existingDevices,
              },
            },
          ),
        };
      }

      return {
        __rejectedError: new DelegatedDeviceError(
          "DEVICE_SLOT_LIMIT_REACHED",
          `Tài khoản đã sử dụng đủ ${effectiveLimit}/${effectiveLimit} thiết bị cho phép (bao gồm cả web CSCA-Course và Moly). Vui lòng liên hệ admin để gỡ thiết bị cũ.`,
          {
            status: 403,
            details: {
              attempts: nextAttempts,
              remainingAttempts: Math.max(0, DEVICE_LIMIT_LOCK_THRESHOLD - nextAttempts),
              usedSlots,
              deviceLimit: effectiveLimit,
              devices: existingDevices,
            },
          },
        ),
      };
    }

    const syntheticDeviceHash = sha256Hex(`moly_delegated:${userId}:${normalizedHash}`);
    const insDevice = await tx.query(
      `INSERT INTO trusted_login_devices
         (user_id, device_token_hash, device_name, user_agent, first_ip, last_ip, device_source, record_access_granted_at)
       VALUES ($1, $2, $3, $4, $5, $5, 'moly_delegated', NOW())
       RETURNING id`,
      [userId, syntheticDeviceHash, resolvedName, cleanUa || null, cleanIp],
    );
    const trustedDeviceId = Number(insDevice.rows[0].id);

    const insBind = await tx.query(
      `INSERT INTO moly_device_bindings
         (user_id, external_user_id, moly_device_token_hash, trusted_device_id, binding_source, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'active', $6::jsonb)
       RETURNING id`,
      [
        userId,
        extUser,
        normalizedHash,
        trustedDeviceId,
        bindingSource === "sso_browser_tx" ? "sso_browser_tx" : "delegated_proof",
        JSON.stringify(metadata || {}),
      ],
    );
    const bindingId = Number(insBind.rows[0].id);

    if (isRestrictedLearner && Number(user.device_limit_attempts || 0) > 0) {
      await tx.query(
        `UPDATE users SET device_limit_attempts = 0, device_limit_last_attempt_at = NULL, updated_at = NOW() WHERE id = $1`,
        [userId],
      );
    }

    await recordAuditEvent({
      db: tx,
      actorId: userId,
      action: "user.moly_device.registered",
      entityType: "trusted_login_device",
      entityId: trustedDeviceId,
      metadata: {
        bindingId: String(bindingId),
        deviceName: resolvedName,
        usedSlots: usedSlots + 1,
        deviceLimit: shouldEnforce ? effectiveLimit : null,
      },
    });

    return {
      enforced: shouldEnforce,
      authorized: true,
      trustedDeviceId,
      bindingId,
      slotReused: false,
      usedSlots: usedSlots + 1,
      deviceLimit: shouldEnforce ? effectiveLimit : null,
    };
  }, { tx: outerTx });

  if (txResult?.__rejectedError) {
    throw txResult.__rejectedError;
  }
  return txResult;
};

export const adoptMolySlotForCourseSso = async ({
  db = { query },
  userId,
  molyDeviceTokenHash,
  existingCourseDeviceToken = null,
}) => {
  const normalizedHash = String(molyDeviceTokenHash || "").trim().toLowerCase();
  if (!userId || !HEX_64_RE.test(normalizedHash)) return existingCourseDeviceToken || null;
  const reg = await db.query(`SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings`);
  if (!reg.rows[0]?.has_bindings) return existingCourseDeviceToken || null;

  if (existingCourseDeviceToken) {
    const existingHash = sha256Hex(existingCourseDeviceToken);
    const known = await db.query(
      `SELECT id FROM trusted_login_devices WHERE user_id = $1 AND device_token_hash = $2 AND revoked_at IS NULL LIMIT 1`,
      [userId, existingHash],
    );
    if (known.rows.length > 0) return existingCourseDeviceToken;
  }

  const bound = await db.query(
    `SELECT d.id AS trusted_device_id
     FROM moly_device_bindings b
     JOIN trusted_login_devices d ON d.id = b.trusted_device_id
     WHERE b.user_id = $1
       AND b.moly_device_token_hash = $2
       AND b.status = 'active'
       AND b.revoked_at IS NULL
       AND d.revoked_at IS NULL
     LIMIT 1`,
    [userId, normalizedHash],
  );
  if (!bound.rows[0]) return existingCourseDeviceToken || null;

  const replacementToken = crypto.randomBytes(32).toString("base64url");
  await db.query(
    `UPDATE trusted_login_devices
     SET device_token_hash = $1,
         device_source = 'sso_bound',
         last_seen_at = NOW()
     WHERE id = $2 AND revoked_at IS NULL`,
    [sha256Hex(replacementToken), bound.rows[0].trusted_device_id],
  );
  return replacementToken;
};

export const assertDelegatedDeviceBindingActive = async ({
  db = { query },
  userId,
  trustedDeviceId = null,
  deviceBindingId = null,
}) => {
  const userRes = await db.query(
    `SELECT id, role, is_locked, locked_reason, device_limit_attempts FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const user = userRes.rows[0];
  if (!user) {
    throw new DelegatedDeviceError("UNAUTHENTICATED", "Tài khoản không tồn tại.", { status: 401 });
  }
  if (user.is_locked) {
    const isLimitLock = user.locked_reason === "DEVICE_LIMIT_LOCKED"
      || Number(user.device_limit_attempts || 0) >= DEVICE_LIMIT_LOCK_THRESHOLD;
    throw new DelegatedDeviceError(
      isLimitLock ? "DEVICE_LIMIT_LOCKED" : "ACCOUNT_LOCKED",
      "Tài khoản đã bị khóa truy cập.",
      { status: 403 },
    );
  }

  if (deviceBindingId) {
    const bindRes = await db.query(
      `SELECT b.id, b.status, b.revoked_at, d.revoked_at AS device_revoked_at
       FROM moly_device_bindings b
       JOIN trusted_login_devices d ON d.id = b.trusted_device_id
       WHERE b.id = $1 AND b.user_id = $2
       LIMIT 1`,
      [deviceBindingId, userId],
    );
    const bindRow = bindRes.rows[0];
    if (!bindRow || bindRow.status !== "active" || bindRow.revoked_at || bindRow.device_revoked_at) {
      throw new DelegatedDeviceError(
        "DEVICE_BINDING_REVOKED",
        "Thiết bị đã bị thu hồi quyền truy cập.",
        { status: 403 },
      );
    }
  } else if (trustedDeviceId) {
    const devRes = await db.query(
      `SELECT id, revoked_at FROM trusted_login_devices WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [trustedDeviceId, userId],
    );
    const dev = devRes.rows[0];
    if (!dev || dev.revoked_at) {
      throw new DelegatedDeviceError(
        "DEVICE_BINDING_REVOKED",
        "Thiết bị đã bị thu hồi quyền truy cập.",
        { status: 403 },
      );
    }
  }
};
