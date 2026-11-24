import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { query as defaultQuery } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";
import {
  compareFaces,
  createFaceLivenessSession,
  detectSingleClearFace,
  getFaceLivenessSessionResults,
  getPublicAwsRekognitionStatus,
  verifyActiveChallengeToken,
  verifyActiveChallengeWithAws,
} from "./awsRekognition.service.js";
import {
  downloadPrivateR2Buffer,
  generateImagePlaybackSignedUrl,
  isR2Configured,
  uploadPrivateR2Buffer,
} from "./video.service.js";
import {
  beginTeacherBiometricAssertion,
  listTeacherBiometricCredentials,
  verifyTeacherBiometricAssertion,
} from "./teacherDeviceBiometrics.service.js";

export const CHECK_IN_EARLY_WINDOW_MINUTES = 30;
export const CHECK_IN_LATE_GRACE_MINUTES = 10;
export const CHECK_OUT_EARLY_GRACE_MINUTES = 10;
export const CHECK_OUT_POST_SESSION_WINDOW_MINUTES = 90;

const VALID_CHECK_IN_STATUSES = new Set(["on_time", "late", "approved_manual"]);
const VALID_CHECK_OUT_STATUSES = new Set(["on_time", "early_leave", "approved_manual"]);

const LOCAL_FACE_DIR = path.resolve("tmp", "teacher-face-dev");

const makeError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

/**
 * Pure Cách 1 payroll eligibility check:
 * - Admin override 'approved' => true
 * - Admin override 'rejected' => false
 * - Otherwise requires BOTH valid check-in AND valid check-out.
 */
export const computePayrollEligibility = (row) => {
  if (!row) return false;
  if (row.admin_override_status === "approved") return true;
  if (row.admin_override_status === "rejected") return false;
  return Boolean(
    row.check_in_at
      && VALID_CHECK_IN_STATUSES.has(row.check_in_status)
      && row.check_out_at
      && VALID_CHECK_OUT_STATUSES.has(row.check_out_status),
  );
};

export const evaluateTeacherCheckInPolicy = ({
  startTime,
  endTime,
  status,
  now = new Date(),
  existingAttendance = null,
} = {}) => {
  const current = new Date(now).getTime();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const validTimes = Number.isFinite(current) && Number.isFinite(start) && Number.isFinite(end) && end > start;

  if (status === "cancelled") {
    return { canCheckIn: false, isLate: false, lateMinutes: 0, reason: "Buổi học đã bị hủy." };
  }

  if (existingAttendance?.check_in_at && existingAttendance.check_in_status !== "rejected") {
    return { canCheckIn: false, isLate: false, lateMinutes: existingAttendance.late_minutes || 0, reason: "Bạn đã chấm công Vào cho buổi học này." };
  }

  if (!validTimes) {
    return { canCheckIn: false, isLate: false, lateMinutes: 0, reason: "Buổi học chưa có khung giờ hợp lệ." };
  }

  const openAt = start - CHECK_IN_EARLY_WINDOW_MINUTES * 60 * 1000;
  if (current < openAt) {
    return {
      canCheckIn: false,
      isLate: false,
      lateMinutes: 0,
      opensAt: new Date(openAt).toISOString(),
      reason: `Chỉ được chấm công Vào từ ${CHECK_IN_EARLY_WINDOW_MINUTES} phút trước giờ bắt đầu buổi học.`,
    };
  }

  if (current > end) {
    return {
      canCheckIn: false,
      isLate: false,
      lateMinutes: 0,
      reason: "Đã quá giờ kết thúc buổi học. Vui lòng liên hệ Admin để duyệt bổ sung.",
    };
  }

  const minutesAfterStart = Math.floor((current - start) / 60000);
  const isLate = minutesAfterStart > CHECK_IN_LATE_GRACE_MINUTES;
  const lateMinutes = isLate ? minutesAfterStart : 0;

  return {
    canCheckIn: true,
    isLate,
    lateMinutes,
    reason: null,
  };
};

export const evaluateTeacherCheckOutPolicy = ({
  startTime,
  endTime,
  status,
  now = new Date(),
  existingAttendance = null,
} = {}) => {
  const current = new Date(now).getTime();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const validTimes = Number.isFinite(current) && Number.isFinite(start) && Number.isFinite(end) && end > start;

  if (status === "cancelled") {
    return { canCheckOut: false, isEarlyLeave: false, earlyLeaveMinutes: 0, reason: "Buổi học đã bị hủy." };
  }

  if (!existingAttendance?.check_in_at || existingAttendance.check_in_status === "rejected") {
    return { canCheckOut: false, isEarlyLeave: false, earlyLeaveMinutes: 0, reason: "Bạn cần chấm công Vào trước khi chấm công Ra." };
  }

  if (existingAttendance?.check_out_at && existingAttendance.check_out_status !== "rejected") {
    return { canCheckOut: false, isEarlyLeave: false, earlyLeaveMinutes: existingAttendance.early_leave_minutes || 0, reason: "Bạn đã chấm công Ra cho buổi học này." };
  }

  if (!validTimes) {
    return { canCheckOut: false, isEarlyLeave: false, earlyLeaveMinutes: 0, reason: "Buổi học chưa có khung giờ hợp lệ." };
  }

  const closeAt = end + CHECK_OUT_POST_SESSION_WINDOW_MINUTES * 60 * 1000;
  if (current > closeAt) {
    return {
      canCheckOut: false,
      isEarlyLeave: false,
      earlyLeaveMinutes: 0,
      reason: `Đã quá hạn chấm công Ra (${CHECK_OUT_POST_SESSION_WINDOW_MINUTES} phút sau giờ kết thúc). Vui lòng liên hệ Admin duyệt tay.`,
    };
  }

  const minutesBeforeEnd = Math.floor((end - current) / 60000);
  const isEarlyLeave = minutesBeforeEnd > CHECK_OUT_EARLY_GRACE_MINUTES;
  const earlyLeaveMinutes = isEarlyLeave ? minutesBeforeEnd : 0;

  return {
    canCheckOut: true,
    isEarlyLeave,
    earlyLeaveMinutes,
    closesAt: new Date(closeAt).toISOString(),
    reason: null,
  };
};

/**
 * Picks the smartest active session/action for a teacher's one-tap PWA check-in card.
 * Priority:
 * 1) Session currently checked-in and ready for Check-Out (prefer ones at/past end_time, then earliest end_time)
 * 2) Session currently open for Check-In (earliest start_time)
 * 3) Next upcoming session today (showing exact opensAt time)
 */
export const pickRecommendedSmartAttendanceAction = (items = [], now = new Date()) => {
  const nowMs = new Date(now).getTime();

  const checkOutCandidates = items
    .filter((item) => item.policies?.checkOut?.canCheckOut)
    .sort((a, b) => {
      const aEnded = new Date(a.endTime).getTime() <= nowMs ? 0 : 1;
      const bEnded = new Date(b.endTime).getTime() <= nowMs ? 0 : 1;
      if (aEnded !== bEnded) return aEnded - bEnded;
      return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
    });

  if (checkOutCandidates.length > 0) {
    return {
      actionType: "check_out",
      readyNow: true,
      session: checkOutCandidates[0],
    };
  }

  const checkInCandidates = items
    .filter((item) => item.policies?.checkIn?.canCheckIn)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (checkInCandidates.length > 0) {
    return {
      actionType: "check_in",
      readyNow: true,
      session: checkInCandidates[0],
    };
  }

  const upcomingCandidates = items
    .filter((item) => !item.attendance?.checkInAt && item.policies?.checkIn?.opensAt)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (upcomingCandidates.length > 0) {
    return {
      actionType: "upcoming",
      readyNow: false,
      opensAt: upcomingCandidates[0].policies.checkIn.opensAt,
      session: upcomingCandidates[0],
    };
  }

  if (items.length > 0) {
    const allCompleted = items.every(
      (item) => Boolean(item.attendance?.payrollEligible) || Boolean(item.attendance?.checkOutAt),
    );
    return {
      actionType: allCompleted ? "completed_today" : "review_today",
      readyNow: false,
      session: items[0],
    };
  }

  return {
    actionType: "no_sessions_today",
    readyNow: false,
    session: null,
  };
};

// ---------------------------------------------------------------------------
// Private face image storage helpers (Cloudflare R2 + safe local dev fallback)
// ---------------------------------------------------------------------------
const buildFaceKey = (prefix, ownerId, suffix = "img") => (
  `teacher-face/${prefix}/${ownerId}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${suffix}.jpg`
);

export const savePrivateFaceImage = async ({ key, buffer, mimeType = "image/jpeg" }) => {
  if (isR2Configured()) {
    await uploadPrivateR2Buffer({ r2Key: key, buffer, mimeType });
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw makeError(503, "Kho lưu trữ ảnh Cloudflare R2 chưa được cấu hình.", "R2_NOT_CONFIGURED");
  }

  const localKey = `local://${key}`;
  const fullPath = path.join(LOCAL_FACE_DIR, key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return localKey;
};

export const loadPrivateFaceImage = async (storedKey) => {
  if (!storedKey) {
    throw makeError(404, "Không tìm thấy ảnh khuôn mặt gốc.", "FACE_IMAGE_NOT_FOUND");
  }
  if (storedKey.startsWith("local://")) {
    const rel = storedKey.slice("local://".length);
    if (rel.includes("..")) throw makeError(400, "Đường dẫn ảnh không hợp lệ.", "INVALID_KEY");
    const fullPath = path.join(LOCAL_FACE_DIR, rel);
    return fs.readFile(fullPath);
  }
  return downloadPrivateR2Buffer({ r2Key: storedKey });
};

export const getPrivateFacePreviewUrl = async (storedKey, { ttlSeconds = 900 } = {}) => {
  if (!storedKey) return null;
  if (storedKey.startsWith("local://")) {
    const rel = storedKey.slice("local://".length);
    return `/api/teacher-face-attendance/local-preview?key=${encodeURIComponent(rel)}`;
  }
  if (!isR2Configured()) return null;
  try {
    const signed = await generateImagePlaybackSignedUrl({
      r2Key: storedKey,
      expiresInSeconds: ttlSeconds,
    });
    return signed.downloadUrl;
  } catch {
    return null;
  }
};

export const readLocalFacePreviewBuffer = async (relativeKey) => {
  if (
    typeof relativeKey !== "string"
    || !relativeKey.startsWith("teacher-face/")
    || relativeKey.includes("..")
    || relativeKey.includes("\\")
  ) {
    throw makeError(400, "Khóa ảnh không hợp lệ", "INVALID_KEY");
  }
  const fullPath = path.join(LOCAL_FACE_DIR, relativeKey);
  return fs.readFile(fullPath);
};

// ---------------------------------------------------------------------------
// Enrollment workflows
// ---------------------------------------------------------------------------
const serializeEnrollment = async (row) => {
  if (!row) return null;
  return {
    id: Number(row.id),
    teacherId: Number(row.teacher_id),
    status: row.status,
    photoUrl: await getPrivateFacePreviewUrl(row.r2_key),
    consentAcceptedAt: row.consent_accepted_at,
    livenessConfidence: row.liveness_confidence !== null && row.liveness_confidence !== undefined
      ? Number(row.liveness_confidence)
      : null,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by ? Number(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note || "",
    updatedAt: row.updated_at,
  };
};

export const getTeacherFaceEnrollment = async (teacherId, db = { query: defaultQuery }) => {
  const result = await db.query(
    `SELECT id, teacher_id, status, r2_key, mime_type, consent_accepted_at,
            liveness_confidence, submitted_at, reviewed_by, reviewed_at, review_note, updated_at
     FROM teacher_face_enrollments
     WHERE teacher_id = $1`,
    [teacherId],
  );
  return serializeEnrollment(result.rows[0] || null);
};

export const submitTeacherFaceEnrollment = async ({
  teacherId,
  imageBuffer,
  mimeType = "image/jpeg",
  consentAccepted = false,
  db = { query: defaultQuery },
}) => {
  if (!consentAccepted) {
    throw makeError(422, "Bạn cần xác nhận đồng ý sử dụng ảnh khuôn mặt cho mục đích chấm công giảng dạy.", "CONSENT_REQUIRED");
  }
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw makeError(422, "Vui lòng chụp ảnh khuôn mặt từ camera trực tiếp.", "IMAGE_REQUIRED");
  }
  if (imageBuffer.length > 6 * 1024 * 1024) {
    throw makeError(422, "Ảnh khuôn mặt vượt quá giới hạn 6MB.", "IMAGE_TOO_LARGE");
  }

  const existingRes = await db.query(
    "SELECT id, status FROM teacher_face_enrollments WHERE teacher_id = $1",
    [teacherId],
  );
  const existing = existingRes.rows[0];
  if (existing?.status === "approved") {
    throw makeError(
      409,
      "Khuôn mặt mẫu của bạn đã được Admin duyệt và khóa. Vui lòng liên hệ Admin mở khóa nếu cần đăng ký lại.",
      "ENROLLMENT_LOCKED",
    );
  }

  const detection = await detectSingleClearFace({ imageBytes: imageBuffer });

  const r2Key = await savePrivateFaceImage({
    key: buildFaceKey("enrollments", teacherId, "ref"),
    buffer: imageBuffer,
    mimeType,
  });

  const upsertRes = await db.query(
    `INSERT INTO teacher_face_enrollments (
       teacher_id, status, r2_key, mime_type, consent_accepted_at,
       liveness_confidence, submitted_at, reviewed_by, reviewed_at, review_note, updated_at
     )
     VALUES ($1, 'pending_approval', $2, $3, NOW(), $4, NOW(), NULL, NULL, NULL, NOW())
     ON CONFLICT (teacher_id)
     DO UPDATE SET
       status = 'pending_approval',
       r2_key = EXCLUDED.r2_key,
       mime_type = EXCLUDED.mime_type,
       consent_accepted_at = NOW(),
       liveness_confidence = EXCLUDED.liveness_confidence,
       submitted_at = NOW(),
       reviewed_by = NULL,
       reviewed_at = NULL,
       review_note = NULL,
       updated_at = NOW()
     RETURNING *`,
    [teacherId, r2Key, mimeType, detection.confidence],
  );

  await recordAuditEvent({
    actorId: teacherId,
    action: "teacher.face_enrollment.submitted",
    targetType: "teacher_face_enrollment",
    targetId: String(upsertRes.rows[0].id),
    metadata: { validatedByAws: detection.validatedByAws, confidence: detection.confidence },
  }).catch(() => {});

  return serializeEnrollment(upsertRes.rows[0]);
};

export const listTeacherFaceEnrollmentsForAdmin = async (db = { query: defaultQuery }) => {
  const result = await db.query(
    `SELECT u.id AS teacher_id,
            u.username,
            u.email,
            u.avatar_url,
            COALESCE(sp.full_name, u.username) AS full_name,
            tfe.id AS enrollment_id,
            tfe.status AS enrollment_status,
            tfe.r2_key,
            tfe.consent_accepted_at,
            tfe.liveness_confidence,
            tfe.submitted_at,
            tfe.reviewed_by,
            tfe.reviewed_at,
            tfe.review_note,
            tfe.updated_at
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN teacher_face_enrollments tfe ON tfe.teacher_id = u.id
     WHERE (u.role IN ('creator', 'admin')
       OR EXISTS (SELECT 1 FROM live_classes lc WHERE lc.instructor_id = u.id)
       OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.teacher_id = u.id AND ct.status = 'active'))
     ORDER BY
       CASE tfe.status
         WHEN 'pending_approval' THEN 0
         WHEN 'unlocked' THEN 1
         WHEN 'rejected' THEN 2
         WHEN 'approved' THEN 3
         ELSE 4
       END,
       tfe.updated_at DESC NULLS LAST,
       u.id ASC`,
  );

  return Promise.all(
    result.rows.map(async (row) => ({
      teacherId: Number(row.teacher_id),
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      enrollmentId: row.enrollment_id ? Number(row.enrollment_id) : null,
      status: row.enrollment_status || "not_enrolled",
      photoUrl: row.r2_key ? await getPrivateFacePreviewUrl(row.r2_key) : null,
      submittedAt: row.submitted_at || null,
      reviewedAt: row.reviewed_at || null,
      reviewNote: row.review_note || "",
    })),
  );
};

export const reviewTeacherFaceEnrollment = async ({
  teacherId,
  action,
  reviewNote = "",
  adminId,
  db = { query: defaultQuery },
}) => {
  const statusMap = {
    approve: "approved",
    reject: "rejected",
    unlock: "unlocked",
  };
  const nextStatus = statusMap[action];
  if (!nextStatus) {
    throw makeError(422, "Thao tác duyệt không hợp lệ (chỉ nhận approve, reject hoặc unlock).", "INVALID_ACTION");
  }

  const updateRes = await db.query(
    `UPDATE teacher_face_enrollments
     SET status = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         review_note = $3,
         updated_at = NOW()
     WHERE teacher_id = $4
     RETURNING *`,
    [nextStatus, adminId, String(reviewNote || "").trim() || null, teacherId],
  );

  if (!updateRes.rows[0]) {
    throw makeError(404, "Giảng viên này chưa gửi ảnh đăng ký khuôn mặt.", "ENROLLMENT_NOT_FOUND");
  }

  await recordAuditEvent({
    actorId: adminId,
    action: `admin.teacher_face_enrollment.${action}`,
    targetType: "teacher_face_enrollment",
    targetId: String(updateRes.rows[0].id),
    metadata: { teacherId, nextStatus, reviewNote: String(reviewNote || "").trim() },
  }).catch(() => {});

  return serializeEnrollment(updateRes.rows[0]);
};

// ---------------------------------------------------------------------------
// Session Check-In & Check-Out workflows
// ---------------------------------------------------------------------------
const loadSessionAndVerifyTeacher = async ({ sessionId, teacherId, role, db }) => {
  const sessionRes = await db.query(
    `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
            lc.instructor_id, lc.title AS class_title
     FROM class_sessions cs
     JOIN live_classes lc ON lc.id = cs.live_class_id
     WHERE cs.id = $1`,
    [sessionId],
  );
  const session = sessionRes.rows[0];
  if (!session) {
    throw makeError(404, "Không tìm thấy buổi học.", "SESSION_NOT_FOUND");
  }

  if (role !== "admin" && Number(session.instructor_id) !== Number(teacherId)) {
    const assignRes = await db.query(
      `SELECT 1 FROM class_teachers
       WHERE live_class_id = $1 AND teacher_id = $2
         AND status = 'active' AND teaching_role IN ('lead', 'co_teacher')`,
      [session.live_class_id, teacherId],
    );
    if (assignRes.rows.length === 0) {
      throw makeError(403, "Bạn không được phân công giảng dạy buổi học này.", "FORBIDDEN");
    }
  }

  return session;
};

export const serializeSessionAttendance = async (row, { includePhotoUrls = true } = {}) => {
  if (!row) return null;
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    teacherId: Number(row.teacher_id),
    checkInAt: row.check_in_at || null,
    checkInStatus: row.check_in_status || null,
    lateMinutes: Number(row.late_minutes || 0),
    checkInLivenessScore: row.check_in_liveness_score !== null && row.check_in_liveness_score !== undefined
      ? Number(row.check_in_liveness_score)
      : null,
    checkInFaceSimilarity: row.check_in_face_similarity !== null && row.check_in_face_similarity !== undefined
      ? Number(row.check_in_face_similarity)
      : null,
    checkInProvider: row.check_in_provider || null,
    checkInPhotoUrl: includePhotoUrls && row.check_in_r2_key
      ? await getPrivateFacePreviewUrl(row.check_in_r2_key)
      : null,
    checkOutAt: row.check_out_at || null,
    checkOutStatus: row.check_out_status || null,
    earlyLeaveMinutes: Number(row.early_leave_minutes || 0),
    checkOutLivenessScore: row.check_out_liveness_score !== null && row.check_out_liveness_score !== undefined
      ? Number(row.check_out_liveness_score)
      : null,
    checkOutFaceSimilarity: row.check_out_face_similarity !== null && row.check_out_face_similarity !== undefined
      ? Number(row.check_out_face_similarity)
      : null,
    checkOutProvider: row.check_out_provider || null,
    checkOutPhotoUrl: includePhotoUrls && row.check_out_r2_key
      ? await getPrivateFacePreviewUrl(row.check_out_r2_key)
      : null,
    payrollEligible: Boolean(row.payroll_eligible),
    adminOverrideStatus: row.admin_override_status || null,
    adminOverrideNote: row.admin_override_note || "",
    adminOverrideAt: row.admin_override_at || null,
    updatedAt: row.updated_at || null,
  };
};

export const getTeacherSessionAttendanceState = async ({
  sessionId,
  teacherId,
  role = "creator",
  now = new Date(),
  db = { query: defaultQuery },
}) => {
  const session = await loadSessionAndVerifyTeacher({ sessionId, teacherId, role, db });
  const [enrollment, biometricCredentials, attendanceRes] = await Promise.all([
    getTeacherFaceEnrollment(teacherId, db),
    listTeacherBiometricCredentials(teacherId, db).catch(() => []),
    db.query(
      "SELECT * FROM teacher_session_attendance WHERE session_id = $1 AND teacher_id = $2",
      [sessionId, teacherId],
    ),
  ]);

  const existing = attendanceRes.rows[0] || null;
  const checkInPolicy = evaluateTeacherCheckInPolicy({
    startTime: session.start_time,
    endTime: session.end_time,
    status: session.status,
    now,
    existingAttendance: existing,
  });
  const checkOutPolicy = evaluateTeacherCheckOutPolicy({
    startTime: session.start_time,
    endTime: session.end_time,
    status: session.status,
    now,
    existingAttendance: existing,
  });

  return {
    session: {
      id: Number(session.id),
      liveClassId: Number(session.live_class_id),
      classCode: `LIVE-${session.live_class_id}`,
      title: session.title,
      classTitle: session.class_title,
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
    },
    aws: getPublicAwsRekognitionStatus(),
    enrollment,
    biometricCredentials,
    attendance: await serializeSessionAttendance(existing),
    policies: {
      checkIn: checkInPolicy,
      checkOut: checkOutPolicy,
    },
  };
};

/**
 * Smart attendance dashboard payload: fetches all sessions today (Asia/Ho_Chi_Minh)
 * plus any active post-session check-out window for this teacher, evaluates check-in/out
 * policies, and recommends the active session for 1-tap facial check-in/out.
 */
export const getTeacherTodaySmartAttendance = async ({
  teacherId,
  now = new Date(),
  db = { query: defaultQuery },
}) => {
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const vnToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nowDate);

  // Vietnam is UTC+7 year-round (no DST)
  const dayStartIso = `${vnToday}T00:00:00+07:00`;
  const dayEndIso = `${vnToday}T23:59:59.999+07:00`;
  const checkoutLookbackIso = new Date(
    nowDate.getTime() - CHECK_OUT_POST_SESSION_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const [enrollment, biometricCredentials, sessionsRes] = await Promise.all([
    getTeacherFaceEnrollment(teacherId, db),
    listTeacherBiometricCredentials(teacherId, db).catch(() => []),
    db.query(
      `SELECT cs.id,
              cs.live_class_id,
              cs.title,
              cs.start_time,
              cs.end_time,
              cs.status,
              lc.title AS class_title,
              COALESCE(c.title, c.name) AS course_title,
              tsa.id AS att_id,
              tsa.check_in_at,
              tsa.check_in_status,
              tsa.late_minutes,
              tsa.check_in_liveness_score,
              tsa.check_in_face_similarity,
              tsa.check_in_r2_key,
              tsa.check_in_provider,
              tsa.check_out_at,
              tsa.check_out_status,
              tsa.early_leave_minutes,
              tsa.check_out_liveness_score,
              tsa.check_out_face_similarity,
              tsa.check_out_r2_key,
              tsa.check_out_provider,
              tsa.payroll_eligible,
              tsa.admin_override_status,
              tsa.admin_override_note,
              tsa.admin_override_at,
              tsa.updated_at AS att_updated_at
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       LEFT JOIN courses c ON c.id = lc.course_id
       LEFT JOIN teacher_session_attendance tsa
         ON tsa.session_id = cs.id AND tsa.teacher_id = $1
       WHERE cs.status <> 'cancelled'
         AND lc.status <> 'cancelled'
         AND (
           (lc.instructor_id = $1 AND NOT EXISTS (
             SELECT 1 FROM class_teachers mapping
             WHERE mapping.live_class_id = lc.id AND mapping.teacher_id = $1
           ))
           OR EXISTS (
             SELECT 1 FROM class_teachers ct
             WHERE ct.live_class_id = lc.id AND ct.teacher_id = $1
               AND ct.status = 'active' AND ct.teaching_role IN ('lead', 'co_teacher')
           )
         )
         AND (
           (cs.start_time >= $2::timestamptz AND cs.start_time <= $3::timestamptz)
           OR (tsa.check_in_at IS NOT NULL AND tsa.check_out_at IS NULL AND cs.end_time >= $4::timestamptz)
         )
       ORDER BY cs.start_time ASC, cs.id ASC`,
      [teacherId, dayStartIso, dayEndIso, checkoutLookbackIso],
    ),
  ]);

  const sessions = await Promise.all(
    sessionsRes.rows.map(async (row) => {
      const existingAttendance = row.att_id
        ? {
            id: row.att_id,
            session_id: row.id,
            teacher_id: teacherId,
            check_in_at: row.check_in_at,
            check_in_status: row.check_in_status,
            late_minutes: row.late_minutes,
            check_in_liveness_score: row.check_in_liveness_score,
            check_in_face_similarity: row.check_in_face_similarity,
            check_in_r2_key: row.check_in_r2_key,
            check_in_provider: row.check_in_provider,
            check_out_at: row.check_out_at,
            check_out_status: row.check_out_status,
            early_leave_minutes: row.early_leave_minutes,
            check_out_liveness_score: row.check_out_liveness_score,
            check_out_face_similarity: row.check_out_face_similarity,
            check_out_r2_key: row.check_out_r2_key,
            check_out_provider: row.check_out_provider,
            payroll_eligible: row.payroll_eligible,
            admin_override_status: row.admin_override_status,
            admin_override_note: row.admin_override_note,
            admin_override_at: row.admin_override_at,
            updated_at: row.att_updated_at,
          }
        : null;

      const checkInPolicy = evaluateTeacherCheckInPolicy({
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        now: nowDate,
        existingAttendance,
      });
      const checkOutPolicy = evaluateTeacherCheckOutPolicy({
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        now: nowDate,
        existingAttendance,
      });

      return {
        id: Number(row.id),
        liveClassId: Number(row.live_class_id),
        classCode: `LIVE-${row.live_class_id}`,
        classTitle: row.class_title,
        courseTitle: row.course_title || "Khóa học trực tuyến",
        title: row.title,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        attendance: await serializeSessionAttendance(existingAttendance, { includePhotoUrls: false }),
        policies: {
          checkIn: checkInPolicy,
          checkOut: checkOutPolicy,
        },
      };
    }),
  );

  const recommended = pickRecommendedSmartAttendanceAction(sessions, nowDate);
  const completedTodayCount = sessions.filter(
    (item) => Boolean(item.attendance?.payrollEligible),
  ).length;

  return {
    serverTime: nowIso,
    todayDate: vnToday,
    aws: getPublicAwsRekognitionStatus(),
    enrollment,
    biometricCredentials,
    summary: {
      totalTodaySessions: sessions.length,
      completedTodayCount,
      pendingTodayCount: Math.max(0, sessions.length - completedTodayCount),
    },
    recommended,
    sessions,
  };
};

export const startTeacherSessionFaceLiveness = async ({
  sessionId,
  teacherId,
  role = "creator",
  type,
  now = new Date(),
  db = { query: defaultQuery },
}) => {
  if (type !== "check_in" && type !== "check_out") {
    throw makeError(422, "Loại chấm công phải là check_in hoặc check_out.", "INVALID_TYPE");
  }

  const session = await loadSessionAndVerifyTeacher({ sessionId, teacherId, role, db });

  const enrollmentRes = await db.query(
    "SELECT id, status, r2_key FROM teacher_face_enrollments WHERE teacher_id = $1",
    [teacherId],
  );
  const enrollment = enrollmentRes.rows[0];
  if (!enrollment || enrollment.status !== "approved") {
    throw makeError(
      403,
      "Bạn cần đăng ký ảnh khuôn mặt trong Cài đặt giảng viên và được Admin duyệt khóa trước khi chấm công.",
      "FACE_ENROLLMENT_NOT_APPROVED",
    );
  }

  const attendanceRes = await db.query(
    "SELECT * FROM teacher_session_attendance WHERE session_id = $1 AND teacher_id = $2",
    [sessionId, teacherId],
  );
  const existing = attendanceRes.rows[0] || null;

  if (type === "check_in") {
    const policy = evaluateTeacherCheckInPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckIn) {
      throw makeError(422, policy.reason || "Không thể chấm công Vào lúc này.", "CHECK_IN_NOT_ALLOWED");
    }
  } else {
    const policy = evaluateTeacherCheckOutPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckOut) {
      throw makeError(422, policy.reason || "Không thể chấm công Ra lúc này.", "CHECK_OUT_NOT_ALLOWED");
    }
  }

  return createFaceLivenessSession({ teacherId, sessionId, type });
};

export const completeTeacherSessionFaceVerification = async ({
  sessionId,
  teacherId,
  role = "creator",
  type,
  livenessSessionId = null,
  manualFallback = false,
  fallbackSnapshotBuffer = null,
  fallbackMimeType = "image/jpeg",
  challengeSnapshotBuffer = null,
  ip = null,
  userAgent = null,
  now = new Date(),
  db = { query: defaultQuery },
}) => {
  if (type !== "check_in" && type !== "check_out") {
    throw makeError(422, "Loại chấm công phải là check_in hoặc check_out.", "INVALID_TYPE");
  }

  const session = await loadSessionAndVerifyTeacher({ sessionId, teacherId, role, db });
  const enrollmentRes = await db.query(
    "SELECT id, status, r2_key FROM teacher_face_enrollments WHERE teacher_id = $1",
    [teacherId],
  );
  const enrollment = enrollmentRes.rows[0];
  if (!enrollment || enrollment.status !== "approved") {
    throw makeError(
      403,
      "Khuôn mặt mẫu chưa được duyệt khóa.",
      "FACE_ENROLLMENT_NOT_APPROVED",
    );
  }

  const existingRes = await db.query(
    "SELECT * FROM teacher_session_attendance WHERE session_id = $1 AND teacher_id = $2",
    [sessionId, teacherId],
  );
  const existing = existingRes.rows[0] || null;

  let timeStatus = "on_time";
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;

  if (type === "check_in") {
    const policy = evaluateTeacherCheckInPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckIn) {
      throw makeError(422, policy.reason || "Không thể chấm công Vào.", "CHECK_IN_NOT_ALLOWED");
    }
    timeStatus = policy.isLate ? "late" : "on_time";
    lateMinutes = policy.lateMinutes;
  } else {
    const policy = evaluateTeacherCheckOutPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckOut) {
      throw makeError(422, policy.reason || "Không thể chấm công Ra.", "CHECK_OUT_NOT_ALLOWED");
    }
    timeStatus = policy.isEarlyLeave ? "early_leave" : "on_time";
    earlyLeaveMinutes = policy.earlyLeaveMinutes;
  }

  let finalStatus = timeStatus;
  let livenessScore = null;
  let faceSimilarity = null;
  let provider = "manual";
  let snapshotBuffer = fallbackSnapshotBuffer;

  if (manualFallback) {
    if (!Buffer.isBuffer(fallbackSnapshotBuffer) || fallbackSnapshotBuffer.length === 0) {
      throw makeError(422, "Vui lòng chụp ảnh từ camera để gửi Admin duyệt tay.", "SNAPSHOT_REQUIRED");
    }
    finalStatus = "manual_review";
    provider = "manual";
  } else if (String(livenessSessionId || "").startsWith("chal.")) {
    // Active 2-Frame AWS Rekognition Liveness (DetectFaces Attributes: ALL + CompareFaces)
    const payload = verifyActiveChallengeToken({
      token: livenessSessionId,
      teacherId,
      sessionId,
      type,
    });

    if (!Buffer.isBuffer(fallbackSnapshotBuffer) || fallbackSnapshotBuffer.length === 0) {
      throw makeError(422, "Thiếu ảnh bước 1 (nhìn thẳng camera).", "STRAIGHT_IMAGE_REQUIRED");
    }
    if (!Buffer.isBuffer(challengeSnapshotBuffer) || challengeSnapshotBuffer.length === 0) {
      throw makeError(422, "Thiếu ảnh bước 2 (thực hiện cử chỉ xác thực).", "CHALLENGE_IMAGE_REQUIRED");
    }

    const activeEval = await verifyActiveChallengeWithAws({
      challengeCode: payload.c,
      straightImageBytes: fallbackSnapshotBuffer,
      challengeImageBytes: challengeSnapshotBuffer,
    });
    livenessScore = activeEval.confidence;
    provider = activeEval.provider;

    if (!activeEval.isLive) {
      throw makeError(
        422,
        activeEval.reason || `Xác thực cử chỉ người thật chưa đạt (${activeEval.confidence}%). Vui lòng thử lại.`,
        "LIVENESS_CHECK_FAILED",
      );
    }

    const enrolledBytes = await loadPrivateFaceImage(enrollment.r2_key);
    const compareResult = await compareFaces({
      sourceImageBytes: enrolledBytes,
      targetImageBytes: fallbackSnapshotBuffer,
    });
    faceSimilarity = compareResult.similarity;
    snapshotBuffer = fallbackSnapshotBuffer;

    if (!compareResult.matched) {
      throw makeError(
        422,
        `Khuôn mặt chưa khớp với ảnh mẫu (${compareResult.similarity}%). Vui lòng thử lại ở nơi đủ sáng hoặc gửi ảnh chờ Admin duyệt tay.`,
        "FACE_MATCH_FAILED",
      );
    }
  } else {
    if (!livenessSessionId) {
      throw makeError(422, "Thiếu mã phiên Face Liveness.", "LIVENESS_SESSION_REQUIRED");
    }

    const livenessResult = await getFaceLivenessSessionResults({ livenessSessionId });
    livenessScore = livenessResult.confidence;
    provider = livenessResult.provider;

    if (!livenessResult.isLive) {
      throw makeError(
        422,
        `Xác thực người thật chưa đạt (${livenessResult.confidence}%). Vui lòng giữ mặt trong khung hình nơi đủ sáng và thử lại, hoặc gửi ảnh chờ Admin duyệt tay.`,
        "LIVENESS_CHECK_FAILED",
      );
    }

    const liveBytes = livenessResult.referenceImageBytes || fallbackSnapshotBuffer;
    snapshotBuffer = liveBytes;

    let enrolledBytes = null;
    if (provider !== "mock") {
      if (!liveBytes) {
        throw makeError(502, "AWS không trả về ảnh tham chiếu từ phiên Face Liveness.", "MISSING_LIVENESS_IMAGE");
      }
      enrolledBytes = await loadPrivateFaceImage(enrollment.r2_key);
    }

    const compareResult = await compareFaces({
      sourceImageBytes: enrolledBytes || Buffer.from("mock"),
      targetImageBytes: liveBytes || Buffer.from("mock"),
    });
    faceSimilarity = compareResult.similarity;

    if (!compareResult.matched) {
      throw makeError(
        422,
        `Khuôn mặt chưa khớp với ảnh mẫu (${compareResult.similarity}%). Vui lòng thử lại ở nơi đủ sáng hoặc gửi ảnh chờ Admin duyệt tay.`,
        "FACE_MATCH_FAILED",
      );
    }
  }

  let storedSnapshotKey = null;
  if (Buffer.isBuffer(snapshotBuffer) && snapshotBuffer.length > 0) {
    storedSnapshotKey = await savePrivateFaceImage({
      key: buildFaceKey(`sessions/${sessionId}`, teacherId, type),
      buffer: snapshotBuffer,
      mimeType: fallbackMimeType || "image/jpeg",
    });
  }

  const nowIso = new Date(now).toISOString();
  const merged = {
    ...(existing || {}),
    ...(type === "check_in"
      ? {
          check_in_at: nowIso,
          check_in_status: finalStatus,
          late_minutes: lateMinutes,
          check_in_liveness_session_id: livenessSessionId,
          check_in_liveness_score: livenessScore,
          check_in_face_similarity: faceSimilarity,
          check_in_r2_key: storedSnapshotKey,
          check_in_provider: provider,
          check_in_ip: ip,
          check_in_user_agent: userAgent,
        }
      : {
          check_out_at: nowIso,
          check_out_status: finalStatus,
          early_leave_minutes: earlyLeaveMinutes,
          check_out_liveness_session_id: livenessSessionId,
          check_out_liveness_score: livenessScore,
          check_out_face_similarity: faceSimilarity,
          check_out_r2_key: storedSnapshotKey,
          check_out_provider: provider,
          check_out_ip: ip,
          check_out_user_agent: userAgent,
        }),
  };

  const payrollEligible = computePayrollEligibility(merged);

  const upsertRes = await db.query(
    `INSERT INTO teacher_session_attendance (
       session_id, teacher_id,
       check_in_at, check_in_status, late_minutes, check_in_liveness_session_id,
       check_in_liveness_score, check_in_face_similarity, check_in_r2_key, check_in_provider,
       check_in_ip, check_in_user_agent,
       check_out_at, check_out_status, early_leave_minutes, check_out_liveness_session_id,
       check_out_liveness_score, check_out_face_similarity, check_out_r2_key, check_out_provider,
       check_out_ip, check_out_user_agent,
       payroll_eligible, updated_at
     )
     VALUES (
       $1, $2,
       $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
       $23, NOW()
     )
     ON CONFLICT (session_id, teacher_id)
     DO UPDATE SET
       check_in_at = EXCLUDED.check_in_at,
       check_in_status = EXCLUDED.check_in_status,
       late_minutes = EXCLUDED.late_minutes,
       check_in_liveness_session_id = EXCLUDED.check_in_liveness_session_id,
       check_in_liveness_score = EXCLUDED.check_in_liveness_score,
       check_in_face_similarity = EXCLUDED.check_in_face_similarity,
       check_in_r2_key = EXCLUDED.check_in_r2_key,
       check_in_provider = EXCLUDED.check_in_provider,
       check_in_ip = EXCLUDED.check_in_ip,
       check_in_user_agent = EXCLUDED.check_in_user_agent,
       check_out_at = EXCLUDED.check_out_at,
       check_out_status = EXCLUDED.check_out_status,
       early_leave_minutes = EXCLUDED.early_leave_minutes,
       check_out_liveness_session_id = EXCLUDED.check_out_liveness_session_id,
       check_out_liveness_score = EXCLUDED.check_out_liveness_score,
       check_out_face_similarity = EXCLUDED.check_out_face_similarity,
       check_out_r2_key = EXCLUDED.check_out_r2_key,
       check_out_provider = EXCLUDED.check_out_provider,
       check_out_ip = EXCLUDED.check_out_ip,
       check_out_user_agent = EXCLUDED.check_out_user_agent,
       payroll_eligible = EXCLUDED.payroll_eligible,
       updated_at = NOW()
     RETURNING *`,
    [
      sessionId,
      teacherId,
      merged.check_in_at || null,
      merged.check_in_status || null,
      Number(merged.late_minutes || 0),
      merged.check_in_liveness_session_id || null,
      merged.check_in_liveness_score ?? null,
      merged.check_in_face_similarity ?? null,
      merged.check_in_r2_key || null,
      merged.check_in_provider || null,
      merged.check_in_ip || null,
      merged.check_in_user_agent || null,
      merged.check_out_at || null,
      merged.check_out_status || null,
      Number(merged.early_leave_minutes || 0),
      merged.check_out_liveness_session_id || null,
      merged.check_out_liveness_score ?? null,
      merged.check_out_face_similarity ?? null,
      merged.check_out_r2_key || null,
      merged.check_out_provider || null,
      merged.check_out_ip || null,
      merged.check_out_user_agent || null,
      payrollEligible,
    ],
  );

  await recordAuditEvent({
    actorId: teacherId,
    action: `teacher.session_face.${type}`,
    targetType: "class_session",
    targetId: String(sessionId),
    metadata: {
      finalStatus,
      provider,
      livenessScore,
      faceSimilarity,
      lateMinutes,
      earlyLeaveMinutes,
      payrollEligible,
    },
  }).catch(() => {});

  return serializeSessionAttendance(upsertRes.rows[0]);
};

// ---------------------------------------------------------------------------
// Device-Native WebAuthn Biometrics (iOS Face ID / Touch ID / Android / WinHello)
// ---------------------------------------------------------------------------
export const startTeacherSessionDeviceBiometric = async ({
  sessionId,
  teacherId,
  role = "creator",
  type,
  rpId,
  expectedOrigin,
  now = new Date(),
  db = { query: defaultQuery },
}) => {
  if (type !== "check_in" && type !== "check_out") {
    throw makeError(422, "Loại chấm công phải là check_in hoặc check_out.", "INVALID_TYPE");
  }

  const session = await loadSessionAndVerifyTeacher({ sessionId, teacherId, role, db });
  const attendanceRes = await db.query(
    "SELECT * FROM teacher_session_attendance WHERE session_id = $1 AND teacher_id = $2",
    [sessionId, teacherId],
  );
  const existing = attendanceRes.rows[0] || null;

  if (type === "check_in") {
    const policy = evaluateTeacherCheckInPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckIn) {
      throw makeError(422, policy.reason || "Không thể chấm công Vào lúc này.", "CHECK_IN_NOT_ALLOWED");
    }
  } else {
    const policy = evaluateTeacherCheckOutPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckOut) {
      throw makeError(422, policy.reason || "Không thể chấm công Ra lúc này.", "CHECK_OUT_NOT_ALLOWED");
    }
  }

  return beginTeacherBiometricAssertion({
    teacherId,
    purpose: "attendance",
    sessionId,
    type,
    rpId,
    expectedOrigin,
    db,
  });
};

export const completeTeacherSessionDeviceBiometricVerification = async ({
  sessionId,
  teacherId,
  role = "creator",
  type,
  challengeToken,
  credentialId,
  clientDataJSON,
  authenticatorData,
  signature,
  ip = null,
  userAgent = null,
  now = new Date(),
  db = { query: defaultQuery },
}) => {
  if (type !== "check_in" && type !== "check_out") {
    throw makeError(422, "Loại chấm công phải là check_in hoặc check_out.", "INVALID_TYPE");
  }

  const session = await loadSessionAndVerifyTeacher({ sessionId, teacherId, role, db });
  const existingRes = await db.query(
    "SELECT * FROM teacher_session_attendance WHERE session_id = $1 AND teacher_id = $2",
    [sessionId, teacherId],
  );
  const existing = existingRes.rows[0] || null;

  let timeStatus = "on_time";
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;

  if (type === "check_in") {
    const policy = evaluateTeacherCheckInPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckIn) {
      throw makeError(422, policy.reason || "Không thể chấm công Vào lúc này.", "CHECK_IN_NOT_ALLOWED");
    }
    timeStatus = policy.isLate ? "late" : "on_time";
    lateMinutes = policy.lateMinutes;
  } else {
    const policy = evaluateTeacherCheckOutPolicy({
      startTime: session.start_time,
      endTime: session.end_time,
      status: session.status,
      now,
      existingAttendance: existing,
    });
    if (!policy.canCheckOut) {
      throw makeError(422, policy.reason || "Không thể chấm công Ra lúc này.", "CHECK_OUT_NOT_ALLOWED");
    }
    timeStatus = policy.isEarlyLeave ? "early_leave" : "on_time";
    earlyLeaveMinutes = policy.earlyLeaveMinutes;
  }

  const bio = await verifyTeacherBiometricAssertion({
    teacherId,
    purpose: "attendance",
    sessionId,
    type,
    challengeToken,
    credentialId,
    clientDataJSON,
    authenticatorData,
    signature,
    db,
  });

  const nowIso = new Date(now).toISOString();
  const merged = {
    ...(existing || {}),
    ...(type === "check_in"
      ? {
          check_in_at: nowIso,
          check_in_status: timeStatus,
          late_minutes: lateMinutes,
          check_in_liveness_session_id: `webauthn:${bio.credentialRowId}`,
          check_in_liveness_score: 100,
          check_in_face_similarity: 100,
          check_in_r2_key: null,
          check_in_provider: "device_webauthn",
          check_in_ip: ip,
          check_in_user_agent: userAgent,
        }
      : {
          check_out_at: nowIso,
          check_out_status: timeStatus,
          early_leave_minutes: earlyLeaveMinutes,
          check_out_liveness_session_id: `webauthn:${bio.credentialRowId}`,
          check_out_liveness_score: 100,
          check_out_face_similarity: 100,
          check_out_r2_key: null,
          check_out_provider: "device_webauthn",
          check_out_ip: ip,
          check_out_user_agent: userAgent,
        }),
  };

  const payrollEligible = computePayrollEligibility(merged);

  const upsertRes = await db.query(
    `INSERT INTO teacher_session_attendance (
       session_id, teacher_id,
       check_in_at, check_in_status, late_minutes, check_in_liveness_session_id,
       check_in_liveness_score, check_in_face_similarity, check_in_r2_key, check_in_provider,
       check_in_ip, check_in_user_agent,
       check_out_at, check_out_status, early_leave_minutes, check_out_liveness_session_id,
       check_out_liveness_score, check_out_face_similarity, check_out_r2_key, check_out_provider,
       check_out_ip, check_out_user_agent,
       payroll_eligible, updated_at
     )
     VALUES (
       $1, $2,
       $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
       $23, NOW()
     )
     ON CONFLICT (session_id, teacher_id)
     DO UPDATE SET
       check_in_at = EXCLUDED.check_in_at,
       check_in_status = EXCLUDED.check_in_status,
       late_minutes = EXCLUDED.late_minutes,
       check_in_liveness_session_id = EXCLUDED.check_in_liveness_session_id,
       check_in_liveness_score = EXCLUDED.check_in_liveness_score,
       check_in_face_similarity = EXCLUDED.check_in_face_similarity,
       check_in_r2_key = EXCLUDED.check_in_r2_key,
       check_in_provider = EXCLUDED.check_in_provider,
       check_in_ip = EXCLUDED.check_in_ip,
       check_in_user_agent = EXCLUDED.check_in_user_agent,
       check_out_at = EXCLUDED.check_out_at,
       check_out_status = EXCLUDED.check_out_status,
       early_leave_minutes = EXCLUDED.early_leave_minutes,
       check_out_liveness_session_id = EXCLUDED.check_out_liveness_session_id,
       check_out_liveness_score = EXCLUDED.check_out_liveness_score,
       check_out_face_similarity = EXCLUDED.check_out_face_similarity,
       check_out_r2_key = EXCLUDED.check_out_r2_key,
       check_out_provider = EXCLUDED.check_out_provider,
       check_out_ip = EXCLUDED.check_out_ip,
       check_out_user_agent = EXCLUDED.check_out_user_agent,
       payroll_eligible = EXCLUDED.payroll_eligible,
       updated_at = NOW()
     RETURNING *`,
    [
      sessionId,
      teacherId,
      merged.check_in_at || null,
      merged.check_in_status || null,
      Number(merged.late_minutes || 0),
      merged.check_in_liveness_session_id || null,
      merged.check_in_liveness_score ?? null,
      merged.check_in_face_similarity ?? null,
      merged.check_in_r2_key || null,
      merged.check_in_provider || null,
      merged.check_in_ip || null,
      merged.check_in_user_agent || null,
      merged.check_out_at || null,
      merged.check_out_status || null,
      Number(merged.early_leave_minutes || 0),
      merged.check_out_liveness_session_id || null,
      merged.check_out_liveness_score ?? null,
      merged.check_out_face_similarity ?? null,
      merged.check_out_r2_key || null,
      merged.check_out_provider || null,
      merged.check_out_ip || null,
      merged.check_out_user_agent || null,
      payrollEligible,
    ],
  );

  await recordAuditEvent({
    actorId: teacherId,
    action: `teacher.session_biometric.${type}`,
    targetType: "class_session",
    targetId: String(sessionId),
    metadata: {
      timeStatus,
      provider: "device_webauthn",
      deviceLabel: bio.deviceLabel,
      lateMinutes,
      earlyLeaveMinutes,
      payrollEligible,
    },
  }).catch(() => {});

  return serializeSessionAttendance(upsertRes.rows[0]);
};

export const adminOverrideSessionAttendance = async ({
  sessionId,
  teacherId,
  decision,
  note = "",
  adminId,
  db = { query: defaultQuery },
}) => {
  if (!["approved", "rejected", "reset"].includes(decision)) {
    throw makeError(422, "Quyết định không hợp lệ (chỉ nhận approved, rejected hoặc reset).", "INVALID_DECISION");
  }

  const existingRes = await db.query(
    "SELECT * FROM teacher_session_attendance WHERE session_id = $1 AND teacher_id = $2",
    [sessionId, teacherId],
  );
  const existing = existingRes.rows[0] || null;
  const overrideStatus = decision === "reset" ? null : decision;

  const merged = {
    ...(existing || {}),
    admin_override_status: overrideStatus,
  };
  const payrollEligible = computePayrollEligibility(merged);

  const upsertRes = await db.query(
    `INSERT INTO teacher_session_attendance (
       session_id, teacher_id, payroll_eligible,
       admin_override_status, admin_override_by, admin_override_at, admin_override_note, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())
     ON CONFLICT (session_id, teacher_id)
     DO UPDATE SET
       payroll_eligible = EXCLUDED.payroll_eligible,
       admin_override_status = EXCLUDED.admin_override_status,
       admin_override_by = EXCLUDED.admin_override_by,
       admin_override_at = CASE WHEN EXCLUDED.admin_override_status IS NULL THEN NULL ELSE NOW() END,
       admin_override_note = EXCLUDED.admin_override_note,
       updated_at = NOW()
     RETURNING *`,
    [
      sessionId,
      teacherId,
      payrollEligible,
      overrideStatus,
      overrideStatus ? adminId : null,
      String(note || "").trim() || null,
    ],
  );

  await recordAuditEvent({
    actorId: adminId,
    action: `admin.teacher_session_attendance.${decision}`,
    targetType: "class_session",
    targetId: String(sessionId),
    metadata: { teacherId, decision, payrollEligible, note: String(note || "").trim() },
  }).catch(() => {});

  return serializeSessionAttendance(upsertRes.rows[0]);
};

// ---------------------------------------------------------------------------
// Admin Dry-Run Self-Test (real AWS Rekognition call, ZERO DB/payroll writes)
// ---------------------------------------------------------------------------
export const startAdminFaceSelfTest = async ({ adminId }) => {
  const session = await createFaceLivenessSession({
    teacherId: adminId,
    sessionId: 0,
    type: "admin_test",
  });
  return {
    ...session,
    aws: getPublicAwsRekognitionStatus(),
    dryRun: true,
  };
};

export const verifyAdminFaceSelfTest = async ({
  adminId,
  livenessSessionId,
  straightSnapshotBuffer = null,
  challengeSnapshotBuffer = null,
  compareTeacherId = null,
  db = { query: defaultQuery },
}) => {
  const startedAt = Date.now();
  const awsStatus = getPublicAwsRekognitionStatus();

  let livenessPassed = false;
  let livenessConfidence = null;
  let samePersonSimilarity = null;
  let challengeCode = null;
  let livenessReason = null;
  let liveReferenceBytes = straightSnapshotBuffer;

  if (String(livenessSessionId || "").startsWith("chal.")) {
    const payload = verifyActiveChallengeToken({
      token: livenessSessionId,
      teacherId: adminId,
      sessionId: 0,
      type: "admin_test",
    });
    challengeCode = payload.c;

    if (!Buffer.isBuffer(straightSnapshotBuffer) || !Buffer.isBuffer(challengeSnapshotBuffer)) {
      throw makeError(422, "Cần đủ 2 ảnh (bước 1 nhìn thẳng và bước 2 cử chỉ) để test AWS Rekognition.", "TEST_IMAGES_REQUIRED");
    }

    const activeEval = await verifyActiveChallengeWithAws({
      challengeCode,
      straightImageBytes: straightSnapshotBuffer,
      challengeImageBytes: challengeSnapshotBuffer,
    });
    livenessPassed = Boolean(activeEval.isLive);
    livenessConfidence = activeEval.confidence;
    samePersonSimilarity = activeEval.samePersonSimilarity ?? null;
    livenessReason = activeEval.reason || null;
  } else if (livenessSessionId) {
    const res = await getFaceLivenessSessionResults({ livenessSessionId });
    livenessPassed = Boolean(res.isLive);
    livenessConfidence = res.confidence;
    if (res.referenceImageBytes) {
      liveReferenceBytes = res.referenceImageBytes;
    }
    if (!livenessPassed) {
      livenessReason = `Điểm Liveness ${res.confidence}% chưa đạt ngưỡng ${awsStatus.livenessMinConfidence}%.`;
    }
  } else {
    throw makeError(422, "Thiếu mã phiên test AWS.", "LIVENESS_SESSION_REQUIRED");
  }

  let comparedAgainst = null;
  let faceMatched = null;
  let faceSimilarity = null;

  if (compareTeacherId && Buffer.isBuffer(liveReferenceBytes) && liveReferenceBytes.length > 0) {
    const enrollRes = await db.query(
      `SELECT tfe.teacher_id, tfe.r2_key, tfe.status, COALESCE(sp.full_name, u.username) AS full_name, u.username
       FROM teacher_face_enrollments tfe
       JOIN users u ON u.id = tfe.teacher_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE tfe.teacher_id = $1`,
      [compareTeacherId],
    );
    const target = enrollRes.rows[0];
    if (!target) {
      throw makeError(404, "Giảng viên được chọn chưa có ảnh khuôn mặt mẫu để đối chiếu.", "TARGET_ENROLLMENT_NOT_FOUND");
    }

    comparedAgainst = {
      teacherId: Number(target.teacher_id),
      fullName: target.full_name,
      username: target.username,
      enrollmentStatus: target.status,
    };

    const enrolledBytes = awsStatus.mockMode
      ? Buffer.from("mock")
      : await loadPrivateFaceImage(target.r2_key);

    const cmp = await compareFaces({
      sourceImageBytes: enrolledBytes,
      targetImageBytes: liveReferenceBytes,
    });
    faceMatched = Boolean(cmp.matched);
    faceSimilarity = cmp.similarity;
  }

  const latencyMs = Date.now() - startedAt;
  const overallPassed = livenessPassed && (faceMatched === null ? true : faceMatched);

  return {
    dryRun: true,
    payrollTouched: false,
    passed: overallPassed,
    region: awsStatus.region,
    mode: awsStatus.mode,
    latencyMs,
    challengeCode,
    livenessPassed,
    livenessConfidence,
    samePersonSimilarity,
    livenessReason,
    comparedAgainst,
    faceMatched,
    faceSimilarity,
    thresholds: {
      livenessMinConfidence: awsStatus.livenessMinConfidence,
      faceMatchMinSimilarity: awsStatus.faceMatchMinSimilarity,
    },
    testedAt: new Date().toISOString(),
  };
};
