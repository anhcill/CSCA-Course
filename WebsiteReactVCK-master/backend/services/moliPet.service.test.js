import assert from "node:assert/strict";
import test from "node:test";
import { validateMoliPetImageDataUrl } from "../router/ai.router.js";
import {
  askMoliPet,
  getMoliPetConfig,
  streamMoliPet,
} from "./moliPet.service.js";

const baseConfig = {
  enabled: true,
  baseUrl: "https://router.example.test/v1",
  apiKeys: ["test-key"],
  model: "primary-model",
  models: ["primary-model", "fallback-model"],
  timeoutMs: 1000,
  maxTokens: 1000,
};

test("MolyPet config is disabled by default and includes the fast fallback model", () => {
  const config = getMoliPetConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.model, "ag/gemini-3-flash");
  assert.deepEqual(config.models, ["ag/gemini-3-flash", "ag/gemini-3.8-flash-low"]);
});

test("askMoliPet explicitly requests a non-streaming response", async () => {
  let requestBody;
  const result = await askMoliPet("Giải thích giúp mình", {}, {
    config: baseConfig,
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Câu trả lời" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(result.success, true);
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.model, "primary-model");
});

test("askMoliPet falls back to the next configured model", async () => {
  const attemptedModels = [];
  const result = await askMoliPet("Xin chào", {}, {
    config: baseConfig,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      attemptedModels.push(body.model);
      if (body.model === "primary-model") return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Đã chuyển model" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.model, "fallback-model");
  assert.deepEqual(attemptedModels, ["primary-model", "fallback-model"]);
});

test("streamMoliPet parses SSE frames", async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Xin "}}]}\r\n\r\n',
    'data: {"choices":[{"delta":{"content":"chào"}}]}\n\ndata: [DONE]\n\n',
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  let output = "";

  await streamMoliPet("Chào", {}, (delta) => { output += delta; }, {
    config: baseConfig,
    fetchImpl: async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  });

  assert.equal(output, "Xin chào");
});

test("MolyPet image validation rejects unsupported and oversized data URLs", () => {
  assert.equal(validateMoliPetImageDataUrl("data:image/png;base64,aGVsbG8="), null);
  assert.match(validateMoliPetImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=") || "", /không hợp lệ/i);
  assert.match(validateMoliPetImageDataUrl(`data:image/png;base64,${"a".repeat(800_000)}`) || "", /quá lớn/i);
});
