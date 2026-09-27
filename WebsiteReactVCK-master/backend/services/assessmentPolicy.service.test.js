import assert from "node:assert/strict";
import test from "node:test";
import { getAttemptExpiry, getQuizAvailability, normalizeRubric, normalizeRubricScores, reviewIsAvailable } from "./assessmentPolicy.service.js";

test("quiz availability honours its server window", () => {
  const quiz = { available_from: "2026-09-27T10:00:00Z", available_until: "2026-09-27T11:00:00Z" };
  assert.equal(getQuizAvailability(quiz, "2026-09-27T09:59:59Z").reason, "not_open");
  assert.equal(getQuizAvailability(quiz, "2026-09-27T10:30:00Z").isOpen, true);
  assert.equal(getQuizAvailability(quiz, "2026-09-27T11:00:00Z").reason, "closed");
});

test("attempt expiry never extends past the quiz close time", () => {
  assert.equal(
    getAttemptExpiry({ startedAt: "2026-09-27T10:40:00Z", durationMinutes: 30, closesAt: "2026-09-27T11:00:00Z" }).toISOString(),
    "2026-09-27T11:00:00.000Z",
  );
});

test("rubric scores must align to the rubric and its declared total", () => {
  const rubric = normalizeRubric([{ title: "Nội dung", maxPoints: 6 }, { title: "Trình bày", maxPoints: 4 }], 10);
  const scores = normalizeRubricScores([{ criterionId: "criterion-1", score: 5 }, { criterionId: "criterion-2", score: 3.5 }], rubric);
  assert.equal(scores.reduce((total, item) => total + item.score, 0), 8.5);
  assert.throws(() => normalizeRubric([{ title: "Sai tổng", maxPoints: 6 }], 10), /RUBRIC_TOTAL_MISMATCH/);
});

test("after-close review stays private until the window is closed", () => {
  const quiz = { review_policy: "after_close", available_until: "2026-09-27T11:00:00Z" };
  assert.equal(reviewIsAvailable(quiz, "2026-09-27T10:59:00Z"), false);
  assert.equal(reviewIsAvailable(quiz, "2026-09-27T11:00:00Z"), true);
});
