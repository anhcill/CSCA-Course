import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import requireManagementIntegration from "./requireManagementIntegration.js";

const configure = () => {
  process.env.MANAGEMENT_INTEGRATION_SERVICE_TOKEN = "test-service-token";
  process.env.MANAGEMENT_INTEGRATION_KEY = "test-integration-key";
  process.env.MANAGEMENT_INTEGRATION_HMAC_SECRET = "test-hmac-secret";
  process.env.MANAGEMENT_INTEGRATION_MAX_AGE_SECONDS = "300";
};

const signedRequest = (rawBody, timestamp = new Date().toISOString()) => {
  const signature = `sha256=${crypto
    .createHmac("sha256", process.env.MANAGEMENT_INTEGRATION_HMAC_SECRET)
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest("hex")}`;
  const headers = new Map([
    ["authorization", "Bearer test-service-token"],
    ["x-integration-key", "test-integration-key"],
    ["x-event-timestamp", timestamp],
    ["x-signature", signature],
    ["x-correlation-id", "correlation-123"],
    ["idempotency-key", "outbox-123"],
  ]);
  return {
    rawBody,
    get: (name) => headers.get(name.toLowerCase()),
  };
};

const createResponse = () => {
  const response = { statusCode: null, body: null };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
};

test("Management integration HMAC guard", async (t) => {
  configure();

  await t.test("accepts an exact timestamp.raw-body signature", () => {
    const rawBody = Buffer.from('{"externalStudentId":"student-1"}', "utf8");
    const request = signedRequest(rawBody);
    const response = createResponse();
    let reachedNext = false;

    requireManagementIntegration(request, response, () => { reachedNext = true; });

    assert.equal(reachedNext, true);
    assert.equal(response.statusCode, null);
    assert.deepEqual(request.managementIntegration, {
      correlationId: "correlation-123",
      idempotencyKey: "outbox-123",
    });
  });

  await t.test("rejects a signature when the raw body changes", () => {
    const signedBody = Buffer.from('{"externalStudentId":"student-1"}', "utf8");
    const request = signedRequest(Buffer.from('{"externalStudentId":"student-2"}', "utf8"));
    const timestamp = request.get("x-event-timestamp");
    request.get = (name) => {
      if (name.toLowerCase() === "x-signature") {
        return `sha256=${crypto
          .createHmac("sha256", process.env.MANAGEMENT_INTEGRATION_HMAC_SECRET)
          .update(timestamp)
          .update(".")
          .update(signedBody)
          .digest("hex")}`;
      }
      return signedRequest(signedBody, timestamp).get(name);
    };
    const response = createResponse();

    requireManagementIntegration(request, response, () => assert.fail("next must not run"));

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.errorCode, "INTEGRATION_UNAUTHORIZED");
  });

  await t.test("rejects an expired timestamp before processing the payload", () => {
    const rawBody = Buffer.from('{"externalStudentId":"student-1"}', "utf8");
    const request = signedRequest(rawBody, new Date(Date.now() - 301_000).toISOString());
    const response = createResponse();

    requireManagementIntegration(request, response, () => assert.fail("next must not run"));

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.errorCode, "INTEGRATION_TIMESTAMP_INVALID");
  });
});
