import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  QuizAuthoringValidationError,
  flattenQuizAuthoringItems,
  normalizeQuizAuthoringItems,
  reconstructQuizAuthoringItems,
} from "./quizAuthoring.service.js";

const sampleItems = [
  {
    id: "q-1",
    kind: "question",
    questionType: "multiple_choice",
    questionText: "Chon cac dap an dung",
    options: [
      { key: "A", text: "A" },
      { key: "B", text: "B" },
      { key: "C", text: "C" },
    ],
    correctAnswer: ["A", "C"],
    explanation: "Loi giai",
    points: 2,
  },
  {
    id: "g-1",
    kind: "reading_group",
    passageText: "Doan van co cong thuc \\(x^2 + 1\\)",
    questions: [
      {
        id: "q-2",
        questionType: "reading_item",
        questionText: "Cau doc hieu",
        options: [
          { key: "A", text: "Dung" },
          { key: "B", text: "Sai" },
        ],
        correctAnswer: "A",
        points: 1.5,
      },
    ],
  },
  {
    id: "g-2",
    kind: "fill_blank_group",
    clozeMode: "passage",
    passageText: "Gia tri la [blank_1]",
    linkedOptions: [{ blankId: "blank_1", placeholder: "Nhap gia tri" }],
    questions: [
      {
        id: "q-3",
        questionType: "fill_blank_item",
        questionText: "Gia tri",
        correctAnswer: "42",
        subQuestionNumber: 1,
        points: 1,
      },
    ],
  },
];

test("MOLI authoring items normalize and flatten into stable question order", () => {
  const result = flattenQuizAuthoringItems(sampleItems);
  assert.equal(result.questionCount, 3);
  assert.equal(result.maxScore, 4.5);
  assert.deepEqual(result.groups.map(({ kind, sortOrder }) => ({ kind, sortOrder })), [
    { kind: "reading_group", sortOrder: 2 },
    { kind: "fill_blank_group", sortOrder: 3 },
  ]);
  assert.deepEqual(result.questions.map(({ questionType, groupClientId, itemOrder, sortOrder }) => ({ questionType, groupClientId, itemOrder, sortOrder })), [
    { questionType: "multiple_choice", groupClientId: null, itemOrder: 1, sortOrder: 1 },
    { questionType: "reading_item", groupClientId: "g-1", itemOrder: 2, sortOrder: 2 },
    { questionType: "fill_blank_item", groupClientId: "g-2", itemOrder: 3, sortOrder: 3 },
  ]);
});

test("stored group and question rows reconstruct the shared HTTP items contract", () => {
  const groups = [
    { id: 11, group_type: "reading_passage", passage_text: "Reading", linked_options: [], cloze_mode: null, sort_order: 2 },
    { id: 12, group_type: "fill_blank_pool", passage_text: "Fill", linked_options: [{ key: "A", text: "42" }], cloze_mode: "passage", sort_order: 3 },
  ];
  const questions = [
    {
      id: 1, group_id: null, question_type: "multiple_choice", question_text: "Standalone",
      options_json: [{ key: "A", text: "A" }, { key: "B", text: "B" }], correct_answer: '["A","B"]',
      explanation: "Explain", points: 2, item_order: 1, sort_order: 1, ocr_metadata: {},
    },
    {
      id: 2, group_id: 11, question_type: "reading_item", question_text: "Reading item",
      options_json: [{ key: "A", text: "A" }, { key: "B", text: "B" }], correct_answer: "A",
      explanation: "", points: 1, item_order: 2, sort_order: 2, ocr_metadata: {},
    },
    {
      id: 3, group_id: 12, question_type: "fill_blank_item", question_text: "Fill item",
      options_json: [], correct_answer: "42", explanation: "", points: 1, sort_order: 3,
      sub_question_number: 1, item_order: 3, ocr_metadata: {},
    },
  ];
  const items = reconstructQuizAuthoringItems(groups, questions);
  assert.deepEqual(items.map((item) => item.kind), ["question", "reading_group", "fill_blank_group"]);
  assert.deepEqual(items[0].correctAnswer, ["A", "B"]);
  assert.equal(items[1].questions[0].questionType, "reading_item");
  assert.equal(items[2].questions[0].subQuestionNumber, 1);

  const studentItems = reconstructQuizAuthoringItems(groups, questions, { includeAnswers: false });
  assert.equal("correctAnswer" in studentItems[0], false);
  assert.equal("explanation" in studentItems[1].questions[0], false);
});

test("validation rejects unsupported types, invalid answer keys and empty published groups", () => {
  assert.throws(
    () => normalizeQuizAuthoringItems([{ kind: "question", questionType: "unknown", questionText: "x" }]),
    (error) => error instanceof QuizAuthoringValidationError && error.path.endsWith("questionType"),
  );
  assert.throws(
    () => normalizeQuizAuthoringItems([{
      kind: "question",
      questionType: "single_choice",
      questionText: "Question",
      options: [{ key: "A", text: "A" }, { key: "B", text: "B" }],
      correctAnswer: "C",
    }]),
    (error) => error instanceof QuizAuthoringValidationError && error.path.endsWith("correctAnswer"),
  );
  assert.throws(
    () => normalizeQuizAuthoringItems([{ kind: "reading_group", passageText: "Passage", questions: [] }]),
    (error) => error instanceof QuizAuthoringValidationError && error.path.endsWith("questions"),
  );
  assert.equal(normalizeQuizAuthoringItems([
    { kind: "reading_group", passageText: "", questions: [] },
  ], { allowIncomplete: true }).questionCount, 0);

  const draft = flattenQuizAuthoringItems([
    { id: "empty-group", kind: "reading_group", passageText: "", questions: [] },
    {
      id: "draft-question", kind: "question", questionType: "single_choice", questionText: "",
      options: [], correctAnswer: "",
    },
  ], { allowIncomplete: true });
  assert.equal(draft.groups[0].sortOrder, 1);
  assert.equal(draft.questions[0].itemOrder, 2);
});

test("document import aliases normalize into the authoring contract", () => {
  const result = normalizeQuizAuthoringItems([
    {
      kind: "question",
      questionType: "single_choice",
      questionText: "Imported question",
      answers: [{ key: "A", text: "One" }, { key: "B", text: "Two" }],
      correctAnswer: "A",
    },
    {
      kind: "reading_group",
      passageText: "Passage",
      subQuestions: [{
        questionText: "Imported sub-question",
        answers: [{ key: "A", text: "Yes" }, { key: "B", text: "No" }],
        correctAnswerKey: "B",
      }],
    },
  ]);
  assert.equal(result.questionCount, 2);
  assert.equal(result.items[0].options[0].key, "A");
  assert.equal(result.items[1].questions[0].correctAnswer, "B");
});

test("migration registry builds the MOLI schema without changing legacy quiz data", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile("database/schema.sql", "utf8"));
  const registry = await fs.readFile("run_sql.js", "utf8");
  const migrations = [...registry.matchAll(/"database\/migrations\/[^"]+\.sql"/g)].map((match) => JSON.parse(match[0]));
  const molyMigration = "database/migrations/055_moly_quiz_authoring.sql";
  for (const migration of migrations.filter((file) => file !== molyMigration)) {
    await db.exec(await fs.readFile(migration, "utf8"));
  }

  const teacher = (await db.query(
    "INSERT INTO users(username,email,role) VALUES ('legacy-quiz-teacher','legacy-quiz-teacher@example.test','creator') RETURNING id",
  )).rows[0];
  const course = (await db.query(
    "INSERT INTO courses(name,slug,author_id,is_published) VALUES ('Legacy quiz course','legacy-quiz-course',$1,TRUE) RETURNING id",
    [teacher.id],
  )).rows[0];
  const quiz = (await db.query(
    "INSERT INTO quizzes(title,course_id,instructor_id,status) VALUES ('Legacy quiz',$1,$2,'PUBLISHED') RETURNING id",
    [course.id, teacher.id],
  )).rows[0];
  const legacyQuestion = (await db.query(
    `INSERT INTO quiz_questions(quiz_id,question_text,question_type,options_json,correct_answer,explanation,points,sort_order)
     VALUES ($1,'Legacy question','single_choice',$2::jsonb,'A','Legacy explanation',2,1) RETURNING id`,
    [quiz.id, JSON.stringify([{ key: "A", text: "Correct" }, { key: "B", text: "Wrong" }])],
  )).rows[0];

  const migrationSql = await fs.readFile(molyMigration, "utf8");
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const table = await db.query("SELECT to_regclass('public.quiz_question_groups') AS name");
  assert.equal(table.rows[0].name, "quiz_question_groups");
  const columns = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'quiz_questions'
       AND column_name IN ('group_id', 'item_order', 'question_text_cn', 'question_text_en', 'ocr_metadata')
     ORDER BY column_name`,
  );
  assert.deepEqual(columns.rows.map((row) => row.column_name), ["group_id", "item_order", "ocr_metadata", "question_text_cn", "question_text_en"]);
  const preserved = (await db.query(
    "SELECT question_text,question_type,correct_answer,explanation,points,group_id,item_order,ocr_metadata FROM quiz_questions WHERE id=$1",
    [legacyQuestion.id],
  )).rows[0];
  assert.equal(preserved.question_text, "Legacy question");
  assert.equal(preserved.question_type, "single_choice");
  assert.equal(preserved.correct_answer, "A");
  assert.equal(preserved.explanation, "Legacy explanation");
  assert.equal(Number(preserved.points), 2);
  assert.equal(preserved.group_id, null);
  assert.equal(preserved.item_order, null);
  assert.deepEqual(preserved.ocr_metadata, {});
});
