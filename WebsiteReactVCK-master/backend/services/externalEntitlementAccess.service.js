import { query } from "../db/connect.js";
import { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";

/**
 * Reusable SQL snippet checking whether a user holds at least one active
 * external identity + active, non-expired external entitlement.
 */
export const EXTERNAL_LMS_ACCESS_EXISTS_SQL = (userIdExpr = "u.id") => `
  EXISTS (
    SELECT 1
    FROM external_identities ei_lms
    JOIN external_entitlements ee_lms
      ON ee_lms.user_id = ei_lms.user_id
     AND ee_lms.source_system = ei_lms.source_system
     AND ee_lms.external_user_id = ei_lms.external_user_id
     AND (ee_lms.external_identity_id IS NULL OR ee_lms.external_identity_id = ei_lms.id)
    WHERE ei_lms.user_id = ${userIdExpr}
      AND ei_lms.status = 'active'
      AND ee_lms.status = 'active'
      AND ee_lms.valid_from <= NOW()
      AND (ee_lms.valid_until IS NULL OR ee_lms.valid_until > NOW())
  )
`;

/**
 * Reusable SQL snippet checking effective learner course access across both
 * independent Management (`lms_access_grants`) and External (`external_entitlements`)
 * grant sources without coupling or cross-revoking their authority.
 */
export const EFFECTIVE_COURSE_GRANT_EXISTS_SQL = (userIdExpr = "$1", courseIdExpr = "$2") => `
  (
    EXISTS (
      SELECT 1
      FROM lms_access_grants g_eff
      JOIN users u_eff ON u_eff.id = g_eff.user_id
      WHERE g_eff.user_id = ${userIdExpr}
        AND g_eff.course_id = ${courseIdExpr}
        AND g_eff.access_status = 'active'
        AND g_eff.valid_from <= NOW()
        AND (g_eff.valid_until IS NULL OR g_eff.valid_until > NOW())
        AND (
          u_eff.is_internal_test_account = TRUE
          OR u_eff.is_management_managed = FALSE
          OR u_eff.lms_account_status = 'active'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM external_entitlements ee_eff
      JOIN external_identities ei_eff
        ON (
          ei_eff.id = ee_eff.external_identity_id
          OR (
            ee_eff.external_identity_id IS NULL
            AND ei_eff.user_id = ee_eff.user_id
            AND ei_eff.source_system = ee_eff.source_system
            AND ei_eff.external_user_id = ee_eff.external_user_id
          )
        )
      WHERE ee_eff.user_id = ${userIdExpr}
        AND ee_eff.local_course_id = ${courseIdExpr}
        AND ei_eff.status = 'active'
        AND ee_eff.status = 'active'
        AND ee_eff.valid_from <= NOW()
        AND (ee_eff.valid_until IS NULL OR ee_eff.valid_until > NOW())
    )
  )
`;

/**
 * Checks in DB whether a user has active external LMS access.
 */
export const hasActiveExternalLmsAccess = async (userId, db = { query }) => {
  if (!userId) return false;
  const result = await db.query(
    `SELECT 1 WHERE ${EXTERNAL_LMS_ACCESS_EXISTS_SQL("$1")}`,
    [userId],
  );
  return result.rows.length > 0;
};

/**
 * Resolves effective LMS account activation across InternalManagement, internal
 * test accounts, and active external entitlements (without overwriting
 * `users.is_management_managed`).
 */
export const resolveEffectiveStudentLmsAccess = async ({ user, db = { query } }) => {
  if (hasActiveStudentLmsAccess(user)) return true;
  if (!user || user.role !== "user" || !user.id) return false;
  // Respect explicit session-hydrated `false`; only fall back to DB when route
  // tests construct minimal `req.user` objects without session hydration.
  if (user.has_external_lms_access === false) return false;
  return hasActiveExternalLmsAccess(user.id, db);
};

/**
 * Checks whether a learner holds an active entitlement for a course/offering
 * across independent grant authorities (InternalManagement or external systems
 * like Moly Studio), preserving profile-level isolation when `profileId` is given.
 */
export const hasEffectiveCourseEntitlement = async ({
  db = { query },
  userId,
  courseId,
  liveClassId = null,
  profileId = null,
}) => {
  if (!userId || !courseId) return false;
  const result = await db.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1
       FROM lms_access_grants g
       JOIN users u ON u.id = g.user_id
       WHERE g.user_id = $1
         AND (
           u.is_internal_test_account = TRUE
           OR u.is_management_managed = FALSE
           OR u.lms_account_status = 'active'
         )
         AND (
           g.course_id = $2
           OR ($3::bigint IS NOT NULL AND EXISTS (
             SELECT 1
             FROM live_classes lc
             JOIN class_enrollments ce ON ce.live_class_id = lc.id
             WHERE lc.id = $3
               AND lc.course_id = g.course_id
               AND ce.user_id = $1
               AND ce.status = 'active'
           ))
         )
         AND g.access_status = 'active'
         AND g.valid_from <= NOW()
         AND (g.valid_until IS NULL OR g.valid_until > NOW())
     )
     OR EXISTS (
       SELECT 1
       FROM external_entitlements ee
       JOIN external_identities ei
         ON (
           ei.id = ee.external_identity_id
           OR (
             ee.external_identity_id IS NULL
             AND ei.user_id = ee.user_id
             AND ei.source_system = ee.source_system
             AND ei.external_user_id = ee.external_user_id
           )
         )
       WHERE ee.user_id = $1
         AND ei.status = 'active'
         AND ee.status = 'active'
         AND ee.valid_from <= NOW()
         AND (ee.valid_until IS NULL OR ee.valid_until > NOW())
         AND (
           ee.local_course_id = $2
           OR ($3::bigint IS NOT NULL AND ee.local_live_class_id = $3)
         )
         AND (
           $4::bigint IS NULL
           OR ee.local_video_course_profile_id IS NULL
           OR ee.local_video_course_profile_id = $4
         )
         AND (
           $3::bigint IS NULL
           OR ee.local_live_class_id IS NULL
           OR ee.local_live_class_id = $3
         )
     )
     LIMIT 1`,
    [userId, courseId, liveClassId, profileId],
  );
  return result.rows.length > 0;
};
