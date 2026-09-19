import assert from "node:assert/strict";
import test from "node:test";
import requireRole from "./requireRole.js";

const createResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(payload) {
      response.body = payload;
      return response;
    },
  };
  return response;
};

test("requireRole returns 401 when authentication is missing", () => {
  const response = createResponse();
  let nextCalled = false;

  requireRole("admin")({}, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.errorCode, "UNAUTHENTICATED");
  assert.equal(nextCalled, false);
});

test("requireRole returns 403 for a role outside the policy", () => {
  const response = createResponse();
  let nextCalled = false;

  requireRole("creator")({ user: { id: 10, role: "user" } }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.errorCode, "FORBIDDEN");
  assert.equal(nextCalled, false);
});

test("requireRole allows every explicitly configured role", () => {
  for (const role of ["creator", "admin"]) {
    const response = createResponse();
    let nextCalled = false;

    requireRole(["creator", "admin"])({ user: { id: 10, role } }, response, () => {
      nextCalled = true;
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, null);
    assert.equal(nextCalled, true);
  }
});
