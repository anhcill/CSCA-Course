import path from "node:path";

export const QUIZ_IMPORT_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export const QUIZ_IMPORT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/octet-stream",
]);

export class QuizDocumentImportError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "QuizDocumentImportError";
    this.code = code;
    this.status = status;
  }
}

export const QUIZ_IMPORT_SCHEMA_VERSION = "1.0";

// This is intentionally kept as a plain JSON value so the vision provider can
// consume it without adding a schema library to the import path.
export const QUIZ_IMPORT_JSON_SCHEMA = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        required: ["questionText", "options"],
        properties: {
          number: { type: ["integer", "null"] },
          type: { type: "string", enum: ["single_choice", "essay"] },
          questionText: { type: "string" },
          questionTextCn: { type: "string" },
          options: { type: "array" },
          correctAnswer: { type: ["string", "null"] },
          explanation: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source: { type: ["object", "null"] },
        },
      },
    },
  },
};

const confidenceValue = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
};

const normalizeStructuredOption = (option, index) => {
  const key = String(option?.key || option?.label || String.fromCharCode(65 + index)).trim().toUpperCase();
  const text = cleanText(option?.text ?? option?.value ?? "");
  return { key, text, textCn: cleanText(option?.textCn), textEn: cleanText(option?.textEn), imageUrl: option?.imageUrl || null };
};

export const normalizeQuizImportStructuredResult = (payload, { languageMode = "auto" } = {}) => {
  const rows = Array.isArray(payload?.questions) ? payload.questions : Array.isArray(payload?.items) ? payload.items : [];
  const items = rows.slice(0, 200).map((row, index) => {
    const options = (Array.isArray(row.options) ? row.options : Array.isArray(row.answers) ? row.answers : [])
      .map(normalizeStructuredOption).filter((option) => option.text).slice(0, 8);
    const correctAnswer = String(row.correctAnswer || row.answer || "").trim().toUpperCase();
    const confidence = confidenceValue(row.confidence, options.length >= 4 && correctAnswer ? 0.9 : 0.55);
    const source = row.source && typeof row.source === "object" ? row.source : {};
    const reviewRequired = Boolean(row.reviewRequired) || confidence < 0.8 || options.length < 2 || (options.length >= 2 && !correctAnswer);
    const questionText = cleanText(row.questionText ?? row.question ?? row.text ?? "");
    const item = {
      id: String(row.id || `import-${row.number || index + 1}`),
      itemType: row.type === "essay" || row.questionType === "essay" ? "essay" : "single_choice",
      kind: "question",
      questionType: row.type === "essay" || row.questionType === "essay" ? "essay" : "single_choice",
      questionText,
      questionTextCn: languageMode === "zh" ? cleanText(row.questionTextCn || row.questionCn || questionText) : cleanText(row.questionTextCn),
      questionTextEn: languageMode === "en" ? cleanText(row.questionTextEn || row.questionEn || questionText) : cleanText(row.questionTextEn),
      answers: options,
      options,
      correctAnswer: options.some((option) => option.key === correctAnswer) ? correctAnswer : "",
      explanation: cleanText(row.explanation),
      explanationCn: cleanText(row.explanationCn),
      explanationEn: cleanText(row.explanationEn),
      points: Number(row.points) > 0 ? Number(row.points) : 1,
      ocrMetadata: {
        source: "document_import",
        schemaVersion: QUIZ_IMPORT_SCHEMA_VERSION,
        sourceQuestionNumber: Number(row.number) || index + 1,
        sourcePage: Number(source.page || row.sourcePage) || null,
        sourceImageUrl: source.imageUrl || row.sourceImageUrl || null,
        confidence,
        reviewRequired,
      },
    };
    return item;
  });
  const reviewRequiredCount = items.filter((item) => item.ocrMetadata.reviewRequired).length;
  return {
    schemaVersion: QUIZ_IMPORT_SCHEMA_VERSION,
    items,
    totalQuestionCount: items.length,
    review: { required: reviewRequiredCount > 0, requiredCount: reviewRequiredCount },
    warnings: reviewRequiredCount ? [`${reviewRequiredCount} câu cần giáo viên kiểm tra lại nội dung hoặc đáp án.`] : [],
  };
};

const cleanText = (value) => String(value || "")
  .replace(/\u0000/g, "")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const fileType = (file) => {
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  return null;
};

export const validateQuizImportFile = (file) => {
  if (!file) throw new QuizDocumentImportError("QUIZ_IMPORT_FILE_REQUIRED", "Cần gửi file PDF hoặc DOCX trong field file");
  if (!file.buffer?.length || file.size > QUIZ_IMPORT_MAX_SIZE_BYTES) {
    throw new QuizDocumentImportError("QUIZ_IMPORT_FILE_TOO_LARGE", "File import không được vượt quá 15 MB", 413);
  }
  if (!QUIZ_IMPORT_MIME_TYPES.has(file.mimetype)) {
    throw new QuizDocumentImportError("QUIZ_IMPORT_FILE_TYPE_NOT_ALLOWED", "Chỉ hỗ trợ PDF hoặc DOCX", 415);
  }
  const type = fileType(file);
  if (!type) throw new QuizDocumentImportError("QUIZ_IMPORT_FILE_TYPE_NOT_ALLOWED", "Chỉ hỗ trợ PDF hoặc DOCX", 415);
  const isPdf = file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const isZip = file.buffer.length >= 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(file.buffer[2]) && [0x04, 0x06, 0x08].includes(file.buffer[3]);
  if ((type === "pdf" && !isPdf) || (type === "docx" && !isZip)) {
    throw new QuizDocumentImportError("QUIZ_IMPORT_FILE_SIGNATURE_INVALID", "Nội dung file không khớp định dạng PDF/DOCX", 415);
  }
  return type;
};

export const extractQuizImportText = async (file) => {
  const type = validateQuizImportFile(file);
  if (type === "pdf") {
    const module = await import("pdf-parse");
    const parsePdf = module.default || module;
    const parsed = await parsePdf(file.buffer);
    return { text: cleanText(parsed.text), pages: parsed.numpages || null, fileType: type, warnings: [] };
  }
  const module = await import("mammoth");
  const mammoth = module.default || module;
  const parsed = await mammoth.extractRawText({ buffer: file.buffer });
  return {
    text: cleanText(parsed.value),
    pages: null,
    fileType: type,
    warnings: Array.isArray(parsed.messages) ? parsed.messages.map((message) => message.message).filter(Boolean) : [],
  };
};

const optionMatch = (line) => line.match(/^([A-H])\s*[.)、:：-]\s*(.+)$/i);
const optionMatches = (line) => {
  // PDF text extraction often removes the gap between `A. value` and `B.`.
  // Match option labels directly, but only treat the line as an option row
  // when it starts with a label to avoid splitting normal question text.
  const markers = [...String(line || "").matchAll(/([A-H])\s*[.)、:：-]\s*/gi)];
  if (markers.length < 2 || markers[0].index !== 0) return [];
  return markers.map((marker, index) => ({
    key: marker[1].toUpperCase(),
    text: line.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? line.length).trim(),
  })).filter((option) => option.text);
};
const questionMatch = (line) => line.match(/^(?:(?:Câu|Question|Q|问题)\s*)?(\d{1,3})\s*[.)、:：-]\s*(.*)$/i)
  || line.match(/^第\s*(\d{1,3})\s*题\s*[.:：、-]?\s*(.*)$/i);
const answerMatch = (line) => line.match(/^(?:Đáp\s*án|Dap\s*an|Answer|答案)\s*[:：-]?\s*([A-H])\b/i);
const explanationMatch = (line) => line.match(/^(?:Lời\s*giải|Loi\s*giai|Giải\s*thích|Giai\s*thich|Explanation|解析|解答|说明)\s*[:：-]?\s*(.*)$/i);

const answerKeyMap = (text) => {
  const map = new Map();
  for (const match of text.matchAll(/(?:^|[\s,;|])(?:Câu\s*)?(\d{1,3})\s*[.):：-]?\s*([A-H])(?=$|[\s,;|])/gim)) {
    map.set(Number(match[1]), match[2].toUpperCase());
  }
  return map;
};

const append = (current, target, text) => {
  const value = String(text || "").trim();
  if (!value) return;
  current[target] = current[target] ? `${current[target]}\n${value}` : value;
};

export const parseQuizImportText = (rawText, { languageMode = "auto" } = {}) => {
  const text = cleanText(rawText);
  if (text.length < 20) throw new QuizDocumentImportError("QUIZ_IMPORT_TEXT_EMPTY", "File không có đủ chữ đọc được", 422);
  const keys = answerKeyMap(text);
  const questions = [];
  let current = null;
  let phase = "questionText";
  let currentOption = null;
  let currentPage = null;

  const flush = () => {
    if (!current) return;
    current.questionText = cleanText(current.questionText);
    current.explanation = cleanText(current.explanation);
    current.options = current.options.map((option) => ({ ...option, text: cleanText(option.text) })).filter((option) => option.text);
    if (current.questionText) questions.push(current);
    current = null;
    currentOption = null;
    phase = "questionText";
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const pageMarker = line.match(/^\[Trang\s+(\d+)\]$/i);
    if (pageMarker) {
      currentPage = Number(pageMarker[1]);
      continue;
    }
    const inlineOptions = optionMatches(line);
    if (inlineOptions.length > 1 && current) {
      for (const option of inlineOptions) {
        currentOption = { ...option, textCn: "", textEn: "", imageUrl: null };
        current.options.push(currentOption);
      }
      phase = "option";
      continue;
    }
    if (!line) continue;
    const option = optionMatch(line);
    if (option && current) {
      currentOption = { key: option[1].toUpperCase(), text: option[2].trim(), textCn: "", textEn: "", imageUrl: null };
      current.options.push(currentOption);
      phase = "option";
      continue;
    }
    const answer = answerMatch(line);
    if (answer && current) {
      current.correctAnswer = answer[1].toUpperCase();
      phase = "answer";
      continue;
    }
    const explanation = explanationMatch(line);
    if (explanation && current) {
      append(current, "explanation", explanation[1]);
      phase = "explanation";
      continue;
    }
    const question = questionMatch(line);
    if (question) {
      flush();
      current = {
        number: Number(question[1]),
        questionText: question[2].trim(),
        options: [],
        correctAnswer: "",
        explanation: "",
        sourcePage: currentPage,
      };
      continue;
    }
    if (!current) continue;
    if (phase === "option" && currentOption) append(currentOption, "text", line);
    else if (phase === "explanation" || phase === "answer") append(current, "explanation", line);
    else append(current, "questionText", line);
  }
  flush();

  const items = questions.slice(0, 200).map((question, index) => {
    const options = question.options.slice(0, 8);
    const allowedKeys = new Set(options.map((option) => option.key));
    const mappedAnswer = question.correctAnswer || keys.get(question.number) || "";
    const correctAnswer = allowedKeys.has(mappedAnswer) ? mappedAnswer : "";
    const confidence = confidenceValue(options.length >= 4 && correctAnswer ? 0.95 : options.length >= 2 ? 0.7 : 0.35, 0.35);
    return {
      id: `import-${question.number || index + 1}`,
      itemType: "single_choice",
      kind: "question",
      questionType: "single_choice",
      questionText: question.questionText,
      questionTextCn: languageMode === "zh" ? question.questionText : "",
      questionTextEn: languageMode === "en" ? question.questionText : "",
      answers: options,
      options,
      correctAnswer,
      explanation: question.explanation,
      explanationCn: "",
      explanationEn: "",
      points: 1,
      ocrMetadata: {
        source: "document_import",
        schemaVersion: QUIZ_IMPORT_SCHEMA_VERSION,
        sourceQuestionNumber: question.number || index + 1,
        sourcePage: question.sourcePage || null,
        confidence,
        reviewRequired: confidence < 0.8,
      },
    };
  });
  if (items.length === 0) {
    throw new QuizDocumentImportError("QUIZ_IMPORT_NO_QUESTIONS", "Không nhận diện được câu hỏi có đánh số trong tài liệu", 422);
  }
  const incompleteCount = items.filter((item) => item.options.length < 2 || !item.correctAnswer).length;
  return {
    items,
    totalQuestionCount: items.length,
    warnings: incompleteCount > 0
      ? [`${incompleteCount} câu chưa đủ lựa chọn hoặc đáp án đúng; vui lòng hoàn thiện trong màn hình review.`]
      : [],
    schemaVersion: QUIZ_IMPORT_SCHEMA_VERSION,
    review: { required: incompleteCount > 0, requiredCount: incompleteCount },
  };
};

export const previewQuizImportFile = async (file, options = {}) => {
  const extracted = await extractQuizImportText(file);
  const runVision = async () => {
    if (options.visionStructuredExtractor) {
      try {
        return await options.visionStructuredExtractor(file, options);
      } catch (error) {
        if (!options.visionExtractor) throw error;
      }
    }
    const visionText = await options.visionExtractor(file, options);
    return parseQuizImportText(visionText, options);
  };
  let parsed;
  try {
    parsed = parseQuizImportText(extracted.text, options);
  } catch (error) {
    if (!options.visionExtractor && !options.visionStructuredExtractor) throw error;
    parsed = await runVision();
    return {
      ...parsed,
      warnings: ["Đã dùng OCR thị giác vì nội dung PDF/DOCX không đọc được ổn định.", ...parsed.warnings],
      source: { fileName: file.originalname, mimeType: file.mimetype, size: file.size, fileType: extracted.fileType, pages: extracted.pages, extractionMode: "vision-fallback" },
    };
  }
  if ((options.visionExtractor || options.visionStructuredExtractor) && options.isExtractionAnomalous?.({ text: extracted.text, parsed })) {
    try {
      const visionParsed = await runVision();
      if (visionParsed.items.length >= parsed.items.length || visionParsed.items.some((item) => (item.options?.length || 0) > 2)) {
        parsed = visionParsed;
        return {
          ...parsed,
          warnings: ["Đã dùng OCR thị giác để khôi phục bố cục câu hỏi.", ...parsed.warnings],
          source: { fileName: file.originalname, mimeType: file.mimetype, size: file.size, fileType: extracted.fileType, pages: extracted.pages, extractionMode: "vision-fallback" },
        };
      }
    } catch (error) {
      parsed.warnings = [...parsed.warnings, `OCR thị giác không khả dụng: ${error.message}`];
    }
  }
  return {
    ...parsed,
    warnings: [...extracted.warnings, ...parsed.warnings],
    source: {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      fileType: extracted.fileType,
      pages: extracted.pages,
      textLength: extracted.text.length,
    },
  };
};

