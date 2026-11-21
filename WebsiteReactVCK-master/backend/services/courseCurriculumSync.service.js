import { getClient, query } from "../db/connect.js";
import {
  allocateNextSyncRevision,
  buildV2EventEnvelope,
  encodeExportCursor,
  decodeExportCursor,
  hasCatalogSyncTables,
  insertOutboxEnvelopeIfReady,
} from "./courseCatalogSync.service.js";
import { ExternalIntegrationError } from "./externalCourseMapping.service.js";
import {
  observeIntegrationLatency,
  recordIntegrationMetric,
  resolveCorrelationId,
} from "./integrationLogger.service.js";
import { loadReferencedRecordingCurriculum } from "./recordingCurriculumReference.service.js";

const defaultDb = { query, getClient };

const toIso = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const normalizePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

/**
 * Strips executable markup, event handlers, and unsafe URI schemes from
 * instructor-authored theory HTML before returning or projecting across apps.
 */
export function sanitizeTheoryHtml(rawHtml) {
  if (typeof rawHtml !== "string" || !rawHtml.trim()) return "";
  let cleaned = rawHtml
    // Strip script, style, iframe, object, embed, meta, link, base, form tags with bodies/attrs
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|meta|link|base|form)\b[^>]*\/?>/gi, "")
    // Strip inline DOM event attributes such as onclick=..., onload=...
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Strip javascript:, vbscript:, data:text/html attributes inside href/src/action/xlink:href
    .replace(
      /\s(href|src|xlink:href|action|formaction|poster)\s*=\s*(?:"\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"]*"|'\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^']*'|[^\s>]*javascript:[^\s>]*)/gi,
      ' $1="#"',
    )
    // Remove CSS expressions / url(javascript:...) inside inline style attributes
    .replace(/style\s*=\s*(?:"[^"]*(?:expression|javascript:)[^"]*"|'[^']*(?:expression|javascript:)[^']*')/gi, "");

  return cleaned.trim();
}

function inferFileKind(mimeType, originalName) {
  const mime = String(mimeType || "").toLowerCase();
  const name = String(originalName || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.(ppt|pptx|key)$/i.test(name)) {
    return "slides";
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "document";
}

function groupByKey(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const k = String(row[keyField]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

/**
 * Loads sanitized curriculum trees (sections, units, video part metadata, theory metadata,
 * file placement metadata, vocab/formula counts, quiz/assignment descriptors) for one profile.
 * Strictly omits restricted payloads (no contentHtml, transcript, vocab items, formulas, or secret URLs).
 */
export async function loadProfileCurriculumTree(
  runner,
  { course, profile, includeTombstoned = true } = {},
) {
  const mode = String(profile.mode || "INDEPENDENT").toUpperCase() === "MIRROR" ? "MIRROR" : "INDEPENDENT";
  const coursePublished = !course.sync_deleted_at && Boolean(course.is_published);
  const profileActive = !profile.deleted_at && profile.status === "active";

  if (mode === "MIRROR") {
    const liveClassId = normalizePositiveId(profile.source_live_class_id);
    if (!liveClassId) {
      return {
        profileId: String(profile.id),
        externalOfferingId: profile.management_class_id ? String(profile.management_class_id) : `profile:${profile.id}`,
        courseId: String(course.id),
        mode,
        managementClassId: profile.management_class_id || null,
        sourceLiveClassId: null,
        status: profile.deleted_at ? "archived" : profile.status,
        capabilities: {
          allowFileDownload: Boolean(profile.allow_file_download),
          deviceLimit: Number(profile.device_limit || 2),
          enforceTrustedDevices: profile.enforce_trusted_devices !== false,
        },
        sections: [],
        units: [],
      };
    }

    const sessionsRes = await runner.query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
              cs.chapter_id, cs.course_section_id, cs.is_public_preview, cs.created_at, cs.updated_at,
              cc.title AS chapter_title, cc.position AS chapter_position,
              s.title AS course_section_title, s.sort_order AS course_section_sort_order
       FROM class_sessions cs
       LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
       LEFT JOIN sections s ON s.id = cs.course_section_id
       WHERE cs.live_class_id = $1
         AND ($2::boolean = TRUE OR cs.status <> 'cancelled')
       ORDER BY COALESCE(s.sort_order, cc.position, 0) ASC, cs.start_time ASC, cs.id ASC`,
      [liveClassId, includeTombstoned],
    );

    const sessionRows = sessionsRes.rows;
    const sessionIds = sessionRows.map((r) => Number(r.id));
    if (sessionIds.length === 0) {
      return {
        profileId: String(profile.id),
        externalOfferingId: profile.management_class_id ? String(profile.management_class_id) : `profile:${profile.id}`,
        courseId: String(course.id),
        mode,
        managementClassId: profile.management_class_id || null,
        sourceLiveClassId: String(liveClassId),
        status: profile.deleted_at ? "archived" : profile.status,
        capabilities: {
          allowFileDownload: Boolean(profile.allow_file_download),
          deviceLimit: Number(profile.device_limit || 2),
          enforceTrustedDevices: profile.enforce_trusted_devices !== false,
        },
        sections: [],
        units: [],
      };
    }

    const [videosRes, theoryRes, vocabRes, formulaRes, directFilesRes, placedFilesRes, quizRes, assignRes] = await Promise.all([
      runner.query(
        `SELECT csv.id AS placement_id, csv.class_session_id AS unit_id, csv.video_asset_id,
                csv.title AS part_title, csv.video_type, csv.sort_order, csv.is_published, csv.updated_at,
                va.title AS asset_title, va.duration_seconds, va.playback_status, va.thumbnail_url
         FROM class_session_videos csv
         JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
         WHERE csv.class_session_id = ANY($1::bigint[])
         ORDER BY csv.class_session_id ASC, (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
        [sessionIds],
      ),
      runner.query(
        `SELECT class_session_id AS unit_id, title, summary,
                (NULLIF(btrim(COALESCE(content_html, '')), '') IS NOT NULL) AS has_content_html,
                (NULLIF(btrim(COALESCE(transcript, '')), '') IS NOT NULL) AS has_transcript,
                COALESCE(jsonb_array_length(key_takeaways), 0)::int AS takeaway_count,
                COALESCE(jsonb_array_length(timestamps_json), 0)::int AS timestamp_count,
                updated_at
         FROM learning_unit_theory
         WHERE class_session_id = ANY($1::bigint[])`,
        [sessionIds],
      ),
      runner.query(
        `SELECT session_id AS unit_id, COUNT(*)::int AS cnt, MAX(updated_at) AS latest_at
         FROM session_vocabularies
         WHERE session_id = ANY($1::bigint[])
         GROUP BY session_id`,
        [sessionIds],
      ),
      runner.query(
        `SELECT session_id AS unit_id, COUNT(*)::int AS cnt, MAX(updated_at) AS latest_at
         FROM session_formulas
         WHERE session_id = ANY($1::bigint[])
         GROUP BY session_id`,
        [sessionIds],
      ),
      runner.query(
        `SELECT lf.id AS file_id, lf.class_session_id AS unit_id, lf.original_name,
                lf.mime_type, lf.size_bytes, lf.sync_revision AS revision, lf.updated_at,
                NULL::bigint AS placement_id, 0 AS sort_order
         FROM lms_learning_files lf
         WHERE lf.class_session_id = ANY($1::bigint[]) AND lf.status = 'ready' AND lf.deleted_at IS NULL`,
        [sessionIds],
      ),
      runner.query(
        `SELECT lfp.class_session_id AS unit_id, lf.id AS file_id, lf.original_name,
                lf.mime_type, lf.size_bytes, lf.sync_revision AS revision, lf.updated_at,
                lfp.id AS placement_id, COALESCE(lfp.sort_order, 0) AS sort_order
         FROM lms_learning_file_placements lfp
         JOIN lms_learning_files lf ON lf.id = lfp.file_id
         WHERE lfp.class_session_id = ANY($1::bigint[]) AND lfp.deleted_at IS NULL AND lf.status = 'ready' AND lf.deleted_at IS NULL`,
        [sessionIds],
      ),
      runner.query(
        `SELECT id, class_session_id AS unit_id, title, duration_minutes, passing_score, status, updated_at
         FROM quizzes
         WHERE class_session_id = ANY($1::bigint[]) AND status = 'PUBLISHED'
         ORDER BY id ASC`,
        [sessionIds],
      ),
      runner.query(
        `SELECT id, class_session_id AS unit_id, title, max_score, due_date, updated_at
         FROM assignments
         WHERE class_session_id = ANY($1::bigint[])
            OR (class_session_id IS NULL AND live_class_id = $2)
            OR (class_session_id IS NULL AND live_class_id IS NULL AND lesson_id IS NULL AND course_id = $3)
         ORDER BY id ASC`,
        [sessionIds, liveClassId, course.id],
      ),
    ]);

    const videosByUnit = groupByKey(videosRes.rows, "unit_id");
    const theoryByUnit = new Map(theoryRes.rows.map((r) => [String(r.unit_id), r]));
    const vocabByUnit = new Map(vocabRes.rows.map((r) => [String(r.unit_id), Number(r.cnt || 0)]));
    const formulaByUnit = new Map(formulaRes.rows.map((r) => [String(r.unit_id), Number(r.cnt || 0)]));
    const quizByUnit = groupByKey(quizRes.rows, "unit_id");

    // Scope assignments: direct class_session assignments belong strictly to that session;
    // course/class-wide assignments attach cleanly without inflating every session if session-scoped ones exist.
    const assignmentsByUnit = new Map();
    const sharedAssignments = assignRes.rows.filter((a) => !a.unit_id);
    for (const row of assignRes.rows) {
      if (!row.unit_id) continue;
      const k = String(row.unit_id);
      if (!assignmentsByUnit.has(k)) assignmentsByUnit.set(k, []);
      assignmentsByUnit.get(k).push(row);
    }

    const filesByUnit = new Map();
    for (const row of [...directFilesRes.rows, ...placedFilesRes.rows]) {
      const k = String(row.unit_id);
      if (!filesByUnit.has(k)) filesByUnit.set(k, new Map());
      const fMap = filesByUnit.get(k);
      const existing = fMap.get(String(row.file_id));
      const placementEntry = row.placement_id
        ? {
          placementId: String(row.placement_id),
          unitType: "class_session",
          unitId: String(row.unit_id),
          sortOrder: Number(row.sort_order || 0),
        }
        : null;
      if (!existing) {
        fMap.set(String(row.file_id), {
          ...row,
          placements: placementEntry ? [placementEntry] : [],
        });
      } else if (placementEntry) {
        existing.placements.push(placementEntry);
      }
    }

    const sectionsMap = new Map();
    const units = sessionRows.map((row, idx) => {
      const uKey = String(row.id);
      const isCancelled = row.status === "cancelled";
      const deleted = Boolean(course.sync_deleted_at || profile.deleted_at || isCancelled);
      const unitPublished = !deleted && coursePublished && profileActive;
      const secId = row.course_section_id
        ? `sec:${row.course_section_id}`
        : row.chapter_id
          ? `chap:${row.chapter_id}`
          : "chap:default";
      const secTitle = String(row.course_section_title || row.chapter_title || "Lộ trình buổi học").trim();
      const secSort = Number(row.course_section_sort_order ?? row.chapter_position ?? 0);

      if (!deleted && !sectionsMap.has(secId)) {
        sectionsMap.set(secId, {
          sectionId: secId,
          title: secTitle,
          sortOrder: secSort,
          isPublished: coursePublished && profileActive,
        });
      }

      const rawVideos = videosByUnit.get(uKey) || [];
      const pubVideos = rawVideos.filter((v) => v.is_published === true);
      const videoParts = pubVideos.map((v, pIdx) => ({
        placementId: String(v.placement_id),
        assetId: String(v.video_asset_id),
        partNumber: pIdx + 1,
        title: v.part_title || v.asset_title || `Phần ${pIdx + 1}`,
        videoType: v.video_type || "primary",
        durationSeconds: Number(v.duration_seconds || 0),
        playbackStatus: v.playback_status || "ready",
        isPublished: true,
        thumbnailUrl: v.thumbnail_url || null,
      }));
      const durationSeconds = videoParts.reduce((sum, v) => sum + v.durationSeconds, 0);

      const th = theoryByUnit.get(uKey) || null;
      const hasTheory = Boolean(
        th && (th.has_content_html || th.has_transcript || th.summary || th.takeaway_count > 0 || th.timestamp_count > 0),
      );
      const unitFiles = Array.from((filesByUnit.get(uKey) || new Map()).values()).map((f, fIdx) => {
        const fileKind = inferFileKind(f.mime_type, f.original_name);
        return {
          fileId: String(f.file_id),
          title: f.original_name || `Tài liệu ${fIdx + 1}`,
          originalFilename: f.original_name || null,
          mimeType: f.mime_type || null,
          fileKind,
          sizeBytes: f.size_bytes != null ? Number(f.size_bytes) : null,
          isSlide: fileKind === "slides",
          allowView: true,
          allowDownload: profile.allow_file_download === true,
          allowDownloadOverride: null,
          sortOrder: Number(f.sort_order ?? fIdx),
          isPublished: unitPublished,
          revision: Number(f.revision || 1),
          updatedAt: toIso(f.updated_at),
          placements: Array.isArray(f.placements) ? f.placements : [],
        };
      });

      const unitQuizzes = (quizByUnit.get(uKey) || []).map((q) => ({
        quizId: String(q.id),
        title: q.title,
        durationMinutes: q.duration_minutes != null ? Number(q.duration_minutes) : null,
        passingScore: q.passing_score != null ? Number(q.passing_score) : 60,
      }));
      const directAssignments = assignmentsByUnit.get(uKey) || [];
      const effectiveAssignments = directAssignments.length > 0
        ? directAssignments
        : (idx === 0 ? sharedAssignments : []);

      return {
        unitKey: `class_session:${row.id}`,
        unitType: "class_session",
        unitId: String(row.id),
        sectionId: secId,
        sectionTitle: secTitle,
        sectionSortOrder: secSort,
        title: row.title || `Buổi ${idx + 1}`,
        summary: th?.summary || null,
        sortOrder: idx,
        sessionNumber: idx + 1,
        durationSeconds,
        isPublished: unitPublished,
        isPublicPreview: Boolean(row.is_public_preview) && !deleted,
        deleted,
        deletedAt: isCancelled ? toIso(row.updated_at) : toIso(profile.deleted_at || course.sync_deleted_at),
        revision: Number(profile.sync_revision || course.sync_revision || 1),
        sourceUpdatedAt: toIso(row.updated_at || row.created_at),
        videoPartCount: videoParts.length,
        videoParts,
        theory: {
          hasTheory,
          hasTranscript: Boolean(th?.has_transcript),
          takeawayCount: Number(th?.takeaway_count || 0),
          timestampCount: Number(th?.timestamp_count || 0),
          title: th?.title || null,
          summary: th?.summary || null,
          updatedAt: toIso(th?.updated_at),
        },
        counts: {
          videos: videoParts.length,
          vocab: vocabByUnit.get(uKey) || 0,
          formulas: formulaByUnit.get(uKey) || 0,
          files: unitFiles.length,
          quizzes: unitQuizzes.length,
          assignments: effectiveAssignments.length,
        },
        files: unitFiles,
        quizzes: unitQuizzes,
        assignments: effectiveAssignments.map((a) => ({
          assignmentId: String(a.id),
          title: a.title,
          maxScore: a.max_score != null ? Number(a.max_score) : 10,
          dueDate: toIso(a.due_date),
        })),
      };
    });

    return {
      profileId: String(profile.id),
      externalOfferingId: profile.management_class_id ? String(profile.management_class_id) : `profile:${profile.id}`,
      courseId: String(course.id),
      mode,
      managementClassId: profile.management_class_id || null,
      sourceLiveClassId: String(liveClassId),
      status: profile.deleted_at ? "archived" : profile.status,
      capabilities: {
        allowFileDownload: Boolean(profile.allow_file_download),
        deviceLimit: Number(profile.device_limit || 2),
        enforceTrustedDevices: profile.enforce_trusted_devices !== false,
      },
      sections: Array.from(sectionsMap.values()),
      units,
    };
  }

  // INDEPENDENT mode: sections + lessons
  const [sectionsRes, lessonsRes] = await Promise.all([
    runner.query(
      `SELECT id, course_id, title, sort_order, updated_at
       FROM sections
       WHERE course_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [course.id],
    ),
    runner.query(
      `SELECT l.id, l.course_id, l.section_id, COALESCE(l.title, l.name) AS title,
              l.description, l.duration_seconds, l.sort_order,
              l.is_published, COALESCE(l.is_public_preview, FALSE) AS is_public_preview,
              l.video_asset_id, l.learning_url, l.created_at, l.updated_at,
              s.title AS section_title, s.sort_order AS section_sort_order,
              va.title AS legacy_asset_title, va.duration_seconds AS legacy_video_duration,
              va.playback_status AS legacy_playback_status, va.thumbnail_url AS legacy_thumbnail_url
       FROM lessons l
       LEFT JOIN sections s ON s.id = l.section_id
       LEFT JOIN video_assets va ON va.id = l.video_asset_id AND va.deleted_at IS NULL
       WHERE l.course_id = $1
       ORDER BY COALESCE(s.sort_order, 0) ASC, l.sort_order ASC, l.id ASC`,
      [course.id],
    ),
  ]);

  const lessonRows = lessonsRes.rows;
  const lessonIds = lessonRows.map((r) => Number(r.id));

  let videosByUnit = new Map();
  let theoryByUnit = new Map();
  let vocabByUnit = new Map();
  let formulaByUnit = new Map();
  let filesByUnit = new Map();
  let quizByUnit = new Map();
  let assignmentsByUnit = new Map();
  let sharedAssignments = [];

  if (lessonIds.length > 0) {
    const [videosRes, theoryRes, vocabRes, formulaRes, placedFilesRes, quizRes, assignRes] = await Promise.all([
      runner.query(
        `SELECT csv.id AS placement_id, csv.lesson_id AS unit_id, csv.video_asset_id,
                csv.title AS part_title, csv.video_type, csv.sort_order, csv.is_published, csv.updated_at,
                va.title AS asset_title, va.duration_seconds, va.playback_status, va.thumbnail_url
         FROM class_session_videos csv
         JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
         WHERE csv.lesson_id = ANY($1::bigint[])
         ORDER BY csv.lesson_id ASC, (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
        [lessonIds],
      ),
      runner.query(
        `SELECT lesson_id AS unit_id, title, summary,
                (NULLIF(btrim(COALESCE(content_html, '')), '') IS NOT NULL) AS has_content_html,
                (NULLIF(btrim(COALESCE(transcript, '')), '') IS NOT NULL) AS has_transcript,
                COALESCE(jsonb_array_length(key_takeaways), 0)::int AS takeaway_count,
                COALESCE(jsonb_array_length(timestamps_json), 0)::int AS timestamp_count,
                updated_at
         FROM learning_unit_theory
         WHERE lesson_id = ANY($1::bigint[])`,
        [lessonIds],
      ),
      runner.query(
        `SELECT lesson_id AS unit_id, COUNT(*)::int AS cnt
         FROM session_vocabularies
         WHERE lesson_id = ANY($1::bigint[])
         GROUP BY lesson_id`,
        [lessonIds],
      ),
      runner.query(
        `SELECT lesson_id AS unit_id, COUNT(*)::int AS cnt
         FROM session_formulas
         WHERE lesson_id = ANY($1::bigint[])
         GROUP BY lesson_id`,
        [lessonIds],
      ),
      runner.query(
        `SELECT llfp.id AS placement_id, llfp.lesson_id AS unit_id, llfp.sort_order, lf.id AS file_id,
                lf.original_name, lf.mime_type, lf.size_bytes, lf.sync_revision AS revision, lf.updated_at
         FROM lesson_learning_file_placements llfp
         JOIN lms_learning_files lf ON lf.id = llfp.file_id
         WHERE llfp.lesson_id = ANY($1::bigint[]) AND lf.status = 'ready' AND lf.deleted_at IS NULL
         ORDER BY llfp.lesson_id ASC, llfp.sort_order ASC, llfp.id ASC`,
        [lessonIds],
      ),
      runner.query(
        `SELECT id, lesson_id AS unit_id, title, duration_minutes, passing_score, status, updated_at
         FROM quizzes
         WHERE lesson_id = ANY($1::bigint[]) AND status = 'PUBLISHED'
         ORDER BY id ASC`,
        [lessonIds],
      ),
      runner.query(
        `SELECT id, lesson_id AS unit_id, title, max_score, due_date, updated_at
         FROM assignments
         WHERE lesson_id = ANY($1::bigint[])
            OR (course_id = $2 AND lesson_id IS NULL AND live_class_id IS NULL AND class_session_id IS NULL)
         ORDER BY id ASC`,
        [lessonIds, course.id],
      ),
    ]);

    videosByUnit = groupByKey(videosRes.rows, "unit_id");
    theoryByUnit = new Map(theoryRes.rows.map((r) => [String(r.unit_id), r]));
    vocabByUnit = new Map(vocabRes.rows.map((r) => [String(r.unit_id), Number(r.cnt || 0)]));
    formulaByUnit = new Map(formulaRes.rows.map((r) => [String(r.unit_id), Number(r.cnt || 0)]));
    filesByUnit = groupByKey(placedFilesRes.rows, "unit_id");
    quizByUnit = groupByKey(quizRes.rows, "unit_id");
    sharedAssignments = assignRes.rows.filter((a) => !a.unit_id);
    for (const row of assignRes.rows) {
      if (!row.unit_id) continue;
      const k = String(row.unit_id);
      if (!assignmentsByUnit.has(k)) assignmentsByUnit.set(k, []);
      assignmentsByUnit.get(k).push(row);
    }
  }

  const sections = sectionsRes.rows.map((s) => ({
    sectionId: String(s.id),
    title: s.title,
    sortOrder: Number(s.sort_order || 0),
    isPublished: coursePublished && profileActive,
  }));

  const units = lessonRows.map((row, idx) => {
    const uKey = String(row.id);
    const deleted = Boolean(course.sync_deleted_at || profile.deleted_at);
    const unitPublished = !deleted && coursePublished && profileActive && Boolean(row.is_published);

    const rawVideos = videosByUnit.get(uKey) || [];
    const pubVideos = rawVideos.filter((v) => v.is_published === true);
    const videoParts = pubVideos.length > 0
      ? pubVideos.map((v, pIdx) => ({
        placementId: String(v.placement_id),
        assetId: String(v.video_asset_id),
        partNumber: pIdx + 1,
        title: v.part_title || v.asset_title || `Phần ${pIdx + 1}`,
        videoType: v.video_type || "primary",
        durationSeconds: Number(v.duration_seconds || 0),
        playbackStatus: v.playback_status || "ready",
        isPublished: true,
        thumbnailUrl: v.thumbnail_url || null,
      }))
      : (row.video_asset_id ? [{
        placementId: `lesson:${row.id}`,
        assetId: String(row.video_asset_id),
        partNumber: 1,
        title: row.legacy_asset_title || row.title || "Video bài giảng",
        videoType: "primary",
        durationSeconds: Number(row.legacy_video_duration || row.duration_seconds || 0),
        playbackStatus: row.legacy_playback_status || "ready",
        isPublished: Boolean(row.is_published),
        thumbnailUrl: row.legacy_thumbnail_url || null,
      }] : []);

    const durationSeconds = videoParts.reduce((sum, v) => sum + v.durationSeconds, 0) || Number(row.duration_seconds || 0);
    const th = theoryByUnit.get(uKey) || null;
    const hasTheory = Boolean(
      th && (th.has_content_html || th.has_transcript || th.summary || th.takeaway_count > 0 || th.timestamp_count > 0),
    );
    const unitFiles = (filesByUnit.get(uKey) || []).map((f, fIdx) => {
      const fileKind = inferFileKind(f.mime_type, f.original_name);
      return {
        fileId: String(f.file_id),
        title: f.original_name || `Tài liệu ${fIdx + 1}`,
        originalFilename: f.original_name || null,
        mimeType: f.mime_type || null,
        fileKind,
        sizeBytes: f.size_bytes != null ? Number(f.size_bytes) : null,
        isSlide: fileKind === "slides",
        allowView: true,
        allowDownload: profile.allow_file_download === true,
        allowDownloadOverride: null,
        sortOrder: Number(f.sort_order ?? fIdx),
        isPublished: unitPublished,
        revision: Number(f.revision || 1),
        updatedAt: toIso(f.updated_at),
        placements: f.placement_id
          ? [{
            placementId: String(f.placement_id),
            unitType: "lesson",
            unitId: String(f.unit_id),
            sortOrder: Number(f.sort_order ?? fIdx),
          }]
          : [],
      };
    });
    const unitQuizzes = (quizByUnit.get(uKey) || []).map((q) => ({
      quizId: String(q.id),
      title: q.title,
      durationMinutes: q.duration_minutes != null ? Number(q.duration_minutes) : null,
      passingScore: q.passing_score != null ? Number(q.passing_score) : 60,
    }));
    const directAssignments = assignmentsByUnit.get(uKey) || [];
    const effectiveAssignments = directAssignments.length > 0
      ? directAssignments
      : (idx === 0 ? sharedAssignments : []);

    return {
      unitKey: `lesson:${row.id}`,
      unitType: "lesson",
      unitId: String(row.id),
      sectionId: row.section_id ? String(row.section_id) : "sec:default",
      sectionTitle: row.section_title || "Chương 1",
      sectionSortOrder: Number(row.section_sort_order ?? 0),
      title: row.title,
      summary: th?.summary || row.description || null,
      sortOrder: Number(row.sort_order ?? idx),
      sessionNumber: idx + 1,
      durationSeconds,
      isPublished: unitPublished,
      isPublicPreview: Boolean(row.is_public_preview) && unitPublished,
      deleted,
      deletedAt: toIso(profile.deleted_at || course.sync_deleted_at),
      revision: Number(profile.sync_revision || course.sync_revision || 1),
      sourceUpdatedAt: toIso(row.updated_at || row.created_at),
      videoPartCount: videoParts.length,
      videoParts,
      theory: {
        hasTheory,
        hasTranscript: Boolean(th?.has_transcript),
        takeawayCount: Number(th?.takeaway_count || 0),
        timestampCount: Number(th?.timestamp_count || 0),
        title: th?.title || null,
        summary: th?.summary || null,
        updatedAt: toIso(th?.updated_at),
      },
      counts: {
        videos: videoParts.length,
        vocab: vocabByUnit.get(uKey) || 0,
        formulas: formulaByUnit.get(uKey) || 0,
        files: unitFiles.length,
        quizzes: unitQuizzes.length,
        assignments: effectiveAssignments.length,
      },
      files: unitFiles,
      quizzes: unitQuizzes,
      assignments: effectiveAssignments.map((a) => ({
        assignmentId: String(a.id),
        title: a.title,
        maxScore: a.max_score != null ? Number(a.max_score) : 10,
        dueDate: toIso(a.due_date),
      })),
    };
  });

  const referenced = await loadReferencedRecordingCurriculum(runner, {
    course,
    profile,
    includeTombstoned,
  });

  return {
    profileId: String(profile.id),
    externalOfferingId: profile.management_class_id ? String(profile.management_class_id) : `profile:${profile.id}`,
    courseId: String(course.id),
    mode,
    managementClassId: profile.management_class_id || null,
    sourceLiveClassId: null,
    status: profile.deleted_at ? "archived" : profile.status,
    capabilities: {
      allowFileDownload: Boolean(profile.allow_file_download),
      deviceLimit: Number(profile.device_limit || 2),
      enforceTrustedDevices: profile.enforce_trusted_devices !== false,
    },
    sections: [...sections, ...referenced.sections],
    units: [...units, ...referenced.units],
  };
}

/**
 * Exports curriculum metadata for a Course (optionally filtered to one profileId)
 * with keyset unit pagination and sanitized metadata (never restricted bodies).
 */
export async function exportCourseCurriculum({
  db = defaultDb,
  courseId,
  profileId = null,
  afterRevision = "0",
  afterId = "0",
  cursor = null,
  limit = 200,
  includeTombstoned = true,
  correlationId = null,
} = {}) {
  const startMs = Date.now();
  const corr = resolveCorrelationId(correlationId);
  const parsedCourseId = normalizePositiveId(courseId);
  if (!parsedCourseId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "courseId must be a positive integer.");
  }
  const parsedProfileId = profileId != null && profileId !== "" ? normalizePositiveId(profileId) : null;
  if (profileId != null && profileId !== "" && !parsedProfileId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "profileId must be a positive integer.");
  }

  let parsedCursor = null;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
      if (decoded && (decoded.p != null || decoded.t != null)) {
        parsedCursor = {
          afterRevision: normalizeNonNegativeBigIntString(decoded.r, "0"),
          afterId: normalizeNonNegativeBigIntString(decoded.i, "0"),
          profileId: decoded.p ? String(decoded.p) : null,
          unitType: decoded.t ? String(decoded.t) : null,
        };
      } else {
        parsedCursor = decodeExportCursor(cursor);
      }
    } catch {
      parsedCursor = decodeExportCursor(cursor);
    }
  }
  const effectiveAfterRev = Number(
    parsedCursor ? parsedCursor.afterRevision : normalizeNonNegativeBigIntString(afterRevision, "0"),
  );
  const effectiveAfterId = Number(
    parsedCursor ? parsedCursor.afterId : normalizeNonNegativeBigIntString(afterId, "0"),
  );
  const boundedLimit = normalizePositiveInt(limit, 200, { min: 1, max: 500 });
  const includeDeleted = includeTombstoned !== false && String(includeTombstoned).toLowerCase() !== "false";

  const courseRow = (
    await db.query(
      `SELECT id, name, title, slug, is_published, sync_revision, sync_deleted_at, created_at, updated_at
       FROM courses
       WHERE id = $1
       LIMIT 1`,
      [parsedCourseId],
    )
  ).rows[0];
  if (!courseRow) {
    throw new ExternalIntegrationError(404, "COURSE_NOT_FOUND", `Course ${parsedCourseId} not found.`);
  }

  const profilesRes = await db.query(
    `SELECT *
     FROM video_course_profiles
     WHERE course_id = $1
       AND ($2::bigint IS NULL OR id = $2)
       AND ($3::boolean = TRUE OR deleted_at IS NULL)
     ORDER BY id ASC`,
    [parsedCourseId, parsedProfileId, includeDeleted],
  );
  if (parsedProfileId && profilesRes.rows.length === 0) {
    const mismatchCheck = (
      await db.query(`SELECT id, course_id FROM video_course_profiles WHERE id = $1 LIMIT 1`, [parsedProfileId])
    ).rows[0];
    if (mismatchCheck) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        `Profile ${parsedProfileId} does not belong to course ${parsedCourseId}.`,
      );
    }
    throw new ExternalIntegrationError(404, "PROFILE_NOT_FOUND", `Profile ${parsedProfileId} not found.`);
  }

  const trees = [];
  const flattened = [];
  let totalUnitCount = 0;

  for (const prof of profilesRes.rows) {
    const tree = await loadProfileCurriculumTree(db, {
      course: courseRow,
      profile: prof,
      includeTombstoned: includeDeleted,
    });
    trees.push(tree);
    totalUnitCount += tree.units.length;
    for (const unit of tree.units) {
      flattened.push({ profileId: String(prof.id), unit });
    }
  }

  flattened.sort((a, b) => {
    const revDiff = Number(a.unit.revision || 1) - Number(b.unit.revision || 1);
    if (revDiff !== 0) return revDiff;
    const profDiff = Number(a.profileId || 0) - Number(b.profileId || 0);
    if (profDiff !== 0) return profDiff;
    const secDiff = Number(a.unit.sectionSortOrder ?? 0) - Number(b.unit.sectionSortOrder ?? 0);
    if (secDiff !== 0) return secDiff;
    const sortDiff = Number(a.unit.sortOrder ?? 0) - Number(b.unit.sortOrder ?? 0);
    if (sortDiff !== 0) return sortDiff;
    const typeCmp = String(a.unit.unitType).localeCompare(String(b.unit.unitType));
    if (typeCmp !== 0) return typeCmp;
    return Number(a.unit.unitId || 0) - Number(b.unit.unitId || 0);
  });

  let remainingFlattened;
  if (parsedCursor && parsedCursor.profileId && parsedCursor.unitType) {
    const exactIdx = flattened.findIndex(
      (item) =>
        item.profileId === parsedCursor.profileId
        && item.unit.unitType === parsedCursor.unitType
        && String(item.unit.unitId) === String(effectiveAfterId),
    );
    if (exactIdx >= 0) {
      remainingFlattened = flattened.slice(exactIdx + 1);
    } else {
      remainingFlattened = flattened.filter((item) => {
        const uRev = Number(item.unit.revision || 1);
        if (uRev !== effectiveAfterRev) return uRev > effectiveAfterRev;
        const pDiff = Number(item.profileId || 0) - Number(parsedCursor.profileId || 0);
        if (pDiff !== 0) return pDiff > 0;
        return Number(item.unit.unitId || 0) > effectiveAfterId;
      });
    }
  } else {
    remainingFlattened = flattened.filter((item) => {
      const uRev = Number(item.unit.revision || 1);
      const uNumId = Number(item.unit.unitId || 0);
      return uRev > effectiveAfterRev || (uRev === effectiveAfterRev && uNumId > effectiveAfterId);
    });
  }

  const pageItems = remainingFlattened.slice(0, boundedLimit);
  const hasMore = remainingFlattened.length > boundedLimit;
  const returnedUnitCount = pageItems.length;
  const unitsByProfileId = new Map();
  for (const item of pageItems) {
    if (!unitsByProfileId.has(item.profileId)) unitsByProfileId.set(item.profileId, []);
    unitsByProfileId.get(item.profileId).push(item.unit);
  }
  const profiles = trees.map((tree) => ({
    ...tree,
    units: unitsByProfileId.get(String(tree.profileId)) || [],
  }));

  let nextCursor = null;
  if (hasMore && pageItems.length > 0) {
    const tail = pageItems[pageItems.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({
        r: String(tail.unit.revision || 1),
        i: String(tail.unit.unitId || 0),
        p: String(tail.profileId),
        t: String(tail.unit.unitType),
      }),
      "utf8",
    ).toString("base64url");
  }
  observeIntegrationLatency("course.curriculum_export_ms", Date.now() - startMs);
  recordIntegrationMetric("course.curriculum_export_pages");

  return {
    correlationId: corr,
    course: {
      courseId: String(courseRow.id),
      slug: courseRow.slug,
      title: String(courseRow.title || courseRow.name || `Course #${courseRow.id}`).trim(),
      isPublished: !courseRow.sync_deleted_at && Boolean(courseRow.is_published),
      revision: Number(courseRow.sync_revision || 1),
      deleted: Boolean(courseRow.sync_deleted_at),
    },
    profiles,
    pagination: {
      afterRevision: effectiveAfterRev,
      afterId: effectiveAfterId,
      nextCursor,
      hasMore,
      limit: boundedLimit,
      totalUnits: totalUnitCount,
      returnedUnits: returnedUnitCount,
    },
  };
}

async function resolveCourseAndProfilesForUnit(runner, { unitType, unitId, courseId = null }) {
  const numericUnitId = normalizePositiveId(unitId);
  let resolvedCourseId = normalizePositiveId(courseId);
  let targetProfileIds = [];

  if (unitType === "class_session" && numericUnitId) {
    const res = await runner.query(
      `SELECT cs.live_class_id, lc.course_id, vcp.id AS profile_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       LEFT JOIN video_course_profiles vcp
         ON vcp.mode = 'MIRROR' AND vcp.source_live_class_id = cs.live_class_id AND vcp.deleted_at IS NULL
       WHERE cs.id = $1`,
      [numericUnitId],
    );
    if (res.rows[0]) {
      resolvedCourseId = resolvedCourseId || Number(res.rows[0].course_id);
      targetProfileIds = res.rows.map((r) => r.profile_id).filter(Boolean).map(String);
    }
  } else if (unitType === "lesson" && numericUnitId) {
    const res = await runner.query(
      `SELECT l.course_id, vcp.id AS profile_id
       FROM lessons l
       LEFT JOIN video_course_profiles vcp
         ON vcp.mode = 'INDEPENDENT' AND vcp.course_id = l.course_id AND vcp.deleted_at IS NULL
       WHERE l.id = $1`,
      [numericUnitId],
    );
    if (res.rows[0]) {
      resolvedCourseId = resolvedCourseId || Number(res.rows[0].course_id);
      targetProfileIds = res.rows.map((r) => r.profile_id).filter(Boolean).map(String);
    }
  }

  return { courseId: resolvedCourseId, profileIds: [...new Set(targetProfileIds)] };
}

async function exportAllCurriculumPages({
  db,
  courseId,
  profileId = null,
  includeTombstoned = true,
  correlationId = null,
} = {}) {
  let cursor = null;
  let firstPage = null;
  const profilesById = new Map();

  for (let page = 0; page < 100; page += 1) {
    const chunk = await exportCourseCurriculum({
      db,
      courseId,
      profileId,
      includeTombstoned,
      cursor,
      limit: 500,
      correlationId,
    });
    if (!firstPage) {
      firstPage = { ...chunk, profiles: [] };
    }
    for (const prof of chunk.profiles || []) {
      const key = String(prof.profileId);
      if (!profilesById.has(key)) {
        profilesById.set(key, { ...prof, units: [...(prof.units || [])] });
      } else {
        profilesById.get(key).units.push(...(prof.units || []));
      }
    }
    if (!chunk.pagination?.hasMore || !chunk.pagination?.nextCursor) break;
    cursor = chunk.pagination.nextCursor;
  }

  return {
    ...(firstPage || { course: null }),
    profiles: [...profilesById.values()],
  };
}

/**
 * Enqueues a `curriculum.upserted` or `curriculum.tombstoned` v2 event after curriculum edits.
 */
export async function recordCurriculumMutation({
  db = defaultDb,
  courseId = null,
  profileId = null,
  unitType = null,
  unitId = null,
  eventType = "curriculum.upserted",
  deleted = false,
  deletedAt = null,
  beforeDeleteSnapshot = null,
  correlationId = null,
} = {}) {
  if (!(await hasCatalogSyncTables(db))) return null;

  const client = typeof db.getClient === "function" ? await db.getClient() : null;
  const runTx = async (tx) => {
    const corr = resolveCorrelationId(correlationId);
    const nowIso = toIso(deletedAt) || new Date().toISOString();

    if (beforeDeleteSnapshot) {
      const targetCourseId = normalizePositiveId(beforeDeleteSnapshot.courseId || courseId);
      if (!targetCourseId) return null;
      const rev = await allocateNextSyncRevision(tx);
      const tombPayload = {
        courseId: String(targetCourseId),
        profileIds: Array.isArray(beforeDeleteSnapshot.profileIds)
          ? beforeDeleteSnapshot.profileIds.map(String)
          : [],
        tombstonedUnits: beforeDeleteSnapshot.units || [
          {
            unitType: beforeDeleteSnapshot.unitType || unitType,
            unitId: String(beforeDeleteSnapshot.unitId || unitId),
            title: beforeDeleteSnapshot.title || null,
            deletedAt: nowIso,
          },
        ],
      };
      const aggId = beforeDeleteSnapshot.unitId
        ? `${targetCourseId}:${beforeDeleteSnapshot.unitType || unitType}:${beforeDeleteSnapshot.unitId}`
        : `course:${targetCourseId}:sec:${beforeDeleteSnapshot.sectionId || "batch"}`;
      return insertOutboxEnvelopeIfReady(tx, buildV2EventEnvelope({
        eventType: "curriculum.tombstoned",
        aggregateType: "curriculum",
        aggregateId: aggId,
        revision: rev,
        sourceUpdatedAt: nowIso,
        occurredAt: nowIso,
        deleted: true,
        deletedAt: nowIso,
        correlationId: corr,
        payload: tombPayload,
      }));
    }

    let resolvedCourseId = normalizePositiveId(courseId);
    let scopedProfileId = normalizePositiveId(profileId);
    if (!resolvedCourseId && unitType && unitId) {
      const resolved = await resolveCourseAndProfilesForUnit(tx, { unitType, unitId });
      resolvedCourseId = resolved.courseId;
      if (!scopedProfileId && resolved.profileIds.length === 1) {
        scopedProfileId = Number(resolved.profileIds[0]);
      }
    }
    if (!resolvedCourseId) return null;

    const rev = await allocateNextSyncRevision(tx);
    await tx.query(`UPDATE courses SET sync_revision = GREATEST(sync_revision, $1) WHERE id = $2`, [rev, resolvedCourseId]);
    await tx.query(
      `UPDATE video_course_profiles
       SET sync_revision = GREATEST(sync_revision, $1)
       WHERE course_id = $2
         AND ($3::bigint IS NULL OR id = $3)
         AND deleted_at IS NULL`,
      [rev, resolvedCourseId, scopedProfileId],
    );

    const exported = await exportAllCurriculumPages({
      db: tx,
      courseId: resolvedCourseId,
      profileId: scopedProfileId,
      includeTombstoned: true,
      correlationId: corr,
    });
    if (!exported.profiles.length) return null;

    const results = [];
    for (const prof of exported.profiles) {
      const profRev = await allocateNextSyncRevision(tx);
      const unitsWithRev = prof.units.map((u) => ({ ...u, revision: profRev }));
      const envelope = buildV2EventEnvelope({
        eventType: deleted ? "curriculum.tombstoned" : eventType,
        aggregateType: "curriculum",
        aggregateId: `profile:${prof.profileId}`,
        revision: profRev,
        sourceUpdatedAt: nowIso,
        occurredAt: nowIso,
        deleted: Boolean(deleted),
        deletedAt: deleted ? nowIso : null,
        correlationId: corr,
        payload: {
          course: exported.course,
          profile: {
            ...prof,
            revision: profRev,
            units: unitsWithRev,
          },
        },
      });
      await insertOutboxEnvelopeIfReady(tx, envelope);
      results.push(envelope);
    }
    return results.length === 1 ? results[0] : results;
  };

  if (client) {
    try {
      await client.query("BEGIN");
      const out = await runTx(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      if (typeof client.release === "function") client.release();
    }
  }
  return runTx(db);
}

/**
 * Emits `unit_content.upserted` when unit videos, theory metadata, vocabulary,
 * formulas, files, quizzes, assignments, or public preview flags change.
 */
export async function recordUnitContentMutation({
  db = defaultDb,
  unitType,
  unitId,
  courseId = null,
  eventType = "unit_content.upserted",
  correlationId = null,
} = {}) {
  const numericUnitId = normalizePositiveId(unitId);
  if (!numericUnitId || !["class_session", "lesson"].includes(unitType)) return null;
  if (!(await hasCatalogSyncTables(db))) return null;

  const client = typeof db.getClient === "function" ? await db.getClient() : null;
  const runTx = async (tx) => {
    const corr = resolveCorrelationId(correlationId);
    const nowIso = new Date().toISOString();
    const resolved = await resolveCourseAndProfilesForUnit(tx, { unitType, unitId: numericUnitId, courseId });
    if (!resolved.courseId) return null;

    const rev = await allocateNextSyncRevision(tx);
    await tx.query(`UPDATE courses SET sync_revision = GREATEST(sync_revision, $1) WHERE id = $2`, [rev, resolved.courseId]);
    await tx.query(
      `UPDATE video_course_profiles SET sync_revision = GREATEST(sync_revision, $1)
       WHERE course_id = $2 AND deleted_at IS NULL`,
      [rev, resolved.courseId],
    );

    const exported = await exportAllCurriculumPages({
      db: tx,
      courseId: resolved.courseId,
      includeTombstoned: true,
      correlationId: corr,
    });

    const matchingProfiles = exported.profiles
      .map((prof) => {
        const unit = prof.units.find((u) => u.unitType === unitType && String(u.unitId) === String(numericUnitId));
        return unit ? { profileId: prof.profileId, capabilities: prof.capabilities, unit: { ...unit, revision: rev } } : null;
      })
      .filter(Boolean);

    if (matchingProfiles.length === 0) return null;

    const envelope = buildV2EventEnvelope({
      eventType,
      aggregateType: "unit_content",
      aggregateId: `${unitType}:${numericUnitId}`,
      revision: rev,
      sourceUpdatedAt: nowIso,
      occurredAt: nowIso,
      deleted: false,
      deletedAt: null,
      correlationId: corr,
      payload: {
        courseId: String(resolved.courseId),
        unitType,
        unitId: String(numericUnitId),
        profiles: matchingProfiles,
      },
    });
    await insertOutboxEnvelopeIfReady(tx, envelope);
    return envelope;
  };

  if (client) {
    try {
      await client.query("BEGIN");
      const out = await runTx(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      if (typeof client.release === "function") client.release();
    }
  }
  return runTx(db);
}

/**
 * Resolves profileIds and unit title before deleting a lesson or class_session
 * so `curriculum.tombstoned` can still reference all affected profiles.
 */
export async function resolveBeforeDeleteUnitSnapshot(db = defaultDb, { unitType, unitId, courseId = null } = {}) {
  const numericUnitId = normalizePositiveId(unitId);
  if (!numericUnitId || !["lesson", "class_session"].includes(unitType)) return null;
  try {
    if (unitType === "lesson") {
      const res = await db.query(
        `SELECT l.course_id, COALESCE(l.title, l.name) AS title
         FROM lessons l WHERE l.id = $1 LIMIT 1`,
        [numericUnitId],
      );
      const row = res.rows[0];
      const effectiveCourseId = normalizePositiveId(courseId || row?.course_id);
      if (!effectiveCourseId) return null;
      const profRes = await db.query(
        `SELECT id FROM video_course_profiles WHERE course_id = $1 AND mode = 'INDEPENDENT' AND deleted_at IS NULL`,
        [effectiveCourseId],
      );
      return {
        courseId: String(effectiveCourseId),
        profileIds: profRes.rows.map((r) => String(r.id)),
        unitType: "lesson",
        unitId: String(numericUnitId),
        title: row?.title || null,
      };
    }

    const res = await db.query(
      `SELECT cs.title, lc.course_id, cs.live_class_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1 LIMIT 1`,
      [numericUnitId],
    );
    const row = res.rows[0];
    const effectiveCourseId = normalizePositiveId(courseId || row?.course_id);
    if (!effectiveCourseId) return null;
    const profRes = await db.query(
      `SELECT id FROM video_course_profiles
       WHERE mode = 'MIRROR' AND source_live_class_id = $1 AND deleted_at IS NULL`,
      [row?.live_class_id],
    );
    return {
      courseId: String(effectiveCourseId),
      profileIds: profRes.rows.map((r) => String(r.id)),
      unitType: "class_session",
      unitId: String(numericUnitId),
      title: row?.title || null,
    };
  } catch (error) {
    console.warn("[courseCurriculumSync] resolveBeforeDeleteUnitSnapshot failed:", error?.message);
    return null;
  }
}

export async function safeRecordCurriculumMutation(params = {}) {
  try {
    const primary = await recordCurriculumMutation(params);
    const db = params.db || defaultDb;
    const numericSessionId = params.unitType === "class_session"
      ? normalizePositiveId(params.unitId)
      : null;
    if (!numericSessionId) return primary;

    const refs = await db.query(
      `SELECT DISTINCT r.video_course_profile_id AS profile_id, vcp.course_id
       FROM class_sessions cs
       JOIN recording_curriculum_references r ON r.source_live_class_id = cs.live_class_id
       JOIN video_course_profiles vcp ON vcp.id = r.video_course_profile_id
       WHERE cs.id = $1 AND vcp.deleted_at IS NULL AND vcp.status = 'active'`,
      [numericSessionId],
    );
    const linked = [];
    for (const row of refs.rows) {
      const emitted = await recordCurriculumMutation({
        db,
        courseId: row.course_id,
        profileId: row.profile_id,
        eventType: params.eventType || "curriculum.upserted",
        correlationId: params.correlationId || null,
      });
      if (emitted) linked.push(emitted);
    }
    return linked.length ? [primary, ...linked].filter(Boolean) : primary;
  } catch (error) {
    console.warn("[courseCurriculumSync] recordCurriculumMutation failed:", error?.message || error);
    return null;
  }
}

export async function safeRecordUnitContentMutation(params = {}) {
  try {
    const primary = await recordUnitContentMutation(params);
    const db = params.db || defaultDb;
    const numericSessionId = params.unitType === "class_session"
      ? normalizePositiveId(params.unitId)
      : null;
    if (!numericSessionId) return primary;
    const refs = await db.query(
      `SELECT DISTINCT r.video_course_profile_id AS profile_id, vcp.course_id
       FROM class_sessions cs
       JOIN recording_curriculum_references r ON r.source_live_class_id = cs.live_class_id
       JOIN video_course_profiles vcp ON vcp.id = r.video_course_profile_id
       WHERE cs.id = $1 AND vcp.deleted_at IS NULL AND vcp.status = 'active'`,
      [numericSessionId],
    );
    const linked = [];
    for (const row of refs.rows) {
      const emitted = await recordCurriculumMutation({
        db,
        courseId: row.course_id,
        profileId: row.profile_id,
        eventType: "curriculum.upserted",
        correlationId: params.correlationId || null,
      });
      if (emitted) linked.push(emitted);
    }
    return linked.length ? [primary, ...linked].filter(Boolean) : primary;
  } catch (error) {
    console.warn("[courseCurriculumSync] recordUnitContentMutation failed:", error?.message || error);
    return null;
  }
}

export async function safeRecordLiveClassCurriculumMutation({
  db = defaultDb,
  liveClassId,
  eventType = "curriculum.upserted",
  correlationId = null,
} = {}) {
  const numericClassId = normalizePositiveId(liveClassId);
  if (!numericClassId) return null;
  try {
    const profRes = await db.query(
      `SELECT id, course_id
       FROM video_course_profiles
       WHERE mode = 'MIRROR' AND source_live_class_id = $1 AND deleted_at IS NULL
       UNION
       SELECT vcp.id, vcp.course_id
       FROM recording_curriculum_references r
       JOIN video_course_profiles vcp ON vcp.id = r.video_course_profile_id
       WHERE r.source_live_class_id = $1 AND vcp.deleted_at IS NULL`,
      [numericClassId],
    );
    if (!profRes.rows.length) return null;
    const results = [];
    for (const row of profRes.rows) {
      const res = await safeRecordCurriculumMutation({
        db,
        courseId: row.course_id,
        profileId: row.id,
        eventType,
        correlationId,
      });
      if (res) results.push(res);
    }
    return results;
  } catch (error) {
    console.warn("[courseCurriculumSync] safeRecordLiveClassCurriculumMutation failed:", error?.message || error);
    return null;
  }
}

export async function safeRecordVideoAssetContentMutation({
  db = defaultDb,
  videoAssetId,
  correlationId = null,
} = {}) {
  const numericAssetId = normalizePositiveId(videoAssetId);
  if (!numericAssetId) return null;
  try {
    const placements = await db.query(
      `SELECT class_session_id, lesson_id
       FROM class_session_videos
       WHERE video_asset_id = $1`,
      [numericAssetId],
    );
    const seen = new Set();
    for (const row of placements.rows) {
      if (row.class_session_id) {
        const key = `class_session:${row.class_session_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          await safeRecordUnitContentMutation({
            db,
            unitType: "class_session",
            unitId: row.class_session_id,
            correlationId,
          });
        }
      }
      if (row.lesson_id) {
        const key = `lesson:${row.lesson_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          await safeRecordUnitContentMutation({
            db,
            unitType: "lesson",
            unitId: row.lesson_id,
            correlationId,
          });
        }
      }
    }
    const referencedPlacements = await db.query(
      `SELECT DISTINCT vcp.id AS profile_id, vcp.course_id
       FROM recording_curriculum_unit_videos rv
       JOIN recording_curriculum_unit_overrides o ON o.id = rv.unit_override_id
       JOIN recording_curriculum_references r ON r.id = o.curriculum_reference_id
       JOIN video_course_profiles vcp ON vcp.id = r.video_course_profile_id
       WHERE rv.video_asset_id = $1 AND vcp.deleted_at IS NULL`,
      [numericAssetId],
    ).catch(() => ({ rows: [] }));
    for (const row of referencedPlacements.rows) {
      await safeRecordCurriculumMutation({
        db,
        courseId: row.course_id,
        profileId: row.profile_id,
        correlationId,
      });
    }
    return [...seen];
  } catch (error) {
    console.warn("[courseCurriculumSync] safeRecordVideoAssetContentMutation failed:", error?.message || error);
    return null;
  }
}
