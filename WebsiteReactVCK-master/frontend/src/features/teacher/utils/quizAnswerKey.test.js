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

test("parseQuizAnswerKey recognizes 1a 2b 3c 4d on single line", () => {
  const parsed = parseQuizAnswerKey("1a 2b 3c 4d");
  assert.deepEqual(parsed.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
    { questionNumber: 4, answerKey: "D" },
  ]);
});

test("parseQuizAnswerKey recognizes 1 a 2 b 3 c 4 d with spaces", () => {
  const parsed = parseQuizAnswerKey("1 a 2 b 3 c 4 d");
  assert.deepEqual(parsed.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
    { questionNumber: 4, answerKey: "D" },
  ]);
});

test("parseQuizAnswerKey recognizes 1A 2B 3C uppercase compact", () => {
  const parsed = parseQuizAnswerKey("1A 2B 3C");
  assert.deepEqual(parsed.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
  ]);
});

test("parseQuizAnswerKey recognizes varied punctuation (1.a, 1:a, 1-a, 1)a, c1a, Câu 1: A)", () => {
  const input = "1.a 2:b 3-c 4)d c5a Câu 6: B Bài 7: C Q8: D";
  const parsed = parseQuizAnswerKey(input);
  assert.deepEqual(parsed.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
    { questionNumber: 4, answerKey: "D" },
    { questionNumber: 5, answerKey: "A" },
    { questionNumber: 6, answerKey: "B" },
    { questionNumber: 7, answerKey: "C" },
    { questionNumber: 8, answerKey: "D" },
  ]);
});

test("parseQuizAnswerKey recognizes all attached 1a2b3c4d", () => {
  const parsed = parseQuizAnswerKey("1a2b3c4d");
  assert.deepEqual(parsed.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
    { questionNumber: 4, answerKey: "D" },
  ]);
});

test("parseQuizAnswerKey recognizes fallback pure letter sequences (A B C D, ABCD)", () => {
  const parsed1 = parseQuizAnswerKey("A B C D");
  assert.deepEqual(parsed1.entries, [
    { questionNumber: 1, answerKey: "A" },
    { questionNumber: 2, answerKey: "B" },
    { questionNumber: 3, answerKey: "C" },
    { questionNumber: 4, answerKey: "D" },
  ]);

  const parsed2 = parseQuizAnswerKey("ABCD");

  assert.deepEqual(parsed2.entries, [
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

