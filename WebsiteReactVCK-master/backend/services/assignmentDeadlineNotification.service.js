import { query } from "../db/connect.js";
import { createNotification } from "./notification.service.js";

const HOUR_MS = 60 * 60 * 1000;
const MAX_REMINDER_ASSIGNMENTS = 200;

const formatDeadline = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "chưa xác định";
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getDeadlineReminderStage = (dueDate, now = Date.now()) => {
  const dueAt = new Date(dueDate).getTime();
  if (Number.isNaN(dueAt)) return null;
  const remainingMs = dueAt - now;
  if (remainingMs <= 0 && remainingMs >= -48 * HOUR_MS) return "overdue";
  if (remainingMs > 0 && remainingMs <= 3 * HOUR_MS) return "urgent";
  if (remainingMs > 3 * HOUR_MS && remainingMs <= 24 * HOUR_MS) return "due_soon";
  return null;
};

const reminderCopy = (assignment, stage) => {
  const deadline = formatDeadline(assignment.due_date);
  if (stage === "overdue") {
    return {
      title: `Đã quá hạn: ${assignment.title}`,
      message: `Bài “${assignment.title}” đã đến hạn lúc ${deadline}. Hãy liên hệ giảng viên nếu cần hỗ trợ.`,
      eventType: "assignment.overdue",
    };
  }
  if (stage === "urgent") {
    return {
      title: `Sắp hết giờ nộp: ${assignment.title}`,
      message: `Bài “${assignment.title}” sẽ đến hạn lúc ${deadline}. Vui lòng nộp bài ngay để tránh trễ hạn.`,
      eventType: "assignment.due_urgent",
    };
  }
  return {
    title: `Sắp đến hạn: ${assignment.title}`,
    message: `Bài “${assignment.title}” sẽ đến hạn lúc ${deadline}. Hãy chủ động hoàn thành trước hạn.`,
    eventType: "assignment.due_soon",
  };
};

const assignmentLink = (assignmentId) => `/lms/assignment/${assignmentId}/submit`;

const getAssignmentAudience = async ({ assignmentId, excludeSubmitted = false }) => {
  const result = await query(
    `WITH target AS (
       SELECT a.id, a.course_id, a.live_class_id,
              COALESCE(a.course_id, lc.course_id) AS resolved_course_id,
              COALESCE(c.is_published, class_course.is_published, TRUE) AS course_is_published,
              COALESCE(c.is_management_managed, class_course.is_management_managed, FALSE) AS course_is_management_managed
       FROM assignments a
       LEFT JOIN courses c ON c.id = a.course_id
       LEFT JOIN live_classes lc ON lc.id = a.live_class_id
       LEFT JOIN courses class_course ON class_course.id = lc.course_id
       WHERE a.id = $1
     )
     SELECT DISTINCT u.id AS user_id
     FROM target a
     JOIN users u ON u.role = 'user'
     WHERE a.resolved_course_id IS NOT NULL
       AND a.course_is_published = TRUE
       AND (
         EXISTS (
           SELECT 1 FROM lms_access_grants g
           WHERE g.user_id = u.id AND g.course_id = a.resolved_course_id
             AND g.access_status = 'active' AND g.valid_from <= NOW()
             AND (g.valid_until IS NULL OR g.valid_until > NOW())
         )
         OR (
           a.course_is_management_managed = FALSE
           AND (
             EXISTS (
               SELECT 1 FROM enrollments e
               WHERE e.user_id = u.id AND e.course_id = a.resolved_course_id AND e.status = 'active'
             )
             OR EXISTS (
               SELECT 1
               FROM class_enrollments course_enrollment
               JOIN live_classes course_class ON course_class.id = course_enrollment.live_class_id
               WHERE course_enrollment.user_id = u.id AND course_class.course_id = a.resolved_course_id
                 AND course_enrollment.status = 'active' AND course_class.status = 'active'
             )
           )
         )
       )
       AND (
         a.live_class_id IS NULL
         OR EXISTS (
           SELECT 1 FROM class_enrollments class_enrollment
           JOIN live_classes scoped_class ON scoped_class.id = class_enrollment.live_class_id
           WHERE class_enrollment.live_class_id = a.live_class_id
             AND class_enrollment.user_id = u.id
             AND class_enrollment.status = 'active'
             AND scoped_class.status = 'active'
         )
       )
       AND (
         $2::boolean = FALSE
         OR NOT EXISTS (
           SELECT 1 FROM assignment_submissions submitted
           WHERE submitted.assignment_id = a.id AND submitted.user_id = u.id
         )
       )`,
    [assignmentId, excludeSubmitted],
  );
  return result.rows.map((row) => row.user_id).filter(Boolean);
};

const getAssignmentForNotification = async (assignmentId) => {
  const result = await query(
    `SELECT id, title, due_date, course_id, live_class_id
     FROM assignments
     WHERE id = $1`,
    [assignmentId],
  );
  return result.rows[0] || null;
};

const notifyAudience = async ({ assignment, recipients, title, message, eventType, actorId = null, dedupePrefix, data = {} }) => {
  let delivered = 0;
  for (const userId of recipients) {
    const notification = await createNotification({
      userId,
      title,
      message,
      eventType,
      linkUrl: assignmentLink(assignment.id),
      data: { assignmentId: assignment.id, dueDate: assignment.due_date || null, ...data },
      actorId,
      dedupeKey: `${dedupePrefix}:user:${userId}`,
    });
    if (notification) delivered += 1;
  }
  return delivered;
};

export const notifyAssignmentPublished = async ({ assignmentId, actorId }) => {
  try {
    const assignment = await getAssignmentForNotification(assignmentId);
    if (!assignment) return 0;
    const recipients = await getAssignmentAudience({ assignmentId });
    const deadline = assignment.due_date ? ` Hạn nộp: ${formatDeadline(assignment.due_date)}.` : " Chưa đặt hạn nộp.";
    return notifyAudience({
      assignment,
      recipients,
      title: `Bài tập mới: ${assignment.title}`,
      message: `Bạn có bài tập mới “${assignment.title}”.${deadline}`,
      eventType: "assignment.published",
      actorId,
      dedupePrefix: `assignment:${assignment.id}:published`,
      data: { kind: "published" },
    });
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Could not notify assignment publication:", error);
    return 0;
  }
};

export const notifyAssignmentDeadlineChanged = async ({ assignmentId, actorId }) => {
  try {
    const assignment = await getAssignmentForNotification(assignmentId);
    if (!assignment) return 0;
    const recipients = await getAssignmentAudience({ assignmentId });
    const dueKey = assignment.due_date ? new Date(assignment.due_date).toISOString() : "none";
    const deadline = assignment.due_date ? formatDeadline(assignment.due_date) : "đã được gỡ bỏ";
    return notifyAudience({
      assignment,
      recipients,
      title: `Cập nhật hạn nộp: ${assignment.title}`,
      message: `Hạn nộp bài “${assignment.title}” ${assignment.due_date ? `đã đổi thành ${deadline}` : deadline}.`,
      eventType: "assignment.deadline_updated",
      actorId,
      dedupePrefix: `assignment:${assignment.id}:deadline:${dueKey}`,
      data: { kind: "deadline_updated" },
    });
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Could not notify deadline change:", error);
    return 0;
  }
};

export const processAssignmentDeadlineReminders = async () => {
  try {
    const candidates = await query(
      `SELECT id, title, due_date
       FROM assignments
       WHERE due_date IS NOT NULL
         AND due_date > NOW() - INTERVAL '48 hours'
         AND due_date <= NOW() + INTERVAL '24 hours'
       ORDER BY due_date ASC
       LIMIT $1`,
      [MAX_REMINDER_ASSIGNMENTS],
    );

    let notifications = 0;
    const now = Date.now();
    for (const assignment of candidates.rows) {
      const stage = getDeadlineReminderStage(assignment.due_date, now);
      if (!stage) continue;
      const recipients = await getAssignmentAudience({ assignmentId: assignment.id, excludeSubmitted: true });
      if (recipients.length === 0) continue;
      const copy = reminderCopy(assignment, stage);
      const dueKey = new Date(assignment.due_date).toISOString();
      notifications += await notifyAudience({
        assignment,
        recipients,
        ...copy,
        dedupePrefix: `assignment:${assignment.id}:deadline:${dueKey}:${stage}`,
        data: { kind: stage, reminderStage: stage },
      });
    }
    return { scanned: candidates.rows.length, notifications };
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Reminder processing failed:", error);
    return { scanned: 0, notifications: 0, error: error?.message || "unknown" };
  }
};
