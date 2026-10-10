import express from "express";
import crypto from "node:crypto";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import requireActiveStudentLmsAccess, { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
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
import { broadcastToClass } from "../services/notification.service.js";
import { sendNotificationEmail } from "../services/brevoEmail.service.js";
import { assertGradebookOpen, notifyWorkflow, requiredReason } from "../services/lmsWorkflow.service.js";
import { canResubmit, normalizeAnnotations } from "../services/lmsWorkflowPolicy.service.js";
import {
  QUIZ_REVIEW_POLICIES,
  getAttemptExpiry,
  getQuizAvailability,
  normalizeRubric,
  normalizeRubricScores,
  reviewIsAvailable,
} from "../services/assessmentPolicy.service.js";

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

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseOptions = (value) => {
  return parseJsonArray(value);
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
            rubric.criteria_json AS rubric_criteria,
            instructor.avatar_url AS instructor_avatar
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     LEFT JOIN live_classes lc ON lc.id = a.live_class_id
     LEFT JOIN class_sessions cs ON cs.id = a.class_session_id
     LEFT JOIN courses class_course ON class_course.id = lc.course_id
     LEFT JOIN users instructor ON instructor.id = a.instructor_id
     LEFT JOIN assignment_rubrics rubric ON rubric.assignment_id = a.id
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
         AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())`,
      [userId, courseId],
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

const isAssignedTeacher = async (classId, userId, db = { query }) => Boolean((await db.query(
  `SELECT 1 FROM live_classes lc WHERE lc.id = $1 AND
   (EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id
      AND ct.teacher_id = $2 AND ct.status = 'active') OR
    lc.instructor_id = $2 AND NOT EXISTS (SELECT 1 FROM class_teachers ct
      WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2))`,
  [classId, userId],
)).rows[0]);

const ownsAssignment = async (assignment, user, db = { query }) => {
  if (user.role === "admin") return true;
  if (user.role !== "creator" || String(assignment.instructor_id) !== String(user.id)) return false;
  return !assignment.live_class_id || await isAssignedTeacher(assignment.live_class_id, user.id, db);
};

// A class can have a lead teacher and active co-teachers. Co-teachers share
// the grading queue for class-bound work, while editing remains reserved for
// the activity author (or an administrator).
const canGradeAssignment = async (assignment, user, db = { query }) => {
  if (await ownsAssignment(assignment, user, db)) return true;
  if (user.role !== "creator" || !assignment.live_class_id) return false;
  const result = await db.query(
    `SELECT 1 FROM class_teachers
     WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'`,
    [assignment.live_class_id, user.id],
  );
  return result.rows.length > 0;
};

const getAssessmentAccommodation = async ({ assessmentType, assessmentId, userId, db = { query } }) => {
  const result = await db.query(
    `SELECT id, assessment_type, assessment_id, user_id, due_at, extra_time_minutes,
            attempt_limit_override, reason, status, created_at, updated_at
     FROM assessment_accommodations
     WHERE assessment_type = $1 AND assessment_id = $2 AND user_id = $3 AND status = 'active'`,
    [assessmentType, assessmentId, userId],
  );
  return result.rows[0] || null;
};

const serializeAccommodation = (row) => row ? {
  id: row.id,
  assessmentType: row.assessment_type,
  assessmentId: row.assessment_id,
  userId: row.user_id,
  dueAt: row.due_at || null,
  extraTimeMinutes: Number(row.extra_time_minutes || 0),
  attemptLimitOverride: row.attempt_limit_override === null ? null : Number(row.attempt_limit_override),
  reason: row.reason,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
} : null;

const effectiveAssignmentDueDate = (assignment, accommodation) => accommodation?.due_at || assignment.due_date || null;

const effectiveQuizForStudent = (quiz, accommodation) => {
  if (!accommodation) return { ...quiz, accommodation: null };
  return {
    ...quiz,
    due_date: accommodation.due_at || quiz.due_date,
    available_until: accommodation.due_at || quiz.available_until,
    duration_minutes: Number(quiz.duration_minutes || 0) + Number(accommodation.extra_time_minutes || 0),
    attempt_limit: accommodation.attempt_limit_override || quiz.attempt_limit,
    accommodation: serializeAccommodation(accommodation),
  };
};

const canManageCourseQuestionBank = async ({ courseId, user, db = { query } }) => {
  if (user.role === "admin") return true;
  const result = await db.query(
    `SELECT 1
     FROM courses c
     WHERE c.id = $1 AND (
       c.author_id = $2 OR EXISTS (
         SELECT 1 FROM live_classes lc
         WHERE lc.course_id = c.id AND (
           lc.instructor_id = $2 OR EXISTS (
             SELECT 1 FROM class_teachers ct
             WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
           )
         )
       )
     )`,
    [courseId, user.id],
  );
  return result.rows.length > 0;
};

const normalizeQuestionBankInput = (value) => {
  const questionText = typeof value?.questionText === "string" ? value.questionText.trim() : "";
  const options = Array.isArray(value?.options)
    ? value.options.slice(0, 6).map((text, index) => ({ key: String.fromCharCode(65 + index), text: String(text || "").trim() })).filter((option) => option.text)
    : [];
  const correctAnswer = Number.isInteger(value?.correctAnswer) ? value.correctAnswer : -1;
  const explanation = typeof value?.explanation === "string" ? value.explanation.trim() : "";
  const points = Number(value?.points);
  const rawTags = Array.isArray(value?.tags) ? value.tags : [];
  const tags = [...new Set(rawTags.map((tag) => String(tag || "").trim().toLocaleLowerCase()).filter((tag) => tag && tag.length <= 48))].slice(0, 12);
  if (!questionText || questionText.length > 6000 || options.length < 2 || options.some((option) => option.text.length > 2000) || !options[correctAnswer] || explanation.length > 4000 || !Number.isFinite(points) || points <= 0 || points > 100) {
    throw new Error("INVALID_BANK_QUESTION");
  }
  const difficulty = value.difficulty || "medium";
  const visibility = value.visibility || "private";
  if (!["easy", "medium", "hard"].includes(difficulty) || !["private", "course"].includes(visibility)) throw new Error("INVALID_BANK_QUESTION");
  return { questionText, options, correctAnswer: options[correctAnswer].key, explanation, points, tags, difficulty, visibility };
};

const serializeQuestionBankItem = (row) => {
  const options = parseOptions(row.options_json);
  return {
    id: row.id,
    courseId: row.course_id,
    ownerId: row.owner_id,
    difficulty: row.difficulty,
    visibility: row.visibility,
    questionText: row.question_text,
    options: options.map((option) => option.text),
    correctAnswer: Math.max(0, options.findIndex((option) => String(option.key) === String(row.correct_answer))),
    explanation: row.explanation || "",
    points: Number(row.points),
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
  };
};

const serializeAssignment = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type || row.assignment_type || "homework",
  course_id: row.course_id,
  live_class_id: row.live_class_id,
  class_session_id: row.class_session_id || null,
  activity_scope: row.activity_scope || (row.type === "quiz" ? "session" : "homework"),
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
  rubric_scores: parseJsonArray(row.rubric_scores),
  graded_at: row.graded_at || null,
  instructor_name: row.grader_name || row.instructor_name || null,
  instructor_avatar: row.grader_avatar || row.instructor_avatar || null,
  rubric: parseJsonArray(row.rubric_criteria),
  accommodation: row.accommodation || null,
  revision: Number(row.revision || 1),
  return_requested: Boolean(row.return_requested),
  return_reason: row.return_reason || "",
  resubmit_until: row.resubmit_until || null,
  can_resubmit: canResubmit(row),
  annotations: parseJsonArray(row.annotations),
  status: row.status,
});

// GET /api/assignments — students get only active enrolled work; teachers get their own queue.
router.get("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
      return forbidden(res, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực");
    }
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
        classAccessClause = `((lc.instructor_id = $3 AND NOT EXISTS
          (SELECT 1 FROM class_teachers ct0 WHERE ct0.live_class_id=lc.id AND ct0.teacher_id=$3)) OR EXISTS (
          SELECT 1 FROM class_teachers ct
          WHERE ct.live_class_id = lc.id AND ct.teacher_id = $3 AND ct.status = 'active'
        ))`;
      } else if (!isAdmin) {
        classAccessParams.push(req.user.id);
        classAccessClause = `EXISTS (
          SELECT 1 FROM class_enrollments ce
          LEFT JOIN courses course_access ON course_access.id = lc.course_id
          WHERE ce.live_class_id = lc.id AND ce.user_id = $3 AND ce.status = 'active'
            AND EXISTS (
              SELECT 1 FROM lms_access_grants g
              WHERE g.user_id = $3 AND g.course_id = course_access.id AND g.access_status = 'active'
                AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
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
        ? `(a.live_class_id IS NULL AND a.instructor_id = $1 OR a.live_class_id IS NOT NULL AND
            ((lc.instructor_id = $1 AND NOT EXISTS (SELECT 1 FROM class_teachers ct0
              WHERE ct0.live_class_id=lc.id AND ct0.teacher_id=$1)) OR EXISTS (SELECT 1 FROM class_teachers ct
              WHERE ct.live_class_id=a.live_class_id AND ct.teacher_id=$1 AND ct.status='active')))`
        : `(
             COALESCE(c.is_published, class_course.is_published) = true
             AND EXISTS (
               SELECT 1 FROM lms_access_grants g
               WHERE g.user_id = $1 AND g.course_id = COALESCE(a.course_id, lc.course_id)
                 AND g.access_status = 'active' AND g.valid_from <= NOW()
                 AND (g.valid_until IS NULL OR g.valid_until > NOW())
             )
             AND (a.live_class_id IS NULL OR (lc.status = 'active' AND EXISTS (
               SELECT 1 FROM class_enrollments ce WHERE ce.user_id = $1 AND ce.live_class_id = a.live_class_id AND ce.status = 'active'
             )))
             AND (a.course_id IS NOT NULL OR a.live_class_id IS NOT NULL)
           )`;
    const quizVisibilityClause = isAdmin
      ? "TRUE"
      : isTeacher
        ? `(q.live_class_id IS NULL AND (q.instructor_id = $1 OR c.author_id = $1) OR
            q.live_class_id IS NOT NULL AND ((quiz_lc.instructor_id = $1 AND NOT EXISTS
              (SELECT 1 FROM class_teachers ct0 WHERE ct0.live_class_id=quiz_lc.id AND ct0.teacher_id=$1)) OR EXISTS
              (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id=q.live_class_id AND ct.teacher_id=$1 AND ct.status='active')))`
        : `q.status = 'PUBLISHED' AND c.is_published = true AND EXISTS (
             SELECT 1 FROM lms_access_grants g
             WHERE g.user_id = $1 AND g.course_id = c.id AND g.access_status = 'active'
               AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
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
                 a.max_score, COALESCE(assignment_accommodation.due_at, a.due_date) AS due_date, a.attachment_url, a.created_at, a.updated_at,
                COALESCE(c.title, c.name) AS course_title,
                s.id AS submission_id, s.status AS submission_status,
                s.submitted_at, s.content_text, s.file_asset_id, s.audio_asset_id,
                fa.original_filename AS file_name, aa.original_filename AS audio_name,
                sg.score, sg.feedback_text, sg.graded_at,
                a.class_session_id, NULL::varchar AS activity_scope, assignment_session.title AS session_title,
                assignment_session.start_time AS session_start, assignment_session.end_time AS session_end, lc.title AS class_title,
                 CASE WHEN sg.score IS NOT NULL THEN 'graded'
                     WHEN s.id IS NOT NULL THEN s.status
                      WHEN COALESCE(assignment_accommodation.due_at, a.due_date) IS NOT NULL AND COALESCE(assignment_accommodation.due_at, a.due_date) < NOW() THEN 'late'
                     ELSE 'todo' END AS status
         FROM assignments a
         LEFT JOIN courses c ON c.id = a.course_id
         LEFT JOIN live_classes lc ON lc.id = a.live_class_id
         LEFT JOIN class_sessions assignment_session ON assignment_session.id = a.class_session_id
         LEFT JOIN courses class_course ON class_course.id = lc.course_id
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $1
          LEFT JOIN assessment_accommodations assignment_accommodation
            ON assignment_accommodation.assessment_type = 'assignment' AND assignment_accommodation.assessment_id = a.id
            AND assignment_accommodation.user_id = $1 AND assignment_accommodation.status = 'active'
         LEFT JOIN submission_assets fa ON fa.id = s.file_asset_id
         LEFT JOIN submission_assets aa ON aa.id = s.audio_asset_id
         LEFT JOIN LATERAL (
           SELECT score, feedback_text, graded_at FROM submission_grades
           WHERE submission_id = s.id AND submission_revision = s.revision ORDER BY graded_at DESC, id DESC LIMIT 1
         ) sg ON true
         WHERE ${visibilityClause} ${assignmentCourseScope} ${assignmentClassScope} ${assignmentSessionScope}
       ), quiz_rows AS (
          SELECT q.id, q.title, 'quiz' AS type, COALESCE(q.course_id, l.course_id) AS course_id, q.live_class_id, q.description,
                (SELECT COALESCE(SUM(qq.points), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS max_score,
                 COALESCE(quiz_accommodation.due_at, q.due_date) AS due_date, NULL::varchar AS attachment_url, q.created_at, q.updated_at,
                COALESCE(c.title, c.name) AS course_title,
                qa.id AS submission_id, qa.status AS submission_status, qa.submitted_at,
                NULL::text AS content_text, NULL::bigint AS file_asset_id, NULL::bigint AS audio_asset_id,
                NULL::varchar AS file_name, NULL::varchar AS audio_name,
                qa.score, NULL::text AS feedback_text, qa.submitted_at AS graded_at,
                q.class_session_id, q.activity_scope, quiz_session.title AS session_title,
                quiz_session.start_time AS session_start, quiz_session.end_time AS session_end, quiz_lc.title AS class_title,
                 CASE WHEN qa.status = 'submitted' THEN 'graded'
                      WHEN q.activity_scope = 'homework' AND COALESCE(quiz_accommodation.due_at, q.due_date) IS NOT NULL AND COALESCE(quiz_accommodation.due_at, q.due_date) < NOW() THEN 'late'
                     ELSE 'todo' END AS status
         FROM quizzes q
         LEFT JOIN lessons l ON l.id = q.lesson_id
         JOIN courses c ON c.id = COALESCE(q.course_id, l.course_id)
         LEFT JOIN live_classes quiz_lc ON quiz_lc.id = q.live_class_id
         LEFT JOIN class_sessions quiz_session ON quiz_session.id = q.class_session_id
         LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = $1
          LEFT JOIN assessment_accommodations quiz_accommodation
            ON quiz_accommodation.assessment_type = 'quiz' AND quiz_accommodation.assessment_id = q.id
            AND quiz_accommodation.user_id = $1 AND quiz_accommodation.status = 'active'
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
    const ownerFilter = req.user.role === "admin" ? "TRUE" : `(q.live_class_id IS NULL AND (q.instructor_id=$1 OR c.author_id=$1)
      OR q.live_class_id IS NOT NULL AND ((lc.instructor_id=$1 AND NOT EXISTS
        (SELECT 1 FROM class_teachers ct0 WHERE ct0.live_class_id=lc.id AND ct0.teacher_id=$1)) OR EXISTS
        (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id=q.live_class_id AND ct.teacher_id=$1 AND ct.status='active')))`;
    const params = req.user.role === "admin" ? [] : [req.user.id];
    const result = await query(
      `SELECT q.id, q.title, q.description, q.paper_file_id, q.live_class_id, q.class_session_id, q.activity_scope, q.due_date, q.duration_minutes, q.passing_score,
              q.attempt_limit, q.available_from, q.available_until, q.review_policy,
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
      activityScope: row.activity_scope || "session", dueDate: row.due_date || null,
      availableFrom: row.available_from || null, availableUntil: row.available_until || null,
      attemptLimit: Number(row.attempt_limit || 1), reviewPolicy: row.review_policy || "after_submit",
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
    const accessClause = isAdmin ? "TRUE" : `((lc.instructor_id = $2 AND NOT EXISTS
      (SELECT 1 FROM class_teachers ct0 WHERE ct0.live_class_id=lc.id AND ct0.teacher_id=$2)) OR EXISTS (
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
    const activityScope = req.body?.activityScope === undefined ? "session" : req.body.activityScope;
    const dueDate = req.body?.dueDate || null;
    const attemptLimit = Number(req.body?.attemptLimit ?? 1);
    const reviewPolicy = req.body?.reviewPolicy || "after_submit";
    const rawAvailableFrom = req.body?.availableFrom || null;
    const rawAvailableUntil = req.body?.availableUntil || null;
    if (!title || title.length > 255 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240 || !Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100 || !Number.isInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > 5 || !QUIZ_REVIEW_POLICIES.has(reviewPolicy)) return validationError(res, "Thông tin đề kiểm tra không hợp lệ");
    if (questions.length < 1 || questions.length > 200) return validationError(res, "Đề kiểm tra cần từ 1 đến 200 câu hỏi");
    if (!courseId) return validationError(res, "Quiz phải được gắn với một khóa học");
    if (!liveClassId || !classSessionId) return validationError(res, "Quiz phải được gắn với một lớp và một buổi học chưa kết thúc");
    if (!["session", "homework"].includes(activityScope)) return validationError(res, "Loại hoạt động quiz không hợp lệ");
    if (dueDate && Number.isNaN(Date.parse(dueDate))) return validationError(res, "Hạn nộp Quiz không hợp lệ");
    if (rawAvailableFrom && Number.isNaN(Date.parse(rawAvailableFrom))) return validationError(res, "Thời gian mở quiz không hợp lệ");
    if (rawAvailableUntil && Number.isNaN(Date.parse(rawAvailableUntil))) return validationError(res, "Thời gian đóng quiz không hợp lệ");
    if (activityScope === "homework" && (!dueDate || new Date(dueDate).getTime() <= Date.now())) return validationError(res, "Quiz về nhà cần có hạn nộp ở tương lai");
    // Keep the session lock from validation through the insert. This prevents a
    // schedule update from moving the selected session into the past mid-request.
    await client.query("BEGIN");
    await assertGradebookOpen(client, liveClassId);
    const course = await client.query(
      "SELECT c.id, c.author_id FROM courses c WHERE c.id = $1",
      [courseId],
    );
    if (!course.rows[0]) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy khóa học"); }
    const target = await client.query(
      `SELECT cs.id, cs.status, cs.start_time, cs.end_time, lc.id AS live_class_id, lc.instructor_id,
              EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $4 AND ct.status = 'active') AS is_class_teacher
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1 AND lc.id = $2 AND lc.course_id = $3 AND lc.status = 'active'
       FOR UPDATE OF cs`,
      [classSessionId, liveClassId, courseId, req.user.id],
    );
    if (!target.rows[0]) { await client.query("ROLLBACK"); return validationError(res, "Buổi học không thuộc lớp hoặc khóa học đã chọn"); }
    const targetSession = target.rows[0];
    if (req.user.role !== "admin" && !(await isAssignedTeacher(liveClassId, req.user.id, client))) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn không phụ trách lớp hoặc buổi học này");
    }
    if (!['scheduled', 'live', 'rescheduled'].includes(targetSession.status) || new Date(targetSession.end_time).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return validationError(res, "Không thể tạo quiz cho buổi học đã kết thúc, đã hủy hoặc đã qua");
    }
    const availableFrom = rawAvailableFrom ? new Date(rawAvailableFrom) : (activityScope === "session" ? new Date(targetSession.start_time) : new Date());
    const availableUntil = rawAvailableUntil ? new Date(rawAvailableUntil) : (activityScope === "homework" ? new Date(dueDate) : new Date(targetSession.end_time));
    if (availableUntil.getTime() <= availableFrom.getTime()) { await client.query("ROLLBACK"); return validationError(res, "Thời gian đóng quiz phải sau thời gian mở"); }
    if (activityScope === "homework" && availableUntil.getTime() > new Date(dueDate).getTime()) { await client.query("ROLLBACK"); return validationError(res, "Quiz về nhà không thể đóng sau hạn nộp"); }
    if (paperFileId) {
      const paper = await client.query(
        "SELECT id FROM lms_learning_files WHERE id = $1 AND course_id = $2 AND mime_type = 'application/pdf' AND status = 'ready' AND visibility = 'COURSE'",
        [paperFileId, courseId],
      );
      if (!paper.rows[0]) { await client.query("ROLLBACK"); return validationError(res, "File đề PDF không hợp lệ hoặc chưa tải lên hoàn tất"); }
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
      `INSERT INTO quizzes (title, description, course_id, live_class_id, class_session_id, activity_scope, due_date, paper_file_id, duration_minutes, passing_score, status, shuffle_questions, instructor_id, attempt_limit, available_from, available_until, review_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, title, description, course_id, live_class_id, class_session_id, activity_scope, due_date, paper_file_id, duration_minutes, passing_score, status, shuffle_questions, attempt_limit, available_from, available_until, review_policy, created_at`,
      [title, description, courseId, liveClassId, classSessionId, activityScope, activityScope === "homework" ? dueDate : null, paperFileId, durationMinutes, passingScore, status, req.body.shuffleQuestions !== false, req.user.id, attemptLimit, availableFrom.toISOString(), availableUntil.toISOString(), reviewPolicy],
    );
    for (const question of normalizedQuestions) {
      await client.query(
        `INSERT INTO quiz_questions (quiz_id, question_text, question_type, options_json, correct_answer, explanation, points, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [quizResult.rows[0].id, question.text, question.type, JSON.stringify(question.options), question.correct, question.explanation, question.points, question.order],
      );
    }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.created", entityType: "quiz", entityId: quizResult.rows[0].id, afterState: quizResult.rows[0], metadata: { ip: req.ip, questionCount: normalizedQuestions.length, liveClassId, classSessionId, activityScope, attemptLimit, reviewPolicy } });
    await client.query("COMMIT");
    if (status === "PUBLISHED") {
      await broadcastToClass({
        liveClassId,
        title: `Quiz mới: ${title}`,
        message: activityScope === "homework"
          ? `Bạn có quiz về nhà mới. Hạn nộp: ${new Date(dueDate).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`
          : `Quiz cho buổi học “${targetSession.start_time ? new Date(targetSession.start_time).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "sắp tới"}” đã sẵn sàng theo lịch.`,
        eventType: "quiz.published",
        linkUrl: `/lms/quiz/${quizResult.rows[0].id}`,
        data: { quizId: quizResult.rows[0].id, courseId, liveClassId, classSessionId, activityScope },
        actorId: req.user.id,
        dedupePrefix: `quiz:${quizResult.rows[0].id}:published`,
      });
    }
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
  const client = await getClient();
  let inTransaction = false;
  try {
    await client.query("BEGIN"); inTransaction = true;
    const scope = (await client.query("SELECT live_class_id FROM quizzes WHERE id=$1", [quizId])).rows[0];
    if (!scope) return notFound(res, "Không tìm thấy đề kiểm tra");
    if (scope.live_class_id) await assertGradebookOpen(client, scope.live_class_id);
    const quiz = (await client.query(`SELECT q.id,q.title,q.live_class_id,q.instructor_id,c.author_id,
      EXISTS (SELECT 1 FROM quiz_attempts qa WHERE qa.quiz_id=q.id) AS has_attempts
      FROM quizzes q LEFT JOIN courses c ON c.id=q.course_id WHERE q.id=$1 FOR UPDATE OF q`, [quizId])).rows[0];
    if (!quiz) return notFound(res, "Không tìm thấy đề kiểm tra");
    const canDelete = req.user.role === "admin" || (quiz.live_class_id
      ? String(quiz.instructor_id) === String(req.user.id) && await isAssignedTeacher(quiz.live_class_id, req.user.id, client)
      : String(quiz.instructor_id) === String(req.user.id) || String(quiz.author_id) === String(req.user.id));
    if (!canDelete) return forbidden(res, "Bạn không có quyền xóa đề kiểm tra này");
    if (quiz.has_attempts) return conflict(res, "Quiz đã có học viên mở/làm bài nên không thể xóa. Hãy giữ lịch sử điểm hoặc chuyển sang lưu trữ.", "QUIZ_HAS_ATTEMPTS");
    await client.query("DELETE FROM quizzes WHERE id=$1", [quizId]);
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.deleted", entityType: "quiz", entityId: quizId, beforeState: quiz, metadata: { ip: req.ip } });
    await client.query("COMMIT"); inTransaction = false;
    return res.json({ success: true, message: "Đã xóa đề kiểm tra" });
  } catch (error) {
    if (inTransaction) { await client.query("ROLLBACK").catch(() => {}); inTransaction = false; }
    if (error.status) return res.status(error.status).json({success:false,message:error.message});
    console.error("Error deleting teacher quiz:", error);
    return internalError(res, "Lỗi khi xóa đề kiểm tra");
  } finally { if (inTransaction) await client.query("ROLLBACK").catch(() => {}); client.release(); }
});

// Course-scoped reusable questions. They never expose correct answers to students;
// only a teacher who can manage the course may read or reuse them in the authoring UI.
router.get("/teacher/question-bank", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  try {
    const courseId = parsePositiveId(req.query.courseId);
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const difficulty = req.query.difficulty || "";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) return validationError(res, "Độ khó không hợp lệ");
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    if (!(await canManageCourseQuestionBank({ courseId, user: req.user }))) return forbidden(res, "Bạn không có quyền dùng ngân hàng câu hỏi của khóa học này");
    const result = await query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM quiz_question_bank
       WHERE course_id = $1 AND (owner_id = $2 OR $3 = 'admin' OR visibility = 'course')
         AND ($4 = '' OR question_text ILIKE '%' || $4 || '%' OR $4 = ANY(tags))
         AND ($5 = '' OR difficulty = $5)
       ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET $6`,
      [courseId, req.user.id, req.user.role, search, difficulty, (page - 1) * 30],
    );
    return res.json({ success: true, data: result.rows.map((row) => ({ ...serializeQuestionBankItem(row), canEdit: req.user.role === "admin" || String(row.owner_id) === String(req.user.id) })), meta: { page, total: Number(result.rows[0]?.total_count || 0) } });
  } catch (error) {
    console.error("Error fetching question bank:", error);
    return internalError(res, "Không thể tải ngân hàng câu hỏi");
  }
});

router.post("/teacher/question-bank", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  const client = await getClient();
  try {
    const courseId = parsePositiveId(req.body?.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    if (!(await canManageCourseQuestionBank({ courseId, user: req.user }))) return forbidden(res, "Bạn không có quyền thêm câu hỏi cho khóa học này");
    const question = normalizeQuestionBankInput(req.body);
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO quiz_question_bank (course_id, owner_id, question_text, question_type, options_json, correct_answer, explanation, points, tags, difficulty, visibility)
       VALUES ($1, $2, $3, 'single_choice', $4::jsonb, $5, $6, $7, $8::text[], $9, $10)
       RETURNING *`,
      [courseId, req.user.id, question.questionText, JSON.stringify(question.options), question.correctAnswer, question.explanation, question.points, question.tags, question.difficulty, question.visibility],
    );
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "question_bank.created", entityType: "quiz_question_bank", entityId: result.rows[0].id, afterState: { courseId, tags: question.tags }, metadata: { ip: req.ip } });
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: serializeQuestionBankItem(result.rows[0]), message: "Đã lưu câu hỏi vào ngân hàng" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.message === "INVALID_BANK_QUESTION") return validationError(res, "Câu hỏi cần có nội dung, từ 2 đến 6 phương án, đáp án đúng và điểm hợp lệ");
    console.error("Error creating question bank item:", error);
    return internalError(res, "Không thể lưu câu hỏi vào ngân hàng");
  } finally { client.release(); }
});

router.put("/teacher/question-bank/:itemId", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  const client = await getClient();
  try {
    const id = parsePositiveId(req.params.itemId);
    if (!id) return validationError(res, "Mã câu hỏi không hợp lệ");
    const question = normalizeQuestionBankInput(req.body);
    await client.query("BEGIN");
    const before = (await client.query("SELECT * FROM quiz_question_bank WHERE id=$1 AND (owner_id=$2 OR $3='admin') FOR UPDATE", [id, req.user.id, req.user.role])).rows[0];
    if (!before || !(await canManageCourseQuestionBank({ courseId: before.course_id, user: req.user, db: client }))) { await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền sửa câu hỏi này"); }
    const row = (await client.query(`UPDATE quiz_question_bank SET question_text=$2,options_json=$3::jsonb,correct_answer=$4,explanation=$5,points=$6,tags=$7::text[],difficulty=$8,visibility=$9 WHERE id=$1 RETURNING *`,
      [id, question.questionText, JSON.stringify(question.options), question.correctAnswer, question.explanation, question.points, question.tags, question.difficulty, question.visibility])).rows[0];
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "question_bank.updated", entityType: "quiz_question_bank", entityId: id, beforeState: before, afterState: row });
    await client.query("COMMIT"); res.json({ success: true, data: serializeQuestionBankItem(row) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(error.message === "INVALID_BANK_QUESTION" ? 422 : 500).json({ success: false, message: "Không thể lưu câu hỏi. Kiểm tra nội dung, đáp án và điểm." });
  } finally { client.release(); }
});

router.post("/teacher/question-bank/sample", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  try {
    const courseId = parsePositiveId(req.body.courseId);
    const blueprint = ["easy", "medium", "hard"].map((difficulty) => ({ difficulty, count: Number(req.body.blueprint?.[difficulty] || 0) }));
    if (!courseId || blueprint.some((v) => !Number.isInteger(v.count) || v.count < 0 || v.count > 100)
      || blueprint.reduce((sum, v) => sum + v.count, 0) < 1 || blueprint.reduce((sum, v) => sum + v.count, 0) > 100) return validationError(res, "Chọn tổng số câu từ 1 đến 100");
    if (!(await canManageCourseQuestionBank({ courseId, user: req.user }))) return forbidden(res, "Bạn không có quyền dùng ngân hàng khóa này");
    const tag = String(req.body.tag || "").trim().toLocaleLowerCase().slice(0, 48);
    const questions = [];
    for (const item of blueprint) {
      if (!item.count) continue;
      const result = await query(`SELECT * FROM quiz_question_bank WHERE course_id=$1
        AND (owner_id=$2 OR $3='admin' OR visibility='course') AND difficulty=$4 AND ($5='' OR $5=ANY(tags))
        ORDER BY RANDOM() LIMIT $6`, [courseId, req.user.id, req.user.role, item.difficulty, tag, item.count]);
      if (result.rows.length < item.count) return validationError(res, `Không đủ câu mức ${({easy:"dễ",medium:"vừa",hard:"khó"})[item.difficulty]} trong bộ lọc.`);
      questions.push(...result.rows.map(serializeQuestionBankItem));
    }
    return res.json({ success: true, data: questions });
  } catch (error) { console.error("Sample bank:", error); return internalError(res, "Không thể rút câu hỏi"); }
});

router.delete("/teacher/question-bank/:itemId", protectRoute, requireTeacher, requirePermission("lms.quiz.manage"), async (req, res) => {
  const client = await getClient();
  try {
    const itemId = parsePositiveId(req.params.itemId);
    if (!itemId) return validationError(res, "itemId không hợp lệ");
    await client.query("BEGIN");
    const before = (await client.query("SELECT * FROM quiz_question_bank WHERE id=$1 AND (owner_id=$2 OR $3='admin') FOR UPDATE", [itemId, req.user.id, req.user.role])).rows[0];
    if (!before || !(await canManageCourseQuestionBank({ courseId: before.course_id, user: req.user, db: client }))) {
      await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền xóa câu hỏi này");
    }
    await client.query("DELETE FROM quiz_question_bank WHERE id=$1", [itemId]);
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "question_bank.deleted", entityType: "quiz_question_bank", entityId: itemId, beforeState: before, metadata: { ip: req.ip } });
    await client.query("COMMIT");
    return res.json({ success: true, message: "Đã xóa câu hỏi khỏi ngân hàng" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error deleting question bank item:", error);
    return internalError(res, "Không thể xóa câu hỏi khỏi ngân hàng");
  } finally { client.release(); }
});

const assessmentContextForAccommodation = async ({ assessmentType, assessmentId, user, db = { query } }) => {
  if (assessmentType === "assignment") {
    const assignment = await getAssignment(assessmentId, db);
    if (!assignment || !(await canGradeAssignment(assignment, user, db))) return null;
    return { assessment: assignment, liveClassId: assignment.live_class_id, baseAttemptLimit: null };
  }
  const result = await db.query(
    `SELECT q.id, q.live_class_id, q.attempt_limit, q.instructor_id, q.due_date, q.available_until, c.author_id
     FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE q.id = $1`, [assessmentId],
  );
  const quiz = result.rows[0];
  if (!quiz) return null;
  const allowed = user.role === "admin" || (quiz.live_class_id
    ? await isAssignedTeacher(quiz.live_class_id, user.id, db)
    : String(quiz.instructor_id) === String(user.id) || String(quiz.author_id) === String(user.id));
  return allowed ? { assessment: quiz, liveClassId: quiz.live_class_id, baseAttemptLimit: Number(quiz.attempt_limit || 1) } : null;
};

router.get("/teacher/accommodations", protectRoute, requireTeacher, requirePermission("lms.assessment.accommodate"), async (req, res) => {
  try {
    const assessmentType = req.query.assessmentType;
    const assessmentId = parsePositiveId(req.query.assessmentId);
    if (!["assignment", "quiz"].includes(assessmentType) || !assessmentId) return validationError(res, "assessmentType/assessmentId không hợp lệ");
    const context = await assessmentContextForAccommodation({ assessmentType, assessmentId, user: req.user });
    if (!context) return forbidden(res, "Bạn không có quyền xem điều chỉnh của hoạt động này");
    const result = await query(
      `SELECT accommodation.*, COALESCE(u.username, u.email) AS student_name, u.email AS student_email
       FROM assessment_accommodations accommodation JOIN users u ON u.id = accommodation.user_id
       WHERE accommodation.assessment_type = $1 AND accommodation.assessment_id = $2
       ORDER BY accommodation.status = 'active' DESC, LOWER(COALESCE(u.username, u.email))`, [assessmentType, assessmentId],
    );
    return res.json({ success: true, data: result.rows.map((row) => ({ ...serializeAccommodation(row), studentName: row.student_name, studentEmail: row.student_email })) });
  } catch (error) {
    console.error("Error fetching assessment accommodations:", error);
    return internalError(res, "Không thể tải điều chỉnh riêng của học viên");
  }
});

router.put("/teacher/accommodations", protectRoute, requireTeacher, requirePermission("lms.assessment.accommodate"), async (req, res) => {
  const assessmentType = req.body?.assessmentType;
  const assessmentId = parsePositiveId(req.body?.assessmentId);
  const userId = parsePositiveId(req.body?.userId);
  const dueAt = req.body?.dueAt ? new Date(req.body.dueAt) : null;
  const extraTimeMinutes = Number(req.body?.extraTimeMinutes || 0);
  const rawAttemptLimit = req.body?.attemptLimitOverride;
  const attemptLimitOverride = rawAttemptLimit === undefined || rawAttemptLimit === null || rawAttemptLimit === "" ? null : Number(rawAttemptLimit);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!["assignment", "quiz"].includes(assessmentType) || !assessmentId || !userId || (dueAt && Number.isNaN(dueAt.getTime())) || (dueAt && dueAt.getTime() <= Date.now()) || !Number.isInteger(extraTimeMinutes) || extraTimeMinutes < 0 || extraTimeMinutes > 480 || (attemptLimitOverride !== null && (!Number.isInteger(attemptLimitOverride) || attemptLimitOverride < 1 || attemptLimitOverride > 10)) || reason.length < 10 || reason.length > 2000) {
    return validationError(res, "Dữ liệu điều chỉnh chưa hợp lệ; hạn nộp phải ở tương lai và lý do từ 10 đến 2000 ký tự");
  }
  if (!dueAt && extraTimeMinutes === 0 && attemptLimitOverride === null) return validationError(res, "Hãy thiết lập ít nhất một điều chỉnh cho học viên");
  if (assessmentType === "assignment" && (extraTimeMinutes !== 0 || attemptLimitOverride !== null)) return validationError(res, "Bài tự luận chỉ hỗ trợ gia hạn nộp riêng");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const context = await assessmentContextForAccommodation({ assessmentType, assessmentId, user: req.user, db: client });
    if (!context) { await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền điều chỉnh hoạt động này"); }
    const baseDeadline = context.assessment.due_date || context.assessment.available_until;
    if (dueAt && baseDeadline && dueAt < new Date(baseDeadline)) { await client.query("ROLLBACK"); return validationError(res, "Gia hạn riêng không được sớm hơn hạn chung"); }
    if (assessmentType === "assignment" && (extraTimeMinutes > 0 || attemptLimitOverride !== null)) { await client.query("ROLLBACK"); return validationError(res, "Bài tự luận chỉ hỗ trợ gia hạn nộp"); }
    if (!context.liveClassId) { await client.query("ROLLBACK"); return validationError(res, "Hoạt động này chưa gắn lớp nên không thể điều chỉnh theo học viên"); }
    const enrolled = await client.query("SELECT 1 FROM class_enrollments WHERE live_class_id = $1 AND user_id = $2 AND status = 'active'", [context.liveClassId, userId]);
    if (!enrolled.rows[0]) { await client.query("ROLLBACK"); return validationError(res, "Học viên không thuộc lớp nhận hoạt động này"); }
    if (assessmentType === "quiz" && attemptLimitOverride !== null && attemptLimitOverride < context.baseAttemptLimit) {
      await client.query("ROLLBACK");
      return validationError(res, "Số lượt riêng không được thấp hơn số lượt làm mặc định của quiz");
    }
    const existing = await getAssessmentAccommodation({ assessmentType, assessmentId, userId, db: client });
    const result = await client.query(
      `INSERT INTO assessment_accommodations
         (assessment_type, assessment_id, user_id, due_at, extra_time_minutes, attempt_limit_override, reason, status, created_by, revoked_by, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NULL, NULL)
       ON CONFLICT (assessment_type, assessment_id, user_id) DO UPDATE SET
         due_at = EXCLUDED.due_at, extra_time_minutes = EXCLUDED.extra_time_minutes,
         attempt_limit_override = EXCLUDED.attempt_limit_override, reason = EXCLUDED.reason,
         status = 'active', created_by = EXCLUDED.created_by, revoked_by = NULL, revoked_at = NULL, updated_at = NOW()
       RETURNING *`,
      [assessmentType, assessmentId, userId, dueAt?.toISOString() || null, extraTimeMinutes, attemptLimitOverride, reason, req.user.id],
    );
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "assessment.accommodation_upserted", entityType: "assessment_accommodation", entityId: result.rows[0].id, beforeState: serializeAccommodation(existing), afterState: serializeAccommodation(result.rows[0]), metadata: { ip: req.ip } });
    await notifyWorkflow(client, {
      userId, title: "Hỗ trợ học tập của bạn đã được cập nhật",
      message: `Hạn riêng: ${dueAt ? dueAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "giữ hạn chung"}. Thêm ${extraTimeMinutes} phút; lượt làm: ${attemptLimitOverride || "mặc định"}.`,
      link: assessmentType === "assignment" ? `/lms/assignment/${assessmentId}/submit` : `/lms/quiz/${assessmentId}`,
      key: `accommodation:${result.rows[0].id}:${new Date(result.rows[0].updated_at).toISOString()}`, actorId: req.user.id,
    });
    await client.query("COMMIT");
    return res.json({ success: true, data: serializeAccommodation(result.rows[0]), message: "Đã lưu điều chỉnh riêng cho học viên" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating assessment accommodation:", error);
    return internalError(res, "Không thể lưu điều chỉnh riêng cho học viên");
  } finally {
    client.release();
  }
});

// GET /api/assignments/:assignmentId — detail used by the submit screen.
router.post("/teacher/accommodations/:id/revoke", protectRoute, requireTeacher, requirePermission("lms.assessment.accommodate"), async (req, res) => {
  const client = await getClient();
  try {
    const id = parsePositiveId(req.params.id);
    const reason = requiredReason(req.body.reason);
    if (!id) return validationError(res, "Mã điều chỉnh không hợp lệ");
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM assessment_accommodations WHERE id = $1 FOR UPDATE", [id]);
    const item = result.rows[0];
    if (!item) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy điều chỉnh"); }
    const context = await assessmentContextForAccommodation({ assessmentType: item.assessment_type, assessmentId: item.assessment_id, user: req.user, db: client });
    if (!context) { await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền thu hồi điều chỉnh này"); }
    if (item.status !== "active") { await client.query("ROLLBACK"); return conflict(res, "Điều chỉnh đã được thu hồi"); }
    await client.query("UPDATE assessment_accommodations SET status = 'revoked', revoked_by = $2, revoked_at = NOW() WHERE id = $1", [id, req.user.id]);
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "assessment.accommodation_revoked", entityType: "assessment_accommodation", entityId: id, beforeState: item, afterState: { status: "revoked", reason } });
    await notifyWorkflow(client, { userId: item.user_id, title: "Điều chỉnh riêng đã được thu hồi", message: reason,
      link: item.assessment_type === "assignment" ? `/lms/assignment/${item.assessment_id}/submit` : `/lms/quiz/${item.assessment_id}`,
      key: `accommodation-revoked:${id}:${Date.now()}`, actorId: req.user.id });
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể thu hồi điều chỉnh" });
  } finally { client.release(); }
});

router.get("/:assignmentId", protectRoute, async (req, res, next) => {
  if (["all", "quizzes", "submissions", "submission-assets"].includes(req.params.assignmentId)) return next();
  try {
    if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
      return forbidden(res, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực");
    }
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!assignmentId) return validationError(res, "assignmentId không hợp lệ");
    const assignment = await getAssignment(assignmentId);
    if (!assignment) return notFound(res, "Không tìm thấy bài tập");
    if (req.user.role === "user" && !(await ensureAssignmentVisibleToStudent(assignment, req.user.id))) return forbidden(res, "Bạn chưa được cấp quyền truy cập bài tập này");
    if (req.user.role === "creator" && !(await canGradeAssignment(assignment, req.user))) return forbidden(res, "Bạn không có quyền xem bài tập này");
    const accommodation = req.user.role === "user"
      ? await getAssessmentAccommodation({ assessmentType: "assignment", assessmentId: assignmentId, userId: req.user.id })
      : null;
    const submission = await query(
      `SELECT s.id AS submission_id, s.status AS submission_status, s.submitted_at,
              s.revision, s.return_requested, s.return_reason, s.resubmit_until, sg.annotations,
              s.content_text, s.file_asset_id, s.audio_asset_id,
              fa.original_filename AS file_name, aa.original_filename AS audio_name,
              sg.score, sg.feedback_text, sg.rubric_scores, sg.graded_at, sg.grader_name, sg.grader_avatar
       FROM assignment_submissions s
       LEFT JOIN submission_assets fa ON fa.id = s.file_asset_id
       LEFT JOIN submission_assets aa ON aa.id = s.audio_asset_id
       LEFT JOIN LATERAL (
         SELECT sg.score, sg.feedback_text, sg.rubric_scores, sg.graded_at, sg.annotations,
                grader.username AS grader_name, grader.avatar_url AS grader_avatar
         FROM submission_grades sg LEFT JOIN users grader ON grader.id = sg.grader_id
         WHERE sg.submission_id = s.id AND sg.submission_revision = s.revision ORDER BY sg.graded_at DESC, sg.id DESC LIMIT 1
       ) sg ON true
       WHERE s.assignment_id = $1 AND s.user_id = $2`,
      [assignmentId, req.user.id],
    );
    const row = {
      ...assignment,
      ...(submission.rows[0] || {}),
      due_date: submission.rows[0]?.return_requested ? submission.rows[0].resubmit_until : effectiveAssignmentDueDate(assignment, accommodation),
      accommodation: serializeAccommodation(accommodation),
    };
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
router.post("/submission-assets/upload-url", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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
router.post("/submission-assets/:assetId/confirm", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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
    if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
      return forbidden(res, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực");
    }
    const assetId = parsePositiveId(req.params.assetId);
    if (!assetId) return validationError(res, "assetId không hợp lệ");
    const result = await query(
      `SELECT sa.id, sa.user_id, sa.storage_key, sa.status, a.instructor_id, a.live_class_id
       FROM submission_assets sa
       LEFT JOIN assignment_submissions s ON s.file_asset_id = sa.id OR s.audio_asset_id = sa.id
       LEFT JOIN assignments a ON a.id = COALESCE(s.assignment_id, sa.assignment_id)
       WHERE sa.id = $1`,
      [assetId],
    );
    const asset = result.rows[0];
    if (!asset) return notFound(res, "Không tìm thấy tệp bài nộp");
    const allowed = req.user.role === "admin"
      || String(asset.user_id) === String(req.user.id)
      || (req.user.role === "creator" && await canGradeAssignment(asset, req.user));
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
    const classId = parseOptionalId(req.query.classId);
    const sessionId = parseOptionalId(req.query.sessionId);
    if (req.query.classId !== undefined && !classId) return validationError(res, "classId không hợp lệ");
    if (req.query.sessionId !== undefined && !sessionId) return validationError(res, "sessionId không hợp lệ");
    const values = [];
    const filters = [];
    if (assignmentId !== "all") {
      const parsedAssignmentId = parsePositiveId(assignmentId);
      if (!parsedAssignmentId) return validationError(res, "assignmentId không hợp lệ");
      const assignment = await getAssignment(parsedAssignmentId);
      if (!assignment) return notFound(res, "Không tìm thấy bài tập");
      if (!(await canGradeAssignment(assignment, req.user))) return forbidden(res, "Bạn không có quyền xem bài nộp của bài tập này");
      values.push(parsedAssignmentId);
      filters.push(`s.assignment_id = $${values.length}`);
    } else if (req.user.role !== "admin") {
      values.push(req.user.id);
      filters.push(`((a.live_class_id IS NULL AND a.instructor_id = $${values.length}) OR
        a.live_class_id IS NOT NULL AND ((lc.instructor_id = $${values.length} AND NOT EXISTS
          (SELECT 1 FROM class_teachers ct0 WHERE ct0.live_class_id=lc.id AND ct0.teacher_id=$${values.length})) OR EXISTS (
        SELECT 1 FROM class_teachers ct
        WHERE ct.live_class_id = a.live_class_id
          AND ct.teacher_id = $${values.length}
          AND ct.status = 'active'
      )))`);
    }
    if (classId) {
      values.push(classId);
      filters.push(`a.live_class_id = $${values.length}`);
    }
    if (sessionId) {
      values.push(sessionId);
      filters.push(`a.class_session_id = $${values.length}`);
    }
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await query(
      `SELECT s.id, s.assignment_id, s.user_id, s.content_text, s.status, s.submitted_at,
              s.revision, s.return_requested, s.return_reason, s.resubmit_until, sg.annotations,
              s.file_asset_id, s.audio_asset_id, a.title AS assignment_title, a.assignment_type, a.max_score, a.due_date,
              a.live_class_id, a.class_session_id, lc.title AS class_title,
              class_session.title AS session_title, class_session.start_time AS session_start,
              u.username AS student_username, u.username AS student_name, u.email AS student_email, u.avatar_url AS student_avatar,
              fa.original_filename AS file_name, aa.original_filename AS audio_name,
              CASE WHEN s.file_asset_id IS NOT NULL THEN '/api/assignments/submission-assets/' || s.file_asset_id || '/access' END AS file_url,
              CASE WHEN s.audio_asset_id IS NOT NULL THEN '/api/assignments/submission-assets/' || s.audio_asset_id || '/access' END AS audio_url,
              sg.score, sg.feedback_text, sg.graded_at, sg.rubric_scores, rubric.criteria_json AS rubric_criteria
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN live_classes lc ON lc.id = a.live_class_id
       LEFT JOIN class_sessions class_session ON class_session.id = a.class_session_id
       LEFT JOIN submission_assets fa ON fa.id = s.file_asset_id
       LEFT JOIN submission_assets aa ON aa.id = s.audio_asset_id
       LEFT JOIN assignment_rubrics rubric ON rubric.assignment_id = a.id
       LEFT JOIN LATERAL (
         SELECT score, feedback_text, graded_at, rubric_scores, annotations FROM submission_grades
         WHERE submission_id = s.id AND submission_revision = s.revision ORDER BY graded_at DESC, id DESC LIMIT 1
       ) sg ON true
       ${whereClause}
       ORDER BY s.submitted_at DESC, s.id DESC`,
      values,
    );
    return res.json({ success: true, data: result.rows.map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      revision: Number(row.revision),
      returnRequested: row.return_requested,
      returnReason: row.return_reason,
      resubmitUntil: row.resubmit_until,
      annotations: parseJsonArray(row.annotations),
      userId: row.user_id,
      assignmentTitle: row.assignment_title,
      assignmentType: row.assignment_type,
      maxScore: Number(row.max_score),
      dueDate: row.due_date,
      classId: row.live_class_id ? String(row.live_class_id) : null,
      classTitle: row.class_title || null,
      sessionId: row.class_session_id ? String(row.class_session_id) : null,
      sessionTitle: row.session_title || null,
      sessionStart: row.session_start || null,
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
      rubric: parseJsonArray(row.rubric_criteria),
      rubricScores: parseJsonArray(row.rubric_scores),
      gradedAt: row.graded_at || null,
    })) });
  } catch (error) {
    console.error("Error fetching assignment submissions:", error);
    return internalError(res, "Lỗi khi lấy danh sách bài nộp");
  }
});

// POST /api/assignments — teacher/admin creates a scoped assignment.
router.post("/", protectRoute, requireTeacher, requirePermission("lms.assignment.manage"), async (req, res) => {
  const client = await getClient();
  let inTransaction = false;
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
    let rubric;
    try {
      rubric = normalizeRubric(req.body.rubric, parsedMaxScore);
    } catch (error) {
      if (error.message === "RUBRIC_TOTAL_MISMATCH") return validationError(res, "Tổng điểm rubric phải bằng thang điểm tối đa");
      return validationError(res, "Rubric cần có tiêu chí và điểm hợp lệ");
    }
    await client.query("BEGIN"); inTransaction = true;
    if (liveClassId) await assertGradebookOpen(client, liveClassId);
    if (courseId) {
      const courseResult = await client.query("SELECT author_id FROM courses WHERE id = $1", [courseId]);
      if (courseResult.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");
      if (!liveClassId && req.user.role !== "admin" && String(courseResult.rows[0].author_id) !== String(req.user.id))
        return forbidden(res, "Bạn không có quyền tạo bài tập cho khóa học này");
    }
    if (liveClassId) {
      const classResult = await client.query("SELECT course_id, instructor_id FROM live_classes WHERE id = $1", [liveClassId]);
      if (classResult.rows.length === 0) return notFound(res, "Không tìm thấy lớp học trực tuyến");
      if (req.user.role !== "admin" && !(await isAssignedTeacher(liveClassId, req.user.id, client)))
        return forbidden(res, "Bạn không có quyền tạo bài tập cho lớp học này");
      if (courseId && classResult.rows[0].course_id !== null && String(classResult.rows[0].course_id) !== String(courseId)) return validationError(res, "Khóa học và lớp trực tuyến không cùng một phạm vi");
    }
    if (classSessionId) {
      const sessionResult = await client.query(
        "SELECT id FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'",
        [classSessionId, liveClassId],
      );
      if (sessionResult.rows.length === 0) return validationError(res, "Buổi học không thuộc lớp đã chọn hoặc đã bị hủy");
    }
    const result = await client.query(
      `INSERT INTO assignments (title, assignment_type, course_id, live_class_id, class_session_id, instructor_id, description, max_score, due_date, attachment_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, title, assignment_type, course_id, live_class_id, class_session_id, instructor_id, description, max_score, due_date, attachment_url, created_at, updated_at`,
      [title.trim(), assignmentType, courseId, liveClassId, classSessionId, req.user.id, description?.trim() || "", parsedMaxScore, dueDate || null, attachmentUrl || null],
    );
    if (rubric.length) {
      await client.query(
        `INSERT INTO assignment_rubrics (assignment_id, criteria_json, created_by)
         VALUES ($1, $2::jsonb, $3)`,
        [result.rows[0].id, JSON.stringify(rubric), req.user.id],
      );
      result.rows[0].rubric = rubric;
    }
    await recordAuditEvent({
      db: client,
      actorId: req.user.id,
      action: "assignment.created",
      entityType: "assignment",
      entityId: result.rows[0].id,
      afterState: result.rows[0],
      metadata: { ip: req.ip, classSessionId, rubricCriteria: rubric.length },
    });
    await client.query("COMMIT"); inTransaction = false;
    await notifyAssignmentPublished({ assignmentId: result.rows[0].id, actorId: req.user.id });
    return res.status(201).json({ success: true, data: result.rows[0], message: "Tạo bài tập mới thành công" });
  } catch (error) {
    if (inTransaction) { await client.query("ROLLBACK").catch(() => {}); inTransaction = false; }
    if (error.status) return res.status(error.status).json({success:false,message:error.message});
    console.error("Error creating assignment:", error);
    return internalError(res, "Lỗi khi tạo bài tập");
  } finally { if (inTransaction) await client.query("ROLLBACK").catch(() => {}); client.release(); }
});

// PATCH /api/assignments/:id — whitelist editable fields and audit deadline changes.
router.patch("/:id", protectRoute, requireTeacher, requirePermission("lms.assignment.manage"), async (req, res) => {
  const client = await getClient();
  let inTransaction = false;
  try {
    const assignmentId = parsePositiveId(req.params.id);
    if (!assignmentId) return validationError(res, "assignmentId không hợp lệ");
    await client.query("BEGIN");
    inTransaction = true;
    // The class lock serializes edits with gradebook finalization.
    const scope = (await client.query("SELECT live_class_id FROM assignments WHERE id=$1", [assignmentId])).rows[0];
    if (scope?.live_class_id) await assertGradebookOpen(client, scope.live_class_id);
    const assignment = await getAssignment(assignmentId, client);
    if (!assignment) return notFound(res, "Không tìm thấy bài tập");
    if (!(await ownsAssignment(assignment, req.user, client))) return forbidden(res, "Bạn không có quyền sửa bài tập này");

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
    if (nextMaxScore !== Number(assignment.max_score)) {
      const submitted = await client.query("SELECT 1 FROM assignment_submissions WHERE assignment_id=$1 LIMIT 1", [assignmentId]);
      if (submitted.rows.length) return conflict(res, "Bài tập đã có bài nộp; không thể đổi thang điểm và làm sai lệch điểm cũ.");
    }

    const result = await client.query(
      `UPDATE assignments
       SET title = $1, description = $2, max_score = $3, due_date = $4, attachment_url = $5
       WHERE id = $6
       RETURNING id, title, assignment_type, course_id, live_class_id, class_session_id, instructor_id, description, max_score, due_date, attachment_url, created_at, updated_at`,
      [nextTitle.trim(), nextDescription, nextMaxScore, nextDueDate || null, nextAttachmentUrl || null, assignmentId],
    );
    const updated = result.rows[0];
    await recordAuditEvent({
      db: client,
      actorId: req.user.id,
      action: String(assignment.due_date || "") !== String(updated.due_date || "") ? "assignment.deadline_updated" : "assignment.updated",
      entityType: "assignment",
      entityId: assignmentId,
      beforeState: assignment,
      afterState: updated,
      metadata: { ip: req.ip },
    });
    await client.query("COMMIT");
    inTransaction = false;
    if (String(assignment.due_date || "") !== String(updated.due_date || "")) {
      await notifyAssignmentDeadlineChanged({ assignmentId, actorId: req.user.id });
    }
    return res.json({ success: true, data: updated, message: "Cập nhật bài tập thành công" });
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Error updating assignment:", error);
    return internalError(res, "Lỗi khi cập nhật bài tập");
  } finally {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});

// POST /api/assignments/:id/submit — one immutable student submission per assignment.
router.post("/:id/submit", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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
    await assertGradebookOpen(client, assignment.live_class_id);
    const existing = await client.query("SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND user_id = $2 FOR UPDATE", [assignmentId, req.user.id]);
    if (existing.rows.length > 0 && !canResubmit(existing.rows[0])) {
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
    const accommodation = await getAssessmentAccommodation({ assessmentType: "assignment", assessmentId: assignmentId, userId: req.user.id, db: client });
    const dueDate = existing.rows[0]?.return_requested ? existing.rows[0].resubmit_until : effectiveAssignmentDueDate(assignment, accommodation);
    const isLate = dueDate && Date.now() > new Date(dueDate).getTime();
    let result;
    if (existing.rows[0]) {
      const old = existing.rows[0];
      await client.query("INSERT INTO submission_revisions(submission_id, revision, snapshot) VALUES ($1, $2, $3::jsonb)", [old.id, old.revision, JSON.stringify(old)]);
      result = await client.query(
        `UPDATE assignment_submissions SET content_text = $2, file_asset_id = $3, audio_asset_id = $4,
          status = $5, submitted_at = NOW(), revision = revision + 1, return_requested = FALSE,
          return_reason = NULL, returned_by = NULL, returned_at = NULL, resubmit_until = NULL
         WHERE id = $1 RETURNING *`, [old.id, contentText?.trim() || "", fileAssetId, audioAssetId, isLate ? "late" : "submitted"],
      );
      await client.query("DELETE FROM grading_drafts WHERE submission_id = $1", [old.id]);
      await recordAuditEvent({ db: client, actorId: req.user.id, action: "submission.resubmitted", entityType: "assignment_submission", entityId: old.id, beforeState: { revision: old.revision }, afterState: { revision: old.revision + 1 } });
      await notifyWorkflow(client, { userId: assignment.instructor_id, title: "Học viên đã nộp lại bài", message: assignment.title,
        link: `/lms/teacher/grading?assignmentId=${assignmentId}`, key: `resubmission:${old.id}:${old.revision + 1}`, actorId: req.user.id });
    } else result = await client.query(
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
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    if (error.code === "23505") return conflict(res, "Bài đã được nộp, không thể nộp đè", "SUBMISSION_LOCKED");
    return internalError(res, "Lỗi khi nộp bài tập");
  } finally {
    client.release();
  }
});

// POST /api/assignments/submissions/:submissionId/grade — transactional grade + history + notification.
router.get("/submissions/:submissionId/history", protectRoute, async (req, res) => {
  try {
    const submissionId = parsePositiveId(req.params.submissionId);
    if (!submissionId) return validationError(res, "Mã bài nộp không hợp lệ");
    const current = (await query("SELECT * FROM assignment_submissions WHERE id = $1", [submissionId])).rows[0];
    if (!current) return notFound(res, "Không tìm thấy bài nộp");
    const assignment = await getAssignment(current.assignment_id);
    const isStudent = req.user.role === "user";
    const allowed = isStudent
      ? hasActiveStudentLmsAccess(req.user) && String(current.user_id) === String(req.user.id) && await ensureAssignmentVisibleToStudent(assignment, req.user.id)
      : await canGradeAssignment(assignment, req.user);
    if (!allowed) return forbidden(res, "Bạn không có quyền xem lịch sử bài nộp");
    const revisions = await query("SELECT revision, snapshot, archived_at FROM submission_revisions WHERE submission_id = $1 ORDER BY revision DESC", [submissionId]);
    const grades = await query(`SELECT g.*, u.username AS grader_name FROM submission_grades g LEFT JOIN users u ON u.id = g.grader_id
      WHERE g.submission_id = $1 ORDER BY g.graded_at DESC, g.id DESC`, [submissionId]);
    const draft = isStudent ? null : (await query("SELECT payload, updated_at FROM grading_drafts WHERE submission_id = $1 AND grader_id = $2 AND submission_revision = $3", [submissionId, req.user.id, current.revision])).rows[0] || null;
    res.json({ success: true, data: { current, revisions: revisions.rows, grades: grades.rows, draft } });
  } catch (error) { console.error("Submission history:", error); return internalError(res, "Không thể tải lịch sử bài nộp"); }
});

router.post("/submissions/:submissionId/return", protectRoute, requireTeacher, requirePermission("lms.assignment.grade"), async (req, res) => {
  const client = await getClient();
  try {
    const reason = requiredReason(req.body.reason);
    const deadline = new Date(req.body.resubmitUntil);
    if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) return validationError(res, "Hạn nộp lại phải ở tương lai");
    const submissionId = parsePositiveId(req.params.submissionId);
    if (!submissionId) return validationError(res, "Mã bài nộp không hợp lệ");
    const initial = (await client.query("SELECT assignment_id FROM assignment_submissions WHERE id = $1", [submissionId])).rows[0];
    if (!initial) return notFound(res, "Không tìm thấy bài nộp");
    const assignment = await getAssignment(initial.assignment_id, client);
    if (!(await canGradeAssignment(assignment, req.user, client))) return forbidden(res, "Bạn không có quyền trả bài");
    await client.query("BEGIN");
    await assertGradebookOpen(client, assignment.live_class_id);
    const current = (await client.query("SELECT * FROM assignment_submissions WHERE id = $1 FOR UPDATE", [submissionId])).rows[0];
    if (Number(req.body.revision) !== current.revision) { await client.query("ROLLBACK"); return conflict(res, "Bài nộp đã thay đổi. Hãy tải lại."); }
    if (current.return_requested) { await client.query("ROLLBACK"); return conflict(res, "Bài đang chờ học viên nộp lại."); }
    await client.query(`UPDATE assignment_submissions SET return_requested = TRUE, return_reason = $2, returned_by = $3,
      returned_at = NOW(), resubmit_until = $4 WHERE id = $1`, [submissionId, reason, req.user.id, deadline.toISOString()]);
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "submission.returned", entityType: "assignment_submission", entityId: submissionId, afterState: { reason, deadline, revision: current.revision } });
    await notifyWorkflow(client, { userId: current.user_id, title: "Giáo viên yêu cầu sửa và nộp lại bài", message: reason,
      link: `/lms/assignment/${assignment.id}/submit`, key: `submission-return:${submissionId}:${current.revision}`, actorId: req.user.id });
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể trả bài" });
  } finally { client.release(); }
});

router.put("/submissions/:submissionId/draft", protectRoute, requireTeacher, requirePermission("lms.assignment.grade"), async (req, res) => {
  const client = await getClient();
  try {
    const submissionId = parsePositiveId(req.params.submissionId);
    if (!submissionId) return validationError(res, "Mã bài nộp không hợp lệ");
    const initial = (await client.query("SELECT assignment_id FROM assignment_submissions WHERE id = $1", [submissionId])).rows[0];
    if (!initial) return notFound(res, "Không tìm thấy bài nộp");
    const assignment = await getAssignment(initial.assignment_id, client);
    if (!(await canGradeAssignment(assignment, req.user, client))) return forbidden(res, "Bạn không có quyền chấm bài này");
    const annotations = normalizeAnnotations(req.body.annotations);
    const rubric = parseJsonArray(assignment.rubric_criteria);
    const rubricScores = rubric.length ? normalizeRubricScores(req.body.rubricScores, rubric) : [];
    const score = rubric.length ? rubricScores.reduce((sum, item) => sum + item.score, 0) : Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > Number(assignment.max_score) || typeof req.body.feedbackText !== "string" || req.body.feedbackText.length > 10000) return validationError(res, "Điểm hoặc nhận xét không hợp lệ");
    await client.query("BEGIN");
    await assertGradebookOpen(client, assignment.live_class_id);
    const current = (await client.query("SELECT * FROM assignment_submissions WHERE id = $1 FOR UPDATE", [submissionId])).rows[0];
    if (Number(req.body.revision) !== current.revision || current.return_requested) { await client.query("ROLLBACK"); return conflict(res, "Bài đã thay đổi hoặc đang chờ nộp lại. Hãy tải lại."); }
    const payload = { score, feedbackText: req.body.feedbackText, rubricScores, annotations, revision: current.revision };
    await client.query(`INSERT INTO grading_drafts(submission_id, grader_id, submission_revision, payload) VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (submission_id, grader_id) DO UPDATE SET submission_revision = EXCLUDED.submission_revision, payload = EXCLUDED.payload, updated_at = NOW()`,
    [submissionId, req.user.id, current.revision, JSON.stringify(payload)]);
    await client.query("COMMIT");
    res.json({ success: true, data: payload });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(error.status || 422).json({ success: false, message: error.status || !error.code ? error.message : "Không thể lưu nháp" });
  } finally { client.release(); }
});

router.post("/submissions/:submissionId/grade", protectRoute, requireTeacher, requirePermission("lms.assignment.grade"), async (req, res) => {
  const client = await getClient();
  try {
    const submissionId = parsePositiveId(req.params.submissionId);
    let numericScore = Number(req.body.score);
    if (!submissionId) return validationError(res, "submissionId không hợp lệ");
    if (req.body.feedbackText !== undefined && (typeof req.body.feedbackText !== "string" || req.body.feedbackText.length > 10000)) return validationError(res, "Nội dung phản hồi không hợp lệ");
    let annotations;
    try { annotations = normalizeAnnotations(req.body.annotations); } catch (error) { return validationError(res, error.message); }
    await client.query("BEGIN");
    const scope = await client.query("SELECT a.live_class_id FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = $1", [submissionId]);
    await assertGradebookOpen(client, scope.rows[0]?.live_class_id);
    const submissionResult = await client.query(
      `SELECT s.id, s.user_id, s.assignment_id, s.revision, s.return_requested, a.title AS assignment_title, a.instructor_id, a.live_class_id, a.max_score,
              rubric.criteria_json AS rubric_criteria,
              u.email AS student_email, u.username AS student_username
       FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN assignment_rubrics rubric ON rubric.assignment_id = a.id
       WHERE s.id = $1 FOR UPDATE OF s`,
      [submissionId],
    );
    const submission = submissionResult.rows[0];
    if (!submission) { await client.query("ROLLBACK"); return notFound(res, "Không tìm thấy bài nộp"); }
    if (!(await canGradeAssignment(submission, req.user, client))) { await client.query("ROLLBACK"); return forbidden(res, "Bạn không có quyền chấm bài nộp này"); }
    if (Number(req.body.revision) !== submission.revision || submission.return_requested) { await client.query("ROLLBACK"); return conflict(res, "Bài đã thay đổi hoặc đang chờ nộp lại. Hãy tải lại trước khi chấm."); }
    const previousGrade = (await client.query("SELECT * FROM submission_grades WHERE submission_id = $1 AND submission_revision = $2 ORDER BY id DESC LIMIT 1", [submissionId, submission.revision])).rows[0];
    let changeReason = null;
    if (previousGrade) changeReason = requiredReason(req.body.changeReason);
    const rubric = parseJsonArray(submission.rubric_criteria);
    let rubricScores = [];
    try {
      if (rubric.length) {
        rubricScores = normalizeRubricScores(req.body.rubricScores, rubric);
        numericScore = rubricScores.reduce((total, item) => total + item.score, 0);
      }
    } catch {
      await client.query("ROLLBACK");
      return validationError(res, "Điểm từng tiêu chí rubric chưa hợp lệ");
    }
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > Number(submission.max_score)) { await client.query("ROLLBACK"); return validationError(res, `Điểm phải nằm trong khoảng 0 đến ${submission.max_score}`); }
    const grade = await client.query(
      `INSERT INTO submission_grades (submission_id, grader_id, score, feedback_text, rubric_scores, submission_revision, annotations, change_reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8) RETURNING *`,
      [submissionId, req.user.id, numericScore, req.body.feedbackText?.trim() || "", JSON.stringify(rubricScores), submission.revision, JSON.stringify(annotations), changeReason],
    );
    await client.query("DELETE FROM grading_drafts WHERE submission_id = $1 AND grader_id = $2", [submissionId, req.user.id]);
    await client.query("UPDATE assignment_submissions SET status = 'graded' WHERE id = $1", [submissionId]);
    await recordAuditEvent({
      db: client,
      actorId: req.user.id,
      action: "submission.graded",
      entityType: "assignment_submission",
      entityId: submissionId,
      beforeState: previousGrade || null,
      afterState: { score: numericScore, feedbackText: req.body.feedbackText?.trim() || "", rubricScores, status: "graded" },
      metadata: { assignmentId: submission.assignment_id, ip: req.ip, rubricCriteria: rubric.length, revision: submission.revision, changeReason },
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

    if (submission.student_email) {
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      sendNotificationEmail({
        email: submission.student_email,
        username: submission.student_username,
        title: `Bài tập đã được chấm: ${submission.assignment_title}`,
        message: `Bài tập “${submission.assignment_title}” của bạn đã có điểm: ${numericScore}/${submission.max_score}.${req.body.feedbackText ? ` Nhận xét: "${req.body.feedbackText}"` : ""}`,
        actionUrl: `${frontendUrl}/lms/assignment/${submission.assignment_id}/submit`,
        actionText: "Xem Điểm & Nhận Xét",
      }).catch((err) => console.error("[GRADE EMAIL WARNING]", err.message));
    }
    return res.json({ success: true, data: { ...grade.rows[0], gamification }, message: "Chấm điểm bài nộp thành công" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error grading submission:", error);
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return internalError(res, "Lỗi khi chấm điểm bài nộp");
  } finally {
    client.release();
  }
});

const getQuiz = async (quizId, db = { query }) => {
  const result = await db.query(
    `SELECT q.id, q.title, q.description, q.status AS quiz_status, q.activity_scope, q.due_date, q.duration_minutes, q.passing_score, q.instructor_id, q.paper_file_id, q.live_class_id, q.class_session_id, q.course_id AS quiz_course_id, q.lesson_id,
            q.attempt_limit, q.available_from, q.available_until, q.review_policy, q.shuffle_questions,
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
  if (user.role === "creator") return quiz.live_class_id
    ? await isAssignedTeacher(quiz.live_class_id, user.id, db)
    : String(quiz.course_author_id) === String(user.id) || String(quiz.instructor_id) === String(user.id);
  if (user.role !== "user" || quiz.quiz_status !== "PUBLISHED" || !quiz.resolved_course_id || !quiz.course_is_published || quiz.lesson_is_published === false) return false;
  const enrollment = await db.query(
    `SELECT 1 FROM lms_access_grants
     WHERE user_id = $1 AND course_id = $2 AND access_status = 'active'
       AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())`,
    [user.id, quiz.resolved_course_id],
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

const attemptQuestions = (attempt, fallbackQuestions) => {
  const snapshot = parseJsonArray(attempt?.question_snapshot);
  return snapshot.length ? snapshot : fallbackQuestions;
};

const makeQuestionSnapshot = (questions, shuffleQuestions) => {
  const snapshot = questions.map((question) => ({ ...question, options_json: parseOptions(question.options_json) }));
  if (!shuffleQuestions) return snapshot;
  // The order is persisted with the attempt, so a refresh never changes a
  // learner's paper while still giving each learner an independently mixed set.
  for (let index = snapshot.length - 1; index > 0; index -= 1) {
    const next = crypto.randomInt(index + 1);
    [snapshot[index], snapshot[next]] = [snapshot[next], snapshot[index]];
  }
  return snapshot;
};

const serializeAttempt = (attempt) => attempt ? {
  id: attempt.id,
  number: Number(attempt.attempt_number || 1),
  status: attempt.status,
  answers: attempt.answers_json || {},
  startedAt: attempt.started_at,
  expiresAt: attempt.expires_at || null,
  submittedAt: attempt.submitted_at || null,
  autoSubmitted: Boolean(attempt.auto_submitted),
} : null;

// A new accommodation may be granted while a learner has an open attempt. It
// may extend a deadline, never shorten one that has already been issued.
const resolveAttemptExpiry = ({ attempt, quiz, now = new Date() }) => {
  const configured = getAttemptExpiry({
    startedAt: attempt.started_at,
    durationMinutes: quiz.duration_minutes,
    closesAt: getQuizAvailability(quiz, now).closesAt,
  });
  const stored = attempt.expires_at ? new Date(attempt.expires_at) : null;
  const expiresAt = stored && (!configured || stored >= configured) ? stored : configured;
  return {
    expiresAt,
    shouldPersist: Boolean(expiresAt && (!stored || expiresAt.getTime() !== stored.getTime())),
  };
};

const submitAttempt = async ({ client, attempt, questions, autoSubmitted = false }) => {
  const computed = buildQuizResult(questions, attempt.answers_json || {});
  const result = await client.query(
    `UPDATE quiz_attempts SET score = $1, max_score = $2, status = 'submitted',
            submitted_at = NOW(), auto_submitted = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING id, quiz_id, user_id, answers_json, status, started_at, expires_at, submitted_at,
               attempt_number, auto_submitted, question_snapshot`,
    [computed.score, computed.maxScore, autoSubmitted, attempt.id],
  );
  return { attempt: result.rows[0], computed };
};

const getStudentAttempt = async ({ client, quiz, userId, questions }) => {
  if (quiz.live_class_id) await client.query("SELECT id FROM live_classes WHERE id=$1 FOR UPDATE", [quiz.live_class_id]);
  // Locking the quiz serializes first-open requests, preventing two tabs from
  // consuming two attempts or creating parallel active attempts.
  await client.query("SELECT id FROM quizzes WHERE id = $1 FOR UPDATE", [quiz.id]);
  const activeResult = await client.query(
    `SELECT id, quiz_id, user_id, answers_json, status, started_at, expires_at, submitted_at,
            attempt_number, auto_submitted, question_snapshot
     FROM quiz_attempts
     WHERE quiz_id = $1 AND user_id = $2 AND status = 'in_progress'
     ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE`,
    [quiz.id, userId],
  );
  const now = new Date();
  let attempt = activeResult.rows[0] || null;
  if (attempt) {
    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz, now });
    if (shouldPersist) {
      const expiryUpdate = await client.query("UPDATE quiz_attempts SET expires_at = $1, updated_at = NOW() WHERE id = $2 RETURNING expires_at", [expiresAt.toISOString(), attempt.id]);
      attempt.expires_at = expiryUpdate.rows[0].expires_at;
    }
    if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
      return { ...(await submitAttempt({ client, attempt, questions: attemptQuestions(attempt, questions), autoSubmitted: true })), created: false, timedOut: true };
    }
    return { attempt, computed: null, created: false, timedOut: false };
  }

  const submitted = await client.query(
    `SELECT id, quiz_id, user_id, answers_json, status, started_at, expires_at, submitted_at,
            attempt_number, auto_submitted, question_snapshot
     FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2
     ORDER BY attempt_number DESC`,
    [quiz.id, userId],
  );
  const finalized = quiz.live_class_id && (await client.query("SELECT 1 FROM gradebook_finalizations WHERE class_id=$1 AND reopened_at IS NULL", [quiz.live_class_id])).rows.length > 0;
  if (finalized && !submitted.rows.length) throw Object.assign(new Error("Sổ điểm đã chốt; không thể bắt đầu lượt mới."), {status:409});
  if (finalized || submitted.rows.length >= Number(quiz.attempt_limit || 1)) {
    const latest = submitted.rows[0] || null;
    return { attempt: latest, computed: latest ? buildQuizResult(attemptQuestions(latest, questions), latest.answers_json || {}) : null, created: false, timedOut: false };
  }

  const availability = getQuizAvailability(quiz, now);
  if (!availability.isOpen) {
    const error = new Error(availability.reason === "not_open" ? "QUIZ_NOT_OPEN" : "QUIZ_CLOSED");
    error.availability = availability;
    throw error;
  }
  const attemptNumber = submitted.rows.length + 1;
  const expiresAt = getAttemptExpiry({ startedAt: now, durationMinutes: quiz.duration_minutes, closesAt: availability.closesAt });
  const snapshot = makeQuestionSnapshot(questions, quiz.shuffle_questions);
  const created = await client.query(
    `INSERT INTO quiz_attempts (quiz_id, user_id, attempt_number, expires_at, question_snapshot)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, quiz_id, user_id, answers_json, status, started_at, expires_at, submitted_at,
               attempt_number, auto_submitted, question_snapshot`,
    [quiz.id, userId, attemptNumber, expiresAt?.toISOString() || null, JSON.stringify(snapshot)],
  );
  return { attempt: created.rows[0], computed: null, created: true, timedOut: false };
};

const quizResponse = ({ quiz, questions, attempt, computed, now = new Date() }) => {
  const isSubmitted = attempt?.status === "submitted";
  const reviewAvailable = isSubmitted && reviewIsAvailable(quiz, now);
  const result = isSubmitted && computed
    ? { score: computed.score, maxScore: computed.maxScore, percentage: computed.percentage, passed: computed.percentage >= Number(quiz.passing_score), review: reviewAvailable ? computed.review : [], reviewAvailable }
    : null;
  return {
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
    activityScope: quiz.activity_scope || "session",
    dueDate: quiz.due_date || null,
    availableFrom: quiz.available_from || null,
    availableUntil: quiz.available_until || null,
    reviewPolicy: quiz.review_policy || "after_submit",
    paperUrl: quiz.paper_file_id && quiz.paper_status === "ready" ? `/api/files/${quiz.paper_file_id}/download` : null,
    durationMinutes: quiz.duration_minutes,
    timeLimitSeconds: Number(quiz.duration_minutes) * 60,
    passingScore: Number(quiz.passing_score),
    attemptLimit: Number(quiz.attempt_limit || 1),
    attemptsUsed: attempt ? Number(attempt.attempt_number || 1) : 0,
    attemptsRemaining: Math.max(0, Number(quiz.attempt_limit || 1) - (attempt ? Number(attempt.attempt_number || 1) : 0)),
    accommodation: quiz.accommodation || null,
    questions: questions.map(publicQuestion),
    attempt: serializeAttempt(attempt),
    result,
  };
};

const quizWindowError = (res, error) => {
  const notOpen = error.message === "QUIZ_NOT_OPEN";
  const at = notOpen ? error.availability?.opensAt : error.availability?.closesAt;
  return conflict(res, notOpen
    ? `Quiz chưa mở${at ? `, bắt đầu lúc ${new Date(at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}.`
    : "Quiz đã đóng. Hệ thống không thể mở thêm lượt làm bài.", notOpen ? "QUIZ_NOT_OPEN" : "QUIZ_CLOSED");
};

// GET /api/assignments/quizzes/:quizId — creates one server-timed attempt only
// after the learner is eligible and the configured window is open.
router.get("/quizzes/:quizId", protectRoute, async (req, res) => {
  if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
    return forbidden(res, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực");
  }
  const client = req.user.role === "user" ? await getClient() : null;
  try {
    const quizId = parsePositiveId(req.params.quizId);
    if (!quizId) return validationError(res, "quizId không hợp lệ");
    const quiz = await getQuiz(quizId);
    if (!quiz) return notFound(res, "Không tìm thấy đề thi");
    if (!(await ensureQuizAccess(quiz, req.user))) return forbidden(res, "Bạn chưa được cấp quyền làm đề thi này");
    const questions = await getQuizQuestions(quizId);
    if (questions.length === 0) return notFound(res, "Đề thi chưa có câu hỏi");
    if (req.user.role !== "user") return res.json({ success: true, data: quizResponse({ quiz, questions, attempt: null, computed: null }) });
    const accommodation = await getAssessmentAccommodation({ assessmentType: "quiz", assessmentId: quizId, userId: req.user.id, db: client });
    const effectiveQuiz = effectiveQuizForStudent(quiz, accommodation);
    await client.query("BEGIN");
    const state = await getStudentAttempt({ client, quiz: effectiveQuiz, userId: req.user.id, questions });
    await client.query("COMMIT");
    const responseQuestions = attemptQuestions(state.attempt, questions);
    return res.json({ success: true, data: quizResponse({ quiz: effectiveQuiz, questions: responseQuestions, attempt: state.attempt, computed: state.computed }) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.message === "QUIZ_NOT_OPEN" || error.message === "QUIZ_CLOSED") return quizWindowError(res, error);
    console.error("Error fetching quiz:", error);
    if (error.status) return res.status(error.status).json({success:false,message:error.message});
    return internalError(res, "Lỗi khi lấy đề trắc nghiệm");
  } finally {
    client?.release();
  }
});

// PUT /api/assignments/quizzes/:quizId/answers — server-side draft save.
// Browser storage remains merely a resilience cache, never the authoritative answer sheet.
router.put("/quizzes/:quizId/answers", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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
    const accommodation = await getAssessmentAccommodation({ assessmentType: "quiz", assessmentId: quizId, userId: req.user.id, db: client });
    const effectiveQuiz = effectiveQuizForStudent(quiz, accommodation);
    await client.query("BEGIN");
    await client.query("SELECT id FROM quizzes WHERE id = $1 FOR UPDATE", [quiz.id]);
    const active = await client.query(
      `SELECT id, quiz_id, user_id, answers_json, status, started_at, expires_at, submitted_at, attempt_number, auto_submitted, question_snapshot
       FROM quiz_attempts WHERE quiz_id = $1 AND user_id = $2 AND status = 'in_progress'
       ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE`,
      [quiz.id, req.user.id],
    );
    const attempt = active.rows[0];
    if (!attempt) { await client.query("ROLLBACK"); return conflict(res, "Không có lượt làm bài đang mở để lưu nháp", "QUIZ_NO_ACTIVE_ATTEMPT"); }
    const { expiresAt: expiry, shouldPersist } = resolveAttemptExpiry({ attempt, quiz: effectiveQuiz });
    if (shouldPersist) {
      const expiryUpdate = await client.query("UPDATE quiz_attempts SET expires_at = $1, updated_at = NOW() WHERE id = $2 RETURNING expires_at", [expiry.toISOString(), attempt.id]);
      attempt.expires_at = expiryUpdate.rows[0].expires_at;
    }
    if (expiry && new Date(expiry).getTime() <= Date.now()) {
      await submitAttempt({ client, attempt, questions: attemptQuestions(attempt, questions), autoSubmitted: true });
      await client.query("COMMIT");
      return conflict(res, "Đã hết thời gian. Hệ thống đã nộp phần đáp án đã lưu.", "QUIZ_ATTEMPT_EXPIRED");
    }
    const saved = await client.query(
      `UPDATE quiz_attempts SET answers_json = $1::jsonb, expires_at = COALESCE(expires_at, $2), updated_at = NOW()
       WHERE id = $3 RETURNING id, expires_at, updated_at`,
      [JSON.stringify(req.body.answers), expiry?.toISOString() || null, attempt.id],
    );
    await client.query("COMMIT");
    return res.json({ success: true, data: { attemptId: saved.rows[0].id, expiresAt: saved.rows[0].expires_at, savedAt: saved.rows[0].updated_at } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error saving quiz answers:", error);
    return internalError(res, "Không thể lưu nháp bài làm");
  } finally {
    client.release();
  }
});

// POST /api/assignments/quizzes/:quizId/submit — one server-graded, timed and idempotent attempt.
router.post("/quizzes/:quizId/submit", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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
    const accommodation = await getAssessmentAccommodation({ assessmentType: "quiz", assessmentId: quizId, userId: req.user.id, db: client });
    const effectiveQuiz = effectiveQuizForStudent(quiz, accommodation);
    await client.query("BEGIN");
    const state = await getStudentAttempt({ client, quiz: effectiveQuiz, userId: req.user.id, questions });
    let attempt = state.attempt;
    let computed = state.computed;
    const alreadySubmitted = attempt.status === "submitted";
    if (!alreadySubmitted) {
      const { expiresAt: expiry, shouldPersist } = resolveAttemptExpiry({ attempt, quiz: effectiveQuiz });
      if (shouldPersist) {
        const expiryUpdate = await client.query("UPDATE quiz_attempts SET expires_at = $1, updated_at = NOW() WHERE id = $2 RETURNING expires_at", [expiry.toISOString(), attempt.id]);
        attempt.expires_at = expiryUpdate.rows[0].expires_at;
      }
      if (expiry && new Date(expiry).getTime() <= Date.now()) {
        ({ attempt, computed } = await submitAttempt({ client, attempt, questions: attemptQuestions(attempt, questions), autoSubmitted: true }));
      } else {
        const save = await client.query("UPDATE quiz_attempts SET answers_json = $1::jsonb, expires_at = COALESCE(expires_at, $2) WHERE id = $3 RETURNING *", [JSON.stringify(req.body.answers), expiry?.toISOString() || null, attempt.id]);
        attempt = save.rows[0];
        ({ attempt, computed } = await submitAttempt({ client, attempt, questions: attemptQuestions(attempt, questions) }));
      }
    }
    const passed = computed.percentage >= Number(quiz.passing_score);
    const gamification = alreadySubmitted || state.timedOut ? null : await awardXp({
      db: client,
      userId: req.user.id,
      eventKey: `quiz:${quizId}:attempt:${attempt.attempt_number}:submitted`,
      eventType: "quiz_submitted",
      xp: passed ? XP_VALUES.quizPassed : XP_VALUES.quizSubmitted,
      metadata: { quizId, attemptId: attempt.id, attemptNumber: attempt.attempt_number, passed, percentage: computed.percentage },
    });
    await client.query("COMMIT");
    const reviewAvailable = reviewIsAvailable(quiz);
    return res.json({ success: true, data: { score: computed.score, maxScore: computed.maxScore, percentage: computed.percentage, passed, review: reviewAvailable ? computed.review : [], reviewAvailable, attemptId: attempt.id, attemptNumber: attempt.attempt_number, alreadySubmitted, autoSubmitted: Boolean(attempt.auto_submitted), gamification, message: attempt.auto_submitted ? "Đã hết thời gian. Hệ thống đã nộp phần đáp án đã lưu." : (passed ? "Chúc mừng, bạn đã đạt yêu cầu!" : "Bạn chưa đạt điểm yêu cầu.") } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.message === "QUIZ_NOT_OPEN" || error.message === "QUIZ_CLOSED") return quizWindowError(res, error);
    console.error("Error submitting quiz:", error);
    if (error.status) return res.status(error.status).json({success:false,message:error.message});
    return internalError(res, "Lỗi khi nộp bài trắc nghiệm");
  } finally {
    client.release();
  }
});

export default router;
