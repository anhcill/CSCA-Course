import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import requireActiveStudentLmsAccess, { hasActiveStudentLmsAccess } from "../middleware/requireActiveStudentLmsAccess.js";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { normalizeGoogleDriveUrl } from "../utils/recordingUrl.js";

const router = express.Router();
const adminOnly = [protectRoute, requireAdmin];

const errorResponse = (res, status, message, errorCode) => res.status(status).json({
  success: false,
  message,
  errorCode,
});

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseOptionalDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const serializeRecording = (row, { includeDriveUrl = false } = {}) => ({
  id: String(row.id),
  classId: String(row.live_class_id),
  classTitle: row.class_title,
  courseId: row.course_id ? String(row.course_id) : null,
  courseTitle: row.course_title || null,
  sessionId: row.class_session_id ? String(row.class_session_id) : null,
  sessionTitle: row.session_title || null,
  sessionStartTime: row.session_start_time || null,
  title: row.title,
  description: row.description || "",
  recordedAt: row.recorded_at || row.session_start_time || row.created_at,
  durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
  isPublished: Boolean(row.is_published),
  publishedAt: row.published_at || null,
  openUrl: `/api/recordings/${row.id}/open`,
  hasDirectUrl: Boolean(row.drive_url),
  ...(includeDriveUrl ? { driveUrl: row.drive_url || "" } : {}),
});

const serializeClass = (row, { includeDriveUrl = false } = {}) => ({
  id: String(row.id),
  title: row.title,
  courseId: row.course_id ? String(row.course_id) : null,
  courseTitle: row.course_title || null,
  folderPublished: Boolean(row.folder_published),
  folderOpenUrl: row.folder_url && (row.folder_published || includeDriveUrl)
    ? `/api/recordings/classes/${row.id}/open-folder`
    : null,
  recordingCount: Number(row.recording_count || 0),
  latestRecordingAt: row.latest_recording_at || null,
  ...(includeDriveUrl ? { folderUrl: row.folder_url || "" } : {}),
});

const validatePayload = async (body, current = null) => {
  const classId = body.classId === undefined ? Number(current?.live_class_id) : parseId(body.classId);
  const sessionId = body.sessionId === undefined
    ? (current?.class_session_id ? Number(current.class_session_id) : null)
    : (body.sessionId === null || body.sessionId === "" ? null : parseId(body.sessionId));
  const title = body.title === undefined ? current?.title : String(body.title || "").trim();
  const description = body.description === undefined ? current?.description : String(body.description || "").trim();
  const rawDriveUrl = body.driveUrl === undefined ? current?.drive_url : String(body.driveUrl || "").trim();
  const driveUrl = rawDriveUrl ? normalizeGoogleDriveUrl(rawDriveUrl) : null;
  const recordedAt = body.recordedAt === undefined ? current?.recorded_at : parseOptionalDate(body.recordedAt);
  const durationMinutes = body.durationMinutes === undefined
    ? current?.duration_minutes
    : (body.durationMinutes === null || body.durationMinutes === "" ? null : Number(body.durationMinutes));
  const isPublished = body.isPublished === undefined ? Boolean(current?.is_published) : body.isPublished;

  if (!classId) return { error: "Vui lòng chọn lớp học" };
  if (body.sessionId !== undefined && body.sessionId !== null && body.sessionId !== "" && !sessionId) {
    return { error: "Buổi học không hợp lệ" };
  }
  if (!title || title.length > 255) return { error: "Tiêu đề phải có từ 1 đến 255 ký tự" };
  if (description && description.length > 3000) return { error: "Mô tả tối đa 3000 ký tự" };
  if (rawDriveUrl && !driveUrl) return { error: "Chỉ chấp nhận link HTTPS của Google Drive hoặc Google Docs" };
  if (recordedAt === undefined) return { error: "Ngày ghi hình không hợp lệ" };
  if (durationMinutes !== null && (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440)) {
    return { error: "Thời lượng phải là số phút từ 1 đến 1440" };
  }
  if (typeof isPublished !== "boolean") return { error: "Trạng thái xuất bản không hợp lệ" };

  const liveClass = (await query(
    `SELECT lc.id, lc.title, lc.course_id FROM live_classes lc
     WHERE lc.id = $1 AND lc.status <> 'cancelled'`,
    [classId],
  )).rows[0];
  if (!liveClass) return { error: "Không tìm thấy lớp học" };
  if (sessionId) {
    const session = (await query(
      "SELECT id, title, start_time FROM class_sessions WHERE id = $1 AND live_class_id = $2 AND status <> 'cancelled'",
      [sessionId, classId],
    )).rows[0];
    if (!session) return { error: "Buổi học không thuộc lớp đã chọn" };
  }
  if (isPublished && !driveUrl) {
    const publishedFolder = (await query(
      "SELECT 1 FROM class_recording_folders WHERE live_class_id = $1 AND is_published = TRUE",
      [classId],
    )).rows[0];
    if (!publishedFolder) return { error: "Hãy lưu và xuất bản thư mục Drive của lớp trước" };
  }

  return { classId, sessionId, title, description: description || null, driveUrl, recordedAt, durationMinutes, isPublished };
};

router.get("/mine", protectRoute, requireActiveStudentLmsAccess, async (req, res) => {
  const classId = req.query.classId ? parseId(req.query.classId) : null;
  if (req.query.classId && !classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  try {
    const [classes, recordings] = await Promise.all([
      query(
        `SELECT lc.id, lc.title, lc.course_id,
                COALESCE(c.title, c.name) AS course_title,
                rf.drive_url AS folder_url, rf.is_published AS folder_published,
                COUNT(r.id) FILTER (
                  WHERE r.is_published = TRUE AND (r.drive_url IS NOT NULL OR rf.is_published = TRUE)
                ) AS recording_count,
                MAX(COALESCE(r.recorded_at, cs.start_time, r.created_at))
                  FILTER (WHERE r.is_published = TRUE AND (r.drive_url IS NOT NULL OR rf.is_published = TRUE))
                  AS latest_recording_at
         FROM live_classes lc
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN class_recording_folders rf ON rf.live_class_id = lc.id
         LEFT JOIN class_recordings r ON r.live_class_id = lc.id
         LEFT JOIN class_sessions cs ON cs.id = r.class_session_id
         JOIN class_enrollments ce ON ce.live_class_id = lc.id
           AND ce.user_id = $1 AND ce.status = 'active'
         WHERE lc.status = 'active'
           AND ($2::bigint IS NULL OR lc.id = $2)
           AND EXISTS (
             SELECT 1 FROM lms_access_grants g
             WHERE g.user_id = $1 AND g.course_id = lc.course_id AND g.access_status = 'active'
               AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
           )
           AND (rf.is_published = TRUE OR EXISTS (
             SELECT 1 FROM class_recordings visible_recording
             WHERE visible_recording.live_class_id = lc.id
               AND visible_recording.is_published = TRUE
               AND visible_recording.drive_url IS NOT NULL
           ))
         GROUP BY lc.id, lc.title, lc.course_id, c.title, c.name, rf.drive_url, rf.is_published
         ORDER BY latest_recording_at DESC NULLS LAST, lc.title`,
        [req.user.id, classId],
      ),
      query(
      `SELECT r.*, lc.title AS class_title, lc.course_id,
              COALESCE(c.title, c.name) AS course_title,
              cs.title AS session_title, cs.start_time AS session_start_time
       FROM class_recordings r
       JOIN live_classes lc ON lc.id = r.live_class_id
       LEFT JOIN courses c ON c.id = lc.course_id
       LEFT JOIN class_sessions cs ON cs.id = r.class_session_id
       LEFT JOIN class_recording_folders rf ON rf.live_class_id = lc.id
       JOIN class_enrollments ce ON ce.live_class_id = lc.id
         AND ce.user_id = $1 AND ce.status = 'active'
       WHERE r.is_published = TRUE AND (r.drive_url IS NOT NULL OR rf.is_published = TRUE)
         AND lc.status = 'active'
         AND ($2::bigint IS NULL OR lc.id = $2)
         AND EXISTS (
           SELECT 1 FROM lms_access_grants g
           WHERE g.user_id = $1 AND g.course_id = lc.course_id AND g.access_status = 'active'
             AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
         )
       ORDER BY lc.title, COALESCE(r.recorded_at, cs.start_time, r.created_at) DESC, r.id DESC`,
      [req.user.id, classId],
      ),
    ]);
    return res.json({
      success: true,
      data: {
        classes: classes.rows.map((row) => serializeClass(row)),
        recordings: recordings.rows.map((row) => serializeRecording(row)),
      },
    });
  } catch (error) {
    console.error("Error listing student recordings:", error);
    return errorResponse(res, 500, "Không thể tải bản ghi buổi học", "INTERNAL_ERROR");
  }
});

router.get("/classes/:classId/open-folder", protectRoute, async (req, res) => {
  const classId = parseId(req.params.classId);
  if (!classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
    return errorResponse(res, 403, "Quyền học LMS chưa được cấp hoặc đã hết hiệu lực", "LMS_ACCESS_NOT_GRANTED");
  }
  try {
    const result = await query(
      `SELECT rf.drive_url, rf.is_published,
              EXISTS (
                SELECT 1 FROM class_enrollments ce
                WHERE ce.live_class_id = lc.id AND ce.user_id = $2 AND ce.status = 'active'
                  AND EXISTS (
                    SELECT 1 FROM lms_access_grants g
                    WHERE g.user_id = $2 AND g.course_id = lc.course_id AND g.access_status = 'active'
                      AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
                  )
              ) AS is_student
       FROM class_recording_folders rf
       JOIN live_classes lc ON lc.id = rf.live_class_id
       WHERE rf.live_class_id = $1 AND lc.status <> 'cancelled'`,
      [classId, req.user.id],
    );
    const folder = result.rows[0];
    if (!folder) return errorResponse(res, 404, "Lớp chưa có thư mục bản ghi", "NOT_FOUND");
    const canOpen = req.user.role === "admin"
      || (req.user.role === "user" && folder.is_published && folder.is_student);
    if (!canOpen) return errorResponse(res, 403, "Bạn không có quyền mở thư mục bản ghi này", "FORBIDDEN");
    const safeUrl = normalizeGoogleDriveUrl(folder.drive_url);
    if (!safeUrl) return errorResponse(res, 409, "Link thư mục Google Drive không hợp lệ", "INVALID_RECORDING_URL");
    res.set("Cache-Control", "private, no-store");
    return res.redirect(302, safeUrl);
  } catch (error) {
    console.error("Error opening class recording folder:", error);
    return errorResponse(res, 500, "Không thể mở thư mục bản ghi", "INTERNAL_ERROR");
  }
});

router.get("/:id/open", protectRoute, async (req, res) => {
  const recordingId = parseId(req.params.id);
  if (!recordingId) return errorResponse(res, 422, "recordingId không hợp lệ", "VALIDATION_ERROR");
  if (req.user.role === "user" && !hasActiveStudentLmsAccess(req.user)) {
    return errorResponse(res, 403, "Quyền học LMS chưa được cấp hoặc đã hết hiệu lực", "LMS_ACCESS_NOT_GRANTED");
  }
  try {
    const result = await query(
      `SELECT COALESCE(r.drive_url, rf.drive_url) AS drive_url,
              (r.drive_url IS NOT NULL) AS has_direct_url,
              r.is_published, rf.is_published AS folder_published, lc.course_id,
              EXISTS (
                SELECT 1 FROM class_enrollments ce
                WHERE ce.live_class_id = lc.id AND ce.user_id = $2 AND ce.status = 'active'
                  AND EXISTS (
                    SELECT 1 FROM lms_access_grants g
                    WHERE g.user_id = $2 AND g.course_id = lc.course_id AND g.access_status = 'active'
                      AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
                  )
              ) AS is_student
       FROM class_recordings r
       JOIN live_classes lc ON lc.id = r.live_class_id
       LEFT JOIN class_recording_folders rf ON rf.live_class_id = lc.id
       WHERE r.id = $1 AND lc.status <> 'cancelled'`,
      [recordingId, req.user.id],
    );
    const recording = result.rows[0];
    if (!recording) return errorResponse(res, 404, "Không tìm thấy bản ghi", "NOT_FOUND");
    const canOpen = req.user.role === "admin"
      || (req.user.role === "user" && recording.is_published && recording.is_student
        && recording.drive_url && (recording.has_direct_url || recording.folder_published));
    if (!canOpen) return errorResponse(res, 403, "Bạn không có quyền xem bản ghi này", "FORBIDDEN");
    const safeUrl = normalizeGoogleDriveUrl(recording.drive_url);
    if (!safeUrl) return errorResponse(res, 409, "Link Google Drive của bản ghi không hợp lệ", "INVALID_RECORDING_URL");
    res.set("Cache-Control", "private, no-store");
    return res.redirect(302, safeUrl);
  } catch (error) {
    console.error("Error opening class recording:", error);
    return errorResponse(res, 500, "Không thể mở bản ghi", "INTERNAL_ERROR");
  }
});

router.get("/admin/catalog", ...adminOnly, async (req, res) => {
  try {
    const [recordings, classes, sessions] = await Promise.all([
      query(
        `SELECT r.*, lc.title AS class_title, lc.course_id,
                COALESCE(c.title, c.name) AS course_title,
                cs.title AS session_title, cs.start_time AS session_start_time
         FROM class_recordings r
         JOIN live_classes lc ON lc.id = r.live_class_id
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN class_sessions cs ON cs.id = r.class_session_id
         ORDER BY lc.title, COALESCE(r.recorded_at, cs.start_time, r.created_at) DESC, r.id DESC`,
      ),
      query(
        `SELECT lc.id, lc.title, lc.course_id, COALESCE(c.title, c.name) AS course_title,
                rf.drive_url AS folder_url, rf.is_published AS folder_published,
                COUNT(r.id) AS recording_count,
                MAX(COALESCE(r.recorded_at, cs.start_time, r.created_at)) AS latest_recording_at
         FROM live_classes lc
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN class_recording_folders rf ON rf.live_class_id = lc.id
         LEFT JOIN class_recordings r ON r.live_class_id = lc.id
         LEFT JOIN class_sessions cs ON cs.id = r.class_session_id
         WHERE lc.status <> 'cancelled'
         GROUP BY lc.id, lc.title, lc.course_id, c.title, c.name, rf.drive_url, rf.is_published
         ORDER BY latest_recording_at DESC NULLS LAST, lc.title`,
      ),
      query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.status
         FROM class_sessions cs JOIN live_classes lc ON lc.id = cs.live_class_id
         WHERE cs.status <> 'cancelled' AND lc.status <> 'cancelled'
         ORDER BY cs.start_time DESC`,
      ),
    ]);
    return res.json({
      success: true,
      data: {
        recordings: recordings.rows.map((row) => serializeRecording(row, { includeDriveUrl: true })),
        classes: classes.rows.map((row) => serializeClass(row, { includeDriveUrl: true })),
        sessions: sessions.rows.map((row) => ({ id: String(row.id), classId: String(row.live_class_id), title: row.title, startTime: row.start_time, status: row.status })),
      },
    });
  } catch (error) {
    console.error("Error loading recording catalog:", error);
    return errorResponse(res, 500, "Không thể tải kho bản ghi", "INTERNAL_ERROR");
  }
});

router.put("/admin/classes/:classId/folder", ...adminOnly, async (req, res) => {
  const classId = parseId(req.params.classId);
  if (!classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
  const rawDriveUrl = String(req.body?.driveUrl || "").trim();
  const driveUrl = rawDriveUrl ? normalizeGoogleDriveUrl(rawDriveUrl) : null;
  const isPublished = req.body?.isPublished === true;
  if (rawDriveUrl && !driveUrl) {
    return errorResponse(res, 422, "Chỉ chấp nhận link HTTPS của Google Drive hoặc Google Docs", "VALIDATION_ERROR");
  }
  try {
    const liveClass = (await query(
      "SELECT id FROM live_classes WHERE id = $1 AND status <> 'cancelled'",
      [classId],
    )).rows[0];
    if (!liveClass) return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    const before = (await query(
      "SELECT * FROM class_recording_folders WHERE live_class_id = $1",
      [classId],
    )).rows[0] || null;
    if (!driveUrl) {
      await query("DELETE FROM class_recording_folders WHERE live_class_id = $1", [classId]);
      await recordAuditEvent({ actorId: req.user.id, action: "class_recording_folder.deleted", entityType: "live_class", entityId: classId, beforeState: before, metadata: { ip: req.ip } });
      return res.json({ success: true, data: null, message: "Đã xóa thư mục bản ghi của lớp" });
    }
    const result = await query(
      `INSERT INTO class_recording_folders (live_class_id, drive_url, is_published, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (live_class_id) DO UPDATE SET
         drive_url = EXCLUDED.drive_url,
         is_published = EXCLUDED.is_published,
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [classId, driveUrl, isPublished, req.user.id],
    );
    await recordAuditEvent({ actorId: req.user.id, action: before ? "class_recording_folder.updated" : "class_recording_folder.created", entityType: "live_class", entityId: classId, beforeState: before, afterState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, data: result.rows[0], message: "Đã lưu thư mục bản ghi của lớp" });
  } catch (error) {
    console.error("Error saving class recording folder:", error);
    return errorResponse(res, 500, "Không thể lưu thư mục bản ghi", "INTERNAL_ERROR");
  }
});

router.post("/admin", ...adminOnly, async (req, res) => {
  try {
    const payload = await validatePayload(req.body || {});
    if (payload.error) return errorResponse(res, 422, payload.error, "VALIDATION_ERROR");
    const result = await query(
      `INSERT INTO class_recordings (
         live_class_id, class_session_id, title, description, drive_url,
         recorded_at, duration_minutes, is_published, published_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 THEN NOW() ELSE NULL END, $9)
       RETURNING *`,
      [payload.classId, payload.sessionId, payload.title, payload.description, payload.driveUrl,
        payload.recordedAt, payload.durationMinutes, payload.isPublished, req.user.id],
    );
    await recordAuditEvent({ actorId: req.user.id, action: "class_recording.created", entityType: "class_recording", entityId: result.rows[0].id, afterState: result.rows[0], metadata: { ip: req.ip } });
    return res.status(201).json({ success: true, data: serializeRecording(result.rows[0], { includeDriveUrl: true }), message: "Đã thêm bản ghi" });
  } catch (error) {
    console.error("Error creating class recording:", error);
    return errorResponse(res, 500, "Không thể thêm bản ghi", "INTERNAL_ERROR");
  }
});

router.patch("/admin/:id", ...adminOnly, async (req, res) => {
  const recordingId = parseId(req.params.id);
  if (!recordingId) return errorResponse(res, 422, "recordingId không hợp lệ", "VALIDATION_ERROR");
  try {
    const current = (await query("SELECT * FROM class_recordings WHERE id = $1", [recordingId])).rows[0];
    if (!current) return errorResponse(res, 404, "Không tìm thấy bản ghi", "NOT_FOUND");
    const payload = await validatePayload(req.body || {}, current);
    if (payload.error) return errorResponse(res, 422, payload.error, "VALIDATION_ERROR");
    const result = await query(
      `UPDATE class_recordings SET
         live_class_id = $1, class_session_id = $2, title = $3, description = $4,
         drive_url = $5, recorded_at = $6, duration_minutes = $7, is_published = $8,
         published_at = CASE WHEN $8 AND published_at IS NULL THEN NOW() WHEN NOT $8 THEN NULL ELSE published_at END
       WHERE id = $9 RETURNING *`,
      [payload.classId, payload.sessionId, payload.title, payload.description, payload.driveUrl,
        payload.recordedAt, payload.durationMinutes, payload.isPublished, recordingId],
    );
    await recordAuditEvent({ actorId: req.user.id, action: "class_recording.updated", entityType: "class_recording", entityId: recordingId, beforeState: current, afterState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, data: serializeRecording(result.rows[0], { includeDriveUrl: true }), message: "Đã cập nhật bản ghi" });
  } catch (error) {
    console.error("Error updating class recording:", error);
    return errorResponse(res, 500, "Không thể cập nhật bản ghi", "INTERNAL_ERROR");
  }
});

router.delete("/admin/:id", ...adminOnly, async (req, res) => {
  const recordingId = parseId(req.params.id);
  if (!recordingId) return errorResponse(res, 422, "recordingId không hợp lệ", "VALIDATION_ERROR");
  try {
    const result = await query("DELETE FROM class_recordings WHERE id = $1 RETURNING *", [recordingId]);
    if (!result.rows[0]) return errorResponse(res, 404, "Không tìm thấy bản ghi", "NOT_FOUND");
    await recordAuditEvent({ actorId: req.user.id, action: "class_recording.deleted", entityType: "class_recording", entityId: recordingId, beforeState: result.rows[0], metadata: { ip: req.ip } });
    return res.json({ success: true, message: "Đã xóa bản ghi" });
  } catch (error) {
    console.error("Error deleting class recording:", error);
    return errorResponse(res, 500, "Không thể xóa bản ghi", "INTERNAL_ERROR");
  }
});

export default router;
