import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import { deliverClassAnnouncement, serializeAnnouncement } from "../services/classAnnouncement.service.js";

const router = express.Router();
const parseId = (value) => /^\d+$/.test(String(value || "")) && Number(value) > 0 ? Number(value) : null;
const invalid = (res, message) => res.status(422).json({ success: false, message, errorCode: "VALIDATION_ERROR" });

const validUrl = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2000) return undefined;
  if (value.startsWith("/")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch { return undefined; }
};

const getClassAccess = async (classId, user, { manage = false } = {}) => {
  const classResult = await query("SELECT id, course_id, instructor_id, status FROM live_classes WHERE id = $1", [classId]);
  const liveClass = classResult.rows[0];
  if (!liveClass) return { missing: true };
  if (user.role === "admin") return { liveClass };
  if (user.role === "creator") {
    const teacher = await query(
      `SELECT 1 WHERE $1::bigint = $2::bigint
       UNION ALL SELECT 1 FROM class_teachers WHERE live_class_id = $3 AND teacher_id = $1 AND status = 'active' LIMIT 1`,
      [user.id, liveClass.instructor_id, classId],
    );
    return teacher.rows.length ? { liveClass } : { forbidden: true };
  }
  if (manage || user.role !== "user" || liveClass.status !== "active") return { forbidden: true };
  const enrollment = await query(
    `SELECT 1 FROM class_enrollments ce
     LEFT JOIN courses c ON c.id = $3
     WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
       AND (COALESCE(c.is_management_managed, FALSE) = FALSE OR EXISTS (
         SELECT 1 FROM lms_access_grants g WHERE g.user_id = $2 AND g.course_id = c.id
           AND g.access_status = 'active' AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       ))`,
    [classId, user.id, liveClass.course_id],
  );
  return enrollment.rows.length ? { liveClass } : { forbidden: true };
};

router.get("/", protectRoute, async (req, res) => {
  try {
    const classId = parseId(req.query.classId);
    const sessionId = req.query.sessionId === undefined ? null : parseId(req.query.sessionId);
    if (!classId || (req.query.sessionId !== undefined && !sessionId)) return invalid(res, "classId/sessionId không hợp lệ");
    const access = await getClassAccess(classId, req.user);
    if (access.missing) return res.status(404).json({ success: false, message: "Không tìm thấy lớp học", errorCode: "NOT_FOUND" });
    if (access.forbidden) return res.status(403).json({ success: false, message: "Bạn không có quyền xem thông báo của lớp này", errorCode: "FORBIDDEN" });
    const canManage = req.user.role === "admin" || req.user.role === "creator";
    const results = await query(
      `SELECT * FROM class_announcements
       WHERE live_class_id = $1 ${sessionId ? "AND class_session_id = $2" : ""}
         ${canManage ? "" : "AND status = 'sent'"}
       ORDER BY COALESCE(scheduled_at, sent_at, created_at) DESC`,
      sessionId ? [classId, sessionId] : [classId],
    );
    return res.json({ success: true, data: results.rows.map(serializeAnnouncement) });
  } catch (error) {
    console.error("[announcement] list failed:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải thông báo", errorCode: "INTERNAL_ERROR" });
  }
});

router.post("/", protectRoute, requireTeacher, async (req, res) => {
  try {
    const classId = parseId(req.body?.classId);
    const sessionId = req.body?.sessionId === undefined || req.body?.sessionId === null || req.body?.sessionId === "" ? null : parseId(req.body.sessionId);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const linkUrl = validUrl(req.body?.linkUrl);
    const attachmentUrl = validUrl(req.body?.attachmentUrl);
    const scheduleAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (!classId || (req.body?.sessionId && !sessionId) || !title || title.length > 180 || !message || message.length > 10000 || linkUrl === undefined || attachmentUrl === undefined || (scheduleAt && Number.isNaN(scheduleAt.getTime()))) return invalid(res, "Dữ liệu thông báo không hợp lệ");
    if (scheduleAt && scheduleAt.getTime() < Date.now() - 60_000) return invalid(res, "Thời gian gửi phải ở hiện tại hoặc tương lai");
    const access = await getClassAccess(classId, req.user, { manage: true });
    if (access.missing) return res.status(404).json({ success: false, message: "Không tìm thấy lớp học", errorCode: "NOT_FOUND" });
    if (access.forbidden) return res.status(403).json({ success: false, message: "Bạn không có quyền gửi thông báo cho lớp này", errorCode: "FORBIDDEN" });
    if (sessionId) {
      const session = await query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2", [sessionId, classId]);
      if (!session.rows.length) return invalid(res, "Buổi học không thuộc lớp đã chọn");
    }
    const isScheduled = scheduleAt && scheduleAt.getTime() > Date.now() + 5_000;
    const created = await query(
      `INSERT INTO class_announcements (live_class_id, class_session_id, title, message, link_url, attachment_url, status, scheduled_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
      [classId, sessionId, title, message, linkUrl || null, attachmentUrl || null, isScheduled ? "scheduled" : "draft", isScheduled ? scheduleAt : null, req.user.id],
    );
    const announcement = created.rows[0];
    if (isScheduled) return res.status(201).json({ success: true, data: serializeAnnouncement(announcement), message: "Đã lên lịch gửi thông báo" });
    const delivery = await deliverClassAnnouncement(announcement.id);
    return res.status(201).json({ success: true, data: delivery.announcement, message: "Đã gửi thông báo đến học viên" });
  } catch (error) {
    console.error("[announcement] create failed:", error.message);
    return res.status(500).json({ success: false, message: "Không thể gửi thông báo", errorCode: "INTERNAL_ERROR" });
  }
});

router.patch("/:id/cancel", protectRoute, requireTeacher, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return invalid(res, "id không hợp lệ");
    const found = await query("SELECT live_class_id, status FROM class_announcements WHERE id = $1", [id]);
    if (!found.rows.length) return res.status(404).json({ success: false, message: "Không tìm thấy thông báo", errorCode: "NOT_FOUND" });
    const access = await getClassAccess(found.rows[0].live_class_id, req.user, { manage: true });
    if (access.forbidden) return res.status(403).json({ success: false, message: "Bạn không có quyền hủy thông báo", errorCode: "FORBIDDEN" });
    const updated = await query("UPDATE class_announcements SET status = 'cancelled', updated_at = NOW(), updated_by = $2 WHERE id = $1 AND status = 'scheduled' RETURNING *", [id, req.user.id]);
    if (!updated.rows.length) return invalid(res, "Chỉ hủy được thông báo đang chờ gửi");
    return res.json({ success: true, data: serializeAnnouncement(updated.rows[0]) });
  } catch (error) {
    console.error("[announcement] cancel failed:", error.message);
    return res.status(500).json({ success: false, message: "Không thể hủy thông báo", errorCode: "INTERNAL_ERROR" });
  }
});

export default router;
