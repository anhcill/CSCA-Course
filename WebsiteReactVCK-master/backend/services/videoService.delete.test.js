import assert from "node:assert/strict";
import test from "node:test";
import {
  generateLearningFileDeleteSignedUrl,
  deleteLearningFileObject,
  isSafeR2StorageKey,
} from "./video.service.js";

test("R2 learning file deletion utility", async (t) => {
  for (const [key, value] of Object.entries({
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_BUCKET_NAME: "test-bucket",
    R2_S3_ENDPOINT: "https://test-account.r2.cloudflarestorage.com",
  })) {
    process.env[key] = value;
  }

  // 1. Valid storage keys
  assert.equal(isSafeR2StorageKey("learning-files/1/sample.pdf"), true);
  assert.equal(isSafeR2StorageKey("../secret.txt"), false);
  assert.equal(isSafeR2StorageKey("learning-files/path with spaces.pdf"), false);
  assert.equal(isSafeR2StorageKey("learning-files/path\\with\\backslash.pdf"), false);

  // 2. generateLearningFileDeleteSignedUrl generates a DELETE URL
  const { deleteUrl } = await generateLearningFileDeleteSignedUrl({
    r2Key: "learning-files/42/1728000000_doc.pdf",
  });
  assert.ok(deleteUrl.startsWith("https://test-account.r2.cloudflarestorage.com/test-bucket/learning-files/42/1728000000_doc.pdf?"));
  assert.ok(deleteUrl.includes("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
  assert.ok(deleteUrl.includes("X-Amz-Signature="));

  // 3. deleteLearningFileObject sends HTTP DELETE
  const captured = [];
  const origFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = origFetch; });

  globalThis.fetch = async (url, options) => {
    captured.push({ url: String(url), method: options?.method });
    return new Response(null, { status: 204 });
  };

  const result = await deleteLearningFileObject({ r2Key: "learning-files/42/1728000000_doc.pdf" });
  assert.equal(result.success, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].method, "DELETE");
  assert.ok(captured[0].url.includes("test-bucket/learning-files/42/1728000000_doc.pdf"));

  // 4. deleteLearningFileObject handles 404 (already deleted on R2) gracefully
  globalThis.fetch = async () => new Response("Not Found", { status: 404 });
  const result404 = await deleteLearningFileObject({ r2Key: "learning-files/42/1728000000_doc.pdf" });
  assert.equal(result404.success, true);
  assert.equal(result404.status, 404);

  // 5. deleteLearningFileObject throws on 500 server error
  globalThis.fetch = async () => new Response("Internal R2 Error", { status: 500 });
  await assert.rejects(
    async () => deleteLearningFileObject({ r2Key: "learning-files/42/1728000000_doc.pdf" }),
    /Không thể xóa object khỏi Cloudflare R2/,
  );
});
