import crypto from "crypto";

const HEADER_VALUE = (req, name) => {
  if (typeof req.get === "function") return req.get(name);
  const key = name.toLowerCase();
  const raw = req.headers?.[key];
  return Array.isArray(raw) ? raw[0] : raw;
};

export const constantTimeEquals = (left, right) => {
  const leftBuf = Buffer.from(String(left ?? ""), "utf8");
  const rightBuf = Buffer.from(String(right ?? ""), "utf8");
  const leftDigest = crypto.createHash("sha256").update(leftBuf).digest();
  const rightDigest = crypto.createHash("sha256").update(rightBuf).digest();
  return leftBuf.length === rightBuf.length && crypto.timingSafeEqual(leftDigest, rightDigest);
};

export const computeMolySignature = ({ timestamp, rawBody, secret }) => {
  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody ?? {}), "utf8");
  const prefix = Buffer.from(`${timestamp}.`, "utf8");
  const digest = crypto
    .createHmac("sha256", String(secret || ""))
    .update(Buffer.concat([prefix, bodyBuf]))
    .digest("hex");
  return `sha256=${digest}`;
};

const getMolyIntegrationConfig = (overrides = {}) => {
  const maxAgeRaw = overrides.maxAgeSeconds ?? process.env.MOLY_INTEGRATION_MAX_AGE_SECONDS ?? "300";
  const parsedMaxAge = Number.parseInt(String(maxAgeRaw), 10);
  return {
    serviceToken: (overrides.serviceToken ?? process.env.MOLY_INTEGRATION_SERVICE_TOKEN ?? "").trim(),
    integrationKey: (overrides.integrationKey ?? process.env.MOLY_INTEGRATION_KEY ?? "").trim(),
    hmacSecret: (overrides.hmacSecret ?? process.env.MOLY_INTEGRATION_HMAC_SECRET ?? "").trim(),
    maxAgeSeconds: Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 300,
    nowMs: typeof overrides.now === "function" ? overrides.now() : Date.now(),
  };
};

const deny = (res, status, errorCode, message, correlationId = null) => res.status(status).json({
  success: false,
  errorCode,
  message,
  ...(correlationId ? { correlation_id: correlationId } : {}),
});

/**
 * Verifies signed server-to-server requests coming from Moly Studio.
 * Validates Bearer token, X-Integration-Key, X-Event-Timestamp freshness window,
 * correlation/idempotency headers, and constant-time HMAC-SHA256 over `<timestamp>.<rawBody>`.
 */
export const createRequireMolyIntegration = ({
  requireIdempotencyKey = true,
  configOverrides = {},
} = {}) => (req, res, next) => {
  const correlationRaw = HEADER_VALUE(req, "X-Correlation-ID");
  const correlationId = typeof correlationRaw === "string" ? correlationRaw.trim() : "";

  const cfg = getMolyIntegrationConfig(configOverrides);
  if (!cfg.serviceToken || !cfg.integrationKey || !cfg.hmacSecret) {
    return deny(res, 503, "INTEGRATION_NOT_CONFIGURED", "Moly integration credentials are not configured.", correlationId || null);
  }

  const authHeader = String(HEADER_VALUE(req, "Authorization") || "");
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!bearerMatch || !constantTimeEquals(bearerMatch[1].trim(), cfg.serviceToken)) {
    return deny(res, 401, "INVALID_SERVICE_TOKEN", "Invalid or missing integration bearer token.", correlationId || null);
  }

  const integrationKeyHeader = String(HEADER_VALUE(req, "X-Integration-Key") || "").trim();
  if (!integrationKeyHeader || !constantTimeEquals(integrationKeyHeader, cfg.integrationKey)) {
    return deny(res, 401, "INVALID_INTEGRATION_KEY", "Invalid or missing X-Integration-Key header.", correlationId || null);
  }

  if (!correlationId || correlationId.length > 128) {
    return deny(res, 400, "MISSING_CORRELATION_ID", "X-Correlation-ID header (1..128 chars) is required.");
  }

  let idempotencyKey = null;
  const rawIdemKey = HEADER_VALUE(req, "Idempotency-Key");
  if (rawIdemKey !== undefined && rawIdemKey !== null && String(rawIdemKey).trim() !== "") {
    idempotencyKey = String(rawIdemKey).trim();
    if (idempotencyKey.length > 180) {
      return deny(res, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key exceeds 180 characters.", correlationId);
    }
  } else if (requireIdempotencyKey) {
    return deny(res, 400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required.", correlationId);
  }

  const timestampHeader = String(HEADER_VALUE(req, "X-Event-Timestamp") || "").trim();
  if (!timestampHeader) {
    return deny(res, 400, "MISSING_EVENT_TIMESTAMP", "X-Event-Timestamp header is required.", correlationId);
  }
  const timestampMs = Date.parse(timestampHeader);
  if (!Number.isFinite(timestampMs)) {
    return deny(res, 400, "INVALID_EVENT_TIMESTAMP", "X-Event-Timestamp must be a valid ISO-8601 timestamp.", correlationId);
  }
  if (Math.abs(cfg.nowMs - timestampMs) > cfg.maxAgeSeconds * 1000) {
    return deny(res, 401, "TIMESTAMP_EXPIRED", "X-Event-Timestamp is outside the permitted freshness window.", correlationId);
  }

  const signatureHeader = String(HEADER_VALUE(req, "X-Signature") || "").trim().toLowerCase();
  if (!/^sha256=[a-f0-9]{64}$/.test(signatureHeader)) {
    return deny(res, 401, "INVALID_SIGNATURE", "X-Signature must be formatted as sha256=<64-hex>.", correlationId);
  }

  const expectedSignature = computeMolySignature({
    timestamp: timestampHeader,
    rawBody: req.rawBody !== undefined ? req.rawBody : JSON.stringify(req.body ?? {}),
    secret: cfg.hmacSecret,
  });

  if (!constantTimeEquals(signatureHeader, expectedSignature)) {
    return deny(res, 401, "INVALID_SIGNATURE", "Webhook HMAC signature verification failed.", correlationId);
  }

  req.molyIntegration = {
    sourceSystem: "moly",
    correlationId,
    idempotencyKey,
    eventTimestamp: new Date(timestampMs).toISOString(),
    rawTimestamp: timestampHeader,
    integrationKey: integrationKeyHeader,
  };
  return next();
};

export const requireMolyIntegration = createRequireMolyIntegration({ requireIdempotencyKey: true });
export const requireMolyReadIntegration = createRequireMolyIntegration({ requireIdempotencyKey: false });
export default requireMolyIntegration;
