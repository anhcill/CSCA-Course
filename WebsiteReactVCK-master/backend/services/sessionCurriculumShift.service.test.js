import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { shiftCancelledSessionCurriculum } from "./sessionCurriculumShift.service.js";

test("cancel shift preserves learner progress and extends at the next weekly class slot", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE live_classes (id BIGSERIAL PRIMARY KEY);
    CREATE TABLE class_schedules (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      start_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE class_sessions (
      id BIGSERIAL PRIMARY KEY,
      live_class_id BIGINT NOT NULL,
      schedule_id BIGINT,
      chapter_id BIGINT NOT NULL,
      course_section_id BIGINT,
      lesson_id BIGINT,
      title TEXT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      original_start_at TIMESTAMPTZ,
      original_end_at TIMESTAMPTZ,
      session_kind TEXT NOT NULL DEFAULT 'regular',
      is_payable BOOLEAN NOT NULL DEFAULT TRUE,
      changed_by BIGINT,
      changed_at TIMESTAMPTZ,
      change_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE session_curriculum_operations (
      id BIGSERIAL PRIMARY KEY,
      operation_key TEXT NOT NULL UNIQUE,
      live_class_id BIGINT NOT NULL,
      cancelled_session_id BIGINT NOT NULL,
      extension_session_id BIGINT,
      operation_type TEXT NOT NULL,
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE session_vocabularies (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (id, session_id)
    );
    CREATE TABLE student_vocabulary_progress (
      id BIGSERIAL PRIMARY KEY,
      vocabulary_id BIGINT NOT NULL,
      session_id BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_student_vocabulary_progress_word_session
        FOREIGN KEY (vocabulary_id, session_id)
        REFERENCES session_vocabularies(id, session_id)
        DEFERRABLE INITIALLY IMMEDIATE
    );
    CREATE TABLE session_formulas (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE lms_learning_files (
      id BIGSERIAL PRIMARY KEY,
      class_session_id BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE lms_learning_file_placements (
      id BIGSERIAL PRIMARY KEY,
      file_id BIGINT NOT NULL,
      live_class_id BIGINT NOT NULL,
      class_session_id BIGINT,
      UNIQUE (file_id, live_class_id, class_session_id)
    );
  `);

  const liveClass = (await db.query("INSERT INTO live_classes DEFAULT VALUES RETURNING id")).rows[0];
  const mondaySchedule = (await db.query(
    "INSERT INTO class_schedules(live_class_id,day_of_week,start_time,end_time,start_date) VALUES ($1,1,'09:00','10:00','2027-01-01') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const wednesdaySchedule = (await db.query(
    "INSERT INTO class_schedules(live_class_id,day_of_week,start_time,end_time,start_date) VALUES ($1,3,'09:00','10:00','2027-01-01') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const fridaySchedule = (await db.query(
    "INSERT INTO class_schedules(live_class_id,day_of_week,start_time,end_time,start_date) VALUES ($1,5,'09:00','10:00','2027-01-01') RETURNING id",
    [liveClass.id],
  )).rows[0];
  const cancelled = (await db.query(
    `INSERT INTO class_sessions
       (live_class_id,schedule_id,chapter_id,course_section_id,lesson_id,title,start_time,end_time,status,is_payable)
     VALUES ($1,$2,10,100,1000,'Chapter A','2027-01-04T02:00:00Z','2027-01-04T03:00:00Z','cancelled',FALSE)
     RETURNING id`,
    [liveClass.id, mondaySchedule.id],
  )).rows[0];
  const following = (await db.query(
    `INSERT INTO class_sessions
       (live_class_id,schedule_id,chapter_id,course_section_id,lesson_id,title,start_time,end_time,status)
     VALUES ($1,$2,20,200,2000,'Chapter B','2027-01-06T02:00:00Z','2027-01-06T03:00:00Z','scheduled')
     RETURNING id`,
    [liveClass.id, wednesdaySchedule.id],
  )).rows[0];
  const supplemental = (await db.query(
    `INSERT INTO class_sessions
       (live_class_id,schedule_id,chapter_id,course_section_id,lesson_id,title,start_time,end_time,status,session_kind)
     VALUES ($1,$2,99,990,9900,'Extra workshop','2027-01-05T02:00:00Z','2027-01-05T03:00:00Z','scheduled','supplemental')
     RETURNING id`,
    [liveClass.id, mondaySchedule.id],
  )).rows[0];
  const wordA = (await db.query(
    "INSERT INTO session_vocabularies(session_id) VALUES ($1) RETURNING id",
    [cancelled.id],
  )).rows[0];
  const wordB = (await db.query(
    "INSERT INTO session_vocabularies(session_id) VALUES ($1) RETURNING id",
    [following.id],
  )).rows[0];
  await db.query(
    "INSERT INTO student_vocabulary_progress(vocabulary_id,session_id) VALUES ($1,$2),($3,$4)",
    [wordA.id, cancelled.id, wordB.id, following.id],
  );
  await db.query("INSERT INTO session_formulas(session_id) VALUES ($1)", [cancelled.id]);
  const file = (await db.query(
    "INSERT INTO lms_learning_files(class_session_id) VALUES ($1) RETURNING id",
    [cancelled.id],
  )).rows[0];
  await db.query(
    "INSERT INTO lms_learning_file_placements(file_id,live_class_id,class_session_id) VALUES ($1,$2,$3)",
    [file.id, liveClass.id, cancelled.id],
  );

  await db.query("BEGIN");
  const shifted = await shiftCancelledSessionCurriculum(db, {
    sessionId: cancelled.id,
    operationKey: `test-cancel:${cancelled.id}`,
    actorId: 9,
  });
  await db.query("COMMIT");

  const extension = (await db.query("SELECT * FROM class_sessions WHERE id = $1", [shifted.extensionSessionId])).rows[0];
  assert.equal(Number(extension.schedule_id), Number(fridaySchedule.id));
  assert.equal(new Date(extension.start_time).toISOString(), "2027-01-08T02:00:00.000Z");
  assert.equal(extension.title, "Chapter B");
  assert.equal(shifted.shiftedSessionIds.includes(Number(supplemental.id)), false);
  const unchangedSupplemental = (await db.query(
    "SELECT chapter_id, course_section_id, lesson_id, title FROM class_sessions WHERE id = $1",
    [supplemental.id],
  )).rows[0];
  assert.equal(Number(unchangedSupplemental.chapter_id), 99);
  assert.equal(Number(unchangedSupplemental.course_section_id), 990);
  assert.equal(Number(unchangedSupplemental.lesson_id), 9900);
  assert.equal(unchangedSupplemental.title, "Extra workshop");

  const vocabularies = (await db.query("SELECT id, session_id FROM session_vocabularies ORDER BY id")).rows;
  assert.equal(Number(vocabularies[0].session_id), Number(following.id));
  assert.equal(Number(vocabularies[1].session_id), Number(extension.id));
  const progress = (await db.query("SELECT vocabulary_id, session_id FROM student_vocabulary_progress ORDER BY vocabulary_id")).rows;
  assert.equal(Number(progress[0].session_id), Number(following.id));
  assert.equal(Number(progress[1].session_id), Number(extension.id));
  assert.equal(Number((await db.query("SELECT session_id FROM session_formulas")).rows[0].session_id), Number(following.id));
  assert.equal(Number((await db.query("SELECT class_session_id FROM lms_learning_files")).rows[0].class_session_id), Number(following.id));
  assert.equal(Number((await db.query("SELECT class_session_id FROM lms_learning_file_placements")).rows[0].class_session_id), Number(following.id));

  const cleared = (await db.query("SELECT chapter_id, course_section_id, lesson_id FROM class_sessions WHERE id = $1", [cancelled.id])).rows[0];
  assert.equal(Number(cleared.chapter_id), 10);
  assert.equal(cleared.course_section_id, null);
  assert.equal(cleared.lesson_id, null);

  await db.query("BEGIN");
  const retried = await shiftCancelledSessionCurriculum(db, {
    sessionId: cancelled.id,
    operationKey: `test-cancel:${cancelled.id}`,
    actorId: 9,
  });
  await db.query("COMMIT");
  assert.equal(retried.idempotent, true);
  assert.equal(Number(retried.extensionSessionId), Number(extension.id));
  assert.equal(Number((await db.query("SELECT COUNT(*) AS count FROM class_sessions")).rows[0].count), 4);
});
