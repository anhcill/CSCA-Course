const FIELD_RULES = Object.freeze({
  term: { required: true, max: 100 },
  pinyin: { max: 100 },
  sinoVietnamese: { max: 100 },
  meaning: { required: true, max: 3000 },
  partOfSpeech: { max: 50 },
  exampleSentence: { max: 5000 },
  exampleMeaning: { max: 5000 },
  audioUrl: { max: 500 },
});

export class VocabularyValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VocabularyValidationError";
  }
}

export const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const readField = (payload, camelName) => {
  if (Object.prototype.hasOwnProperty.call(payload, camelName)) return payload[camelName];
  const snakeName = camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return Object.prototype.hasOwnProperty.call(payload, snakeName) ? payload[snakeName] : undefined;
};

export const normalizeVocabularyPayload = (payload, { partial = false } = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new VocabularyValidationError("Dữ liệu từ vựng không hợp lệ");
  }

  const normalized = {};
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const raw = readField(payload, field);
    if (raw === undefined) {
      if (!partial && rule.required) throw new VocabularyValidationError(`${field} là bắt buộc`);
      continue;
    }
    if (raw !== null && typeof raw !== "string") throw new VocabularyValidationError(`${field} phải là chuỗi`);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (rule.required && !value) throw new VocabularyValidationError(`${field} là bắt buộc`);
    if (value.length > rule.max) throw new VocabularyValidationError(`${field} vượt quá ${rule.max} ký tự`);
    if (field === "audioUrl" && value && !/^https?:\/\//i.test(value) && !value.startsWith("/")) {
      throw new VocabularyValidationError("audioUrl không hợp lệ");
    }
    normalized[field] = value || null;
  }

  const rawOrder = readField(payload, "orderIndex");
  if (rawOrder !== undefined) {
    const orderIndex = Number(rawOrder);
    if (!Number.isSafeInteger(orderIndex) || orderIndex < 0 || orderIndex > 100000) {
      throw new VocabularyValidationError("orderIndex không hợp lệ");
    }
    normalized.orderIndex = orderIndex;
  } else if (!partial) {
    normalized.orderIndex = 0;
  }

  if (partial && Object.keys(normalized).length === 0) {
    throw new VocabularyValidationError("Không có trường từ vựng nào để cập nhật");
  }
  return normalized;
};

export const normalizeVocabularyIdList = (value, fieldName) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) {
    throw new VocabularyValidationError(`${fieldName} phải là danh sách tối đa 500 phần tử`);
  }
  const ids = value.map(parsePositiveId);
  if (ids.some((id) => id === null)) throw new VocabularyValidationError(`${fieldName} chứa ID không hợp lệ`);
  return [...new Set(ids)];
};

export const serializeVocabulary = (row) => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  classId: String(row.class_id),
  term: row.term,
  pinyin: row.pinyin || "",
  sinoVietnamese: row.sino_vietnamese || "",
  meaning: row.meaning,
  partOfSpeech: row.part_of_speech || "",
  exampleSentence: row.example_sentence || "",
  exampleMeaning: row.example_meaning || "",
  audioUrl: row.audio_url || null,
  orderIndex: Number(row.order_index || 0),
  status: row.progress_status || "new",
  correctCount: Number(row.correct_count || 0),
  incorrectCount: Number(row.incorrect_count || 0),
  isStarred: Boolean(row.is_starred),
  lastPracticedAt: row.last_practiced_at || null,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

export const formatVietnamSessionDate = (value) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value)).replace(",", " •");
};

export const vietnamDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
}).format(value);
