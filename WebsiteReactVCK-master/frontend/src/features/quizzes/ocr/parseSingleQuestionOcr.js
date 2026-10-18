import { normalizeEscapedLatexBackslashes, normalizeLatexMath } from '../math/normalizeMath.js';
import { normalizeOcrMathText } from '../math/normalizeOcrMath.js';

const ANSWER_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const CJK_RE = /[\u3400-\u9fff]/;
const EXPLANATION_INLINE_RE =
  /(?:^|[\s\n])(?:\u7b54\u6848\u89e3\u6790|\u89e3\u6790|\u89e3\u7b54|\u8bf4\u660e|\u89e3|analysis|explanation|l(?:\u1eddi|oi)\s*gi\u1ea3i|gi\u1ea3i\s*th\u00edch|giai\s*thich)\s*[:\uff1a]\s*/i;
const EXPLANATION_LINE_RE =
  /^\s*(?:\u7b54\u6848\u89e3\u6790|\u89e3\u6790|\u89e3\u7b54|\u8bf4\u660e|\u89e3|analysis|explanation|l(?:\u1eddi|oi)\s*gi\u1ea3i|gi\u1ea3i\s*th\u00edch|giai\s*thich)\s*[:\uff1a]?\s*([\s\S]*)$/i;
const EXPLICIT_ANSWER_RE =
  /(?:\u6b63\u786e\u7b54\u6848|\u7b54\u6848|\u6b63\u89e3|\u0111\u00e1p\s*\u00e1n|dap\s*an|answer|correct\s*answer)\s*[:\uff1a]?\s*([A-H])\b/i;
const EXPLICIT_ANSWER_GLOBAL_RE =
  /(?:\u6b63\u786e\u7b54\u6848|\u7b54\u6848|\u6b63\u89e3|\u0111\u00e1p\s*\u00e1n|dap\s*an|answer|correct\s*answer)\s*[:\uff1a]?\s*[A-H]\b/gi;
const OPTION_LINE_RE = /^\s*([A-H])\s*(?:[.\uff0e\u3001:\uff1a)\uff09]|\s*\\quad\b)\s*([\s\S]*)$/i;

function normalizeRawOcr(input) {
  return normalizeEscapedLatexBackslashes(input)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\uff21-\uff3a]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u2212/g, '-')
    .replace(/\uff08/g, '(')
    .replace(/\uff09/g, ')')
    .replace(/\uff0c/g, ',')
    .replace(/\uff1b/g, ';')
    .replace(/\uff1d/g, '=')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitInlineOptions(input) {
  return input.replace(/\s+([A-H])\s*(?=[.\uff0e\u3001:\uff1a)\uff09]|\\quad\b)/g, '\n$1');
}

function cleanSegment(input) {
  return input
    .replace(/(^|[^\\])\\[ \t]+/g, '$1 ')
    .replace(/^\s*\\quad\s+/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function stripQuestionNumber(input) {
  return input
    .replace(/^\s*(?:\u7b2c\s*)?\d{1,3}\s*[.\uff0e\u3001:\uff1a)\uff09]\s*/, '')
    .replace(/^\s*[(\uff08]\s*\d{1,3}\s*[)\uff09]\s*/, '')
    .trim();
}

function formatMathText(input) {
  return normalizeOcrMathText(cleanSegment(input));
}

function splitExplanation(input) {
  const inline = input.match(EXPLANATION_INLINE_RE);
  if (inline && inline.index !== undefined) {
    return {
      body: input.slice(0, inline.index).trim(),
      explanation: input.slice(inline.index + inline[0].length).trim(),
    };
  }

  const lines = input.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(EXPLANATION_LINE_RE);
    if (!marker) continue;

    const rest = marker[1]?.trim();
    return {
      body: lines.slice(0, i).join('\n').trim(),
      explanation: [rest, ...lines.slice(i + 1)].filter(Boolean).join('\n').trim(),
    };
  }

  return { body: input, explanation: '' };
}

function extractExplicitAnswer(input) {
  const direct = input.match(EXPLICIT_ANSWER_RE)?.[1]?.toUpperCase();
  if (direct) return direct;

  const selected = input.match(/(?:\u9009|\u6545\u9009|\u5e94\u9009)\s*([A-H])\b/i)?.[1]?.toUpperCase();
  return selected || '';
}

function removeExplicitAnswer(input) {
  return input
    .replace(EXPLICIT_ANSWER_GLOBAL_RE, '')
    .replace(/(?:\u9009|\u6545\u9009|\u5e94\u9009)\s*[A-H]\b/gi, '')
    .trim();
}

function parseBody(input) {
  const optionParts = new Map();
  const questionLines = [];
  let currentKey = '';

  const prepared = splitInlineOptions(input);
  for (const rawLine of prepared.split('\n')) {
    const line = cleanSegment(rawLine);
    if (!line) continue;

    const option = line.match(OPTION_LINE_RE);
    if (option) {
      currentKey = option[1].toUpperCase();
      optionParts.set(currentKey, [cleanSegment(option[2] || '')]);
      continue;
    }

    if (currentKey && optionParts.has(currentKey)) {
      optionParts.get(currentKey)?.push(line);
      continue;
    }

    questionLines.push(line);
  }

  return {
    question: stripQuestionNumber(questionLines.join('\n')),
    optionParts,
  };
}

function choosePrimaryLanguage(raw, question, explanation, options) {
  return CJK_RE.test([raw, question, explanation, ...options].join(' ')) ? 'cn' : 'vi';
}

function toLocalizedText(value, language) {
  if (!value) return { text: '', textCn: '' };
  if (language === 'cn' || CJK_RE.test(value)) return { text: '', textCn: value };
  return { text: value, textCn: '' };
}

function normalizeComparable(input) {
  return normalizeLatexMath(input)
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\(?:quad|,|;|!)/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, '')
    .replace(/[.\u3002,\uff0c;\uff1b:]+$/g, '')
    .toLowerCase();
}

function inferAnswerFromExplanation(answers, explanation) {
  const comparableExplanation = normalizeComparable(explanation);
  if (!comparableExplanation) return '';

  for (const answer of answers) {
    const value = normalizeComparable(answer.text || answer.textCn);
    if (!value) continue;

    if (
      comparableExplanation.endsWith(`=${value}`) ||
      comparableExplanation.includes(`=${value}.`) ||
      comparableExplanation.includes(`=${value},`) ||
      comparableExplanation.includes(`\\rightarrow${value}`)
    ) {
      return answer.key;
    }
  }

  return '';
}

export function parseSingleQuestionOcr(input) {
  const raw = normalizeRawOcr(input);
  const explicitAnswer = extractExplicitAnswer(raw);
  const split = splitExplanation(removeExplicitAnswer(raw));
  const { question, optionParts } = parseBody(split.body);
  const rawOptions = ANSWER_KEYS.map(key => ({
    key,
    value: (optionParts.get(key) || []).join('\n').trim(),
  })).filter(option => option.value);
  const primaryLanguage = choosePrimaryLanguage(raw, question, split.explanation, rawOptions.map(option => option.value));

  const questionText = formatMathText(question);
  const explanationText = formatMathText(split.explanation);
  const localizedQuestion = toLocalizedText(questionText, primaryLanguage);
  const localizedExplanation = toLocalizedText(explanationText, primaryLanguage);

  const maxAnswerIndex = rawOptions.reduce((max, option) => {
    const index = ANSWER_KEYS.indexOf(option.key);
    return Math.max(max, index);
  }, rawOptions.length ? 3 : -1);

  const answers = maxAnswerIndex >= 0
    ? ANSWER_KEYS.slice(0, maxAnswerIndex + 1).map((key) => {
      const rawOption = rawOptions.find(option => option.key === key)?.value || '';
      const localized = toLocalizedText(formatMathText(rawOption), primaryLanguage);
      return { key, text: localized.text, textCn: localized.textCn, imageUrl: '' };
    })
    : [];

  const correctAnswer = explicitAnswer || inferAnswerFromExplanation(answers, explanationText);
  const warnings = [];

  if (!localizedQuestion.text && !localizedQuestion.textCn) warnings.push('Không thấy nội dung câu hỏi.');
  if (answers.length < 2) warnings.push('Không thấy đủ 2 lựa chọn.');
  if (!correctAnswer) warnings.push('Chưa suy ra đáp án đúng.');

  return {
    questionText: localizedQuestion.text,
    questionTextCn: localizedQuestion.textCn,
    answers,
    correctAnswer,
    explanation: localizedExplanation.text,
    explanationCn: localizedExplanation.textCn,
    warnings,
  };
}
