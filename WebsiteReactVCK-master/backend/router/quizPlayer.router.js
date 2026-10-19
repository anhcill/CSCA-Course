import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireActiveStudentLmsAccess from "../middleware/requireActiveStudentLmsAccess.js";
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
          COALESCE(q.course_id, l.course_id) AS resolved_course_id,
          c.is_published AS course_is_published,
          COALESCE(c.is_management_managed, FALSE) AS course_is_management_managed,
          l.is_published AS lesson_is_published,
          paper.status AS paper_status, solution.status AS solution_status,
          lc.title AS class_title, cs.title AS session_title,
          cs.start_time AS session_start, cs.end_time AS session_end
   FROM quizzes q
   LEFT JOIN lessons l ON l.id = q.lesson_id
   LEFT JOIN courses c ON c.id = COALESCE(q.course_id, l.course_id)
   LEFT JOIN lms_learning_files paper ON paper.id = q.paper_file_id
   LEFT JOIN lms_learning_files solution ON solution.id = q.solution_file_id
   LEFT JOIN live_classes lc ON lc.id = q.live_class_id
   LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
   WHERE q.id = $1${lock ? " FOR UPDATE OF q" : ""}`,
  [quizId],
)).rows[0] || null;

const ensureQuizAccess = async (db, quiz, userId) => {
  if (quiz.quiz_status !== "PUBLISHED" || !quiz.resolved_course_id || !quiz.course_is_published || quiz.lesson_is_published === false) return false;
  const access = await db.query(
    `SELECT 1 FROM lms_access_grants
     WHERE user_id = $1 AND course_id = $2 AND access_status = 'active'
       AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())`,
    [userId, quiz.resolved_course_id],
  );
  if (!access.rows[0]) return false;
  if (!quiz.live_class_id) return true;
  const enrolled = await db.query(
    `SELECT 1 FROM class_enrollments ce
     JOIN live_classes lc ON lc.id = ce.live_class_id
     WHERE ce.user_id = $1 AND ce.live_class_id = $2 AND ce.status = 'active' AND lc.status = 'active'`,
    [userId, quiz.live_class_id],
  );
  return Boolean(enrolled.rows[0]);
};

const getAccommodation = async (db, quizId, userId) => (await db.query(
  `SELECT due_at, extra_time_minutes, attempt_limit_override
   FROM assessment_accommodations
   WHERE assessment_type = 'quiz' AND assessment_id = $1 AND user_id = $2 AND status = 'active'`,
  [quizId, userId],
)).rows[0] || null;

const effectiveQuizForStudent = (quiz, accommodation) => accommodation ? {
  ...quiz,
  due_date: accommodation.due_at || quiz.due_date,
  available_until: accommodation.due_at || quiz.available_until,
  duration_minutes: Number(quiz.duration_minutes || 0) + Number(accommodation.extra_time_minutes || 0),
  attempt_limit: accommodation.attempt_limit_override || quiz.attempt_limit,
  accommodation,
} : { ...quiz, accommodation: null };

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

const resolveAttemptExpiry = ({ attempt, quiz, now = new Date() }) => {
  const configured = getAttemptExpiry({
    startedAt: attempt.started_at,
    durationMinutes: quiz.duration_minutes,
    closesAt: getQuizAvailability(quiz, now).closesAt,
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

const getStudentAttempt = async ({ client, quiz, userId, questions }) => {
  const active = await client.query(
    `SELECT * FROM quiz_attempts
     WHERE quiz_id=$1 AND user_id=$2 AND status='in_progress'
     ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE`,
    [quiz.id, userId],
  );
  const now = new Date();
  let attempt = active.rows[0] || null;
  if (attempt) {
    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz, now });
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
    `SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND user_id=$2 ORDER BY attempt_number DESC FOR UPDATE`,
    [quiz.id, userId],
  );
  const finalized = quiz.live_class_id && (await client.query(
    "SELECT 1 FROM gradebook_finalizations WHERE class_id=$1 AND reopened_at IS NULL",
    [quiz.live_class_id],
  )).rows.length > 0;
  const availability = getQuizAvailability(quiz, now);
  const reachedLimit = submitted.rows.length >= Number(quiz.attempt_limit || 1);
  const cannotStartNew = finalized || reachedLimit || !availability.isOpen;

  if (cannotStartNew && submitted.rows.length > 0) {
    const latest = submitted.rows[0] || null;
    return {
      attempt: latest,
      computed: latest ? buildQuizResult(attemptQuestions(latest, questions), latest.answers_json || {}) : null,
      created: false,
      timedOut: false,
    };
  }

  if (finalized && submitted.rows.length === 0) throw Object.assign(new Error("Sổ điểm đã chốt; không thể bắt đầu lượt mới"), { status: 409, code: "GRADEBOOK_FINALIZED" });

  if (!availability.isOpen) {
    const error = new Error(availability.reason === "not_open" ? "QUIZ_NOT_OPEN" : "QUIZ_CLOSED");
    error.availability = availability;
    throw error;
  }
  const attemptNumber = submitted.rows.length + 1;
  const expiresAt = getAttemptExpiry({ startedAt: now, durationMinutes: quiz.duration_minutes, closesAt: availability.closesAt });
  const snapshot = makeQuestionSnapshot(questions, quiz.shuffle_questions);
  attempt = (await client.query(
    `INSERT INTO quiz_attempts (quiz_id, user_id, attempt_number, expires_at, question_snapshot)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
    [quiz.id, userId, attemptNumber, expiresAt?.toISOString() || null, JSON.stringify(snapshot)],
  )).rows[0];
  return { attempt, computed: null, created: true, timedOut: false };
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
  return (await client.query(
    `SELECT qa.*,
            q.duration_minutes + COALESCE(aa.extra_time_minutes, 0) AS duration_minutes,
            COALESCE(aa.due_at, q.available_until) AS available_until,
            COALESCE(aa.due_at, q.due_date) AS due_date,
            q.activity_scope, q.live_class_id,
            q.review_policy, q.passing_score, q.solution_file_id, solution.status AS solution_status
     FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id
     LEFT JOIN lms_learning_files solution ON solution.id=q.solution_file_id
     LEFT JOIN assessment_accommodations aa
       ON aa.assessment_type='quiz' AND aa.assessment_id=q.id
      AND aa.user_id=qa.user_id AND aa.status='active'
     WHERE qa.id=$1 AND qa.user_id=$2 FOR UPDATE OF qa`,
    [attemptId, userId],
  )).rows[0] || null;
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

const serializeQuiz = (quiz, questions, attempt) => {
  const description = parseQuizDescriptionMetadata(quiz.description);
  const reviewAvailable = attempt?.status === "submitted" && reviewIsAvailable(quiz);
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
  };
};

const resultPayload = ({ quiz, attempt, computed, alreadySubmitted = false, gamification = null }) => {
  const reviewAvailable = reviewIsAvailable(quiz);
  const passed = computed.percentage >= Number(quiz.passing_score);
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

router.get("/quizzes/:quizId/start", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
  const client = await getClient();
  let committed = false;
  try {
    const quizId = parsePositiveId(req.params.quizId);
    if (!quizId) return validationError(res, "quizId không hợp lệ");
    await client.query("BEGIN");
    const quiz = await getQuiz(client, quizId);
    if (!quiz) throw Object.assign(new Error("Không tìm thấy đề thi"), { status: 404 });
    if (!(await ensureQuizAccess(client, quiz, req.user.id))) throw Object.assign(new Error("Bạn chưa được cấp quyền làm đề thi này"), { status: 403 });
    if (quiz.live_class_id) await client.query("SELECT id FROM live_classes WHERE id=$1 FOR UPDATE", [quiz.live_class_id]);
    await client.query("SELECT id FROM quizzes WHERE id=$1 FOR UPDATE", [quiz.id]);
    const questions = await getQuizQuestions(client, quizId);
    if (questions.length === 0) throw Object.assign(new Error("Đề thi chưa có câu hỏi"), { status: 404 });
    const accommodation = await getAccommodation(client, quizId, req.user.id);
    const effectiveQuiz = effectiveQuizForStudent(quiz, accommodation);
    const state = await getStudentAttempt({ client, quiz: effectiveQuiz, userId: req.user.id, questions });
    await client.query("COMMIT");
    committed = true;
    const effectiveQuestions = attemptQuestions(state.attempt, questions);
    const result = state.attempt?.status === "submitted" && state.computed
      ? resultPayload({ quiz: effectiveQuiz, attempt: state.attempt, computed: state.computed, alreadySubmitted: true })
      : null;
    return res.json({
      success: true,
      data: {
        quiz: serializeQuiz(effectiveQuiz, effectiveQuestions, state.attempt),
        attempt: serializeAttempt(state.attempt),
        result,
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

router.put("/attempts/:attemptId/answers", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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
    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz: attempt });
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

router.post("/attempts/:attemptId/submit", protectRoute, requireRole("user"), requireActiveStudentLmsAccess, async (req, res) => {
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

    const { expiresAt, shouldPersist } = resolveAttemptExpiry({ attempt, quiz: attempt });
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
      eventKey: `quiz:${attempt.quiz_id}:attempt:${attempt.attempt_number}:submitted`,
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

