import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalQuery,
  generateLearningFilePlaybackSignedUrl,
} from "./video.service.js";

const R2_TEST_ENV = {
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "test-bucket",
  R2_S3_ENDPOINT: "https://test-account.r2.cloudflarestorage.com",
};

test("R2 canonical query uses encoded ASCII order", () => {
  assert.equal(
    buildCanonicalQuery({
      "response-content-type": "application/pdf",
      "X-Amz-Date": "20261015T120000Z",
      "response-content-disposition": "inline; filename=\"paper.pdf\"",
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    }),
    "X-Amz-Algorithm=AWS4-HMAC-SHA256"
      + "&X-Amz-Date=20261015T120000Z"
      + "&response-content-disposition=inline%3B%20filename%3D%22paper.pdf%22"
      + "&response-content-type=application%2Fpdf",
  );
});

test("R2 learning PDF URL signs deterministic inline response overrides", async (t) => {
  const originalEnv = Object.fromEntries(Object.keys(R2_TEST_ENV).map((key) => [key, process.env[key]]));
  const RealDate = globalThis.Date;
  const fixedNow = "2026-10-15T12:00:00.000Z";
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedNow]));
    }

    static now() {
      return RealDate.parse(fixedNow);
    }
  }

  Object.assign(process.env, R2_TEST_ENV);
  globalThis.Date = FixedDate;
  t.after(() => {
    globalThis.Date = RealDate;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const input = {
    r2Key: "learning-files/42/paper.pdf",
    filename: "exam paper.pdf",
    disposition: "inline",
    mimeType: "application/pdf",
  };
  const first = await generateLearningFilePlaybackSignedUrl(input);
  const second = await generateLearningFilePlaybackSignedUrl(input);
  assert.equal(first.downloadUrl, second.downloadUrl);

  const url = new URL(first.downloadUrl);
  assert.equal(url.searchParams.get("response-content-disposition"), "inline; filename=\"exam paper.pdf\"");
  assert.equal(url.searchParams.get("response-content-type"), "application/pdf");

  const keys = [...url.searchParams.keys()];
  assert.deepEqual(keys, [
    "X-Amz-Algorithm",
    "X-Amz-Credential",
    "X-Amz-Date",
    "X-Amz-Expires",
    "X-Amz-SignedHeaders",
    "response-content-disposition",
    "response-content-type",
    "X-Amz-Signature",
  ]);
});
