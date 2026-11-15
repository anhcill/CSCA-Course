import crypto from "crypto";
import { getClient, query } from "../db/connect.js";
import { getUnitVideoProgressAggregate } from "./bunnyStream.service.js";
import { sanitizeTheoryHtml } from "./courseCurriculumSync.service.js";
import { ExternalIntegrationError } from "./externalCourseMapping.service.js";
import { hasEffectiveCourseEntitlement } from "./externalEntitlementAccess.service.js";
import { isVideoCourseProfileAccessRevoked } from "./videoCourseAccessRevocation.service.js";
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
  "qa:rw",
]);

const VALID_SCOPE_SET = new Set(ALLOWED_DELEGATED_SCOPES);
const MAX_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 30;
const VIDEO_COMPLETION_PERCENT = 60;

const sha256Hex = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

const toIso = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const parsePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

function inferFileKind(mimeType, fileName) {
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
  };
}

function applySequentialLocks(rawUnits, { isPublicPreviewAccess = false } = {}) {
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

async function resolveProfileAndCourse(db, profileId) {
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

async function assertLiveLearnerProfileAccess(db, { userId, profileRow }) {
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

async function loadProfileUnitsWithProgress(db, { profileRow, userId = null }) {
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
      const isVideoCompleted = Boolean(aggregate?.isCompleted);
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
    const hasVideo = Number(aggregate?.partCount || 0) > 0 || Boolean(row.resolved_video_asset_id || row.learning_url);
    const quizCount = Number(row.quiz_count || 0);
    const completedQuizCount = Number(row.completed_quiz_count || 0);
    const isVideoCompleted = Boolean(aggregate?.isCompleted);
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

async function loadUnlockedUnitDetail(
  db,
  { profileRow, unitMeta, userId = null, isPublicPreviewAccess = false },
) {
  const unitId = Number(unitMeta.id);
  const effectiveUserId = userId || 0;
  const allowDownload = !isPublicPreviewAccess && profileRow.allow_file_download === true;

  if (unitMeta.type === "class_session") {
    const [videosRes, theoryRes, filesRes, assignRes, quizRes, vocabRes, formulaRes, notesRes] = await Promise.all([
      db.query(
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
      ),
      db.query(
        `SELECT id, title, content_html, summary, key_takeaways, transcript, timestamps_json
         FROM learning_unit_theory WHERE class_session_id = $1`,
        [unitId],
      ),
      db.query(
        `SELECT DISTINCT ON (session_files.id)
                session_files.id, session_files.file_name, session_files.file_size_bytes,
                session_files.mime_type, session_files.allow_file_download
         FROM (
           SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes, lf.mime_type,
                  COALESCE(lc.allow_file_download, TRUE) AS allow_file_download, 0 AS source_priority
           FROM lms_learning_files lf
           JOIN class_sessions cs ON cs.id = lf.class_session_id
           JOIN live_classes lc ON lc.id = cs.live_class_id
           WHERE lf.class_session_id = $1 AND lf.status = 'ready'
           UNION ALL
           SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes, lf.mime_type,
                  COALESCE(lc.allow_file_download, TRUE) AS allow_file_download, 1 AS source_priority
           FROM lms_learning_file_placements lfp
           JOIN lms_learning_files lf ON lf.id = lfp.file_id
           JOIN class_sessions cs ON cs.id = lfp.class_session_id
           JOIN live_classes lc ON lc.id = cs.live_class_id
           WHERE lfp.class_session_id = $1 AND lf.status = 'ready'
         ) session_files
         ORDER BY session_files.id, session_files.source_priority DESC`,
        [unitId],
      ),
      db.query(
        `SELECT a.id, a.title, a.description, a.max_score, a.due_date,
                CASE WHEN $2::bigint > 0 THEN (SELECT s.id FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 LIMIT 1) ELSE NULL END AS submission_id,
                CASE WHEN $2::bigint > 0 THEN (SELECT sg.score FROM assignment_submissions s JOIN submission_grades sg ON sg.submission_id = s.id WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 ORDER BY sg.id DESC LIMIT 1) ELSE NULL END AS score
         FROM assignments a
         WHERE a.class_session_id = $1
            OR ($3::bigint IS NOT NULL AND a.class_session_id IS NULL AND a.live_class_id = $3)
            OR (a.class_session_id IS NULL AND a.live_class_id IS NULL AND a.lesson_id IS NULL AND a.course_id = $5)
         ORDER BY a.id ASC`,
        [unitId, effectiveUserId, profileRow.source_live_class_id || null, profileRow.profile_id, profileRow.course_id],
      ),
      db.query(
        `SELECT q.id, q.title, q.duration_minutes, q.passing_score,
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
                ) ELSE NULL END AS max_score
         FROM quizzes q
         WHERE q.class_session_id = $1 AND q.status = 'PUBLISHED'
         ORDER BY q.id ASC`,
        [unitId, effectiveUserId, profileRow.profile_id],
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
      effectiveUserId > 0
        ? db.query(
          `SELECT id, timestamp_seconds, content, created_at
           FROM video_course_unit_notes
           WHERE user_id = $1 AND class_session_id = $2
           ORDER BY timestamp_seconds ASC, id ASC`,
          [effectiveUserId, unitId],
        )
        : Promise.resolve({ rows: [] }),
    ]);

    return formatUnlockedUnitResponse({
      unitMeta,
      videos: videosRes.rows,
      theory: theoryRes.rows[0] || null,
      files: filesRes.rows,
      assignments: assignRes.rows,
      quizzes: quizRes.rows,
      vocabulary: vocabRes.rows,
      formulas: formulaRes.rows,
      notes: notesRes.rows,
      allowDownload,
      isPublicPreviewAccess,
    });
  }

  // INDEPENDENT lesson
  const [videosRes, theoryRes, filesRes, assignRes, quizRes, vocabRes, formulaRes, notesRes] = await Promise.all([
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
              TRUE AS allow_file_download
       FROM lesson_learning_file_placements llfp
       JOIN lms_learning_files lf ON lf.id = llfp.file_id
       WHERE llfp.lesson_id = $1 AND lf.status = 'ready'
       ORDER BY llfp.sort_order ASC, llfp.id ASC`,
      [unitId],
    ),
    db.query(
      `SELECT a.id, a.title, a.description, a.max_score, a.due_date,
              CASE WHEN $2::bigint > 0 THEN (SELECT s.id FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 LIMIT 1) ELSE NULL END AS submission_id,
              CASE WHEN $2::bigint > 0 THEN (SELECT sg.score FROM assignment_submissions s JOIN submission_grades sg ON sg.submission_id = s.id WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 ORDER BY sg.id DESC LIMIT 1) ELSE NULL END AS score
       FROM assignments a
       WHERE a.lesson_id = $1
          OR (a.course_id = $3 AND a.lesson_id IS NULL AND a.live_class_id IS NULL AND a.class_session_id IS NULL)
       ORDER BY a.id ASC`,
      [unitId, effectiveUserId, profileRow.course_id, profileRow.profile_id],
    ),
    db.query(
      `SELECT q.id, q.title, q.duration_minutes, q.passing_score,
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
              ) ELSE NULL END AS max_score
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
    effectiveUserId > 0
      ? db.query(
        `SELECT id, timestamp_seconds, content, created_at
         FROM video_course_unit_notes
         WHERE user_id = $1 AND lesson_id = $2
         ORDER BY timestamp_seconds ASC, id ASC`,
        [effectiveUserId, unitId],
      )
      : Promise.resolve({ rows: [] }),
  ]);

  return formatUnlockedUnitResponse({
    unitMeta,
    videos: videosRes.rows,
    theory: theoryRes.rows[0] || null,
    files: filesRes.rows,
    assignments: assignRes.rows,
    quizzes: quizRes.rows,
    vocabulary: vocabRes.rows,
    formulas: formulaRes.rows,
    notes: notesRes.rows,
    allowDownload,
    isPublicPreviewAccess,
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
  allowDownload,
  isPublicPreviewAccess,
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
      return {
        id: String(f.id),
        fileName: f.file_name,
        title: f.file_name,
        sizeBytes: Number(f.file_size_bytes || 0),
        mimeType: f.mime_type || null,
        fileKind: inferFileKind(f.mime_type, f.file_name),
        allowView: true,
        allowDownload: canDl,
      };
    }),
    assignments: assignments.map((a) => ({
      id: String(a.id),
      title: a.title,
      description: a.description || "",
      maxScore: Number(a.max_score || 10),
      dueDate: toIso(a.due_date),
      isSubmitted: isPublicPreviewAccess ? false : Boolean(a.submission_id),
      score: !isPublicPreviewAccess && a.score != null ? Number(a.score) : null,
    })),
    quizzes: quizzes.map((q) => ({
      id: String(q.id),
      title: q.title,
      durationMinutes: q.duration_minutes != null ? Number(q.duration_minutes) : null,
      passingScore: Number(q.passing_score || 60),
      attemptsCount: isPublicPreviewAccess ? 0 : Number(q.attempts_count || 0),
      isCompleted: isPublicPreviewAccess ? false : Number(q.attempts_count || 0) > 0,
      bestScore: !isPublicPreviewAccess && q.best_score != null ? Number(q.best_score) : null,
      maxScore: !isPublicPreviewAccess && q.max_score != null ? Number(q.max_score) : null,
    })),
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
      createdAt: toIso(n.created_at),
    })),
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
    `SELECT ei.user_id, ei.status AS identity_status, u.is_locked
     FROM external_identities ei
     JOIN users u ON u.id = ei.user_id
     WHERE ei.source_system = 'moly'
       AND ei.external_user_id = $1
     LIMIT 1`,
    [extUser],
  );
  const identity = identityRes.rows[0] || null;
  if (!identity || identity.identity_status !== "active" || identity.is_locked === true) {
    throw new ExternalIntegrationError(
      403,
      "ENTITLEMENT_REQUIRED",
      "Learner account is not linked or inactive on CSCA-Course.",
    );
  }

  await assertLiveLearnerProfileAccess(db, {
    userId: identity.user_id,
    profileRow,
  });

  const parsedTtl = Number.parseInt(String(ttlSeconds ?? MAX_TTL_SECONDS), 10);
  const effectiveTtl = Number.isFinite(parsedTtl)
    ? Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, parsedTtl))
    : MAX_TTL_SECONDS;
  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + effectiveTtl * 1000);
  const jti = crypto.randomUUID();
  const sessionToken = `dls_${crypto.randomBytes(32).toString("base64url")}`;
  const nonce = crypto.randomBytes(24).toString("base64url");

  await db.query(
    `INSERT INTO delegated_learning_sessions (
       jti, session_token_hash, nonce_hash, user_id, external_user_id,
       course_id, video_course_profile_id, audience, scopes,
       correlation_id, issued_at, expires_at, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'csca-course:delegated-learning', $8::text[], $9, $10::timestamptz, $11::timestamptz, $12::jsonb)`,
    [
      jti,
      sha256Hex(sessionToken),
      sha256Hex(nonce),
      identity.user_id,
      extUser,
      profileRow.course_id,
      profileRow.profile_id,
      normalizedScopes,
      corr,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
      JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}),
    ],
  );

  recordIntegrationMetric("course.delegated_session_minted");
  return {
    sessionToken,
    tokenType: "DelegatedSession",
    jti,
    nonce,
    audience: "csca-course:delegated-learning",
    scopes: normalizedScopes,
    courseId: String(profileRow.course_id),
    profileId: String(profileRow.profile_id),
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
  now = () => new Date(),
  env = process.env,
} = {}) {
  if (isDelegatedLearningKillSwitchActive(env)) {
    throw new ExternalIntegrationError(503, "SYNC_KILL_SWITCH_ACTIVE", "Delegated learning endpoints are paused by kill switch.");
  }

  const rawToken = String(sessionToken || "").trim();
  if (!rawToken) {
    throw new ExternalIntegrationError(401, "INVALID_DELEGATED_SESSION", "Delegated learning session token is required.");
  }

  const sessionRes = await db.query(
    `SELECT dls.*, ei.status AS identity_status, u.is_locked
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
  if (session.revoked_at) {
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

  if (session.identity_status !== "active" || session.is_locked === true) {
    throw new ExternalIntegrationError(403, "ENTITLEMENT_REVOKED", "Learner identity is inactive or locked.");
  }

  const profileRow = await resolveProfileAndCourse(db, session.video_course_profile_id);
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

  const rawUnits = await loadProfileUnitsWithProgress(db, {
    profileRow,
    userId: session.user_id,
  });
  const units = applySequentialLocks(rawUnits, { isPublicPreviewAccess: false });

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
      allowFileDownload: profileRow.allow_file_download === true,
      deviceLimit: Number(profileRow.device_limit || 2),
      enforceTrustedDevices: profileRow.enforce_trusted_devices !== false,
      isPublicPreviewAccess: false,
    },
  };
}

async function assertUnitNotCrossProfile(db, { profileRow, unitId }) {
  const parsedId = parsePositiveId(unitId);
  if (!parsedId) return;
  const table = profileRow.mode === "MIRROR" ? "class_sessions" : "lessons";
  const otherExists = (await db.query(`SELECT id FROM ${table} WHERE id = $1 LIMIT 1`, [parsedId])).rows[0];
  if (otherExists) {
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

  const rawUnits = await loadProfileUnitsWithProgress(db, {
    profileRow,
    userId: session.user_id,
  });
  const units = applySequentialLocks(rawUnits, { isPublicPreviewAccess: false });
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
    activeUnit,
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
