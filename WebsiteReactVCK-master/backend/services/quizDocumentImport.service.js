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
      ocrMetadata: { source: "document_import", sourceQuestionNumber: question.number || index + 1 },
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
  };
};

export const previewQuizImportFile = async (file, options = {}) => {
  const extracted = await extractQuizImportText(file);
  const parsed = parseQuizImportText(extracted.text, options);
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

