import test from "node:test";
import assert from "node:assert/strict";
import { parseQuizAnswerKey } from "./quizAnswerKey.js";

test("parseQuizAnswerKey accepts compact numbered answer lists", () => {
  const parsed = parseQuizAnswerKey("1 A a\n2. b\nCâu 3: C\n4-D");
  assert.deepEqual(parsed.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
    { questionNumber: 4, answerKey: "D" },
  ]);
});

test("parseQuizAnswerKey keeps the last value and reports duplicate question numbers", () => {
  const parsed = parseQuizAnswerKey("1 A\n1 C\nGhi chú không phải đáp án");
  assert.deepEqual(parsed.entries, [{ questionNumber: 1, answerKey: "C" }]);
  assert.deepEqual(parsed.duplicateQuestionNumbers, [1]);
});
