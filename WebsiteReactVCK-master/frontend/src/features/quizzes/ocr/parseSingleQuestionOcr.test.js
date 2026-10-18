import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSingleQuestionOcr } from './parseSingleQuestionOcr.js';

test('parseSingleQuestionOcr parses standard Vietnamese multiple-choice question', () => {
  const ocrText = `Câu 12: Cho hàm số f(x) = x^2 + 2x. Tính đạo hàm f'(1).
A. 2
B. 4
C. 6
D. 0
Đáp án: B
Lời giải: Ta có f'(x) = 2x + 2, do đó f'(1) = 2(1) + 2 = 4.`;

  const parsed = parseSingleQuestionOcr(ocrText);
  assert.ok(parsed.questionText.includes("Cho hàm số"));
  assert.equal(parsed.answers.length, 4);
  assert.equal(parsed.answers[0].key, 'A');
  assert.equal(parsed.answers[0].text, '2');
  assert.equal(parsed.answers[1].key, 'B');
  assert.equal(parsed.answers[1].text, '4');
  assert.equal(parsed.correctAnswer, 'B');
  assert.ok(parsed.explanation.includes("f'(1) = 2(1) + 2 = 4"));
});

test('parseSingleQuestionOcr parses Chinese question with options, answer and explanation', () => {
  const ocrText = `15. 下列哪个选项是正确的？
A. 选项一
B. 选项二
C. 选项三
D. 选项四
正确答案: C
解析: 根据题意，只有选项三符合条件。`;

  const parsed = parseSingleQuestionOcr(ocrText);
  assert.ok(parsed.questionTextCn.includes("下列哪个选项是正确的"));
  assert.equal(parsed.answers.length, 4);
  assert.equal(parsed.answers[2].key, 'C');
  assert.equal(parsed.answers[2].textCn, '选项三');
  assert.equal(parsed.correctAnswer, 'C');
  assert.ok(parsed.explanationCn.includes("只有选项三符合条件"));
});

test('parseSingleQuestionOcr handles inline options on a single line', () => {
  const ocrText = `Câu 5. Giá trị của biểu thức A là?
A. 10 B. 20 C. 30 D. 40
Đáp án: A`;

  const parsed = parseSingleQuestionOcr(ocrText);
  assert.equal(parsed.answers.length, 4);
  assert.equal(parsed.answers[0].text, '10');
  assert.equal(parsed.answers[1].text, '20');
  assert.equal(parsed.answers[2].text, '30');
  assert.equal(parsed.answers[3].text, '40');
  assert.equal(parsed.correctAnswer, 'A');
});

test('parseSingleQuestionOcr handles empty or whitespace input safely', () => {
  const parsed = parseSingleQuestionOcr('');
  assert.equal(parsed.questionText, '');
  assert.equal(parsed.questionTextCn, '');
  assert.deepEqual(parsed.answers, []);
  assert.equal(parsed.correctAnswer, '');
  assert.equal(parsed.explanation, '');
  assert.equal(parsed.explanationCn, '');
  assert.ok(Array.isArray(parsed.warnings));
  assert.equal(parsed.warnings.length, 3);
});
