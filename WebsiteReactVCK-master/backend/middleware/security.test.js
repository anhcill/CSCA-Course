import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, isAllowedOrigin, securityHeaders } from "./security.js";

const createResponse = () => ({
  headers: {},
  statusCode: 200,
  body: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("security headers are present and API auth responses are not cacheable", () => {
  const req = { path: "/api/auth/login" };
  const res = createResponse();
  let nextCalled = false;
  securityHeaders(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("CORS origin matching is exact and supports a configured allow-list", () => {
  assert.equal(isAllowedOrigin("http://localhost:5173", "http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("http://localhost:5173.evil.test", "http://localhost:5173"), false);
  assert.equal(isAllowedOrigin("https://app.example.com", "http://localhost:5173, https://app.example.com/"), true);
  assert.equal(isAllowedOrigin(undefined, "http://localhost:5173"), true);
});

test("auth rate limiter returns 429 after the configured budget", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const req = { ip: "198.51.100.10", baseUrl: "/api/auth", path: "/login" };
  const first = createResponse();
  const second = createResponse();
  const third = createResponse();
  limiter(req, first, () => {});
  limiter(req, second, () => {});
  limiter(req, third, () => {});
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(third.statusCode, 429);
  assert.equal(third.body.errorCode, "RATE_LIMITED");
});

