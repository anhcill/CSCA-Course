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

test('normalizeRichMathText keeps display aligned environments intact', () => {
  const input = String.raw`$$\begin{aligned}
\sin 75^\circ &= \sin(45^\circ + 30^\circ) \\
&= \dfrac{\sqrt{6} + \sqrt{2}}{4}
\end{aligned}$$`;
  const normalized = normalizeRichMathText(input);
  assert.match(normalized, /^\$\$[\s\S]*\\begin\{aligned\}/);
  assert.match(normalized, /\\\\/);
  assert.doesNotMatch(normalized, /\\\(\\begin|\\\)\\/);
});

test('normalizeRichMathText keeps cases and array row spacing intact', () => {
  const input = String.raw`$$\left[\begin{array}{l}
 x = \dfrac{\pi}{6} + 2k\pi \\[6pt]
x = \dfrac{5\pi}{6} + 2k\pi
\end{array}\right.$$`;
  const normalized = normalizeRichMathText(input);
  assert.match(normalized, /\\\\\[6pt\]/);
  assert.doesNotMatch(normalized, /(?<!\\)\\\[6pt\]/);
  assert.doesNotMatch(normalized, /\\\(\\left/);
});

test('normalizeRichMathText preserves inline math inside italic Markdown lines with trailing punctuation', () => {
  const input = String.raw`*(Lưu ý mở rộng: $1 + \tan^2\alpha = \dfrac{1}{\cos^2\alpha} = \dfrac{25}{16}$).*`;
  const normalized = normalizeRichMathText(input);
  assert.equal(normalized, String.raw`*(Lưu ý mở rộng: $1 + \tan^{2}\alpha = \dfrac{1}{\cos^{2}\alpha} = \dfrac{25}{16}$).*`);
  assert.doesNotMatch(normalized, /\\\(\)\.\*\\\)/);
});

test('normalizeLatexMath does not turn bare function slash notation into a fraction', () => {
  assert.equal(normalizeLatexMath(String.raw`\sin/\cos`), String.raw`\sin/\cos`);
  assert.equal(normalizeLatexMath(String.raw`\text{ rad}`), String.raw`\text{ rad}`);
  assert.equal(normalizeLatexMath(String.raw`\text{ hoặc }`), String.raw`\text{ hoặc }`);
});

test('normalizeRichMathText wraps formulas containing Chinese/Vietnamese inside \\text{...}', () => {
  const input = String.raw`x = 4 \text{ 或 } x = -2`;
  const normalized = normalizeRichMathText(input);
  assert.match(normalized, /\\\(x = 4 \\text\{ 或 \} x = -2\\\)/);
});

test('normalizeRichMathText handles \\omega\\ne0, \\leftrightarrow, and set operators', () => {
  assert.match(normalizeRichMathText(String.raw`\omega\ne0`), /\\\(\\omega\s*\\ne\s*0\\\)/);
  assert.doesNotMatch(
    normalizeRichMathText(String.raw`y=f(x)\Rightarrow x=g(y),\quad x\leftrightarrow y\Rightarrow y=f^{-1}(x)`),
    /\\left\s+rightarrow/,
  );
  assert.match(
    normalizeRichMathText('Cho A={1,2,3}, B={2,3,4}. Tìm A∩B.'),
    /\\\(A\s*\\cap\s*B\.?\\\)/,
  );
});

