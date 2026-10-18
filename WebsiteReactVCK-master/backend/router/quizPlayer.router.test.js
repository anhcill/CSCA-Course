import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import test, { after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import cookieParser from "cookie-parser";
import express from "express";
import quizPlayerRouter from "./quizPlayer.router.js";
import { pool } from "../db/connect.js";
import { buildGradebook } from "../services/gradebook.service.js";

after(() => pool.end());

const withServer = async (callback) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/assignments", quizPlayerRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

const invoke = async (method, path, { params = {}, body = {}, user } = {}) => {
  const layer = quizPlayerRouter.stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method} ${path}`);
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await layer.route.stack.at(-1).handle({ params, body, user, ip: "127.0.0.1" }, response);
  return response;
};

const loadDatabase = async () => {
  const db = new PGlite();
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  return db;
};

test("new player endpoints require authentication", async () => {
  await withServer(async (baseUrl) => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/assignments/quizzes/1/start`),
      fetch(`${baseUrl}/api/assignments/attempts/1/answers`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" }),
      fetch(`${baseUrl}/api/assignments/attempts/1/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401]);
  });
});

test("player resumes one attempt, protects review, submits idempotently and feeds the gradebook", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());

  const addUser = async (username, role) => (await db.query(
    "INSERT INTO users(username,email,role) VALUES ($1,$2,$3) RETURNING id,username,email,role",
    [username, `${username}@example.test`, role],
  )).rows[0];
  const teacher = await addUser("player-teacher", "creator");
  const learner = await addUser("player-learner", "user");
  const outsider = await addUser("player-outsider", "user");
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Player course','player-course',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Player class',$1,$2,'active') RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  await db.query("INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')", [learner.id, liveClass.id]);
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
    [learner.id, course.id],
  );
  const quiz = (await db.query(
    `INSERT INTO quizzes(
       title,description,course_id,live_class_id,instructor_id,status,activity_scope,
       duration_minutes,passing_score,attempt_limit,available_from,available_until,review_policy
     ) VALUES ('Player quiz','Review later',$1,$2,$3,'PUBLISHED','homework',30,60,1,
       NOW() - interval '1 hour',NOW() + interval '1 hour','after_close') RETURNING id`,
    [course.id, liveClass.id, teacher.id],
  )).rows[0];
  const question = (await db.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,explanation,points,sort_order)
     VALUES ($1,'One plus one?','single_choice',$2::jsonb,'A','Secret explanation',1,1) RETURNING id`,
    [quiz.id, JSON.stringify([{ key: "A", text: "2" }, { key: "B", text: "3" }])],
  )).rows[0];

  const denied = await invoke("get", "/quizzes/:quizId/start", { user: outsider, params: { quizId: quiz.id } });
  assert.equal(denied.statusCode, 403);

  const first = await invoke("get", "/quizzes/:quizId/start", { user: learner, params: { quizId: quiz.id } });
  const second = await invoke("get", "/quizzes/:quizId/start", { user: learner, params: { quizId: quiz.id } });
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(second.statusCode, 200, JSON.stringify(second.body));
  assert.equal(second.body.data.attempt.id, first.body.data.attempt.id);
  assert.equal(first.body.data.quiz.items[0].correctAnswer, undefined);
  assert.equal(first.body.data.quiz.items[0].explanation, undefined);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM quiz_attempts WHERE quiz_id=$1", [quiz.id])).rows[0].count, 1);

  const attemptId = first.body.data.attempt.id;
  const saved = await invoke("put", "/attempts/:attemptId/answers", {
    user: learner,
    params: { attemptId },
    body: { questionId: question.id, answer: "A" },
  });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));

  const submitted = await invoke("post", "/attempts/:attemptId/submit", {
    user: learner,
    params: { attemptId },
    body: { answers: {} },
  });
  assert.equal(submitted.statusCode, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.data.score, 1);
  assert.equal(submitted.body.data.reviewAvailable, false);
  assert.deepEqual(submitted.body.data.review, []);

  const retried = await invoke("post", "/attempts/:attemptId/submit", {
    user: learner,
    params: { attemptId },
    body: { answers: { [question.id]: "B" } },
  });
  assert.equal(retried.statusCode, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.data.score, 1);
  assert.equal(retried.body.data.alreadySubmitted, true);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM xp_events WHERE user_id=$1", [learner.id])).rows[0].count, 1);

  const limited = await invoke("get", "/quizzes/:quizId/start", { user: learner, params: { quizId: quiz.id } });
  assert.equal(limited.body.data.attempt.id, attemptId);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM quiz_attempts WHERE quiz_id=$1", [quiz.id])).rows[0].count, 1);

  await db.query("UPDATE quizzes SET available_until=NOW() - interval '1 minute' WHERE id=$1", [quiz.id]);
  const reviewed = await invoke("get", "/quizzes/:quizId/start", { user: learner, params: { quizId: quiz.id } });
  assert.equal(reviewed.body.data.result.reviewAvailable, true);
  assert.equal(reviewed.body.data.result.review[0].correctAnswer, "A");
  assert.equal(reviewed.body.data.result.review[0].explanation, "Secret explanation");

  const gradebook = await buildGradebook(db, liveClass.id);
  const quizCell = gradebook.rows[0].cells.find((cell) => cell.activityId === `quiz-${quiz.id}`);
  assert.equal(quizCell.value, 100);
});

test("a shortened server deadline auto-submits saved answers and rejects a late tab", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());
  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('timeout-teacher','timeout-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const learner = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('timeout-learner','timeout-learner@example.test','user') RETURNING id",
  )).rows[0];
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Timeout course','timeout-course',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
    [learner.id, course.id],
  );
  const quiz = (await db.query(
    `INSERT INTO quizzes(title,course_id,instructor_id,status,duration_minutes,passing_score,attempt_limit,available_until,review_policy)
     VALUES ('Timeout quiz',$1,$2,'PUBLISHED',60,60,1,NOW() + interval '2 hours','never') RETURNING id`,
    [course.id, teacher.id],
  )).rows[0];
  const question = (await db.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,points,sort_order)
     VALUES ($1,'Saved answer wins','single_choice',$2::jsonb,'A',1,1) RETURNING id`,
    [quiz.id, JSON.stringify([{ key: "A", text: "Yes" }, { key: "B", text: "No" }])],
  )).rows[0];

  const started = await invoke("get", "/quizzes/:quizId/start", { user: learner, params: { quizId: quiz.id } });
  const attemptId = started.body.data.attempt.id;
  await invoke("put", "/attempts/:attemptId/answers", {
    user: learner,
    params: { attemptId },
    body: { questionId: question.id, answer: "A" },
  });
  await db.query("UPDATE quizzes SET available_until=NOW() - interval '1 minute' WHERE id=$1", [quiz.id]);

  const lateSave = await invoke("put", "/attempts/:attemptId/answers", {
    user: learner,
    params: { attemptId },
    body: { questionId: question.id, answer: "B" },
  });
  assert.equal(lateSave.statusCode, 409);
  assert.equal(lateSave.body.errorCode, "QUIZ_ATTEMPT_EXPIRED");
  const stored = (await db.query("SELECT answers_json,score,status,auto_submitted FROM quiz_attempts WHERE id=$1", [attemptId])).rows[0];
  assert.equal(stored.answers_json[String(question.id)], "A");
  assert.equal(Number(stored.score), 1);
  assert.equal(stored.status, "submitted");
  assert.equal(stored.auto_submitted, true);
});
