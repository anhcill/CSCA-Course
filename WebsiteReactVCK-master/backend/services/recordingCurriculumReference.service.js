const toIso = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const groupBy = (rows, key = "unit_id") => {
  const grouped = new Map();
  for (const row of rows) {
    const id = String(row[key]);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  return grouped;
};

const filterRowsByConfiguredIds = (rows, filter, key, idField = "id") => {
  if (!filter || !Object.prototype.hasOwnProperty.call(filter, key)) return rows;
  const allowed = new Set((Array.isArray(filter[key]) ? filter[key] : []).map((id) => String(id)));
  return rows.filter((row) => allowed.has(String(row[idField])));
};

const virtualSliceUnitId = (row) => (
  String(row.slice_key || "default") === "default"
    ? String(row.id)
    : String(1_000_000_000_000 + Number(row.override_id))
);

export function normalizeReferencedLessonTitle(value, fallback = "Bài học") {
  const source = String(value || fallback).trim();
  const normalized = source
    .replace(/^Imported\s+from\s+CSCA\s+Course\s+LMS\s*:\s*/iu, "")
    .replace(/\bChương\s+(?:\d+|[IVXLCDM]+)\s*:\s*/giu, "")
    .replace(/\s*([;,])\s*/gu, "$1 ")
    .replace(/\s{2,}/gu, " ")
    .trim();
  return normalized || source;
}

/**
 * Builds virtual units for an INDEPENDENT recording profile. Source sessions
 * contribute only non-video learning material; titles, visibility and videos
 * are destination-owned overrides. No source curriculum row is cloned.
 */
export async function loadReferencedRecordingCurriculum(
  runner,
  { course, profile, includeTombstoned = true, includeUnpublishedVideos = false } = {},
) {
  if (String(profile?.mode || "").toUpperCase() !== "INDEPENDENT") {
    return { sections: [], units: [], reference: null };
  }

  const reference = (
    await runner.query(
      `SELECT r.*
       FROM recording_curriculum_references r
       WHERE r.video_course_profile_id = $1
       LIMIT 1`,
      [profile.id],
    )
  ).rows[0];
  if (!reference) return { sections: [], units: [], reference: null };

  const excluded = new Set(
    (Array.isArray(reference.excluded_session_source_ids)
      ? reference.excluded_session_source_ids
      : []).map((id) => String(id).toLowerCase()),
  );
  const sessionRows = (
    await runner.query(
      `SELECT cs.id, cs.management_session_source_id, cs.title, cs.start_time, cs.end_time,
              cs.status, cs.chapter_id, cs.course_section_id, cs.created_at, cs.updated_at,
              cc.title AS chapter_title, cc.position AS chapter_position,
              s.title AS section_title, s.sort_order AS section_sort_order,
              o.id AS override_id, o.title_override, o.summary_override,
              o.duration_seconds_override, o.sort_order_override, o.is_published_override,
              o.is_public_preview_override, o.metadata AS override_metadata,
              o.slice_key, o.content_filter
       FROM class_sessions cs
       LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
       LEFT JOIN sections s ON s.id = cs.course_section_id
       LEFT JOIN recording_curriculum_unit_overrides o
         ON o.curriculum_reference_id = $2 AND o.source_class_session_id = cs.id
       WHERE cs.live_class_id = $1
         AND cs.status <> 'cancelled'
       ORDER BY COALESCE(o.sort_order_override, s.sort_order, cc.position, 0) ASC,
                cs.start_time ASC, cs.id ASC, o.id ASC`,
      [reference.source_live_class_id, reference.id],
    )
  ).rows.filter((row) => !excluded.has(String(row.management_session_source_id || "").toLowerCase()));

  if (sessionRows.length === 0) {
    return { sections: [], units: [], reference };
  }
  const sessionIds = sessionRows.map((row) => Number(row.id));
  const overrideIds = sessionRows.map((row) => Number(row.override_id)).filter(Boolean);

  const [theoryRes, vocabRes, formulaRes, directFilesRes, placedFilesRes, quizRes,
    destinationQuizRes, assignmentRes, videosRes] = await Promise.all([
    runner.query(
      `SELECT class_session_id AS unit_id, title, summary,
              (NULLIF(btrim(COALESCE(content_html, '')), '') IS NOT NULL) AS has_content_html,
              (NULLIF(btrim(COALESCE(transcript, '')), '') IS NOT NULL) AS has_transcript,
              COALESCE(jsonb_array_length(key_takeaways), 0)::int AS takeaway_count,
              COALESCE(jsonb_array_length(timestamps_json), 0)::int AS timestamp_count,
              updated_at
       FROM learning_unit_theory WHERE class_session_id = ANY($1::bigint[])`,
      [sessionIds],
    ),
    runner.query(
      `SELECT id, session_id AS unit_id
       FROM session_vocabularies WHERE session_id = ANY($1::bigint[])`,
      [sessionIds],
    ),
    runner.query(
      `SELECT id, session_id AS unit_id
       FROM session_formulas WHERE session_id = ANY($1::bigint[])`,
      [sessionIds],
    ),
    runner.query(
      `SELECT id AS file_id, class_session_id AS unit_id, original_name, mime_type,
              size_bytes, sync_revision AS revision, updated_at, 0 AS sort_order
       FROM lms_learning_files
       WHERE class_session_id = ANY($1::bigint[]) AND status = 'ready' AND deleted_at IS NULL`,
      [sessionIds],
    ),
    runner.query(
      `SELECT lf.id AS file_id, p.class_session_id AS unit_id, lf.original_name,
              lf.mime_type, lf.size_bytes, lf.sync_revision AS revision, lf.updated_at,
              COALESCE(p.sort_order, 0) AS sort_order
       FROM lms_learning_file_placements p
       JOIN lms_learning_files lf ON lf.id = p.file_id
       WHERE p.class_session_id = ANY($1::bigint[])
         AND p.deleted_at IS NULL AND lf.status = 'ready' AND lf.deleted_at IS NULL`,
      [sessionIds],
    ),
    runner.query(
      `SELECT id, class_session_id AS unit_id, title, duration_minutes, passing_score, updated_at
       FROM quizzes WHERE class_session_id = ANY($1::bigint[]) AND status = 'PUBLISHED'`,
      [sessionIds],
    ),
    overrideIds.length > 0
      ? runner.query(
        `SELECT id, recording_curriculum_unit_override_id AS unit_id,
                title, duration_minutes, passing_score, updated_at
         FROM quizzes
         WHERE recording_curriculum_unit_override_id = ANY($1::bigint[])
           AND status = 'PUBLISHED'`,
        [overrideIds],
      )
      : Promise.resolve({ rows: [] }),
    runner.query(
      `SELECT id, class_session_id AS unit_id, title, max_score, due_date, updated_at
       FROM assignments WHERE class_session_id = ANY($1::bigint[])`,
      [sessionIds],
    ),
    overrideIds.length > 0
      ? runner.query(
        `SELECT v.id AS placement_id, v.unit_override_id, v.video_asset_id,
                v.title AS part_title, v.video_type, v.sort_order, v.is_published, v.updated_at,
                v.published_at, va.title AS asset_title, va.duration_seconds, va.playback_status,
                va.thumbnail_url, va.provider, va.provider_library_id, va.provider_video_id,
                va.available_resolutions, va.processing_error
         FROM recording_curriculum_unit_videos v
         JOIN video_assets va ON va.id = v.video_asset_id AND va.deleted_at IS NULL
         WHERE v.unit_override_id = ANY($1::bigint[])
         ORDER BY v.unit_override_id, (v.video_type = 'primary') DESC, v.sort_order, v.id`,
        [overrideIds],
      )
      : Promise.resolve({ rows: [] }),
  ]);

  const theory = new Map(theoryRes.rows.map((row) => [String(row.unit_id), row]));
  const vocab = groupBy(vocabRes.rows);
  const formulas = groupBy(formulaRes.rows);
  const files = groupBy([...directFilesRes.rows, ...placedFilesRes.rows]);
  const quizzes = groupBy(quizRes.rows);
  const destinationQuizzes = groupBy(destinationQuizRes.rows);
  const assignments = groupBy(assignmentRes.rows);
  const videos = groupBy(videosRes.rows, "unit_override_id");
  const sectionMap = new Map();
  const coursePublished = !course.sync_deleted_at && Boolean(course.is_published);
  const profileActive = !profile.deleted_at && profile.status === "active";

  const units = sessionRows.map((row, index) => {
    const sourceId = String(row.id);
    const contentFilter = row.content_filter && typeof row.content_filter === "object"
      ? row.content_filter
      : {};
    const secId = row.course_section_id
      ? `ref-sec-${reference.id}-${row.course_section_id}`
      : row.chapter_id
        ? `ref-chap-${reference.id}-${row.chapter_id}`
        : `ref-sec-${reference.id}-default`;
    const secTitle = normalizeReferencedLessonTitle(
      row.section_title || row.chapter_title || "Nội dung khóa học",
      "Nội dung khóa học",
    );
    const sortOrder = Number(row.sort_order_override ?? index);
    const isPublished = coursePublished && profileActive && row.is_published_override !== false;
    if (!sectionMap.has(secId)) {
      sectionMap.set(secId, {
        sectionId: secId,
        title: secTitle,
        sortOrder: Number(row.section_sort_order ?? row.chapter_position ?? 0),
        isPublished: coursePublished && profileActive,
      });
    }

    const th = theory.get(sourceId) || null;
    const uniqueFiles = new Map();
    for (const file of files.get(sourceId) || []) uniqueFiles.set(String(file.file_id), file);
    const filteredFiles = filterRowsByConfiguredIds(
      [...uniqueFiles.values()], contentFilter, "sourceFileIds", "file_id",
    );
    const unitFiles = filteredFiles.map((file, fileIndex) => ({
      fileId: String(file.file_id),
      title: file.original_name || `Tài liệu ${fileIndex + 1}`,
      originalFilename: file.original_name || null,
      mimeType: file.mime_type || null,
      fileKind: "document",
      sizeBytes: file.size_bytes != null ? Number(file.size_bytes) : null,
      isSlide: false,
      allowView: true,
      allowDownload: profile.allow_file_download === true,
      allowDownloadOverride: null,
      sortOrder: Number(file.sort_order ?? fileIndex),
      isPublished,
      revision: Number(file.revision || 1),
      updatedAt: toIso(file.updated_at),
      placements: [],
    }));
    const videoParts = (videos.get(String(row.override_id)) || [])
      .filter((video) => includeUnpublishedVideos || video.is_published === true)
      .map((video, videoIndex) => ({
        placementId: String(video.placement_id),
        assetId: String(video.video_asset_id),
        partNumber: videoIndex + 1,
        title: video.part_title || video.asset_title || `Phần ${videoIndex + 1}`,
        videoType: video.video_type || "primary",
        durationSeconds: Number(video.duration_seconds || 0),
        playbackStatus: video.playback_status || "ready",
        isPublished: Boolean(video.is_published),
        publishedAt: toIso(video.published_at),
        thumbnailUrl: video.thumbnail_url || null,
        provider: video.provider || "bunny_stream",
        libraryId: video.provider_library_id || null,
        videoId: video.provider_video_id || null,
        availableResolutions: video.available_resolutions
          ? String(video.available_resolutions).split(",").map((item) => item.trim()).filter(Boolean)
          : [],
        processingError: video.processing_error || null,
      }));
    const sourceQuizzes = filterRowsByConfiguredIds(
      quizzes.get(sourceId) || [], contentFilter, "sourceQuizIds",
    );
    const unitQuizzes = [
      ...sourceQuizzes,
      ...(destinationQuizzes.get(String(row.override_id)) || []),
    ].map((quiz) => ({
      quizId: String(quiz.id),
      title: quiz.title,
      durationMinutes: quiz.duration_minutes != null ? Number(quiz.duration_minutes) : null,
      passingScore: quiz.passing_score != null ? Number(quiz.passing_score) : 60,
    }));
    const unitAssignments = (assignments.get(sourceId) || []).map((assignment) => ({
      assignmentId: String(assignment.id),
      title: assignment.title,
      maxScore: assignment.max_score != null ? Number(assignment.max_score) : 10,
      dueDate: toIso(assignment.due_date),
    }));
    return {
      unitKey: String(row.slice_key || "default") === "default"
        ? `class_session:${row.id}`
        : `recording_reference:${row.override_id}`,
      unitType: "class_session",
      unitId: virtualSliceUnitId(row),
      isRecordingReference: true,
      curriculumReferenceId: String(reference.id),
      unitOverrideId: row.override_id ? String(row.override_id) : null,
      sourceClassSessionId: sourceId,
      sliceKey: row.slice_key || "default",
      contentFilter,
      sectionId: secId,
      sectionTitle: secTitle,
      sectionSortOrder: Number(row.section_sort_order ?? row.chapter_position ?? 0),
      title: normalizeReferencedLessonTitle(row.title_override || row.title, `Bài ${index + 1}`),
      summary: row.summary_override || th?.summary || null,
      sortOrder,
      sessionNumber: index + 1,
      durationSeconds: row.duration_seconds_override != null
        ? Number(row.duration_seconds_override)
        : videoParts.reduce((sum, video) => sum + video.durationSeconds, 0),
      isPublished,
      isPublicPreview: Boolean(row.is_public_preview_override) && isPublished,
      deleted: false,
      deletedAt: null,
      revision: Number(profile.sync_revision || course.sync_revision || 1),
      sourceUpdatedAt: toIso(row.updated_at || row.created_at || reference.source_updated_at),
      videoPartCount: videoParts.length,
      videoParts,
      theory: {
        hasTheory: Boolean(th && (th.has_content_html || th.has_transcript || th.summary)),
        hasTranscript: Boolean(th?.has_transcript),
        takeawayCount: Number(th?.takeaway_count || 0),
        timestampCount: Number(th?.timestamp_count || 0),
        title: th?.title || null,
        summary: th?.summary || null,
        updatedAt: toIso(th?.updated_at),
      },
      counts: {
        videos: videoParts.length,
        vocab: filterRowsByConfiguredIds(
          vocab.get(sourceId) || [], contentFilter, "sourceVocabularyIds",
        ).length,
        formulas: filterRowsByConfiguredIds(
          formulas.get(sourceId) || [], contentFilter, "sourceFormulaIds",
        ).length,
        files: unitFiles.length,
        quizzes: unitQuizzes.length,
        assignments: unitAssignments.length,
      },
      files: unitFiles,
      quizzes: unitQuizzes,
      assignments: unitAssignments,
    };
  });

  return {
    sections: [...sectionMap.values()],
    units: includeTombstoned ? units : units.filter((unit) => unit.isPublished),
    reference,
  };
}
