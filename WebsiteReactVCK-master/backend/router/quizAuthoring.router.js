import express from "express";
import multer from "multer";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { assertGradebookOpen } from "../services/lmsWorkflow.service.js";
import { broadcastToClass } from "../services/notification.service.js";
import {
  QuizAuthoringValidationError,
  flattenQuizAuthoringItems,
  normalizeQuizAuthoringItems,
  reconstructQuizAuthoringItems,
} from "../services/quizAuthoring.service.js";
import { QuizOcrError, extractQuizImageOcrText } from "../services/quizOcr.service.js";
import {
  QUIZ_IMPORT_MAX_SIZE_BYTES,
  QUIZ_IMPORT_MIME_TYPES,
  QuizDocumentImportError,
  previewQuizImportFile,
} from "../services/quizDocumentImport.service.js";

const MAX_OCR_IMAGE_SIZE = 8 * 1024 * 1024;
const OCR_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REVIEW_POLICIES = new Set(["after_submit", "after_close", "never"]);
const ACTIVITY_SCOPES = new Set(["session", "homework"]);
const QUIZ_STATUSES = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);

class QuizAuthoringHttpError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "QuizAuthoringHttpError";
    this.status = status;
    this.code = code;
    Object.assign(this, details);
  }
}

const httpError = (status, code, message, details) => new QuizAuthoringHttpError(status, code, message, details);

const parsePositiveId = (value, field, { optional = false } = {}) => {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (!/^\d+$/.test(String(value || ""))) throw httpError(400, "VALIDATION_ERROR", `${field} không hợp lệ`, { path: field });
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw httpError(400, "VALIDATION_ERROR", `${field} không hợp lệ`, { path: field });
  return parsed;
};

const finiteNumber = (value, fallback, field, { min, max, integer = false }) => {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < min || number > max) {
    throw httpError(400, "VALIDATION_ERROR", `${field} không hợp lệ`, { path: field });
  }
  return number;
};

const optionalDate = (value, field) => {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : value;
  const vietnamLocalDateTime = typeof text === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text);
  const parsed = new Date(vietnamLocalDateTime ? `${text}+07:00` : text);
  if (Number.isNaN(parsed.getTime())) throw httpError(400, "VALIDATION_ERROR", `${field} không hợp lệ`, { path: field });
  return parsed;
};

const boundedText = (value, fallback, field, maxLength, { required = false } = {}) => {
  const text = value === undefined ? String(fallback || "") : typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > maxLength) {
    throw httpError(400, "VALIDATION_ERROR", `${field} không hợp lệ`, { path: field });
  }
  return text;
};

const metadataFromRow = (row) => ({
  title: row.title,
  description: row.description || "",
  courseId: row.course_id,
  liveClassId: row.live_class_id,
  classSessionId: row.class_session_id,
  activityScope: row.activity_scope,
  durationMinutes: row.duration_minutes,
  passingScore: row.passing_score,
  attemptLimit: row.attempt_limit,
  availableFrom: row.available_from,
  availableUntil: row.available_until,
  dueDate: row.due_date,
  reviewPolicy: row.review_policy,
  shuffleQuestions: row.shuffle_questions,
  status: row.status,
});

export const normalizeQuizMetadata = (payload, {
  existing = {},
  requireComplete = false,
  requireFutureDueDate = false,
} = {}) => {
  const source = { ...metadataFromRow(existing), ...(payload || {}) };
  const activityScope = String(source.activityScope || "session").trim();
  const reviewPolicy = String(source.reviewPolicy || "after_submit").trim();
  if (!ACTIVITY_SCOPES.has(activityScope)) throw httpError(400, "VALIDATION_ERROR", "activityScope không hợp lệ", { path: "activityScope" });
  if (!REVIEW_POLICIES.has(reviewPolicy)) throw httpError(400, "VALIDATION_ERROR", "reviewPolicy không hợp lệ", { path: "reviewPolicy" });

  const courseId = parsePositiveId(source.courseId, "courseId", { optional: true });
  const liveClassId = parsePositiveId(source.liveClassId, "liveClassId", { optional: true });
  const classSessionId = parsePositiveId(source.classSessionId, "classSessionId", { optional: true });
  if (Boolean(liveClassId) !== Boolean(classSessionId)) {
    throw httpError(400, "VALIDATION_ERROR", "Lớp và buổi học phải được chọn cùng nhau", { path: "liveClassId" });
  }
  if ((liveClassId || classSessionId) && !courseId) {
    throw httpError(400, "VALIDATION_ERROR", "Cần chọn khóa học trước khi chọn lớp và buổi học", { path: "courseId" });
  }
  if (requireComplete && (!courseId || !liveClassId || !classSessionId)) {
    throw httpError(400, "VALIDATION_ERROR", "Đề phải được gắn với khóa học, lớp và buổi học trước khi xuất bản");
  }

  const availableFrom = optionalDate(source.availableFrom, "availableFrom");
  const availableUntil = optionalDate(source.availableUntil, "availableUntil");
  const dueDate = activityScope === "homework" ? optionalDate(source.dueDate, "dueDate") : null;
  if (availableFrom && availableUntil && availableUntil <= availableFrom) {
    throw httpError(400, "VALIDATION_ERROR", "Thời gian đóng đề phải sau thời gian mở", { path: "availableUntil" });
  }
  if (requireComplete && activityScope === "homework" && !dueDate) {
    throw httpError(400, "VALIDATION_ERROR", "Bài tập về nhà cần có hạn nộp", { path: "dueDate" });
  }
  if (requireFutureDueDate && dueDate && dueDate.getTime() <= Date.now()) {
    throw httpError(400, "VALIDATION_ERROR", "Hạn nộp bài tập về nhà phải ở tương lai", { path: "dueDate" });
  }
  if (dueDate && availableUntil && availableUntil > dueDate) {
    throw httpError(400, "VALIDATION_ERROR", "Thời gian đóng đề không thể sau hạn nộp", { path: "availableUntil" });
  }

  const status = String(source.status || existing.status || "DRAFT").toUpperCase();
  if (!QUIZ_STATUSES.has(status)) throw httpError(400, "VALIDATION_ERROR", "status không hợp lệ", { path: "status" });
  return {
    title: boundedText(source.title, "", "title", 255, { required: true }),
    description: boundedText(source.description, "", "description", 50000),
    courseId,
    liveClassId,
    classSessionId,
    activityScope,
    durationMinutes: finiteNumber(source.durationMinutes, 30, "durationMinutes", { min: 1, max: 240, integer: true }),
    passingScore: finiteNumber(source.passingScore, 60, "passingScore", { min: 0, max: 100 }),
    attemptLimit: finiteNumber(source.attemptLimit, 1, "attemptLimit", { min: 1, max: 5, integer: true }),
    availableFrom,
    availableUntil,
    dueDate,
    reviewPolicy,
    shuffleQuestions: source.shuffleQuestions === undefined ? true : Boolean(source.shuffleQuestions),
    status,
  };
};

const serializeQuiz = (row, items = undefined) => ({
  id: String(row.id),
  title: row.title,
  description: row.description || "",
  courseId: row.course_id ? String(row.course_id) : null,
  courseTitle: row.course_title || null,
  liveClassId: row.live_class_id ? String(row.live_class_id) : null,
  classTitle: row.class_title || null,
  classSessionId: row.class_session_id ? String(row.class_session_id) : null,
  sessionTitle: row.session_title || null,
  activityScope: row.activity_scope || "session",
  durationMinutes: Number(row.duration_minutes || 0),
  passingScore: Number(row.passing_score || 0),
  attemptLimit: Number(row.attempt_limit || 1),
  availableFrom: row.available_from || null,
  availableUntil: row.available_until || null,
  dueDate: row.due_date || null,
  reviewPolicy: row.review_policy || "after_submit",
  shuffleQuestions: Boolean(row.shuffle_questions),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(items === undefined ? {} : { items }),
});

const isAssignedTeacher = async (db, classId, userId) => Boolean((await db.query(
  `SELECT 1 FROM live_classes lc WHERE lc.id = $1 AND
   (EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id = lc.id
      AND ct.teacher_id = $2 AND ct.status = 'active') OR
    lc.instructor_id = $2 AND NOT EXISTS (SELECT 1 FROM class_teachers ct
      WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2))`,
  [classId, userId],
)).rows[0]);

const canManageQuiz = async (db, quiz, user) => {
  if (user.role === "admin") return true;
  if (user.role !== "creator") return false;
  if (String(quiz.instructor_id) !== String(user.id) && String(quiz.author_id) !== String(user.id)) return false;
  return !quiz.live_class_id || isAssignedTeacher(db, quiz.live_class_id, user.id);
};

const quizSelect = `SELECT q.*, c.author_id, COALESCE(c.title, c.name) AS course_title,
  lc.title AS class_title, cs.title AS session_title,
  EXISTS (
    SELECT 1 FROM quiz_attempts qa
    JOIN users attempt_user ON attempt_user.id = qa.user_id
    WHERE qa.quiz_id = q.id AND COALESCE(attempt_user.is_internal_test_account, FALSE) = FALSE
  ) AS has_attempts
  FROM quizzes q
  LEFT JOIN courses c ON c.id = q.course_id
  LEFT JOIN live_classes lc ON lc.id = q.live_class_id
  LEFT JOIN class_sessions cs ON cs.id = q.class_session_id`;

const loadQuiz = async (db, quizId, { lock = false } = {}) => (await db.query(
  `${quizSelect} WHERE q.id = $1${lock ? " FOR UPDATE OF q" : ""}`,
  [quizId],
)).rows[0] || null;

const assertQuizAccess = async (db, quiz, user) => {
  if (!(await canManageQuiz(db, quiz, user))) throw httpError(403, "FORBIDDEN", "Bạn không có quyền chỉnh sửa đề này");
};

const validateTarget = async (db, metadata, user, { requireOpenSession = false } = {}) => {
  if (!metadata.courseId) return null;
  const course = (await db.query("SELECT id, author_id FROM courses WHERE id = $1", [metadata.courseId])).rows[0];
  if (!course) throw httpError(404, "NOT_FOUND", "Không tìm thấy khóa học");
  if (!metadata.liveClassId) {
    if (user.role !== "admin" && String(course.author_id) !== String(user.id)) {
      throw httpError(403, "FORBIDDEN", "Bạn không có quyền tạo đề cho khóa học này");
    }
    return null;
  }

  const target = (await db.query(
    `SELECT cs.id, cs.status, cs.start_time, cs.end_time, lc.id AS live_class_id, lc.status AS live_class_status
     FROM class_sessions cs
     JOIN live_classes lc ON lc.id = cs.live_class_id
     WHERE cs.id = $1 AND lc.id = $2 AND lc.course_id = $3`,
    [metadata.classSessionId, metadata.liveClassId, metadata.courseId],
  )).rows[0];
  if (!target) throw httpError(400, "VALIDATION_ERROR", "Buổi học không thuộc lớp hoặc khóa học đã chọn");
  if (user.role !== "admin" && !(await isAssignedTeacher(db, metadata.liveClassId, user.id))) {
    throw httpError(403, "FORBIDDEN", "Bạn không phụ trách lớp hoặc buổi học này");
  }
  if (requireOpenSession && (target.live_class_status !== "active"
    || !["scheduled", "live", "rescheduled"].includes(target.status)
    || new Date(target.end_time).getTime() <= Date.now())) {
    throw httpError(409, "QUIZ_SESSION_CLOSED", "Không thể xuất bản đề cho buổi học đã kết thúc hoặc đã hủy");
  }
  return target;
};

const resolveSchedule = (metadata, target) => {
  const result = { ...metadata };
  if (!target) return result;
  if (!result.availableFrom) result.availableFrom = result.activityScope === "session" ? new Date(target.start_time) : new Date();
  if (!result.availableUntil) {
    result.availableUntil = result.activityScope === "homework" && result.dueDate
      ? new Date(result.dueDate)
      : new Date(target.end_time);
  }
  if (result.availableUntil <= result.availableFrom) {
    throw httpError(400, "VALIDATION_ERROR", "Thời gian đóng đề phải sau thời gian mở", { path: "availableUntil" });
  }
  if (result.dueDate && result.availableUntil > result.dueDate) {
    throw httpError(400, "VALIDATION_ERROR", "Thời gian đóng đề không thể sau hạn nộp", { path: "availableUntil" });
  }
  return result;
};

const fetchItems = async (db, quizId, options = {}) => {
  const [groups, questions] = await Promise.all([
    db.query("SELECT * FROM quiz_question_groups WHERE quiz_id = $1 ORDER BY sort_order, id", [quizId]),
    db.query("SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY sort_order, id", [quizId]),
  ]);
  return reconstructQuizAuthoringItems(groups.rows, questions.rows, options);
};

const storedAnswer = (answer) => Array.isArray(answer) ? JSON.stringify(answer) : String(answer ?? "");

const replaceItems = async (db, quizId, rawItems, { allowIncomplete }) => {
  const flattened = flattenQuizAuthoringItems(rawItems, { allowIncomplete });
  await db.query("DELETE FROM quiz_questions WHERE quiz_id = $1", [quizId]);
  await db.query("DELETE FROM quiz_question_groups WHERE quiz_id = $1", [quizId]);
  const groupIds = new Map();
  for (const group of flattened.groups) {
    const result = await db.query(
      `INSERT INTO quiz_question_groups
       (quiz_id, group_type, passage_text, passage_text_cn, passage_text_en, passage_image_url, linked_options, cloze_mode, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING id`,
      [quizId, group.groupType, group.passageText, group.passageTextCn || null, group.passageTextEn || null,
        group.passageImageUrl, JSON.stringify(group.linkedOptions), group.clozeMode, group.sortOrder],
    );
    groupIds.set(String(group.clientId), result.rows[0].id);
  }
  for (const question of flattened.questions) {
    const groupId = question.groupClientId ? groupIds.get(String(question.groupClientId)) : null;
    await db.query(
      `INSERT INTO quiz_questions
       (quiz_id, group_id, item_order, question_text, question_text_cn, question_text_en, question_type,
        options_json, correct_answer, explanation, explanation_cn, explanation_en, image_url,
        explanation_image_url, sub_question_number, ocr_metadata, points, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18)`,
      [quizId, groupId, question.itemOrder, question.questionText, question.questionTextCn || null,
        question.questionTextEn || null, question.questionType, JSON.stringify(question.options),
        storedAnswer(question.correctAnswer), question.explanation || null, question.explanationCn || null,
        question.explanationEn || null, question.imageUrl, question.explanationImageUrl,
        question.subQuestionNumber, JSON.stringify(question.ocrMetadata), question.points, question.sortOrder],
    );
  }
  await db.query("UPDATE quizzes SET updated_at = NOW() WHERE id = $1", [quizId]);
  return flattened;
};

const attemptProtectedMetadataChanged = (before, after) => [
  [before.course_id, after.courseId],
  [before.live_class_id, after.liveClassId],
  [before.class_session_id, after.classSessionId],
  [before.activity_scope, after.activityScope],
  [Number(before.duration_minutes), after.durationMinutes],
  [Number(before.passing_score), after.passingScore],
  [Number(before.attempt_limit), after.attemptLimit],
  [before.review_policy, after.reviewPolicy],
  [Boolean(before.shuffle_questions), after.shuffleQuestions],
  [before.available_from ? new Date(before.available_from).toISOString() : null, after.availableFrom?.toISOString() || null],
  [before.available_until ? new Date(before.available_until).toISOString() : null, after.availableUntil?.toISOString() || null],
  [before.due_date ? new Date(before.due_date).toISOString() : null, after.dueDate?.toISOString() || null],
].some(([left, right]) => String(left ?? "") !== String(right ?? ""));

const sendError = (res, error, fallbackMessage = "Lỗi khi xử lý đề kiểm tra") => {
  if (error instanceof QuizAuthoringValidationError) {
    return res.status(400).json({ success: false, message: error.message, errorCode: error.code, path: error.path });
  }
  if (error instanceof QuizAuthoringHttpError || error instanceof QuizOcrError) {
    if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
    return res.status(error.status).json({
      success: false,
      message: error.message,
      errorCode: error.code,
      ...(error.path ? { path: error.path } : {}),
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, message: fallbackMessage, errorCode: "INTERNAL_ERROR" });
};

export const validateQuizOcrImage = (file) => {
  if (!file) throw httpError(400, "OCR_IMAGE_REQUIRED", "Cần gửi ảnh câu hỏi trong field image");
  if (!OCR_IMAGE_MIME_TYPES.has(file.mimetype)) throw httpError(415, "OCR_IMAGE_TYPE_NOT_ALLOWED", "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP");
  if (!file.buffer?.length || file.size > MAX_OCR_IMAGE_SIZE) throw httpError(413, "OCR_IMAGE_TOO_LARGE", "Ảnh OCR không được vượt quá 8 MB");
  const buffer = file.buffer;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const valid = (file.mimetype === "image/jpeg" && isJpeg)
    || (file.mimetype === "image/png" && isPng)
    || (file.mimetype === "image/webp" && isWebp);
  if (!valid) throw httpError(415, "OCR_IMAGE_SIGNATURE_INVALID", "Nội dung tệp không khớp định dạng ảnh đã khai báo");
  return file;
};

export const createQuizOcrRateLimiter = ({
  windowMs = Number.parseInt(process.env.QUIZ_OCR_RATE_LIMIT_WINDOW_MS || "60000", 10),
  max = Number.parseInt(process.env.QUIZ_OCR_RATE_LIMIT_MAX || "10", 10),
  now = Date.now,
} = {}) => {
  const buckets = new Map();
  return (req, res, next) => {
    const current = now();
    const key = `${req.user?.id || "anonymous"}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, message: "Bạn gửi OCR quá nhanh. Vui lòng thử lại sau.", errorCode: "OCR_RATE_LIMITED", retryAfter });
    }
    bucket.count += 1;
    return next();
  };
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_OCR_IMAGE_SIZE, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!OCR_IMAGE_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("OCR_IMAGE_TYPE_NOT_ALLOWED");
      error.code = "OCR_IMAGE_TYPE_NOT_ALLOWED";
      return callback(error);
    }
    return callback(null, true);
  },
});

const uploadSingleImage = (req, res, next) => upload.single("image")(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, message: "Ảnh OCR không được vượt quá 8 MB", errorCode: "OCR_IMAGE_TOO_LARGE" });
  }
  if (error.code === "OCR_IMAGE_TYPE_NOT_ALLOWED") {
    return res.status(415).json({ success: false, message: "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP", errorCode: error.code });
  }
  return res.status(400).json({ success: false, message: "Dữ liệu upload không hợp lệ", errorCode: "OCR_UPLOAD_INVALID" });
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: QUIZ_IMPORT_MAX_SIZE_BYTES, files: 2 },
  fileFilter: (req, file, callback) => {
    if (!QUIZ_IMPORT_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("QUIZ_IMPORT_FILE_TYPE_NOT_ALLOWED");
      error.code = "QUIZ_IMPORT_FILE_TYPE_NOT_ALLOWED";
      return callback(error);
    }
    return callback(null, true);
  },
});

const uploadImportDocument = (req, res, next) => importUpload.fields([
  { name: "file", maxCount: 1 },
  { name: "document", maxCount: 1 },
])(req, res, (error) => {
  if (!error) {
    req.file = req.files?.file?.[0] || req.files?.document?.[0] || null;
    return next();
  }
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, message: "File import không được vượt quá 15 MB", errorCode: "QUIZ_IMPORT_FILE_TOO_LARGE" });
  }
  if (error.code === "QUIZ_IMPORT_FILE_TYPE_NOT_ALLOWED") {
    return res.status(415).json({ success: false, message: "Chỉ hỗ trợ PDF hoặc DOCX", errorCode: error.code });
  }
  return res.status(400).json({ success: false, message: "Dữ liệu upload import không hợp lệ", errorCode: "QUIZ_IMPORT_UPLOAD_INVALID" });
});

const requestAbortSignal = (req, res) => {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  const close = () => {
    if (!res.writableEnded) abort();
  };
  req.once("aborted", abort);
  res.once("close", close);
  res.once("finish", () => {
    req.off("aborted", abort);
    res.off("close", close);
  });
  return controller.signal;
};

const authoringEnabled = (req, res, next) => {
  if (String(process.env.MOLI_QUIZ_AUTHORING_ENABLED ?? "true").toLowerCase() === "true") return next();
  // Let the legacy assignment router keep serving its existing create/delete flow.
  return next("route");
};

// The existing teacher builder still posts the flat `questions` contract,
// while the MOLI editor posts structured `items`. Let the legacy router own
// flat payloads so both editors can share the public endpoint safely.
export const usesLegacyQuizCreateContract = (payload) => (
  Array.isArray(payload?.questions) && !Array.isArray(payload?.items)
);

export const createQuizAuthoringRouter = ({
  db = { query, getClient },
  authMiddlewares = [protectRoute, requireTeacher, requirePermission("lms.quiz.manage")],
  ocrExtractor = extractQuizImageOcrText,
  ocrRateLimiter = createQuizOcrRateLimiter(),
} = {}) => {
  const router = express.Router();
  const secured = [...authMiddlewares, authoringEnabled];

  router.get("/teacher/quizzes/:quizId/editor", ...secured, async (req, res) => {
    try {
      const quizId = parsePositiveId(req.params.quizId, "quizId");
      const quiz = await loadQuiz(db, quizId);
      if (!quiz) throw httpError(404, "NOT_FOUND", "Không tìm thấy đề kiểm tra");
      await assertQuizAccess(db, quiz, req.user);
      const items = await fetchItems(db, quizId, { includeAnswers: true });
      return res.json({ success: true, data: serializeQuiz(quiz, items) });
    } catch (error) {
      return sendError(res, error, "Không thể tải dữ liệu chỉnh sửa đề");
    }
  });

  router.post("/teacher/quizzes", ...secured, async (req, res, next) => {
    if (usesLegacyQuizCreateContract(req.body)) return next("route");
    const client = await db.getClient();
    let committed = false;
    try {
      const requestedStatus = String(req.body?.status || "DRAFT").toUpperCase();
      if (!new Set(["DRAFT", "PUBLISHED"]).has(requestedStatus)) throw httpError(400, "VALIDATION_ERROR", "Trạng thái tạo đề không hợp lệ", { path: "status" });
      const metadata = normalizeQuizMetadata({ ...req.body, status: requestedStatus }, {
        requireComplete: requestedStatus === "PUBLISHED",
        requireFutureDueDate: requestedStatus === "PUBLISHED",
      });
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const flattened = flattenQuizAuthoringItems(rawItems, { allowIncomplete: requestedStatus === "DRAFT" });

      await client.query("BEGIN");
      const target = await validateTarget(client, metadata, req.user, { requireOpenSession: requestedStatus === "PUBLISHED" });
      const scheduled = resolveSchedule(metadata, target);
      if (scheduled.liveClassId) await assertGradebookOpen(client, scheduled.liveClassId);
      const result = await client.query(
        `INSERT INTO quizzes
         (title, description, course_id, live_class_id, class_session_id, activity_scope, due_date,
          duration_minutes, passing_score, status, shuffle_questions, instructor_id, attempt_limit,
          available_from, available_until, review_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [scheduled.title, scheduled.description, scheduled.courseId, scheduled.liveClassId, scheduled.classSessionId,
          scheduled.activityScope, scheduled.dueDate?.toISOString() || null, scheduled.durationMinutes,
          scheduled.passingScore, requestedStatus, scheduled.shuffleQuestions, req.user.id, scheduled.attemptLimit,
          scheduled.availableFrom?.toISOString() || null, scheduled.availableUntil?.toISOString() || null,
          scheduled.reviewPolicy],
      );
      await replaceItems(client, result.rows[0].id, rawItems, { allowIncomplete: requestedStatus === "DRAFT" });
      await recordAuditEvent({
        db: client,
        actorId: req.user.id,
        action: "quiz.created",
        entityType: "quiz",
        entityId: result.rows[0].id,
        afterState: result.rows[0],
        metadata: { ip: req.ip, questionCount: flattened.questionCount, source: "moli_authoring" },
      });
      await client.query("COMMIT");
      committed = true;

      if (requestedStatus === "PUBLISHED" && scheduled.liveClassId) {
        broadcastToClass({
          liveClassId: scheduled.liveClassId,
          title: `Quiz mới: ${scheduled.title}`,
          message: scheduled.activityScope === "homework" ? "Bạn có bài tập về nhà mới." : "Bài trên lớp đã sẵn sàng.",
          eventType: "quiz.published",
          linkUrl: `/lms/quiz/${result.rows[0].id}`,
          data: { quizId: result.rows[0].id, courseId: scheduled.courseId, liveClassId: scheduled.liveClassId, classSessionId: scheduled.classSessionId },
          actorId: req.user.id,
          dedupePrefix: `quiz:${result.rows[0].id}:published`,
        }).catch((error) => console.error("Quiz publish notification warning:", error.message));
      }

      const created = await loadQuiz(db, result.rows[0].id);
      const items = await fetchItems(db, result.rows[0].id, { includeAnswers: true });
      return res.status(201).json({ success: true, data: serializeQuiz(created, items), message: "Tạo đề kiểm tra thành công" });
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      return sendError(res, error, "Lỗi khi tạo đề kiểm tra");
    } finally {
      client.release();
    }
  });

  router.put("/teacher/quizzes/:quizId", ...secured, async (req, res) => {
    const client = await db.getClient();
    let committed = false;
    try {
      const quizId = parsePositiveId(req.params.quizId, "quizId");
      await client.query("BEGIN");
      const quiz = await loadQuiz(client, quizId, { lock: true });
      if (!quiz) throw httpError(404, "NOT_FOUND", "Không tìm thấy đề kiểm tra");
      await assertQuizAccess(client, quiz, req.user);
      if (quiz.status === "ARCHIVED") throw httpError(409, "QUIZ_ARCHIVED", "Đề đã lưu trữ, không thể chỉnh sửa metadata");
      const metadata = normalizeQuizMetadata(req.body, { existing: quiz, requireComplete: false });
      metadata.status = quiz.status;
      const target = await validateTarget(client, metadata, req.user);
      const scheduled = resolveSchedule(metadata, target);
      if (quiz.has_attempts && attemptProtectedMetadataChanged(quiz, scheduled)) {
        throw httpError(409, "QUIZ_HAS_ATTEMPTS", "Đề đã có lượt làm; chỉ có thể sửa tiêu đề hoặc mô tả");
      }
      if (quiz.live_class_id) await assertGradebookOpen(client, quiz.live_class_id);
      if (scheduled.liveClassId && String(scheduled.liveClassId) !== String(quiz.live_class_id || "")) {
        await assertGradebookOpen(client, scheduled.liveClassId);
      }
      const result = await client.query(
        `UPDATE quizzes SET title=$1, description=$2, course_id=$3, live_class_id=$4, class_session_id=$5,
         activity_scope=$6, due_date=$7, duration_minutes=$8, passing_score=$9, shuffle_questions=$10,
         attempt_limit=$11, available_from=$12, available_until=$13, review_policy=$14, updated_at=NOW()
         WHERE id=$15 RETURNING *`,
        [scheduled.title, scheduled.description, scheduled.courseId, scheduled.liveClassId, scheduled.classSessionId,
          scheduled.activityScope, scheduled.dueDate?.toISOString() || null, scheduled.durationMinutes,
          scheduled.passingScore, scheduled.shuffleQuestions, scheduled.attemptLimit,
          scheduled.availableFrom?.toISOString() || null, scheduled.availableUntil?.toISOString() || null,
          scheduled.reviewPolicy, quizId],
      );
      await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.updated", entityType: "quiz", entityId: quizId, beforeState: quiz, afterState: result.rows[0], metadata: { ip: req.ip } });
      await client.query("COMMIT");
      committed = true;
      return res.json({ success: true, data: serializeQuiz(result.rows[0]), message: "Đã cập nhật thông tin đề" });
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      return sendError(res, error, "Lỗi khi cập nhật đề kiểm tra");
    } finally {
      client.release();
    }
  });

  router.put("/teacher/quizzes/:quizId/items", ...secured, async (req, res) => {
    const client = await db.getClient();
    let committed = false;
    try {
      const quizId = parsePositiveId(req.params.quizId, "quizId");
      if (!Array.isArray(req.body?.items)) throw httpError(400, "VALIDATION_ERROR", "items phải là một danh sách", { path: "items" });
      await client.query("BEGIN");
      const quiz = await loadQuiz(client, quizId, { lock: true });
      if (!quiz) throw httpError(404, "NOT_FOUND", "Không tìm thấy đề kiểm tra");
      await assertQuizAccess(client, quiz, req.user);
      if (quiz.status === "ARCHIVED") throw httpError(409, "QUIZ_ARCHIVED", "Đề đã lưu trữ, không thể sửa câu hỏi");
      if (quiz.has_attempts) throw httpError(409, "QUIZ_HAS_ATTEMPTS", "Đề đã có lượt làm; không thể thay đổi cấu trúc câu hỏi");
      if (quiz.live_class_id) await assertGradebookOpen(client, quiz.live_class_id);
      const flattened = await replaceItems(client, quizId, req.body.items, { allowIncomplete: quiz.status === "DRAFT" });
      await recordAuditEvent({
        db: client,
        actorId: req.user.id,
        action: "quiz.items_updated",
        entityType: "quiz",
        entityId: quizId,
        metadata: { ip: req.ip, questionCount: flattened.questionCount, maxScore: flattened.maxScore },
      });
      await client.query("COMMIT");
      committed = true;
      const items = await fetchItems(db, quizId, { includeAnswers: true });
      return res.json({ success: true, data: { quizId: String(quizId), items, questionCount: flattened.questionCount, maxScore: flattened.maxScore }, message: "Đã lưu nội dung đề" });
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      return sendError(res, error, "Lỗi khi lưu nội dung đề");
    } finally {
      client.release();
    }
  });

  router.post("/teacher/quizzes/:quizId/publish", ...secured, async (req, res) => {
    const client = await db.getClient();
    let committed = false;
    let published = null;
    try {
      const quizId = parsePositiveId(req.params.quizId, "quizId");
      await client.query("BEGIN");
      const quiz = await loadQuiz(client, quizId, { lock: true });
      if (!quiz) throw httpError(404, "NOT_FOUND", "Không tìm thấy đề kiểm tra");
      await assertQuizAccess(client, quiz, req.user);
      if (quiz.status === "ARCHIVED") throw httpError(409, "QUIZ_ARCHIVED", "Đề đã lưu trữ và không thể xuất bản lại");
      const metadata = normalizeQuizMetadata({}, { existing: quiz, requireComplete: true, requireFutureDueDate: true });
      const target = await validateTarget(client, metadata, req.user, { requireOpenSession: true });
      const scheduled = resolveSchedule(metadata, target);
      await assertGradebookOpen(client, scheduled.liveClassId);
      const items = await fetchItems(client, quizId, { includeAnswers: true });
      normalizeQuizAuthoringItems(items, { allowIncomplete: false });
      published = (await client.query(
        `UPDATE quizzes SET status='PUBLISHED', available_from=$2, available_until=$3, due_date=$4, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [quizId, scheduled.availableFrom?.toISOString() || null, scheduled.availableUntil?.toISOString() || null, scheduled.dueDate?.toISOString() || null],
      )).rows[0];
      await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.published", entityType: "quiz", entityId: quizId, beforeState: { status: quiz.status }, afterState: { status: "PUBLISHED" }, metadata: { ip: req.ip } });
      await client.query("COMMIT");
      committed = true;

      if (quiz.status !== "PUBLISHED") {
        broadcastToClass({
          liveClassId: scheduled.liveClassId,
          title: `Quiz mới: ${scheduled.title}`,
          message: scheduled.activityScope === "homework" ? "Bạn có bài tập về nhà mới." : "Bài trên lớp đã sẵn sàng.",
          eventType: "quiz.published",
          linkUrl: `/lms/quiz/${quizId}`,
          data: { quizId, courseId: scheduled.courseId, liveClassId: scheduled.liveClassId, classSessionId: scheduled.classSessionId },
          actorId: req.user.id,
          dedupePrefix: `quiz:${quizId}:published`,
        }).catch((error) => console.error("Quiz publish notification warning:", error.message));
      }
      return res.json({ success: true, data: serializeQuiz(published), message: "Đã xuất bản đề" });
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      return sendError(res, error, "Lỗi khi xuất bản đề");
    } finally {
      client.release();
    }
  });

  router.post("/teacher/quizzes/:quizId/archive", ...secured, async (req, res) => {
    const client = await db.getClient();
    let committed = false;
    try {
      const quizId = parsePositiveId(req.params.quizId, "quizId");
      await client.query("BEGIN");
      const quiz = await loadQuiz(client, quizId, { lock: true });
      if (!quiz) throw httpError(404, "NOT_FOUND", "Không tìm thấy đề kiểm tra");
      await assertQuizAccess(client, quiz, req.user);
      if (quiz.live_class_id) await assertGradebookOpen(client, quiz.live_class_id);
      const archived = (await client.query("UPDATE quizzes SET status='ARCHIVED' WHERE id=$1 RETURNING *", [quizId])).rows[0];
      await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.archived", entityType: "quiz", entityId: quizId, beforeState: { status: quiz.status }, afterState: { status: "ARCHIVED" }, metadata: { ip: req.ip } });
      await client.query("COMMIT");
      committed = true;
      return res.json({ success: true, data: serializeQuiz(archived), message: "Đã lưu trữ đề" });
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      return sendError(res, error, "Lỗi khi lưu trữ đề");
    } finally {
      client.release();
    }
  });

  router.delete("/teacher/quizzes/:quizId", ...secured, async (req, res) => {
    const client = await db.getClient();
    let committed = false;
    try {
      const quizId = parsePositiveId(req.params.quizId, "quizId");
      await client.query("BEGIN");
      const quiz = await loadQuiz(client, quizId, { lock: true });
      if (!quiz) throw httpError(404, "NOT_FOUND", "Không tìm thấy đề kiểm tra");
      await assertQuizAccess(client, quiz, req.user);
      if (quiz.has_attempts) throw httpError(409, "QUIZ_HAS_ATTEMPTS", "Đề đã có lượt làm nên không thể xóa; hãy chuyển sang lưu trữ");
      if (quiz.live_class_id) await assertGradebookOpen(client, quiz.live_class_id);
      await client.query("DELETE FROM quizzes WHERE id=$1", [quizId]);
      await recordAuditEvent({ db: client, actorId: req.user.id, action: "quiz.deleted", entityType: "quiz", entityId: quizId, beforeState: quiz, metadata: { ip: req.ip } });
      await client.query("COMMIT");
      committed = true;
      return res.json({ success: true, data: { id: String(quizId) }, message: "Đã xóa đề kiểm tra" });
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => {});
      return sendError(res, error, "Lỗi khi xóa đề kiểm tra");
    } finally {
      client.release();
    }
  });

  router.post("/teacher/quiz-ocr/image", ...secured, ocrRateLimiter, uploadSingleImage, async (req, res) => {
    try {
      validateQuizOcrImage(req.file);
      const text = await ocrExtractor(req.file, { signal: requestAbortSignal(req, res) });
      return res.json({
        success: true,
        data: {
          text,
          source: { fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size },
        },
        message: "OCR ảnh thành công",
      });
    } catch (error) {
      return sendError(res, error, "OCR ảnh thất bại");
    }
  });

  router.post("/teacher/quiz-import/preview", ...secured, uploadImportDocument, async (req, res) => {
    try {
      if (String(process.env.QUIZ_DOCUMENT_IMPORT_ENABLED || "false").toLowerCase() !== "true") {
        throw new QuizDocumentImportError("QUIZ_DOCUMENT_IMPORT_DISABLED", "Import PDF/DOCX đang tạm tắt", 503);
      }
      const languageMode = String(req.body?.languageMode || req.body?.importLanguageMode || "auto").trim().toLowerCase();
      if (!new Set(["auto", "vi", "zh", "en", "vi_zh"]).has(languageMode)) {
        throw new QuizDocumentImportError("QUIZ_IMPORT_LANGUAGE_INVALID", "Chế độ ngôn ngữ import không hợp lệ", 400);
      }
      const preview = await previewQuizImportFile(req.file, { languageMode });
      return res.json({ success: true, data: preview, message: "Đã tạo bản xem trước từ tài liệu" });
    } catch (error) {
      if (error instanceof QuizDocumentImportError) {
        return res.status(error.status).json({ success: false, message: error.message, errorCode: error.code });
      }
      console.error("Quiz document import preview failed:", error);
      return res.status(500).json({ success: false, message: "Không thể đọc tài liệu import", errorCode: "QUIZ_IMPORT_FAILED" });
    }
  });

  return router;
};

export default createQuizAuthoringRouter();

