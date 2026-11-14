import crypto from "crypto";

export const DEFAULT_SSO_TTL_SECONDS = 90;
export const MIN_SSO_TTL_SECONDS = 60;
export const MAX_SSO_TTL_SECONDS = 120;

export const DEFAULT_TARGET_PATH = Object.freeze({
  "csca-course": "/courses",
  moly: "/khoa-hoc",
});

const ALLOWED_TARGET_PATTERNS = Object.freeze({
  "csca-course": [
    /^\/$/,
    /^\/courses$/,
    /^\/profile$/,
    /^\/video-courses\/[A-Za-z0-9._:-]{1,120}(?:\/units\/[A-Za-z0-9._:-]{1,120})?$/,
    /^\/lms\/my-learning$/,
    /^\/lms\/dashboard$/,
    /^\/lms\/courses\/[A-Za-z0-9._:-]{1,120}(?:\/classes\/[A-Za-z0-9._:-]{1,120})?$/,
  ],
  moly: [
    /^\/$/,
    /^\/khoa-hoc(?:\/[a-z0-9-]{1,160})?$/,
    /^\/hoc$/,
    /^\/vip$/,
    /^\/goi-video$/,
    /^\/tai-khoan\/goi-video$/,
  ],
});

const FORBIDDEN_PATH_TOKENS = [
  "//",
  "\\",
  "..",
  "?",
  "#",
  "@",
  ":/",
  ":\\",
  ":%2f",
  ":%5c",
  "%2f",
  "%5c",
  "%2e",
];
const FORBIDDEN_SCHEME_RE = /(?:^|\/)(?:javascript|data|vbscript|file|https?):/i;

export class SsoPolicyError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "SsoPolicyError";
    this.status = status;
    this.code = code;
    this.errorCode = code;
    if (details !== undefined) this.details = details;
  }
}

export function resolveSsoTtlSeconds(raw, fallback = DEFAULT_SSO_TTL_SECONDS) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_SSO_TTL_SECONDS, Math.max(MIN_SSO_TTL_SECONDS, parsed));
}

export function validateSsoTargetPath(rawPath, { targetSystem } = {}) {
  const patterns = ALLOWED_TARGET_PATTERNS[targetSystem];
  if (!patterns) {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_SYSTEM", "Unsupported SSO target system.");
  }

  if (rawPath === undefined || rawPath === null || rawPath === "") {
    return DEFAULT_TARGET_PATH[targetSystem];
  }
  if (typeof rawPath !== "string") {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path must be a string.");
  }

  const trimmed = rawPath.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.length > 300) {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path must be a safe relative path.");
  }
  if (/[\u0000-\u0020\u007f]/.test(trimmed)) {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path contains disallowed whitespace or control characters.");
  }

  const lower = trimmed.toLowerCase();
  if (FORBIDDEN_PATH_TOKENS.some((token) => lower.includes(token)) || FORBIDDEN_SCHEME_RE.test(trimmed)) {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path is outside the allowlist.");
  }

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path encoding is invalid.");
  }
  const decodedLower = decoded.toLowerCase();
  if (
    !decoded.startsWith("/")
    || FORBIDDEN_PATH_TOKENS.some((token) => decodedLower.includes(token))
    || FORBIDDEN_SCHEME_RE.test(decoded)
    || /[\u0000-\u0020\u007f]/.test(decoded)
  ) {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path is outside the allowlist.");
  }

  if (!patterns.some((pattern) => pattern.test(trimmed)) || !patterns.some((pattern) => pattern.test(decoded))) {
    throw new SsoPolicyError(400, "INVALID_SSO_TARGET_PATH", "SSO target_path is not an approved destination.");
  }

  return trimmed;
}

export function normalizeWebBaseUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
  try {
    const parsed = new URL(rawUrl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return "";
  }
}

export function buildSsoCallbackUrl({ webBaseUrl, code, state }) {
  const base = normalizeWebBaseUrl(webBaseUrl);
  if (!base) {
    throw new SsoPolicyError(503, "SSO_TARGET_WEB_URL_MISSING", "Target SSO web base URL is not configured.");
  }
  if (!code || !state) {
    throw new SsoPolicyError(500, "SSO_TOKEN_BUILD_FAILED", "SSO code and state are required.");
  }
  // Fragment delivery prevents short-lived SSO codes from leaking into HTTP access logs or Referer headers.
  return `${base}/sso/callback#code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
}

export function generateOpaqueSsoCode(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function generateSsoNonce(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashSsoToken(raw) {
  return crypto.createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
}

export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
