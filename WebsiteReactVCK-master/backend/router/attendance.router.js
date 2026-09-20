import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";

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

const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const getSessionForTeacher = async (sessionId) => {
  const result = await query(
    `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
            lc.title AS class_title, lc.instructor_id
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

// POST /api/attendance/check — transactional and idempotent per (session_id, user_id).
router.post("/check", protectRoute, requireTeacher, requirePermission("lms.attendance.manage"), async (req, res) => {
  const sessionId = parsePositiveId(req.body?.sessionId);
  const attendanceList = req.body?.attendanceList;
  if (!sessionId || !Array.isArray(attendanceList) || attendanceList.length === 0) {
    return validationError(res, "Thiếu sessionId hoặc attendanceList");
  }
  if (attendanceList.length > 1000) return validationError(res, "attendanceList vượt quá giới hạn");

  const allowedStatuses = new Set(["present", "absent", "excused"]);
  const normalized = [];
  const seen = new Set();
  for (const item of attendanceList) {
    const userId = parsePositiveId(item?.userId);
    const status = item?.status || "present";
    if (!userId || !allowedStatuses.has(status) || (item?.note !== undefined && (typeof item.note !== "string" || item.note.length > 255))) {
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
      `SELECT cs.id, cs.live_class_id, cs.status, lc.instructor_id
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
    if (session.status === "cancelled") {
      await client.query("ROLLBACK");
      return validationError(res, "Không thể điểm danh buổi học đã hủy");
    }

    const userIds = normalized.map((item) => item.userId);
    const enrolledResult = await client.query(
      `SELECT user_id
       FROM class_enrollments
       WHERE live_class_id = $1 AND status = 'active' AND user_id = ANY($2::bigint[])`,
      [session.live_class_id, userIds],
    );
    const enrolledIds = new Set(enrolledResult.rows.map((row) => String(row.user_id)));
    if (normalized.some((item) => !enrolledIds.has(String(item.userId)))) {
      await client.query("ROLLBACK");
      return validationError(res, "Chỉ được điểm danh học viên thuộc lớp của buổi học");
    }

    for (const item of normalized) {
      await client.query(
        `INSERT INTO class_attendance (session_id, user_id, status, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, session_id) DO UPDATE
           SET status = EXCLUDED.status, note = EXCLUDED.note, checked_at = NOW()`,
        [sessionId, item.userId, item.status, item.note],
      );
    }
    await client.query("COMMIT");

    return res.json({
      success: true,
      data: { sessionId, updatedCount: normalized.length },
      message: "Điểm danh học viên thành công",
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
