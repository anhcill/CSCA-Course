import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import { query } from "../db/connect.js";

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

const parsePage = (value, fallback, max) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const classScope = (user, classId = null, alias = "lc") => {
  const params = [user.id];
  const clauses = [`${alias}.status <> 'cancelled'`];
  if (user.role !== "admin") clauses.push(`${alias}.instructor_id = $1`);
  else clauses.push("$1::bigint IS NOT NULL");
  if (classId) {
    params.push(classId);
    clauses.push(`${alias}.id = $${params.length}`);
  }
  return { clause: clauses.join(" AND "), params };
};

const ensureManagedClass = async (classId, user) => {
  const result = await query(
    `SELECT lc.id, lc.title, lc.course_id, lc.instructor_id, lc.description,
            lc.max_students, lc.status, lc.created_at, lc.updated_at,
            COALESCE(c.title, c.name) AS course_title,
            u.username AS instructor_name
     FROM live_classes lc
     LEFT JOIN courses c ON c.id = lc.course_id
     LEFT JOIN users u ON u.id = lc.instructor_id
     WHERE lc.id = $1`,
    [classId],
  );
  const liveClass = result.rows[0];
  if (!liveClass) return { error: "not_found" };
  if (user.role !== "admin" && String(liveClass.instructor_id) !== String(user.id)) return { error: "forbidden" };
  return { liveClass };
};

const serializeClass = (row) => ({
  id: row.id,
  code: `LIVE-${row.id}`,
  title: row.title,
  description: row.description || "",
  courseId: row.course_id,
  courseTitle: row.course_title || null,
  status: row.status,
  totalStudents: Number(row.enrolled_count || 0),
  attendanceRate: row.attendance_rate === null ? null : Number(row.attendance_rate),
  progressPct: row.progress_pct === null ? null : Number(row.progress_pct),
  totalSessions: Number(row.total_sessions || 0),
  completedSessions: Number(row.completed_sessions || 0),
  schedule: row.schedule || "Chưa thiết lập lịch",
  nextSession: row.next_session_start || null,
  nextSessionTitle: row.next_session_title || null,
  isLiveNow: row.next_session_status === "live",
  meetUrl: row.next_meet_url || null,
});

const serializeRisk = (row) => ({
  id: row.user_id,
  name: row.student_name || row.email,
  email: row.email,
  avatar: row.avatar_url || null,
  className: row.class_name,
  classId: row.class_id,
  riskReason: row.risk_reason,
  riskLevel: row.risk_level,
  gpa: row.gpa === null ? null : Number(row.gpa),
  attendanceRate: row.attendance_rate === null ? null : `${Number(row.attendance_rate)}%`,
  missedSessionsCount: Number(row.absent_sessions || 0),
  progressPct: row.progress_pct === null ? null : Number(row.progress_pct),
  assignmentsSubmitted: Number(row.submitted_assignments || 0),
  totalAssignments: Number(row.total_assignments || 0),
  lastActive: row.last_active || null,
  note: row.risk_reason,
});

const serializeSubmission = (row) => ({
  id: row.id,
  assignmentId: row.assignment_id,
  classId: row.class_id,
  studentName: row.student_name || row.email,
  studentEmail: row.email,
  studentAvatar: row.avatar_url || null,
  assignmentTitle: row.assignment_title,
  className: row.class_name,
  track: row.track || row.assignment_type,
  submittedAt: row.submitted_at,
  type: row.assignment_type,
  status: row.status,
  maxScore: Number(row.max_score),
  dueDate: row.due_date,
});

const buildDashboardClassesQuery = (scope) => `
  SELECT lc.id, lc.title, lc.course_id, lc.instructor_id, lc.description, lc.status,
         COALESCE(c.title, c.name) AS course_title,
         roster.enrolled_count,
         session_stats.total_sessions,
         session_stats.completed_sessions,
         session_stats.attendance_rate,
         progress.progress_pct,
         schedules.schedule,
         next_session.start_time AS next_session_start,
         next_session.title AS next_session_title,
         next_session.status AS next_session_status,
         next_session.meet_url AS next_meet_url
  FROM live_classes lc
  LEFT JOIN courses c ON c.id = lc.course_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE ce.status = 'active')::int AS enrolled_count
    FROM class_enrollments ce
    WHERE ce.live_class_id = lc.id
  ) roster ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE cs.status <> 'cancelled')::int AS total_sessions,
           COUNT(*) FILTER (WHERE cs.status = 'ended' OR cs.end_time <= NOW())::int AS completed_sessions,
           COALESCE(ROUND(
             100.0 * COUNT(ca.id) FILTER (WHERE ca.status = 'present') /
             NULLIF(COUNT(ca.id) FILTER (WHERE ca.status IN ('present', 'absent', 'excused')), 0), 1
           ), 0) AS attendance_rate
    FROM class_sessions cs
    LEFT JOIN class_attendance ca ON ca.session_id = cs.id
    WHERE cs.live_class_id = lc.id AND cs.status <> 'cancelled'
  ) session_stats ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(ROUND(AVG(
      CASE WHEN totals.total_lessons > 0
        THEN 100.0 * completed.completed_lessons / totals.total_lessons
        ELSE NULL END
    ), 1), 0) AS progress_pct
    FROM class_enrollments ce
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_lessons
      FROM lessons l
      WHERE lc.course_id IS NOT NULL AND l.course_id = lc.course_id AND COALESCE(l.is_published, true) = true
    ) totals
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE lp.is_completed)::numeric AS completed_lessons
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      WHERE ce.user_id = lp.user_id AND lp.course_id = lc.course_id
        AND l.course_id = lc.course_id AND COALESCE(l.is_published, true) = true
    ) completed ON true
    WHERE ce.live_class_id = lc.id AND ce.status = 'active'
  ) progress ON true
  LEFT JOIN LATERAL (
    SELECT STRING_AGG(
      CASE cs.day_of_week
        WHEN 1 THEN 'T2' WHEN 2 THEN 'T3' WHEN 3 THEN 'T4' WHEN 4 THEN 'T5'
        WHEN 5 THEN 'T6' WHEN 6 THEN 'T7' WHEN 7 THEN 'CN' ELSE 'Ngày khác'
      END || ' ' || TO_CHAR(cs.start_time, 'HH24:MI') || '-' || TO_CHAR(cs.end_time, 'HH24:MI'),
      ', ' ORDER BY cs.day_of_week, cs.start_time
    ) AS schedule
    FROM class_schedules cs
    WHERE cs.live_class_id = lc.id
  ) schedules ON true
  LEFT JOIN LATERAL (
    SELECT cs.start_time, cs.title, cs.status, cs.meet_url
    FROM class_sessions cs
    WHERE cs.live_class_id = lc.id
      AND cs.status <> 'cancelled'
      AND (cs.status = 'live' OR cs.end_time >= NOW())
    ORDER BY CASE WHEN cs.status = 'live' THEN 0 ELSE 1 END, cs.start_time ASC
    LIMIT 1
  ) next_session ON true
  WHERE ${scope.clause}
  ORDER BY CASE WHEN next_session.status = 'live' THEN 0 ELSE 1 END, next_session.start_time NULLS LAST, lc.created_at DESC
`;

const buildRiskQuery = (scope) => `
  WITH managed_classes AS (
    SELECT lc.id, lc.title, lc.course_id, lc.instructor_id
    FROM live_classes lc
    WHERE ${scope.clause}
  )
  SELECT ce.user_id, mc.id AS class_id, mc.title AS class_name,
         u.username AS student_name, u.email, u.avatar_url,
         attendance.present_sessions, attendance.absent_sessions,
         attendance.attendance_rate,
         progress.progress_pct, progress.last_active,
         grades.gpa,
         assignments.total_assignments, assignments.submitted_assignments,
         assignments.overdue_missing,
         CASE
           WHEN attendance.absent_sessions >= 3 OR attendance.attendance_rate < 70
             OR grades.gpa < 5 OR progress.progress_pct < 20 THEN 'danger'
           ELSE 'warning'
         END AS risk_level,
         CONCAT_WS(', ',
           CASE WHEN attendance.absent_sessions >= 2 THEN 'Vắng ' || attendance.absent_sessions || ' buổi' END,
           CASE WHEN attendance.attendance_rate < 70 THEN 'Chuyên cần dưới 70%' END,
           CASE WHEN grades.gpa < 5 THEN 'Điểm trung bình dưới 5' END,
           CASE WHEN assignments.overdue_missing > 0 THEN 'Thiếu ' || assignments.overdue_missing || ' bài quá hạn' END,
           CASE WHEN progress.progress_pct < 30 THEN 'Tiến độ học dưới 30%' END
         ) AS risk_reason
  FROM class_enrollments ce
  JOIN managed_classes mc ON mc.id = ce.live_class_id
  JOIN users u ON u.id = ce.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW())::int AS total_sessions,
           COUNT(DISTINCT ca.session_id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'present')::int AS present_sessions,
           COUNT(DISTINCT ca.session_id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'absent')::int AS absent_sessions,
           COALESCE(ROUND(
             100.0 * COUNT(DISTINCT ca.session_id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'present') /
             NULLIF(COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW()), 0), 1
           ), 100) AS attendance_rate
    FROM class_sessions cs
    LEFT JOIN class_attendance ca ON ca.session_id = cs.id AND ca.user_id = ce.user_id
    WHERE cs.live_class_id = mc.id AND cs.status <> 'cancelled'
  ) attendance ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN COUNT(l.id) > 0
      THEN ROUND(100.0 * COUNT(lp.id) FILTER (WHERE lp.is_completed) / COUNT(l.id), 1)
      ELSE NULL END AS progress_pct,
      MAX(lp.updated_at) AS last_active
    FROM lessons l
    LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
    WHERE mc.course_id IS NOT NULL AND l.course_id = mc.course_id AND COALESCE(l.is_published, true) = true
  ) progress ON true
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(latest_grade.score), 1) AS gpa
    FROM assignment_submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN LATERAL (
      SELECT sg.score FROM submission_grades sg
      WHERE sg.submission_id = s.id ORDER BY sg.graded_at DESC, sg.id DESC LIMIT 1
    ) latest_grade ON true
    WHERE s.user_id = ce.user_id
      AND (a.live_class_id = mc.id OR (a.live_class_id IS NULL AND mc.course_id IS NOT NULL AND a.course_id = mc.course_id))
      AND (a.live_class_id IS NOT NULL OR a.course_id IS NOT NULL)
  ) grades ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT a.id)::int AS total_assignments,
           COUNT(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL)::int AS submitted_assignments,
           COUNT(DISTINCT a.id) FILTER (WHERE a.due_date < NOW() AND s.id IS NULL)::int AS overdue_missing
    FROM assignments a
    LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = ce.user_id
    WHERE (a.live_class_id = mc.id OR (a.live_class_id IS NULL AND mc.course_id IS NOT NULL AND a.course_id = mc.course_id))
      AND (a.live_class_id IS NOT NULL OR a.course_id IS NOT NULL)
  ) assignments ON true
  WHERE ce.status = 'active'
    AND (attendance.absent_sessions >= 2 OR attendance.attendance_rate < 70 OR grades.gpa < 5
      OR progress.progress_pct < 30 OR assignments.overdue_missing > 0)
  ORDER BY CASE WHEN attendance.absent_sessions >= 3 OR attendance.attendance_rate < 70 OR grades.gpa < 5 THEN 0 ELSE 1 END,
           assignments.overdue_missing DESC, ce.user_id
  LIMIT 50
`;

const buildPendingQuery = (scope, statusFilter = "all", page = 1, limit = 8) => {
  const params = [...scope.params];
  const filters = [
    scope.clause,
    "s.status IN ('submitted', 'late')",
    "(a.live_class_id = lc.id OR (a.live_class_id IS NULL AND lc.course_id IS NOT NULL AND a.course_id = lc.course_id))",
  ];
  if (statusFilter === "late") filters.push("s.status = 'late'");
  if (statusFilter === "submitted") filters.push("s.status = 'submitted'");
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push((page - 1) * limit);
  const offsetParam = `$${params.length}`;
  return {
    params,
    text: `
      SELECT DISTINCT ON (s.id)
             s.id, s.assignment_id, s.status, s.submitted_at,
             a.title AS assignment_title, a.assignment_type, a.max_score, a.due_date,
             lc.id AS class_id, lc.title AS class_name,
             u.username AS student_name, u.email, u.avatar_url,
             COALESCE(c.category, a.assignment_type) AS track
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN users u ON u.id = s.user_id
      JOIN live_classes lc ON ${scope.clause}
      LEFT JOIN courses c ON c.id = COALESCE(a.course_id, lc.course_id)
      WHERE ${filters.join(" AND ")}
      ORDER BY s.id, s.submitted_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
  };
};

// GET /api/teacher/dashboard-stats — one aggregation payload for Teacher Hub.
router.get("/dashboard-stats", protectRoute, requireTeacher, async (req, res) => {
  try {
    const classId = req.query.classId ? parsePositiveId(req.query.classId) : null;
    if (req.query.classId && !classId) return validationError(res, "classId không hợp lệ");
    if (classId) {
      const access = await ensureManagedClass(classId, req.user);
      if (access.error === "not_found") return notFound(res, "Không tìm thấy lớp học");
      if (access.error === "forbidden") return forbidden(res, "Bạn không có quyền xem lớp học này");
    }

    const page = parsePage(req.query.page, 1, 100000);
    const limit = parsePage(req.query.limit, 8, 50);
    const statusFilter = ["all", "submitted", "late"].includes(req.query.status) ? req.query.status : "all";
    const scope = classScope(req.user, classId);
    const pendingQuery = buildPendingQuery(scope, statusFilter, page, limit);
    const pendingCountParams = [...scope.params];

    const [classesResult, riskResult, pendingResult, pendingCountResult, todayResult] = await Promise.all([
      query(buildDashboardClassesQuery(scope), scope.params),
      query(buildRiskQuery(scope), scope.params),
      query(pendingQuery.text, pendingQuery.params),
      query(
        `SELECT COUNT(DISTINCT s.id)::int AS count
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN live_classes lc ON (a.live_class_id = lc.id OR (a.live_class_id IS NULL AND lc.course_id IS NOT NULL AND a.course_id = lc.course_id))
         WHERE ${scope.clause} AND s.status IN ('submitted', 'late')`,
        pendingCountParams,
      ),
      query(
        `SELECT cs.id, cs.live_class_id AS class_id, cs.title, cs.start_time, cs.end_time, cs.status, cs.meet_url,
                lc.title AS class_name
         FROM class_sessions cs
         JOIN live_classes lc ON lc.id = cs.live_class_id
         WHERE ${scope.clause}
           AND cs.status <> 'cancelled'
           AND (cs.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         ORDER BY cs.start_time ASC`,
        scope.params,
      ),
    ]);

    const classes = classesResult.rows.map(serializeClass);
    const averageAttendance = classes.length > 0
      ? Number((classes.reduce((sum, item) => sum + (item.attendanceRate || 0), 0) / classes.length).toFixed(1))
      : 0;
    const totalStudentsResult = await query(
      `SELECT COUNT(DISTINCT ce.user_id)::int AS count
       FROM class_enrollments ce
       JOIN live_classes lc ON lc.id = ce.live_class_id
       WHERE ${scope.clause} AND ce.status = 'active'`,
      scope.params,
    );

    return res.json({
      success: true,
      data: {
        stats: {
          activeClassesCount: classes.length,
          totalStudentsCount: Number(totalStudentsResult.rows[0]?.count || 0),
          pendingGradingCount: Number(pendingCountResult.rows[0]?.count || 0),
          attendanceRate: averageAttendance,
          todaySessionsCount: todayResult.rows.length,
        },
        classes,
        todaySessions: todayResult.rows.map((row) => ({
          id: row.id,
          classId: row.class_id,
          className: row.class_name,
          title: row.title,
          startTime: row.start_time,
          endTime: row.end_time,
          status: row.status,
          meetUrl: row.meet_url || null,
        })),
        atRiskStudents: riskResult.rows.map(serializeRisk),
        pendingSubmissions: pendingResult.rows.map(serializeSubmission),
        pagination: {
          page,
          limit,
          total: Number(pendingCountResult.rows[0]?.count || 0),
          totalPages: Math.ceil(Number(pendingCountResult.rows[0]?.count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching teacher dashboard:", error);
    return internalError(res, "Lỗi khi tổng hợp bảng điều khiển giảng viên");
  }
});

// GET /api/teacher/classes/:classId/detail — roster/progress/attendance/assignment status.
router.get("/classes/:classId/detail", protectRoute, requireTeacher, async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const access = await ensureManagedClass(classId, req.user);
    if (access.error === "not_found") return notFound(res, "Không tìm thấy lớp học");
    if (access.error === "forbidden") return forbidden(res, "Bạn không có quyền xem lớp học này");
    const liveClass = access.liveClass;
    const ownerFilter = req.user.role === "admin" ? "$3::bigint IS NOT NULL" : "a.instructor_id = $3";
    const quizOwnerFilter = req.user.role === "admin" ? "TRUE" : "(q.instructor_id = $3 OR EXISTS (SELECT 1 FROM courses c WHERE c.id = q.course_id AND c.author_id = $3))";
    const baseParams = [classId, liveClass.course_id, req.user.id];

    const [studentsResult, assignmentsResult, quizRowsResult, summaryResult] = await Promise.all([
      query(
        `SELECT ce.user_id AS id, u.username AS name, u.email, u.avatar_url AS avatar,
                ce.enrolled_at, ce.status,
                attendance.present_sessions, attendance.absent_sessions, attendance.excused_sessions,
                attendance.attendance_rate,
                progress.lessons_completed, progress.total_lessons, progress.progress_pct, progress.last_active,
                grades.gpa,
                assignments.submitted_assignments, assignments.total_assignments
         FROM class_enrollments ce
         JOIN users u ON u.id = ce.user_id
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'present')::int AS present_sessions,
                  COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'absent')::int AS absent_sessions,
                  COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'excused')::int AS excused_sessions,
                  COALESCE(ROUND(100.0 * COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW() AND ca.status = 'present') /
                    NULLIF(COUNT(DISTINCT cs.id) FILTER (WHERE cs.end_time <= NOW()), 0), 1), 100) AS attendance_rate
           FROM class_sessions cs
           LEFT JOIN class_attendance ca ON ca.session_id = cs.id AND ca.user_id = ce.user_id
           WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
         ) attendance ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(l.id)::int AS total_lessons,
                  COUNT(lp.id) FILTER (WHERE lp.is_completed)::int AS lessons_completed,
                  CASE WHEN COUNT(l.id) > 0 THEN ROUND(100.0 * COUNT(lp.id) FILTER (WHERE lp.is_completed) / COUNT(l.id), 1) ELSE NULL END AS progress_pct,
                  MAX(lp.updated_at) AS last_active
           FROM lessons l
           LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce.user_id
           WHERE $2::bigint IS NOT NULL AND l.course_id = $2::bigint AND COALESCE(l.is_published, true) = true
         ) progress ON true
         LEFT JOIN LATERAL (
           SELECT ROUND(AVG(latest_grade.score), 1) AS gpa
           FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id
           JOIN LATERAL (SELECT sg.score FROM submission_grades sg WHERE sg.submission_id = s.id ORDER BY sg.graded_at DESC, sg.id DESC LIMIT 1) latest_grade ON true
           WHERE s.user_id = ce.user_id
             AND (a.live_class_id = $1 OR (a.live_class_id IS NULL AND $2::bigint IS NOT NULL AND a.course_id = $2::bigint))
             AND ${ownerFilter}
         ) grades ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT a.id)::int AS total_assignments,
                  COUNT(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL)::int AS submitted_assignments
           FROM assignments a
           LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = ce.user_id
           WHERE (a.live_class_id = $1 OR (a.live_class_id IS NULL AND $2::bigint IS NOT NULL AND a.course_id = $2::bigint))
             AND ${ownerFilter}
         ) assignments ON true
         WHERE ce.live_class_id = $1 AND ce.status = 'active'
         ORDER BY LOWER(COALESCE(u.username, u.email)), ce.user_id`,
        baseParams,
      ),
      query(
        `SELECT a.id, a.title, a.assignment_type, a.due_date, a.class_session_id,
                cs.title AS session_title, cs.start_time AS session_start,
                COUNT(DISTINCT ce.user_id)::int AS total_count,
                COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('submitted', 'late', 'graded'))::int AS submitted_count,
                COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('submitted', 'late'))::int AS pending_grading_count,
                ROUND(AVG(latest_grade.score), 1) AS avg_score
         FROM assignments a
         LEFT JOIN class_sessions cs ON cs.id = a.class_session_id
         LEFT JOIN class_enrollments ce ON ce.live_class_id = $1 AND ce.status = 'active'
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = ce.user_id
         LEFT JOIN LATERAL (SELECT sg.score FROM submission_grades sg WHERE sg.submission_id = s.id ORDER BY sg.graded_at DESC, sg.id DESC LIMIT 1) latest_grade ON true
         WHERE (a.live_class_id = $1 OR (a.live_class_id IS NULL AND $2::bigint IS NOT NULL AND a.course_id = $2::bigint))
           AND ${ownerFilter}
         GROUP BY a.id, cs.id
         ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
        baseParams,
      ),
      query(
        `SELECT q.id, q.title, 'quiz' AS assignment_type, q.activity_scope, q.due_date,
                cs.id AS class_session_id, cs.title AS session_title, cs.start_time AS session_start,
                (SELECT COUNT(*)::int FROM class_enrollments ce WHERE ce.live_class_id = $1 AND ce.status = 'active') AS total_count,
                COUNT(DISTINCT qa.id) FILTER (WHERE qa.status = 'submitted')::int AS submitted_count,
                0::int AS pending_grading_count,
                ROUND(AVG(qa.score), 1) AS avg_score
         FROM quizzes q
         JOIN class_sessions cs ON cs.id = q.class_session_id
         LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
         WHERE q.live_class_id = $1 AND q.course_id = $2 AND ${quizOwnerFilter}
         GROUP BY q.id, cs.id
         ORDER BY CASE WHEN cs.start_time >= NOW() THEN 0 ELSE 1 END, cs.start_time ASC, q.created_at DESC`,
        baseParams,
      ),
      query(
        `SELECT COUNT(cs.id) FILTER (WHERE cs.status <> 'cancelled')::int AS total_sessions,
                COUNT(cs.id) FILTER (WHERE cs.status = 'ended' OR cs.end_time <= NOW())::int AS completed_sessions,
                COALESCE(ROUND(100.0 * COUNT(ca.id) FILTER (WHERE ca.status = 'present') /
                  NULLIF(COUNT(ca.id) FILTER (WHERE ca.status IN ('present', 'absent', 'excused')), 0), 1), 0) AS attendance_rate,
                COALESCE(ROUND(AVG(student_progress.progress_pct), 1), 0) AS progress_pct,
                ROUND(AVG(student_grades.gpa), 1) AS avg_gpa,
                next_session.start_time AS next_session_start,
                next_session.meet_url AS next_meet_url
         FROM class_sessions cs
         LEFT JOIN class_attendance ca ON ca.session_id = cs.id
         LEFT JOIN LATERAL (
           SELECT CASE WHEN COUNT(l.id) > 0 THEN ROUND(100.0 * COUNT(lp.id) FILTER (WHERE lp.is_completed) / COUNT(l.id), 1) ELSE NULL END AS progress_pct
           FROM class_enrollments ce2
           JOIN lessons l ON $2::bigint IS NOT NULL AND l.course_id = $2::bigint AND COALESCE(l.is_published, true) = true
           LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ce2.user_id
           WHERE ce2.live_class_id = $1 AND ce2.status = 'active'
         ) student_progress ON true
         LEFT JOIN LATERAL (
           SELECT ROUND(AVG(sg.score), 1) AS gpa
           FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id
           JOIN LATERAL (SELECT sg2.score FROM submission_grades sg2 WHERE sg2.submission_id = s.id ORDER BY sg2.graded_at DESC, sg2.id DESC LIMIT 1) sg ON true
           WHERE a.live_class_id = $1 OR (a.live_class_id IS NULL AND $2::bigint IS NOT NULL AND a.course_id = $2::bigint)
         ) student_grades ON true
         LEFT JOIN LATERAL (
           SELECT start_time, meet_url FROM class_sessions
           WHERE live_class_id = $1 AND status <> 'cancelled' AND (status = 'live' OR end_time >= NOW())
           ORDER BY CASE WHEN status = 'live' THEN 0 ELSE 1 END, start_time LIMIT 1
         ) next_session ON true
         WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
         GROUP BY next_session.start_time, next_session.meet_url`,
        [classId, liveClass.course_id],
      ),
    ]);

    const students = studentsResult.rows.map((row) => {
      const attendanceRate = row.attendance_rate === null ? null : Number(row.attendance_rate);
      const gpa = row.gpa === null ? null : Number(row.gpa);
      const progressPct = row.progress_pct === null ? null : Number(row.progress_pct);
      const absent = Number(row.absent_sessions || 0);
      const hasRisk = absent >= 2 || (attendanceRate !== null && attendanceRate < 70) || (gpa !== null && gpa < 5) || (progressPct !== null && progressPct < 30);
      const danger = absent >= 3 || (attendanceRate !== null && attendanceRate < 70) || (gpa !== null && gpa < 5) || (progressPct !== null && progressPct < 20);
      return {
        id: row.id,
        name: row.name || row.email,
        email: row.email,
        avatar: row.avatar || null,
        enrolledAt: row.enrolled_at,
        status: row.status,
        riskLevel: hasRisk ? (danger ? "danger" : "warning") : "good",
        gpa,
        attendanceRate,
        attendedCount: Number(row.present_sessions || 0),
        absentCount: absent,
        excusedCount: Number(row.excused_sessions || 0),
        lessonsCompleted: Number(row.lessons_completed || 0),
        totalLessons: Number(row.total_lessons || 0),
        assignmentsSubmitted: Number(row.submitted_assignments || 0),
        totalAssignments: Number(row.total_assignments || 0),
        progressPct,
        lastActive: row.last_active,
        note: hasRisk ? "Học viên cần được theo dõi thêm dựa trên dữ liệu chuyên cần, tiến độ và bài tập." : null,
      };
    });

    const summary = summaryResult.rows[0] || {};
    const detail = {
      id: liveClass.id,
      code: `LIVE-${liveClass.id}`,
      title: liveClass.title,
      description: liveClass.description || "",
      courseId: liveClass.course_id,
      courseTitle: liveClass.course_title || null,
      instructor: liveClass.instructor_name || "Giảng viên phụ trách",
      totalSessions: Number(summary.total_sessions || 0),
      completedSessions: Number(summary.completed_sessions || 0),
      progressPct: summary.progress_pct === null ? 0 : Number(summary.progress_pct),
      avgAttendance: `${Number(summary.attendance_rate || 0)}%`,
      avgGpa: summary.avg_gpa === null ? null : Number(summary.avg_gpa),
      meetUrl: summary.next_meet_url || null,
      nextSession: summary.next_session_start || null,
      schedule: null,
      students,
      assignments: [
        ...assignmentsResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          type: row.assignment_type,
          dueDate: row.due_date,
          sessionId: row.class_session_id || null,
          sessionTitle: row.session_title || null,
          sessionStart: row.session_start || null,
          activityScope: "homework",
          submittedCount: Number(row.submitted_count || 0),
          totalCount: Number(row.total_count || 0),
          pendingGradingCount: Number(row.pending_grading_count || 0),
          avgScore: row.avg_score === null ? null : Number(row.avg_score),
        })),
        ...quizRowsResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          type: "quiz",
          sessionId: row.class_session_id || null,
          activityScope: row.activity_scope || "session",
          dueDate: row.due_date,
          sessionTitle: row.session_title || "Buổi học",
          sessionStart: row.session_start,
          submittedCount: Number(row.submitted_count || 0),
          totalCount: Number(row.total_count || 0),
          pendingGradingCount: 0,
          avgScore: row.avg_score === null ? null : Number(row.avg_score),
        })),
      ].sort((left, right) => {
        const leftStart = left.sessionStart ? new Date(left.sessionStart).getTime() : null;
        const rightStart = right.sessionStart ? new Date(right.sessionStart).getTime() : null;
        const now = Date.now();
        const priority = (start) => (start && start >= now ? 0 : start ? 2 : 1);
        const priorityDiff = priority(leftStart) - priority(rightStart);
        if (priorityDiff) return priorityDiff;
        if (leftStart && rightStart) return leftStart - rightStart;
        return new Date(left.dueDate || 0).getTime() - new Date(right.dueDate || 0).getTime();
      }),
    };

    const scheduleResult = await query(
      `SELECT STRING_AGG(
         CASE day_of_week WHEN 1 THEN 'T2' WHEN 2 THEN 'T3' WHEN 3 THEN 'T4' WHEN 4 THEN 'T5'
              WHEN 5 THEN 'T6' WHEN 6 THEN 'T7' WHEN 7 THEN 'CN' ELSE 'Ngày khác' END
         || ' ' || TO_CHAR(start_time, 'HH24:MI') || '-' || TO_CHAR(end_time, 'HH24:MI'),
         ', ' ORDER BY day_of_week, start_time
       ) AS schedule
       FROM class_schedules WHERE live_class_id = $1`,
      [classId],
    );
    detail.schedule = scheduleResult.rows[0]?.schedule || "Chưa thiết lập lịch";
    return res.json({ success: true, data: detail });
  } catch (error) {
    console.error("Error fetching teacher class detail:", error);
    return internalError(res, "Lỗi khi tổng hợp chi tiết lớp học");
  }
});

export default router;
