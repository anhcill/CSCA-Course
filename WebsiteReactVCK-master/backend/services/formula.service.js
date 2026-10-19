const SUBJECT_LABELS = Object.freeze({
  MATH: "Toán học CSCA",
  PHYSICS: "Vật lý CSCA",
  CHEMISTRY: "Hóa học CSCA",
});

const TEXT_FIELDS = Object.freeze({
  chapterName: { required: true, max: 255 },
  nameVi: { required: true, max: 255 },
  nameZh: { max: 255 },
  pinyin: { max: 255 },
  latex: { required: true, max: 20000 },
  description: { max: 20000 },
  conditions: { max: 10000 },
  exampleProblem: { max: 20000 },
  exampleSolution: { max: 20000 },
});

export class FormulaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FormulaValidationError";
  }
}

export const parseFormulaId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const readField = (payload, camelName) => {
  if (Object.prototype.hasOwnProperty.call(payload, camelName)) return payload[camelName];
  const snakeName = camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return Object.prototype.hasOwnProperty.call(payload, snakeName) ? payload[snakeName] : undefined;
};

const normalizeVariables = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) {
    throw new FormulaValidationError("variables phải là danh sách tối đa 50 biến số");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new FormulaValidationError(`Biến số ${index + 1} không hợp lệ`);
    }
    const symbol = String(item.symbol || "").trim();
    const meaning = String(item.meaning || "").trim();
    if (!symbol || !meaning) throw new FormulaValidationError(`Biến số ${index + 1} cần đủ ký hiệu và ý nghĩa`);
    if (symbol.length > 100 || meaning.length > 500) {
      throw new FormulaValidationError(`Biến số ${index + 1} vượt quá độ dài cho phép`);
    }
    return { symbol, meaning };
  });
};

export const normalizeFormulaPayload = (payload, { partial = false, defaultChapterName = "" } = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FormulaValidationError("Dữ liệu công thức không hợp lệ");
  }

  const normalized = {};
  for (const [field, rule] of Object.entries(TEXT_FIELDS)) {
    let raw = readField(payload, field);
    if (field === "chapterName" && raw === undefined && !partial && defaultChapterName) raw = defaultChapterName;
    if (raw === undefined) {
      if (!partial && rule.required) throw new FormulaValidationError(`${field} là bắt buộc`);
      continue;
    }
    if (raw !== null && typeof raw !== "string") throw new FormulaValidationError(`${field} phải là chuỗi`);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (rule.required && !value) throw new FormulaValidationError(`${field} là bắt buộc`);
    if (value.length > rule.max) throw new FormulaValidationError(`${field} vượt quá ${rule.max} ký tự`);
    normalized[field] = value || null;
  }

  const rawSubject = readField(payload, "subject");
  if (rawSubject !== undefined || !partial) {
    const subject = String(rawSubject || "MATH").trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(SUBJECT_LABELS, subject)) {
      throw new FormulaValidationError("subject phải là MATH, PHYSICS hoặc CHEMISTRY");
    }
    normalized.subject = subject;
  }

  const variables = normalizeVariables(readField(payload, "variables"));
  if (variables !== undefined) normalized.variables = variables;
  else if (!partial) normalized.variables = [];

  const rawOrder = readField(payload, "orderIndex");
  if (rawOrder !== undefined) {
    const orderIndex = Number(rawOrder);
    if (!Number.isSafeInteger(orderIndex) || orderIndex < 0 || orderIndex > 100000) {
      throw new FormulaValidationError("orderIndex không hợp lệ");
    }
    normalized.orderIndex = orderIndex;
  } else if (!partial) {
    normalized.orderIndex = 0;
  }

  if (partial && Object.keys(normalized).length === 0) {
    throw new FormulaValidationError("Không có trường công thức nào để cập nhật");
  }
  return normalized;
};

export const formulaSubjectLabel = (subject) => SUBJECT_LABELS[subject] || subject;

export const serializeFormula = (row) => ({
  id: String(row.id),
  sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
  classId: row.class_id === null || row.class_id === undefined ? null : String(row.class_id),
  subject: row.subject,
  subjectLabel: formulaSubjectLabel(row.subject),
  chapterName: row.chapter_name,
  nameVi: row.name_vi,
  nameZh: row.name_zh || "",
  pinyin: row.pinyin || "",
  latex: row.latex_expression,
  description: row.description || "",
  variables: Array.isArray(row.variables_explanation) ? row.variables_explanation : [],
  conditions: row.conditions || "",
  exampleProblem: row.example_problem || "",
  exampleSolution: row.example_solution || "",
  orderIndex: Number(row.order_index || 0),
  isStarred: Boolean(row.is_starred),
  personalNote: row.personal_note || "",
  occurrenceCount: Number(row.occurrence_count || 1),
  createdBy: row.created_by === null || row.created_by === undefined ? null : String(row.created_by),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});
