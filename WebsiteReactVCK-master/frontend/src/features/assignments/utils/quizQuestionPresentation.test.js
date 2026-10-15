import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentsForQuestion,
  buildEssayResponse,
  normalizeEssayResponse,
  preserveQuestionOrder,
} from "./quizQuestionPresentation.js";

test("preserves interleaved backend question order", () => {
  const questions = preserveQuestionOrder([
    { id: 1, type: "single_choice" },
    { id: 2, type: "essay" },
    { id: 3, type: "single_choice" },
    { id: 4, type: "essay" },
  ]);
  assert.deepEqual(questions.map((question) => question.id), [1, 2, 3, 4]);
  assert.deepEqual(questions.map((question) => question.displayNumber), [1, 2, 3, 4]);
});

test("groups essay files and notes by question while retaining flat legacy fields", () => {
  const questions = preserveQuestionOrder([
    { id: 1, type: "single_choice" },
    { id: 2, type: "essay" },
    { id: 3, type: "single_choice" },
    { id: 4, type: "essay" },
  ]).filter((question) => question.type === "essay");
  const attachments = [
    { id: "a", questionId: 2, name: "cau-2.png" },
    { id: "b", questionId: 4, name: "cau-4.pdf" },
  ];
  const payload = buildEssayResponse({
    attachments,
    notesByQuestion: { 2: "Lời giải 2", 4: "Lời giải 4" },
    generalNotes: "Ghi chú chung",
    essayQuestions: questions,
  });

  assert.deepEqual(attachmentsForQuestion(payload.attachments, 2).map((item) => item.id), ["a"]);
  assert.deepEqual(payload.byQuestion["4"].attachments.map((item) => item.id), ["b"]);
  assert.equal(payload.byQuestion["2"].notes, "Lời giải 2");
  assert.match(payload.notes, /Câu 4: Lời giải 4/);
});

test("maps single-question legacy submissions to that essay question", () => {
  const questions = preserveQuestionOrder([{ id: 9, type: "essay" }]);
  const normalized = normalizeEssayResponse({
    attachments: [{ id: "legacy" }],
    notes: "Ghi chú cũ",
  }, questions);
  assert.equal(normalized.attachments[0].questionId, 9);
  assert.equal(normalized.notesByQuestion["9"], "Ghi chú cũ");
});

test("maps ambiguous legacy submissions to the first essay question", () => {
  const questions = preserveQuestionOrder([
    { id: 10, type: "essay" },
    { id: 11, type: "essay" },
  ]);
  const normalized = normalizeEssayResponse({
    attachments: [{ id: "legacy-multi" }],
    notes: "Ghi chú bài cũ",
  }, questions);
  assert.equal(normalized.attachments[0].questionId, 10);
  assert.equal(normalized.notesByQuestion["10"], "Ghi chú bài cũ");
});
