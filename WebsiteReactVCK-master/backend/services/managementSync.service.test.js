import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SyncValidationError, parseManagementEvent, syncCalendarSession } from "./managementSync.service.js";

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
