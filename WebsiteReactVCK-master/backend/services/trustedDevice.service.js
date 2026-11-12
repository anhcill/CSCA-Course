import crypto from "crypto";
import net from "node:net";
import { getClient, query } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

export const TRUSTED_DEVICE_COOKIE = "csca_trusted_device";
export const TRUSTED_DEVICE_LIMIT = 2;
export const DEVICE_LIMIT_LOCK_THRESHOLD = 3;

export const getTrustedDeviceLimitForRole = (role) => (
  role === "user" ? TRUSTED_DEVICE_LIMIT : null
);

const TRUSTED_DEVICE_COOKIE_TTL_MS = 400 * 24 * 60 * 60 * 1000;

export class TrustedDeviceAuthError extends Error {
  constructor(errorCode, message, { status = 403, details = undefined } = {}) {
    super(message);
    this.name = "TrustedDeviceAuthError";
    this.errorCode = errorCode;
    this.status = status;
    this.details = details;
  }
}

export const hashOpaqueToken = (token) => (
  crypto.createHash("sha256").update(String(token)).digest("hex")
);

export const trustedDeviceCookieOptions = () => ({
  maxAge: TRUSTED_DEVICE_COOKIE_TTL_MS,
  httpOnly: true,
  // OAuth callbacks are top-level cross-site navigations, so the durable
  // device identifier must use Lax. It is not an authentication credential.
  sameSite: "lax",
  secure: process.env.NODE_ENV !== "development",
  path: "/",
});

export const setTrustedDeviceCookie = (res, token) => {
  res.cookie(TRUSTED_DEVICE_COOKIE, token, trustedDeviceCookieOptions());
};

const normalizeDeviceToken = (value) => {
  if (typeof value !== "string" || value.length < 32 || value.length > 256) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
};

const normalizeIpAddress = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().replace(/^::ffff:/, "");
  return net.isIP(normalized) ? normalized : null;
};

const detectOperatingSystem = (userAgent) => {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Thiết bị không xác định";
};

const detectBrowser = (userAgent) => {
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/CriOS|Chrome\//i.test(userAgent)) return "Chrome";
  if (/FxiOS|Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Trình duyệt không xác định";
};

export const describeDevice = (userAgent = "") => {
  const normalized = typeof userAgent === "string" ? userAgent.slice(0, 1000) : "";
  return `${detectOperatingSystem(normalized)} · ${detectBrowser(normalized)}`;
};

export const getRequestLoginContext = (req) => ({
  deviceToken: req.cookies?.[TRUSTED_DEVICE_COOKIE] || null,
  userAgent: typeof req.get === "function" ? req.get("user-agent") || "" : req.headers?.["user-agent"] || "",
  ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress || null),
});

export const establishLoginSession = async ({
  userId,
  deviceToken,
  userAgent = "",
  ipAddress = null,
  expiresAt,
  clientFactory = getClient,
}) => {
  const client = await clientFactory();
  let committed = false;

  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `SELECT id, role, is_locked, device_limit_attempts
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new TrustedDeviceAuthError("UNAUTHENTICATED", "Tài khoản không còn tồn tại", { status: 401 });
    }
    if (user.is_locked) {
      throw new TrustedDeviceAuthError(
        "ACCOUNT_LOCKED",
        "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
      );
    }

    const deviceLimit = getTrustedDeviceLimitForRole(user.role);

    const suppliedToken = normalizeDeviceToken(deviceToken);
    const effectiveToken = suppliedToken || crypto.randomBytes(32).toString("base64url");
    const deviceTokenHash = hashOpaqueToken(effectiveToken);
    const normalizedUserAgent = typeof userAgent === "string" ? userAgent.slice(0, 1000) : "";
    const normalizedIp = normalizeIpAddress(ipAddress);

    const knownDeviceResult = await client.query(
      `SELECT id
       FROM trusted_login_devices
       WHERE user_id = $1 AND device_token_hash = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [userId, deviceTokenHash],
    );

    let trustedDeviceId = knownDeviceResult.rows[0]?.id || null;
    if (!trustedDeviceId) {
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM trusted_login_devices
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      const usedSlots = Number(countResult.rows[0]?.count || 0);

      if (deviceLimit !== null && usedSlots >= deviceLimit) {
        const attemptCount = Math.min(
          DEVICE_LIMIT_LOCK_THRESHOLD,
          Number(user.device_limit_attempts || 0) + 1,
        );

        await client.query(
          `UPDATE users
           SET device_limit_attempts = $1,
               device_limit_last_attempt_at = NOW(),
               updated_at = NOW()
           WHERE id = $2`,
          [attemptCount, userId],
        );

        const existingDevices = await listTrustedDevicesForUser(userId, null, client);

        await recordAuditEvent({
          db: client,
          actorId: userId,
          action: "user.trusted_device.rejected",
          entityType: "trusted_login_device",
          metadata: {
            ip: normalizedIp,
            userAgent: normalizedUserAgent,
            usedSlots,
            deviceLimit,
            attemptCount,
          },
        });

        await client.query("COMMIT");
        committed = true;

        throw new TrustedDeviceAuthError(
          "DEVICE_LIMIT_REACHED",
          `Tài khoản đã đạt giới hạn tối đa ${deviceLimit} thiết bị đăng nhập. Vui lòng liên hệ quản trị viên để gỡ bớt thiết bị cũ.`,
          {
            details: {
              attempts: attemptCount,
              usedSlots,
              deviceLimit,
              devices: existingDevices,
            },
          },
        );
      }

      const insertedDevice = await client.query(
        `INSERT INTO trusted_login_devices
           (user_id, device_token_hash, device_name, user_agent, first_ip, last_ip)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id`,
        [userId, deviceTokenHash, describeDevice(normalizedUserAgent), normalizedUserAgent || null, normalizedIp],
      );
      trustedDeviceId = insertedDevice.rows[0].id;

      await recordAuditEvent({
        db: client,
        actorId: userId,
        action: "user.trusted_device.registered",
        entityType: "trusted_login_device",
        entityId: trustedDeviceId,
        metadata: {
          ip: normalizedIp,
          userAgent: normalizedUserAgent,
          deviceName: describeDevice(normalizedUserAgent),
        },
      });
    } else {
      await client.query(
        `UPDATE trusted_login_devices
         SET device_name = $1,
             user_agent = $2,
             last_ip = COALESCE($3, last_ip),
             last_seen_at = NOW(),
             last_login_at = NOW()
         WHERE id = $4`,
        [describeDevice(normalizedUserAgent), normalizedUserAgent || null, normalizedIp, trustedDeviceId],
      );
    }

    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const sessionResult = await client.query(
      `INSERT INTO user_sessions
         (user_id, token_hash, device_info, ip_address, expires_at, trusted_device_id, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [
        userId,
        hashOpaqueToken(sessionToken),
        describeDevice(normalizedUserAgent),
        normalizedIp,
        expiresAt,
        trustedDeviceId,
      ],
    );

    await client.query(
      `UPDATE users
       SET last_login_at = NOW(),
           device_limit_attempts = CASE WHEN role = 'user' THEN 0 ELSE device_limit_attempts END,
           device_limit_last_attempt_at = CASE WHEN role = 'user' THEN NULL ELSE device_limit_last_attempt_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [userId],
    );
    await client.query("COMMIT");
    committed = true;

    return {
      sessionId: sessionResult.rows[0].id,
      sessionToken,
      trustedDeviceId,
      deviceToken: effectiveToken,
    };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const authorizeRecordDevice = async ({
  userId,
  trustedDeviceId,
  deviceLimit = TRUSTED_DEVICE_LIMIT,
  enforce = true,
  clientFactory = getClient,
}) => {
  if (!enforce) return { enforced: false, authorized: true };

  const parsedLimit = Number(deviceLimit);
  const effectiveLimit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : TRUSTED_DEVICE_LIMIT;
  if (!userId || !trustedDeviceId) {
    throw new TrustedDeviceAuthError(
      "TRUSTED_DEVICE_REQUIRED",
      "Vui lòng đăng nhập lại để hệ thống ghi nhớ thiết bị học của bạn.",
      { status: 401 },
    );
  }

  const client = await clientFactory();
  let committed = false;
  try {
    await client.query("BEGIN");
    const deviceRes = await client.query(
      `SELECT d.id, d.user_id, d.record_access_granted_at, u.role
       FROM trusted_login_devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1 AND d.user_id = $2 AND d.revoked_at IS NULL
       FOR UPDATE`,
      [trustedDeviceId, userId],
    );
    const device = deviceRes.rows[0];
    if (!device) {
      throw new TrustedDeviceAuthError(
        "TRUSTED_DEVICE_REQUIRED",
        "Thiết bị hiện tại chưa được ghi nhớ. Vui lòng đăng nhập lại để tiếp tục.",
        { status: 401 },
      );
    }
    if (device.role !== "user") {
      await client.query("COMMIT");
      committed = true;
      return { enforced: false, authorized: true, trustedDeviceId: device.id };
    }

    if (device.record_access_granted_at) {
      await client.query(
        `UPDATE trusted_login_devices
         SET last_seen_at = NOW()
         WHERE id = $1`,
        [device.id],
      );
      await client.query("COMMIT");
      committed = true;
      return {
        enforced: true,
        authorized: true,
        trustedDeviceId: device.id,
        deviceLimit: effectiveLimit,
      };
    }

    const usedRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM trusted_login_devices
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND record_access_granted_at IS NOT NULL`,
      [userId],
    );
    const usedSlots = Number(usedRes.rows[0]?.count || 0);
    if (usedSlots >= effectiveLimit) {
      const existingDevices = await listTrustedDevicesForUser(userId, null, client);
      await recordAuditEvent({
        db: client,
        actorId: userId,
        action: "user.record_device.rejected",
        entityType: "trusted_login_device",
        entityId: device.id,
        metadata: { usedSlots, deviceLimit: effectiveLimit },
      });
      await client.query("COMMIT");
      committed = true;
      throw new TrustedDeviceAuthError(
        "DEVICE_LIMIT_REACHED",
        `Bạn đã sử dụng đủ ${effectiveLimit} thiết bị cho khóa Record. Nhắn admin để được hỗ trợ đổi thiết bị nhé.`,
        { details: { usedSlots, deviceLimit: effectiveLimit, devices: existingDevices } },
      );
    }

    await client.query(
      `UPDATE trusted_login_devices
       SET record_access_granted_at = NOW(), last_seen_at = NOW()
       WHERE id = $1`,
      [device.id],
    );
    await recordAuditEvent({
      db: client,
      actorId: userId,
      action: "user.record_device.authorized",
      entityType: "trusted_login_device",
      entityId: device.id,
      metadata: { usedSlots: usedSlots + 1, deviceLimit: effectiveLimit },
    });
    await client.query("COMMIT");
    committed = true;
    return {
      enforced: true,
      authorized: true,
      trustedDeviceId: device.id,
      usedSlots: usedSlots + 1,
      deviceLimit: effectiveLimit,
    };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const listTrustedDevicesForUser = async (userId, currentDeviceId = null, db = { query }) => {
  const result = await db.query(
    `SELECT d.id, d.device_name, d.user_agent, d.record_access_granted_at,
            host(d.first_ip) AS first_ip, host(d.last_ip) AS last_ip,
            d.first_seen_at, d.last_seen_at, d.last_login_at,
            COUNT(s.id) FILTER (
              WHERE s.revoked_at IS NULL AND s.expires_at > NOW()
            )::int AS active_sessions
     FROM trusted_login_devices d
     LEFT JOIN user_sessions s ON s.trusted_device_id = d.id
     WHERE d.user_id = $1 AND d.revoked_at IS NULL
     GROUP BY d.id
     ORDER BY (d.id = $2) DESC, d.last_seen_at DESC`,
    [userId, currentDeviceId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    userAgent: row.user_agent || null,
    firstIp: row.first_ip || null,
    lastIp: row.last_ip || null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastLoginAt: row.last_login_at,
    recordAccessGrantedAt: row.record_access_granted_at || null,
    isRecordDevice: Boolean(row.record_access_granted_at),
    activeSessions: Number(row.active_sessions || 0),
    isCurrent: String(row.id) === String(currentDeviceId),
  }));
};

export const resolveAuthenticatedSession = async ({
  userId,
  sessionId,
  sessionToken,
  deviceToken,
  ipAddress = null,
  db = { query },
}) => {
  if (!userId || !sessionId || !sessionToken || !deviceToken) return null;
  const result = await db.query(
    `SELECT u.id, u.username, u.email, u.role, u.avatar_url, u.gender,
            u.is_vip, u.vip_expires_at, u.email_verified, u.is_locked, u.created_at,
            u.is_management_managed, u.lms_account_status, u.is_internal_test_account,
            s.id AS session_id, s.trusted_device_id
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN trusted_login_devices d ON d.id = s.trusted_device_id
     WHERE s.id = $1
       AND s.user_id = $2
       AND s.token_hash = $3
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND d.revoked_at IS NULL
       AND d.device_token_hash = $4
     LIMIT 1`,
    [sessionId, userId, hashOpaqueToken(sessionToken), hashOpaqueToken(deviceToken)],
  );
  const row = result.rows[0];
  if (!row) return null;

  await db.query(
    `WITH touched_session AS (
       UPDATE user_sessions
       SET last_seen_at = NOW()
       WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '5 minutes'
       RETURNING trusted_device_id
     )
     UPDATE trusted_login_devices d
     SET last_seen_at = NOW(), last_ip = COALESCE($2, d.last_ip)
     FROM touched_session ts
     WHERE d.id = ts.trusted_device_id`,
    [row.session_id, normalizeIpAddress(ipAddress)],
  );

  const { session_id: authenticatedSessionId, trusted_device_id: trustedDeviceId, ...user } = row;
  return {
    user,
    authSession: { id: authenticatedSessionId, trustedDeviceId },
  };
};

export const revokeSessionFromJwtPayload = async (payload, db = { query }) => {
  if (!payload?.sessionId || !payload?.sessionToken) return false;
  const result = await db.query(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE id = $1 AND user_id = $2 AND token_hash = $3 AND revoked_at IS NULL
     RETURNING id`,
    [payload.sessionId, payload.userId, hashOpaqueToken(payload.sessionToken)],
  );
  return Boolean(result.rows[0]);
};

export const revokeTrustedDevice = async ({
  deviceId,
  userId,
  revokedBy,
  db = { query },
}) => {
  const deviceResult = await db.query(
    `SELECT id, user_id, device_name, user_agent, host(first_ip) AS first_ip,
            host(last_ip) AS last_ip, first_seen_at, last_seen_at, last_login_at
     FROM trusted_login_devices
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [deviceId, userId],
  );
  const device = deviceResult.rows[0];
  if (!device) return null;

  await db.query(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE trusted_device_id = $1 AND revoked_at IS NULL`,
    [deviceId],
  );
  await db.query(
    `UPDATE trusted_login_devices
     SET revoked_at = NOW(), revoked_by = $1
     WHERE id = $2`,
    [revokedBy, deviceId],
  );
  await recordAuditEvent({
    db,
    actorId: revokedBy,
    action: "user.trusted_device.removed",
    entityType: "trusted_login_device",
    entityId: deviceId,
    beforeState: device,
    afterState: { ...device, revoked: true },
    metadata: { targetUserId: userId },
  });
  return device;
};
