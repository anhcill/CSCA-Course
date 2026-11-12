import assert from "node:assert/strict";
import test from "node:test";
import { notifyApprovedManagementEnrollment } from "./managementEnrollmentNotification.service.js";
import { sendClassEnrollmentApprovedEmail } from "./brevoEmail.service.js";

test("approved Record enrollment emails the student with the video course link", async () => {
  const sent = [];
  const result = await notifyApprovedManagementEnrollment({
    membershipId: 42,
    frontendUrl: "https://www.molycourse.online/",
    db: {
      query: async (sql, params) => {
        assert.deepEqual(params, [42]);
        assert.match(sql, /COALESCE\(record_alias\.title, lc\.title, c\.title, c\.name\) AS class_title/);
        assert.match(sql, /record_alias\.id = ce\.management_class_alias_id/);
        assert.match(sql, /FROM video_course_profiles vcp/);
        return { rows: [{
          id: 42,
          status: "active",
          management_approval_status: "approved",
          email: "student@example.com",
          student_name: "Nguyễn Văn A",
          class_id: 5,
          class_title: "Toán CSCA - Lớp 01",
          course_id: 2,
          course_title: "Toán CSCA",
          instructor_name: "Giảng viên Nguyễn Minh Đức",
          learning_mode: "recording",
          recording_offering_id: "record-class-source",
        }] };
      },
    },
    emailSender: async (payload) => {
      sent.push(payload);
      return { success: true, messageId: "email-42" };
    },
  });

  assert.equal(result.sent, true);
  assert.equal(result.messageId, "email-42");
  assert.deepEqual(sent, [{
    email: "student@example.com",
    username: "Nguyễn Văn A",
    className: "Toán CSCA - Lớp 01",
    courseName: "Toán CSCA",
    instructorName: "Giảng viên Nguyễn Minh Đức",
    classUrl: "https://www.molycourse.online/video-courses/record-class-source",
    learningMode: "recording",
  }]);
});

test("approved Live enrollment keeps the Live LMS class link", async () => {
  const sent = [];
  await notifyApprovedManagementEnrollment({
    membershipId: 43,
    frontendUrl: "https://www.molycourse.online/",
    db: { query: async () => ({ rows: [{
      id: 43,
      status: "active",
      management_approval_status: "approved",
      email: "live@example.com",
      student_name: "Học viên Live",
      class_id: 6,
      class_title: "Toán CSCA Live",
      course_id: 2,
      course_title: "Toán CSCA",
      instructor_name: "Giảng viên A",
      learning_mode: "live",
      recording_offering_id: null,
    }] }) },
    emailSender: async (payload) => { sent.push(payload); return { success: true }; },
  });

  assert.equal(sent[0].classUrl, "https://www.molycourse.online/lms/courses/2/classes/6");
  assert.equal(sent[0].learningMode, "live");
});

test("Record enrollment never falls back to a Live LMS link when its offering is unavailable", async () => {
  const sent = [];
  await notifyApprovedManagementEnrollment({
    membershipId: 44,
    frontendUrl: "https://www.molycourse.online",
    db: { query: async () => ({ rows: [{
      id: 44,
      status: "active",
      management_approval_status: "approved",
      email: "record@example.com",
      student_name: "Học viên Record",
      class_id: 6,
      class_title: "Khóa Record",
      course_id: 2,
      learning_mode: "recording",
      recording_offering_id: null,
    }] }) },
    emailSender: async (payload) => { sent.push(payload); return { success: true }; },
  });

  assert.equal(sent[0].classUrl, "https://www.molycourse.online/courses");
  assert.doesNotMatch(sent[0].classUrl, /\/lms\/courses/);
});

test("non-active or rejected Management enrollment does not send an email", async () => {
  let calls = 0;
  const result = await notifyApprovedManagementEnrollment({
    membershipId: 7,
    db: { query: async () => ({ rows: [{
      id: 7,
      status: "suspended",
      management_approval_status: "approved",
      email: "student@example.com",
    }] }) },
    emailSender: async () => { calls += 1; return { success: true }; },
  });
  assert.equal(result.sent, false);
  assert.equal(calls, 0);
});

test("email provider rejection is surfaced for operational logging", async () => {
  await assert.rejects(
    notifyApprovedManagementEnrollment({
      membershipId: 9,
      db: { query: async () => ({ rows: [{
        id: 9,
        status: "active",
        management_approval_status: "approved",
        email: "student@example.com",
        student_name: "Học viên",
        class_id: 5,
        class_title: "Lớp 01",
        course_id: 2,
      }] }) },
      emailSender: async () => ({ success: false, error: "provider unavailable" }),
    }),
    /provider unavailable/,
  );
});

test("class enrollment approval email supports Brevo sandbox mode", async () => {
  const previousKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "";
  try {
    const result = await sendClassEnrollmentApprovedEmail({
      email: "student@example.com",
      username: "Học viên A",
      className: "Toán CSCA - Lớp 01",
      courseName: "Toán CSCA",
      instructorName: "Giảng viên A",
      classUrl: "https://www.molycourse.online/video-courses/record-class-source",
      learningMode: "recording",
    });
    assert.equal(result.success, true);
    assert.equal(result.mock, true);
  } finally {
    if (previousKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = previousKey;
  }
});
