import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("video course workspace: MIRROR mode returns sessions, theory and capabilities", async (t) => {
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
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('mirror-teacher','mirror-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('mirror-student','mirror-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('HSK Video Mirror','hsk-video-mirror',$1,TRUE,TRUE) RETURNING id`,
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ('Live Source Class',$1,$2,'active') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time,status)
     VALUES ($1, 'Chương 1: Khởi động phát âm Pinyin', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'ended') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await db.query(
    `INSERT INTO video_course_profiles
       (course_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, 'MIRROR', $2, TRUE, 2, 'active')`,
    [course.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO class_enrollments
       (user_id,live_class_id,status,learning_mode)
     VALUES ($1,$2,'active','recording')`,
    [student.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants
       (user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, course.id],
  );
  await db.query(
    `INSERT INTO learning_unit_theory
       (class_session_id, title, content_html, summary, key_takeaways)
     VALUES ($1, 'Lý thuyết Pinyin', '<p>Nội dung thanh mẫu</p>', 'Tóm tắt bài', '["Thanh mẫu", "Vận mẫu"]'::jsonb)`,
    [session.id],
  );

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
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
    params: { offeringId: String(course.id) },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.mode, "RECORD_MIRROR");
  assert.equal(res.body.data.capabilities.canPlayVideo, true);
  assert.equal(res.body.data.capabilities.canJoinLive, false);
  assert.equal(res.body.data.capabilities.showCalendar, false);
  assert.equal(res.body.data.capabilities.canCheckIn, false);
  assert.equal(res.body.data.units.length, 1);
  assert.equal(res.body.data.activeUnit.title, "Chương 1: Khởi động phát âm Pinyin");
  assert.equal(res.body.data.activeUnit.theory.title, "Lý thuyết Pinyin");
});

test("video course workspace: INDEPENDENT mode returns lessons without live class", async (t) => {
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
  const videoCourseRouter = (await import("./videoCourse.router.js")).default;

  const author = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('course-author','course-author@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status)
     VALUES ('independent-student','independent-student@example.test','user',TRUE,'active') RETURNING id`,
  )).rows[0];
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published,is_management_managed)
     VALUES ('CSCA Toan Độc Lập','csca-math-independent',$1,TRUE,TRUE) RETURNING id`,
    [author.id],
  )).rows[0];
  const section = (await db.query(
    `INSERT INTO sections(course_id,title,sort_order)
     VALUES ($1, 'Chương I: Hàm số và Đồ thị', 1) RETURNING id`,
    [course.id],
  )).rows[0];
  const lesson = (await db.query(
    `INSERT INTO lessons(course_id,section_id,name,title,duration_seconds,is_published,sort_order)
     VALUES ($1, $2, 'Bài 1', 'Bài 1: Khảo sát hàm số lượng giác', 1800, TRUE, 1) RETURNING id`,
    [course.id, section.id],
  )).rows[0];
  await db.query(
    `INSERT INTO video_course_profiles
       (course_id, mode, source_live_class_id, enforce_trusted_devices, device_limit, status)
     VALUES ($1, 'INDEPENDENT', NULL, TRUE, 2, 'active')`,
    [course.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants
       (user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - INTERVAL '1 day',NOW())`,
    [student.id, course.id],
  );
  const alias = (await db.query(
    `INSERT INTO management_class_learning_aliases
       (alias_class_source_id, source_class_source_id, live_class_id, course_id,
        learning_mode, recording_content_mode, title, status, management_source_updated_at)
     VALUES ('independent-record-test', NULL, NULL, $1, 'recording', 'INDEPENDENT',
             'Khóa Record độc lập', 'active', NOW()) RETURNING id`,
    [course.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments
       (user_id, live_class_id, course_id, status, learning_mode, management_class_alias_id)
     VALUES ($1, NULL, $2, 'active', 'recording', $3)`,
    [student.id, course.id, alias.id],
  );

  const route = videoCourseRouter.stack.find((layer) => (
    layer.route?.path === "/:offeringId/workspace" && layer.route.methods.get
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
    params: { offeringId: String(course.id) },
    query: {},
  }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.mode, "RECORD_INDEPENDENT");
  assert.equal(res.body.data.units.length, 1);
  assert.equal(res.body.data.units[0].title, "Bài 1: Khảo sát hàm số lượng giác");
  assert.equal(res.body.data.sourceClass, null);
  assert.equal(res.body.data.capabilities.canPlayVideo, true);
  assert.equal(res.body.data.capabilities.canJoinLive, false);
});
