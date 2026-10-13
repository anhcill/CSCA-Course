export const QUIZ_OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

/**
 * Reads the flexible and compact answer-key format teachers normally enter.
 * Supported examples:
 * - Compact attached: "1a 2b 3c 4d", "1A 2B 3C 4D", "1a2b3c4d"
 * - Space separated: "1 a 2 b 3 c 4 d", "1 A 2 B"
 * - Punctuated: "1.a 2.b", "1. A", "1:A", "1: a", "1-a", "1 - A", "1) a", "1)A"
 * - Parenthesized / bracketed: "(1) A", "[1] A", "1.(A)", "1 [A]"
 * - Prefixed: "Câu 1: A", "câu 1a", "cau 1: a", "Bài 1: A", "c1a", "Q1: A", "Question 1: A"
 * - Multi-line, tabs (Excel/Word tables), commas, semicolons, slashes, pipes.
 * - Pure letter sequences (fallback when no question numbers): "A B C D", "a, b, c, d", "ABCD"
 *
 * Case-insensitive (a -> A, b -> B, etc.).
 * Duplicates keep the last value and report question numbers.
 */
export const parseQuizAnswerKey = (value) => {
  const text = typeof value === "string" ? value : "";
  const answerByQuestion = new Map();
  const duplicateQuestionNumbers = [];

  // Primary pattern: match question-answer pairs with lookbehind for delimiters/preceding answers
  const numberedPattern = /(?<=(?:^|[\s,;|/•\(\[\{\-–—\.]|[a-f]))(?:(?:câu|cau|bài|bai|question|q)\s*|\bc\s*(?=\d))?\(?\[?(\d{1,3})\)?\]?\s*[:.\-–—:=/_~)]*\s*[\(\[]?\s*([a-f])[\)\]]?(?:\.|\b|(?=\d))(?=$|[\s,;|/•\)\]\}\-–—:]|\d)/giu;

  let match;
  let hasNumberedMatch = false;

  while ((match = numberedPattern.exec(text)) !== null) {
    const questionNumber = Number(match[1]);
    const answerKey = String(match[2]).toUpperCase();
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || !QUIZ_OPTION_KEYS.includes(answerKey)) {
      continue;
    }
    hasNumberedMatch = true;
    if (answerByQuestion.has(questionNumber)) {
      duplicateQuestionNumbers.push(questionNumber);
    }
    answerByQuestion.set(questionNumber, answerKey);
  }

  // Fallback 1: compact attached string without spaces e.g. "1a2b3c4d"
  if (!hasNumberedMatch && text.trim()) {
    const compactNumberedPattern = /(\d{1,3})\s*([a-f])/gi;
    let compactMatch;
    let foundCompact = false;
    while ((compactMatch = compactNumberedPattern.exec(text)) !== null) {
      const qNum = Number(compactMatch[1]);
      const aKey = String(compactMatch[2]).toUpperCase();
      if (Number.isInteger(qNum) && qNum >= 1 && QUIZ_OPTION_KEYS.includes(aKey)) {
        foundCompact = true;
        if (answerByQuestion.has(qNum)) duplicateQuestionNumbers.push(qNum);
        answerByQuestion.set(qNum, aKey);
      }
    }

    // Fallback 2: pure sequence of letters without numbers (e.g. "A B C D", "a, b, c, d", "ABCD")
    if (!foundCompact) {
      const tokens = text.trim().split(/[\s,;|/\-–—]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
      const allTokensAreOptions = tokens.length > 0 && tokens.every((t) => QUIZ_OPTION_KEYS.includes(t));

      if (allTokensAreOptions) {
        tokens.forEach((key, idx) => {
          answerByQuestion.set(idx + 1, key);
        });
      } else if (/^[a-fA-F\s]+$/.test(text.trim())) {
        const letters = text.trim().replace(/\s+/g, "").toUpperCase().split("");
        if (letters.length >= 2 && letters.every((l) => QUIZ_OPTION_KEYS.includes(l))) {
          letters.forEach((key, idx) => {
            answerByQuestion.set(idx + 1, key);
          });
        }
      }
    }
  }

  return {
    answerByQuestion,
    entries: [...answerByQuestion.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([questionNumber, answerKey]) => ({ questionNumber, answerKey })),
    duplicateQuestionNumbers: [...new Set(duplicateQuestionNumbers)],
  };
};

export const optionIndexForQuizKey = (key) => QUIZ_OPTION_KEYS.indexOf(String(key || "").toUpperCase());

