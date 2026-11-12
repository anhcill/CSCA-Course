import test from "node:test";
import assert from "node:assert/strict";
import { buildCourseSearchResults, normalizeSearchText } from "./searchCatalog.js";

test("normalizes Vietnamese search text", () => {
  assert.equal(normalizeSearchText("  Khóa Học Đầu Vào  "), "khoa hoc dau vao");
});

test("routes Record offerings to the video workspace and removes the legacy duplicate", () => {
  const results = buildCourseSearchResults({
    query: "csca",
    courses: [{ id: 12, title: "CSCA Toán", thumbnail_url: "/course.webp" }],
    offerings: [{ id: "12", offeringId: "record-csca-a", title: "CSCA Toán", thumbnailUrl: "/record.webp" }],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].kind, "record");
  assert.equal(results[0].href, "/video-courses/record-csca-a");
});

test("keeps non-Record public courses on the detail route", () => {
  const [result] = buildCourseSearchResults({
    query: "hsk",
    courses: [{ id: 8, title: "HSK 4", description: "Luyện thi" }],
    offerings: [],
  });

  assert.equal(result.kind, "course");
  assert.equal(result.href, "/detail-course/8");
});
