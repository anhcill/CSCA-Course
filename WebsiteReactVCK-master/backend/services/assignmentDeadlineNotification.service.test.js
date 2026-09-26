import assert from "node:assert/strict";
import test from "node:test";
import { getDeadlineReminderStage } from "./assignmentDeadlineNotification.service.js";

const now = Date.parse("2026-09-26T10:00:00.000Z");

test("assignment deadline reminders use escalating stages", () => {
  assert.equal(getDeadlineReminderStage("2026-09-27T06:00:00.000Z", now), "due_soon");
  assert.equal(getDeadlineReminderStage("2026-09-26T12:00:00.000Z", now), "urgent");
  assert.equal(getDeadlineReminderStage("2026-09-25T12:00:00.000Z", now), "overdue");
});

test("assignment deadline reminders ignore dates outside their delivery window", () => {
  assert.equal(getDeadlineReminderStage("2026-09-28T10:00:00.000Z", now), null);
  assert.equal(getDeadlineReminderStage("2026-09-23T10:00:00.000Z", now), null);
  assert.equal(getDeadlineReminderStage("invalid-date", now), null);
});
