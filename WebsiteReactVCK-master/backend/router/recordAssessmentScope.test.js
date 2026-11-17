import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const invoke = async (router, method, path, { params = {}, query = {}, body = {}, user } = {}) => {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method} ${path}`);
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await layer.route.stack.at(-1).handle({ params, query, body, user, ip: "127.0.0.1" }, response);
  return response;
};

test("Record assignments have no deadline and store submissions outside the live scope", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const assignmentRouter = (await import("./assignment.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('record-assignment-teacher','record-assignment-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const learner = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('record-assignment-learner','record-assignment-learner@example.test','user',TRUE,'active')
     RETURNING id,role,is_management_managed,lms_account_status`,
  )).rows[0];
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Record assignment','record-assignment',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Live source',$1,$2,'active') RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Buổi 1',NOW() - interval '2 days',NOW() - interval '2 days' + interval '1 hour','ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  const profile = (await db.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,status)
     VALUES ($1,'MIRROR',$2,'active') RETURNING id`,
    [course.id, liveClass.id],
  )).rows[0];
  await db.query(
    "INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode) VALUES ($1,$2,'active','recording')",
    [learner.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
    [learner.id, course.id],
  );
  const assignment = (await db.query(
    `INSERT INTO assignments(title,course_id,live_class_id,class_session_id,instructor_id,max_score,due_date)
     VALUES ('Bài Record',$1,$2,$3,$4,10,NOW() - interval '1 day') RETURNING id`,
    [course.id, liveClass.id, session.id, teacher.id],
  )).rows[0];

  const recordDetail = await invoke(assignmentRouter, "get", "/:assignmentId", {
    user: learner,
    params: { assignmentId: assignment.id },
    query: { videoCourseProfileId: profile.id },
  });
  assert.equal(recordDetail.statusCode, 200, JSON.stringify(recordDetail.body));
  assert.equal(recordDetail.body.data.due_date, null);

  const recordSubmit = await invoke(assignmentRouter, "post", "/:id/submit", {
    user: learner,
    params: { id: assignment.id },
    query: { videoCourseProfileId: profile.id },
    body: { contentText: "Bài nộp Record" },
  });
  assert.equal(recordSubmit.statusCode, 201, JSON.stringify(recordSubmit.body));
  assert.equal(recordSubmit.body.data.status, "submitted");
  assert.equal(String(recordSubmit.body.data.video_course_profile_id), String(profile.id));

  const liveSubmit = await invoke(assignmentRouter, "post", "/:id/submit", {
    user: learner,
    params: { id: assignment.id },
    body: { contentText: "Bài nộp live riêng" },
  });
  assert.equal(liveSubmit.statusCode, 201, JSON.stringify(liveSubmit.body));
  assert.equal(liveSubmit.body.data.status, "late");
  assert.equal(liveSubmit.body.data.video_course_profile_id, null);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM assignment_submissions WHERE assignment_id=$1 AND user_id=$2",
    [assignment.id, learner.id],
  )).rows[0].count, 2);
});

test("GET /api/assignments lists MIRROR live-class quizzes for Record learners holding grants on the Mirror course", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const assignmentRouter = (await import("./assignment.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('assign-mirror-t','assign-mirror-t@example.test','creator') RETURNING id",
  )).rows[0];
  const recordLearner = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('assign-mirror-rec','assign-mirror-rec@example.test','user',TRUE,'active')
     RETURNING id,role,is_management_managed,lms_account_status`,
  )).rows[0];
  const liveLearner = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('assign-mirror-live','assign-mirror-live@example.test','user',TRUE,'active')
     RETURNING id,role,is_management_managed,lms_account_status`,
  )).rows[0];

  const liveCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Live Source Parent','live-src-parent',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const recordCourse = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Record Mirror Target','rec-mirror-target',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Live Class TTXH',$1,$2,'active') RETURNING id",
    [liveCourse.id, teacher.id],
  )).rows[0];
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1,'Buoi 2',NOW() + interval '1 day',NOW() + interval '1 day 1 hour','scheduled') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await db.query(
    "INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,status) VALUES ($1,'MIRROR',$2,'active')",
    [recordCourse.id, liveClass.id],
  );
  const quiz = (await db.query(
    `INSERT INTO quizzes(title,course_id,live_class_id,class_session_id,instructor_id,status,duration_minutes,passing_score)
     VALUES ('Quiz Buoi 2 TTXH',$1,$2,$3,$4,'PUBLISHED',30,60) RETURNING id`,
    [liveCourse.id, liveClass.id, session.id, teacher.id],
  )).rows[0];

  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,course_id,status,learning_mode)
     VALUES ($1,$2,$3,'active','recording'), ($4,$2,$3,'active','live')`,
    [recordLearner.id, liveClass.id, liveCourse.id, liveLearner.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW()), ($3,$4,'active',NOW() - interval '1 day',NOW())`,
    [recordLearner.id, recordCourse.id, liveLearner.id, liveCourse.id],
  );

  for (const learner of [recordLearner, liveLearner]) {
    const listRes = await invoke(assignmentRouter, "get", "/", { user: learner });
    assert.equal(listRes.statusCode, 200, JSON.stringify(listRes.body));
    assert.equal(
      listRes.body.data.some((item) => String(item.id) === String(quiz.id)),
      true,
      `Quiz ${quiz.id} should be visible in GET /api/assignments for user ${learner.id}`,
    );
  }
});
