import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeadlineReminderStage,
  notifyAssignmentPublished,
  notifyHomeworkQuizPublished,
} from "./assignmentDeadlineNotification.service.js";
import { sendHomeworkAssignedEmail } from "./brevoEmail.service.js";

const now = Date.parse("2026-09-26T10:00:00.000Z");

test("assignment deadline reminders use escalating stages", () => {
  assert.equal(getDeadlineReminderStage("2026-09-27T06:00:00.000Z", now), "due_soon");
  assert.equal(getDeadlineReminderStage("2026-09-26T12:00:00.000Z", now), "urgent");
  assert.equal(getDeadlineReminderStage("2026-09-25T12:00:00.000Z", now), "overdue");
});

test("assignment deadline reminders ignore dates outside their delivery window", () => {
  assert.equal(getDeadlineReminderStage("2026-09-28T10:00:00.000Z", now), null);
  assert.equal(getDeadlineReminderStage("2026-09-23T10:00:00.000Z", now), null);
  assert.equal(getDeadlineReminderStage("invalid-date", now), null);
});

test("notifyAssignmentPublished sends homework email with class, session, deadline and link", async () => {
  const sentEmails = [];
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes("FROM assignments a") && sql.includes("a.assignment_type")) {
        return {
          rows: [{
            id: 42,
            title: "Bài tập Đạo hàm & Tích phân",
            description: "Làm đầy đủ 10 câu tự luận trong file đính kèm.",
            assignment_type: "homework",
            max_score: 10,
            due_date: "2026-10-30T16:59:00.000Z",
            course_id: 5,
            live_class_id: 12,
            class_session_id: 99,
            course_title: "Toán CSCA Chuyên Sâu",
            class_title: "CSCA-MATH-K12",
            session_title: "Buổi 8: Ứng dụng tích phân",
            instructor_name: "Thầy Minh",
          }],
        };
      }
      if (sql.includes("WITH target AS")) {
        return { rows: [{ user_id: 101 }, { user_id: 102 }] };
      }
      if (sql.includes("FROM users u") && sql.includes("student_profiles")) {
        return {
          rows: [
            { user_id: 101, email: "student1@example.com", username: "student1", display_name: "Nguyễn Văn A", is_internal_test_account: false },
            { user_id: 102, email: "student2@example.com", username: "student2", display_name: "Trần Thị B", is_internal_test_account: false },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const delivered = await notifyAssignmentPublished({
    assignmentId: 42,
    actorId: 1,
    db: fakeDb,
    notificationCreator: async ({ userId, title }) => ({ id: userId, title }),
    emailSender: async (payload) => {
      sentEmails.push(payload);
    },
  });

  assert.equal(delivered, 2);

  assert.equal(sentEmails.length, 2);
  assert.equal(sentEmails[0].email, "student1@example.com");
  assert.equal(sentEmails[0].username, "Nguyễn Văn A");
  assert.equal(sentEmails[0].homeworkKind, "assignment");
  assert.equal(sentEmails[0].title, "Bài tập Đạo hàm & Tích phân");
  assert.equal(sentEmails[0].classTitle, "CSCA-MATH-K12");
  assert.equal(sentEmails[0].courseTitle, "Toán CSCA Chuyên Sâu");
  assert.equal(sentEmails[0].sessionTitle, "Buổi 8: Ứng dụng tích phân");
  assert.equal(sentEmails[0].instructorName, "Thầy Minh");
  assert.equal(sentEmails[0].dueDate, "2026-10-30T16:59:00.000Z");
  assert.match(sentEmails[0].actionUrl, /\/lms\/assignment\/42\/submit$/);
});

test("notifyHomeworkQuizPublished sends email ONLY for homework quizzes and skips session quizzes", async () => {
  const sentEmails = [];
  const createQuizDb = (activityScope) => ({
    query: async (sql) => {
      if (sql.includes("FROM quizzes q")) {
        return {
          rows: [{
            id: 77,
            title: "Quiz về nhà Hàm số mũ & Logarit",
            description: "Hoàn thành trước buổi học tiếp theo.",
            activity_scope: activityScope,
            status: "PUBLISHED",
            due_date: "2026-11-02T15:00:00.000Z",
            duration_minutes: 45,
            passing_score: 70,
            attempt_limit: 2,
            course_id: 5,
            live_class_id: 12,
            class_session_id: 100,
            course_title: "Toán CSCA Chuyên Sâu",
            class_title: "CSCA-MATH-K12",
            session_title: "Buổi 9: Hàm mũ và Logarit",
            instructor_name: "Thầy Minh",
          }],
        };
      }
      if (sql.includes("FROM class_enrollments ce")) {
        assert.doesNotMatch(sql, /is_internal_test/);
        return {
          rows: [
            { user_id: 101, email: "student1@example.com", username: "student1", display_name: "Nguyễn Văn A" },
            { user_id: 102, email: "test-account@example.com", username: "test-account", display_name: "Tài khoản Test" },
          ],
        };
      }
      return { rows: [] };
    },
  });

  // 1. In-class quiz (activity_scope = 'session') -> MUST NOT send email
  const sessionResult = await notifyHomeworkQuizPublished({
    quizId: 77,
    actorId: 1,
    db: createQuizDb("session"),
    emailSender: async (payload) => sentEmails.push(payload),
  });
  assert.equal(sessionResult.skipped, true);
  assert.equal(sessionResult.emailed, 0);
  assert.equal(sentEmails.length, 0);

  // 2. Homework quiz (activity_scope = 'homework') -> MUST send email
  const homeworkResult = await notifyHomeworkQuizPublished({
    quizId: 77,
    actorId: 1,
    db: createQuizDb("homework"),
    emailSender: async (payload) => sentEmails.push(payload),
  });
  assert.equal(homeworkResult.skipped, false);
  assert.equal(homeworkResult.emailed, 2);
  assert.equal(sentEmails.length, 2);
  assert.equal(sentEmails[0].homeworkKind, "quiz");
  assert.equal(sentEmails[0].title, "Quiz về nhà Hàm số mũ & Logarit");
  assert.equal(sentEmails[0].classTitle, "CSCA-MATH-K12");
  assert.equal(sentEmails[0].durationMinutes, 45);
  assert.equal(sentEmails[0].attemptLimit, 2);
  assert.equal(sentEmails[0].passingScore, 70);
  assert.match(sentEmails[0].actionUrl, /\/lms\/quiz\/77$/);
  assert.equal(sentEmails[1].email, "test-account@example.com");
  assert.equal(sentEmails[1].username, "Tài khoản Test");
});

test("sendHomeworkAssignedEmail runs in sandbox mode when BREVO_API_KEY is unset", async () => {
  const prevKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "";
  try {
    const res = await sendHomeworkAssignedEmail({
      email: "student@example.com",
      username: "Học viên A",
      homeworkKind: "quiz",
      assignmentType: "quiz",
      title: "Quiz về nhà Tuần 4",
      description: "Ôn tập chương 4<!--MOLI_QUIZ_META:{\"essayConfig\":null}-->",
      dueDate: "2026-11-05T16:59:00.000Z",
      classTitle: "CSCA-K12",
      courseTitle: "Toán CSCA",
      sessionTitle: "Buổi 4",
      instructorName: "Giảng viên",
      durationMinutes: 30,
      attemptLimit: 2,
      passingScore: 60,
      actionUrl: "https://www.molycourse.online/lms/quiz/99",
    });
    assert.equal(res.success, true);
    assert.equal(res.mock, true);
  } finally {
    if (prevKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = prevKey;
  }
});
