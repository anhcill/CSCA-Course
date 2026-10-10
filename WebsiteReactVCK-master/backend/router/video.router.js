import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  generateUploadPresignedUrl,
  generatePlaybackSignedUrl,
  generateVideoHeadSignedUrl,
} from "../services/video.service.js";

const router = express.Router();

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

const forbidden = (res, message) => res.status(403).json({
  success: false,
  message,
  errorCode: "FORBIDDEN",
});

const serviceUnavailable = (res, message) => res.status(503).json({
  success: false,
  message,
  errorCode: "SERVICE_UNAVAILABLE",
});

const isPositiveId = (value) => /^\d+$/.test(String(value || "")) && Number(value) > 0;
const isValidR2Key = (value) => (
  typeof value === "string"
  && value.length <= 500
  && value.startsWith("videos/")
  && !value.includes("..")
  && !/[\\\s]/.test(value)
);
const isValidVideoSize = (value) => Number.isSafeInteger(Number(value))
  && Number(value) > 0
  && Number(value) <= MAX_VIDEO_SIZE_BYTES;

// POST /api/videos/upload-url - Create a teacher-owned upload intent.
router.post("/upload-url", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  try {
    const { filename, mimeType, sizeBytes } = req.body;
    if (typeof filename !== "string" || !filename.trim()) return validationError(res, "Thiếu filename");
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return validationError(res, "Định dạng video không được hỗ trợ");
    if (!isValidVideoSize(sizeBytes)) return validationError(res, "Kích thước video không hợp lệ hoặc vượt quá 1GB");

    const presignedData = await generateUploadPresignedUrl({ filename, mimeType, sizeBytes });
    const intent = await query(
      `INSERT INTO video_assets (title, r2_key, mime_type, size_bytes, duration_seconds, status, uploaded_by)
       VALUES ($1, $2, $3, $4, 0, 'pending', $5)
       RETURNING id`,
      [filename.trim().slice(0, 255), presignedData.fileKey, mimeType, Number(sizeBytes), req.user.id],
    );
    return res.json({
      success: true,
      data: { ...presignedData, assetId: intent.rows[0].id }
    });
  } catch (error) {
    console.error("Error generating video upload URL:", error);
    if (error.code === "R2_NOT_CONFIGURED") return serviceUnavailable(res, "Kho video Cloudflare R2 chưa được cấu hình");
    return res.status(500).json({ success: false, message: "Lỗi khi tạo link upload video", errorCode: "INTERNAL_ERROR" });
  }
});

// POST /api/videos/confirm - Lưu thông tin video asset vào DB sau khi upload xong
router.post("/confirm", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  try {
    const { title, r2Key, mimeType, sizeBytes, durationSeconds } = req.body;

    if (!isValidR2Key(r2Key)) return validationError(res, "r2Key không hợp lệ");
    if (typeof title !== "undefined" && (typeof title !== "string" || title.trim().length > 255)) return validationError(res, "title không hợp lệ");
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return validationError(res, "Định dạng video không được hỗ trợ");
    if (!isValidVideoSize(sizeBytes)) return validationError(res, "Kích thước video không hợp lệ hoặc vượt quá 1GB");
    if (!Number.isSafeInteger(Number(durationSeconds)) || Number(durationSeconds) < 0 || Number(durationSeconds) > 86400) {
      return validationError(res, "durationSeconds không hợp lệ");
    }

    const intent = (await query(
      `SELECT id, mime_type, size_bytes FROM video_assets
       WHERE r2_key = $1 AND uploaded_by = $2 AND status = 'pending'`,
      [r2Key, req.user.id],
    )).rows[0];
    if (!intent) return forbidden(res, "Video chưa được cấp quyền upload hoặc đã xác nhận");
    if (intent.mime_type !== mimeType || Number(intent.size_bytes) !== Number(sizeBytes)) {
      return validationError(res, "Thông tin video không khớp với yêu cầu upload");
    }

    const { headUrl } = await generateVideoHeadSignedUrl({ r2Key });
    const headResponse = await fetch(headUrl, { method: "HEAD" });
    if (!headResponse.ok) return validationError(res, "Không tìm thấy video trên R2");
    const uploadedSize = Number(headResponse.headers.get("content-length"));
    if (!Number.isSafeInteger(uploadedSize) || uploadedSize !== Number(intent.size_bytes)) {
      return validationError(res, "Kích thước video trên R2 không khớp");
    }

    const dbRes = await query(
      `UPDATE video_assets SET title = $1, duration_seconds = $2, status = 'ready', updated_at = NOW()
       WHERE id = $3 AND uploaded_by = $4 AND status = 'pending'
       RETURNING id, title, r2_key, mime_type, size_bytes, duration_seconds, status, created_at, updated_at`,
      [title?.trim() || "Video Bài Giảng", Number(durationSeconds), intent.id, req.user.id],
    );
    if (!dbRes.rows.length) return forbidden(res, "Video đã được xác nhận");

    return res.json({
      success: true,
      data: dbRes.rows[0],
      message: "Lưu thông tin video bài giảng thành công"
    });
  } catch (error) {
    console.error("Error confirming video asset:", error);
    if (error.code === "R2_NOT_CONFIGURED") return serviceUnavailable(res, "Kho video Cloudflare R2 chưa được cấu hình");
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Video đã tồn tại", errorCode: "CONFLICT" });
    return res.status(500).json({ success: false, message: "Lỗi khi xác nhận thông tin video", errorCode: "INTERNAL_ERROR" });
  }
});

// GET /api/videos/playback-url - Lấy link xem video signed riêng tư
router.get("/playback-url", protectRoute, async (req, res) => {
  try {
    const { lessonId } = req.query;
    if (!isPositiveId(lessonId)) return validationError(res, "lessonId không hợp lệ");

    const assetResult = await query(
      `SELECT va.id, va.r2_key, l.course_id, c.is_published AS course_is_published, c.author_id
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       JOIN video_assets va ON va.id = l.video_asset_id AND va.status = 'ready'
       WHERE l.id = $1 AND l.is_published = true`,
      [lessonId],
    );
    if (assetResult.rows.length === 0) {
      return notFound(res, "Không tìm thấy video bài học");
    }

    const asset = assetResult.rows[0];
    if (req.user.role === "user") {
      if (!asset.course_is_published) return notFound(res, "Không tìm thấy video bài học");
      if (!hasActiveStudentLmsAccess(req.user)) {
        return forbidden(res, "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực");
      }
      const enrollmentResult = await query(
        `SELECT 1 FROM lms_access_grants
         WHERE user_id = $1 AND course_id = $2 AND access_status = 'active'
           AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW())`,
        [req.user.id, asset.course_id],
      );
      if (enrollmentResult.rows.length === 0) return forbidden(res, "Bạn chưa được cấp quyền học khóa này");
    } else if (req.user.role === "creator" && String(asset.author_id) !== String(req.user.id)) {
      return forbidden(res, "Bạn không có quyền xem video của khóa học này");
    }

    const playbackData = await generatePlaybackSignedUrl({ r2Key: asset.r2_key });
    return res.json({
      success: true,
      data: { ...playbackData, lessonId: Number(lessonId) },
    });
  } catch (error) {
    console.error("Error generating playback URL:", error);
    if (error.code === "R2_NOT_CONFIGURED") return serviceUnavailable(res, "Kho video Cloudflare R2 chưa được cấu hình");
    return res.status(500).json({ success: false, message: "Lỗi khi tạo link xem video", errorCode: "INTERNAL_ERROR" });
  }
});

export default router;
