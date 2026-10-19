import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const invoke = async (router, method, path, { params = {}, body = {}, user } = {}) => {
  const layer = router.stack.find((item) => item.route?.path === path && item.route.methods[method]);
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

test("teacher essay grade and feedback are returned to the learner", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));

  const addUser = async (username, role) => (await db.query(
    "INSERT INTO users(username,email,role) VALUES ($1,$2,$3) RETURNING id,username,email,role",
    [username, `${username}@example.test`, role],
  )).rows[0];
  const teacher = await addUser("essay-teacher", "creator");
  const otherTeacher = await addUser("essay-other-teacher", "creator");
  const learner = await addUser("essay-learner", "user");
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Essay course','essay-course',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    "INSERT INTO live_classes(title,course_id,instructor_id,status) VALUES ('Essay class',$1,$2,'active') RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  await db.query("INSERT INTO class_enrollments(user_id,live_class_id,status) VALUES ($1,$2,'active')", [learner.id, liveClass.id]);
  await db.query(
    `INSERT INTO lms_access_grants(user_id,course_id,access_status,valid_from,source_updated_at)
     VALUES ($1,$2,'active',NOW() - interval '1 day',NOW())`,
    [learner.id, course.id],
  );
  const quiz = (await db.query(
    `INSERT INTO quizzes(title,description,course_id,live_class_id,instructor_id,status,duration_minutes,passing_score)
     VALUES ('Mixed essay quiz',$1,$2,$3,$4,'PUBLISHED',30,50) RETURNING id`,
    [JSON.stringify({ text: "Mixed quiz", essayConfig: { enabled: true, maxScore: 3, prompt: "Nộp bài tự luận" } }), course.id, liveClass.id, teacher.id],
  )).rows[0];
  const objective = (await db.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,points,sort_order)
     VALUES ($1,'Objective','single_choice',$2::jsonb,'A',1,1) RETURNING *`,
    [quiz.id, JSON.stringify([{ key: "A", text: "A" }, { key: "B", text: "B" }])],
  )).rows[0];
  const essay = (await db.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,points,sort_order)
     VALUES ($1,'Essay prompt','essay','[]'::jsonb,NULL,3,2) RETURNING *`,
    [quiz.id],
  )).rows[0];
  const answers = {
    [String(objective.id)]: "A",
    _essay: {
      byQuestion: {
        [String(essay.id)]: { questionId: essay.id, position: 2, notes: "Bài giải", attachments: [] },
      },
      attachments: [],
      notes: "Bài giải",
    },
  };
  const attempt = (await db.query(
    `INSERT INTO quiz_attempts(quiz_id,user_id,answers_json,score,max_score,status,submitted_at,question_snapshot)
     VALUES ($1,$2,$3::jsonb,1,4,'submitted',NOW(),$4::jsonb) RETURNING id`,
    [quiz.id, learner.id, JSON.stringify(answers), JSON.stringify([objective, essay])],
  )).rows[0];

  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/test";
  const { pool } = await import("../db/connect.js");
  const previousBrevoApiKey = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = "YOUR_BREVO_API_KEY";
  t.after(() => {
    if (previousBrevoApiKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = previousBrevoApiKey;
  });
  pool.query = (sql, params) => db.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => db.query(sql, params), release() {} });
  const assignmentRouter = (await import("./assignment.router.js")).default;
  const gradePath = "/teacher/quizzes/:quizId/attempts/:attemptId/grade-essay";

  const denied = await invoke(assignmentRouter, "post", gradePath, {
    user: otherTeacher,
    params: { quizId: quiz.id, attemptId: attempt.id },
    body: { essayScore: 2, essayFeedback: "Không được phép" },
  });
  assert.equal(denied.statusCode, 403);

  const excessive = await invoke(assignmentRouter, "post", gradePath, {
    user: teacher,
    params: { quizId: quiz.id, attemptId: attempt.id },
    body: { essayScore: 4, essayFeedback: "Điểm vượt giới hạn" },
  });
  assert.equal(excessive.statusCode, 422);

  const feedback = "Lập luận đúng, cần trình bày bước cuối rõ hơn.";
  const graded = await invoke(assignmentRouter, "post", gradePath, {
    user: teacher,
    params: { quizId: quiz.id, attemptId: attempt.id },
    body: {
      essayScore: 2.5,
      essayFeedback: feedback,
      gradesByQuestion: {
        [String(essay.id)]: { score: 2.5, feedback, attachments: [] },
      },
    },
  });
  assert.equal(graded.statusCode, 200, JSON.stringify(graded.body));
  assert.equal(graded.body.data.score, 3.5);
  assert.equal(graded.body.data.essayGrade.feedback, feedback);

  const studentResult = await invoke(assignmentRouter, "get", "/quizzes/:quizId", {
    user: { ...learner, is_management_managed: true, lms_account_status: "active" },
    params: { quizId: quiz.id },
  });
  assert.equal(studentResult.statusCode, 200, JSON.stringify(studentResult.body));
  assert.equal(studentResult.body.data.result.essayGrade.score, 2.5);
  assert.equal(studentResult.body.data.result.essayGrade.feedback, feedback);
  assert.equal(studentResult.body.data.result.mcScore, 1);
  const essayReview = studentResult.body.data.result.review.find((item) => String(item.questionId) === String(essay.id));
  assert.equal(essayReview.earnedPoints, 2.5);
  assert.equal(essayReview.essayFeedback, feedback);

  const notification = (await db.query(
    "SELECT title,message,link_url,event_type FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 1",
    [learner.id],
  )).rows[0];
  assert.equal(notification.title, "Phần tự luận đã được chấm");
  assert.match(notification.message, /Lập luận đúng/);
  assert.equal(notification.link_url, `/lms/quiz/${quiz.id}`);
  assert.equal(notification.event_type, "grade.published");
});
