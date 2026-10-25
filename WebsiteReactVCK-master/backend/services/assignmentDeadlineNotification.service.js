import { query } from "../db/connect.js";
import { createNotification } from "./notification.service.js";
import { sendHomeworkAssignedEmail } from "./brevoEmail.service.js";

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
const quizLink = (quizId) => `/lms/quiz/${quizId}`;

const getAssignmentAudience = async ({ assignmentId, excludeSubmitted = false, db = { query } }) => {
  const result = await db.query(
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
     WHERE (
       (
         a.resolved_course_id IS NOT NULL
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
       )
       OR (a.resolved_course_id IS NULL AND a.live_class_id IS NOT NULL)
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
           WHERE submitted.assignment_id = a.id AND submitted.user_id = u.id AND NOT submitted.return_requested
         )
       )`,
    [assignmentId, excludeSubmitted],
  );
  return result.rows.map((row) => row.user_id).filter(Boolean);
};

const getAssignmentForNotification = async (assignmentId, db = { query }) => {
  const result = await db.query(
    `SELECT a.id, a.title, a.description, a.assignment_type, a.max_score, a.due_date,
            a.course_id, a.live_class_id, a.class_session_id,
            COALESCE(c.title, c.name, class_course.title, class_course.name) AS course_title,
            lc.title AS class_title,
            cs.title AS session_title,
            COALESCE(NULLIF(lc.teacher_display_name, ''), instructor.username) AS instructor_name
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     LEFT JOIN live_classes lc ON lc.id = a.live_class_id
     LEFT JOIN courses class_course ON class_course.id = lc.course_id
     LEFT JOIN class_sessions cs ON cs.id = a.class_session_id
     LEFT JOIN users instructor ON instructor.id = COALESCE(a.instructor_id, lc.instructor_id)
     WHERE a.id = $1`,
    [assignmentId],
  );
  return result.rows[0] || null;
};

const getRecipientEmailProfiles = async (userIds, db = { query }) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const result = await db.query(
    `SELECT u.id AS user_id, u.email, u.username,
            COALESCE(NULLIF(sp.full_name, ''), u.username, u.email) AS display_name,
            COALESCE(u.is_internal_test_account, FALSE) AS is_internal_test_account
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = ANY($1::bigint[])
       AND COALESCE(u.is_internal_test_account, FALSE) = FALSE
       AND u.email IS NOT NULL
       AND TRIM(u.email) <> ''`,
    [userIds],
  );
  return result.rows;
};

const notifyAudience = async ({
  assignment,
  recipients,
  title,
  message,
  eventType,
  actorId = null,
  dedupePrefix,
  data = {},
  notificationCreator = createNotification,
}) => {
  let delivered = 0;
  const newlyNotifiedUserIds = [];
  for (const userId of recipients) {
    const notification = await notificationCreator({
      userId,
      title,
      message,
      eventType,
      linkUrl: assignmentLink(assignment.id),
      data: { assignmentId: assignment.id, dueDate: assignment.due_date || null, ...data },
      actorId,
      dedupeKey: `${dedupePrefix}:user:${userId}`,
    });
    if (notification) {
      delivered += 1;
      newlyNotifiedUserIds.push(userId);
    }
  }
  return { delivered, newlyNotifiedUserIds };
};

export const notifyAssignmentPublished = async ({
  assignmentId,
  actorId,
  db = { query },
  emailSender = sendHomeworkAssignedEmail,
  notificationCreator = createNotification,
}) => {
  try {
    const assignment = await getAssignmentForNotification(assignmentId, db);
    if (!assignment) return 0;
    const recipients = await getAssignmentAudience({ assignmentId, db });
    const deadline = assignment.due_date ? ` Hạn nộp: ${formatDeadline(assignment.due_date)}.` : " Chưa đặt hạn nộp.";
    const { delivered, newlyNotifiedUserIds } = await notifyAudience({
      assignment,
      recipients,
      title: `Bài tập về nhà mới: ${assignment.title}`,
      message: `Bạn có bài tập về nhà mới “${assignment.title}”.${deadline}`,
      eventType: "assignment.published",
      actorId,
      dedupePrefix: `assignment:${assignment.id}:published`,
      data: { kind: "published", activityScope: "homework" },
      notificationCreator,
    });

    const targetEmailUserIds = newlyNotifiedUserIds.length > 0 ? newlyNotifiedUserIds : recipients;
    if (targetEmailUserIds.length > 0 && typeof emailSender === "function") {
      const profiles = await getRecipientEmailProfiles(targetEmailUserIds, db);
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      const actionUrl = `${frontendUrl}${assignmentLink(assignment.id)}`;
      for (const profile of profiles) {
        try {
          await emailSender({
            email: profile.email,
            username: profile.display_name || profile.username,
            homeworkKind: "assignment",
            assignmentType: assignment.assignment_type || "homework",
            title: assignment.title,
            description: assignment.description || "",
            dueDate: assignment.due_date || null,
            classTitle: assignment.class_title || null,
            courseTitle: assignment.course_title || null,
            sessionTitle: assignment.session_title || null,
            instructorName: assignment.instructor_name || null,
            maxScore: assignment.max_score ?? null,
            actionUrl,
          });
        } catch (emailErr) {
          console.error(`[AssignmentDeadlineNotification] Homework email failed for ${profile.email}:`, emailErr.message);
        }
      }
    }

    return delivered;
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Could not notify assignment publication:", error);
    return 0;
  }
};

export const notifyHomeworkQuizPublished = async ({
  quizId,
  actorId = null,
  db = { query },
  emailSender = sendHomeworkAssignedEmail,
}) => {
  try {
    const quizResult = await db.query(
      `SELECT q.id, q.title, q.description, q.activity_scope, q.status, q.due_date,
              q.duration_minutes, q.passing_score, q.attempt_limit,
              q.course_id, q.live_class_id, q.class_session_id,
              COALESCE(c.title, c.name, class_course.title, class_course.name) AS course_title,
              lc.title AS class_title,
              cs.title AS session_title,
              COALESCE(NULLIF(lc.teacher_display_name, ''), instructor.username) AS instructor_name
       FROM quizzes q
       LEFT JOIN courses c ON c.id = q.course_id
       LEFT JOIN live_classes lc ON lc.id = q.live_class_id
       LEFT JOIN courses class_course ON class_course.id = lc.course_id
       LEFT JOIN class_sessions cs ON cs.id = q.class_session_id
       LEFT JOIN users instructor ON instructor.id = COALESCE(q.instructor_id, lc.instructor_id)
       WHERE q.id = $1`,
      [quizId],
    );
    const quiz = quizResult.rows[0];
    if (!quiz || quiz.activity_scope !== "homework" || quiz.status !== "PUBLISHED") {
      return { emailed: 0, skipped: true };
    }

    let profiles = [];
    if (quiz.live_class_id) {
      const classMembers = await db.query(
        `SELECT DISTINCT u.id AS user_id, u.email, u.username,
                COALESCE(NULLIF(sp.full_name, ''), u.username, u.email) AS display_name
         FROM class_enrollments ce
         JOIN users u ON u.id = ce.user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE ce.live_class_id = $1
           AND ce.status = 'active'
           AND u.email IS NOT NULL
           AND TRIM(u.email) <> ''`,
        [quiz.live_class_id],
      );
      profiles = classMembers.rows;
    } else if (quiz.course_id) {
      const courseMembers = await db.query(
        `SELECT DISTINCT u.id AS user_id, u.email, u.username,
                COALESCE(NULLIF(sp.full_name, ''), u.username, u.email) AS display_name
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.role = 'user'
           AND u.email IS NOT NULL
           AND TRIM(u.email) <> ''
           AND (
             EXISTS (
               SELECT 1 FROM lms_access_grants g
               WHERE g.user_id = u.id AND g.course_id = $1
                 AND g.access_status = 'active' AND g.valid_from <= NOW()
                 AND (g.valid_until IS NULL OR g.valid_until > NOW())
             )
             OR EXISTS (
               SELECT 1 FROM enrollments e
               WHERE e.user_id = u.id AND e.course_id = $1 AND e.status = 'active'
             )
           )`,
        [quiz.course_id],
      );
      profiles = courseMembers.rows;
    }

    if (profiles.length === 0 || typeof emailSender !== "function") {
      return { emailed: 0, skipped: false };
    }

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const actionUrl = `${frontendUrl}${quizLink(quiz.id)}`;
    let emailed = 0;

    for (const profile of profiles) {
      try {
        await emailSender({
          email: profile.email,
          username: profile.display_name || profile.username,
          homeworkKind: "quiz",
          assignmentType: "quiz",
          title: quiz.title,
          description: quiz.description || "",
          dueDate: quiz.due_date || null,
          classTitle: quiz.class_title || null,
          courseTitle: quiz.course_title || null,
          sessionTitle: quiz.session_title || null,
          instructorName: quiz.instructor_name || null,
          durationMinutes: quiz.duration_minutes ?? null,
          attemptLimit: quiz.attempt_limit ?? null,
          passingScore: quiz.passing_score ?? null,
          actionUrl,
        });
        emailed += 1;
      } catch (emailErr) {
        console.error(`[AssignmentDeadlineNotification] Homework quiz email failed for ${profile.email}:`, emailErr.message);
      }
    }

    return { emailed, skipped: false };
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Could not notify homework quiz publication:", error);
    return { emailed: 0, error: error?.message || "unknown" };
  }
};

export const notifyAssignmentDeadlineChanged = async ({ assignmentId, actorId, db = { query } }) => {
  try {
    const assignment = await getAssignmentForNotification(assignmentId, db);
    if (!assignment) return 0;
    const recipients = await getAssignmentAudience({ assignmentId, db });
    const dueKey = assignment.due_date ? new Date(assignment.due_date).toISOString() : "none";
    const deadline = assignment.due_date ? formatDeadline(assignment.due_date) : "đã được gỡ bỏ";
    const { delivered } = await notifyAudience({
      assignment,
      recipients,
      title: `Cập nhật hạn nộp: ${assignment.title}`,
      message: `Hạn nộp bài “${assignment.title}” ${assignment.due_date ? `đã đổi thành ${deadline}` : deadline}.`,
      eventType: "assignment.deadline_updated",
      actorId,
      dedupePrefix: `assignment:${assignment.id}:deadline:${dueKey}`,
      data: { kind: "deadline_updated" },
    });
    return delivered;
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Could not notify deadline change:", error);
    return 0;
  }
};

export const processAssignmentDeadlineReminders = async () => {
  try {
    const candidates = await query(
      `SELECT id, title, due_date
       FROM assignments a
       WHERE (due_date > NOW() - INTERVAL '48 hours' AND due_date <= NOW() + INTERVAL '24 hours')
         OR EXISTS (SELECT 1 FROM assessment_accommodations ac WHERE ac.assessment_type = 'assignment'
           AND ac.assessment_id = a.id AND ac.status = 'active'
           AND ac.due_at > NOW() - INTERVAL '48 hours' AND ac.due_at <= NOW() + INTERVAL '24 hours')
         OR EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.return_requested
           AND s.resubmit_until > NOW() - INTERVAL '48 hours' AND s.resubmit_until <= NOW() + INTERVAL '24 hours')
       ORDER BY due_date ASC
       LIMIT $1`,
      [MAX_REMINDER_ASSIGNMENTS],
    );

    let notifications = 0;
    const now = Date.now();
    for (const assignment of candidates.rows) {
      const recipients = await getAssignmentAudience({ assignmentId: assignment.id, excludeSubmitted: true });
      if (recipients.length === 0) continue;
      const deadlines = await query(
        `SELECT u.id, COALESCE(CASE WHEN s.return_requested THEN s.resubmit_until END, ac.due_at, $3::timestamptz) AS due_at,
                COALESCE(s.revision, 0) AS revision
         FROM users u LEFT JOIN assessment_accommodations ac ON ac.user_id = u.id AND ac.assessment_id = $1
           AND ac.assessment_type = 'assignment' AND ac.status = 'active'
         LEFT JOIN assignment_submissions s ON s.user_id = u.id AND s.assignment_id = $1
         WHERE u.id = ANY($2::bigint[])`, [assignment.id, recipients, assignment.due_date],
      );
      for (const recipient of deadlines.rows) {
        if (!recipient.due_at) continue;
        const effective = { ...assignment, due_date: recipient.due_at };
        const stage = getDeadlineReminderStage(effective.due_date, now);
        if (!stage) continue;
        const dueKey = new Date(effective.due_date).toISOString();
        const { delivered } = await notifyAudience({
          assignment: effective, recipients: [recipient.id], ...reminderCopy(effective, stage),
          dedupePrefix: `assignment:${assignment.id}:revision:${recipient.revision}:deadline:${dueKey}:${stage}`,
          data: { kind: stage, reminderStage: stage },
        });
        notifications += delivered;
      }
    }
    return { scanned: candidates.rows.length, notifications };
  } catch (error) {
    console.error("[AssignmentDeadlineNotification] Reminder processing failed:", error);
    return { scanned: 0, notifications: 0, error: error?.message || "unknown" };
  }
};
