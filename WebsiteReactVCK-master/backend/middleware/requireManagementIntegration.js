import crypto from "crypto";

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getHeader = (req, name) => {
  const value = req.get(name);
  return typeof value === "string" ? value.trim() : "";
};

const integrationUnavailable = (res) => res.status(503).json({
  success: false,
  message: "Kết nối đồng bộ quản lý - LMS chưa được cấu hình",
  errorCode: "INTEGRATION_NOT_CONFIGURED",
});

const integrationUnauthorized = (res) => res.status(401).json({
  success: false,
  message: "Yêu cầu đồng bộ không hợp lệ",
  errorCode: "INTEGRATION_UNAUTHORIZED",
});

const integrationReplayRejected = (res) => res.status(401).json({
  success: false,
  message: "Yêu cầu đồng bộ đã hết hạn",
  errorCode: "INTEGRATION_TIMESTAMP_INVALID",
});

const requireManagementIntegration = (req, res, next) => {
  const serviceToken = process.env.MANAGEMENT_INTEGRATION_SERVICE_TOKEN?.trim();
  const integrationKey = process.env.MANAGEMENT_INTEGRATION_KEY?.trim();
  const hmacSecret = process.env.MANAGEMENT_INTEGRATION_HMAC_SECRET;
  if (!serviceToken || !integrationKey || !hmacSecret) return integrationUnavailable(res);

  const authorization = getHeader(req, "Authorization");
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const receivedKey = getHeader(req, "X-Integration-Key");
  const timestamp = getHeader(req, "X-Event-Timestamp");
  const signature = getHeader(req, "X-Signature");
  const correlationId = getHeader(req, "X-Correlation-ID");
  const idempotencyKey = getHeader(req, "Idempotency-Key");

  if (!token || !safeEqual(token, serviceToken) || !safeEqual(receivedKey, integrationKey)) {
    return integrationUnauthorized(res);
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(correlationId)
    || !/^[A-Za-z0-9._:-]{1,180}$/.test(idempotencyKey)) {
    return integrationUnauthorized(res);
  }

  const timestampMs = Date.parse(timestamp);
  const configuredMaxAge = Number(process.env.MANAGEMENT_INTEGRATION_MAX_AGE_SECONDS || 300);
  const maxAgeSeconds = Number.isFinite(configuredMaxAge)
    ? Math.min(Math.max(Math.floor(configuredMaxAge), 30), 3600)
    : 300;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxAgeSeconds * 1000) {
    return integrationReplayRejected(res);
  }

  if (!Buffer.isBuffer(req.rawBody)) return integrationUnauthorized(res);
  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", hmacSecret)
    .update(timestamp)
    .update(".")
    .update(req.rawBody)
    .digest("hex")}`;
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature) || !safeEqual(signature.toLowerCase(), expectedSignature)) {
    return integrationUnauthorized(res);
  }

  req.managementIntegration = { correlationId, idempotencyKey };
  return next();
};

export default requireManagementIntegration;
