import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  generateUploadPresignedUrl,
  generatePlaybackSignedUrl,
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

// POST /api/videos/upload-url - Admin xin link presigned upload R2
router.post("/upload-url", protectRoute, requireTeacher, async (req, res) => {
  try {
    const { filename, mimeType, sizeBytes } = req.body;
    if (typeof filename !== "string" || !filename.trim()) return validationError(res, "Thiếu filename");
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return validationError(res, "Định dạng video không được hỗ trợ");
    if (!isValidVideoSize(sizeBytes)) return validationError(res, "Kích thước video không hợp lệ hoặc vượt quá 1GB");

    const presignedData = await generateUploadPresignedUrl({ filename, mimeType, sizeBytes });
    return res.json({
      success: true,
      data: presignedData
    });
  } catch (error) {
    console.error("Error generating video upload URL:", error);
    if (error.code === "R2_NOT_CONFIGURED") return serviceUnavailable(res, "Kho video Cloudflare R2 chưa được cấu hình");
    return res.status(500).json({ success: false, message: "Lỗi khi tạo link upload video", errorCode: "INTERNAL_ERROR" });
  }
});

// POST /api/videos/confirm - Lưu thông tin video asset vào DB sau khi upload xong
router.post("/confirm", protectRoute, requireTeacher, async (req, res) => {
  try {
    const { title, r2Key, mimeType, sizeBytes, durationSeconds } = req.body;

    if (!isValidR2Key(r2Key)) return validationError(res, "r2Key không hợp lệ");
    if (typeof title !== "undefined" && (typeof title !== "string" || title.trim().length > 255)) return validationError(res, "title không hợp lệ");
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return validationError(res, "Định dạng video không được hỗ trợ");
    if (!isValidVideoSize(sizeBytes)) return validationError(res, "Kích thước video không hợp lệ hoặc vượt quá 1GB");
    if (!Number.isSafeInteger(Number(durationSeconds)) || Number(durationSeconds) < 0 || Number(durationSeconds) > 86400) {
      return validationError(res, "durationSeconds không hợp lệ");
    }

    const dbRes = await query(
      `INSERT INTO video_assets (title, r2_key, mime_type, size_bytes, duration_seconds, status)
       VALUES ($1, $2, $3, $4, $5, 'ready')
       ON CONFLICT (r2_key) DO UPDATE SET
         title = EXCLUDED.title,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         duration_seconds = EXCLUDED.duration_seconds,
         status = 'ready',
         updated_at = NOW()
       RETURNING id, title, r2_key, mime_type, size_bytes, duration_seconds, status, created_at, updated_at`,
      [title?.trim() || "Video Bài Giảng", r2Key, mimeType, Number(sizeBytes), Number(durationSeconds)],
    );

    return res.json({
      success: true,
      data: dbRes.rows[0],
      message: "Lưu thông tin video bài giảng thành công"
    });
  } catch (error) {
    console.error("Error confirming video asset:", error);
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
      const enrollmentResult = await query(
        "SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'",
        [req.user.id, asset.course_id],
      );
      if (enrollmentResult.rows.length === 0) return forbidden(res, "Bạn chưa đăng ký khóa học này");
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
