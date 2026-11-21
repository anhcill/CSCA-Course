import assert from "node:assert/strict";
import test from "node:test";
import {
  __testResolveAssignmentUnitMatch,
  __testResolveQuizUnitMatch,
} from "./delegatedAssessments.service.js";
import { __testResolveFileMembershipInProfile } from "./delegatedFiles.service.js";

const referencedUnits = [
  {
    id: "121",
    unitType: "class_session",
    isRecordingReference: true,
    sourceClassSessionId: "121",
    unitOverrideId: "1",
    contentFilter: { sourceFileIds: [23], sourceQuizIds: [40], sourceAssignmentIds: [70] },
    isLocked: false,
  },
  {
    id: "1000000000043",
    unitType: "class_session",
    isRecordingReference: true,
    sourceClassSessionId: "121",
    unitOverrideId: "43",
    contentFilter: { sourceFileIds: [24], sourceQuizIds: [41], sourceAssignmentIds: [71] },
    isLocked: false,
  },
];

test("split recording unit resolves its destination quiz by override id", () => {
  const matched = __testResolveQuizUnitMatch(
    referencedUnits,
    { id: 41, class_session_id: null, lesson_id: null, recording_curriculum_unit_override_id: 43 },
    "1000000000043",
  );
  assert.equal(matched.id, "1000000000043");
});

test("source quiz and assignment filters do not leak between split recording units", () => {
  const quizUnit = __testResolveQuizUnitMatch(
    referencedUnits,
    { id: 41, class_session_id: 121, lesson_id: null, recording_curriculum_unit_override_id: null },
    "1000000000043",
  );
  assert.equal(quizUnit.id, "1000000000043");

  const assignmentUnit = __testResolveAssignmentUnitMatch(
    referencedUnits,
    { id: 71, class_session_id: 121, lesson_id: null },
    { mode: "INDEPENDENT", profile_id: 5, course_id: 10 },
    "1000000000043",
  );
  assert.equal(assignmentUnit.id, "1000000000043");
});

test("source file filter maps a reused file only to its intended split unit", async () => {
  const emptyDb = { query: async () => ({ rows: [] }) };
  const membership = await __testResolveFileMembershipInProfile(emptyDb, {
    file: { id: 24, class_session_id: 121, course_id: 1, visibility: "CLASS" },
    profileRow: { mode: "INDEPENDENT", profile_id: 5, course_id: 10, source_live_class_id: null },
    units: referencedUnits,
  });
  assert.deepEqual([...membership.matchedUnitIds], ["1000000000043"]);
});

test("an unselected source file cannot fall back to course-wide access", async () => {
  const emptyDb = { query: async () => ({ rows: [] }) };
  const membership = await __testResolveFileMembershipInProfile(emptyDb, {
    file: { id: 99, class_session_id: 121, course_id: 10, visibility: "COURSE" },
    profileRow: { mode: "INDEPENDENT", profile_id: 5, course_id: 10, source_live_class_id: null },
    units: referencedUnits,
  });
  assert.deepEqual([...membership.matchedUnitIds], []);
  assert.equal(membership.courseWideMatch, false);
});
