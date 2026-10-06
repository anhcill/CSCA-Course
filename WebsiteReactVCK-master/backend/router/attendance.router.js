import express from "express";
import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import {
  attemptManagementAttendanceDeliveryById,
  enqueueManagementAttendanceDelivery,
} from "../services/managementAttendanceDelivery.service.js";
import { recordAuditEvent } from "../services/audit.service.js";

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

// Attendance is a same-day, write-once base record. Dates are calculated by
// PostgreSQL in the academy timezone so a browser clock cannot bypass this
// policy. Once submitted, it is never reopened; an approved amendment records
// the old and new values, requester, reviewer and timestamps separately.
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
              SELECT 1 FROM class_attendance ca WHERE ca.session_id = cs.id
            ) AS attendance_locked
     FROM class_sessions cs
     JOIN live_classes lc ON lc.id = cs.live_class_id
     WHERE cs.id = $1`,
    [sessionId],
  );
  return result.rows[0] || null;
};

const canManageSession = async (session, user, db = { query }) => {
  if (!session) return false;
  if (user.role === "admin" || String(session.instructor_id) === String(user.id)) return true;
  if (user.role !== "creator") return false;
  const result = await db.query(
    `SELECT 1 FROM class_teachers
     WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'`,
    [session.live_class_id, user.id],
  );
  return result.rows.length > 0;
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
      if (req.user.role === "creator" && String(classResult.rows[0].instructor_id) !== String(req.user.id)) {
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
              ca.checked_at,
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
    return res.json({ success: true, data: result.rows.map(serializeAmendment), meta: { canReview: req.user.role === "admin" } });
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
    await client.query("COMMIT");
    const managementDelivery = managementOutboxId ? await attemptManagementAttendanceDeliveryById(managementOutboxId) : null;
    return res.json({ success: true, data: { ...serializeAmendment(reviewed.rows[0]), managementDelivery }, message: decision === "approved" ? "Đã duyệt và áp dụng chỉnh sửa điểm danh" : "Đã từ chối phiếu chỉnh sửa" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error reviewing attendance amendment:", error);
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

    // The session row is locked first, which serializes all attendance writes
    // through this endpoint. It prevents two concurrent submissions from both
    // passing the write-once check below.
    const existingAttendance = await client.query(
      `SELECT 1 FROM class_attendance WHERE session_id = $1 LIMIT 1`,
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
      await client.query(
        `INSERT INTO class_attendance (session_id, user_id, status, note)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, item.userId, item.status, item.note],
      );
    }

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
        ? "Điểm danh đã được lưu vào InternalManagement"
        : "Điểm danh đã được chốt và khóa chỉnh sửa",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error checking attendance:", error);
    return internalError(res, "Lỗi khi điểm danh học viên");
  } finally {
    client.release();
  }
});

export default router;
