export const isVideoCourseProfileAccessRevoked = async ({ db, userId, profileId }) => {
  if (!userId || !profileId) return false;
  const result = await db.query(
    `SELECT 1
     FROM video_course_access_revocations
     WHERE video_course_profile_id = $1 AND user_id = $2
     LIMIT 1`,
    [profileId, userId],
  );
  return Boolean(result.rows[0]);
};

// Bunny playback requests carry course/unit context rather than the admin
// offering id. Access remains valid when the learner has any matching,
// unrevoked Record profile for that unit.
export const hasUnrevokedVideoCourseAccess = async ({ db, userId, courseId, liveClassId = null }) => {
  if (!userId || !courseId) return false;
  const result = await db.query(
    `SELECT 1
     FROM video_course_profiles vcp
     WHERE vcp.course_id = $2
       AND vcp.status = 'active'
       AND ($3::bigint IS NULL OR vcp.source_live_class_id = $3)
       AND NOT EXISTS (
         SELECT 1
         FROM video_course_access_revocations revoked
         WHERE revoked.video_course_profile_id = vcp.id
           AND revoked.user_id = $1
       )
       AND EXISTS (
         SELECT 1
         FROM class_enrollments ce
         LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
         LEFT JOIN management_class_learning_aliases alias
           ON alias.id = ce.management_class_alias_id AND alias.status = 'active'
         WHERE ce.user_id = $1
           AND ce.status = 'active'
           AND (
             (vcp.mode = 'MIRROR' AND ce.live_class_id = vcp.source_live_class_id)
             OR
             (vcp.mode = 'INDEPENDENT' AND ce.learning_mode = 'recording' AND (
               (vcp.management_class_id IS NOT NULL
                 AND LOWER(alias.alias_class_source_id) = LOWER(vcp.management_class_id))
               OR
               (vcp.management_class_id IS NULL
                 AND (ce.course_id = vcp.course_id OR lc.course_id = vcp.course_id))
             ))
           )
       )
     LIMIT 1`,
    [userId, courseId, liveClassId],
  );
  return Boolean(result.rows[0]);
};
