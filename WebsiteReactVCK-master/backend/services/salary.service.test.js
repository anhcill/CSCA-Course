import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  calculateSessionDurationHours,
  getAllTeachersSalaryOverview,
  getTeacherSalaryDetail,
  isSessionCompleted,
} from "./salary.service.js";

test("calculateSessionDurationHours calculates exact hours based on start and end time", () => {
  const start = new Date("2026-10-15T08:00:00.000Z");
  const end = new Date("2026-10-15T10:00:00.000Z");
  const hours = calculateSessionDurationHours(start, end);
  assert.equal(hours, 2.0);

  // 1.5 hours test
  const end930 = new Date("2026-10-15T09:30:00.000Z");
  assert.equal(calculateSessionDurationHours(start, end930), 1.5);

  // Fallback to default 2.0 if missing
  assert.equal(calculateSessionDurationHours(null, null), 2.0);
  assert.equal(calculateSessionDurationHours(end, start), 2.0);
});

test("isSessionCompleted checks status and end_time correctly", () => {
  // Session with ended status is completed
  assert.equal(isSessionCompleted({ status: "ended", end_time: new Date("2099-01-01") }), true);

  // Past session is completed even if status not updated
  assert.equal(isSessionCompleted({ status: "scheduled", end_time: new Date("2020-01-01") }), true);

  // Future scheduled session is not completed
  assert.equal(isSessionCompleted({ status: "scheduled", end_time: new Date("2099-01-01") }), false);
});

test("salary formula: 20 sessions, 2 taught sessions calculation verification", () => {
  const hourlyRate = 250000; // 250.000 đ/h
  const sessionHours = 2.0;
  const totalSessions = 20;
  const completedSessions = 2;

  const sessionFee = sessionHours * hourlyRate; // 500.000 đ / buổi
  assert.equal(sessionFee, 500000);

  const accruedSalary = completedSessions * sessionFee; // 2 * 500.000 = 1.000.000 đ
  assert.equal(accruedSalary, 1000000);

  const projectedSalary = totalSessions * sessionFee; // 20 * 500.000 = 10.000.000 đ
  assert.equal(projectedSalary, 10000000);

  const progressPct = Math.round((completedSessions / totalSessions) * 100);
  assert.equal(progressPct, 10);
});

test("salary counts lead/co-teacher work, preserves legacy instructors, and reflects session edits", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT NOT NULL,
      hourly_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE student_profiles (user_id BIGINT PRIMARY KEY, full_name TEXT);
    CREATE TABLE courses (id BIGSERIAL PRIMARY KEY, name TEXT, title TEXT);
    CREATE TABLE live_classes (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      course_id BIGINT,
      instructor_id BIGINT,
      status TEXT NOT NULL DEFAULT 'active',
      hourly_rate_override NUMERIC(12,2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE class_teachers (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      teacher_id BIGINT NOT NULL,
      teaching_role TEXT NOT NULL,
      status TEXT NOT NULL,
      hourly_rate_override NUMERIC(12,2),
      UNIQUE (live_class_id, teacher_id)
    );
    CREATE TABLE class_sessions (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      title TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL
    );
  `);

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role,hourly_rate) VALUES ('teacher','teacher@example.test','creator',100000) RETURNING id",
  )).rows[0];
  const course = (await db.query(
    "INSERT INTO courses(name,title) VALUES ('CSCA','CSCA') RETURNING id",
  )).rows[0];

  const insertClass = async (title, instructorId = null) => (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ($1,$2,$3) RETURNING id",
    [title, course.id, instructorId],
  )).rows[0];
  const coTeacherClass = await insertClass("Co-teacher class");
  const assistantClass = await insertClass("Assistant class", teacher.id);
  const legacyClass = await insertClass("Legacy instructor class", teacher.id);
  const revokedClass = await insertClass("Revoked instructor class", teacher.id);

  await db.query(
    `INSERT INTO class_teachers(live_class_id,teacher_id,teaching_role,status) VALUES
       ($1,$4,'co_teacher','active'),
       ($2,$4,'assistant','active'),
       ($3,$4,'lead','revoked')`,
    [coTeacherClass.id, assistantClass.id, revokedClass.id, teacher.id],
  );
  await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status) VALUES
       ($1,'Co session','2099-01-01T08:00:00Z','2099-01-01T09:00:00Z','scheduled'),
       ($2,'Assistant session','2099-01-02T08:00:00Z','2099-01-02T12:00:00Z','scheduled'),
       ($3,'Legacy session','2099-01-03T08:00:00Z','2099-01-03T10:00:00Z','scheduled'),
       ($4,'Revoked session','2099-01-04T08:00:00Z','2099-01-04T13:00:00Z','scheduled')`,
    [coTeacherClass.id, assistantClass.id, legacyClass.id, revokedClass.id],
  );

  const initialDetail = await getTeacherSalaryDetail(teacher.id, db);
  assert.equal(initialDetail.summary.totalClasses, 2);
  assert.equal(initialDetail.summary.totalSessions, 2);
  assert.equal(initialDetail.summary.totalHours, 3);
  assert.deepEqual(initialDetail.classes.map((item) => item.title).sort(), ["Co-teacher class", "Legacy instructor class"]);

  const initialOverview = await getAllTeachersSalaryOverview(db);
  const initialTeacher = initialOverview.teachers.find((item) => Number(item.id) === Number(teacher.id));
  assert.equal(initialTeacher.classesCount, 2);
  assert.equal(initialTeacher.totalSessions, 2);
  assert.equal(initialTeacher.totalHours, 3);

  await db.query(
    "UPDATE class_sessions SET end_time='2099-01-01T11:00:00Z' WHERE live_class_id=$1",
    [coTeacherClass.id],
  );
  await db.query(
    "UPDATE class_sessions SET status='cancelled' WHERE live_class_id=$1",
    [legacyClass.id],
  );

  const updatedDetail = await getTeacherSalaryDetail(teacher.id, db);
  assert.equal(updatedDetail.summary.totalClasses, 2);
  assert.equal(updatedDetail.summary.totalSessions, 1);
  assert.equal(updatedDetail.summary.totalHours, 3);

  const updatedOverview = await getAllTeachersSalaryOverview(db);
  const updatedTeacher = updatedOverview.teachers.find((item) => Number(item.id) === Number(teacher.id));
  assert.equal(updatedTeacher.classesCount, 2);
  assert.equal(updatedTeacher.totalSessions, 1);
  assert.equal(updatedTeacher.totalHours, 3);
});
