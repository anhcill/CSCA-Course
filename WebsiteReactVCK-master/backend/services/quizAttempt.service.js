import crypto from "node:crypto";

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseStoredAnswer = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const questionType = (question) => question?.question_type || question?.type || "single_choice";
const isEssayQuestion = (question) => questionType(question) === "essay";
const positiveId = (value) => {
  if (!/^\d+$/.test(String(value ?? ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeEssayConfig = (value) => {
  if (!isPlainObject(value) || !value.enabled) return null;
  const maxScore = Number(value.maxScore);
  return {
    enabled: true,
    maxScore: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 3,
    prompt: typeof value.prompt === "string" ? value.prompt : "",
  };
};

export const parseQuizDescriptionMetadata = (rawDescription) => {
  if (typeof rawDescription !== "string") return { description: "", essayConfig: null };
  const trimmed = rawDescription.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { description: rawDescription, essayConfig: null };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed) || !("text" in parsed || "essayConfig" in parsed)) {
      return { description: rawDescription, essayConfig: null };
    }
    return {
      description: typeof parsed.text === "string" ? parsed.text : "",
      essayConfig: normalizeEssayConfig(parsed.essayConfig),
    };
  } catch {
    return { description: rawDescription, essayConfig: null };
  }
};

export const publicQuizQuestion = (question, index = 0) => ({
  id: question.id,
  quiz_id: question.quiz_id,
  question_text: question.question_text,
  question_type: questionType(question),
  options: parseJsonArray(question.options_json),
  points: Number(question.points),
  position: index + 1,
  sortOrder: Number(question.sort_order || index + 1),
});

const normalizeAnswerArray = (value) => {
  const parsed = parseStoredAnswer(value);
  if (Array.isArray(parsed)) return parsed.map(String).sort();
  if (typeof parsed === "string") return parsed.split(",").map((item) => item.trim()).filter(Boolean).sort();
  return [];
};

const answersMatch = (question, studentAnswer) => {
  if (isEssayQuestion(question)) return false;
  const correctAnswer = parseStoredAnswer(question.correct_answer);
  if (questionType(question) === "multiple_choice") {
    return JSON.stringify(normalizeAnswerArray(studentAnswer)) === JSON.stringify(normalizeAnswerArray(correctAnswer));
  }
  return String(studentAnswer ?? "").trim().toLocaleLowerCase() === String(correctAnswer ?? "").trim().toLocaleLowerCase();
};

const normalizeAttachment = (attachment, questionId, position) => {
  if (!isPlainObject(attachment)) return null;
  const assetId = positiveId(attachment.assetId ?? attachment.asset_id);
  if (!assetId) return null;
  return {
    assetId,
    id: `asset-${assetId}`,
    name: typeof attachment.name === "string" ? attachment.name.slice(0, 255) : "Bài làm tự luận",
    size: Number.isSafeInteger(Number(attachment.size)) && Number(attachment.size) > 0 ? Number(attachment.size) : null,
    url: `/api/assignments/submission-assets/${assetId}/access`,
    uploadedAt: typeof attachment.uploadedAt === "string" ? attachment.uploadedAt : null,
    questionId,
    questionPosition: position,
  };
};

const normalizeEssayPayload = (value, questionId, position) => {
  if (typeof value === "string") {
    if (value.length > 100000) return { error: "Nội dung tự luận vượt quá giới hạn cho phép" };
    return { payload: { questionId, position, text: value, notes: "", attachments: [] }, assetIds: [] };
  }
  if (!isPlainObject(value)) return { error: "Bài làm tự luận không hợp lệ" };
  const text = typeof value.text === "string" ? value.text : "";
  const notes = typeof value.notes === "string" ? value.notes : "";
  const attachments = Array.isArray(value.attachments) ? value.attachments : [];
  if (text.length > 100000 || notes.length > 10000 || attachments.length > 20) {
    return { error: "Bài làm tự luận vượt quá giới hạn cho phép" };
  }
  const normalizedAttachments = [];
  for (const attachment of attachments) {
    const normalized = normalizeAttachment(attachment, questionId, position);
    if (!normalized) return { error: "Tệp tự luận phải dùng assetId hợp lệ từ hệ thống upload" };
    if (!normalizedAttachments.some((item) => item.assetId === normalized.assetId)) normalizedAttachments.push(normalized);
  }
  return {
    payload: { questionId, position, text, notes, attachments: normalizedAttachments },
    assetIds: normalizedAttachments.map((attachment) => attachment.assetId),
  };
};

const hasEssayWork = (value) => isPlainObject(value)
  && (Boolean(value.text) || Boolean(value.notes) || (Array.isArray(value.attachments) && value.attachments.length > 0));

export const normalizeQuizAnswers = (questions, rawAnswers) => {
  if (!isPlainObject(rawAnswers)) return { error: "answers không hợp lệ", answers: {}, assetIds: [] };
  const positions = new Map(questions.map((question, index) => [String(question.id), index + 1]));
  const questionById = new Map(questions.map((question) => [String(question.id), question]));
  const essayQuestions = questions.filter(isEssayQuestion);
  const normalized = {};
  const essayByQuestion = {};
  const assetIds = [];

  for (const key of Object.keys(rawAnswers)) {
    if (["_essay", "essay", "essayAttachments", "essayNotes"].includes(key)) continue;
    if (key === "_essayGrade" || key === "essayGrade" || key.startsWith("_")) {
      return { error: "Bài làm chứa dữ liệu hệ thống không hợp lệ", answers: {}, assetIds: [] };
    }
    const question = questionById.get(String(key));
    if (!question) return { error: "Bài làm chứa câu hỏi không thuộc đề thi", answers: {}, assetIds: [] };
    const value = rawAnswers[key];
    if (value === undefined || value === null || value === "") continue;
    const options = parseJsonArray(question.options_json).map((option) => String(option.key));
    if (questionType(question) === "multiple_choice") {
      if (!Array.isArray(value) || value.length > options.length || value.some((item) => !options.includes(String(item)))) {
        return { error: "Đáp án nhiều lựa chọn không hợp lệ", answers: {}, assetIds: [] };
      }
      normalized[String(question.id)] = [...new Set(value.map(String))];
    } else if (questionType(question) === "single_choice") {
      if (typeof value !== "string" || !options.includes(value)) {
        return { error: "Đáp án lựa chọn không hợp lệ", answers: {}, assetIds: [] };
      }
      normalized[String(question.id)] = value;
    } else if (isEssayQuestion(question)) {
      const essay = normalizeEssayPayload(value, question.id, positions.get(String(question.id)));
      if (essay.error) return { error: essay.error, answers: {}, assetIds: [] };
      essayByQuestion[String(question.id)] = essay.payload;
      assetIds.push(...essay.assetIds);
      normalized[String(question.id)] = essay.payload.text || essay.payload.notes || null;
    } else if (typeof value !== "string" || value.length > 1000) {
      return { error: "Đáp án điền vào không hợp lệ", answers: {}, assetIds: [] };
    } else {
      normalized[String(question.id)] = value;
    }
  }

  const legacyEssay = rawAnswers._essay ?? rawAnswers.essay
    ?? ((rawAnswers.essayAttachments || rawAnswers.essayNotes) ? { attachments: rawAnswers.essayAttachments, notes: rawAnswers.essayNotes } : null);
  if (isPlainObject(legacyEssay)) {
    const byQuestion = isPlainObject(legacyEssay.byQuestion) ? legacyEssay.byQuestion : {};
    const byPosition = isPlainObject(legacyEssay.byPosition) ? legacyEssay.byPosition : {};
    const essayIds = new Set(essayQuestions.map((question) => String(question.id)));
    const essayPositions = new Set(essayQuestions.map((question) => String(positions.get(String(question.id)))));
    if (Object.keys(byQuestion).some((id) => !essayIds.has(String(id)))
      || Object.keys(byPosition).some((position) => !essayPositions.has(String(position)))) {
      return { error: "Bài làm tự luận được gắn với câu hỏi không hợp lệ", answers: {}, assetIds: [] };
    }
    for (const question of essayQuestions) {
      const id = String(question.id);
      const position = positions.get(id);
      const supplied = byQuestion[id] ?? byPosition[String(position)];
      if (supplied === undefined) continue;
      const essay = normalizeEssayPayload(supplied, question.id, position);
      if (essay.error) return { error: essay.error, answers: {}, assetIds: [] };
      essayByQuestion[id] = essay.payload;
      assetIds.push(...essay.assetIds);
      if (normalized[id] === undefined) normalized[id] = essay.payload.text || essay.payload.notes || null;
    }

    const hasScopedWork = Object.keys(byQuestion).length > 0 || Object.keys(byPosition).length > 0;
    const hasUnscopedWork = !hasScopedWork && hasEssayWork(legacyEssay);
    if (hasUnscopedWork) {
      if (essayQuestions.length === 0) {
        return { error: "Bài làm tự luận không thuộc câu hỏi nào trong đề thi", answers: {}, assetIds: [] };
      }
      // Old clients submitted one shared essay bundle. Preserve those drafts by
      // assigning the bundle to the first authored essay question.
      const question = essayQuestions[0];
      const id = String(question.id);
      const essay = normalizeEssayPayload(legacyEssay, question.id, positions.get(id));
      if (essay.error) return { error: essay.error, answers: {}, assetIds: [] };
      essayByQuestion[id] = essay.payload;
      assetIds.push(...essay.assetIds);
      if (normalized[id] === undefined) normalized[id] = essay.payload.text || essay.payload.notes || null;
    }
  }

  if (Object.keys(essayByQuestion).length > 0) {
    const assetOwners = new Map();
    for (const [id, payload] of Object.entries(essayByQuestion)) {
      for (const attachment of payload.attachments) {
        const existingQuestionId = assetOwners.get(attachment.assetId);
        if (existingQuestionId && existingQuestionId !== id) {
          return { error: "Mỗi tệp tự luận chỉ được gắn với một câu hỏi", answers: {}, assetIds: [] };
        }
        assetOwners.set(attachment.assetId, id);
      }
    }
    const payloads = Object.values(essayByQuestion);
    normalized._essay = {
      byQuestion: essayByQuestion,
      attachments: payloads.flatMap((payload) => payload.attachments),
      notes: payloads.length === 1 ? payloads[0].notes : "",
    };
  }
  return { error: null, answers: normalized, assetIds: [...new Set(assetIds)] };
};

export const getEssaySubmission = (questions, answers) => {
  const raw = answers?._essay || answers?.essay;
  if (!isPlainObject(raw)) return null;
  if (isPlainObject(raw.byQuestion)) return raw;
  const essayQuestions = questions.filter(isEssayQuestion);
  if (essayQuestions.length !== 1 || !hasEssayWork(raw)) return raw;
  const question = essayQuestions[0];
  const position = questions.findIndex((item) => String(item.id) === String(question.id)) + 1;
  return {
    ...raw,
    byQuestion: {
      [String(question.id)]: { questionId: question.id, position, ...raw },
    },
  };
};

export const buildQuizResult = (questions, answers) => {
  const essayGrade = answers?._essayGrade || answers?.essayGrade || null;
  const essay = getEssaySubmission(questions, answers);
  const review = questions.map((question, index) => {
    const essayAnswer = essay?.byQuestion?.[String(question.id)] || null;
    const storedAnswer = answers?.[String(question.id)] ?? answers?.[question.id] ?? null;
    const studentAnswer = isEssayQuestion(question)
      ? (essayAnswer || storedAnswer)
      : storedAnswer;
    const isCorrect = isEssayQuestion(question) ? null : answersMatch(question, studentAnswer);
    const points = Number(question.points) || 0;
    return {
      questionId: question.id,
      position: index + 1,
      sortOrder: Number(question.sort_order || index + 1),
      questionText: question.question_text || question.questionText || "",
      studentAnswer,
      correctAnswer: isEssayQuestion(question) ? null : parseStoredAnswer(question.correct_answer),
      explanation: question.explanation || "",
      points,
      earnedPoints: isCorrect ? points : 0,
      isCorrect,
      questionType: questionType(question),
    };
  });
  let score = review.reduce((sum, item) => sum + item.earnedPoints, 0);
  if (essayGrade && typeof essayGrade.score === "number") score += Number(essayGrade.score) || 0;
  const maxScore = review.reduce((sum, item) => sum + item.points, 0);
  return {
    score: Number(score.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    percentage: maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0,
    review,
    essayGrade,
    essay,
  };
};

export const makeQuestionSnapshot = (questions, shuffleQuestions, randomInt = crypto.randomInt) => {
  const snapshot = questions.map((question) => ({ ...question, options_json: parseJsonArray(question.options_json) }));
  if (!shuffleQuestions) return snapshot;
  const objectiveSlots = snapshot
    .map((question, index) => (isEssayQuestion(question) ? null : index))
    .filter((index) => index !== null);
  const objectiveQuestions = objectiveSlots.map((index) => snapshot[index]);
  for (let index = objectiveQuestions.length - 1; index > 0; index -= 1) {
    const next = randomInt(index + 1);
    [objectiveQuestions[index], objectiveQuestions[next]] = [objectiveQuestions[next], objectiveQuestions[index]];
  }
  objectiveSlots.forEach((slot, index) => {
    snapshot[slot] = objectiveQuestions[index];
  });
  return snapshot;
};
