import assert from "node:assert/strict";
import test from "node:test";
import { getPostLoginPath, getSafeAuthReturnPath } from "./lmsNavigation.js";

test("keeps a safe internal video-course deep link after login", () => {
  const path = "/video-courses/record-csca/units/12?tab=video#progress";
  assert.equal(getSafeAuthReturnPath(path), path);
  assert.equal(getPostLoginPath({ role: "user", lmsAccountStatus: "active" }, path), path);
});

test("rejects external and protocol-relative login return targets", () => {
  assert.equal(getSafeAuthReturnPath("https://evil.example/steal"), null);
  assert.equal(getSafeAuthReturnPath("//evil.example/steal"), null);
  assert.equal(getSafeAuthReturnPath("/\\evil.example/steal"), null);
});

test("falls back to the role landing page when no safe return target exists", () => {
  assert.equal(getPostLoginPath({ role: "admin" }, "https://evil.example"), "/admin");
});
