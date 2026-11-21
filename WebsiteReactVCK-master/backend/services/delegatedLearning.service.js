import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import {
  generateBunnySignedPlayback,
  getUnitVideoProgressAggregate,
  recordVideoWatchProgress,
} from "./bunnyStream.service.js";
import {
  allocateNextSyncRevision,
  buildV2EventEnvelope,
  insertOutboxEnvelopeIfReady,
} from "./courseCatalogSync.service.js";
import {
  sanitizeTheoryHtml,
} from "./courseCurriculumSync.service.js";
import { reviewIsAvailable } from "./assessmentPolicy.service.js";
import {
  DelegatedDeviceError,
  assertDelegatedDeviceBindingActive,
  bindMolyDeviceToTrustedSlot,
  verifyDeviceSlotProof,
} from "./delegatedDeviceBinding.service.js";
import {
  assertRepairMutationsAllowed,
  ExternalIntegrationError,
} from "./externalCourseMapping.service.js";
import { hasEffectiveCourseEntitlement } from "./externalEntitlementAccess.service.js";
import { isVideoCourseProfileAccessRevoked } from "./videoCourseAccessRevocation.service.js";
import { hasLiveReviewMembership } from "./videoCourseUnitAccess.service.js";
import { normalizeReferencedLessonTitle } from "./recordingCurriculumReference.service.js";
import {
  isDelegatedLearningKillSwitchActive,
  observeIntegrationLatency,
  recordIntegrationMetric,
  resolveCorrelationId,
} from "./integrationLogger.service.js";

const defaultDb = { query, getClient };

export const ALLOWED_DELEGATED_SCOPES = Object.freeze([
  "workspace:read",
  "video:play",
  "progress:write",
  "file:view",
  "file:download",
  "quiz:attempt",
  "assignment:submit",
  "notes:rw",
  "bookmarks:rw",
  "qa:rw",
]);

const VALID_SCOPE_SET = new Set(ALLOWED_DELEGATED_SCOPES);
const MAX_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 30;
const VIDEO_COMPLETION_PERCENT = 50;

const sha256Hex = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

export const toIso = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

export const parsePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const virtualReferenceUnitId = (row) => (
  String(row.slice_key || "default") === "default"
    ? Number(row.id)
    : 1_000_000_000_000 + Number(row.override_id)
);

const filterRowsByUnitContent = (rows, filter, key) => {
  if (!filter || !Object.prototype.hasOwnProperty.call(filter, key)) return rows;
  const allowed = new Set((Array.isArray(filter[key]) ? filter[key] : []).map((id) => String(id)));
  return rows.filter((row) => allowed.has(String(row.id)));
};

export const isDelegatedAdminRole = (role) => ["admin", "creator"].includes(
  String(role || "").trim().toLowerCase(),
);

export async function canBypassSequentialProgress(db, { profileRow, userId, userRole }) {
  if (isDelegatedAdminRole(userRole)) return true;
  if (!profileRow || !userId) return false;
  return hasLiveReviewMembership(db, profileRow, userId);
}

export function inferFileKind(mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.(ppt|pptx|key)$/i.test(name)) {
    return "slides";
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "document";
}

function buildLockedUnitPayload({ id, type, title, sessionNumber, sectionTitle = null, meta = null }) {
  return {
    id: String(id),
    unitType: type,
    type,
    title,
    sessionNumber: Number(sessionNumber || 1),
    sectionTitle,
    isLocked: true,
    lockReason: meta?.lockReason || "Bạn hãy hoàn thành bài trước để mở khóa nội dung này.",
    requiredPrevUnitId: meta?.requiredPrevUnitId || null,
    requiredPrevUnitTitle: meta?.requiredPrevUnitTitle || null,
    requiredPrevUnitNumber: meta?.requiredPrevUnitNumber || null,
    video: null,
    videos: [],
    theory: null,
    files: [],
    assignments: [],
    quizzes: [],
    vocabulary: [],
    formulas: [],
    notes: [],
    bookmarks: [],
    qaThreads: [],
  };
}

export function applySequentialLocks(
  rawUnits,
  { isPublicPreviewAccess = false, bypassSequentialLock = false } = {},
) {
  if (bypassSequentialLock && !isPublicPreviewAccess) {
    return rawUnits.map((current) => ({
      ...current,
      isLocked: false,
      lockReason: null,
      requiredPrevUnitId: null,
      requiredPrevUnitTitle: null,
      requiredPrevUnitNumber: null,
    }));
  }

  if (isPublicPreviewAccess) {
    return rawUnits.map((current) => ({
      ...current,
      isLocked: !current.isPublicPreview,
      lockReason: current.isPublicPreview ? null : "Bài học thử miễn phí chưa được mở cho nội dung này.",
      requiredPrevUnitId: null,
      requiredPrevUnitTitle: null,
      requiredPrevUnitNumber: null,
    }));
  }

  const lockedList = [];
  for (let idx = 0; idx < rawUnits.length; idx += 1) {
    const current = rawUnits[idx];
    if (idx === 0 || current.isPublicPreview) {
      lockedList.push({
        ...current,
        isLocked: false,
        lockReason: null,
        requiredPrevUnitId: null,
        requiredPrevUnitTitle: null,
        requiredPrevUnitNumber: null,
      });
      continue;
    }

    const prev = lockedList[idx - 1];
    const prevLabel = prev.sessionNumber ? `Buổi ${prev.sessionNumber}` : `Bài ${idx}`;
    let isLocked = false;
    let lockReason = null;

    if (prev.isLocked) {
      isLocked = true;
      lockReason = `Bạn hãy hoàn thành buổi học trước để tiếp tục nhé (xem khoảng ${VIDEO_COMPLETION_PERCENT}% video và hoàn thành bài trắc nghiệm nếu có).`;
    } else if (!prev.isVideoCompleted && !prev.isQuizCompleted) {
      isLocked = true;
      lockReason = `Bạn đã xem ${Math.round(prev.progressPercent || 0)}% video. Xem thêm đến ${VIDEO_COMPLETION_PERCENT}% và hoàn thành ${prev.completedQuizCount}/${prev.quizCount} bài trắc nghiệm của ${prevLabel} để tiếp tục nhé.`;
    } else if (!prev.isVideoCompleted) {
      isLocked = true;
      lockReason = `Bạn đã xem ${Math.round(prev.progressPercent || 0)}% video của ${prevLabel}. Xem thêm đến ${VIDEO_COMPLETION_PERCENT}% là có thể tiếp tục bài kế tiếp nhé.`;
    } else if (!prev.isQuizCompleted) {
      isLocked = true;
      lockReason = `Cần hoàn thành ${prev.completedQuizCount}/${prev.quizCount} bài trắc nghiệm của ${prevLabel} để mở khóa buổi tiếp theo.`;
    }

    lockedList.push({
      ...current,
      isLocked,
      lockReason,
      requiredPrevUnitId: isLocked ? prev.id : null,
      requiredPrevUnitTitle: isLocked ? prev.title : null,
      requiredPrevUnitNumber: isLocked ? (prev.sessionNumber || idx) : null,
    });
  }
  return lockedList;
}

export async function resolveProfileAndCourse(db, profileId) {
  const parsedProfileId = parsePositiveId(profileId);
  if (!parsedProfileId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "profileId must be a positive integer.");
  }

  const res = await db.query(
    `SELECT vcp.id AS profile_id, vcp.course_id, vcp.mode, vcp.management_class_id,
            vcp.source_live_class_id, vcp.allow_file_download, vcp.device_limit,
            vcp.enforce_trusted_devices, vcp.status AS profile_status, vcp.deleted_at AS profile_deleted_at,
            c.name, COALESCE(c.title, c.name) AS title, c.slug, c.description,
            c.category, c.level, c.is_published, c.sync_deleted_at,
            COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
            COALESCE(NULLIF(u.management_display_name, ''), NULLIF(sp.full_name, ''), u.username) AS instructor_name
     FROM video_course_profiles vcp
     JOIN courses c ON c.id = vcp.course_id
     LEFT JOIN users u ON u.id = c.author_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE vcp.id = $1
     LIMIT 1`,
    [parsedProfileId],
  );
  const row = res.rows[0] || null;
  if (!row) {
    throw new ExternalIntegrationError(404, "PROFILE_NOT_FOUND", `Profile ${parsedProfileId} not found.`);
  }
  if (row.profile_deleted_at || row.sync_deleted_at || !row.is_published || row.profile_status !== "active") {
    throw new ExternalIntegrationError(
      403,
      "COURSE_UNAVAILABLE",
      "Course offering is unavailable or unpublished.",
    );
  }
  return row;
}

export async function assertLiveLearnerProfileAccess(db, { userId, profileRow }) {
  const revokedProfile = await isVideoCourseProfileAccessRevoked({
    db,
    userId,
    profileId: profileRow.profile_id,
  });
  if (revokedProfile) {
    throw new ExternalIntegrationError(
      403,
      "ENTITLEMENT_REVOKED",
      "Learner access to this course profile has been revoked.",
    );
  }

  const revokedEnrollmentRes = await db.query(
    `SELECT status
     FROM class_enrollments
     WHERE user_id = $1
       AND video_course_profile_id = $2
       AND status IN ('revoked', 'suspended')
     LIMIT 1`,
    [userId, profileRow.profile_id],
  );
  if (revokedEnrollmentRes.rows[0]) {
    const stillEntitled = await hasEffectiveCourseEntitlement({
      db,
      userId,
      courseId: profileRow.course_id,
      liveClassId: profileRow.source_live_class_id || null,
      profileId: profileRow.profile_id,
    });
    if (!stillEntitled) {
      throw new ExternalIntegrationError(
        403,
        "ENTITLEMENT_REVOKED",
        "Learner access to this course offering has been revoked.",
      );
    }
  }

  const hasAccess = await hasEffectiveCourseEntitlement({
    db,
    userId,
    courseId: profileRow.course_id,
    liveClassId: profileRow.source_live_class_id || null,
    profileId: profileRow.profile_id,
  });
  if (!hasAccess) {
    throw new ExternalIntegrationError(
      403,
      "ENTITLEMENT_REQUIRED",
      "Active entitlement for this course profile is required.",
    );
  }
}

async function loadReferencedProfileUnitsWithProgress(db, { profileRow, userId = null }) {
  if (String(profileRow.mode || "").toUpperCase() !== "INDEPENDENT") return null;
  const reference = (
    await db.query(
      `SELECT * FROM recording_curriculum_references
       WHERE video_course_profile_id = $1 LIMIT 1`,
      [profileRow.profile_id],
    )
  ).rows[0] || null;
  if (!reference) return null;

  const excluded = new Set(
    (Array.isArray(reference.excluded_session_source_ids) ? reference.excluded_session_source_ids : [])
      .map((id) => String(id).toLowerCase()),
  );
  const sessions = (
    await db.query(
      `SELECT cs.id, cs.management_session_source_id, cs.title, cs.start_time,
              cs.course_section_id, cs.chapter_id,
              COALESCE(s.id::text, cc.id::text, 'ref:default') AS section_id,
              COALESCE(s.title, cc.title, 'Nội dung khóa học') AS section_title,
              COALESCE(s.sort_order, cc.position, 0)::int AS section_sort_order,
              o.id AS override_id, o.title_override, o.summary_override,
              o.duration_seconds_override, o.sort_order_override,
              o.is_published_override, o.is_public_preview_override,
              o.slice_key, o.content_filter,
              (SELECT COUNT(*)::int FROM quizzes q
               WHERE q.status = 'PUBLISHED' AND (
                 (q.class_session_id = cs.id AND (
                   NOT (COALESCE(o.content_filter, '{}'::jsonb) ? 'sourceQuizIds')
                   OR EXISTS (
                     SELECT 1 FROM jsonb_array_elements_text(o.content_filter->'sourceQuizIds') allowed(id)
                     WHERE allowed.id = q.id::text
                   )
                 ))
                 OR q.recording_curriculum_unit_override_id = o.id
               )) AS quiz_count,
              (SELECT COUNT(*)::int FROM quizzes q
               WHERE q.status = 'PUBLISHED' AND (
                   (q.class_session_id = cs.id AND (
                     NOT (COALESCE(o.content_filter, '{}'::jsonb) ? 'sourceQuizIds')
                     OR EXISTS (
                       SELECT 1 FROM jsonb_array_elements_text(o.content_filter->'sourceQuizIds') allowed(id)
                       WHERE allowed.id = q.id::text
                     )
                   ))
                   OR q.recording_curriculum_unit_override_id = o.id
                 )
                 AND $3::bigint > 0 AND EXISTS (
                   SELECT 1 FROM quiz_attempts qa
                   WHERE qa.quiz_id = q.id AND qa.user_id = $3
                     AND (qa.video_course_profile_id = $4 OR qa.video_course_profile_id IS NULL)
                     AND (qa.status IN ('SUBMITTED','GRADED','COMPLETED','submitted','graded','completed')
                          OR qa.submitted_at IS NOT NULL)
                 )) AS completed_quiz_count
       FROM class_sessions cs
       LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
       LEFT JOIN sections s ON s.id = cs.course_section_id
       LEFT JOIN recording_curriculum_unit_overrides o
         ON o.curriculum_reference_id = $2 AND o.source_class_session_id = cs.id
       WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
       ORDER BY COALESCE(o.sort_order_override, s.sort_order, cc.position, 0), cs.start_time, cs.id`,
      [reference.source_live_class_id, reference.id, userId || 0, profileRow.profile_id],
    )
  ).rows.filter((row) => !excluded.has(String(row.management_session_source_id || "").toLowerCase()));

  const overrideIds = sessions.map((row) => Number(row.override_id)).filter(Boolean);
  const videoRows = overrideIds.length > 0 ? (
    await db.query(
      `SELECT rv.unit_override_id, rv.video_asset_id, va.playback_status, va.duration_seconds,
              vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
       FROM recording_curriculum_unit_videos rv
       JOIN video_assets va ON va.id = rv.video_asset_id AND va.deleted_at IS NULL
       LEFT JOIN video_watch_progress vwp
         ON $2::bigint > 0 AND vwp.user_id = $2 AND vwp.video_asset_id = va.id
       WHERE rv.unit_override_id = ANY($1::bigint[]) AND rv.is_published = TRUE
       ORDER BY rv.unit_override_id, (rv.video_type = 'primary') DESC, rv.sort_order, rv.id`,
      [overrideIds, userId || 0],
    )
  ).rows : [];
  const videosByOverride = new Map();
  for (const row of videoRows) {
    const key = String(row.unit_override_id);
    if (!videosByOverride.has(key)) videosByOverride.set(key, []);
    videosByOverride.get(key).push(row);
  }

  return sessions
    .filter((row) => row.is_published_override !== false)
    .map((row, index) => {
      const videos = videosByOverride.get(String(row.override_id)) || [];
      const videoDurationSeconds = Number(row.duration_seconds_override ?? videos.reduce(
        (sum, video) => sum + Number(video.duration_seconds || 0),
        0,
      ));
      const watchedSeconds = videos.reduce((sum, video) => sum + Number(video.watched_seconds || 0), 0);
      const progressPercent = videoDurationSeconds > 0
        ? Math.min(100, Math.round((watchedSeconds / videoDurationSeconds) * 10000) / 100)
        : 0;
      const hasVideo = videos.length > 0;
      const isVideoCompleted = !hasVideo || videos.every((video) => Boolean(video.is_completed));
      const quizCount = Number(row.quiz_count || 0);
      const completedQuizCount = Number(row.completed_quiz_count || 0);
      const isQuizCompleted = quizCount === 0 || completedQuizCount >= quizCount;
      return {
        id: String(virtualReferenceUnitId(row)),
        type: "class_session",
        unitType: "class_session",
        isRecordingReference: true,
        curriculumReferenceId: String(reference.id),
        unitOverrideId: row.override_id ? String(row.override_id) : null,
        sourceClassSessionId: String(row.id),
        sliceKey: row.slice_key || "default",
        contentFilter: row.content_filter && typeof row.content_filter === "object"
          ? row.content_filter
          : {},
        sourceLiveClassId: reference.source_live_class_id,
        sessionNumber: index + 1,
        sectionId: `ref:${reference.id}:${row.section_id}`,
        sectionTitle: normalizeReferencedLessonTitle(row.section_title, "Nội dung khóa học"),
        sectionSortOrder: Number(row.section_sort_order || 0),
        title: normalizeReferencedLessonTitle(row.title_override || row.title, `Bài ${index + 1}`),
        description: row.summary_override || "",
        startTime: toIso(row.start_time),
        videoDurationSeconds,
        watchedSeconds,
        durationMinutes: videoDurationSeconds > 0 ? Math.max(1, Math.round(videoDurationSeconds / 60)) : 0,
        hasVideo,
        videoStatus: videos[0]?.playback_status || (hasVideo ? "ready" : "none"),
        isPublished: true,
        isPublicPreview: Boolean(row.is_public_preview_override),
        progressPercent,
        isVideoCompleted,
        quizCount,
        completedQuizCount,
        isQuizCompleted,
        isCompleted: isVideoCompleted && isQuizCompleted,
        lastPositionSeconds: Math.max(0, ...videos.map((video) => Number(video.last_position_seconds || 0))),
      };
    });
}

export async function loadProfileUnitsWithProgress(db, { profileRow, userId = null }) {
  const mode = String(profileRow.mode || "INDEPENDENT").toUpperCase() === "MIRROR" ? "MIRROR" : "INDEPENDENT";
  const effectiveUserId = userId || 0;

  if (mode === "MIRROR" && profileRow.source_live_class_id) {
    const sessionsRes = await db.query(
      `SELECT cs.id, cs.live_class_id, cs.is_public_preview, cs.title, cs.start_time, cs.end_time,
              cs.chapter_id, cs.course_section_id,
              COALESCE(s.id::text, cc.id::text, 'chap:default') AS section_id,
              COALESCE(s.title, cc.title, 'Lộ trình buổi học') AS section_title,
              COALESCE(s.sort_order, cc.position, 0)::int AS section_sort_order,
              ROW_NUMBER() OVER (ORDER BY COALESCE(s.sort_order, cc.position, 0) ASC, cs.start_time ASC, cs.id ASC)::int AS session_number,
              csv.video_asset_id, csv.is_published AS video_is_published,
              va.provider, va.playback_status, va.duration_seconds AS video_duration,
              COALESCE((
                SELECT SUM(va2.duration_seconds)::int
                FROM class_session_videos csv2
                JOIN video_assets va2 ON va2.id = csv2.video_asset_id AND va2.deleted_at IS NULL
                WHERE csv2.class_session_id = cs.id AND csv2.is_published = TRUE
              ), va.duration_seconds, 0)::int AS total_video_duration_seconds,
              vwp.last_position_seconds,
              (SELECT COUNT(*)::int FROM quizzes q WHERE q.class_session_id = cs.id AND q.status = 'PUBLISHED') AS quiz_count,
              (SELECT COUNT(*)::int FROM quizzes q WHERE q.class_session_id = cs.id AND q.status = 'PUBLISHED'
                 AND $2::bigint > 0
                 AND EXISTS (
                   SELECT 1 FROM quiz_attempts qa
                   WHERE qa.quiz_id = q.id AND qa.user_id = $2
                     AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                     AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                 )) AS completed_quiz_count
       FROM class_sessions cs
       LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
       LEFT JOIN sections s ON s.id = cs.course_section_id
       LEFT JOIN LATERAL (
         SELECT csv_inner.video_asset_id, csv_inner.is_published
         FROM class_session_videos csv_inner
         WHERE csv_inner.class_session_id = cs.id AND csv_inner.is_published = TRUE
         ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order ASC, csv_inner.id ASC
         LIMIT 1
       ) csv ON TRUE
       LEFT JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
       LEFT JOIN video_watch_progress vwp ON $2::bigint > 0 AND vwp.user_id = $2 AND vwp.video_asset_id = va.id
       WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
       ORDER BY COALESCE(s.sort_order, cc.position, 0) ASC, cs.start_time ASC, cs.id ASC`,
      [profileRow.source_live_class_id, effectiveUserId, profileRow.profile_id],
    );

    const rawUnits = await Promise.all(sessionsRes.rows.map(async (row) => {
      const aggregate = userId
        ? await getUnitVideoProgressAggregate({ db, userId, classSessionId: row.id })
        : null;
      const videoDurationSeconds = Number(aggregate?.durationSeconds || row.total_video_duration_seconds || row.video_duration || 0);
      const watchedSeconds = Number(aggregate?.watchedSeconds || 0);
      const progressPercent = Number(aggregate?.completionPercent || 0);
      const hasVideo = Number(aggregate?.partCount || 0) > 0 || Boolean(row.video_asset_id);
      const quizCount = Number(row.quiz_count || 0);
      const completedQuizCount = Number(row.completed_quiz_count || 0);
      const isVideoCompleted = !hasVideo || Boolean(aggregate?.isCompleted);
      const isQuizCompleted = quizCount === 0 || completedQuizCount >= quizCount;

      return {
        id: String(row.id),
        type: "class_session",
        unitType: "class_session",
        sessionNumber: row.session_number,
        sectionId: String(row.section_id),
        sectionTitle: row.section_title,
        sectionSortOrder: Number(row.section_sort_order || 0),
        title: row.title || `Buổi ${row.session_number}`,
        description: "",
        startTime: toIso(row.start_time),
        videoDurationSeconds,
        watchedSeconds,
        durationMinutes: videoDurationSeconds > 0 ? Math.max(1, Math.round(videoDurationSeconds / 60)) : 0,
        hasVideo,
        videoStatus: row.playback_status || (row.video_asset_id ? "ready" : "none"),
        isPublished: true,
        isPublicPreview: Boolean(row.is_public_preview),
        progressPercent,
        isVideoCompleted,
        quizCount,
        completedQuizCount,
        isQuizCompleted,
        isCompleted: isVideoCompleted && isQuizCompleted,
        lastPositionSeconds: Number(row.last_position_seconds || 0),
        sourceLiveClassId: row.live_class_id,
      };
    }));
    return rawUnits;
  }

  const referencedUnits = await loadReferencedProfileUnitsWithProgress(db, { profileRow, userId });
  if (referencedUnits) return referencedUnits;

  // INDEPENDENT
  const lessonsRes = await db.query(
    `SELECT l.id, l.section_id, COALESCE(l.title, l.name) AS title, l.description,
            l.duration_seconds, COALESCE(l.is_public_preview, FALSE) AS is_public_preview,
            l.sort_order, s.title AS section_title, COALESCE(s.sort_order, 0)::int AS section_sort_order,
            COALESCE(csv.video_asset_id, l.video_asset_id) AS resolved_video_asset_id,
            l.learning_url, va.playback_status,
            COALESCE(va.duration_seconds, l.duration_seconds, 0)::int AS resolved_duration_seconds,
            vwp.last_position_seconds,
            (SELECT COUNT(*)::int FROM quizzes q WHERE q.lesson_id = l.id AND q.status = 'PUBLISHED') AS quiz_count,
            (SELECT COUNT(*)::int FROM quizzes q WHERE q.lesson_id = l.id AND q.status = 'PUBLISHED'
               AND $2::bigint > 0
               AND EXISTS (
                 SELECT 1 FROM quiz_attempts qa
                 WHERE qa.quiz_id = q.id AND qa.user_id = $2
                   AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                   AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
               )) AS completed_quiz_count
     FROM lessons l
     LEFT JOIN sections s ON s.id = l.section_id
     LEFT JOIN LATERAL (
       SELECT csv_inner.video_asset_id
       FROM class_session_videos csv_inner
       WHERE csv_inner.lesson_id = l.id AND csv_inner.is_published = TRUE
       ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order ASC, csv_inner.id ASC
       LIMIT 1
     ) csv ON TRUE
     LEFT JOIN video_assets va ON va.id = COALESCE(csv.video_asset_id, l.video_asset_id) AND va.deleted_at IS NULL
     LEFT JOIN video_watch_progress vwp ON $2::bigint > 0 AND vwp.user_id = $2
       AND (vwp.video_asset_id = va.id OR vwp.lesson_id = l.id)
     WHERE l.course_id = $1 AND l.is_published = TRUE
     ORDER BY COALESCE(s.sort_order, 0) ASC, l.sort_order ASC, l.id ASC`,
    [profileRow.course_id, effectiveUserId, profileRow.profile_id],
  );

  return Promise.all(lessonsRes.rows.map(async (row, idx) => {
    const aggregate = userId
      ? await getUnitVideoProgressAggregate({ db, userId, lessonId: row.id })
      : null;
    const videoDurationSeconds = Number(aggregate?.durationSeconds || row.resolved_duration_seconds || row.duration_seconds || 0);
    const watchedSeconds = Number(aggregate?.watchedSeconds || 0);
    const progressPercent = Number(aggregate?.completionPercent || 0);
    const hasBunnyVideo = Number(aggregate?.partCount || 0) > 0 || Boolean(row.resolved_video_asset_id);
    const hasVideo = hasBunnyVideo || Boolean(row.learning_url);
    const quizCount = Number(row.quiz_count || 0);
    const completedQuizCount = Number(row.completed_quiz_count || 0);
    const isVideoCompleted = !hasBunnyVideo || Boolean(aggregate?.isCompleted);
    const isQuizCompleted = quizCount === 0 || completedQuizCount >= quizCount;

    return {
      id: String(row.id),
      type: "lesson",
      unitType: "lesson",
      sessionNumber: idx + 1,
      sectionId: row.section_id ? String(row.section_id) : "sec:default",
      sectionTitle: row.section_title || "Chương 1",
      sectionSortOrder: Number(row.section_sort_order || 0),
      title: row.title,
      description: row.description || "",
      videoDurationSeconds,
      watchedSeconds,
      durationMinutes: videoDurationSeconds > 0 ? Math.max(1, Math.round(videoDurationSeconds / 60)) : 0,
      hasVideo,
      videoStatus: row.playback_status || (row.resolved_video_asset_id ? "ready" : "none"),
      isPublished: true,
      isPublicPreview: Boolean(row.is_public_preview),
      progressPercent,
      isVideoCompleted,
      quizCount,
      completedQuizCount,
      isQuizCompleted,
      isCompleted: isVideoCompleted && isQuizCompleted,
      lastPositionSeconds: Number(row.last_position_seconds || 0),
    };
  }));
}

/**
 * Loads active bookmarks and Q&A threads (+ messages) for one learning unit.
 */
async function loadUnitBookmarksAndQa(db, { unitMeta, effectiveUserId, isPublicPreviewAccess = false }) {
  const unitCol = unitMeta.type === "class_session" ? "class_session_id" : "lesson_id";
  const unitId = Number(unitMeta.sourceClassSessionId || unitMeta.id);

  const [bookmarksRes, threadsRes] = await Promise.all([
    !isPublicPreviewAccess && effectiveUserId > 0
      ? db.query(
        `SELECT id, user_id, course_id, video_course_profile_id, class_session_id, lesson_id,
                video_asset_id, timestamp_seconds, label, revision, created_at, updated_at
         FROM video_course_unit_bookmarks
         WHERE user_id = $1 AND ${unitCol} = $2 AND deleted_at IS NULL
         ORDER BY timestamp_seconds ASC, id ASC`,
        [effectiveUserId, unitId],
      )
      : Promise.resolve({ rows: [] }),
    !isPublicPreviewAccess
      ? db.query(
        `SELECT t.id, t.course_id, t.video_course_profile_id, t.class_session_id, t.lesson_id,
                t.author_id, t.author_role, t.title, t.status, t.is_pinned,
                t.last_read_by_student_at, t.last_message_at, t.revision,
                t.created_at, t.updated_at,
                COALESCE(NULLIF(sp.full_name, ''), u.username, 'Học viên') AS author_name
         FROM learning_unit_qa_threads t
         LEFT JOIN users u ON u.id = t.author_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE t.${unitCol} = $1 AND t.deleted_at IS NULL
         ORDER BY t.is_pinned DESC, t.last_message_at DESC, t.id DESC`,
        [unitId],
      )
      : Promise.resolve({ rows: [] }),
  ]);

  const threadIds = threadsRes.rows.map((r) => Number(r.id));
  const messagesByThread = new Map();
  if (threadIds.length > 0) {
    const msgRes = await db.query(
      `SELECT m.id, m.thread_id, m.author_id, m.author_kind, m.body, m.attachments_json,
              m.revision, m.created_at, m.updated_at,
              COALESCE(NULLIF(sp.full_name, ''), NULLIF(u.management_display_name, ''), u.username, 'Thành viên') AS author_name
       FROM learning_unit_qa_messages m
       LEFT JOIN users u ON u.id = m.author_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE m.thread_id = ANY($1::bigint[]) AND m.deleted_at IS NULL
       ORDER BY m.created_at ASC, m.id ASC`,
      [threadIds],
    );
    for (const m of msgRes.rows) {
      const k = String(m.thread_id);
      if (!messagesByThread.has(k)) messagesByThread.set(k, []);
      messagesByThread.get(k).push({
        id: String(m.id),
        threadId: String(m.thread_id),
        authorId: String(m.author_id),
        authorName: m.author_name,
        authorKind: m.author_kind,
        body: m.body,
        attachments: Array.isArray(m.attachments_json) ? m.attachments_json : [],
        revision: Number(m.revision || 1),
        createdAt: toIso(m.created_at),
        updatedAt: toIso(m.updated_at),
      });
    }
  }

  return {
    bookmarks: bookmarksRes.rows,
    qaThreads: threadsRes.rows.map((t) => {
      const msgs = messagesByThread.get(String(t.id)) || [];
      const hasUnreadReplies = effectiveUserId > 0 && msgs.some((m) => (
        String(m.authorId) !== String(effectiveUserId)
        && (!t.last_read_by_student_at || new Date(m.createdAt).getTime() > new Date(t.last_read_by_student_at).getTime())
      ));
      return {
        id: String(t.id),
        courseId: String(t.course_id),
        profileId: t.video_course_profile_id ? String(t.video_course_profile_id) : null,
        unitId: String(unitId),
        unitType: unitMeta.type,
        authorId: String(t.author_id),
        authorName: t.author_name,
        authorRole: t.author_role,
        title: t.title,
        status: t.status,
        isPinned: Boolean(t.is_pinned),
        lastReadByStudentAt: toIso(t.last_read_by_student_at),
        lastMessageAt: toIso(t.last_message_at),
        hasUnreadReplies,
        revision: Number(t.revision || 1),
        createdAt: toIso(t.created_at),
        updatedAt: toIso(t.updated_at),
        messages: msgs,
      };
    }),
  };
}

export async function loadUnlockedUnitDetail(
  db,
  { profileRow, unitMeta, userId = null, isPublicPreviewAccess = false, allowFreeQuizReview = false },
) {
  const unitId = Number(unitMeta.sourceClassSessionId || unitMeta.id);
  const effectiveUserId = userId || 0;
  const allowDownload = !isPublicPreviewAccess && profileRow.allow_file_download === true;

  if (unitMeta.type === "class_session") {
    const videosPromise = unitMeta.isRecordingReference
      ? db.query(
        `SELECT rv.id AS placement_id, rv.title AS part_title, rv.video_type, rv.sort_order, rv.is_published,
                va.id AS asset_id, va.title AS asset_title, va.provider, va.playback_status,
                va.duration_seconds, va.thumbnail_url, va.available_resolutions,
                vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
         FROM recording_curriculum_unit_videos rv
         JOIN video_assets va ON va.id = rv.video_asset_id AND va.deleted_at IS NULL
         LEFT JOIN video_watch_progress vwp
           ON $2::bigint > 0 AND vwp.user_id = $2 AND vwp.video_asset_id = va.id
         WHERE rv.unit_override_id = $1 AND rv.is_published = TRUE
         ORDER BY (rv.video_type = 'primary') DESC, rv.sort_order, rv.id`,
        [Number(unitMeta.unitOverrideId), effectiveUserId],
      )
      : db.query(
        `SELECT csv.id AS placement_id, csv.title AS part_title, csv.video_type, csv.sort_order, csv.is_published,
                va.id AS asset_id, va.title AS asset_title, va.provider, va.playback_status,
                va.duration_seconds, va.thumbnail_url, va.available_resolutions,
                vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
         FROM class_session_videos csv
         JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
         LEFT JOIN video_watch_progress vwp ON $2::bigint > 0 AND vwp.user_id = $2 AND vwp.video_asset_id = va.id
         WHERE csv.class_session_id = $1 AND csv.is_published = TRUE
         ORDER BY (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
        [unitId, effectiveUserId],
      );
    const [videosRes, theoryRes, filesRes, assignRes, quizRes, vocabRes, formulaRes, notesRes, extras] = await Promise.all([
      videosPromise,
      db.query(
        `SELECT id, title, content_html, summary, key_takeaways, transcript, timestamps_json
         FROM learning_unit_theory WHERE class_session_id = $1`,
        [unitId],
      ),
      db.query(
        `SELECT DISTINCT ON (session_files.id)
                session_files.id, session_files.file_name, session_files.file_size_bytes,
                session_files.mime_type, session_files.allow_file_download,
                session_files.revision, session_files.sort_order, session_files.updated_at
         FROM (
           SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes, lf.mime_type,
                  COALESCE(lc.allow_file_download, TRUE) AS allow_file_download,
                  lf.sync_revision AS revision, 0 AS sort_order, lf.updated_at, 0 AS source_priority
           FROM lms_learning_files lf
           JOIN class_sessions cs ON cs.id = lf.class_session_id
           JOIN live_classes lc ON lc.id = cs.live_class_id
           WHERE lf.class_session_id = $1 AND lf.status = 'ready' AND lf.deleted_at IS NULL
           UNION ALL
           SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes, lf.mime_type,
                  COALESCE(lc.allow_file_download, TRUE) AS allow_file_download,
                  lf.sync_revision AS revision, COALESCE(lfp.sort_order, 0) AS sort_order, lf.updated_at, 1 AS source_priority
           FROM lms_learning_file_placements lfp
           JOIN lms_learning_files lf ON lf.id = lfp.file_id
           JOIN class_sessions cs ON cs.id = lfp.class_session_id
           JOIN live_classes lc ON lc.id = cs.live_class_id
           WHERE lfp.class_session_id = $1 AND lfp.deleted_at IS NULL AND lf.status = 'ready' AND lf.deleted_at IS NULL
         ) session_files
         ORDER BY session_files.id, session_files.source_priority DESC`,
        [unitId],
      ),
      db.query(
        `SELECT a.id, a.class_session_id, a.assignment_type, rubric.criteria_json AS rubric_criteria,
                a.title, a.description, a.max_score, a.due_date,
                sub.id AS submission_id, sub.status AS submission_status, sub.revision AS submission_revision,
                sub.submitted_at, sub.score, sub.teacher_feedback, sub.graded_at, sub.rubric_scores
         FROM assignments a
         LEFT JOIN assignment_rubrics rubric ON rubric.assignment_id = a.id
         LEFT JOIN LATERAL (
           SELECT s.id, s.status, s.revision, s.submitted_at,
                  sg.score, sg.feedback_text AS teacher_feedback, sg.graded_at, sg.rubric_scores
           FROM assignment_submissions s
           LEFT JOIN submission_grades sg ON sg.submission_id = s.id AND sg.submission_revision = s.revision
           WHERE $2::bigint > 0 AND s.assignment_id = a.id AND s.user_id = $2
             AND (s.video_course_profile_id = $4 OR s.video_course_profile_id IS NULL)
           ORDER BY (s.video_course_profile_id = $4) DESC, sg.graded_at DESC NULLS LAST, s.id DESC
           LIMIT 1
         ) sub ON TRUE
         WHERE a.class_session_id = $1
            OR ($3::bigint IS NOT NULL AND a.class_session_id IS NULL AND a.live_class_id = $3)
            OR (a.class_session_id IS NULL AND a.live_class_id IS NULL AND a.lesson_id IS NULL AND a.course_id = $5)
         ORDER BY a.id ASC`,
        [unitId, effectiveUserId, profileRow.source_live_class_id || null, profileRow.profile_id, profileRow.course_id],
      ),
      db.query(
        `SELECT q.id, q.title, q.duration_minutes, q.passing_score, q.attempt_limit, q.review_policy,
                q.available_until, q.due_date, q.activity_scope,
                q.recording_curriculum_unit_override_id,
                CASE WHEN $2::bigint > 0 THEN (
                  SELECT COUNT(*)::int FROM quiz_attempts qa
                  WHERE qa.quiz_id = q.id AND qa.user_id = $2
                    AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                    AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                ) ELSE 0 END AS attempts_count,
                CASE WHEN $2::bigint > 0 THEN (
                  SELECT MAX(qa.score) FROM quiz_attempts qa
                  WHERE qa.quiz_id = q.id AND qa.user_id = $2
                    AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                    AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                ) ELSE NULL END AS best_score,
                CASE WHEN $2::bigint > 0 THEN (
                  SELECT MAX(qa.max_score) FROM quiz_attempts qa
                  WHERE qa.quiz_id = q.id AND qa.user_id = $2
                    AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                    AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                ) ELSE NULL END AS max_score,
                CASE WHEN $2::bigint > 0 THEN (
                  SELECT qa.id FROM quiz_attempts qa
                  WHERE qa.quiz_id = q.id AND qa.user_id = $2
                    AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                  ORDER BY qa.id DESC LIMIT 1
                ) ELSE NULL END AS latest_attempt_id
         FROM quizzes q
         WHERE (q.class_session_id = $1 OR q.recording_curriculum_unit_override_id = $4)
           AND q.status = 'PUBLISHED'
         ORDER BY q.id ASC`,
        [unitId, effectiveUserId, profileRow.profile_id, Number(unitMeta.unitOverrideId) || null],
      ),
      db.query(
        `SELECT id, term, pinyin, sino_vietnamese, meaning, part_of_speech,
                example_sentence, example_meaning, audio_url
         FROM session_vocabularies WHERE session_id = $1
         ORDER BY order_index ASC, id ASC`,
        [unitId],
      ),
      db.query(
        `SELECT id, subject, chapter_name, name_vi, name_zh, pinyin,
                latex_expression, description, variables_explanation
         FROM session_formulas WHERE session_id = $1
         ORDER BY order_index ASC, id ASC`,
        [unitId],
      ),
      !isPublicPreviewAccess && effectiveUserId > 0
        ? db.query(
          `SELECT id, timestamp_seconds, content, revision, created_at, updated_at
           FROM video_course_unit_notes
           WHERE user_id = $1 AND class_session_id = $2 AND deleted_at IS NULL
           ORDER BY timestamp_seconds ASC, id ASC`,
          [effectiveUserId, unitId],
        )
        : Promise.resolve({ rows: [] }),
      loadUnitBookmarksAndQa(db, { unitMeta, effectiveUserId, isPublicPreviewAccess }),
    ]);

    const contentFilter = unitMeta.contentFilter && typeof unitMeta.contentFilter === "object"
      ? unitMeta.contentFilter
      : {};
    const filteredFiles = filterRowsByUnitContent(filesRes.rows, contentFilter, "sourceFileIds");
    const filteredVocabulary = filterRowsByUnitContent(
      vocabRes.rows, contentFilter, "sourceVocabularyIds",
    );
    const filteredFormulas = filterRowsByUnitContent(
      formulaRes.rows, contentFilter, "sourceFormulaIds",
    );
    const allowedSourceQuizIds = Object.prototype.hasOwnProperty.call(contentFilter, "sourceQuizIds")
      ? new Set((Array.isArray(contentFilter.sourceQuizIds) ? contentFilter.sourceQuizIds : []).map(String))
      : null;
    const filteredQuizzes = quizRes.rows.filter((quiz) => (
      quiz.recording_curriculum_unit_override_id
      || !allowedSourceQuizIds
      || allowedSourceQuizIds.has(String(quiz.id))
    ));
    const isFirstUnit = Number(unitMeta.sessionNumber || 1) === 1;
    const directAssignments = filterRowsByUnitContent(
      assignRes.rows.filter((a) => String(a.class_session_id || "") === String(unitId)),
      contentFilter,
      "sourceAssignmentIds",
    );
    const effectiveAssignments = directAssignments.length > 0
      ? directAssignments
      : (isFirstUnit ? assignRes.rows : []);

    return formatUnlockedUnitResponse({
      unitMeta,
      videos: videosRes.rows,
      theory: theoryRes.rows[0] || null,
      files: filteredFiles,
      assignments: effectiveAssignments,
      quizzes: filteredQuizzes,
      vocabulary: filteredVocabulary,
      formulas: filteredFormulas,
      notes: notesRes.rows,
      bookmarks: extras.bookmarks,
      qaThreads: extras.qaThreads,
      allowDownload,
      isPublicPreviewAccess,
      allowFreeQuizReview,
    });
  }

  // INDEPENDENT lesson
  const [videosRes, theoryRes, filesRes, assignRes, quizRes, vocabRes, formulaRes, notesRes, extras] = await Promise.all([
    db.query(
      `SELECT csv.id AS placement_id, csv.title AS part_title, csv.video_type, csv.sort_order, csv.is_published,
              va.id AS asset_id, va.title AS asset_title, va.provider, va.playback_status,
              va.duration_seconds, va.thumbnail_url, va.available_resolutions,
              vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
       FROM class_session_videos csv
       JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
       LEFT JOIN video_watch_progress vwp ON $2::bigint > 0 AND vwp.user_id = $2 AND vwp.video_asset_id = va.id
       WHERE csv.lesson_id = $1 AND csv.is_published = TRUE
       ORDER BY (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
      [unitId, effectiveUserId],
    ),
    db.query(
      `SELECT id, title, content_html, summary, key_takeaways, transcript, timestamps_json
       FROM learning_unit_theory WHERE lesson_id = $1`,
      [unitId],
    ),
    db.query(
      `SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes, lf.mime_type,
              TRUE AS allow_file_download, lf.sync_revision AS revision,
              COALESCE(llfp.sort_order, 0) AS sort_order, lf.updated_at
       FROM lesson_learning_file_placements llfp
       JOIN lms_learning_files lf ON lf.id = llfp.file_id
       WHERE llfp.lesson_id = $1 AND lf.status = 'ready' AND lf.deleted_at IS NULL
       ORDER BY llfp.sort_order ASC, llfp.id ASC`,
      [unitId],
    ),
    db.query(
      `SELECT a.id, a.lesson_id, a.assignment_type, rubric.criteria_json AS rubric_criteria,
              a.title, a.description, a.max_score, a.due_date,
              sub.id AS submission_id, sub.status AS submission_status, sub.revision AS submission_revision,
              sub.submitted_at, sub.score, sub.teacher_feedback, sub.graded_at, sub.rubric_scores
       FROM assignments a
       LEFT JOIN assignment_rubrics rubric ON rubric.assignment_id = a.id
       LEFT JOIN LATERAL (
         SELECT s.id, s.status, s.revision, s.submitted_at,
                sg.score, sg.feedback_text AS teacher_feedback, sg.graded_at, sg.rubric_scores
         FROM assignment_submissions s
         LEFT JOIN submission_grades sg ON sg.submission_id = s.id AND sg.submission_revision = s.revision
         WHERE $2::bigint > 0 AND s.assignment_id = a.id AND s.user_id = $2
           AND (s.video_course_profile_id = $4 OR s.video_course_profile_id IS NULL)
         ORDER BY (s.video_course_profile_id = $4) DESC, sg.graded_at DESC NULLS LAST, s.id DESC
         LIMIT 1
       ) sub ON TRUE
       WHERE a.lesson_id = $1
          OR (a.course_id = $3 AND a.lesson_id IS NULL AND a.live_class_id IS NULL AND a.class_session_id IS NULL)
       ORDER BY a.id ASC`,
      [unitId, effectiveUserId, profileRow.course_id, profileRow.profile_id],
    ),
    db.query(
      `SELECT q.id, q.title, q.duration_minutes, q.passing_score, q.attempt_limit, q.review_policy,
              q.available_until, q.due_date, q.activity_scope,
              CASE WHEN $2::bigint > 0 THEN (
                SELECT COUNT(*)::int FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.user_id = $2
                  AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                  AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
              ) ELSE 0 END AS attempts_count,
              CASE WHEN $2::bigint > 0 THEN (
                SELECT MAX(qa.score) FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.user_id = $2
                  AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                  AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
              ) ELSE NULL END AS best_score,
              CASE WHEN $2::bigint > 0 THEN (
                SELECT MAX(qa.max_score) FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.user_id = $2
                  AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                  AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
              ) ELSE NULL END AS max_score,
              CASE WHEN $2::bigint > 0 THEN (
                SELECT qa.id FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.user_id = $2
                  AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                ORDER BY qa.id DESC LIMIT 1
              ) ELSE NULL END AS latest_attempt_id
       FROM quizzes q
       WHERE q.lesson_id = $1 AND q.status = 'PUBLISHED'
       ORDER BY q.id ASC`,
      [unitId, effectiveUserId, profileRow.profile_id],
    ),
    db.query(
      `SELECT id, term, pinyin, sino_vietnamese, meaning, part_of_speech,
              example_sentence, example_meaning, audio_url
       FROM session_vocabularies WHERE lesson_id = $1
       ORDER BY order_index ASC, id ASC`,
      [unitId],
    ),
    db.query(
      `SELECT id, subject, chapter_name, name_vi, name_zh, pinyin,
              latex_expression, description, variables_explanation
       FROM session_formulas WHERE lesson_id = $1
       ORDER BY order_index ASC, id ASC`,
      [unitId],
    ),
    !isPublicPreviewAccess && effectiveUserId > 0
      ? db.query(
        `SELECT id, timestamp_seconds, content, revision, created_at, updated_at
         FROM video_course_unit_notes
         WHERE user_id = $1 AND lesson_id = $2 AND deleted_at IS NULL
         ORDER BY timestamp_seconds ASC, id ASC`,
        [effectiveUserId, unitId],
      )
      : Promise.resolve({ rows: [] }),
    loadUnitBookmarksAndQa(db, { unitMeta, effectiveUserId, isPublicPreviewAccess }),
  ]);

  let effectiveVideos = videosRes.rows;
  if (effectiveVideos.length === 0) {
    const legacyVideoRes = await db.query(
      `SELECT NULL::bigint AS placement_id, l.title AS part_title, 'primary'::varchar AS video_type,
              0::int AS sort_order, TRUE AS is_published,
              va.id AS asset_id, va.title AS asset_title, va.provider, va.playback_status,
              va.duration_seconds, va.thumbnail_url, va.available_resolutions,
              vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
       FROM lessons l
       JOIN video_assets va ON va.id = l.video_asset_id AND va.deleted_at IS NULL
       LEFT JOIN video_watch_progress vwp ON $2::bigint > 0 AND vwp.user_id = $2 AND vwp.video_asset_id = va.id
       WHERE l.id = $1`,
      [unitId, effectiveUserId],
    );
    effectiveVideos = legacyVideoRes.rows;
  }

  const isFirstUnit = Number(unitMeta.sessionNumber || 1) === 1;
  const directAssignments = assignRes.rows.filter((a) => String(a.lesson_id || "") === String(unitId));
  const effectiveAssignments = directAssignments.length > 0
    ? directAssignments
    : (isFirstUnit ? assignRes.rows : []);

  return formatUnlockedUnitResponse({
    unitMeta,
    videos: effectiveVideos,
    theory: theoryRes.rows[0] || null,
    files: filesRes.rows,
    assignments: effectiveAssignments,
    quizzes: quizRes.rows,
    vocabulary: vocabRes.rows,
    formulas: formulaRes.rows,
    notes: notesRes.rows,
    bookmarks: extras.bookmarks,
    qaThreads: extras.qaThreads,
    allowDownload,
    isPublicPreviewAccess,
    allowFreeQuizReview,
  });
}

function formatUnlockedUnitResponse({
  unitMeta,
  videos,
  theory,
  files,
  assignments,
  quizzes,
  vocabulary,
  formulas,
  notes,
  bookmarks = [],
  qaThreads = [],
  allowDownload,
  isPublicPreviewAccess,
  allowFreeQuizReview = false,
}) {
  const unitVideos = videos.map((v, idx) => ({
    id: String(v.asset_id),
    assetId: String(v.asset_id),
    placementId: String(v.placement_id),
    partNumber: idx + 1,
    title: v.part_title || v.asset_title || `Phần ${idx + 1}`,
    videoType: v.video_type || "primary",
    isPublished: Boolean(v.is_published),
    provider: v.provider || "bunny_stream",
    playbackStatus: v.playback_status || "ready",
    durationSeconds: Number(v.duration_seconds || 0),
    thumbnailUrl: v.thumbnail_url || null,
    availableResolutions: v.available_resolutions
      ? String(v.available_resolutions).split(",").map((s) => s.trim()).filter(Boolean)
      : ["360p", "480p", "720p", "1080p"],
    watchProgress: isPublicPreviewAccess ? null : {
      lastPositionSeconds: Number(v.last_position_seconds || 0),
      watchedSeconds: Number(v.watched_seconds || 0),
      completionPercent: Number(v.completion_percent || 0),
      isCompleted: Boolean(v.is_completed),
    },
  }));

  return {
    id: String(unitMeta.id),
    unitType: unitMeta.type,
    type: unitMeta.type,
    sectionId: unitMeta.sectionId,
    sectionTitle: unitMeta.sectionTitle || null,
    title: unitMeta.title,
    description: unitMeta.description || "",
    sessionNumber: unitMeta.sessionNumber,
    isLocked: false,
    lockReason: null,
    isPublicPreview: Boolean(unitMeta.isPublicPreview),
    video: unitVideos[0] || null,
    videos: unitVideos,
    watchProgress: isPublicPreviewAccess ? null : {
      lastPositionSeconds: Number(unitMeta.lastPositionSeconds || 0),
      watchedSeconds: Number(unitMeta.watchedSeconds || 0),
      durationSeconds: Number(unitMeta.videoDurationSeconds || 0),
      partCount: unitVideos.length,
      completionPercent: Number(unitMeta.progressPercent || 0),
      isCompleted: Boolean(unitMeta.isCompleted),
      isVideoCompleted: Boolean(unitMeta.isVideoCompleted),
      isQuizCompleted: Boolean(unitMeta.isQuizCompleted),
    },
    theory: theory ? {
      title: theory.title,
      contentHtml: sanitizeTheoryHtml(theory.content_html || ""),
      summary: theory.summary || null,
      keyTakeaways: Array.isArray(theory.key_takeaways) ? theory.key_takeaways : [],
      transcript: theory.transcript || null,
      timestamps: Array.isArray(theory.timestamps_json) ? theory.timestamps_json : [],
    } : null,
    files: files.map((f) => {
      const canDl = Boolean(allowDownload && f.allow_file_download !== false);
      const fileKind = inferFileKind(f.mime_type, f.file_name);
      return {
        id: String(f.id),
        fileId: String(f.id),
        fileName: f.file_name,
        originalFilename: f.file_name,
        title: f.file_name,
        sizeBytes: Number(f.file_size_bytes || 0),
        mimeType: f.mime_type || null,
        fileKind,
        isSlide: fileKind === "slides",
        allowView: true,
        allowDownload: canDl,
        revision: Number(f.revision || 1),
        sortOrder: Number(f.sort_order || 0),
        updatedAt: toIso(f.updated_at),
      };
    }),
    assignments: assignments.map((a) => {
      let rubric = [];
      try {
        rubric = Array.isArray(a.rubric_criteria)
          ? a.rubric_criteria
          : (typeof a.rubric_criteria === "string" ? JSON.parse(a.rubric_criteria) : []);
      } catch {
        rubric = [];
      }
      let rubricScores = [];
      try {
        rubricScores = Array.isArray(a.rubric_scores)
          ? a.rubric_scores
          : (typeof a.rubric_scores === "string" ? JSON.parse(a.rubric_scores) : []);
      } catch {
        rubricScores = [];
      }
      return {
        id: String(a.id),
        title: a.title,
        description: a.description || "",
        assignmentType: a.assignment_type || "homework",
        maxScore: Number(a.max_score || 10),
        dueDate: toIso(a.due_date),
        rubric,
        isSubmitted: isPublicPreviewAccess ? false : Boolean(a.submission_id),
        submissionId: !isPublicPreviewAccess && a.submission_id ? String(a.submission_id) : null,
        status: !isPublicPreviewAccess && a.submission_status ? a.submission_status : "not_submitted",
        revision: !isPublicPreviewAccess && a.submission_revision != null ? Number(a.submission_revision) : 0,
        submittedAt: !isPublicPreviewAccess ? toIso(a.submitted_at) : null,
        score: !isPublicPreviewAccess && a.score != null ? Number(a.score) : null,
        teacherFeedback: !isPublicPreviewAccess && a.teacher_feedback ? a.teacher_feedback : null,
        gradedAt: !isPublicPreviewAccess ? toIso(a.graded_at) : null,
        rubricScores: !isPublicPreviewAccess ? rubricScores : [],
      };
    }),
    quizzes: quizzes.map((q) => {
      const hasSubmitted = Number(q.attempts_count || 0) > 0;
      const canViewSolution = !isPublicPreviewAccess
        && (allowFreeQuizReview || (q.review_policy !== "never" && hasSubmitted && reviewIsAvailable(q)));
      return {
        id: String(q.id),
        title: q.title,
        durationMinutes: q.duration_minutes != null ? Number(q.duration_minutes) : null,
        passingScore: Number(q.passing_score || 60),
        attemptLimit: allowFreeQuizReview ? null : (q.attempt_limit != null ? Number(q.attempt_limit) : null),
        reviewPolicy: q.review_policy || "after_submit",
        canViewSolution,
        canStartAttempt: !isPublicPreviewAccess
          && (allowFreeQuizReview || q.attempt_limit == null || Number(q.attempts_count || 0) < Number(q.attempt_limit)),
        attemptsCount: isPublicPreviewAccess ? 0 : Number(q.attempts_count || 0),
        isCompleted: isPublicPreviewAccess ? false : hasSubmitted,
        bestScore: !isPublicPreviewAccess && q.best_score != null ? Number(q.best_score) : null,
        maxScore: !isPublicPreviewAccess && q.max_score != null ? Number(q.max_score) : null,
        latestAttemptId: !isPublicPreviewAccess && q.latest_attempt_id ? String(q.latest_attempt_id) : null,
      };
    }),
    vocabulary: vocabulary.map((v) => ({
      id: String(v.id),
      term: v.term,
      pinyin: v.pinyin,
      sinoVietnamese: v.sino_vietnamese,
      meaning: v.meaning,
      partOfSpeech: v.part_of_speech,
      exampleSentence: v.example_sentence,
      exampleMeaning: v.example_meaning,
      audioUrl: v.audio_url,
    })),
    formulas: formulas.map((fm) => ({
      id: String(fm.id),
      subject: fm.subject,
      chapterName: fm.chapter_name,
      nameVi: fm.name_vi,
      nameZh: fm.name_zh,
      pinyin: fm.pinyin,
      latexExpression: fm.latex_expression,
      description: fm.description,
      variablesExplanation: Array.isArray(fm.variables_explanation) ? fm.variables_explanation : [],
    })),
    notes: notes.map((n) => ({
      id: String(n.id),
      timestampSeconds: Number(n.timestamp_seconds || 0),
      content: n.content,
      revision: Number(n.revision || 1),
      createdAt: toIso(n.created_at),
      updatedAt: toIso(n.updated_at || n.created_at),
    })),
    bookmarks: bookmarks.map((b) => ({
      id: String(b.id),
      timestampSeconds: Number(b.timestamp_seconds || 0),
      label: b.label || "",
      videoAssetId: b.video_asset_id ? String(b.video_asset_id) : null,
      revision: Number(b.revision || 1),
      createdAt: toIso(b.created_at),
      updatedAt: toIso(b.updated_at || b.created_at),
    })),
    qaThreads,
  };
}

/**
 * Mints a short-lived (`<= 300s`), least-privilege delegated learning session after verifying
 * learner external identity, active course/profile entitlement, and revocation status.
 */
export async function mintDelegatedLearningSession({
  db = defaultDb,
  externalUserId,
  courseId = null,
  profileId,
  scopes = ["workspace:read"],
  ttlSeconds = MAX_TTL_SECONDS,
  deviceSlotProof = null,
  clientIp = null,
  userAgent = "",
  actorRole = null,
  actorEmail = null,
  correlationId = null,
  metadata = {},
  now = () => new Date(),
  env = process.env,
} = {}) {
  const corr = resolveCorrelationId(correlationId);
  if (isDelegatedLearningKillSwitchActive(env)) {
    throw new ExternalIntegrationError(503, "SYNC_KILL_SWITCH_ACTIVE", "Delegated learning sessions are paused by kill switch.");
  }

  const extUser = String(externalUserId || "").trim();
  if (!extUser) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "externalUserId is required.");
  }

  const profileRow = await resolveProfileAndCourse(db, profileId);
  if (courseId != null && String(profileRow.course_id) !== String(courseId)) {
    throw new ExternalIntegrationError(
      409,
      "PROFILE_SCOPE_MISMATCH",
      `Profile ${profileRow.profile_id} belongs to course ${profileRow.course_id}, not ${courseId}.`,
    );
  }

  const requestedScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : ["workspace:read"];
  const normalizedScopes = [...new Set(requestedScopes.map((s) => String(s || "").trim()).filter(Boolean))];
  if (!normalizedScopes.length || normalizedScopes.some((s) => !VALID_SCOPE_SET.has(s))) {
    throw new ExternalIntegrationError(
      403,
      "DELEGATED_SCOPE_DENIED",
      "Requested delegated learning scope is invalid or forbidden.",
    );
  }

  const identityRes = await db.query(
    `SELECT ei.user_id, ei.status AS identity_status, u.is_locked, u.locked_reason, u.device_limit_attempts, u.role
     FROM external_identities ei
     JOIN users u ON u.id = ei.user_id
     WHERE ei.source_system = 'moly'
       AND ei.external_user_id = $1
     LIMIT 1`,
    [extUser],
  );
  let identity = identityRes.rows[0] || null;
  let isS2SAdminDirect = false;

  // Signed S2S calls on behalf of a verified Moly admin without a learner link
  // resolve cleanly to an unlocked Course admin/creator account so platform
  // admins can inspect any synced course/unit without weakening student checks.
  if (!identity && isDelegatedAdminRole(actorRole)) {
    const cleanActorEmail = typeof actorEmail === "string" && actorEmail.trim()
      ? actorEmail.trim().toLowerCase()
      : null;
    const adminRes = await db.query(
      `SELECT u.id AS user_id, u.role, u.is_locked, u.locked_reason, u.device_limit_attempts
       FROM users u
       WHERE u.role::text IN ('admin', 'creator')
         AND COALESCE(u.is_locked, FALSE) = FALSE
       ORDER BY (CASE WHEN $1::text IS NOT NULL AND LOWER(u.email) = $1::text THEN 0 ELSE 1 END),
                (CASE WHEN u.role::text = 'admin' THEN 0 ELSE 1 END),
                u.id ASC
       LIMIT 1`,
      [cleanActorEmail],
    );
    if (adminRes.rows[0]) {
      identity = {
        ...adminRes.rows[0],
        identity_status: "active",
      };
      isS2SAdminDirect = true;
    }
  }

  if (!identity || identity.identity_status !== "active") {
    throw new ExternalIntegrationError(
      403,
      "ENTITLEMENT_REQUIRED",
      "Learner account is not linked or inactive on CSCA-Course.",
    );
  }
  if (identity.is_locked === true) {
    const isLimitLock = identity.locked_reason === "DEVICE_LIMIT_LOCKED"
      || Number(identity.device_limit_attempts || 0) >= 3;
    throw new ExternalIntegrationError(
      403,
      isLimitLock ? "DEVICE_LIMIT_LOCKED" : "ACCOUNT_LOCKED",
      isLimitLock
        ? "Tài khoản đã bị khóa do vượt quá giới hạn thiết bị. Vui lòng liên hệ admin."
        : "Tài khoản học viên đang bị khóa trên CSCA-Course.",
    );
  }

  const isAdminSession = isDelegatedAdminRole(identity.role) || isS2SAdminDirect;
  if (!isAdminSession) {
    await assertLiveLearnerProfileAccess(db, {
      userId: identity.user_id,
      profileRow,
    });
  }

  let trustedDeviceId = null;
  let deviceBindingId = null;
  let deviceSlot = null;
  if (deviceSlotProof && !isAdminSession) {
    const verifiedProof = verifyDeviceSlotProof(deviceSlotProof, {
      expectedExternalUserId: extUser,
      now: () => now().getTime(),
      env,
    });
    const regRes = await db.query(
      `SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings`,
    );
    if (regRes.rows[0]?.has_bindings) {
      deviceSlot = await bindMolyDeviceToTrustedSlot({
        db,
        userId: identity.user_id,
        externalUserId: extUser,
        molyDeviceTokenHash: verifiedProof.molyDeviceTokenHash,
        bindingSource: "delegated_proof",
        deviceName: verifiedProof.deviceName,
        userAgent: verifiedProof.userAgent || userAgent,
        ipAddress: verifiedProof.ipAddress || clientIp,
        deviceLimit: Number(profileRow.device_limit || 2),
        enforce: !isAdminSession && profileRow.enforce_trusted_devices !== false,
        correlationId: corr,
        metadata: {
          profileId: String(profileRow.profile_id),
          courseId: String(profileRow.course_id),
        },
      });
      trustedDeviceId = deviceSlot.trustedDeviceId || null;
      deviceBindingId = deviceSlot.bindingId || null;
    }
  }

  const effectiveScopes = isAdminSession
    ? [...new Set([...normalizedScopes, ...ALLOWED_DELEGATED_SCOPES])]
    : normalizedScopes;
  const parsedTtl = Number.parseInt(String(ttlSeconds ?? MAX_TTL_SECONDS), 10);
  const effectiveTtl = Number.isFinite(parsedTtl)
    ? Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, parsedTtl))
    : MAX_TTL_SECONDS;
  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + effectiveTtl * 1000);
  const jti = crypto.randomUUID();
  const sessionToken = `dls_${crypto.randomBytes(32).toString("base64url")}`;
  const nonce = crypto.randomBytes(24).toString("base64url");
  const sessionMetadata = {
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    ...(isAdminSession ? { isAdminSession: true } : {}),
    ...(isS2SAdminDirect ? { isS2SAdminSession: true } : {}),
  };

  await db.query(
    `INSERT INTO delegated_learning_sessions (
       jti, session_token_hash, nonce_hash, user_id, external_user_id,
       course_id, video_course_profile_id, trusted_device_id, device_binding_id,
       audience, scopes, correlation_id, issued_at, expires_at, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'csca-course:delegated-learning', $10::text[], $11, $12::timestamptz, $13::timestamptz, $14::jsonb)`,
    [
      jti,
      sha256Hex(sessionToken),
      sha256Hex(nonce),
      identity.user_id,
      extUser,
      profileRow.course_id,
      profileRow.profile_id,
      trustedDeviceId,
      deviceBindingId,
      effectiveScopes,
      corr,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
      JSON.stringify(sessionMetadata),
    ],
  );

  recordIntegrationMetric("course.delegated_session_minted");
  return {
    sessionToken,
    tokenType: "DelegatedSession",
    jti,
    nonce,
    audience: "csca-course:delegated-learning",
    scopes: effectiveScopes,
    isAdmin: isAdminSession,
    courseId: String(profileRow.course_id),
    profileId: String(profileRow.profile_id),
    trustedDeviceId: trustedDeviceId != null ? String(trustedDeviceId) : null,
    deviceBindingId: deviceBindingId != null ? String(deviceBindingId) : null,
    deviceSlot,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: effectiveTtl,
    correlationId: corr,
  };
}

/**
 * Verifies a delegated session token (expiry, revocation, scope, profile binding,
 * and live learner entitlement) before fulfilling delegated reads or actions.
 */
export async function verifyAndResolveDelegatedSession({
  db = defaultDb,
  sessionToken,
  requiredScope = "workspace:read",
  expectedProfileId = null,
  isMutation = false,
  now = () => new Date(),
  env = process.env,
} = {}) {
  if (isDelegatedLearningKillSwitchActive(env)) {
    throw new ExternalIntegrationError(503, "SYNC_KILL_SWITCH_ACTIVE", "Delegated learning endpoints are paused by kill switch.");
  }
  if (isMutation) {
    assertRepairMutationsAllowed(env, { metricName: "course.delegated_mutation_blocked_kill_switch" });
  }

  const rawToken = String(sessionToken || "").trim();
  if (!rawToken) {
    throw new ExternalIntegrationError(401, "INVALID_DELEGATED_SESSION", "Delegated learning session token is required.");
  }

  const sessionRes = await db.query(
    `SELECT dls.*, ei.status AS identity_status, u.is_locked, u.locked_reason,
            u.device_limit_attempts, u.role AS user_role, u.email AS user_email
     FROM delegated_learning_sessions dls
     LEFT JOIN external_identities ei
       ON ei.user_id = dls.user_id AND ei.source_system = 'moly' AND ei.external_user_id = dls.external_user_id
     LEFT JOIN users u ON u.id = dls.user_id
     WHERE dls.session_token_hash = $1
     LIMIT 1`,
    [sha256Hex(rawToken)],
  );
  const session = sessionRes.rows[0] || null;
  if (!session) {
    throw new ExternalIntegrationError(401, "INVALID_DELEGATED_SESSION", "Delegated learning session token is invalid.");
  }
  if (session.revoked_at || session.status === "revoked") {
    throw new ExternalIntegrationError(401, "DELEGATED_SESSION_REVOKED", "Delegated learning session was revoked.");
  }
  const currentNow = now();
  if (new Date(session.expires_at).getTime() <= currentNow.getTime()) {
    throw new ExternalIntegrationError(401, "DELEGATED_SESSION_EXPIRED", "Delegated learning session has expired.");
  }

  if (expectedProfileId != null) {
    const parsedExpected = parsePositiveId(expectedProfileId);
    if (!parsedExpected) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "profileId must be a positive integer.");
    }
    if (String(session.video_course_profile_id) !== String(parsedExpected)) {
      throw new ExternalIntegrationError(
        409,
        "PROFILE_SCOPE_MISMATCH",
        "Delegated learning session does not match requested profileId.",
      );
    }
  }

  if (requiredScope && !(session.scopes || []).includes(requiredScope)) {
    throw new ExternalIntegrationError(
      403,
      "DELEGATED_SCOPE_DENIED",
      `Delegated session lacks required scope '${requiredScope}'.`,
    );
  }

  const isS2SAdminSession = Boolean(
    session.metadata?.isS2SAdminSession === true && isDelegatedAdminRole(session.user_role),
  );
  if (!isS2SAdminSession && session.identity_status !== "active") {
    throw new ExternalIntegrationError(403, "ENTITLEMENT_REVOKED", "Learner identity is inactive.");
  }
  if (session.is_locked === true) {
    const isLimitLock = session.locked_reason === "DEVICE_LIMIT_LOCKED"
      || Number(session.device_limit_attempts || 0) >= 3;
    throw new ExternalIntegrationError(
      403,
      isLimitLock ? "DEVICE_LIMIT_LOCKED" : "ACCOUNT_LOCKED",
      isLimitLock
        ? "Tài khoản đã bị khóa do vượt quá giới hạn thiết bị. Vui lòng liên hệ admin."
        : "Learner account is locked.",
    );
  }
  if (session.device_binding_id || session.trusted_device_id) {
    await assertDelegatedDeviceBindingActive({
      db,
      userId: session.user_id,
      trustedDeviceId: session.trusted_device_id,
      deviceBindingId: session.device_binding_id,
    });
  }

  const profileRow = await resolveProfileAndCourse(db, session.video_course_profile_id);
  if (!isDelegatedAdminRole(session.user_role)) {
    try {
      await assertLiveLearnerProfileAccess(db, { userId: session.user_id, profileRow });
    } catch (err) {
      await db.query(
        `UPDATE delegated_learning_sessions
         SET revoked_at = NOW(), revoked_reason = $2
         WHERE id = $1 AND revoked_at IS NULL`,
        [session.id, err.errorCode || "entitlement_lost"],
      ).catch(() => {});
      throw err;
    }
  }

  await db.query(
    `UPDATE delegated_learning_sessions SET last_used_at = NOW() WHERE id = $1`,
    [session.id],
  ).catch(() => {});

  return { session, profileRow };
}

/**
 * Returns full delegated workspace (course info, offering mode, unit progress list,
 * sequential lock state, capabilities, and sanitized active unit detail).
 * Locked active units receive metadata-only `lockedUnitPayload`.
 */
export async function getDelegatedWorkspace({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "workspace:read",
    expectedProfileId: profileId,
    now,
    env,
  });

  const isAdminSession = isDelegatedAdminRole(session.user_role);
  const canReviewFreely = !isAdminSession && await hasLiveReviewMembership(db, profileRow, session.user_id);
  const bypassSequentialLock = isAdminSession || canReviewFreely;
  const rawUnits = await loadProfileUnitsWithProgress(db, {
    profileRow,
    userId: session.user_id,
  });
  const units = applySequentialLocks(rawUnits, {
    isPublicPreviewAccess: false,
    bypassSequentialLock,
  });

  let targetUnit = null;
  if (unitId != null && String(unitId).trim() !== "") {
    targetUnit = units.find((u) => String(u.id) === String(unitId).trim()) || null;
    if (!targetUnit) {
      await assertUnitNotCrossProfile(db, { profileRow, unitId });
      throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Unit ${unitId} not found in profile ${profileId}.`);
    }
  } else {
    targetUnit = units.find((u) => !u.isLocked) || units[0] || null;
  }

  let activeUnit = null;
  if (targetUnit) {
    if (targetUnit.isLocked) {
      activeUnit = buildLockedUnitPayload({
        id: targetUnit.id,
        type: targetUnit.type,
        title: targetUnit.title,
        sessionNumber: targetUnit.sessionNumber,
        sectionTitle: targetUnit.sectionTitle,
        meta: targetUnit,
      });
    } else {
      activeUnit = await loadUnlockedUnitDetail(db, {
        profileRow,
        unitMeta: targetUnit,
        userId: session.user_id,
        isPublicPreviewAccess: false,
        allowFreeQuizReview: bypassSequentialLock,
      });
    }
  }

  const completedUnitsCount = units.filter((u) => u.isCompleted).length;
  const overallProgressPercent = units.length > 0
    ? Math.round(units.reduce((sum, u) => sum + Math.min(100, Math.max(0, Number(u.progressPercent || 0))), 0) / units.length)
    : 0;

  let sourceClass = null;
  if (profileRow.mode === "MIRROR" && profileRow.source_live_class_id) {
    const srcRes = await db.query(
      `SELECT lc.id, lc.title, lc.status,
              COALESCE(NULLIF(lc.teacher_display_name, ''), u.username) AS instructor_name
       FROM live_classes lc
       LEFT JOIN users u ON u.id = lc.instructor_id
       WHERE lc.id = $1`,
      [profileRow.source_live_class_id],
    );
    if (srcRes.rows[0]) {
      sourceClass = {
        id: String(srcRes.rows[0].id),
        title: srcRes.rows[0].title,
        status: srcRes.rows[0].status,
        instructorName: srcRes.rows[0].instructor_name,
      };
    }
  }

  observeIntegrationLatency("course.delegated_workspace_ms", Date.now() - startMs);
  return {
    videoCourseProfileId: String(profileRow.profile_id),
    mode: profileRow.mode === "MIRROR" ? "RECORD_MIRROR" : "RECORD_INDEPENDENT",
    course: {
      id: String(profileRow.course_id),
      title: profileRow.title,
      slug: profileRow.slug,
      category: profileRow.category,
      level: profileRow.level,
      thumbnailUrl: profileRow.thumbnail_url,
      instructorName: profileRow.instructor_name,
    },
    sourceClass,
    progress: {
      completedUnits: completedUnitsCount,
      totalUnits: units.length,
      overallPercent: overallProgressPercent,
    },
    units,
    activeUnit,
    capabilities: {
      canPlayVideo: (session.scopes || []).includes("video:play"),
      canJoinLive: false,
      canCheckIn: false,
      showCalendar: false,
      canSubmitAssignments: (session.scopes || []).includes("assignment:submit"),
      canAttemptQuizzes: (session.scopes || []).includes("quiz:attempt"),
      canManageNotes: (session.scopes || []).includes("notes:rw"),
      canManageBookmarks: (session.scopes || []).includes("bookmarks:rw"),
      canManageQa: (session.scopes || []).includes("qa:rw"),
      allowFileDownload: profileRow.allow_file_download === true,
      deviceLimit: Number(profileRow.device_limit || 2),
      enforceTrustedDevices: !isAdminSession && profileRow.enforce_trusted_devices !== false,
      isPublicPreviewAccess: false,
      isAdmin: isAdminSession,
      canReviewFreely,
    },
  };
}

export async function assertUnitNotCrossProfile(db, { profileRow, unitId }) {
  const parsedId = parsePositiveId(unitId);
  if (!parsedId) return;
  const [sessionHit, lessonHit] = await Promise.all([
    db.query(`SELECT id FROM class_sessions WHERE id = $1 LIMIT 1`, [parsedId]),
    db.query(`SELECT id FROM lessons WHERE id = $1 LIMIT 1`, [parsedId]),
  ]);
  if (sessionHit.rows[0] || lessonHit.rows[0]) {
    throw new ExternalIntegrationError(
      409,
      "PROFILE_SCOPE_MISMATCH",
      `Unit ${unitId} does not belong to profile ${profileRow.profile_id}.`,
    );
  }
}

/**
 * Returns full detail for a specific unit under a delegated learning session.
 * Strictly blocks locked units with `403 UNIT_LOCKED` (metadata only, zero leaked content).
 */
export async function getDelegatedUnitDetail({
  db = defaultDb,
  sessionToken,
  profileId,
  unitId,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "workspace:read",
    expectedProfileId: profileId,
    now,
    env,
  });

  const isAdminSession = isDelegatedAdminRole(session.user_role);
  const canReviewFreely = !isAdminSession && await hasLiveReviewMembership(db, profileRow, session.user_id);
  const bypassSequentialLock = isAdminSession || canReviewFreely;
  const rawUnits = await loadProfileUnitsWithProgress(db, {
    profileRow,
    userId: session.user_id,
  });
  const units = applySequentialLocks(rawUnits, {
    isPublicPreviewAccess: false,
    bypassSequentialLock,
  });
  const targetUnit = units.find((u) => String(u.id) === String(unitId).trim()) || null;

  if (!targetUnit) {
    await assertUnitNotCrossProfile(db, { profileRow, unitId });
    throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Unit ${unitId} not found in profile ${profileId}.`);
  }

  if (targetUnit.isLocked) {
    throw new ExternalIntegrationError(
      403,
      "UNIT_LOCKED",
      targetUnit.lockReason || "Unit is locked by sequential progression.",
      {
        unitId: targetUnit.id,
        unitType: targetUnit.type,
        title: targetUnit.title,
        requiredPrevUnitId: targetUnit.requiredPrevUnitId,
        requiredPrevUnitTitle: targetUnit.requiredPrevUnitTitle,
        requiredPrevUnitNumber: targetUnit.requiredPrevUnitNumber,
      },
    );
  }

  return loadUnlockedUnitDetail(db, {
    profileRow,
    unitMeta: targetUnit,
    userId: session.user_id,
    isPublicPreviewAccess: false,
    allowFreeQuizReview: bypassSequentialLock,
  });
}

/**
 * Explicit S2S public preview read for marketing preview units (`is_public_preview = TRUE` only).
 */
export async function getPublicPreviewUnit({
  db = defaultDb,
  profileId,
  unitId = null,
  env = process.env,
} = {}) {
  if (isDelegatedLearningKillSwitchActive(env)) {
    throw new ExternalIntegrationError(503, "SYNC_KILL_SWITCH_ACTIVE", "Delegated learning endpoints are paused by kill switch.");
  }

  const profileRow = await resolveProfileAndCourse(db, profileId);
  const rawUnits = await loadProfileUnitsWithProgress(db, { profileRow, userId: null });
  const units = applySequentialLocks(rawUnits, { isPublicPreviewAccess: true });

  const requested = unitId != null && String(unitId).trim() !== "" && String(unitId).trim() !== "default"
    ? String(unitId).trim()
    : null;
  const targetUnit = requested
    ? units.find((u) => String(u.id) === requested) || null
    : units.find((u) => u.isPublicPreview) || null;

  if (!targetUnit) {
    if (requested) {
      await assertUnitNotCrossProfile(db, { profileRow, unitId: requested });
      throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", `Preview unit ${requested} not found.`);
    }
    throw new ExternalIntegrationError(403, "PREVIEW_NOT_AVAILABLE", "This course has no public preview unit.");
  }

  if (!targetUnit.isPublicPreview) {
    throw new ExternalIntegrationError(
      403,
      "UNIT_LOCKED",
      "Requested unit is not enabled for public preview.",
      { unitId: targetUnit.id, unitType: targetUnit.type, title: targetUnit.title },
    );
  }

  const activeUnit = await loadUnlockedUnitDetail(db, {
    profileRow,
    unitMeta: targetUnit,
    userId: null,
    isPublicPreviewAccess: true,
  });

  // Public previews still use short-lived signed Bunny embeds. Returning only
  // the asset metadata leaves Moly with no playable URL even though the lesson
  // is explicitly marked as a public preview.
  const signedPreviewVideos = await Promise.all((activeUnit.videos || []).map(async (video) => {
    const videoAsset = await findPublishedVideoInUnit(db, {
      unitMeta: targetUnit,
      videoId: video.assetId || video.id,
    });
    if (!videoAsset || String(videoAsset.playback_status || "") !== "ready") return video;
    const signed = generateBunnySignedPlayback({
      videoAsset,
      userId: "public-preview",
      userEmail: "public-preview",
      ttlSeconds: 60,
      minTtlSeconds: 60,
      maxTtlSeconds: 60,
    });
    return {
      ...video,
      embedUrl: signed.embedUrl,
      embedExpiresAt: signed.expiresAt,
    };
  }));
  const playableActiveUnit = {
    ...activeUnit,
    video: signedPreviewVideos[0] || activeUnit.video || null,
    videos: signedPreviewVideos,
  };

  return {
    videoCourseProfileId: String(profileRow.profile_id),
    mode: profileRow.mode === "MIRROR" ? "RECORD_MIRROR" : "RECORD_INDEPENDENT",
    course: {
      id: String(profileRow.course_id),
      title: profileRow.title,
      slug: profileRow.slug,
      category: profileRow.category,
      level: profileRow.level,
      thumbnailUrl: profileRow.thumbnail_url,
      instructorName: profileRow.instructor_name,
    },
    sourceClass: null,
    progress: {
      completedUnits: 0,
      totalUnits: units.length,
      overallPercent: 0,
    },
    units,
    activeUnit: playableActiveUnit,
    capabilities: {
      canPlayVideo: true,
      canJoinLive: false,
      canCheckIn: false,
      showCalendar: false,
      canSubmitAssignments: false,
      allowFileDownload: false,
      deviceLimit: Number(profileRow.device_limit || 2),
      enforceTrustedDevices: false,
      isPublicPreviewAccess: true,
    },
  };
}

function isConnectedPgClient(db) {
  return Boolean(
    db
    && typeof db.query === "function"
    && (typeof db.release === "function" || db._connected === true || db._connecting === true),
  );
}

export async function runDelegatedTx(db, work) {
  const runner = db && typeof db.query === "function" ? db : defaultDb;
  if (isConnectedPgClient(runner)) {
    return work(runner);
  }
  const client = typeof runner.getClient === "function"
    ? await runner.getClient()
    : typeof runner.connect === "function"
      ? await runner.connect()
      : null;

  if (!client) {
    await runner.query("BEGIN");
    try {
      const result = await work(runner);
      await runner.query("COMMIT");
      return result;
    } catch (err) {
      await runner.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

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

async function findPublishedVideoInUnit(db, { unitMeta, videoId }) {
  if (unitMeta.isRecordingReference) {
    const res = await db.query(
      `SELECT va.*
       FROM recording_curriculum_unit_videos rv
       JOIN video_assets va ON va.id = rv.video_asset_id AND va.deleted_at IS NULL
       WHERE rv.unit_override_id = $1 AND rv.video_asset_id = $2
         AND rv.is_published = TRUE
       LIMIT 1`,
      [Number(unitMeta.unitOverrideId), Number(videoId)],
    );
    return res.rows[0] || null;
  }
  if (unitMeta.type === "class_session") {
    const res = await db.query(
      `SELECT va.*
       FROM class_session_videos csv
       JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
       WHERE csv.class_session_id = $1
         AND csv.video_asset_id = $2
         AND csv.is_published = TRUE
       LIMIT 1`,
      [Number(unitMeta.id), Number(videoId)],
    );
    return res.rows[0] || null;
  }

  const placedRes = await db.query(
    `SELECT va.*
     FROM class_session_videos csv
     JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
     WHERE csv.lesson_id = $1
       AND csv.video_asset_id = $2
       AND csv.is_published = TRUE
     LIMIT 1`,
    [Number(unitMeta.id), Number(videoId)],
  );
  if (placedRes.rows[0]) return placedRes.rows[0];

  const legacyRes = await db.query(
    `SELECT va.*
     FROM lessons l
     JOIN video_assets va ON va.id = l.video_asset_id AND va.deleted_at IS NULL
     WHERE l.id = $1
       AND l.video_asset_id = $2
     LIMIT 1`,
    [Number(unitMeta.id), Number(videoId)],
  );
  return legacyRes.rows[0] || null;
}

async function resolveTargetUnitAndVideo(
  db,
  { profileRow, userId, unitId = null, videoId, bypassSequentialLock = false },
) {
  const parsedVideoId = parsePositiveId(videoId);
  if (!parsedVideoId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "videoId must be a positive integer.");
  }

  const rawUnits = await loadProfileUnitsWithProgress(db, { profileRow, userId });
  const units = applySequentialLocks(rawUnits, { bypassSequentialLock });

  if (unitId != null && String(unitId).trim() !== "") {
    const parsedUnitId = parsePositiveId(unitId);
    if (!parsedUnitId) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "unitId must be a positive integer.");
    }
    const targetUnit = units.find((u) => String(u.id) === String(parsedUnitId)) || null;
    if (!targetUnit) {
      await assertUnitNotCrossProfile(db, { profileRow, unitId: parsedUnitId });
      throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", "Learning unit not found in this offering.");
    }
    const asset = await findPublishedVideoInUnit(db, { unitMeta: targetUnit, videoId: parsedVideoId });
    if (!asset) {
      throw new ExternalIntegrationError(404, "VIDEO_NOT_FOUND", "Video asset not found in this learning unit.");
    }
    if (targetUnit.isLocked) {
      throw new ExternalIntegrationError(403, "UNIT_LOCKED", targetUnit.lockReason || "Bài học này đang bị khóa tuần tự.");
    }
    return { units, targetUnit, videoAsset: asset };
  }

  let matchedLockedUnit = null;
  for (const unit of units) {
    const asset = await findPublishedVideoInUnit(db, { unitMeta: unit, videoId: parsedVideoId });
    if (!asset) continue;
    if (!unit.isLocked) {
      return { units, targetUnit: unit, videoAsset: asset };
    }
    if (!matchedLockedUnit) matchedLockedUnit = unit;
  }

  if (matchedLockedUnit) {
    throw new ExternalIntegrationError(
      403,
      "UNIT_LOCKED",
      matchedLockedUnit.lockReason || "Bài học chứa video này đang bị khóa tuần tự.",
    );
  }
  throw new ExternalIntegrationError(404, "VIDEO_NOT_FOUND", "Video asset not found in this offering.");
}

export async function emitProgressOutboxEventsForProfile({
  db,
  userId,
  externalUserIds = null,
  profileRow,
  unitsAfter,
  targetUnitAfter,
  videoAssetId = null,
  videoProgress = null,
  unitAggregate = null,
  wasCompletedBefore = false,
  clientSequence = null,
  delegatedSessionId = null,
  syncRevision = null,
  correlationId = null,
  occurredAt = new Date().toISOString(),
}) {
  const regRes = await db.query(
    `SELECT to_regclass('course_integration_outbox') IS NOT NULL AS has_outbox`,
  );
  if (!regRes.rows[0]?.has_outbox) return [];

  let resolvedExtIds = Array.isArray(externalUserIds) && externalUserIds.length > 0
    ? [...new Set(externalUserIds.map((v) => String(v || "").trim()).filter(Boolean))]
    : [];
  if (!resolvedExtIds.length) {
    const extRes = await db.query(
      `SELECT external_user_id
       FROM external_identities
       WHERE user_id = $1 AND source_system = 'moly' AND status = 'active'
       ORDER BY id ASC`,
      [userId],
    );
    resolvedExtIds = extRes.rows.map((r) => String(r.external_user_id || "").trim()).filter(Boolean);
  }
  if (!resolvedExtIds.length) return [];

  const completedUnitsCount = unitsAfter.filter((u) => u.isCompleted).length;
  const courseCompletionPct = unitsAfter.length > 0
    ? Math.round((completedUnitsCount / unitsAfter.length) * 100)
    : 0;
  const targetIdx = unitsAfter.findIndex((u) => String(u.id) === String(targetUnitAfter.id));
  const nextUnit = targetIdx >= 0 && targetIdx + 1 < unitsAfter.length ? unitsAfter[targetIdx + 1] : null;
  const unlockedNextUnitId = nextUnit && !nextUnit.isLocked ? String(nextUnit.id) : null;

  const isUnitCompleted = Boolean(targetUnitAfter.isCompleted);
  const revProgress = syncRevision || (await allocateNextSyncRevision(db));
  const basePayload = {
    userId: String(userId),
    externalUserId: resolvedExtIds[0],
    externalUserIds: resolvedExtIds,
    courseId: String(profileRow.course_id),
    profileId: String(profileRow.profile_id),
    externalOfferingId: profileRow.management_class_id
      ? String(profileRow.management_class_id)
      : `profile:${profileRow.profile_id}`,
    unitType: targetUnitAfter.unitType,
    unitId: String(targetUnitAfter.id),
    videoAssetId: videoAssetId != null ? String(videoAssetId) : null,
    watchedSeconds: Math.round(Number(videoProgress?.watchedSeconds || targetUnitAfter.watchedSeconds || 0)),
    lastPositionSeconds: Math.round(Number(videoProgress?.lastPositionSeconds || targetUnitAfter.lastPositionSeconds || 0)),
    completionPercent: Number(unitAggregate?.completionPercent ?? videoProgress?.completionPercent ?? targetUnitAfter.progressPercent ?? 0),
    isVideoCompleted: Boolean(unitAggregate?.isCompleted ?? videoProgress?.isCompleted ?? targetUnitAfter.isVideoCompleted),
    isQuizCompleted: Boolean(targetUnitAfter.isQuizCompleted),
    isUnitCompleted,
    isUnlocked: !targetUnitAfter.isLocked,
    courseCompletionPct,
    completedUnitsCount,
    totalUnitsCount: unitsAfter.length,
    lastUnitId: String(targetUnitAfter.id),
    unlockedNextUnitId,
    nextUnitType: nextUnit ? nextUnit.unitType : null,
    clientSequence: clientSequence != null ? Number(clientSequence) : null,
    delegatedSessionId: delegatedSessionId != null ? String(delegatedSessionId) : null,
    syncRevision: Number(revProgress),
    sourceUpdatedAt: occurredAt,
  };

  const aggId = `${profileRow.profile_id}:${targetUnitAfter.unitType}:${targetUnitAfter.id}:user:${userId}`;
  const inserted = [];
  const progressEnv = buildV2EventEnvelope({
    eventType: "learning.progress.updated",
    aggregateType: "learning_progress",
    aggregateId: aggId,
    revision: revProgress,
    sourceUpdatedAt: occurredAt,
    occurredAt,
    deleted: false,
    deletedAt: null,
    correlationId,
    payload: basePayload,
  });
  await insertOutboxEnvelopeIfReady(db, progressEnv);
  inserted.push(progressEnv);

  if (isUnitCompleted && !wasCompletedBefore) {
    const revCompleted = await allocateNextSyncRevision(db);
    const completedEnv = buildV2EventEnvelope({
      eventType: "learning.unit.completed",
      aggregateType: "learning_progress",
      aggregateId: aggId,
      revision: revCompleted,
      sourceUpdatedAt: occurredAt,
      occurredAt,
      deleted: false,
      deletedAt: null,
      correlationId,
      payload: {
        ...basePayload,
        syncRevision: Number(revCompleted),
        completedAt: toIso(videoProgress?.completedAt) || occurredAt,
      },
    });
    await insertOutboxEnvelopeIfReady(db, completedEnv);
    inserted.push(completedEnv);
  }

  return inserted;
}

/**
 * Emits outbox progress events across all profiles referencing a course after a native
 * CSCA-Course video heartbeat so Moly projections stay up to date across interfaces.
 */
export async function emitNativeProgressOutboxEvents({
  db = defaultDb,
  userId,
  courseId = null,
  liveClassId = null,
  classSessionId = null,
  lessonId = null,
  videoAssetId,
  videoProgress,
  wasCompletedBefore = false,
  correlationId = null,
  now = () => new Date(),
} = {}) {
  if (!userId || !videoProgress) return [];
  const regRes = await db.query(
    `SELECT to_regclass('course_integration_outbox') IS NOT NULL AS has_outbox`,
  );
  if (!regRes.rows[0]?.has_outbox) return [];

  const extRes = await db.query(
    `SELECT external_user_id FROM external_identities
     WHERE user_id = $1 AND source_system = 'moly' AND status = 'active'`,
    [userId],
  );
  const externalUserIds = extRes.rows.map((r) => String(r.external_user_id || "").trim()).filter(Boolean);
  if (!externalUserIds.length) return [];

  let profiles = [];
  if (classSessionId) {
    const pRes = await db.query(
      `SELECT vcp.id AS profile_id, vcp.course_id, vcp.mode, vcp.source_live_class_id,
              vcp.management_class_id, vcp.allow_file_download, vcp.device_limit,
              vcp.enforce_trusted_devices, vcp.status
       FROM video_course_profiles vcp
       WHERE vcp.deleted_at IS NULL
         AND vcp.status <> 'archived'
         AND (vcp.source_live_class_id = COALESCE($1, (SELECT live_class_id FROM class_sessions WHERE id = $2)))`,
      [liveClassId, classSessionId],
    );
    profiles = pRes.rows;
  } else if (lessonId) {
    const pRes = await db.query(
      `SELECT vcp.id AS profile_id, vcp.course_id, vcp.mode, vcp.source_live_class_id,
              vcp.management_class_id, vcp.allow_file_download, vcp.device_limit,
              vcp.enforce_trusted_devices, vcp.status
       FROM video_course_profiles vcp
       WHERE vcp.deleted_at IS NULL
         AND vcp.status <> 'archived'
         AND vcp.mode = 'INDEPENDENT'
         AND vcp.course_id = COALESCE($1, (SELECT course_id FROM lessons WHERE id = $2))`,
      [courseId, lessonId],
    );
    profiles = pRes.rows;
  }

  const emitted = [];
  const occurredAt = now().toISOString();
  const unitType = classSessionId ? "class_session" : "lesson";
  const targetUnitId = String(classSessionId || lessonId || "");

  const userRoleRes = await db.query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [userId]).catch(() => ({ rows: [] }));
  const bypassSequentialLock = isDelegatedAdminRole(userRoleRes.rows[0]?.role);

  for (const profileRow of profiles) {
    const accessOk = await hasEffectiveCourseEntitlement({
      db,
      userId,
      courseId: Number(profileRow.course_id),
    }).catch(() => false);
    if (!accessOk) continue;
    const bypassProfileLock = bypassSequentialLock || await hasLiveReviewMembership(db, profileRow, userId).catch(() => false);
    const rawUnits = await loadProfileUnitsWithProgress(db, { profileRow, userId });
    const unitsAfter = applySequentialLocks(rawUnits, { bypassSequentialLock: bypassProfileLock });
    const targetUnitAfter = unitsAfter.find((u) => u.unitType === unitType && String(u.id) === targetUnitId);
    if (!targetUnitAfter) continue;
    const rows = await emitProgressOutboxEventsForProfile({
      db,
      userId,
      externalUserIds,
      profileRow,
      unitsAfter,
      targetUnitAfter,
      videoAssetId,
      videoProgress,
      unitAggregate: videoProgress.unitProgress || null,
      wasCompletedBefore: Boolean(wasCompletedBefore),
      correlationId: correlationId || `native-progress-${userId}-${videoAssetId}`,
      occurredAt,
    });
    emitted.push(...rows);
  }
  return emitted;
}

/**
 * Mints a short-lived (TTL <= 60s) signed Bunny playback token for a delegated session
 * after re-checking live entitlement, sequential unlock state, video readiness, and
 * cross-app trusted device binding.
 */
export async function mintDelegatedVideoPlaybackToken({
  db = defaultDb,
  sessionToken,
  videoId,
  unitId = null,
  profileId = null,
  ttlSeconds = 60,
  deviceSlotProof = null,
  clientIp = null,
  userAgent = "",
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const corr = resolveCorrelationId(correlationId);
  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "video:play",
    expectedProfileId: profileId,
    now,
    env,
  });

  let verifiedProof = null;
  if (deviceSlotProof) {
    verifiedProof = verifyDeviceSlotProof(deviceSlotProof, {
      expectedExternalUserId: session.external_user_id,
      now: () => now().getTime(),
      env,
    });
  }

  let deviceSlot = null;
  const isRestrictedLearner = String(session.user_role || "user") === "user";
  const enforceDevices = profileRow.enforce_trusted_devices !== false && isRestrictedLearner;

  if (session.device_binding_id) {
    if (verifiedProof) {
      const bindCheck = await db.query(
        `SELECT moly_device_token_hash FROM moly_device_bindings
         WHERE id = $1 AND user_id = $2 AND status = 'active' AND revoked_at IS NULL
         LIMIT 1`,
        [session.device_binding_id, session.user_id],
      );
      if (!bindCheck.rows[0] || bindCheck.rows[0].moly_device_token_hash !== verifiedProof.molyDeviceTokenHash) {
        throw new DelegatedDeviceError(
          "UNTRUSTED_DEVICE_PROOF",
          "Chứng thực thiết bị không khớp với phiên học hiện tại.",
          { status: 403 },
        );
      }
    }
  } else if (verifiedProof && isRestrictedLearner) {
    const regRes = await db.query(`SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings`);
    if (regRes.rows[0]?.has_bindings) {
      deviceSlot = await bindMolyDeviceToTrustedSlot({
        db,
        userId: session.user_id,
        externalUserId: session.external_user_id,
        molyDeviceTokenHash: verifiedProof.molyDeviceTokenHash,
        bindingSource: "delegated_proof",
        deviceName: verifiedProof.deviceName,
        userAgent: verifiedProof.userAgent || userAgent,
        ipAddress: verifiedProof.ipAddress || clientIp,
        deviceLimit: Number(profileRow.device_limit || 2),
        enforce: enforceDevices,
        correlationId: corr,
        metadata: {
          profileId: String(profileRow.profile_id),
          videoId: String(videoId),
        },
      });
      await db.query(
        `UPDATE delegated_learning_sessions
         SET trusted_device_id = COALESCE(trusted_device_id, $2),
             device_binding_id = COALESCE(device_binding_id, $3)
         WHERE id = $1`,
        [session.id, deviceSlot.trustedDeviceId, deviceSlot.bindingId],
      ).catch(() => {});
    }
  } else if (enforceDevices) {
    const regRes = await db.query(`SELECT to_regclass('moly_device_bindings') IS NOT NULL AS has_bindings`);
    if (regRes.rows[0]?.has_bindings) {
      throw new DelegatedDeviceError(
        "UNTRUSTED_DEVICE_PROOF",
        "Thiếu chứng thực thiết bị hợp lệ để phát video.",
        { status: 403 },
      );
    }
  }

  const bypassSequentialLock = await canBypassSequentialProgress(db, {
    profileRow,
    userId: session.user_id,
    userRole: session.user_role,
  });
  const { targetUnit, videoAsset } = await resolveTargetUnitAndVideo(db, {
    profileRow,
    userId: session.user_id,
    unitId,
    videoId,
    bypassSequentialLock,
  });

  if (String(videoAsset.playback_status || "") !== "ready") {
    throw new ExternalIntegrationError(409, "VIDEO_NOT_READY", "Video đang được xử lý hoặc chưa sẵn sàng.");
  }

  const requestedTtl = Number.parseInt(String(ttlSeconds ?? 60), 10);
  const clampedTtl = Number.isFinite(requestedTtl) ? Math.max(15, Math.min(60, requestedTtl)) : 60;
  const signed = generateBunnySignedPlayback({
    videoAsset,
    userId: session.user_id,
    userEmail: session.user_email || `user-${session.user_id}`,
    ipAddress: clientIp || verifiedProof?.ipAddress || null,
    ttlSeconds: clampedTtl,
    minTtlSeconds: 15,
    maxTtlSeconds: 60,
  });

  const [watchRes, unitAggregate] = await Promise.all([
    db.query(
      `SELECT last_position_seconds, watched_seconds, completion_percent, is_completed, completed_at, last_heartbeat_at
       FROM video_watch_progress
       WHERE user_id = $1 AND video_asset_id = $2
       LIMIT 1`,
      [session.user_id, videoAsset.id],
    ),
    getUnitVideoProgressAggregate({
      db,
      userId: session.user_id,
      classSessionId: targetUnit.unitType === "class_session" ? Number(targetUnit.id) : null,
      lessonId: targetUnit.unitType === "lesson" ? Number(targetUnit.id) : null,
    }),
  ]);
  const watchRow = watchRes.rows[0] || null;
  const resumePositionSeconds = Math.max(0, Number(watchRow?.last_position_seconds || 0));

  recordIntegrationMetric("course.delegated_playback_token_minted");
  observeIntegrationLatency("course.delegated_playback_token_ms", Date.now() - startMs);

  return {
    playbackSessionId: `pb_${crypto.randomUUID()}`,
    deliveryType: "bunny",
    videoAssetId: String(videoAsset.id),
    unitId: String(targetUnit.id),
    unitType: targetUnit.unitType,
    profileId: String(profileRow.profile_id),
    courseId: String(profileRow.course_id),
    title: videoAsset.title || targetUnit.title,
    embedUrl: signed.embedUrl,
    hlsPlaylistUrl: signed.hlsUrl || null,
    thumbnailUrl: signed.thumbnailUrl || null,
    availableResolutions: signed.availableResolutions,
    durationSeconds: Number(videoAsset.duration_seconds || 0),
    expiresAt: signed.expiresAt,
    ttlSeconds: Number(signed.ttlSeconds),
    watermark: {
      label: session.user_email || `User #${session.user_id}`,
      userId: String(session.user_id),
      externalUserId: session.external_user_id,
      ipAddress: clientIp || verifiedProof?.ipAddress || null,
    },
    resumePositionSeconds,
    watchProgress: {
      lastPositionSeconds: resumePositionSeconds,
      watchedSeconds: Number(watchRow?.watched_seconds || 0),
      completionPercent: Number(watchRow?.completion_percent || 0),
      isCompleted: Boolean(watchRow?.is_completed),
      completedAt: toIso(watchRow?.completed_at),
      lastHeartbeatAt: toIso(watchRow?.last_heartbeat_at),
    },
    unitProgress: unitAggregate || {
      totalDurationSeconds: Number(videoAsset.duration_seconds || 0),
      watchedSeconds: Number(watchRow?.watched_seconds || 0),
      completionPercent: Number(watchRow?.completion_percent || 0),
      isCompleted: Boolean(watchRow?.is_completed),
      partCount: 1,
      completedPartCount: watchRow?.is_completed ? 1 : 0,
    },
    deviceSlot,
  };
}

/**
 * Records a delegated learner's video watch heartbeat with anti-cheat wall-clock delta
 * capping, multi-tab monotonic sequence/timestamp enforcement, sequential unlock evaluation,
 * and v2 outbox emission (`learning.progress.updated` / `learning.unit.completed`).
 */
export async function recordDelegatedVideoProgress({
  db = defaultDb,
  sessionToken,
  videoId,
  unitId = null,
  profileId = null,
  currentTimeSeconds = 0,
  watchedDeltaSeconds = 0,
  durationSeconds = null,
  clientSequence = null,
  eventTimestamp = null,
  correlationId = null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const startMs = Date.now();
  const corr = resolveCorrelationId(correlationId);
  const { session, profileRow } = await verifyAndResolveDelegatedSession({
    db,
    sessionToken,
    requiredScope: "progress:write",
    expectedProfileId: profileId,
    isMutation: true,
    now,
    env,
  });

  const bypassSequentialLock = await canBypassSequentialProgress(db, {
    profileRow,
    userId: session.user_id,
    userRole: session.user_role,
  });
  const { targetUnit, videoAsset } = await resolveTargetUnitAndVideo(db, {
    profileRow,
    userId: session.user_id,
    unitId,
    videoId,
    bypassSequentialLock,
  });

  const parsedCurrentTime = Number(currentTimeSeconds);
  if (!Number.isFinite(parsedCurrentTime) || parsedCurrentTime < 0) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "currentTimeSeconds must be >= 0.");
  }
  const parsedDelta = watchedDeltaSeconds == null ? 0 : Number(watchedDeltaSeconds);
  if (!Number.isFinite(parsedDelta) || parsedDelta < 0) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "watchedDeltaSeconds must be >= 0.");
  }

  let normalizedSeq = null;
  if (clientSequence !== null && clientSequence !== undefined && String(clientSequence).trim() !== "") {
    const seqNum = Number.parseInt(String(clientSequence), 10);
    if (!Number.isSafeInteger(seqNum) || seqNum < 0) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "clientSequence must be a non-negative integer.");
    }
    normalizedSeq = seqNum;
  }

  let parsedEventMs = null;
  if (eventTimestamp) {
    const ts = Date.parse(String(eventTimestamp));
    if (!Number.isFinite(ts)) {
      throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "eventTimestamp must be a valid ISO timestamp.");
    }
    parsedEventMs = ts;
  }

  const classSessionId = targetUnit.unitType === "class_session" ? Number(targetUnit.id) : null;
  const lessonId = targetUnit.unitType === "lesson" ? Number(targetUnit.id) : null;
  const liveClassId = profileRow.mode === "MIRROR" && profileRow.source_live_class_id
    ? Number(profileRow.source_live_class_id)
    : null;

  const outcome = await runDelegatedTx(db, async (tx) => {
    const existingRes = await tx.query(
      `SELECT id, last_position_seconds, watched_seconds, completion_percent, is_completed,
              completed_at, last_heartbeat_at, last_heartbeat_seq, last_delegated_session_id, sync_revision
       FROM video_watch_progress
       WHERE user_id = $1 AND video_asset_id = $2
       FOR UPDATE`,
      [session.user_id, videoAsset.id],
    );
    const existing = existingRes.rows[0] || null;

    let staleReason = null;
    if (existing) {
      const sameSession = existing.last_delegated_session_id != null
        && String(existing.last_delegated_session_id) === String(session.id);
      if (sameSession && normalizedSeq !== null && normalizedSeq <= Number(existing.last_heartbeat_seq || 0)) {
        staleReason = "STALE_CLIENT_SEQUENCE";
      } else if (!sameSession && parsedEventMs !== null && existing.last_heartbeat_at) {
        const lastHbMs = new Date(existing.last_heartbeat_at).getTime();
        if (Number.isFinite(lastHbMs) && parsedEventMs < lastHbMs) {
          staleReason = "STALE_EVENT_TIMESTAMP";
        }
      }
    }

    if (staleReason) {
      const [unitsCurrent, unitAggregate] = await Promise.all([
        loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }).then((raw) =>
          applySequentialLocks(raw, { bypassSequentialLock }),
        ),
        getUnitVideoProgressAggregate({ db: tx, userId: session.user_id, classSessionId, lessonId }),
      ]);
      const currentUnit = unitsCurrent.find((u) => String(u.id) === String(targetUnit.id)) || targetUnit;
      const completedUnitsCount = unitsCurrent.filter((u) => u.isCompleted).length;
      return {
        stale: true,
        ignoredReason: staleReason,
        videoAssetId: String(videoAsset.id),
        unitId: String(targetUnit.id),
        unitType: targetUnit.unitType,
        profileId: String(profileRow.profile_id),
        courseId: String(profileRow.course_id),
        lastPositionSeconds: Number(existing.last_position_seconds || 0),
        watchedSeconds: Number(existing.watched_seconds || 0),
        completionPercent: Number(existing.completion_percent || 0),
        isVideoCompleted: Boolean(existing.is_completed),
        isUnitCompleted: Boolean(currentUnit.isCompleted),
        completedAt: toIso(existing.completed_at),
        lastHeartbeatAt: toIso(existing.last_heartbeat_at),
        durationSeconds: Number(videoAsset.duration_seconds || 0),
        clientSequence: Number(existing.last_heartbeat_seq || 0),
        syncRevision: Number(existing.sync_revision || 1),
        unitProgress: unitAggregate,
        courseProgress: {
          completedUnits: completedUnitsCount,
          totalUnits: unitsCurrent.length,
          overallPercent: unitsCurrent.length > 0 ? Math.round((completedUnitsCount / unitsCurrent.length) * 100) : 0,
        },
        units: unitsCurrent.map((u) => ({
          id: u.id,
          unitType: u.unitType,
          sessionNumber: u.sessionNumber,
          isLocked: u.isLocked,
          isCompleted: u.isCompleted,
          progressPercent: u.progressPercent,
        })),
      };
    }

    const wasCompletedBefore = Boolean(targetUnit.isCompleted);
    const effectiveClock = parsedEventMs && (!existing?.last_heartbeat_at || parsedEventMs >= new Date(existing.last_heartbeat_at).getTime())
      ? () => new Date(parsedEventMs)
      : now;

    const recorded = await recordVideoWatchProgress({
      userId: session.user_id,
      videoAssetId: Number(videoAsset.id),
      courseId: Number(profileRow.course_id),
      liveClassId,
      classSessionId,
      lessonId,
      currentTimeSeconds: parsedCurrentTime,
      watchedDeltaSeconds: parsedDelta,
      durationSeconds,
      now: effectiveClock,
      db: tx,
    });

    let rev = Number(existing?.sync_revision || 0) + 1;
    const regRes = await tx.query(`SELECT to_regclass('course_sync_checkpoints') IS NOT NULL AS has_ckpt`);
    if (regRes.rows[0]?.has_ckpt) {
      rev = await allocateNextSyncRevision(tx);
    }

    const nextSeq = normalizedSeq !== null
      ? Math.max(Number(existing?.last_heartbeat_seq || 0), normalizedSeq)
      : Number(existing?.last_heartbeat_seq || 0) + 1;

    await tx.query(
      `UPDATE video_watch_progress
       SET last_heartbeat_seq = $3,
           last_delegated_session_id = $4,
           sync_revision = GREATEST(sync_revision, $5)
       WHERE user_id = $1 AND video_asset_id = $2`,
      [session.user_id, videoAsset.id, nextSeq, session.id, rev],
    );

    const unitsAfter = applySequentialLocks(
      await loadProfileUnitsWithProgress(tx, { profileRow, userId: session.user_id }),
      { bypassSequentialLock },
    );
    const targetUnitAfter = unitsAfter.find((u) => String(u.id) === String(targetUnit.id)) || targetUnit;
    const occurredAt = effectiveClock().toISOString();

    await emitProgressOutboxEventsForProfile({
      db: tx,
      userId: session.user_id,
      externalUserIds: [session.external_user_id],
      profileRow,
      unitsAfter,
      targetUnitAfter,
      videoAssetId: videoAsset.id,
      videoProgress: recorded,
      unitAggregate: recorded.unitProgress,
      wasCompletedBefore,
      clientSequence: nextSeq,
      delegatedSessionId: session.id,
      syncRevision: rev,
      correlationId: corr,
      occurredAt,
    });

    const completedUnitsCount = unitsAfter.filter((u) => u.isCompleted).length;
    return {
      stale: false,
      ignoredReason: null,
      videoAssetId: String(recorded.videoAssetId),
      unitId: String(targetUnitAfter.id),
      unitType: targetUnitAfter.unitType,
      profileId: String(profileRow.profile_id),
      courseId: String(profileRow.course_id),
      lastPositionSeconds: Number(recorded.lastPositionSeconds || 0),
      watchedSeconds: Number(recorded.watchedSeconds || 0),
      completionPercent: Number(recorded.completionPercent || 0),
      isVideoCompleted: Boolean(recorded.isCompleted),
      isUnitCompleted: Boolean(targetUnitAfter.isCompleted),
      completedAt: recorded.completedAt,
      lastHeartbeatAt: recorded.lastHeartbeatAt,
      durationSeconds: Number(recorded.durationSeconds || 0),
      clientSequence: nextSeq,
      syncRevision: rev,
      unitProgress: recorded.unitProgress,
      courseProgress: {
        completedUnits: completedUnitsCount,
        totalUnits: unitsAfter.length,
        overallPercent: unitsAfter.length > 0 ? Math.round((completedUnitsCount / unitsAfter.length) * 100) : 0,
      },
      units: unitsAfter.map((u) => ({
        id: u.id,
        unitType: u.unitType,
        sessionNumber: u.sessionNumber,
        isLocked: u.isLocked,
        isCompleted: u.isCompleted,
        progressPercent: u.progressPercent,
      })),
    };
  });

  recordIntegrationMetric(outcome.stale ? "course.delegated_progress_stale" : "course.delegated_progress_recorded");
  observeIntegrationLatency("course.delegated_progress_ms", Date.now() - startMs);
  return outcome;
}
