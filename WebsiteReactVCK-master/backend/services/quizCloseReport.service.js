import { pool } from "../db/connect.js";
import { buildQuizResult } from "./quizAttempt.service.js";

const MANUAL_TYPES = new Set(["essay", "translation"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPORT_VERSION = 1;
const DEFAULT_BATCH_SIZE = 20;

const asDate = (value, fallback = null) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const asIso = (value) => asDate(value)?.toISOString() || null;
const numberOrZero = (value) => Number(value) || 0;
const round = (value, digits = 2) => Number(numberOrZero(value).toFixed(digits));
const lower = (value) => String(value || "").trim().toLowerCase();
const isManual = (type) => MANUAL_TYPES.has(lower(type));

const isBlankAnswer = (answer) => {
  if (answer === null || answer === undefined) return true;
  if (typeof answer === "string") return answer.trim() === "";
  if (Array.isArray(answer)) return answer.length === 0;
  if (typeof answer === "object") {
    const text = String(answer.text || answer.notes || "").trim();
    const attachments = Array.isArray(answer.attachments) ? answer.attachments : [];
    return !text && attachments.length === 0;
  }
  return false;
};

const optionKey = (option) => String(
  option && typeof option === "object"
    ? (option.key ?? option.value ?? option.id ?? option.text ?? "")
    : option,
).trim();

const answerKeys = (answer) => {
  if (isBlankAnswer(answer)) return [];
  const values = Array.isArray(answer) ? answer : [answer];
  return values.map(optionKey).filter(Boolean);
};

const toJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const questionRows = (rows) => rows.map((row) => ({
  ...row,
  options_json: toJsonArray(row.options_json),
  linked_options: toJsonArray(row.linked_options),
}));

const retryAt = (attempts, now) => {
  const minutes = Math.min(5 * (2 ** Math.max(0, attempts - 1)), 360);
  return new Date(asDate(now, new Date()).getTime() + minutes * 60_000);
};

const acquireClient = async (db) => {
  if (typeof db?.connect === "function") {
    const client = await db.connect();
    return { client, release: () => client.release?.() };
  }
  return { client: db, release: () => {} };
};

const transaction = async (db, callback) => {
  const { client, release } = await acquireClient(db);
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    release();
  }
};

const loadQuestions = async (db, quizId) => {
  const result = await db.query(
    `SELECT *
     FROM quiz_questions
     WHERE quiz_id = $1
     ORDER BY COALESCE(item_order, sort_order, 1), COALESCE(sort_order, 1), id`,
    [quizId],
  );
  return questionRows(result.rows);
};

const questionsForAttempt = (attempt, authoredQuestions) => {
  const snapshot = Array.isArray(attempt.question_snapshot)
    ? attempt.question_snapshot
    : toJsonArray(attempt.question_snapshot);
  return snapshot.length > 0 ? questionRows(snapshot) : authoredQuestions;
};

export const processExpiredQuizAttempts = async ({
  db = pool,
  limit = 100,
  now = new Date(),
} = {}) => transaction(db, async (client) => {
  const claimed = await client.query(
    `SELECT *
     FROM quiz_attempts
     WHERE status = 'in_progress'
       AND expires_at IS NOT NULL
       AND expires_at <= $1
     ORDER BY expires_at, id
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [asDate(now, new Date()), Math.max(1, Number(limit) || 100)],
  );

  const questionsByQuiz = new Map();
  let submitted = 0;
  for (const attempt of claimed.rows) {
    let questions = questionsForAttempt(attempt, []);
    if (questions.length === 0) {
      if (!questionsByQuiz.has(String(attempt.quiz_id))) {
        questionsByQuiz.set(String(attempt.quiz_id), await loadQuestions(client, attempt.quiz_id));
      }
      questions = questionsByQuiz.get(String(attempt.quiz_id));
    }
    const computed = buildQuizResult(questions, attempt.answers_json || {});
    const updated = await client.query(
      `UPDATE quiz_attempts
       SET score = $2,
           max_score = $3,
           status = 'submitted',
           submitted_at = COALESCE(submitted_at, $4),
           auto_submitted = TRUE,
           updated_at = NOW()
       WHERE id = $1 AND status = 'in_progress'
       RETURNING id`,
      [attempt.id, computed.score, computed.maxScore, asDate(now, new Date())],
    );
    submitted += updated.rowCount || updated.rows.length;
  }

  return { scanned: claimed.rows.length, submitted };
});

const chooseAttempt = (attempts, policy) => {
  if (attempts.length === 0) return null;
  const sorted = [...attempts];
  if (policy === "first") {
    sorted.sort((a, b) => numberOrZero(a.attempt_number) - numberOrZero(b.attempt_number));
  } else if (policy === "latest") {
    sorted.sort((a, b) => numberOrZero(b.attempt_number) - numberOrZero(a.attempt_number));
  } else {
    sorted.sort((a, b) => {
      const submittedDelta = Number(b.status === "submitted") - Number(a.status === "submitted");
      if (submittedDelta) return submittedDelta;
      const scoreDelta = numberOrZero(b.score) - numberOrZero(a.score);
      if (scoreDelta) return scoreDelta;
      return numberOrZero(b.attempt_number) - numberOrZero(a.attempt_number);
    });
  }
  return sorted[0];
};

const recipientPriority = {
  lead_instructor: 1,
  quiz_instructor: 2,
  class_teacher: 3,
  admin: 4,
};

const loadRecipients = async (db, quiz) => {
  const result = await db.query(
    `WITH recipient_candidates AS (
       SELECT lc.instructor_id AS user_id, 'lead_instructor'::text AS recipient_role
       FROM live_classes lc
       WHERE lc.id = $1 AND lc.instructor_id IS NOT NULL
       UNION ALL
       SELECT ct.teacher_id, CASE WHEN ct.teaching_role = 'lead' THEN 'lead_instructor' ELSE 'class_teacher' END
       FROM class_teachers ct
       WHERE ct.live_class_id = $1 AND ct.status = 'active'
       UNION ALL
       SELECT $2::bigint, 'quiz_instructor'
       WHERE $2::bigint IS NOT NULL
       UNION ALL
       SELECT u.id, 'admin'
       FROM users u
       WHERE u.role = 'admin'
     )
     SELECT rc.user_id, rc.recipient_role, u.email, u.username,
            COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.username, ''), u.email) AS display_name
     FROM recipient_candidates rc
     JOIN users u ON u.id = rc.user_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''`,
    [quiz.live_class_id, quiz.instructor_id],
  );

  const deduped = new Map();
  for (const row of result.rows) {
    const email = lower(row.email);
    if (!EMAIL_PATTERN.test(email)) continue;
    const existing = deduped.get(email);
    if (existing && recipientPriority[existing.role] <= recipientPriority[row.recipient_role]) continue;
    deduped.set(email, {
      userId: row.user_id ? Number(row.user_id) : null,
      email,
      name: row.display_name || row.username || email,
      role: row.recipient_role,
    });
  }
  return [...deduped.values()];
};

const emptyQuestionMetric = (question, index) => {
  const options = toJsonArray(question.options_json);
  const optionCounts = Object.fromEntries(options.map((option) => [optionKey(option), 0]).filter(([key]) => key));
  const rawCn = (question.question_text_cn || question.questionTextCn || "").trim();
  const rawVi = (question.question_text || question.questionText || "").trim();
  const rawEn = (question.question_text_en || question.questionTextEn || "").trim();
  const hasChineseInVi = /[\u4e00-\u9fff]/.test(rawVi);
  const textCn = rawCn || (hasChineseInVi ? rawVi : "");
  const textVi = (!hasChineseInVi ? rawVi : "") || (rawVi !== textCn ? rawVi : "");

  return {
    questionId: question.id,
    position: index + 1,
    text: textCn || rawVi || rawCn || "",
    textCn: textCn || null,
    textVi: textVi || null,
    textEn: rawEn || null,
    options,
    type: lower(question.question_type || question.questionType || "single_choice"),
    points: numberOrZero(question.points),
    submitted: 0,
    answered: 0,
    blank: 0,
    correct: 0,
    incorrect: 0,
    correctRate: null,
    averageEarnedPoints: 0,
    graded: 0,
    pending: 0,
    optionCounts,
    distractorCounts: {},
    earnedPointsTotal: 0,
  };
};

const finalizeQuestionMetric = (metric, correctAnswer) => {
  const correctKeys = new Set(answerKeys(correctAnswer));
  const distractorCounts = {};
  for (const [key, count] of Object.entries(metric.optionCounts)) {
    if (!correctKeys.has(key)) distractorCounts[key] = count;
  }
  const denominator = metric.correct + metric.incorrect;
  return {
    ...metric,
    correctRate: denominator > 0 ? round((metric.correct / denominator) * 100) : null,
    averageEarnedPoints: metric.submitted > 0 ? round(metric.earnedPointsTotal / metric.submitted) : 0,
    distractorCounts,
    earnedPointsTotal: undefined,
  };
};

export const buildQuizReportSnapshot = async ({
  db = pool,
  quizId,
  closeAt = null,
  reportKind = "close",
  generatedAt = new Date(),
  includeInternal = false,
  videoCourseProfileId = null,
}) => {
  const quizResult = await db.query(
    `SELECT q.*, lc.title AS class_title, lc.instructor_id AS class_instructor_id,
            cs.title AS session_title, cs.end_time AS session_end_time,
            COALESCE(q.available_until,
              CASE WHEN q.activity_scope = 'homework' THEN q.due_date END,
              cs.end_time) AS base_close_at,
            GREATEST(
              COALESCE(q.available_until,
                CASE WHEN q.activity_scope = 'homework' THEN q.due_date END,
                cs.end_time),
              accommodation.max_due_at
            ) AS effective_close_at
     FROM quizzes q
     LEFT JOIN live_classes lc ON lc.id = q.live_class_id
     LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
     LEFT JOIN LATERAL (
       SELECT MAX(ac.due_at) AS max_due_at
       FROM assessment_accommodations ac
       WHERE ac.assessment_type = 'quiz'
         AND ac.assessment_id = q.id
         AND ac.status = 'active'
         AND ac.due_at IS NOT NULL
     ) accommodation ON TRUE
     WHERE q.id = $1`,
    [quizId],
  );
  const quiz = quizResult.rows[0];
  if (!quiz) throw new Error(`Quiz ${quizId} not found`);

  const recordProfile = videoCourseProfileId ? (await db.query(
    `SELECT vcp.id, vcp.course_id, vcp.mode, vcp.source_live_class_id, vcp.management_class_id,
            COALESCE(alias.title, c.title, c.name) AS record_class_title
     FROM video_course_profiles vcp
     JOIN courses c ON c.id = vcp.course_id
     LEFT JOIN management_class_learning_aliases alias
       ON LOWER(alias.alias_class_source_id) = LOWER(vcp.management_class_id)
      AND alias.status = 'active'
     WHERE vcp.id = $1 AND vcp.status = 'active'
       AND vcp.course_id = COALESCE($2::bigint, vcp.course_id)
       AND (vcp.mode <> 'MIRROR' OR vcp.source_live_class_id = $3)`,
    [videoCourseProfileId, quiz.course_id, quiz.live_class_id],
  )).rows[0] : null;
  if (videoCourseProfileId && !recordProfile) {
    throw new Error(`Video course profile ${videoCourseProfileId} does not match quiz ${quizId}`);
  }

  const resolvedCloseAt = asDate(closeAt || quiz.effective_close_at || quiz.base_close_at || generatedAt, asDate(generatedAt, new Date()));
  const authoredQuestions = await loadQuestions(db, quizId);
  const rosterResult = recordProfile
    ? await db.query(
      `SELECT u.id AS user_id, u.email, u.username, ce.learning_mode,
              COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.username, ''), u.email) AS display_name
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN management_class_learning_aliases alias
         ON alias.id = ce.management_class_alias_id AND alias.status = 'active'
       WHERE ce.status = 'active' AND ce.learning_mode = 'recording'
         AND (
           ($2::text IS NOT NULL AND LOWER(alias.alias_class_source_id) = LOWER($2))
           OR ($2::text IS NULL AND $3 = 'MIRROR' AND ce.live_class_id = $4)
           OR ($2::text IS NULL AND $3 = 'INDEPENDENT' AND ce.course_id = $5)
         )
         AND ($1::boolean OR (
           COALESCE(ce.is_internal_test, FALSE) = FALSE
           AND COALESCE(u.is_internal_test_account, FALSE) = FALSE
         ))
       ORDER BY u.id`,
      [Boolean(includeInternal), recordProfile.management_class_id, recordProfile.mode,
        recordProfile.source_live_class_id, recordProfile.course_id],
    )
    : quiz.live_class_id
    ? await db.query(
      `SELECT u.id AS user_id, u.email, u.username, ce.learning_mode,
              COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.username, ''), u.email) AS display_name
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE ce.live_class_id = $1
         AND COALESCE(ce.learning_mode, 'live') <> 'recording'
         AND ce.enrolled_at <= $2
         AND (ce.status = 'active' OR ce.ended_at > $2)
         AND (ce.ended_at IS NULL OR ce.ended_at > $2)
         AND ($3::boolean OR (
           COALESCE(ce.is_internal_test, FALSE) = FALSE
           AND COALESCE(u.is_internal_test_account, FALSE) = FALSE
         ))
       ORDER BY u.id`,
      [quiz.live_class_id, resolvedCloseAt, Boolean(includeInternal)],
    )
    : { rows: [] };
  const roster = rosterResult.rows;
  const userIds = roster.map((row) => row.user_id);
  const attemptsResult = userIds.length > 0
    ? await db.query(
      `SELECT * FROM quiz_attempts
       WHERE quiz_id = $1 AND user_id = ANY($2::bigint[])
         AND video_course_profile_id IS NOT DISTINCT FROM $3::bigint
       ORDER BY user_id, attempt_number, id`,
      [quizId, userIds, recordProfile?.id || null],
    )
    : { rows: [] };

  const attemptsByUser = new Map();
  for (const attempt of attemptsResult.rows) {
    const key = String(attempt.user_id);
    if (!attemptsByUser.has(key)) attemptsByUser.set(key, []);
    attemptsByUser.get(key).push(attempt);
  }

  const attemptPolicy = ["best", "latest", "first"].includes(quiz.attempt_score_policy)
    ? quiz.attempt_score_policy
    : "best";
  const metrics = authoredQuestions.map(emptyQuestionMetric);
  const metricById = new Map(metrics.map((metric) => [String(metric.questionId), metric]));
  const correctById = new Map();
  const students = [];
  const gradedPercentages = [];
  const durations = [];
  let autoSubmitted = 0;

  for (const learner of roster) {
    const selected = chooseAttempt(attemptsByUser.get(String(learner.user_id)) || [], attemptPolicy);
    const base = {
      userId: Number(learner.user_id),
      name: learner.display_name || learner.username || learner.email || `#${learner.user_id}`,
      email: learner.email || null,
      learningMode: learner.learning_mode || "live",
    };
    if (!selected) {
      students.push({ ...base, status: "not_started", attemptId: null, pendingEssay: false });
      continue;
    }
    if (selected.status !== "submitted") {
      students.push({
        ...base,
        status: "in_progress",
        attemptId: Number(selected.id),
        attemptNumber: Number(selected.attempt_number || 1),
        startedAt: asIso(selected.started_at),
        pendingEssay: false,
      });
      continue;
    }

    const questions = questionsForAttempt(selected, authoredQuestions);
    const computed = buildQuizResult(questions, selected.answers_json || {});
    const hasEssay = computed.review.some((item) => isManual(item.questionType) && !isBlankAnswer(item.studentAnswer));
    const pendingEssay = computed.review.some((item) => isManual(item.questionType)
      && !isBlankAnswer(item.studentAnswer) && !item.isGraded);
    const fullyGraded = !pendingEssay;
    const durationSeconds = selected.started_at && selected.submitted_at
      ? Math.max(0, Math.round((new Date(selected.submitted_at) - new Date(selected.started_at)) / 1000))
      : null;
    if (durationSeconds !== null) durations.push(durationSeconds);
    if (selected.auto_submitted) autoSubmitted += 1;
    if (fullyGraded) gradedPercentages.push(computed.percentage);

    students.push({
      ...base,
      status: pendingEssay ? "pending_grading" : "graded",
      attemptId: Number(selected.id),
      attemptNumber: Number(selected.attempt_number || 1),
      score: computed.score,
      maxScore: computed.maxScore,
      percentage: computed.percentage,
      passed: fullyGraded ? computed.percentage >= numberOrZero(quiz.passing_score) : null,
      autoSubmitted: Boolean(selected.auto_submitted),
      durationSeconds,
      hasEssay,
      essayGrade: computed.essayGrade || null,
      pendingEssay,
      fullyGraded,
      startedAt: asIso(selected.started_at),
      submittedAt: asIso(selected.submitted_at),
    });

    for (const review of computed.review) {
      let metric = metricById.get(String(review.questionId));
      if (!metric) {
        metric = emptyQuestionMetric({
          id: review.questionId,
          question_text: review.questionText,
          question_text_cn: review.questionTextCn,
          question_text_en: review.questionTextEn,
          question_type: review.questionType,
          points: review.points,
          options_json: review.options,
        }, metrics.length);
        metrics.push(metric);
        metricById.set(String(review.questionId), metric);
      }
      metric.submitted += 1;
      metric.earnedPointsTotal += numberOrZero(review.earnedPoints);
      correctById.set(String(review.questionId), review.correctAnswer);
      if (isBlankAnswer(review.studentAnswer)) metric.blank += 1;
      else metric.answered += 1;
      if (isManual(review.questionType)) {
        if (!isBlankAnswer(review.studentAnswer) && review.isGraded) metric.graded += 1;
        else if (!isBlankAnswer(review.studentAnswer)) metric.pending += 1;
      } else if (!isBlankAnswer(review.studentAnswer)) {
        if (review.isCorrect) metric.correct += 1;
        else metric.incorrect += 1;
      }
      for (const key of answerKeys(review.studentAnswer)) {
        metric.optionCounts[key] = numberOrZero(metric.optionCounts[key]) + 1;
      }
    }
  }

  const submitted = students.filter((student) => ["graded", "pending_grading"].includes(student.status)).length;
  const pendingEssay = students.filter((student) => student.pendingEssay).length;
  const passed = students.filter((student) => student.passed === true).length;
  const failed = students.filter((student) => student.passed === false).length;
  const distribution = { "0-49": 0, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0 };
  for (const score of gradedPercentages) {
    if (score < 50) distribution["0-49"] += 1;
    else if (score < 60) distribution["50-59"] += 1;
    else if (score < 70) distribution["60-69"] += 1;
    else if (score < 80) distribution["70-79"] += 1;
    else if (score < 90) distribution["80-89"] += 1;
    else distribution["90-100"] += 1;
  }

  const summary = {
    rosterTotal: roster.length,
    submitted,
    notStarted: students.filter((student) => student.status === "not_started").length,
    inProgress: students.filter((student) => student.status === "in_progress").length,
    fullyGraded: students.filter((student) => student.status === "graded").length,
    pendingEssay,
    passed,
    failed,
    averageScore: gradedPercentages.length > 0 ? round(gradedPercentages.reduce((sum, value) => sum + value, 0) / gradedPercentages.length) : null,
    minScore: gradedPercentages.length > 0 ? Math.min(...gradedPercentages) : null,
    maxScore: gradedPercentages.length > 0 ? Math.max(...gradedPercentages) : null,
    autoSubmitted,
    averageDurationSeconds: durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    distribution,
  };

  return {
    version: REPORT_VERSION,
    report: {
      kind: reportKind,
      generatedAt: asIso(generatedAt),
      closeAt: recordProfile ? null : asIso(resolvedCloseAt),
      provisional: pendingEssay > 0,
      attemptPolicy,
      attemptScorePolicy: attemptPolicy,
      rosterMode: recordProfile ? "record" : "live",
      videoCourseProfileId: recordProfile ? Number(recordProfile.id) : null,
    },
    quiz: {
      id: Number(quiz.id),
      title: quiz.title,
      classId: quiz.live_class_id ? Number(quiz.live_class_id) : null,
      classTitle: recordProfile?.record_class_title || quiz.class_title || null,
      sessionId: quiz.class_session_id ? Number(quiz.class_session_id) : null,
      sessionTitle: quiz.session_title || null,
      instructorId: quiz.instructor_id ? Number(quiz.instructor_id) : null,
      passingScore: numberOrZero(quiz.passing_score),
      durationMinutes: numberOrZero(quiz.duration_minutes),
    },
    summary,
    students,
    questions: metrics.map((metric) => finalizeQuestionMetric(metric, correctById.get(String(metric.questionId)))),
    recipients: await loadRecipients(db, quiz),
  };
};

const reportKey = (quizId, kind, closeAt) => `quiz:${quizId}:${kind}:${asIso(closeAt)}`;

const discoverClosedQuizzes = async (db, now, limit) => {
  const result = await db.query(
    `WITH candidates AS (
       SELECT q.id AS quiz_id,
              GREATEST(
                COALESCE(q.available_until,
                  CASE WHEN q.activity_scope = 'homework' THEN q.due_date END,
                  cs.end_time),
                accommodation.max_due_at
              ) AS close_at
       FROM quizzes q
       LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
       LEFT JOIN LATERAL (
         SELECT MAX(ac.due_at) AS max_due_at
         FROM assessment_accommodations ac
         WHERE ac.assessment_type = 'quiz'
           AND ac.assessment_id = q.id
           AND ac.status = 'active'
           AND ac.due_at IS NOT NULL
       ) accommodation ON TRUE
       WHERE q.status = 'PUBLISHED'
     )
     SELECT quiz_id, close_at
     FROM candidates
     WHERE close_at IS NOT NULL AND close_at <= $1
     ORDER BY close_at, quiz_id
     LIMIT $2`,
    [asDate(now, new Date()), Math.max(1, Number(limit) || DEFAULT_BATCH_SIZE)],
  );
  return result.rows;
};

const insertCloseReports = async (db, candidates, now) => {
  let created = 0;
  for (const candidate of candidates) {
    const inserted = await db.query(
      `INSERT INTO quiz_close_reports
         (quiz_id, report_kind, close_at, report_key, status, next_attempt_at)
       VALUES ($1, 'close', $2, $3, 'pending', $4)
       ON CONFLICT (report_key) DO NOTHING
       RETURNING id`,
      [candidate.quiz_id, candidate.close_at, reportKey(candidate.quiz_id, "close", candidate.close_at), asDate(now, new Date())],
    );
    created += inserted.rowCount || inserted.rows.length;
  }
  return created;
};

const discoverFinalReports = async (db, now, limit) => {
  const provisional = await db.query(
    `SELECT r.id, r.quiz_id, r.close_at
     FROM quiz_close_reports r
     WHERE r.report_kind = 'close'
       AND r.status = 'delivered'
       AND COALESCE((r.snapshot->'report'->>'provisional')::boolean, FALSE) = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM quiz_close_reports final
         WHERE final.quiz_id = r.quiz_id
           AND final.report_kind = 'final'
           AND final.close_at = r.close_at
       )
     ORDER BY r.delivered_at, r.id
     LIMIT $1`,
    [Math.max(1, Number(limit) || DEFAULT_BATCH_SIZE)],
  );
  let created = 0;
  for (const report of provisional.rows) {
    const snapshot = await buildQuizReportSnapshot({
      db,
      quizId: report.quiz_id,
      closeAt: report.close_at,
      reportKind: "final",
      generatedAt: now,
    });
    if (snapshot.summary.pendingEssay > 0) continue;
    const inserted = await db.query(
      `INSERT INTO quiz_close_reports
         (quiz_id, report_kind, close_at, report_key, status, snapshot, next_attempt_at)
       VALUES ($1, 'final', $2, $3, 'pending', $4::jsonb, $5)
       ON CONFLICT (report_key) DO NOTHING
       RETURNING id`,
      [report.quiz_id, report.close_at, reportKey(report.quiz_id, "final", report.close_at), JSON.stringify(snapshot), asDate(now, new Date())],
    );
    created += inserted.rowCount || inserted.rows.length;
  }
  return created;
};

const claimReports = (db, now, limit) => transaction(db, async (client) => {
  const claimed = await client.query(
    `SELECT *
     FROM quiz_close_reports
     WHERE status IN ('pending', 'failed', 'processing', 'delivering')
       AND next_attempt_at <= $1
       AND (claimed_at IS NULL OR claimed_at < $1::timestamptz - INTERVAL '15 minutes')
     ORDER BY next_attempt_at, id
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [asDate(now, new Date()), Math.max(1, Number(limit) || DEFAULT_BATCH_SIZE)],
  );
  if (claimed.rows.length === 0) return [];
  const ids = claimed.rows.map((row) => row.id);
  await client.query(
    `UPDATE quiz_close_reports
     SET status = 'processing', claimed_at = $2, updated_at = NOW()
     WHERE id = ANY($1::bigint[])`,
    [ids, asDate(now, new Date())],
  );
  return claimed.rows;
});

const ensureReportSnapshotAndDeliveries = async (db, report, now) => {
  const snapshot = report.snapshot || await buildQuizReportSnapshot({
    db,
    quizId: report.quiz_id,
    closeAt: report.close_at,
    reportKind: report.report_kind,
    generatedAt: now,
  });
  await transaction(db, async (client) => {
    await client.query(
      `UPDATE quiz_close_reports
       SET snapshot = COALESCE(snapshot, $2::jsonb), status = 'delivering', updated_at = NOW()
       WHERE id = $1`,
      [report.id, JSON.stringify(snapshot)],
    );
    for (const recipient of snapshot.recipients || []) {
      await client.query(
        `INSERT INTO quiz_close_report_deliveries
           (report_id, user_id, recipient_email, recipient_name, recipient_role, status, next_attempt_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT DO NOTHING`,
        [report.id, recipient.userId, lower(recipient.email), recipient.name, recipient.role, asDate(now, new Date())],
      );
    }
  });
  return snapshot;
};

const claimDelivery = (db, reportId, now) => transaction(db, async (client) => {
  const result = await client.query(
    `SELECT *
     FROM quiz_close_report_deliveries
     WHERE report_id = $1
       AND status IN ('pending', 'failed', 'processing')
       AND next_attempt_at <= $2
       AND (claimed_at IS NULL OR claimed_at < $2::timestamptz - INTERVAL '15 minutes')
     ORDER BY id
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    [reportId, asDate(now, new Date())],
  );
  const delivery = result.rows[0];
  if (!delivery) return null;
  await client.query(
    `UPDATE quiz_close_report_deliveries
     SET status = 'processing', claimed_at = $2, attempts = attempts + 1, updated_at = NOW()
     WHERE id = $1`,
    [delivery.id, asDate(now, new Date())],
  );
  return { ...delivery, attempts: numberOrZero(delivery.attempts) + 1 };
});

const resolveDefaultSender = async () => {
  const module = await import("./brevoEmail.service.js");
  return module.sendQuizClosedReportEmail;
};

const deliverReport = async ({ db, report, snapshot, emailSender, now }) => {
  let sent = 0;
  let failed = 0;
  while (true) {
    const delivery = await claimDelivery(db, report.id, now);
    if (!delivery) break;
    try {
      const result = await emailSender({
        email: delivery.recipient_email,
        username: delivery.recipient_name,
        recipientRole: delivery.recipient_role,
        report: snapshot,
        reportKind: report.report_kind,
        quizId: Number(report.quiz_id),
        reportKey: report.report_key,
      });
      if (result?.success !== true) throw new Error(result?.error || "Email provider did not confirm delivery");
      await db.query(
        `UPDATE quiz_close_report_deliveries
         SET status = 'sent', sent_at = $2, provider_message_id = $3,
             last_error = NULL, claimed_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [delivery.id, asDate(now, new Date()), result.messageId || null],
      );
      sent += 1;
    } catch (error) {
      await db.query(
        `UPDATE quiz_close_report_deliveries
         SET status = 'failed', next_attempt_at = $2, last_error = $3,
             claimed_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [delivery.id, retryAt(delivery.attempts, now), String(error?.message || error).slice(0, 2000)],
      );
      failed += 1;
    }
  }

  const remaining = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status <> 'sent')::int AS remaining,
            MIN(next_attempt_at) FILTER (WHERE status <> 'sent') AS next_attempt_at
     FROM quiz_close_report_deliveries
     WHERE report_id = $1`,
    [report.id],
  );
  const pending = numberOrZero(remaining.rows[0]?.remaining);
  if (pending === 0) {
    await db.query(
      `UPDATE quiz_close_reports
       SET status = 'delivered', delivered_at = $2, claimed_at = NULL,
           last_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [report.id, asDate(now, new Date())],
    );
  } else {
    await db.query(
      `UPDATE quiz_close_reports
       SET status = 'failed', retry_count = retry_count + 1,
           next_attempt_at = COALESCE($2, $3), claimed_at = NULL,
           last_error = 'One or more recipient deliveries failed', updated_at = NOW()
       WHERE id = $1`,
      [report.id, remaining.rows[0]?.next_attempt_at, retryAt(numberOrZero(report.retry_count) + 1, now)],
    );
  }
  return { sent, failed, delivered: pending === 0 };
};

export const processQuizCloseReports = async ({
  db = pool,
  emailSender = null,
  limit = DEFAULT_BATCH_SIZE,
  now = new Date(),
} = {}) => {
  const result = {
    scanned: 0,
    created: 0,
    delivered: 0,
    failed: 0,
    waitingGrading: 0,
    finalCreated: 0,
  };
  await processExpiredQuizAttempts({ db, limit: Math.max(100, limit * 10), now });
  const candidates = await discoverClosedQuizzes(db, now, limit * 5);
  result.scanned = candidates.length;
  result.created = await insertCloseReports(db, candidates, now);
  result.finalCreated = await discoverFinalReports(db, now, limit);

  const sender = emailSender || await resolveDefaultSender();
  if (typeof sender !== "function") throw new Error("sendQuizClosedReportEmail is not configured");
  const reports = await claimReports(db, now, limit);
  for (const report of reports) {
    try {
      const snapshot = await ensureReportSnapshotAndDeliveries(db, report, now);
      if (snapshot.report?.provisional) result.waitingGrading += 1;
      const delivered = await deliverReport({ db, report, snapshot, emailSender: sender, now });
      result.delivered += delivered.delivered ? 1 : 0;
      result.failed += delivered.failed;
    } catch (error) {
      result.failed += 1;
      await db.query(
        `UPDATE quiz_close_reports
         SET status = 'failed', retry_count = retry_count + 1,
             next_attempt_at = $2, claimed_at = NULL, last_error = $3, updated_at = NOW()
         WHERE id = $1`,
        [report.id, retryAt(numberOrZero(report.retry_count) + 1, now), String(error?.message || error).slice(0, 2000)],
      );
    }
  }
  return result;
};

export default {
  buildQuizReportSnapshot,
  processExpiredQuizAttempts,
  processQuizCloseReports,
};
