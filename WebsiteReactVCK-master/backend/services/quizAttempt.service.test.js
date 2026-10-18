import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuizResult,
  makeQuestionSnapshot,
  normalizeQuizAnswers,
  parseQuizDescriptionMetadata,
  publicQuizItems,
  publicQuizQuestion,
} from "./quizAttempt.service.js";

const objective = (id, sortOrder, correct = "A") => ({
  id,
  quiz_id: 10,
  question_text: `Objective ${id}`,
  question_type: "single_choice",
  options_json: [{ key: "A", text: "A" }, { key: "B", text: "B" }],
  correct_answer: correct,
  explanation: "",
  points: 1,
  sort_order: sortOrder,
});

const essay = (id, sortOrder) => ({
  id,
  quiz_id: 10,
  question_text: `Essay ${id}`,
  question_type: "essay",
  options_json: [],
  correct_answer: null,
  explanation: "",
  points: 3,
  sort_order: sortOrder,
});

test("serialized quiz description exposes plain text and normalized essay config", () => {
  assert.deepEqual(parseQuizDescriptionMetadata(JSON.stringify({
    text: "Làm đủ các phần",
    essayConfig: { enabled: true, maxScore: 6, prompt: "Chụp rõ từng trang" },
  })), {
    description: "Làm đủ các phần",
    essayConfig: { enabled: true, maxScore: 6, prompt: "Chụp rõ từng trang" },
  });
  assert.deepEqual(parseQuizDescriptionMetadata("Mô tả cũ"), { description: "Mô tả cũ", essayConfig: null });
});

test("shuffle keeps essay questions in authored slots and persists objective order", () => {
  const questions = [objective(1, 1), essay(2, 2), objective(3, 3), essay(4, 4), objective(5, 5)];
  const snapshot = makeQuestionSnapshot(questions, true, () => 0);
  assert.deepEqual(snapshot.map((question) => question.id), [3, 2, 5, 4, 1]);
  assert.equal(snapshot[1].sort_order, 2);
  assert.equal(snapshot[3].sort_order, 4);
  assert.deepEqual(makeQuestionSnapshot(questions, false).map((question) => question.id), [1, 2, 3, 4, 5]);
});

test("public questions and review expose stable snapshot position while answers stay keyed by id", () => {
  const questions = [objective(30, 3, "B"), essay(20, 2), objective(10, 1, "A")];
  assert.deepEqual(questions.map(publicQuizQuestion).map(({ id, position, sortOrder }) => ({ id, position, sortOrder })), [
    { id: 30, position: 1, sortOrder: 3 },
    { id: 20, position: 2, sortOrder: 2 },
    { id: 10, position: 3, sortOrder: 1 },
  ]);
  const result = buildQuizResult(questions, { 10: "A", 30: "B" });
  assert.equal(result.score, 2);
  assert.deepEqual(result.review.map(({ questionId, position, questionText }) => ({ questionId, position, questionText })), [
    { questionId: 30, position: 1, questionText: "Objective 30" },
    { questionId: 20, position: 2, questionText: "Essay 20" },
    { questionId: 10, position: 3, questionText: "Objective 10" },
  ]);
});

test("essay payloads normalize by question id and derive position and asset URLs on the server", () => {
  const questions = [objective(10, 1), essay(20, 2), objective(30, 3), essay(40, 4)];
  const normalized = normalizeQuizAnswers(questions, {
    10: "A",
    _essay: {
      byQuestion: {
        20: { notes: "Câu hai", attachments: [{ assetId: 101, name: "page-1.jpg", url: "https://attacker.test/file" }] },
        40: { text: "Câu bốn", attachments: [{ assetId: 202 }] },
      },
      // New clients also include a flattened legacy view. It must not be mapped twice.
      attachments: [{ assetId: 999 }],
      notes: "legacy copy",
    },
  });
  assert.equal(normalized.error, null);
  assert.deepEqual(normalized.assetIds, [101, 202]);
  assert.equal(normalized.answers._essay.byQuestion[20].position, 2);
  assert.equal(normalized.answers._essay.byQuestion[40].position, 4);
  assert.equal(normalized.answers._essay.byQuestion[20].attachments[0].url, "/api/assignments/submission-assets/101/access");
  assert.deepEqual(normalized.answers._essay.attachments.map((item) => item.assetId), [101, 202]);
});

test("legacy shared essay drafts remain readable by mapping to the first essay question", () => {
  const questions = [objective(10, 1), essay(20, 2), essay(40, 3)];
  const normalized = normalizeQuizAnswers(questions, {
    _essay: { notes: "Bài cũ", attachments: [{ assetId: 101 }] },
  });
  assert.equal(normalized.error, null);
  assert.equal(normalized.answers._essay.byQuestion[20].notes, "Bài cũ");
  assert.equal(normalized.answers._essay.byQuestion[40], undefined);
});

test("student payload cannot inject grading fields or attach essays to objective questions", () => {
  const questions = [objective(10, 1), essay(20, 2), essay(30, 3)];
  assert.match(normalizeQuizAnswers(questions, { 10: "A", _essayGrade: { score: 999 } }).error, /dữ liệu hệ thống/);
  assert.match(normalizeQuizAnswers(questions, { _essay: { byQuestion: { 10: { notes: "wrong" } } } }).error, /không hợp lệ/);
  assert.match(normalizeQuizAnswers(questions, { _essay: { byQuestion: { 20: { attachments: [{ url: "data:image/png;base64,bad" }] } } } }).error, /assetId/);
  assert.match(normalizeQuizAnswers(questions, {
    _essay: { byQuestion: { 20: { attachments: [{ assetId: 101 }] }, 30: { attachments: [{ assetId: 101 }] } } },
  }).error, /chỉ được gắn với một câu hỏi/);
});

test("new objective types validate and grade while translation stays manual", () => {
  const questions = [
    { ...objective(1, 1, "B"), question_type: "true_false" },
    { ...objective(2, 2, "A"), question_type: "reading_item" },
    { ...objective(3, 3, "x + 1"), question_type: "fill_blank_item", options_json: [] },
    { ...essay(4, 4), question_type: "translation" },
  ];
  const normalized = normalizeQuizAnswers(questions, { 1: "B", 2: "A", 3: "x + 1", 4: "Bản dịch" });
  assert.equal(normalized.error, null);
  const result = buildQuizResult(questions, normalized.answers);
  assert.equal(result.score, 3);
  assert.equal(result.review[3].isCorrect, null);
  assert.equal(result.review[3].correctAnswer, null);
});

test("nested public items retain group content without exposing answers or explanations", () => {
  const questions = [
    {
      ...objective(11, 1, "A"),
      group_id: 50,
      item_order: 1,
      group_type: "reading_passage",
      passage_text: "Read this passage",
      passage_text_cn: "阅读短文",
      passage_text_en: "",
      passage_image_url: null,
      linked_options: [],
      cloze_mode: null,
      group_sort_order: 1,
      question_type: "reading_item",
      explanation: "secret explanation",
    },
    { ...objective(12, 2, "B"), item_order: 2, group_id: null },
  ];
  const items = publicQuizItems(questions);
  assert.equal(items[0].kind, "reading_group");
  assert.equal(items[0].passageText, "Read this passage");
  assert.equal(items[0].questions[0].correctAnswer, undefined);
  assert.equal(items[0].questions[0].explanation, undefined);
  assert.equal(items[1].kind, "question");
});

test("group-aware snapshots shuffle top-level items without splitting group questions", () => {
  const questions = [
    { ...objective(1, 1), item_order: 1, group_id: null },
    { ...objective(2, 2), item_order: 2, group_id: 90, group_type: "reading_passage", group_sort_order: 2, passage_text: "P" },
    { ...objective(3, 3), item_order: 2, group_id: 90, group_type: "reading_passage", group_sort_order: 2, passage_text: "P" },
    { ...essay(4, 4), item_order: 3, group_id: null },
  ];
  const snapshot = makeQuestionSnapshot(questions, true, () => 0);
  assert.deepEqual(snapshot.map((question) => question.id), [2, 3, 1, 4]);
  assert.deepEqual(snapshot.slice(0, 2).map((question) => question.item_order), [1, 1]);
  assert.equal(snapshot[2].item_order, 2);
  assert.equal(snapshot[3].item_order, 3);
});
