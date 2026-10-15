import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuizResult,
  makeQuestionSnapshot,
  normalizeQuizAnswers,
  parseQuizDescriptionMetadata,
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
