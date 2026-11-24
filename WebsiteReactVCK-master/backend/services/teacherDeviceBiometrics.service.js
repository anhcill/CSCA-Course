import crypto from "crypto";
import { query as defaultQuery } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

const CHALLENGE_TTL_MS = 3 * 60 * 1000;
const SUPPORTED_ALGS = new Set([-7, -257]); // ES256 (P-256) and RS256

const makeError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

const getChallengeSecret = (env = process.env) =>
  env.JWT_SECRET || env.SESSION_SECRET || "moly-webauthn-dev-secret";

export const toBase64Url = (buf) => Buffer.from(buf).toString("base64url");
export const fromBase64Url = (str) => Buffer.from(String(str || ""), "base64url");

/**
 * Resolves the WebAuthn Relying Party ID (rpId) and expected origin from the incoming HTTP request.
 * Uses apex domain 'molycourse.online' for both 'molycourse.online' and 'www.molycourse.online'
 * so a Face ID / Touch ID credential works seamlessly across both hostnames.
 */
export const resolveWebAuthnContext = (req) => {
  const originHeader = String(req?.headers?.origin || "").trim();
  const hostHeader = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").trim();
  const protoHeader = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "https").split(",")[0].trim();

  let expectedOrigin = "";
  let hostname = "";

  if (originHeader) {
    try {
      const parsed = new URL(originHeader);
      expectedOrigin = parsed.origin;
      hostname = parsed.hostname.toLowerCase();
    } catch {
      throw makeError(400, "Origin không hợp lệ cho xác thực sinh trắc học.", "INVALID_ORIGIN");
    }
  } else if (hostHeader) {
    const cleanHost = hostHeader.split(",")[0].trim();
    expectedOrigin = `${protoHeader}://${cleanHost}`;
    hostname = cleanHost.split(":")[0].toLowerCase();
  } else {
    expectedOrigin = "http://localhost:5173";
    hostname = "localhost";
  }

  let rpId = hostname;
  if (hostname === "molycourse.online" || hostname.endsWith(".molycourse.online")) {
    rpId = "molycourse.online";
  }

  return {
    rpId,
    rpName: "Moly Course LMS",
    expectedOrigin,
  };
};

export const createSignedWebAuthnChallenge = (
  { teacherId, purpose, sessionId = 0, type = "register", rpId, expectedOrigin, ttlMs = CHALLENGE_TTL_MS },
  env = process.env,
) => {
  const challenge = crypto.randomBytes(32).toString("base64url");
  const payload = {
    c: challenge,
    t: Number(teacherId),
    p: String(purpose),
    s: Number(sessionId || 0),
    y: String(type || ""),
    r: String(rpId || ""),
    o: String(expectedOrigin || ""),
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getChallengeSecret(env))
    .update(encoded)
    .digest("base64url");

  return {
    challenge,
    challengeToken: `wa.${encoded}.${sig}`,
  };
};

export const verifySignedWebAuthnChallenge = (
  { challengeToken, teacherId, purpose, sessionId = 0, type = "" },
  env = process.env,
) => {
  const parts = String(challengeToken || "").split(".");
  if (parts.length !== 3 || parts[0] !== "wa") {
    throw makeError(422, "Phiên xác thực Face ID / Vân tay không hợp lệ.", "INVALID_CHALLENGE_TOKEN");
  }
  const [, encoded, sig] = parts;
  const expected = crypto
    .createHmac("sha256", getChallengeSecret(env))
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw makeError(422, "Chữ ký phiên xác thực không hợp lệ.", "INVALID_CHALLENGE_SIGNATURE");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (Date.now() > Number(payload.exp || 0)) {
    throw makeError(422, "Phiên xác thực đã hết hạn. Vui lòng thử lại.", "CHALLENGE_EXPIRED");
  }
  if (
    Number(payload.t) !== Number(teacherId)
    || String(payload.p) !== String(purpose)
    || Number(payload.s) !== Number(sessionId || 0)
    || String(payload.y) !== String(type || "")
  ) {
    throw makeError(422, "Phiên xác thực không khớp với thao tác hiện tại.", "CHALLENGE_MISMATCH");
  }

  return payload;
};

/**
 * Validates WebAuthn authenticatorData flags & RP ID hash.
 * Requires UP (User Present) and UV (User Verified = real Face ID / Fingerprint / Device PIN).
 */
export const parseAndValidateAuthData = ({ authDataBuf, expectedRpId, requireUserVerification = true }) => {
  if (!Buffer.isBuffer(authDataBuf) || authDataBuf.length < 37) {
    throw makeError(422, "Dữ liệu xác thực sinh trắc học không hợp lệ.", "INVALID_AUTH_DATA");
  }

  const rpIdHash = authDataBuf.subarray(0, 32);
  const expectedRpIdHash = crypto.createHash("sha256").update(String(expectedRpId)).digest();
  if (!crypto.timingSafeEqual(rpIdHash, expectedRpIdHash)) {
    throw makeError(422, "Tên miền xác thực sinh trắc học không khớp.", "RP_ID_MISMATCH");
  }

  const flags = authDataBuf[32];
  const userPresent = Boolean(flags & 0x01);
  const userVerified = Boolean(flags & 0x04);
  const hasAttestedCredentialData = Boolean(flags & 0x40);
  const signCount = authDataBuf.readUInt32BE(33);

  if (!userPresent) {
    throw makeError(422, "Thiết bị chưa xác nhận người dùng hiện diện.", "USER_NOT_PRESENT");
  }
  if (requireUserVerification && !userVerified) {
    throw makeError(
      422,
      "Cần xác thực bằng Face ID / Vân tay / Mã PIN của thiết bị.",
      "USER_VERIFICATION_REQUIRED",
    );
  }

  return {
    flags,
    userPresent,
    userVerified,
    hasAttestedCredentialData,
    signCount,
  };
};

export const verifyClientDataJson = ({ clientDataBuf, expectedType, expectedChallenge, expectedOrigin }) => {
  let clientData;
  try {
    clientData = JSON.parse(clientDataBuf.toString("utf8"));
  } catch {
    throw makeError(422, "Dữ liệu clientDataJSON không đọc được.", "INVALID_CLIENT_DATA");
  }

  if (clientData.type !== expectedType) {
    throw makeError(422, "Loại xác thực WebAuthn không khớp.", "INVALID_CLIENT_TYPE");
  }
  if (clientData.challenge !== expectedChallenge) {
    throw makeError(422, "Mã thử thách xác thực không khớp.", "CHALLENGE_NOT_MATCHED");
  }
  if (expectedOrigin && clientData.origin !== expectedOrigin) {
    throw makeError(422, "Nguồn trình duyệt không khớp với phiên xác thực.", "ORIGIN_MISMATCH");
  }

  return clientData;
};

export const detectFriendlyDeviceLabel = (userAgent = "", customLabel = "") => {
  const trimmed = String(customLabel || "").trim();
  if (trimmed) return trimmed.slice(0, 80);

  const ua = String(userAgent || "");
  if (/iPhone/i.test(ua)) return "iPhone · Face ID / Touch ID";
  if (/iPad/i.test(ua)) return "iPad · Face ID / Touch ID";
  if (/Android/i.test(ua)) return "Android · Vân tay / Khuôn mặt";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac · Touch ID";
  if (/Windows/i.test(ua)) return "Windows Hello";
  return "Thiết bị cá nhân";
};

const serializeCredential = (row) => ({
  id: Number(row.id),
  credentialId: row.credential_id,
  deviceLabel: row.device_label || "Thiết bị cá nhân",
  publicKeyAlg: Number(row.public_key_alg || -7),
  lastUsedAt: row.last_used_at || null,
  createdAt: row.created_at,
});

export const listTeacherBiometricCredentials = async (teacherId, db = { query: defaultQuery }) => {
  const res = await db.query(
    `SELECT id, credential_id, device_label, public_key_alg, transports, last_used_at, created_at
     FROM teacher_biometric_credentials
     WHERE teacher_id = $1 AND revoked_at IS NULL
     ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC`,
    [teacherId],
  );
  return res.rows.map(serializeCredential);
};

export const beginTeacherBiometricRegistration = async ({
  teacherId,
  username,
  fullName,
  rpId,
  rpName,
  expectedOrigin,
  db = { query: defaultQuery },
  env = process.env,
}) => {
  const existing = await listTeacherBiometricCredentials(teacherId, db);
  const { challenge, challengeToken } = createSignedWebAuthnChallenge(
    {
      teacherId,
      purpose: "register",
      sessionId: 0,
      type: "register",
      rpId,
      expectedOrigin,
    },
    env,
  );

  return {
    challengeToken,
    publicKey: {
      challenge,
      rp: { name: rpName || "Moly Course LMS", id: rpId },
      user: {
        id: Buffer.from(`teacher-${teacherId}`, "utf8").toString("base64url"),
        name: String(username || `teacher-${teacherId}`),
        displayName: String(fullName || username || `Giảng viên #${teacherId}`),
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256 (iOS/Android/macOS/Windows)
        { type: "public-key", alg: -257 }, // RS256 (Windows Hello fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Built-in Face ID / Touch ID / Fingerprint / Windows Hello
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
      excludeCredentials: existing.map((cred) => ({
        id: cred.credentialId,
        type: "public-key",
        transports: ["internal"],
      })),
    },
  };
};

export const completeTeacherBiometricRegistration = async ({
  teacherId,
  challengeToken,
  credentialId,
  clientDataJSON,
  authenticatorData = null,
  publicKeySpki,
  publicKeyAlg = -7,
  transports = ["internal"],
  deviceLabel = "",
  userAgent = "",
  db = { query: defaultQuery },
  env = process.env,
}) => {
  const signed = verifySignedWebAuthnChallenge(
    {
      challengeToken,
      teacherId,
      purpose: "register",
      sessionId: 0,
      type: "register",
    },
    env,
  );

  const cleanCredId = String(credentialId || "").trim();
  if (!cleanCredId || cleanCredId.length < 16) {
    throw makeError(422, "Thiếu mã định danh thiết bị sinh trắc học.", "CREDENTIAL_ID_REQUIRED");
  }

  const alg = Number(publicKeyAlg);
  if (!SUPPORTED_ALGS.has(alg)) {
    throw makeError(422, "Thuật toán khóa sinh trắc học không được hỗ trợ.", "UNSUPPORTED_ALG");
  }

  const clientDataBuf = fromBase64Url(clientDataJSON);
  verifyClientDataJson({
    clientDataBuf,
    expectedType: "webauthn.create",
    expectedChallenge: signed.c,
    expectedOrigin: signed.o,
  });

  if (authenticatorData) {
    parseAndValidateAuthData({
      authDataBuf: fromBase64Url(authenticatorData),
      expectedRpId: signed.r,
      requireUserVerification: true,
    });
  }

  const spkiBuf = fromBase64Url(publicKeySpki);
  if (!spkiBuf.length) {
    throw makeError(
      422,
      "Trình duyệt không cung cấp khóa công khai SPKI. Vui lòng cập nhật Safari/Chrome bản mới nhất.",
      "PUBLIC_KEY_REQUIRED",
    );
  }

  // Validate DER SPKI key is parseable by Node crypto before storing
  try {
    crypto.createPublicKey({ key: spkiBuf, format: "der", type: "spki" });
  } catch {
    throw makeError(422, "Khóa công khai sinh trắc học không hợp lệ.", "INVALID_PUBLIC_KEY");
  }

  const cleanTransports = Array.isArray(transports) && transports.length > 0
    ? transports.map((t) => String(t).slice(0, 32))
    : ["internal"];
  const label = detectFriendlyDeviceLabel(userAgent, deviceLabel);

  const upsertRes = await db.query(
    `INSERT INTO teacher_biometric_credentials (
       teacher_id, credential_id, public_key_spki, public_key_alg, sign_count, device_label, transports, created_at, revoked_at
     )
     VALUES ($1, $2, $3, $4, 0, $5, $6, NOW(), NULL)
     ON CONFLICT (credential_id)
     DO UPDATE SET
       teacher_id = EXCLUDED.teacher_id,
       public_key_spki = EXCLUDED.public_key_spki,
       public_key_alg = EXCLUDED.public_key_alg,
       device_label = EXCLUDED.device_label,
       transports = EXCLUDED.transports,
       revoked_at = NULL
     RETURNING id, credential_id, device_label, public_key_alg, transports, last_used_at, created_at`,
    [teacherId, cleanCredId, spkiBuf.toString("base64"), alg, label, cleanTransports],
  );

  await recordAuditEvent({
    actorId: teacherId,
    action: "teacher.device_biometric.registered",
    targetType: "teacher_biometric_credential",
    targetId: String(upsertRes.rows[0].id),
    metadata: { deviceLabel: label, alg },
  }).catch(() => {});

  return serializeCredential(upsertRes.rows[0]);
};

export const revokeTeacherBiometricCredential = async ({
  teacherId,
  credentialRowId,
  db = { query: defaultQuery },
}) => {
  const res = await db.query(
    `UPDATE teacher_biometric_credentials
     SET revoked_at = NOW()
     WHERE id = $1 AND teacher_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [credentialRowId, teacherId],
  );
  if (!res.rows[0]) {
    throw makeError(404, "Không tìm thấy thiết bị sinh trắc học cần xóa.", "CREDENTIAL_NOT_FOUND");
  }
  return { id: Number(res.rows[0].id) };
};

export const beginTeacherBiometricAssertion = async ({
  teacherId,
  purpose = "attendance", // "attendance" | "self_test"
  sessionId = 0,
  type = "check_in",
  rpId,
  expectedOrigin,
  db = { query: defaultQuery },
  env = process.env,
}) => {
  const creds = await listTeacherBiometricCredentials(teacherId, db);
  if (creds.length === 0) {
    throw makeError(
      403,
      "Bạn chưa đăng ký Face ID / Vân tay trên thiết bị này.",
      "BIOMETRIC_NOT_REGISTERED",
    );
  }

  const { challenge, challengeToken } = createSignedWebAuthnChallenge(
    {
      teacherId,
      purpose,
      sessionId,
      type,
      rpId,
      expectedOrigin,
    },
    env,
  );

  return {
    challengeToken,
    publicKey: {
      challenge,
      rpId,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: creds.map((cred) => ({
        id: cred.credentialId,
        type: "public-key",
        transports: ["internal"],
      })),
    },
  };
};

export const verifyTeacherBiometricAssertion = async ({
  teacherId,
  purpose = "attendance",
  sessionId = 0,
  type = "check_in",
  challengeToken,
  credentialId,
  clientDataJSON,
  authenticatorData,
  signature,
  db = { query: defaultQuery },
  env = process.env,
}) => {
  const signed = verifySignedWebAuthnChallenge(
    {
      challengeToken,
      teacherId,
      purpose,
      sessionId,
      type,
    },
    env,
  );

  const cleanCredId = String(credentialId || "").trim();
  const credRes = await db.query(
    `SELECT id, teacher_id, credential_id, public_key_spki, public_key_alg, sign_count, device_label
     FROM teacher_biometric_credentials
     WHERE credential_id = $1 AND teacher_id = $2 AND revoked_at IS NULL`,
    [cleanCredId, teacherId],
  );
  const stored = credRes.rows[0];
  if (!stored) {
    throw makeError(
      403,
      "Thiết bị này chưa được đăng ký Face ID / Vân tay cho tài khoản của bạn.",
      "CREDENTIAL_NOT_FOUND",
    );
  }

  const clientDataBuf = fromBase64Url(clientDataJSON);
  verifyClientDataJson({
    clientDataBuf,
    expectedType: "webauthn.get",
    expectedChallenge: signed.c,
    expectedOrigin: signed.o,
  });

  const authDataBuf = fromBase64Url(authenticatorData);
  const parsedAuth = parseAndValidateAuthData({
    authDataBuf,
    expectedRpId: signed.r,
    requireUserVerification: true,
  });

  const prevCount = Number(stored.sign_count || 0);
  if (prevCount > 0 && parsedAuth.signCount > 0 && parsedAuth.signCount <= prevCount) {
    throw makeError(
      403,
      "Phát hiện bất thường bộ đếm thiết bị (có dấu hiệu nhân bản khóa). Vui lòng đăng ký lại.",
      "SIGN_COUNT_ANOMALY",
    );
  }

  const clientDataHash = crypto.createHash("sha256").update(clientDataBuf).digest();
  const signedBytes = Buffer.concat([authDataBuf, clientDataHash]);
  const signatureBuf = fromBase64Url(signature);

  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.from(stored.public_key_spki, "base64"),
    format: "der",
    type: "spki",
  });

  const ok = crypto.verify("sha256", signedBytes, pubKeyObj, signatureBuf);
  if (!ok) {
    throw makeError(401, "Chữ ký Face ID / Vân tay không hợp lệ.", "INVALID_BIOMETRIC_SIGNATURE");
  }

  await db.query(
    `UPDATE teacher_biometric_credentials
     SET sign_count = GREATEST(sign_count, $1),
         last_used_at = NOW()
     WHERE id = $2`,
    [parsedAuth.signCount, stored.id],
  );

  return {
    verified: true,
    credentialRowId: Number(stored.id),
    credentialId: stored.credential_id,
    deviceLabel: stored.device_label || "Thiết bị cá nhân",
    userVerified: parsedAuth.userVerified,
    signCount: parsedAuth.signCount,
  };
};
