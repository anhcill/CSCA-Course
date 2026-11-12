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
            lc.id AS class_id,
            COALESCE(record_alias.title, lc.title, c.title, c.name) AS class_title,
            COALESCE(ce.course_id, record_alias.course_id, lc.course_id) AS course_id,
            COALESCE(c.title, c.name) AS course_title,
            COALESCE(NULLIF(lc.teacher_display_name, ''), instructor.username, instructor.email) AS instructor_name,
            (SELECT COALESCE(NULLIF(vcp.management_class_id, ''), 'profile-' || vcp.id::text)
             FROM video_course_profiles vcp
             WHERE vcp.status = 'active'
               AND vcp.course_id = COALESCE(ce.course_id, record_alias.course_id, lc.course_id)
               AND (
                 record_alias.alias_class_source_id IS NULL
                 OR LOWER(vcp.management_class_id) = LOWER(record_alias.alias_class_source_id)
               )
             ORDER BY
               (record_alias.alias_class_source_id IS NOT NULL
                AND LOWER(vcp.management_class_id) = LOWER(record_alias.alias_class_source_id)) DESC,
               vcp.id ASC
             LIMIT 1) AS recording_offering_id
     FROM class_enrollments ce
     JOIN users u ON u.id = ce.user_id
     LEFT JOIN management_class_learning_aliases record_alias
       ON record_alias.id = ce.management_class_alias_id
     LEFT JOIN live_classes lc ON lc.id = ce.live_class_id
     LEFT JOIN courses c ON c.id = COALESCE(ce.course_id, record_alias.course_id, lc.course_id)
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
  const isRecording = String(membership.learning_mode || "").toLowerCase() === "recording";
  const classUrl = isRecording
    ? membership.recording_offering_id
      ? `${baseUrl}/video-courses/${encodeURIComponent(membership.recording_offering_id)}`
      : `${baseUrl}/courses`
    : membership.course_id && membership.class_id
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

