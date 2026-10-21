export class AccountSecurityApiError extends Error {
  constructor(message, { status = 0, errorCode = "UNKNOWN_ERROR", details = null } = {}) {
    super(message);
    this.name = "AccountSecurityApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

const request = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("csca:session-expired"));
    }
    throw new AccountSecurityApiError(body?.message || "Không thể hoàn thành yêu cầu bảo mật", {
      status: response.status,
      errorCode: body?.errorCode,
      details: body?.details,
    });
  }

  return body;
};

export const fetchMyTrustedDevices = () => request("/api/auth/me/devices");

export const fetchAdminTrustedDevices = (userId) => (
  request(`/api/admin/users/${encodeURIComponent(userId)}/devices`)
);

export const removeAdminTrustedDevice = (userId, deviceId) => (
  request(`/api/admin/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  })
);
