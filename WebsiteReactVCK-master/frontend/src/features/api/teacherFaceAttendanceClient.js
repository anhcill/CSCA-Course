import axios from "axios";

const BASE_URL = "/api/teacher-face-attendance";

const unwrap = (promise) =>
  promise
    .then((res) => res.data)
    .catch((error) => {
      const msg = error?.response?.data?.message || error?.message || "Không thể kết nối máy chủ";
      const err = new Error(msg);
      err.status = error?.response?.status;
      err.code = error?.response?.data?.errorCode;
      throw err;
    });

export const fetchTeacherFaceStatus = () =>
  unwrap(axios.get(`${BASE_URL}/status`, { withCredentials: true }));

export const fetchTeacherTodaySmartAttendance = () =>
  unwrap(axios.get(`${BASE_URL}/today`, { withCredentials: true }));

export const submitTeacherFaceEnrollment = ({ blob, consentAccepted }) => {
  const formData = new FormData();
  formData.append("photo", blob, "face-enrollment.jpg");
  formData.append("consentAccepted", consentAccepted ? "true" : "false");
  return unwrap(
    axios.post(`${BASE_URL}/enrollment`, formData, {
      withCredentials: true,
      headers: { "Content-Type": "multipart/form-data" },
    }),
  );
};

export const fetchTeacherSessionFaceState = (sessionId) =>
  unwrap(axios.get(`${BASE_URL}/sessions/${sessionId}`, { withCredentials: true }));

export const createTeacherSessionFaceLiveness = (sessionId, type) =>
  unwrap(
    axios.post(
      `${BASE_URL}/sessions/${sessionId}/liveness-session`,
      { type },
      { withCredentials: true },
    ),
  );

export const verifyTeacherSessionFace = ({
  sessionId,
  type,
  livenessSessionId = null,
  manualFallback = false,
  snapshotBlob = null,
  challengeSnapshotBlob = null,
}) => {
  const formData = new FormData();
  formData.append("type", type);
  if (livenessSessionId) formData.append("livenessSessionId", livenessSessionId);
  formData.append("manualFallback", manualFallback ? "true" : "false");
  if (snapshotBlob) {
    formData.append("snapshot", snapshotBlob, `${type}-snapshot.jpg`);
  }
  if (challengeSnapshotBlob) {
    formData.append("challengeSnapshot", challengeSnapshotBlob, `${type}-challenge.jpg`);
  }
  return unwrap(
    axios.post(`${BASE_URL}/sessions/${sessionId}/verify`, formData, {
      withCredentials: true,
      headers: { "Content-Type": "multipart/form-data" },
    }),
  );
};

export const fetchAdminTeacherFaceEnrollments = () =>
  unwrap(axios.get(`${BASE_URL}/admin/enrollments`, { withCredentials: true }));

export const reviewAdminTeacherFaceEnrollment = (teacherId, { action, note = "" }) =>
  unwrap(
    axios.patch(
      `${BASE_URL}/admin/enrollments/${teacherId}`,
      { action, note },
      { withCredentials: true },
    ),
  );

export const overrideAdminSessionFaceAttendance = (sessionId, teacherId, { decision, note = "" }) =>
  unwrap(
    axios.patch(
      `${BASE_URL}/admin/sessions/${sessionId}/teachers/${teacherId}/override`,
      { decision, note },
      { withCredentials: true },
    ),
  );

export const startAdminFaceSelfTest = () =>
  unwrap(axios.post(`${BASE_URL}/admin/self-test/session`, {}, { withCredentials: true }));

export const verifyAdminFaceSelfTest = ({
  livenessSessionId = null,
  snapshotBlob = null,
  challengeSnapshotBlob = null,
  compareTeacherId = null,
}) => {
  const formData = new FormData();
  if (livenessSessionId) formData.append("livenessSessionId", livenessSessionId);
  if (compareTeacherId) formData.append("compareTeacherId", String(compareTeacherId));
  if (snapshotBlob) formData.append("snapshot", snapshotBlob, "admin-test-straight.jpg");
  if (challengeSnapshotBlob) formData.append("challengeSnapshot", challengeSnapshotBlob, "admin-test-challenge.jpg");
  return unwrap(
    axios.post(`${BASE_URL}/admin/self-test/verify`, formData, {
      withCredentials: true,
      headers: { "Content-Type": "multipart/form-data" },
    }),
  );
};

// Device-native WebAuthn Biometrics (Face ID / Touch ID / Android Fingerprint / Windows Hello)
export const beginTeacherBiometricRegistration = () =>
  unwrap(axios.post(`${BASE_URL}/biometrics/register/options`, {}, { withCredentials: true }));

export const verifyTeacherBiometricRegistration = (payload) =>
  unwrap(axios.post(`${BASE_URL}/biometrics/register/verify`, payload, { withCredentials: true }));

export const deleteTeacherBiometricCredential = (credentialRowId) =>
  unwrap(axios.delete(`${BASE_URL}/biometrics/${credentialRowId}`, { withCredentials: true }));

export const beginTeacherBiometricSelfTest = () =>
  unwrap(axios.post(`${BASE_URL}/biometrics/test/options`, {}, { withCredentials: true }));

export const verifyTeacherBiometricSelfTest = (payload) =>
  unwrap(axios.post(`${BASE_URL}/biometrics/test/verify`, payload, { withCredentials: true }));

export const beginTeacherSessionBiometric = (sessionId, type) =>
  unwrap(axios.post(`${BASE_URL}/sessions/${sessionId}/biometric/options`, { type }, { withCredentials: true }));

export const verifyTeacherSessionBiometric = (sessionId, payload) =>
  unwrap(axios.post(`${BASE_URL}/sessions/${sessionId}/biometric/verify`, payload, { withCredentials: true }));
