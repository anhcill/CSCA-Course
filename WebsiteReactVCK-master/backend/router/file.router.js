import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  ALLOWED_LEARNING_FILE_MIME_TYPES,
  MAX_LEARNING_FILE_SIZE_BYTES,
  generateLearningFileUploadPresignedUrl,
  generateLearningFilePlaybackSignedUrl,
  generateLearningFileHeadSignedUrl,
} from "../services/video.service.js";
import { createCloudinaryUploadSignature } from "../services/cloudinary.service.js";

const router = express.Router();

const errorResponse = (res, status, message, errorCode) => res.status(status).json({
  success: false, message, errorCode,
});

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const safeFilename = (value) => typeof value === "string" && value.trim() && value.trim().length <= 255;

const classAccess = async (classId, user) => {
  const result = await query(
    `SELECT lc.id, lc.course_id, lc.instructor_id, lc.title,
            COALESCE(c.title, c.name) AS course_title,
            COALESCE(c.is_management_managed, FALSE) AS is_management_managed
     FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id
     WHERE lc.id = $1 AND lc.status <> 'cancelled'`,
    [classId],
  );
  const liveClass = result.rows[0];
  if (!liveClass) return { error: "not_found" };
  if (user.role === "admin" || String(liveClass.instructor_id) === String(user.id)) return { liveClass, canManage: true };
  if (user.role === "creator") {
    const teacher = await query(
      `SELECT 1 FROM class_teachers
       WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'`,
      [liveClass.id, user.id],
    );
    if (teacher.rows.length > 0) return { liveClass, canManage: true };
  }
  if (user.role !== "user") return { error: "forbidden" };
  const access = await query(
    `SELECT 1
     FROM class_enrollments ce
     WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
       AND (
         $3::boolean = FALSE
         OR EXISTS (
           SELECT 1 FROM lms_access_grants g
           WHERE g.course_id = $4 AND g.user_id = $2 AND g.access_status = 'active'
             AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
         )
       )`,
    [classId, user.id, Boolean(liveClass.is_management_managed), liveClass.course_id],
  );
  return access.rows.length ? { liveClass, canManage: false } : { error: "forbidden" };
};

// Course-scoped files are used for shared course material and quiz papers.
// A teacher may manage them when they own the course or teach an active class of it.
const courseAccess = async (courseId, user) => {
  const result = await query(
    `SELECT c.id, c.author_id
     FROM courses c WHERE c.id = $1`,
    [courseId],
  );
  const course = result.rows[0];
  if (!course) return { error: "not_found" };
  if (user.role === "admin" || String(course.author_id) === String(user.id)) return { course, canManage: true };
  if (user.role === "creator") {
    const teacher = await query(
      `SELECT 1
       FROM live_classes lc
       LEFT JOIN class_teachers ct ON ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
       WHERE lc.course_id = $1 AND lc.status = 'active'
         AND (lc.instructor_id = $2 OR ct.teacher_id IS NOT NULL)
       LIMIT 1`,
      [courseId, user.id],
    );
    if (teacher.rows.length > 0) return { course, canManage: true };
  }
  return { error: "forbidden" };
};

const fileAccess = async (fileId, user) => {
  const result = await query(
    `SELECT f.*, lc.instructor_id, lc.course_id AS class_course_id,
            COALESCE(course_scope.is_management_managed, FALSE) AS is_management_managed
     FROM lms_learning_files f
     LEFT JOIN live_classes lc ON lc.id = f.live_class_id
     LEFT JOIN courses course_scope ON course_scope.id = COALESCE(f.course_id, lc.course_id)
     WHERE f.id = $1 AND f.status = 'ready'`,
    [fileId],
  );
  const file = result.rows[0];
  if (!file) return { error: "not_found" };
  if (user.role === "admin" || String(file.uploaded_by) === String(user.id) || String(file.instructor_id) === String(user.id)) return { file };
  if (user.role === "creator" && file.live_class_id) {
    const classTeacher = await query(
      `SELECT 1 FROM class_teachers
       WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'`,
      [file.live_class_id, user.id],
    );
    if (classTeacher.rows.length > 0) return { file };
  }
  if (user.role !== "user") return { error: "forbidden" };
  const access = await query(
    `SELECT 1
     FROM class_enrollments ce
     WHERE $1::bigint IS NOT NULL AND ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
       AND ($4::boolean = FALSE OR EXISTS (
         SELECT 1 FROM lms_access_grants g
         WHERE g.course_id = $3 AND g.user_id = $2 AND g.access_status = 'active'
           AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       ))
     UNION ALL
     SELECT 1
     FROM enrollments e
     WHERE $1::bigint IS NULL AND $4::boolean = FALSE AND $3::bigint IS NOT NULL
       AND e.course_id = $3 AND e.user_id = $2 AND e.status = 'active'
     UNION ALL
     SELECT 1
     FROM lms_access_grants g
     WHERE $1::bigint IS NULL AND $3::bigint IS NOT NULL AND g.course_id = $3 AND g.user_id = $2
       AND g.access_status = 'active' AND g.valid_from <= NOW()
       AND (g.valid_until IS NULL OR g.valid_until > NOW())
     LIMIT 1`,
    [file.live_class_id, user.id, file.course_id || file.class_course_id, Boolean(file.is_management_managed)],
  );
  return access.rows.length ? { file } : { error: "forbidden" };
};

const serializeFile = (row) => ({
  id: String(row.id),
  name: row.original_name,
  sizeBytes: Number(row.size_bytes),
  mimeType: row.mime_type,
  uploadedAt: row.created_at,
  uploadedBy: row.uploaded_by_name || row.uploader_email || "Giáo viên",
  courseTitle: row.course_title || null,
  classSessionId: row.class_session_id ? String(row.class_session_id) : null,
  sessionTitle: row.session_title || null,
  visibility: row.visibility,
  downloadUrl: `/api/files/${row.id}/download`,
});

// POST /api/teacher/courses/:courseId/files/upload-url
// PDF sources are intentionally course scoped so every authorised learner can
// open the paper in the protected quiz player.
router.post("/teacher/courses/:courseId/files/upload-url", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const { filename, mimeType, sizeBytes } = req.body || {};
  if (!courseId || !safeFilename(filename) || mimeType !== "application/pdf") {
    return errorResponse(res, 422, "Đề quiz phải là file PDF hợp lệ", "VALIDATION_ERROR");
  }
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_LEARNING_FILE_SIZE_BYTES) {
    return errorResponse(res, 422, "Kích thước file PDF phải từ 1 byte đến 100MB", "VALIDATION_ERROR");
  }
  try {
    const access = await courseAccess(courseId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy khóa học", "NOT_FOUND");
    if (access.error || !access.canManage) return errorResponse(res, 403, "Bạn không có quyền tải đề lên khóa học này", "FORBIDDEN");
    const upload = await generateLearningFileUploadPresignedUrl({ userId: req.user.id, filename, mimeType, sizeBytes });
    const result = await query(
      `INSERT INTO lms_learning_files
         (course_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'COURSE', 'pending')
       RETURNING id`,
      [courseId, req.user.id, filename.trim(), upload.fileKey, mimeType, Number(sizeBytes)],
    );
    return res.status(201).json({ success: true, data: { fileId: String(result.rows[0].id), ...upload } });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error creating quiz paper upload:", error);
    return errorResponse(res, 500, "Không thể tạo upload đề quiz", "INTERNAL_ERROR");
  }
});

// GET /api/teacher/classes/:classId/files
router.get("/teacher/classes/:classId/files", protectRoute, requireTeacher, async (req, res) => {
  const classId = parseId(req.params.classId);
  const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
  if (!classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  if (req.query.sessionId !== undefined && !sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await classAccess(classId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    if (access.error) return errorResponse(res, 403, "Bạn không có quyền xem tài liệu lớp này", "FORBIDDEN");
    if (sessionId) {
      const session = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2", [sessionId, classId]);
      if (session.rows.length === 0) return errorResponse(res, 404, "Không tìm thấy buổi học của lớp này", "NOT_FOUND");
    }
    const files = await query(
      `SELECT f.*, u.username AS uploaded_by_name, u.email AS uploader_email,
              COALESCE(c.title, c.name) AS course_title, cs.title AS session_title
       FROM lms_learning_files f
       JOIN users u ON u.id = f.uploaded_by
       LEFT JOIN courses c ON c.id = f.course_id
       LEFT JOIN class_sessions cs ON cs.id = f.class_session_id
       WHERE f.live_class_id = $1 AND f.status = 'ready'
         AND ($2::bigint IS NULL OR f.class_session_id = $2)
       ORDER BY f.created_at DESC, f.id DESC`,
      [classId, sessionId],
    );
    return res.json({ success: true, data: files.rows.map(serializeFile) });
  } catch (error) {
    console.error("Error listing class files:", error);
    return errorResponse(res, 500, "Không thể tải tài liệu lớp học", "INTERNAL_ERROR");
  }
});

// POST /api/teacher/classes/:classId/files/upload-url
router.post("/teacher/classes/:classId/files/upload-url", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const classId = parseId(req.params.classId);
  const { filename, mimeType, sizeBytes, visibility = "CLASS_ONLY" } = req.body || {};
  const classSessionId = parseId(req.body?.classSessionId);
  if (!classId || !safeFilename(filename) || !ALLOWED_LEARNING_FILE_MIME_TYPES.has(mimeType)) {
    return errorResponse(res, 422, "Thông tin tài liệu không hợp lệ", "VALIDATION_ERROR");
  }
  if (req.body?.classSessionId !== undefined && !classSessionId) return errorResponse(res, 422, "classSessionId không hợp lệ", "VALIDATION_ERROR");
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_LEARNING_FILE_SIZE_BYTES) {
    return errorResponse(res, 422, "Kích thước tài liệu phải từ 1 byte đến 100MB", "VALIDATION_ERROR");
  }
  if (!["CLASS_ONLY", "COURSE", "PRIVATE"].includes(visibility)) return errorResponse(res, 422, "visibility không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await classAccess(classId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    if (access.error || !access.canManage) return errorResponse(res, 403, "Bạn không có quyền tải tài liệu lên lớp này", "FORBIDDEN");
    if (classSessionId) {
      const session = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'", [classSessionId, classId]);
      if (session.rows.length === 0) return errorResponse(res, 422, "Buổi học không thuộc lớp đã chọn hoặc đã bị hủy", "VALIDATION_ERROR");
    }
    const upload = await generateLearningFileUploadPresignedUrl({ userId: req.user.id, filename, mimeType, sizeBytes });
    const result = await query(
      `INSERT INTO lms_learning_files
         (live_class_id, course_id, class_session_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id, original_name, storage_key, mime_type, size_bytes, visibility, status`,
      [classId, access.liveClass.course_id, classSessionId, req.user.id, filename.trim(), upload.fileKey, mimeType, Number(sizeBytes), visibility],
    );
    return res.status(201).json({ success: true, data: { fileId: String(result.rows[0].id), ...upload } });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error creating learning file upload:", error);
    return errorResponse(res, 500, "Không thể tạo upload tài liệu", "INTERNAL_ERROR");
  }
});

// POST /api/teacher/files/:fileId/confirm
router.post("/teacher/files/:fileId/confirm", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const fileId = parseId(req.params.fileId);
  if (!fileId) return errorResponse(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");
  try {
    const file = (await query("SELECT * FROM lms_learning_files WHERE id = $1", [fileId])).rows[0];
    if (!file) return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    const access = file.live_class_id
      ? await classAccess(file.live_class_id, req.user)
      : await courseAccess(file.course_id, req.user);
    if (access.error || !access.canManage || String(file.uploaded_by) !== String(req.user.id)) return errorResponse(res, 403, "Bạn không có quyền xác nhận tài liệu này", "FORBIDDEN");
    const { headUrl } = await generateLearningFileHeadSignedUrl({ r2Key: file.storage_key });
    const headResponse = await fetch(headUrl, { method: "HEAD" });
    if (!headResponse.ok) {
      await query("UPDATE lms_learning_files SET status = 'failed' WHERE id = $1", [fileId]);
      return errorResponse(res, 422, "Không tìm thấy object tài liệu trên R2", "UPLOAD_NOT_FOUND");
    }
    const result = await query("UPDATE lms_learning_files SET status = 'ready' WHERE id = $1 RETURNING *", [fileId]);
    await recordAuditEvent({ actorId: req.user.id, action: "learning_file.confirmed", entityType: "learning_file", entityId: fileId, afterState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, data: serializeFile(result.rows[0]) });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error confirming learning file:", error);
    return errorResponse(res, 500, "Không thể xác nhận tài liệu", "INTERNAL_ERROR");
  }
});

// GET /api/student/files
router.get("/student/files", protectRoute, async (req, res) => {
  if (req.user.role !== "user") return errorResponse(res, 403, "Chỉ học viên mới dùng endpoint này", "FORBIDDEN");
  try {
    const courseId = req.query.courseId === undefined ? null : parseId(req.query.courseId);
    if (req.query.courseId !== undefined && !courseId) {
      return errorResponse(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
    }
    const classId = req.query.classId === undefined ? null : parseId(req.query.classId);
    if (req.query.classId !== undefined && !classId) {
      return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
    }
    if (classId && !courseId) {
      return errorResponse(res, 422, "classId cần đi kèm courseId", "VALIDATION_ERROR");
    }
    const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
    if (req.query.sessionId !== undefined && !sessionId) {
      return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    }
    if (sessionId && !classId) {
      return errorResponse(res, 422, "sessionId cần đi kèm classId", "VALIDATION_ERROR");
    }
    if (classId) {
      const classAccessResult = await query(
        `SELECT 1 FROM live_classes lc
         JOIN class_enrollments ce ON ce.live_class_id = lc.id
         LEFT JOIN courses c ON c.id = lc.course_id
         WHERE lc.id = $1 AND lc.course_id = $2 AND lc.status = 'active'
           AND ce.user_id = $3 AND ce.status = 'active'
           AND (COALESCE(c.is_management_managed, FALSE) = FALSE OR EXISTS (
             SELECT 1 FROM lms_access_grants g
             WHERE g.user_id = $3 AND g.course_id = lc.course_id AND g.access_status = 'active'
               AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
           ))`,
        [classId, courseId, req.user.id],
      );
      if (classAccessResult.rows.length === 0) {
        return errorResponse(res, 403, "Bạn không có quyền xem tài liệu của lớp này", "FORBIDDEN");
      }
      if (sessionId) {
        const sessionAccess = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2", [sessionId, classId]);
        if (sessionAccess.rows.length === 0) return errorResponse(res, 404, "Không tìm thấy buổi học của lớp này", "NOT_FOUND");
      }
    }
    const result = await query(
      `SELECT DISTINCT f.*, COALESCE(c.title, c.name) AS course_title,
              u.username AS uploaded_by_name, u.email AS uploader_email, cs.title AS session_title
       FROM lms_learning_files f
       LEFT JOIN courses c ON c.id = f.course_id
       LEFT JOIN live_classes lc ON lc.id = f.live_class_id
       LEFT JOIN class_sessions cs ON cs.id = f.class_session_id
       LEFT JOIN users u ON u.id = f.uploaded_by
         WHERE f.status = 'ready'
         AND ($2::bigint IS NULL OR COALESCE(f.course_id, lc.course_id) = $2)
         AND ($3::bigint IS NULL OR f.live_class_id IS NULL OR f.live_class_id = $3)
         AND ($4::bigint IS NULL OR f.class_session_id = $4)
         AND (
           (f.live_class_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM class_enrollments ce
             LEFT JOIN courses class_course ON class_course.id = lc.course_id
             WHERE ce.live_class_id = f.live_class_id AND ce.user_id = $1 AND ce.status = 'active'
               AND (COALESCE(class_course.is_management_managed, FALSE) = FALSE OR EXISTS (
                 SELECT 1 FROM lms_access_grants g
                 WHERE g.user_id = $1 AND g.course_id = class_course.id AND g.access_status = 'active'
                   AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
               ))
           ))
           OR (f.course_id IS NOT NULL AND (
             (COALESCE(c.is_management_managed, FALSE) = FALSE
              AND EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = f.course_id AND e.user_id = $1 AND e.status = 'active'))
             OR EXISTS (SELECT 1 FROM lms_access_grants g WHERE g.course_id = f.course_id AND g.user_id = $1 AND g.access_status = 'active'
                       AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW()))
           ))
       )
       ORDER BY f.created_at DESC, f.id DESC`,
      [req.user.id, courseId, classId, sessionId],
    );
    return res.json({ success: true, data: result.rows.map(serializeFile) });
  } catch (error) {
    console.error("Error listing student files:", error);
    return errorResponse(res, 500, "Không thể tải tài liệu học tập", "INTERNAL_ERROR");
  }
});

const canDeleteFile = async (fileId, user) => {
  const result = await query("SELECT id, uploaded_by, live_class_id, course_id, storage_key, status FROM lms_learning_files WHERE id = $1", [fileId]);
  const file = result.rows[0];
  if (!file) return { error: "not_found" };
  if (user.role === "admin" || String(file.uploaded_by) === String(user.id)) return { file };
  if (user.role === "creator") {
    if (file.live_class_id) {
      const owner = await query("SELECT instructor_id FROM live_classes WHERE id = $1", [file.live_class_id]);
      if (String(owner.rows[0]?.instructor_id) === String(user.id)) return { file };
    } else if (file.course_id) {
      const access = await courseAccess(file.course_id, user);
      if (!access.error && access.canManage) return { file };
    }
  }
  return { error: "forbidden" };
};

router.delete("/teacher/files/:fileId", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const fileId = parseId(req.params.fileId);
  if (!fileId) return errorResponse(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await canDeleteFile(fileId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    if (access.error) return errorResponse(res, 403, "Bạn không có quyền xóa tài liệu", "FORBIDDEN");
    await query("UPDATE lms_learning_files SET status = 'deleted' WHERE id = $1", [fileId]);
    await recordAuditEvent({ actorId: req.user.id, action: "learning_file.deleted", entityType: "learning_file", entityId: fileId, metadata: { ip: req.ip } });
    return res.json({ success: true, message: "Đã xóa tài liệu" });
  } catch (error) {
    console.error("Error deleting learning file:", error);
    return errorResponse(res, 500, "Không thể xóa tài liệu", "INTERNAL_ERROR");
  }
});

router.get("/files/:fileId/download", protectRoute, async (req, res) => {
  const fileId = parseId(req.params.fileId);
  if (!fileId) return errorResponse(res, 422, "fileId không hợp lệ", "VALIDATION_ERROR");
  try {
    const access = await fileAccess(fileId, req.user);
    if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy tài liệu", "NOT_FOUND");
    if (access.error) return errorResponse(res, 403, "Bạn chưa được cấp quyền tải tài liệu", "FORBIDDEN");
    const { downloadUrl } = await generateLearningFilePlaybackSignedUrl({ r2Key: access.file.storage_key });
    return res.redirect(302, downloadUrl);
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error opening learning file:", error);
    return errorResponse(res, 500, "Không thể mở tài liệu", "INTERNAL_ERROR");
  }
});

router.post("/files/cloudinary-signature", protectRoute, requireTeacher, requirePermission("lms.file.manage"), async (req, res) => {
  const folder = typeof req.body?.folder === "string" && req.body.folder.trim()
    ? req.body.folder.trim().slice(0, 120)
    : "csca/lms";
  const resourceType = ["image", "raw", "video", "auto"].includes(req.body?.resourceType) ? req.body.resourceType : "auto";
  try {
    return res.json({ success: true, data: createCloudinaryUploadSignature({ folder, resourceType }) });
  } catch (error) {
    if (error.code === "CLOUDINARY_NOT_CONFIGURED") return errorResponse(res, 503, "Cloudinary chưa được cấu hình", error.code);
    console.error("Error creating Cloudinary signature:", error);
    return errorResponse(res, 500, "Không thể tạo chữ ký Cloudinary", "INTERNAL_ERROR");
  }
});

export default router;
