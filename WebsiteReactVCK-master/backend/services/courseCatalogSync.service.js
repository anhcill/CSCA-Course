import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import { ExternalIntegrationError } from "./externalCourseMapping.service.js";
import {
  createIntegrationLogger,
  isCatalogSyncKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
  resolveCorrelationId,
} from "./integrationLogger.service.js";

const defaultDb = { query, getClient };
const catalogLog = createIntegrationLogger({ component: "course-catalog-sync" });

export const CATALOG_SYNC_SCHEMA_VERSION = "2.0";
export const CATALOG_SYNC_STREAM_NAME = "catalog_courses";
export const VALID_MOLY_SUBJECT_CODES = Object.freeze([
  "MATH",
  "PHYSICS",
  "CHEMISTRY",
  "CHINESE_SCI",
  "CHINESE_SOC",
]);

const SYNC_REVISION_LOCK_KEY = 9021083;
const PERMANENT_HTTP_CODES = new Set([400, 401, 403, 404, 409, 422]);

const toIso = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const normalizePositiveInt = (value, fallback, { min = 1, max = 500 } = {}) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", `Parameter must be >= ${min}.`);
  }
  return Math.min(parsed, max);
};

const normalizeNonNegativeBigIntString = (value, fallback = "0") => {
  if (value === undefined || value === null || value === "") return fallback;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Cursor offset must be a non-negative integer.");
  }
  return str;
};

const normalizeAsciiSearch = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d");

export function deriveMolySubjectCode({ subjectCode = null, category = null, title = "", slug = "" } = {}) {
  const explicit = typeof subjectCode === "string" ? subjectCode.trim().toUpperCase() : "";
  if (VALID_MOLY_SUBJECT_CODES.includes(explicit)) return explicit;

  const text = normalizeAsciiSearch(`${category || ""} ${title || ""} ${slug || ""}`);
  if (/\b(physics|vat ly|vat li|ly hoc)\b/.test(text) || text.includes("csca-ly") || text.includes("phys")) {
    return "PHYSICS";
  }
  if (/\b(chemistry|hoa hoc|chemical|chem)\b/.test(text) || text.includes("csca-hoa")) {
    return "CHEMISTRY";
  }
  if (/\b(chinese_sci|tu nhien|khtn|science chinese|trung van tu nhien)\b/.test(text)) {
    return "CHINESE_SCI";
  }
  if (/\b(chinese_soc|xa hoi|khxh|social|van hoc|trung van xa hoi|hskk?)\b/.test(text) || String(category || "").toUpperCase() === "HSK" || String(category || "").toUpperCase() === "HSKK") {
    return "CHINESE_SOC";
  }
  return "MATH";
}

export function normalizeMolyLevel(level) {
  const normalized = String(level || "").trim().toLowerCase();
  if (normalized === "advanced") return "advanced";
  if (normalized === "intermediate") return "intermediate";
  return "basic";
}

export function encodeExportCursor({ afterRevision = "0", afterId = "0" }) {
  return Buffer.from(
    JSON.stringify({ r: String(afterRevision), i: String(afterId) }),
    "utf8",
  ).toString("base64url");
}

export function decodeExportCursor(cursorRaw) {
  if (!cursorRaw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursorRaw), "base64url").toString("utf8"));
    return {
      afterRevision: normalizeNonNegativeBigIntString(parsed?.r, "0"),
      afterId: normalizeNonNegativeBigIntString(parsed?.i, "0"),
    };
  } catch {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "Malformed export cursor.");
  }
}

export function formatProfileExportRecord(row) {
  const deleted = Boolean(row.deleted_at);
  return {
    profileId: String(row.id),
    externalOfferingId: row.management_class_id ? String(row.management_class_id) : `profile:${row.id}`,
    courseId: String(row.course_id),
    mode: row.mode,
    managementClassId: row.management_class_id || null,
    sourceLiveClassId: row.source_live_class_id != null ? String(row.source_live_class_id) : null,
    sourceLiveClassCode: row.source_live_class_code || null,
    status: deleted ? "archived" : (row.status || "active"),
    allowFileDownload: Boolean(row.allow_file_download),
    deviceLimit: Number(row.device_limit || 2),
    enforceTrustedDevices: row.enforce_trusted_devices !== false,
    badgeLabel: row.mode === "MIRROR" ? "Bản ghi lớp Live" : "Khóa video độc lập",
    revision: Number(row.sync_revision || 1),
    deleted,
    deletedAt: toIso(row.deleted_at),
    sourceUpdatedAt: toIso(row.updated_at || row.created_at),
  };
}

export function formatCourseExportRecord(row, profiles = []) {
  const deleted = Boolean(row.sync_deleted_at);
  const title = String(row.title || row.name || `Course #${row.id}`).trim();
  const displayName = String(
    row.instructor_display_name || row.live_teacher_display_name || "",
  ).trim() || null;

  return {
    courseId: String(row.id),
    revision: Number(row.sync_revision || 1),
    slug: row.slug,
    title,
    description: row.description || "",
    thumbnailUrl: row.thumbnail_url || row.image_url || null,
    category: row.category || null,
    level: normalizeMolyLevel(row.level),
    subjectCode: deriveMolySubjectCode({
      category: row.category,
      title,
      slug: row.slug,
    }),
    priceVnd: Math.max(0, Number(row.price || 0)),
    isFree: Boolean(row.is_free),
    isPublished: !deleted && Boolean(row.is_published),
    totalLessons: Number(row.total_lessons || 0),
    instructor: displayName
      ? {
          id: row.author_id != null ? String(row.author_id) : null,
          displayName,
          avatarUrl: row.instructor_avatar_url || null,
          headline: null,
        }
      : null,
    deleted,
    deletedAt: toIso(row.sync_deleted_at),
    sourceUpdatedAt: toIso(row.updated_at || row.created_at),
    profiles,
  };
}

export function buildV2EventEnvelope({
  eventType,
  aggregateType,
  aggregateId,
  revision,
  sourceUpdatedAt,
  occurredAt = new Date().toISOString(),
  deleted = false,
  deletedAt = null,
  correlationId = null,
  payload = {},
}) {
  const revNum = Number(revision);
  const aggId = String(aggregateId);
  const eventId = `csca-course:${aggregateType}:${aggId}:rev:${revNum}`;
  return {
    schemaVersion: CATALOG_SYNC_SCHEMA_VERSION,
    eventId,
    idempotencyKey: eventId,
    eventType,
    sourceSystem: "csca-course",
    targetSystem: "moly",
    aggregateType,
    aggregateId: aggId,
    revision: revNum,
    sourceUpdatedAt: toIso(sourceUpdatedAt) || toIso(occurredAt),
    occurredAt: toIso(occurredAt),
    correlationId: resolveCorrelationId(correlationId),
    deleted: Boolean(deleted),
    deletedAt: deleted ? (toIso(deletedAt) || toIso(occurredAt)) : null,
    payload,
  };
}

async function runInTx(db = defaultDb, work) {
  if (db && typeof db.transaction === "function") {
    return db.transaction(work);
  }
  if (db && typeof db.query === "function" && typeof db.getClient !== "function" && typeof db.connect !== "function") {
    return work(db);
  }
  const client = typeof db.getClient === "function"
    ? await db.getClient()
    : await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (typeof client.release === "function") client.release();
  }
}

export async function hasCatalogSyncTables(runner = defaultDb) {
  try {
    const res = await runner.query(
      `SELECT
         to_regclass('course_integration_outbox') IS NOT NULL AS has_outbox,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'courses' AND column_name = 'sync_revision'
         ) AS has_course_rev,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'video_course_profiles' AND column_name = 'sync_revision'
         ) AS has_profile_rev`,
    );
    const row = res.rows[0] || {};
    return Boolean(row.has_outbox && row.has_course_rev && row.has_profile_rev);
  } catch {
    return false;
  }
}

export async function allocateNextSyncRevision(runner) {
  await runner.query("SELECT pg_advisory_xact_lock($1)", [SYNC_REVISION_LOCK_KEY]);
  const res = await runner.query(
    `SELECT GREATEST(
       COALESCE((SELECT MAX(sync_revision) FROM courses), 0),
       COALESCE((SELECT MAX(sync_revision) FROM video_course_profiles), 0),
       COALESCE((SELECT MAX(aggregate_revision) FROM course_integration_outbox), 0)
     )::bigint + 1 AS next_revision`,
  );
  return Number(res.rows[0]?.next_revision || 1);
}

async function fetchFormattedCoursesByIds(runner, courseIds = []) {
  const uniqueIds = [...new Set(courseIds.map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!uniqueIds.length) return [];

  const coursesRes = await runner.query(
    `SELECT c.id, c.name, c.title, c.slug, c.description, c.image_url, c.thumbnail_url,
            c.category, c.level, c.author_id, c.is_published, c.is_free, c.price, c.total_lessons,
            c.sync_revision, c.sync_deleted_at, c.created_at, c.updated_at,
            COALESCE(NULLIF(u.management_display_name, ''), NULLIF(sp.full_name, ''), u.username) AS instructor_display_name,
            u.avatar_url AS instructor_avatar_url
     FROM courses c
     LEFT JOIN users u ON u.id = c.author_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE c.id = ANY($1::bigint[])`,
    [uniqueIds],
  );
  const profilesRes = await runner.query(
    `SELECT vcp.id, vcp.course_id, vcp.mode, vcp.management_class_id, vcp.source_live_class_id,
            vcp.enforce_trusted_devices, vcp.device_limit, vcp.allow_file_download,
            vcp.status, vcp.sync_revision, vcp.deleted_at, vcp.created_at, vcp.updated_at,
            lc.management_class_source_id AS source_live_class_code, lc.teacher_display_name
     FROM video_course_profiles vcp
     LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
     WHERE vcp.course_id = ANY($1::bigint[])
     ORDER BY vcp.course_id ASC, vcp.id ASC`,
    [uniqueIds],
  );

  const profilesByCourse = new Map();
  const teacherFallbackByCourse = new Map();
  for (const row of profilesRes.rows) {
    const cid = String(row.course_id);
    if (!profilesByCourse.has(cid)) profilesByCourse.set(cid, []);
    profilesByCourse.get(cid).push(formatProfileExportRecord(row));
    if (!teacherFallbackByCourse.has(cid) && row.teacher_display_name) {
      teacherFallbackByCourse.set(cid, row.teacher_display_name);
    }
  }

  return coursesRes.rows.map((row) => formatCourseExportRecord(
    {
      ...row,
      live_teacher_display_name: teacherFallbackByCourse.get(String(row.id)) || null,
    },
    profilesByCourse.get(String(row.id)) || [],
  ));
}

export async function insertOutboxEnvelope(runner, envelope) {
  await runner.query(
    `INSERT INTO course_integration_outbox (
       source_system, target_system, schema_version, event_id, idempotency_key,
       correlation_id, event_type, aggregate_type, aggregate_id, aggregate_revision,
       deleted, deleted_at, source_updated_at, occurred_at, payload, status
     )
     VALUES (
       'csca-course', 'moly', $1, $2, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13::jsonb, 'pending'
     )
     ON CONFLICT (event_id) DO NOTHING`,
    [
      CATALOG_SYNC_SCHEMA_VERSION,
      envelope.eventId,
      envelope.idempotencyKey,
      envelope.correlationId,
      envelope.eventType,
      envelope.aggregateType,
      envelope.aggregateId,
      envelope.revision,
      Boolean(envelope.deleted),
      envelope.deletedAt,
      envelope.sourceUpdatedAt,
      envelope.occurredAt,
      JSON.stringify(envelope),
    ],
  );
  return envelope;
}

export { insertOutboxEnvelope as insertOutboxEnvelopeIfReady };

/**
 * Exports Course catalog entries + 1:N video_course_profiles ordered strictly
 * by monotonic keyset `(sync_revision ASC, id ASC)` with snapshot anchor metadata.
 */
export async function exportCatalogCourses({
  db = defaultDb,
  afterRevision = "0",
  afterId = "0",
  cursor = null,
  snapshotAnchorRevision = null,
  limit = 100,
  includeTombstoned = true,
  correlationId = null,
} = {}) {
  const startMs = Date.now();
  const corr = resolveCorrelationId(correlationId);
  const parsedCursor = cursor ? decodeExportCursor(cursor) : null;
  const effectiveAfterRev = parsedCursor
    ? parsedCursor.afterRevision
    : normalizeNonNegativeBigIntString(afterRevision, "0");
  const effectiveAfterId = parsedCursor
    ? parsedCursor.afterId
    : normalizeNonNegativeBigIntString(afterId, "0");
  const boundedLimit = normalizePositiveInt(limit, 100, { min: 1, max: 500 });
  const includeDeleted = includeTombstoned !== false && String(includeTombstoned).toLowerCase() !== "false";

  const highWaterRes = await db.query(
    `SELECT
       GREATEST(
         COALESCE((SELECT MAX(sync_revision) FROM courses), 0),
         COALESCE((SELECT MAX(sync_revision) FROM video_course_profiles), 0)
       )::bigint AS high_water_revision,
       GREATEST(
         COALESCE((SELECT MAX(updated_at) FROM courses), TO_TIMESTAMP(0)),
         COALESCE((SELECT MAX(updated_at) FROM video_course_profiles), TO_TIMESTAMP(0))
       ) AS high_water_updated_at`,
  );
  const hwRow = highWaterRes.rows[0] || {};
  const highWaterRevision = Number(hwRow.high_water_revision || 0);
  const anchor = snapshotAnchorRevision !== null && snapshotAnchorRevision !== undefined && snapshotAnchorRevision !== ""
    ? Number(normalizeNonNegativeBigIntString(snapshotAnchorRevision, String(highWaterRevision)))
    : highWaterRevision;

  const pageRowsRes = await db.query(
    `SELECT c.id, c.name, c.title, c.slug, c.description, c.image_url, c.thumbnail_url,
            c.category, c.level, c.author_id, c.is_published, c.is_free, c.price, c.total_lessons,
            c.sync_revision, c.sync_deleted_at, c.created_at, c.updated_at,
            COALESCE(NULLIF(u.management_display_name, ''), NULLIF(sp.full_name, ''), u.username) AS instructor_display_name,
            u.avatar_url AS instructor_avatar_url
     FROM courses c
     LEFT JOIN users u ON u.id = c.author_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE ($1::boolean = TRUE OR c.sync_deleted_at IS NULL)
       AND (c.sync_revision > $2::bigint OR (c.sync_revision = $2::bigint AND c.id > $3::bigint))
     ORDER BY c.sync_revision ASC, c.id ASC
     LIMIT $4`,
    [includeDeleted, effectiveAfterRev, effectiveAfterId, boundedLimit + 1],
  );

  const hasMore = pageRowsRes.rows.length > boundedLimit;
  const sliceRows = hasMore ? pageRowsRes.rows.slice(0, boundedLimit) : pageRowsRes.rows;
  const pageIds = sliceRows.map((row) => Number(row.id));

  let profilesByCourse = new Map();
  let teacherFallbackByCourse = new Map();
  if (pageIds.length > 0) {
    const profRes = await db.query(
      `SELECT vcp.id, vcp.course_id, vcp.mode, vcp.management_class_id, vcp.source_live_class_id,
              vcp.enforce_trusted_devices, vcp.device_limit, vcp.allow_file_download,
              vcp.status, vcp.sync_revision, vcp.deleted_at, vcp.created_at, vcp.updated_at,
              lc.management_class_source_id AS source_live_class_code, lc.teacher_display_name
       FROM video_course_profiles vcp
       LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
       WHERE vcp.course_id = ANY($1::bigint[])
         AND ($2::boolean = TRUE OR vcp.deleted_at IS NULL)
       ORDER BY vcp.course_id ASC, vcp.id ASC`,
      [pageIds, includeDeleted],
    );
    for (const row of profRes.rows) {
      const cid = String(row.course_id);
      if (!profilesByCourse.has(cid)) profilesByCourse.set(cid, []);
      profilesByCourse.get(cid).push(formatProfileExportRecord(row));
      if (!teacherFallbackByCourse.has(cid) && row.teacher_display_name) {
        teacherFallbackByCourse.set(cid, row.teacher_display_name);
      }
    }
  }

  const courses = sliceRows.map((row) => formatCourseExportRecord(
    {
      ...row,
      live_teacher_display_name: teacherFallbackByCourse.get(String(row.id)) || null,
    },
    profilesByCourse.get(String(row.id)) || [],
  ));

  const last = courses[courses.length - 1] || null;
  const nextAfterRevision = last ? String(last.revision) : effectiveAfterRev;
  const nextAfterId = last ? String(last.courseId) : effectiveAfterId;
  const nextCursor = hasMore ? encodeExportCursor({ afterRevision: nextAfterRevision, afterId: nextAfterId }) : null;

  observeIntegrationLatency("course.catalog_export_ms", Date.now() - startMs);
  recordIntegrationMetric("course.catalog_export_pages");

  return {
    correlationId: corr,
    courses,
    pagination: {
      afterRevision: Number(effectiveAfterRev),
      afterId: Number(effectiveAfterId),
      nextAfterRevision: Number(nextAfterRevision),
      nextAfterId: Number(nextAfterId),
      nextCursor,
      hasMore,
      limit: boundedLimit,
      snapshotAnchorRevision: anchor,
      highWaterRevision,
      highWaterUpdatedAt: toIso(hwRow.high_water_updated_at),
    },
  };
}

/**
 * Atomically bumps `sync_revision` and enqueues a v2 course catalog event
 * (`course.upserted`, `course.published`, `course.unpublished`, `course.tombstoned`).
 */
export async function recordCourseCatalogMutation({
  db = defaultDb,
  courseId,
  eventType = "course.upserted",
  deleted = false,
  deletedAt = null,
  correlationId = null,
  beforeDeleteSnapshot = null,
} = {}) {
  const numericCourseId = Number(courseId);
  if (!Number.isSafeInteger(numericCourseId) || numericCourseId <= 0) return null;
  if (!(await hasCatalogSyncTables(db))) return null;

  return runInTx(db, async (txClient) => {
    const nowIso = toIso(deletedAt) || new Date().toISOString();
    const corr = resolveCorrelationId(correlationId);

    if (beforeDeleteSnapshot) {
      const profiles = (
        await txClient.query(
          `SELECT vcp.*, lc.management_class_source_id AS source_live_class_code, lc.teacher_display_name
           FROM video_course_profiles vcp
           LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
           WHERE vcp.course_id = $1
           ORDER BY vcp.id ASC`,
          [numericCourseId],
        )
      ).rows;

      const exportedProfiles = [];
      for (const prof of profiles) {
        const profRev = await allocateNextSyncRevision(txClient);
        const formattedProfile = formatProfileExportRecord({
          ...prof,
          sync_revision: profRev,
          deleted_at: nowIso,
          updated_at: nowIso,
        });
        exportedProfiles.push(formattedProfile);
        await insertOutboxEnvelope(txClient, buildV2EventEnvelope({
          eventType: "profile.tombstoned",
          aggregateType: "profile",
          aggregateId: prof.id,
          revision: profRev,
          sourceUpdatedAt: nowIso,
          occurredAt: nowIso,
          deleted: true,
          deletedAt: nowIso,
          correlationId: corr,
          payload: formattedProfile,
        }));
      }

      const courseRev = await allocateNextSyncRevision(txClient);
      const formattedCourse = formatCourseExportRecord(
        {
          ...beforeDeleteSnapshot,
          id: numericCourseId,
          sync_revision: courseRev,
          sync_deleted_at: nowIso,
          is_published: false,
          updated_at: nowIso,
        },
        exportedProfiles,
      );
      return insertOutboxEnvelope(txClient, buildV2EventEnvelope({
        eventType: "course.tombstoned",
        aggregateType: "course",
        aggregateId: numericCourseId,
        revision: courseRev,
        sourceUpdatedAt: nowIso,
        occurredAt: nowIso,
        deleted: true,
        deletedAt: nowIso,
        correlationId: corr,
        payload: formattedCourse,
      }));
    }

    const rev = await allocateNextSyncRevision(txClient);
    await txClient.query(
      `UPDATE courses
       SET sync_revision = $1,
           sync_deleted_at = CASE
             WHEN $2::boolean THEN COALESCE(sync_deleted_at, $3::timestamptz)
             ELSE NULL
           END,
           updated_at = COALESCE(updated_at, NOW())
       WHERE id = $4`,
      [rev, Boolean(deleted), nowIso, numericCourseId],
    );

    const formatted = (await fetchFormattedCoursesByIds(txClient, [numericCourseId]))[0];
    if (!formatted) return null;

    return insertOutboxEnvelope(txClient, buildV2EventEnvelope({
      eventType,
      aggregateType: "course",
      aggregateId: numericCourseId,
      revision: formatted.revision,
      sourceUpdatedAt: formatted.sourceUpdatedAt || nowIso,
      occurredAt: new Date().toISOString(),
      deleted: formatted.deleted,
      deletedAt: formatted.deletedAt,
      correlationId: corr,
      payload: formatted,
    }));
  });
}

/**
 * Atomically bumps `video_course_profiles.sync_revision` (and parent course cursor
 * revision) and enqueues `profile.upserted` or `profile.tombstoned`.
 */
export async function recordProfileCatalogMutation({
  db = defaultDb,
  profileId,
  courseId = null,
  eventType = "profile.upserted",
  deleted = false,
  deletedAt = null,
  correlationId = null,
  bumpParentCourse = true,
} = {}) {
  const numericProfileId = Number(profileId);
  if (!Number.isSafeInteger(numericProfileId) || numericProfileId <= 0) return null;
  if (!(await hasCatalogSyncTables(db))) return null;

  return runInTx(db, async (txClient) => {
    const nowIso = toIso(deletedAt) || new Date().toISOString();
    const corr = resolveCorrelationId(correlationId);
    const profRev = await allocateNextSyncRevision(txClient);

    const profRes = await txClient.query(
      `UPDATE video_course_profiles
       SET sync_revision = $1,
           deleted_at = CASE WHEN $2::boolean THEN COALESCE(deleted_at, $3::timestamptz) ELSE NULL END,
           updated_at = COALESCE(updated_at, NOW())
       WHERE id = $4
       RETURNING *`,
      [profRev, Boolean(deleted), nowIso, numericProfileId],
    );
    const row = profRes.rows[0];
    if (!row) return null;

    let liveClassMeta = {};
    if (row.source_live_class_id) {
      const lcRes = await txClient.query(
        `SELECT management_class_source_id AS source_live_class_code, teacher_display_name FROM live_classes WHERE id = $1`,
        [row.source_live_class_id],
      );
      liveClassMeta = lcRes.rows[0] || {};
    }

    const formattedProfile = formatProfileExportRecord({ ...row, ...liveClassMeta });
    const envelope = await insertOutboxEnvelope(txClient, buildV2EventEnvelope({
      eventType: formattedProfile.deleted ? "profile.tombstoned" : eventType,
      aggregateType: "profile",
      aggregateId: numericProfileId,
      revision: formattedProfile.revision,
      sourceUpdatedAt: formattedProfile.sourceUpdatedAt || nowIso,
      occurredAt: new Date().toISOString(),
      deleted: formattedProfile.deleted,
      deletedAt: formattedProfile.deletedAt,
      correlationId: corr,
      payload: formattedProfile,
    }));

    const resolvedCourseId = Number(courseId || row.course_id);
    if (bumpParentCourse && Number.isSafeInteger(resolvedCourseId) && resolvedCourseId > 0) {
      const courseRev = await allocateNextSyncRevision(txClient);
      await txClient.query(
        `UPDATE courses SET sync_revision = $1 WHERE id = $2`,
        [courseRev, resolvedCourseId],
      );
    }

    return envelope;
  });
}

function classifyOutboxDeliveryError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || error?.errorCode || "MOLY_INGEST_ERROR").slice(0, 80);
  const message = String(error?.message || "Failed to deliver course catalog event to Moly.").slice(0, 500);
  if (PERMANENT_HTTP_CODES.has(status) || error?.retryable === false) {
    return { permanent: true, code, message };
  }
  return { permanent: false, code, message };
}

/**
 * Claims pending/failed rows from `course_integration_outbox` and pushes signed
 * v2 envelopes to Moly `/api/integrations/v2/events/ingest`.
 */
export async function processAvailableCourseCatalogOutbox({
  db = defaultDb,
  molyClient = null,
  workerId = `course-outbox-${process.pid}`,
  limit = 25,
  leaseSeconds = 60,
  retryBaseSeconds = 30,
  maxBackoffSeconds = 1800,
  now = () => new Date(),
  env = process.env,
} = {}) {
  if (isCatalogSyncKillSwitchActive(env)) {
    return { skipped: true, reason: "kill_switch", claimed: 0, results: [] };
  }
  if (!(await hasCatalogSyncTables(db))) {
    return { skipped: true, reason: "schema_not_ready", claimed: 0, results: [] };
  }
  if (!molyClient || typeof molyClient.postV2Event !== "function") {
    return { skipped: true, reason: "client_unavailable", claimed: 0, results: [] };
  }
  if (typeof molyClient.isConfigured === "function" && !molyClient.isConfigured()) {
    return { skipped: true, reason: "client_not_configured", claimed: 0, results: [] };
  }

  const boundedLimit = normalizePositiveInt(limit, 25, { min: 1, max: 200 });
  const nowDate = now();

  const claimedRows = await runInTx(db, async (txClient) => {
    await txClient.query(
      `UPDATE course_integration_outbox
       SET status = 'failed',
           locked_until = NULL,
           locked_by = NULL,
           last_error_code = COALESCE(last_error_code, 'WORKER_LEASE_EXPIRED')
       WHERE target_system = 'moly'
         AND status = 'processing'
         AND locked_until < $1`,
      [nowDate.toISOString()],
    );

    const claimRes = await txClient.query(
      `WITH candidate AS (
         SELECT id
         FROM course_integration_outbox
         WHERE target_system = 'moly'
           AND status IN ('pending', 'failed')
           AND next_retry_at <= $1
           AND (locked_until IS NULL OR locked_until < $1)
         ORDER BY aggregate_revision ASC, id ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE course_integration_outbox o
       SET status = 'processing',
           locked_by = $3,
           locked_until = $4::timestamptz,
           updated_at = NOW()
       FROM candidate
       WHERE o.id = candidate.id
       RETURNING o.*`,
      [
        nowDate.toISOString(),
        boundedLimit,
        String(workerId).slice(0, 100),
        new Date(nowDate.getTime() + leaseSeconds * 1000).toISOString(),
      ],
    );
    return claimRes.rows;
  });

  const results = [];
  for (const row of claimedRows) {
    if (isCatalogSyncKillSwitchActive(env)) {
      await db.query(
        `UPDATE course_integration_outbox
         SET status = 'failed', locked_until = NULL, locked_by = NULL, next_retry_at = $2
         WHERE id = $1`,
        [row.id, now().toISOString()],
      );
      results.push({ id: row.id, eventId: row.event_id, status: "deferred_kill_switch" });
      break;
    }

    const envelope = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    try {
      await molyClient.postV2Event(envelope, {
        idempotencyKey: row.idempotency_key,
        correlationId: row.correlation_id,
      });
      await db.query(
        `UPDATE course_integration_outbox
         SET status = 'sent',
             sent_at = COALESCE(sent_at, $2::timestamptz),
             locked_until = NULL,
             locked_by = NULL,
             last_error_code = NULL,
             last_error_message = NULL
         WHERE id = $1`,
        [row.id, now().toISOString()],
      );
      recordIntegrationMetric("course.catalog_outbox_sent");
      results.push({ id: row.id, eventId: row.event_id, status: "sent" });
    } catch (error) {
      const nextAttempt = Number(row.attempt_count || 0) + 1;
      const maxAttempts = Number(row.max_attempts || 10);
      const { permanent, code, message } = classifyOutboxDeliveryError(error);
      const terminal = permanent || nextAttempt >= maxAttempts;
      const delaySec = Math.min(maxBackoffSeconds, retryBaseSeconds * (2 ** Math.max(0, nextAttempt - 1)));
      const nextRetryIso = new Date(now().getTime() + delaySec * 1000).toISOString();

      await db.query(
        `UPDATE course_integration_outbox
         SET status = $2,
             attempt_count = $3,
             next_retry_at = $4::timestamptz,
             locked_until = NULL,
             locked_by = NULL,
             last_error_code = $5,
             last_error_message = $6
         WHERE id = $1`,
        [row.id, terminal ? "dead_letter" : "failed", nextAttempt, nextRetryIso, code, message],
      );
      recordIntegrationMetric(terminal ? "course.catalog_outbox_dead_letter" : "course.catalog_outbox_retry");
      catalogLog.warn("catalog_outbox_delivery_failed", {
        outboxId: row.id,
        eventId: row.event_id,
        attempt: nextAttempt,
        terminal,
        errorCode: code,
      }, row.correlation_id);
      results.push({
        id: row.id,
        eventId: row.event_id,
        status: terminal ? "dead_letter" : "failed",
        errorCode: code,
      });
    }
  }

  return { skipped: false, claimed: claimedRows.length, results };
}
