import assert from "node:assert/strict";
import test from "node:test";
import {
  QuizOcrError,
  buildQuizOcrPrompt,
  cleanQuizOcrText,
  extractQuizImageOcrText,
  getQuizOcrConfig,
} from "./quizOcr.service.js";

const file = {
  mimetype: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

const config = {
  enabled: true,
  baseUrl: "https://ocr.example.test/v1",
  apiKeys: ["secret-key"],
  models: ["vision-model"],
  timeoutMs: 100,
  maxTokens: 4500,
};

test("OCR prompt requires transcription without solving", () => {
  const prompt = buildQuizOcrPrompt();
  assert.match(prompt, /Do not solve/i);
  assert.match(prompt, /\\frac/);
  assert.match(prompt, /Preserve comparison signs exactly/i);
});

test("cleanQuizOcrText strips fences and normalizes whitespace", () => {
  assert.equal(cleanQuizOcrText("```text\r\n25. x  \r\n\r\n\r\nA. 1\r\n```"), "25. x\n\nA. 1");
});

test("OCR reuses MolyPet provider configuration when dedicated values are absent", () => {
  const config = getQuizOcrConfig({
    MOLI_PET_ENABLED: "true",
    MOLI_PET_BASE_URL: "https://router.example.test/v1",
    MOLI_PET_API_KEYS: "key-a,key-b",
    MOLI_PET_MODEL: "vision-primary",
    MOLI_PET_FALLBACK_MODELS: "vision-fallback",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.baseUrl, "https://router.example.test/v1");
  assert.deepEqual(config.apiKeys, ["key-a", "key-b"]);
  assert.deepEqual(config.models, ["vision-primary", "vision-fallback"]);
});

test("extractQuizImageOcrText sends the image only to the configured server provider", async () => {
  let request = null;
  const result = await extractQuizImageOcrText(file, {
    config,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: "```text\n25. x < 2\nA. 1\n```" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(result, "25. x < 2\nA. 1");
  assert.equal(request.url, "https://ocr.example.test/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer secret-key");
  assert.equal(request.body.model, "vision-model");
  assert.match(request.body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
});

test("extractQuizImageOcrText maps provider timeout to 504", async () => {
  await assert.rejects(
    extractQuizImageOcrText(file, {
      config: { ...config, timeoutMs: 5 },
      fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
    (error) => error instanceof QuizOcrError && error.code === "OCR_TIMEOUT" && error.status === 504,
  );
});

test("extractQuizImageOcrText fails closed without server configuration", async () => {
  await assert.rejects(
    extractQuizImageOcrText(file, { config: { ...config, apiKeys: [] } }),
    (error) => error instanceof QuizOcrError && error.code === "OCR_NOT_CONFIGURED" && error.status === 503,
  );
});

