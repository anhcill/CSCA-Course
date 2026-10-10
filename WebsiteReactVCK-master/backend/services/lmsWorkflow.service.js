import { query } from "../db/connect.js";

export const workflowError = (message, status = 422) => Object.assign(new Error(message), { status });
export const positiveId = (value) => {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id < 1) throw workflowError("Mã dữ liệu không hợp lệ.");
  return id;
};
export const requiredReason = (value) => {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 10 || reason.length > 2000) throw workflowError("Lý do cần từ 10 đến 2000 ký tự.");
  return reason;
};
export const assertManagedClass = async (db, classId, user) => {
  const result = await db.query(
    `SELECT lc.* FROM live_classes lc WHERE lc.id = $1 AND
      ($3 = 'admin' OR EXISTS (
        SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active')
       OR (lc.instructor_id = $2 AND NOT EXISTS (
        SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2)))`,
    [classId, user.id, user.role],
  );
  if (!result.rows[0]) throw workflowError("Bạn không có quyền quản lý lớp này.", 403);
  return result.rows[0];
};
export const assertGradebookOpen = async (db, classId) => {
  if (!classId) return;
  // Shared lock order for grading/finalization: class first, then submissions.
  await db.query("SELECT id FROM live_classes WHERE id = $1 FOR UPDATE", [classId]);
  const result = await db.query("SELECT id FROM gradebook_finalizations WHERE class_id = $1 AND reopened_at IS NULL", [classId]);
  if (result.rows.length) throw workflowError("Sổ điểm đã chốt. Cần mở lại kèm lý do trước khi chỉnh điểm.", 409);
};
export const notifyWorkflow = async (db, { userId, title, message, link, key, actorId }) => {
  if (!userId) return;
  await db.query(
    `INSERT INTO notifications(user_id, title, message, type, event_type, link_url, dedupe_key, actor_id)
     VALUES ($1, $2, $3, 'system', 'system.workflow', $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [userId, title, message, link, key, actorId],
  );
};
export const mayReviewAttendance = async (user, db = { query }) => {
  if (user.role === "admin") return true;
  const permission = await db.query(
    `SELECT 1 FROM lms_role_permissions rp JOIN lms_permissions p ON p.id = rp.permission_id
     WHERE p.code = 'lms.attendance.amend.review' AND rp.role = $1 AND rp.is_allowed`, [user.role],
  );
  return permission.rows.length > 0;
};
