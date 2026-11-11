import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireActiveStudentLmsAccess, { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import { awardXp, XP_VALUES } from "../services/gamification.service.js";
import {
  getAttemptExpiry,
  getQuizAvailability,
  reviewIsAvailable,
} from "../services/assessmentPolicy.service.js";
import {
  buildQuizResult,
  makeQuestionSnapshot,
  normalizeQuizAnswers,
  parseQuizDescriptionMetadata,
  publicQuizItems,
} from "../services/quizAttempt.service.js";
import { getVideoCourseUnitAccessContext } from "../services/videoCourseUnitAccess.service.js";

const router = express.Router();

const validationError = (res, message) => res.status(400).json({ success: false, message, errorCode: "VALIDATION_ERROR" });
const notFound = (res, message) => res.status(404).json({ success: false, message, errorCode: "NOT_FOUND" });
const forbidden = (res, message) => res.status(403).json({ success: false, message, errorCode: "FORBIDDEN" });
const conflict = (res, message, errorCode = "CONFLICT", extra = {}) => res.status(409).json({ success: false, message, errorCode, ...extra });
const internalError = (res, message) => res.status(500).json({ success: false, message, errorCode: "INTERNAL_ERROR" });

const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveVideoCourseProfile = async (db, rawInput, backUrl = null) => {
  let profileIdentifier = rawInput;
  if (!profileIdentifier && backUrl && typeof backUrl === "string") {
    const match = backUrl.match(/\/video-courses\/([^/?#]+)/);
    if (match) {
      profileIdentifier = decodeURIComponent(match[1]);
    }
  }
  if (!profileIdentifier) return null;
  const numericId = parsePositiveId(profileIdentifier);
  const rows = (await db.query(
    `SELECT * FROM video_course_profiles
     WHERE ($1::bigint IS NOT NULL AND id = $1)
        OR LOWER(management_class_id) = LOWER($2)
     LIMIT 1`,
    [numericId, String(profileIdentifier).trim()],
  )).rows;
  return rows[0] || null;
};

const isQuizPublicPreview = async (db, quizId) => Boolean((await db.query(
  `SELECT 1
   FROM quizzes q
   LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
   LEFT JOIN lessons l ON l.id = q.lesson_id
   WHERE q.id = $1
     AND UPPER(COALESCE(q.status, 'PUBLISHED')) = 'PUBLISHED'
     AND (COALESCE(cs.is_public_preview, FALSE) = TRUE
       OR COALESCE(l.is_public_preview, FALSE) = TRUE)
   LIMIT 1`,
  [quizId],
)).rows[0]);

const requireQuizPlayerAccess = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Bạn cần đăng nhập để tiếp tục",
      errorCode: "UNAUTHENTICATED",
    });
  }
  if (!["user", "creator", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền thực hiện thao tác này",
      errorCode: "FORBIDDEN",
    });
  }
  if (req.user.role === "admin" || req.user.role === "creator") return next();
  if (hasActiveStudentLmsAccess(req.user)) return next();
  try {
    const quizId = req.params.quizId
      ? parsePositiveId(req.params.quizId)
      : (await query(
        "SELECT quiz_id FROM quiz_attempts WHERE id = $1 AND user_id = $2",
        [parsePositiveId(req.params.attemptId), req.user?.id],
      )).rows[0]?.quiz_id;
    if (quizId && await isQuizPublicPreview({ query }, quizId)) return next();
  } catch (error) {
    console.error("Error checking public preview quiz access:", error);
  }
  return requireActiveStudentLmsAccess(req, res, next);
};

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

const getQuiz = async (db, quizId, { lock = false } = {}) => (await db.query(
  `SELECT q.id, q.title, q.description, q.status AS quiz_status, q.activity_scope, q.due_date,
          q.duration_minutes, q.passing_score, q.instructor_id, q.paper_file_id, q.solution_file_id,
          q.live_class_id, q.class_session_id, q.course_id AS quiz_course_id, q.lesson_id,
          q.attempt_limit, q.available_from, q.available_until, q.review_policy, q.shuffle_questions,
          COALESCE(q.course_id, l.course_id, lc.course_id, class_course.id) AS resolved_course_id,
          COALESCE(c.is_published, class_course.is_published, FALSE) AS course_is_published,
          COALESCE(c.is_management_managed, FALSE) AS course_is_management_managed,
          l.is_published AS lesson_is_published,
          paper.status AS paper_status, solution.status AS solution_status,
          lc.title AS class_title, cs.title AS session_title,
          cs.start_time AS session_start, cs.end_time AS session_end,
          COALESCE(cs.is_public_preview, FALSE) AS session_is_public_preview,
          COALESCE(l.is_public_preview, FALSE) AS lesson_is_public_preview
   FROM quizzes q
   LEFT JOIN lessons l ON l.id = q.lesson_id
   LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
   LEFT JOIN live_classes lc ON lc.id = COALESCE(q.live_class_id, cs.live_class_id)
   LEFT JOIN courses c ON c.id = COALESCE(q.course_id, l.course_id)
   LEFT JOIN courses class_course ON class_course.id = lc.course_id
   LEFT JOIN lms_learning_files paper ON paper.id = q.paper_file_id
   LEFT JOIN lms_learning_files solution ON solution.id = q.solution_file_id
   WHERE q.id = $1${lock ? " FOR UPDATE OF q" : ""}`,
  [quizId],
)).rows[0] || null;

const ensureQuizAccess = async (db, quiz, user, { recordProfile = null } = {}) => {
  if (user?.role === "admin" || user?.role === "creator") return true;
  if (String(quiz.quiz_status || "").toUpperCase() !== "PUBLISHED") return false;
  if (quiz.session_is_public_preview) return true;
  if (quiz.lesson_is_public_preview && quiz.lesson_is_published !== false) return true;
  if (!quiz.resolved_course_id || !quiz.course_is_published || quiz.lesson_is_published === false) return false;

  const access = await db.query(
    `SELECT 1 FROM lms_access_grants g
     WHERE g.user_id = $1
       AND (
         g.course_id = $2
         OR ($3::bigint IS NOT NULL AND EXISTS (
           SELECT 1 FROM live_classes lc WHERE lc.id = $3 AND lc.course_id = g.course_id
         ))
         OR ($3::bigint IS NOT NULL AND EXISTS (
           SELECT 1 FROM class_enrollments ce WHERE ce.user_id = $1 AND ce.live_class_id = $3 AND ce.status = 'active'
         ))
         OR EXISTS (
           SELECT 1 FROM video_course_profiles vcp
           WHERE vcp.course_id = g.course_id AND vcp.status = 'active'
             AND (vcp.source_live_class_id = $3 OR vcp.course_id = $2)
         )
         OR EXISTS (
           SELECT 1 FROM video_course_profiles vcp
           WHERE vcp.course_id = $2 AND vcp.status = 'active'
             AND (
               vcp.source_live_class_id IN (SELECT lc.id FROM live_classes lc WHERE lc.course_id = g.course_id)
               OR vcp.source_live_class_id IN (SELECT ce.live_class_id FROM class_enrollments ce WHERE ce.user_id = $1 AND ce.status = 'active')
             )
         )
         OR ($4::bigint IS NOT NULL AND (
           g.course_id = $4
           OR EXISTS (
             SELECT 1 FROM video_course_profiles vcp
             WHERE vcp.id = $5 AND (
               vcp.course_id = g.course_id
               OR vcp.source_live_class_id IN (SELECT lc.id FROM live_classes lc WHERE lc.course_id = g.course_id)
               OR vcp.source_live_class_id IN (SELECT ce.live_class_id FROM class_enrollments ce WHERE ce.user_id = $1 AND ce.status = 'active')
             )
           )
         ))
       )
       AND g.access_status = 'active'
       AND g.valid_from <= NOW()
       AND (g.valid_until IS NULL OR g.valid_until > NOW())`,
    [user.id, quiz.resolved_course_id, quiz.live_class_id, recordProfile?.course_id || null, recordProfile?.id || null],
  );
  if (!access.rows[0]) return false;

  const liveClassId = quiz.live_class_id;
  if (!liveClassId) return true;

  const enrolled = await db.query(
    `SELECT 1 FROM class_enrollments ce
     LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
     WHERE ce.user_id = $1 AND ce.status = 'active'
       AND (
         ce.live_class_id = $2
         OR ($3::bigint IS NOT NULL AND ce.live_class_id = $3)
         OR EXISTS (
           SELECT 1 FROM video_course_profiles vcp
           LEFT JOIN management_class_learning_aliases alias
             ON LOWER(alias.alias_class_source_id) = LOWER(vcp.management_class_id)
           WHERE vcp.source_live_class_id = $2 AND vcp.status = 'active'
             AND (
               (ce.learning_mode = 'recording' AND (
                 ce.management_class_alias_id = alias.id
                 OR ce.live_class_id = $2
                 OR ce.course_id = vcp.course_id
               ))
               OR ce.live_class_id = vcp.source_live_class_id
             )
         )
         OR ($4::bigint IS NOT NULL AND EXISTS (
           SELECT 1 FROM video_course_profiles vcp
           LEFT JOIN management_class_learning_aliases alias
             ON LOWER(alias.alias_class_source_id) = LOWER(vcp.management_class_id)
           WHERE vcp.id = $4 AND vcp.status = 'active'
             AND (
               (ce.learning_mode = 'recording' AND (
                 ce.management_class_alias_id = alias.id
                 OR ce.live_class_id = vcp.source_live_class_id
                 OR ce.course_id = vcp.course_id
               ))
               OR (vcp.mode = 'MIRROR' AND ce.live_class_id = vcp.source_live_class_id)
             )
         ))
       )`,
    [user.id, liveClassId, recordProfile?.source_live_class_id || null, recordProfile?.id || null],
  );
  return Boolean(enrolled.rows[0]);
};

const getAccommodation = async (db, quizId, userId) => (await db.query(
  `SELECT due_at, extra_time_minutes, attempt_limit_override
   FROM assessment_accommodations
   WHERE assessment_type = 'quiz' AND assessment_id = $1 AND user_id = $2 AND status = 'active'`,
  [quizId, userId],
)).rows[0] || null;

const effectiveQuizForStudent = (quiz, accommodation, { recordScopeId = null } = {}) => {
  const isRecordScope = Boolean(recordScopeId);
  return {
    ...quiz,
    available_from: isRecordScope ? null : quiz.available_from,
    due_date: accommodation?.due_at || (isRecordScope ? null : quiz.due_date),
    available_until: accommodation?.due_at || (isRecordScope ? null : quiz.available_until),
    duration_minutes: Number(quiz.duration_minutes || 0) + Number(accommodation?.extra_time_minutes || 0),
    attempt_limit: isRecordScope ? null : (accommodation?.attempt_limit_override || quiz.attempt_limit),
    review_policy: isRecordScope && quiz.review_policy === "after_close" ? "after_submit" : quiz.review_policy,
    video_course_profile_id: recordScopeId,
    is_record_course_access: isRecordScope,
    accommodation: accommodation || null,
  };
};

const getQuizQuestions = async (db, quizId) => (await db.query(
  `SELECT qq.id, qq.quiz_id, qq.group_id, qq.item_order, qq.question_text,
          qq.question_text_cn, qq.question_text_en, qq.question_type, qq.options_json,
          qq.correct_answer, qq.explanation, qq.explanation_cn, qq.explanation_en,
          qq.image_url, qq.explanation_image_url, qq.sub_question_number,
          qq.ocr_metadata, qq.points, qq.sort_order,
          qg.group_type, qg.passage_text, qg.passage_text_cn, qg.passage_text_en,
          qg.passage_image_url, qg.linked_options, qg.cloze_mode,
          qg.sort_order AS group_sort_order
   FROM quiz_questions qq
   LEFT JOIN quiz_question_groups qg ON qg.id = qq.group_id
   WHERE qq.quiz_id = $1
   ORDER BY COALESCE(qq.item_order, qg.sort_order, qq.sort_order), qq.sort_order, qq.id`,
  [quizId],
)).rows;

const attemptQuestions = (attempt, fallbackQuestions) => {
  const snapshot = parseJsonArray(attempt?.question_snapshot);
  return snapshot.length ? snapshot : fallbackQuestions;
};

const resolveAttemptExpiry = ({ attempt, quiz, user, now = new Date() }) => {
  const isPrivileged = user?.role === "admin" || user?.role === "creator";
  const hasOpenSchedule = Boolean(
    quiz?.session_is_public_preview
    || quiz?.lesson_is_public_preview
    || quiz?.is_public_preview
    || quiz?.is_record_course_access,
  );
  const closesAt = (isPrivileged || hasOpenSchedule) ? null : getQuizAvailability(quiz, now).closesAt;
  const configured = getAttemptExpiry({
    startedAt: attempt.started_at,
    durationMinutes: quiz.duration_minutes,
    closesAt,
  });
  const stored = attempt.expires_at ? new Date(attempt.expires_at) : null;
  // The current server policy is authoritative when a close time or an
  // accommodation changes after the attempt started.
  const expiresAt = configured || stored;
  return {
    expiresAt,
    shouldPersist: Boolean(expiresAt && (!stored || expiresAt.getTime() !== stored.getTime())),
  };
};

const submitAttempt = async ({ client, attempt, questions, autoSubmitted = false }) => {
  const computed = buildQuizResult(questions, attempt.answers_json || {});
  const updated = await client.query(
    `UPDATE quiz_attempts SET score=$1, max_score=$2, status='submitted', submitted_at=COALESCE(submitted_at, NOW()),
            auto_submitted=$3, updated_at=NOW()
     WHERE id=$4
     RETURNING id, quiz_id, user_id, answers_json, score, max_score, status, started_at,
               expires_at, submitted_at, attempt_number, auto_submitted, question_snapshot, updated_at`,
    [computed.score, computed.maxScore, autoSubmitted, attempt.id],
  );
  return { attempt: updated.rows[0], computed };
};

const getStudentAttempt = async ({ client, quiz, user, userId, questions, startNewAttempt = false }) => {
  const isPrivileged = user?.role === "admin" || user?.role === "creator";
  const isPreview = Boolean(quiz.session_is_public_preview || (quiz.lesson_is_public_preview && quiz.lesson_is_published !== false));
  const isRecordScope = Boolean(quiz.video_course_profile_id);

  const active = await client.query(
    `SELECT * FROM quiz_attempts
     WHERE quiz_id=$1 AND user_id=$2
       AND video_course_profile_id IS NOT DISTINCT FROM $3::bigint
       AND status='in_progress'
     ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE`,
    [quiz.id, userId, quiz.video_course_profile_id || null],
  );
  const now = new Date();
  let attempt = active.rows[0] || null;
  if (attempt) {
    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz, user, now });
    if (shouldPersist) {
      attempt.expires_at = (await client.query(
        "UPDATE quiz_attempts SET expires_at=$1, updated_at=NOW() WHERE id=$2 RETURNING expires_at",
        [expiresAt.toISOString(), attempt.id],
      )).rows[0].expires_at;
    }
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      return { ...(await submitAttempt({ client, attempt, questions: attemptQuestions(attempt, questions), autoSubmitted: true })), created: false, timedOut: true };
    }
    return { attempt, computed: null, created: false, timedOut: false };
  }

  const submitted = await client.query(
    `SELECT * FROM quiz_attempts
     WHERE quiz_id=$1 AND user_id=$2
       AND video_course_profile_id IS NOT DISTINCT FROM $3::bigint
     ORDER BY attempt_number DESC FOR UPDATE`,
    [quiz.id, userId, quiz.video_course_profile_id || null],
  );
  const finalized = !isPrivileged && !isPreview && !isRecordScope && quiz.live_class_id && (await client.query(
    "SELECT 1 FROM gradebook_finalizations WHERE class_id=$1 AND reopened_at IS NULL",
    [quiz.live_class_id],
  )).rows.length > 0;
  const availability = (isPrivileged || isPreview || isRecordScope)
    ? { isOpen: true, reason: null, opensAt: null, closesAt: null }
    : getQuizAvailability(quiz, now);
  const reachedLimit = !isPrivileged && !isRecordScope && quiz.attempt_limit && submitted.rows.length >= Number(quiz.attempt_limit);
  const cannotStartNew = finalized || reachedLimit || !availability.isOpen;

  // Opening a completed quiz must remain a read-only review action. A new
  // attempt is created only after the learner explicitly asks for another try.
  if ((!startNewAttempt || cannotStartNew) && submitted.rows.length > 0) {
    const latest = submitted.rows[0] || null;
    return {
      attempt: latest,
      computed: latest ? buildQuizResult(attemptQuestions(latest, questions), latest.answers_json || {}) : null,
      created: false,
      timedOut: false,
      canStartNewAttempt: isRecordScope || !cannotStartNew,
    };
  }

  if (finalized && submitted.rows.length === 0) {
    const computed = buildQuizResult(questions, {});
    return {
      attempt: {
        id: `unsubmitted-${quiz.id}`,
        quiz_id: quiz.id,
        user_id: userId,
        attempt_number: 0,
        status: "closed_unsubmitted",
        answers_json: {},
        score: 0,
        max_score: computed.maxScore,
        started_at: null,
        submitted_at: null,
        auto_submitted: false,
      },
      computed,
      created: false,
      timedOut: false,
      isOverdueUnsubmitted: true,
    };
  }

  if (!availability.isOpen) {
    if (availability.reason === "closed") {
      const computed = buildQuizResult(questions, {});
      return {
        attempt: {
          id: `unsubmitted-${quiz.id}`,
          quiz_id: quiz.id,
          user_id: userId,
          attempt_number: 0,
          status: "closed_unsubmitted",
          answers_json: {},
          score: 0,
          max_score: computed.maxScore,
          started_at: null,
          submitted_at: null,
          auto_submitted: false,
        },
        computed,
        created: false,
        timedOut: false,
        isOverdueUnsubmitted: true,
      };
    }
    const error = new Error("QUIZ_NOT_OPEN");
    error.availability = availability;
    throw error;
  }
  const attemptNumber = submitted.rows.length + 1;
  const expiresAt = getAttemptExpiry({ startedAt: now, durationMinutes: quiz.duration_minutes, closesAt: availability.closesAt });
  const snapshot = makeQuestionSnapshot(questions, quiz.shuffle_questions);
  attempt = (await client.query(
    `INSERT INTO quiz_attempts
       (quiz_id, user_id, video_course_profile_id, attempt_number, expires_at, question_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
    [quiz.id, userId, quiz.video_course_profile_id || null, attemptNumber, expiresAt?.toISOString() || null, JSON.stringify(snapshot)],
  )).rows[0];
  return { attempt, computed: null, created: true, timedOut: false, canStartNewAttempt: false };
};

const lockStudentAttempt = async (client, attemptId, userId) => {
  const scope = (await client.query(
    `SELECT qa.quiz_id, q.live_class_id
     FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id
     WHERE qa.id=$1 AND qa.user_id=$2`,
    [attemptId, userId],
  )).rows[0];
  if (!scope) return null;
  if (scope.live_class_id) await client.query("SELECT id FROM live_classes WHERE id=$1 FOR UPDATE", [scope.live_class_id]);
  await client.query("SELECT id FROM quizzes WHERE id=$1 FOR UPDATE", [scope.quiz_id]);
  const attempt = (await client.query(
    `SELECT qa.*,
            q.duration_minutes + COALESCE(aa.extra_time_minutes, 0) AS duration_minutes,
            COALESCE(aa.due_at, q.available_until) AS available_until,
            COALESCE(aa.due_at, q.due_date) AS due_date,
            q.activity_scope, q.live_class_id,
            q.review_policy, q.passing_score, q.solution_file_id, solution.status AS solution_status,
            COALESCE(cs.is_public_preview, FALSE) AS session_is_public_preview,
            COALESCE(l.is_public_preview, FALSE) AS lesson_is_public_preview
     FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id
     LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
     LEFT JOIN lessons l ON l.id = q.lesson_id
     LEFT JOIN lms_learning_files solution ON solution.id=q.solution_file_id
     LEFT JOIN assessment_accommodations aa
       ON aa.assessment_type='quiz' AND aa.assessment_id=q.id
      AND aa.user_id=qa.user_id AND aa.status='active'
     WHERE qa.id=$1 AND qa.user_id=$2 FOR UPDATE OF qa`,
    [attemptId, userId],
  )).rows[0] || null;
  if (attempt?.video_course_profile_id) {
    attempt.available_until = null;
    attempt.due_date = null;
    attempt.is_record_course_access = true;
    if (attempt.review_policy === "after_close") attempt.review_policy = "after_submit";
  }
  return attempt;
};

const validateEssayAssets = async (db, assetIds, userId) => {
  if (assetIds.length === 0) return null;
  const rows = (await db.query(
    `SELECT id, asset_kind, status FROM submission_assets
     WHERE id = ANY($1::bigint[]) AND user_id=$2 FOR UPDATE`,
    [assetIds, userId],
  )).rows;
  const assets = new Map(rows.map((row) => [Number(row.id), row]));
  for (const id of assetIds) {
    const asset = assets.get(Number(id));
    if (!asset || asset.status !== "ready" || asset.asset_kind !== "file") {
      return "Tệp tự luận không thuộc học viên, chưa upload xong hoặc không đúng loại file";
    }
  }
  return null;
};

const remainingSeconds = (attempt, now = Date.now()) => attempt?.expires_at
  ? Math.max(0, Math.ceil((new Date(attempt.expires_at).getTime() - now) / 1000))
  : null;

const serializeAttempt = (attempt) => attempt ? {
  id: String(attempt.id),
  number: Number(attempt.attempt_number || 1),
  status: attempt.status,
  answers: attempt.answers_json || {},
  startedAt: attempt.started_at,
  expiresAt: attempt.expires_at || null,
  remainingSeconds: remainingSeconds(attempt),
  submittedAt: attempt.submitted_at || null,
  autoSubmitted: Boolean(attempt.auto_submitted),
} : null;

const serializeQuiz = (quiz, questions, attempt, isOverdueUnsubmitted = false) => {
  const description = parseQuizDescriptionMetadata(quiz.description);
  const reviewAvailable = isOverdueUnsubmitted || (attempt?.status === "submitted" && reviewIsAvailable(quiz));
  return {
    id: String(quiz.id),
    quizId: String(quiz.id),
    title: quiz.title,
    description: description.description,
    essayConfig: description.essayConfig,
    classId: quiz.live_class_id ? String(quiz.live_class_id) : null,
    classTitle: quiz.class_title || null,
    sessionId: quiz.class_session_id ? String(quiz.class_session_id) : null,
    sessionTitle: quiz.session_title || null,
    activityScope: quiz.activity_scope || "session",
    dueDate: quiz.due_date || null,
    availableFrom: quiz.available_from || null,
    availableUntil: quiz.available_until || null,
    durationMinutes: Number(quiz.duration_minutes || 0),
    passingScore: Number(quiz.passing_score || 0),
    attemptLimit: Number(quiz.attempt_limit || 1),
    reviewPolicy: quiz.review_policy || "after_submit",
    items: publicQuizItems(questions),
    paperUrl: quiz.paper_file_id && quiz.paper_status === "ready" ? `/api/files/${quiz.paper_file_id}/download` : null,
    solutionUrl: reviewAvailable && quiz.solution_file_id && quiz.solution_status === "ready"
      ? `/api/files/${quiz.solution_file_id}/download`
      : null,
    hasSolution: Boolean(quiz.solution_file_id),
    accommodation: quiz.accommodation || null,
    isOverdueUnsubmitted,
  };
};

const resultPayload = ({ quiz, attempt, computed, alreadySubmitted = false, gamification = null, isOverdueUnsubmitted = false }) => {
  const reviewAvailable = isOverdueUnsubmitted || reviewIsAvailable(quiz);
  const passed = isOverdueUnsubmitted ? false : computed.percentage >= Number(quiz.passing_score);
  return {
    attemptId: String(attempt.id),
    attemptNumber: Number(attempt.attempt_number || 1),
    score: computed.score,
    maxScore: computed.maxScore,
    percentage: computed.percentage,
    passingScore: Number(quiz.passing_score),
    passed,
    reviewPolicy: quiz.review_policy || "after_submit",
    reviewAvailable,
    review: reviewAvailable ? computed.review : [],
    essay: computed.essay,
    essayGrade: computed.essayGrade,
    mcScore: computed.score - (computed.essayGrade?.score || 0),
    solutionUrl: reviewAvailable && quiz.solution_file_id && quiz.solution_status === "ready"
      ? `/api/files/${quiz.solution_file_id}/download`
      : null,
    hasSolution: Boolean(quiz.solution_file_id),
    alreadySubmitted,
    autoSubmitted: Boolean(attempt.auto_submitted),
    gamification,
    isOverdueUnsubmitted,
  };
};

const quizWindowError = (res, error) => {
  const notOpen = error.message === "QUIZ_NOT_OPEN";
  const at = notOpen ? error.availability?.opensAt : error.availability?.closesAt;
  const timeFormatted = at
    ? new Date(at).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
  const message = notOpen
    ? (timeFormatted
        ? `Bài kiểm tra chưa đến giờ mở đâu nè! ⏰ Bài thi sẽ bắt đầu lúc ${timeFormatted}. Bạn chuẩn bị ôn bài xíu rồi quay lại nhé! ✨`
        : "Bài kiểm tra chưa đến giờ mở đâu nè! ⏰ Bạn vui lòng quay lại sau nha! ✨")
    : "Bài kiểm tra đã đóng thời gian làm bài rồi bạn ơi! Hệ thống không thể mở thêm lượt làm bài mới.";

  return conflict(
    res,
    message,
    notOpen ? "QUIZ_NOT_OPEN" : "QUIZ_CLOSED",
    { opensAt: error.availability?.opensAt || null, closesAt: error.availability?.closesAt || null },
  );
};

router.get("/quizzes/:quizId/start", protectRoute, requireQuizPlayerAccess, async (req, res) => {
  const client = await getClient();
  let committed = false;
  try {
    const quizId = parsePositiveId(req.params.quizId);
    if (!quizId) return validationError(res, "quizId không hợp lệ");
    const rawProfileParam = req.query?.videoCourseProfileId || req.headers["x-video-course-profile-id"] || null;
    const backUrl = req.query?.backUrl || null;
    await client.query("BEGIN");
    const resolvedProfile = await resolveVideoCourseProfile(client, rawProfileParam, backUrl);
    const requestedVideoCourseProfileId = resolvedProfile ? Number(resolvedProfile.id) : null;
    if (rawProfileParam && !resolvedProfile) {
      await client.query("ROLLBACK");
      return validationError(res, "videoCourseProfileId không hợp lệ");
    }
    const quiz = await getQuiz(client, quizId);
    if (!quiz) throw Object.assign(new Error("Không tìm thấy đề thi"), { status: 404 });
    if (!(await ensureQuizAccess(client, quiz, req.user, { recordProfile: resolvedProfile }))) {
      throw Object.assign(new Error("Bạn chưa được cấp quyền làm đề thi này"), { status: 403 });
    }
    const isPrivileged = req.user?.role === "admin" || req.user?.role === "creator";
    const isPublicPreview = Boolean(quiz.session_is_public_preview || (quiz.lesson_is_public_preview && quiz.lesson_is_published !== false));
    const unitType = quiz.class_session_id ? "class_session" : (quiz.lesson_id ? "lesson" : null);
    const unitId = quiz.class_session_id || quiz.lesson_id;
    let recordScopeId = null;
    if (requestedVideoCourseProfileId && unitType && !isPrivileged) {
      const recordAccess = await getVideoCourseUnitAccessContext({
        db: client,
        userId: req.user.id,
        unitType,
        unitId,
        videoCourseProfileId: requestedVideoCourseProfileId,
      });
      if (!recordAccess.isVideoCourseUnit || (!recordAccess.isRecordMember && !recordAccess.isPublicPreview)) {
        throw Object.assign(new Error("Bạn chưa được cấp quyền vào lớp Record này"), { status: 403 });
      }
      if (!recordAccess.isUnlocked) {
        throw Object.assign(
          new Error("Bài này sẽ mở sau khi bạn hoàn thành buổi học trước nhé."),
          { status: 403 },
        );
      }
      recordScopeId = requestedVideoCourseProfileId;
    } else if (!isPrivileged && !isPublicPreview && unitType && requestedVideoCourseProfileId) {
      throw Object.assign(new Error("Không tìm thấy bài học Record tương ứng"), { status: 403 });
    }
    if (quiz.live_class_id) await client.query("SELECT id FROM live_classes WHERE id=$1 FOR UPDATE", [quiz.live_class_id]);
    await client.query("SELECT id FROM quizzes WHERE id=$1 FOR UPDATE", [quiz.id]);
    const questions = await getQuizQuestions(client, quizId);
    if (questions.length === 0) throw Object.assign(new Error("Đề thi chưa có câu hỏi"), { status: 404 });
    const accommodation = await getAccommodation(client, quizId, req.user.id);
    const effectiveQuiz = effectiveQuizForStudent(quiz, accommodation, { recordScopeId });
    const state = await getStudentAttempt({
      client,
      quiz: effectiveQuiz,
      user: req.user,
      userId: req.user.id,
      questions,
      startNewAttempt: req.query?.newAttempt === "1" || req.query?.newAttempt === "true",
    });
    await client.query("COMMIT");
    committed = true;
    const effectiveQuestions = attemptQuestions(state.attempt, questions);
    const isOverdueUnsubmitted = Boolean(state.isOverdueUnsubmitted);
    const result = ((state.attempt?.status === "submitted" || isOverdueUnsubmitted) && state.computed)
      ? resultPayload({
          quiz: effectiveQuiz,
          attempt: state.attempt,
          computed: state.computed,
          alreadySubmitted: true,
          isOverdueUnsubmitted,
        })
      : null;
    return res.json({
      success: true,
      data: {
        quiz: serializeQuiz(effectiveQuiz, effectiveQuestions, state.attempt, isOverdueUnsubmitted),
        attempt: serializeAttempt(state.attempt),
        result,
        isOverdueUnsubmitted,
        canStartNewAttempt: Boolean(state.canStartNewAttempt),
      },
    });
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    if (["QUIZ_NOT_OPEN", "QUIZ_CLOSED"].includes(error.message)) return quizWindowError(res, error);
    if (error.status === 404) return notFound(res, error.message);
    if (error.status === 403) return forbidden(res, error.message);
    if (error.status === 409) return conflict(res, error.message, error.code);
    console.error("Error starting MOLI quiz attempt:", error);
    return internalError(res, "Không thể bắt đầu lượt làm bài");
  } finally {
    client.release();
  }
});

router.put("/attempts/:attemptId/answers", protectRoute, requireQuizPlayerAccess, async (req, res) => {
  const client = await getClient();
  let committed = false;
  try {
    const attemptId = parsePositiveId(req.params.attemptId);
    if (!attemptId) return validationError(res, "attemptId không hợp lệ");
    const hasSingleAnswer = req.body?.questionId !== undefined;
    if (!hasSingleAnswer && !isPlainObject(req.body?.answers)) return validationError(res, "Dữ liệu autosave không hợp lệ");
    await client.query("BEGIN");
    const attempt = await lockStudentAttempt(client, attemptId, req.user.id);
    if (!attempt) throw Object.assign(new Error("Không tìm thấy lượt làm bài"), { status: 404 });
    if (attempt.status !== "in_progress") throw Object.assign(new Error("Lượt làm bài đã được nộp"), { status: 409, code: "QUIZ_ATTEMPT_SUBMITTED" });
    const questions = attemptQuestions(attempt, await getQuizQuestions(client, attempt.quiz_id));
    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz: attempt, user: req.user });
    if (shouldPersist) attempt.expires_at = expiresAt;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      await submitAttempt({ client, attempt, questions, autoSubmitted: true });
      await client.query("COMMIT");
      committed = true;
      return conflict(res, "Đã hết thời gian. Hệ thống đã nộp phần đáp án đã lưu.", "QUIZ_ATTEMPT_EXPIRED");
    }
    let merged = { ...(attempt.answers_json || {}) };
    if (hasSingleAnswer) {
      const questionId = parsePositiveId(req.body.questionId);
      if (!questionId) throw Object.assign(new Error("questionId không hợp lệ"), { status: 400 });
      merged[String(questionId)] = req.body.answer;
    } else {
      merged = { ...merged, ...req.body.answers };
    }
    const normalized = normalizeQuizAnswers(questions, merged);
    if (normalized.error) throw Object.assign(new Error(normalized.error), { status: 400 });
    const assetError = await validateEssayAssets(client, normalized.assetIds, req.user.id);
    if (assetError) throw Object.assign(new Error(assetError), { status: 400 });
    const saved = (await client.query(
      `UPDATE quiz_attempts SET answers_json=$1::jsonb, expires_at=COALESCE(expires_at,$2), updated_at=NOW()
       WHERE id=$3 RETURNING id, answers_json, expires_at, updated_at`,
      [JSON.stringify(normalized.answers), expiresAt?.toISOString() || null, attempt.id],
    )).rows[0];
    await client.query("COMMIT");
    committed = true;
    return res.json({ success: true, data: { attemptId: String(saved.id), answers: saved.answers_json, expiresAt: saved.expires_at, savedAt: saved.updated_at } });
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    if (error.status === 400) return validationError(res, error.message);
    if (error.status === 404) return notFound(res, error.message);
    if (error.status === 409) return conflict(res, error.message, error.code);
    console.error("Error autosaving MOLI quiz attempt:", error);
    return internalError(res, "Không thể lưu nháp bài làm");
  } finally {
    client.release();
  }
});

router.post("/attempts/:attemptId/submit", protectRoute, requireQuizPlayerAccess, async (req, res) => {
  const client = await getClient();
  let committed = false;
  try {
    const attemptId = parsePositiveId(req.params.attemptId);
    if (!attemptId || (req.body?.answers !== undefined && !isPlainObject(req.body.answers))) return validationError(res, "Dữ liệu nộp bài không hợp lệ");
    await client.query("BEGIN");
    const attempt = await lockStudentAttempt(client, attemptId, req.user.id);
    if (!attempt) throw Object.assign(new Error("Không tìm thấy lượt làm bài"), { status: 404 });
    const questions = attemptQuestions(attempt, await getQuizQuestions(client, attempt.quiz_id));
    if (attempt.status === "submitted") {
      const computed = buildQuizResult(questions, attempt.answers_json || {});
      await client.query("COMMIT");
      committed = true;
      return res.json({ success: true, data: resultPayload({ quiz: attempt, attempt, computed, alreadySubmitted: true }) });
    }

    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz: attempt, user: req.user });
    if (shouldPersist) attempt.expires_at = expiresAt;
    const expired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
    if (!expired) {
      const merged = { ...(attempt.answers_json || {}), ...(req.body?.answers || {}) };
      const normalized = normalizeQuizAnswers(questions, merged);
      if (normalized.error) throw Object.assign(new Error(normalized.error), { status: 400 });
      const assetError = await validateEssayAssets(client, normalized.assetIds, req.user.id);
      if (assetError) throw Object.assign(new Error(assetError), { status: 400 });
      attempt.answers_json = normalized.answers;
      await client.query(
        "UPDATE quiz_attempts SET answers_json=$1::jsonb, expires_at=COALESCE(expires_at,$2), updated_at=NOW() WHERE id=$3",
        [JSON.stringify(normalized.answers), expiresAt?.toISOString() || null, attempt.id],
      );
    }
    const submitted = await submitAttempt({ client, attempt, questions, autoSubmitted: expired });
    const passed = submitted.computed.percentage >= Number(attempt.passing_score);
    const gamification = await awardXp({
      db: client,
      userId: req.user.id,
      eventKey: `quiz:${attempt.quiz_id}:scope:${attempt.video_course_profile_id || "live"}:attempt:${attempt.attempt_number}:submitted`,
      eventType: "quiz_submitted",
      xp: passed ? XP_VALUES.quizPassed : XP_VALUES.quizSubmitted,
      metadata: { quizId: attempt.quiz_id, attemptId: attempt.id, attemptNumber: attempt.attempt_number, passed, percentage: submitted.computed.percentage },
    });
    await client.query("COMMIT");
    committed = true;
    return res.json({ success: true, data: resultPayload({ quiz: attempt, attempt: submitted.attempt, computed: submitted.computed, gamification }) });
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    if (error.status === 400) return validationError(res, error.message);
    if (error.status === 404) return notFound(res, error.message);
    console.error("Error submitting MOLI quiz attempt:", error);
    return internalError(res, "Không thể nộp bài");
  } finally {
    client.release();
  }
});

export default router;

