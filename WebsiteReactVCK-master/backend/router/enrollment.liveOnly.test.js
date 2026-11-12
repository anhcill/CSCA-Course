import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("my-courses returns Live LMS enrollments and excludes Record enrollments", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  const enrollmentRouter = (await import("./enrollment.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('list-teacher','list-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('list-student','list-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const liveCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published,is_management_managed) VALUES ('Live course','list-live',$1,TRUE,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const recordCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published,is_management_managed) VALUES ('Record course','list-record',$1,TRUE,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Live class',$1,$2,'active') RETURNING id",
    [liveCourse.id, teacher.id],
  )).rows[0];
  const recordClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Record source',$1,$2,'active') RETURNING id",
    [recordCourse.id, teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','live'),($1,$3,'active','recording')`,
    [student.id, liveClass.id, recordClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW()),
            ($1,$3,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, liveCourse.id, recordCourse.id],
  );

  const route = enrollmentRouter.stack.find((layer) => (
    layer.route?.path === "/my-courses" && layer.route.methods.get
  )).route;
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await route.stack.at(-1).handle({
    user: { id: student.id, role: "user", is_management_managed: true, lms_account_status: "active" },
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.data.map((course) => Number(course.course_id)), [Number(liveCourse.id)]);
  assert.deepEqual(res.body.data[0].classes.map((liveClassRow) => Number(liveClassRow.id)), [Number(liveClass.id)]);
});
