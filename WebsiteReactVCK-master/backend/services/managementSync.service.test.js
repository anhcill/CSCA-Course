import assert from "node:assert/strict";
import test from "node:test";
import { SyncValidationError, parseManagementEvent } from "./managementSync.service.js";

const validEvent = (overrides = {}) => ({
  eventId: "evt-course-001",
  eventType: "course.upserted",
  occurredAt: "2026-09-21T08:00:00.000Z",
  source: "internal-management",
  payload: {
    courseSourceId: "course-csca-01",
    title: "CSCA Toán nền tảng",
    teacherSourceId: "teacher-anh",
  },
  ...overrides,
});

test("parseManagementEvent accepts a supported InternalManagement envelope", () => {
  const event = parseManagementEvent(validEvent());
  assert.equal(event.eventId, "evt-course-001");
  assert.equal(event.eventType, "course.upserted");
  assert.equal(event.source, "internal-management");
  assert.equal(event.occurredAt.toISOString(), "2026-09-21T08:00:00.000Z");
});

test("parseManagementEvent rejects an unsupported source or event type", () => {
  assert.throws(
    () => parseManagementEvent(validEvent({ source: "browser" })),
    SyncValidationError,
  );
  assert.throws(
    () => parseManagementEvent(validEvent({ eventType: "course.deleted" })),
    SyncValidationError,
  );
});

test("parseManagementEvent requires a payload object", () => {
  assert.throws(
    () => parseManagementEvent(validEvent({ payload: [] })),
    SyncValidationError,
  );
});
