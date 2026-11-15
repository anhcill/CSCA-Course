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

export const DEFAULT_BROWSER_TX_TTL_SECONDS = 180;
const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;
const SSO_STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function generatePkceVerifier(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function computePkceChallengeS256(verifier) {
  return crypto.createHash("sha256").update(String(verifier || ""), "utf8").digest("base64url");
}

export function validatePkceChallenge(challenge, method = "S256") {
  const normalizedMethod = String(method || "").trim().toUpperCase();
  if (normalizedMethod !== "S256") {
    throw new SsoPolicyError(400, "SSO_PKCE_METHOD_INVALID", "Only PKCE S256 is permitted.");
  }
  const trimmed = typeof challenge === "string" ? challenge.trim() : "";
  if (!PKCE_CHALLENGE_RE.test(trimmed)) {
    throw new SsoPolicyError(400, "SSO_PKCE_CHALLENGE_INVALID", "Valid PKCE code_challenge is required.");
  }
  return trimmed;
}

export function verifyPkceVerifierS256(verifier, expectedChallenge) {
  if (typeof verifier !== "string" || !PKCE_VERIFIER_RE.test(verifier)) return false;
  if (typeof expectedChallenge !== "string" || !PKCE_CHALLENGE_RE.test(expectedChallenge)) return false;
  return constantTimeEqual(computePkceChallengeS256(verifier), expectedChallenge);
}

export function validateSsoStateParam(state) {
  const trimmed = typeof state === "string" ? state.trim() : "";
  if (!SSO_STATE_RE.test(trimmed)) {
    throw new SsoPolicyError(400, "SSO_STATE_INVALID", "Valid unpredictable SSO state parameter is required.");
  }
  return trimmed;
}

export function buildSsoStartUrl({ webBaseUrl, targetPath = null, courseId = null, offeringId = null } = {}) {
  const base = normalizeWebBaseUrl(webBaseUrl);
  if (!base) {
    throw new SsoPolicyError(503, "SSO_TARGET_WEB_URL_MISSING", "Target SSO web base URL is not configured.");
  }
  const url = new URL(`${base}/sso/start`);
  if (targetPath) url.searchParams.set("target_path", targetPath);
  if (courseId != null && courseId !== "") url.searchParams.set("course_id", String(courseId));
  if (offeringId) url.searchParams.set("offering_id", String(offeringId));
  return url.toString();
}

export function buildSsoAuthorizeUrl({
  webBaseUrl,
  targetSystem,
  state,
  codeChallenge,
  codeChallengeMethod = "S256",
  targetPath = null,
  courseId = null,
  offeringId = null,
} = {}) {
  const base = normalizeWebBaseUrl(webBaseUrl);
  if (!base) {
    throw new SsoPolicyError(503, "SSO_TARGET_WEB_URL_MISSING", "Source SSO web base URL is not configured.");
  }
  const url = new URL(`${base}/sso/authorize`);
  if (targetSystem) url.searchParams.set("dest", targetSystem);
  url.searchParams.set("state", validateSsoStateParam(state));
  url.searchParams.set("code_challenge", validatePkceChallenge(codeChallenge, codeChallengeMethod));
  url.searchParams.set("code_challenge_method", "S256");
  if (targetPath) url.searchParams.set("target_path", targetPath);
  if (courseId != null && courseId !== "") url.searchParams.set("course_id", String(courseId));
  if (offeringId) url.searchParams.set("offering_id", String(offeringId));
  return url.toString();
}

export function parseCookieHeader(header) {
  const out = Object.create(null);
  if (typeof header !== "string" || !header.trim()) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(val);
    } catch {
      out[name] = val;
    }
  }
  return out;
}

export function readSsoCookie(req, name) {
  if (!req || !name) return null;
  if (req.cookies && typeof req.cookies[name] === "string" && req.cookies[name]) {
    return req.cookies[name];
  }
  const raw = req.headers?.cookie || (typeof req.get === "function" ? req.get("cookie") : null);
  const parsed = parseCookieHeader(raw);
  return typeof parsed[name] === "string" && parsed[name] ? parsed[name] : null;
}

export function shouldUseSecureSsoCookie(req, env = process.env) {
  if (env?.SSO_COOKIE_SECURE === "false") return false;
  if (env?.SSO_COOKIE_SECURE === "true" || env?.NODE_ENV === "production") return true;
  if (req?.secure) return true;
  const proto = typeof req?.get === "function"
    ? req.get("x-forwarded-proto")
    : req?.headers?.["x-forwarded-proto"];
  return String(proto || "").split(",")[0].trim().toLowerCase() === "https";
}

function appendSetCookieHeader(res, cookieStr) {
  if (!res || typeof res.setHeader !== "function") return;
  const prev = typeof res.getHeader === "function" ? res.getHeader("Set-Cookie") : null;
  const next = Array.isArray(prev) ? [...prev, cookieStr] : prev ? [String(prev), cookieStr] : [cookieStr];
  res.setHeader("Set-Cookie", next);
}

export function setSsoBrowserCookie(res, { name, value, maxAgeSeconds, path = "/api/auth/sso", secure = false }) {
  const maxAge = Math.max(0, Math.floor(Number(maxAgeSeconds) || 0));
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  appendSetCookieHeader(res, parts.join("; "));
}

export function clearSsoBrowserCookie(res, { name, path = "/api/auth/sso", secure = false }) {
  const parts = [
    `${name}=`,
    `Path=${path}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  appendSetCookieHeader(res, parts.join("; "));
}
