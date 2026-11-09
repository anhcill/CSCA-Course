import { query } from "../db/connect.js";
import { sendClassEnrollmentApprovedEmail } from "./brevoEmail.service.js";

export const notifyApprovedManagementEnrollment = async ({
  membershipId,
  db = { query },
  emailSender = sendClassEnrollmentApprovedEmail,
  frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173",
}) => {
  const result = await db.query(
    `SELECT ce.id, ce.status, ce.management_approval_status, ce.learning_mode,
            u.email, COALESCE(NULLIF(sp.full_name, ''), u.username, u.email) AS student_name,
            lc.id AS class_id, COALESCE(record_alias.title, lc.title) AS class_title, lc.course_id,
            COALESCE(c.title, c.name) AS course_title,
            COALESCE(NULLIF(lc.teacher_display_name, ''), instructor.username, instructor.email) AS instructor_name
     FROM class_enrollments ce
     JOIN users u ON u.id = ce.user_id
     JOIN live_classes lc ON lc.id = ce.live_class_id
     LEFT JOIN management_class_learning_aliases record_alias
       ON record_alias.id = ce.management_class_alias_id
     LEFT JOIN courses c ON c.id = lc.course_id
     LEFT JOIN users instructor ON instructor.id = lc.instructor_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE ce.id = $1`,
    [membershipId],
  );
  const membership = result.rows[0];
  if (!membership
      || membership.management_approval_status !== "approved"
      || membership.status !== "active"
      || !membership.email) {
    return { sent: false, reason: "not_active_or_missing_email" };
  }

  const baseUrl = String(frontendUrl).replace(/\/$/, "");
  const classUrl = membership.course_id && membership.class_id
    ? `${baseUrl}/lms/courses/${membership.course_id}/classes/${membership.class_id}`
    : `${baseUrl}/lms/courses`;
  const delivery = await emailSender({
    email: membership.email,
    username: membership.student_name,
    className: membership.class_title,
    courseName: membership.course_title,
    instructorName: membership.instructor_name,
    classUrl,
    learningMode: membership.learning_mode || "live",
  });
  if (!delivery?.success) {
    throw new Error(delivery?.error || "Nhà cung cấp email từ chối gửi thư xác nhận ghi danh");
  }
  return { sent: true, messageId: delivery.messageId || null, membership };
};

