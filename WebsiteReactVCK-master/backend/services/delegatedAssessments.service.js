import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import {
  getAttemptExpiry,
  reviewIsAvailable,
} from "./assessmentPolicy.service.js";
import {
  allocateNextSyncRevision,
  buildV2EventEnvelope,
  insertOutboxEnvelopeIfReady,
} from "./courseCatalogSync.service.js";
import {
  applySequentialLocks,
  assertUnitNotCrossProfile,
  canBypassSequentialProgress,
  emitProgressOutboxEventsForProfile,
  isDelegatedAdminRole,
  loadProfileUnitsWithProgress,
  parsePositiveId,
  resolveProfileAndCourse,
  runDelegatedTx,
  toIso,
  verifyAndResolveDelegatedSession,
} from "./delegatedLearning.service.js";
import { hasLiveReviewMembership } from "./videoCourseUnitAccess.service.js";
import { ExternalIntegrationError } from "./externalCourseMapping.service.js";
import {
  isDelegatedLearningKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
} from "./integrationLogger.service.js";
import { canResubmit } from "./lmsWorkflowPolicy.service.js";
import {
  buildQuizResult,
  makeQuestionSnapshot,
  normalizeQuizAnswers,
  parseQuizDescriptionMetadata,
  publicQuizItems,
} from "./quizAttempt.service.js";
import {
  ALLOWED_SUBMISSION_AUDIO_MIME_TYPES,
  ALLOWED_SUBMISSION_FILE_MIME_TYPES,
  MAX_SUBMISSION_AUDIO_SIZE_BYTES,
  MAX_SUBMISSION_FILE_SIZE_BYTES,
  generateSubmissionUploadPresignedUrl,
} from "./video.service.js";

const defaultDb = { query, getClient };

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const resolveEffectiveAttemptExpiry = (configuredExpiry, attemptExpiresAt, accommodation = null) => {
  const dbExpiry = attemptExpiresAt ? new Date(attemptExpiresAt) : null;
  if (!dbExpiry || Number.isNaN(dbExpiry.getTime())) return configuredExpiry || null;
  if (!configuredExpiry) return dbExpiry;
  if (Number(accommodation?.extra_time_minutes || 0) > 0 || accommodation?.due_at) {
    return configuredExpiry;
  }
  return dbExpiry.getTime() < configuredExpiry.getTime() ? dbExpiry : configuredExpiry;
};

async function hasIntegrationOutbox(db) {
  const res = await db.query(
    `SELECT to_regclass('course_integration_outbox') IS NOT NULL AS has_outbox`,
  );
  return Boolean(res.rows[0]?.has_outbox);
}

async function resolveMolyExternalUserIds(db, userId, preferredExternalUserId = null) {
  const res = await db.query(
    `SELECT external_user_id
     FROM external_identities
     WHERE user_id = $1 AND source_system = 'moly' AND status = 'active'
     ORDER BY id ASC`,
    [userId],
  );
  const set = new Set(res.rows.map((r) => String(r.external_user_id || "").trim()).filter(Boolean));
  if (preferredExternalUserId && String(preferredExternalUserId).trim()) {
    set.add(String(preferredExternalUserId).trim());
  }
  return Array.from(set);
}

async function loadQuizRow(db, quizId) {
  const res = await db.query(
    `SELECT q.*, pf.status AS paper_status, sf.status AS solution_status
     FROM quizzes q
     LEFT JOIN lms_learning_files pf ON pf.id = q.paper_file_id AND pf.deleted_at IS NULL
     LEFT JOIN lms_learning_files sf ON sf.id = q.solution_file_id AND sf.deleted_at IS NULL
     WHERE q.id = $1 AND q.status = 'PUBLISHED'
     LIMIT 1`,
    [quizId],
  );
  return res.rows[0] || null;
}

async function loadQuizQuestions(db, quizId) {
  const res = await db.query(
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
  );
  return res.rows;
}

async function loadQuizAccommodation(db, quizId, userId) {
  const res = await db.query(
    `SELECT due_at, extra_time_minutes, attempt_limit_override
     FROM assessment_accommodations
     WHERE assessment_type = 'quiz' AND assessment_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [quizId, userId],
  );
  return res.rows[0] || null;
}

function buildEffectiveDelegatedQuiz(quiz, accommodation) {
  const extraMinutes = Number(accommodation?.extra_time_minutes || 0);
  const baseDuration = Number(quiz.duration_minutes || 0);
  const effectiveDuration = baseDuration > 0 ? baseDuration + extraMinutes : extraMinutes;
  const rawLimit = accommodation?.attempt_limit_override ?? quiz.attempt_limit;
  const maxAttempts = rawLimit !== null && rawLimit !== undefined ? Number(rawLimit) : null;
  const closesAt = accommodation?.due_at || quiz.available_until || null;

  return {
    ...quiz,
    duration_minutes: effectiveDuration,
    available_until: closesAt,
    due_date: accommodation?.due_at || quiz.due_date || null,
    attempt_limit: maxAttempts,
    accommodation: accommodation || null,
  };
}

function resolveQuizUnitMatch(units, quiz, explicitUnitId = null) {
  const matchingUnit = units.find((u) => (
    u.unitType === "class_session"
      ? quiz.class_session_id && String(u.id) === String(quiz.class_session_id)
      : quiz.lesson_id && String(u.id) === String(quiz.lesson_id)
  )) || null;

  if (!matchingUnit) {
    throw new ExternalIntegrationError(
      409,
      "PROFILE_SCOPE_MISMATCH",
      `Quiz ${quiz.id} does not belong to the requested course profile.`,
    );
  }
  if (explicitUnitId != null && String(explicitUnitId).trim() !== "") {
    const requested = units.find((u) => String(u.id) === String(explicitUnitId).trim()) || null;
    if (!requested) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        `Unit ${explicitUnitId} does not belong to this course profile.`,
      );
    }
    if (String(requested.id) !== String(matchingUnit.id)) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        `Quiz ${quiz.id} does not belong to unit ${explicitUnitId}.`,
      );
    }
  }
  if (matchingUnit.isLocked) {
    throw new ExternalIntegrationError(
      403,
      "UNIT_LOCKED",
      matchingUnit.lockReason || "Unit is locked by sequential progression.",
      { unitId: matchingUnit.id, requiredPrevUnitId: matchingUnit.requiredPrevUnitId },
    );
  }
  return matchingUnit;
}

function computeQuizCanViewSolution(quiz, attempts = [], currentNow = new Date()) {
  const policy = quiz.review_policy || "after_submit";
  if (policy === "never") return false;
  if (!reviewIsAvailable(quiz, currentNow)) return false;
  const hasSubmitted = attempts.some(
    (a) => a.status !== "in_progress" && (a.submitted_at != null || ["submitted", "graded", "completed", "SUBMITTED", "GRADED", "COMPLETED"].includes(a.status)),
  );
  if (policy === "after_submit") return hasSubmitted;
  return hasSubmitted || reviewIsAvailable(quiz, currentNow);
}

function attemptEffectiveQuestions(attempt, fallbackQuestions) {
  const snapshot = parseJsonArray(attempt?.question_snapshot);
  if (snapshot.length === 0) return fallbackQuestions;
  const fallbackById = new Map((fallbackQuestions || []).map((q) => [String(q.id), q]));
  return snapshot.map((q) => {
    const fb = fallbackById.get(String(q.id));
    if (!fb) return q;
    const snapOpts = parseJsonArray(q.options_json);
    const snapLinked = parseJsonArray(q.linked_options);
    return {
      ...fb,
      ...q,
      options_json: snapOpts.length > 0 ? snapOpts : fb.options_json,
      linked_options: snapLinked.length > 0 ? snapLinked : fb.linked_options,
      question_text_cn: q.question_text_cn || fb.question_text_cn || null,
      question_text_en: q.question_text_en || fb.question_text_en || null,
      explanation_cn: q.explanation_cn || fb.explanation_cn || null,
      explanation_en: q.explanation_en || fb.explanation_en || null,
      passage_text: q.passage_text ?? fb.passage_text ?? null,
      passage_text_cn: q.passage_text_cn || fb.passage_text_cn || null,
      passage_text_en: q.passage_text_en || fb.passage_text_en || null,
      passage_image_url: q.passage_image_url ?? fb.passage_image_url ?? null,
      group_type: q.group_type ?? fb.group_type ?? null,
      cloze_mode: q.cloze_mode ?? fb.cloze_mode ?? null,
    };
  });
}

function serializeDelegatedAttempt(attempt) {
  if (!attempt) return null;
  return {
    id: String(attempt.id),
    quizId: String(attempt.quiz_id),
    attemptNumber: Number(attempt.attempt_number || 1),
    status: attempt.status,
    startedAt: toIso(attempt.started_at),
    expiresAt: toIso(attempt.expires_at),
    submittedAt: toIso(attempt.submitted_at),
    autoSubmitted: Boolean(attempt.auto_submitted),
    score: attempt.score != null ? Number(attempt.score) : null,
    maxScore: attempt.max_score != null ? Number(attempt.max_score) : null,
    revision: Number(attempt.sync_revision || 1),
    answers: isPlainObject(attempt.answers_json) ? attempt.answers_json : {},
  };
}

function formatQuizSubmitUnitsSummary(units = [], targetUnit = null, computed = null, quiz = null) {
  const safeUnits = Array.isArray(units) ? units : [];
  const completedUnits = safeUnits.filter((u) => u.isCompleted).length;
  const resolvedTarget = targetUnit || null;
  const targetPct = resolvedTarget ? Number(resolvedTarget.progressPercent || 0) : null;
  const isQuizCompleted = Boolean(
    resolvedTarget?.isQuizCompleted
    ?? (computed && quiz ? Number(computed.percentage || 0) >= Number(quiz.passing_score || 60) : false),
  );
  const isVideoCompleted = Boolean(resolvedTarget?.isVideoCompleted ?? false);
  const isUnitCompleted = Boolean(resolvedTarget?.isCompleted ?? false);
  return {
    unitId: resolvedTarget ? String(resolvedTarget.id) : null,
    isQuizCompleted,
    isVideoCompleted,
    isUnitCompleted,
    unitProgress: resolvedTarget
      ? {
          completionPercent: targetPct,
          isCompleted: isUnitCompleted,
          isVideoCompleted,
          isQuizCompleted,
        }
      : null,
    courseProgress: {
      completedUnits,
      totalUnits: safeUnits.length,
      overallPercent: safeUnits.length > 0 ? Math.round((completedUnits / safeUnits.length) * 100) : 0,
    },
    units: safeUnits.map((u) => ({
      id: String(u.id),
      unitType: u.unitType,
      sessionNumber: u.sessionNumber,
      isLocked: Boolean(u.isLocked),
      isCompleted: Boolean(u.isCompleted),
      progressPercent: Number(u.progressPercent || 0),
    })),
  };
}

function buildSanitizedQuizResult({ quiz, attempt, computed, canViewSolution, alreadySubmitted = false, unitProgressMeta = null }) {
  const maxScore = Number(computed.maxScore || attempt.max_score || 0);
  const passingScore = Number(quiz.passing_score || 60);
  const percentage = Number(computed.percentage || 0);
  return {
    quizId: String(quiz.id),
    attemptId: String(attempt.id),
    attemptNumber: Number(attempt.attempt_number || 1),
    attemptCount: Number(attempt.attempt_number || 1),
    maxAttempts: quiz.attempt_limit != null ? Number(quiz.attempt_limit) : null,
    status: attempt.status,
    score: Number(computed.score || 0),
    maxScore,
    percentage,
    passingScore,
    passed: percentage >= passingScore,
    reviewPolicy: quiz.review_policy || "after_submit",
    canViewSolution: Boolean(canViewSolution),
    reviewAvailable: Boolean(canViewSolution),
    review: canViewSolution ? computed.review : [],
    essay: computed.essay || null,
    essayGrade: computed.essayGrade || null,
    solutionFileId: canViewSolution && quiz.solution_file_id && quiz.solution_status === "ready"
      ? String(quiz.solution_file_id)
      : null,
    hasSolution: Boolean(quiz.solution_file_id),
    alreadySubmitted: Boolean(alreadySubmitted),
    autoSubmitted: Boolean(attempt.auto_submitted),
    submittedAt: toIso(attempt.submitted_at),
    revision: Number(attempt.sync_revision || 1),
    ...(unitProgressMeta || {}),
  };
}

async function emitAttemptUpdatedOutbox(db, {
  userId,
  externalUserIds,
  profileRow,
  unit,
  itemType,
  itemId,
  attemptOrSubId,
  status,
  score = null,
  maxScore = null,
  passed = null,
  attemptCount = null,
  maxAttempts = null,
  autoSubmitted = false,
  canViewSolution = false,
  submittedAt = null,
  revision,
  submissionRevision = null,
  submitIdempotencyKey = null,
  correlationId = null,
  occurredAt,
}) {
  if (!(await hasIntegrationOutbox(db))) return null;
  if (!externalUserIds.length) return null;

  const aggType = itemType === "quiz" ? "quiz_attempt" : "assignment_submission";
  const envelope = buildV2EventEnvelope({
    eventType: "assessment.attempt.updated",
    aggregateType: aggType,
    aggregateId: String(attemptOrSubId),
    revision,
    sourceUpdatedAt: occurredAt,
    occurredAt,
    deleted: false,
    deletedAt: null,
    correlationId,
    payload: {
      userId: String(userId),
      externalUserId: externalUserIds[0],
      externalUserIds,
      courseId: String(profileRow.course_id),
      profileId: String(profileRow.profile_id),
      unitId: unit ? String(unit.id) : null,
      unitType: unit ? unit.unitType : null,
      itemType,
      itemId: String(itemId),
      attemptOrSubId: String(attemptOrSubId),
      attemptId: itemType === "quiz" ? String(attemptOrSubId) : null,
      submissionId: itemType === "assignment" ? String(attemptOrSubId) : null,
      status,
      score,
      maxScore,
      passed,
      ...(attemptCount != null ? { attemptCount: Number(attemptCount) } : {}),
      ...(maxAttempts != null ? { maxAttempts: Number(maxAttempts) } : {}),
      autoSubmitted: Boolean(autoSubmitted),
      canViewSolution: Boolean(canViewSolution),
      submittedAt,
      revision: Number(revision),
      ...(submissionRevision != null ? { submissionRevision: Number(submissionRevision) } : {}),
      ...(submitIdempotencyKey ? { submitIdempotencyKey } : {}),
    },
  });
  await insertOutboxEnvelopeIfReady(db, envelope);
  return envelope;
}

async function finalizeQuizAttemptInTx(tx, {
  attempt,
  quiz,
  questions,
  autoSubmitted = false,
  userId,
  externalUserIds,
  profileRow,
  targetUnit,
  submitIdempotencyKey = null,
  correlationId = null,
  currentNow = new Date(),
}) {
  const computed = buildQuizResult(questions, attempt.answers_json || {});
  const rev = await allocateNextSyncRevision(tx);
  const occurredAt = currentNow.toISOString();

  const updated = (await tx.query(
    `UPDATE quiz_attempts
     SET score = $1,
         max_score = $2,
         status = 'submitted',
         submitted_at = COALESCE(submitted_at, $3::timestamptz),
         auto_submitted = $4,
         sync_revision = $5,
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [computed.score, computed.maxScore, occurredAt, Boolean(autoSubmitted), rev, attempt.id],
  )).rows[0];

  const hasFreeReview = isDelegatedAdminRole(quiz._viewerRole) || Boolean(quiz._freeReviewAccess);
  const canViewSolution = hasFreeReview || computeQuizCanViewSolution(quiz, [updated], currentNow);
  const passed = computed.percentage >= Number(quiz.passing_score || 60);

  await emitAttemptUpdatedOutbox(tx, {
    userId,
    externalUserIds,
    profileRow,
    unit: targetUnit,
    itemType: "quiz",
    itemId: quiz.id,
    attemptOrSubId: updated.id,
    status: updated.status,
    score: computed.score,
    maxScore: computed.maxScore,
    passed,
    attemptCount: Number(updated.attempt_number || 1),
    maxAttempts: hasFreeReview ? null : (quiz.attempt_limit != null ? Number(quiz.attempt_limit) : null),
    autoSubmitted: Boolean(updated.auto_submitted),
    canViewSolution,
    submittedAt: toIso(updated.submitted_at) || occurredAt,
    revision: rev,
    submitIdempotencyKey,
    correlationId,
    occurredAt,
  });

  const unitsAfter = applySequentialLocks(
    await loadProfileUnitsWithProgress(tx, { profileRow, userId }),
    { bypassSequentialLock: hasFreeReview },
  );
  const targetUnitAfter = unitsAfter.find((u) => String(u.id) === String(targetUnit.id)) || targetUnit;
  await emitProgressOutboxEventsForProfile({
    db: tx,
    userId,
    externalUserIds,
    profileRow,
    unitsAfter,
    targetUnitAfter,
    videoAssetId: null,
    wasCompletedBefore: Boolean(targetUnit.isCompleted),
    syncRevision: rev,
    correlationId,
    occurredAt,
  });

  return {
    attempt: updated,
    computed,
    canViewSolution,
    unitsAfter,
    targetUnitAfter,
    rev,
  };
}

/**
 * Returns sanitized quiz metadata, questions (never answers/explanations if embargoed),
 * attempt history, and attempt policy for a delegated learner.
 */
export async function getDelegatedQuizDetail({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  quizId,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const parsedQuizId = parsePositiveId(quizId);
  if (!parsedQuizId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "quizId must be a positive integer.");
  }

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "quiz:attempt",
    expectedProfileId: profileId,
    now,
    env,
  });

  const isAdminSession = isDelegatedAdminRole(session.user_role);
  const canReviewFreely = !isAdminSession && await hasLiveReviewMembership(db, profileRow, session.user_id);
  const hasFreeReview = isAdminSession || canReviewFreely;
  const units = applySequentialLocks(
    await loadProfileUnitsWithProgress(db, { profileRow, userId: session.user_id }),
    { bypassSequentialLock: hasFreeReview },
  );
  const targetUnit = units.find((u) => String(u.id) === String(unitId).trim()) || null;
  if (!targetUnit) {
    await assertUnitNotCrossProfile(db, { profileRow, unitId });
    throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Unit ${unitId} not found in profile ${profileId}.`);
  }

  const rawQuiz = await loadQuizRow(db, parsedQuizId);
  if (!rawQuiz) {
    throw new ExternalIntegrationError(404, "QUIZ_NOT_FOUND", `Quiz ${parsedQuizId} not found.`);
  }
  resolveQuizUnitMatch(units, rawQuiz, unitId);

  const currentNow = typeof now === "function" ? now() : new Date();
  const [accommodation, questions, attemptsRes] = await Promise.all([
    loadQuizAccommodation(db, parsedQuizId, session.user_id),
    loadQuizQuestions(db, parsedQuizId),
    db.query(
      `SELECT *
       FROM quiz_attempts
       WHERE quiz_id = $1 AND user_id = $2
         AND (video_course_profile_id = $3 OR video_course_profile_id IS NULL)
       ORDER BY attempt_number DESC, id DESC`,
      [parsedQuizId, session.user_id, profileRow.profile_id],
    ),
  ]);

  const quiz = buildEffectiveDelegatedQuiz(rawQuiz, accommodation);
  const attempts = attemptsRes.rows;
  const activeAttempt = attempts.find((a) => a.status === "in_progress") || null;
  const submittedAttempts = attempts.filter((a) => a.status !== "in_progress");
  const canViewSolution = hasFreeReview || computeQuizCanViewSolution(quiz, submittedAttempts, currentNow);
  const latestSubmitted = submittedAttempts[0] || null;
  const effectiveQuestions = attemptEffectiveQuestions(activeAttempt || latestSubmitted, questions);
  const parsedMeta = parseQuizDescriptionMetadata(quiz.description);
  const effectiveAttemptLimit = hasFreeReview ? null : quiz.attempt_limit;
  const attemptsRemaining = effectiveAttemptLimit != null
    ? Math.max(0, Number(effectiveAttemptLimit) - submittedAttempts.length)
    : null;
  const canStartAttempt = Boolean(
    activeAttempt || hasFreeReview || attemptsRemaining === null || attemptsRemaining > 0,
  );

  let latestResult = null;
  if (latestSubmitted) {
    const computed = buildQuizResult(
      attemptEffectiveQuestions(latestSubmitted, questions),
      latestSubmitted.answers_json || {},
    );
    latestResult = buildSanitizedQuizResult({
      quiz: { ...quiz, attempt_limit: effectiveAttemptLimit },
      attempt: latestSubmitted,
      computed,
      canViewSolution,
      alreadySubmitted: true,
    });
  }
  const reviewItems = hasFreeReview
    ? buildQuizResult(effectiveQuestions, {}).review
    : undefined;

  recordIntegrationMetric("course.delegated_quiz_detail");
  observeIntegrationLatency("course.delegated_quiz_ms", Date.now() - startMs);

  return {
    profileId: String(profileRow.profile_id),
    courseId: String(profileRow.course_id),
    unitId: String(targetUnit.id),
    unitType: targetUnit.unitType,
    attemptsCount: submittedAttempts.length,
    maxAttempts: effectiveAttemptLimit,
    attemptsRemaining,
    canStartAttempt,
    canViewSolution,
    isAdminBypass: isAdminSession,
    canReviewFreely,
    ...(reviewItems ? { reviewItems } : {}),
    quiz: {
      id: String(quiz.id),
      title: quiz.title,
      description: parsedMeta.cleanDescription,
      instructions: parsedMeta.cleanDescription,
      activityScope: quiz.activity_scope || "session",
      durationMinutes: Number(quiz.duration_minutes || 0),
      passingScore: Number(quiz.passing_score || 60),
      attemptLimit: effectiveAttemptLimit,
      attemptsUsed: submittedAttempts.length,
      reviewPolicy: quiz.review_policy || "after_submit",
      availableFrom: toIso(quiz.available_from),
      availableUntil: toIso(quiz.available_until),
      canViewSolution,
      hasSolution: Boolean(quiz.solution_file_id),
      paperFileId: quiz.paper_file_id && quiz.paper_status === "ready" ? String(quiz.paper_file_id) : null,
      solutionFileId: canViewSolution && quiz.solution_file_id && quiz.solution_status === "ready"
        ? String(quiz.solution_file_id)
        : null,
      items: publicQuizItems(effectiveQuestions),
    },
    activeAttempt: serializeDelegatedAttempt(activeAttempt),
    latestAttempt: serializeDelegatedAttempt(latestSubmitted),
    latestResult,
    attempts: attempts.map((a) => ({
      id: String(a.id),
      attemptNumber: Number(a.attempt_number || 1),
      status: a.status,
      score: a.score != null ? Number(a.score) : null,
      maxScore: a.max_score != null ? Number(a.max_score) : null,
      startedAt: toIso(a.started_at),
      expiresAt: toIso(a.expires_at),
      submittedAt: toIso(a.submitted_at),
      autoSubmitted: Boolean(a.auto_submitted),
    })),
  };
}

/**
 * Idempotently starts or resumes a delegated quiz attempt inside a serializable row-lock
 * transaction (`FOR UPDATE`). Auto-submits expired active attempts and enforces attempt limits.
 */
export async function startDelegatedQuizAttempt({
  db = defaultDb,
  sessionToken,
  quizId,
  profileId = null,
  unitId = null,
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const parsedQuizId = parsePositiveId(quizId);
  if (!parsedQuizId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "quizId must be a positive integer.");
  }

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "quiz:attempt",
    expectedProfileId: profileId,
    isMutation: true,
    now,
    env,
  });

  const cleanIdemKey = idempotencyKey && String(idempotencyKey).trim()
    ? String(idempotencyKey).trim().slice(0, 180)
    : null;
  const currentNow = typeof now === "function" ? now() : new Date();

  const isAdminSession = isDelegatedAdminRole(session.user_role);
  const canReviewFreely = !isAdminSession && await hasLiveReviewMembership(db, profileRow, session.user_id);
  const hasFreeReview = isAdminSession || canReviewFreely;
  const outcome = await runDelegatedTx(db, async (tx) => {
    await tx.query(`SELECT id FROM quizzes WHERE id = $1 FOR UPDATE`, [parsedQuizId]);
    const rawQuiz = await loadQuizRow(tx, parsedQuizId);
    if (!rawQuiz) {
      throw new ExternalIntegrationError(404, "QUIZ_NOT_FOUND", `Quiz ${parsedQuizId} not found.`);
    }

    const units = applySequentialLocks(
      await loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }),
      { bypassSequentialLock: hasFreeReview },
    );
    const targetUnit = resolveQuizUnitMatch(units, rawQuiz, unitId);
    const accommodation = await loadQuizAccommodation(tx, parsedQuizId, session.user_id);
    const quiz = {
      ...buildEffectiveDelegatedQuiz(rawQuiz, accommodation),
      _viewerRole: session.user_role,
      _freeReviewAccess: hasFreeReview,
    };
    const questions = await loadQuizQuestions(tx, parsedQuizId);
    if (questions.length === 0) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Quiz has no questions.");
    }

    // 1. Idempotency replay guard
    if (cleanIdemKey) {
      const idemRes = await tx.query(
        `SELECT *
         FROM quiz_attempts
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1
         FOR UPDATE`,
        [session.user_id, cleanIdemKey],
      );
      const existingIdem = idemRes.rows[0] || null;
      if (existingIdem) {
        if (String(existingIdem.quiz_id) !== String(parsedQuizId)) {
          throw new ExternalIntegrationError(
            409,
            "PROFILE_SCOPE_MISMATCH",
            "Idempotency key was already used for another quiz.",
          );
        }
        const effectiveQuestions = attemptEffectiveQuestions(existingIdem, questions);
        const canView = hasFreeReview || (existingIdem.status !== "in_progress"
          ? computeQuizCanViewSolution(quiz, [existingIdem], currentNow)
          : false);
        const result = existingIdem.status !== "in_progress"
          ? buildSanitizedQuizResult({
            quiz,
            attempt: existingIdem,
            computed: buildQuizResult(effectiveQuestions, existingIdem.answers_json || {}),
            canViewSolution: canView,
            alreadySubmitted: true,
          })
          : null;
        return {
          created: false,
          resumed: existingIdem.status === "in_progress",
          timedOut: Boolean(existingIdem.auto_submitted),
          quizId: String(quiz.id),
          profileId: String(profileRow.profile_id),
          unitId: String(targetUnit.id),
          attempt: serializeDelegatedAttempt(existingIdem),
          items: publicQuizItems(effectiveQuestions),
          result,
        };
      }
    }

    // 2. Lock existing attempts for (quiz, user, profile)
    const attemptsRes = await tx.query(
      `SELECT *
       FROM quiz_attempts
       WHERE quiz_id = $1 AND user_id = $2
         AND video_course_profile_id IS NOT DISTINCT FROM $3::bigint
       ORDER BY attempt_number DESC, id DESC
       FOR UPDATE`,
      [parsedQuizId, session.user_id, profileRow.profile_id],
    );
    const existingAttempts = attemptsRes.rows;
    const activeAttempt = existingAttempts.find((a) => a.status === "in_progress") || null;
    const externalUserIds = await resolveMolyExternalUserIds(tx, session.user_id, session.external_user_id);

    if (activeAttempt) {
      const configuredExpiry = getAttemptExpiry({
        startedAt: activeAttempt.started_at,
        durationMinutes: quiz.duration_minutes,
        closesAt: accommodation?.due_at || null,
      });
      const expiresAt = resolveEffectiveAttemptExpiry(configuredExpiry, activeAttempt.expires_at, accommodation);
      if (expiresAt && (!activeAttempt.expires_at || expiresAt.getTime() !== new Date(activeAttempt.expires_at).getTime())) {
        await tx.query(
          `UPDATE quiz_attempts SET expires_at = $1, updated_at = NOW() WHERE id = $2`,
          [expiresAt.toISOString(), activeAttempt.id],
        );
        activeAttempt.expires_at = expiresAt;
      }

      const activeQuestions = attemptEffectiveQuestions(activeAttempt, questions);
      if (expiresAt && expiresAt.getTime() <= currentNow.getTime()) {
        const finalized = await finalizeQuizAttemptInTx(tx, {
          attempt: activeAttempt,
          quiz,
          questions: activeQuestions,
          autoSubmitted: true,
          userId: session.user_id,
          externalUserIds,
          profileRow,
          targetUnit,
          correlationId,
          currentNow,
        });
        return {
          created: false,
          resumed: false,
          timedOut: true,
          quizId: String(quiz.id),
          profileId: String(profileRow.profile_id),
          unitId: String(targetUnit.id),
          attempt: serializeDelegatedAttempt(finalized.attempt),
          items: publicQuizItems(activeQuestions),
          result: buildSanitizedQuizResult({
            quiz,
            attempt: finalized.attempt,
            computed: finalized.computed,
            canViewSolution: finalized.canViewSolution,
          }),
        };
      }

      return {
        created: false,
        resumed: true,
        timedOut: false,
        quizId: String(quiz.id),
        profileId: String(profileRow.profile_id),
        unitId: String(targetUnit.id),
        attempt: serializeDelegatedAttempt(activeAttempt),
        items: publicQuizItems(activeQuestions),
        result: null,
      };
    }

    // 3. Enforce attempt limit (admins and Live review members bypass limits & deadlines)
    const submittedAttempts = existingAttempts.filter((a) => a.status !== "in_progress");
    if (!hasFreeReview && quiz.attempt_limit !== null && submittedAttempts.length >= Number(quiz.attempt_limit)) {
      throw new ExternalIntegrationError(
        409,
        "ATTEMPT_LIMIT_REACHED",
        `You have reached the maximum number of attempts (${quiz.attempt_limit}) for this quiz.`,
        {
          attemptsUsed: submittedAttempts.length,
          attemptLimit: Number(quiz.attempt_limit),
        },
      );
    }

    if (!hasFreeReview && accommodation?.due_at && new Date(accommodation.due_at).getTime() <= currentNow.getTime()) {
      throw new ExternalIntegrationError(409, "QUIZ_CLOSED", "Quiz deadline has passed.");
    }

    const nextAttemptNumber = existingAttempts.length > 0
      ? Math.max(...existingAttempts.map((a) => Number(a.attempt_number || 0))) + 1
      : 1;
    const snapshot = makeQuestionSnapshot(questions, Boolean(quiz.shuffle_questions));
    const maxScore = Number(
      questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0).toFixed(2),
    );
    const expiresAt = getAttemptExpiry({
      startedAt: currentNow,
      durationMinutes: quiz.duration_minutes,
      closesAt: accommodation?.due_at || null,
    });
    const rev = await allocateNextSyncRevision(tx);

    const inserted = (await tx.query(
      `INSERT INTO quiz_attempts
         (quiz_id, user_id, video_course_profile_id, answers_json, max_score, status,
          started_at, expires_at, attempt_number, question_snapshot, sync_revision, idempotency_key)
       VALUES ($1, $2, $3, '{}'::jsonb, $4, 'in_progress', $5::timestamptz, $6::timestamptz, $7, $8::jsonb, $9, $10)
       RETURNING *`,
      [
        parsedQuizId,
        session.user_id,
        profileRow.profile_id,
        maxScore,
        currentNow.toISOString(),
        expiresAt ? expiresAt.toISOString() : null,
        nextAttemptNumber,
        JSON.stringify(snapshot),
        rev,
        cleanIdemKey,
      ],
    )).rows[0];

    return {
      created: true,
      resumed: false,
      timedOut: false,
      quizId: String(quiz.id),
      profileId: String(profileRow.profile_id),
      unitId: String(targetUnit.id),
      attempt: serializeDelegatedAttempt(inserted),
      items: publicQuizItems(snapshot),
      result: null,
    };
  });

  recordIntegrationMetric("course.delegated_quiz_start");
  observeIntegrationLatency("course.delegated_quiz_ms", Date.now() - startMs);
  return outcome;
}

/**
 * Autosaves answers onto an active delegated quiz attempt (`status = 'in_progress'`).
 * Rejects edits against submitted attempts (`409 ATTEMPT_ALREADY_SUBMITTED`).
 */
export async function saveDelegatedQuizAnswers({
  db = defaultDb,
  sessionToken,
  attemptId,
  questionId = null,
  answer = undefined,
  answers = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const parsedAttemptId = parsePositiveId(attemptId);
  if (!parsedAttemptId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "attemptId must be a positive integer.");
  }

  const hasSingleAnswer = questionId !== undefined && questionId !== null;
  if (!hasSingleAnswer && !isPlainObject(answers)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Provide either questionId+answer or answers object.");
  }

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "quiz:attempt",
    isMutation: true,
    now,
    env,
  });

  const currentNow = typeof now === "function" ? now() : new Date();
  const outcome = await runDelegatedTx(db, async (tx) => {
    const attRes = await tx.query(
      `SELECT * FROM quiz_attempts WHERE id = $1 FOR UPDATE`,
      [parsedAttemptId],
    );
    const attempt = attRes.rows[0] || null;
    if (!attempt) {
      throw new ExternalIntegrationError(404, "ATTEMPT_NOT_FOUND", `Quiz attempt ${parsedAttemptId} not found.`);
    }
    if (String(attempt.user_id) !== String(session.user_id)) {
      throw new ExternalIntegrationError(403, "FORBIDDEN", "Cannot modify another user's quiz attempt.");
    }
    if (
      attempt.video_course_profile_id != null
      && String(attempt.video_course_profile_id) !== String(session.video_course_profile_id)
    ) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        "Attempt does not belong to the active delegated profile.",
      );
    }
    if (attempt.status !== "in_progress") {
      throw new ExternalIntegrationError(
        409,
        "ATTEMPT_ALREADY_SUBMITTED",
        "This quiz attempt has already been submitted.",
      );
    }

    const rawQuiz = await loadQuizRow(tx, attempt.quiz_id);
    if (!rawQuiz) {
      throw new ExternalIntegrationError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    }
    const accommodation = await loadQuizAccommodation(tx, attempt.quiz_id, session.user_id);
    const hasFreeReviewSave = await canBypassSequentialProgress(tx, {
      profileRow,
      userId: session.user_id,
      userRole: session.user_role,
    });
    const quiz = {
      ...buildEffectiveDelegatedQuiz(rawQuiz, accommodation),
      _viewerRole: session.user_role,
      _freeReviewAccess: hasFreeReviewSave,
    };
    const questions = attemptEffectiveQuestions(attempt, await loadQuizQuestions(tx, attempt.quiz_id));

    const configuredExpiry = getAttemptExpiry({
      startedAt: attempt.started_at,
      durationMinutes: quiz.duration_minutes,
      closesAt: accommodation?.due_at || null,
    });
    const expiresAt = resolveEffectiveAttemptExpiry(configuredExpiry, attempt.expires_at, accommodation);

    if (expiresAt && expiresAt.getTime() <= currentNow.getTime()) {
      const units = applySequentialLocks(
        await loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }),
        { bypassSequentialLock: hasFreeReviewSave },
      );
      const targetUnit = resolveQuizUnitMatch(units, rawQuiz);
      const externalUserIds = await resolveMolyExternalUserIds(tx, session.user_id, session.external_user_id);
      const finalized = await finalizeQuizAttemptInTx(tx, {
        attempt,
        quiz,
        questions,
        autoSubmitted: true,
        userId: session.user_id,
        externalUserIds,
        profileRow,
        targetUnit,
        correlationId,
        currentNow,
      });
      return {
        expiredAutoSubmitted: true,
        attempt: serializeDelegatedAttempt(finalized.attempt),
      };
    }

    const merged = { ...(isPlainObject(attempt.answers_json) ? attempt.answers_json : {}) };
    if (hasSingleAnswer) {
      const parsedQid = parsePositiveId(questionId);
      if (!parsedQid) {
        throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "questionId must be a positive integer.");
      }
      merged[String(parsedQid)] = answer;
    } else {
      Object.assign(merged, answers);
    }

    const normalized = normalizeQuizAnswers(questions, merged);
    if (normalized.error) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", normalized.error);
    }
    if (normalized.assetIds.length > 0) {
      const assetCheck = await tx.query(
        `SELECT id FROM submission_assets
         WHERE id = ANY($1::bigint[]) AND user_id = $2 AND status = 'ready'`,
        [normalized.assetIds, session.user_id],
      );
      if (assetCheck.rows.length !== normalized.assetIds.length) {
        throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Referenced essay attachment assets are invalid.");
      }
    }

    const rev = await allocateNextSyncRevision(tx);
    const saved = (await tx.query(
      `UPDATE quiz_attempts
       SET answers_json = $1::jsonb,
           expires_at = COALESCE(expires_at, $2::timestamptz),
           sync_revision = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, status, answers_json, expires_at, sync_revision, updated_at`,
      [
        JSON.stringify(normalized.answers),
        expiresAt ? expiresAt.toISOString() : null,
        rev,
        attempt.id,
      ],
    )).rows[0];

    return {
      expiredAutoSubmitted: false,
      attemptId: String(saved.id),
      status: saved.status,
      answers: saved.answers_json,
      expiresAt: toIso(saved.expires_at),
      revision: Number(saved.sync_revision || rev),
      savedAt: toIso(saved.updated_at),
    };
  });

  if (outcome.expiredAutoSubmitted) {
    throw new ExternalIntegrationError(
      409,
      "QUIZ_ATTEMPT_EXPIRED",
      "Time expired; the attempt was automatically submitted.",
      { autoSubmitted: true, attempt: outcome.attempt },
    );
  }

  observeIntegrationLatency("course.delegated_quiz_ms", Date.now() - startMs);
  return outcome;
}

/**
 * Idempotently submits an active quiz attempt (`FOR UPDATE`), grades deterministically,
 * respects `reviewIsAvailable` embargo, emits `assessment.attempt.updated`, and emits
 * unit completion / next-unit unlock progress outbox events.
 */
export async function submitDelegatedQuizAttempt({
  db = defaultDb,
  sessionToken,
  attemptId,
  answers = null,
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const parsedAttemptId = parsePositiveId(attemptId);
  if (!parsedAttemptId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "attemptId must be a positive integer.");
  }
  if (answers !== undefined && answers !== null && !isPlainObject(answers)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "answers must be a plain object.");
  }

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "quiz:attempt",
    isMutation: true,
    now,
    env,
  });

  const cleanSubmitIdemKey = idempotencyKey && String(idempotencyKey).trim()
    ? String(idempotencyKey).trim().slice(0, 180)
    : null;
  const currentNow = typeof now === "function" ? now() : new Date();

  const result = await runDelegatedTx(db, async (tx) => {
    const attRes = await tx.query(
      `SELECT * FROM quiz_attempts WHERE id = $1 FOR UPDATE`,
      [parsedAttemptId],
    );
    const attempt = attRes.rows[0] || null;
    if (!attempt) {
      throw new ExternalIntegrationError(404, "ATTEMPT_NOT_FOUND", `Quiz attempt ${parsedAttemptId} not found.`);
    }
    if (String(attempt.user_id) !== String(session.user_id)) {
      throw new ExternalIntegrationError(403, "FORBIDDEN", "Cannot submit another user's quiz attempt.");
    }
    if (
      attempt.video_course_profile_id != null
      && String(attempt.video_course_profile_id) !== String(session.video_course_profile_id)
    ) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        "Attempt does not belong to the active delegated profile.",
      );
    }

    const rawQuiz = await loadQuizRow(tx, attempt.quiz_id);
    if (!rawQuiz) {
      throw new ExternalIntegrationError(404, "QUIZ_NOT_FOUND", "Quiz not found.");
    }
    const accommodation = await loadQuizAccommodation(tx, attempt.quiz_id, session.user_id);
    const isAdminSession = isDelegatedAdminRole(session.user_role);
    const hasFreeReviewSubmit = await canBypassSequentialProgress(tx, {
      profileRow,
      userId: session.user_id,
      userRole: session.user_role,
    });
    const quiz = {
      ...buildEffectiveDelegatedQuiz(rawQuiz, accommodation),
      _viewerRole: session.user_role,
      _freeReviewAccess: hasFreeReviewSubmit,
    };
    const questions = attemptEffectiveQuestions(attempt, await loadQuizQuestions(tx, attempt.quiz_id));

    if (attempt.status !== "in_progress") {
      let storedSubmitKey = null;
      if (await hasIntegrationOutbox(tx)) {
        const outboxRes = await tx.query(
          `SELECT COALESCE(payload->'payload'->>'submitIdempotencyKey', payload->>'submitIdempotencyKey') AS submit_key
           FROM course_integration_outbox
           WHERE aggregate_type = 'quiz_attempt' AND aggregate_id = $1 AND event_type = 'assessment.attempt.updated'
           ORDER BY id DESC LIMIT 1`,
          [String(attempt.id)],
        );
        storedSubmitKey = outboxRes.rows[0]?.submit_key || null;
      }

      const isIdempotentRetry = Boolean(attempt.auto_submitted)
        || (cleanSubmitIdemKey && storedSubmitKey && cleanSubmitIdemKey === storedSubmitKey)
        || (!storedSubmitKey && (!cleanSubmitIdemKey || attempt.idempotency_key === cleanSubmitIdemKey));

      if (!isIdempotentRetry) {
        throw new ExternalIntegrationError(
          409,
          "ATTEMPT_ALREADY_SUBMITTED",
          "Quiz attempt has already been submitted with a different request.",
        );
      }

      const computed = buildQuizResult(questions, attempt.answers_json || {});
      const canView = hasFreeReviewSubmit || computeQuizCanViewSolution(quiz, [attempt], currentNow);
      const replayUnits = applySequentialLocks(
        await loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }),
        { bypassSequentialLock: hasFreeReviewSubmit },
      );
      const replayUnit = resolveQuizUnitMatch(replayUnits, rawQuiz);
      return buildSanitizedQuizResult({
        quiz: hasFreeReviewSubmit ? { ...quiz, attempt_limit: null } : quiz,
        attempt,
        computed,
        canViewSolution: canView,
        alreadySubmitted: true,
        unitProgressMeta: formatQuizSubmitUnitsSummary(replayUnits, replayUnit, computed, quiz),
      });
    }

    const configuredExpiry = getAttemptExpiry({
      startedAt: attempt.started_at,
      durationMinutes: quiz.duration_minutes,
      closesAt: accommodation?.due_at || null,
    });
    const expiresAt = resolveEffectiveAttemptExpiry(configuredExpiry, attempt.expires_at, accommodation);
    const expired = Boolean(expiresAt && expiresAt.getTime() <= currentNow.getTime());

    if (!expired && isPlainObject(answers) && Object.keys(answers).length > 0) {
      const merged = { ...(isPlainObject(attempt.answers_json) ? attempt.answers_json : {}), ...answers };
      const normalized = normalizeQuizAnswers(questions, merged);
      if (normalized.error) {
        throw new ExternalIntegrationError(422, "VALIDATION_ERROR", normalized.error);
      }
      if (normalized.assetIds.length > 0) {
        const assetCheck = await tx.query(
          `SELECT id FROM submission_assets
           WHERE id = ANY($1::bigint[]) AND user_id = $2 AND status = 'ready'`,
          [normalized.assetIds, session.user_id],
        );
        if (assetCheck.rows.length !== normalized.assetIds.length) {
          throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Referenced essay attachment assets are invalid.");
        }
      }
      attempt.answers_json = normalized.answers;
      await tx.query(
        `UPDATE quiz_attempts
         SET answers_json = $1::jsonb, expires_at = COALESCE(expires_at, $2::timestamptz)
         WHERE id = $3`,
        [JSON.stringify(normalized.answers), expiresAt ? expiresAt.toISOString() : null, attempt.id],
      );
    }

    const units = applySequentialLocks(
      await loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }),
      { bypassSequentialLock: hasFreeReviewSubmit },
    );
    const targetUnit = resolveQuizUnitMatch(units, rawQuiz);
    const externalUserIds = await resolveMolyExternalUserIds(tx, session.user_id, session.external_user_id);

    const finalized = await finalizeQuizAttemptInTx(tx, {
      attempt,
      quiz,
      questions,
      autoSubmitted: expired,
      userId: session.user_id,
      externalUserIds,
      profileRow,
      targetUnit,
      submitIdempotencyKey: cleanSubmitIdemKey,
      correlationId,
      currentNow,
    });

    return buildSanitizedQuizResult({
      quiz: hasFreeReviewSubmit ? { ...quiz, attempt_limit: null } : quiz,
      attempt: finalized.attempt,
      computed: finalized.computed,
      canViewSolution: finalized.canViewSolution,
      alreadySubmitted: false,
      unitProgressMeta: formatQuizSubmitUnitsSummary(
        finalized.unitsAfter,
        finalized.targetUnitAfter,
        finalized.computed,
        quiz,
      ),
    });
  });

  recordIntegrationMetric("course.delegated_quiz_submit");
  observeIntegrationLatency("course.delegated_quiz_ms", Date.now() - startMs);
  return result;
}

async function loadAssignmentRow(db, assignmentId) {
  const res = await db.query(
    `SELECT a.*, lc.course_id AS class_course_id, lc.status AS live_class_status,
            rubric.criteria_json AS rubric_criteria
     FROM assignments a
     LEFT JOIN live_classes lc ON lc.id = a.live_class_id
     LEFT JOIN assignment_rubrics rubric ON rubric.assignment_id = a.id
     WHERE a.id = $1
     LIMIT 1`,
    [assignmentId],
  );
  return res.rows[0] || null;
}

function resolveAssignmentUnitMatch(units, assignment, profileRow, explicitUnitId = null) {
  let matchedUnit = null;
  if (profileRow.mode === "MIRROR") {
    if (assignment.class_session_id) {
      matchedUnit = units.find((u) => String(u.id) === String(assignment.class_session_id)) || null;
    } else if (
      (assignment.live_class_id && String(assignment.live_class_id) === String(profileRow.source_live_class_id))
      || (!assignment.live_class_id && !assignment.lesson_id && String(assignment.course_id) === String(profileRow.course_id))
    ) {
      matchedUnit = explicitUnitId
        ? (units.find((u) => String(u.id) === String(explicitUnitId).trim()) || units[0] || null)
        : (units[0] || null);
    }
  } else {
    if (assignment.lesson_id) {
      matchedUnit = units.find((u) => String(u.id) === String(assignment.lesson_id)) || null;
    } else if (!assignment.live_class_id && !assignment.class_session_id && String(assignment.course_id) === String(profileRow.course_id)) {
      matchedUnit = explicitUnitId
        ? (units.find((u) => String(u.id) === String(explicitUnitId).trim()) || units[0] || null)
        : (units[0] || null);
    }
  }

  if (!matchedUnit) {
    throw new ExternalIntegrationError(
      409,
      "PROFILE_SCOPE_MISMATCH",
      `Assignment ${assignment.id} does not belong to profile ${profileRow.profile_id}.`,
    );
  }
  if (explicitUnitId != null && String(explicitUnitId).trim() !== "") {
    const requested = units.find((u) => String(u.id) === String(explicitUnitId).trim()) || null;
    if (!requested || String(requested.id) !== String(matchedUnit.id)) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        `Assignment ${assignment.id} does not belong to unit ${explicitUnitId}.`,
      );
    }
  }
  if (matchedUnit.isLocked) {
    throw new ExternalIntegrationError(
      403,
      "UNIT_LOCKED",
      matchedUnit.lockReason || "Unit is locked by sequential progression.",
      { unitId: matchedUnit.id, requiredPrevUnitId: matchedUnit.requiredPrevUnitId },
    );
  }
  return matchedUnit;
}

/**
 * Returns assignment brief, rubric, and current learner submission + grading detail.
 */
export async function getDelegatedAssignmentDetail({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  assignmentId,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const parsedAssignmentId = parsePositiveId(assignmentId);
  if (!parsedAssignmentId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "assignmentId must be a positive integer.");
  }

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: null,
    expectedProfileId: profileId,
    now,
    env,
  });
  const scopes = session.scopes || [];
  if (!scopes.includes("assignment:submit") && !scopes.includes("workspace:read")) {
    throw new ExternalIntegrationError(
      403,
      "DELEGATED_SCOPE_DENIED",
      "Delegated session lacks 'assignment:submit' or 'workspace:read' scope.",
    );
  }

  const units = applySequentialLocks(
    await loadProfileUnitsWithProgress(db, { profileRow, userId: session.user_id }),
    { bypassSequentialLock: await canBypassSequentialProgress(db, { profileRow, userId: session.user_id, userRole: session.user_role }) },
  );
  const targetUnit = units.find((u) => String(u.id) === String(unitId).trim()) || null;
  if (!targetUnit) {
    await assertUnitNotCrossProfile(db, { profileRow, unitId });
    throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Unit ${unitId} not found in profile ${profileId}.`);
  }

  const assignment = await loadAssignmentRow(db, parsedAssignmentId);
  if (!assignment) {
    throw new ExternalIntegrationError(404, "ASSIGNMENT_NOT_FOUND", `Assignment ${parsedAssignmentId} not found.`);
  }
  resolveAssignmentUnitMatch(units, assignment, profileRow, unitId);

  const subRes = await db.query(
    `SELECT s.*,
            sg.score, sg.feedback_text, sg.graded_at, sg.rubric_scores, sg.annotations
     FROM assignment_submissions s
     LEFT JOIN LATERAL (
       SELECT score, feedback_text, graded_at, rubric_scores, annotations
       FROM submission_grades
       WHERE submission_id = s.id AND submission_revision = s.revision
       ORDER BY graded_at DESC, id DESC LIMIT 1
     ) sg ON TRUE
     WHERE s.assignment_id = $1 AND s.user_id = $2
       AND (s.video_course_profile_id = $3 OR s.video_course_profile_id IS NULL)
     ORDER BY (s.video_course_profile_id = $3) DESC, s.id DESC
     LIMIT 1`,
    [parsedAssignmentId, session.user_id, profileRow.profile_id],
  );
  const sub = subRes.rows[0] || null;
  let assets = [];
  if (sub) {
    const assetIds = [
      ...(Array.isArray(sub.file_asset_ids) ? sub.file_asset_ids : []),
      ...(sub.file_asset_id ? [sub.file_asset_id] : []),
      ...(sub.audio_asset_id ? [sub.audio_asset_id] : []),
    ].map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
    if (assetIds.length > 0) {
      const assetsRes = await db.query(
        `SELECT id, asset_kind, original_filename, mime_type, size_bytes, status
         FROM submission_assets
         WHERE id = ANY($1::bigint[])
         ORDER BY id ASC`,
        [[...new Set(assetIds)]],
      );
      assets = assetsRes.rows.map((a) => ({
        id: String(a.id),
        assetKind: a.asset_kind,
        originalFilename: a.original_filename,
        mimeType: a.mime_type,
        sizeBytes: Number(a.size_bytes || 0),
        status: a.status,
      }));
    }
  }

  return {
    profileId: String(profileRow.profile_id),
    courseId: String(profileRow.course_id),
    unitId: String(targetUnit.id),
    unitType: targetUnit.unitType,
    assignment: {
      id: String(assignment.id),
      title: assignment.title,
      description: assignment.description || "",
      assignmentType: assignment.assignment_type || "homework",
      maxScore: Number(assignment.max_score || 10),
      dueDate: toIso(assignment.due_date),
      rubric: parseJsonArray(assignment.rubric_criteria),
    },
    submission: sub ? {
      id: String(sub.id),
      status: sub.status,
      contentText: sub.content_text || "",
      revision: Number(sub.revision || 1),
      syncRevision: Number(sub.sync_revision || 1),
      returnRequested: Boolean(sub.return_requested),
      returnReason: sub.return_reason || null,
      resubmitUntil: toIso(sub.resubmit_until),
      submittedAt: toIso(sub.submitted_at),
      score: sub.score != null ? Number(sub.score) : null,
      teacherFeedback: sub.feedback_text || null,
      gradedAt: toIso(sub.graded_at),
      rubricScores: parseJsonArray(sub.rubric_scores),
      annotations: parseJsonArray(sub.annotations),
      assets,
    } : null,
  };
}

/**
 * Validates file/audio size and MIME allowlist, persists submission asset onto R2
 * (or injectable upload adapter for tests), and registers a `ready` `submission_assets` row.
 */
export async function uploadDelegatedSubmissionAsset({
  db = defaultDb,
  sessionToken,
  assignmentId,
  profileId = null,
  unitId = null,
  assetKind = "file",
  filename,
  mimeType,
  sizeBytes = null,
  contentBase64 = null,
  contentBuffer = null,
  uploadImpl = null,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const parsedAssignmentId = parsePositiveId(assignmentId);
  if (!parsedAssignmentId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "assignmentId must be a positive integer.");
  }
  if (assetKind !== "file" && assetKind !== "audio") {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "assetKind must be 'file' or 'audio'.");
  }
  if (typeof filename !== "string" || !filename.trim() || filename.trim().length > 255 || /[\u0000-\u001f\\/]/.test(filename)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid submission filename.");
  }
  const allowedMimes = assetKind === "audio" ? ALLOWED_SUBMISSION_AUDIO_MIME_TYPES : ALLOWED_SUBMISSION_FILE_MIME_TYPES;
  const maxSize = assetKind === "audio" ? MAX_SUBMISSION_AUDIO_SIZE_BYTES : MAX_SUBMISSION_FILE_SIZE_BYTES;
  if (!allowedMimes.has(mimeType)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", `Unsupported MIME type '${mimeType}' for ${assetKind}.`);
  }

  let buffer = null;
  if (Buffer.isBuffer(contentBuffer)) {
    buffer = contentBuffer;
  } else if (typeof contentBase64 === "string" && contentBase64.length > 0) {
    buffer = Buffer.from(contentBase64, "base64");
  }

  const declaredSize = sizeBytes != null ? Number(sizeBytes) : (buffer ? buffer.length : 0);
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > maxSize) {
    throw new ExternalIntegrationError(
      422,
      "VALIDATION_ERROR",
      `File size exceeds allowed limit (${Math.round(maxSize / 1024 / 1024)}MB).`,
    );
  }
  if (buffer && buffer.length > maxSize) {
    throw new ExternalIntegrationError(
      422,
      "VALIDATION_ERROR",
      `Decoded content exceeds allowed limit (${Math.round(maxSize / 1024 / 1024)}MB).`,
    );
  }
  const actualSize = buffer ? buffer.length : declaredSize;

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "assignment:submit",
    expectedProfileId: profileId,
    isMutation: true,
    now,
    env,
  });

  const assignment = await loadAssignmentRow(db, parsedAssignmentId);
  if (!assignment) {
    throw new ExternalIntegrationError(404, "ASSIGNMENT_NOT_FOUND", `Assignment ${parsedAssignmentId} not found.`);
  }
  const units = applySequentialLocks(
    await loadProfileUnitsWithProgress(db, { profileRow, userId: session.user_id }),
    { bypassSequentialLock: await canBypassSequentialProgress(db, { profileRow, userId: session.user_id, userRole: session.user_role }) },
  );
  resolveAssignmentUnitMatch(units, assignment, profileRow, unitId);

  let storageKey;
  if (typeof uploadImpl === "function") {
    const uploaded = await uploadImpl({
      userId: session.user_id,
      assignmentId: parsedAssignmentId,
      assetKind,
      filename: filename.trim(),
      mimeType,
      sizeBytes: actualSize,
      buffer,
    });
    storageKey = uploaded?.fileKey || uploaded?.storageKey
      || `submissions/${session.user_id}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${filename.trim()}`;
  } else {
    let signed;
    try {
      signed = await generateSubmissionUploadPresignedUrl({
        userId: session.user_id,
        filename: filename.trim(),
        mimeType,
        sizeBytes: actualSize,
        assetKind,
      });
    } catch (err) {
      if (err?.code === "R2_NOT_CONFIGURED") {
        throw new ExternalIntegrationError(503, "STORAGE_UNAVAILABLE", "Submission storage provider is not configured.");
      }
      throw err;
    }
    if (!buffer) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Submission asset bytes (contentBase64) are required.");
    }
    const putRes = await fetchImpl(signed.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: buffer,
    });
    if (!putRes.ok) {
      throw new ExternalIntegrationError(502, "STORAGE_UPLOAD_FAILED", `Failed to store submission asset (${putRes.status}).`);
    }
    storageKey = signed.fileKey;
  }

  const inserted = (await db.query(
    `INSERT INTO submission_assets
       (user_id, assignment_id, asset_kind, original_filename, storage_key, mime_type, size_bytes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')
     RETURNING id, asset_kind, original_filename, mime_type, size_bytes, status, created_at`,
    [session.user_id, parsedAssignmentId, assetKind, filename.trim(), storageKey, mimeType, actualSize],
  )).rows[0];

  return {
    assetId: String(inserted.id),
    id: String(inserted.id),
    assetKind: inserted.asset_kind,
    originalFilename: inserted.original_filename,
    mimeType: inserted.mime_type,
    sizeBytes: Number(inserted.size_bytes || 0),
    status: inserted.status,
  };
}

/**
 * Idempotently creates or updates (resubmits) a learner's assignment submission inside a
 * transactional `FOR UPDATE` lock, archives prior revision, and emits `assessment.attempt.updated`.
 */
export async function submitDelegatedAssignment({
  db = defaultDb,
  sessionToken,
  assignmentId,
  profileId = null,
  unitId = null,
  contentText = "",
  fileAssetId = null,
  fileAssetIds = null,
  audioAssetId = null,
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const parsedAssignmentId = parsePositiveId(assignmentId);
  if (!parsedAssignmentId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "assignmentId must be a positive integer.");
  }

  let normalizedFileIds = [];
  if (Array.isArray(fileAssetIds)) {
    if (fileAssetIds.length > 10) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "At most 10 file assets may be attached.");
    }
    for (const rawId of fileAssetIds) {
      const parsed = parsePositiveId(rawId);
      if (!parsed) throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid fileAssetIds entry.");
      if (!normalizedFileIds.includes(parsed)) normalizedFileIds.push(parsed);
    }
  } else if (fileAssetId !== undefined && fileAssetId !== null && String(fileAssetId).trim() !== "") {
    const parsed = parsePositiveId(fileAssetId);
    if (!parsed) throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid fileAssetId.");
    normalizedFileIds = [parsed];
  }
  const primaryFileAssetId = normalizedFileIds[0] || null;
  const parsedAudioAssetId = audioAssetId !== undefined && audioAssetId !== null && String(audioAssetId).trim() !== ""
    ? parsePositiveId(audioAssetId)
    : null;
  if (audioAssetId !== undefined && audioAssetId !== null && String(audioAssetId).trim() !== "" && !parsedAudioAssetId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Invalid audioAssetId.");
  }
  if (parsedAudioAssetId && normalizedFileIds.includes(parsedAudioAssetId)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Audio asset and file asset must be distinct.");
  }
  const cleanText = typeof contentText === "string" ? contentText.trim() : "";
  if (typeof contentText === "string" && contentText.length > 100000) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Submission text exceeds maximum length.");
  }
  if (!cleanText && normalizedFileIds.length === 0 && !parsedAudioAssetId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Submission must include text, file, or audio.");
  }

  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "assignment:submit",
    expectedProfileId: profileId,
    isMutation: true,
    now,
    env,
  });

  const cleanIdemKey = idempotencyKey && String(idempotencyKey).trim()
    ? String(idempotencyKey).trim().slice(0, 180)
    : null;
  const currentNow = typeof now === "function" ? now() : new Date();
  const occurredAt = currentNow.toISOString();

  const outcome = await runDelegatedTx(db, async (tx) => {
    const assignment = await loadAssignmentRow(tx, parsedAssignmentId);
    if (!assignment) {
      throw new ExternalIntegrationError(404, "ASSIGNMENT_NOT_FOUND", `Assignment ${parsedAssignmentId} not found.`);
    }
    const units = applySequentialLocks(
      await loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }),
      { bypassSequentialLock: await canBypassSequentialProgress(tx, { profileRow, userId: session.user_id, userRole: session.user_role }) },
    );
    const targetUnit = resolveAssignmentUnitMatch(units, assignment, profileRow, unitId);

    if (cleanIdemKey) {
      const idemRes = await tx.query(
        `SELECT * FROM assignment_submissions
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1 FOR UPDATE`,
        [session.user_id, cleanIdemKey],
      );
      const existingIdem = idemRes.rows[0] || null;
      if (existingIdem) {
        if (String(existingIdem.assignment_id) !== String(parsedAssignmentId)) {
          throw new ExternalIntegrationError(409, "PROFILE_SCOPE_MISMATCH", "Idempotency key belongs to another assignment.");
        }
        return {
          alreadySubmitted: true,
          submissionId: String(existingIdem.id),
          assignmentId: String(existingIdem.assignment_id),
          profileId: String(profileRow.profile_id),
          unitId: String(targetUnit.id),
          status: existingIdem.status,
          revision: Number(existingIdem.revision || 1),
          syncRevision: Number(existingIdem.sync_revision || 1),
          submittedAt: toIso(existingIdem.submitted_at),
          contentText: existingIdem.content_text || "",
          fileAssetIds: (existingIdem.file_asset_ids || []).map(String),
          audioAssetId: existingIdem.audio_asset_id ? String(existingIdem.audio_asset_id) : null,
        };
      }
    }

    const existingRes = await tx.query(
      `SELECT * FROM assignment_submissions
       WHERE assignment_id = $1 AND user_id = $2
         AND video_course_profile_id IS NOT DISTINCT FROM $3::bigint
       FOR UPDATE`,
      [parsedAssignmentId, session.user_id, profileRow.profile_id],
    );
    const existing = existingRes.rows[0] || null;
    if (existing && !canResubmit(existing)) {
      throw new ExternalIntegrationError(
        409,
        "SUBMISSION_LOCKED",
        existing.status === "graded"
          ? "Submission has already been graded and locked."
          : "Submission already exists and return was not requested.",
      );
    }

    const allAssetIds = [...normalizedFileIds, ...(parsedAudioAssetId ? [parsedAudioAssetId] : [])];
    if (allAssetIds.length > 0) {
      const assetRows = (await tx.query(
        `SELECT id, assignment_id, asset_kind, status
         FROM submission_assets
         WHERE id = ANY($1::bigint[]) AND user_id = $2 FOR UPDATE`,
        [allAssetIds, session.user_id],
      )).rows;
      const byId = new Map(assetRows.map((a) => [Number(a.id), a]));
      for (const fid of normalizedFileIds) {
        const asset = byId.get(fid);
        if (!asset || asset.status !== "ready" || asset.asset_kind !== "file"
          || (asset.assignment_id !== null && Number(asset.assignment_id) !== parsedAssignmentId)) {
          throw new ExternalIntegrationError(422, "VALIDATION_ERROR", `Invalid or unready file asset ${fid}.`);
        }
      }
      if (parsedAudioAssetId) {
        const asset = byId.get(parsedAudioAssetId);
        if (!asset || asset.status !== "ready" || asset.asset_kind !== "audio"
          || (asset.assignment_id !== null && Number(asset.assignment_id) !== parsedAssignmentId)) {
          throw new ExternalIntegrationError(422, "VALIDATION_ERROR", `Invalid or unready audio asset ${parsedAudioAssetId}.`);
        }
      }
    }

    const syncRev = await allocateNextSyncRevision(tx);
    let savedRow;
    if (existing) {
      await tx.query(
        `INSERT INTO submission_revisions(submission_id, revision, snapshot)
         VALUES ($1, $2, $3::jsonb)`,
        [existing.id, existing.revision, JSON.stringify(existing)],
      );
      savedRow = (await tx.query(
        `UPDATE assignment_submissions
         SET content_text = $2,
             file_asset_id = $3,
             file_asset_ids = $4,
             audio_asset_id = $5,
             status = 'submitted',
             submitted_at = $6::timestamptz,
             revision = revision + 1,
             return_requested = FALSE,
             return_reason = NULL,
             returned_by = NULL,
             returned_at = NULL,
             resubmit_until = NULL,
             sync_revision = $7,
             idempotency_key = COALESCE($8, idempotency_key)
         WHERE id = $1
         RETURNING *`,
        [
          existing.id,
          cleanText,
          primaryFileAssetId,
          normalizedFileIds,
          parsedAudioAssetId,
          occurredAt,
          syncRev,
          cleanIdemKey,
        ],
      )).rows[0];
      await tx.query(`DELETE FROM grading_drafts WHERE submission_id = $1`, [existing.id]);
    } else {
      savedRow = (await tx.query(
        `INSERT INTO assignment_submissions
           (assignment_id, user_id, video_course_profile_id, content_text, file_asset_id, file_asset_ids,
            audio_asset_id, status, submitted_at, revision, sync_revision, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8::timestamptz, 1, $9, $10)
         RETURNING *`,
        [
          parsedAssignmentId,
          session.user_id,
          profileRow.profile_id,
          cleanText,
          primaryFileAssetId,
          normalizedFileIds,
          parsedAudioAssetId,
          occurredAt,
          syncRev,
          cleanIdemKey,
        ],
      )).rows[0];
    }

    const externalUserIds = await resolveMolyExternalUserIds(tx, session.user_id, session.external_user_id);
    await emitAttemptUpdatedOutbox(tx, {
      userId: session.user_id,
      externalUserIds,
      profileRow,
      unit: targetUnit,
      itemType: "assignment",
      itemId: parsedAssignmentId,
      attemptOrSubId: savedRow.id,
      status: savedRow.status,
      score: null,
      maxScore: Number(assignment.max_score || 10),
      attemptCount: Number(savedRow.revision || 1),
      submittedAt: toIso(savedRow.submitted_at) || occurredAt,
      revision: syncRev,
      submissionRevision: Number(savedRow.revision || 1),
      correlationId,
      occurredAt,
    });

    let assets = [];
    if (allAssetIds.length > 0) {
      const assetsRes = await tx.query(
        `SELECT id, asset_kind, original_filename, mime_type, size_bytes, status
         FROM submission_assets
         WHERE id = ANY($1::bigint[])
         ORDER BY id ASC`,
        [allAssetIds],
      );
      assets = assetsRes.rows.map((a) => ({
        id: String(a.id),
        assetKind: a.asset_kind,
        originalFilename: a.original_filename,
        mimeType: a.mime_type,
        sizeBytes: Number(a.size_bytes || 0),
        status: a.status,
      }));
    }

    return {
      alreadySubmitted: false,
      submissionId: String(savedRow.id),
      assignmentId: String(savedRow.assignment_id),
      profileId: String(profileRow.profile_id),
      unitId: String(targetUnit.id),
      status: savedRow.status,
      attemptCount: Number(savedRow.revision || 1),
      maxScore: Number(assignment.max_score || 10),
      revision: Number(savedRow.revision || 1),
      syncRevision: Number(syncRev),
      submittedAt: toIso(savedRow.submitted_at),
      contentText: savedRow.content_text || "",
      fileAssetIds: (savedRow.file_asset_ids || []).map(String),
      audioAssetId: savedRow.audio_asset_id ? String(savedRow.audio_asset_id) : null,
      assets,
    };
  });

  recordIntegrationMetric("course.delegated_assignment_submit");
  observeIntegrationLatency("course.delegated_assignment_ms", Date.now() - startMs);
  return outcome;
}

/**
 * Emits `assessment.submission.graded` inside the teacher grading/return transaction
 * whenever a graded/returned learner is linked to Moly (`external_identities`).
 */
export async function emitAssessmentSubmissionGradedOutbox({
  db = defaultDb,
  userId,
  itemType,
  itemId,
  attemptOrSubId,
  videoCourseProfileId = null,
  courseId = null,
  liveClassId = null,
  classSessionId = null,
  lessonId = null,
  status = "graded",
  score = null,
  maxScore = null,
  canViewSolution = false,
  teacherFeedback = "",
  rubricScores = [],
  gradedAt = new Date().toISOString(),
  correlationId = null,
} = {}) {
  if (!userId || !(await hasIntegrationOutbox(db))) return null;
  const externalUserIds = await resolveMolyExternalUserIds(db, userId);
  if (!externalUserIds.length) return null;

  let profileIds = [];
  if (videoCourseProfileId) {
    profileIds = [String(videoCourseProfileId)];
  } else {
    const pRes = await db.query(
      `SELECT id
       FROM video_course_profiles
       WHERE deleted_at IS NULL AND status <> 'archived'
         AND (
           ($1::bigint IS NOT NULL AND course_id = $1)
           OR ($2::bigint IS NOT NULL AND source_live_class_id = $2)
         )
       ORDER BY id ASC`,
      [courseId || null, liveClassId || null],
    );
    profileIds = pRes.rows.map((r) => String(r.id));
  }

  const unitType = lessonId ? "lesson" : (classSessionId ? "class_session" : null);
  const unitId = lessonId ? String(lessonId) : (classSessionId ? String(classSessionId) : null);
  const rev = await allocateNextSyncRevision(db);
  const occurredAt = toIso(gradedAt) || new Date().toISOString();

  const envelope = buildV2EventEnvelope({
    eventType: "assessment.submission.graded",
    aggregateType: itemType === "quiz" ? "quiz_attempt" : "assignment_submission",
    aggregateId: String(attemptOrSubId),
    revision: rev,
    sourceUpdatedAt: occurredAt,
    occurredAt,
    deleted: false,
    deletedAt: null,
    correlationId,
    payload: {
      userId: String(userId),
      externalUserId: externalUserIds[0],
      externalUserIds,
      profileId: profileIds[0] || null,
      profileIds,
      courseId: courseId != null ? String(courseId) : null,
      unitId,
      unitType,
      itemType,
      itemId: String(itemId),
      attemptOrSubId: String(attemptOrSubId),
      status,
      score: score != null ? Number(score) : null,
      maxScore: maxScore != null ? Number(maxScore) : null,
      canViewSolution: Boolean(canViewSolution),
      teacherFeedback: teacherFeedback || "",
      rubricScores: Array.isArray(rubricScores) ? rubricScores : [],
      gradedAt: occurredAt,
      revision: Number(rev),
    },
  });

  await insertOutboxEnvelopeIfReady(db, envelope);
  return envelope;
}
