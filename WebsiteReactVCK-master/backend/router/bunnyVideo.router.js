import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  TRUSTED_DEVICE_COOKIE,
  hashOpaqueToken,
} from "../services/trustedDevice.service.js";
import {
  BunnyStreamError,
  createBunnyUploadIntent,
  processBunnyWebhookEvent,
  generateBunnySignedPlayback,
  recordVideoWatchProgress,
  deleteBunnyVideo,
} from "../services/bunnyStream.service.js";

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
  res.setHeader("Cache-Control", "private, no-store");
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

  // Trusted device check: if user has registered trusted devices, verify current device or active session isn't revoked
  const deviceToken = req?.cookies?.[TRUSTED_DEVICE_COOKIE] || null;
  if (deviceToken) {
    const tokenHash = hashOpaqueToken(deviceToken);
    const devRes = await db.query(
      `SELECT id, revoked_at FROM trusted_login_devices
       WHERE user_id = $1 AND device_token_hash = $2
       ORDER BY id DESC LIMIT 1`,
      [user.id, tokenHash],
    );
    if (devRes.rows[0] && devRes.rows[0].revoked_at !== null) {
      return {
        allowed: false,
        status: 403,
        errorCode: "TRUSTED_DEVICE_REVOKED",
        reason: "Thiết bị này đã bị quản trị viên gỡ quyền truy cập",
      };
    }
  }

  if (courseId) {
    const grantRes = await db.query(
      `SELECT 1 FROM lms_access_grants g
       WHERE g.user_id = $1 AND g.course_id = $2
         AND g.access_status = 'active'
         AND g.valid_from <= NOW()
         AND (g.valid_until IS NULL OR g.valid_until > NOW())`,
      [user.id, courseId],
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
      return {
        allowed: false,
        status: 403,
        errorCode: "RECORD_MEMBERSHIP_REQUIRED",
        reason: "Học viên lớp Live không có quyền truy cập khóa Record nếu chưa đăng ký gói Record",
      };
    }
  } else if (courseId && requireRecordingMode) {
    // Independent mode: an entitlement alone is insufficient. The learner
    // must belong to an active paid Record offering for this course.
    const enrollsRes = await db.query(
      `SELECT ce.learning_mode
       FROM class_enrollments ce
       LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
       WHERE ce.user_id = $1 AND ce.status = 'active'
         AND (lc.course_id = $2 OR ce.course_id = $2)`,
      [user.id, courseId],
    );
    const hasRecordMode = enrollsRes.rows.some((r) => r.learning_mode === "recording");
    if (!hasRecordMode) {
      return {
        allowed: false,
        status: 403,
        errorCode: "RECORD_MEMBERSHIP_REQUIRED",
        reason: "Bạn chưa có membership lớp Record đang hoạt động cho khóa học này",
      };
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

    if (isPublished && asset.playback_status !== "ready") {
      return sendError(res, 409, "Chỉ được publish khi video đã encode hoàn tất (ready)", "VIDEO_NOT_READY");
    }

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
        Boolean(isPublished),
      ],
    );

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

    if (isPublished) {
      await query(
        `UPDATE video_assets SET published_at = COALESCE(published_at, NOW()), updated_at = NOW() WHERE id = $1`,
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
        isPublished: placement.is_published,
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
        isPublished: placement.is_published,
        playbackStatus: asset.playback_status,
      },
      message: "Gắn video vào bài học thành công",
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
       SET published_at = COALESCE(published_at, NOW()), updated_at = NOW()
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
       SET published_at = NULL, updated_at = NOW()
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
          return sendError(res, accessCheck.status, accessCheck.reason, accessCheck.errorCode);
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

    return res.json({
      success: true,
      data: {
        ...signedPlayback,
        watchProgress,
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
        return sendError(res, accessCheck.status, accessCheck.reason, accessCheck.errorCode);
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
      description = null,
      variablesExplanation = [],
      orderIndex = 0,
    } = req.body || {};

    if (!nameVi || !latexExpression) {
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
        String(latexExpression).trim(),
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

export default router;
