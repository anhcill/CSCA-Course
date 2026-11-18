import { getClient, query } from "../db/connect.js";
import { reviewIsAvailable } from "./assessmentPolicy.service.js";
import {
  allocateNextSyncRevision,
  buildV2EventEnvelope,
  insertOutboxEnvelopeIfReady,
} from "./courseCatalogSync.service.js";
import {
  applySequentialLocks,
  assertUnitNotCrossProfile,
  inferFileKind,
  isDelegatedAdminRole,
  loadProfileUnitsWithProgress,
  parsePositiveId,
  resolveProfileAndCourse,
  toIso,
  verifyAndResolveDelegatedSession,
} from "./delegatedLearning.service.js";
import { ExternalIntegrationError } from "./externalCourseMapping.service.js";
import {
  isDelegatedLearningKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
} from "./integrationLogger.service.js";
import {
  buildContentDispositionHeader,
  generateLearningFilePlaybackSignedUrl,
} from "./video.service.js";

const defaultDb = { query, getClient };
const MAX_STREAM_TTL_SECONDS = 60;

async function hasIntegrationOutbox(db) {
  const res = await db.query(
    `SELECT to_regclass('course_integration_outbox') IS NOT NULL AS has_outbox`,
  );
  return Boolean(res.rows[0]?.has_outbox);
}

async function resolveFileAssociatedContext(db, file) {
  const [sessionPlacementsRes, lessonPlacementsRes] = await Promise.all([
    db.query(
      `SELECT lfp.id, lfp.live_class_id, lfp.class_session_id, lfp.visibility,
              lfp.sort_order, lc.course_id AS placement_course_id
       FROM lms_learning_file_placements lfp
       JOIN live_classes lc ON lc.id = lfp.live_class_id
       WHERE lfp.file_id = $1 AND lfp.deleted_at IS NULL
       ORDER BY lfp.sort_order ASC, lfp.id ASC`,
      [file.id],
    ),
    db.query(
      `SELECT llfp.id, llfp.lesson_id, llfp.sort_order, l.course_id AS lesson_course_id
       FROM lesson_learning_file_placements llfp
       JOIN lessons l ON l.id = llfp.lesson_id
       WHERE llfp.file_id = $1
       ORDER BY llfp.sort_order ASC, llfp.id ASC`,
      [file.id],
    ),
  ]);

  const placements = [
    ...sessionPlacementsRes.rows.map((p) => ({
      placementType: "class_session",
      placementId: String(p.id),
      unitType: p.class_session_id ? "class_session" : "live_class",
      unitId: p.class_session_id ? String(p.class_session_id) : null,
      liveClassId: String(p.live_class_id),
      courseId: p.placement_course_id ? String(p.placement_course_id) : null,
      sortOrder: Number(p.sort_order || 0),
      visibility: p.visibility || "CLASS_ONLY",
    })),
    ...lessonPlacementsRes.rows.map((p) => ({
      placementType: "lesson",
      placementId: String(p.id),
      unitType: "lesson",
      unitId: String(p.lesson_id),
      liveClassId: null,
      courseId: p.lesson_course_id ? String(p.lesson_course_id) : null,
      sortOrder: Number(p.sort_order || 0),
      visibility: "COURSE",
    })),
  ];

  const courseIds = new Set();
  const liveClassIds = new Set();
  if (file.course_id) courseIds.add(Number(file.course_id));
  if (file.live_class_id) liveClassIds.add(Number(file.live_class_id));
  for (const row of sessionPlacementsRes.rows) {
    if (row.live_class_id) liveClassIds.add(Number(row.live_class_id));
    if (row.placement_course_id) courseIds.add(Number(row.placement_course_id));
  }
  for (const row of lessonPlacementsRes.rows) {
    if (row.lesson_course_id) courseIds.add(Number(row.lesson_course_id));
  }

  let profileIds = [];
  if (courseIds.size > 0 || liveClassIds.size > 0) {
    const profRes = await db.query(
      `SELECT id
       FROM video_course_profiles
       WHERE deleted_at IS NULL
         AND status <> 'archived'
         AND (
           course_id = ANY($1::bigint[])
           OR source_live_class_id = ANY($2::bigint[])
         )
       ORDER BY id ASC`,
      [Array.from(courseIds), Array.from(liveClassIds)],
    );
    profileIds = profRes.rows.map((r) => String(r.id));
  }

  return { placements, profileIds };
}

/**
 * Emits `file.upserted` (or `file.tombstoned` when deleted) into `course_integration_outbox`.
 */
export async function recordLearningFileUpsertedOutbox({
  db = defaultDb,
  fileId,
  correlationId = null,
  now = () => new Date(),
} = {}) {
  const parsedFileId = parsePositiveId(fileId);
  if (!parsedFileId) return null;
  if (!(await hasIntegrationOutbox(db))) return null;

  const fileRes = await db.query(
    `SELECT f.*, lc.course_id AS class_course_id
     FROM lms_learning_files f
     LEFT JOIN live_classes lc ON lc.id = f.live_class_id
     WHERE f.id = $1
     LIMIT 1`,
    [parsedFileId],
  );
  const file = fileRes.rows[0] || null;
  if (!file) return null;

  if (file.status === "deleted" || file.deleted_at) {
    return recordLearningFileTombstonedOutbox({
      db,
      fileId: parsedFileId,
      deletedAt: file.deleted_at || file.updated_at || now(),
      correlationId,
      now,
    });
  }
  if (file.status !== "ready") return null;

  const occurredAt = toIso(now()) || new Date().toISOString();
  const rev = await allocateNextSyncRevision(db);
  await db.query(
    `UPDATE lms_learning_files
     SET sync_revision = GREATEST(sync_revision, $2)
     WHERE id = $1`,
    [parsedFileId, rev],
  );

  const { placements, profileIds } = await resolveFileAssociatedContext(db, file);
  const fileKind = inferFileKind(file.mime_type, file.original_name);
  const resolvedCourseId = file.course_id || file.class_course_id || null;

  const envelope = buildV2EventEnvelope({
    eventType: "file.upserted",
    aggregateType: "learning_file",
    aggregateId: String(parsedFileId),
    revision: rev,
    sourceUpdatedAt: toIso(file.updated_at) || occurredAt,
    occurredAt,
    deleted: false,
    deletedAt: null,
    correlationId,
    payload: {
      fileId: String(file.id),
      courseId: resolvedCourseId != null ? String(resolvedCourseId) : null,
      liveClassId: file.live_class_id != null ? String(file.live_class_id) : null,
      classSessionId: file.class_session_id != null ? String(file.class_session_id) : null,
      title: file.original_name,
      originalFilename: file.original_name,
      mimeType: file.mime_type || null,
      fileKind,
      isSlide: fileKind === "slides",
      sizeBytes: Number(file.size_bytes || 0),
      visibility: file.visibility || "CLASS_ONLY",
      status: file.status,
      allowView: true,
      revision: Number(rev),
      updatedAt: toIso(file.updated_at) || occurredAt,
      deleted: false,
      deletedAt: null,
      placements,
      profileIds,
    },
  });

  await insertOutboxEnvelopeIfReady(db, envelope);
  return envelope;
}

/**
 * Marks a file soft-deleted (`deleted_at`) if not already set and emits `file.tombstoned`.
 */
export async function recordLearningFileTombstonedOutbox({
  db = defaultDb,
  fileId,
  deletedAt = null,
  correlationId = null,
  now = () => new Date(),
} = {}) {
  const parsedFileId = parsePositiveId(fileId);
  if (!parsedFileId) return null;
  if (!(await hasIntegrationOutbox(db))) return null;

  const occurredAt = toIso(now()) || new Date().toISOString();
  const effectiveDeletedAt = toIso(deletedAt) || occurredAt;
  const rev = await allocateNextSyncRevision(db);

  const fileRes = await db.query(
    `UPDATE lms_learning_files
     SET status = 'deleted',
         deleted_at = COALESCE(deleted_at, $2::timestamptz),
         sync_revision = GREATEST(sync_revision, $3),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [parsedFileId, effectiveDeletedAt, rev],
  );
  const file = fileRes.rows[0] || null;
  if (!file) return null;

  const envelope = buildV2EventEnvelope({
    eventType: "file.tombstoned",
    aggregateType: "learning_file",
    aggregateId: String(parsedFileId),
    revision: rev,
    sourceUpdatedAt: toIso(file.deleted_at) || occurredAt,
    occurredAt,
    deleted: true,
    deletedAt: toIso(file.deleted_at) || effectiveDeletedAt,
    correlationId,
    payload: {
      fileId: String(file.id),
      courseId: file.course_id != null ? String(file.course_id) : null,
      liveClassId: file.live_class_id != null ? String(file.live_class_id) : null,
      classSessionId: file.class_session_id != null ? String(file.class_session_id) : null,
      title: file.original_name,
      originalFilename: file.original_name,
      revision: Number(rev),
      deleted: true,
      deletedAt: toIso(file.deleted_at) || effectiveDeletedAt,
    },
  });

  await insertOutboxEnvelopeIfReady(db, envelope);
  return envelope;
}

export async function safeRecordLearningFileUpsertedOutbox(args) {
  try {
    return await recordLearningFileUpsertedOutbox(args);
  } catch (err) {
    console.warn("[delegatedFiles] Failed to emit file.upserted outbox:", err?.message || err);
    return null;
  }
}

export async function safeRecordLearningFileTombstonedOutbox(args) {
  try {
    return await recordLearningFileTombstonedOutbox(args);
  } catch (err) {
    console.warn("[delegatedFiles] Failed to emit file.tombstoned outbox:", err?.message || err);
    return null;
  }
}

async function resolveFileMembershipInProfile(db, { file, profileRow, units }) {
  const unitIdSet = new Set(units.map((u) => String(u.id)));
  const matchedUnitIds = new Set();
  let matchedClassAllowDownload = null;
  let classWideMatch = false;

  if (profileRow.mode === "MIRROR" && profileRow.source_live_class_id) {
    if (
      file.class_session_id
      && String(file.live_class_id || "") === String(profileRow.source_live_class_id)
      && unitIdSet.has(String(file.class_session_id))
    ) {
      matchedUnitIds.add(String(file.class_session_id));
      matchedClassAllowDownload = file.class_allow_file_download;
    }

    const [placedRes, quizFileRes] = await Promise.all([
      db.query(
        `SELECT lfp.live_class_id, lfp.class_session_id, COALESCE(lc.allow_file_download, TRUE) AS allow_file_download
         FROM lms_learning_file_placements lfp
         JOIN live_classes lc ON lc.id = lfp.live_class_id
         WHERE lfp.file_id = $1 AND lfp.live_class_id = $2 AND lfp.deleted_at IS NULL`,
        [file.id, profileRow.source_live_class_id],
      ),
      db.query(
        `SELECT class_session_id
         FROM quizzes
         WHERE status = 'PUBLISHED'
           AND class_session_id = ANY($2::bigint[])
           AND (paper_file_id = $1 OR solution_file_id = $1)`,
        [file.id, units.map((u) => Number(u.id))],
      ),
    ]);

    for (const row of placedRes.rows) {
      if (row.class_session_id && unitIdSet.has(String(row.class_session_id))) {
        matchedUnitIds.add(String(row.class_session_id));
      } else if (!row.class_session_id) {
        classWideMatch = true;
      }
      if (matchedClassAllowDownload === null) {
        matchedClassAllowDownload = row.allow_file_download;
      } else if (row.allow_file_download === false) {
        matchedClassAllowDownload = false;
      }
    }

    for (const row of quizFileRes.rows) {
      if (row.class_session_id && unitIdSet.has(String(row.class_session_id))) {
        matchedUnitIds.add(String(row.class_session_id));
      }
    }

    if (
      !file.class_session_id
      && String(file.live_class_id || "") === String(profileRow.source_live_class_id)
    ) {
      classWideMatch = true;
      if (matchedClassAllowDownload === null) {
        matchedClassAllowDownload = file.class_allow_file_download;
      }
    }
  } else {
    const [placedRes, quizFileRes] = await Promise.all([
      db.query(
        `SELECT llfp.lesson_id
         FROM lesson_learning_file_placements llfp
         WHERE llfp.file_id = $1 AND llfp.lesson_id = ANY($2::bigint[])`,
        [file.id, units.map((u) => Number(u.id))],
      ),
      db.query(
        `SELECT lesson_id
         FROM quizzes
         WHERE status = 'PUBLISHED'
           AND lesson_id = ANY($2::bigint[])
           AND (paper_file_id = $1 OR solution_file_id = $1)`,
        [file.id, units.map((u) => Number(u.id))],
      ),
    ]);

    for (const row of [...placedRes.rows, ...quizFileRes.rows]) {
      if (row.lesson_id && unitIdSet.has(String(row.lesson_id))) {
        matchedUnitIds.add(String(row.lesson_id));
      }
    }
  }

  const fileCourseId = file.course_id || file.class_course_id || null;
  const courseWideMatch = file.visibility === "COURSE"
    && fileCourseId != null
    && String(fileCourseId) === String(profileRow.course_id);

  return {
    matchedUnitIds,
    classWideMatch,
    courseWideMatch,
    matchedClassAllowDownload,
  };
}

async function assertQuizSolutionNotEmbargoed(db, { fileId, userId = null, currentNow }) {
  const solRes = await db.query(
    `SELECT id, title, review_policy, available_until, due_date, activity_scope
     FROM quizzes
     WHERE solution_file_id = $1 AND status = 'PUBLISHED'`,
    [fileId],
  );
  if (solRes.rows.length === 0) return;

  for (const quiz of solRes.rows) {
    if (!userId) {
      throw new ExternalIntegrationError(
        403,
        "SOLUTION_EMBARGOED",
        "Quiz solution file cannot be viewed before completing the quiz and opening review.",
      );
    }
    if (!reviewIsAvailable(quiz, currentNow)) {
      throw new ExternalIntegrationError(
        403,
        "SOLUTION_EMBARGOED",
        "Quiz solution file is currently embargoed by review policy.",
      );
    }
    const policy = quiz.review_policy || "after_submit";
    if (policy === "after_submit") {
      const attemptRes = await db.query(
        `SELECT 1
         FROM quiz_attempts
         WHERE quiz_id = $1 AND user_id = $2
           AND (status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR submitted_at IS NOT NULL)
         LIMIT 1`,
        [quiz.id, userId],
      );
      if (attemptRes.rows.length === 0) {
        throw new ExternalIntegrationError(
          403,
          "SOLUTION_EMBARGOED",
          "Submit at least one attempt before viewing the solution file.",
        );
      }
    }
  }
}

/**
 * Authorizes and streams (or returns metadata/watermark info for) a Course learning file
 * over S2S delegated session or verified public preview inline view.
 */
export async function streamDelegatedLearningFile({
  db = defaultDb,
  fileId,
  sessionToken = null,
  profileId = null,
  unitId = null,
  disposition = "inline",
  mode = "stream",
  rangeHeader = null,
  ttlSeconds = MAX_STREAM_TTL_SECONDS,
  fetchImpl = globalThis.fetch,
  readStreamImpl = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  if (isDelegatedLearningKillSwitchActive(env)) {
    throw new ExternalIntegrationError(
      503,
      "SYNC_KILL_SWITCH_ACTIVE",
      "Delegated learning endpoints are paused by kill switch.",
    );
  }

  const parsedFileId = parsePositiveId(fileId);
  if (!parsedFileId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "fileId must be a positive integer.");
  }
  const normalizedDisposition = String(disposition || "inline").trim().toLowerCase();
  if (normalizedDisposition !== "inline" && normalizedDisposition !== "attachment") {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "disposition must be 'inline' or 'attachment'.");
  }
  const normalizedMode = String(mode || "stream").trim().toLowerCase();
  if (normalizedMode !== "stream" && normalizedMode !== "metadata") {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "mode must be 'stream' or 'metadata'.");
  }

  const currentNow = typeof now === "function" ? now() : new Date();
  let session = null;
  let profileRow = null;

  if (sessionToken && String(sessionToken).trim()) {
    const resolved = await verifyAndResolveDelegatedSession({
      db,
      sessionToken,
      requiredScope: normalizedDisposition === "attachment" ? "file:download" : "file:view",
      expectedProfileId: profileId != null && String(profileId).trim() !== "" ? profileId : null,
      now,
      env,
    });
    session = resolved.session;
    profileRow = resolved.profileRow;
  } else {
    // Public preview fallback: inline view only, requires explicit profileId + preview unitId.
    if (normalizedDisposition === "attachment") {
      throw new ExternalIntegrationError(
        401,
        "INVALID_DELEGATED_SESSION",
        "Delegated learning session token is required for file download.",
      );
    }
    if (!profileId || !unitId) {
      throw new ExternalIntegrationError(
        401,
        "INVALID_DELEGATED_SESSION",
        "Delegated learning session token is required.",
      );
    }
    profileRow = await resolveProfileAndCourse(db, profileId);
  }

  const fileRes = await db.query(
    `SELECT f.*, lc.course_id AS class_course_id, COALESCE(lc.allow_file_download, TRUE) AS class_allow_file_download
     FROM lms_learning_files f
     LEFT JOIN live_classes lc ON lc.id = f.live_class_id
     WHERE f.id = $1 AND f.status = 'ready' AND f.deleted_at IS NULL
     LIMIT 1`,
    [parsedFileId],
  );
  const file = fileRes.rows[0] || null;
  if (!file) {
    throw new ExternalIntegrationError(404, "FILE_NOT_FOUND", `Learning file ${parsedFileId} not found.`);
  }
  if (file.visibility === "PRIVATE") {
    throw new ExternalIntegrationError(403, "FILE_ACCESS_FORBIDDEN", "Private files cannot be accessed by learners.");
  }

  const isAdminSession = Boolean(session && isDelegatedAdminRole(session.user_role));
  const rawUnits = await loadProfileUnitsWithProgress(db, {
    profileRow,
    userId: session ? session.user_id : null,
  });
  const units = applySequentialLocks(rawUnits, {
    isPublicPreviewAccess: !session,
    bypassSequentialLock: isAdminSession,
  });

  const membership = await resolveFileMembershipInProfile(db, { file, profileRow, units });

  let resolvedUnit = null;
  if (unitId != null && String(unitId).trim() !== "") {
    resolvedUnit = units.find((u) => String(u.id) === String(unitId).trim()) || null;
    if (!resolvedUnit) {
      await assertUnitNotCrossProfile(db, { profileRow, unitId });
      throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Unit ${unitId} not found in profile ${profileRow.profile_id}.`);
    }
    if (!session && !resolvedUnit.isPublicPreview) {
      throw new ExternalIntegrationError(
        401,
        "INVALID_DELEGATED_SESSION",
        "Delegated learning session token is required for non-preview units.",
      );
    }
    const belongsToUnit = membership.matchedUnitIds.has(String(resolvedUnit.id));
    const allowedViaScope = Boolean(session) && (membership.classWideMatch || membership.courseWideMatch)
      && (membership.matchedUnitIds.size === 0 || belongsToUnit);
    if (!belongsToUnit && !allowedViaScope) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        `File ${parsedFileId} does not belong to unit ${unitId} in profile ${profileRow.profile_id}.`,
      );
    }
    if (resolvedUnit.isLocked) {
      throw new ExternalIntegrationError(
        403,
        "UNIT_LOCKED",
        resolvedUnit.lockReason || "Unit is locked by sequential progression.",
        { unitId: resolvedUnit.id, requiredPrevUnitId: resolvedUnit.requiredPrevUnitId },
      );
    }
  } else {
    const matchedUnits = units.filter((u) => membership.matchedUnitIds.has(String(u.id)));
    if (matchedUnits.length > 0) {
      const unlockedMatch = matchedUnits.find((u) => !u.isLocked) || null;
      if (!unlockedMatch) {
        const firstLocked = matchedUnits[0];
        throw new ExternalIntegrationError(
          403,
          "UNIT_LOCKED",
          firstLocked.lockReason || "Unit is locked by sequential progression.",
          { unitId: firstLocked.id, requiredPrevUnitId: firstLocked.requiredPrevUnitId },
        );
      }
      resolvedUnit = unlockedMatch;
    } else if (!membership.classWideMatch && !membership.courseWideMatch) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        `File ${parsedFileId} does not belong to profile ${profileRow.profile_id}.`,
      );
    }
  }

  if (!isAdminSession) {
    await assertQuizSolutionNotEmbargoed(db, {
      fileId: parsedFileId,
      userId: session ? session.user_id : null,
      currentNow,
    });
  }

  const allowDownload = Boolean(
    session
    && profileRow.allow_file_download === true
    && file.class_allow_file_download !== false
    && membership.matchedClassAllowDownload !== false,
  );
  if (normalizedDisposition === "attachment" && !allowDownload) {
    throw new ExternalIntegrationError(
      403,
      "FILE_DOWNLOAD_FORBIDDEN",
      "File downloads are disabled for this offering profile.",
    );
  }

  const parsedTtl = Number(ttlSeconds);
  const effectiveTtl = Math.max(
    1,
    Math.min(MAX_STREAM_TTL_SECONDS, Number.isFinite(parsedTtl) && parsedTtl > 0 ? Math.floor(parsedTtl) : MAX_STREAM_TTL_SECONDS),
  );
  const expiresAtEpoch = Math.floor(currentNow.getTime() / 1000) + effectiveTtl;
  const expiresAtIso = new Date(expiresAtEpoch * 1000).toISOString();
  const contentDisposition = buildContentDispositionHeader(normalizedDisposition, file.original_name);
  const fileKind = inferFileKind(file.mime_type, file.original_name);

  const watermark = session
    ? {
      userId: String(session.user_id),
      externalUserId: String(session.external_user_id),
      email: session.user_email || null,
      label: `${session.user_email || session.external_user_id} · #${session.user_id}`,
    }
    : {
      mode: "public_preview",
      label: "Moly Preview",
    };

  if (normalizedMode === "metadata") {
    recordIntegrationMetric("course.delegated_file_metadata");
    observeIntegrationLatency("course.delegated_file_ms", Date.now() - startMs);
    return {
      mode: "metadata",
      fileId: String(file.id),
      profileId: String(profileRow.profile_id),
      courseId: String(profileRow.course_id),
      unitId: resolvedUnit ? String(resolvedUnit.id) : null,
      title: file.original_name,
      originalFilename: file.original_name,
      mimeType: file.mime_type || "application/octet-stream",
      fileKind,
      isSlide: fileKind === "slides",
      sizeBytes: Number(file.size_bytes || 0),
      revision: Number(file.sync_revision || 1),
      allowView: true,
      allowDownload,
      disposition: normalizedDisposition,
      contentDisposition,
      ttlSeconds: effectiveTtl,
      expiresAt: expiresAtIso,
      ttlInfo: {
        ttlSeconds: effectiveTtl,
        expiresAt: expiresAtIso,
      },
      watermark,
    };
  }

  let upstreamStatus = 200;
  let upstreamHeaders = {};
  let body = null;

  if (typeof readStreamImpl === "function") {
    const customResult = await readStreamImpl({
      file,
      profileRow,
      unitId: resolvedUnit ? String(resolvedUnit.id) : null,
      rangeHeader: rangeHeader || null,
      disposition: normalizedDisposition,
      mimeType: file.mime_type || "application/octet-stream",
      ttlSeconds: effectiveTtl,
      expiresAt: expiresAtIso,
      watermark,
    });
    upstreamStatus = Number(customResult?.status || (rangeHeader ? 206 : 200));
    upstreamHeaders = customResult?.headers || {};
    body = customResult?.body ?? customResult?.stream ?? Buffer.alloc(0);
  } else {
    let signed;
    try {
      signed = await generateLearningFilePlaybackSignedUrl({
        r2Key: file.storage_key,
        filename: file.original_name,
        disposition: normalizedDisposition,
        mimeType: normalizedDisposition === "inline" ? file.mime_type : undefined,
        ttlSeconds: effectiveTtl,
        maxTtlSeconds: MAX_STREAM_TTL_SECONDS,
      });
    } catch (err) {
      if (err?.code === "R2_NOT_CONFIGURED") {
        throw new ExternalIntegrationError(503, "STORAGE_UNAVAILABLE", "File storage provider is not configured.");
      }
      throw err;
    }

    const requestHeaders = {};
    if (rangeHeader && String(rangeHeader).trim()) {
      requestHeaders.Range = String(rangeHeader).trim();
    }
    const upstreamRes = await fetchImpl(signed.downloadUrl, {
      method: "GET",
      headers: requestHeaders,
    });
    upstreamStatus = upstreamRes.status;
    if (upstreamStatus === 416) {
      const contentRange = upstreamRes.headers?.get?.("content-range") || null;
      return {
        mode: "stream",
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          ...(contentRange ? { "Content-Range": contentRange } : {}),
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
        body: Buffer.alloc(0),
        ttlSeconds: effectiveTtl,
        expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
      };
    }
    if (!upstreamRes.ok) {
      throw new ExternalIntegrationError(502, "FILE_STREAM_FAILED", `Failed to fetch upstream file (${upstreamStatus}).`);
    }
    upstreamHeaders = {
      "content-type": upstreamRes.headers?.get?.("content-type") || null,
      "content-range": upstreamRes.headers?.get?.("content-range") || null,
      "content-length": upstreamRes.headers?.get?.("content-length") || null,
      "accept-ranges": upstreamRes.headers?.get?.("accept-ranges") || "bytes",
    };
    const hasStreamBody = Boolean(
      upstreamRes.body
      && (typeof upstreamRes.body.getReader === "function" || typeof upstreamRes.body.pipe === "function"),
    );
    body = hasStreamBody
      ? upstreamRes.body
      : Buffer.from(await upstreamRes.arrayBuffer());
  }

  const pickHeader = (name) => {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(upstreamHeaders || {})) {
      if (k.toLowerCase() === lower && v != null && String(v).trim() !== "") return String(v);
    }
    return null;
  };

  const fallbackContentLength = Buffer.isBuffer(body)
    ? String(body.length)
    : (!rangeHeader && file.size_bytes != null ? String(file.size_bytes) : null);
  const resolvedContentLength = pickHeader("content-length") || fallbackContentLength;

  const resolvedHeaders = {
    "Content-Type": pickHeader("content-type") || file.mime_type || "application/octet-stream",
    "Content-Disposition": contentDisposition,
    "Accept-Ranges": pickHeader("accept-ranges") || "bytes",
    ...(pickHeader("content-range") ? { "Content-Range": pickHeader("content-range") } : {}),
    ...(resolvedContentLength ? { "Content-Length": resolvedContentLength } : {}),
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
  };

  recordIntegrationMetric("course.delegated_file_stream");
  observeIntegrationLatency("course.delegated_file_ms", Date.now() - startMs);

  return {
    mode: "stream",
    status: upstreamStatus,
    headers: resolvedHeaders,
    body,
    ttlSeconds: effectiveTtl,
    expiresAt: expiresAtIso,
  };
}
