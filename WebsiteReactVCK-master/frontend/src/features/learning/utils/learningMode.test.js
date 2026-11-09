import assert from "node:assert/strict";
import test from "node:test";
import { getLearningCapabilities, getLearningMode, normalizeLearningMode } from "./learningMode.js";

test("learning mode defaults to LIVE and accepts API naming variants", () => {
  assert.equal(normalizeLearningMode(), "LIVE");
  assert.equal(getLearningMode({ learning_mode: "recording" }), "RECORDING");
  assert.equal(getLearningMode({ enrollmentMode: "record" }), "RECORDING");
});

test("recording enrollment disables live affordances by default", () => {
  assert.deepEqual(getLearningCapabilities({ selectedClass: { learning_mode: "RECORDING" } }), {
    learningMode: "RECORDING",
    recordingMode: true,
    canJoinLive: false,
    canCheckIn: false,
    showCalendar: false,
    prioritizeRecordings: true,
  });
});

test("explicit server capabilities override mode presentation defaults", () => {
  const capabilities = getLearningCapabilities({
    selectedClass: { learning_mode: "RECORDING" },
    access: { showCalendar: true, canJoinLive: false },
  });
  assert.equal(capabilities.recordingMode, true);
  assert.equal(capabilities.showCalendar, true);
  assert.equal(capabilities.canJoinLive, false);
});
