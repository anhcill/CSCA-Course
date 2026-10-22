import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
const { pool } = await import("../db/connect.js");
const router = (await import("./adminCalendar.router.js")).default;

const route = router.stack.find((layer) => layer.route?.path === "/" && layer.route.methods.get).route;
const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("admin calendar includes active co-teachers in filters and conflict detection", async (t) => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id BIGSERIAL PRIMARY KEY, username TEXT, email TEXT, role TEXT);
    CREATE TABLE courses (id BIGSERIAL PRIMARY KEY, title TEXT);
    CREATE TABLE live_classes (id BIGSERIAL PRIMARY KEY, title TEXT, course_id BIGINT, instructor_id BIGINT);
    CREATE TABLE class_teachers (live_class_id BIGINT, teacher_id BIGINT, status TEXT);
    CREATE TABLE class_sessions (
      id BIGSERIAL PRIMARY KEY, live_class_id BIGINT, title TEXT,
      start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, meet_url TEXT, status TEXT,
      original_start_at TIMESTAMPTZ, original_end_at TIMESTAMPTZ, change_reason TEXT,
      schedule_id BIGINT, version INTEGER
    );
    CREATE TABLE class_enrollments (id BIGSERIAL PRIMARY KEY, live_class_id BIGINT, status TEXT);
    CREATE TABLE class_session_change_logs (id BIGSERIAL PRIMARY KEY, session_id BIGINT, schedule_id BIGINT);
    INSERT INTO users(id, username, email, role) VALUES
      (1, 'Lead A', 'lead-a@example.test', 'creator'),
      (2, 'Shared Teacher', 'shared@example.test', 'creator'),
      (3, 'Lead B', 'lead-b@example.test', 'creator');
    INSERT INTO courses(id, title) VALUES (1, 'Course');
    INSERT INTO live_classes(id, title, course_id, instructor_id) VALUES
      (10, 'Class A', 1, 1), (11, 'Class B', 1, 3);
    INSERT INTO class_teachers(live_class_id, teacher_id, status) VALUES
      (10, 2, 'active'), (11, 2, 'active');
    INSERT INTO class_sessions(id, live_class_id, title, start_time, end_time, status, version) VALUES
      (100, 10, 'A session', '2027-01-02T09:00:00Z', '2027-01-02T10:00:00Z', 'scheduled', 1),
      (101, 11, 'B session', '2027-01-02T09:30:00Z', '2027-01-02T10:30:00Z', 'scheduled', 1);
  `);
  const oldQuery = pool.query;
  pool.query = (sql, params) => db.query(sql, params);
  t.after(async () => { pool.query = oldQuery; await db.close(); });

  const res = response();
  await route.stack.at(-1).handle({
    user: { id: 99, role: "admin" },
    query: { from: "2027-01-01T00:00:00Z", to: "2027-01-03T00:00:00Z", teacherId: "2" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.sessions.length, 2);
  assert.deepEqual(res.body.data.sessions.map((item) => item.id), [100, 101]);
  assert.equal(res.body.data.conflicts.length, 1);
  assert.equal(res.body.data.conflicts[0].type, "teacher_conflict");
  assert.ok(res.body.data.teachers.some((teacher) => Number(teacher.id) === 2));
});
