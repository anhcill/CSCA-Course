import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});

test("internal test learner is silently provisioned for every course and class", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));

  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  const internalMigration = "database/migrations/066_internal_test_learner.sql";
  for (const migration of migrations.filter((file) => file !== internalMigration)) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('test-teacher','test-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const learner = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('khlyp06','khlyp06@example.test','user') RETURNING id",
  )).rows[0];
  const firstCourse = (await db.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published)
     VALUES ('Existing course','Existing course','existing-internal-test-course',$1,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const firstClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Existing class',$1,$2) RETURNING id",
    [firstCourse.id, teacher.id],
  )).rows[0];

  await db.exec(await fs.readFile(internalMigration, "utf8"));

  const flagged = (await db.query(
    `SELECT is_internal_test_account, is_management_managed, lms_account_status
     FROM users WHERE id = $1`,
    [learner.id],
  )).rows[0];
  assert.equal(flagged.is_internal_test_account, true);
  assert.equal(flagged.is_management_managed, true);
  assert.equal(flagged.lms_account_status, "active");

  const existingAccess = (await db.query(
    `SELECT ce.is_internal_test, ce.status AS class_status, e.status AS course_status,
            g.access_status, g.reason
     FROM class_enrollments ce
     JOIN enrollments e ON e.user_id = ce.user_id AND e.course_id = $3
     JOIN lms_access_grants g ON g.user_id = ce.user_id AND g.course_id = $3
     WHERE ce.user_id = $1 AND ce.live_class_id = $2`,
    [learner.id, firstClass.id, firstCourse.id],
  )).rows[0];
  assert.deepEqual(existingAccess, {
    is_internal_test: true,
    class_status: "active",
    course_status: "active",
    access_status: "active",
    reason: "INTERNAL_TEST_ACCOUNT",
  });

  const secondCourse = (await db.query(
    `INSERT INTO courses(name,title,slug,author_id,is_published)
     VALUES ('New course','New course','new-internal-test-course',$1,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const secondClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('New class',$1,$2) RETURNING id",
    [secondCourse.id, teacher.id],
  )).rows[0];

  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM enrollments WHERE user_id = $1",
    [learner.id],
  )).rows[0].count, 2);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM lms_access_grants WHERE user_id = $1 AND access_status = 'active'",
    [learner.id],
  )).rows[0].count, 2);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM class_enrollments WHERE user_id = $1 AND is_internal_test = TRUE",
    [learner.id],
  )).rows[0].count, 2);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM class_enrollments WHERE user_id = $1 AND live_class_id = $2 AND status = 'active'",
    [learner.id, secondClass.id],
  )).rows[0].count, 1);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1",
    [learner.id],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM class_enrollments WHERE live_class_id = $1 AND status = 'active' AND is_internal_test = FALSE",
    [firstClass.id],
  )).rows[0].count, 0);

  const quiz = (await db.query(
    `INSERT INTO quizzes(title,course_id,live_class_id,instructor_id,status)
     VALUES ('Hidden test attempt',$1,$2,$3,'PUBLISHED') RETURNING id`,
    [firstCourse.id, firstClass.id, teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO quiz_attempts(quiz_id,user_id,answers_json,score,max_score,status,submitted_at)
     VALUES ($1,$2,'{}'::jsonb,8,10,'submitted',NOW())`,
    [quiz.id, learner.id],
  );

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const router = (await import("../router/assignment.router.js")).default;
  const reportHandler = router.stack.find((layer) => (
    layer.route?.path === "/teacher/quizzes/:quizId/report" && layer.route.methods.get
  )).route.stack.at(-1).handle;

  const teacherResponse = response();
  await reportHandler({ params: { quizId: String(quiz.id) }, user: { ...teacher, role: "creator" } }, teacherResponse);
  assert.equal(teacherResponse.statusCode, 200, JSON.stringify(teacherResponse.body));
  assert.equal(teacherResponse.body.data.summary.totalStudents, 0);
  assert.deepEqual(teacherResponse.body.data.students, []);

  const adminResponse = response();
  await reportHandler({ params: { quizId: String(quiz.id) }, user: { id: 999, role: "admin" } }, adminResponse);
  assert.equal(adminResponse.statusCode, 200, JSON.stringify(adminResponse.body));
  assert.equal(adminResponse.body.data.summary.totalStudents, 1);
  assert.equal(adminResponse.body.data.students[0].username, "khlyp06");
});
