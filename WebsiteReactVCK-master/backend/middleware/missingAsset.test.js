import test from "node:test";
import assert from "node:assert/strict";
import { isStaticAssetPath, missingAssetNotFound } from "./missingAsset.js";

const createResponse = () => ({
  headers: {},
  statusCode: 200,
  body: null,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
});

test("isStaticAssetPath matches /assets/* and static bundle extensions", () => {
  assert.equal(isStaticAssetPath("/assets/TeacherQuizPage-AbCd1234.js"), true);
  assert.equal(isStaticAssetPath("/assets/index-B0W5zmwM.css?v=1"), true);
  assert.equal(isStaticAssetPath("/workbox-d7021ff2.js"), true);
  assert.equal(isStaticAssetPath("/lms/dashboard"), false);
  assert.equal(isStaticAssetPath("/courses/hsk-4"), false);
});

test("missingAssetNotFound returns 404 plain text with no-store for missing chunks", () => {
  const req = { method: "GET", baseUrl: "", path: "/assets/OldChunk-AbCd1234.js" };
  const res = createResponse();
  let nextCalled = false;

  missingAssetNotFound(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(res.headers["Cache-Control"], "no-store, no-cache, must-revalidate");
  assert.equal(res.body, "Asset not found");
});

test("missingAssetNotFound passes SPA navigation routes through to next()", () => {
  const req = { method: "GET", baseUrl: "", path: "/lms/teach/quizzes" };
  const res = createResponse();
  let nextCalled = false;

  missingAssetNotFound(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
