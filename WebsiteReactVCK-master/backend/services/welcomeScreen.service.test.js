import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WELCOME_CONFIG,
  sanitizeAndMergeConfig,
} from "./welcomeScreen.service.js";

test("DEFAULT_WELCOME_CONFIG provides expected structure", () => {
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.badge, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.autoTransitionDuration, "number");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.autoTransitionEnabled, "boolean");

  assert.equal(typeof DEFAULT_WELCOME_CONFIG.teacher.title, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.teacher.description, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.teacher.buttonText, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.teacher.loadingNote, "string");

  assert.equal(typeof DEFAULT_WELCOME_CONFIG.student.title, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.student.description, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.student.buttonText, "string");
  assert.equal(typeof DEFAULT_WELCOME_CONFIG.student.loadingNote, "string");
});

test("sanitizeAndMergeConfig handles empty or corrupted config", () => {
  const mergedEmpty = sanitizeAndMergeConfig(null);
  assert.deepEqual(mergedEmpty, DEFAULT_WELCOME_CONFIG);

  const mergedPartial = sanitizeAndMergeConfig({
    badge: "Custom Badge",
    autoTransitionDuration: 6.5,
    student: {
      title: "Custom Student Title",
    },
  });

  assert.equal(mergedPartial.badge, "Custom Badge");
  assert.equal(mergedPartial.autoTransitionDuration, 6.5);
  assert.equal(mergedPartial.autoTransitionEnabled, true);
  assert.equal(mergedPartial.student.title, "Custom Student Title");
  assert.equal(mergedPartial.student.description, DEFAULT_WELCOME_CONFIG.student.description);
  assert.equal(mergedPartial.teacher.title, DEFAULT_WELCOME_CONFIG.teacher.title);
});

test("sanitizeAndMergeConfig clamps invalid durations", () => {
  const mergedLow = sanitizeAndMergeConfig({ autoTransitionDuration: 0.1 });
  assert.equal(mergedLow.autoTransitionDuration, DEFAULT_WELCOME_CONFIG.autoTransitionDuration);

  const mergedHigh = sanitizeAndMergeConfig({ autoTransitionDuration: 999 });
  assert.equal(mergedHigh.autoTransitionDuration, DEFAULT_WELCOME_CONFIG.autoTransitionDuration);

  const mergedValid = sanitizeAndMergeConfig({ autoTransitionDuration: "5.4" });
  assert.equal(mergedValid.autoTransitionDuration, 5.4);
});
