import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("chapters group legacy sessions and enforce the session/class binding", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  // A preexisting session must survive the migration and appear in a chapter.
  for (const migration of migrations.filter((name) => Number(name.match(/\/(\d+)_/)[1]) < 36)) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }
  const admin = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('chapter-admin','chapter-admin@example.test','admin') RETURNING id",
  )).rows[0];
  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('chapter-teacher','chapter-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const student = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('chapter-student','chapter-student@example.test','user') RETURNING id",
  )).rows[0];
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Chapters','chapters-test',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const cls = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Class 01',$1,$2) RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  const other = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Class 02',$1,$2) RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  const legacy = (await db.query(
    "INSERT INTO class_sessions(live_class_id,title,start_time,end_time) VALUES ($1,'Legacy','2027-01-01T09:00:00Z','2027-01-01T10:00:00Z') RETURNING id",
    [cls.id],
  )).rows[0];

  await db.exec(await fs.readFile("database/migrations/036_class_chapters.sql", "utf8"));
  const legacyRow = (await db.query("SELECT chapter_id FROM class_sessions WHERE id = $1", [legacy.id])).rows[0];
  assert.ok(legacyRow.chapter_id);
  assert.equal((await db.query("SELECT is_system_default FROM class_chapters WHERE id=$1", [legacyRow.chapter_id])).rows[0].is_system_default, true);

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const router = (await import("./liveClass.router.js")).default;
  const invoke = async (method, path, params, body, user) => {
    const handler = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
    const res = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ params, body, user }, res);
    return res;
  };

  const noGrant = await invoke("get", "/:classId/chapters", { classId: cls.id }, {}, { ...student, role: "user" });
  assert.equal(noGrant.statusCode, 403);
  const created = await invoke("post", "/:classId/chapters", { classId: cls.id }, {
    title: "Chương 1", description: "Tổng quan", objectives: "Hiểu kiến thức cơ bản", teacherId: teacher.id,
  }, { ...admin, role: "admin" });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  const chapterId = created.body.data.id;
  const listed = await invoke("get", "/:classId/chapters", { classId: cls.id }, {}, { ...admin, role: "admin" });
  assert.equal(listed.statusCode, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.data.length, 2);
  assert.equal(listed.body.data[0].sessions[0].id, legacy.id);
  assert.equal(listed.body.data[1].title, "Chương 1");
  assert.equal(String(listed.body.data[1].assigned_teacher_id), String(teacher.id));
  assert.equal(listed.body.teachers[0].id, teacher.id);

  const edited = await invoke("patch", "/:classId/chapters/:chapterId", { classId: cls.id, chapterId }, {
    objectives: "Đã cập nhật",
  }, { ...teacher, role: "creator" });
  assert.equal(edited.statusCode, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.data.objectives, "Đã cập nhật");

  const session = await invoke("post", "/:classId/sessions", { classId: cls.id }, {
    title: "Buổi 2", chapterId, startTime: "2027-01-02T09:00:00Z", endTime: "2027-01-02T10:00:00Z",
  }, { ...teacher, role: "creator" });
  assert.equal(session.statusCode, 201, JSON.stringify(session.body));
  assert.equal(String(session.body.data.chapter_id), String(chapterId));
  const updatedSession = await invoke("patch", "/sessions/:sessionId", { sessionId: session.body.data.id }, {
    title: "Buổi 2 đã sửa",
  }, { ...teacher, role: "creator" });
  assert.equal(updatedSession.statusCode, 200, JSON.stringify(updatedSession.body));
  assert.equal(String(updatedSession.body.data.chapter_id), String(chapterId));
  const newChapterSession = await invoke("post", "/:classId/sessions", { classId: cls.id }, {
    title: "Buổi 3", newChapter: { title: "Chương 2", objectives: "Luyện tập" },
    startTime: "2027-01-03T09:00:00Z", endTime: "2027-01-03T10:00:00Z",
  }, { ...teacher, role: "creator" });
  assert.equal(newChapterSession.statusCode, 201, JSON.stringify(newChapterSession.body));
  const newChapter = (await db.query(
    "SELECT title, assigned_teacher_id FROM class_chapters WHERE id = $1",
    [newChapterSession.body.data.chapter_id],
  )).rows[0];
  assert.equal(newChapter.title, "Chương 2");
  assert.equal(String(newChapter.assigned_teacher_id), String(teacher.id));
  const rejected = await invoke("post", "/:classId/sessions", { classId: other.id }, {
    title: "Wrong class", chapterId, startTime: "2027-01-03T09:00:00Z", endTime: "2027-01-03T10:00:00Z",
  }, { ...teacher, role: "creator" });
  assert.equal(rejected.statusCode, 422);
  await assert.rejects(db.query(
    "INSERT INTO class_sessions(live_class_id,chapter_id,title,start_time,end_time) VALUES ($1,$2,'Invalid','2027-01-03T09:00:00Z','2027-01-03T10:00:00Z')",
    [other.id, chapterId],
  ));
  const external = (await db.query(
    "INSERT INTO class_sessions(live_class_id,title,start_time,end_time) VALUES ($1,'External','2027-01-04T09:00:00Z','2027-01-04T10:00:00Z') RETURNING chapter_id",
    [other.id],
  )).rows[0];
  assert.ok(external.chapter_id);
});
