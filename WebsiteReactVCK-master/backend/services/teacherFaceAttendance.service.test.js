import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  computePayrollEligibility,
  evaluateTeacherCheckInPolicy,
  evaluateTeacherCheckOutPolicy,
  adminOverrideSessionAttendance,
  pickRecommendedSmartAttendanceAction,
} from "./teacherFaceAttendance.service.js";
import {
  createActiveChallengeToken,
  evaluateActiveChallengePair,
  getAwsRekognitionConfig,
  verifyActiveChallengeToken,
} from "./awsRekognition.service.js";
import {
  getAllTeachersSalaryOverview,
  getTeacherSalaryDetail,
  isFaceAttendanceRequiredForSession,
} from "./salary.service.js";

test("evaluateTeacherCheckInPolicy enforces 30-minute early window and 10-minute late grace", () => {
  const startTime = "2026-11-22T10:00:00.000Z";
  const endTime = "2026-11-22T12:00:00.000Z";

  // 35 minutes early -> blocked
  assert.equal(
    evaluateTeacherCheckInPolicy({
      startTime,
      endTime,
      status: "scheduled",
      now: "2026-11-22T09:25:00.000Z",
    }).canCheckIn,
    false,
  );

  // 30 minutes early -> allowed & on_time
  const earlyOk = evaluateTeacherCheckInPolicy({
    startTime,
    endTime,
    status: "scheduled",
    now: "2026-11-22T09:30:00.000Z",
  });
  assert.equal(earlyOk.canCheckIn, true);
  assert.equal(earlyOk.isLate, false);
  assert.equal(earlyOk.lateMinutes, 0);

  // 10 minutes after start -> still on_time
  const graceOk = evaluateTeacherCheckInPolicy({
    startTime,
    endTime,
    status: "scheduled",
    now: "2026-11-22T10:10:00.000Z",
  });
  assert.equal(graceOk.canCheckIn, true);
  assert.equal(graceOk.isLate, false);

  // 15 minutes after start -> allowed, marked late with 15 minutes
  const lateOk = evaluateTeacherCheckInPolicy({
    startTime,
    endTime,
    status: "scheduled",
    now: "2026-11-22T10:15:00.000Z",
  });
  assert.equal(lateOk.canCheckIn, true);
  assert.equal(lateOk.isLate, true);
  assert.equal(lateOk.lateMinutes, 15);

  // After end_time -> blocked
  assert.equal(
    evaluateTeacherCheckInPolicy({
      startTime,
      endTime,
      status: "scheduled",
      now: "2026-11-22T12:05:00.000Z",
    }).canCheckIn,
    false,
  );
});

test("evaluateTeacherCheckOutPolicy requires check-in first and flags early leave beyond 10 minutes", () => {
  const startTime = "2026-11-22T10:00:00.000Z";
  const endTime = "2026-11-22T12:00:00.000Z";

  // No check-in yet -> blocked
  assert.equal(
    evaluateTeacherCheckOutPolicy({
      startTime,
      endTime,
      status: "live",
      now: "2026-11-22T11:55:00.000Z",
      existingAttendance: null,
    }).canCheckOut,
    false,
  );

  // Checked in, leaving 20 minutes early -> allowed, flagged early_leave
  const earlyOut = evaluateTeacherCheckOutPolicy({
    startTime,
    endTime,
    status: "live",
    now: "2026-11-22T11:40:00.000Z",
    existingAttendance: { check_in_at: "2026-11-22T09:55:00.000Z", check_in_status: "on_time" },
  });
  assert.equal(earlyOut.canCheckOut, true);
  assert.equal(earlyOut.isEarlyLeave, true);
  assert.equal(earlyOut.earlyLeaveMinutes, 20);

  // Checked in, leaving 5 minutes before end -> on_time
  const normalOut = evaluateTeacherCheckOutPolicy({
    startTime,
    endTime,
    status: "live",
    now: "2026-11-22T11:55:00.000Z",
    existingAttendance: { check_in_at: "2026-11-22T09:55:00.000Z", check_in_status: "on_time" },
  });
  assert.equal(normalOut.canCheckOut, true);
  assert.equal(normalOut.isEarlyLeave, false);
});

test("computePayrollEligibility enforces Cách 1 (check-in + check-out or admin override)", () => {
  // Only check-in -> not eligible yet
  assert.equal(
    computePayrollEligibility({
      check_in_at: "2026-11-22T09:55:00.000Z",
      check_in_status: "on_time",
      check_out_at: null,
      check_out_status: null,
    }),
    false,
  );

  // Late check-in + early check-out -> still eligible under Cách 1 (full duration, admin sees minutes)
  assert.equal(
    computePayrollEligibility({
      check_in_at: "2026-11-22T10:15:00.000Z",
      check_in_status: "late",
      check_out_at: "2026-11-22T11:45:00.000Z",
      check_out_status: "early_leave",
    }),
    true,
  );

  // Manual review pending -> not eligible until admin approves
  assert.equal(
    computePayrollEligibility({
      check_in_at: "2026-11-22T09:55:00.000Z",
      check_in_status: "manual_review",
      check_out_at: "2026-11-22T12:00:00.000Z",
      check_out_status: "on_time",
    }),
    false,
  );

  // Admin approved overrides missing/manual check-in
  assert.equal(
    computePayrollEligibility({
      admin_override_status: "approved",
    }),
    true,
  );

  // Admin rejected overrides even valid check-in + check-out
  assert.equal(
    computePayrollEligibility({
      check_in_at: "2026-11-22T09:55:00.000Z",
      check_in_status: "on_time",
      check_out_at: "2026-11-22T12:00:00.000Z",
      check_out_status: "on_time",
      admin_override_status: "rejected",
    }),
    false,
  );
});

test("Cách 1 salary integration counts historical sessions, holds missing check-out post-enrollment, and unlocks on admin override", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  await db.exec(`
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL,
      hourly_rate NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE student_profiles (
      user_id BIGINT PRIMARY KEY,
      full_name TEXT
    );
    CREATE TABLE courses (
      id BIGSERIAL PRIMARY KEY,
      title TEXT,
      name TEXT
    );
    CREATE TABLE live_classes (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT,
      instructor_id BIGINT,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      hourly_rate_override NUMERIC(12,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE class_teachers (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      teacher_id BIGINT NOT NULL,
      teaching_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      hourly_rate_override NUMERIC(12,2)
    );
    CREATE TABLE class_sessions (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      title TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      duration_hours NUMERIC(4,2),
      is_payable BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE teacher_salary_settlements (
      id BIGSERIAL PRIMARY KEY,
      teacher_id BIGINT NOT NULL,
      period TEXT NOT NULL DEFAULT 'all',
      bonus_amount NUMERIC(12,2) DEFAULT 0,
      deduction_amount NUMERIC(12,2) DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      notes TEXT,
      paid_at TIMESTAMPTZ,
      settled_by BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE teacher_face_enrollments (
      id BIGSERIAL PRIMARY KEY,
      teacher_id BIGINT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      mime_type TEXT DEFAULT 'image/jpeg',
      consent_accepted_at TIMESTAMPTZ DEFAULT NOW(),
      liveness_confidence NUMERIC(5,2),
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_by BIGINT,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE teacher_session_attendance (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL,
      teacher_id BIGINT NOT NULL,
      check_in_at TIMESTAMPTZ,
      check_in_status TEXT,
      late_minutes INTEGER NOT NULL DEFAULT 0,
      check_in_liveness_session_id TEXT,
      check_in_liveness_score NUMERIC(5,2),
      check_in_face_similarity NUMERIC(5,2),
      check_in_r2_key TEXT,
      check_in_provider TEXT,
      check_in_ip TEXT,
      check_in_user_agent TEXT,
      check_out_at TIMESTAMPTZ,
      check_out_status TEXT,
      early_leave_minutes INTEGER NOT NULL DEFAULT 0,
      check_out_liveness_session_id TEXT,
      check_out_liveness_score NUMERIC(5,2),
      check_out_face_similarity NUMERIC(5,2),
      check_out_r2_key TEXT,
      check_out_provider TEXT,
      check_out_ip TEXT,
      check_out_user_agent TEXT,
      payroll_eligible BOOLEAN NOT NULL DEFAULT FALSE,
      admin_override_status TEXT,
      admin_override_by BIGINT,
      admin_override_at TIMESTAMPTZ,
      admin_override_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (session_id, teacher_id)
    );
  `);

  await db.query("INSERT INTO users (id, username, email, role, hourly_rate) VALUES (10, 'gv1', 'gv1@moly.vn', 'creator', 200000)");
  await db.query("INSERT INTO users (id, username, email, role, hourly_rate) VALUES (1, 'admin', 'admin@moly.vn', 'admin', 0)");
  await db.query("INSERT INTO courses (id, title) VALUES (1, 'HSK 4')");
  await db.query("INSERT INTO live_classes (id, course_id, instructor_id, title) VALUES (100, 1, 10, 'HSK4-A')");

  // Teacher approved face enrollment on Nov 10
  await db.query(
    "INSERT INTO teacher_face_enrollments (teacher_id, status, r2_key, reviewed_by, reviewed_at) VALUES (10, 'approved', 'local://teacher-face/enrollments/10/ref.jpg', 1, '2026-11-10T00:00:00.000Z')",
  );

  // Session 1: Historical (Nov 5, before enrollment approval) -> should still be paid!
  await db.query(
    "INSERT INTO class_sessions (id, live_class_id, title, start_time, end_time, status) VALUES (1001, 100, 'Buổi 1 (Cũ)', '2026-11-05T10:00:00.000Z', '2026-11-05T12:00:00.000Z', 'ended')",
  );
  // Session 2: Post-enrollment (Nov 12), has BOTH check-in (late 15m) + check-out -> PAID (full 2h)
  await db.query(
    "INSERT INTO class_sessions (id, live_class_id, title, start_time, end_time, status) VALUES (1002, 100, 'Buổi 2 (Đủ ra vào)', '2026-11-12T10:00:00.000Z', '2026-11-12T12:00:00.000Z', 'ended')",
  );
  await db.query(
    `INSERT INTO teacher_session_attendance (session_id, teacher_id, check_in_at, check_in_status, late_minutes, check_out_at, check_out_status, payroll_eligible)
     VALUES (1002, 10, '2026-11-12T10:15:00.000Z', 'late', 15, '2026-11-12T12:00:00.000Z', 'on_time', TRUE)`,
  );
  // Session 3: Post-enrollment (Nov 15), ONLY check-in (missing check-out) -> PENDING, NOT PAID YET
  await db.query(
    "INSERT INTO class_sessions (id, live_class_id, title, start_time, end_time, status) VALUES (1003, 100, 'Buổi 3 (Thiếu Ra)', '2026-11-15T10:00:00.000Z', '2026-11-15T12:00:00.000Z', 'ended')",
  );
  await db.query(
    `INSERT INTO teacher_session_attendance (session_id, teacher_id, check_in_at, check_in_status, payroll_eligible)
     VALUES (1003, 10, '2026-11-15T09:50:00.000Z', 'on_time', FALSE)`,
  );

  assert.equal(
    isFaceAttendanceRequiredForSession({
      sessionStartTime: "2026-11-05T10:00:00.000Z",
      enrollment: { status: "approved", reviewed_at: "2026-11-10T00:00:00.000Z" },
    }),
    false,
  );

  const detail = await getTeacherSalaryDetail(10, db);
  assert.equal(detail.summary.completedSessions, 2); // Session 1 + Session 2
  assert.equal(detail.summary.attendancePendingSessions, 1); // Session 3
  assert.equal(detail.summary.lateSessionsCount, 1);
  assert.equal(detail.summary.accruedSalary, 800000); // 4h * 200,000

  const overview = await getAllTeachersSalaryOverview(db);
  const gv1 = overview.teachers.find((item) => Number(item.id) === 10);
  assert.equal(gv1.completedSessions, 2);
  assert.equal(gv1.attendancePendingSessions, 1);
  assert.equal(gv1.faceEnrollmentStatus, "approved");

  // Admin approves Session 3 manually -> now all 3 sessions count!
  await adminOverrideSessionAttendance({
    sessionId: 1003,
    teacherId: 10,
    decision: "approved",
    note: "GV quên chấm công ra, đã xác nhận dạy đủ",
    adminId: 1,
    db,
  });

  const detailAfter = await getTeacherSalaryDetail(10, db);
  assert.equal(detailAfter.summary.completedSessions, 3);
  assert.equal(detailAfter.summary.attendancePendingSessions, 0);
  assert.equal(detailAfter.summary.accruedSalary, 1200000);
});

test("pickRecommendedSmartAttendanceAction prioritizes active check-out, then open check-in, then upcoming", () => {
  const now = "2026-11-22T10:00:00.000Z";
  const s1 = {
    id: 1,
    startTime: "2026-11-22T08:00:00.000Z",
    endTime: "2026-11-22T10:00:00.000Z",
    attendance: { checkInAt: "2026-11-22T07:55:00.000Z", checkOutAt: null },
    policies: { checkIn: { canCheckIn: false }, checkOut: { canCheckOut: true } },
  };
  const s2 = {
    id: 2,
    startTime: "2026-11-22T10:15:00.000Z",
    endTime: "2026-11-22T12:15:00.000Z",
    attendance: null,
    policies: { checkIn: { canCheckIn: true }, checkOut: { canCheckOut: false } },
  };
  const s3 = {
    id: 3,
    startTime: "2026-11-22T14:00:00.000Z",
    endTime: "2026-11-22T16:00:00.000Z",
    attendance: null,
    policies: { checkIn: { canCheckIn: false, opensAt: "2026-11-22T13:30:00.000Z" }, checkOut: { canCheckOut: false } },
  };

  // Both s1 (ready check_out) and s2 (ready check_in) -> picks s1 check_out first
  const pick1 = pickRecommendedSmartAttendanceAction([s1, s2, s3], now);
  assert.equal(pick1.actionType, "check_out");
  assert.equal(pick1.session.id, 1);

  // Only s2 (ready check_in) and s3 (upcoming) -> picks s2 check_in
  const pick2 = pickRecommendedSmartAttendanceAction([s2, s3], now);
  assert.equal(pick2.actionType, "check_in");
  assert.equal(pick2.session.id, 2);

  // Only s3 (upcoming) -> picks s3 upcoming
  const pick3 = pickRecommendedSmartAttendanceAction([s3], now);
  assert.equal(pick3.actionType, "upcoming");
  assert.equal(pick3.readyNow, false);
  assert.equal(pick3.session.id, 3);

  // Empty -> no_sessions_today
  assert.equal(pickRecommendedSmartAttendanceAction([], now).actionType, "no_sessions_today");
});

test("AWS Rekognition active_challenge mode selects automatically for ap-southeast-2 and validates gesture delta + signed tokens", () => {
  const cfg = getAwsRekognitionConfig({
    AWS_REKOGNITION_REGION: "ap-southeast-2",
    AWS_ACCESS_KEY_ID: "AKIA_TEST",
    AWS_SECRET_ACCESS_KEY: "SECRET_TEST",
    AWS_LIVENESS_ROLE_ARN: "arn:aws:iam::123:role/Test",
  });
  assert.equal(cfg.configured, true);
  assert.equal(cfg.mode, "active_challenge");

  const token = createActiveChallengeToken(
    { teacherId: 7, sessionId: 99, type: "check_in", challengeCode: "turn_left" },
    { JWT_SECRET: "test-secret-key-32-chars-minimum!!" },
  );
  const decoded = verifyActiveChallengeToken(
    { token, teacherId: 7, sessionId: 99, type: "check_in" },
    { JWT_SECRET: "test-secret-key-32-chars-minimum!!" },
  );
  assert.equal(decoded.c, "turn_left");

  // Smile challenge passes when smiling confidently
  assert.equal(
    evaluateActiveChallengePair({
      challengeCode: "smile",
      straightFace: { Pose: { Yaw: 1 }, Smile: { Value: false, Confidence: 95 } },
      challengeFace: { Pose: { Yaw: 2 }, Smile: { Value: true, Confidence: 92 } },
    }).passed,
    true,
  );

  // Turn challenge requires >= 10 deg yaw change
  assert.equal(
    evaluateActiveChallengePair({
      challengeCode: "turn_left",
      straightFace: { Pose: { Yaw: 2 } },
      challengeFace: { Pose: { Yaw: 5 } },
    }).passed,
    false,
  );
  assert.equal(
    evaluateActiveChallengePair({
      challengeCode: "turn_left",
      straightFace: { Pose: { Yaw: 2 } },
      challengeFace: { Pose: { Yaw: -18 } },
    }).passed,
    true,
  );
});
