import express from "express";
import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requireRole from "../middleware/requireRole.js";
import requirePermission from "../middleware/requirePermission.js";
import {
  attemptManagementAttendanceDeliveryById,
  enqueueManagementAttendanceDelivery,
} from "../services/managementAttendanceDelivery.service.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { assertGradebookOpen, mayReviewAttendance, notifyWorkflow } from "../services/lmsWorkflow.service.js";

const router = express.Router();

const validationError = (res, message) => res.status(422).json({
  success: false,
  message,
  errorCode: "VALIDATION_ERROR",
});

const notFound = (res, message) => res.status(404).json({
  success: false,
  message,
  errorCode: "NOT_FOUND",
});

const forbidden = (res, message) => res.status(403).json({
  success: false,
  message,
  errorCode: "FORBIDDEN",
});

const internalError = (res, message) => res.status(500).json({
  success: false,
  message,
  errorCode: "INTERNAL_ERROR",
});

const conflict = (res, message, errorCode) => res.status(409).json({
  success: false,
  message,
  errorCode,
});

const dateKey = (value) => String(value || "").slice(0, 10);

export const buildStudentCheckInPolicy = ({ startTime, endTime, status, now = new Date(), finalized = false, checkedIn = false } = {}) => {
  const current = new Date(now).getTime();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const validTimes = Number.isFinite(current) && Number.isFinite(start) && Number.isFinite(end) && end > start;
  const localDate = (value) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
  const sameDay = validTimes && localDate(current) === localDate(start);
  const inWindow = validTimes && current >= start - 15 * 60 * 1000 && current <= end;
  let reason = null;
  if (checkedIn) reason = "Bạn đã báo có mặt cho buổi học này.";
  else if (finalized) reason = "Giáo viên đã chốt điểm danh buổi học.";
  else if (status === "cancelled" || status === "ended") reason = "Buổi học đã kết thúc hoặc bị hủy.";
  else if (!sameDay || !inWindow) reason = "Chỉ được báo có mặt từ 15 phút trước giờ học đến khi buổi học kết thúc, trong đúng ngày học.";
  return { canCheckIn: !reason, reason };
};

// Teachers finalize the full attendance sheet on the academy day. Student
// check-ins remain provisional until then; afterwards only approved amendments
// can change the sheet. The teacher's day is calculated by PostgreSQL.
export const buildAttendancePolicy = ({
  attendanceDate,
  todayDate,
  status,
  attendanceLocked = false,
} = {}) => {
  const isAttendanceDay = Boolean(attendanceDate)
    && dateKey(attendanceDate) === dateKey(todayDate);
  const isCancelled = status === "cancelled";
  const isLocked = Boolean(attendanceLocked);

  let reason = null;
  if (isCancelled) reason = "Buổi học đã hủy nên không thể điểm danh.";
  else if (!isAttendanceDay) reason = "Chỉ được điểm danh trong đúng ngày diễn ra buổi học.";
  else if (isLocked) reason = "Điểm danh của buổi học này đã được chốt và không thể chỉnh sửa.";

  return {
    attendanceDate: dateKey(attendanceDate),
    isAttendanceDay,
    isLocked,
    canMarkAttendance: !isCancelled && isAttendanceDay && !isLocked,
    reason,
  };
};

const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const ATTENDANCE_STATUSES = new Set(["present", "absent", "excused"]);

const normalizeNote = (value) => (typeof value === "string" ? value.trim() : "");

const serializeAmendment = (row) => ({
  id: row.id,
  sessionId: row.session_id,
  userId: row.user_id,
  studentName: row.student_name || row.student_email,
  studentEmail: row.student_email,
  originalStatus: row.original_status,
  originalNote: row.original_note || "",
  requestedStatus: row.requested_status,
  requestedNote: row.requested_note || "",
  reason: row.reason,
  status: row.status,
  requestedBy: row.requested_by,
  requestedByName: row.requested_by_name || null,
  requestedAt: row.requested_at,
  reviewedBy: row.reviewed_by,
  reviewedByName: row.reviewed_by_name || null,
  reviewedAt: row.reviewed_at,
  reviewNote: row.review_note || "",
  appliedAt: row.applied_at,
});

const getSessionForTeacher = async (sessionId) => {
  const result = await query(
    `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
            lc.title AS class_title, lc.instructor_id,
            (cs.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS attendance_date,
            (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS attendance_today,
            EXISTS (
              SELECT 1 FROM class_attendance_sheets sheet WHERE sheet.session_id = cs.id
            ) AS attendance_locked
     FROM class_sessions cs
     JOIN live_classes lc ON lc.id = cs.live_class_id
     WHERE cs.id = $1`,
    [sessionId],
  );
  return result.rows[0] || null;
};

export const canManageSession = async (session, user, db = { query }) => {
  if (!session) return false;
  if (user.role === "admin") return true;
  if (user.role !== "creator") return false;
  const result = await db.query(
    `SELECT status FROM class_teachers
     WHERE live_class_id = $1 AND teacher_id = $2`,
    [session.live_class_id, user.id],
  );
  if (result.rows.length) return result.rows[0].status === "active";
  // Classes created before explicit teacher assignments still have an instructor.
  return String(session.instructor_id) === String(user.id);
};

const parseLeaderboardOptions = (req) => {
  const rawScope = String(req.query.scope || "public").toLowerCase();
  const scope = rawScope === "global" ? "public" : rawScope;
  const period = String(req.query.period || "all").toLowerCase();
  const page = Number.parseInt(req.query.page || "1", 10);
  const limit = Number.parseInt(req.query.limit || "50", 10);
  if (!["public", "class", "course"].includes(scope)) return { error: "scope phải là public, class hoặc course" };
  if (!["all", "week", "month"].includes(period)) return { error: "period phải là all, week hoặc month" };
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { error: "page/limit không hợp lệ" };
  }
  return { scope, period, page, limit, offset: (page - 1) * limit };
};

const getLeaderboardUserStreak = async (userId) => {
  if (!userId) return null;
  const streakResult = await query(
    `SELECT total_xp, current_streak_days
     FROM user_xp_streaks WHERE user_id = $1`,
    [userId],
  );
  if (!streakResult.rows[0]) return null;

  const activityResult = await query(
    `SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS local_day,
            SUM(xp)::int AS xp
     FROM xp_events
     WHERE user_id = $1
       AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >=
           (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 6
     GROUP BY local_day`,
    [userId],
  );
  const today = new Date();
  const weekDays = [];
  const weeklyXp = [];
  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - daysAgo);
    const key = day.toISOString().slice(0, 10);
    const xp = Number(activityResult.rows.find((row) => String(row.local_day).slice(0, 10) === key)?.xp || 0);
    weeklyXp.push(xp);
    weekDays.push(xp > 0);
  }
  return {
    currentStreakDays: Number(streakResult.rows[0].current_streak_days || 0),
    totalXp: Number(streakResult.rows[0].total_xp || 0),
    weeklyXp,
    weekDays,
    unlockedBadges: [],
  };
};

const handleLeaderboard = async (req, res) => {
  try {
    const options = parseLeaderboardOptions(req);
    if (options.error) return validationError(res, options.error);

    const { scope, period, page, limit, offset } = options;
    const values = [];
    const filters = ["u.role = 'user'", "COALESCE(u.is_locked, false) = false"];
    let joinClause = "";
    let resolvedScopeId = null;

    if (period === "week" || period === "month") {
      const periodStart = period === "week"
        ? "(((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 6)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')"
        : "(DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')";
      joinClause = `LEFT JOIN xp_events xe
        ON xe.user_id = u.id AND xe.created_at >= ${periodStart}`;
    }

    if (scope === "class") {
      let classId = parsePositiveId(req.query.classId || req.query.liveClassId);
      // The current learner UI does not send classId. Resolve its latest active
      // class without broadening access; admin/creator must choose explicitly.
      if (!classId && req.user?.role === "user") {
        const currentClass = await query(
          `SELECT ce.live_class_id
           FROM class_enrollments ce
           JOIN live_classes lc ON lc.id = ce.live_class_id
           LEFT JOIN courses c ON c.id = lc.course_id
           WHERE ce.user_id = $1 AND ce.status = 'active'
             AND (
               COALESCE(c.is_management_managed, FALSE) = FALSE
               OR EXISTS (
                 SELECT 1 FROM lms_access_grants g
                 WHERE g.user_id = ce.user_id AND g.course_id = lc.course_id
                   AND g.access_status = 'active' AND g.valid_from <= NOW()
                   AND (g.valid_until IS NULL OR g.valid_until > NOW())
               )
             )
           ORDER BY ce.enrolled_at DESC, ce.id DESC LIMIT 1`,
          [req.user.id],
        );
        classId = currentClass.rows[0]?.live_class_id || null;
      }
      if (!classId) return validationError(res, "classId là bắt buộc cho bảng xếp hạng lớp");
      resolvedScopeId = classId;
      const classResult = await query(
        `SELECT lc.id, lc.instructor_id, lc.course_id,
                COALESCE(c.is_management_managed, FALSE) AS is_management_managed
         FROM live_classes lc
         LEFT JOIN courses c ON c.id = lc.course_id
         WHERE lc.id = $1`,
        [classId],
      );
      if (!classResult.rows[0]) return notFound(res, "Không tìm thấy lớp học");
      if (req.user.role === "creator" && !(await canManageSession({ live_class_id: classId, instructor_id: classResult.rows[0].instructor_id }, req.user))) {
        return forbidden(res, "Bạn không có quyền xem bảng xếp hạng lớp này");
      }
      if (req.user.role === "user") {
        const membership = await query(
          `SELECT 1
           FROM class_enrollments ce
           WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
             AND (
               $3::boolean = FALSE
               OR EXISTS (
                 SELECT 1 FROM lms_access_grants g
                 WHERE g.user_id = $2 AND g.course_id = $4
                   AND g.access_status = 'active' AND g.valid_from <= NOW()
                   AND (g.valid_until IS NULL OR g.valid_until > NOW())
               )
             )`,
          [classId, req.user.id, Boolean(classResult.rows[0].is_management_managed), classResult.rows[0].course_id],
        );
        if (!membership.rows[0]) return forbidden(res, "Bạn chưa tham gia lớp học này");
      }
      values.push(classId);
      filters.push(`EXISTS (
        SELECT 1 FROM class_enrollments ce
        JOIN live_classes lc_scope ON lc_scope.id = ce.live_class_id
        LEFT JOIN courses c_scope ON c_scope.id = lc_scope.course_id
        WHERE ce.live_class_id = $${values.length}
          AND ce.user_id = u.id AND ce.status = 'active'
          AND (
            COALESCE(c_scope.is_management_managed, FALSE) = FALSE
            OR EXISTS (
              SELECT 1 FROM lms_access_grants g
              WHERE g.user_id = ce.user_id AND g.course_id = lc_scope.course_id
                AND g.access_status = 'active' AND g.valid_from <= NOW()
                AND (g.valid_until IS NULL OR g.valid_until > NOW())
            )
          )
      )`);
    }

    if (scope === "course") {
      const courseId = parsePositiveId(req.query.courseId);
      if (!courseId) return validationError(res, "courseId là bắt buộc cho bảng xếp hạng khóa học");
      resolvedScopeId = courseId;
      const courseResult = await query(
        "SELECT id, author_id, COALESCE(is_management_managed, FALSE) AS is_management_managed FROM courses WHERE id = $1",
        [courseId],
      );
      if (!courseResult.rows[0]) return notFound(res, "Không tìm thấy khóa học");
      if (req.user.role === "creator" && String(courseResult.rows[0].author_id) !== String(req.user.id)) {
        return forbidden(res, "Bạn không có quyền xem bảng xếp hạng khóa học này");
      }
      if (req.user.role === "user") {
        const membership = await query(
          `SELECT 1 FROM enrollments e
           WHERE e.course_id = $1 AND e.user_id = $2 AND e.status = 'active'
             AND (
               $3::boolean = FALSE
               OR EXISTS (
                 SELECT 1 FROM lms_access_grants g
                 WHERE g.user_id = $2 AND g.course_id = $1
                   AND g.access_status = 'active' AND g.valid_from <= NOW()
                   AND (g.valid_until IS NULL OR g.valid_until > NOW())
               )
             )`,
          [courseId, req.user.id, Boolean(courseResult.rows[0].is_management_managed)],
        );
        if (!membership.rows[0]) return forbidden(res, "Bạn chưa đăng ký khóa học này");
      }
      values.push(courseId);
      filters.push(`EXISTS (
        SELECT 1 FROM enrollments e
        LEFT JOIN courses c_scope ON c_scope.id = e.course_id
        WHERE e.course_id = $${values.length}
          AND e.user_id = u.id AND e.status = 'active'
          AND (
            COALESCE(c_scope.is_management_managed, FALSE) = FALSE
            OR EXISTS (
              SELECT 1 FROM lms_access_grants g
              WHERE g.user_id = e.user_id AND g.course_id = e.course_id
                AND g.access_status = 'active' AND g.valid_from <= NOW()
                AND (g.valid_until IS NULL OR g.valid_until > NOW())
            )
          )
      )`);
    }

    const scoreExpression = period === "all" ? "x.total_xp" : "COALESCE(SUM(xe.xp), 0)";
    values.push(limit, offset);
    const result = await query(
      `SELECT u.id, u.username, u.avatar_url AS avatar,
              ${scoreExpression}::int AS total_xp,
              x.current_streak_days AS streak_days,
              COUNT(*) OVER()::int AS total_count
       FROM user_xp_streaks x
       JOIN users u ON x.user_id = u.id
       ${joinClause}
       WHERE ${filters.join(" AND ")}
       GROUP BY u.id, u.username, u.avatar_url, x.total_xp, x.current_streak_days
       ORDER BY total_xp DESC, x.current_streak_days DESC, u.id ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const total = Number(result.rows[0]?.total_count || 0);
    const leaderboard = result.rows.map(({ id, total_count: _totalCount, ...row }, index) => ({
      ...row,
      rank: offset + index + 1,
      is_current_user: req.user ? String(id) === String(req.user.id) : false,
    }));
    return res.json({
      success: true,
      data: {
        scope,
        scopeId: resolvedScopeId,
        period,
        leaderboard,
        userStreak: req.user ? await getLeaderboardUserStreak(req.user.id) : null,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return internalError(res, "Lỗi khi lấy bảng xếp hạng");
  }
};

// Public scope needs no login. Class/course scopes are protected and membership-scoped.
router.get("/leaderboard", (req, res) => {
  const rawScope = String(req.query.scope || "public").toLowerCase();
  if (rawScope === "public" || rawScope === "global") return handleLeaderboard(req, res);
  return protectRoute(req, res, () => handleLeaderboard(req, res));
});

// A student can see only their own check-in state, and only for an active,
// Management-approved enrollment backed by a current course access grant.
const getStudentCheckIn = async (db, sessionId, userId, { lock = false } = {}) => {
  const result = await db.query(
    `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
            lc.management_class_source_id,
            ca.status AS attendance_status, ca.checked_at, ca.source,
            sheet.finalized_at
     FROM class_sessions cs
     JOIN live_classes lc ON lc.id = cs.live_class_id
     JOIN class_enrollments ce ON ce.live_class_id = lc.id AND ce.user_id = $2
       AND ce.status = 'active'
       AND (lc.management_class_source_id IS NULL OR ce.management_approval_status = 'approved')
     JOIN lms_access_grants grant_access ON grant_access.user_id = $2 AND grant_access.course_id = lc.course_id
       AND grant_access.access_status = 'active' AND grant_access.valid_from <= NOW()
       AND (grant_access.valid_until IS NULL OR grant_access.valid_until > NOW())
     LEFT JOIN class_attendance ca ON ca.session_id = cs.id AND ca.user_id = $2
     LEFT JOIN class_attendance_sheets sheet ON sheet.session_id = cs.id
     WHERE cs.id = $1 AND lc.status = 'active'
       AND (lc.management_class_source_id IS NULL OR lc.management_approval_status = 'approved')
     ${lock ? 'FOR UPDATE OF cs' : ''}`,
    [sessionId, userId],
  );
  return result.rows[0] || null;
};

router.get("/session/:sessionId/my-check-in", protectRoute, async (req, res) => {
  if (req.user.role !== "user") return forbidden(res, "Chỉ học viên được tự báo có mặt");
  const sessionId = parsePositiveId(req.params.sessionId);
  if (!sessionId) return validationError(res, "sessionId không hợp lệ");
  try {
    const session = await getStudentCheckIn({ query }, sessionId, req.user.id);
    if (!session) return notFound(res, "Không tìm thấy buổi học được cấp quyền");
    const policy = buildStudentCheckInPolicy({
      startTime: session.start_time, endTime: session.end_time, status: session.status,
      finalized: Boolean(session.finalized_at), checkedIn: Boolean(session.attendance_status),
    });
    return res.json({ success: true, data: {
      sessionId, canCheckIn: policy.canCheckIn, reason: policy.reason,
      status: session.attendance_status, checkedAt: session.checked_at,
      source: session.source, finalized: Boolean(session.finalized_at),
    } });
  } catch (error) {
    console.error("Error fetching student check-in:", error);
    return internalError(res, "Không thể tải trạng thái báo có mặt");
  }
});

router.post("/session/:sessionId/my-check-in", protectRoute, async (req, res) => {
  if (req.user.role !== "user") return forbidden(res, "Chỉ học viên được tự báo có mặt");
  const sessionId = parsePositiveId(req.params.sessionId);
  if (!sessionId) return validationError(res, "sessionId không hợp lệ");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const session = await getStudentCheckIn(client, sessionId, req.user.id, { lock: true });
    if (!session) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy buổi học được cấp quyền"); }
    if (session.attendance_status) {
      await client.query("COMMIT");
      return res.json({ success: true, data: { sessionId, status: session.attendance_status, checkedAt: session.checked_at, source: session.source, alreadyRecorded: true }, message: "Buổi học đã có điểm danh của bạn" });
    }
    const policy = buildStudentCheckInPolicy({
      startTime: session.start_time, endTime: session.end_time, status: session.status,
      finalized: Boolean(session.finalized_at),
    });
    if (!policy.canCheckIn) { await client.query("ROLLBACK"); return conflict(res, policy.reason, "CHECK_IN_CLOSED"); }
    await assertGradebookOpen(client, session.live_class_id);
    const recorded = await client.query(
      `INSERT INTO class_attendance (session_id, user_id, status, note, source)
       VALUES ($1, $2, 'present', '', 'student') RETURNING checked_at`,
      [sessionId, req.user.id],
    );
    await recordAuditEvent({
      db: client, actorId: req.user.id, action: "attendance.student_checked_in",
      entityType: "class_attendance", entityId: sessionId,
      afterState: { userId: req.user.id, status: "present", checkedAt: recorded.rows[0].checked_at },
      metadata: { sessionId, ip: req.ip },
    });
    // The teacher and admin roster reads this record immediately. Management
    // receives the complete final sheet from /check; sending partial events
    // here could later overwrite a teacher's corrected status out of order.
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: {
      sessionId, status: "present", checkedAt: recorded.rows[0].checked_at,
      source: "student", alreadyRecorded: false,
    }, message: "Đã báo có mặt cho buổi học" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error recording student check-in:", error);
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return internalError(res, "Không thể báo có mặt");
  } finally { client.release(); }
});

// GET /api/attendance/session/:sessionId — real roster and current attendance.
router.get("/session/:sessionId", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    const session = await getSessionForTeacher(sessionId);
    if (!session) return notFound(res, "Không tìm thấy buổi học");
    if (!(await canManageSession(session, req.user))) {
      return forbidden(res, "Bạn không có quyền xem điểm danh buổi học này");
    }
    const attendancePolicy = buildAttendancePolicy({
      attendanceDate: session.attendance_date,
      todayDate: session.attendance_today,
      status: session.status,
      attendanceLocked: session.attendance_locked,
    });

    const result = await query(
      `SELECT u.id, u.username, u.email, u.avatar_url,
              ce.status AS enrollment_status, ce.enrolled_at,
              ca.status AS attendance_status, ca.note AS attendance_note,
              ca.checked_at, ca.source AS attendance_source,
              stats.total_sessions, stats.present_sessions
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN class_attendance ca
         ON ca.user_id = ce.user_id AND ca.session_id = $1
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT cs2.id)::int AS total_sessions,
                COUNT(DISTINCT ca2.session_id) FILTER (WHERE ca2.status = 'present')::int AS present_sessions
         FROM class_sessions cs2
         LEFT JOIN class_attendance ca2
           ON ca2.session_id = cs2.id AND ca2.user_id = ce.user_id
         WHERE cs2.live_class_id = ce.live_class_id AND cs2.status <> 'cancelled'
       ) stats ON true
       WHERE ce.live_class_id = $2 AND ce.status = 'active'
       ORDER BY LOWER(COALESCE(u.username, u.email)) ASC`,
      [sessionId, session.live_class_id],
    );

    return res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          live_class_id: session.live_class_id,
          title: session.title,
          class_title: session.class_title,
          start_time: session.start_time,
          end_time: session.end_time,
          status: session.status,
        },
        attendancePolicy,
        students: result.rows.map((row) => ({
          ...row,
          attendance_rate: Number(row.total_sessions) > 0
            ? Math.round((Number(row.present_sessions) / Number(row.total_sessions)) * 100)
            : 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching attendance roster:", error);
    return internalError(res, "Lỗi khi lấy danh sách điểm danh");
  }
});

// An attendance sheet remains write-once. Corrections are separate requests so
// the original value, requester, reviewer and time stay available for audits.
router.get("/finalized-sheets", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const classId = req.query.classId ? parsePositiveId(req.query.classId) : null;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    if (!["pending", "reviewed", "all"].includes(status) || (req.query.classId && !classId)) {
      return validationError(res, "Bộ lọc không hợp lệ");
    }
    const result = await query(
      `SELECT sheet.session_id, sheet.finalized_at, sheet.finalized_by,
              sheet.reviewed_at, sheet.reviewed_by, sheet.review_note,
              finalizer.username AS finalized_by_name, reviewer.username AS reviewed_by_name,
              lc.id AS class_id, lc.title AS class_title,
              cs.title AS session_title, cs.start_time,
              counts.total, counts.present, counts.absent, counts.excused,
              COUNT(*) OVER() AS total_count
       FROM class_attendance_sheets sheet
       JOIN class_sessions cs ON cs.id = sheet.session_id
       JOIN live_classes lc ON lc.id = cs.live_class_id
       LEFT JOIN users finalizer ON finalizer.id = sheet.finalized_by
       LEFT JOIN users reviewer ON reviewer.id = sheet.reviewed_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ca.status = 'present')::int AS present,
                COUNT(*) FILTER (WHERE ca.status = 'absent')::int AS absent,
                COUNT(*) FILTER (WHERE ca.status = 'excused')::int AS excused
         FROM class_attendance ca WHERE ca.session_id = sheet.session_id
       ) counts ON true
       WHERE ($1 = 'all' OR ($1 = 'pending' AND sheet.reviewed_at IS NULL)
              OR ($1 = 'reviewed' AND sheet.reviewed_at IS NOT NULL))
         AND ($2::bigint IS NULL OR lc.id = $2)
       ORDER BY sheet.finalized_at DESC, sheet.session_id DESC
       LIMIT 30 OFFSET $3`,
      [status, classId, (page - 1) * 30],
    );
    return res.json({ success: true, data: result.rows.map((row) => ({
      sessionId: row.session_id, classId: row.class_id, classTitle: row.class_title,
      sessionTitle: row.session_title, startTime: row.start_time,
      finalizedAt: row.finalized_at, finalizedBy: row.finalized_by,
      finalizedByName: row.finalized_by_name, reviewedAt: row.reviewed_at,
      reviewedByName: row.reviewed_by_name, reviewNote: row.review_note || "",
      counts: { total: row.total, present: row.present, absent: row.absent, excused: row.excused },
    })), meta: { total: Number(result.rows[0]?.total_count || 0), page } });
  } catch (error) {
    console.error("Attendance sheet review queue:", error);
    return internalError(res, "Không thể tải bản điểm danh đã chốt");
  }
});

router.get("/finalized-sheets/:sessionId", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    const sheet = (await query(
      `SELECT sheet.session_id, sheet.finalized_at, sheet.reviewed_at,
              lc.title AS class_title, cs.title AS session_title
       FROM class_attendance_sheets sheet
       JOIN class_sessions cs ON cs.id = sheet.session_id
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE sheet.session_id = $1`, [sessionId],
    )).rows[0];
    if (!sheet) return notFound(res, "Không tìm thấy bản điểm danh đã chốt");
    const students = await query(
      `SELECT ca.user_id, u.username, u.email, ca.status, ca.note, ca.checked_at
       FROM class_attendance ca JOIN users u ON u.id = ca.user_id
       WHERE ca.session_id = $1 ORDER BY LOWER(COALESCE(u.username, u.email)), ca.user_id`,
      [sessionId],
    );
    return res.json({ success: true, data: {
      sessionId: sheet.session_id, classTitle: sheet.class_title, sessionTitle: sheet.session_title,
      finalizedAt: sheet.finalized_at, reviewedAt: sheet.reviewed_at,
      students: students.rows.map((row) => ({
        userId: row.user_id, name: row.username || row.email, status: row.status,
        note: row.note || "", checkedAt: row.checked_at,
      })),
    } });
  } catch (error) {
    console.error("Attendance sheet detail:", error);
    return internalError(res, "Không thể tải chi tiết điểm danh");
  }
});

router.post("/finalized-sheets/:sessionId/review", protectRoute, requireRole("admin"), async (req, res) => {
  const sessionId = parsePositiveId(req.params.sessionId);
  const reviewNote = normalizeNote(req.body?.reviewNote);
  if (!sessionId || reviewNote.length > 2000) return validationError(res, "Thông tin kiểm tra điểm danh không hợp lệ");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const sheet = (await client.query(
      `SELECT session_id, finalized_by, reviewed_at FROM class_attendance_sheets
       WHERE session_id = $1 FOR UPDATE`, [sessionId],
    )).rows[0];
    if (!sheet) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy bản điểm danh đã chốt"); }
    if (sheet.reviewed_at) { await client.query("ROLLBACK"); return conflict(res, "Bản điểm danh đã được kiểm tra", "ATTENDANCE_ALREADY_REVIEWED"); }
    const reviewed = (await client.query(
      `UPDATE class_attendance_sheets SET reviewed_at = NOW(), reviewed_by = $2, review_note = $3
       WHERE session_id = $1 RETURNING reviewed_at`, [sessionId, req.user.id, reviewNote],
    )).rows[0];
    await recordAuditEvent({
      db: client, actorId: req.user.id, action: "attendance.sheet_reviewed",
      entityType: "class_session", entityId: sessionId,
      afterState: { reviewedAt: reviewed.reviewed_at, reviewNote }, metadata: { ip: req.ip },
    });
    if (sheet.finalized_by && String(sheet.finalized_by) !== String(req.user.id)) {
      await notifyWorkflow(client, {
        userId: sheet.finalized_by, title: "Bản điểm danh đã được quản trị viên kiểm tra",
        message: reviewNote || "Bản điểm danh đã chốt được ghi nhận.",
        link: "/lms/teach/attendance", key: `attendance-sheet-reviewed:${sessionId}`, actorId: req.user.id,
      });
    }
    await client.query("COMMIT");
    return res.json({ success: true, data: { sessionId, reviewedAt: reviewed.reviewed_at } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Attendance sheet review:", error);
    return internalError(res, "Không thể ghi nhận đã kiểm tra điểm danh");
  } finally { client.release(); }
});

router.get("/amendments", protectRoute, requireTeacher, requirePermission("lms.attendance.amend.review"), async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const classId = req.query.classId ? parsePositiveId(req.query.classId) : null;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    if (!["pending", "approved", "rejected", "all"].includes(status) || (req.query.classId && !classId)) return validationError(res, "Bộ lọc không hợp lệ");
    const result = await query(
      `SELECT r.*, u.username AS student_name, u.email AS student_email, requester.username AS requested_by_name,
              reviewer.username AS reviewed_by_name, lc.title AS class_title, cs.title AS session_title, cs.start_time,
              COUNT(*) OVER() AS total_count
       FROM attendance_amendment_requests r JOIN class_sessions cs ON cs.id = r.session_id
       JOIN live_classes lc ON lc.id = cs.live_class_id JOIN users u ON u.id = r.user_id
       LEFT JOIN users requester ON requester.id = r.requested_by LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       WHERE ($1 = 'all' OR r.status = $1) AND ($2::bigint IS NULL OR lc.id = $2)
          AND ($3 = 'admin' OR EXISTS (
            SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $4 AND ct.status = 'active')
            OR (lc.instructor_id = $4 AND NOT EXISTS (
              SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $4)))
       ORDER BY r.requested_at DESC, r.id DESC LIMIT 30 OFFSET $5`,
      [status, classId, req.user.role, req.user.id, (page - 1) * 30],
    );
    res.json({ success: true, data: result.rows.map((row) => ({
      ...serializeAmendment(row), classTitle: row.class_title, sessionTitle: row.session_title, startTime: row.start_time,
    })), meta: { total: Number(result.rows[0]?.total_count || 0), page } });
  } catch (error) {
    console.error("Attendance review queue:", error);
    return internalError(res, "Không thể tải hàng đợi duyệt.");
  }
});

router.get("/session/:sessionId/amendments", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    const session = await getSessionForTeacher(sessionId);
    if (!session) return notFound(res, "Không tìm thấy buổi học");
    if (!(await canManageSession(session, req.user))) return forbidden(res, "Bạn không có quyền xem phiếu chỉnh sửa của buổi học này");
    const result = await query(
      `SELECT request.*, student.username AS student_name, student.email AS student_email,
              requester.username AS requested_by_name, reviewer.username AS reviewed_by_name
       FROM attendance_amendment_requests request
       JOIN users student ON student.id = request.user_id
       LEFT JOIN users requester ON requester.id = request.requested_by
       LEFT JOIN users reviewer ON reviewer.id = request.reviewed_by
       WHERE request.session_id = $1
       ORDER BY CASE request.status WHEN 'pending' THEN 0 ELSE 1 END, request.requested_at DESC, request.id DESC`,
      [sessionId],
    );
    return res.json({ success: true, data: result.rows.map(serializeAmendment), meta: { canReview: await mayReviewAttendance(req.user) } });
  } catch (error) {
    console.error("Error fetching attendance amendments:", error);
    return internalError(res, "Không thể tải phiếu chỉnh sửa điểm danh");
  }
});

router.post("/amendments", protectRoute, requireTeacher, requirePermission("lms.attendance.manage"), async (req, res) => {
  const sessionId = parsePositiveId(req.body?.sessionId);
  const userId = parsePositiveId(req.body?.userId);
  const requestedStatus = req.body?.requestedStatus;
  const requestedNote = normalizeNote(req.body?.requestedNote);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!sessionId || !userId || !ATTENDANCE_STATUSES.has(requestedStatus) || requestedNote.length > 255 || reason.length < 10 || reason.length > 2000) {
    return validationError(res, "Phiếu chỉnh sửa cần có học viên, trạng thái, ghi chú hợp lệ và lý do từ 10 đến 2000 ký tự");
  }
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status, lc.instructor_id
       FROM class_sessions cs JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1 FOR UPDATE`, [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy buổi học"); }
    if (!(await canManageSession(session, req.user, client))) { await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền tạo phiếu chỉnh sửa cho buổi học này"); }
    const attendance = await client.query(
      `SELECT ca.status, COALESCE(ca.note, '') AS note
       FROM class_attendance ca
       JOIN class_enrollments ce ON ce.live_class_id = $2 AND ce.user_id = ca.user_id AND ce.status = 'active'
       WHERE ca.session_id = $1 AND ca.user_id = $3 FOR UPDATE`,
      [sessionId, session.live_class_id, userId],
    );
    const current = attendance.rows[0];
    if (!current) { await client.query("ROLLBACK"); return validationError(res, "Học viên không có bản ghi điểm danh trong buổi này"); }
    if (current.status === requestedStatus && current.note === requestedNote) {
      await client.query("ROLLBACK");
      return validationError(res, "Nội dung đề nghị phải khác bản điểm danh hiện tại");
    }
    const created = await client.query(
      `INSERT INTO attendance_amendment_requests
         (session_id, user_id, original_status, original_note, requested_status, requested_note, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [sessionId, userId, current.status, current.note, requestedStatus, requestedNote, reason, req.user.id],
    );
    await recordAuditEvent({
      db: client, actorId: req.user.id, action: "attendance.amendment_requested", entityType: "attendance_amendment", entityId: created.rows[0].id,
      beforeState: { status: current.status, note: current.note }, afterState: { status: requestedStatus, note: requestedNote },
      metadata: { sessionId, userId, reason, ip: req.ip },
    });
    const reviewers = await client.query(
      `SELECT DISTINCT u.id FROM users u WHERE u.id <> $1 AND (u.role = 'admin' OR (
        EXISTS (SELECT 1 FROM lms_role_permissions rp JOIN lms_permissions p ON p.id = rp.permission_id
                WHERE rp.role = u.role::text AND rp.is_allowed AND p.code = 'lms.attendance.amend.review')
        AND (u.id = $2 OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = $3 AND ct.teacher_id = u.id AND ct.status = 'active'))))`,
      [req.user.id, session.instructor_id, session.live_class_id],
    );
    for (const reviewer of reviewers.rows) await notifyWorkflow(client, {
      userId: reviewer.id, title: "Có phiếu sửa điểm danh chờ duyệt", message: reason,
      link: "/lms/teach/attendance-review", key: `attendance-request:${created.rows[0].id}:${reviewer.id}`, actorId: req.user.id,
    });
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: serializeAmendment(created.rows[0]), message: "Đã gửi phiếu chỉnh sửa để quản trị viên duyệt" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return conflict(res, "Học viên này đã có một phiếu chỉnh sửa đang chờ duyệt", "ATTENDANCE_AMENDMENT_PENDING");
    console.error("Error creating attendance amendment:", error);
    return internalError(res, "Không thể tạo phiếu chỉnh sửa điểm danh");
  } finally {
    client.release();
  }
});

router.post("/amendments/:amendmentId/review", protectRoute, requireTeacher, requirePermission("lms.attendance.amend.review"), async (req, res) => {
  const amendmentId = parsePositiveId(req.params.amendmentId);
  const decision = req.body?.decision;
  const reviewNote = normalizeNote(req.body?.reviewNote);
  if (!amendmentId || !["approved", "rejected"].includes(decision) || reviewNote.length > 2000) return validationError(res, "Quyết định duyệt phiếu không hợp lệ");
  if (decision === "rejected" && reviewNote.length < 10) return validationError(res, "Lý do từ chối cần ít nhất 10 ký tự");
  const client = await getClient();
  let managementOutboxId = null;
  try {
    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT request.*, cs.live_class_id, cs.title AS session_title, cs.start_time, cs.end_time, cs.status AS session_status,
              lc.instructor_id, lc.management_class_source_id
       FROM attendance_amendment_requests request
       JOIN class_sessions cs ON cs.id = request.session_id
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE request.id = $1 FOR UPDATE OF request, cs`, [amendmentId],
    );
    const amendment = requestResult.rows[0];
    if (!amendment) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy phiếu chỉnh sửa"); }
    if (String(amendment.requested_by) === String(req.user.id)) { await client.query("ROLLBACK"); return forbidden(res, "Người gửi không được tự duyệt phiếu của mình"); }
    if (amendment.status !== "pending") { await client.query("ROLLBACK"); return conflict(res, "Phiếu này đã được xử lý", "ATTENDANCE_AMENDMENT_RESOLVED"); }
    if (!(await canManageSession({ live_class_id: amendment.live_class_id, instructor_id: amendment.instructor_id }, req.user, client))) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn không có quyền duyệt phiếu của lớp này");
    }
    const attendanceResult = await client.query(
      `SELECT status, COALESCE(note, '') AS note FROM class_attendance
       WHERE session_id = $1 AND user_id = $2 FOR UPDATE`, [amendment.session_id, amendment.user_id],
    );
    const current = attendanceResult.rows[0];
    if (!current) { await client.query("ROLLBACK"); return conflict(res, "Bản điểm danh gốc không còn tồn tại", "ATTENDANCE_RECORD_MISSING"); }
    let appliedAt = null;
    if (decision === "approved") {
      await assertGradebookOpen(client, amendment.live_class_id);
      if (current.status !== amendment.original_status || current.note !== amendment.original_note) {
        await client.query("ROLLBACK");
        return conflict(res, "Điểm danh đã thay đổi. Hãy từ chối phiếu cũ và tạo phiếu mới.", "ATTENDANCE_CHANGED");
      }
      appliedAt = new Date().toISOString();
      await client.query("UPDATE class_attendance SET status = $1, note = $2 WHERE session_id = $3 AND user_id = $4", [amendment.requested_status, amendment.requested_note, amendment.session_id, amendment.user_id]);
    }
    const reviewed = await client.query(
      `UPDATE attendance_amendment_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3, applied_at = $4
       WHERE id = $5 RETURNING *`,
      [decision, req.user.id, reviewNote, appliedAt, amendmentId],
    );
    await recordAuditEvent({
      db: client, actorId: req.user.id, action: `attendance.amendment_${decision}`, entityType: "attendance_amendment", entityId: amendmentId,
      beforeState: { status: current.status, note: current.note },
      afterState: decision === "approved" ? { status: amendment.requested_status, note: amendment.requested_note } : { status: current.status, note: current.note },
      metadata: { sessionId: amendment.session_id, userId: amendment.user_id, reviewNote, ip: req.ip },
    });
    if (decision === "approved" && amendment.management_class_source_id) {
      const snapshot = await client.query(
        `SELECT u.external_student_id, ca.status, COALESCE(ca.note, '') AS note, ca.checked_at
         FROM class_attendance ca JOIN users u ON u.id = ca.user_id
         WHERE ca.session_id = $1 ORDER BY ca.user_id`, [amendment.session_id],
      );
      if (snapshot.rows.every((row) => row.external_student_id)) {
        const outbox = await enqueueManagementAttendanceDelivery(client, {
          managementClassId: amendment.management_class_source_id,
          lmsSession: { id: amendment.session_id, title: amendment.session_title, start_time: amendment.start_time, end_time: amendment.end_time, status: amendment.session_status },
          attendance: snapshot.rows.map((row) => ({ managementStudentId: String(row.external_student_id), status: row.status, checkedAt: row.checked_at, note: row.note || null })),
          correlationId: `attendance-amendment:${amendment.session_id}:${amendmentId}:${crypto.randomUUID()}`,
        });
        managementOutboxId = outbox.id;
      }
    }
    await notifyWorkflow(client, {
      userId: amendment.requested_by, title: decision === "approved" ? "Phiếu sửa điểm danh đã được duyệt" : "Phiếu sửa điểm danh bị từ chối",
      message: reviewNote || "Điều chỉnh đã được áp dụng và lưu lịch sử.",
      link: `/lms/teach/classes/${amendment.live_class_id}/attendance`, key: `attendance-reviewed:${amendmentId}`, actorId: req.user.id,
    });
    await client.query("COMMIT");
    const managementDelivery = managementOutboxId ? await attemptManagementAttendanceDeliveryById(managementOutboxId).catch(() => ({ status: "pending" })) : null;
    return res.json({ success: true, data: { ...serializeAmendment(reviewed.rows[0]), managementDelivery }, message: decision === "approved" ? "Đã duyệt và áp dụng chỉnh sửa điểm danh" : "Đã từ chối phiếu chỉnh sửa" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error reviewing attendance amendment:", error);
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return internalError(res, "Không thể duyệt phiếu chỉnh sửa điểm danh");
  } finally {
    client.release();
  }
});

// POST /api/attendance/check — transactional, same-day and write-once per session.
router.post("/check", protectRoute, requireTeacher, requirePermission("lms.attendance.manage"), async (req, res) => {
  const sessionId = parsePositiveId(req.body?.sessionId);
  const attendanceList = req.body?.attendanceList;
  if (!sessionId || !Array.isArray(attendanceList) || attendanceList.length === 0) {
    return validationError(res, "Thiếu sessionId hoặc attendanceList");
  }
  if (attendanceList.length > 1000) return validationError(res, "attendanceList vượt quá giới hạn");

  const normalized = [];
  const seen = new Set();
  for (const item of attendanceList) {
    const userId = parsePositiveId(item?.userId);
    const status = item?.status || "present";
    if (!userId || !ATTENDANCE_STATUSES.has(status) || (item?.note !== undefined && (typeof item.note !== "string" || item.note.length > 255))) {
      return validationError(res, "Danh sách điểm danh không hợp lệ");
    }
    if (seen.has(userId)) return validationError(res, "Một học viên chỉ được xuất hiện một lần trong attendanceList");
    seen.add(userId);
    normalized.push({ userId, status, note: item.note?.trim() || "" });
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
       `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
               lc.instructor_id, lc.management_class_source_id,
               (cs.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS attendance_date,
               (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS attendance_today
        FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1
       FOR UPDATE`,
      [sessionId],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy buổi học");
    }
    if (!(await canManageSession(session, req.user, client))) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn không có quyền điểm danh buổi học này");
    }
    await assertGradebookOpen(client, session.live_class_id);

    // All student and teacher writes lock the session first. Student records
    // may exist before the teacher finalizes the roster.
    const existingAttendance = await client.query(
      `SELECT 1 FROM class_attendance_sheets WHERE session_id = $1`,
      [sessionId],
    );
    const attendancePolicy = buildAttendancePolicy({
      attendanceDate: session.attendance_date,
      todayDate: session.attendance_today,
      status: session.status,
      attendanceLocked: existingAttendance.rows.length > 0,
    });
    if (session.status === "cancelled") {
      await client.query("ROLLBACK");
      return validationError(res, "Không thể điểm danh buổi học đã hủy");
    }
    if (!attendancePolicy.isAttendanceDay) {
      await client.query("ROLLBACK");
      return conflict(
        res,
        `Chỉ được điểm danh trong ngày ${attendancePolicy.attendanceDate.split("-").reverse().join("/")} của buổi học.`,
        "ATTENDANCE_OUTSIDE_SESSION_DAY",
      );
    }
    if (attendancePolicy.isLocked) {
      await client.query("ROLLBACK");
      return conflict(
        res,
        "Điểm danh của buổi học này đã được chốt và không thể chỉnh sửa.",
        "ATTENDANCE_LOCKED",
      );
    }

    const enrolledResult = await client.query(
      `SELECT ce.user_id, u.external_student_id
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.live_class_id = $1 AND ce.status = 'active'`,
      [session.live_class_id],
    );
    const enrolledIds = new Set(enrolledResult.rows.map((row) => String(row.user_id)));
    if (
      normalized.length !== enrolledIds.size
      || normalized.some((item) => !enrolledIds.has(String(item.userId)))
    ) {
      await client.query("ROLLBACK");
      return validationError(res, "Phải điểm danh đầy đủ tất cả học viên đang thuộc lớp của buổi học");
    }

    const checkedAt = new Date().toISOString();
    for (const item of normalized) {
      const old = await client.query(
        `SELECT status, COALESCE(note, '') AS note, source FROM class_attendance
         WHERE session_id = $1 AND user_id = $2`, [sessionId, item.userId],
      );
      await client.query(
        `INSERT INTO class_attendance (session_id, user_id, status, note, source)
         VALUES ($1, $2, $3, $4, 'teacher')
         ON CONFLICT (user_id, session_id) DO UPDATE
         SET status = EXCLUDED.status, note = EXCLUDED.note, source = 'teacher'`,
        [sessionId, item.userId, item.status, item.note],
      );
      if (old.rows[0] && (old.rows[0].status !== item.status || old.rows[0].note !== item.note)) {
        await recordAuditEvent({
          db: client, actorId: req.user.id, action: "attendance.teacher_overrode_check_in",
          entityType: "class_attendance", entityId: sessionId,
          beforeState: { userId: item.userId, status: old.rows[0].status, note: old.rows[0].note, source: old.rows[0].source },
          afterState: { userId: item.userId, status: item.status, note: item.note, source: "teacher" },
          metadata: { sessionId, ip: req.ip },
        });
      }
    }
    await client.query(
      `INSERT INTO class_attendance_sheets (session_id, finalized_by) VALUES ($1, $2)`,
      [sessionId, req.user.id],
    );
    await recordAuditEvent({
      db: client, actorId: req.user.id, action: "attendance.sheet_finalized",
      entityType: "class_session", entityId: sessionId,
      afterState: { recordedCount: normalized.length }, metadata: { ip: req.ip },
    });
    const admins = await client.query("SELECT id FROM users WHERE role = 'admin' AND id <> $1", [req.user.id]);
    for (const admin of admins.rows) await notifyWorkflow(client, {
      userId: admin.id, title: "Có bản điểm danh mới cần kiểm tra",
      message: `${session.title}: ${normalized.length} học viên đã được chốt điểm danh.`,
      link: "/admin/attendance-review", key: `attendance-sheet-finalized:${sessionId}:${admin.id}`,
      actorId: req.user.id,
    });

    let managementDelivery = {
      status: "NOT_MANAGED",
      automatic: false,
      message: "Lớp này chưa được liên kết với InternalManagement.",
    };
    let managementOutboxId = null;
    if (session.management_class_source_id) {
      const managementStudentIds = new Map(
        enrolledResult.rows.map((row) => [String(row.user_id), row.external_student_id]),
      );
      const missingMappings = normalized
        .filter((item) => !managementStudentIds.get(String(item.userId)))
        .map((item) => item.userId);
      if (missingMappings.length > 0) {
        managementDelivery = {
          status: "BLOCKED",
          automatic: false,
          message: "Một số học viên chưa có mã liên kết InternalManagement.",
          missingLmsUserIds: missingMappings,
        };
      } else {
        const correlationId = `attendance:${sessionId}:${crypto.randomUUID()}`;
        const outbox = await enqueueManagementAttendanceDelivery(client, {
          managementClassId: session.management_class_source_id,
          lmsSession: session,
          attendance: normalized.map((item) => ({
            managementStudentId: String(managementStudentIds.get(String(item.userId))),
            status: item.status,
            checkedAt,
            note: item.note || null,
          })),
          correlationId,
        });
        managementOutboxId = outbox.id;
        managementDelivery = {
          status: "PENDING",
          automatic: true,
          eventId: outbox.event_id,
        };
      }
    }
    await client.query("COMMIT");

    if (managementOutboxId) {
      managementDelivery = {
        ...managementDelivery,
        ...(await attemptManagementAttendanceDeliveryById(managementOutboxId)),
        automatic: true,
      };
    }

    return res.json({
      success: true,
      data: {
        sessionId,
        recordedCount: normalized.length,
        recordedAt: checkedAt,
        attendanceLocked: true,
        managementDelivery,
      },
      message: managementDelivery.status === "SUCCESS"
        ? "Điểm danh đã được lưu vào InternalManagement và gửi admin kiểm tra"
        : "Điểm danh đã được chốt, khóa chỉnh sửa và gửi admin kiểm tra",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error checking attendance:", error);
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return internalError(res, "Lỗi khi điểm danh học viên");
  } finally {
    client.release();
  }
});

export default router;
