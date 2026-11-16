import crypto from "crypto";
import { SsoPolicyError, normalizeWebBaseUrl } from "./ssoPathPolicy.service.js";

const DEFAULT_TIMEOUT_MS = 10000;

export class CourseToMolyClientError extends SsoPolicyError {
  constructor(status, code, message, { retryable = false, details = undefined } = {}) {
    super(status, code, message, details);
    this.name = "CourseToMolyClientError";
    this.retryable = Boolean(retryable);
  }
}

export function buildCourseOutboundSignature({ timestamp, rawBody, secret }) {
  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody ?? {}), "utf8");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), bodyBuf]))
    .digest("hex");
  return `sha256=${digest}`;
}

function parsePositiveInt(raw, fallback, { min = 1, max = 60000 } = {}) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(max, parsed);
}

function resolveOutboundConfig(config = {}, env = process.env) {
  return {
    apiBaseUrl: normalizeWebBaseUrl(config.apiBaseUrl ?? env.MOLY_API_BASE_URL ?? ""),
    webBaseUrl: normalizeWebBaseUrl(config.webBaseUrl ?? env.MOLY_WEB_BASE_URL ?? ""),
    serviceToken: String(config.serviceToken ?? env.MOLY_OUTBOUND_SERVICE_TOKEN ?? "").trim(),
    integrationKey: String(config.integrationKey ?? env.MOLY_OUTBOUND_INTEGRATION_KEY ?? "").trim(),
    hmacSecret: String(config.hmacSecret ?? env.MOLY_OUTBOUND_HMAC_SECRET ?? "").trim(),
    timeoutMs: parsePositiveInt(config.timeoutMs ?? env.MOLY_OUTBOUND_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, {
      min: 200,
      max: 60000,
    }),
  };
}

export function createCourseToMolyClient({ config = {}, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  function getConfig() {
    return resolveOutboundConfig(config, env);
  }

  function isConfigured() {
    const cfg = getConfig();
    return Boolean(cfg.apiBaseUrl && cfg.serviceToken && cfg.integrationKey && cfg.hmacSecret);
  }

  async function sendPostSigned(routePath, bodyObj, {
    apiVersion = "v1",
    correlationId,
    idempotencyKey = null,
    errorFallbackCode = "MOLY_SSO_EXCHANGE_FAILED",
    errorFallbackMessage = "Moly Studio request failed.",
    timeoutCode = "MOLY_SSO_TIMEOUT",
    networkCode = "MOLY_SSO_NETWORK_ERROR",
  } = {}) {
    const cfg = getConfig();
    if (!cfg.apiBaseUrl || !cfg.serviceToken || !cfg.integrationKey || !cfg.hmacSecret) {
      throw new CourseToMolyClientError(
        503,
        "MOLY_SSO_NOT_CONFIGURED",
        "Moly Studio outbound credentials are not configured.",
      );
    }
    if (typeof fetchImpl !== "function") {
      throw new CourseToMolyClientError(500, "FETCH_UNAVAILABLE", "HTTP fetch runtime is unavailable.");
    }

    const rawBody = JSON.stringify(bodyObj ?? {});
    const timestamp = new Date().toISOString();
    const corr = correlationId || crypto.randomUUID();
    const signature = buildCourseOutboundSignature({ timestamp, rawBody, secret: cfg.hmacSecret });

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cfg.serviceToken}`,
      "X-Integration-Key": cfg.integrationKey,
      "X-Timestamp": timestamp,
      "X-Event-Timestamp": timestamp,
      "X-Correlation-ID": corr,
      "X-Signature": signature,
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = String(idempotencyKey).trim();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const response = await fetchImpl(`${cfg.apiBaseUrl}/api/integrations/${apiVersion}${routePath}`, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: rawBody,
      });

      const parsed = await response.json().catch(() => ({}));
      if (!response.ok || parsed?.success === false) {
        const code = parsed?.errorCode || parsed?.code || errorFallbackCode;
        const message = parsed?.message || errorFallbackMessage;
        throw new CourseToMolyClientError(response.status || 502, code, message, {
          retryable: [408, 425, 429, 502, 503, 504].includes(response.status),
          details: parsed?.details,
        });
      }
      return parsed.data ?? parsed;
    } catch (error) {
      if (error instanceof CourseToMolyClientError) throw error;
      if (error?.name === "AbortError") {
        throw new CourseToMolyClientError(504, timeoutCode, "Moly Studio request timed out.", { retryable: true });
      }
      throw new CourseToMolyClientError(502, networkCode, "Unable to reach Moly Studio endpoint.", { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getConfig,
    isConfigured,
    exchangeSsoCode({ code, nonce, codeVerifier = null, consumeIp = null, correlationId = null }) {
      return sendPostSigned("/sso/exchange", {
        code,
        nonce,
        code_verifier: codeVerifier,
        consumer_system: "csca-course",
        consume_ip: consumeIp,
        correlation_id: correlationId,
      }, { correlationId });
    },
    bindPeerIdentity({ externalUserId, targetUserId, email, nonce, correlationId = null }) {
      return sendPostSigned("/sso/bind-identity", {
        source_system: "csca-course",
        external_user_id: externalUserId,
        target_user_id: targetUserId,
        email,
        nonce,
        correlation_id: correlationId,
      }, { correlationId });
    },
    postV2Event(envelope, { idempotencyKey = null, correlationId = null } = {}) {
      const resolvedIdem = idempotencyKey || envelope?.idempotencyKey || envelope?.eventId || null;
      const resolvedCorr = correlationId || envelope?.correlationId || crypto.randomUUID();
      return sendPostSigned("/events/ingest", envelope, {
        apiVersion: "v2",
        correlationId: resolvedCorr,
        idempotencyKey: resolvedIdem,
        errorFallbackCode: "MOLY_INGEST_FAILED",
        errorFallbackMessage: "Moly catalog ingest request failed.",
        timeoutCode: "MOLY_INGEST_TIMEOUT",
        networkCode: "MOLY_INGEST_NETWORK_ERROR",
      });
    },
  };
}
