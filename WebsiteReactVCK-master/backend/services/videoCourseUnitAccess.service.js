const REQUIRED_WATCH_PERCENT = 60;

const hasRecordingMembership = async (db, profile, userId) => Boolean((await db.query(
  `SELECT 1
   FROM class_enrollments ce
   LEFT JOIN management_class_learning_aliases alias
     ON alias.id = ce.management_class_alias_id AND alias.status = 'active'
   WHERE ce.user_id = $1 AND ce.status = 'active'
     AND (
       (ce.learning_mode = 'recording' AND (
         ($5::text IS NOT NULL
           AND LOWER(alias.alias_class_source_id) = LOWER($5)
           AND ($2::text <> 'MIRROR' OR ce.live_class_id = $3))
         OR ($5::text IS NULL AND $2::text = 'MIRROR' AND ce.live_class_id = $3)
         OR ($5::text IS NULL AND $2::text = 'INDEPENDENT' AND ce.course_id = $4)
       ))
       OR
       -- Live class student whose class is mirrored by this record course profile
       ($2::text = 'MIRROR' AND $3::bigint IS NOT NULL AND ce.live_class_id = $3)
     )
   LIMIT 1`,
  [userId, profile.mode, profile.source_live_class_id, profile.course_id, profile.management_class_id],
)).rows[0]);

const loadMirrorUnits = async (db, profile, userId) => (await db.query(
  `SELECT cs.id, cs.is_public_preview, csv.video_asset_id,
          COALESCE(vwp.is_completed, FALSE) AS video_completed,
          COALESCE(vwp.completion_percent, 0) AS completion_percent,
          (SELECT COUNT(*)::int FROM quizzes q
           WHERE q.class_session_id = cs.id AND q.status = 'PUBLISHED') AS quiz_count,
          (SELECT COUNT(*)::int FROM quizzes q
           WHERE q.class_session_id = cs.id AND q.status = 'PUBLISHED'
             AND EXISTS (
               SELECT 1 FROM quiz_attempts qa
               WHERE qa.quiz_id = q.id AND qa.user_id = $2
                 AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                 AND (qa.status IN ('SUBMITTED','GRADED','COMPLETED','submitted','graded','completed')
                   OR qa.submitted_at IS NOT NULL)
             )) AS completed_quiz_count
   FROM class_sessions cs
   LEFT JOIN LATERAL (
     SELECT csv_inner.video_asset_id
     FROM class_session_videos csv_inner
     WHERE csv_inner.class_session_id = cs.id AND csv_inner.is_published = TRUE
     ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order, csv_inner.id
     LIMIT 1
   ) csv ON TRUE
   LEFT JOIN video_watch_progress vwp
     ON vwp.user_id = $2 AND vwp.video_asset_id = csv.video_asset_id
   WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
   ORDER BY cs.start_time, cs.id`,
  [profile.source_live_class_id, userId, profile.id],
)).rows;

const loadIndependentUnits = async (db, profile, userId) => (await db.query(
  `SELECT l.id, l.is_public_preview, COALESCE(lva.video_asset_id, l.video_asset_id) AS video_asset_id,
          l.learning_url,
          COALESCE(vwp.is_completed, FALSE) AS video_completed,
          COALESCE(vwp.completion_percent, 0) AS completion_percent,
          (SELECT COUNT(*)::int FROM quizzes q
           WHERE q.lesson_id = l.id AND q.status = 'PUBLISHED') AS quiz_count,
          (SELECT COUNT(*)::int FROM quizzes q
           WHERE q.lesson_id = l.id AND q.status = 'PUBLISHED'
             AND EXISTS (
               SELECT 1 FROM quiz_attempts qa
               WHERE qa.quiz_id = q.id AND qa.user_id = $2
                 AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                 AND (qa.status IN ('SUBMITTED','GRADED','COMPLETED','submitted','graded','completed')
                   OR qa.submitted_at IS NOT NULL)
             )) AS completed_quiz_count
   FROM lessons l
   LEFT JOIN sections s ON s.id = l.section_id
   LEFT JOIN LATERAL (
     SELECT placement.video_asset_id
     FROM class_session_videos placement
     WHERE placement.lesson_id = l.id AND placement.is_published = TRUE
     ORDER BY (placement.video_type = 'primary') DESC, placement.sort_order, placement.id
     LIMIT 1
   ) lva ON TRUE
   LEFT JOIN video_watch_progress vwp
     ON vwp.user_id = $2
       AND (vwp.video_asset_id = COALESCE(lva.video_asset_id, l.video_asset_id) OR vwp.lesson_id = l.id)
   WHERE l.course_id = $1 AND l.is_published = TRUE
   ORDER BY COALESCE(s.sort_order, 0), l.sort_order, l.id`,
  [profile.course_id, userId, profile.id],
)).rows;

const completed = (unit) => {
  const videoComplete = Boolean(unit.video_asset_id || unit.learning_url)
    && (unit.video_completed === true || Number(unit.completion_percent || 0) >= REQUIRED_WATCH_PERCENT);
  const quizCount = Number(unit.quiz_count || 0);
  const quizComplete = quizCount === 0 || Number(unit.completed_quiz_count || 0) >= quizCount;
  return videoComplete && quizComplete;
};

export const getVideoCourseUnitAccessContext = async ({ db, userId, unitType, unitId, videoCourseProfileId = null, userRole = null }) => {
  if (userRole === "admin" || userRole === "creator") {
    return { isVideoCourseUnit: true, isPublicPreview: false, isRecordMember: true, isUnlocked: true, profile: null };
  }
  if (!userId || !unitId || !["class_session", "lesson"].includes(unitType)) {
    return { isVideoCourseUnit: false, isPublicPreview: false, isRecordMember: false, isUnlocked: true, profile: null };
  }

  const profiles = unitType === "class_session"
    ? (await db.query(
      `SELECT vcp.*, cs.is_public_preview
       FROM class_sessions cs
       JOIN video_course_profiles vcp
         ON vcp.mode = 'MIRROR' AND vcp.source_live_class_id = cs.live_class_id
       WHERE cs.id = $1 AND vcp.status = 'active'
         AND ($2::bigint IS NULL OR vcp.id = $2)
       ORDER BY vcp.id`,
      [unitId, videoCourseProfileId],
    )).rows
    : (await db.query(
      `SELECT vcp.*, l.is_public_preview
       FROM lessons l
       JOIN video_course_profiles vcp
         ON vcp.mode = 'INDEPENDENT' AND vcp.course_id = l.course_id
       WHERE l.id = $1 AND vcp.status = 'active'
         AND ($2::bigint IS NULL OR vcp.id = $2)
       ORDER BY vcp.id`,
      [unitId, videoCourseProfileId],
    )).rows;

  if (profiles.length === 0) {
    return { isVideoCourseUnit: false, isPublicPreview: false, isRecordMember: false, isUnlocked: true, profile: null };
  }
  let profile = null;
  for (const candidate of profiles) {
    if (await hasRecordingMembership(db, candidate, userId)) {
      profile = candidate;
      break;
    }
  }

  const isPublicPreview = profiles[0].is_public_preview === true;
  if (!profile) {
    if (isPublicPreview) {
      return { isVideoCourseUnit: true, isPublicPreview: true, isRecordMember: false, isUnlocked: true, profile: profiles[0] };
    }
    return { isVideoCourseUnit: true, isPublicPreview: false, isRecordMember: false, isUnlocked: true, profile: null };
  }

  const units = profile.mode === "MIRROR"
    ? await loadMirrorUnits(db, profile, userId)
    : await loadIndependentUnits(db, profile, userId);
  const targetIndex = units.findIndex((unit) => String(unit.id) === String(unitId));
  const isUnlocked = isPublicPreview
    || targetIndex === 0
    || (targetIndex > 0 && units.slice(0, targetIndex).every(completed));
  return { isVideoCourseUnit: true, isPublicPreview, isRecordMember: true, isUnlocked, profile };
};

export const isVideoCourseUnitUnlocked = async (options) => {
  if (options?.userRole === "admin" || options?.userRole === "creator") return true;
  return (await getVideoCourseUnitAccessContext(options)).isUnlocked;
};

export default isVideoCourseUnitUnlocked;
