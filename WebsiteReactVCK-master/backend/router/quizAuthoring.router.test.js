import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import {
  createQuizAuthoringRouter,
  createQuizOcrRateLimiter,
  normalizeQuizMetadata,
  usesLegacyQuizCreateContract,
  validateQuizOcrImage,
} from "./quizAuthoring.router.js";
import { QuizOcrError } from "../services/quizOcr.service.js";
import { pool } from "../db/connect.js";

process.env.MOLI_QUIZ_AUTHORING_ENABLED = "true";
after(() => pool.end());

const withServer = async (router, callback) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/assignments", ...(Array.isArray(router) ? router : [router]));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

const teacherAuth = (req, res, next) => {
  req.user = { id: 10, role: "creator", username: "teacher" };
  next();
};

const pngForm = () => {
  const form = new FormData();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  form.append("image", new Blob([png], { type: "image/png" }), "question.png");
  return form;
};

test("authoring routes require authentication", async () => {
  const router = createQuizAuthoringRouter();
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assignments/teacher/quizzes/1/editor`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).errorCode, "UNAUTHENTICATED");
  });
});

test("editor route rejects an invalid quiz id before querying the database", async () => {
  const router = createQuizAuthoringRouter({ authMiddlewares: [teacherAuth] });
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assignments/teacher/quizzes/not-a-number/editor`);
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.errorCode, "VALIDATION_ERROR");
    assert.equal(body.path, "quizId");
  });
});

test("metadata normalization supports incomplete drafts and enforces publish targets", () => {
  const draft = normalizeQuizMetadata({ title: "Draft", items: [] });
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.courseId, null);
  assert.throws(
    () => normalizeQuizMetadata({ title: "Publish", status: "PUBLISHED" }, { requireComplete: true }),
    (error) => error.status === 400 && error.code === "VALIDATION_ERROR",
  );
});

test("metadata normalization treats timezone-less authoring values as Vietnam time", () => {
  const metadata = normalizeQuizMetadata({
    title: "Vietnam schedule",
    availableFrom: "2026-10-19T12:02",
    availableUntil: "2026-10-19T13:02",
  });
  assert.equal(metadata.availableFrom.toISOString(), "2026-10-19T05:02:00.000Z");
  assert.equal(metadata.availableUntil.toISOString(), "2026-10-19T06:02:00.000Z");
});

test("flat question create payloads fall through to the legacy quiz builder", async () => {
  assert.equal(usesLegacyQuizCreateContract({ questions: [] }), true);
  assert.equal(usesLegacyQuizCreateContract({ questions: [], items: [] }), false);

  const authoringRouter = createQuizAuthoringRouter({
    authMiddlewares: [teacherAuth],
    db: { getClient: async () => { throw new Error("authoring database must not be called"); } },
  });
  const legacyRouter = express.Router();
  legacyRouter.post("/teacher/quizzes", (req, res) => res.status(201).json({ success: true, source: "legacy" }));

  await withServer([authoringRouter, legacyRouter], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assignments/teacher/quizzes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Flat quiz", questions: [{ questionText: "Question" }] }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).source, "legacy");
  });
});

test("validateQuizOcrImage rejects a forged MIME type", () => {
  assert.throws(
    () => validateQuizOcrImage({ mimetype: "image/png", size: 8, buffer: Buffer.from("not-png!") }),
    (error) => error.status === 415 && error.code === "OCR_IMAGE_SIGNATURE_INVALID",
  );
});

test("validateQuizOcrImage rejects files above the 8 MB limit", () => {
  assert.throws(
    () => validateQuizOcrImage({
      mimetype: "image/png",
      size: 8 * 1024 * 1024 + 1,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }),
    (error) => error.status === 413 && error.code === "OCR_IMAGE_TOO_LARGE",
  );
});

test("OCR route returns the frontend response contract", async () => {
  const router = createQuizAuthoringRouter({
    authMiddlewares: [teacherAuth],
    ocrExtractor: async () => "25. x < 2\nA. 1",
  });
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assignments/teacher/quiz-ocr/image`, { method: "POST", body: pngForm() });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.text, "25. x < 2\nA. 1");
    assert.deepEqual(body.data.source, { fileName: "question.png", mimeType: "image/png", size: 9 });
  });
});

test("OCR route maps provider timeout to 504", async () => {
  const router = createQuizAuthoringRouter({
    authMiddlewares: [teacherAuth],
    ocrExtractor: async () => { throw new QuizOcrError("OCR_TIMEOUT", "AI OCR quá thời gian", { status: 504 }); },
  });
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/assignments/teacher/quiz-ocr/image`, { method: "POST", body: pngForm() });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).errorCode, "OCR_TIMEOUT");
  });
});

test("OCR route rate limits by teacher and IP", async () => {
  const limiter = createQuizOcrRateLimiter({ windowMs: 60000, max: 1, now: () => 1000 });
  const router = createQuizAuthoringRouter({
    authMiddlewares: [teacherAuth],
    ocrRateLimiter: limiter,
    ocrExtractor: async () => "text",
  });
  await withServer(router, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/assignments/teacher/quiz-ocr/image`, { method: "POST", body: pngForm() });
    const second = await fetch(`${baseUrl}/api/assignments/teacher/quiz-ocr/image`, { method: "POST", body: pngForm() });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal((await second.json()).errorCode, "OCR_RATE_LIMITED");
  });
});

