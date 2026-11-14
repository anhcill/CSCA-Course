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

async function ssoPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
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

export function consumeSsoCode({ code, state }) {
  return ssoPost("/api/auth/sso/consume", { code, state });
}

export function confirmSsoSafeLink({ linkToken, password = null }) {
  return ssoPost("/api/auth/sso/link/confirm", {
    linkToken,
    ...(password ? { password } : {}),
  });
}

export function launchMolySso({ targetPath = "/khoa-hoc" } = {}) {
  return ssoPost("/api/auth/sso/moly/launch", { targetPath });
}
