import crypto from "node:crypto";

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_RE = /(?:secret|token|password|passwd|pwd|signature|hmac|authorization|cookie|set-cookie|code_verifier|codeverifier|link_?token|tx_?token|pkce_verifier|raw_?body|payment_payload|webhook_payload|provider_payload|checkout_url|qr_code|api_key|checksum|private_key)/i;
const SENSITIVE_QUERY_OR_HASH_RE = /([?#&](?:code|token|secret|signature|sig|password|code_verifier|link_token|tx_token)=)[^&#\s]+/gi;

export const sanitizeString = (str) => {
  if (typeof str !== "string") return str;
  let cleaned = str.replace(SENSITIVE_QUERY_OR_HASH_RE, `$1${REDACTED}`);
  cleaned = cleaned.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  cleaned = cleaned.replace(/\bsha256=[a-fA-F0-9]{16,}/g, `sha256=${REDACTED}`);
  return cleaned;
};

export const redactSensitiveData = (value, depth = 0, seen = new WeakSet()) => {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer:${value.length}]`;
  if (depth >= 5) return "[MaxDepth]";

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.slice(0, 50).map((item) => redactSensitiveData(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactSensitiveData(v, depth + 1, seen);
      }
    }
    return out;
  }

  return String(value);
};

export const resolveCorrelationId = (candidate) => {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim().slice(0, 128);
  }
  return crypto.randomUUID();
};

export const isMolyIntegrationKillSwitchActive = (env = process.env) => {
  const disabledFlag = String(env?.MOLY_INTEGRATION_SYNC_DISABLED || "").trim().toLowerCase();
  const killFlag = String(env?.MOLY_INTEGRATION_KILL_SWITCH || "").trim().toLowerCase();
  return disabledFlag === "true" || killFlag === "true";
};

export const isCatalogSyncKillSwitchActive = (env = process.env) => {
  if (isMolyIntegrationKillSwitchActive(env)) return true;
  const catalogDisabled = String(env?.COURSE_CATALOG_SYNC_DISABLED || "").trim().toLowerCase();
  const molyCatalogDisabled = String(env?.MOLY_CATALOG_SYNC_DISABLED || "").trim().toLowerCase();
  return catalogDisabled === "true" || molyCatalogDisabled === "true";
};

const metricsCounters = new Map();
const latencyStats = new Map();

export const recordIntegrationMetric = (name, delta = 1) => {
  const key = String(name || "unknown");
  metricsCounters.set(key, (metricsCounters.get(key) || 0) + (Number(delta) || 0));
};

export const observeIntegrationLatency = (name, durationMs) => {
  const key = String(name || "latency");
  const ms = Math.max(0, Number(durationMs) || 0);
  const prev = latencyStats.get(key) || { count: 0, sumMs: 0, maxMs: 0, lastMs: 0 };
  latencyStats.set(key, {
    count: prev.count + 1,
    sumMs: prev.sumMs + ms,
    maxMs: Math.max(prev.maxMs, ms),
    lastMs: ms,
  });
};

export const getIntegrationMetricsSnapshot = () => {
  const counters = {};
  for (const [k, v] of metricsCounters.entries()) counters[k] = v;
  const latencies = {};
  for (const [k, stat] of latencyStats.entries()) {
    latencies[k] = {
      count: stat.count,
      avgMs: stat.count ? Math.round((stat.sumMs / stat.count) * 100) / 100 : 0,
      maxMs: Math.round(stat.maxMs * 100) / 100,
      lastMs: Math.round(stat.lastMs * 100) / 100,
    };
  }
  return {
    killSwitchActive: isMolyIntegrationKillSwitchActive(),
    catalogSyncKillSwitchActive: isCatalogSyncKillSwitchActive(),
    counters,
    latencies,
  };
};

export const resetIntegrationMetrics = () => {
  metricsCounters.clear();
  latencyStats.clear();
};

export const createIntegrationLogger = ({ component = "moly-integration", sink = null, env = process.env } = {}) => {
  const emit = (level, event, data = {}, correlationId = null) => {
    const entry = {
      ts: new Date().toISOString(),
      level,
      service: "csca-course",
      component,
      event: String(event || "log"),
      correlation_id: resolveCorrelationId(correlationId ?? data?.correlationId ?? data?.correlation_id),
      data: redactSensitiveData(data),
    };
    if (typeof sink === "function") {
      sink(entry);
    } else if (String(env?.INTEGRATION_LOG_SILENT || "").toLowerCase() !== "true") {
      const line = JSON.stringify(entry);
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    }
    return entry;
  };

  return {
    info: (event, data, correlationId) => emit("info", event, data, correlationId),
    warn: (event, data, correlationId) => emit("warn", event, data, correlationId),
    error: (event, data, correlationId) => emit("error", event, data, correlationId),
  };
};
