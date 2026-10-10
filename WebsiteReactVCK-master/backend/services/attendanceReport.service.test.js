import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { getAttendanceReport, parseReportDate } from "./attendanceReport.service.js";

test("attendance report counts only finalized, due, non-cancelled sessions without multiplying teachers", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE users (id bigint PRIMARY KEY, username text);
    CREATE TABLE courses (id bigint PRIMARY KEY, name text);
    CREATE TABLE live_classes (id bigint PRIMARY KEY, title text, course_id bigint, instructor_id bigint);
    CREATE TABLE class_teachers (id bigint PRIMARY KEY, live_class_id bigint, teacher_id bigint, status text, teaching_role text);
    CREATE TABLE class_sessions (id bigint PRIMARY KEY, live_class_id bigint, title text, start_time timestamptz, status text);
    CREATE TABLE class_attendance_sheets (session_id bigint PRIMARY KEY, finalized_at timestamptz, reviewed_at timestamptz);
    CREATE TABLE class_attendance (session_id bigint, status text);
    INSERT INTO users VALUES (1,'teacher-one'),(2,'teacher-two');
    INSERT INTO courses VALUES (1,'Course');
    INSERT INTO live_classes VALUES (10,'Class A',1,1),(20,'Class B',1,NULL);
    INSERT INTO class_teachers VALUES (1,10,1,'active','lead'),(2,10,2,'active','co_teacher');
    INSERT INTO class_sessions VALUES
      (100,10,'Finalized','2025-01-01T17:30:00Z','ended'),
      (101,10,'Pending','2025-01-02T03:00:00Z','ended'),
      (102,10,'Cancelled','2025-01-02T03:00:00Z','cancelled'),
      (103,10,'Future','2099-01-02T03:00:00Z','scheduled'),
      (200,20,'Empty finalized','2025-01-02T03:00:00Z','ended');
    INSERT INTO class_attendance_sheets VALUES
      (100,'2025-01-02T05:00:00Z',NULL),
      (200,'2025-01-02T05:00:00Z',NULL);
    INSERT INTO class_attendance VALUES
      (100,'present'),(100,'absent'),(100,'excused'),
      (101,'present'),(102,'present');
  `);

  const { summary, classes } = await getAttendanceReport(db);
  assert.deepEqual(summary, {
    classCount: 2, sessionCount: 3, finalizedSessions: 2, pendingSessions: 1,
    present: 1, absent: 1, excused: 1, rate: 33.3,
  });
  assert.equal(classes[0].teacherName, "teacher-one");
  assert.equal(classes[0].sessions.length, 2);
  assert.equal(classes[0].sessions.find((item) => item.pending).present, 0);
  assert.equal(classes[1].rate, null);

  const filtered = await getAttendanceReport(db, { from: "2025-01-03", to: "2025-01-03" });
  assert.equal(filtered.summary.sessionCount, 0);
  assert.equal(filtered.summary.rate, null);
  assert.equal(filtered.summary.classCount, 2);
  const localDay = await getAttendanceReport(db, { from: "2025-01-02", to: "2025-01-02" });
  assert.equal(localDay.summary.sessionCount, 3);
});

test("report date parser rejects impossible dates and malformed input", () => {
  assert.equal(parseReportDate("2025-02-29"), undefined);
  assert.equal(parseReportDate("2024-02-29"), "2024-02-29");
  assert.equal(parseReportDate("2025-1-2"), undefined);
  assert.equal(parseReportDate(undefined), null);
});

test("admin attendance report rejects teachers before querying report data", async () => {
  const router = (await import("../router/admin.router.js")).default;
  const route = router.stack.find((layer) => layer.route?.path === "/attendance-report").route;
  assert.equal(route.methods.get, true);
  const response = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let reachedHandler = false;
  route.stack[1].handle({ user: { id: 1, role: "creator" } }, response, () => { reachedHandler = true; });
  assert.equal(reachedHandler, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.errorCode, "FORBIDDEN");
});

test("attendance report runs against the complete production schema and migrations", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const teacher = (await db.query("INSERT INTO users(username,email,role) VALUES ('report-teacher','report-teacher@example.test','creator') RETURNING id")).rows[0];
  const course = (await db.query("INSERT INTO courses(name,slug,author_id) VALUES ('Report Course','report-course',$1) RETURNING id", [teacher.id])).rows[0];
  const cls = (await db.query("INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Report Class',$1,$2) RETURNING id", [course.id, teacher.id])).rows[0];
  const session = (await db.query("INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status) VALUES ($1,'Report Session','2025-01-02T03:00:00Z','2025-01-02T04:00:00Z','ended') RETURNING id", [cls.id])).rows[0];
  await db.query("INSERT INTO class_attendance_sheets(session_id,finalized_by) VALUES ($1,$2)", [session.id, teacher.id]);
  const report = await getAttendanceReport(db);
  assert.equal(report.summary.finalizedSessions, 1);
  assert.equal(report.classes.find((item) => String(item.classId) === String(cls.id)).teacherName, "report-teacher");
});
