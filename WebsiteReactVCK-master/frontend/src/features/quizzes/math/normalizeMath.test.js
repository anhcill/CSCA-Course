import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMathUnicode,
  normalizePlainFractions,
  normalizeLatexMath,
  normalizeRichMathText,
  isLikelyLooseMathLine,
} from './normalizeMath.js';
import {
  isPlainTextMathValue,
  markPlainTextMathValue,
  stripPlainTextMathMarker,
} from './plainTextMathMode.js';
import { repairVectorNotationArtifacts, normalizeOcrMathSyntax } from './ocrMathArtifacts.js';

test('normalizeMathUnicode transforms unicode math symbols to LaTeX equivalents', () => {
  const input = 'α + β = π, x² ≥ 0, A ∪ B';
  const result = normalizeMathUnicode(input);
  assert.match(result, /\\alpha/);
  assert.match(result, /\\beta/);
  assert.match(result, /\\pi/);
  assert.match(result, /\\ge/);
  assert.match(result, /\\cup/);
});

test('normalizePlainFractions converts simple division to \\frac', () => {
  assert.equal(normalizePlainFractions('1/2'), '\\frac{1}{2}');
  assert.equal(normalizePlainFractions('(a+b)/(c-d)'), '\\frac{a+b}{c-d}');
});

test('repairVectorNotationArtifacts transforms vector arrows to \\vec notation', () => {
  const input = '向量 a => (1, 2)';
  const repaired = repairVectorNotationArtifacts(input);
  assert.match(repaired, /\\vec\{a\}=/);
});

test('normalizeOcrMathSyntax repairs OCR log and set operators', () => {
  const input = 'log 2 (x) + A\\B';
  const output = normalizeOcrMathSyntax(input);
  assert.match(output, /\\log_\{2\}/);
  assert.match(output, /\\setminus/);
});

test('normalizeLatexMath cleans escaped backslashes and loose formatting', () => {
  const input = '\\\\frac{1}{2}   +   \\\\sqrt{x}';
  const normalized = normalizeLatexMath(input);
  assert.equal(normalized, '\\frac{1}{2} + \\sqrt{x}');
});

test('isLikelyLooseMathLine accurately classifies math formulas vs plain language', () => {
  assert.equal(isLikelyLooseMathLine('x^2 + 2x - 3 = 0'), true);
  assert.equal(isLikelyLooseMathLine('\\frac{a}{b} = \\sqrt{c}'), true);
  assert.equal(isLikelyLooseMathLine('Học sinh đọc kỹ đề bài trước khi làm bài.'), false);
});

test('plainTextMathMode marker lifecycle works properly', () => {
  const raw = 'Giá trị $100 không phải công thức toán.';
  const marked = markPlainTextMathValue(raw);
  assert.equal(isPlainTextMathValue(marked), true);
  assert.equal(isPlainTextMathValue(raw), false);
  assert.equal(stripPlainTextMathMarker(marked), raw);
});

test('normalizeRichMathText wraps plain math formulas in \\(...\\) for KaTeX', () => {
  const input = 'Cho phương trình x^2 - 4x + 3 = 0 có hai nghiệm.';
  const normalized = normalizeRichMathText(input);
  assert.match(normalized, /\\\(/);
  assert.match(normalized, /\\\)/);
});
