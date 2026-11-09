import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("record learner opens a completed source workspace with the Record alias title", async (t) => {
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
  const courseRouter = (await import("./course.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('workspace-teacher','workspace-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('workspace-student','workspace-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('Workspace course','workspace-course',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('Completed Live source',$1,$2,'completed') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const alias = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id,source_class_source_id,live_class_id,title,status,management_source_updated_at)
     VALUES ('workspace-record','workspace-live',$1,'Workspace course - Record','active',NOW())
     RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments
       (user_id,live_class_id,status,learning_mode,management_class_alias_id)
     VALUES ($1,$2,'active','recording',$3)`,
    [student.id, liveClass.id, alias.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants
       (user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, course.id],
  );

  const route = courseRouter.stack.find((layer) => (
    layer.route?.path === "/:courseId/workspace" && layer.route.methods.get
  )).route;
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await route.stack.at(-1).handle({
    user: {
      id: student.id,
      role: "user",
      is_management_managed: true,
      lms_account_status: "active",
    },
    params: { courseId: String(course.id) },
    query: { classId: String(liveClass.id) },
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.selectedClass.title, "Workspace course - Record");
  assert.equal(res.body.data.selectedClass.learning_mode, "recording");
  assert.equal(res.body.data.classes[0].title, "Workspace course - Record");
  assert.equal(res.body.data.access.canJoinLive, false);
  assert.equal(res.body.data.access.showCalendar, false);
  assert.deepEqual(res.body.data.upcomingSessions, []);
});
