import { getClient, query } from "../db/connect.js";
import {
  allocateNextSyncRevision,
  buildV2EventEnvelope,
  insertOutboxEnvelopeIfReady,
} from "./courseCatalogSync.service.js";
import {
  applySequentialLocks,
  assertUnitNotCrossProfile,
  loadProfileUnitsWithProgress,
  parsePositiveId,
  resolveProfileAndCourse,
  runDelegatedTx,
  toIso,
  verifyAndResolveDelegatedSession,
} from "./delegatedLearning.service.js";
import { ExternalIntegrationError } from "./externalCourseMapping.service.js";
import {
  isDelegatedLearningKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
} from "./integrationLogger.service.js";

const defaultDb = { query, getClient };

const VALID_QA_STATUSES = new Set(["open", "answered", "resolved"]);

async function hasIntegrationOutbox(db) {
  try {
    const res = await db.query(`SELECT to_regclass('public.course_integration_outbox') AS reg`);
    return Boolean(res.rows[0]?.reg);
  } catch {
    return false;
  }
}

async function resolveExternalUserIdsForUser(db, userId, preferredExternalUserId = null) {
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

const parseExpectedRevision = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "expectedRevision must be a positive integer.");
  }
  return parsed;
};

const normalizeTimestampSeconds = (value, fieldName = "timestampSeconds") => {
  const raw = value === undefined || value === null || value === "" ? 0 : Number(value);
  if (!Number.isFinite(raw) || raw < 0) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", `${fieldName} must be a non-negative number.`);
  }
  return Math.max(0, Math.floor(raw));
};

const normalizeNoteContent = (value, { required = true } = {}) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Note content must be a string.");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Note content cannot be empty.");
  }
  if (trimmed.length > 5000) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Note content must not exceed 5000 characters.");
  }
  return trimmed;
};

const normalizeBookmarkLabel = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Bookmark label must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length > 255) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Bookmark label must not exceed 255 characters.");
  }
  return trimmed;
};

const normalizeQaTitle = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Q&A thread title is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length > 255) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Q&A thread title must not exceed 255 characters.");
  }
  return trimmed;
};

const normalizeQaBody = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Q&A message body is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length > 10000) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Q&A message body must not exceed 10000 characters.");
  }
  return trimmed;
};

const normalizeQaAttachments = (attachments) => {
  if (attachments === undefined || attachments === null) return [];
  if (!Array.isArray(attachments)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "attachments must be an array.");
  }
  if (attachments.length > 10) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "At most 10 attachments are allowed per message.");
  }
  return attachments.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Each attachment must be an object.");
    }
    const clean = {};
    if (item.fileId !== undefined && item.fileId !== null) clean.fileId = String(item.fileId);
    if (typeof item.filename === "string" && item.filename.trim()) clean.filename = item.filename.trim().slice(0, 255);
    if (typeof item.mimeType === "string" && item.mimeType.trim()) clean.mimeType = item.mimeType.trim().slice(0, 120);
    if (typeof item.url === "string" && /^https:\/\//i.test(item.url.trim())) {
      clean.url = item.url.trim().slice(0, 1000);
    }
    return clean;
  });
};

const normalizeIdempotencyKey = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > 180) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "idempotencyKey exceeds 180 characters.");
  }
  return trimmed;
};

const authorKindFromRole = (role) => {
  if (role === "admin") return "admin";
  if (role === "creator") return "teacher";
  return "student";
};

const formatNote = (row) => ({
  id: String(row.id),
  userId: String(row.user_id),
  courseId: String(row.course_id),
  unitId: String(row.class_session_id || row.lesson_id),
  unitType: row.class_session_id ? "class_session" : "lesson",
  timestampSeconds: Number(row.timestamp_seconds || 0),
  content: row.content,
  revision: Number(row.revision || 1),
  deletedAt: toIso(row.deleted_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at || row.created_at),
});

const formatBookmark = (row) => ({
  id: String(row.id),
  userId: String(row.user_id),
  courseId: String(row.course_id),
  profileId: row.video_course_profile_id ? String(row.video_course_profile_id) : null,
  unitId: String(row.class_session_id || row.lesson_id),
  unitType: row.class_session_id ? "class_session" : "lesson",
  videoAssetId: row.video_asset_id ? String(row.video_asset_id) : null,
  timestampSeconds: Number(row.timestamp_seconds || 0),
  label: row.label || "",
  revision: Number(row.revision || 1),
  deletedAt: toIso(row.deleted_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at || row.created_at),
});

const formatQaMessage = (row) => ({
  id: String(row.id),
  threadId: String(row.thread_id),
  authorId: String(row.author_id),
  authorName: row.author_name || "Thành viên",
  authorKind: row.author_kind || "student",
  body: row.body,
  attachments: Array.isArray(row.attachments_json) ? row.attachments_json : [],
  revision: Number(row.revision || 1),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at || row.created_at),
});

const formatQaThread = (row, messages = [], viewerUserId = null) => {
  const effectiveViewerId = viewerUserId ? String(viewerUserId) : null;
  const lastReadAt = row.last_read_by_student_at ? new Date(row.last_read_by_student_at).getTime() : 0;
  const hasUnreadReplies = effectiveViewerId
    ? messages.some((m) => (
      String(m.authorId) !== effectiveViewerId
      && new Date(m.createdAt).getTime() > lastReadAt
    ))
    : false;
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    profileId: row.video_course_profile_id ? String(row.video_course_profile_id) : null,
    unitId: String(row.class_session_id || row.lesson_id),
    unitType: row.class_session_id ? "class_session" : "lesson",
    authorId: String(row.author_id),
    authorName: row.author_name || "Học viên",
    authorRole: row.author_role || "user",
    title: row.title,
    status: row.status,
    isPinned: Boolean(row.is_pinned),
    lastReadByStudentAt: toIso(row.last_read_by_student_at),
    lastMessageAt: toIso(row.last_message_at),
    hasUnreadReplies,
    revision: Number(row.revision || 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at || row.created_at),
    messages,
  };
};

async function assertSessionHasAnyScope(session, acceptedScopes) {
  const held = new Set(session.scopes || []);
  if (!acceptedScopes.some((s) => held.has(s))) {
    throw new ExternalIntegrationError(
      403,
      "DELEGATED_SCOPE_DENIED",
      `Delegated session lacks required scope (${acceptedScopes.join(" or ")}).`,
    );
  }
}

async function resolveDelegatedUnitContext({
  db,
  sessionToken,
  acceptedScopes,
  profileId,
  unitId,
  isMutation = false,
  now = () => new Date(),
  env = process.env,
}) {
  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: null,
    expectedProfileId: profileId,
    isMutation,
    now,
    env,
  });
  await assertSessionHasAnyScope(session, acceptedScopes);

  const parsedUnitId = parsePositiveId(unitId);
  if (!parsedUnitId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "unitId must be a positive integer.");
  }

  const rawUnits = await loadProfileUnitsWithProgress(db, {
    profileRow,
    userId: session.user_id,
  });
  const units = applySequentialLocks(rawUnits, { isPublicPreviewAccess: false });
  const targetUnit = units.find((u) => String(u.id) === String(parsedUnitId)) || null;
  if (!targetUnit) {
    await assertUnitNotCrossProfile(db, { profileRow, unitId: parsedUnitId });
    throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Unit ${parsedUnitId} not found in profile ${profileRow.profile_id}.`);
  }
  if (targetUnit.isLocked) {
    throw new ExternalIntegrationError(403, "UNIT_LOCKED", "Complete prior learning units before accessing this unit.");
  }

  const unitType = targetUnit.type;
  return {
    session,
    profileRow,
    targetUnit,
    unitType,
    unitId: Number(targetUnit.id),
    unitCol: unitType === "class_session" ? "class_session_id" : "lesson_id",
    classSessionId: unitType === "class_session" ? Number(targetUnit.id) : null,
    lessonId: unitType === "lesson" ? Number(targetUnit.id) : null,
  };
}

async function loadThreadWithMessages(db, threadId, viewerUserId = null) {
  const threadRes = await db.query(
    `SELECT t.*,
            COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.management_display_name, ''), u.username, 'Học viên') AS author_name
     FROM learning_unit_qa_threads t
     LEFT JOIN users u ON u.id = t.author_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE t.id = $1 AND t.deleted_at IS NULL
     LIMIT 1`,
    [threadId],
  );
  const thread = threadRes.rows[0];
  if (!thread) return null;

  const msgRes = await db.query(
    `SELECT m.*,
            COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.management_display_name, ''), u.username, 'Thành viên') AS author_name
     FROM learning_unit_qa_messages m
     LEFT JOIN users u ON u.id = m.author_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE m.thread_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.created_at ASC, m.id ASC`,
    [threadId],
  );
  return formatQaThread(thread, msgRes.rows.map(formatQaMessage), viewerUserId);
}

async function findActiveProfileIdForUnit(db, { courseId, classSessionId = null, lessonId = null, preferredProfileId = null }) {
  if (preferredProfileId) return String(preferredProfileId);
  if (classSessionId) {
    const res = await db.query(
      `SELECT vcp.id
       FROM class_sessions cs
       JOIN video_course_profiles vcp
         ON vcp.mode = 'MIRROR' AND vcp.source_live_class_id = cs.live_class_id
       WHERE cs.id = $1 AND vcp.status = 'active'
       ORDER BY vcp.id ASC
       LIMIT 1`,
      [classSessionId],
    );
    if (res.rows[0]?.id) return String(res.rows[0].id);
  }
  if (lessonId) {
    const res = await db.query(
      `SELECT vcp.id
       FROM lessons l
       JOIN video_course_profiles vcp
         ON vcp.mode = 'INDEPENDENT' AND vcp.course_id = l.course_id
       WHERE l.id = $1 AND vcp.status = 'active'
       ORDER BY vcp.id ASC
       LIMIT 1`,
      [lessonId],
    );
    if (res.rows[0]?.id) return String(res.rows[0].id);
  }
  if (courseId) {
    const res = await db.query(
      `SELECT id FROM video_course_profiles WHERE course_id = $1 AND status = 'active' ORDER BY id ASC LIMIT 1`,
      [courseId],
    );
    if (res.rows[0]?.id) return String(res.rows[0].id);
  }
  return null;
}

async function emitNoteOutbox(tx, {
  eventType,
  noteRow,
  profileId = null,
  preferredExternalUserId = null,
  correlationId = null,
  occurredAt,
}) {
  if (!(await hasIntegrationOutbox(tx))) return null;
  const externalUserIds = await resolveExternalUserIdsForUser(tx, noteRow.user_id, preferredExternalUserId);
  if (externalUserIds.length === 0) return null;

  const resolvedProfileId = await findActiveProfileIdForUnit(tx, {
    courseId: noteRow.course_id,
    classSessionId: noteRow.class_session_id,
    lessonId: noteRow.lesson_id,
    preferredProfileId: profileId,
  });
  const syncRev = await allocateNextSyncRevision(tx);
  const deleted = Boolean(noteRow.deleted_at);
  const formatted = formatNote(noteRow);
  const envelope = buildV2EventEnvelope({
    eventType,
    aggregateType: "learning_unit_note",
    aggregateId: String(noteRow.id),
    revision: syncRev,
    sourceUpdatedAt: toIso(noteRow.updated_at || noteRow.created_at) || occurredAt,
    occurredAt,
    deleted,
    deletedAt: deleted ? toIso(noteRow.deleted_at) : null,
    correlationId,
    payload: {
      userId: String(noteRow.user_id),
      externalUserId: externalUserIds[0],
      externalUserIds,
      courseId: String(noteRow.course_id),
      profileId: resolvedProfileId,
      unitId: formatted.unitId,
      unitType: formatted.unitType,
      noteId: formatted.id,
      noteRevision: formatted.revision,
      note: deleted ? null : formatted,
      deleted,
      deletedAt: formatted.deletedAt,
    },
  });
  await insertOutboxEnvelopeIfReady(tx, envelope);
  return envelope;
}

async function emitBookmarkOutbox(tx, {
  eventType,
  bookmarkRow,
  profileId = null,
  preferredExternalUserId = null,
  correlationId = null,
  occurredAt,
}) {
  if (!(await hasIntegrationOutbox(tx))) return null;
  const externalUserIds = await resolveExternalUserIdsForUser(tx, bookmarkRow.user_id, preferredExternalUserId);
  if (externalUserIds.length === 0) return null;

  const resolvedProfileId = await findActiveProfileIdForUnit(tx, {
    courseId: bookmarkRow.course_id,
    classSessionId: bookmarkRow.class_session_id,
    lessonId: bookmarkRow.lesson_id,
    preferredProfileId: profileId || bookmarkRow.video_course_profile_id,
  });
  const syncRev = await allocateNextSyncRevision(tx);
  const deleted = Boolean(bookmarkRow.deleted_at);
  const formatted = formatBookmark(bookmarkRow);
  const envelope = buildV2EventEnvelope({
    eventType,
    aggregateType: "learning_unit_bookmark",
    aggregateId: String(bookmarkRow.id),
    revision: syncRev,
    sourceUpdatedAt: toIso(bookmarkRow.updated_at || bookmarkRow.created_at) || occurredAt,
    occurredAt,
    deleted,
    deletedAt: deleted ? toIso(bookmarkRow.deleted_at) : null,
    correlationId,
    payload: {
      userId: String(bookmarkRow.user_id),
      externalUserId: externalUserIds[0],
      externalUserIds,
      courseId: String(bookmarkRow.course_id),
      profileId: resolvedProfileId,
      unitId: formatted.unitId,
      unitType: formatted.unitType,
      bookmarkId: formatted.id,
      bookmarkRevision: formatted.revision,
      bookmark: deleted ? null : formatted,
      deleted,
      deletedAt: formatted.deletedAt,
    },
  });
  await insertOutboxEnvelopeIfReady(tx, envelope);
  return envelope;
}

async function emitQaThreadOutbox(tx, {
  threadId,
  latestMessageRow = null,
  actorUserId = null,
  preferredExternalUserId = null,
  correlationId = null,
  occurredAt,
}) {
  if (!(await hasIntegrationOutbox(tx))) return null;
  const formattedThread = await loadThreadWithMessages(tx, threadId, null);
  if (!formattedThread) return null;

  const threadAuthorExternalIds = await resolveExternalUserIdsForUser(
    tx,
    Number(formattedThread.authorId),
    String(formattedThread.authorId) === String(actorUserId) ? preferredExternalUserId : null,
  );
  const actorExternalIds = actorUserId && String(actorUserId) !== String(formattedThread.authorId)
    ? await resolveExternalUserIdsForUser(tx, actorUserId, preferredExternalUserId)
    : [];

  const allProfileIds = new Set();
  if (formattedThread.profileId) allProfileIds.add(String(formattedThread.profileId));
  const resolvedProfileId = await findActiveProfileIdForUnit(tx, {
    courseId: Number(formattedThread.courseId),
    classSessionId: formattedThread.unitType === "class_session" ? Number(formattedThread.unitId) : null,
    lessonId: formattedThread.unitType === "lesson" ? Number(formattedThread.unitId) : null,
    preferredProfileId: formattedThread.profileId,
  });
  if (resolvedProfileId) allProfileIds.add(resolvedProfileId);

  const syncRev = await allocateNextSyncRevision(tx);
  const envelope = buildV2EventEnvelope({
    eventType: "qa.thread.updated",
    aggregateType: "learning_unit_qa_thread",
    aggregateId: String(formattedThread.id),
    revision: syncRev,
    sourceUpdatedAt: formattedThread.updatedAt || occurredAt,
    occurredAt,
    deleted: false,
    deletedAt: null,
    correlationId,
    payload: {
      courseId: formattedThread.courseId,
      profileId: resolvedProfileId,
      profileIds: Array.from(allProfileIds),
      unitId: formattedThread.unitId,
      unitType: formattedThread.unitType,
      threadId: formattedThread.id,
      threadRevision: formattedThread.revision,
      authorId: formattedThread.authorId,
      authorExternalUserId: threadAuthorExternalIds[0] || actorExternalIds[0] || null,
      externalUserId: threadAuthorExternalIds[0] || actorExternalIds[0] || null,
      externalUserIds: threadAuthorExternalIds,
      actorUserId: actorUserId != null ? String(actorUserId) : null,
      actorExternalUserIds: actorExternalIds,
      thread: formattedThread,
      latestMessage: latestMessageRow
        ? (formattedThread.messages.find((m) => String(m.id) === String(latestMessageRow.id)) || null)
        : null,
    },
  });
  await insertOutboxEnvelopeIfReady(tx, envelope);
  return envelope;
}

// ============================================================================
// Shared Authorized Unit Operations (called by both Delegated v2 & Native LMS)
// ============================================================================

export async function listUnitNotesForAuthorizedUnit({
  db = defaultDb,
  userId,
  classSessionId = null,
  lessonId = null,
}) {
  const unitCol = classSessionId ? "class_session_id" : "lesson_id";
  const unitId = classSessionId || lessonId;
  const res = await db.query(
    `SELECT *
     FROM video_course_unit_notes
     WHERE user_id = $1 AND ${unitCol} = $2 AND deleted_at IS NULL
     ORDER BY timestamp_seconds ASC, id ASC`,
    [userId, unitId],
  );
  return res.rows.map(formatNote);
}

export async function createUnitNoteForAuthorizedUnit({
  db = defaultDb,
  userId,
  courseId,
  profileId = null,
  classSessionId = null,
  lessonId = null,
  timestampSeconds = 0,
  content,
  idempotencyKey = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const cleanContent = normalizeNoteContent(content, { required: true });
  const cleanTs = normalizeTimestampSeconds(timestampSeconds);
  const cleanIdem = normalizeIdempotencyKey(idempotencyKey);
  const currentNow = now();
  const occurredAt = currentNow.toISOString();

  return runDelegatedTx(db, async (tx) => {
    if (cleanIdem) {
      const existing = await tx.query(
        `SELECT * FROM video_course_unit_notes WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [userId, cleanIdem],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].deleted_at) {
          throw new ExternalIntegrationError(409, "NOTE_ALREADY_DELETED", "Idempotent note was already deleted.");
        }
        return { note: formatNote(existing.rows[0]), idempotentReplay: true };
      }
    }

    const insertRes = await tx.query(
      `INSERT INTO video_course_unit_notes
         (user_id, course_id, class_session_id, lesson_id, timestamp_seconds, content, revision, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [userId, courseId, classSessionId, lessonId, cleanTs, cleanContent, cleanIdem],
    );

    let row = insertRes.rows[0] || null;
    if (!row && cleanIdem) {
      const existing = await tx.query(
        `SELECT * FROM video_course_unit_notes WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [userId, cleanIdem],
      );
      row = existing.rows[0] || null;
      if (row) {
        return { note: formatNote(row), idempotentReplay: true };
      }
    }

    await emitNoteOutbox(tx, {
      eventType: "learning.note.upserted",
      noteRow: row,
      profileId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    return { note: formatNote(row), idempotentReplay: false };
  });
}

export async function updateUnitNoteForAuthorizedUnit({
  db = defaultDb,
  userId,
  noteId,
  profileId = null,
  classSessionId = null,
  lessonId = null,
  timestampSeconds,
  content,
  expectedRevision = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const parsedNoteId = parsePositiveId(noteId);
  if (!parsedNoteId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "noteId must be a positive integer.");
  }
  const cleanExpectedRev = parseExpectedRevision(expectedRevision);
  const cleanContent = normalizeNoteContent(content, { required: false });
  const cleanTs = timestampSeconds !== undefined ? normalizeTimestampSeconds(timestampSeconds) : undefined;
  if (cleanContent === undefined && cleanTs === undefined) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "At least content or timestampSeconds must be provided.");
  }
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    const existingRes = await tx.query(
      `SELECT * FROM video_course_unit_notes WHERE id = $1 FOR UPDATE`,
      [parsedNoteId],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note not found.");
    }
    if (String(existing.user_id) !== String(userId)) {
      throw new ExternalIntegrationError(403, "FORBIDDEN", "You can only modify your own notes.");
    }
    if (classSessionId != null && String(existing.class_session_id || "") !== String(classSessionId)) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note does not belong to this unit.");
    }
    if (lessonId != null && String(existing.lesson_id || "") !== String(lessonId)) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note does not belong to this unit.");
    }

    if (cleanExpectedRev !== null && Number(existing.revision) !== cleanExpectedRev) {
      throw new ExternalIntegrationError(
        409,
        "REVISION_CONFLICT",
        "Note revision conflict; reload the latest revision before saving.",
        {
          currentRevision: Number(existing.revision),
          deleted: Boolean(existing.deleted_at),
          note: existing.deleted_at ? null : formatNote(existing),
        },
      );
    }
    if (existing.deleted_at) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note was already deleted.");
    }

    const updatedRes = await tx.query(
      `UPDATE video_course_unit_notes
       SET content = $2,
           timestamp_seconds = $3,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        parsedNoteId,
        cleanContent !== undefined ? cleanContent : existing.content,
        cleanTs !== undefined ? cleanTs : existing.timestamp_seconds,
      ],
    );
    const updated = updatedRes.rows[0];

    await emitNoteOutbox(tx, {
      eventType: "learning.note.upserted",
      noteRow: updated,
      profileId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    return { note: formatNote(updated) };
  });
}

export async function deleteUnitNoteForAuthorizedUnit({
  db = defaultDb,
  userId,
  noteId,
  profileId = null,
  classSessionId = null,
  lessonId = null,
  expectedRevision = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const parsedNoteId = parsePositiveId(noteId);
  if (!parsedNoteId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "noteId must be a positive integer.");
  }
  const cleanExpectedRev = parseExpectedRevision(expectedRevision);
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    const existingRes = await tx.query(
      `SELECT * FROM video_course_unit_notes WHERE id = $1 FOR UPDATE`,
      [parsedNoteId],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note not found.");
    }
    if (String(existing.user_id) !== String(userId)) {
      throw new ExternalIntegrationError(403, "FORBIDDEN", "You can only delete your own notes.");
    }
    if (classSessionId != null && String(existing.class_session_id || "") !== String(classSessionId)) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note does not belong to this unit.");
    }
    if (lessonId != null && String(existing.lesson_id || "") !== String(lessonId)) {
      throw new ExternalIntegrationError(404, "NOTE_NOT_FOUND", "Note does not belong to this unit.");
    }

    if (cleanExpectedRev !== null && Number(existing.revision) !== cleanExpectedRev) {
      throw new ExternalIntegrationError(
        409,
        "REVISION_CONFLICT",
        "Note revision conflict; reload before deleting.",
        {
          currentRevision: Number(existing.revision),
          deleted: Boolean(existing.deleted_at),
          note: existing.deleted_at ? null : formatNote(existing),
        },
      );
    }
    if (existing.deleted_at) {
      return {
        deleted: true,
        id: String(existing.id),
        revision: Number(existing.revision),
        deletedAt: toIso(existing.deleted_at),
        alreadyDeleted: true,
      };
    }

    const deletedRes = await tx.query(
      `UPDATE video_course_unit_notes
       SET deleted_at = NOW(),
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [parsedNoteId],
    );
    const deletedRow = deletedRes.rows[0];

    await emitNoteOutbox(tx, {
      eventType: "learning.note.tombstoned",
      noteRow: deletedRow,
      profileId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    return {
      deleted: true,
      id: String(deletedRow.id),
      revision: Number(deletedRow.revision),
      deletedAt: toIso(deletedRow.deleted_at),
      alreadyDeleted: false,
    };
  });
}

export async function listUnitBookmarksForAuthorizedUnit({
  db = defaultDb,
  userId,
  classSessionId = null,
  lessonId = null,
}) {
  const unitCol = classSessionId ? "class_session_id" : "lesson_id";
  const unitId = classSessionId || lessonId;
  const res = await db.query(
    `SELECT *
     FROM video_course_unit_bookmarks
     WHERE user_id = $1 AND ${unitCol} = $2 AND deleted_at IS NULL
     ORDER BY timestamp_seconds ASC, id ASC`,
    [userId, unitId],
  );
  return res.rows.map(formatBookmark);
}

export async function createUnitBookmarkForAuthorizedUnit({
  db = defaultDb,
  userId,
  courseId,
  profileId = null,
  classSessionId = null,
  lessonId = null,
  videoAssetId = null,
  timestampSeconds = 0,
  label = "",
  idempotencyKey = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const cleanTs = normalizeTimestampSeconds(timestampSeconds);
  const cleanLabel = normalizeBookmarkLabel(label);
  const cleanAssetId = videoAssetId != null && videoAssetId !== "" ? parsePositiveId(videoAssetId) : null;
  if (videoAssetId != null && videoAssetId !== "" && !cleanAssetId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "videoAssetId must be a positive integer.");
  }
  const cleanIdem = normalizeIdempotencyKey(idempotencyKey);
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    if (cleanIdem) {
      const existing = await tx.query(
        `SELECT * FROM video_course_unit_bookmarks WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [userId, cleanIdem],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].deleted_at) {
          throw new ExternalIntegrationError(409, "BOOKMARK_ALREADY_DELETED", "Idempotent bookmark was already deleted.");
        }
        return { bookmark: formatBookmark(existing.rows[0]), idempotentReplay: true };
      }
    }

    const insertRes = await tx.query(
      `INSERT INTO video_course_unit_bookmarks
         (user_id, course_id, video_course_profile_id, class_session_id, lesson_id,
          video_asset_id, timestamp_seconds, label, revision, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [userId, courseId, profileId, classSessionId, lessonId, cleanAssetId, cleanTs, cleanLabel, cleanIdem],
    );

    let row = insertRes.rows[0] || null;
    if (!row && cleanIdem) {
      const existing = await tx.query(
        `SELECT * FROM video_course_unit_bookmarks WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [userId, cleanIdem],
      );
      row = existing.rows[0] || null;
      if (row) {
        return { bookmark: formatBookmark(row), idempotentReplay: true };
      }
    }

    await emitBookmarkOutbox(tx, {
      eventType: "learning.bookmark.upserted",
      bookmarkRow: row,
      profileId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    return { bookmark: formatBookmark(row), idempotentReplay: false };
  });
}

export async function deleteUnitBookmarkForAuthorizedUnit({
  db = defaultDb,
  userId,
  bookmarkId,
  profileId = null,
  classSessionId = null,
  lessonId = null,
  expectedRevision = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const parsedBookmarkId = parsePositiveId(bookmarkId);
  if (!parsedBookmarkId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "bookmarkId must be a positive integer.");
  }
  const cleanExpectedRev = parseExpectedRevision(expectedRevision);
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    const existingRes = await tx.query(
      `SELECT * FROM video_course_unit_bookmarks WHERE id = $1 FOR UPDATE`,
      [parsedBookmarkId],
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new ExternalIntegrationError(404, "BOOKMARK_NOT_FOUND", "Bookmark not found.");
    }
    if (String(existing.user_id) !== String(userId)) {
      throw new ExternalIntegrationError(403, "FORBIDDEN", "You can only delete your own bookmarks.");
    }
    if (classSessionId != null && String(existing.class_session_id || "") !== String(classSessionId)) {
      throw new ExternalIntegrationError(404, "BOOKMARK_NOT_FOUND", "Bookmark does not belong to this unit.");
    }
    if (lessonId != null && String(existing.lesson_id || "") !== String(lessonId)) {
      throw new ExternalIntegrationError(404, "BOOKMARK_NOT_FOUND", "Bookmark does not belong to this unit.");
    }

    if (cleanExpectedRev !== null && Number(existing.revision) !== cleanExpectedRev) {
      throw new ExternalIntegrationError(
        409,
        "REVISION_CONFLICT",
        "Bookmark revision conflict; reload before deleting.",
        {
          currentRevision: Number(existing.revision),
          deleted: Boolean(existing.deleted_at),
          bookmark: existing.deleted_at ? null : formatBookmark(existing),
        },
      );
    }
    if (existing.deleted_at) {
      return {
        deleted: true,
        id: String(existing.id),
        revision: Number(existing.revision),
        deletedAt: toIso(existing.deleted_at),
        alreadyDeleted: true,
      };
    }

    const deletedRes = await tx.query(
      `UPDATE video_course_unit_bookmarks
       SET deleted_at = NOW(),
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [parsedBookmarkId],
    );
    const deletedRow = deletedRes.rows[0];

    await emitBookmarkOutbox(tx, {
      eventType: "learning.bookmark.tombstoned",
      bookmarkRow: deletedRow,
      profileId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    return {
      deleted: true,
      id: String(deletedRow.id),
      revision: Number(deletedRow.revision),
      deletedAt: toIso(deletedRow.deleted_at),
      alreadyDeleted: false,
    };
  });
}

export async function listUnitQaThreadsForAuthorizedUnit({
  db = defaultDb,
  viewerUserId = null,
  classSessionId = null,
  lessonId = null,
}) {
  const unitCol = classSessionId ? "class_session_id" : "lesson_id";
  const unitId = classSessionId || lessonId;
  const threadsRes = await db.query(
    `SELECT t.*,
            COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.management_display_name, ''), u.username, 'Học viên') AS author_name
     FROM learning_unit_qa_threads t
     LEFT JOIN users u ON u.id = t.author_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE t.${unitCol} = $1 AND t.deleted_at IS NULL
     ORDER BY t.is_pinned DESC, t.last_message_at DESC, t.id DESC`,
    [unitId],
  );
  const threadIds = threadsRes.rows.map((r) => Number(r.id));
  const messagesByThread = new Map();
  if (threadIds.length > 0) {
    const msgRes = await db.query(
      `SELECT m.*,
              COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.management_display_name, ''), u.username, 'Thành viên') AS author_name
       FROM learning_unit_qa_messages m
       LEFT JOIN users u ON u.id = m.author_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE m.thread_id = ANY($1::bigint[]) AND m.deleted_at IS NULL
       ORDER BY m.created_at ASC, m.id ASC`,
      [threadIds],
    );
    for (const msg of msgRes.rows) {
      const k = String(msg.thread_id);
      if (!messagesByThread.has(k)) messagesByThread.set(k, []);
      messagesByThread.get(k).push(formatQaMessage(msg));
    }
  }
  return threadsRes.rows.map((t) => formatQaThread(t, messagesByThread.get(String(t.id)) || [], viewerUserId));
}

export async function createUnitQaThreadForAuthorizedUnit({
  db = defaultDb,
  authorId,
  authorRole = "user",
  courseId,
  profileId = null,
  classSessionId = null,
  lessonId = null,
  title,
  body,
  attachments = [],
  idempotencyKey = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const cleanTitle = normalizeQaTitle(title);
  const cleanBody = normalizeQaBody(body);
  const cleanAttachments = normalizeQaAttachments(attachments);
  const cleanIdem = normalizeIdempotencyKey(idempotencyKey);
  const authorKind = authorKindFromRole(authorRole);
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    if (cleanIdem) {
      const existing = await tx.query(
        `SELECT id FROM learning_unit_qa_threads WHERE author_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [authorId, cleanIdem],
      );
      if (existing.rows[0]) {
        const thread = await loadThreadWithMessages(tx, existing.rows[0].id, authorId);
        return { thread, idempotentReplay: true };
      }
    }

    const threadInsert = await tx.query(
      `INSERT INTO learning_unit_qa_threads
         (course_id, video_course_profile_id, class_session_id, lesson_id,
          author_id, author_role, title, status, is_pinned,
          last_read_by_student_at, last_message_at, revision, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', FALSE, NOW(), NOW(), 1, $8)
       ON CONFLICT (author_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [courseId, profileId, classSessionId, lessonId, authorId, String(authorRole || "user"), cleanTitle, cleanIdem],
    );

    let threadRow = threadInsert.rows[0] || null;
    if (!threadRow && cleanIdem) {
      const existing = await tx.query(
        `SELECT * FROM learning_unit_qa_threads WHERE author_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [authorId, cleanIdem],
      );
      threadRow = existing.rows[0] || null;
      if (threadRow) {
        const thread = await loadThreadWithMessages(tx, threadRow.id, authorId);
        return { thread, idempotentReplay: true };
      }
    }

    const msgInsert = await tx.query(
      `INSERT INTO learning_unit_qa_messages
         (thread_id, author_id, author_kind, body, attachments_json, revision)
       VALUES ($1, $2, $3, $4, $5::jsonb, 1)
       RETURNING *`,
      [threadRow.id, authorId, authorKind, cleanBody, JSON.stringify(cleanAttachments)],
    );

    await emitQaThreadOutbox(tx, {
      threadId: threadRow.id,
      latestMessageRow: msgInsert.rows[0],
      actorUserId: authorId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    const thread = await loadThreadWithMessages(tx, threadRow.id, authorId);
    return { thread, idempotentReplay: false };
  });
}

export async function replyUnitQaThreadForAuthorizedActor({
  db = defaultDb,
  threadId,
  actorUserId,
  actorRole = "user",
  body,
  attachments = [],
  expectedRevision = null,
  idempotencyKey = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const parsedThreadId = parsePositiveId(threadId);
  if (!parsedThreadId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "threadId must be a positive integer.");
  }
  const cleanBody = normalizeQaBody(body);
  const cleanAttachments = normalizeQaAttachments(attachments);
  const cleanExpectedRev = parseExpectedRevision(expectedRevision);
  const cleanIdem = normalizeIdempotencyKey(idempotencyKey);
  const authorKind = authorKindFromRole(actorRole);
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    const threadRes = await tx.query(
      `SELECT * FROM learning_unit_qa_threads WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [parsedThreadId],
    );
    const threadRow = threadRes.rows[0];
    if (!threadRow) {
      throw new ExternalIntegrationError(404, "QA_THREAD_NOT_FOUND", "Q&A thread not found.");
    }

    if (cleanIdem) {
      const existingMsg = await tx.query(
        `SELECT * FROM learning_unit_qa_messages WHERE author_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [actorUserId, cleanIdem],
      );
      if (existingMsg.rows[0]) {
        const thread = await loadThreadWithMessages(tx, threadRow.id, actorUserId);
        const message = thread.messages.find((m) => String(m.id) === String(existingMsg.rows[0].id)) || null;
        return { thread, message, idempotentReplay: true };
      }
    }

    if (cleanExpectedRev !== null && Number(threadRow.revision) !== cleanExpectedRev) {
      const currentThread = await loadThreadWithMessages(tx, threadRow.id, actorUserId);
      throw new ExternalIntegrationError(
        409,
        "REVISION_CONFLICT",
        "Q&A thread revision conflict; reload before replying.",
        { currentRevision: Number(threadRow.revision), thread: currentThread },
      );
    }

    const nextStatus = authorKind === "student"
      ? (threadRow.status === "resolved" ? "open" : threadRow.status)
      : (threadRow.status === "resolved" ? "resolved" : "answered");
    const isThreadAuthor = String(threadRow.author_id) === String(actorUserId);

    const msgInsert = await tx.query(
      `INSERT INTO learning_unit_qa_messages
         (thread_id, author_id, author_kind, body, attachments_json, revision, idempotency_key)
       VALUES ($1, $2, $3, $4, $5::jsonb, 1, $6)
       ON CONFLICT (author_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [threadRow.id, actorUserId, authorKind, cleanBody, JSON.stringify(cleanAttachments), cleanIdem],
    );

    let msgRow = msgInsert.rows[0] || null;
    if (!msgRow && cleanIdem) {
      const existingMsg = await tx.query(
        `SELECT * FROM learning_unit_qa_messages WHERE author_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [actorUserId, cleanIdem],
      );
      if (existingMsg.rows[0]) {
        const thread = await loadThreadWithMessages(tx, threadRow.id, actorUserId);
        const message = thread.messages.find((m) => String(m.id) === String(existingMsg.rows[0].id)) || null;
        return { thread, message, idempotentReplay: true };
      }
    }

    await tx.query(
      `UPDATE learning_unit_qa_threads
       SET status = $2,
           last_message_at = NOW(),
           last_read_by_student_at = CASE WHEN $3 THEN NOW() ELSE last_read_by_student_at END,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [threadRow.id, nextStatus, isThreadAuthor],
    );

    await emitQaThreadOutbox(tx, {
      threadId: threadRow.id,
      latestMessageRow: msgRow,
      actorUserId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    const thread = await loadThreadWithMessages(tx, threadRow.id, actorUserId);
    const message = thread.messages.find((m) => String(m.id) === String(msgRow.id)) || null;
    return { thread, message, idempotentReplay: false };
  });
}

export async function updateUnitQaThreadStatusForAuthorizedActor({
  db = defaultDb,
  threadId,
  actorUserId,
  actorRole = "user",
  status = undefined,
  isPinned = undefined,
  markRead = false,
  expectedRevision = null,
  preferredExternalUserId = null,
  correlationId = null,
  now = () => new Date(),
}) {
  const parsedThreadId = parsePositiveId(threadId);
  if (!parsedThreadId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "threadId must be a positive integer.");
  }
  const cleanExpectedRev = parseExpectedRevision(expectedRevision);
  if (status !== undefined && status !== null && !VALID_QA_STATUSES.has(String(status))) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "status must be one of: open, answered, resolved.");
  }
  const hasAnyUpdate = status !== undefined || isPinned !== undefined || Boolean(markRead);
  if (!hasAnyUpdate) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Provide status, isPinned, or markRead.");
  }
  const isStaff = actorRole === "admin" || actorRole === "creator";
  const occurredAt = now().toISOString();

  return runDelegatedTx(db, async (tx) => {
    const threadRes = await tx.query(
      `SELECT * FROM learning_unit_qa_threads WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [parsedThreadId],
    );
    const threadRow = threadRes.rows[0];
    if (!threadRow) {
      throw new ExternalIntegrationError(404, "QA_THREAD_NOT_FOUND", "Q&A thread not found.");
    }

    const isOwner = String(threadRow.author_id) === String(actorUserId);
    if (!isStaff) {
      if (!isOwner) {
        throw new ExternalIntegrationError(403, "FORBIDDEN", "Only thread owners or teachers can update thread status.");
      }
      if (isPinned !== undefined) {
        throw new ExternalIntegrationError(403, "FORBIDDEN", "Only teachers or admins can pin Q&A threads.");
      }
      if (status !== undefined && status === "answered") {
        throw new ExternalIntegrationError(403, "FORBIDDEN", "Only teachers or admins can set status to answered.");
      }
    }

    if (cleanExpectedRev !== null && Number(threadRow.revision) !== cleanExpectedRev) {
      const currentThread = await loadThreadWithMessages(tx, threadRow.id, actorUserId);
      throw new ExternalIntegrationError(
        409,
        "REVISION_CONFLICT",
        "Q&A thread revision conflict; reload before updating.",
        { currentRevision: Number(threadRow.revision), thread: currentThread },
      );
    }

    const nextStatus = status !== undefined && status !== null ? String(status) : threadRow.status;
    const nextPinned = isPinned !== undefined ? Boolean(isPinned) : Boolean(threadRow.is_pinned);
    const shouldMarkRead = Boolean(markRead) && isOwner;

    await tx.query(
      `UPDATE learning_unit_qa_threads
       SET status = $2,
           is_pinned = $3,
           last_read_by_student_at = CASE WHEN $4 THEN NOW() ELSE last_read_by_student_at END,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [threadRow.id, nextStatus, nextPinned, shouldMarkRead],
    );

    await emitQaThreadOutbox(tx, {
      threadId: threadRow.id,
      latestMessageRow: null,
      actorUserId,
      preferredExternalUserId,
      correlationId,
      occurredAt,
    });

    const thread = await loadThreadWithMessages(tx, threadRow.id, actorUserId);
    return { thread };
  });
}

// ============================================================================
// Delegated v2 Endpoints (/api/integrations/v2/learning/...)
// ============================================================================

async function resolveDelegatedThreadAccess({
  db,
  sessionToken,
  threadId,
  profileId = null,
  requiredScope = "qa:rw",
  isMutation = false,
  now = () => new Date(),
  env = process.env,
}) {
  if (isDelegatedLearningKillSwitchActive(env)) {
    throw new ExternalIntegrationError(503, "SYNC_KILL_SWITCH_ACTIVE", "Delegated learning endpoints are paused by kill switch.");
  }
  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope,
    expectedProfileId: profileId,
    isMutation,
    now,
    env,
  });

  const parsedThreadId = parsePositiveId(threadId);
  if (!parsedThreadId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "threadId must be a positive integer.");
  }
  const threadRes = await db.query(
    `SELECT * FROM learning_unit_qa_threads WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [parsedThreadId],
  );
  const threadRow = threadRes.rows[0];
  if (!threadRow) {
    throw new ExternalIntegrationError(404, "QA_THREAD_NOT_FOUND", "Q&A thread not found.");
  }
  if (
    threadRow.video_course_profile_id != null
    && String(threadRow.video_course_profile_id) !== String(profileRow.profile_id)
  ) {
    throw new ExternalIntegrationError(409, "PROFILE_SCOPE_MISMATCH", "Thread does not belong to delegated session profile.");
  }

  const unitId = threadRow.class_session_id || threadRow.lesson_id;
  const rawUnits = await loadProfileUnitsWithProgress(db, { profileRow, userId: session.user_id });
  const units = applySequentialLocks(rawUnits, { isPublicPreviewAccess: false });
  const targetUnit = units.find((u) => String(u.id) === String(unitId)) || null;
  if (!targetUnit) {
    throw new ExternalIntegrationError(409, "PROFILE_SCOPE_MISMATCH", "Thread unit does not belong to delegated session profile.");
  }
  if (targetUnit.isLocked) {
    throw new ExternalIntegrationError(403, "UNIT_LOCKED", "Complete prior learning units before accessing this unit.");
  }
  return { session, profileRow, threadRow, targetUnit };
}

export async function getDelegatedUnitNotes({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["notes:rw", "workspace:read"],
    profileId,
    unitId,
    now,
    env,
  });
  const notes = await listUnitNotesForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
  });
  observeIntegrationLatency("course.delegated_notes_read", Date.now() - startMs);
  return {
    profileId: String(ctx.profileRow.profile_id),
    unitId: String(ctx.unitId),
    unitType: ctx.unitType,
    notes,
  };
}

export async function createDelegatedUnitNote({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  timestampSeconds = 0,
  content,
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["notes:rw"],
    profileId,
    unitId,
    isMutation: true,
    now,
    env,
  });
  const result = await createUnitNoteForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    courseId: ctx.profileRow.course_id,
    profileId: ctx.profileRow.profile_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
    timestampSeconds,
    content,
    idempotencyKey,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_note_created");
  observeIntegrationLatency("course.delegated_note_write", Date.now() - startMs);
  return result;
}

export async function updateDelegatedUnitNote({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  noteId,
  timestampSeconds,
  content,
  expectedRevision = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["notes:rw"],
    profileId,
    unitId,
    isMutation: true,
    now,
    env,
  });
  const result = await updateUnitNoteForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    noteId,
    profileId: ctx.profileRow.profile_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
    timestampSeconds,
    content,
    expectedRevision,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_note_updated");
  observeIntegrationLatency("course.delegated_note_write", Date.now() - startMs);
  return result;
}

export async function deleteDelegatedUnitNote({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  noteId,
  expectedRevision = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["notes:rw"],
    profileId,
    unitId,
    isMutation: true,
    now,
    env,
  });
  const result = await deleteUnitNoteForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    noteId,
    profileId: ctx.profileRow.profile_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
    expectedRevision,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_note_deleted");
  observeIntegrationLatency("course.delegated_note_write", Date.now() - startMs);
  return result;
}

export async function getDelegatedUnitBookmarks({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["bookmarks:rw", "workspace:read"],
    profileId,
    unitId,
    now,
    env,
  });
  const bookmarks = await listUnitBookmarksForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
  });
  return {
    profileId: String(ctx.profileRow.profile_id),
    unitId: String(ctx.unitId),
    unitType: ctx.unitType,
    bookmarks,
  };
}

export async function createDelegatedUnitBookmark({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  videoAssetId = null,
  timestampSeconds = 0,
  label = "",
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["bookmarks:rw"],
    profileId,
    unitId,
    isMutation: true,
    now,
    env,
  });
  const result = await createUnitBookmarkForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    courseId: ctx.profileRow.course_id,
    profileId: ctx.profileRow.profile_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
    videoAssetId,
    timestampSeconds,
    label,
    idempotencyKey,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_bookmark_created");
  return result;
}

export async function deleteDelegatedUnitBookmark({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  bookmarkId,
  expectedRevision = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["bookmarks:rw"],
    profileId,
    unitId,
    isMutation: true,
    now,
    env,
  });
  const result = await deleteUnitBookmarkForAuthorizedUnit({
    db,
    userId: ctx.session.user_id,
    bookmarkId,
    profileId: ctx.profileRow.profile_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
    expectedRevision,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_bookmark_deleted");
  return result;
}

export async function getDelegatedUnitQaThreads({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["qa:rw", "workspace:read"],
    profileId,
    unitId,
    now,
    env,
  });
  const threads = await listUnitQaThreadsForAuthorizedUnit({
    db,
    viewerUserId: ctx.session.user_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
  });
  return {
    profileId: String(ctx.profileRow.profile_id),
    unitId: String(ctx.unitId),
    unitType: ctx.unitType,
    threads,
  };
}

export async function createDelegatedUnitQaThread({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  title,
  body,
  attachments = [],
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedUnitContext({
    db,
    sessionToken,
    acceptedScopes: ["qa:rw"],
    profileId,
    unitId,
    isMutation: true,
    now,
    env,
  });
  const result = await createUnitQaThreadForAuthorizedUnit({
    db,
    authorId: ctx.session.user_id,
    authorRole: ctx.session.user_role || "user",
    courseId: ctx.profileRow.course_id,
    profileId: ctx.profileRow.profile_id,
    classSessionId: ctx.classSessionId,
    lessonId: ctx.lessonId,
    title,
    body,
    attachments,
    idempotencyKey,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_qa_thread_created");
  return result;
}

export async function replyDelegatedUnitQaThread({
  db = defaultDb,
  sessionToken,
  threadId,
  profileId = null,
  body,
  attachments = [],
  expectedRevision = null,
  idempotencyKey = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedThreadAccess({
    db,
    sessionToken,
    threadId,
    profileId,
    requiredScope: "qa:rw",
    isMutation: true,
    now,
    env,
  });
  const result = await replyUnitQaThreadForAuthorizedActor({
    db,
    threadId: ctx.threadRow.id,
    actorUserId: ctx.session.user_id,
    actorRole: ctx.session.user_role || "user",
    body,
    attachments,
    expectedRevision,
    idempotencyKey,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_qa_reply_created");
  return result;
}

export async function updateDelegatedUnitQaThreadStatus({
  db = defaultDb,
  sessionToken,
  threadId,
  profileId = null,
  status = undefined,
  isPinned = undefined,
  markRead = false,
  expectedRevision = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const ctx = await resolveDelegatedThreadAccess({
    db,
    sessionToken,
    threadId,
    profileId,
    requiredScope: "qa:rw",
    isMutation: true,
    now,
    env,
  });
  const result = await updateUnitQaThreadStatusForAuthorizedActor({
    db,
    threadId: ctx.threadRow.id,
    actorUserId: ctx.session.user_id,
    actorRole: ctx.session.user_role || "user",
    status,
    isPinned,
    markRead,
    expectedRevision,
    preferredExternalUserId: ctx.session.external_user_id,
    correlationId,
    now,
  });
  recordIntegrationMetric("course.delegated_qa_status_updated");
  return result;
}
