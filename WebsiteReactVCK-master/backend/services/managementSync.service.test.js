import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { applyManagementEvent, SyncValidationError, parseManagementEvent, syncCalendarSession } from "./managementSync.service.js";

const validEvent = (overrides = {}) => ({
  eventId: "evt-course-001",
  eventType: "course.upserted",
  occurredAt: "2026-09-21T08:00:00.000Z",
  source: "internal-management",
  payload: {
    courseSourceId: "course-csca-01",
    title: "CSCA Toán nền tảng",
    teacherSourceId: "teacher-anh",
  },
  ...overrides,
});

test("parseManagementEvent accepts a supported InternalManagement envelope", () => {
  const event = parseManagementEvent(validEvent());
  assert.equal(event.eventId, "evt-course-001");
  assert.equal(event.eventType, "course.upserted");
  assert.equal(event.source, "internal-management");
  assert.equal(event.occurredAt.toISOString(), "2026-09-21T08:00:00.000Z");
});

test("parseManagementEvent rejects an unsupported source or event type", () => {
  assert.throws(
    () => parseManagementEvent(validEvent({ source: "browser" })),
    SyncValidationError,
  );
  assert.throws(
    () => parseManagementEvent(validEvent({ eventType: "course.deleted" })),
    SyncValidationError,
  );
});

test("parseManagementEvent requires a payload object", () => {
  assert.throws(
    () => parseManagementEvent(validEvent({ payload: [] })),
    SyncValidationError,
  );
});

test("parseManagementEvent accepts inbound Management calendar events", () => {
  for (const eventType of [
    "class.schedule.upserted", "class.schedule.archived",
    "class.session.upserted", "class.session.cancelled",
  ]) {
    assert.equal(parseManagementEvent(validEvent({ eventType })).eventType, eventType);
  }
});

test("recording class aliases enroll paid learners into the source LMS class", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('record-teacher','record-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,external_student_id,is_management_managed,lms_account_status)
     VALUES ('record-student','record-student@example.test','record-student-source',TRUE,'active') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,external_course_id,is_published,is_management_managed)
     VALUES ('Record course','record-course',$1,'record-course-source',TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const sourceClass = (await db.query(
    `INSERT INTO live_classes
       (title,course_id,instructor_id,status,management_class_source_id,management_course_source_id,
        management_source_updated_at,management_approval_status)
     VALUES ('Main class',$1,$2,'active','main-class-source','record-course-source',NOW(),'approved') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];

  const aliasResult = await applyManagementEvent(db, {
    eventType: "class.upserted",
    occurredAt: new Date("2026-11-09T05:00:00Z"),
    payload: {
      classSourceId: "record-class-source",
      courseSourceId: "record-course-source",
      title: "Main class - Record",
      classType: "RECORDING",
      sourceClassSourceId: "main-class-source",
      status: "active",
      sourceUpdatedAt: "2026-11-09T05:00:00Z",
    },
  });
  assert.equal(aliasResult.action, "class.recording_alias.synced");
  assert.equal(Number(aliasResult.data.live_class_id), Number(sourceClass.id));

  const membershipResult = await applyManagementEvent(db, {
    eventType: "class.membership.changed",
    occurredAt: new Date("2026-11-09T05:01:00Z"),
    payload: {
      membershipSourceId: "record-membership-source",
      classSourceId: "record-class-source",
      studentSourceId: "record-student-source",
      status: "active",
      sourceUpdatedAt: "2026-11-09T05:01:00Z",
    },
  });
  assert.equal(membershipResult.data.learning_mode, "recording");
  const enrollment = (await db.query(
    "SELECT * FROM class_enrollments WHERE user_id=$1",
    [student.id],
  )).rows[0];
  assert.equal(Number(enrollment.live_class_id), Number(sourceClass.id));
  assert.equal(enrollment.learning_mode, "recording");
  assert.ok(enrollment.management_class_alias_id);
  assert.equal(enrollment.status, "suspended", "normal approval/payment flow remains required");
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM live_classes")).rows[0].count, 1);

  const completedSourceClass = (await db.query(
    `INSERT INTO live_classes
       (title,course_id,instructor_id,status,management_class_source_id,management_course_source_id,
        management_source_updated_at,management_approval_status)
     VALUES ('Completed source',$1,$2,'completed','completed-source','record-course-source',NOW(),'approved') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const remappedAlias = await applyManagementEvent(db, {
    eventType: "class.upserted",
    occurredAt: new Date("2026-11-09T05:01:30Z"),
    payload: {
      classSourceId: "record-class-source",
      courseSourceId: "record-course-source",
      title: "Completed source - Record",
      classType: "RECORDING",
      sourceClassSourceId: "completed-source",
      status: "active",
      sourceUpdatedAt: "2026-11-09T05:01:30Z",
    },
  });
  assert.equal(remappedAlias.data.migratedEnrollmentCount, 1);
  assert.equal(Number((await db.query(
    "SELECT live_class_id FROM class_enrollments WHERE user_id=$1",
    [student.id],
  )).rows[0].live_class_id), Number(completedSourceClass.id));

  await applyManagementEvent(db, {
    eventType: "class.membership.changed",
    occurredAt: new Date("2026-11-09T05:02:00Z"),
    payload: {
      membershipSourceId: "live-membership-source",
      classSourceId: "completed-source",
      studentSourceId: "record-student-source",
      learningMode: "LIVE",
      status: "active",
      sourceUpdatedAt: "2026-11-09T05:02:00Z",
    },
  });
  assert.equal((await db.query(
    "SELECT learning_mode FROM class_enrollments WHERE user_id=$1",
    [student.id],
  )).rows[0].learning_mode, "live", "LIVE membership may upgrade an existing RECORD enrollment");
});

test("recording alias never downgrades or revokes an active live enrollment", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('live-teacher','live-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,external_student_id,is_management_managed,lms_account_status)
     VALUES ('khlyp06','khlyp06@gmail.com','khlyp06-source',TRUE,'active') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,external_course_id,is_published,is_management_managed)
     VALUES ('Dual course','dual-course',$1,'dual-course-source',TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const sourceClass = (await db.query(
    `INSERT INTO live_classes
       (title,course_id,instructor_id,status,management_class_source_id,management_course_source_id,
        management_source_updated_at,management_approval_status)
     VALUES ('Live source',$1,$2,'active','dual-live-source','dual-course-source',NOW(),'approved') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments
       (user_id,live_class_id,status,is_internal_test,learning_mode,management_membership_source_id,
        management_membership_status,management_approval_status,management_source_updated_at)
     VALUES ($1,$2,'active',TRUE,'live','khlyp06-live-membership','active','approved','2026-11-09T04:00:00Z')`,
    [student.id, sourceClass.id],
  );
  await applyManagementEvent(db, {
    eventType: "class.upserted",
    occurredAt: new Date("2026-11-09T05:00:00Z"),
    payload: {
      classSourceId: "dual-record-source",
      courseSourceId: "dual-course-source",
      title: "Live source - Record",
      classType: "RECORDING",
      sourceClassSourceId: "dual-live-source",
      status: "active",
      sourceUpdatedAt: "2026-11-09T05:00:00Z",
    },
  });

  for (const [status, timestamp] of [["active", "2026-11-09T05:01:00Z"], ["revoked", "2026-11-09T05:02:00Z"]]) {
    const result = await applyManagementEvent(db, {
      eventType: "class.membership.changed",
      occurredAt: new Date(timestamp),
      payload: {
        membershipSourceId: "khlyp06-record-membership",
        classSourceId: "dual-record-source",
        studentSourceId: "khlyp06-source",
        status,
        sourceUpdatedAt: timestamp,
      },
    });
    assert.equal(result.action, "class.membership.live_preserved");
  }

  const enrollment = (await db.query(
    `SELECT status,is_internal_test,learning_mode,management_membership_source_id
     FROM class_enrollments WHERE user_id=$1 AND live_class_id=$2`,
    [student.id, sourceClass.id],
  )).rows[0];
  assert.deepEqual(enrollment, {
    status: "active",
    is_internal_test: true,
    learning_mode: "live",
    management_membership_source_id: "khlyp06-live-membership",
  });
});

test("session move requires the complete previous date and time tuple", async () => {
  const event = parseManagementEvent(validEvent({
    eventType: "class.session.upserted",
    payload: {
      classSourceId: "class-01",
      sessionSourceId: "session-01",
      lessonDate: "2026-10-16",
      startTime: "20:00:00",
      endTime: "21:00:00",
      previousLessonDate: "2026-10-17",
      previousStartTime: "20:00:00",
    },
  }));

  await assert.rejects(
    () => syncCalendarSession({ query: async () => assert.fail("database should not be queried") }, event),
    /phải được gửi đầy đủ/,
  );
});

test("session move adopts the old generated occurrence instead of leaving a duplicate", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE live_classes (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      instructor_id BIGINT,
      management_class_source_id TEXT,
      management_source_updated_at TIMESTAMPTZ
    );
    CREATE TABLE class_schedules (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      management_schedule_source_id TEXT
    );
    CREATE TABLE class_sessions (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      schedule_id BIGINT,
      title TEXT,
      meet_url TEXT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      original_start_at TIMESTAMPTZ,
      original_end_at TIMESTAMPTZ,
      management_session_source_id TEXT,
      management_source_updated_at TIMESTAMPTZ,
      change_reason TEXT,
      changed_at TIMESTAMPTZ,
      session_kind TEXT NOT NULL DEFAULT 'regular',
      replacement_for_session_id BIGINT,
      is_payable BOOLEAN NOT NULL DEFAULT TRUE,
      cancel_reason TEXT,
      cancelled_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE class_attendance (id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL);
    CREATE TABLE class_session_change_logs (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT,
      schedule_id BIGINT,
      scope TEXT,
      before_state JSONB,
      after_state JSONB,
      reason TEXT
    );
    CREATE TABLE lms_management_calendar_outbox (
      id BIGSERIAL PRIMARY KEY,
      event_id TEXT,
      event_type TEXT,
      payload JSONB,
      payload_hash TEXT,
      correlation_id TEXT,
      idempotency_key TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING'
    );
  `);
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title, management_class_source_id) VALUES ('CSCA 01', 'class-01') RETURNING id",
  )).rows[0];
  const schedule = (await db.query(
    "INSERT INTO class_schedules(live_class_id, management_schedule_source_id) VALUES ($1, 'schedule-01') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const oldSession = (await db.query(
    `INSERT INTO class_sessions
       (live_class_id, schedule_id, title, start_time, end_time, original_start_at, original_end_at)
     VALUES ($1, $2, 'Buổi cũ', '2026-10-17T13:00:00Z', '2026-10-17T14:00:00Z',
       '2026-10-17T13:00:00Z', '2026-10-17T14:00:00Z') RETURNING id`,
    [liveClass.id, schedule.id],
  )).rows[0];

  const outcome = await syncCalendarSession(db, {
    eventType: "class.session.upserted",
    occurredAt: new Date("2026-10-15T04:00:00Z"),
    payload: {
      classSourceId: "class-01",
      sessionSourceId: "session-01",
      scheduleSourceId: "schedule-01",
      lessonDate: "2026-10-16",
      startTime: "20:00:00",
      endTime: "21:00:00",
      previousLessonDate: "2026-10-17",
      previousStartTime: "20:00:00",
      previousEndTime: "21:00:00",
      timezone: "Asia/Ho_Chi_Minh",
      status: "rescheduled",
      changeReason: "Chuyển sang ngày 16",
      sourceUpdatedAt: "2026-10-15T04:00:00Z",
    },
  });

  assert.equal(outcome.action, "class.session.synced");
  const sessions = (await db.query("SELECT * FROM class_sessions ORDER BY id")).rows;
  assert.equal(sessions.length, 1);
  assert.equal(Number(sessions[0].id), Number(oldSession.id));
  assert.equal(sessions[0].management_session_source_id, "session-01");
  assert.equal(new Date(sessions[0].start_time).toISOString(), "2026-10-16T13:00:00.000Z");
  assert.equal(new Date(sessions[0].original_start_at).toISOString(), "2026-10-17T13:00:00.000Z");
  assert.equal(sessions[0].status, "rescheduled");
});

test("Management cancellation shifts an existing session curriculum and extends the class", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('cancel-teacher','cancel-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published)
     VALUES ('Cancellation course','cancellation-course',$1,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes
       (title,course_id,instructor_id,status,management_class_source_id,management_source_updated_at)
     VALUES ('Cancellation class',$1,$2,'active','class-cancel','2026-11-01T00:00:00Z') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const sundaySchedule = (await db.query(
    `INSERT INTO class_schedules
       (live_class_id,day_of_week,start_time,end_time,start_date,status,timezone,management_schedule_source_id)
     VALUES ($1,7,'15:00','17:00','2026-11-01','active','Asia/Ho_Chi_Minh','schedule-sunday') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const wednesdaySchedule = (await db.query(
    `INSERT INTO class_schedules
       (live_class_id,day_of_week,start_time,end_time,start_date,status,timezone,management_schedule_source_id)
     VALUES ($1,3,'20:00','22:00','2026-11-01','active','Asia/Ho_Chi_Minh','schedule-wednesday') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const cancelled = (await db.query(
    `INSERT INTO class_sessions
       (live_class_id,schedule_id,title,start_time,end_time,status,original_start_at,original_end_at,
        management_session_source_id,management_source_updated_at,session_kind,version)
     VALUES ($1,$2,'Chapter 14','2026-11-08T08:00:00Z','2026-11-08T10:00:00Z','scheduled',
       '2026-11-08T08:00:00Z','2026-11-08T10:00:00Z','session-cancel','2026-11-01T00:00:00Z','regular',3)
     RETURNING id`,
    [liveClass.id, sundaySchedule.id],
  )).rows[0];
  const following = (await db.query(
    `INSERT INTO class_sessions
       (live_class_id,schedule_id,title,start_time,end_time,status,original_start_at,original_end_at,session_kind)
     VALUES ($1,$2,'Chapter 15','2026-11-11T13:00:00Z','2026-11-11T15:00:00Z','scheduled',
       '2026-11-11T13:00:00Z','2026-11-11T15:00:00Z','regular') RETURNING id`,
    [liveClass.id, wednesdaySchedule.id],
  )).rows[0];

  await db.query("BEGIN");
  const outcome = await syncCalendarSession(db, {
    eventType: "class.session.cancelled",
    occurredAt: new Date("2026-11-09T02:20:01Z"),
    payload: {
      classSourceId: "class-cancel",
      sessionSourceId: "session-cancel",
      lmsSessionId: String(cancelled.id),
      expectedLmsVersion: 3,
      lmsScheduleId: String(sundaySchedule.id),
      lessonDate: "2026-11-08",
      startTime: "15:00:00",
      endTime: "17:00:00",
      timezone: "Asia/Ho_Chi_Minh",
      status: "cancelled",
      changeReason: "Teacher unavailable",
      sessionKind: "Regular",
      isPayable: false,
      curriculumAction: "ShiftForward",
      extendCourse: true,
      sourceUpdatedAt: "2026-11-09T02:20:01Z",
    },
  });
  await db.query("COMMIT");

  assert.equal(outcome.action, "class.session.synced");
  assert.ok(outcome.data.curriculumShift?.extensionSessionId);
  const cancelledAfter = (await db.query("SELECT status,is_payable,cancel_reason FROM class_sessions WHERE id=$1", [cancelled.id])).rows[0];
  assert.equal(cancelledAfter.status, "cancelled");
  assert.equal(cancelledAfter.is_payable, false);
  assert.equal(cancelledAfter.cancel_reason, "Teacher unavailable");
  const followingAfter = (await db.query("SELECT title FROM class_sessions WHERE id=$1", [following.id])).rows[0];
  assert.equal(followingAfter.title, "Chapter 14");
  const extension = (await db.query(
    "SELECT title,status,session_kind FROM class_sessions WHERE id=$1",
    [outcome.data.curriculumShift.extensionSessionId],
  )).rows[0];
  assert.equal(extension.title, "Chapter 15");
  assert.equal(extension.status, "scheduled");
  assert.equal(extension.session_kind, "regular");
  const calendarDeliveries = (await db.query(
    `SELECT event_type, payload->'lmsSession'->>'id' AS session_id,
            payload->'lmsSession'->>'title' AS title,
            (payload->'lmsSession'->>'version')::int AS version
     FROM lms_management_calendar_outbox
     ORDER BY id`,
  )).rows;
  const shiftedFollowingDelivery = calendarDeliveries.find((row) => row.session_id === String(following.id));
  assert.equal(shiftedFollowingDelivery?.event_type, "lms.session.upserted");
  assert.equal(shiftedFollowingDelivery?.title, "Chapter 14");
  assert.equal(shiftedFollowingDelivery?.version, 2);
  const extensionDelivery = calendarDeliveries.find(
    (row) => row.session_id === String(outcome.data.curriculumShift.extensionSessionId),
  );
  assert.equal(extensionDelivery?.event_type, "lms.session.upserted");
  assert.equal(extensionDelivery?.title, "Chapter 15");
  assert.equal(calendarDeliveries.filter((row) => row.event_type === "lms.session.upserted").length, 2);
  assert.equal(calendarDeliveries.filter((row) => row.event_type === "lms.session.cancelled").length, 1);
  assert.equal(Number((await db.query(
    "SELECT COUNT(*) AS count FROM session_curriculum_operations WHERE cancelled_session_id=$1 AND completed_at IS NOT NULL",
    [cancelled.id],
  )).rows[0].count), 1);
});

test("Management email changes preserve LMS identities, access and one active lead teacher", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const oldTeacher = (await db.query(
    `INSERT INTO users
       (username, email, role, google_id, oauth_provider, email_verified,
        management_staff_source_id, is_management_managed, lms_account_status, management_source_updated_at)
     VALUES ('teacher-old', 'teacher-old@example.test', 'creator', 'google-teacher-old', 'google', TRUE,
       'teacher-source-old', TRUE, 'active', '2026-10-01T00:00:00Z') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name, slug, author_id, external_course_id, is_published, is_management_managed)
     VALUES ('Managed course', 'managed-course-email-sync', $1, 'course-email-sync', TRUE, TRUE) RETURNING id`,
    [oldTeacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes
       (title, course_id, instructor_id, status, management_class_source_id,
        management_course_source_id, management_source_updated_at, management_approval_status)
     VALUES ('Managed class', $1, $2, 'active', 'class-email-sync', 'course-email-sync',
       '2026-10-01T00:00:00Z', 'approved') RETURNING id`,
    [course.id, oldTeacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_teachers
       (live_class_id, teacher_id, management_teacher_source_id, teaching_role, status, management_source_updated_at)
     VALUES ($1, $2, 'teacher-source-old', 'lead', 'active', '2026-10-01T00:00:00Z')`,
    [liveClass.id, oldTeacher.id],
  );

  const student = (await db.query(
    `INSERT INTO users
       (username, email, google_id, oauth_provider, email_verified, external_student_id,
        is_management_managed, lms_account_status, management_source_updated_at)
     VALUES ('student-old', 'student-old@example.test', 'google-student-old', 'google', TRUE,
       'student-source-1', TRUE, 'active', '2026-10-01T00:00:00Z') RETURNING id`,
  )).rows[0];
  await db.query("INSERT INTO student_profiles(user_id, full_name) VALUES ($1, 'Old Student')", [student.id]);
  await db.query(
    `INSERT INTO class_enrollments
       (user_id, live_class_id, status, management_membership_source_id,
        management_membership_status, management_source_updated_at, management_approval_status)
     VALUES ($1, $2, 'active', 'membership-email-sync', 'active', '2026-10-01T00:00:00Z', 'approved')`,
    [student.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants
       (user_id, course_id, access_status, valid_from, source_updated_at)
     VALUES ($1, $2, 'active', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`,
    [student.id, course.id],
  );
  await db.query("INSERT INTO enrollments(user_id, course_id, status) VALUES ($1, $2, 'active')", [student.id, course.id]);

  await applyManagementEvent(db, {
    eventType: "teacher.upserted",
    occurredAt: new Date("2026-10-15T01:00:00Z"),
    payload: {
      teacherSourceId: "teacher-source-old",
      fullName: "Teacher New Email",
      email: "teacher-new@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T01:00:00Z",
    },
  });
  const updatedTeacher = (await db.query("SELECT * FROM users WHERE id=$1", [oldTeacher.id])).rows[0];
  assert.equal(updatedTeacher.email, "teacher-new@example.test");
  assert.equal(updatedTeacher.google_id, null, "old Google identity must lose class permissions after an email change");
  assert.equal(updatedTeacher.oauth_provider, "local");
  assert.equal(updatedTeacher.email_verified, false);
  assert.equal(Number((await db.query("SELECT instructor_id FROM live_classes WHERE id=$1", [liveClass.id])).rows[0].instructor_id), Number(oldTeacher.id));

  const secondTeacher = await applyManagementEvent(db, {
    eventType: "teacher.upserted",
    occurredAt: new Date("2026-10-15T02:00:00Z"),
    payload: {
      teacherSourceId: "teacher-source-new-lead",
      fullName: "Replacement Lead",
      email: "replacement-lead@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T02:00:00Z",
    },
  });
  await applyManagementEvent(db, {
    eventType: "class.teacher.assigned",
    occurredAt: new Date("2026-10-15T03:00:00Z"),
    payload: {
      classSourceId: "class-email-sync",
      teacherSourceId: "teacher-source-new-lead",
      teachingRole: "lead",
      status: "active",
      sourceUpdatedAt: "2026-10-15T03:00:00Z",
    },
  });
  const teacherMappings = (await db.query(
    "SELECT teacher_id, teaching_role, status FROM class_teachers WHERE live_class_id=$1 ORDER BY teacher_id",
    [liveClass.id],
  )).rows;
  assert.equal(teacherMappings.filter((mapping) => mapping.teaching_role === "lead" && mapping.status === "active").length, 1);
  assert.equal(Number((await db.query("SELECT instructor_id FROM live_classes WHERE id=$1", [liveClass.id])).rows[0].instructor_id), secondTeacher.entityId);
  assert.equal(teacherMappings.find((mapping) => Number(mapping.teacher_id) === Number(oldTeacher.id)).status, "revoked");

  await applyManagementEvent(db, {
    eventType: "student.provisioned",
    occurredAt: new Date("2026-10-15T04:00:00Z"),
    payload: {
      studentSourceId: "student-source-1",
      fullName: "Student New Email",
      email: "student-new@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T04:00:00Z",
    },
  });
  const updatedStudent = (await db.query("SELECT * FROM users WHERE id=$1", [student.id])).rows[0];
  assert.equal(updatedStudent.email, "student-new@example.test");
  assert.equal(updatedStudent.google_id, null);
  assert.equal(updatedStudent.email_verified, false);
  assert.equal((await db.query("SELECT status FROM class_enrollments WHERE user_id=$1 AND live_class_id=$2", [student.id, liveClass.id])).rows[0].status, "active");
  assert.equal((await db.query("SELECT access_status FROM lms_access_grants WHERE user_id=$1 AND course_id=$2", [student.id, course.id])).rows[0].access_status, "active");
  assert.equal((await db.query("SELECT status FROM enrollments WHERE user_id=$1 AND course_id=$2", [student.id, course.id])).rows[0].status, "active");

  await db.query("INSERT INTO users(username,email) VALUES ('email-owner','conflict@example.test')");
  await assert.rejects(() => applyManagementEvent(db, {
    eventType: "student.provisioned",
    occurredAt: new Date("2026-10-15T05:00:00Z"),
    payload: {
      studentSourceId: "student-source-1",
      fullName: "Student Conflict",
      email: "conflict@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T05:00:00Z",
    },
  }), /Email học viên đang thuộc tài khoản LMS khác/);
  assert.equal((await db.query("SELECT email FROM users WHERE id=$1", [student.id])).rows[0].email, "student-new@example.test");
});

test("teacher source takeover preserves the LMS user and rejects unrelated source conflicts", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const legacyTeacher = (await db.query(
    `INSERT INTO users
       (username, email, role, management_staff_source_id, is_management_managed,
        lms_account_status, management_source_updated_at)
     VALUES ('teacher-legacy-source', 'teacher-takeover@example.test', 'creator',
       'teacher-source-legacy', TRUE, 'active', '2026-10-01T00:00:00Z') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name, slug, author_id, external_course_id, is_published, is_management_managed)
     VALUES ('Teacher takeover course', 'teacher-takeover-course', $1, 'teacher-takeover-course', TRUE, TRUE)
     RETURNING id`,
    [legacyTeacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes
       (title, course_id, instructor_id, status, management_class_source_id,
        management_course_source_id, management_source_updated_at, management_approval_status)
     VALUES ('Teacher takeover class', $1, $2, 'active', 'teacher-takeover-class',
       'teacher-takeover-course', '2026-10-01T00:00:00Z', 'approved') RETURNING id`,
    [course.id, legacyTeacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_teachers
       (live_class_id, teacher_id, management_teacher_source_id, teaching_role, status, management_source_updated_at)
     VALUES ($1, $2, 'teacher-source-legacy', 'lead', 'active', '2026-10-01T00:00:00Z')`,
    [liveClass.id, legacyTeacher.id],
  );

  const takeover = await applyManagementEvent(db, {
    eventType: "teacher.upserted",
    occurredAt: new Date("2026-10-15T01:00:00Z"),
    payload: {
      teacherSourceId: "teacher-source-current",
      legacyTeacherSourceIds: ["teacher-source-legacy"],
      fullName: "Teacher Rebound",
      email: "teacher-takeover@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T01:00:00Z",
    },
  });

  assert.equal(takeover.entityId, Number(legacyTeacher.id));
  assert.equal((await db.query("SELECT management_staff_source_id FROM users WHERE id=$1", [legacyTeacher.id])).rows[0].management_staff_source_id, "teacher-source-current");
  assert.equal(Number((await db.query("SELECT instructor_id FROM live_classes WHERE id=$1", [liveClass.id])).rows[0].instructor_id), Number(legacyTeacher.id));
  assert.equal(Number((await db.query("SELECT teacher_id FROM class_teachers WHERE live_class_id=$1", [liveClass.id])).rows[0].teacher_id), Number(legacyTeacher.id));

  const preferredCurrent = (await db.query(
    `INSERT INTO users
       (username, email, role, management_staff_source_id, is_management_managed,
        lms_account_status, management_source_updated_at)
     VALUES ('teacher-current-priority', 'teacher-current-priority@example.test', 'creator',
       'teacher-source-priority', TRUE, 'active', '2026-10-01T00:00:00Z') RETURNING id`,
  )).rows[0];
  const ignoredLegacy = (await db.query(
    `INSERT INTO users
       (username, email, role, management_staff_source_id, is_management_managed,
        lms_account_status, management_source_updated_at)
     VALUES ('teacher-ignored-legacy', 'teacher-ignored-legacy@example.test', 'creator',
       'teacher-source-ignored-legacy', TRUE, 'active', '2026-10-01T00:00:00Z') RETURNING id`,
  )).rows[0];
  const priorityResult = await applyManagementEvent(db, {
    eventType: "teacher.upserted",
    occurredAt: new Date("2026-10-15T02:00:00Z"),
    payload: {
      teacherSourceId: "teacher-source-priority",
      legacyTeacherSourceIds: ["teacher-source-ignored-legacy"],
      fullName: "Current Teacher Wins",
      email: "teacher-current-priority@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T02:00:00Z",
    },
  });
  assert.equal(priorityResult.entityId, Number(preferredCurrent.id));
  assert.equal((await db.query("SELECT management_staff_source_id FROM users WHERE id=$1", [ignoredLegacy.id])).rows[0].management_staff_source_id, "teacher-source-ignored-legacy");

  await db.query(
    `INSERT INTO users
       (username, email, role, management_staff_source_id, is_management_managed,
        lms_account_status, management_source_updated_at)
     VALUES ('teacher-conflicting-source', 'teacher-conflict@example.test', 'creator',
       'teacher-source-conflict-old', TRUE, 'active', '2026-10-01T00:00:00Z')`,
  );
  await assert.rejects(() => applyManagementEvent(db, {
    eventType: "teacher.upserted",
    occurredAt: new Date("2026-10-15T03:00:00Z"),
    payload: {
      teacherSourceId: "teacher-source-conflict-new",
      fullName: "Conflicting Teacher",
      email: "teacher-conflict@example.test",
      accountStatus: "active",
      sourceUpdatedAt: "2026-10-15T03:00:00Z",
    },
  }), /Email đã liên kết với giáo viên Management khác/);
  assert.equal((await db.query(
    "SELECT management_staff_source_id FROM users WHERE email='teacher-conflict@example.test'",
  )).rows[0].management_staff_source_id, "teacher-source-conflict-old");
});
