import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { createVocabularyRouter } from "./vocabulary.router.js";

const jsonRequest = async (baseUrl, path, { method = "GET", user, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Test-User": user,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test("session vocabulary API enforces class access and persists learner progress", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const addUser = async (username, role, managed = false) => (await db.query(
    `INSERT INTO users(username,email,role,is_management_managed,lms_account_status,email_verified)
     VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id,username,role,is_management_managed,lms_account_status`,
    [username, `${username}@example.test`, role, managed, managed ? "active" : "unmanaged"],
  )).rows[0];
  const admin = await addUser("vocab-admin", "admin");
  const teacher = await addUser("vocab-teacher", "creator");
  const otherTeacher = await addUser("vocab-other", "creator");
  const learner = await addUser("vocab-learner", "user", true);
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Vocabulary','vocabulary-course',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id) VALUES ('Vocabulary Class',$1,$2) RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  await db.query(
    "INSERT INTO class_teachers(live_class_id,teacher_id,status) VALUES ($1,$2,'active')",
    [liveClass.id, teacher.id],
  );
  const session = (await db.query(
    `INSERT INTO class_sessions(live_class_id,title,start_time,end_time)
     VALUES ($1,'Buổi từ vựng',NOW() + interval '1 day',NOW() + interval '2 hours 1 day') RETURNING id`,
    [liveClass.id],
  )).rows[0];
  await db.query(
    "INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')",
    [learner.id, liveClass.id],
  );
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
    [learner.id, course.id],
  );

  const users = { admin, teacher, otherTeacher, learner };
  const authenticate = (req, res, next) => {
    req.user = users[req.get("X-Test-User")];
    if (!req.user) return res.status(401).json({ success: false });
    return next();
  };
  const learnerOnly = (req, res, next) => req.user.role === "user"
    ? next()
    : res.status(403).json({ success: false, errorCode: "FORBIDDEN" });
  const teacherOnly = (req, res, next) => ["creator", "admin"].includes(req.user.role)
    ? next()
    : res.status(403).json({ success: false, errorCode: "FORBIDDEN" });
  const vocabularyRoles = (_req, _res, next) => next();
  const app = express();
  app.use(express.json());
  app.use("/api/lms", createVocabularyRouter({
    dbQuery: (sql, params) => db.query(sql, params),
    dbGetClient: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }),
    authenticate,
    learnerOnly,
    vocabularyRoles,
    teacherOnly,
    managePermission: (_req, _res, next) => next(),
    askAi: async () => ({
      success: true,
      model: "ag/gemini-3-flash",
      answer: JSON.stringify([{
        term: "导数",
        pinyin: "dǎo shù",
        sinoVietnamese: "Đạo số",
        meaning: "Đạo hàm",
        partOfSpeech: "Danh từ",
        exampleSentence: "求函数的导数。",
        exampleMeaning: "Tìm đạo hàm của hàm số.",
      }]),
    }),
  }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const created = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary`, {
    method: "POST",
    user: "teacher",
    body: { term: "多面体", pinyin: "duō miàn tǐ", meaning: "Khối đa diện", orderIndex: 1 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const vocabularyId = created.body.data.id;

  const forbiddenCreate = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary`, {
    method: "POST",
    user: "otherTeacher",
    body: { term: "速度", meaning: "Vận tốc" },
  });
  assert.equal(forbiddenCreate.status, 403);

  const sessionList = await jsonRequest(baseUrl, "/api/lms/vocabulary/sessions", { user: "learner" });
  assert.equal(sessionList.status, 200, JSON.stringify(sessionList.body));
  assert.equal(sessionList.body.data.sessions.length, 1);
  assert.equal(sessionList.body.data.sessions[0].totalWords, 1);
  assert.equal(sessionList.body.data.sessions[0].vocabularies[0].status, "new");

  const starred = await jsonRequest(baseUrl, `/api/lms/vocabulary/${vocabularyId}/toggle-star`, {
    method: "POST",
    user: "learner",
  });
  assert.equal(starred.status, 200);
  assert.equal(starred.body.data.isStarred, true);

  const submitted = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary/submit`, {
    method: "POST",
    user: "learner",
    body: { masteredIds: [vocabularyId], learningIds: [] },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.data.masteredWords, 1);
  assert.equal(submitted.body.data.progressPercent, 100);
  assert.equal(submitted.body.data.gamification.xp, 5);

  const duplicateReward = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary/submit`, {
    method: "POST",
    user: "learner",
    body: { masteredIds: [vocabularyId], learningIds: [] },
  });
  assert.equal(duplicateReward.body.data.gamification.xp, 0);

  const detail = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary`, { user: "learner" });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.vocabularies[0].status, "mastered");
  assert.equal(detail.body.data.vocabularies[0].isStarred, true);

  const suggested = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary/ai-suggest`, {
    method: "POST",
    user: "teacher",
    body: { topic: "Đạo hàm", count: 1 },
  });
  assert.equal(suggested.status, 200, JSON.stringify(suggested.body));
  assert.equal(suggested.body.data.model, "ag/gemini-3-flash");
  assert.equal(suggested.body.data.vocabularies[0].term, "导数");

  const imported = await jsonRequest(baseUrl, `/api/lms/sessions/${session.id}/vocabulary/batch-import`, {
    method: "POST",
    user: "admin",
    body: { vocabularies: [{ term: "体积", meaning: "Thể tích" }, { term: "表面积", meaning: "Diện tích toàn phần" }] },
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(imported.body.data.importedCount, 2);

  const updated = await jsonRequest(baseUrl, `/api/lms/vocabulary/${vocabularyId}`, {
    method: "PUT",
    user: "teacher",
    body: { meaning: "Hình đa diện" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.meaning, "Hình đa diện");

  const removed = await jsonRequest(baseUrl, `/api/lms/vocabulary/${vocabularyId}`, {
    method: "DELETE",
    user: "teacher",
  });
  assert.equal(removed.status, 200);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM student_vocabulary_progress WHERE vocabulary_id=$1", [vocabularyId])).rows[0].count, 0);
});
