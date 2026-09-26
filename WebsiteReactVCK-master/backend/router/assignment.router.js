import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import {
  ALLOWED_SUBMISSION_AUDIO_MIME_TYPES,
  ALLOWED_SUBMISSION_FILE_MIME_TYPES,
  MAX_SUBMISSION_AUDIO_SIZE_BYTES,
  MAX_SUBMISSION_FILE_SIZE_BYTES,
  generateSubmissionHeadSignedUrl,
  generateSubmissionPlaybackSignedUrl,
  generateSubmissionUploadPresignedUrl,
} from "../services/video.service.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { awardXp, XP_VALUES } from "../services/gamification.service.js";
import {
  notifyAssignmentDeadlineChanged,
  notifyAssignmentPublished,
} from "../services/assignmentDeadlineNotification.service.js";

const router = express.Router();

const validationError = (res, message) => res.status(422).json({ success: false, message, errorCode: "VALIDATION_ERROR" });
const notFound = (res, message) => res.status(404).json({ success: false, message, errorCode: "NOT_FOUND" });
const forbidden = (res, message) => res.status(403).json({ success: false, message, errorCode: "FORBIDDEN" });
const conflict = (res, message, errorCode = "CONFLICT") => res.status(409).json({ success: false, message, errorCode });
const serviceUnavailable = (res, message) => res.status(503).json({ success: false, message, errorCode: "SERVICE_UNAVAILABLE" });
const internalError = (res, message) => res.status(500).json({ success: false, message, errorCode: "INTERNAL_ERROR" });

const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseOptionalId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  return parsePositiveId(value);
};

// A teacher attachment can be a secure LMS file route or an external HTTPS
// resource. Arbitrary relative paths and non-HTTPS external links are denied.
const isSafeAssignmentAttachmentUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  if (/^\/api\/files\/\d+\/download$/.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const parseOptions = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseStoredAnswer = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeAnswerArray = (value) => {
  const parsed = parseStoredAnswer(value);
  if (Array.isArray(parsed)) return parsed.map(String).sort();
  if (typeof parsed === "string") return parsed.split(",").map((item) => item.trim()).filter(Boolean).sort();
  return [];
};

const answersMatch = (question, studentAnswer) => {
  const correctAnswer = parseStoredAnswer(question.correct_answer);
  if (question.question_type === "multiple_choice") {
    return JSON.stringify(normalizeAnswerArray(studentAnswer)) === JSON.stringify(normalizeAnswerArray(correctAnswer));
  }
  return String(studentAnswer ?? "").trim().toLocaleLowerCase() === String(correctAnswer ?? "").trim().toLocaleLowerCase();
};

const assignmentAssetPath = (assetId) => assetId ? `/api/assignments/submission-assets/${assetId}/access` : null;

const getAssignment = async (assignmentId, db = { query }) => {
  const result = await db.query(
    `SELECT a.id, a.title, a.assignment_type, a.course_id, a.live_class_id, a.class_session_id, a.instructor_id,
            a.description, a.max_score, a.due_date, a.attachment_url,
            a.created_at, a.updated_at,
            COALESCE(c.title, c.name) AS course_title,
            COALESCE(c.is_published, class_course.is_published, TRUE) AS course_is_published,
            COALESCE(c.is_management_managed, class_course.is_management_managed, FALSE) AS course_is_management_managed,
            COALESCE(a.course_id, lc.course_id) AS resolved_course_id,
            c.author_id AS course_author_id,
            lc.status AS live_class_status, cs.title AS session_title,
            cs.start_time AS session_start, cs.end_time AS session_end,
            lc.instructor_id AS live_class_instructor_id,
            instructor.username AS instructor_name,
            instructor.avatar_url AS instructor_avatar
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     LEFT JOIN live_classes lc ON lc.id = a.live_class_id
     LEFT JOIN class_sessions cs ON cs.id = a.class_session_id
     LEFT JOIN courses class_course ON class_course.id = lc.course_id
     LEFT JOIN users instructor ON instructor.id = a.instructor_id
     WHERE a.id = $1`,
    [assignmentId],
  );
  return result.rows[0] || null;
};

const ensureAssignmentVisibleToStudent = async (assignment, userId, db = { query }) => {
  const courseId = assignment.resolved_course_id || assignment.course_id;
  if (courseId !== null) {
    if (!assignment.course_is_published) return false;
    const result = await db.query(
      `SELECT 1 FROM lms_access_grants
       WHERE user_id = $1 AND course_id = $2 AND access_status = 'active'
         AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())
       UNION ALL
       SELECT 1 FROM enrollments
       WHERE $3::boolean = FALSE AND user_id = $1 AND course_id = $2 AND status = 'active'
       UNION ALL
       SELECT 1 FROM class_enrollments ce
       JOIN live_classes lc ON lc.id = ce.live_class_id
       WHERE $3::boolean = FALSE AND ce.user_id = $1 AND lc.course_id = $2
         AND ce.status = 'active' AND lc.status = 'active'
       LIMIT 1`,
      [userId, courseId, Boolean(assignment.course_is_management_managed)],
    );
    if (result.rows.length === 0) return false;
  }
  if (assignment.live_class_id !== null) {
    if (assignment.live_class_status !== "active") return false;
    const result = await db.query(
      `SELECT 1 FROM class_enrollments WHERE user_id = $1 AND live_class_id = $2 AND status = 'active'`,
      [userId, assignment.live_class_id],
    );
    if (result.rows.length === 0) return false;
  }
  return courseId !== null || assignment.live_class_id !== null;
};

const canManageAssignment = (assignment, user) => user.role === "admin" || String(assignment.instructor_id) === String(user.id);

const serializeAssignment = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type || row.assignment_type || "homework",
  course_id: row.course_id,
  live_class_id: row.live_class_id,
  class_session_id: row.class_session_id || null,
  class_title: row.class_title || null,
  session_title: row.session_title || null,
  session_start: row.session_start || null,
  session_end: row.session_end || null,
  course_title: row.course_title,
  description: row.description || "",
  max_score: row.max_score,
  due_date: row.due_date,
  attachment_url: row.attachment_url,
  created_at: row.created_at,
  updated_at: row.updated_at,
  submission_id: row.submission_id || null,
  submission_status: row.submission_status || null,
  submitted_at: row.submitted_at || null,
  content_text: row.content_text || "",
  file_asset_id: row.file_asset_id || null,
  audio_asset_id: row.audio_asset_id || null,
  file_url: row.file_asset_id ? assignmentAssetPath(row.file_asset_id) : null,
  audio_url: row.audio_asset_id ? assignmentAssetPath(row.audio_asset_id) : null,
  file_name: row.file_name || null,
  audio_name: row.audio_name || null,
  score: row.score ?? null,
  feedback_text: row.feedback_text || null,
  graded_at: row.graded_at || null,
  instructor_name: row.grader_name || row.instructor_name || null,
  instructor_avatar: row.grader_avatar || row.instructor_avatar || null,
  status: row.status,
});

// GET /api/assignments — students get only active enrolled work; teachers get their own queue.
router.get("/", protectRoute, async (req, res) => {
  try {
    const requestedCourseId = parseOptionalId(req.query.courseId);
    if (req.query.courseId !== undefined && !requestedCourseId) {
      return validationError(res, "courseId không hợp lệ");
    }
    const requestedClassId = parseOptionalId(req.query.classId);
    if (req.query.classId !== undefined && !requestedClassId) {
      return validationError(res, "classId không hợp lệ");
    }
    if (requestedClassId && !requestedCourseId) {
      return validationError(res, "classId cần đi kèm courseId");
    }
    const requestedSessionId = parseOptionalId(req.query.sessionId);
    if (req.query.sessionId !== undefined && !requestedSessionId) {
      return validationError(res, "sessionId không hợp lệ");
    }
    if (requestedSessionId && !requestedClassId) {
      return validationError(res, "sessionId cần đi kèm classId");
    }
    const isAdmin = req.user.role === "admin";
    const isTeacher = req.user.role === "creator";
    if (requestedClassId) {
      const classAccessParams = [requestedClassId, requestedCourseId];
      let classAccessClause = "TRUE";
      if (isTeacher) {
        classAccessParams.push(req.user.id);
        classAccessClause = `(lc.instructor_id = $3 OR EXISTS (
          SELECT 1 FROM class_teachers ct
          WHERE ct.live_class_id = lc.id AND ct.teacher_id = $3 AND ct.status = 'active'
        ))`;
      } else if (!isAdmin) {
        classAccessParams.push(req.user.id);
        classAccessClause = `EXISTS (
          SELECT 1 FROM class_enrollments ce
          LEFT JOIN courses course_access ON course_access.id = lc.course_id
          WHERE ce.live_class_id = lc.id AND ce.user_id = $3 AND ce.status = 'active'
            AND (
              COALESCE(course_access.is_management_managed, FALSE) = FALSE
              OR EXISTS (
                SELECT 1 FROM lms_access_grants g
                WHERE g.user_id = $3 AND g.course_id = course_access.id AND g.access_status = 'active'
                  AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
              )
            )
        )`;
      }
      const classAccess = await query(
        `SELECT 1 FROM live_classes lc
         WHERE lc.id = $1 AND lc.course_id = $2 AND lc.status = 'active'
           AND ${classAccessClause}`,
        classAccessParams,
      );
      if (classAccess.rows.length === 0) return forbidden(res, "Bạn không có quyền xem bài tập của lớp này");
      if (requestedSessionId) {
        const sessionAccess = await query(
          "SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'",
          [requestedSessionId, requestedClassId],
        );
        if (sessionAccess.rows.length === 0) return notFound(res, "Không tìm thấy buổi học của lớp này");
      }
    }
    const visibilityClause = isAdmin
      ? "TRUE"
      : isTeacher
        ? "a.instructor_id = $1"
        : `(
             (a.course_id IS NULL OR (c.is_published = true AND (
               (COALESCE(c.is_management_managed, FALSE) = FALSE AND EXISTS (
                 SELECT 1 FROM enrollments e WHERE e.user_id = $1 AND e.course_id = a.course_id AND e.status = 'active'
               ))
               OR EXISTS (
                 SELECT 1 FROM lms_access_grants g
                 WHERE g.user_id = $1 AND g.course_id = a.course_id AND g.access_status = 'active'
                   AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
               )
               OR (COALESCE(c.is_management_managed, FALSE) = FALSE AND EXISTS (
                 SELECT 1 FROM class_enrollments course_ce
                 JOIN live_classes course_lc ON course_lc.id = course_ce.live_class_id
                 WHERE course_ce.user_id = $1 AND course_lc.course_id = a.course_id
                   AND course_ce.status = 'active' AND course_lc.status = 'active'
               ))
             )))
             AND (a.live_class_id IS NULL OR (lc.status = 'active' AND EXISTS (
               SELECT 1 FROM class_enrollments ce WHERE ce.user_id = $1 AND ce.live_class_id = a.live_class_id AND ce.status = 'active'
             ) AND (
               COALESCE(class_course.is_management_managed, FALSE) = FALSE
               OR EXISTS (
                 SELECT 1 FROM lms_access_grants class_grant
                 WHERE class_grant.user_id = $1 AND class_grant.course_id = class_course.id
                   AND class_grant.access_status = 'active' AND class_grant.valid_from <= NOW()
                   AND (class_grant.valid_until IS NULL OR class_grant.valid_until > NOW())
               )
             )))
             AND (a.course_id IS NOT NULL OR a.live_class_id IS NOT NULL)
           )`;
    const quizVisibilityClause = isAdmin
      ? "TRUE"
      : isTeacher
        ? "(q.instructor_id = $1 OR c.author_id = $1)"
        : `q.status = 'PUBLISHED' AND c.is_published = true AND (
             (COALESCE(c.is_management_managed, FALSE) = FALSE AND EXISTS (
               SELECT 1 FROM enrollments e WHERE e.user_id = $1 AND e.course_id = c.id AND e.status = 'active'
             ))
             OR EXISTS (
               SELECT 1 FROM lms_access_grants g
               WHERE g.user_id = $1 AND g.course_id = c.id AND g.access_status = 'active'
                 AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
             )
             OR (COALESCE(c.is_management_managed, FALSE) = FALSE AND EXISTS (
               SELECT 1 FROM class_enrollments course_ce
               JOIN live_classes course_lc ON course_lc.id = course_ce.live_class_id
               WHERE course_ce.user_id = $1 AND course_lc.course_id = c.id
                 AND course_ce.status = 'active' AND course_lc.status = 'active'
             ))
           ) AND (q.live_class_id IS NULL OR (
             quiz_lc.status = 'active' AND EXISTS (
               SELECT 1 FROM class_enrollments quiz_ce
               WHERE quiz_ce.user_id = $1 AND quiz_ce.live_class_id = q.live_class_id AND quiz_ce.status = 'active'
             )
           ))`;
    const assignmentCourseScope = requestedCourseId
      ? "AND COALESCE(a.course_id, lc.course_id) = $2"
      : "";
    const quizCourseScope = requestedCourseId
      ? "AND COALESCE(q.course_id, l.course_id) = $2"
      : "";
    const params = requestedCourseId ? [req.user.id, requestedCourseId] : [req.user.id];
    if (requestedClassId) params.push(requestedClassId);
    if (requestedSessionId) params.push(requestedSessionId);
    const classParamIndex = requestedClassId ? (requestedCourseId ? 3 : 2) : null;
    const sessionParamIndex = requestedSessionId ? params.length : null;
    const assignmentClassScope = classParamIndex
      ? `AND (a.live_class_id IS NULL OR a.live_class_id = $${classParamIndex})`
      : "";
    const quizClassScope = classParamIndex
      ? `AND (q.live_class_id IS NULL OR q.live_class_id = $${classParamIndex})`
      : "";
    const assignmentSessionScope = sessionParamIndex ? `AND a.class_session_id = $${sessionParamIndex}` : "";
    const quizSessionScope = sessionParamIndex ? `AND q.class_session_id = $${sessionParamIndex}` : "";
    const result = await query(
      `WITH assignment_rows AS (
         SELECT a.id, a.title, a.assignment_type AS type, a.course_id, a.live_class_id, a.description,
                a.max_score, a.due_date, a.attachment_url, a.created_at, a.updated_at,
                COALESCE(c.title, c.name) AS course_title,
                s.id AS submission_id, s.status AS submission_status,
                s.submitted_at, s.content_text, s.file_asset_id, s.audio_asset_id,
                fa.original_filename AS file_name, aa.original_filename AS audio_name,
                sg.score, sg.feedback_text, sg.graded_at,
                a.class_session_id, assignment_session.title AS session_title,
                assignment_session.start_time AS session_start, assignment_session.end_time AS session_end, lc.title AS class_title,
                CASE WHEN sg.score IS NOT NULL THEN 'graded'
                     WHEN s.id IS NOT NULL THEN s.status
                     WHEN a.due_date IS NOT NULL AND a.due_date < NOW() THEN 'late'
                     ELSE 'todo' END AS status
         FROM assignments a
         LEFT JOIN courses c ON c.id = a.course_id
         LEFT JOIN live_classes lc ON lc.id = a.live_class_id
         LEFT JOIN class_sessions assignment_session ON assignment_session.id = a.class_session_id
         LEFT JOIN courses class_course ON class_course.id = lc.course_id
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $1
         LEFT JOIN submission_assets fa ON fa.id = s.file_asset_id
         LEFT JOIN submission_assets aa ON aa.id = s.audio_asset_id
         LEFT JOIN LATERAL (
           SELECT score, feedback_text, graded_at FROM submission_grades
           WHERE submission_id = s.id ORDER BY graded_at DESC, id DESC LIMIT 1
         ) sg ON true
         WHERE ${visibilityClause} ${assignmentCourseScope} ${assignmentClassScope} ${assignmentSessionScope}
       ), quiz_rows AS (
         SELECT q.id, q.title, 'quiz' AS type, COALESCE(q.course_id, l.course_id) AS course_id, q.live_class_id, q.description,
                (SELECT COALESCE(SUM(qq.points), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS max_score,
                NULL::timestamptz AS due_date, NULL::varchar AS attachment_url, q.created_at, q.updated_at,
                COALESCE(c.title, c.name) AS course_title,
                qa.id AS submission_id, qa.status AS submission_status, qa.submitted_at,
                NULL::text AS content_text, NULL::bigint AS file_asset_id, NULL::bigint AS audio_asset_id,
                NULL::varchar AS file_name, NULL::varchar AS audio_name,
                qa.score, NULL::text AS feedback_text, qa.submitted_at AS graded_at,
                q.class_session_id, quiz_session.title AS session_title,
                quiz_session.start_time AS session_start, quiz_session.end_time AS session_end, quiz_lc.title AS class_title,
                CASE WHEN qa.status = 'submitted' THEN 'graded' ELSE 'todo' END AS status
         FROM quizzes q
         LEFT JOIN lessons l ON l.id = q.lesson_id
         JOIN courses c ON c.id = COALESCE(q.course_id, l.course_id)
         LEFT JOIN live_classes quiz_lc ON quiz_lc.id = q.live_class_id
         LEFT JOIN class_sessions quiz_session ON quiz_session.id = q.class_session_id
         LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = $1
         WHERE ${quizVisibilityClause} ${quizCourseScope} ${quizClassScope} ${quizSessionScope}
       )
       SELECT * FROM (
         SELECT * FROM assignment_rows
         UNION ALL
         SELECT * FROM quiz_rows
       ) combined_rows
       ORDER BY CASE WHEN session_start >= NOW() THEN 0 WHEN session_start IS NULL THEN 1 ELSE 2 END,
                session_start ASC NULLS LAST, COALESCE(due_date, '9999-12-31'::timestamptz), created_at DESC`,
      params,
    );
    return res.json({ success: true, data: result.rows.map(serializeAssignment) });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return internalError(res, "Lỗi khi lấy danh sách bài tập");
  }
});

// GET /api/assignments/teacher/quizzes — real quiz authoring list for the teacher UI.
router.get("/teacher/quizzes", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  try {
    const ownerFilter = req.user.role === "admin" ? "TRUE" : "(q.instructor_id = $1 OR c.author_id = $1)";
    const params = req.user.role === "admin" ? [] : [req.user.id];
    const result = await query(
      `SELECT q.id, q.title, q.description, q.paper_file_id, q.live_class_id, q.class_session_id, q.duration_minutes, q.passing_score,
              q.status, q.shuffle_questions, q.created_at,
              COALESCE(c.title, c.name) AS course_title,
              lc.title AS class_title, cs.title AS session_title, cs.start_time AS session_start, cs.end_time AS session_end,
              COUNT(DISTINCT qq.id)::int AS question_count,
              COUNT(DISTINCT qa.id)::int AS attempts_count,
              ROUND(AVG(qa.score / NULLIF(qa.max_score, 0) * 100), 1) AS avg_score
       FROM quizzes q
       LEFT JOIN courses c ON c.id = q.course_id
       LEFT JOIN live_classes lc ON lc.id = q.live_class_id
       LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.status = 'submitted'
       WHERE ${ownerFilter}
       GROUP BY q.id, c.id, lc.id, cs.id
       ORDER BY CASE WHEN cs.start_time >= NOW() THEN 0 WHEN cs.start_time IS NULL THEN 1 ELSE 2 END,
                cs.start_time ASC NULLS LAST, q.created_at DESC, q.id DESC`,
      params,
    );
    return res.json({ success: true, data: result.rows.map((row) => ({
      id: String(row.id), title: row.title, description: row.description || "",
      courseTitle: row.course_title || "Chưa gắn khóa học", questionCount: Number(row.question_count || 0),
      classId: row.live_class_id ? String(row.live_class_id) : null,
      classTitle: row.class_title || "Chưa gắn lớp", sessionId: row.class_session_id ? String(row.class_session_id) : null,
      sessionTitle: row.session_title || "Chưa gắn buổi học", sessionStart: row.session_start || null, sessionEnd: row.session_end || null,
      hasPaper: Boolean(row.paper_file_id),
      timeLimitMinutes: Number(row.duration_minutes || 0), passingScore: Number(row.passing_score || 0),
      status: row.status, attemptsCount: Number(row.attempts_count || 0),
      avgScore: row.avg_score === null ? null : Number(row.avg_score), createdAt: row.created_at,
    })) });
  } catch (error) {
    console.error("Error listing teacher quizzes:", error);
    return internalError(res, "Lỗi khi lấy danh sách đề kiểm tra");
  }
});

// GET /api/assignments/teacher/quiz-targets?courseId=… — return only the
// selected teacher's future/live sessions. Creation repeats this validation
// under a row lock, so a stale browser cannot attach a quiz to a past lesson.
router.get("/teacher/quiz-targets", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  try {
    const courseId = parsePositiveId(req.query.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    const isAdmin = req.user.role === "admin";
    const accessClause = isAdmin ? "TRUE" : `(c.author_id = $2 OR lc.instructor_id = $2 OR EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
    ))`;
    const params = isAdmin ? [courseId] : [courseId, req.user.id];
    const result = await query(
      `SELECT lc.id AS class_id, lc.title AS class_title,
              cs.id AS session_id, cs.title AS session_title, cs.start_time, cs.end_time, cs.status
       FROM live_classes lc
       JOIN courses c ON c.id = lc.course_id
       JOIN class_sessions cs ON cs.live_class_id = lc.id
       WHERE lc.course_id = $1 AND lc.status = 'active'
         AND cs.status IN ('scheduled', 'live', 'rescheduled') AND cs.end_time > NOW()
         AND ${accessClause}
       ORDER BY cs.start_time ASC, cs.id ASC`,
      params,
    );
    const classes = new Map();
    for (const row of result.rows) {
      const key = String(row.class_id);
      if (!classes.has(key)) classes.set(key, { id: key, title: row.class_title, sessions: [] });
      classes.get(key).sessions.push({
        id: String(row.session_id), title: row.session_title,
        startTime: row.start_time, endTime: row.end_time, status: row.status,
      });
    }
    return res.json({ success: true, data: [...classes.values()] });
  } catch (error) {
    console.error("Error fetching quiz targets:", error);
    return internalError(res, "Không thể tải lớp và buổi học cho quiz");
  }
});

// POST /api/assignments/teacher/quizzes — create a quiz and its question bank atomically.
router.post("/teacher/quizzes", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  const client = await getClient();
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const durationMinutes = Number(req.body?.durationMinutes ?? 30);
    const passingScore = Number(req.body?.passingScore ?? 60);
    const status = ["DRAFT", "PUBLISHED"].includes(req.body?.status) ? req.body.status : "DRAFT";
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    const courseId = parseOptionalId(req.body?.courseId);
    const liveClassId = parseOptionalId(req.body?.liveClassId);
    const classSessionId = parseOptionalId(req.body?.classSessionId);
    const paperFileId = parseOptionalId(req.body?.paperFileId);
    if (!title || title.length > 255 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240 || !Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) return validationError(res, "Thông tin đề kiểm tra không hợp lệ");
    if (questions.length < 1 || questions.length > 200) return validationError(res, "Đề kiểm tra cần từ 1 đến 200 câu hỏi");
    if (!courseId) return validationError(res, "Quiz phải được gắn với một khóa học");
    if (!liveClassId || !classSessionId) return validationError(res, "Quiz phải được gắn với một lớp và một buổi học chưa kết thúc");
    // Keep the session lock from validation through the insert. This prevents a
    // schedule update from moving the selected session into the past mid-request.
    await client.query("BEGIN");
    const course = await client.query(
      "SELECT c.id, c.author_id FROM courses c WHERE c.id = $1",
      [courseId],
    );
    if (!course.rows[0]) return notFound(res, "Không tìm thấy khóa học");
    const target = await client.query(
      `SELECT cs.id, cs.status, cs.start_time, cs.end_time, lc.id AS live_class_id, lc.instructor_id,
              EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $4 AND ct.status = 'active') AS is_class_teacher
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1 AND lc.id = $2 AND lc.course_id = $3 AND lc.status = 'active'
       FOR UPDATE OF cs`,
      [classSessionId, liveClassId, courseId, req.user.id],
    );
    if (!target.rows[0]) return validationError(res, "Buổi học không thuộc lớp hoặc khóa học đã chọn");
    const targetSession = target.rows[0];
    if (req.user.role !== "admin" && String(course.rows[0].author_id) !== String(req.user.id)
      && String(targetSession.instructor_id) !== String(req.user.id) && !targetSession.is_class_teacher) {
      return forbidden(res, "Bạn không phụ trách lớp hoặc buổi học này");
    }
    if (!['scheduled', 'live', 'rescheduled'].includes(targetSession.status) || new Date(targetSession.end_time).getTime() <= Date.now()) {
      return validationError(res, "Không thể tạo quiz cho buổi học đã kết thúc, đã hủy hoặc đã qua");
    }
    if (paperFileId) {
      const paper = await client.query(
        "SELECT id FROM lms_learning_files WHERE id = $1 AND course_id = $2 AND mime_type = 'application/pdf' AND status = 'ready'",
        [paperFileId, courseId],
      );
      if (!paper.rows[0]) return validationError(res, "File đề PDF không hợp lệ hoặc chưa tải lên hoàn tất");
    }
    const normalizedQuestions = questions.map((question, index) => {
      const text = typeof question.questionText === "string" ? question.questionText.trim() : "";
      const options = Array.isArray(question.options)
        ? question.options.slice(0, 6).map((value, optionIndex) => ({ key: String.fromCharCode(65 + optionIndex), text: String(value || "").trim() })).filter((option) => option.text)
        : [];
      const correctIndex = Number.isInteger(question.correctAnswer) ? question.correctAnswer : -1;
      const explanation = typeof question.explanation === "string" ? question.explanation.trim() : "";
      const points = Number(question.points);
      if (!text || text.length > 6000 || options.length < 2 || options.some((option) => option.text.length > 2000) || !options[correctIndex] || explanation.length > 4000 || !Number.isFinite(points) || points <= 0 || points > 100) throw new Error("INVALID_QUESTION");
      return {
        text,
        type: question.type === "multiple" ? "multiple_choice" : "single_choice",
        options,
        correct: options[correctIndex].key,
        explanation,
        points,
        order: index + 1,
      };
    });
    const quizResult = await client.query(
      `INSERT INTO quizzes (title, description, course_id, live_class_id, class_session_id, paper_file_id, duration_minutes, passing_score, status, shuffle_questions, instructor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title, description, course_id, live_class_id, class_session_id, paper_file_id, duration_minutes, passing_score, status, shuffle_questions, created_at`,
      [title, description, courseId, liveClassId, classSessionId, paperFileId, durationMinutes, passingScore, status, req.body.shuffleQuestions !== false, req.user.id],
    );
    for (const question of normalizedQuestions) {
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question_text, question_type, options_json, correct_answer, explanation, points, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [quizResult.rows[0].id, question.text, question.type, JSON.stringify(question.options), question.correct, question.explanation, question.points, question.order],
      );
    }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.created", entityType: "quiz", entityId: quizResult.rows[0].id, afterState: quizResult.rows[0], metadata: { ip: req.ip, questionCount: normalizedQuestions.length, liveClassId, classSessionId } });
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: { ...quizResult.rows[0], questionCount: normalizedQuestions.length }, message: "Tạo đề kiểm tra thành công" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.message === "INVALID_QUESTION") return validationError(res, "Mỗi câu cần có nội dung, từ 2 đến 6 phương án, đáp án đúng và điểm hợp lệ");
    console.error("Error creating teacher quiz:", error);
    return internalError(res, "Lỗi khi tạo đề kiểm tra");
  } finally {
    client.release();
  }
});

router.delete("/teacher/quizzes/:quizId", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  const quizId = parsePositiveId(req.params.quizId);
  if (!quizId) return validationError(res, "quizId không hợp lệ");
  try {
    const result = await query(
      `DELETE FROM quizzes q
       WHERE q.id = $1 AND ($2 = 'admin' OR q.instructor_id = $3 OR EXISTS (SELECT 1 FROM courses c WHERE c.id = q.course_id AND c.author_id = $3))
       RETURNING q.id, q.title`,
      [quizId, req.user.role, req.user.id],
    );
    if (!result.rows[0]) return notFound(res, "Không tìm thấy đề hoặc bạn không có quyền xóa");
    await recordAuditEvent({ actorId: req.user.id, action: "quiz.deleted", entityType: "quiz", entityId: quizId, beforeState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, message: "Đã xóa đề kiểm tra" });
  } catch (error) {
    console.error("Error deleting teacher quiz:", error);
    return internalError(res, "Lỗi khi xóa đề kiểm tra");
  }
});

// GET /api/assignments/:assignmentId — detail used by the submit screen.
router.get("/:assignmentId", protectRoute, async (req, res, next) => {
  if (["all", "quizzes", "submissions", "submission-assets"].includes(req.params.assignmentId)) return next();
  try {
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!assignmentId) return validationError(res, "assignmentId không hợp lệ");
    const assignment = await getAssignment(assignmentId);
    if (!assignment) return notFound(res, "Không tìm thấy bài tập");
    if (req.user.role === "user" && !(await ensureAssignmentVisibleToStudent(assignment, req.user.id))) return forbidden(res, "Bạn chưa được cấp quyền truy cập bài tập này");
    if (req.user.role === "creator" && !canManageAssignment(assignment, req.user)) return forbidden(res, "Bạn không có quyền xem bài tập này");
    const submission = await query(
      `SELECT s.id AS submission_id, s.status AS submission_status, s.submitted_at,
              s.content_text, s.file_asset_id, s.audio_asset_id,
              fa.original_filename AS file_name, aa.original_filename AS audio_name,
              sg.score, sg.feedback_text, sg.graded_at, sg.grader_name, sg.grader_avatar
       FROM assignment_submissions s
       LEFT JOIN submission_assets fa ON fa.id = s.file_asset_id
       LEFT JOIN submission_assets aa ON aa.id = s.audio_asset_id
       LEFT JOIN LATERAL (
         SELECT sg.score, sg.feedback_text, sg.graded_at,
                grader.username AS grader_name, grader.avatar_url AS grader_avatar
         FROM submission_grades sg LEFT JOIN users grader ON grader.id = sg.grader_id
         WHERE sg.submission_id = s.id ORDER BY sg.graded_at DESC, sg.id DESC LIMIT 1
       ) sg ON true
       WHERE s.assignment_id = $1 AND s.user_id = $2`,
      [assignmentId, req.user.id],
    );
    const row = { ...assignment, ...(submission.rows[0] || {}) };
    return res.json({
      success: true,
      data: serializeAssignment({ ...row, status: row.score !== null && row.score !== undefined ? "graded" : row.submission_status || (row.due_date && new Date(row.due_date) < new Date() ? "late" : "todo") }),
    });
  } catch (error) {
    console.error("Error fetching assignment detail:", error);
    return internalError(res, "Lỗi khi lấy chi tiết bài tập");
  }
});

// POST /api/assignments/submission-assets/upload-url — server-owned upload target.
router.post("/submission-assets/upload-url", protectRoute, requireRole("user"), async (req, res) => {
  try {
    const { filename, mimeType, sizeBytes, assetKind } = req.body;
    const parsedSize = Number(sizeBytes);
    const allowedTypes = assetKind === "audio" ? ALLOWED_SUBMISSION_AUDIO_MIME_TYPES : ALLOWED_SUBMISSION_FILE_MIME_TYPES;
    const maxSize = assetKind === "audio" ? MAX_SUBMISSION_AUDIO_SIZE_BYTES : MAX_SUBMISSION_FILE_SIZE_BYTES;
    if (assetKind !== "file" && assetKind !== "audio") return validationError(res, "assetKind phải là file hoặc audio");
    if (typeof filename !== "string" || !filename.trim() || filename.length > 255 || /[\u0000-\u001f]/.test(filename) || /[\\/]/.test(filename)) return validationError(res, "Tên tệp không hợp lệ");
    if (!allowedTypes.has(mimeType)) return validationError(res, "Định dạng tệp không được hỗ trợ");
    if (!Number.isSafeInteger(parsedSize) || parsedSize <= 0 || parsedSize > maxSize) return validationError(res, `Kích thước tệp vượt giới hạn ${Math.round(maxSize / 1024 / 1024)}MB`);
    const upload = await generateSubmissionUploadPresignedUrl({ userId: req.user.id, filename, mimeType, sizeBytes: parsedSize, assetKind });
    const assetResult = await query(
      `INSERT INTO submission_assets (user_id, asset_kind, original_filename, storage_key, mime_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
      [req.user.id, assetKind, filename.trim(), upload.fileKey, mimeType, parsedSize],
    );
    return res.status(201).json({ success: true, data: { assetId: assetResult.rows[0].id, ...upload } });
  } catch (error) {
    console.error("Error generating submission upload URL:", error);
    if (error.code === "R2_NOT_CONFIGURED") return serviceUnavailable(res, "Kho lưu trữ bài nộp Cloudflare R2 chưa được cấu hình");
    return internalError(res, "Lỗi khi tạo link tải bài nộp");
  }
});

// POST /api/assignments/submission-assets/:assetId/confirm — owner only.
router.post("/submission-assets/:assetId/confirm", protectRoute, requireRole("user"), async (req, res) => {
  try {
    const assetId = parsePositiveId(req.params.assetId);
    if (!assetId) return validationError(res, "assetId không hợp lệ");
    const assetResult = await query(
      `SELECT id, storage_key, asset_kind, mime_type, size_bytes, status FROM submission_assets
       WHERE id = $1 AND user_id = $2`,
      [assetId, req.user.id],
    );
    const asset = assetResult.rows[0];
    if (!asset || asset.status !== "pending") return conflict(res, "Tệp không tồn tại hoặc đã xác nhận", "ASSET_NOT_READY");
    if (req.body.sizeBytes !== undefined && Number(req.body.sizeBytes) !== Number(asset.size_bytes)) return validationError(res, "Kích thước tệp không khớp");
    if (req.body.mimeType !== undefined && req.body.mimeType !== asset.mime_type) return validationError(res, "Định dạng tệp không khớp");
    const { headUrl } = await generateSubmissionHeadSignedUrl({ r2Key: asset.storage_key });
    const objectResponse = await fetch(headUrl, { method: "HEAD" });
    const actualSize = Number(objectResponse.headers.get("content-length"));
    const actualMime = (objectResponse.headers.get("content-type") || "").split(";")[0].trim();
    const allowedTypes = asset.asset_kind === "audio" ? ALLOWED_SUBMISSION_AUDIO_MIME_TYPES : ALLOWED_SUBMISSION_FILE_MIME_TYPES;
    const maxSize = asset.asset_kind === "audio" ? MAX_SUBMISSION_AUDIO_SIZE_BYTES : MAX_SUBMISSION_FILE_SIZE_BYTES;
    if (!objectResponse.ok || !Number.isSafeInteger(actualSize) || actualSize !== Number(asset.size_bytes) || actualSize > maxSize || !allowedTypes.has(actualMime)) {
      await query("UPDATE submission_assets SET status = 'failed', updated_at = NOW() WHERE id = $1", [assetId]);
      return conflict(res, "Tệp upload không tồn tại hoặc metadata thực tế không hợp lệ", "ASSET_VERIFICATION_FAILED");
    }
    const result = await query(
      `UPDATE submission_assets SET status = 'ready', updated_at = NOW() WHERE id = $1
       RETURNING id, asset_kind, original_filename, mime_type, size_bytes, status`,
      [assetId],
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error confirming submission asset:", error);
    return internalError(res, "Lỗi khi xác nhận tệp bài nộp");
  }
});

// GET /api/assignments/submission-assets/:assetId/access — owner, admin, or assigned teacher only.
router.get("/submission-assets/:assetId/access", protectRoute, async (req, res) => {
  try {
    const assetId = parsePositiveId(req.params.assetId);
    if (!assetId) return validationError(res, "assetId không hợp lệ");
    const result = await query(
      `SELECT sa.id, sa.user_id, sa.storage_key, sa.status, a.instructor_id
       FROM submission_assets sa
       LEFT JOIN assignment_submissions s ON s.file_asset_id = sa.id OR s.audio_asset_id = sa.id
       LEFT JOIN assignments a ON a.id = COALESCE(s.assignment_id, sa.assignment_id)
       WHERE sa.id = $1`,
      [assetId],
    );
    const asset = result.rows[0];
    if (!asset) return notFound(res, "Không tìm thấy tệp bài nộp");
    const allowed = req.user.role === "admin" || String(asset.user_id) === String(req.user.id) || (req.user.role === "creator" && String(asset.instructor_id) === String(req.user.id));
    if (!allowed) return forbidden(res, "Bạn không có quyền xem tệp bài nộp này");
    if (asset.status !== "ready") return conflict(res, "Tệp chưa sẵn sàng", "ASSET_NOT_READY");
    const signed = await generateSubmissionPlaybackSignedUrl({ r2Key: asset.storage_key });
    return res.redirect(302, signed.playbackUrl);
  } catch (error) {
    console.error("Error opening submission asset:", error);
    if (error.code === "R2_NOT_CONFIGURED") return serviceUnavailable(res, "Kho lưu trữ bài nộp Cloudflare R2 chưa được cấu hình");
    return internalError(res, "Lỗi khi mở tệp bài nộp");
  }
});

// GET /api/assignments/:assignmentId/submissions — teacher/admin grading queue.
router.get("/:assignmentId/submissions", protectRoute, requireTeacher, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const values = [];
    const filters = [];
    if (assignmentId !== "all") {
      const parsedAssignmentId = parsePositiveId(assignmentId);
      if (!parsedAssignmentId) return validationError(res, "assignmentId không hợp lệ");
      const assignment = await getAssignment(parsedAssignmentId);
      if (!assignment) return notFound(res, "Không tìm thấy bài tập");
      if (!canManageAssignment(assignment, req.user)) return forbidden(res, "Bạn không có quyền xem bài nộp của bài tập này");
      values.push(parsedAssignmentId);
      filters.push(`s.assignment_id = $${values.length}`);
    } else if (req.user.role !== "admin") {
      values.push(req.user.id);
      filters.push(`a.instructor_id = $${values.length}`);
    }
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await query(
      `SELECT s.id, s.assignment_id, s.user_id, s.content_text, s.status, s.submitted_at,
              s.file_asset_id, s.audio_asset_id, a.title AS assignment_title, a.assignment_type, a.max_score, a.due_date,
              u.username AS student_username, u.username AS student_name, u.email AS student_email, u.avatar_url AS student_avatar,
              fa.original_filename AS file_name, aa.original_filename AS audio_name,
              CASE WHEN s.file_asset_id IS NOT NULL THEN '/api/assignments/submission-assets/' || s.file_asset_id || '/access' END AS file_url,
              CASE WHEN s.audio_asset_id IS NOT NULL THEN '/api/assignments/submission-assets/' || s.audio_asset_id || '/access' END AS audio_url,
              sg.score, sg.feedback_text, sg.graded_at
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN submission_assets fa ON fa.id = s.file_asset_id
       LEFT JOIN submission_assets aa ON aa.id = s.audio_asset_id
       LEFT JOIN LATERAL (
         SELECT score, feedback_text, graded_at FROM submission_grades
         WHERE submission_id = s.id ORDER BY graded_at DESC, id DESC LIMIT 1
       ) sg ON true
       ${whereClause}
       ORDER BY s.submitted_at DESC, s.id DESC`,
      values,
    );
    return res.json({ success: true, data: result.rows.map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      userId: row.user_id,
      assignmentTitle: row.assignment_title,
      assignmentType: row.assignment_type,
      maxScore: Number(row.max_score),
      dueDate: row.due_date,
      studentName: row.student_name || row.student_username,
      studentEmail: row.student_email || null,
      studentAvatar: row.student_avatar || null,
      contentText: row.content_text || "",
      status: row.status,
      submittedAt: row.submitted_at,
      fileName: row.file_name || null,
      fileUrl: row.file_url || null,
      audioName: row.audio_name || null,
      audioUrl: row.audio_url || null,
      score: row.score === null ? null : Number(row.score),
      feedbackText: row.feedback_text || "",
      gradedAt: row.graded_at || null,
    })) });
  } catch (error) {
    console.error("Error fetching assignment submissions:", error);
    return internalError(res, "Lỗi khi lấy danh sách bài nộp");
  }
});

// POST /api/assignments — teacher/admin creates a scoped assignment.
router.post("/", protectRoute, requireTeacher, requirePermission("lms.assignment.manage"), async (req, res) => {
  try {
    const { title, description, maxScore, dueDate, attachmentUrl } = req.body;
    const assignmentType = req.body.assignmentType || req.body.type || "homework";
    const courseId = parseOptionalId(req.body.courseId);
    const liveClassId = parseOptionalId(req.body.liveClassId);
    const classSessionId = parseOptionalId(req.body.classSessionId);
    if (!title || typeof title !== "string" || title.trim().length > 255) return validationError(res, "Tiêu đề bài tập không hợp lệ");
    if (!["homework", "hskk", "quiz"].includes(assignmentType)) return validationError(res, "Loại bài tập không hợp lệ");
    if (!courseId && !liveClassId) return validationError(res, "Bài tập phải thuộc ít nhất một khóa học hoặc lớp trực tuyến");
    if (classSessionId && !liveClassId) return validationError(res, "Bài tập theo buổi học phải thuộc một lớp cụ thể");
    const parsedMaxScore = maxScore === undefined ? 10 : Number(maxScore);
    if (!Number.isFinite(parsedMaxScore) || parsedMaxScore <= 0 || parsedMaxScore > 999.99) return validationError(res, "maxScore không hợp lệ");
    if (description !== undefined && (typeof description !== "string" || description.length > 50000)) return validationError(res, "description không hợp lệ");
    if (dueDate !== undefined && dueDate !== null && dueDate !== "" && Number.isNaN(Date.parse(dueDate))) return validationError(res, "dueDate không hợp lệ");
    if (attachmentUrl !== undefined && attachmentUrl !== null && attachmentUrl !== "" && !isSafeAssignmentAttachmentUrl(attachmentUrl)) {
      return validationError(res, "attachmentUrl phải là link HTTPS hoặc tài liệu bảo mật của LMS");
    }
    if (courseId) {
      const courseResult = await query("SELECT author_id FROM courses WHERE id = $1", [courseId]);
      if (courseResult.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");
      if (req.user.role !== "admin" && String(courseResult.rows[0].author_id) !== String(req.user.id)) return forbidden(res, "Bạn không có quyền tạo bài tập cho khóa học này");
    }
    if (liveClassId) {
      const classResult = await query("SELECT course_id, instructor_id FROM live_classes WHERE id = $1", [liveClassId]);
      if (classResult.rows.length === 0) return notFound(res, "Không tìm thấy lớp học trực tuyến");
      if (req.user.role !== "admin" && String(classResult.rows[0].instructor_id) !== String(req.user.id)) {
        const classTeacher = await query(
          `SELECT 1 FROM class_teachers
           WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'`,
          [liveClassId, req.user.id],
        );
        if (classTeacher.rows.length === 0) return forbidden(res, "Bạn không có quyền tạo bài tập cho lớp học này");
      }
      if (courseId && classResult.rows[0].course_id !== null && String(classResult.rows[0].course_id) !== String(courseId)) return validationError(res, "Khóa học và lớp trực tuyến không cùng một phạm vi");
    }
    if (classSessionId) {
      const sessionResult = await query(
        "SELECT id FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'",
        [classSessionId, liveClassId],
      );
      if (sessionResult.rows.length === 0) return validationError(res, "Buổi học không thuộc lớp đã chọn hoặc đã bị hủy");
    }
    const result = await query(
      `INSERT INTO assignments (title, assignment_type, course_id, live_class_id, class_session_id, instructor_id, description, max_score, due_date, attachment_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, title, assignment_type, course_id, live_class_id, class_session_id, instructor_id, description, max_score, due_date, attachment_url, created_at, updated_at`,
      [title.trim(), assignmentType, courseId, liveClassId, classSessionId, req.user.id, description?.trim() || "", parsedMaxScore, dueDate || null, attachmentUrl || null],
    );
    await recordAuditEvent({
      actorId: req.user.id,
      action: "assignment.created",
      entityType: "assignment",
      entityId: result.rows[0].id,
      afterState: result.rows[0],
      metadata: { ip: req.ip, classSessionId },
    });
    await notifyAssignmentPublished({ assignmentId: result.rows[0].id, actorId: req.user.id });
    return res.status(201).json({ success: true, data: result.rows[0], message: "Tạo bài tập mới thành công" });
  } catch (error) {
    console.error("Error creating assignment:", error);
    return internalError(res, "Lỗi khi tạo bài tập");
  }
});

// PATCH /api/assignments/:id — whitelist editable fields and audit deadline changes.
router.patch("/:id", protectRoute, requireTeacher, requirePermission("lms.assignment.manage"), async (req, res) => {
  try {
    const assignmentId = parsePositiveId(req.params.id);
    if (!assignmentId) return validationError(res, "assignmentId không hợp lệ");
    const assignment = await getAssignment(assignmentId);
    if (!assignment) return notFound(res, "Không tìm thấy bài tập");
    if (!canManageAssignment(assignment, req.user)) return forbidden(res, "Bạn không có quyền sửa bài tập này");

    const body = req.body || {};
    const allowedFields = ["title", "description", "maxScore", "dueDate", "attachmentUrl"];
    if (Object.keys(body).some((key) => !allowedFields.includes(key))) return validationError(res, "Có trường dữ liệu không được phép cập nhật");
    const nextTitle = body.title === undefined ? assignment.title : body.title;
    const nextDescription = body.description === undefined ? (assignment.description || "") : body.description;
    const nextMaxScore = body.maxScore === undefined ? Number(assignment.max_score) : Number(body.maxScore);
    const nextDueDate = body.dueDate === undefined ? assignment.due_date : body.dueDate;
    const nextAttachmentUrl = body.attachmentUrl === undefined ? assignment.attachment_url : body.attachmentUrl;
    if (typeof nextTitle !== "string" || !nextTitle.trim() || nextTitle.trim().length > 255) return validationError(res, "Tiêu đề bài tập không hợp lệ");
    if (typeof nextDescription !== "string" || nextDescription.length > 50000) return validationError(res, "description không hợp lệ");
    if (!Number.isFinite(nextMaxScore) || nextMaxScore <= 0 || nextMaxScore > 999.99) return validationError(res, "maxScore không hợp lệ");
    if (nextDueDate !== null && nextDueDate !== "" && Number.isNaN(Date.parse(nextDueDate))) return validationError(res, "dueDate không hợp lệ");
    if (nextAttachmentUrl !== null && nextAttachmentUrl !== "" && !isSafeAssignmentAttachmentUrl(nextAttachmentUrl)) {
      return validationError(res, "attachmentUrl phải là link HTTPS hoặc tài liệu bảo mật của LMS");
    }

    const result = await query(
      `UPDATE assignments
       SET title = $1, description = $2, max_score = $3, due_date = $4, attachment_url = $5
       WHERE id = $6
       RETURNING id, title, assignment_type, course_id, live_class_id, class_session_id, instructor_id, description, max_score, due_date, attachment_url, created_at, updated_at`,
      [nextTitle.trim(), nextDescription, nextMaxScore, nextDueDate || null, nextAttachmentUrl || null, assignmentId],
    );
    const updated = result.rows[0];
    await recordAuditEvent({
      actorId: req.user.id,
      action: String(assignment.due_date || "") !== String(updated.due_date || "") ? "assignment.deadline_updated" : "assignment.updated",
      entityType: "assignment",
      entityId: assignmentId,
      beforeState: assignment,
      afterState: updated,
      metadata: { ip: req.ip },
    });
    if (String(assignment.due_date || "") !== String(updated.due_date || "")) {
      await notifyAssignmentDeadlineChanged({ assignmentId, actorId: req.user.id });
    }
    return res.json({ success: true, data: updated, message: "Cập nhật bài tập thành công" });
  } catch (error) {
    console.error("Error updating assignment:", error);
    return internalError(res, "Lỗi khi cập nhật bài tập");
  }
});

// POST /api/assignments/:id/submit — one immutable student submission per assignment.
router.post("/:id/submit", protectRoute, requireRole("user"), async (req, res) => {
  const client = await getClient();
  try {
    const assignmentId = parsePositiveId(req.params.id);
    if (!assignmentId) return validationError(res, "assignmentId không hợp lệ");
    const assignment = await getAssignment(assignmentId);
    if (!assignment) return notFound(res, "Không tìm thấy bài tập");
    if (!(await ensureAssignmentVisibleToStudent(assignment, req.user.id))) return forbidden(res, "Bạn chưa được đăng ký vào khóa/lớp của bài tập này");
    const { contentText, fileAssetId: rawFileAssetId, audioAssetId: rawAudioAssetId, fileUrl, audioUrl } = req.body;
    if (fileUrl || audioUrl) return validationError(res, "Bài nộp phải dùng assetId từ API upload, không nhận URL tùy ý");
    const fileAssetId = parseOptionalId(rawFileAssetId);
    const audioAssetId = parseOptionalId(rawAudioAssetId);
    if ((rawFileAssetId !== undefined && rawFileAssetId !== null && !fileAssetId) || (rawAudioAssetId !== undefined && rawAudioAssetId !== null && !audioAssetId)) return validationError(res, "assetId không hợp lệ");
    if (contentText !== undefined && (typeof contentText !== "string" || contentText.length > 100000)) return validationError(res, "Nội dung bài nộp không hợp lệ");
    if (!((typeof contentText === "string" && contentText.trim()) || fileAssetId || audioAssetId)) return validationError(res, "Bài nộp phải có nội dung, file hoặc audio");
    if (fileAssetId && audioAssetId && fileAssetId === audioAssetId) return validationError(res, "File và audio phải là hai asset khác nhau");
    await client.query("BEGIN");
    const existing = await client.query("SELECT id, status FROM assignment_submissions WHERE assignment_id = $1 AND user_id = $2 FOR UPDATE", [assignmentId, req.user.id]);
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return conflict(res, existing.rows[0].status === "graded" ? "Bài đã được chấm và đã khóa" : "Bài đã được nộp, không thể nộp đè", "SUBMISSION_LOCKED");
    }
    const assets = await client.query(
      `SELECT id, assignment_id, asset_kind, status FROM submission_assets
       WHERE id = ANY($1::bigint[]) AND user_id = $2 FOR UPDATE`,
      [[fileAssetId, audioAssetId].filter(Boolean), req.user.id],
    );
    const assetById = new Map(assets.rows.map((asset) => [Number(asset.id), asset]));
    for (const [assetId, expectedKind] of [[fileAssetId, "file"], [audioAssetId, "audio"]]) {
      if (!assetId) continue;
      const asset = assetById.get(assetId);
      if (!asset || asset.status !== "ready" || (asset.assignment_id !== null && Number(asset.assignment_id) !== assignmentId) || asset.asset_kind !== expectedKind) {
        await client.query("ROLLBACK");
        return validationError(res, "Tệp bài nộp không hợp lệ hoặc chưa upload xong");
      }
    }
    const isLate = assignment.due_date && Date.now() > new Date(assignment.due_date).getTime();
    const result = await client.query(
      `INSERT INTO assignment_submissions (assignment_id, user_id, content_text, file_asset_id, audio_asset_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, assignment_id, user_id, content_text, file_asset_id, audio_asset_id, status, submitted_at`,
      [assignmentId, req.user.id, contentText?.trim() || "", fileAssetId, audioAssetId, isLate ? "late" : "submitted"],
    );
    await client.query("UPDATE submission_assets SET assignment_id = $1, updated_at = NOW() WHERE id = ANY($2::bigint[]) AND user_id = $3", [assignmentId, [fileAssetId, audioAssetId].filter(Boolean), req.user.id]);
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: result.rows[0], message: "Nộp bài tập thành công! Giáo viên sẽ chấm điểm sớm." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error submitting assignment:", error);
    if (error.code === "23505") return conflict(res, "Bài đã được nộp, không thể nộp đè", "SUBMISSION_LOCKED");
    return internalError(res, "Lỗi khi nộp bài tập");
  } finally {
    client.release();
  }
});

// POST /api/assignments/submissions/:submissionId/grade — transactional grade + history + notification.
router.post("/submissions/:submissionId/grade", protectRoute, requireTeacher, requirePermission("lms.assignment.grade"), async (req, res) => {
  const client = await getClient();
  try {
    const submissionId = parsePositiveId(req.params.submissionId);
    const numericScore = Number(req.body.score);
    if (!submissionId) return validationError(res, "submissionId không hợp lệ");
    if (req.body.score === undefined || req.body.score === null || !Number.isFinite(numericScore)) return validationError(res, "Điểm số không hợp lệ");
    if (req.body.feedbackText !== undefined && (typeof req.body.feedbackText !== "string" || req.body.feedbackText.length > 10000)) return validationError(res, "Nội dung phản hồi không hợp lệ");
    await client.query("BEGIN");
    const submissionResult = await client.query(
      `SELECT s.id, s.user_id, s.assignment_id, a.title AS assignment_title, a.instructor_id, a.max_score
       FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1 FOR UPDATE`,
      [submissionId],
    );
    const submission = submissionResult.rows[0];
    if (!submission) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy bài nộp"); }
    if (!canManageAssignment(submission, req.user)) { await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền chấm bài nộp này"); }
    if (numericScore < 0 || numericScore > Number(submission.max_score)) { await client.query("ROLLBACK"); return validationError(res, `Điểm phải nằm trong khoảng 0 đến ${submission.max_score}`); }
    const grade = await client.query(
      `INSERT INTO submission_grades (submission_id, grader_id, score, feedback_text)
       VALUES ($1, $2, $3, $4) RETURNING id, submission_id, grader_id, score, feedback_text, graded_at`,
      [submissionId, req.user.id, numericScore, req.body.feedbackText?.trim() || ""],
    );
    await client.query("UPDATE assignment_submissions SET status = 'graded' WHERE id = $1", [submissionId]);
    await recordAuditEvent({
      db: client,
      actorId: req.user.id,
      action: "submission.graded",
      entityType: "assignment_submission",
      entityId: submissionId,
      afterState: { score: numericScore, feedbackText: req.body.feedbackText?.trim() || "", status: "graded" },
      metadata: { assignmentId: submission.assignment_id, ip: req.ip },
    });
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, link_url, dedupe_key)
       VALUES ($1, $2, $3, 'grade', $4, $5) ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [submission.user_id, "Bài tập đã được chấm", `Bài “${submission.assignment_title}” đã có điểm ${numericScore}/${submission.max_score}.`, `/lms/assignment/${submission.assignment_id}/submit`, `assignment-grade:${submissionId}:${grade.rows[0].id}`],
    );
    const gradeRatio = Number(submission.max_score) > 0 ? numericScore / Number(submission.max_score) : 0;
    const gamification = await awardXp({
      db: client,
      userId: submission.user_id,
      eventKey: `assignment:${submissionId}:graded`,
      eventType: "assignment_graded",
      xp: gradeRatio >= 0.5 ? XP_VALUES.assignmentGraded : XP_VALUES.assignmentReviewed,
      metadata: { assignmentId: submission.assignment_id, submissionId },
    });
    await client.query("COMMIT");
    return res.json({ success: true, data: { ...grade.rows[0], gamification }, message: "Chấm điểm bài nộp thành công" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error grading submission:", error);
    return internalError(res, "Lỗi khi chấm điểm bài nộp");
  } finally {
    client.release();
  }
});

const getQuiz = async (quizId, db = { query }) => {
  const result = await db.query(
    `SELECT q.id, q.title, q.description, q.status AS quiz_status, q.duration_minutes, q.passing_score, q.instructor_id, q.paper_file_id, q.live_class_id, q.class_session_id, q.course_id AS quiz_course_id, q.lesson_id,
            COALESCE(q.course_id, l.course_id) AS resolved_course_id,
            c.is_published AS course_is_published,
            COALESCE(c.is_management_managed, FALSE) AS course_is_management_managed,
            c.author_id AS course_author_id,
            l.is_published AS lesson_is_published,
            paper.status AS paper_status, lc.title AS class_title,
            cs.title AS session_title, cs.start_time AS session_start, cs.end_time AS session_end
     FROM quizzes q LEFT JOIN lessons l ON l.id = q.lesson_id
     LEFT JOIN courses c ON c.id = COALESCE(q.course_id, l.course_id)
     LEFT JOIN lms_learning_files paper ON paper.id = q.paper_file_id
     LEFT JOIN live_classes lc ON lc.id = q.live_class_id
     LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
     WHERE q.id = $1`,
    [quizId],
  );
  return result.rows[0] || null;
};

const ensureQuizAccess = async (quiz, user, db = { query }) => {
  if (user.role === "admin") return true;
  if (user.role === "creator") return String(quiz.course_author_id) === String(user.id) || String(quiz.instructor_id) === String(user.id);
  if (user.role !== "user" || quiz.quiz_status !== "PUBLISHED" || !quiz.resolved_course_id || !quiz.course_is_published || quiz.lesson_is_published === false) return false;
  const enrollment = await db.query(
    `SELECT 1 FROM enrollments WHERE $3::boolean = FALSE AND user_id = $1 AND course_id = $2 AND status = 'active'
     UNION ALL
     SELECT 1 FROM lms_access_grants
     WHERE user_id = $1 AND course_id = $2 AND access_status = 'active'
       AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())
     UNION ALL
     SELECT 1 FROM class_enrollments ce
     JOIN live_classes lc ON lc.id = ce.live_class_id
     JOIN courses c ON c.id = lc.course_id
     WHERE COALESCE(c.is_management_managed, FALSE) = FALSE AND ce.user_id = $1 AND lc.course_id = $2
       AND ce.status = 'active' AND lc.status = 'active'
     LIMIT 1`,
    [user.id, quiz.resolved_course_id, Boolean(quiz.course_is_management_managed)],
  );
  if (enrollment.rows.length === 0) return false;
  if (!quiz.live_class_id) return true;
  const classEnrollment = await db.query(
    `SELECT 1 FROM class_enrollments ce
     JOIN live_classes lc ON lc.id = ce.live_class_id
     WHERE ce.user_id = $1 AND ce.live_class_id = $2 AND ce.status = 'active' AND lc.status = 'active'
     LIMIT 1`,
    [user.id, quiz.live_class_id],
  );
  return classEnrollment.rows.length > 0;
};

const getQuizQuestions = async (quizId, db = { query }) => {
  const result = await db.query(
    `SELECT id, quiz_id, question_text, question_type, options_json, correct_answer, explanation, points, sort_order
     FROM quiz_questions WHERE quiz_id = $1 ORDER BY sort_order, id`,
    [quizId],
  );
  return result.rows;
};

const publicQuestion = (question) => ({
  id: question.id,
  quiz_id: question.quiz_id,
  question_text: question.question_text,
  question_type: question.question_type,
  options: parseOptions(question.options_json),
  points: Number(question.points),
});

const buildQuizResult = (questions, answers) => {
  const review = questions.map((question) => {
    const studentAnswer = answers?.[String(question.id)] ?? answers?.[question.id] ?? null;
    const isCorrect = answersMatch(question, studentAnswer);
    const points = Number(question.points) || 0;
    return { questionId: question.id, studentAnswer, correctAnswer: parseStoredAnswer(question.correct_answer), explanation: question.explanation || "", points, earnedPoints: isCorrect ? points : 0, isCorrect };
  });
  const score = review.reduce((sum, item) => sum + item.earnedPoints, 0);
  const maxScore = review.reduce((sum, item) => sum + item.points, 0);
  return { score: Number(score.toFixed(2)), maxScore: Number(maxScore.toFixed(2)), percentage: maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0, review };
};

const validateQuizAnswers = (questions, answers) => {
  const questionIds = new Set(questions.map((question) => String(question.id)));
  for (const key of Object.keys(answers)) if (!questionIds.has(String(key))) return "Bài làm chứa câu hỏi không thuộc đề thi";
  for (const question of questions) {
    const value = answers[String(question.id)];
    if (value === undefined || value === null || value === "") continue;
    const options = parseOptions(question.options_json).map((option) => String(option.key));
    if (question.question_type === "multiple_choice") {
      if (!Array.isArray(value) || value.length > options.length || value.some((item) => !options.includes(String(item)))) return "Đáp án nhiều lựa chọn không hợp lệ";
    } else if (question.question_type === "single_choice") {
      if (typeof value !== "string" || !options.includes(value)) return "Đáp án lựa chọn không hợp lệ";
    } else if (typeof value !== "string" || value.length > 1000) return "Đáp án điền vào không hợp lệ";
  }
  return null;
};

// GET /api/assignments/quizzes/:quizId — questions never include correct_answer before submit.
router.get("/quizzes/:quizId", protectRoute, async (req, res) => {
  try {
    const quizId = parsePositiveId(req.params.quizId);
    if (!quizId) return validationError(res, "quizId không hợp lệ");
    const quiz = await getQuiz(quizId);
    if (!quiz) return notFound(res, "Không tìm thấy đề thi");
    if (!(await ensureQuizAccess(quiz, req.user))) return forbidden(res, "Bạn chưa được cấp quyền làm đề thi này");
    const questions = await getQuizQuestions(quizId);
    if (questions.length === 0) return notFound(res, "Đề thi chưa có câu hỏi");
    let attempt = null;
    let result = null;
    if (req.user.role === "user") {
      await query(`INSERT INTO quiz_attempts (quiz_id, user_id) VALUES ($1, $2) ON CONFLICT (user_id, quiz_id) DO NOTHING`, [quizId, req.user.id]);
      const attemptResult = await query("SELECT id, answers_json, status, started_at, submitted_at FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2", [quizId, req.user.id]);
      attempt = attemptResult.rows[0] || null;
      if (attempt?.status === "submitted") result = buildQuizResult(questions, attempt.answers_json || {});
    }
    return res.json({
      success: true,
      data: {
        id: quiz.id,
        quizId: quiz.id,
        title: quiz.title,
        description: quiz.description || "",
        classId: quiz.live_class_id || null,
        classTitle: quiz.class_title || null,
        sessionId: quiz.class_session_id || null,
        sessionTitle: quiz.session_title || null,
        sessionStart: quiz.session_start || null,
        sessionEnd: quiz.session_end || null,
        paperUrl: quiz.paper_file_id && quiz.paper_status === "ready" ? `/api/files/${quiz.paper_file_id}/download` : null,
        durationMinutes: quiz.duration_minutes,
        timeLimitSeconds: Number(quiz.duration_minutes) * 60,
        passingScore: Number(quiz.passing_score),
        questions: questions.map(publicQuestion),
        attempt: attempt ? { id: attempt.id, status: attempt.status, answers: attempt.answers_json || {}, startedAt: attempt.started_at, submittedAt: attempt.submitted_at } : null,
        result: result ? { ...result, passed: result.percentage >= Number(quiz.passing_score) } : null,
      },
    });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return internalError(res, "Lỗi khi lấy đề trắc nghiệm");
  }
});

// POST /api/assignments/quizzes/:quizId/submit — one server-graded, idempotent attempt.
router.post("/quizzes/:quizId/submit", protectRoute, requireRole("user"), async (req, res) => {
  const client = await getClient();
  try {
    const quizId = parsePositiveId(req.params.quizId);
    if (!quizId || !isPlainObject(req.body.answers)) return validationError(res, "answers không hợp lệ");
    const quiz = await getQuiz(quizId);
    if (!quiz) return notFound(res, "Không tìm thấy đề thi");
    if (!(await ensureQuizAccess(quiz, req.user))) return forbidden(res, "Bạn chưa được cấp quyền làm đề thi này");
    const questions = await getQuizQuestions(quizId);
    const answerError = validateQuizAnswers(questions, req.body.answers);
    if (answerError) return validationError(res, answerError);
    await client.query("BEGIN");
    await client.query(`INSERT INTO quiz_attempts (quiz_id, user_id) VALUES ($1, $2) ON CONFLICT (user_id, quiz_id) DO NOTHING`, [quizId, req.user.id]);
    const attemptResult = await client.query("SELECT id, answers_json, status FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2 FOR UPDATE", [quizId, req.user.id]);
    const attempt = attemptResult.rows[0];
    if (!attempt) { await client.query("ROLLBACK"); return internalError(res, "Không thể khởi tạo lượt làm bài"); }
    if (attempt.status === "submitted") {
      const previous = buildQuizResult(questions, attempt.answers_json || {});
      await client.query("COMMIT");
      return res.json({ success: true, data: { ...previous, passed: previous.percentage >= Number(quiz.passing_score), attemptId: attempt.id, alreadySubmitted: true, message: "Lượt làm bài đã được ghi nhận trước đó." } });
    }
    const computed = buildQuizResult(questions, req.body.answers);
    const passed = computed.percentage >= Number(quiz.passing_score);
    await client.query(
      `UPDATE quiz_attempts SET answers_json = $1::jsonb, score = $2, max_score = $3,
       status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $4`,
      [JSON.stringify(req.body.answers), computed.score, computed.maxScore, attempt.id],
    );
    const gamification = await awardXp({
      db: client,
      userId: req.user.id,
      eventKey: `quiz:${quizId}:submitted`,
      eventType: "quiz_submitted",
      xp: passed ? XP_VALUES.quizPassed : XP_VALUES.quizSubmitted,
      metadata: { quizId, attemptId: attempt.id, passed, percentage: computed.percentage },
    });
    await client.query("COMMIT");
    return res.json({ success: true, data: { ...computed, passed, attemptId: attempt.id, alreadySubmitted: false, gamification, message: passed ? "Chúc mừng, bạn đã đạt yêu cầu!" : "Bạn chưa đạt điểm yêu cầu, hãy xem lại lời giải." } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error submitting quiz:", error);
    return internalError(res, "Lỗi khi nộp bài trắc nghiệm");
  } finally {
    client.release();
  }
});

export default router;
