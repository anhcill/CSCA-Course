export class SsoApiError extends Error {
  constructor(message, { status = 0, code = "SSO_ERROR", data = null, devices = null } = {}) {
    super(message);
    this.name = "SsoApiError";
    this.status = status;
    this.code = code;
    this.data = data;
    this.devices = Array.isArray(devices) ? devices : [];
  }
}

export function isSafeRelativeRedirectPath(path) {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("..")) {
    return false;
  }
  return !/[\u0000-\u0020\u007f]/.test(trimmed);
}

let cachedStrictModeParams = null;

export function extractAndStripSsoParams() {
  if (typeof window === "undefined") return null;
  const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const queryParams = new URLSearchParams(window.location.search);

  const code = (hashParams.get("code") || queryParams.get("code") || "").trim();
  const state = (hashParams.get("state") || queryParams.get("state") || "").trim();

  if (window.location.hash || window.location.search) {
    window.history.replaceState(null, "", window.location.pathname);
  }

  if (code && state) {
    cachedStrictModeParams = {
      pathname: window.location.pathname,
      code,
      state,
      expiresAt: Date.now() + 3000,
    };
    return { code, state };
  }

  if (
    cachedStrictModeParams
    && cachedStrictModeParams.pathname === window.location.pathname
    && cachedStrictModeParams.expiresAt > Date.now()
  ) {
    return {
      code: cachedStrictModeParams.code,
      state: cachedStrictModeParams.state,
    };
  }

  return null;
}

const CSCA_PENDING_LINK_STORAGE_KEY = "csca_sso_pending_link";

export function savePendingSafeLink(state) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CSCA_PENDING_LINK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function loadPendingSafeLink() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CSCA_PENDING_LINK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.linkToken !== "string" || !parsed.linkToken.trim()) return null;
    return {
      linkToken: parsed.linkToken.trim(),
      email: typeof parsed.email === "string" ? parsed.email : "",
      hasPassword: Boolean(parsed.hasPassword),
      targetPath: isSafeRelativeRedirectPath(parsed.targetPath) ? parsed.targetPath : "/lms/dashboard",
    };
  } catch {
    return null;
  }
}

export function clearPendingSafeLink() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CSCA_PENDING_LINK_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

async function ssoRequest(path, { method = "POST", payload = undefined } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const code = body?.code || body?.errorCode || "SSO_ERROR";
    const message = body?.message || body?.error || "Không thể hoàn thành đăng nhập SSO.";
    throw new SsoApiError(message, {
      status: response.status,
      code,
      data: body,
      devices: body?.details?.devices || body?.devices || [],
    });
  }
  return body?.data ?? body;
}

export function startIncomingMolySso({ targetPath = null, courseId = null, offeringId = null } = {}) {
  return ssoRequest("/api/auth/sso/moly/start", {
    method: "POST",
    payload: { targetPath, courseId, offeringId },
  });
}

export function intentMolySso({ targetPath = "/khoa-hoc", scopeType = "account", scopedLocalCourseId = null, scopedExternalCourseId = null } = {}) {
  return ssoRequest("/api/auth/sso/moly/intent", {
    method: "POST",
    payload: { targetPath, scopeType, scopedLocalCourseId, scopedExternalCourseId },
  });
}

export function authorizeMolySso({
  state,
  codeChallenge,
  codeChallengeMethod = "S256",
  targetPath = "/khoa-hoc",
  scopeType = "account",
  scopedLocalCourseId = null,
  scopedExternalCourseId = null,
}) {
  return ssoRequest("/api/auth/sso/moly/authorize", {
    method: "POST",
    payload: {
      state,
      codeChallenge,
      codeChallengeMethod,
      targetPath,
      scopeType,
      scopedLocalCourseId,
      scopedExternalCourseId,
    },
  });
}

export function consumeSsoCode({ code, state }) {
  return ssoRequest("/api/auth/sso/consume", { method: "POST", payload: { code, state } });
}

export function getSsoSafeLinkStatus() {
  return ssoRequest("/api/auth/sso/link/status", { method: "GET" });
}

export function confirmSsoSafeLink({ linkToken, password = null }) {
  return ssoRequest("/api/auth/sso/link/confirm", {
    method: "POST",
    payload: {
      linkToken,
      ...(password ? { password } : {}),
    },
  });
}
