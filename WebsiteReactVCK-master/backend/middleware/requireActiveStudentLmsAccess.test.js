import assert from "node:assert/strict";
import test from "node:test";
import requireActiveStudentLmsAccess, { hasActiveStudentLmsAccess } from "./requireActiveStudentLmsAccess.js";

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

test("only an active Management-provisioned learner has private LMS access", () => {
  assert.equal(hasActiveStudentLmsAccess({ role: "user", is_management_managed: true, lms_account_status: "active" }), true);
  assert.equal(hasActiveStudentLmsAccess({ role: "user", is_management_managed: false, lms_account_status: "active" }), false);
  assert.equal(hasActiveStudentLmsAccess({ role: "user", is_management_managed: true, lms_account_status: "suspended" }), false);
});

test("requireActiveStudentLmsAccess blocks public-site accounts", () => {
  const response = createResponse();
  let nextCalled = false;
  requireActiveStudentLmsAccess({ user: { role: "user", is_management_managed: false, lms_account_status: "unmanaged" } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.errorCode, "LMS_ACCESS_NOT_GRANTED");
  assert.equal(nextCalled, false);
});

test("requireActiveStudentLmsAccess permits the active Management learner", () => {
  const response = createResponse();
  let nextCalled = false;
  requireActiveStudentLmsAccess({ user: { role: "user", is_management_managed: true, lms_account_status: "active" } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 200);
  assert.equal(nextCalled, true);
});
