import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import requireActiveStudentLmsAccess from "../middleware/requireActiveStudentLmsAccess.js";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  ALLOWED_LEARNING_FILE_MIME_TYPES,
  MAX_LEARNING_FILE_SIZE_BYTES,
  generateLearningFileUploadPresignedUrl,
  generateLearningFilePlaybackSignedUrl,
  generateLearningFileHeadSignedUrl,
  deleteLearningFileObject,
} from "../services/video.service.js";
import { createCloudinaryUploadSignature } from "../services/cloudinary.service.js";

const router = express.Router();

const errorResponse = (res, status, message, errorCode) => res.status(status).json({
  success: false, message, errorCode,
});

const requireManagedLearner = (req, res, next) => (
  req.user?.role === "user" ? requireActiveStudentLmsAccess(req, res, next) : next()
);

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const safeFilename = (value) => typeof value === "string" && value.trim() && value.trim().length <= 255;

const classAccess = async (classId, user) => {
  const result = await query(
    `SELECT lc.id, lc.course_id, lc.instructor_id, lc.title,
            COALESCE(c.title, c.name) AS course_title
     FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id
     WHERE lc.id = $1 AND lc.status <> 'cancelled'`,
    [classId],
  );
  const liveClass = result.rows[0];
  if (!liveClass) return { error: "not_found" };
  if (user.role === "admin") return { liveClass, canManage: true };
  if (user.role === "creator") {
    const teacher = await query(
      `SELECT 1 FROM class_teachers
       WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'
       UNION ALL
       SELECT 1 WHERE $3::bigint = $2
         AND NOT EXISTS (SELECT 1 FROM class_teachers
                         WHERE live_class_id = $1 AND teacher_id = $2 AND status <> 'active')
       LIMIT 1`,
      [liveClass.id, user.id, liveClass.instructor_id],
    );
    if (teacher.rows.length > 0) return { liveClass, canManage: true };
  }
  if (user.role !== "user") return { error: "forbidden" };
  const access = await query(
    `SELECT 1
     FROM class_enrollments ce
     WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
       AND EXISTS (
         SELECT 1 FROM lms_access_grants g
         WHERE g.course_id = $3 AND g.user_id = $2 AND g.access_status = 'active'
           AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       )`,
    [classId, user.id, liveClass.course_id],
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
         AND (ct.teacher_id IS NOT NULL OR (lc.instructor_id = $2
           AND NOT EXISTS (SELECT 1 FROM class_teachers revoked
                           WHERE revoked.live_class_id = lc.id AND revoked.teacher_id = $2
                             AND revoked.status <> 'active')))
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
            course_scope.id AS scoped_course_id
     FROM lms_learning_files f
     LEFT JOIN live_classes lc ON lc.id = f.live_class_id
     LEFT JOIN courses course_scope ON course_scope.id = COALESCE(f.course_id, lc.course_id)
     WHERE f.id = $1 AND f.status = 'ready'`,
    [fileId],
  );
  const file = result.rows[0];
  if (!file) return { error: "not_found" };
  if (user.role === "admin") return { file };
  if (user.role === "creator") {
    const scope = file.live_class_id
      ? await classAccess(file.live_class_id, user)
      : await courseAccess(file.course_id, user);
    if (scope.error || !scope.canManage) return { error: "forbidden" };
    if (file.visibility === "PRIVATE" && String(file.uploaded_by) !== String(user.id)) return { error: "forbidden" };
    return { file };
  }
  if (user.role !== "user") return { error: "forbidden" };
  if (file.visibility === "PRIVATE") return { error: "forbidden" };
  const access = await query(
    `SELECT 1 FROM lms_access_grants g
     WHERE g.course_id = $3 AND g.user_id = $2 AND g.access_status = 'active'
       AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       AND ($4 = 'COURSE' OR ($4 = 'CLASS_ONLY' AND $1::bigint IS NOT NULL
         AND EXISTS (SELECT 1 FROM live_classes lc
                     JOIN class_enrollments ce ON ce.live_class_id = lc.id
                     WHERE lc.id = $1 AND lc.status = 'active'
                       AND ce.user_id = $2 AND ce.status = 'active')))
     LIMIT 1`,
    [file.live_class_id, user.id, file.live_class_id ? file.class_course_id : file.course_id, file.visibility],
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
  courseId: row.course_id ? String(row.course_id) : (row.class_course_id ? String(row.class_course_id) : null),
  courseTitle: row.course_title || null,
  courseCategory: row.course_category || null,
  classId: row.live_class_id ? String(row.live_class_id) : null,
  classTitle: row.class_title || null,
  classSessionId: row.class_session_id ? String(row.class_session_id) : null,
  sessionTitle: row.session_title || null,
  sessionStartTime: row.session_start_time || null,
  sessionEndTime: row.session_end_time || null,
  chapterId: row.chapter_id ? String(row.chapter_id) : null,
  chapterTitle: row.chapter_title || null,
  visibility: row.visibility,
  downloadUrl: `/api/files/${row.id}/download`,
});

// GET /api/teacher/files
router.get("/teacher/files", protectRoute, requireTeacher, async (req, res) => {
  const courseId = req.query.courseId === undefined ? null : parseId(req.query.courseId);
  const classId = req.query.classId === undefined ? null : parseId(req.query.classId);
  const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
  const date = typeof req.query.date === "string" && req.query.date.trim() ? req.query.date.trim() : null;
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : null;

  try {
    const isAdmin = req.user.role === "admin";
    const files = await query(
      `SELECT f.*, u.username AS uploaded_by_name, u.email AS uploader_email,
              COALESCE(c.title, c.name, c_lc.title, c_lc.name) AS course_title,
              COALESCE(c.category, c_lc.category) AS course_category,
              lc.title AS class_title, lc.course_id AS class_course_id,
              cs.title AS session_title, cs.start_time AS session_start_time, cs.end_time AS session_end_time,
              ch.id AS chapter_id, ch.title AS chapter_title
       FROM lms_learning_files f
       JOIN users u ON u.id = f.uploaded_by
       LEFT JOIN courses c ON c.id = f.course_id
       LEFT JOIN live_classes lc ON lc.id = f.live_class_id
       LEFT JOIN courses c_lc ON c_lc.id = lc.course_id
       LEFT JOIN class_sessions cs ON cs.id = f.class_session_id
       LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
       WHERE f.status = 'ready'
         AND ($1::boolean OR (
           f.uploaded_by = $2
           OR (f.live_class_id IS NOT NULL AND (
             lc.instructor_id = $2
             OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active')
           ))
           OR (f.course_id IS NOT NULL AND EXISTS (SELECT 1 FROM courses c2 WHERE c2.id = f.course_id AND c2.author_id = $2))
         ))
         AND ($3::bigint IS NULL OR COALESCE(f.course_id, lc.course_id) = $3)
         AND ($4::bigint IS NULL OR f.live_class_id = $4)
         AND ($5::bigint IS NULL OR f.class_session_id = $5)
         AND ($6::date IS NULL OR (cs.start_time IS NOT NULL AND cs.start_time::date = $6::date))
         AND ($7::text IS NULL OR (
           f.original_name ILIKE '%' || $7 || '%'
           OR COALESCE(c.title, c.name, c_lc.title, c_lc.name, '') ILIKE '%' || $7 || '%'
           OR COALESCE(lc.title, '') ILIKE '%' || $7 || '%'
           OR COALESCE(cs.title, '') ILIKE '%' || $7 || '%'
         ))
       ORDER BY COALESCE(cs.start_time, f.created_at) DESC, f.id DESC`,
      [isAdmin, req.user.id, courseId, classId, sessionId, date, search],
    );
    return res.json({ success: true, data: files.rows.map(serializeFile) });
  } catch (error) {
    console.error("Error listing teacher files:", error);
    return errorResponse(res, 500, "Không thể tải danh sách tài liệu", "INTERNAL_ERROR");
  }
});

// GET /api/teacher/classes-lookup
router.get("/teacher/classes-lookup", protectRoute, requireTeacher, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const classesRes = await query(
      `SELECT lc.id, lc.title, lc.status, lc.course_id,
              COALESCE(c.title, c.name) AS course_title, c.category AS course_category
       FROM live_classes lc
       LEFT JOIN courses c ON c.id = lc.course_id
       WHERE lc.status <> 'cancelled'
         AND ($1::boolean OR lc.instructor_id = $2 OR EXISTS (
           SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
         ))
       ORDER BY lc.created_at DESC`,
      [isAdmin, req.user.id],
    );

    const classIds = classesRes.rows.map((r) => r.id);
    let sessions = [];
    if (classIds.length > 0) {
      const sessionsRes = await query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
                ch.id AS chapter_id, ch.title AS chapter_title
         FROM class_sessions cs
         LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
         WHERE cs.live_class_id = ANY($1::bigint[]) AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [classIds],
      );
      sessions = sessionsRes.rows.map((s) => ({
        id: String(s.id),
        classId: String(s.live_class_id),
        title: s.title,
        startTime: s.start_time,
        endTime: s.end_time,
        status: s.status,
        chapterId: s.chapter_id ? String(s.chapter_id) : null,
        chapterTitle: s.chapter_title || null,
      }));
    }

    const classes = classesRes.rows.map((c) => ({
      id: String(c.id),
      title: c.title,
      status: c.status,
      courseId: c.course_id ? String(c.course_id) : null,
      courseTitle: c.course_title || "Khóa học",
      courseCategory: c.course_category || "CSCA",
      sessions: sessions.filter((s) => s.classId === String(c.id)),
    }));

    return res.json({ success: true, data: classes });
  } catch (error) {
    console.error("Error looking up teacher classes:", error);
    return errorResponse(res, 500, "Không thể tải danh sách lớp học", "INTERNAL_ERROR");
  }
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
              COALESCE(c.title, c.name) AS course_title, c.category AS course_category,
              lc.title AS class_title,
              cs.title AS session_title, cs.start_time AS session_start_time, cs.end_time AS session_end_time,
              ch.id AS chapter_id, ch.title AS chapter_title
       FROM lms_learning_files f
       JOIN users u ON u.id = f.uploaded_by
       LEFT JOIN live_classes lc ON lc.id = f.live_class_id
       LEFT JOIN courses c ON c.id = COALESCE(f.course_id, lc.course_id)
       LEFT JOIN class_sessions cs ON cs.id = f.class_session_id
       LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
       WHERE f.live_class_id = $1 AND f.status = 'ready'
         AND ($2::bigint IS NULL OR f.class_session_id = $2)
         AND ($3::boolean OR f.visibility <> 'PRIVATE' OR f.uploaded_by = $4)
       ORDER BY COALESCE(cs.start_time, f.created_at) DESC, f.id DESC`,
      [classId, sessionId, req.user.role === "admin", req.user.id],
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
    if (file.status !== "pending") return errorResponse(res, 409, "Tài liệu không ở trạng thái chờ xác nhận", "INVALID_STATUS");
    const access = file.live_class_id
      ? await classAccess(file.live_class_id, req.user)
      : await courseAccess(file.course_id, req.user);
    if (access.error || !access.canManage || (req.user.role !== "admin" && String(file.uploaded_by) !== String(req.user.id))) {
      return errorResponse(res, 403, "Bạn không có quyền xác nhận tài liệu này", "FORBIDDEN");
    }
    const { headUrl } = await generateLearningFileHeadSignedUrl({ r2Key: file.storage_key });
    const headResponse = await fetch(headUrl, { method: "HEAD" });
    if (!headResponse.ok) {
      await query("UPDATE lms_learning_files SET status = 'failed' WHERE id = $1", [fileId]);
      return errorResponse(res, 422, "Không tìm thấy object tài liệu trên R2", "UPLOAD_NOT_FOUND");
    }
    const result = await query("UPDATE lms_learning_files SET status = 'ready' WHERE id = $1 AND status = 'pending' RETURNING *", [fileId]);
    if (!result.rows.length) return errorResponse(res, 409, "Tài liệu đã được xác nhận", "INVALID_STATUS");
    await recordAuditEvent({ actorId: req.user.id, action: "learning_file.confirmed", entityType: "learning_file", entityId: fileId, afterState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, data: serializeFile(result.rows[0]) });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return errorResponse(res, 503, "Kho R2 chưa được cấu hình", error.code);
    console.error("Error confirming learning file:", error);
    return errorResponse(res, 500, "Không thể xác nhận tài liệu", "INTERNAL_ERROR");
  }
});

// GET /api/student/files
router.get("/student/files", protectRoute, requireActiveStudentLmsAccess, async (req, res) => {
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
    const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
    if (req.query.sessionId !== undefined && !sessionId) {
      return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    }
    if (sessionId && !classId) {
      return errorResponse(res, 422, "sessionId cần đi kèm classId", "VALIDATION_ERROR");
    }
    const date = typeof req.query.date === "string" && req.query.date.trim() ? req.query.date.trim() : null;
    const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : null;

    if (classId) {
      const classAccessResult = await query(
        `SELECT lc.course_id FROM live_classes lc
         JOIN class_enrollments ce ON ce.live_class_id = lc.id
         WHERE lc.id = $1 AND lc.status = 'active'
           AND ce.user_id = $2 AND ce.status = 'active'
           AND ($3::bigint IS NULL OR lc.course_id = $3)
           AND EXISTS (
             SELECT 1 FROM lms_access_grants g
             WHERE g.user_id = $2 AND g.course_id = lc.course_id AND g.access_status = 'active'
               AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
           )`,
        [classId, req.user.id, courseId],
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
      `SELECT DISTINCT f.*,
              COALESCE(cs.start_time, f.created_at) AS sort_time,
              COALESCE(c.title, c.name, c_lc.title, c_lc.name) AS course_title,
              COALESCE(c.category, c_lc.category) AS course_category,
              lc.title AS class_title, lc.course_id AS class_course_id,
              cs.title AS session_title, cs.start_time AS session_start_time, cs.end_time AS session_end_time,
              ch.id AS chapter_id, ch.title AS chapter_title,
              u.username AS uploaded_by_name, u.email AS uploader_email
       FROM lms_learning_files f
       LEFT JOIN courses c ON c.id = f.course_id
       LEFT JOIN live_classes lc ON lc.id = f.live_class_id
       LEFT JOIN courses c_lc ON c_lc.id = lc.course_id
       LEFT JOIN class_sessions cs ON cs.id = f.class_session_id
       LEFT JOIN class_chapters ch ON ch.id = cs.chapter_id
       LEFT JOIN users u ON u.id = f.uploaded_by
       WHERE f.status = 'ready'
         AND ($2::bigint IS NULL OR COALESCE(f.course_id, lc.course_id) = $2)
         AND ($3::bigint IS NULL OR f.live_class_id IS NULL OR f.live_class_id = $3)
         AND ($4::bigint IS NULL OR f.class_session_id = $4)
         AND ($5::date IS NULL OR (cs.start_time IS NOT NULL AND cs.start_time::date = $5::date))
         AND ($6::text IS NULL OR (
           f.original_name ILIKE '%' || $6 || '%'
           OR COALESCE(c.title, c.name, c_lc.title, c_lc.name, '') ILIKE '%' || $6 || '%'
           OR COALESCE(lc.title, '') ILIKE '%' || $6 || '%'
           OR COALESCE(cs.title, '') ILIKE '%' || $6 || '%'
         ))
         AND f.visibility IN ('CLASS_ONLY', 'COURSE')
         AND EXISTS (
           SELECT 1 FROM lms_access_grants g
           WHERE g.course_id = CASE WHEN f.live_class_id IS NOT NULL THEN lc.course_id ELSE f.course_id END
             AND g.user_id = $1 AND g.access_status = 'active'
             AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
         )
         AND (f.visibility = 'COURSE' OR (f.visibility = 'CLASS_ONLY'
           AND f.live_class_id IS NOT NULL AND lc.status = 'active'
           AND EXISTS (SELECT 1 FROM class_enrollments ce
                       WHERE ce.live_class_id = f.live_class_id AND ce.user_id = $1 AND ce.status = 'active')))
       ORDER BY sort_time DESC, f.id DESC`,
      [req.user.id, courseId, classId, sessionId, date, search],
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
  if (file.status === "deleted") return { error: "not_found" };
  if (user.role === "admin") return { file };
  if (user.role === "creator") {
    if (String(file.uploaded_by) === String(user.id)) return { file };
    const access = file.live_class_id
      ? await classAccess(file.live_class_id, user)
      : await courseAccess(file.course_id, user);
    if (!access.error && access.canManage) return { file };
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

    let r2Deleted = false;
    const storageKey = access.file?.storage_key;
    if (storageKey) {
      try {
        await deleteLearningFileObject({ r2Key: storageKey });
        r2Deleted = true;
      } catch (storageError) {
        if (storageError.code === "R2_NOT_CONFIGURED") {
          console.warn("R2 chưa được cấu hình, bỏ qua xóa object R2:", storageError.message);
        } else {
          console.error("Lỗi xóa file trên Cloudflare R2:", storageError);
          return errorResponse(res, 502, "Không thể xóa tài liệu trên kho lưu trữ R2. Vui lòng thử lại sau.", "STORAGE_DELETE_FAILED");
        }
      }
    }

    await query("UPDATE lms_learning_files SET status = 'deleted', updated_at = NOW() WHERE id = $1", [fileId]);
    await query("UPDATE quizzes SET paper_file_id = NULL WHERE paper_file_id = $1", [fileId]).catch(() => {});
    await query("UPDATE quizzes SET solution_file_id = NULL WHERE solution_file_id = $1", [fileId]).catch(() => {});
    await recordAuditEvent({
      actorId: req.user.id,
      action: "learning_file.deleted",
      entityType: "learning_file",
      entityId: fileId,
      metadata: { ip: req.ip, storageKey, r2Deleted },
    });
    return res.json({ success: true, message: "Đã xóa tài liệu" });
  } catch (error) {
    console.error("Error deleting learning file:", error);
    return errorResponse(res, 500, "Không thể xóa tài liệu", "INTERNAL_ERROR");
  }
});

router.get("/files/:fileId/download", protectRoute, requireManagedLearner, async (req, res) => {
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
