import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  authorizeRecordDevice,
  TrustedDeviceAuthError,
} from "../services/trustedDevice.service.js";
import {
  BunnyStreamError,
  createBunnyUploadIntent,
  processBunnyWebhookEvent,
  generateBunnySignedPlayback,
  getUnitVideoProgressAggregate,
  recordVideoWatchProgress,
  deleteBunnyVideo,
} from "../services/bunnyStream.service.js";
import { generateLearningFileUploadPresignedUrl } from "../services/video.service.js";
import { hasUnrevokedVideoCourseAccess } from "../services/videoCourseAccessRevocation.service.js";

const router = express.Router();

// Simple in-memory sliding window rate limiter for upload, playback & progress endpoints
const rateLimitBuckets = new Map();
const checkRateLimit = (key, maxRequests, windowMs) => {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || [];
  const active = bucket.filter((ts) => now - ts < windowMs);
  if (active.length >= maxRequests) {
    rateLimitBuckets.set(key, active);
    return false;
  }
  active.push(now);
  rateLimitBuckets.set(key, active);
  return true;
};

const parsePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const sendError = (res, status, message, errorCode, details = undefined) => {
  if (typeof res.setHeader === "function") {
    res.setHeader("Cache-Control", "private, no-store");
  }
  return res.status(status).json({
    success: false,
    message,
    errorCode,
    ...(details ? { details } : {}),
  });
};

// Verify learner course entitlement and Record class membership
export const verifyLearnerVideoAccess = async ({
  user,
  courseId,
  liveClassId = null,
  requireRecordingMode = true,
  req = null,
  db = { query },
}) => {
  if (!user) {
    return { allowed: false, status: 401, errorCode: "UNAUTHORIZED", reason: "Chưa đăng nhập" };
  }
  if (user.role === "admin" || user.role === "creator") {
    return { allowed: true };
  }

  if (!hasActiveStudentLmsAccess(user)) {
    return {
      allowed: false,
      status: 403,
      errorCode: "LMS_ACCESS_INACTIVE",
      reason: "Quyền học LMS chưa được kích hoạt hoặc đã bị thu hồi",
    };
  }

  if (courseId) {
    const grantRes = await db.query(
      `SELECT 1 FROM lms_access_grants g
       WHERE g.user_id = $1
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
         AND (g.valid_until IS NULL OR g.valid_until > NOW())`,
      [user.id, courseId, liveClassId],
    );
    if (grantRes.rows.length === 0) {
      return {
        allowed: false,
        status: 403,
        errorCode: "ENTITLEMENT_INACTIVE",
        reason: "Quyền học khóa video không tồn tại, đã hết hạn hoặc đã hoàn học phí",
      };
    }
  }

  if (liveClassId) {
    const enrollRes = await db.query(
      `SELECT id, status, learning_mode, management_class_alias_id
       FROM class_enrollments
       WHERE user_id = $1 AND live_class_id = $2 AND status = 'active'`,
      [user.id, liveClassId],
    );
    const enrollment = enrollRes.rows[0];
    if (!enrollment) {
      return {
        allowed: false,
        status: 403,
        errorCode: "CLASS_MEMBERSHIP_REQUIRED",
        reason: "Bạn không thuộc danh sách lớp của khóa học này",
      };
    }
    if (requireRecordingMode && enrollment.learning_mode !== "recording") {
      const mirrorRes = await db.query(
        `SELECT 1 FROM video_course_profiles
         WHERE source_live_class_id = $1 AND course_id = $2
           AND status = 'active' AND mode = 'MIRROR'
         LIMIT 1`,
        [liveClassId, courseId],
      );
      if (mirrorRes.rows.length === 0) {
        return {
          allowed: false,
          status: 403,
          errorCode: "RECORD_MEMBERSHIP_REQUIRED",
          reason: "Học viên lớp Live không có quyền truy cập khóa Record nếu chưa đăng ký gói Record",
        };
      }
    }
  } else if (courseId && requireRecordingMode) {
    // Independent mode: an entitlement alone is insufficient. The learner
    // must belong to an active paid Record offering or a live class mirrored by this course.
    const enrollsRes = await db.query(
      `SELECT ce.learning_mode
       FROM class_enrollments ce
       LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
       WHERE ce.user_id = $1 AND ce.status = 'active'
         AND (
           lc.course_id = $2
           OR ce.course_id = $2
           OR EXISTS (
             SELECT 1 FROM video_course_profiles vcp
             WHERE vcp.course_id = $2 AND vcp.status = 'active'
               AND (vcp.source_live_class_id = ce.live_class_id OR vcp.course_id = ce.course_id)
           )
         )`,
      [user.id, courseId],
    );
    if (enrollsRes.rows.length === 0) {
      return {
        allowed: false,
        status: 403,
        errorCode: "RECORD_MEMBERSHIP_REQUIRED",
        reason: "Bạn chưa có membership lớp Record đang hoạt động cho khóa học này",
      };
    }
  }

  if (requireRecordingMode) {
    const hasCourseAccess = await hasUnrevokedVideoCourseAccess({
      db,
      userId: user.id,
      courseId,
      liveClassId,
    });
    if (!hasCourseAccess) {
      return {
        allowed: false,
        status: 403,
        errorCode: "VIDEO_COURSE_ACCESS_REVOKED",
        reason: "Quyền truy cập khóa video này đã bị thu hồi",
      };
    }

    const profileRes = await db.query(
      `SELECT COALESCE(BOOL_OR(enforce_trusted_devices), TRUE) AS enforce_trusted_devices,
              COALESCE(MIN(device_limit) FILTER (WHERE enforce_trusted_devices = TRUE), $2)::int AS device_limit
       FROM video_course_profiles
       WHERE course_id = $1 AND status = 'active'`,
      [courseId, 2],
    );
    const profile = profileRes.rows[0] || {};
    try {
      await authorizeRecordDevice({
        userId: user.id,
        trustedDeviceId: req?.authSession?.trustedDeviceId,
        deviceLimit: Number(profile.device_limit || 2),
        enforce: profile.enforce_trusted_devices !== false,
      });
    } catch (error) {
      if (error instanceof TrustedDeviceAuthError) {
        return {
          allowed: false,
          status: error.status,
          errorCode: error.errorCode,
          reason: error.message,
          details: error.details,
        };
      }
      throw error;
    }
  }

  return { allowed: true };
};

// ============================================================================
// 1. POST /api/admin/video-assets/upload-intent
// ============================================================================
router.post("/admin/video-assets/upload-intent", protectRoute, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!checkRateLimit(`upload:${req.user.id}`, 30, 60_000)) {
    return sendError(res, 429, "Tạo yêu cầu upload quá nhanh, vui lòng thử lại sau", "RATE_LIMITED");
  }

  try {
    const {
      title,
      libraryId = null,
      collectionId = null,
      fileSizeBytes = 0,
      mimeType = "video/mp4",
    } = req.body || {};

    const intent = await createBunnyUploadIntent({
      title,
      libraryId,
      collectionId,
      fileSizeBytes,
      mimeType,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: intent,
      message: "Khởi tạo phiên upload Bunny Stream TUS thành công",
    });
  } catch (error) {
    if (error instanceof BunnyStreamError) {
      return sendError(res, error.status, error.message, error.errorCode, error.details);
    }
    console.error("Create Bunny upload intent error:", error);
    return sendError(res, 500, "Lỗi khi khởi tạo upload Bunny Stream", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 2. POST /api/webhooks/bunny-stream
// ============================================================================
router.post("/webhooks/bunny-stream", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const signatureHeader = req.get?.("x-bunny-signature")
      || req.get?.("x-webhook-signature")
      || req.headers?.["x-bunny-signature"]
      || req.headers?.["x-webhook-signature"]
      || req.get?.("x-bunny-webhook-secret")
      || req.headers?.["x-bunny-webhook-secret"]
      || req.query?.secret
      || null;

    const result = await processBunnyWebhookEvent({
      payload: req.body,
      rawBody: req.rawBody,
      signatureHeader,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof BunnyStreamError) {
      return sendError(res, error.status, error.message, error.errorCode);
    }
    console.error("Bunny webhook error:", error);
    return sendError(res, 500, "Lỗi xử lý webhook Bunny Stream", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 3. POST /api/admin/learning-units/:unitId/videos
// ============================================================================
router.post("/admin/learning-units/:unitId/videos", protectRoute, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const unitId = parsePositiveId(req.params.unitId);
    if (!unitId) return sendError(res, 422, "unitId không hợp lệ", "VALIDATION_ERROR");

    const {
      videoAssetId,
      unitType = null,
      title = null,
      videoType = "primary",
      sortOrder = 0,
      isPublished = false,
    } = req.body || {};

    const parsedAssetId = parsePositiveId(videoAssetId);
    if (!parsedAssetId) return sendError(res, 422, "videoAssetId không hợp lệ", "VALIDATION_ERROR");
    if (!["primary", "supplemental"].includes(videoType)) {
      return sendError(res, 422, "videoType phải là primary hoặc supplemental", "VALIDATION_ERROR");
    }

    const assetRes = await query(
      `SELECT id, title, playback_status, provider, provider_library_id, provider_video_id, duration_seconds, thumbnail_url
       FROM video_assets
       WHERE id = $1 AND deleted_at IS NULL`,
      [parsedAssetId],
    );
    const asset = assetRes.rows[0];
    if (!asset) return sendError(res, 404, "Không tìm thấy video asset", "NOT_FOUND");

    const publishWhenReady = Boolean(isPublished) && asset.playback_status !== "ready";
    let publishNow = Boolean(isPublished) && asset.playback_status === "ready";

    // Determine whether unitId is a class_session or a lesson
    let resolvedType = unitType;
    if (!resolvedType) {
      const sessionCheck = await query("SELECT id FROM class_sessions WHERE id = $1", [unitId]);
      if (sessionCheck.rows.length > 0) {
        resolvedType = "class_session";
      } else {
        const lessonCheck = await query("SELECT id FROM lessons WHERE id = $1", [unitId]);
        if (lessonCheck.rows.length > 0) {
          resolvedType = "lesson";
        }
      }
    }

    if (!["class_session", "lesson"].includes(resolvedType)) {
      return sendError(res, 404, "Không tìm thấy buổi học hoặc bài học", "NOT_FOUND");
    }

    const classSessionId = resolvedType === "class_session" ? unitId : null;
    const lessonId = resolvedType === "lesson" ? unitId : null;

    const placementRes = await query(
      `INSERT INTO class_session_videos
         (class_session_id, lesson_id, video_asset_id, title, video_type, sort_order, is_published, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN NOW() ELSE NULL END)
       RETURNING *`,
      [
        classSessionId,
        lessonId,
        parsedAssetId,
        title ? String(title).trim().slice(0, 255) : asset.title,
        videoType,
        Math.max(0, Number(sortOrder || 0)),
        publishNow,
      ],
    );

    if (publishWhenReady) {
      const pendingRes = await query(
        `UPDATE video_assets
         SET provider_metadata = COALESCE(provider_metadata, '{}'::jsonb)
               || '{"publishWhenReady":true}'::jsonb,
             updated_at = NOW()
         WHERE id = $1
         RETURNING playback_status`,
        [parsedAssetId],
      );

      // Cover the race where Bunny becomes ready while the placement is being created.
      if (pendingRes.rows[0]?.playback_status === "ready") {
        publishNow = true;
        await query(
          `UPDATE class_session_videos
           SET is_published = TRUE, published_at = COALESCE(published_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [placementRes.rows[0].id],
        );
        await query(
          `UPDATE video_assets
           SET published_at = COALESCE(published_at, NOW()),
               provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'publishWhenReady',
               updated_at = NOW()
           WHERE id = $1`,
          [parsedAssetId],
        );
      }
    }

    // If lesson primary video, also link lessons.video_asset_id for unified lookup
    if (lessonId && videoType === "primary") {
      await query(
        `UPDATE lessons
         SET video_asset_id = $1,
             duration_seconds = CASE WHEN $2 > 0 THEN $2 ELSE duration_seconds END,
             updated_at = NOW()
         WHERE id = $3`,
        [parsedAssetId, Number(asset.duration_seconds || 0), lessonId],
      );
    }

    if (publishNow) {
      await query(
        `UPDATE video_assets
         SET published_at = COALESCE(published_at, NOW()),
             provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'publishWhenReady',
             updated_at = NOW()
         WHERE id = $1`,
        [parsedAssetId],
      );
    }

    const placement = placementRes.rows[0];
    await recordAuditEvent({
      actorId: req.user.id,
      action: "video.attached_to_unit",
      entityType: resolvedType,
      entityId: String(unitId),
      afterState: {
        placementId: placement.id,
        videoAssetId: parsedAssetId,
        unitType: resolvedType,
        unitId,
        isPublished: publishNow,
        publishWhenReady: publishWhenReady && !publishNow,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        id: String(placement.id),
        unitId: String(unitId),
        unitType: resolvedType,
        videoAssetId: String(parsedAssetId),
        title: placement.title || asset.title,
        videoType: placement.video_type,
        sortOrder: placement.sort_order,
        isPublished: publishNow,
        publishWhenReady: publishWhenReady && !publishNow,
        playbackStatus: asset.playback_status,
      },
      message: publishWhenReady && !publishNow
        ? "Đã gắn video vào bài học. Video sẽ tự phát hành sau khi Bunny encode xong."
        : "Gắn video vào bài học thành công",
    });
  } catch (error) {
    console.error("Attach video to unit error:", error);
    return sendError(res, 500, "Lỗi khi gắn video vào bài học", "INTERNAL_ERROR");
  }
});

// Helper to resolve a video by either video_assets.id or class_session_videos.id
const resolveAdminVideoTarget = async (videoIdParam) => {
  const id = parsePositiveId(videoIdParam);
  if (!id) return null;

  // Check if id matches a video_assets row first
  const assetRes = await query(
    `SELECT va.*,
            csv.id AS placement_id, csv.class_session_id, csv.lesson_id, csv.is_published AS placement_is_published
     FROM video_assets va
     LEFT JOIN class_session_videos csv ON csv.video_asset_id = va.id
     WHERE va.id = $1 AND va.deleted_at IS NULL
     ORDER BY csv.id DESC LIMIT 1`,
    [id],
  );
  if (assetRes.rows.length > 0) {
    return {
      assetId: assetRes.rows[0].id,
      placementId: assetRes.rows[0].placement_id || null,
      asset: assetRes.rows[0],
    };
  }

  // Fallback: check if id is a class_session_videos.id
  const placeRes = await query(
    `SELECT va.*,
            csv.id AS placement_id, csv.class_session_id, csv.lesson_id, csv.is_published AS placement_is_published
     FROM class_session_videos csv
     JOIN video_assets va ON va.id = csv.video_asset_id
     WHERE csv.id = $1 AND va.deleted_at IS NULL`,
    [id],
  );
  if (placeRes.rows.length > 0) {
    return {
      assetId: placeRes.rows[0].id,
      placementId: placeRes.rows[0].placement_id,
      asset: placeRes.rows[0],
    };
  }

  return null;
};

// ============================================================================
// 4. POST /api/admin/videos/:videoId/publish
// ============================================================================
router.post("/admin/videos/:videoId/publish", protectRoute, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const target = await resolveAdminVideoTarget(req.params.videoId);
    if (!target) return sendError(res, 404, "Không tìm thấy video", "NOT_FOUND");

    if (target.asset.playback_status !== "ready") {
      return sendError(
        res,
        409,
        `Không thể publish video khi trạng thái đang là '${target.asset.playback_status}'. Video phải ở trạng thái 'ready'.`,
        "VIDEO_NOT_READY",
      );
    }

    await query(
      `UPDATE video_assets
       SET published_at = COALESCE(published_at, NOW()),
           provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'publishWhenReady',
           updated_at = NOW()
       WHERE id = $1`,
      [target.assetId],
    );

    await query(
      `UPDATE class_session_videos
       SET is_published = TRUE, published_at = COALESCE(published_at, NOW()), updated_at = NOW()
       WHERE video_asset_id = $1`,
      [target.assetId],
    );

    await recordAuditEvent({
      actorId: req.user.id,
      action: "video.published",
      entityType: "video_asset",
      entityId: String(target.assetId),
      afterState: {
        assetId: target.assetId,
        playbackStatus: target.asset.playback_status,
        isPublished: true,
      },
    });

    return res.json({
      success: true,
      data: {
        videoId: String(target.assetId),
        playbackStatus: target.asset.playback_status,
        isPublished: true,
      },
      message: "Đã phát hành video bài giảng",
    });
  } catch (error) {
    console.error("Publish video error:", error);
    return sendError(res, 500, "Lỗi khi phát hành video", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 5. POST /api/admin/videos/:videoId/unpublish
// ============================================================================
router.post("/admin/videos/:videoId/unpublish", protectRoute, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const target = await resolveAdminVideoTarget(req.params.videoId);
    if (!target) return sendError(res, 404, "Không tìm thấy video", "NOT_FOUND");

    await query(
      `UPDATE video_assets
       SET published_at = NULL,
           provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'publishWhenReady',
           updated_at = NOW()
       WHERE id = $1`,
      [target.assetId],
    );

    await query(
      `UPDATE class_session_videos
       SET is_published = FALSE, updated_at = NOW()
       WHERE video_asset_id = $1`,
      [target.assetId],
    );

    await recordAuditEvent({
      actorId: req.user.id,
      action: "video.unpublished",
      entityType: "video_asset",
      entityId: String(target.assetId),
      afterState: {
        assetId: target.assetId,
        isPublished: false,
      },
    });

    return res.json({
      success: true,
      data: {
        videoId: String(target.assetId),
        isPublished: false,
      },
      message: "Đã gỡ phát hành video bài giảng",
    });
  } catch (error) {
    console.error("Unpublish video error:", error);
    return sendError(res, 500, "Lỗi khi gỡ phát hành video", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 6. POST /api/admin/videos/:videoId/replace
// ============================================================================
router.post("/admin/videos/:videoId/replace", protectRoute, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const target = await resolveAdminVideoTarget(req.params.videoId);
    if (!target) return sendError(res, 404, "Không tìm thấy video cần thay thế", "NOT_FOUND");

    const newAssetId = parsePositiveId(req.body?.newVideoAssetId);
    if (!newAssetId) return sendError(res, 422, "newVideoAssetId không hợp lệ", "VALIDATION_ERROR");

    const newAssetRes = await query(
      `SELECT id, title, playback_status, duration_seconds
       FROM video_assets
       WHERE id = $1 AND deleted_at IS NULL`,
      [newAssetId],
    );
    const newAsset = newAssetRes.rows[0];
    if (!newAsset) return sendError(res, 404, "Không tìm thấy video mới", "NOT_FOUND");

    await query(
      `UPDATE class_session_videos
       SET video_asset_id = $1,
           is_published = CASE WHEN $2 = 'ready' THEN is_published ELSE FALSE END,
           updated_at = NOW()
       WHERE video_asset_id = $3`,
      [newAssetId, newAsset.playback_status, target.assetId],
    );

    await query(
      `UPDATE lessons
       SET video_asset_id = $1,
           duration_seconds = CASE WHEN $2 > 0 THEN $2 ELSE duration_seconds END,
           updated_at = NOW()
       WHERE video_asset_id = $3`,
      [newAssetId, Number(newAsset.duration_seconds || 0), target.assetId],
    );

    await recordAuditEvent({
      actorId: req.user.id,
      action: "video.replaced",
      entityType: "video_asset",
      entityId: String(newAssetId),
      beforeState: { oldVideoAssetId: target.assetId },
      afterState: { newVideoAssetId: newAssetId, playbackStatus: newAsset.playback_status },
    });

    return res.json({
      success: true,
      data: {
        oldVideoAssetId: String(target.assetId),
        newVideoAssetId: String(newAssetId),
        playbackStatus: newAsset.playback_status,
      },
      message: "Thay thế video thành công",
    });
  } catch (error) {
    console.error("Replace video error:", error);
    return sendError(res, 500, "Lỗi khi thay thế video", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 7. DELETE /api/admin/videos/:videoId
// ============================================================================
router.delete("/admin/videos/:videoId", protectRoute, requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const target = await resolveAdminVideoTarget(req.params.videoId);
    if (!target) return sendError(res, 404, "Không tìm thấy video", "NOT_FOUND");

    await deleteBunnyVideo({ videoAsset: target.asset });

    await query(
      `UPDATE lessons SET video_asset_id = NULL, updated_at = NOW() WHERE video_asset_id = $1`,
      [target.assetId],
    );
    await query(
      `DELETE FROM class_session_videos WHERE video_asset_id = $1`,
      [target.assetId],
    );
    await query(
      `UPDATE video_assets
       SET playback_status = 'deleted', status = 'deleted', published_at = NULL, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [target.assetId],
    );

    await recordAuditEvent({
      actorId: req.user.id,
      action: "video.deleted",
      entityType: "video_asset",
      entityId: String(target.assetId),
      beforeState: { assetId: target.assetId, title: target.asset.title },
      afterState: { deletedAt: new Date().toISOString() },
    });

    return res.json({
      success: true,
      data: { videoId: String(target.assetId), deleted: true },
      message: "Đã xóa video thành công",
    });
  } catch (error) {
    console.error("Delete video error:", error);
    return sendError(res, 500, "Lỗi khi xóa video", "INTERNAL_ERROR");
  }
});

// Helper to resolve video context (course, liveClass, session, lesson, publication state)
const resolvePlaybackVideoContext = async (videoIdParam, requestedUnitId = null) => {
  const numericId = parsePositiveId(videoIdParam);
  let asset = null;

  if (numericId) {
    const res = await query(
      `SELECT * FROM video_assets WHERE id = $1 AND deleted_at IS NULL`,
      [numericId],
    );
    asset = res.rows[0] || null;

    if (!asset) {
      // Check if numericId is a class_session_videos.id
      const csvRes = await query(
        `SELECT va.*
         FROM class_session_videos csv
         JOIN video_assets va ON va.id = csv.video_asset_id
         WHERE csv.id = $1 AND va.deleted_at IS NULL`,
        [numericId],
      );
      asset = csvRes.rows[0] || null;
    }
  } else if (typeof videoIdParam === "string" && videoIdParam.trim()) {
    const res = await query(
      `SELECT * FROM video_assets WHERE provider_video_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [videoIdParam.trim()],
    );
    asset = res.rows[0] || null;
  }

  if (!asset) return null;

  // Find placements in class_session_videos or lessons
  const placementsRes = await query(
    `SELECT csv.id AS placement_id, csv.class_session_id, csv.lesson_id, csv.is_published,
            cs.live_class_id, cs.is_public_preview AS session_is_public_preview,
            lc.course_id AS session_course_id,
            l.course_id AS lesson_course_id, l.is_published AS lesson_is_published,
            l.is_public_preview AS lesson_is_public_preview
     FROM class_session_videos csv
     LEFT JOIN class_sessions cs ON cs.id = csv.class_session_id
     LEFT JOIN live_classes lc ON lc.id = cs.live_class_id
     LEFT JOIN lessons l ON l.id = csv.lesson_id
     WHERE csv.video_asset_id = $1
     ORDER BY csv.is_published DESC, csv.id DESC`,
    [asset.id],
  );

  let placement = placementsRes.rows[0] || null;
  if (requestedUnitId && placementsRes.rows.length > 1) {
    const matched = placementsRes.rows.find(
      (p) => String(p.class_session_id) === String(requestedUnitId) || String(p.lesson_id) === String(requestedUnitId),
    );
    if (matched) placement = matched;
  }

  let courseId = placement?.session_course_id || placement?.lesson_course_id || null;
  let liveClassId = placement?.live_class_id || null;
  let classSessionId = placement?.class_session_id || null;
  let lessonId = placement?.lesson_id || null;
  let isPublished = Boolean(placement?.is_published || asset.published_at);
  let isPublicPreview = Boolean(placement?.session_is_public_preview || placement?.lesson_is_public_preview);

  // Fallback: check direct lessons.video_asset_id link
  if (!courseId) {
    const directLessonRes = await query(
      `SELECT id, course_id, is_published, is_public_preview FROM lessons WHERE video_asset_id = $1 ORDER BY id DESC LIMIT 1`,
      [asset.id],
    );
    if (directLessonRes.rows[0]) {
      lessonId = directLessonRes.rows[0].id;
      courseId = directLessonRes.rows[0].course_id;
      isPublished = isPublished || Boolean(directLessonRes.rows[0].is_published);
      isPublicPreview = Boolean(directLessonRes.rows[0].is_public_preview);
    }
  }

  return {
    asset,
    courseId,
    liveClassId,
    classSessionId,
    lessonId,
    isPublished,
    isPublicPreview,
  };
};

// ============================================================================
// 8. POST /api/videos/:videoId/playback-token
// ============================================================================
router.post("/videos/:videoId/playback-token", protectRoute, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!checkRateLimit(`playback:${req.user.id}`, 60, 60_000)) {
    return sendError(res, 429, "Yêu cầu cấp token phát video quá nhanh, vui lòng thử lại sau", "RATE_LIMITED");
  }

  try {
    const { unitId = null } = req.body || {};
    const ctx = await resolvePlaybackVideoContext(req.params.videoId, unitId);

    if (!ctx) {
      return sendError(res, 404, "Không tìm thấy video bài giảng", "NOT_FOUND");
    }

    const { asset } = ctx;
    const effectiveCourseId = ctx.courseId;
    const effectiveLiveClassId = ctx.liveClassId;
    const isLearner = req.user.role === "user";
    if (!effectiveCourseId) {
      return sendError(res, 409, "Video chưa được gắn vào một bài học hợp lệ", "VIDEO_CONTEXT_MISSING");
    }

    // If unitId was explicitly requested, ensure the video actually belongs to that unit
    if (unitId) {
      const belongsToUnit = String(ctx.classSessionId || "") === String(unitId)
        || String(ctx.lessonId || "") === String(unitId);
      if ((ctx.classSessionId || ctx.lessonId) && !belongsToUnit) {
        await recordAuditEvent({
          actorId: req.user.id,
          action: "video.playback.rejected",
          entityType: "video_asset",
          entityId: String(asset.id),
          metadata: { reason: "UNIT_MISMATCH", requestedUnitId: unitId },
        });
        return sendError(res, 403, "Video không thuộc buổi học hoặc bài học được yêu cầu", "UNIT_MISMATCH");
      }
    }

    // 1. Check video readiness
    if (asset.playback_status !== "ready") {
      await recordAuditEvent({
        actorId: req.user.id,
        action: "video.playback.rejected",
        entityType: "video_asset",
        entityId: String(asset.id),
        metadata: { reason: "VIDEO_NOT_READY", playbackStatus: asset.playback_status },
      });
      return sendError(
        res,
        409,
        `Video đang ở trạng thái '${asset.playback_status}', chưa sẵn sàng để phát`,
        "VIDEO_NOT_READY",
        { playbackStatus: asset.playback_status },
      );
    }

    // 2. Learner checks: published state, entitlement, Record membership, trusted device
    if (isLearner) {
      if (!ctx.isPublished) {
        await recordAuditEvent({
          actorId: req.user.id,
          action: "video.playback.rejected",
          entityType: "video_asset",
          entityId: String(asset.id),
          metadata: { reason: "VIDEO_UNPUBLISHED" },
        });
        return sendError(res, 403, "Video bài giảng này chưa được phát hành", "VIDEO_UNPUBLISHED");
      }

      if (!ctx.isPublicPreview) {
        const accessCheck = await verifyLearnerVideoAccess({
          user: req.user,
          courseId: effectiveCourseId,
          liveClassId: effectiveLiveClassId,
          requireRecordingMode: true,
          req,
        });

        if (!accessCheck.allowed) {
          await recordAuditEvent({
            actorId: req.user.id,
            action: "video.playback.rejected",
            entityType: "video_asset",
            entityId: String(asset.id),
            metadata: {
              reason: accessCheck.errorCode,
              courseId: effectiveCourseId,
              liveClassId: effectiveLiveClassId,
            },
          });
          return sendError(res, accessCheck.status, accessCheck.reason, accessCheck.errorCode, accessCheck.details);
        }
      }
    }

    // 3. Generate short-lived signed Bunny playback URLs
    const signedPlayback = generateBunnySignedPlayback({
      videoAsset: asset,
      userId: req.user.id,
      userEmail: req.user.email || req.user.username || "",
      ipAddress: req.ip || null,
    });

    // 4. Load learner watch progress for resume
    const progressRes = await query(
      `SELECT last_position_seconds, watched_seconds, completion_percent, is_completed
       FROM video_watch_progress
       WHERE user_id = $1 AND video_asset_id = $2`,
      [req.user.id, asset.id],
    );
    const watchProgress = progressRes.rows[0]
      ? {
        lastPositionSeconds: Number(progressRes.rows[0].last_position_seconds || 0),
        watchedSeconds: Number(progressRes.rows[0].watched_seconds || 0),
        completionPercent: Number(progressRes.rows[0].completion_percent || 0),
        isCompleted: Boolean(progressRes.rows[0].is_completed),
      }
      : {
        lastPositionSeconds: 0,
        watchedSeconds: 0,
        completionPercent: 0,
        isCompleted: false,
      };
    const unitProgress = await getUnitVideoProgressAggregate({
      userId: req.user.id,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
    });

    return res.json({
      success: true,
      data: {
        ...signedPlayback,
        watchProgress,
        unitProgress,
      },
    });
  } catch (error) {
    if (error instanceof BunnyStreamError) {
      return sendError(res, error.status, error.message, error.errorCode);
    }
    console.error("Playback token generation error:", error);
    return sendError(res, 500, "Lỗi khi tạo token phát video", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 9. PUT /api/videos/:videoId/progress
// ============================================================================
router.put("/videos/:videoId/progress", protectRoute, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!checkRateLimit(`progress:${req.user.id}`, 120, 60_000)) {
    return sendError(res, 429, "Gửi tiến độ xem quá nhanh", "RATE_LIMITED");
  }

  try {
    const {
      unitId = null,
      currentTimeSeconds = 0,
      watchedDeltaSeconds = null,
      durationSeconds = null,
    } = req.body || {};

    const ctx = await resolvePlaybackVideoContext(req.params.videoId, unitId);
    if (!ctx) {
      return sendError(res, 404, "Không tìm thấy video bài giảng", "NOT_FOUND");
    }

    if (unitId) {
      const belongsToUnit = String(ctx.classSessionId || "") === String(unitId)
        || String(ctx.lessonId || "") === String(unitId);
      if (!belongsToUnit) {
        return sendError(res, 403, "Video không thuộc buổi học hoặc bài học được yêu cầu", "UNIT_MISMATCH");
      }
    }
    if (ctx.asset.playback_status !== "ready" || (req.user.role === "user" && !ctx.isPublished)) {
      return sendError(res, 403, "Video chưa sẵn sàng hoặc chưa được phát hành", "VIDEO_UNAVAILABLE");
    }

    if (req.user.role === "user" && !ctx.isPublicPreview) {
      const accessCheck = await verifyLearnerVideoAccess({
        user: req.user,
        courseId: ctx.courseId,
        liveClassId: ctx.liveClassId,
        requireRecordingMode: true,
        req,
      });
      if (!accessCheck.allowed) {
        return sendError(res, accessCheck.status, accessCheck.reason, accessCheck.errorCode, accessCheck.details);
      }
    }

    const progress = await recordVideoWatchProgress({
      userId: req.user.id,
      videoAssetId: ctx.asset.id,
      courseId: ctx.courseId,
      liveClassId: ctx.liveClassId,
      classSessionId: ctx.classSessionId,
      lessonId: ctx.lessonId,
      currentTimeSeconds,
      watchedDeltaSeconds,
      durationSeconds,
    });

    return res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    if (error instanceof BunnyStreamError) {
      return sendError(res, error.status, error.message, error.errorCode);
    }
    console.error("Update video progress error:", error);
    return sendError(res, 500, "Lỗi khi cập nhật tiến độ xem video", "INTERNAL_ERROR");
  }
});

// ============================================================================
// 10. Independent Lesson & Session Content Authoring (Theory, Vocab, Formula, Files)
// ============================================================================
const resolveUnitTypeAndIds = async (unitIdParam, explicitType = null) => {
  const unitId = parsePositiveId(unitIdParam);
  if (!unitId) return null;

  if (explicitType === "lesson") {
    const lRes = await query("SELECT id, course_id FROM lessons WHERE id = $1", [unitId]);
    if (lRes.rows[0]) return { unitType: "lesson", lessonId: unitId, classSessionId: null, classId: null, courseId: lRes.rows[0].course_id };
  } else if (explicitType === "class_session") {
    const sRes = await query(
      `SELECT cs.id, cs.live_class_id, lc.course_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1`,
      [unitId],
    );
    if (sRes.rows[0]) {
      return {
        unitType: "class_session",
        lessonId: null,
        classSessionId: unitId,
        classId: sRes.rows[0].live_class_id,
        courseId: sRes.rows[0].course_id,
      };
    }
  }

  // Auto-detect: check lesson first, then class_session
  const lRes = await query("SELECT id, course_id FROM lessons WHERE id = $1", [unitId]);
  if (lRes.rows[0]) {
    return { unitType: "lesson", lessonId: unitId, classSessionId: null, classId: null, courseId: lRes.rows[0].course_id };
  }
  const sRes = await query(
    `SELECT cs.id, cs.live_class_id, lc.course_id
     FROM class_sessions cs
     JOIN live_classes lc ON lc.id = cs.live_class_id
     WHERE cs.id = $1`,
    [unitId],
  );
  if (sRes.rows[0]) {
    return {
      unitType: "class_session",
      lessonId: null,
      classSessionId: unitId,
      classId: sRes.rows[0].live_class_id,
      courseId: sRes.rows[0].course_id,
    };
  }
  return null;
};

// GET /api/admin/learning-units/:unitId/content - Full content bundle for admin editor
router.get("/admin/learning-units/:unitId/content", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.query?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const [theoryRes, vocabRes, formulaRes, filesRes, assignRes, quizRes] = await Promise.all([
      target.unitType === "lesson"
        ? query("SELECT * FROM learning_unit_theory WHERE lesson_id = $1", [target.lessonId])
        : query("SELECT * FROM learning_unit_theory WHERE class_session_id = $1", [target.classSessionId]),
      target.unitType === "lesson"
        ? query("SELECT * FROM session_vocabularies WHERE lesson_id = $1 ORDER BY order_index ASC, id ASC", [target.lessonId])
        : query("SELECT * FROM session_vocabularies WHERE session_id = $1 ORDER BY order_index ASC, id ASC", [target.classSessionId]),
      target.unitType === "lesson"
        ? query("SELECT * FROM session_formulas WHERE lesson_id = $1 ORDER BY order_index ASC, id ASC", [target.lessonId])
        : query("SELECT * FROM session_formulas WHERE session_id = $1 ORDER BY order_index ASC, id ASC", [target.classSessionId]),
      target.unitType === "lesson"
        ? query(
            `SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes,
                    lf.mime_type, lf.storage_key, lf.created_at,
                    llfp.id AS placement_id, llfp.sort_order
             FROM lesson_learning_file_placements llfp
             JOIN lms_learning_files lf ON lf.id = llfp.file_id
             WHERE llfp.lesson_id = $1 AND lf.status = 'ready'
             ORDER BY llfp.sort_order ASC, llfp.id ASC`,
            [target.lessonId],
          )
        : query(
            `SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes,
                    lf.mime_type, lf.storage_key, lf.created_at,
                    lfp.id AS placement_id
             FROM lms_learning_file_placements lfp
             JOIN lms_learning_files lf ON lf.id = lfp.file_id
             WHERE lfp.class_session_id = $1 AND lf.status = 'ready'
             ORDER BY lfp.id ASC`,
            [target.classSessionId],
          ),
      target.unitType === "lesson"
        ? query(
            `SELECT id, title, assignment_type, description, max_score, due_date, attachment_url, created_at
             FROM assignments
             WHERE lesson_id = $1
             ORDER BY id ASC`,
            [target.lessonId],
          )
        : query(
            `SELECT id, title, assignment_type, description, max_score, due_date, attachment_url, created_at
             FROM assignments
             WHERE class_session_id = $1
             ORDER BY id ASC`,
            [target.classSessionId],
          ),
      target.unitType === "lesson"
        ? query(
            `SELECT q.id, q.title, q.description, q.duration_minutes, q.passing_score, q.status, q.created_at,
                    (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questions_count
             FROM quizzes q
             WHERE q.lesson_id = $1
             ORDER BY q.id ASC`,
            [target.lessonId],
          )
        : query(
            `SELECT q.id, q.title, q.description, q.duration_minutes, q.passing_score, q.status, q.created_at,
                    (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questions_count
             FROM quizzes q
             WHERE q.class_session_id = $1
             ORDER BY q.id ASC`,
            [target.classSessionId],
          ),
    ]);

    return res.json({
      success: true,
      data: {
        unit: target,
        theory: theoryRes.rows[0] ? {
          id: theoryRes.rows[0].id,
          title: theoryRes.rows[0].title,
          contentHtml: theoryRes.rows[0].content_html,
          summary: theoryRes.rows[0].summary,
          keyTakeaways: theoryRes.rows[0].key_takeaways || [],
          transcript: theoryRes.rows[0].transcript,
          timestampsJson: theoryRes.rows[0].timestamps_json || [],
        } : null,
        vocabulary: vocabRes.rows.map((row) => ({
          id: String(row.id),
          topic: row.topic,
          term: row.term,
          pinyin: row.pinyin,
          sinoVietnamese: row.sino_vietnamese,
          meaning: row.meaning,
          partOfSpeech: row.part_of_speech,
          exampleSentence: row.example_sentence,
          exampleMeaning: row.example_meaning,
          audioUrl: row.audio_url,
          orderIndex: row.order_index,
        })),
        formulas: formulaRes.rows.map((row) => ({
          id: String(row.id),
          subject: row.subject,
          chapterName: row.chapter_name,
          nameVi: row.name_vi,
          nameZh: row.name_zh,
          pinyin: row.pinyin,
          latexExpression: row.latex_expression,
          description: row.description,
          variablesExplanation: row.variables_explanation || [],
          orderIndex: row.order_index,
        })),
        files: filesRes.rows.map((row) => ({
          id: String(row.id),
          placementId: row.placement_id ? String(row.placement_id) : null,
          fileName: row.file_name,
          originalName: row.file_name,
          fileSizeBytes: Number(row.file_size_bytes || 0),
          mimeType: row.mime_type,
          storageKey: row.storage_key,
          sortOrder: Number(row.sort_order || 0),
          createdAt: row.created_at,
          downloadUrl: `/api/files/${row.id}/download`,
        })),
        assignments: assignRes.rows.map((row) => ({
          id: String(row.id),
          title: row.title,
          assignmentType: row.assignment_type,
          description: row.description,
          maxScore: Number(row.max_score || 10),
          dueDate: row.due_date,
          attachmentUrl: row.attachment_url,
          createdAt: row.created_at,
        })),
        quizzes: quizRes.rows.map((row) => ({
          id: String(row.id),
          title: row.title,
          description: row.description,
          durationMinutes: Number(row.duration_minutes || 30),
          passingScore: Number(row.passing_score || 60),
          status: row.status,
          questionsCount: Number(row.questions_count || 0),
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    console.error("Get unit content error:", error);
    return sendError(res, 500, "Lỗi khi tải nội dung bài học", "INTERNAL_ERROR");
  }
});

// PUT /api/admin/learning-units/:unitId/theory
router.put("/admin/learning-units/:unitId/theory", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const {
      title = null,
      contentHtml = "",
      summary = "",
      keyTakeaways = [],
      transcript = null,
      timestampsJson = [],
    } = req.body || {};

    const takeawaysArray = Array.isArray(keyTakeaways) ? keyTakeaways : [];
    const timestampsArray = Array.isArray(timestampsJson) ? timestampsJson : [];

    let result;
    if (target.unitType === "lesson") {
      result = await query(
        `INSERT INTO learning_unit_theory
           (lesson_id, title, content_html, summary, key_takeaways, transcript, timestamps_json)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
         ON CONFLICT (lesson_id) WHERE lesson_id IS NOT NULL
         DO UPDATE SET
           title = EXCLUDED.title,
           content_html = EXCLUDED.content_html,
           summary = EXCLUDED.summary,
           key_takeaways = EXCLUDED.key_takeaways,
           transcript = EXCLUDED.transcript,
           timestamps_json = EXCLUDED.timestamps_json,
           updated_at = NOW()
         RETURNING *`,
        [
          target.lessonId,
          title,
          contentHtml,
          summary,
          JSON.stringify(takeawaysArray),
          transcript,
          JSON.stringify(timestampsArray),
        ],
      );
    } else {
      result = await query(
        `INSERT INTO learning_unit_theory
           (class_session_id, title, content_html, summary, key_takeaways, transcript, timestamps_json)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
         ON CONFLICT (class_session_id) WHERE class_session_id IS NOT NULL
         DO UPDATE SET
           title = EXCLUDED.title,
           content_html = EXCLUDED.content_html,
           summary = EXCLUDED.summary,
           key_takeaways = EXCLUDED.key_takeaways,
           transcript = EXCLUDED.transcript,
           timestamps_json = EXCLUDED.timestamps_json,
           updated_at = NOW()
         RETURNING *`,
        [
          target.classSessionId,
          title,
          contentHtml,
          summary,
          JSON.stringify(takeawaysArray),
          transcript,
          JSON.stringify(timestampsArray),
        ],
      );
    }

    return res.json({
      success: true,
      data: result.rows[0],
      message: "Cập nhật lý thuyết bài học thành công",
    });
  } catch (error) {
    console.error("Upsert learning unit theory error:", error);
    return sendError(res, 500, "Lỗi khi lưu lý thuyết bài học", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/vocabulary
router.post("/admin/learning-units/:unitId/vocabulary", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const {
      term,
      pinyin = null,
      sinoVietnamese = null,
      meaning,
      partOfSpeech = null,
      exampleSentence = null,
      exampleMeaning = null,
      audioUrl = null,
      orderIndex = 0,
    } = req.body || {};

    if (!term || !meaning) {
      return sendError(res, 422, "Từ vựng (term) và nghĩa (meaning) là bắt buộc", "VALIDATION_ERROR");
    }

    const insertRes = await query(
      `INSERT INTO session_vocabularies
         (session_id, class_id, lesson_id, term, pinyin, sino_vietnamese, meaning,
          part_of_speech, example_sentence, example_meaning, audio_url, order_index, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        target.classSessionId,
        target.classId,
        target.lessonId,
        String(term).trim(),
        pinyin,
        sinoVietnamese,
        String(meaning).trim(),
        partOfSpeech,
        exampleSentence,
        exampleMeaning,
        audioUrl,
        Number(orderIndex || 0),
        req.user.id,
      ],
    );

    return res.status(201).json({
      success: true,
      data: insertRes.rows[0],
      message: "Thêm từ vựng thành công",
    });
  } catch (error) {
    console.error("Add unit vocabulary error:", error);
    return sendError(res, 500, "Lỗi khi thêm từ vựng", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/formulas
router.post("/admin/learning-units/:unitId/formulas", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const {
      subject = "MATH",
      chapterName = "Trọng tâm",
      nameVi,
      nameZh = null,
      pinyin = null,
      latexExpression,
      latex,
      description = null,
      variablesExplanation = [],
      orderIndex = 0,
    } = req.body || {};

    const resolvedLatex = latexExpression || latex;
    if (!nameVi || !resolvedLatex) {
      return sendError(res, 422, "Tên công thức và biểu thức LaTeX là bắt buộc", "VALIDATION_ERROR");
    }

    const rawSubject = String(subject || "MATH").trim().toUpperCase();
    const normalizedSubject = ["PHYSICS", "VẬT LÝ", "VAT LY"].includes(rawSubject)
      ? "PHYSICS"
      : ["CHEMISTRY", "HÓA HỌC", "HOA HOC"].includes(rawSubject)
        ? "CHEMISTRY"
        : "MATH";

    const insertRes = await query(
      `INSERT INTO session_formulas
         (session_id, class_id, lesson_id, subject, chapter_name, name_vi, name_zh,
          pinyin, latex_expression, description, variables_explanation, order_index, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
       RETURNING *`,
      [
        target.classSessionId,
        target.classId,
        target.lessonId,
        normalizedSubject,
        chapterName,
        String(nameVi).trim(),
        nameZh,
        pinyin,
        String(resolvedLatex).trim(),
        description,
        JSON.stringify(Array.isArray(variablesExplanation) ? variablesExplanation : []),
        Number(orderIndex || 0),
        req.user.id,
      ],
    );

    return res.status(201).json({
      success: true,
      data: insertRes.rows[0],
      message: "Thêm công thức thành công",
    });
  } catch (error) {
    console.error("Add unit formula error:", error);
    return sendError(res, 500, "Lỗi khi thêm công thức", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/files
router.post("/admin/learning-units/:unitId/files", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const fileId = parsePositiveId(req.body?.fileId);
    if (!fileId) return sendError(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");

    if (target.unitType === "lesson") {
      const placeRes = await query(
        `INSERT INTO lesson_learning_file_placements (file_id, lesson_id, attached_by, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_id, lesson_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
         RETURNING *`,
        [fileId, target.lessonId, req.user.id, Number(req.body?.sortOrder || 0)],
      );
      return res.status(201).json({
        success: true,
        data: placeRes.rows[0],
        message: "Đính kèm tài liệu vào bài học độc lập thành công",
      });
    }

    const placeRes = await query(
      `INSERT INTO lms_learning_file_placements (file_id, live_class_id, class_session_id, attached_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (file_id, class_session_id) WHERE class_session_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [fileId, target.classId, target.classSessionId, req.user.id],
    );
    return res.status(201).json({
      success: true,
      data: placeRes.rows[0] || { file_id: fileId, class_session_id: target.classSessionId },
      message: "Đính kèm tài liệu vào buổi học thành công",
    });
  } catch (error) {
    console.error("Attach unit file error:", error);
    return sendError(res, 500, "Lỗi khi đính kèm tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/vocabulary/batch
router.post("/admin/learning-units/:unitId/vocabulary/batch", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return sendError(res, 422, "Danh sách từ vựng không được để trống", "VALIDATION_ERROR");

    const insertedList = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.term || !item.meaning) continue;
      const resInsert = await query(
        `INSERT INTO session_vocabularies
           (session_id, class_id, lesson_id, topic, term, pinyin, sino_vietnamese, meaning,
            part_of_speech, example_sentence, example_meaning, audio_url, order_index, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          target.classSessionId,
          target.classId,
          target.lessonId,
          item.topic || "Nội dung chung",
          String(item.term).trim(),
          item.pinyin || null,
          item.sinoVietnamese || null,
          String(item.meaning).trim(),
          item.partOfSpeech || "Danh từ",
          item.exampleSentence || null,
          item.exampleMeaning || null,
          item.audioUrl || null,
          Number(item.orderIndex ?? i),
          req.user.id,
        ],
      );
      insertedList.push(resInsert.rows[0]);
    }

    return res.status(201).json({
      success: true,
      data: insertedList,
      message: `Đã nhập thành công ${insertedList.length} từ vựng`,
    });
  } catch (error) {
    console.error("Batch insert vocabulary error:", error);
    return sendError(res, 500, "Lỗi khi nhập danh sách từ vựng", "INTERNAL_ERROR");
  }
});

// PUT /api/admin/learning-units/:unitId/vocabulary/:vocabId
router.put("/admin/learning-units/:unitId/vocabulary/:vocabId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const vocabId = parsePositiveId(req.params.vocabId);
    if (!vocabId) return sendError(res, 422, "vocabId không hợp lệ", "VALIDATION_ERROR");

    const {
      topic,
      term,
      pinyin,
      sinoVietnamese,
      meaning,
      partOfSpeech,
      exampleSentence,
      exampleMeaning,
      audioUrl,
      orderIndex,
    } = req.body || {};

    const updated = await query(
      `UPDATE session_vocabularies
       SET topic = COALESCE($1, topic),
           term = COALESCE($2, term),
           pinyin = COALESCE($3, pinyin),
           sino_vietnamese = COALESCE($4, sino_vietnamese),
           meaning = COALESCE($5, meaning),
           part_of_speech = COALESCE($6, part_of_speech),
           example_sentence = COALESCE($7, example_sentence),
           example_meaning = COALESCE($8, example_meaning),
           audio_url = COALESCE($9, audio_url),
           order_index = COALESCE($10, order_index),
           updated_by = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [topic, term, pinyin, sinoVietnamese, meaning, partOfSpeech, exampleSentence, exampleMeaning, audioUrl, orderIndex, req.user.id, vocabId]
    );

    if (updated.rows.length === 0) return sendError(res, 404, "Không tìm thấy từ vựng", "NOT_FOUND");
    return res.json({ success: true, data: updated.rows[0], message: "Cập nhật từ vựng thành công" });
  } catch (error) {
    console.error("Update vocabulary error:", error);
    return sendError(res, 500, "Lỗi khi cập nhật từ vựng", "INTERNAL_ERROR");
  }
});

// DELETE /api/admin/learning-units/:unitId/vocabulary/:vocabId
router.delete("/admin/learning-units/:unitId/vocabulary/:vocabId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const vocabId = parsePositiveId(req.params.vocabId);
    if (!vocabId) return sendError(res, 422, "vocabId không hợp lệ", "VALIDATION_ERROR");

    const deleted = await query("DELETE FROM session_vocabularies WHERE id = $1 RETURNING id", [vocabId]);
    if (deleted.rows.length === 0) return sendError(res, 404, "Không tìm thấy từ vựng", "NOT_FOUND");
    return res.json({ success: true, message: "Đã xóa từ vựng" });
  } catch (error) {
    console.error("Delete vocabulary error:", error);
    return sendError(res, 500, "Lỗi khi xóa từ vựng", "INTERNAL_ERROR");
  }
});

// PUT /api/admin/learning-units/:unitId/formulas/:formulaId
router.put("/admin/learning-units/:unitId/formulas/:formulaId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const formulaId = parsePositiveId(req.params.formulaId);
    if (!formulaId) return sendError(res, 422, "formulaId không hợp lệ", "VALIDATION_ERROR");

    const {
      subject,
      chapterName,
      nameVi,
      nameZh,
      pinyin,
      latexExpression,
      latex,
      description,
      variablesExplanation,
      orderIndex,
    } = req.body || {};

    const resolvedLatex = latexExpression !== undefined ? latexExpression : latex;

    const rawSubject = subject ? String(subject).trim().toUpperCase() : null;
    const normalizedSubject = rawSubject
      ? (["PHYSICS", "VẬT LÝ", "VAT LY"].includes(rawSubject)
          ? "PHYSICS"
          : ["CHEMISTRY", "HÓA HỌC", "HOA HOC"].includes(rawSubject)
            ? "CHEMISTRY"
            : "MATH")
      : null;

    const updated = await query(
      `UPDATE session_formulas
       SET subject = COALESCE($1, subject),
           chapter_name = COALESCE($2, chapter_name),
           name_vi = COALESCE($3, name_vi),
           name_zh = COALESCE($4, name_zh),
           pinyin = COALESCE($5, pinyin),
           latex_expression = COALESCE($6, latex_expression),
           description = COALESCE($7, description),
           variables_explanation = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE variables_explanation END,
           order_index = COALESCE($9, order_index),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        normalizedSubject,
        chapterName,
        nameVi ? String(nameVi).trim() : null,
        nameZh,
        pinyin,
        resolvedLatex !== undefined && resolvedLatex !== null ? String(resolvedLatex).trim() : null,
        description,
        variablesExplanation ? JSON.stringify(variablesExplanation) : null,
        orderIndex,
        formulaId,
      ]
    );

    if (updated.rows.length === 0) return sendError(res, 404, "Không tìm thấy công thức", "NOT_FOUND");
    return res.json({ success: true, data: updated.rows[0], message: "Cập nhật công thức thành công" });
  } catch (error) {
    console.error("Update formula error:", error);
    return sendError(res, 500, "Lỗi khi cập nhật công thức", "INTERNAL_ERROR");
  }
});

// DELETE /api/admin/learning-units/:unitId/formulas/:formulaId
router.delete("/admin/learning-units/:unitId/formulas/:formulaId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const formulaId = parsePositiveId(req.params.formulaId);
    if (!formulaId) return sendError(res, 422, "formulaId không hợp lệ", "VALIDATION_ERROR");

    const deleted = await query("DELETE FROM session_formulas WHERE id = $1 RETURNING id", [formulaId]);
    if (deleted.rows.length === 0) return sendError(res, 404, "Không tìm thấy công thức", "NOT_FOUND");
    return res.json({ success: true, message: "Đã xóa công thức" });
  } catch (error) {
    console.error("Delete formula error:", error);
    return sendError(res, 500, "Lỗi khi xóa công thức", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/files/upload-url
router.post("/admin/learning-units/:unitId/files/upload-url", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const { filename, mimeType, sizeBytes, visibility = "COURSE" } = req.body || {};
    if (!filename || !mimeType || !sizeBytes) {
      return sendError(res, 422, "Thông tin tệp không hợp lệ", "VALIDATION_ERROR");
    }

    let upload;
    try {
      upload = await generateLearningFileUploadPresignedUrl({
        userId: req.user.id,
        filename,
        mimeType,
        sizeBytes: Number(sizeBytes),
      });
    } catch (err) {
      if (err.code === "R2_NOT_CONFIGURED") {
        return sendError(res, 503, "Kho R2 chưa được cấu hình", err.code);
      }
      throw err;
    }

    const fileInsert = await query(
      `INSERT INTO lms_learning_files
         (course_id, live_class_id, class_session_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id, original_name, storage_key, mime_type, size_bytes, visibility, status`,
      [
        target.courseId,
        target.classId,
        target.classSessionId,
        req.user.id,
        String(filename).trim(),
        upload.fileKey,
        mimeType,
        Number(sizeBytes),
        visibility,
      ],
    );

    return res.status(201).json({
      success: true,
      data: {
        fileId: String(fileInsert.rows[0].id),
        ...upload,
      },
    });
  } catch (error) {
    console.error("Admin file upload-url error:", error);
    return sendError(res, 500, error.message || "Lỗi tạo upload URL tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/files/confirm
router.post("/admin/learning-units/:unitId/files/confirm", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const fileId = parsePositiveId(req.body?.fileId);
    if (!fileId) return sendError(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");

    const fileRes = await query(
      `UPDATE lms_learning_files SET status = 'ready', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [fileId],
    );
    if (fileRes.rows.length === 0) return sendError(res, 404, "Không tìm thấy file", "NOT_FOUND");

    // Automatically attach placement
    if (target.unitType === "lesson") {
      await query(
        `INSERT INTO lesson_learning_file_placements (file_id, lesson_id, attached_by, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_id, lesson_id) DO NOTHING`,
        [fileId, target.lessonId, req.user.id, Number(req.body?.sortOrder || 0)],
      );
    } else {
      await query(
        `INSERT INTO lms_learning_file_placements (file_id, live_class_id, class_session_id, attached_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_id, class_session_id) WHERE class_session_id IS NOT NULL DO NOTHING`,
        [fileId, target.classId, target.classSessionId, req.user.id],
      );
    }

    return res.json({
      success: true,
      data: fileRes.rows[0],
      message: "Tải lên và đính kèm tài liệu thành công",
    });
  } catch (error) {
    console.error("Confirm file upload error:", error);
    return sendError(res, 500, "Lỗi khi xác nhận tải lên tài liệu", "INTERNAL_ERROR");
  }
});

// DELETE /api/admin/learning-units/:unitId/files/:fileId
router.delete("/admin/learning-units/:unitId/files/:fileId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.query?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const fileId = parsePositiveId(req.params.fileId);
    if (!fileId) return sendError(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");

    if (target.unitType === "lesson") {
      await query(
        `DELETE FROM lesson_learning_file_placements WHERE file_id = $1 AND lesson_id = $2`,
        [fileId, target.lessonId],
      );
    } else {
      await query(
        `DELETE FROM lms_learning_file_placements WHERE file_id = $1 AND class_session_id = $2`,
        [fileId, target.classSessionId],
      );
    }

    return res.json({ success: true, message: "Đã gỡ tài liệu khỏi bài học" });
  } catch (error) {
    console.error("Detach file error:", error);
    return sendError(res, 500, "Lỗi khi gỡ tài liệu", "INTERNAL_ERROR");
  }
});

// GET /api/admin/learning-units/:unitId/files/reusable
router.get("/admin/learning-units/:unitId/files/reusable", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.query?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const queryRes = target.unitType === "lesson"
      ? await query(
          `SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes,
                  lf.mime_type, lf.created_at
           FROM lms_learning_files lf
           WHERE (lf.course_id = $1 OR lf.course_id IS NULL)
             AND lf.status = 'ready'
             AND lf.id NOT IN (
               SELECT file_id FROM lesson_learning_file_placements WHERE lesson_id = $2
             )
           ORDER BY lf.id DESC
           LIMIT 50`,
          [target.courseId, target.lessonId],
        )
      : await query(
          `SELECT lf.id, lf.original_name AS file_name, lf.size_bytes AS file_size_bytes,
                  lf.mime_type, lf.created_at
           FROM lms_learning_files lf
           WHERE (lf.course_id = $1 OR lf.course_id IS NULL)
             AND lf.status = 'ready'
             AND lf.id NOT IN (
               SELECT file_id FROM lms_learning_file_placements WHERE class_session_id = $2
             )
           ORDER BY lf.id DESC
           LIMIT 50`,
          [target.courseId, target.classSessionId],
        );

    return res.json({
      success: true,
      data: queryRes.rows.map((r) => ({
        id: String(r.id),
        fileName: r.file_name,
        fileSizeBytes: Number(r.file_size_bytes || 0),
        mimeType: r.mime_type,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error("Fetch reusable files error:", error);
    return sendError(res, 500, "Lỗi khi tải kho tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/assignments
router.post("/admin/learning-units/:unitId/assignments", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const {
      title,
      description = "",
      assignmentType = "homework",
      maxScore = 10,
      dueDate = null,
      attachmentUrl = null,
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return sendError(res, 422, "Tiêu đề bài tập không được để trống", "VALIDATION_ERROR");
    }

    const insertRes = await query(
      `INSERT INTO assignments
         (title, description, assignment_type, max_score, due_date, attachment_url,
          course_id, live_class_id, class_session_id, lesson_id, instructor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        String(title).trim(),
        String(description || "").trim(),
        ["homework", "essay"].includes(assignmentType) ? assignmentType : "homework",
        Number(maxScore || 10),
        dueDate ? new Date(dueDate) : null,
        attachmentUrl || null,
        target.courseId,
        target.classId,
        target.classSessionId,
        target.lessonId,
        req.user.id,
      ],
    );

    return res.status(201).json({
      success: true,
      data: insertRes.rows[0],
      message: "Tạo bài tập thành công",
    });
  } catch (error) {
    console.error("Create unit assignment error:", error);
    return sendError(res, 500, "Lỗi khi tạo bài tập", "INTERNAL_ERROR");
  }
});

// DELETE /api/admin/learning-units/:unitId/assignments/:assignmentId
router.delete("/admin/learning-units/:unitId/assignments/:assignmentId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!assignmentId) return sendError(res, 422, "assignmentId không hợp lệ", "VALIDATION_ERROR");

    const deleted = await query("DELETE FROM assignments WHERE id = $1 RETURNING id", [assignmentId]);
    if (deleted.rows.length === 0) return sendError(res, 404, "Không tìm thấy bài tập", "NOT_FOUND");

    return res.json({ success: true, message: "Đã xóa bài tập" });
  } catch (error) {
    console.error("Delete assignment error:", error);
    return sendError(res, 500, "Lỗi khi xóa bài tập", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/quizzes
router.post("/admin/learning-units/:unitId/quizzes", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const {
      title,
      description = "",
      durationMinutes = 30,
      passingScore = 60,
      status = "PUBLISHED",
      questions = [],
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return sendError(res, 422, "Tiêu đề đề trắc nghiệm không được để trống", "VALIDATION_ERROR");
    }

    const quizRes = await query(
      `INSERT INTO quizzes
         (title, description, duration_minutes, passing_score, status,
          course_id, live_class_id, class_session_id, lesson_id, instructor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        String(title).trim(),
        String(description || "").trim(),
        Number(durationMinutes || 30),
        Number(passingScore || 60),
        ["DRAFT", "PUBLISHED"].includes(status) ? status : "PUBLISHED",
        target.courseId,
        target.classId,
        target.classSessionId,
        target.lessonId,
        req.user.id,
      ],
    );

    const quiz = quizRes.rows[0];

    // Insert questions if provided
    if (Array.isArray(questions) && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.questionText) continue;
        const rawQType = String(q.questionType || "single_choice").trim().toLowerCase();
        const normalizedQType = ["single_choice", "multiple_choice", "true_false", "reading_item", "fill_blank_item", "essay", "translation"].includes(rawQType)
          ? rawQType
          : "single_choice";
        await query(
          `INSERT INTO quiz_questions
             (quiz_id, question_text, question_type, options_json, correct_answer, explanation, points, sort_order)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
          [
            quiz.id,
            String(q.questionText).trim(),
            normalizedQType,
            JSON.stringify(Array.isArray(q.options) ? q.options.map((opt, idx) => ({
              key: ["A", "B", "C", "D", "E"][idx] || String(idx + 1),
              text: typeof opt === "string" ? opt : (opt?.text || ""),
            })) : (q.optionsJson || [])),
            String(q.correctAnswer ?? "A"),
            q.explanation ? String(q.explanation).trim() : null,
            Number(q.points || 1),
            Number(q.sortOrder ?? i + 1),
          ],
        );
      }
    }

    return res.status(201).json({
      success: true,
      data: quiz,
      message: "Tạo bài trắc nghiệm thành công",
    });
  } catch (error) {
    console.error("Create unit quiz error:", error);
    return sendError(res, 500, "Lỗi khi tạo bài trắc nghiệm", "INTERNAL_ERROR");
  }
});

// DELETE /api/admin/learning-units/:unitId/quizzes/:quizId
router.delete("/admin/learning-units/:unitId/quizzes/:quizId", protectRoute, requireAdmin, async (req, res) => {
  try {
    const quizId = parsePositiveId(req.params.quizId);
    if (!quizId) return sendError(res, 422, "quizId không hợp lệ", "VALIDATION_ERROR");

    const deleted = await query("DELETE FROM quizzes WHERE id = $1 RETURNING id", [quizId]);
    if (deleted.rows.length === 0) return sendError(res, 404, "Không tìm thấy bài trắc nghiệm", "NOT_FOUND");

    return res.json({ success: true, message: "Đã xóa bài trắc nghiệm" });
  } catch (error) {
    console.error("Delete quiz error:", error);
    return sendError(res, 500, "Lỗi khi xóa bài trắc nghiệm", "INTERNAL_ERROR");
  }
});

// POST /api/admin/learning-units/:unitId/quizzes/sample-bank
router.post("/admin/learning-units/:unitId/quizzes/sample-bank", protectRoute, requireAdmin, async (req, res) => {
  try {
    const target = await resolveUnitTypeAndIds(req.params.unitId, req.body?.unitType);
    if (!target) return sendError(res, 404, "Không tìm thấy bài học hoặc buổi học", "NOT_FOUND");

    const count = Math.min(50, Math.max(1, Number(req.body?.count || 10)));
    const title = req.body?.title || `Quiz luyện tập nhanh (${count} câu)`;
    const durationMinutes = Number(req.body?.durationMinutes || 20);
    const passingScore = Number(req.body?.passingScore || 60);

    // Fetch random questions from question_bank_items
    const bankRes = await query(
      `SELECT * FROM question_bank_items
       WHERE (course_id = $1 OR course_id IS NULL)
       ORDER BY RANDOM()
       LIMIT $2`,
      [target.courseId, count],
    );

    if (bankRes.rows.length === 0) {
      return sendError(res, 422, "Ngân hàng câu hỏi chưa có câu hỏi nào cho môn học này", "NO_QUESTIONS");
    }

    const quizRes = await query(
      `INSERT INTO quizzes
         (title, description, duration_minutes, passing_score, status,
          course_id, live_class_id, class_session_id, lesson_id, instructor_id)
       VALUES ($1, $2, $3, $4, 'PUBLISHED', $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title,
        `Tự động khởi tạo từ Ngân hàng câu hỏi (${bankRes.rows.length} câu)`,
        durationMinutes,
        passingScore,
        target.courseId,
        target.classId,
        target.classSessionId,
        target.lessonId,
        req.user.id,
      ],
    );

    const quiz = quizRes.rows[0];

    for (let i = 0; i < bankRes.rows.length; i++) {
      const q = bankRes.rows[i];
      await query(
        `INSERT INTO quiz_questions
           (quiz_id, question_text, question_type, options_json, correct_answer, explanation, points, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [
          quiz.id,
          q.question_text,
          q.question_type || "single_choice",
          JSON.stringify(q.options_json || []),
          q.correct_answer,
          q.explanation,
          Number(q.default_points || 1),
          i + 1,
        ],
      );
    }

    return res.status(201).json({
      success: true,
      data: quiz,
      message: `Đã tạo đề trắc nghiệm thành công với ${bankRes.rows.length} câu hỏi`,
    });
  } catch (error) {
    console.error("Sample quiz from bank error:", error);
    return sendError(res, 500, "Lỗi khi tạo quiz từ ngân hàng câu hỏi", "INTERNAL_ERROR");
  }
});

export default router;
