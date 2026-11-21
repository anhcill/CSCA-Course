import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import {
  authorizeRecordDevice,
  revokeTrustedDevice,
  TrustedDeviceAuthError,
} from "../services/trustedDevice.service.js";
import { getUnitVideoProgressAggregate } from "../services/bunnyStream.service.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { isVideoCourseProfileAccessRevoked } from "../services/videoCourseAccessRevocation.service.js";
import { hasLiveReviewMembership } from "../services/videoCourseUnitAccess.service.js";
import {
  EXTERNAL_LMS_ACCESS_EXISTS_SQL,
  EFFECTIVE_COURSE_GRANT_EXISTS_SQL,
  hasEffectiveCourseEntitlement,
  resolveEffectiveStudentLmsAccess,
} from "../services/externalEntitlementAccess.service.js";
import {
  recordCourseCatalogMutation,
  recordProfileCatalogMutation,
} from "../services/courseCatalogSync.service.js";
import {
  resolveBeforeDeleteUnitSnapshot,
  safeRecordCurriculumMutation,
  safeRecordUnitContentMutation,
} from "../services/courseCurriculumSync.service.js";
import {
  createUnitBookmarkForAuthorizedUnit,
  createUnitNoteForAuthorizedUnit,
  createUnitQaThreadForAuthorizedUnit,
  deleteUnitBookmarkForAuthorizedUnit,
  deleteUnitNoteForAuthorizedUnit,
  listUnitBookmarksForAuthorizedUnit,
  listUnitQaThreadsForAuthorizedUnit,
  replyUnitQaThreadForAuthorizedActor,
  updateUnitNoteForAuthorizedUnit,
  updateUnitQaThreadStatusForAuthorizedActor,
} from "../services/delegatedNotesQa.service.js";
import { ExternalIntegrationError } from "../services/externalCourseMapping.service.js";
import {
  normalizeRecordLessonDescription,
  normalizeRecordLessonTitle,
  shouldHideRecordLessonByDefault,
} from "../services/videoCourseLessonMetadata.service.js";
import { loadReferencedRecordingCurriculum } from "../services/recordingCurriculumReference.service.js";
import {
  loadProfileUnitsWithProgress,
  loadUnlockedUnitDetail,
} from "../services/delegatedLearning.service.js";

const router = express.Router();
const ACCESS_HELP_MESSAGE = "Bạn chưa được cấp quyền học khóa này. Nhắn Zalo 0812352005 để admin hỗ trợ bạn nhé 💙";
const VIDEO_COMPLETION_PERCENT = 50;

const validationError = (res, message) => res.status(422).json({
  success: false,
  message,
  errorCode: "VALIDATION_ERROR",
});

const notFound = (res, message) => res.status(404).json({
  success: false,
  message,
  errorCode: "NOT_FOUND",
});

const forbidden = (res, message, errorCode = "FORBIDDEN") => res.status(403).json({
  success: false,
  message,
  errorCode,
});

const parsePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

// Check if user has active LMS access grant for course
const checkCourseEntitlement = async (courseId, userId, { sourceLiveClassId = null, profileId = null } = {}) => (
  hasEffectiveCourseEntitlement({
    db: { query },
    userId,
    courseId,
    liveClassId: sourceLiveClassId,
    profileId,
  })
);

// Check if learner is enrolled in recording class or alias, or enrolled in the source live class that this video course mirrors
const checkRecordMembership = async ({
  userId,
  liveClassId = null,
  courseId,
  managementClassId = null,
  mode,
  profileId = null,
}) => {
  const result = await query(
    `SELECT ce.id, ce.learning_mode, ce.management_class_alias_id,
            ce.video_course_profile_id, ce.live_class_id,
            mcla.title AS alias_title, mcla.alias_class_source_id
     FROM class_enrollments ce
     LEFT JOIN management_class_learning_aliases mcla ON mcla.id = ce.management_class_alias_id
     LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
     WHERE ce.user_id = $1
       AND ce.status = 'active'
       AND (
         (
           ce.video_course_profile_id IS NOT NULL
           AND $6::bigint IS NOT NULL
           AND ce.video_course_profile_id = $6
         )
         OR (
           ce.video_course_profile_id IS NULL
           AND (
             -- Standard record enrollment
             (
               ce.learning_mode = 'recording'
               AND (lc.course_id = $2 OR ce.course_id = $2)
               AND ($3::text IS NULL OR LOWER(mcla.alias_class_source_id) = LOWER($3))
               AND ($4::bigint IS NULL OR ce.live_class_id = $4)
               AND (
                 $5::text <> 'INDEPENDENT'
                 OR mcla.recording_content_mode = 'INDEPENDENT'
                 OR ($3::text IS NULL AND ce.live_class_id IS NULL)
               )
             )
             OR
             -- Live class student whose class is mirrored by this record course
             (
               $5::text = 'MIRROR'
               AND $4::bigint IS NOT NULL
               AND ce.live_class_id = $4
             )
           )
         )
       )
     ORDER BY (ce.video_course_profile_id IS NOT NULL) DESC, (ce.learning_mode = 'recording') DESC, ce.id ASC
     LIMIT 1`,
    [userId, courseId, managementClassId, liveClassId, mode, profileId],
  );
  return result.rows[0] || null;
};

const resolveProfileOffering = async (offeringParam) => {
  const normalized = String(offeringParam || "").trim();
  if (!normalized) return null;
  const profileId = /^profile-(\d+)$/i.exec(normalized)?.[1] || null;
  const result = await query(
    `SELECT vcp.id AS profile_id, c.id, vcp.course_id, vcp.management_class_id, vcp.mode,
            vcp.source_live_class_id, vcp.enforce_trusted_devices,
            vcp.allow_file_download,
            vcp.device_limit, vcp.status,
            c.name, COALESCE(c.title, c.name) AS title, c.slug,
            c.description, c.category, c.level, c.price, c.is_free,
            c.is_published, c.is_management_managed,
            COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
            c.total_lessons, c.author_id,
            COALESCE(NULLIF(u.management_display_name, ''), u.username, u.email) AS instructor_name
     FROM video_course_profiles vcp
     JOIN courses c ON c.id = vcp.course_id
     LEFT JOIN users u ON u.id = c.author_id
     WHERE vcp.status = 'active'
       AND vcp.deleted_at IS NULL
       AND (
         ($1::text <> '' AND LOWER(vcp.management_class_id) = LOWER($1))
         OR ($2::bigint IS NOT NULL AND vcp.id = $2)
       )
     LIMIT 1`,
    [normalized, profileId],
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    profile: { ...row, id: row.profile_id },
    course: { ...row, id: row.course_id || row.id },
    liveClass: row.source_live_class_id ? { id: row.source_live_class_id } : null,
  };
};

// Resolve offering: can be a course ID, a live_class ID, or a slug
const resolveOffering = async (offeringParam) => {
  const positiveId = parsePositiveId(offeringParam);

  // 1. Check if offering is a course ID
  if (positiveId) {
    const courseRes = await query(
      `SELECT c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug,
              c.description, c.category, c.level, c.price, c.is_free,
              c.is_published, c.is_management_managed,
              COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
              c.total_lessons, c.author_id,
              COALESCE(NULLIF(u.management_display_name, ''), u.username, u.email) AS instructor_name
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = $1`,
      [positiveId],
    );
    if (courseRes.rows.length > 0) {
      return { course: courseRes.rows[0], liveClass: null };
    }

    // 2. Check if offering is a live_class ID
    const classRes = await query(
      `SELECT lc.id, lc.title, lc.description, lc.course_id, lc.instructor_id,
              lc.status,
              c.name AS course_name, COALESCE(c.title, c.name) AS course_title,
              c.slug AS course_slug, c.category, c.level, c.is_management_managed,
              COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
              COALESCE(NULLIF(lc.teacher_display_name, ''), u.username) AS instructor_name
       FROM live_classes lc
       JOIN courses c ON c.id = lc.course_id
       LEFT JOIN users u ON u.id = lc.instructor_id
       WHERE lc.id = $1`,
      [positiveId],
    );
    if (classRes.rows.length > 0) {
      const cls = classRes.rows[0];
      const course = {
        id: cls.course_id,
        name: cls.course_name,
        title: cls.course_title,
        slug: cls.course_slug,
        category: cls.category,
        level: cls.level,
        is_management_managed: cls.is_management_managed,
        thumbnail_url: cls.thumbnail_url,
        instructor_name: cls.instructor_name,
      };
      return { course, liveClass: cls };
    }
  }

  // 3. Fallback: check course by slug
  const slugRes = await query(
    `SELECT c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug,
            c.description, c.category, c.level, c.price, c.is_free,
            c.is_published, c.is_management_managed,
            COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
            c.total_lessons, c.author_id,
            COALESCE(NULLIF(u.management_display_name, ''), u.username, u.email) AS instructor_name
     FROM courses c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.slug = $1`,
    [String(offeringParam).trim()],
  );
  if (slugRes.rows.length > 0) {
    return { course: slugRes.rows[0], liveClass: null };
  }

  return { course: null, liveClass: null };
};

// GET /api/video-courses - Public & Learner catalog of video courses
router.get("/", async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug,
              c.description, c.category, c.level, c.price, c.is_free,
              c.is_published, COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
              c.total_lessons, c.ratings_avg, c.ratings_count,
              COALESCE(NULLIF(lc.teacher_display_name, ''), NULLIF(u.management_display_name, ''), u.username, u.email) AS instructor_name,
              vcp.id AS profile_id, vcp.management_class_id,
              vcp.mode AS video_mode,
              vcp.source_live_class_id,
              vcp.device_limit,
              (SELECT COUNT(*)::int FROM sections s WHERE s.course_id = c.id) AS sections_count,
              (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id AND l.is_published = true) AS published_lessons_count,
              (SELECT COUNT(*)::int FROM lessons l
               WHERE l.course_id = c.id AND l.is_published = true AND l.is_public_preview = true) AS preview_lessons_count,
              (SELECT COUNT(*)::int FROM class_sessions cs
               WHERE cs.live_class_id = vcp.source_live_class_id
                 AND cs.status <> 'cancelled' AND cs.is_public_preview = true) AS preview_sessions_count
              ,(SELECT COUNT(*)::int
                FROM recording_curriculum_references r
                JOIN class_sessions cs ON cs.live_class_id = r.source_live_class_id
                LEFT JOIN recording_curriculum_unit_overrides o
                  ON o.curriculum_reference_id = r.id AND o.source_class_session_id = cs.id
                WHERE r.video_course_profile_id = vcp.id
                  AND cs.status <> 'cancelled'
                  AND COALESCE(o.is_published_override, TRUE) = TRUE
                  AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(r.excluded_session_source_ids) excluded(source_id)
                    WHERE LOWER(excluded.source_id) = LOWER(COALESCE(cs.management_session_source_id, ''))
                  )) AS referenced_units_count
              ,(SELECT COUNT(DISTINCT COALESCE(
                           cs.course_section_id::text,
                           cs.chapter_id::text,
                           'default'
                         ))::int
                FROM recording_curriculum_references r
                JOIN class_sessions cs ON cs.live_class_id = r.source_live_class_id
                LEFT JOIN recording_curriculum_unit_overrides o
                  ON o.curriculum_reference_id = r.id AND o.source_class_session_id = cs.id
                WHERE r.video_course_profile_id = vcp.id
                  AND cs.status <> 'cancelled'
                  AND COALESCE(o.is_published_override, TRUE) = TRUE
                  AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(r.excluded_session_source_ids) excluded(source_id)
                    WHERE LOWER(excluded.source_id) = LOWER(COALESCE(cs.management_session_source_id, ''))
                  )) AS referenced_sections_count
              ,(SELECT COUNT(*)::int
                FROM recording_curriculum_references r
                JOIN class_sessions cs ON cs.live_class_id = r.source_live_class_id
                LEFT JOIN recording_curriculum_unit_overrides o
                  ON o.curriculum_reference_id = r.id AND o.source_class_session_id = cs.id
                WHERE r.video_course_profile_id = vcp.id
                  AND cs.status <> 'cancelled'
                  AND COALESCE(o.is_published_override, TRUE) = TRUE
                  AND o.is_public_preview_override = TRUE
                  AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(r.excluded_session_source_ids) excluded(source_id)
                    WHERE LOWER(excluded.source_id) = LOWER(COALESCE(cs.management_session_source_id, ''))
                  )) AS referenced_preview_units_count
       FROM video_course_profiles vcp
       JOIN courses c ON c.id = vcp.course_id
       LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
       LEFT JOIN users u ON u.id = COALESCE(lc.instructor_id, c.author_id)
       WHERE c.is_published = true AND vcp.status = 'active' AND vcp.deleted_at IS NULL
       ORDER BY c.id ASC, vcp.id ASC`,
    );

    const courses = result.rows.map((row) => ({
      id: String(row.id),
      offeringId: row.management_class_id || `profile-${row.profile_id}`,
      name: row.name,
      title: row.title,
      slug: row.slug,
      description: row.description,
      category: row.category,
      level: row.level,
      price: Number(row.price || 0),
      isFree: Boolean(row.is_free),
      thumbnailUrl: row.thumbnail_url,
      totalLessons: Number(row.published_lessons_count || 0)
        + Number(row.referenced_units_count || 0)
        || Number(row.total_lessons || 0),
      sectionsCount: Number(row.sections_count || 0) + Number(row.referenced_sections_count || 0),
      previewUnitsCount: Number(row.preview_lessons_count || 0)
        + Number(row.preview_sessions_count || 0)
        + Number(row.referenced_preview_units_count || 0),
      instructorName: row.instructor_name || "Moly Course",
      videoMode: row.video_mode || "MIRROR",
      badgeLabel: row.video_mode === "INDEPENDENT" ? "Video độc lập" : "Record kế thừa",
      deviceLimit: row.device_limit || 2,
    }));

    return res.json({ success: true, data: courses });
  } catch (error) {
    console.error("List video courses error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

const findActiveProfilesForResolvedOffering = async ({ courseId, sourceLiveClassId = null }) => {
  const result = await query(
    `SELECT vcp.id, vcp.course_id, vcp.mode, vcp.source_live_class_id,
            vcp.enforce_trusted_devices, vcp.allow_file_download,
            vcp.device_limit, vcp.status, vcp.management_class_id,
            lc.title AS source_class_title, lc.status AS source_class_status
     FROM video_course_profiles vcp
     LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
     WHERE vcp.status = 'active'
       AND vcp.deleted_at IS NULL
       AND (
         vcp.course_id = $1
         OR ($2::bigint IS NOT NULL AND vcp.mode = 'MIRROR' AND vcp.source_live_class_id = $2)
       )
     ORDER BY CASE
       WHEN $2::bigint IS NOT NULL AND vcp.source_live_class_id = $2 THEN 0
       ELSE 1
     END, vcp.id ASC`,
    [courseId, sourceLiveClassId],
  );
  return result.rows;
};

const hydrateCourseForProfile = async (course, profile) => {
  if (!profile?.course_id || String(profile.course_id) === String(course.id)) return course;
  const resolved = await resolveOffering(profile.course_id);
  return resolved?.course || course;
};

const resolveVideoCourseContext = async (offeringId) => {
  const directOffering = await resolveProfileOffering(offeringId);
  const resolved = directOffering || await resolveOffering(offeringId);
  if (!resolved?.course) return null;

  let course = resolved.course;
  const courseId = Number(course.id);
  const profileRows = directOffering
    ? [directOffering.profile]
    : await findActiveProfilesForResolvedOffering({
      courseId,
      sourceLiveClassId: resolved.liveClass?.id || null,
    });
  const profile = profileRows[0] || null;
  if (!profile) return { course, profile: null, mode: null, sourceLiveClassId: null };
  course = await hydrateCourseForProfile(course, profile);

  let mode = profile.mode || "MIRROR";
  let sourceLiveClassId = profile.source_live_class_id || resolved.liveClass?.id || null;
  if (mode === "MIRROR" && !sourceLiveClassId) {
    const liveResult = await query(
      `SELECT id FROM live_classes
       WHERE course_id = $1 AND status IN ('active', 'completed')
       ORDER BY (status = 'active') DESC, id DESC LIMIT 1`,
      [courseId],
    );
    sourceLiveClassId = liveResult.rows[0]?.id || null;
    if (!sourceLiveClassId) mode = "INDEPENDENT";
  }

  return { course, profile, mode, sourceLiveClassId };
};

const resolveOverviewInstructor = async ({ course, sourceLiveClassId }) => {
  const result = await query(
    `SELECT COALESCE(
              NULLIF(lc.teacher_display_name, ''),
              NULLIF(class_teacher.management_display_name, ''),
              class_teacher.username,
              NULLIF(course_teacher.management_display_name, ''),
              course_teacher.username,
              'Đội ngũ Moly Course'
            ) AS display_name,
            COALESCE(class_teacher.avatar_url, course_teacher.avatar_url) AS avatar_url
     FROM courses c
     LEFT JOIN live_classes lc ON lc.id = $2
     LEFT JOIN users class_teacher ON class_teacher.id = lc.instructor_id
     LEFT JOIN users course_teacher ON course_teacher.id = c.author_id
     WHERE c.id = $1`,
    [course.id, sourceLiveClassId],
  );
  return result.rows[0] || { display_name: "Đội ngũ Moly Course", avatar_url: null };
};

// Public sales-page contract. It deliberately exposes only syllabus metadata,
// never private workspace content, meeting links or playback credentials.
router.get("/:offeringId/overview", async (req, res) => {
  try {
    const context = await resolveVideoCourseContext(req.params.offeringId);
    if (!context?.course) return notFound(res, "Không tìm thấy khóa học");
    if (!context.profile) return notFound(res, "Khóa học này chưa được cấu hình khóa video");

    const { course, profile, mode, sourceLiveClassId } = context;
    const instructor = await resolveOverviewInstructor({ course, sourceLiveClassId });
    let sections = [];

    if (mode === "MIRROR" && sourceLiveClassId) {
      const result = await query(
        `SELECT cc.id AS section_id, cc.title AS section_title,
                cc.description AS section_description, cc.position AS section_position,
                cs.id AS unit_id, cs.title AS unit_title, cs.start_time, cs.end_time,
                cs.status AS unit_status, cs.is_public_preview,
                COALESCE((
                  SELECT SUM(COALESCE(va.duration_seconds, 0))
                  FROM class_session_videos csv
                  JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
                  WHERE csv.class_session_id = cs.id AND csv.is_published = TRUE
                ), 0)::int AS duration_seconds
         FROM class_chapters cc
         LEFT JOIN class_sessions cs
           ON cs.chapter_id = cc.id AND cs.status <> 'cancelled'
         WHERE cc.live_class_id = $1
         ORDER BY cc.position ASC, cc.id ASC, cs.start_time ASC, cs.id ASC`,
        [sourceLiveClassId],
      );
      const bySection = new Map();
      for (const row of result.rows) {
        const key = String(row.section_id);
        if (!bySection.has(key)) {
          bySection.set(key, {
            id: key,
            title: row.section_title || "Lộ trình buổi học",
            description: row.section_description || "",
            position: Number(row.section_position || 0),
            lessons: [],
          });
        }
        if (row.unit_id) {
          bySection.get(key).lessons.push({
            id: String(row.unit_id),
            title: row.unit_title || "Buổi học",
            durationSeconds: Number(row.duration_seconds || 0),
            isPreview: Boolean(row.is_public_preview),
            status: row.unit_status,
            startTime: row.start_time,
            endTime: row.end_time,
          });
        }
      }
      sections = Array.from(bySection.values());
    } else {
      const result = await query(
        `SELECT s.id AS section_id, s.title AS section_title, s.sort_order AS section_position,
                l.id AS unit_id, COALESCE(l.title, l.name) AS unit_title,
                l.duration_seconds, l.is_public_preview
         FROM sections s
         LEFT JOIN lessons l ON l.section_id = s.id AND l.is_published = TRUE
         WHERE s.course_id = $1
         ORDER BY s.sort_order ASC, s.id ASC, l.sort_order ASC, l.id ASC`,
        [course.id],
      );
      const bySection = new Map();
      for (const row of result.rows) {
        const key = String(row.section_id);
        if (!bySection.has(key)) {
          bySection.set(key, {
            id: key,
            title: row.section_title || "Nội dung khóa học",
            description: "",
            position: Number(row.section_position || 0),
            lessons: [],
          });
        }
        if (row.unit_id) {
          bySection.get(key).lessons.push({
            id: String(row.unit_id),
            title: row.unit_title || "Bài học",
            durationSeconds: Number(row.duration_seconds || 0),
            isPreview: Boolean(row.is_public_preview),
            status: "published",
            startTime: null,
            endTime: null,
          });
        }
      }
      sections = Array.from(bySection.values());

      const referenced = await loadReferencedRecordingCurriculum(
        { query },
        {
          course,
          profile,
          includeTombstoned: false,
          includeUnpublishedVideos: false,
        },
      );
      if (referenced.reference) {
        const referencedSections = referenced.sections
          .map((section) => ({
            id: String(section.sectionId),
            title: section.title || "Nội dung khóa học",
            description: "",
            position: Number(section.sortOrder || 0),
            lessons: referenced.units
              .filter((unit) => String(unit.sectionId) === String(section.sectionId))
              .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
              .map((unit) => ({
                id: String(unit.unitId),
                title: unit.title || "Bài học",
                durationSeconds: Number(unit.durationSeconds || 0),
                isPreview: Boolean(unit.isPublicPreview),
                status: "published",
                startTime: null,
                endTime: null,
              })),
          }))
          .filter((section) => section.lessons.length > 0);
        sections = [...sections, ...referencedSections]
          .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
      }
    }

    const lessons = sections.flatMap((section) => section.lessons);
    return res.json({
      success: true,
      data: {
        offeringId: profile.management_class_id || `profile-${profile.profile_id || profile.id}`,
        profileId: String(profile.profile_id || profile.id),
        mode,
        course: {
          id: String(course.id),
          title: course.title,
          slug: course.slug,
          description: course.description || "",
          category: course.category || "CSCA",
          level: course.level || "beginner",
          price: Number(course.price || 0),
          isFree: Boolean(course.is_free),
          thumbnailUrl: course.thumbnail_url || null,
          instructorName: instructor.display_name,
          instructorAvatarUrl: instructor.avatar_url || null,
        },
        sections,
        totalUnits: lessons.length,
        previewUnitsCount: lessons.filter((lesson) => lesson.isPreview).length,
        totalDurationSeconds: lessons.reduce((sum, lesson) => sum + lesson.durationSeconds, 0),
      },
    });
  } catch (error) {
    console.error("Video course overview error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Exact CTA access check, sharing the same entitlement, Live/Record membership
// and revocation rules as the workspace without consuming a trusted-device slot.
router.get("/:offeringId/access", protectRoute, async (req, res) => {
  try {
    const context = await resolveVideoCourseContext(req.params.offeringId);
    if (!context?.course) return notFound(res, "Không tìm thấy khóa học");
    if (!context.profile) return notFound(res, "Khóa học này chưa được cấu hình khóa video");

    const { course, profile, mode, sourceLiveClassId } = context;
    const activeProfileId = Number(profile.profile_id || profile.id);
    if (req.user.role !== "user") {
      return res.json({ success: true, data: { canLearn: true, accessType: "STAFF", reasonCode: null } });
    }

    const hasActiveLmsAccount = await resolveEffectiveStudentLmsAccess({ user: req.user, db: { query } });
    const hasEntitlement = hasActiveLmsAccount && await checkCourseEntitlement(course.id, req.user.id, {
      sourceLiveClassId,
      profileId: activeProfileId,
    });
    let member = null;
    if (hasEntitlement) {
      member = await checkRecordMembership({
        userId: req.user.id,
        liveClassId: mode === "MIRROR" ? sourceLiveClassId : null,
        courseId: course.id,
        managementClassId: profile.management_class_id || null,
        mode,
        profileId: activeProfileId,
      });
    }
    const revoked = Boolean(member) && await isVideoCourseProfileAccessRevoked({
      db: { query },
      userId: req.user.id,
      profileId: activeProfileId,
    });
    const canLearn = Boolean(hasActiveLmsAccount && hasEntitlement && member && !revoked);
    const isLiveMembership = canLearn && mode === "MIRROR"
      && String(member.live_class_id || "") === String(sourceLiveClassId || "")
      && member.learning_mode !== "recording";
    const reasonCode = canLearn
      ? null
      : !hasActiveLmsAccount
        ? "LMS_ACCESS_INACTIVE"
        : !hasEntitlement
          ? "ENTITLEMENT_INACTIVE"
          : revoked
            ? "VIDEO_COURSE_ACCESS_REVOKED"
            : "RECORD_MEMBERSHIP_REQUIRED";

    return res.json({
      success: true,
      data: {
        canLearn,
        accessType: canLearn ? (isLiveMembership ? "LIVE" : "RECORD") : null,
        reasonCode,
      },
    });
  } catch (error) {
    console.error("Video course access check error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// GET /api/video-courses/:offeringId/workspace - Unified Workspace contract
router.get("/:offeringId/workspace", protectRoute, async (req, res) => {
  try {
    const { offeringId } = req.params;
    let { unitId } = req.query;

    const directOffering = await resolveProfileOffering(offeringId);
    const resolved = directOffering || await resolveOffering(offeringId);
    if (!resolved) return notFound(res, "Không tìm thấy khóa học");
    let { course, liveClass: resolvedLiveClass } = resolved;
    if (!course) return notFound(res, "Không tìm thấy khóa học");

    let courseId = Number(course.id);
    const isLearner = req.user.role === "user";

    // Load video course profile if any
    const profileRows = directOffering
      ? [directOffering.profile]
      : await findActiveProfilesForResolvedOffering({
        courseId,
        sourceLiveClassId: resolvedLiveClass?.id || null,
      });
    let profile = profileRows[0] || null;
    if (!directOffering && profileRows.length > 1 && isLearner) {
      const membershipProfile = await query(
        `SELECT vcp.*
         FROM video_course_profiles vcp
         LEFT JOIN management_class_learning_aliases alias
           ON LOWER(alias.alias_class_source_id) = LOWER(vcp.management_class_id)
         LEFT JOIN class_enrollments ce_profile
           ON ce_profile.video_course_profile_id = vcp.id AND ce_profile.user_id = $2 AND ce_profile.status = 'active'
         LEFT JOIN class_enrollments ce
           ON ce.management_class_alias_id = alias.id AND ce.user_id = $2 AND ce.status = 'active' AND ce.learning_mode = 'recording'
         LEFT JOIN class_enrollments ce_live
           ON ce_live.live_class_id = vcp.source_live_class_id AND ce_live.user_id = $2 AND ce_live.status = 'active'
         WHERE vcp.status = 'active'
           AND vcp.deleted_at IS NULL
           AND (
             vcp.course_id = $1
             OR ($3::bigint IS NOT NULL AND vcp.mode = 'MIRROR' AND vcp.source_live_class_id = $3)
           )
           AND (ce_profile.id IS NOT NULL OR ce.id IS NOT NULL OR (vcp.mode = 'MIRROR' AND ce_live.id IS NOT NULL))
         ORDER BY (ce_profile.id IS NOT NULL) DESC, (ce.id IS NOT NULL) DESC, vcp.id ASC LIMIT 1`,
        [courseId, req.user.id, resolvedLiveClass?.id || null],
      );
      profile = membershipProfile.rows[0] || profile;
    }
    if (!profile) return notFound(res, "Khóa học này chưa được cấu hình khóa video");
    course = await hydrateCourseForProfile(course, profile);
    courseId = Number(course.id);
    const activeProfileId = Number(profile.profile_id || profile.id);

    // Determine mode
    let mode = profile ? profile.mode : "MIRROR";
    let sourceLiveClassId = profile?.source_live_class_id || resolvedLiveClass?.id || null;

    // If no source live class is set in profile, find the latest active/completed live class for this course
    if (mode === "MIRROR" && !sourceLiveClassId) {
      const liveRes = await query(
        `SELECT lc.id FROM live_classes lc
         WHERE lc.course_id = $1 AND lc.status IN ('active', 'completed')
         ORDER BY (lc.status = 'active') DESC, lc.id DESC LIMIT 1`,
        [courseId],
      );
      if (liveRes.rows.length > 0) {
        sourceLiveClassId = liveRes.rows[0].id;
      } else {
        // No live class exists: treat as INDEPENDENT
        mode = "INDEPENDENT";
      }
    }

    // Full learners keep the normal entitlement + Record membership flow. Other
    // signed-in users may enter only units explicitly opened by an admin as previews.
    let memberAlias = null;
    let hasFullLearnerAccess = !isLearner;
    let isPublicPreviewAccess = false;
    let learnerAccessErrorCode = "VIDEO_COURSE_ACCESS_REQUIRED";
    if (isLearner) {
      const hasActiveLmsAccount = await resolveEffectiveStudentLmsAccess({ user: req.user, db: { query } });
      const hasEntitlement = hasActiveLmsAccount
        && await checkCourseEntitlement(courseId, req.user.id, {
          sourceLiveClassId,
          profileId: activeProfileId,
        });
      hasFullLearnerAccess = hasActiveLmsAccount && hasEntitlement;
      learnerAccessErrorCode = !hasActiveLmsAccount
        ? "LMS_ACCESS_INACTIVE"
        : (hasEntitlement ? "RECORD_MEMBERSHIP_REQUIRED" : "ENTITLEMENT_INACTIVE");
    }
    if (isLearner && hasFullLearnerAccess && mode === "MIRROR" && sourceLiveClassId) {
      memberAlias = await checkRecordMembership({
        userId: req.user.id,
        liveClassId: sourceLiveClassId,
        courseId,
        managementClassId: profile.management_class_id || null,
        mode,
        profileId: activeProfileId,
      });
      hasFullLearnerAccess = Boolean(memberAlias);
      if (!hasFullLearnerAccess) learnerAccessErrorCode = "RECORD_MEMBERSHIP_REQUIRED";
    } else if (isLearner && hasFullLearnerAccess && mode === "INDEPENDENT") {
      memberAlias = await checkRecordMembership({
        userId: req.user.id,
        courseId,
        managementClassId: profile.management_class_id || null,
        mode,
        profileId: activeProfileId,
      });
      hasFullLearnerAccess = Boolean(memberAlias);
      if (!hasFullLearnerAccess) learnerAccessErrorCode = "RECORD_MEMBERSHIP_REQUIRED";
    }

    if (isLearner && hasFullLearnerAccess && await isVideoCourseProfileAccessRevoked({
      db: { query },
      userId: req.user.id,
      profileId: activeProfileId,
    })) {
      hasFullLearnerAccess = false;
      learnerAccessErrorCode = "VIDEO_COURSE_ACCESS_REVOKED";
    }

    if (isLearner && hasFullLearnerAccess) {
      await authorizeRecordDevice({
        userId: req.user.id,
        trustedDeviceId: req.authSession?.trustedDeviceId,
        deviceLimit: Number(profile.device_limit || 2),
        enforce: profile.enforce_trusted_devices !== false,
      });
    }

    if (isLearner && !hasFullLearnerAccess) {
      const previewRes = mode === "MIRROR" && sourceLiveClassId
        ? await query(
          `SELECT cs.id
           FROM class_sessions cs
           WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
             AND cs.is_public_preview = TRUE
             AND ($2::bigint IS NULL OR cs.id = $2)
           ORDER BY cs.start_time ASC, cs.id ASC LIMIT 1`,
          [sourceLiveClassId, parsePositiveId(unitId)],
        )
        : await query(
          `SELECT l.id
           FROM lessons l
           WHERE l.course_id = $1 AND l.is_published = TRUE
             AND l.is_public_preview = TRUE
             AND ($2::bigint IS NULL OR l.id = $2)
           ORDER BY l.sort_order ASC, l.id ASC LIMIT 1`,
          [courseId, parsePositiveId(unitId)],
        );
      const previewUnit = previewRes.rows[0] || null;
      if (!previewUnit) {
        return forbidden(res, ACCESS_HELP_MESSAGE, learnerAccessErrorCode);
      }
      unitId = String(previewUnit.id);
      isPublicPreviewAccess = true;
    }

    const canReviewFreely = isLearner && hasFullLearnerAccess && !isPublicPreviewAccess
      && await hasLiveReviewMembership({ query }, {
        ...profile, id: activeProfileId, mode, source_live_class_id: sourceLiveClassId,
      }, req.user.id);

    let units = [];
    let activeUnitData = null;

    const lockedUnitPayload = ({ id, type, title, sessionNumber, sectionTitle = null, meta }) => ({
      id: String(id),
      type,
      title,
      sessionNumber,
      sectionTitle,
      isLocked: true,
      lockReason: meta?.lockReason || ACCESS_HELP_MESSAGE,
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
    });

    const applySequentialLocks = (rawUnits) => {
      if (isPublicPreviewAccess) {
        return rawUnits.map((current) => ({
          ...current,
          isLocked: !current.isPublicPreview,
          lockReason: current.isPublicPreview ? null : ACCESS_HELP_MESSAGE,
          requiredPrevUnitId: null,
          requiredPrevUnitTitle: null,
          requiredPrevUnitNumber: null,
        }));
      }
      if (!isLearner || canReviewFreely) {
        return rawUnits.map((current) => ({
          ...current,
          isLocked: false,
          lockReason: null,
          requiredPrevUnitId: null,
          requiredPrevUnitTitle: null,
          requiredPrevUnitNumber: null,
        }));
      }
      const result = [];
      for (let idx = 0; idx < rawUnits.length; idx += 1) {
        const current = rawUnits[idx];
        if (idx === 0) {
          result.push({
            ...current,
            isLocked: false,
            lockReason: null,
            requiredPrevUnitId: null,
            requiredPrevUnitTitle: null,
            requiredPrevUnitNumber: null,
          });
          continue;
        }

        const prev = result[idx - 1];
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

        result.push({
          ...current,
          isLocked,
          lockReason,
          requiredPrevUnitId: isLocked ? prev.id : null,
          requiredPrevUnitTitle: isLocked ? prev.title : null,
          requiredPrevUnitNumber: isLocked ? (prev.sessionNumber || idx) : null,
        });
      }
      return result;
    };

    if (mode === "MIRROR" && sourceLiveClassId) {
      // MIRROR: Units are the class_sessions of the source live class
      const sessionsRes = await query(
        `SELECT cs.id, cs.live_class_id, cs.is_public_preview,
                ROW_NUMBER() OVER (ORDER BY cs.start_time ASC, cs.id ASC)::int AS session_number,
                cs.title, cs.start_time, cs.end_time,
                cs.course_section_id, cs.lesson_id,
                csv.id AS session_video_id, csv.video_asset_id, csv.video_type, csv.is_published AS video_is_published,
                va.provider, va.provider_library_id, va.provider_video_id,
                va.playback_status, va.duration_seconds AS video_duration,
                COALESCE((
                  SELECT SUM(va2.duration_seconds)::int
                  FROM class_session_videos csv2
                  JOIN video_assets va2 ON va2.id = csv2.video_asset_id AND va2.deleted_at IS NULL
                  WHERE csv2.class_session_id = cs.id
                    AND ($3::boolean = true OR csv2.is_published = true)
                ), va.duration_seconds, 0)::int AS total_video_duration_seconds,
                va.thumbnail_url AS video_thumbnail, va.available_resolutions, va.processing_error,
                vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent,
                vwp.is_completed,
                (
                  SELECT COUNT(*)::int
                  FROM quizzes q
                  WHERE q.class_session_id = cs.id
                    AND q.status = 'PUBLISHED'
                ) AS quiz_count,
                (
                  SELECT COUNT(*)::int
                  FROM quizzes q
                  WHERE q.class_session_id = cs.id
                    AND q.status = 'PUBLISHED'
                    AND EXISTS (
                      SELECT 1
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $4 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    )
                ) AS completed_quiz_count
         FROM class_sessions cs
         LEFT JOIN LATERAL (
           SELECT * FROM class_session_videos csv_inner
           WHERE csv_inner.class_session_id = cs.id
             AND ($3::boolean = true OR csv_inner.is_published = true)
           ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order ASC, csv_inner.id ASC
           LIMIT 1
         ) csv ON true
         LEFT JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
         LEFT JOIN video_watch_progress vwp ON vwp.user_id = $2 AND vwp.video_asset_id = va.id
         WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [sourceLiveClassId, req.user.id, !isLearner, activeProfileId],
      );

      const rawUnits = await Promise.all(sessionsRes.rows.map(async (row) => {
        const aggregate = await getUnitVideoProgressAggregate({
          userId: req.user.id,
          classSessionId: row.id,
        });
        const videoDurationSeconds = Number(aggregate?.durationSeconds || row.total_video_duration_seconds || row.video_duration || 0);
        const watchedSeconds = Number(aggregate?.watchedSeconds || 0);
        const progressPercent = Number(aggregate?.completionPercent || 0);
        const hasVideo = Number(aggregate?.partCount || 0) > 0 || Boolean(row.video_asset_id || row.provider_video_id);
        const quizCount = Number(row.quiz_count || 0);
        const completedQuizCount = Number(row.completed_quiz_count || 0);
        const isVideoCompleted = Boolean(aggregate?.isCompleted);
        const isQuizCompleted = quizCount === 0 || completedQuizCount >= quizCount;
        const isCompleted = isVideoCompleted && isQuizCompleted;

        return {
          id: String(row.id),
          type: "class_session",
          sessionNumber: row.session_number,
          title: row.title || `Buổi ${row.session_number}`,
          description: row.description || "",
          startTime: row.start_time,
          videoDurationSeconds,
          watchedSeconds,
          durationMinutes: videoDurationSeconds > 0 ? Math.max(1, Math.round(videoDurationSeconds / 60)) : 0,
          hasVideo,
          videoStatus: row.playback_status || (row.video_asset_id ? "ready" : "none"),
          isPublished: Boolean(row.video_is_published),
          isPublicPreview: Boolean(row.is_public_preview),
          progressPercent,
          isVideoCompleted,
          quizCount,
          completedQuizCount,
          isQuizCompleted,
          isCompleted,
          lastPositionSeconds: Number(row.last_position_seconds || 0),
        };
      }));

      units = applySequentialLocks(rawUnits);

      // Find active unit: match unitId or first unit
      const selectedSession = (unitId && sessionsRes.rows.find((r) => String(r.id) === String(unitId)))
        || sessionsRes.rows[0]
        || null;

      if (selectedSession) {
        const sessId = selectedSession.id;
        const selectedUnitMeta = units.find((u) => String(u.id) === String(sessId)) || null;
        if (selectedUnitMeta?.isLocked && isLearner) {
          activeUnitData = lockedUnitPayload({
            id: selectedSession.id,
            type: "class_session",
            title: selectedSession.title || `Buổi ${selectedSession.session_number}`,
            sessionNumber: selectedSession.session_number,
            meta: selectedUnitMeta,
          });
        } else {
        // Fetch unit details: all videos, theory, files, assignments, quizzes, vocabulary, formulas, notes
        const [videosRes, theoryRes, filesRes, assignRes, quizRes, vocabRes, formulaRes, notesRes, unitBookmarks, unitQaThreads] = await Promise.all([
          query(
            `SELECT csv.id AS placement_id, csv.title AS part_title, csv.video_type, csv.sort_order, csv.is_published,
                    va.id AS asset_id, va.title AS asset_title, va.provider, va.provider_library_id, va.provider_video_id,
                    va.playback_status, va.duration_seconds, va.thumbnail_url, va.available_resolutions, va.processing_error,
                    vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
             FROM class_session_videos csv
             JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
             LEFT JOIN video_watch_progress vwp ON vwp.user_id = $2 AND vwp.video_asset_id = va.id
             WHERE csv.class_session_id = $1 AND ($3::boolean = true OR csv.is_published = true)
             ORDER BY (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
            [sessId, req.user.id, !isLearner],
          ),
          query(
            `SELECT id, title, content_html, summary, key_takeaways, transcript, timestamps_json
             FROM learning_unit_theory
             WHERE class_session_id = $1`,
            [sessId],
          ),
          query(
            `SELECT DISTINCT ON (session_files.id)
                    session_files.id, session_files.file_name, session_files.file_size_bytes,
                    session_files.mime_type, session_files.storage_key,
                    session_files.allow_file_download
             FROM (
               SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes,
                      lf.mime_type, lf.storage_key,
                      COALESCE(lc.allow_file_download, TRUE) AS allow_file_download,
                      0 AS source_priority
               FROM lms_learning_files lf
               JOIN class_sessions cs ON cs.id = lf.class_session_id
               JOIN live_classes lc ON lc.id = cs.live_class_id
               WHERE lf.class_session_id = $1 AND lf.status = 'ready' AND lf.deleted_at IS NULL

               UNION ALL

               SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes,
                      lf.mime_type, lf.storage_key,
                      COALESCE(lc.allow_file_download, TRUE) AS allow_file_download,
                      1 AS source_priority
               FROM lms_learning_file_placements lfp
               JOIN lms_learning_files lf ON lf.id = lfp.file_id
               JOIN class_sessions cs ON cs.id = lfp.class_session_id
               JOIN live_classes lc ON lc.id = cs.live_class_id
               WHERE lfp.class_session_id = $1 AND lf.status = 'ready' AND lf.deleted_at IS NULL AND lfp.deleted_at IS NULL
             ) session_files
             ORDER BY session_files.id, session_files.source_priority DESC`,
            [sessId],
          ),
          query(
            `SELECT a.id, a.title, a.description, a.max_score, a.due_date,
                    (SELECT s.id FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 LIMIT 1) AS submission_id,
                    (SELECT sg.score FROM assignment_submissions s JOIN submission_grades sg ON sg.submission_id = s.id WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 ORDER BY sg.id DESC LIMIT 1) AS score
             FROM assignments a
             WHERE a.course_id = $1 OR a.live_class_id = $3`,
            [courseId, req.user.id, sourceLiveClassId, activeProfileId],
          ),
          query(
            `SELECT q.id, q.title, q.duration_minutes, q.passing_score,
                    (
                      SELECT COUNT(*)::int
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    ) AS attempts_count,
                    (
                      SELECT MAX(qa.score)
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    ) AS best_score,
                    (
                      SELECT MAX(qa.max_score)
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    ) AS max_score
             FROM quizzes q
             WHERE q.class_session_id = $1
               AND q.status = 'PUBLISHED'
             ORDER BY q.id ASC`,
            [sessId, req.user.id, activeProfileId],
          ),
          query(
            `SELECT sv.id, sv.term, sv.pinyin, sv.sino_vietnamese, sv.meaning,
                    sv.part_of_speech, sv.example_sentence, sv.example_meaning, sv.audio_url
             FROM session_vocabularies sv
             WHERE sv.session_id = $1
             ORDER BY sv.order_index ASC, sv.id ASC`,
            [sessId],
          ),
          query(
            `SELECT sf.id, sf.subject, sf.chapter_name, sf.name_vi, sf.name_zh,
                    sf.pinyin, sf.latex_expression, sf.description, sf.variables_explanation
             FROM session_formulas sf
             WHERE sf.session_id = $1
             ORDER BY sf.order_index ASC, sf.id ASC`,
            [sessId],
          ),
          query(
            `SELECT id, timestamp_seconds, content, revision, created_at, updated_at
             FROM video_course_unit_notes
             WHERE user_id = $1 AND class_session_id = $2 AND deleted_at IS NULL
             ORDER BY timestamp_seconds ASC, id ASC`,
            [req.user.id, sessId],
          ),
          isPublicPreviewAccess
            ? Promise.resolve([])
            : listUnitBookmarksForAuthorizedUnit({ db: { query }, userId: req.user.id, classSessionId: sessId }),
          isPublicPreviewAccess
            ? Promise.resolve([])
            : listUnitQaThreadsForAuthorizedUnit({ db: { query }, viewerUserId: req.user.id, classSessionId: sessId }),
        ]);

        const unitVideos = videosRes.rows.map((v, idx) => ({
          id: String(v.asset_id),
          assetId: String(v.asset_id),
          placementId: String(v.placement_id),
          partNumber: idx + 1,
          title: v.part_title || v.asset_title || `Phần ${idx + 1}`,
          videoType: v.video_type,
          isPublished: Boolean(v.is_published),
          provider: v.provider || "bunny_stream",
          libraryId: v.provider_library_id,
          videoId: v.provider_video_id,
          playbackStatus: v.playback_status || "ready",
          durationSeconds: Number(v.duration_seconds || 0),
          thumbnailUrl: v.thumbnail_url,
          availableResolutions: v.available_resolutions
            ? String(v.available_resolutions).split(",").map((s) => s.trim()).filter(Boolean)
            : ["360p", "480p", "720p", "1080p"],
          processingError: v.processing_error || null,
          watchProgress: {
            lastPositionSeconds: Number(v.last_position_seconds || 0),
            watchedSeconds: Number(v.watched_seconds || 0),
            completionPercent: Number(v.completion_percent || 0),
            isCompleted: Boolean(v.is_completed),
          },
        }));

        const primaryVideo = unitVideos[0] || (selectedSession.video_asset_id ? {
          id: String(selectedSession.video_asset_id),
          assetId: String(selectedSession.video_asset_id),
          provider: selectedSession.provider || "bunny_stream",
          libraryId: selectedSession.provider_library_id,
          videoId: selectedSession.provider_video_id,
          playbackStatus: selectedSession.playback_status || "ready",
          isPublished: Boolean(selectedSession.video_is_published),
          durationSeconds: Number(selectedSession.video_duration || 0),
          thumbnailUrl: selectedSession.video_thumbnail,
          processingError: selectedSession.processing_error || null,
        } : null);

        activeUnitData = {
          id: String(selectedSession.id),
          type: "class_session",
          title: selectedSession.title || `Buổi ${selectedSession.session_number}`,
          description: selectedSession.description || "",
          sessionNumber: selectedSession.session_number,
          isLocked: Boolean(selectedUnitMeta?.isLocked),
          lockReason: selectedUnitMeta?.lockReason || null,
          requiredPrevUnitId: selectedUnitMeta?.requiredPrevUnitId || null,
          requiredPrevUnitTitle: selectedUnitMeta?.requiredPrevUnitTitle || null,
          requiredPrevUnitNumber: selectedUnitMeta?.requiredPrevUnitNumber || null,
          video: primaryVideo,
          videos: unitVideos,
          watchProgress: {
            lastPositionSeconds: Number(selectedSession.last_position_seconds || 0),
            watchedSeconds: Number(selectedUnitMeta?.watchedSeconds || 0),
            durationSeconds: Number(selectedUnitMeta?.videoDurationSeconds || 0),
            partCount: unitVideos.length,
            completionPercent: Number(selectedUnitMeta?.progressPercent || 0),
            isCompleted: Boolean(selectedUnitMeta?.isCompleted),
            isVideoCompleted: Boolean(selectedUnitMeta?.isVideoCompleted),
            isQuizCompleted: Boolean(selectedUnitMeta?.isQuizCompleted),
          },
          theory: theoryRes.rows[0] ? {
            title: theoryRes.rows[0].title,
            contentHtml: theoryRes.rows[0].content_html,
            summary: theoryRes.rows[0].summary,
            keyTakeaways: theoryRes.rows[0].key_takeaways || [],
            transcript: theoryRes.rows[0].transcript,
            timestamps: theoryRes.rows[0].timestamps_json || [],
          } : null,
          files: filesRes.rows.map((f) => ({
            id: String(f.id),
            fileName: f.file_name,
            sizeBytes: Number(f.file_size_bytes || 0),
            mimeType: f.mime_type,
            viewUrl: `/api/files/${f.id}/download?classId=${encodeURIComponent(sourceLiveClassId)}&videoCourseId=${encodeURIComponent(courseId)}&videoCourseProfileId=${encodeURIComponent(activeProfileId)}`,
            downloadUrl: isPublicPreviewAccess || profile.allow_file_download !== true || f.allow_file_download === false
              ? null
              : `/api/files/${f.id}/download?classId=${encodeURIComponent(sourceLiveClassId)}&videoCourseId=${encodeURIComponent(courseId)}&videoCourseProfileId=${encodeURIComponent(activeProfileId)}&download=1`,
          })),
          assignments: assignRes.rows.map((a) => ({
            id: String(a.id),
            title: a.title,
            description: a.description,
            maxScore: Number(a.max_score || 10),
            dueDate: null,
            isSubmitted: Boolean(a.submission_id),
            score: a.score !== null ? Number(a.score) : null,
          })),
          quizzes: quizRes.rows.map((q) => ({
            id: String(q.id),
            title: q.title,
            durationMinutes: q.duration_minutes,
            passingScore: Number(q.passing_score || 60),
            attemptsCount: Number(q.attempts_count || 0),
            isCompleted: Number(q.attempts_count || 0) > 0,
            bestScore: q.best_score !== null && q.best_score !== undefined ? Number(q.best_score) : null,
            maxScore: q.max_score !== null && q.max_score !== undefined ? Number(q.max_score) : null,
            ...(!isLearner || canReviewFreely ? { attemptLimit: null, canViewSolution: true } : {}),
          })),
          vocabulary: vocabRes.rows.map((v) => ({
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
          formulas: formulaRes.rows.map((fm) => ({
            id: String(fm.id),
            subject: fm.subject,
            chapterName: fm.chapter_name,
            nameVi: fm.name_vi,
            nameZh: fm.name_zh,
            pinyin: fm.pinyin,
            latexExpression: fm.latex_expression,
            description: fm.description,
            variablesExplanation: fm.variables_explanation || [],
          })),
          notes: notesRes.rows.map((n) => ({
            id: String(n.id),
            timestampSeconds: Number(n.timestamp_seconds || 0),
            content: n.content,
            revision: Number(n.revision || 1),
            createdAt: n.created_at,
            updatedAt: n.updated_at || n.created_at,
          })),
          bookmarks: unitBookmarks,
          qaThreads: unitQaThreads,
        };
        }
      }
    } else {
      const curriculumReference = (
        await query(
          `SELECT id, source_live_class_id
           FROM recording_curriculum_references
           WHERE video_course_profile_id = $1
           LIMIT 1`,
          [activeProfileId],
        )
      ).rows[0] || null;

      if (curriculumReference) {
        const profileRow = {
          profile_id: activeProfileId,
          course_id: courseId,
          mode: "INDEPENDENT",
          source_live_class_id: curriculumReference.source_live_class_id,
          allow_file_download: profile.allow_file_download === true,
        };
        const rawUnits = await loadProfileUnitsWithProgress(
          { query },
          { profileRow, userId: req.user.id },
        );
        units = applySequentialLocks(rawUnits);
        const selectedUnitMeta = (unitId
          ? units.find((current) => String(current.id) === String(unitId))
          : null) || units[0] || null;

        if (selectedUnitMeta?.isLocked && isLearner) {
          activeUnitData = lockedUnitPayload({
            id: selectedUnitMeta.id,
            type: "class_session",
            title: selectedUnitMeta.title,
            sessionNumber: selectedUnitMeta.sessionNumber,
            sectionTitle: selectedUnitMeta.sectionTitle,
            meta: selectedUnitMeta,
          });
        } else if (selectedUnitMeta) {
          activeUnitData = await loadUnlockedUnitDetail(
            { query },
            {
              profileRow,
              unitMeta: selectedUnitMeta,
              userId: req.user.id,
              isPublicPreviewAccess,
              allowFreeQuizReview: !isLearner || canReviewFreely,
            },
          );
          activeUnitData.files = (activeUnitData.files || []).map((file) => ({
            ...file,
            viewUrl: `/api/files/${file.id}/download?classId=${encodeURIComponent(curriculumReference.source_live_class_id)}&videoCourseId=${encodeURIComponent(courseId)}&videoCourseProfileId=${encodeURIComponent(activeProfileId)}`,
            downloadUrl: isPublicPreviewAccess || profile.allow_file_download !== true
              ? null
              : `/api/files/${file.id}/download?classId=${encodeURIComponent(curriculumReference.source_live_class_id)}&videoCourseId=${encodeURIComponent(courseId)}&videoCourseProfileId=${encodeURIComponent(activeProfileId)}&download=1`,
          }));
        }
      } else {
      // INDEPENDENT: Units are sections -> lessons
      const lessonsRes = await query(
        `SELECT l.id, l.section_id, l.title, l.description, l.duration_seconds,
                l.is_public_preview,
                l.sort_order, s.title AS section_title, s.sort_order AS section_sort_order,
                COALESCE(csv.video_asset_id, l.video_asset_id) AS resolved_video_asset_id,
                COALESCE(csv.is_published, l.is_published) AS video_is_published,
                l.learning_url,
                va.provider, va.provider_library_id, va.provider_video_id,
                va.playback_status,
                COALESCE(va.duration_seconds, l.duration_seconds, 0)::int AS resolved_duration_seconds,
                va.thumbnail_url AS video_thumbnail,
                va.available_resolutions, va.processing_error,
                vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent,
                vwp.is_completed,
                (
                  SELECT COUNT(*)::int
                  FROM quizzes q
                  WHERE q.lesson_id = l.id
                    AND q.status = 'PUBLISHED'
                ) AS quiz_count,
                (
                  SELECT COUNT(*)::int
                  FROM quizzes q
                  WHERE q.lesson_id = l.id
                    AND q.status = 'PUBLISHED'
                    AND EXISTS (
                      SELECT 1
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $4 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    )
                ) AS completed_quiz_count
         FROM lessons l
         LEFT JOIN sections s ON s.id = l.section_id
         LEFT JOIN LATERAL (
           SELECT * FROM class_session_videos csv_inner
           WHERE csv_inner.lesson_id = l.id
             AND ($3::boolean = true OR csv_inner.is_published = true)
           ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order ASC, csv_inner.id ASC
           LIMIT 1
         ) csv ON true
         LEFT JOIN video_assets va ON va.id = COALESCE(csv.video_asset_id, l.video_asset_id) AND va.deleted_at IS NULL
         LEFT JOIN video_watch_progress vwp ON vwp.user_id = $2 AND (vwp.video_asset_id = va.id OR vwp.lesson_id = l.id)
         WHERE l.course_id = $1 AND l.is_published = true
         ORDER BY COALESCE(s.sort_order, 0) ASC, l.sort_order ASC, l.id ASC`,
        [courseId, req.user.id, !isLearner, activeProfileId],
      );

      const rawUnits = await Promise.all(lessonsRes.rows.map(async (row, idx) => {
        const aggregate = await getUnitVideoProgressAggregate({
          userId: req.user.id,
          lessonId: row.id,
        });
        const videoDurationSeconds = Number(aggregate?.durationSeconds || row.resolved_duration_seconds || row.duration_seconds || 0);
        const watchedSeconds = Number(aggregate?.watchedSeconds || 0);
        const progressPercent = Number(aggregate?.completionPercent || 0);
        const hasVideo = Number(aggregate?.partCount || 0) > 0 || Boolean(row.resolved_video_asset_id || row.learning_url);
        const quizCount = Number(row.quiz_count || 0);
        const completedQuizCount = Number(row.completed_quiz_count || 0);
        const isVideoCompleted = Boolean(aggregate?.isCompleted);
        const isQuizCompleted = quizCount === 0 || completedQuizCount >= quizCount;
        const isCompleted = isVideoCompleted && isQuizCompleted;

        return {
          id: String(row.id),
          type: "lesson",
          sessionNumber: idx + 1,
          sectionId: row.section_id ? String(row.section_id) : null,
          sectionTitle: row.section_title || "Chương 1",
          title: row.title,
          description: row.description || "",
          videoDurationSeconds,
          watchedSeconds,
          durationMinutes: videoDurationSeconds > 0 ? Math.max(1, Math.round(videoDurationSeconds / 60)) : 0,
          hasVideo,
          videoStatus: row.playback_status || (row.resolved_video_asset_id ? "ready" : "none"),
          isPublished: Boolean(row.video_is_published),
          isPublicPreview: Boolean(row.is_public_preview),
          progressPercent,
          isVideoCompleted,
          quizCount,
          completedQuizCount,
          isQuizCompleted,
          isCompleted,
          lastPositionSeconds: Number(row.last_position_seconds || 0),
        };
      }));

      units = applySequentialLocks(rawUnits);

      const selectedLesson = (unitId && lessonsRes.rows.find((r) => String(r.id) === String(unitId)))
        || lessonsRes.rows[0]
        || null;

      if (selectedLesson) {
        const lId = selectedLesson.id;
        const selectedUnitMeta = units.find((u) => String(u.id) === String(lId)) || null;
        if (selectedUnitMeta?.isLocked && isLearner) {
          activeUnitData = lockedUnitPayload({
            id: selectedLesson.id,
            type: "lesson",
            title: selectedLesson.title,
            sessionNumber: selectedUnitMeta?.sessionNumber || 1,
            sectionTitle: selectedLesson.section_title || "Chương 1",
            meta: selectedUnitMeta,
          });
        } else {
        const [videosRes, theoryRes, filesRes, assignRes, quizRes, vocabRes, formulaRes, notesRes, unitBookmarks, unitQaThreads] = await Promise.all([
          query(
            `SELECT csv.id AS placement_id, csv.title AS part_title, csv.video_type, csv.sort_order, csv.is_published,
                    va.id AS asset_id, va.title AS asset_title, va.provider, va.provider_library_id, va.provider_video_id,
                    va.playback_status, va.duration_seconds, va.thumbnail_url, va.available_resolutions, va.processing_error,
                    vwp.last_position_seconds, vwp.watched_seconds, vwp.completion_percent, vwp.is_completed
             FROM class_session_videos csv
             JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
             LEFT JOIN video_watch_progress vwp ON vwp.user_id = $2 AND vwp.video_asset_id = va.id
             WHERE csv.lesson_id = $1 AND ($3::boolean = true OR csv.is_published = true)
             ORDER BY (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
            [lId, req.user.id, !isLearner],
          ),
          query(
            `SELECT id, title, content_html, summary, key_takeaways, transcript, timestamps_json
             FROM learning_unit_theory
             WHERE lesson_id = $1`,
            [lId],
          ),
          query(
            `SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes, lf.mime_type, lf.storage_key
             FROM lesson_learning_file_placements llfp
             JOIN lms_learning_files lf ON lf.id = llfp.file_id
             WHERE llfp.lesson_id = $1 AND lf.status = 'ready' AND lf.deleted_at IS NULL`,
            [lId],
          ),
          query(
            `SELECT a.id, a.title, a.description, a.max_score, a.due_date,
                    (SELECT s.id FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 LIMIT 1) AS submission_id,
                    (SELECT sg.score FROM assignment_submissions s JOIN submission_grades sg ON sg.submission_id = s.id WHERE s.assignment_id = a.id AND s.user_id = $2 AND s.video_course_profile_id = $4 ORDER BY sg.id DESC LIMIT 1) AS score
             FROM assignments a
             WHERE a.lesson_id = $1 OR (a.course_id = $3 AND a.lesson_id IS NULL AND a.live_class_id IS NULL)`,
            [lId, req.user.id, courseId, activeProfileId],
          ),
          query(
            `SELECT q.id, q.title, q.duration_minutes, q.passing_score,
                    (
                      SELECT COUNT(*)::int
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    ) AS attempts_count,
                    (
                      SELECT MAX(qa.score)
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    ) AS best_score,
                    (
                      SELECT MAX(qa.max_score)
                      FROM quiz_attempts qa
                      WHERE qa.quiz_id = q.id
                        AND qa.user_id = $2
                        AND (qa.video_course_profile_id = $3 OR qa.video_course_profile_id IS NULL)
                        AND (qa.status IN ('SUBMITTED', 'GRADED', 'COMPLETED', 'submitted', 'graded', 'completed') OR qa.submitted_at IS NOT NULL)
                    ) AS max_score
             FROM quizzes q
             WHERE q.lesson_id = $1 AND q.status = 'PUBLISHED'
             ORDER BY q.id ASC`,
            [lId, req.user.id, activeProfileId],
          ),
          query(
            `SELECT sv.id, sv.term, sv.pinyin, sv.sino_vietnamese, sv.meaning,
                    sv.part_of_speech, sv.example_sentence, sv.example_meaning, sv.audio_url
             FROM session_vocabularies sv
             WHERE sv.lesson_id = $1
             ORDER BY sv.order_index ASC, sv.id ASC`,
            [lId],
          ),
          query(
            `SELECT sf.id, sf.subject, sf.chapter_name, sf.name_vi, sf.name_zh,
                    sf.pinyin, sf.latex_expression, sf.description, sf.variables_explanation
             FROM session_formulas sf
             WHERE sf.lesson_id = $1
             ORDER BY sf.order_index ASC, sf.id ASC`,
            [lId],
          ),
          query(
            `SELECT id, timestamp_seconds, content, revision, created_at, updated_at
             FROM video_course_unit_notes
             WHERE user_id = $1 AND lesson_id = $2 AND deleted_at IS NULL
             ORDER BY timestamp_seconds ASC, id ASC`,
            [req.user.id, lId],
          ),
          isPublicPreviewAccess
            ? Promise.resolve([])
            : listUnitBookmarksForAuthorizedUnit({ db: { query }, userId: req.user.id, lessonId: lId }),
          isPublicPreviewAccess
            ? Promise.resolve([])
            : listUnitQaThreadsForAuthorizedUnit({ db: { query }, viewerUserId: req.user.id, lessonId: lId }),
        ]);

        const unitVideos = videosRes.rows.map((v, idx) => ({
          id: String(v.asset_id),
          assetId: String(v.asset_id),
          placementId: String(v.placement_id),
          partNumber: idx + 1,
          title: v.part_title || v.asset_title || `Phần ${idx + 1}`,
          videoType: v.video_type,
          isPublished: Boolean(v.is_published),
          provider: v.provider || "bunny_stream",
          libraryId: v.provider_library_id,
          videoId: v.provider_video_id,
          playbackStatus: v.playback_status || "ready",
          durationSeconds: Number(v.duration_seconds || 0),
          thumbnailUrl: v.thumbnail_url,
          availableResolutions: v.available_resolutions
            ? String(v.available_resolutions).split(",").map((s) => s.trim()).filter(Boolean)
            : ["360p", "480p", "720p", "1080p"],
          processingError: v.processing_error || null,
          watchProgress: {
            lastPositionSeconds: Number(v.last_position_seconds || 0),
            watchedSeconds: Number(v.watched_seconds || 0),
            completionPercent: Number(v.completion_percent || 0),
            isCompleted: Boolean(v.is_completed),
          },
        }));

        const primaryVideo = unitVideos[0] || (selectedLesson.resolved_video_asset_id ? {
          id: String(selectedLesson.resolved_video_asset_id),
          assetId: String(selectedLesson.resolved_video_asset_id),
          provider: selectedLesson.provider || "bunny_stream",
          libraryId: selectedLesson.provider_library_id,
          videoId: selectedLesson.provider_video_id,
          playbackStatus: selectedLesson.playback_status || "ready",
          isPublished: Boolean(selectedLesson.video_is_published),
          durationSeconds: Number(selectedLesson.resolved_duration_seconds || selectedLesson.duration_seconds || 0),
          thumbnailUrl: selectedLesson.video_thumbnail,
          processingError: selectedLesson.processing_error || null,
        } : null);

        activeUnitData = {
          id: String(selectedLesson.id),
          type: "lesson",
          sectionTitle: selectedLesson.section_title || "Chương 1",
          title: selectedLesson.title,
          description: selectedLesson.description || "",
          sessionNumber: selectedUnitMeta?.sessionNumber || 1,
          isLocked: Boolean(selectedUnitMeta?.isLocked),
          lockReason: selectedUnitMeta?.lockReason || null,
          requiredPrevUnitId: selectedUnitMeta?.requiredPrevUnitId || null,
          requiredPrevUnitTitle: selectedUnitMeta?.requiredPrevUnitTitle || null,
          requiredPrevUnitNumber: selectedUnitMeta?.requiredPrevUnitNumber || null,
          video: primaryVideo,
          videos: unitVideos.length > 0 ? unitVideos : (primaryVideo ? [primaryVideo] : []),
          learningUrl: selectedLesson.learning_url || null,
          watchProgress: {
            lastPositionSeconds: Number(selectedLesson.last_position_seconds || 0),
            watchedSeconds: Number(selectedUnitMeta?.watchedSeconds || 0),
            durationSeconds: Number(selectedUnitMeta?.videoDurationSeconds || 0),
            partCount: unitVideos.length || (primaryVideo ? 1 : 0),
            completionPercent: Number(selectedUnitMeta?.progressPercent || 0),
            isCompleted: Boolean(selectedUnitMeta?.isCompleted),
            isVideoCompleted: Boolean(selectedUnitMeta?.isVideoCompleted),
            isQuizCompleted: Boolean(selectedUnitMeta?.isQuizCompleted),
          },
          theory: theoryRes.rows[0] ? {
            title: theoryRes.rows[0].title,
            contentHtml: theoryRes.rows[0].content_html,
            summary: theoryRes.rows[0].summary,
            keyTakeaways: theoryRes.rows[0].key_takeaways || [],
            transcript: theoryRes.rows[0].transcript,
            timestamps: theoryRes.rows[0].timestamps_json || [],
          } : null,
          files: filesRes.rows.map((f) => ({
            id: String(f.id),
            fileName: f.file_name,
            sizeBytes: Number(f.file_size_bytes || 0),
            mimeType: f.mime_type,
            viewUrl: `/api/files/${f.id}/download?videoCourseId=${encodeURIComponent(courseId)}&videoCourseProfileId=${encodeURIComponent(activeProfileId)}`,
            downloadUrl: isPublicPreviewAccess || profile.allow_file_download !== true
              ? null
              : `/api/files/${f.id}/download?videoCourseId=${encodeURIComponent(courseId)}&videoCourseProfileId=${encodeURIComponent(activeProfileId)}&download=1`,
          })),
          assignments: assignRes.rows.map((a) => ({
            id: String(a.id),
            title: a.title,
            description: a.description,
            maxScore: Number(a.max_score || 10),
            dueDate: null,
            isSubmitted: Boolean(a.submission_id),
            score: a.score !== null ? Number(a.score) : null,
          })),
          quizzes: quizRes.rows.map((q) => ({
            id: String(q.id),
            title: q.title,
            durationMinutes: q.duration_minutes,
            passingScore: Number(q.passing_score || 60),
            attemptsCount: Number(q.attempts_count || 0),
            isCompleted: Number(q.attempts_count || 0) > 0,
            bestScore: q.best_score !== null && q.best_score !== undefined ? Number(q.best_score) : null,
            maxScore: q.max_score !== null && q.max_score !== undefined ? Number(q.max_score) : null,
            ...(!isLearner || canReviewFreely ? { attemptLimit: null, canViewSolution: true } : {}),
          })),
          vocabulary: vocabRes.rows.map((v) => ({
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
          formulas: formulaRes.rows.map((fm) => ({
            id: String(fm.id),
            subject: fm.subject,
            chapterName: fm.chapter_name,
            nameVi: fm.name_vi,
            nameZh: fm.name_zh,
            pinyin: fm.pinyin,
            latexExpression: fm.latex_expression,
            description: fm.description,
            variablesExplanation: fm.variables_explanation || [],
          })),
          notes: notesRes.rows.map((n) => ({
            id: String(n.id),
            timestampSeconds: Number(n.timestamp_seconds || 0),
            content: n.content,
            revision: Number(n.revision || 1),
            createdAt: n.created_at,
            updatedAt: n.updated_at || n.created_at,
          })),
          bookmarks: unitBookmarks,
          qaThreads: unitQaThreads,
        };
        }
      }
      }
    }

    // Source class info for MIRROR mode
    let sourceClassObj = null;
    if (sourceLiveClassId) {
      const srcRes = await query(
        `SELECT lc.id, lc.title, lc.status,
                COALESCE(NULLIF(lc.teacher_display_name, ''), u.username) AS instructor_name
         FROM live_classes lc
         LEFT JOIN users u ON u.id = lc.instructor_id
         WHERE lc.id = $1`,
        [sourceLiveClassId],
      );
      if (srcRes.rows[0]) {
        sourceClassObj = {
          id: String(srcRes.rows[0].id),
          title: memberAlias?.alias_title || srcRes.rows[0].title,
          status: srcRes.rows[0].status,
          instructorName: srcRes.rows[0].instructor_name,
        };
      }
    }

    const completedUnitsCount = units.filter((u) => u.isCompleted).length;
    const totalUnitsCount = units.length || 1;
    const overallProgressPercent = totalUnitsCount > 0
      ? Math.round(units.reduce((sum, unit) => sum + Math.min(100, Math.max(0, Number(unit.progressPercent || 0))), 0) / totalUnitsCount)
      : 0;

    return res.json({
      success: true,
      data: {
        videoCourseProfileId: String(activeProfileId),
        mode: mode === "MIRROR" ? "RECORD_MIRROR" : "RECORD_INDEPENDENT",
        course: {
          id: String(course.id),
          title: course.title,
          slug: course.slug,
          category: course.category,
          level: course.level,
          thumbnailUrl: course.thumbnail_url,
          instructorName: course.instructor_name,
        },
        sourceClass: sourceClassObj,
        progress: {
          completedUnits: completedUnitsCount,
          totalUnits: units.length,
          overallPercent: overallProgressPercent,
        },
        units,
        activeUnit: activeUnitData,
        capabilities: {
          canPlayVideo: true,
          canJoinLive: false,
          canCheckIn: false,
          showCalendar: false,
          canSubmitAssignments: true,
          allowFileDownload: !isPublicPreviewAccess && profile.allow_file_download === true,
          isPublicPreviewAccess,
          isAdminPreview: !isLearner,
          canReviewFreely,
        },
      },
    });
  } catch (error) {
    if (error instanceof TrustedDeviceAuthError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        errorCode: error.errorCode,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    console.error("Video course workspace error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// GET /api/video-courses/:offeringId/units/:unitId - Get specific unit detail
router.get("/:offeringId/units/:unitId", protectRoute, async (req, res) => {
  req.query.unitId = req.params.unitId;
  const workspaceRoute = router.stack.find((l) => l.route?.path === "/:offeringId/workspace");
  if (workspaceRoute) {
    return workspaceRoute.route.stack[workspaceRoute.route.stack.length - 1].handle(req, res);
  }
  return notFound(res, "Không tìm thấy nội dung bài học");
});

const sendNativeNotesQaError = (res, error, fallbackMessage) => {
  if (error instanceof ExternalIntegrationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorCode: error.errorCode,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, message: fallbackMessage, errorCode: "INTERNAL_ERROR" });
};

const assertNativeActorCourseAccess = async ({
  user,
  courseId,
  courseAuthorId = null,
  profileId = null,
  sourceLiveClassId = null,
}) => {
  if (user.role === "admin") return;
  if (user.role === "creator") {
    if (courseAuthorId && String(courseAuthorId) === String(user.id)) return;
    if (sourceLiveClassId) {
      const staffRes = await query(
        `SELECT 1 FROM live_classes lc
         LEFT JOIN live_class_teachers lct ON lct.live_class_id = lc.id AND lct.user_id = $2
         WHERE lc.id = $1 AND (lc.instructor_id = $2 OR lct.user_id IS NOT NULL)
         LIMIT 1`,
        [sourceLiveClassId, user.id],
      );
      if (staffRes.rows[0]) return;
    }
    throw new ExternalIntegrationError(403, "FORBIDDEN", "Bạn không có quyền truy cập nội dung giảng dạy của khóa học này.");
  }
  if (user.role !== "user") {
    throw new ExternalIntegrationError(403, "FORBIDDEN", "Bạn không có quyền truy cập khóa học này.");
  }

  const hasActiveLms = await resolveEffectiveStudentLmsAccess({ user, db: { query } });
  const hasEntitlement = hasActiveLms
    && await checkCourseEntitlement(courseId, user.id, {
      sourceLiveClassId: sourceLiveClassId || null,
      profileId: profileId || null,
    });
  if (!hasEntitlement) {
    throw new ExternalIntegrationError(403, "VIDEO_COURSE_ACCESS_REQUIRED", ACCESS_HELP_MESSAGE);
  }
  if (profileId && await isVideoCourseProfileAccessRevoked({ db: { query }, userId: user.id, profileId })) {
    throw new ExternalIntegrationError(403, "VIDEO_COURSE_ACCESS_REVOKED", "Quyền truy cập khóa học đã bị thu hồi.");
  }
};

const resolveNativeAuthorizedUnit = async ({ req, offeringId, unitId, requestedUnitType = null }) => {
  const directOffering = await resolveProfileOffering(offeringId);
  const resolved = directOffering || await resolveOffering(offeringId);
  let course = resolved?.course || null;
  if (!course) {
    throw new ExternalIntegrationError(404, "NOT_FOUND", "Không tìm thấy khóa học");
  }

  let profile = directOffering?.profile || null;
  if (!profile) {
    const profileRows = await findActiveProfilesForResolvedOffering({
      courseId: course.id,
      sourceLiveClassId: resolved?.liveClass?.id || null,
    });
    profile = profileRows[0] || null;
  }
  course = await hydrateCourseForProfile(course, profile);
  const activeProfileId = profile ? Number(profile.profile_id || profile.id) : null;
  const sourceLiveClassId = resolved?.liveClass?.id || profile?.source_live_class_id || null;

  const parsedUnitId = parsePositiveId(unitId);
  if (!parsedUnitId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "unitId không hợp lệ");
  }

  let resolvedType = requestedUnitType;
  let resolvedLiveClassId = sourceLiveClassId;
  if (!resolvedType || resolvedType === "lesson") {
    const lRes = await query("SELECT id FROM lessons WHERE id = $1 AND course_id = $2 LIMIT 1", [parsedUnitId, course.id]);
    if (lRes.rows[0]) {
      resolvedType = "lesson";
    } else if (requestedUnitType === "lesson") {
      throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", "Không tìm thấy bài học trong khóa học này");
    }
  }
  if (resolvedType !== "lesson") {
    const csRes = await query(
      `SELECT cs.id, cs.live_class_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1 AND (lc.course_id = $2 OR ($3::bigint IS NOT NULL AND lc.id = $3))
       LIMIT 1`,
      [parsedUnitId, course.id, sourceLiveClassId],
    );
    if (csRes.rows[0]) {
      resolvedType = "class_session";
      resolvedLiveClassId = resolvedLiveClassId || csRes.rows[0].live_class_id;
    } else {
      throw new ExternalIntegrationError(404, "UNIT_NOT_FOUND", "Không tìm thấy buổi học trong khóa học này");
    }
  }

  await assertNativeActorCourseAccess({
    user: req.user,
    courseId: course.id,
    courseAuthorId: course.author_id,
    profileId: activeProfileId,
    sourceLiveClassId: resolvedLiveClassId,
  });

  return {
    course,
    profileId: activeProfileId,
    unitId: parsedUnitId,
    unitType: resolvedType,
    classSessionId: resolvedType === "class_session" ? parsedUnitId : null,
    lessonId: resolvedType === "lesson" ? parsedUnitId : null,
  };
};

const assertNativeThreadAccess = async ({ req, threadId }) => {
  const parsedThreadId = parsePositiveId(threadId);
  if (!parsedThreadId) {
    throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "threadId không hợp lệ");
  }
  const res = await query(
    `SELECT t.*, c.author_id AS course_author_id, cs.live_class_id
     FROM learning_unit_qa_threads t
     JOIN courses c ON c.id = t.course_id
     LEFT JOIN class_sessions cs ON cs.id = t.class_session_id
     WHERE t.id = $1 AND t.deleted_at IS NULL
     LIMIT 1`,
    [parsedThreadId],
  );
  const thread = res.rows[0];
  if (!thread) {
    throw new ExternalIntegrationError(404, "QA_THREAD_NOT_FOUND", "Không tìm thấy chủ đề Q&A");
  }
  let profileId = thread.video_course_profile_id ? Number(thread.video_course_profile_id) : null;
  let sourceLiveClassId = thread.live_class_id ? Number(thread.live_class_id) : null;
  if (!profileId) {
    const pRes = await query(
      `SELECT id, source_live_class_id FROM video_course_profiles WHERE course_id = $1 AND status = 'active' ORDER BY id ASC LIMIT 1`,
      [thread.course_id],
    );
    if (pRes.rows[0]) {
      profileId = Number(pRes.rows[0].id);
      sourceLiveClassId = sourceLiveClassId || pRes.rows[0].source_live_class_id;
    }
  }
  await assertNativeActorCourseAccess({
    user: req.user,
    courseId: thread.course_id,
    courseAuthorId: thread.course_author_id,
    profileId,
    sourceLiveClassId,
  });
  return thread;
};

// POST /api/video-courses/:offeringId/units/:unitId/notes - Save learner timestamped note
router.post("/:offeringId/units/:unitId/notes", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId } = req.params;
    const { timestampSeconds = 0, content = "", unitType = null, idempotencyKey = null } = req.body || {};
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: unitType });
    const { note } = await createUnitNoteForAuthorizedUnit({
      db: { query, getClient },
      userId: req.user.id,
      courseId: ctx.course.id,
      profileId: ctx.profileId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      timestampSeconds,
      content,
      idempotencyKey: idempotencyKey || req.get("Idempotency-Key") || null,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.status(201).json({
      success: true,
      data: note,
      message: "Đã lưu ghi chú bài học",
    });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi lưu ghi chú");
  }
});

// PUT /api/video-courses/:offeringId/units/:unitId/notes/:noteId - Update learner timestamped note
router.put("/:offeringId/units/:unitId/notes/:noteId", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId, noteId } = req.params;
    const { timestampSeconds, content, expectedRevision, unitType = null } = req.body || {};
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: unitType });
    const { note } = await updateUnitNoteForAuthorizedUnit({
      db: { query, getClient },
      userId: req.user.id,
      noteId,
      profileId: ctx.profileId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      timestampSeconds,
      content,
      expectedRevision,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.json({
      success: true,
      data: note,
      message: "Đã cập nhật ghi chú bài học",
    });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi cập nhật ghi chú");
  }
});

// DELETE /api/video-courses/:offeringId/units/:unitId/notes/:noteId
router.delete("/:offeringId/units/:unitId/notes/:noteId", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId, noteId } = req.params;
    const unitType = req.query?.unitType || req.body?.unitType || null;
    const expectedRevision = req.query?.expectedRevision ?? req.body?.expectedRevision ?? null;
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: unitType });
    const result = await deleteUnitNoteForAuthorizedUnit({
      db: { query, getClient },
      userId: req.user.id,
      noteId,
      profileId: ctx.profileId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      expectedRevision,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.json({
      success: true,
      data: result,
      message: "Đã xóa ghi chú",
    });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi xóa ghi chú");
  }
});

// GET /api/video-courses/:offeringId/units/:unitId/bookmarks
router.get("/:offeringId/units/:unitId/bookmarks", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId } = req.params;
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: req.query?.unitType || null });
    const bookmarks = await listUnitBookmarksForAuthorizedUnit({
      db: { query },
      userId: req.user.id,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
    });
    return res.json({ success: true, data: bookmarks });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi tải bookmark");
  }
});

// POST /api/video-courses/:offeringId/units/:unitId/bookmarks
router.post("/:offeringId/units/:unitId/bookmarks", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId } = req.params;
    const { timestampSeconds = 0, label = "", videoAssetId = null, unitType = null, idempotencyKey = null } = req.body || {};
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: unitType });
    const { bookmark } = await createUnitBookmarkForAuthorizedUnit({
      db: { query, getClient },
      userId: req.user.id,
      courseId: ctx.course.id,
      profileId: ctx.profileId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      videoAssetId,
      timestampSeconds,
      label,
      idempotencyKey: idempotencyKey || req.get("Idempotency-Key") || null,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.status(201).json({ success: true, data: bookmark });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi lưu bookmark");
  }
});

// DELETE /api/video-courses/:offeringId/units/:unitId/bookmarks/:bookmarkId
router.delete("/:offeringId/units/:unitId/bookmarks/:bookmarkId", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId, bookmarkId } = req.params;
    const unitType = req.query?.unitType || req.body?.unitType || null;
    const expectedRevision = req.query?.expectedRevision ?? req.body?.expectedRevision ?? null;
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: unitType });
    const result = await deleteUnitBookmarkForAuthorizedUnit({
      db: { query, getClient },
      userId: req.user.id,
      bookmarkId,
      profileId: ctx.profileId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      expectedRevision,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi xóa bookmark");
  }
});

// GET /api/video-courses/:offeringId/units/:unitId/qa
router.get("/:offeringId/units/:unitId/qa", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId } = req.params;
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: req.query?.unitType || null });
    const threads = await listUnitQaThreadsForAuthorizedUnit({
      db: { query },
      viewerUserId: req.user.id,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
    });
    return res.json({ success: true, data: threads });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi tải thảo luận Q&A");
  }
});

// POST /api/video-courses/:offeringId/units/:unitId/qa
router.post("/:offeringId/units/:unitId/qa", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId } = req.params;
    const { title, body, question, content, attachments = [], unitType = null, idempotencyKey = null } = req.body || {};
    const ctx = await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: unitType });
    const { thread } = await createUnitQaThreadForAuthorizedUnit({
      db: { query, getClient },
      authorId: req.user.id,
      authorRole: req.user.role || "user",
      courseId: ctx.course.id,
      profileId: ctx.profileId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      title,
      body: body ?? question ?? content,
      attachments,
      idempotencyKey: idempotencyKey || req.get("Idempotency-Key") || null,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.status(201).json({ success: true, data: thread });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi tạo câu hỏi Q&A");
  }
});

// POST /api/video-courses/:offeringId/units/:unitId/qa/:threadId/replies & /qa/threads/:threadId/replies
router.post("/:offeringId/units/:unitId/qa/:threadId/replies", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId, threadId } = req.params;
    await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: req.body?.unitType || null });
    const { body, content, attachments = [], expectedRevision = null, idempotencyKey = null } = req.body || {};
    const result = await replyUnitQaThreadForAuthorizedActor({
      db: { query, getClient },
      threadId,
      actorUserId: req.user.id,
      actorRole: req.user.role || "user",
      body: body ?? content,
      attachments,
      expectedRevision,
      idempotencyKey: idempotencyKey || req.get("Idempotency-Key") || null,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi trả lời Q&A");
  }
});

router.post("/qa/threads/:threadId/replies", protectRoute, async (req, res) => {
  try {
    await assertNativeThreadAccess({ req, threadId: req.params.threadId });
    const { body, content, attachments = [], expectedRevision = null, idempotencyKey = null } = req.body || {};
    const result = await replyUnitQaThreadForAuthorizedActor({
      db: { query, getClient },
      threadId: req.params.threadId,
      actorUserId: req.user.id,
      actorRole: req.user.role || "user",
      body: body ?? content,
      attachments,
      expectedRevision,
      idempotencyKey: idempotencyKey || req.get("Idempotency-Key") || null,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi trả lời Q&A");
  }
});

// PATCH /api/video-courses/:offeringId/units/:unitId/qa/:threadId/status & /qa/threads/:threadId/status
router.patch("/:offeringId/units/:unitId/qa/:threadId/status", protectRoute, async (req, res) => {
  try {
    const { offeringId, unitId, threadId } = req.params;
    await resolveNativeAuthorizedUnit({ req, offeringId, unitId, requestedUnitType: req.body?.unitType || null });
    const { status, isPinned, markRead, expectedRevision = null } = req.body || {};
    const result = await updateUnitQaThreadStatusForAuthorizedActor({
      db: { query, getClient },
      threadId,
      actorUserId: req.user.id,
      actorRole: req.user.role || "user",
      status,
      isPinned,
      markRead,
      expectedRevision,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi cập nhật trạng thái Q&A");
  }
});

router.patch("/qa/threads/:threadId/status", protectRoute, async (req, res) => {
  try {
    await assertNativeThreadAccess({ req, threadId: req.params.threadId });
    const { status, isPinned, markRead, expectedRevision = null } = req.body || {};
    const result = await updateUnitQaThreadStatusForAuthorizedActor({
      db: { query, getClient },
      threadId: req.params.threadId,
      actorUserId: req.user.id,
      actorRole: req.user.role || "user",
      status,
      isPinned,
      markRead,
      expectedRevision,
      correlationId: req.get("X-Correlation-ID") || null,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendNativeNotesQaError(res, error, "Lỗi khi cập nhật trạng thái Q&A");
  }
});

// ============================================================================
// Admin Video Course Management & 5-Point Publish Checklist (Day 3 - Section 9)
// ============================================================================

const computeUnitVideoStatus = (videos = []) => {
  if (!videos || videos.length === 0) return "missing";
  const primary = videos.find((v) => v.videoType === "primary") || videos[0];
  if (primary.playbackStatus === "failed") return "failed";
  if (primary.playbackStatus === "uploading" || primary.playbackStatus === "created") return "uploading";
  if (primary.playbackStatus === "processing") return "processing";
  if (primary.playbackStatus === "ready" && primary.isPublished) return "published";
  if (primary.playbackStatus === "ready") return "ready";
  return primary.playbackStatus || "missing";
};

export const computeCoursePublishChecklist = async (courseId) => {
  const courseRes = await query(
    `SELECT c.id, c.name, COALESCE(c.title, c.name) AS title,
            COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
            c.is_published, c.is_management_managed, c.external_course_id,
            vcp.id AS profile_id, vcp.mode, vcp.source_live_class_id, vcp.management_class_id, vcp.status AS profile_status,
            lc.status AS source_class_status
     FROM courses c
     LEFT JOIN LATERAL (
       SELECT vcp_in.*
       FROM video_course_profiles vcp_in
       WHERE vcp_in.course_id = c.id
         AND vcp_in.status <> 'archived'
         AND vcp_in.deleted_at IS NULL
       ORDER BY (vcp_in.status = 'active') DESC, vcp_in.id ASC
       LIMIT 1
     ) vcp ON TRUE
     LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
     WHERE c.id = $1`,
    [courseId],
  );
  const course = courseRes.rows[0];
  if (!course) return null;

  const mode = course.mode || "MIRROR";
  let sourceLiveClassId = course.source_live_class_id || null;
  let sourceClassStatus = course.source_class_status || null;

  if (mode === "MIRROR" && !sourceLiveClassId) {
    const fallbackClass = await query(
      `SELECT id, course_id, status FROM live_classes
       WHERE course_id = $1 AND status IN ('active', 'completed')
       ORDER BY (status = 'active') DESC, id DESC LIMIT 1`,
      [courseId],
    );
    if (fallbackClass.rows[0]) {
      sourceLiveClassId = fallbackClass.rows[0].id;
      sourceClassStatus = fallbackClass.rows[0].status;
    }
  }

  let unitRows = [];
  if (mode === "MIRROR" && sourceLiveClassId) {
    const sessRes = await query(
      `SELECT cs.id AS unit_id, cs.title AS unit_title,
              va.id AS asset_id, va.playback_status, va.processing_error,
              COALESCE(va.thumbnail_url, va.provider_video_id) AS video_thumb,
              csv.is_published
       FROM class_sessions cs
       LEFT JOIN LATERAL (
         SELECT * FROM class_session_videos csv_inner
         WHERE csv_inner.class_session_id = cs.id
         ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order ASC, csv_inner.id ASC
         LIMIT 1
       ) csv ON true
       LEFT JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
       WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
       ORDER BY cs.start_time ASC, cs.id ASC`,
      [sourceLiveClassId],
    );
    unitRows = sessRes.rows;
  } else if (mode === "INDEPENDENT") {
    const lessRes = await query(
      `SELECT l.id AS unit_id, COALESCE(l.title, l.name) AS unit_title,
              va.id AS asset_id, va.playback_status, va.processing_error,
              COALESCE(va.thumbnail_url, l.video_thumbnail_url, va.provider_video_id) AS video_thumb,
              COALESCE(csv.is_published, l.is_published) AS is_published
       FROM lessons l
       LEFT JOIN LATERAL (
         SELECT * FROM class_session_videos csv_inner
         WHERE csv_inner.lesson_id = l.id
         ORDER BY (csv_inner.video_type = 'primary') DESC, csv_inner.sort_order ASC, csv_inner.id ASC
         LIMIT 1
       ) csv ON true
       LEFT JOIN video_assets va ON va.id = COALESCE(csv.video_asset_id, l.video_asset_id) AND va.deleted_at IS NULL
       WHERE l.course_id = $1
       ORDER BY l.sort_order ASC, l.id ASC`,
      [courseId],
    );
    unitRows = lessRes.rows;
    if (course.profile_id) {
      const refRes = await query(
        `SELECT cs.id AS unit_id, COALESCE(o.title_override, cs.title) AS unit_title,
                va.id AS asset_id, va.playback_status, va.processing_error,
                COALESCE(va.thumbnail_url, va.provider_video_id) AS video_thumb,
                rv.is_published
         FROM recording_curriculum_references r
         JOIN recording_curriculum_unit_overrides o ON o.curriculum_reference_id = r.id
         JOIN class_sessions cs ON cs.id = o.source_class_session_id AND cs.status <> 'cancelled'
         LEFT JOIN LATERAL (
           SELECT rv_in.* FROM recording_curriculum_unit_videos rv_in
           WHERE rv_in.unit_override_id = o.id
           ORDER BY (rv_in.video_type = 'primary') DESC, rv_in.sort_order, rv_in.id
           LIMIT 1
         ) rv ON TRUE
         LEFT JOIN video_assets va ON va.id = rv.video_asset_id AND va.deleted_at IS NULL
         WHERE r.video_course_profile_id = $1
           AND COALESCE(o.is_published_override, TRUE) = TRUE
         ORDER BY COALESCE(o.sort_order_override, 0), cs.start_time, cs.id`,
        [course.profile_id],
      );
      unitRows.push(...refRes.rows);
    }
  }

  const totalUnits = unitRows.length;
  const readyUnitsCount = unitRows.filter((u) => u.asset_id && u.playback_status === "ready" && !u.processing_error).length;
  const publishedUnitsCount = unitRows.filter((u) => u.asset_id && u.playback_status === "ready" && u.is_published).length;
  const missingUnitsCount = unitRows.filter((u) => !u.asset_id).length;
  const uploadingUnitsCount = unitRows.filter((u) => u.asset_id && (u.playback_status === "uploading" || u.playback_status === "created")).length;
  const processingUnitsCount = unitRows.filter((u) => u.asset_id && u.playback_status === "processing").length;
  const failedUnitsCount = unitRows.filter((u) => u.asset_id && u.playback_status === "failed").length;

  // 1. Có ít nhất một bài học
  const hasLessons = totalUnits > 0;

  // 2. Các video bắt buộc đã encode xong (ready)
  const allRequiredVideosReady = totalUnits > 0 && readyUnitsCount === totalUnits;

  // 3. Khóa học và video có thumbnail
  const hasCourseThumbnail = Boolean(course.thumbnail_url && String(course.thumbnail_url).trim());
  const allVideosHaveThumb = totalUnits > 0 && unitRows.every((u) => Boolean(u.video_thumb));
  const hasThumbnail = hasCourseThumbnail && allVideosHaveThumb;

  // 4. Mapping InternalManagement hợp lệ
  let hasValidManagementMapping = true;
  let mappingDetail = mode === "MIRROR"
    ? `Kế thừa lớp Live #${sourceLiveClassId || "chưa chọn"}`
    : "Khóa video độc lập (INDEPENDENT)";
  if (mode === "INDEPENDENT" && unitRows.some((unit) => String(unit.unit_id))) {
    const refCount = await query(
      `SELECT COUNT(*)::int AS count FROM recording_curriculum_references
       WHERE video_course_profile_id = $1`,
      [course.profile_id || null],
    ).catch(() => ({ rows: [{ count: 0 }] }));
    if (Number(refCount.rows[0]?.count || 0) > 0) {
      mappingDetail = "Khóa video độc lập, dùng chung học liệu phi-video và giữ video riêng";
    }
  }

  if (mode === "MIRROR") {
    if (
      !sourceLiveClassId
      || sourceClassStatus === "cancelled"
    ) {
      hasValidManagementMapping = false;
      mappingDetail = "Chưa chọn lớp Live nguồn hợp lệ";
    }
  } else if (mode === "INDEPENDENT") {
    if (course.source_live_class_id !== null && course.source_live_class_id !== undefined) {
      hasValidManagementMapping = false;
      mappingDetail = "Khóa INDEPENDENT không được gắn source_live_class_id";
    }
  }
  if (course.is_management_managed && !course.external_course_id) {
    hasValidManagementMapping = false;
    mappingDetail = "Thiếu external_course_id từ InternalManagement";
  }

  // 5. Entitlement sync không có job DEAD_LETTER/lỗi
  const syncErrRes = await query(
    `SELECT COUNT(*)::int AS dead_count
     FROM lms_sync_jobs
     WHERE status IN ('DEAD_LETTER', 'FAILED')
       AND event_type IN ('entitlement.changed', 'payment.refunded', 'class.membership.changed', 'class.upserted')`,
  );
  const deadLetterCount = Number(syncErrRes.rows[0]?.dead_count || 0);
  const entitlementSyncHealthy = deadLetterCount === 0;

  const isReadyToPublish = Boolean(
    hasLessons
    && allRequiredVideosReady
    && hasThumbnail
    && hasValidManagementMapping
    && entitlementSyncHealthy,
  );

  return {
    isReadyToPublish,
    checks: {
      hasLessons: {
        passed: hasLessons,
        label: "Có ít nhất một bài học",
        detail: hasLessons ? `Đã có ${totalUnits} bài học` : "Chưa có bài học nào",
      },
      allRequiredVideosReady: {
        passed: allRequiredVideosReady,
        label: "Các video bắt buộc đã encode xong (ready)",
        detail: `${readyUnitsCount}/${totalUnits} bài học có video Ready`,
      },
      hasThumbnail: {
        passed: hasThumbnail,
        label: "Khóa học và video có thumbnail",
        detail: !hasCourseThumbnail
          ? "Khóa học chưa có ảnh đại diện (thumbnail)"
          : allVideosHaveThumb
            ? "Khóa học và toàn bộ video đã có thumbnail"
            : "Một số bài học chưa có thumbnail video",
      },
      hasValidManagementMapping: {
        passed: hasValidManagementMapping,
        label: "Mapping InternalManagement hợp lệ",
        detail: mappingDetail,
      },
      entitlementSyncHealthy: {
        passed: entitlementSyncHealthy,
        label: "Entitlement sync không có job DEAD_LETTER/lỗi",
        detail: entitlementSyncHealthy
          ? "Hệ thống đồng bộ quyền học hoạt động bình thường (0 lỗi)"
          : `Có ${deadLetterCount} job đồng bộ đang lỗi (DEAD_LETTER/FAILED)`,
      },
    },
    stats: {
      totalUnits,
      readyUnitsCount,
      publishedUnitsCount,
      missingUnitsCount,
      uploadingUnitsCount,
      processingUnitsCount,
      failedUnitsCount,
    },
  };
};

// Admin: GET /api/video-courses/admin/courses - List video courses with active/draft profiles (excluding archived-only courses)
router.get("/admin/courses", protectRoute, requireAdmin, async (req, res) => {
  try {
    const coursesRes = await query(
      `SELECT c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug,
              c.description, c.category, c.level, c.price, c.is_free,
              c.is_published, c.is_management_managed, c.external_course_id,
              c.sync_revision, c.sync_deleted_at,
              COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
              u.username AS instructor_name,
              vcp.id AS profile_id, vcp.mode, vcp.source_live_class_id,
              vcp.management_class_id, vcp.device_limit, vcp.enforce_trusted_devices,
              vcp.allow_file_download,
              vcp.status AS profile_status,
              lc.title AS source_class_title, lc.status AS source_class_status
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       LEFT JOIN LATERAL (
         SELECT vcp_in.*
         FROM video_course_profiles vcp_in
         WHERE vcp_in.course_id = c.id
           AND vcp_in.status <> 'archived'
           AND vcp_in.deleted_at IS NULL
         ORDER BY (vcp_in.status = 'active') DESC, vcp_in.id ASC
         LIMIT 1
       ) vcp ON TRUE
       LEFT JOIN live_classes lc ON lc.id = vcp.source_live_class_id
       WHERE (
         vcp.id IS NOT NULL
         OR NOT EXISTS (
           SELECT 1 FROM video_course_profiles vcp_any
           WHERE vcp_any.course_id = c.id
         )
       )
       ORDER BY c.id ASC`,
    );

    const coursesWithChecklists = await Promise.all(
      coursesRes.rows.map(async (row) => {
        const checklist = await computeCoursePublishChecklist(row.id);
        return {
          id: String(row.id),
          name: row.name,
          title: row.title,
          slug: row.slug,
          description: row.description,
          category: row.category || "HSK",
          level: row.level || "beginner",
          price: Number(row.price || 0),
          isFree: Boolean(row.is_free),
          isPublished: Boolean(row.is_published),
          isManagementManaged: Boolean(row.is_management_managed),
          externalCourseId: row.external_course_id || null,
          thumbnailUrl: row.thumbnail_url || null,
          instructorName: row.instructor_name || "Moly Course",
          profile: {
            id: row.profile_id ? String(row.profile_id) : null,
            mode: row.mode || "MIRROR",
            sourceLiveClassId: row.source_live_class_id ? String(row.source_live_class_id) : null,
            sourceClassTitle: row.source_class_title || null,
            sourceClassStatus: row.source_class_status || null,
            managementClassId: row.management_class_id || null,
            deviceLimit: Number(row.device_limit || 2),
            enforceTrustedDevices: row.enforce_trusted_devices !== false,
            allowFileDownload: row.allow_file_download === true,
            status: row.profile_status || "active",
          },
          stats: checklist?.stats || {
            totalUnits: 0,
            readyUnitsCount: 0,
            publishedUnitsCount: 0,
            missingUnitsCount: 0,
            uploadingUnitsCount: 0,
            processingUnitsCount: 0,
            failedUnitsCount: 0,
          },
          publishChecklist: checklist,
        };
      }),
    );

    // Section 5.1: Accounts currently having > 2 active trusted devices are not auto-deleted;
    // admin receives a warning and selects which device to revoke.
    // Admin / creator accounts are exempt from the 2-device learner limit.
    const overLimitRes = await query(
      `SELECT u.id AS user_id, u.username, u.email,
              COUNT(d.id)::int AS active_device_count,
              json_agg(
                json_build_object(
                  'id', d.id::text,
                  'deviceLabel', d.device_name,
                  'ipAddress', COALESCE(d.last_ip::text, d.first_ip::text),
                  'lastSeenAt', d.last_seen_at
                ) ORDER BY d.last_seen_at DESC
              ) AS devices
       FROM trusted_login_devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.revoked_at IS NULL
         AND d.record_access_granted_at IS NOT NULL
         AND u.role::text NOT IN ('admin', 'creator')
       GROUP BY u.id, u.username, u.email
       HAVING COUNT(d.id) > 2
       ORDER BY COUNT(d.id) DESC, u.id ASC`,
    );

    return res.json({
      success: true,
      data: {
        courses: coursesWithChecklists,
        overLimitDeviceAccounts: overLimitRes.rows.map((r) => ({
          userId: String(r.user_id),
          username: r.username,
          email: r.email,
          activeDeviceCount: Number(r.active_device_count),
          devices: r.devices || [],
        })),
      },
    });
  } catch (error) {
    console.error("Admin list video courses error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: GET /api/video-courses/admin/courses/:courseId - Full admin detail for Mirror & Independent modes
router.get("/admin/courses/:courseId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");

    const courseRes = await query(
      `SELECT c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug,
              c.description, c.category, c.level, c.price, c.is_free,
              c.is_published, c.is_management_managed, c.external_course_id,
              COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
              u.username AS instructor_name,
              vcp.id AS profile_id, vcp.mode, vcp.source_live_class_id,
              vcp.management_class_id, vcp.device_limit, vcp.enforce_trusted_devices,
              vcp.allow_file_download, vcp.sync_revision AS profile_sync_revision,
              vcp.deleted_at AS profile_deleted_at,
              vcp.status AS profile_status
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       LEFT JOIN LATERAL (
         SELECT vcp_in.*
         FROM video_course_profiles vcp_in
         WHERE vcp_in.course_id = c.id
           AND vcp_in.status <> 'archived'
           AND vcp_in.deleted_at IS NULL
         ORDER BY (vcp_in.status = 'active') DESC, vcp_in.id ASC
         LIMIT 1
       ) vcp ON TRUE
       WHERE c.id = $1`,
      [courseId],
    );
    const course = courseRes.rows[0];
    if (!course) return notFound(res, "Không tìm thấy khóa học");

    const liveClassesRes = await query(
      `SELECT lc.id, lc.title, lc.status, lc.management_class_source_id,
              COALESCE(NULLIF(lc.teacher_display_name, ''), u.username) AS instructor_name,
              (SELECT COUNT(*)::int FROM class_sessions cs WHERE cs.live_class_id = lc.id AND cs.status <> 'cancelled') AS sessions_count
       FROM live_classes lc
       LEFT JOIN users u ON u.id = lc.instructor_id
       WHERE lc.course_id = $1 AND lc.status <> 'cancelled'
       ORDER BY (lc.status = 'active') DESC, lc.id DESC`,
      [courseId],
    );

    const aliasesRes = await query(
      `SELECT a.id, a.alias_class_source_id, a.source_class_source_id,
              a.live_class_id, a.course_id, a.recording_content_mode, a.title, a.status
       FROM management_class_learning_aliases a
       LEFT JOIN live_classes lc ON lc.id = a.live_class_id
       WHERE a.course_id = $1 OR lc.course_id = $1
       ORDER BY a.id DESC`,
      [courseId],
    );

    const mode = course.mode || "MIRROR";
    const activeSourceClassId = course.source_live_class_id
      || (liveClassesRes.rows[0]?.id ?? null);

    // Fetch Mirror sessions if a source live class exists
    let mirrorSessions = [];
    if (activeSourceClassId) {
      const sessRes = await query(
        `SELECT cs.id, cs.live_class_id, cs.is_public_preview,
                ROW_NUMBER() OVER (ORDER BY cs.start_time ASC, cs.id ASC)::int AS session_number,
                cs.title, cs.start_time, cs.end_time, cs.status,
                (SELECT COUNT(*)::int FROM learning_unit_theory lut WHERE lut.class_session_id = cs.id) AS theory_count,
                (SELECT COUNT(*)::int FROM lms_learning_file_placements lfp WHERE lfp.class_session_id = cs.id) AS files_count,
                (SELECT COUNT(*)::int FROM session_vocabularies sv WHERE sv.session_id = cs.id) AS vocab_count,
                (SELECT COUNT(*)::int FROM session_formulas sf WHERE sf.session_id = cs.id) AS formula_count,
                (SELECT COUNT(*)::int FROM assignments a WHERE a.class_session_id = cs.id) AS assign_count,
                (SELECT COUNT(*)::int FROM quizzes q WHERE q.class_session_id = cs.id) AS quiz_count
         FROM class_sessions cs
         WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [activeSourceClassId],
      );

      const sessVideosRes = await query(
        `SELECT csv.id AS placement_id, csv.class_session_id, csv.title AS part_title,
                csv.video_type, csv.sort_order, csv.is_published, csv.published_at,
                va.id AS asset_id, va.title AS asset_title, va.provider,
                va.provider_library_id, va.provider_video_id, va.playback_status,
                va.duration_seconds, va.thumbnail_url, va.available_resolutions, va.processing_error
         FROM class_session_videos csv
         JOIN class_sessions cs ON cs.id = csv.class_session_id
         JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
         WHERE cs.live_class_id = $1
         ORDER BY (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
        [activeSourceClassId],
      );

      const videosBySession = new Map();
      for (const v of sessVideosRes.rows) {
        const key = String(v.class_session_id);
        if (!videosBySession.has(key)) videosBySession.set(key, []);
        videosBySession.get(key).push({
          placementId: String(v.placement_id),
          assetId: String(v.asset_id),
          title: v.part_title || v.asset_title || "Video bài giảng",
          videoType: v.video_type,
          sortOrder: Number(v.sort_order || 0),
          isPublished: Boolean(v.is_published),
          publishedAt: v.published_at,
          provider: v.provider,
          libraryId: v.provider_library_id,
          videoId: v.provider_video_id,
          playbackStatus: v.playback_status || "ready",
          durationSeconds: Number(v.duration_seconds || 0),
          thumbnailUrl: v.thumbnail_url || null,
          availableResolutions: v.available_resolutions
            ? String(v.available_resolutions).split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          processingError: v.processing_error || null,
        });
      }

      mirrorSessions = sessRes.rows.map((s) => {
        const vids = videosBySession.get(String(s.id)) || [];
        return {
          id: String(s.id),
          sessionNumber: s.session_number,
          title: s.title || `Buổi ${s.session_number}`,
          startTime: s.start_time,
          endTime: s.end_time,
          status: s.status,
          isPublicPreview: Boolean(s.is_public_preview),
          videoStatus: computeUnitVideoStatus(vids),
          videos: vids,
          counts: {
            theory: Number(s.theory_count || 0),
            files: Number(s.files_count || 0),
            vocabulary: Number(s.vocab_count || 0),
            formulas: Number(s.formula_count || 0),
            assignments: Number(s.assign_count || 0),
            quizzes: Number(s.quiz_count || 0),
          },
        };
      });
    }

    // Fetch Independent sections & lessons
    const [sectionsRes, lessonsRes, lessonVideosRes] = await Promise.all([
      query(
        `SELECT id, course_id, title, sort_order
         FROM sections
         WHERE course_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [courseId],
      ),
      query(
        `SELECT l.id, l.course_id, l.section_id, COALESCE(l.title, l.name) AS title,
                l.description, l.duration_seconds, l.sort_order, l.is_published,
                l.is_public_preview,
                l.video_asset_id, l.learning_url,
                lut.title AS theory_title, lut.content_html AS theory_html,
                lut.summary AS theory_summary, lut.key_takeaways AS theory_takeaways,
                lut.transcript AS theory_transcript,
                (SELECT COUNT(*)::int FROM lesson_learning_file_placements llfp WHERE llfp.lesson_id = l.id) AS files_count,
                (SELECT COUNT(*)::int FROM session_vocabularies sv WHERE sv.lesson_id = l.id) AS vocab_count,
                (SELECT COUNT(*)::int FROM session_formulas sf WHERE sf.lesson_id = l.id) AS formula_count,
                (SELECT COUNT(*)::int FROM assignments a WHERE a.lesson_id = l.id) AS assign_count,
                (SELECT COUNT(*)::int FROM quizzes q WHERE q.lesson_id = l.id) AS quiz_count
         FROM lessons l
         LEFT JOIN learning_unit_theory lut ON lut.lesson_id = l.id
         WHERE l.course_id = $1
         ORDER BY l.sort_order ASC, l.id ASC`,
        [courseId],
      ),
      query(
        `SELECT csv.id AS placement_id, csv.lesson_id, csv.title AS part_title,
                csv.video_type, csv.sort_order, csv.is_published, csv.published_at,
                va.id AS asset_id, va.title AS asset_title, va.provider,
                va.provider_library_id, va.provider_video_id, va.playback_status,
                va.duration_seconds, va.thumbnail_url, va.available_resolutions, va.processing_error
         FROM class_session_videos csv
         JOIN lessons l ON l.id = csv.lesson_id
         JOIN video_assets va ON va.id = csv.video_asset_id AND va.deleted_at IS NULL
         WHERE l.course_id = $1
         ORDER BY (csv.video_type = 'primary') DESC, csv.sort_order ASC, csv.id ASC`,
        [courseId],
      ),
    ]);

    const videosByLesson = new Map();
    for (const v of lessonVideosRes.rows) {
      const key = String(v.lesson_id);
      if (!videosByLesson.has(key)) videosByLesson.set(key, []);
      videosByLesson.get(key).push({
        placementId: String(v.placement_id),
        assetId: String(v.asset_id),
        title: v.part_title || v.asset_title || "Video bài học",
        videoType: v.video_type,
        sortOrder: Number(v.sort_order || 0),
        isPublished: Boolean(v.is_published),
        publishedAt: v.published_at,
        provider: v.provider,
        libraryId: v.provider_library_id,
        videoId: v.provider_video_id,
        playbackStatus: v.playback_status || "ready",
        durationSeconds: Number(v.duration_seconds || 0),
        thumbnailUrl: v.thumbnail_url || null,
        availableResolutions: v.available_resolutions
          ? String(v.available_resolutions).split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        processingError: v.processing_error || null,
      });
    }

    const mappedLessons = lessonsRes.rows.map((l) => {
      const vids = videosByLesson.get(String(l.id)) || [];
      return {
        id: String(l.id),
        sectionId: l.section_id ? String(l.section_id) : null,
        title: l.title,
        description: l.description || "",
        durationSeconds: Number(l.duration_seconds || 0),
        sortOrder: Number(l.sort_order || 0),
        isPublished: Boolean(l.is_published),
        isPublicPreview: Boolean(l.is_public_preview),
        learningUrl: l.learning_url || null,
        videoStatus: computeUnitVideoStatus(vids),
        videos: vids,
        theory: l.theory_title || l.theory_html || l.theory_summary ? {
          title: l.theory_title || "",
          contentHtml: l.theory_html || "",
          summary: l.theory_summary || "",
          keyTakeaways: l.theory_takeaways || [],
          transcript: l.theory_transcript || "",
        } : null,
        counts: {
          theory: l.theory_html || l.theory_summary ? 1 : 0,
          files: Number(l.files_count || 0),
          vocabulary: Number(l.vocab_count || 0),
          formulas: Number(l.formula_count || 0),
          assignments: Number(l.assign_count || 0),
          quizzes: Number(l.quiz_count || 0),
        },
      };
    });

    const independentSections = sectionsRes.rows.map((sec) => ({
      id: String(sec.id),
      title: sec.title,
      sortOrder: Number(sec.sort_order || 0),
      lessons: mappedLessons.filter((l) => l.sectionId === String(sec.id)),
    }));

    const unsectionedLessons = mappedLessons.filter((l) => !l.sectionId);
    if (unsectionedLessons.length > 0) {
      independentSections.push({
        id: "unsectioned",
        title: "Bài học chưa phân chương",
        sortOrder: 9999,
        lessons: unsectionedLessons,
      });
    }

    const referenced = course.profile_id ? await loadReferencedRecordingCurriculum(
      { query },
      {
        course,
        profile: {
          id: course.profile_id,
          mode,
          status: course.profile_status,
          deleted_at: course.profile_deleted_at,
          sync_revision: course.profile_sync_revision,
          allow_file_download: course.allow_file_download,
        },
        includeTombstoned: true,
        includeUnpublishedVideos: true,
      },
    ) : { sections: [], units: [], reference: null };

    for (const sec of referenced.sections) {
      independentSections.push({
        id: String(sec.sectionId),
        title: sec.title,
        sortOrder: Number(sec.sortOrder || 0),
        isReferenced: true,
        lessons: referenced.units
          .filter((unit) => String(unit.sectionId) === String(sec.sectionId))
          .map((unit) => ({
            id: String(unit.unitId),
            unitType: "recording_reference",
            sourceClassSessionId: String(unit.sourceClassSessionId),
            curriculumReferenceId: String(unit.curriculumReferenceId),
            unitOverrideId: unit.unitOverrideId ? String(unit.unitOverrideId) : null,
            sectionId: String(unit.sectionId),
            title: unit.title,
            description: unit.summary || "",
            durationSeconds: Number(unit.durationSeconds || 0),
            sortOrder: Number(unit.sortOrder || 0),
            isPublished: Boolean(unit.isPublished),
            isPublicPreview: Boolean(unit.isPublicPreview),
            isReferenced: true,
            videoStatus: computeUnitVideoStatus(unit.videoParts || []),
            videos: (unit.videoParts || []).map((video) => ({
              placementId: String(video.placementId),
              assetId: String(video.assetId),
              title: video.title,
              videoType: video.videoType,
              sortOrder: Number(video.sortOrder || 0),
              isPublished: Boolean(video.isPublished),
              publishedAt: video.publishedAt || null,
              provider: video.provider,
              libraryId: video.libraryId,
              videoId: video.videoId,
              playbackStatus: video.playbackStatus,
              durationSeconds: Number(video.durationSeconds || 0),
              thumbnailUrl: video.thumbnailUrl || null,
              availableResolutions: video.availableResolutions || [],
              processingError: video.processingError || null,
            })),
            theory: unit.theory?.hasTheory ? unit.theory : null,
            counts: {
              theory: unit.theory?.hasTheory ? 1 : 0,
              files: Number(unit.counts?.files || 0),
              vocabulary: Number(unit.counts?.vocab || 0),
              formulas: Number(unit.counts?.formulas || 0),
              assignments: Number(unit.counts?.assignments || 0),
              quizzes: Number(unit.counts?.quizzes || 0),
            },
          })),
      });
    }

    const publishChecklist = await computeCoursePublishChecklist(courseId);

    return res.json({
      success: true,
      data: {
        course: {
          id: String(course.id),
          name: course.name,
          title: course.title,
          slug: course.slug,
          description: course.description || "",
          category: course.category || "HSK",
          level: course.level || "beginner",
          price: Number(course.price || 0),
          isFree: Boolean(course.is_free),
          isPublished: Boolean(course.is_published),
          isManagementManaged: Boolean(course.is_management_managed),
          externalCourseId: course.external_course_id || null,
          thumbnailUrl: course.thumbnail_url || null,
          instructorName: course.instructor_name || "Moly Course",
        },
        profile: {
          id: course.profile_id ? String(course.profile_id) : null,
          mode,
          sourceLiveClassId: activeSourceClassId ? String(activeSourceClassId) : null,
          managementClassId: course.management_class_id || null,
          deviceLimit: Number(course.device_limit || 2),
          enforceTrustedDevices: course.enforce_trusted_devices !== false,
          allowFileDownload: course.allow_file_download === true,
          status: course.profile_status || "active",
          hasCurriculumReference: Boolean(referenced.reference),
        },
        availableLiveClasses: liveClassesRes.rows.map((lc) => ({
          id: String(lc.id),
          title: lc.title,
          status: lc.status,
          managementClassSourceId: lc.management_class_source_id || null,
          instructorName: lc.instructor_name || "Giảng viên",
          sessionsCount: Number(lc.sessions_count || 0),
        })),
        managementAliases: aliasesRes.rows.map((a) => ({
          id: String(a.id),
          aliasClassSourceId: a.alias_class_source_id,
          sourceClassSourceId: a.source_class_source_id,
          liveClassId: a.live_class_id ? String(a.live_class_id) : null,
          courseId: a.course_id ? String(a.course_id) : null,
          recordingContentMode: a.recording_content_mode || "MIRROR",
          title: a.title,
          status: a.status,
        })),
        mirrorSessions,
        independentSections,
        publishChecklist,
      },
    });
  } catch (error) {
    console.error("Admin get video course detail error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

const resolveAdminCourseProfile = async (courseId, requestedProfileId = null) => {
  const profileId = requestedProfileId === null || requestedProfileId === undefined || requestedProfileId === ""
    ? null
    : parsePositiveId(requestedProfileId);
  if (requestedProfileId && !profileId) return null;
  const result = await query(
    `SELECT id, course_id, management_class_id, mode, source_live_class_id, status
     FROM video_course_profiles
     WHERE course_id = $1
       AND deleted_at IS NULL
       AND status <> 'archived'
       AND ($2::bigint IS NULL OR id = $2)
     ORDER BY (status = 'active') DESC, id ASC
     LIMIT 1`,
    [courseId, profileId],
  );
  return result.rows[0] || null;
};

// Admin: list learners whose current entitlement and membership grant access
// to this Record offering. A profile-specific revocation never mutates Live LMS.
router.get("/admin/courses/:courseId/students", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    const profile = await resolveAdminCourseProfile(courseId, req.query?.profileId);
    if (!profile) return notFound(res, "Không tìm thấy cấu hình khóa video");

    const studentsRes = await query(
      `WITH eligible AS (
         SELECT DISTINCT ON (u.id)
                u.id AS user_id, u.username, u.email, u.avatar_url,
                sp.full_name, ce.id AS membership_id, ce.learning_mode,
                ce.enrolled_at,
                CASE
                  WHEN ce.learning_mode = 'recording' THEN 'RECORD_MEMBERSHIP'
                  ELSE 'LIVE_MIRROR'
                END AS access_source
         FROM users u
         JOIN class_enrollments ce ON ce.user_id = u.id AND ce.status = 'active'
         LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
         LEFT JOIN management_class_learning_aliases alias
           ON alias.id = ce.management_class_alias_id AND alias.status = 'active'
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.role = 'user'
           AND (
             u.is_internal_test_account = TRUE
             OR (u.is_management_managed = TRUE AND u.lms_account_status = 'active')
             OR ${EXTERNAL_LMS_ACCESS_EXISTS_SQL("u.id")}
           )
           AND (
             ${EFFECTIVE_COURSE_GRANT_EXISTS_SQL("u.id", "$1")}
             OR (
               $3::text = 'MIRROR'
               AND $4::bigint IS NOT NULL
               AND ce.live_class_id = $4
               AND (
                 (lc.course_id IS NOT NULL AND ${EFFECTIVE_COURSE_GRANT_EXISTS_SQL("u.id", "lc.course_id")})
                 OR EXISTS (
                   SELECT 1
                   FROM external_entitlements ee_mir
                   JOIN external_identities ei_mir
                     ON (
                       ei_mir.id = ee_mir.external_identity_id
                       OR (
                         ee_mir.external_identity_id IS NULL
                         AND ei_mir.user_id = ee_mir.user_id
                         AND ei_mir.source_system = ee_mir.source_system
                         AND ei_mir.external_user_id = ee_mir.external_user_id
                       )
                     )
                   WHERE ee_mir.user_id = u.id
                     AND ee_mir.local_live_class_id = $4
                     AND ei_mir.status = 'active'
                     AND ee_mir.status = 'active'
                     AND ee_mir.valid_from <= NOW()
                     AND (ee_mir.valid_until IS NULL OR ee_mir.valid_until > NOW())
                 )
               )
             )
           )
           AND (
             (ce.video_course_profile_id IS NOT NULL AND ce.video_course_profile_id = $2)
             OR (
               ce.video_course_profile_id IS NULL AND (
                 ($3::text = 'MIRROR' AND ce.live_class_id = $4)
                 OR
                 ($3::text = 'INDEPENDENT' AND ce.learning_mode = 'recording' AND (
                   ($5::text IS NOT NULL AND LOWER(alias.alias_class_source_id) = LOWER($5))
                   OR
                   ($5::text IS NULL AND (ce.course_id = $1 OR lc.course_id = $1))
                 ))
               )
             )
           )
         ORDER BY u.id, (ce.learning_mode = 'recording') DESC, ce.enrolled_at DESC, ce.id DESC
       )
       SELECT eligible.*,
              revoked.revoked_at, revoked.reason AS revoke_reason,
              progress.last_access_at, progress.progress_percent,
              online.active_sessions, online.last_online_at
       FROM eligible
       LEFT JOIN video_course_access_revocations revoked
         ON revoked.video_course_profile_id = $2
        AND revoked.user_id = eligible.user_id
       LEFT JOIN LATERAL (
         SELECT MAX(vwp.updated_at) AS last_access_at,
                ROUND(AVG(vwp.completion_percent)::numeric, 2) AS progress_percent
         FROM video_watch_progress vwp
         WHERE vwp.user_id = eligible.user_id
           AND (
             vwp.course_id = $1
             OR (
               $3::text = 'MIRROR'
               AND $4::bigint IS NOT NULL
               AND vwp.class_session_id IN (
                 SELECT cs.id
                 FROM class_sessions cs
                 WHERE cs.live_class_id = $4 AND cs.status <> 'cancelled'
               )
             )
           )
       ) progress ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (
                  WHERE s.revoked_at IS NULL
                    AND s.expires_at > NOW()
                    AND s.last_seen_at >= NOW() - INTERVAL '10 minutes'
                )::int AS active_sessions,
                MAX(s.last_seen_at) AS last_online_at
         FROM user_sessions s
         WHERE s.user_id = eligible.user_id
       ) online ON TRUE
       ORDER BY (revoked.revoked_at IS NOT NULL), eligible.full_name NULLS LAST, eligible.username`,
      [courseId, profile.id, profile.mode, profile.source_live_class_id, profile.management_class_id],
    );

    const students = studentsRes.rows.map((row) => ({
      userId: String(row.user_id),
      username: row.username,
      email: row.email,
      fullName: row.full_name || row.username,
      avatarUrl: row.avatar_url || null,
      membershipId: String(row.membership_id),
      learningMode: row.learning_mode,
      accessSource: row.access_source,
      accessStatus: row.revoked_at ? "revoked" : "active",
      enrolledAt: row.enrolled_at || null,
      revokedAt: row.revoked_at || null,
      revokeReason: row.revoke_reason || null,
      lastAccessAt: row.last_access_at || null,
      progressPercent: Number(row.progress_percent || 0),
      activeSessions: Number(row.active_sessions || 0),
      lastOnlineAt: row.last_online_at || null,
      isOnline: Number(row.active_sessions || 0) > 0,
      canRevoke: !row.revoked_at,
    }));

    return res.json({
      success: true,
      data: {
        courseId: String(courseId),
        profileId: String(profile.id),
        total: students.length,
        activeCount: students.filter((student) => student.accessStatus === "active").length,
        revokedCount: students.filter((student) => student.accessStatus === "revoked").length,
        onlineCount: students.filter((student) => student.isOnline).length,
        students,
      },
    });
  } catch (error) {
    console.error("Admin list video course students error:", error);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách học viên", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: revoke only this video-course profile. Live class membership and the
// shared LMS entitlement intentionally remain active.
router.delete("/admin/courses/:courseId/students/:userId/access", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    const userId = parsePositiveId(req.params.userId);
    if (!courseId || !userId) return validationError(res, "courseId hoặc userId không hợp lệ");
    const profile = await resolveAdminCourseProfile(courseId, req.body?.profileId || req.query?.profileId);
    if (!profile) return notFound(res, "Không tìm thấy cấu hình khóa video");

    const learnerRes = await query(
      `SELECT id, username, email FROM users WHERE id = $1 AND role = 'user'`,
      [userId],
    );
    if (!learnerRes.rows[0]) return notFound(res, "Không tìm thấy học viên");

    const reason = typeof req.body?.reason === "string"
      ? req.body.reason.trim().slice(0, 500) || null
      : null;
    const revokedRes = await query(
      `INSERT INTO video_course_access_revocations
         (video_course_profile_id, user_id, reason, revoked_by, revoked_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (video_course_profile_id, user_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           revoked_by = EXCLUDED.revoked_by,
           revoked_at = NOW(),
           updated_at = NOW()
       RETURNING revoked_at`,
      [profile.id, userId, reason, req.user.id],
    );

    await recordAuditEvent({
      actorId: req.user.id,
      action: "video_course.access_revoked",
      entityType: "video_course_profile",
      entityId: profile.id,
      metadata: {
        courseId,
        profileId: profile.id,
        targetUserId: userId,
        reason,
        liveMembershipPreserved: true,
      },
    });

    return res.json({
      success: true,
      message: "Đã thu hồi quyền vào khóa video; quyền lớp Live vẫn được giữ nguyên",
      data: {
        courseId: String(courseId),
        profileId: String(profile.id),
        userId: String(userId),
        accessStatus: "revoked",
        revokedAt: revokedRes.rows[0].revoked_at,
      },
    });
  } catch (error) {
    console.error("Admin revoke video course student access error:", error);
    return res.status(500).json({ success: false, message: "Không thể thu hồi quyền học viên", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: open or close one learning unit as a public marketing preview.
router.put("/admin/units/:unitType/:unitId/public-preview", protectRoute, requireAdmin, async (req, res) => {
  try {
    const unitId = parsePositiveId(req.params.unitId);
    const unitType = String(req.params.unitType || "").trim().toLowerCase();
    const isPublicPreview = req.body?.isPublicPreview;
    if (!unitId || !["class_session", "lesson"].includes(unitType) || typeof isPublicPreview !== "boolean") {
      return validationError(res, "Thông tin buổi xem thử không hợp lệ");
    }

    const table = unitType === "class_session" ? "class_sessions" : "lessons";
    const updateRes = await query(
      `UPDATE ${table}
       SET is_public_preview = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, is_public_preview`,
      [isPublicPreview, unitId],
    );
    if (!updateRes.rows[0]) return notFound(res, "Không tìm thấy buổi học hoặc bài học");

    await safeRecordUnitContentMutation({
      unitType,
      unitId,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });

    return res.json({
      success: true,
      data: {
        id: String(updateRes.rows[0].id),
        unitType,
        isPublicPreview: Boolean(updateRes.rows[0].is_public_preview),
      },
      message: isPublicPreview
        ? "Đã mở buổi học thử cho mọi tài khoản"
        : "Đã tắt quyền xem thử công khai",
    });
  } catch (error) {
    console.error("Update public preview unit error:", error);
    return res.status(500).json({ success: false, message: "Không thể cập nhật buổi xem thử", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: POST /api/video-courses/admin/profiles - Setup or update video course profile
router.post("/admin/profiles", protectRoute, requireAdmin, async (req, res) => {
  try {
    const {
      courseId,
      mode = "MIRROR",
      sourceLiveClassId = null,
      managementClassId = null,
      deviceLimit = 2,
      enforceTrustedDevices = true,
      allowFileDownload = false,
      status = "active",
      thumbnailUrl = undefined,
    } = req.body || {};

    const parsedCourseId = parsePositiveId(courseId);
    if (!parsedCourseId) return validationError(res, "courseId không hợp lệ");
    if (!["MIRROR", "INDEPENDENT"].includes(mode)) return validationError(res, "mode phải là MIRROR hoặc INDEPENDENT");

    const parsedSourceId = parsePositiveId(sourceLiveClassId);
    if (mode === "MIRROR") {
      if (!parsedSourceId) {
        return validationError(res, "Chế độ MIRROR bắt buộc phải chọn lớp Live nguồn");
      }
      const srcCheck = await query(
        `SELECT id, course_id, status FROM live_classes WHERE id = $1`,
        [parsedSourceId],
      );
      if (!srcCheck.rows[0]) {
        return validationError(res, "Không tìm thấy lớp Live nguồn");
      }
      if (srcCheck.rows[0].status === "cancelled") {
        return validationError(res, "Không được chọn lớp Live nguồn đã hủy");
      }
    }

    const parsedLimit = Number(deviceLimit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 10) {
      return validationError(res, "deviceLimit phải là số từ 1 đến 10");
    }

    if (thumbnailUrl !== undefined && typeof thumbnailUrl === "string") {
      await query(
        `UPDATE courses SET thumbnail_url = $1::varchar, image_url = COALESCE(image_url, $1::text), updated_at = NOW() WHERE id = $2`,
        [thumbnailUrl.trim() || null, parsedCourseId],
      );
    }

    const normalizedManagementClassId = managementClassId ? String(managementClassId).trim() : null;
    const conflictClause = normalizedManagementClassId
      ? `ON CONFLICT (LOWER(management_class_id)) WHERE management_class_id IS NOT NULL`
      : `ON CONFLICT (course_id) WHERE management_class_id IS NULL`;
    const upsertRes = await query(
      `INSERT INTO video_course_profiles
         (course_id, mode, source_live_class_id, management_class_id, device_limit, enforce_trusted_devices, allow_file_download, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ${conflictClause}
       DO UPDATE SET
         course_id = EXCLUDED.course_id,
         mode = EXCLUDED.mode,
         source_live_class_id = EXCLUDED.source_live_class_id,
         management_class_id = EXCLUDED.management_class_id,
         device_limit = EXCLUDED.device_limit,
         enforce_trusted_devices = EXCLUDED.enforce_trusted_devices,
         allow_file_download = EXCLUDED.allow_file_download,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        parsedCourseId,
        mode,
        mode === "MIRROR" ? parsedSourceId : null,
        normalizedManagementClassId,
        parsedLimit,
        Boolean(enforceTrustedDevices),
        Boolean(allowFileDownload),
        status,
      ],
    );

    const profile = upsertRes.rows[0];
    await recordProfileCatalogMutation({
      profileId: profile.id,
      courseId: parsedCourseId,
      eventType: profile.status === "archived" ? "profile.tombstoned" : "profile.upserted",
      deleted: profile.status === "archived",
      correlationId: req.get?.("X-Correlation-ID") || null,
      bumpParentCourse: thumbnailUrl === undefined,
    });
    if (thumbnailUrl !== undefined) {
      await recordCourseCatalogMutation({
        courseId: parsedCourseId,
        eventType: "course.upserted",
        correlationId: req.get?.("X-Correlation-ID") || null,
      });
    }

    const publishChecklist = await computeCoursePublishChecklist(parsedCourseId);

    return res.json({
      success: true,
      data: {
        profile,
        publishChecklist,
      },
      message: "Cập nhật cấu hình khóa học video thành công",
    });
  } catch (error) {
    console.error("Upsert video course profile error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: POST /api/video-courses/admin/courses/:courseId/sections - Create chapter for Independent course
router.post("/admin/courses/:courseId/sections", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");

    const { title, sortOrder } = req.body || {};
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    if (!trimmedTitle) return validationError(res, "Tên chương không được để trống");

    let nextOrder = Number(sortOrder);
    if (!Number.isSafeInteger(nextOrder) || nextOrder < 0) {
      const maxRes = await query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM sections WHERE course_id = $1`, [courseId]);
      nextOrder = Number(maxRes.rows[0]?.next_order || 0);
    }

    const insertRes = await query(
      `INSERT INTO sections (course_id, title, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, course_id, title, sort_order`,
      [courseId, trimmedTitle, nextOrder],
    );

    const row = insertRes.rows[0];
    await safeRecordCurriculumMutation({
      courseId,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });
    return res.status(201).json({
      success: true,
      data: {
        id: String(row.id),
        courseId: String(row.course_id),
        title: row.title,
        sortOrder: Number(row.sort_order),
        lessons: [],
      },
      message: "Tạo chương học mới thành công",
    });
  } catch (error) {
    console.error("Create video course section error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: PUT /api/video-courses/admin/sections/:sectionId - Update chapter
router.put("/admin/sections/:sectionId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const sectionId = parsePositiveId(req.params.sectionId);
    if (!sectionId) return validationError(res, "sectionId không hợp lệ");

    const { title, sortOrder } = req.body || {};
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    if (!trimmedTitle) return validationError(res, "Tên chương không được để trống");

    const updateRes = await query(
      `UPDATE sections
       SET title = $1,
           sort_order = COALESCE($2, sort_order),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, course_id, title, sort_order`,
      [trimmedTitle, Number.isSafeInteger(Number(sortOrder)) ? Number(sortOrder) : null, sectionId],
    );
    if (!updateRes.rows[0]) return notFound(res, "Không tìm thấy chương học");

    await safeRecordCurriculumMutation({
      courseId: updateRes.rows[0].course_id,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });

    return res.json({
      success: true,
      data: updateRes.rows[0],
      message: "Cập nhật chương học thành công",
    });
  } catch (error) {
    console.error("Update section error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: DELETE /api/video-courses/admin/sections/:sectionId - Delete chapter
router.delete("/admin/sections/:sectionId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const sectionId = parsePositiveId(req.params.sectionId);
    if (!sectionId) return validationError(res, "sectionId không hợp lệ");

    const secRes = await query(`SELECT course_id FROM sections WHERE id = $1 LIMIT 1`, [sectionId]);
    await query(`DELETE FROM sections WHERE id = $1`, [sectionId]);
    if (secRes.rows[0]?.course_id) {
      await safeRecordCurriculumMutation({
        courseId: secRes.rows[0].course_id,
        correlationId: req.get?.("X-Correlation-ID") || null,
      });
    }
    return res.json({
      success: true,
      data: { id: String(sectionId), deleted: true },
      message: "Đã xóa chương học",
    });
  } catch (error) {
    console.error("Delete section error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: POST /api/video-courses/admin/courses/:courseId/lessons - Create lesson for Independent course
router.post("/admin/courses/:courseId/lessons", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");

    const body = req.body || {};
    const {
      sectionId = null,
      title,
      description = "",
      durationSeconds = 900,
      sortOrder,
    } = body;

    const normalizedTitle = normalizeRecordLessonTitle(title);
    if (!normalizedTitle) return validationError(res, "Tên bài học không được để trống");
    if (typeof title !== "string" || title.trim().length > 1000) {
      return validationError(res, "Tên bài học không hợp lệ hoặc quá dài");
    }

    const parsedDuration = Number(durationSeconds);
    if (!Number.isFinite(parsedDuration) || parsedDuration < 0 || parsedDuration > 86_400) {
      return validationError(res, "Thời lượng bài học phải từ 0 đến 86400 giây");
    }
    if (body.isPublished !== undefined && typeof body.isPublished !== "boolean") {
      return validationError(res, "Trạng thái hiển thị bài học không hợp lệ");
    }
    if (description !== undefined && typeof description !== "string") {
      return validationError(res, "Mô tả bài học phải là văn bản");
    }

    const parsedSectionId = sectionId ? parsePositiveId(sectionId) : null;
    if (sectionId && !parsedSectionId) return validationError(res, "sectionId không hợp lệ");
    if (parsedSectionId) {
      const sectionRes = await query(
        `SELECT id FROM sections WHERE id = $1 AND course_id = $2 LIMIT 1`,
        [parsedSectionId, courseId],
      );
      if (!sectionRes.rows[0]) return validationError(res, "Chương học không thuộc khóa đang chỉnh sửa");
    }

    let nextOrder = Number(sortOrder);
    if (!Number.isSafeInteger(nextOrder) || nextOrder < 0) {
      const maxRes = await query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM lessons WHERE course_id = $1`,
        [courseId],
      );
      nextOrder = Number(maxRes.rows[0]?.next_order || 0);
    }
    if (nextOrder > 100_000) return validationError(res, "Thứ tự bài học không hợp lệ");

    // Preserve the source Live session. Only its Record lesson copy is hidden.
    const isPublished = body.isPublished !== undefined
      ? body.isPublished
      : !shouldHideRecordLessonByDefault(title);

    const insertRes = await query(
      `INSERT INTO lessons
         (course_id, section_id, name, title, description, duration_seconds, sort_order, is_published)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
       RETURNING id, course_id, section_id, COALESCE(title, name) AS title,
                 description, duration_seconds, sort_order, is_published`,
      [
        courseId,
        parsedSectionId,
        normalizedTitle,
        normalizeRecordLessonDescription(description),
        Math.round(parsedDuration),
        nextOrder,
        isPublished,
      ],
    );

    const row = insertRes.rows[0];
    await safeRecordCurriculumMutation({
      courseId,
      unitType: "lesson",
      unitId: row.id,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });
    return res.status(201).json({
      success: true,
      data: {
        id: String(row.id),
        courseId: String(row.course_id),
        sectionId: row.section_id ? String(row.section_id) : null,
        title: row.title,
        description: row.description || "",
        durationSeconds: Number(row.duration_seconds || 0),
        sortOrder: Number(row.sort_order || 0),
        isPublished: Boolean(row.is_published),
        videoStatus: "missing",
        videos: [],
        counts: { theory: 0, files: 0, vocabulary: 0, formulas: 0, assignments: 0 },
      },
      message: "Tạo bài học độc lập thành công",
    });
  } catch (error) {
    console.error("Create video course lesson error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: PUT /api/video-courses/admin/lessons/:lessonId - Update Independent lesson
router.put("/admin/lessons/:lessonId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const lessonId = parsePositiveId(req.params.lessonId);
    if (!lessonId) return validationError(res, "lessonId không hợp lệ");

    const {
      title,
      description,
      sectionId,
      durationSeconds,
      sortOrder,
      isPublished,
    } = req.body || {};

    const existingRes = await query(`SELECT * FROM lessons WHERE id = $1`, [lessonId]);
    const existing = existingRes.rows[0];
    if (!existing) return notFound(res, "Không tìm thấy bài học");

    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 1000)) {
      return validationError(res, "Tên bài học không hợp lệ hoặc quá dài");
    }
    if (description !== undefined && typeof description !== "string") {
      return validationError(res, "Mô tả bài học phải là văn bản");
    }
    if (isPublished !== undefined && typeof isPublished !== "boolean") {
      return validationError(res, "Trạng thái hiển thị bài học không hợp lệ");
    }

    const nextTitle = title !== undefined
      ? normalizeRecordLessonTitle(title)
      : normalizeRecordLessonTitle(existing.title || existing.name);
    const nextDesc = description !== undefined
      ? normalizeRecordLessonDescription(description)
      : (existing.description || "");

    let nextSectionId = existing.section_id;
    if (sectionId !== undefined) {
      nextSectionId = sectionId === null || sectionId === "" ? null : parsePositiveId(sectionId);
      if (sectionId !== null && sectionId !== "" && !nextSectionId) {
        return validationError(res, "sectionId không hợp lệ");
      }
    }
    if (nextSectionId) {
      const sectionRes = await query(
        `SELECT id FROM sections WHERE id = $1 AND course_id = $2 LIMIT 1`,
        [nextSectionId, existing.course_id],
      );
      if (!sectionRes.rows[0]) return validationError(res, "Chương học không thuộc khóa của bài học");
    }

    let nextDuration = Number(existing.duration_seconds || 0);
    if (durationSeconds !== undefined) {
      const parsedDuration = Number(durationSeconds);
      if (!Number.isFinite(parsedDuration) || parsedDuration < 0 || parsedDuration > 86_400) {
        return validationError(res, "Thời lượng bài học phải từ 0 đến 86400 giây");
      }
      nextDuration = Math.round(parsedDuration);
    }

    let nextOrder = Number(existing.sort_order || 0);
    if (sortOrder !== undefined) {
      const parsedOrder = Number(sortOrder);
      if (!Number.isSafeInteger(parsedOrder) || parsedOrder < 0 || parsedOrder > 100_000) {
        return validationError(res, "Thứ tự bài học không hợp lệ");
      }
      nextOrder = parsedOrder;
    }
    const nextPublished = isPublished !== undefined ? isPublished : Boolean(existing.is_published);

    const unchanged = nextTitle === (existing.title || existing.name)
      && nextDesc === (existing.description || "")
      && String(nextSectionId || "") === String(existing.section_id || "")
      && nextDuration === Number(existing.duration_seconds || 0)
      && nextOrder === Number(existing.sort_order || 0)
      && nextPublished === Boolean(existing.is_published);

    if (unchanged) {
      return res.json({
        success: true,
        data: {
          id: String(existing.id),
          courseId: String(existing.course_id),
          sectionId: existing.section_id ? String(existing.section_id) : null,
          title: nextTitle,
          description: nextDesc,
          durationSeconds: nextDuration,
          sortOrder: nextOrder,
          isPublished: nextPublished,
          unchanged: true,
        },
        message: "Bài học không có thay đổi",
      });
    }

    const updateRes = await query(
      `UPDATE lessons
       SET name = $1, title = $1, description = $2, section_id = $3,
           duration_seconds = $4, sort_order = $5, is_published = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, course_id, section_id, COALESCE(title, name) AS title,
                 description, duration_seconds, sort_order, is_published`,
      [nextTitle, nextDesc, nextSectionId, nextDuration, nextOrder, nextPublished, lessonId],
    );

    await safeRecordCurriculumMutation({
      courseId: updateRes.rows[0].course_id,
      unitType: "lesson",
      unitId: lessonId,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });

    return res.json({
      success: true,
      data: {
        id: String(updateRes.rows[0].id),
        courseId: String(updateRes.rows[0].course_id),
        sectionId: updateRes.rows[0].section_id ? String(updateRes.rows[0].section_id) : null,
        title: updateRes.rows[0].title,
        description: updateRes.rows[0].description || "",
        durationSeconds: Number(updateRes.rows[0].duration_seconds || 0),
        sortOrder: Number(updateRes.rows[0].sort_order || 0),
        isPublished: Boolean(updateRes.rows[0].is_published),
        unchanged: false,
      },
      message: "Cập nhật bài học thành công",
    });
  } catch (error) {
    console.error("Update video course lesson error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: edit destination-owned metadata for one referenced Live session.
// Source content remains untouched and the Record profile stays INDEPENDENT.
router.put("/admin/courses/:courseId/referenced-units/:sessionId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!courseId || !sessionId) return validationError(res, "courseId hoặc sessionId không hợp lệ");

    const requestedOverrideId = parsePositiveId(req.body?.unitOverrideId);
    const current = (
      await query(
        `SELECT r.id AS reference_id, r.video_course_profile_id, cs.id AS source_class_session_id,
                cs.title AS source_title, o.id AS override_id, o.title_override,
                o.summary_override, o.duration_seconds_override, o.sort_order_override,
                o.is_published_override, o.is_public_preview_override, o.slice_key
         FROM recording_curriculum_references r
         JOIN video_course_profiles vcp ON vcp.id = r.video_course_profile_id
         JOIN class_sessions cs ON cs.live_class_id = r.source_live_class_id AND cs.id = $2
         LEFT JOIN recording_curriculum_unit_overrides o
           ON o.curriculum_reference_id = r.id AND o.source_class_session_id = cs.id
         WHERE vcp.course_id = $1 AND vcp.mode = 'INDEPENDENT'
           AND vcp.source_live_class_id IS NULL AND vcp.deleted_at IS NULL
           AND cs.status <> 'cancelled'
           AND ($3::bigint IS NULL OR o.id = $3)
         ORDER BY CASE WHEN o.id = $3 THEN 0 ELSE 1 END, o.id ASC
         LIMIT 1`,
        [courseId, sessionId, requestedOverrideId],
      )
    ).rows[0];
    if (!current) return notFound(res, "Không tìm thấy bài học dùng lại trong khóa Record này");

    const body = req.body || {};
    if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
      return validationError(res, "Tên bài học không hợp lệ");
    }
    if (body.description !== undefined && typeof body.description !== "string") {
      return validationError(res, "Mô tả bài học phải là văn bản");
    }
    if (body.isPublished !== undefined && typeof body.isPublished !== "boolean") {
      return validationError(res, "Trạng thái hiển thị không hợp lệ");
    }
    if (body.isPublicPreview !== undefined && typeof body.isPublicPreview !== "boolean") {
      return validationError(res, "Trạng thái học thử không hợp lệ");
    }

    const nextTitle = body.title !== undefined
      ? normalizeRecordLessonTitle(body.title)
      : (current.title_override || normalizeRecordLessonTitle(current.source_title));
    const nextSummary = body.description !== undefined
      ? normalizeRecordLessonDescription(body.description)
      : (current.summary_override || "");
    let nextDuration = current.duration_seconds_override;
    if (body.durationSeconds !== undefined) {
      const parsed = Number(body.durationSeconds);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 86_400) {
        return validationError(res, "Thời lượng bài học phải từ 0 đến 86400 giây");
      }
      nextDuration = Math.round(parsed);
    }
    let nextOrder = current.sort_order_override;
    if (body.sortOrder !== undefined) {
      const parsed = Number(body.sortOrder);
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100_000) {
        return validationError(res, "Thứ tự bài học không hợp lệ");
      }
      nextOrder = parsed;
    }
    const nextPublished = body.isPublished !== undefined
      ? body.isPublished
      : (current.is_published_override ?? true);
    const nextPreview = body.isPublicPreview !== undefined
      ? body.isPublicPreview
      : (current.is_public_preview_override ?? false);

    const unchanged = Boolean(current.override_id)
      && nextTitle === (current.title_override || normalizeRecordLessonTitle(current.source_title))
      && nextSummary === (current.summary_override || "")
      && String(nextDuration ?? "") === String(current.duration_seconds_override ?? "")
      && String(nextOrder ?? "") === String(current.sort_order_override ?? "")
      && nextPublished === (current.is_published_override ?? true)
      && nextPreview === (current.is_public_preview_override ?? false);
    if (unchanged) {
      return res.json({ success: true, data: { unchanged: true }, message: "Bài học không có thay đổi" });
    }

    const saved = (
      await query(
        `INSERT INTO recording_curriculum_unit_overrides
           (curriculum_reference_id, source_class_session_id, slice_key, title_override, summary_override,
            duration_seconds_override, sort_order_override, is_published_override,
            is_public_preview_override)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (curriculum_reference_id, source_class_session_id, slice_key) DO UPDATE SET
           title_override = EXCLUDED.title_override,
           summary_override = EXCLUDED.summary_override,
           duration_seconds_override = EXCLUDED.duration_seconds_override,
           sort_order_override = EXCLUDED.sort_order_override,
           is_published_override = EXCLUDED.is_published_override,
           is_public_preview_override = EXCLUDED.is_public_preview_override,
           updated_at = NOW()
         RETURNING *`,
        [
          current.reference_id,
          sessionId,
          current.slice_key || "default",
          nextTitle,
          nextSummary,
          nextDuration,
          nextOrder,
          nextPublished,
          nextPreview,
        ],
      )
    ).rows[0];

    await safeRecordCurriculumMutation({
      courseId,
      profileId: current.video_course_profile_id,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });
    return res.json({
      success: true,
      data: {
        id: String(sessionId),
        unitOverrideId: String(saved.id),
        title: saved.title_override,
        description: saved.summary_override || "",
        durationSeconds: Number(saved.duration_seconds_override || 0),
        sortOrder: saved.sort_order_override == null ? null : Number(saved.sort_order_override),
        isPublished: saved.is_published_override !== false,
        isPublicPreview: Boolean(saved.is_public_preview_override),
        unchanged: false,
      },
      message: "Đã cập nhật bài học của khóa Record",
    });
  } catch (error) {
    console.error("Admin update referenced Record unit error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: DELETE /api/video-courses/admin/lessons/:lessonId - Delete Independent lesson
router.delete("/admin/lessons/:lessonId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const lessonId = parsePositiveId(req.params.lessonId);
    if (!lessonId) return validationError(res, "lessonId không hợp lệ");

    const deleteSnapshot = await resolveBeforeDeleteUnitSnapshot({ query }, { unitType: "lesson", unitId: lessonId });
    await query(`DELETE FROM lessons WHERE id = $1`, [lessonId]);
    if (deleteSnapshot) {
      await safeRecordCurriculumMutation({
        courseId: deleteSnapshot.courseId,
        unitType: "lesson",
        unitId: lessonId,
        eventType: "curriculum.tombstoned",
        deleted: true,
        beforeDeleteSnapshot: deleteSnapshot,
        correlationId: req.get?.("X-Correlation-ID") || null,
      });
    }
    return res.json({
      success: true,
      data: { id: String(lessonId), deleted: true },
      message: "Đã xóa bài học",
    });
  } catch (error) {
    console.error("Delete lesson error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: PUT /api/video-courses/admin/courses/:courseId/reorder - Reorder sections and lessons
router.put("/admin/courses/:courseId/reorder", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");

    const { sectionsOrder = [], lessonsOrder = [] } = req.body || {};

    if (Array.isArray(sectionsOrder)) {
      for (let idx = 0; idx < sectionsOrder.length; idx += 1) {
        const secId = parsePositiveId(sectionsOrder[idx]);
        if (secId) {
          await query(
            `UPDATE sections SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND course_id = $3`,
            [idx, secId, courseId],
          );
        }
      }
    }

    if (Array.isArray(lessonsOrder)) {
      for (let idx = 0; idx < lessonsOrder.length; idx += 1) {
        const item = lessonsOrder[idx];
        const lId = parsePositiveId(item?.id ?? item);
        if (lId) {
          const nextSort = Number.isSafeInteger(Number(item?.sortOrder)) ? Number(item.sortOrder) : idx;
          const nextSec = item?.sectionId !== undefined ? (item.sectionId ? parsePositiveId(item.sectionId) : null) : undefined;
          if (nextSec !== undefined) {
            await query(
              `UPDATE lessons SET sort_order = $1, section_id = $2, updated_at = NOW() WHERE id = $3 AND course_id = $4`,
              [nextSort, nextSec, lId, courseId],
            );
          } else {
            await query(
              `UPDATE lessons SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND course_id = $3`,
              [nextSort, lId, courseId],
            );
          }
        }
      }
    }

    await safeRecordCurriculumMutation({
      courseId,
      correlationId: req.get?.("X-Correlation-ID") || null,
    });

    return res.json({
      success: true,
      message: "Đã cập nhật thứ tự chương và bài học",
    });
  } catch (error) {
    console.error("Reorder curriculum error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: POST /api/video-courses/admin/courses/:courseId/publish - Validate 5-point Publish Checklist & Publish/Unpublish
router.post("/admin/courses/:courseId/publish", protectRoute, requireAdmin, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");

    const { isPublished = true, autoPublishReadyVideos = true } = req.body || {};

    if (!isPublished) {
      await query(`UPDATE courses SET is_published = FALSE, updated_at = NOW() WHERE id = $1`, [courseId]);
      const profRes = await query(
        `UPDATE video_course_profiles SET status = 'draft', updated_at = NOW() WHERE course_id = $1 AND deleted_at IS NULL AND status <> 'archived' RETURNING id`,
        [courseId],
      );
      const corr = req.get?.("X-Correlation-ID") || null;
      for (const prof of profRes.rows) {
        await recordProfileCatalogMutation({
          profileId: prof.id,
          courseId,
          eventType: "profile.upserted",
          deleted: false,
          correlationId: corr,
          bumpParentCourse: false,
        });
      }
      await recordCourseCatalogMutation({
        courseId,
        eventType: "course.unpublished",
        correlationId: corr,
      });
      await safeRecordCurriculumMutation({
        courseId,
        correlationId: corr,
      });
      const checklist = await computeCoursePublishChecklist(courseId);
      return res.json({
        success: true,
        data: { courseId: String(courseId), isPublished: false, publishChecklist: checklist },
        message: "Đã chuyển khóa học sang trạng thái Nháp (Unpublished)",
      });
    }

    // If autoPublishReadyVideos is requested, publish all ready placements of this course first
    if (autoPublishReadyVideos) {
      await query(
        `UPDATE class_session_videos csv
         SET is_published = TRUE, published_at = COALESCE(csv.published_at, NOW()), updated_at = NOW()
         FROM video_assets va
         WHERE csv.video_asset_id = va.id
           AND va.playback_status = 'ready'
           AND va.processing_error IS NULL
           AND (
             csv.lesson_id IN (SELECT id FROM lessons WHERE course_id = $1)
             OR csv.class_session_id IN (
               SELECT cs.id FROM class_sessions cs
               JOIN live_classes lc ON lc.id = cs.live_class_id
               WHERE lc.course_id = $1
             )
           )`,
        [courseId],
      );
      await query(
        `UPDATE lessons SET is_published = TRUE, updated_at = NOW() WHERE course_id = $1`,
        [courseId],
      );
    }

    const checklist = await computeCoursePublishChecklist(courseId);
    if (!checklist) return notFound(res, "Không tìm thấy khóa học");

    if (!checklist.isReadyToPublish) {
      return res.status(422).json({
        success: false,
        errorCode: "PUBLISH_CHECKLIST_FAILED",
        message: "Khóa học chưa đạt đủ 5 tiêu chí Publish Checklist để xuất bản",
        data: { publishChecklist: checklist },
      });
    }

    await query(`UPDATE courses SET is_published = TRUE, updated_at = NOW() WHERE id = $1`, [courseId]);
    const profRes = await query(
      `UPDATE video_course_profiles SET status = 'active', updated_at = NOW() WHERE course_id = $1 AND deleted_at IS NULL AND status <> 'archived' RETURNING id`,
      [courseId],
    );
    const corr = req.get?.("X-Correlation-ID") || null;
    for (const prof of profRes.rows) {
      await recordProfileCatalogMutation({
        profileId: prof.id,
        courseId,
        eventType: "profile.upserted",
        deleted: false,
        correlationId: corr,
        bumpParentCourse: false,
      });
    }
    await recordCourseCatalogMutation({
      courseId,
      eventType: "course.published",
      correlationId: corr,
    });
    await safeRecordCurriculumMutation({
      courseId,
      correlationId: corr,
    });

    return res.json({
      success: true,
      data: {
        courseId: String(courseId),
        isPublished: true,
        publishChecklist: checklist,
      },
      message: "Xuất bản khóa học video thành công!",
    });
  } catch (error) {
    console.error("Publish video course error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: DELETE /api/video-courses/admin/users/:userId/trusted-devices/:deviceId
router.delete("/admin/users/:userId/trusted-devices/:deviceId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const userId = parsePositiveId(req.params.userId);
    const deviceId = parsePositiveId(req.params.deviceId);
    if (!userId || !deviceId) return validationError(res, "userId hoặc deviceId không hợp lệ");

    const revoked = await revokeTrustedDevice({
      deviceId,
      userId,
      revokedBy: req.user.id,
      db: { query },
    });
    if (!revoked) return notFound(res, "Không tìm thấy thiết bị cần gỡ");

    return res.json({
      success: true,
      data: revoked,
      message: "Đã gỡ thiết bị vượt giới hạn thành công",
    });
  } catch (error) {
    console.error("Admin revoke user trusted device error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ", errorCode: "INTERNAL_ERROR" });
  }
});

export default router;
