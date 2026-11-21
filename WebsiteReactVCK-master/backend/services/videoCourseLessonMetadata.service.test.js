import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRecordLessonDescription,
  normalizeRecordLessonTitle,
  shouldHideRecordLessonByDefault,
} from "./videoCourseLessonMetadata.service.js";

test("Record lesson title removes every chapter prefix and joins multiple names", () => {
  assert.equal(
    normalizeRecordLessonTitle("Chương 1: Tập hợp; Chương 2: Bất đẳng thức"),
    "Tập hợp · Bất đẳng thức",
  );
  assert.equal(normalizeRecordLessonTitle("Chương 3: Hàm số (tiếp)"), "Hàm số (tiếp)");
  assert.equal(normalizeRecordLessonTitle("Chương trình ôn tập"), "Chương trình ôn tập");
});

test("Record lesson title removes duplicate chapter names without losing order", () => {
  assert.equal(
    normalizeRecordLessonTitle("Chương 3: Hàm số; Chương 4: hàm số; Chương 5: Lượng giác"),
    "Hàm số · Lượng giác",
  );
});

test("make-up 26/10 session is marked for hiding, not deletion", () => {
  assert.equal(shouldHideRecordLessonByDefault("Buổi học bù 26/10"), true);
  assert.equal(shouldHideRecordLessonByDefault("Imported from CSCA Course LMS: Buổi học bù 26/10"), true);
  assert.equal(shouldHideRecordLessonByDefault(" Buổi học bù 26 / 10 - Toán 01"), true);
  assert.equal(shouldHideRecordLessonByDefault("Buổi học bù 27/10"), false);
});

test("Record lesson metadata is bounded", () => {
  assert.equal(normalizeRecordLessonTitle("x".repeat(300)).length, 255);
  assert.equal(normalizeRecordLessonDescription(`  ${"x".repeat(5100)}  `).length, 5000);
});
