export const QUIZ_OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

/**
 * Reads the compact answer-key format teachers normally receive with a paper.
 * Supported examples: "1 A", "2. b", "Câu 3: C", "4-D".
 * The parser deliberately ignores every other word so pasted headings and notes
 * do not accidentally become answers.
 */
export const parseQuizAnswerKey = (value) => {
  const text = typeof value === "string" ? value : "";
  const answerByQuestion = new Map();
  const duplicateQuestionNumbers = [];
  const pattern = /(?:^|[\s,;|])(?:câu\s*)?(\d{1,3})\s*(?:[.)\-:=]+|\s)\s*([a-f])(?=$|[\s,;|])/giu;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const questionNumber = Number(match[1]);
    const answerKey = String(match[2]).toUpperCase();
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || !QUIZ_OPTION_KEYS.includes(answerKey)) continue;
    if (answerByQuestion.has(questionNumber)) duplicateQuestionNumbers.push(questionNumber);
    answerByQuestion.set(questionNumber, answerKey);
  }

  return {
    answerByQuestion,
    entries: [...answerByQuestion.entries()].map(([questionNumber, answerKey]) => ({ questionNumber, answerKey })),
    duplicateQuestionNumbers: [...new Set(duplicateQuestionNumbers)],
  };
};

export const optionIndexForQuizKey = (key) => QUIZ_OPTION_KEYS.indexOf(String(key || "").toUpperCase());
