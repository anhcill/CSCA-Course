import {
  beginTeacherBiometricRegistration,
  beginTeacherBiometricSelfTest,
  beginTeacherSessionBiometric,
  verifyTeacherBiometricRegistration,
  verifyTeacherBiometricSelfTest,
  verifyTeacherSessionBiometric,
} from "../../api/teacherFaceAttendanceClient";

export const isDeviceBiometricsSupported = () =>
  typeof window !== "undefined"
  && Boolean(window.PublicKeyCredential)
  && Boolean(navigator?.credentials?.create)
  && Boolean(navigator?.credentials?.get);

/**
 * Detects whether the current device uses Apple Face ID vs Fingerprint / Touch ID / Windows Hello.
 * - Every Face ID iPhone (X -> 17 Pro Max) has screen max dimension >= 812pt; Touch ID iPhones (SE/6/7/8) are <= 736pt.
 * - Android, Mac Touch ID, and Windows default to Fingerprint icon & native label.
 */
export const detectDeviceBiometricInfo = () => {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { kind: "fingerprint", label: "Vân tay", shortLabel: "Vân tay" };
  }
  const ua = navigator.userAgent || "";
  const w = window.screen?.width || window.innerWidth || 0;
  const h = window.screen?.height || window.innerHeight || 0;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h) || 1;
  const aspectRatio = maxDim / minDim;
  const isTouchMac = navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  const isIPhone = /iPhone/i.test(ua) || (isTouchMac && minDim <= 500);
  const isIPad = /iPad/i.test(ua) || (isTouchMac && minDim > 500);

  // Every Face ID iPhone has >=812pt OR >=2.0 tall aspect ratio (even with iOS Display Zoom on).
  if ((isIPhone && (maxDim >= 812 || aspectRatio >= 2.0)) || (isIPad && maxDim >= 1180)) {
    return { kind: "face_id", label: "Face ID", shortLabel: "Face ID" };
  }
  if (isIPhone || isIPad || /Macintosh|Mac OS X/i.test(ua)) {
    return { kind: "fingerprint", label: "Touch ID", shortLabel: "Touch ID" };
  }
  if (/Android/i.test(ua)) {
    return { kind: "fingerprint", label: "Vân tay", shortLabel: "Vân tay" };
  }
  if (/Windows/i.test(ua)) {
    return { kind: "fingerprint", label: "Windows Hello", shortLabel: "Vân tay" };
  }
  return { kind: "fingerprint", label: "Vân tay", shortLabel: "Vân tay" };
};

const base64UrlToUint8Array = (base64url) => {
  const str = String(base64url || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const binary = window.atob(str + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bufferToBase64Url = (buffer) => {
  if (!buffer) return "";
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const mapWebAuthnError = (error) => {
  if (!error) return new Error("Xác thực sinh trắc học thất bại.");
  if (error.name === "NotAllowedError") {
    return new Error("Đã hủy hoặc hết thời gian quét Face ID / Vân tay.");
  }
  if (error.name === "InvalidStateError") {
    return new Error("Thiết bị này đã đăng ký Face ID / Vân tay rồi.");
  }
  if (error.name === "SecurityError") {
    return new Error("Trình duyệt yêu cầu HTTPS để dùng Face ID / Vân tay.");
  }
  if (error.name === "NotSupportedError") {
    return new Error("Thiết bị hoặc trình duyệt này chưa bật Face ID / Vân tay.");
  }
  return error instanceof Error ? error : new Error(String(error));
};

export const registerDeviceBiometrics = async ({ deviceLabel = "" } = {}) => {
  if (!isDeviceBiometricsSupported()) {
    throw new Error("Trình duyệt không hỗ trợ Face ID / Vân tay thiết bị.");
  }

  const startRes = await beginTeacherBiometricRegistration();
  const { challengeToken, publicKey } = startRes?.data || {};
  if (!challengeToken || !publicKey) {
    throw new Error("Không nhận được cấu hình đăng ký từ máy chủ.");
  }

  const creationOptions = {
    ...publicKey,
    challenge: base64UrlToUint8Array(publicKey.challenge),
    user: {
      ...publicKey.user,
      id: base64UrlToUint8Array(publicKey.user.id),
    },
    excludeCredentials: (publicKey.excludeCredentials || []).map((item) => ({
      ...item,
      id: base64UrlToUint8Array(item.id),
    })),
  };

  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey: creationOptions });
  } catch (err) {
    throw mapWebAuthnError(err);
  }

  if (!credential || !credential.response) {
    throw new Error("Không nhận được phản hồi sinh trắc học từ thiết bị.");
  }

  const response = credential.response;
  const spkiBuffer = typeof response.getPublicKey === "function" ? response.getPublicKey() : null;
  if (!spkiBuffer) {
    throw new Error("Trình duyệt chưa hỗ trợ xuất khóa công khai (hãy cập nhật Safari / Chrome mới nhất).");
  }

  const authDataBuffer = typeof response.getAuthenticatorData === "function"
    ? response.getAuthenticatorData()
    : null;

  const res = await verifyTeacherBiometricRegistration({
    challengeToken,
    credentialId: bufferToBase64Url(credential.rawId),
    clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    authenticatorData: authDataBuffer ? bufferToBase64Url(authDataBuffer) : null,
    publicKeySpki: bufferToBase64Url(spkiBuffer),
    publicKeyAlg: typeof response.getPublicKeyAlgorithm === "function" ? response.getPublicKeyAlgorithm() : -7,
    transports: typeof response.getTransports === "function" ? response.getTransports() : ["internal"],
    deviceLabel,
  });

  window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
  return res;
};

const runAssertion = async ({ challengeToken, publicKey }) => {
  const requestOptions = {
    ...publicKey,
    challenge: base64UrlToUint8Array(publicKey.challenge),
    allowCredentials: (publicKey.allowCredentials || []).map((item) => ({
      ...item,
      id: base64UrlToUint8Array(item.id),
    })),
  };

  let assertion;
  try {
    assertion = await navigator.credentials.get({ publicKey: requestOptions });
  } catch (err) {
    throw mapWebAuthnError(err);
  }

  if (!assertion || !assertion.response) {
    throw new Error("Không nhận được xác nhận Face ID / Vân tay.");
  }

  return {
    challengeToken,
    credentialId: bufferToBase64Url(assertion.rawId),
    clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
    authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
    signature: bufferToBase64Url(assertion.response.signature),
  };
};

export const testDeviceBiometrics = async () => {
  if (!isDeviceBiometricsSupported()) {
    throw new Error("Trình duyệt không hỗ trợ Face ID / Vân tay thiết bị.");
  }
  const startRes = await beginTeacherBiometricSelfTest();
  const payload = await runAssertion(startRes?.data || {});
  return verifyTeacherBiometricSelfTest(payload);
};

export const checkInOrOutWithDeviceBiometrics = async ({ sessionId, type }) => {
  if (!isDeviceBiometricsSupported()) {
    throw new Error("Trình duyệt không hỗ trợ Face ID / Vân tay thiết bị.");
  }
  const startRes = await beginTeacherSessionBiometric(sessionId, type);
  const payload = await runAssertion(startRes?.data || {});
  const res = await verifyTeacherSessionBiometric(sessionId, {
    ...payload,
    type,
  });
  window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated", { detail: res?.data }));
  return res;
};
