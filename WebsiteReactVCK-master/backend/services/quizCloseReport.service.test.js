import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { makeQuestionSnapshot } from "./quizAttempt.service.js";
import {
  buildQuizReportSnapshot,
  processExpiredQuizAttempts,
  processQuizCloseReports,
} from "./quizCloseReport.service.js";

const loadDatabase = async () => {
  const db = new PGlite();
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^\"]+\.sql"/g)]
    .map((match) => JSON.parse(match[0]));
  for (const migration of migrations) await db.exec(await fs.readFile(migration, "utf8"));
  return db;
};

const seedQuiz = async (db, { suffix, internalLearner = false, questionType = "single_choice" }) => {
  const addUser = async (name, role = "user", internal = false) => (await db.query(
    `INSERT INTO users(username,email,role,is_internal_test_account)
     VALUES ($1,$2,$3,$4) RETURNING id,username,email,role`,
    [name, `${name}@example.test`, role, internal],
  )).rows[0];
  const teacher = await addUser(`report-teacher-${suffix}`, "creator");
  const admin = await addUser(`report-admin-${suffix}`, "admin");
  const learner = await addUser(`report-learner-${suffix}`);
  const internal = internalLearner ? await addUser(`report-internal-${suffix}`, "user", true) : null;
  const course = (await db.query(
    `INSERT INTO courses(name,slug,author_id,is_published)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    [`Report course ${suffix}`, `report-course-${suffix}`, teacher.id],
  )).rows[0];
  const liveClass = (await db.query(
    `INSERT INTO live_classes(title,course_id,instructor_id,status)
     VALUES ($1,$2,$3,'active') RETURNING id`,
    [`Report class ${suffix}`, course.id, teacher.id],
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,is_internal_test,enrolled_at)
     VALUES ($1,$2,'active',FALSE,NOW() - interval '3 hours')`,
    [learner.id, liveClass.id],
  );
  if (internal) {
    await db.query(
      `INSERT INTO class_enrollments(user_id,live_class_id,status,is_internal_test,enrolled_at)
       VALUES ($1,$2,'active',TRUE,NOW() - interval '3 hours')
       ON CONFLICT (user_id,live_class_id) DO UPDATE
       SET status='active',is_internal_test=TRUE,enrolled_at=EXCLUDED.enrolled_at`,
      [internal.id, liveClass.id],
    );
  }
  const quiz = (await db.query(
    `INSERT INTO quizzes(
       title,course_id,live_class_id,instructor_id,status,activity_scope,duration_minutes,
       passing_score,attempt_limit,available_from,available_until,review_policy
     ) VALUES ($1,$2,$3,$4,'PUBLISHED','homework',30,60,3,
       NOW() - interval '2 hours',NOW() - interval '1 hour','after_close') RETURNING id`,
    [`Report quiz ${suffix}`, course.id, liveClass.id, teacher.id],
  )).rows[0];
  const options = questionType === "single_choice"
    ? [{ key: "A", text: "Correct" }, { key: "B", text: "Distractor" }]
    : [];
  const question = (await db.query(
    `INSERT INTO quiz_questions(
       quiz_id,question_text,question_type,options_json,correct_answer,points,sort_order
     ) VALUES ($1,$2,$3,$4::jsonb,$5,2,1) RETURNING *`,
    [quiz.id, `Question ${suffix}`, questionType, JSON.stringify(options), questionType === "single_choice" ? "A" : null],
  )).rows[0];
  return { teacher, admin, learner, internal, course, liveClass, quiz, question };
};

test("expired in-progress attempts are auto-submitted from their immutable question snapshot", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());
  const fixture = await seedQuiz(db, { suffix: "expired" });
  const snapshot = makeQuestionSnapshot([fixture.question]);
  const attempt = (await db.query(
    `INSERT INTO quiz_attempts(
       quiz_id,user_id,answers_json,status,started_at,expires_at,question_snapshot,attempt_number
     ) VALUES ($1,$2,$3::jsonb,'in_progress',NOW() - interval '20 minutes',
       NOW() - interval '1 minute',$4::jsonb,1) RETURNING id`,
    [
      fixture.quiz.id,
      fixture.learner.id,
      JSON.stringify({ [fixture.question.id]: "A" }),
      JSON.stringify(snapshot),
    ],
  )).rows[0];

  const result = await processExpiredQuizAttempts({ db, now: new Date() });
  assert.deepEqual(result, { scanned: 1, submitted: 1 });
  const stored = (await db.query(
    `SELECT status,score,max_score,submitted_at,auto_submitted
     FROM quiz_attempts WHERE id=$1`,
    [attempt.id],
  )).rows[0];
  assert.equal(stored.status, "submitted");
  assert.equal(Number(stored.score), 2);
  assert.equal(Number(stored.max_score), 2);
  assert.ok(stored.submitted_at);
  assert.equal(stored.auto_submitted, true);

  assert.deepEqual(
    await processExpiredQuizAttempts({ db, now: new Date() }),
    { scanned: 0, submitted: 0 },
  );
});

test("report snapshots exclude internal learners and preserve the chosen attempt policy", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());
  const fixture = await seedQuiz(db, { suffix: "snapshot", internalLearner: true });
  const questionSnapshot = makeQuestionSnapshot([fixture.question]);
  await db.query(
    `INSERT INTO quiz_attempts(
       quiz_id,user_id,answers_json,score,max_score,status,started_at,submitted_at,
       question_snapshot,attempt_number
     ) VALUES
       ($1,$2,$3::jsonb,2,2,'submitted',NOW() - interval '30 minutes',NOW() - interval '29 minutes',$4::jsonb,1),
       ($1,$2,$5::jsonb,0,2,'submitted',NOW() - interval '20 minutes',NOW() - interval '19 minutes',$4::jsonb,2)`,
    [
      fixture.quiz.id,
      fixture.learner.id,
      JSON.stringify({ [fixture.question.id]: "A" }),
      JSON.stringify(questionSnapshot),
      JSON.stringify({ [fixture.question.id]: "B" }),
    ],
  );

  const best = await buildQuizReportSnapshot({ db, quizId: fixture.quiz.id });
  const bestJson = JSON.stringify(best);
  assert.match(bestJson, new RegExp(fixture.learner.email));
  assert.doesNotMatch(bestJson, new RegExp(fixture.internal.email));
  assert.equal(best.report.attemptScorePolicy, "best");
  assert.equal(best.students[0].score, 2);
  assert.equal(best.questions[0].correct, 1);
  assert.equal(best.questions[0].correctRate, 100);
  assert.deepEqual(best.questions[0].distractorCounts, { B: 0 });

  await db.query("UPDATE quizzes SET attempt_score_policy='latest' WHERE id=$1", [fixture.quiz.id]);
  const latest = await buildQuizReportSnapshot({ db, quizId: fixture.quiz.id });
  assert.equal(latest.report.attemptScorePolicy, "latest");
  assert.equal(latest.students[0].score, 0);
  assert.equal(latest.questions[0].incorrect, 1);
  assert.deepEqual(latest.questions[0].distractorCounts, { B: 1 });

  await db.query("UPDATE quizzes SET attempt_score_policy='first' WHERE id=$1", [fixture.quiz.id]);
  const first = await buildQuizReportSnapshot({ db, quizId: fixture.quiz.id });
  assert.equal(first.report.attemptScorePolicy, "first");
  assert.equal(first.students[0].score, 2);

  await db.query("UPDATE class_enrollments SET status='dropped' WHERE user_id=$1", [fixture.learner.id]);
  assert.match(JSON.stringify(best), new RegExp(fixture.learner.email));
});

test("live and Record quiz reports keep separate rosters and attempts", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());
  const fixture = await seedQuiz(db, { suffix: "record-scope" });
  const recordLearner = (await db.query(
    `INSERT INTO users(username,email,role)
     VALUES ('record-report-learner','record-report-learner@example.test','user') RETURNING id,email`,
  )).rows[0];
  await db.query(
    `INSERT INTO class_enrollments(user_id,live_class_id,status,learning_mode,enrolled_at)
     VALUES ($1,$2,'active','recording',NOW() - interval '1 day')`,
    [recordLearner.id, fixture.liveClass.id],
  );
  const profile = (await db.query(
    `INSERT INTO video_course_profiles(course_id,mode,source_live_class_id,status)
     VALUES ($1,'MIRROR',$2,'active') RETURNING id`,
    [fixture.course.id, fixture.liveClass.id],
  )).rows[0];
  const snapshot = JSON.stringify(makeQuestionSnapshot([fixture.question]));
  await db.query(
    `INSERT INTO quiz_attempts
       (quiz_id,user_id,video_course_profile_id,answers_json,score,max_score,status,submitted_at,question_snapshot,attempt_number)
     VALUES
       ($1,$2,NULL,$4::jsonb,2,2,'submitted',NOW(),$5::jsonb,1),
       ($1,$3,$6,$4::jsonb,2,2,'submitted',NOW(),$5::jsonb,1)`,
    [fixture.quiz.id, fixture.learner.id, recordLearner.id,
      JSON.stringify({ [fixture.question.id]: "A" }), snapshot, profile.id],
  );

  const liveReport = await buildQuizReportSnapshot({ db, quizId: fixture.quiz.id });
  assert.deepEqual(liveReport.students.map((student) => student.email), [fixture.learner.email]);
  assert.equal(liveReport.report.rosterMode, "live");

  const recordReport = await buildQuizReportSnapshot({
    db,
    quizId: fixture.quiz.id,
    reportKind: "record",
    videoCourseProfileId: profile.id,
  });
  assert.deepEqual(recordReport.students.map((student) => student.email), [recordLearner.email]);
  assert.equal(recordReport.report.rosterMode, "record");
  assert.equal(recordReport.report.videoCourseProfileId, Number(profile.id));
  assert.equal(recordReport.report.closeAt, null);
});

test("report delivery is idempotent and retries a sender-declared failure", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());
  const fixture = await seedQuiz(db, { suffix: "delivery" });
  const questionSnapshot = makeQuestionSnapshot([fixture.question]);
  await db.query(
    `INSERT INTO quiz_attempts(
       quiz_id,user_id,answers_json,score,max_score,status,started_at,submitted_at,
       question_snapshot,attempt_number
     ) VALUES ($1,$2,$3::jsonb,2,2,'submitted',NOW() - interval '10 minutes',
       NOW() - interval '9 minutes',$4::jsonb,1)`,
    [
      fixture.quiz.id,
      fixture.learner.id,
      JSON.stringify({ [fixture.question.id]: "A" }),
      JSON.stringify(questionSnapshot),
    ],
  );
  const failedRecipients = [];
  const now = new Date();
  const first = await processQuizCloseReports({
    db,
    now,
    emailSender: async (payload) => {
      failedRecipients.push(payload.email || payload.to);
      return { success: false, error: "provider rejected" };
    },
  });
  assert.equal(first.created, 1);
  assert.ok(first.failed > 0);
  assert.ok(failedRecipients.length >= 2);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM quiz_close_reports")).rows[0].count, 1);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM quiz_close_report_deliveries WHERE status='failed'",
  )).rows[0].count, failedRecipients.length);

  await db.query(
    "UPDATE quiz_close_report_deliveries SET next_attempt_at=NOW() - interval '1 minute' WHERE status='failed'",
  );
  await db.query(
    "UPDATE quiz_close_reports SET next_attempt_at=NOW() - interval '1 minute' WHERE status='failed'",
  );
  const sentRecipients = [];
  const second = await processQuizCloseReports({
    db,
    now: new Date(now.getTime() + 120_000),
    emailSender: async (payload) => {
      sentRecipients.push(payload.email || payload.to);
      return { success: true, messageId: `sent-${sentRecipients.length}` };
    },
  });
  assert.ok(second.delivered > 0);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM quiz_close_reports")).rows[0].count, 1);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM quiz_close_report_deliveries WHERE status='sent'",
  )).rows[0].count, failedRecipients.length);
});

test("an essay close report is provisional and produces one final update after grading", async (t) => {
  const db = await loadDatabase();
  t.after(() => db.close());
  const fixture = await seedQuiz(db, { suffix: "essay-final", questionType: "essay" });
  const questionSnapshot = makeQuestionSnapshot([fixture.question]);
  const baseAnswers = { [fixture.question.id]: "Student essay" };
  const attempt = (await db.query(
    `INSERT INTO quiz_attempts(
       quiz_id,user_id,answers_json,score,max_score,status,started_at,submitted_at,
       question_snapshot,attempt_number
     ) VALUES ($1,$2,$3::jsonb,0,2,'submitted',NOW() - interval '10 minutes',
       NOW() - interval '9 minutes',$4::jsonb,1) RETURNING id`,
    [fixture.quiz.id, fixture.learner.id, JSON.stringify(baseAnswers), JSON.stringify(questionSnapshot)],
  )).rows[0];

  const beforeGrade = await buildQuizReportSnapshot({ db, quizId: fixture.quiz.id });
  assert.equal(beforeGrade.report.provisional, true);
  assert.equal(beforeGrade.summary.pendingEssay, 1);
  assert.equal(beforeGrade.summary.fullyGraded, 0);
  assert.equal(beforeGrade.questions[0].pending, 1);

  const delivered = [];
  const now = new Date();
  const closeRun = await processQuizCloseReports({
    db,
    now,
    emailSender: async ({ reportKind, email }) => {
      delivered.push(`${reportKind}:${email}`);
      return { success: true, messageId: `message-${delivered.length}` };
    },
  });
  assert.equal(closeRun.created, 1);
  assert.equal(closeRun.delivered, 1);
  assert.equal(closeRun.waitingGrading, 1);

  await db.query(
    `UPDATE quiz_attempts
     SET answers_json=$2::jsonb,score=2,updated_at=NOW()
     WHERE id=$1`,
    [attempt.id, JSON.stringify({ ...baseAnswers, _essayGrade: { score: 2, feedback: "Good" } })],
  );
  const finalRun = await processQuizCloseReports({
    db,
    now: new Date(now.getTime() + 60_000),
    emailSender: async ({ reportKind, email }) => {
      delivered.push(`${reportKind}:${email}`);
      return { success: true, messageId: `message-${delivered.length}` };
    },
  });
  assert.equal(finalRun.finalCreated, 1);
  assert.equal(finalRun.delivered, 1);
  assert.equal((await db.query(
    "SELECT COUNT(*)::int AS count FROM quiz_close_reports WHERE report_kind='final'",
  )).rows[0].count, 1);
  assert.equal(delivered.filter((value) => value.startsWith("final:")).length, 2);

  const repeated = await processQuizCloseReports({
    db,
    now: new Date(now.getTime() + 120_000),
    emailSender: async () => ({ success: true }),
  });
  assert.equal(repeated.finalCreated, 0);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM quiz_close_reports")).rows[0].count, 2);
});
