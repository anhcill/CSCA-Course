const MAX_TOP_LEVEL_ITEMS = 200;
const MAX_QUESTIONS = 200;
const MAX_OPTIONS = 8;

export const QUIZ_AUTHORING_QUESTION_TYPES = new Set([
  "single_choice",
  "multiple_choice",
  "true_false",
  "reading_item",
  "fill_blank_item",
  "essay",
  "translation",
]);

export const QUIZ_AUTHORING_GROUP_KINDS = new Set([
  "reading_group",
  "fill_blank_group",
]);

const CHOICE_TYPES = new Set([
  "single_choice",
  "multiple_choice",
  "true_false",
  "reading_item",
]);

const MANUAL_GRADE_TYPES = new Set(["essay", "translation"]);

const GROUP_KIND_TO_TYPE = {
  reading_group: "reading_passage",
  fill_blank_group: "fill_blank_pool",
};

const GROUP_TYPE_TO_KIND = {
  reading_passage: "reading_group",
  fill_blank_pool: "fill_blank_group",
};

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseJson = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const cleanString = (value, maxLength, path, { required = false } = {}) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new QuizAuthoringValidationError(path, "Truong nay khong duoc de trong");
  if (text.length > maxLength) throw new QuizAuthoringValidationError(path, `Noi dung vuot qua ${maxLength} ky tu`);
  return text;
};

const optionalString = (value, maxLength, path) => {
  const text = cleanString(value, maxLength, path);
  return text || null;
};

const normalizeClientId = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 100);
  return null;
};

const normalizePoints = (value, path) => {
  const points = value === undefined || value === null || value === "" ? 1 : Number(value);
  if (!Number.isFinite(points) || points <= 0 || points > 100) {
    throw new QuizAuthoringValidationError(path, "Diem cau hoi phai lon hon 0 va khong vuot qua 100");
  }
  return Number(points.toFixed(2));
};

const normalizeOption = (option, index, path, allowIncomplete) => {
  if (!isPlainObject(option)) throw new QuizAuthoringValidationError(path, "Lua chon khong hop le");
  const defaultKey = String.fromCharCode(65 + index);
  const key = cleanString(option.key || defaultKey, 8, `${path}.key`, { required: true }).toUpperCase();
  const text = cleanString(option.text, 4000, `${path}.text`, { required: !allowIncomplete });
  return {
    key,
    text,
    textCn: cleanString(option.textCn, 4000, `${path}.textCn`),
    textEn: cleanString(option.textEn, 4000, `${path}.textEn`),
    imageUrl: optionalString(option.imageUrl, 2000, `${path}.imageUrl`),
  };
};

const normalizeOptions = (rawOptions, type, path, allowIncomplete) => {
  if (type === "true_false" && (!Array.isArray(rawOptions) || rawOptions.length === 0)) {
    return [
      { key: "A", text: "Dung", textCn: "", textEn: "", imageUrl: null },
      { key: "B", text: "Sai", textCn: "", textEn: "", imageUrl: null },
    ];
  }
  if (!CHOICE_TYPES.has(type)) return [];
  if (!Array.isArray(rawOptions)) {
    if (allowIncomplete) return [];
    throw new QuizAuthoringValidationError(path, "Cau hoi lua chon can danh sach dap an");
  }
  if ((!allowIncomplete && rawOptions.length < 2) || rawOptions.length > MAX_OPTIONS) {
    throw new QuizAuthoringValidationError(path, `Cau hoi can tu 2 den ${MAX_OPTIONS} lua chon`);
  }
  const options = rawOptions.map((option, index) => normalizeOption(option, index, `${path}[${index}]`, allowIncomplete));
  const keys = options.map((option) => option.key);
  if (new Set(keys).size !== keys.length) throw new QuizAuthoringValidationError(path, "Ky hieu lua chon bi trung");
  return options;
};

const normalizeCorrectAnswer = (value, type, options, path, allowIncomplete) => {
  if (MANUAL_GRADE_TYPES.has(type)) return null;
  const optionKeys = new Set(options.map((option) => option.key));
  if (type === "multiple_choice") {
    const raw = Array.isArray(value) ? value : parseJson(value, []);
    const answers = Array.isArray(raw) ? [...new Set(raw.map((item) => String(item).trim().toUpperCase()).filter(Boolean))] : [];
    if (!allowIncomplete && answers.length === 0) throw new QuizAuthoringValidationError(path, "Can chon it nhat mot dap an dung");
    if (answers.some((answer) => !optionKeys.has(answer))) throw new QuizAuthoringValidationError(path, "Dap an dung khong nam trong danh sach lua chon");
    return answers;
  }
  const answer = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
  if (!answer && allowIncomplete) return "";
  if (!answer) throw new QuizAuthoringValidationError(path, "Chua co dap an dung");
  if (CHOICE_TYPES.has(type)) {
    const key = answer.toUpperCase();
    if (!optionKeys.has(key)) throw new QuizAuthoringValidationError(path, "Dap an dung khong nam trong danh sach lua chon");
    return key;
  }
  if (answer.length > 1000) throw new QuizAuthoringValidationError(path, "Dap an vuot qua 1000 ky tu");
  return answer;
};

const normalizeOcrMetadata = (value, path) => {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw new QuizAuthoringValidationError(path, "OCR metadata phai la object");
  const serialized = JSON.stringify(value);
  if (serialized.length > 20000) throw new QuizAuthoringValidationError(path, "OCR metadata qua lon");
  return value;
};

const normalizeQuestion = (question, path, { allowIncomplete = false, groupKind = null } = {}) => {
  if (!isPlainObject(question)) throw new QuizAuthoringValidationError(path, "Cau hoi khong hop le");
  let type = String(question.questionType || question.question_type || "single_choice").trim();
  if (groupKind === "reading_group") type = "reading_item";
  if (groupKind === "fill_blank_group") type = "fill_blank_item";
  if (!QUIZ_AUTHORING_QUESTION_TYPES.has(type)) throw new QuizAuthoringValidationError(`${path}.questionType`, "Loai cau hoi khong duoc ho tro");

  const options = normalizeOptions(question.options ?? question.answers, type, `${path}.options`, allowIncomplete);
  const correctAnswer = normalizeCorrectAnswer(
    question.correctAnswer ?? question.correctAnswerKey ?? question.correct_answer,
    type,
    options,
    `${path}.correctAnswer`,
    allowIncomplete,
  );
  const subQuestionNumber = question.subQuestionNumber === undefined || question.subQuestionNumber === null || question.subQuestionNumber === ""
    ? null
    : Number(question.subQuestionNumber);
  if (subQuestionNumber !== null && (!Number.isSafeInteger(subQuestionNumber) || subQuestionNumber <= 0)) {
    throw new QuizAuthoringValidationError(`${path}.subQuestionNumber`, "So cau con khong hop le");
  }

  return {
    id: normalizeClientId(question.id),
    questionType: type,
    questionText: cleanString(question.questionText ?? question.question_text, 6000, `${path}.questionText`, { required: !allowIncomplete }),
    questionTextCn: cleanString(question.questionTextCn ?? question.question_text_cn, 6000, `${path}.questionTextCn`),
    questionTextEn: cleanString(question.questionTextEn ?? question.question_text_en, 6000, `${path}.questionTextEn`),
    options,
    correctAnswer,
    explanation: cleanString(question.explanation, 12000, `${path}.explanation`),
    explanationCn: cleanString(question.explanationCn ?? question.explanation_cn, 12000, `${path}.explanationCn`),
    explanationEn: cleanString(question.explanationEn ?? question.explanation_en, 12000, `${path}.explanationEn`),
    imageUrl: optionalString(question.imageUrl ?? question.image_url, 2000, `${path}.imageUrl`),
    explanationImageUrl: optionalString(question.explanationImageUrl ?? question.explanation_image_url, 2000, `${path}.explanationImageUrl`),
    subQuestionNumber,
    points: normalizePoints(question.points, `${path}.points`),
    ocrMetadata: normalizeOcrMetadata(question.ocrMetadata ?? question.ocr_metadata, `${path}.ocrMetadata`),
  };
};

const normalizeLinkedOptions = (value, path) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) throw new QuizAuthoringValidationError(path, "Danh sach tu dien khuyet khong hop le");
  return value.map((option, index) => {
    if (!isPlainObject(option)) throw new QuizAuthoringValidationError(`${path}[${index}]`, "Lua chon dien khuyet khong hop le");
    const normalized = {};
    for (const key of ["key", "text", "textCn", "textEn", "blankId", "placeholder"]) {
      if (option[key] !== undefined && option[key] !== null) normalized[key] = cleanString(option[key], 2000, `${path}[${index}].${key}`);
    }
    return normalized;
  });
};

const normalizeGroup = (group, index, { allowIncomplete }) => {
  const path = `items[${index}]`;
  const kind = String(group.kind || "").trim();
  if (!QUIZ_AUTHORING_GROUP_KINDS.has(kind)) throw new QuizAuthoringValidationError(`${path}.kind`, "Loai nhom cau hoi khong hop le");
  const rawQuestions = Array.isArray(group.questions)
    ? group.questions
    : Array.isArray(group.subQuestions)
      ? group.subQuestions
      : Array.isArray(group.subItems)
        ? group.subItems
        : [];
  if (!allowIncomplete && rawQuestions.length === 0) throw new QuizAuthoringValidationError(`${path}.questions`, "Nhom can it nhat mot cau hoi");
  const clozeMode = kind === "fill_blank_group" ? String(group.clozeMode || "passage") : null;
  if (clozeMode && !["sentences", "passage"].includes(clozeMode)) {
    throw new QuizAuthoringValidationError(`${path}.clozeMode`, "Che do dien khuyet khong hop le");
  }
  return {
    id: normalizeClientId(group.id),
    kind,
    passageText: cleanString(group.passageText, 30000, `${path}.passageText`, { required: !allowIncomplete }),
    passageTextCn: cleanString(group.passageTextCn, 30000, `${path}.passageTextCn`),
    passageTextEn: cleanString(group.passageTextEn, 30000, `${path}.passageTextEn`),
    passageImageUrl: optionalString(group.passageImageUrl, 2000, `${path}.passageImageUrl`),
    linkedOptions: kind === "fill_blank_group" ? normalizeLinkedOptions(group.linkedOptions, `${path}.linkedOptions`) : [],
    clozeMode,
    questions: rawQuestions.map((question, questionIndex) => normalizeQuestion(
      question,
      `${path}.questions[${questionIndex}]`,
      { allowIncomplete, groupKind: kind },
    )),
  };
};

export class QuizAuthoringValidationError extends Error {
  constructor(path, message) {
    super(message);
    this.name = "QuizAuthoringValidationError";
    this.path = path;
    this.code = "INVALID_QUIZ_ITEMS";
  }
}

export const normalizeQuizAuthoringItems = (rawItems, { allowIncomplete = false } = {}) => {
  if (!Array.isArray(rawItems)) throw new QuizAuthoringValidationError("items", "Danh sach cau hoi khong hop le");
  if (rawItems.length > MAX_TOP_LEVEL_ITEMS) throw new QuizAuthoringValidationError("items", `De khong duoc vuot qua ${MAX_TOP_LEVEL_ITEMS} muc`);

  const items = rawItems.map((item, index) => {
    if (!isPlainObject(item)) throw new QuizAuthoringValidationError(`items[${index}]`, "Muc de thi khong hop le");
    if (item.kind === "question") {
      return { kind: "question", ...normalizeQuestion(item, `items[${index}]`, { allowIncomplete }) };
    }
    return normalizeGroup(item, index, { allowIncomplete });
  });

  const questionCount = items.reduce((total, item) => total + (item.kind === "question" ? 1 : item.questions.length), 0);
  if (questionCount > MAX_QUESTIONS) throw new QuizAuthoringValidationError("items", `De khong duoc vuot qua ${MAX_QUESTIONS} cau hoi`);
  if (!allowIncomplete && questionCount === 0) throw new QuizAuthoringValidationError("items", "De can it nhat mot cau hoi");
  const maxScore = items.reduce(
    (total, item) => total + (item.kind === "question" ? item.points : item.questions.reduce((sum, question) => sum + question.points, 0)),
    0,
  );
  return { items, questionCount, maxScore: Number(maxScore.toFixed(2)) };
};

export const flattenQuizAuthoringItems = (rawItems, options = {}) => {
  const normalized = normalizeQuizAuthoringItems(rawItems, options);
  const groups = [];
  const questions = [];
  let questionOrder = 1;

  normalized.items.forEach((item, itemIndex) => {
    const itemOrder = itemIndex + 1;
    if (item.kind === "question") {
      questions.push({ ...item, groupClientId: null, itemOrder, sortOrder: questionOrder });
      questionOrder += 1;
      return;
    }
    const groupClientId = item.id || `group-${groups.length + 1}`;
    groups.push({
      id: item.id,
      clientId: groupClientId,
      kind: item.kind,
      groupType: GROUP_KIND_TO_TYPE[item.kind],
      passageText: item.passageText,
      passageTextCn: item.passageTextCn,
      passageTextEn: item.passageTextEn,
      passageImageUrl: item.passageImageUrl,
      linkedOptions: item.linkedOptions,
      clozeMode: item.clozeMode,
      sortOrder: itemOrder,
    });
    item.questions.forEach((question) => {
      questions.push({ ...question, groupClientId, itemOrder, sortOrder: questionOrder });
      questionOrder += 1;
    });
  });

  return { ...normalized, groups, questions };
};

const storedCorrectAnswer = (question) => {
  const value = parseJson(question.correct_answer, question.correct_answer);
  return question.question_type === "multiple_choice" && !Array.isArray(value) ? [] : value;
};

const rowToQuestion = (row, { includeAnswers }) => {
  const question = {
    id: row.id,
    questionType: row.question_type,
    questionText: row.question_text || "",
    questionTextCn: row.question_text_cn || "",
    questionTextEn: row.question_text_en || "",
    options: Array.isArray(parseJson(row.options_json, [])) ? parseJson(row.options_json, []) : [],
    points: Number(row.points || 0),
    imageUrl: row.image_url || null,
    explanationImageUrl: row.explanation_image_url || null,
    subQuestionNumber: row.sub_question_number === null || row.sub_question_number === undefined ? null : Number(row.sub_question_number),
    ocrMetadata: isPlainObject(parseJson(row.ocr_metadata, {})) ? parseJson(row.ocr_metadata, {}) : {},
  };
  if (includeAnswers) {
    question.correctAnswer = storedCorrectAnswer(row);
    question.explanation = row.explanation || "";
    question.explanationCn = row.explanation_cn || "";
    question.explanationEn = row.explanation_en || "";
  }
  return question;
};

export const reconstructQuizAuthoringItems = (groupRows, questionRows, { includeAnswers = true } = {}) => {
  const groups = new Map();
  const topLevel = [];
  for (const row of groupRows || []) {
    const kind = GROUP_TYPE_TO_KIND[row.group_type];
    if (!kind) continue;
    const item = {
      id: row.id,
      kind,
      passageText: row.passage_text || "",
      passageTextCn: row.passage_text_cn || "",
      passageTextEn: row.passage_text_en || "",
      passageImageUrl: row.passage_image_url || null,
      linkedOptions: Array.isArray(parseJson(row.linked_options, [])) ? parseJson(row.linked_options, []) : [],
      clozeMode: row.cloze_mode || (kind === "fill_blank_group" ? "passage" : null),
      questions: [],
    };
    groups.set(String(row.id), item);
    topLevel.push({ order: Number(row.sort_order), tie: Number(row.id), item });
  }

  for (const row of questionRows || []) {
    const question = rowToQuestion(row, { includeAnswers });
    const group = row.group_id === null || row.group_id === undefined ? null : groups.get(String(row.group_id));
    if (group) group.questions.push(question);
    else topLevel.push({ order: Number(row.item_order || row.sort_order), tie: Number(row.id), item: { kind: "question", ...question } });
  }

  return topLevel
    .sort((left, right) => left.order - right.order || left.tie - right.tie)
    .map(({ item }) => item);
};
