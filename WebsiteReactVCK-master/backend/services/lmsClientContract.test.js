import assert from "node:assert/strict";
import test from "node:test";
import { createAssignment, submitAssignment, gradeSubmission, gradebookExportUrl } from "../../frontend/src/features/api/lmsClient.js";

const captureRequest = (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
  });
  return calls;
};

test("assignment creation sends the grading rubric to the server", async (t) => {
  const calls = captureRequest(t);
  const rubric = [{ id: "content", title: "Content", maxScore: 10 }];
  await createAssignment({ title: "Essay", liveClassId: 1, maxScore: 10, rubric });
  assert.deepEqual(calls[0].body.rubric, rubric);
  assert.equal(calls[0].credentials, "include");
});

test("text-only submissions and resubmissions send null instead of empty asset IDs", async (t) => {
  const calls = captureRequest(t);
  await submitAssignment({ assignmentId: 1, contentText: "Revised answer", fileAssetId: "", audioAssetId: "" });
  assert.equal(calls[0].body.fileAssetId, null);
  assert.equal(calls[0].body.audioAssetId, null);
  await submitAssignment({ assignmentId: 1, contentText: "With image", fileAssetId: "42" });
  assert.equal(calls[1].body.fileAssetId, "42");
});

test("grading preserves revision, annotation and reason; exports preserve session filters", async (t) => {
  const calls = captureRequest(t);
  const annotations = [{ page: 1, text: "Check this sentence", x: 0.5, y: 0.4 }];
  await gradeSubmission({ submissionId: 3, revision: 2, score: 9, feedbackText: "Improved", annotations, changeReason: "Review confirmed the correction" });
  assert.equal(calls[0].body.revision, 2);
  assert.deepEqual(calls[0].body.annotations, annotations);
  assert.equal(calls[0].body.changeReason, "Review confirmed the correction");
  const url = new URL(gradebookExportUrl({ classId: 1, courseId: 2, sessionId: 3, format: "csv" }), "https://example.test");
  assert.equal(url.searchParams.get("sessionId"), "3");
  assert.equal(url.searchParams.get("format"), "csv");
});
