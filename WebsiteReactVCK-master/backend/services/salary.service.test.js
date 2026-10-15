import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSessionDurationHours,
  isSessionCompleted,
} from "./salary.service.js";

test("calculateSessionDurationHours calculates exact hours based on start and end time", () => {
  const start = new Date("2026-10-15T08:00:00.000Z");
  const end = new Date("2026-10-15T10:00:00.000Z");
  const hours = calculateSessionDurationHours(start, end);
  assert.equal(hours, 2.0);

  // 1.5 hours test
  const end930 = new Date("2026-10-15T09:30:00.000Z");
  assert.equal(calculateSessionDurationHours(start, end930), 1.5);

  // Fallback to default 2.0 if missing
  assert.equal(calculateSessionDurationHours(null, null), 2.0);
  assert.equal(calculateSessionDurationHours(end, start), 2.0);
});

test("isSessionCompleted checks status and end_time correctly", () => {
  // Session with ended status is completed
  assert.equal(isSessionCompleted({ status: "ended", end_time: new Date("2099-01-01") }), true);

  // Past session is completed even if status not updated
  assert.equal(isSessionCompleted({ status: "scheduled", end_time: new Date("2020-01-01") }), true);

  // Future scheduled session is not completed
  assert.equal(isSessionCompleted({ status: "scheduled", end_time: new Date("2099-01-01") }), false);
});

test("salary formula: 20 sessions, 2 taught sessions calculation verification", () => {
  const hourlyRate = 250000; // 250.000 đ/h
  const sessionHours = 2.0;
  const totalSessions = 20;
  const completedSessions = 2;

  const sessionFee = sessionHours * hourlyRate; // 500.000 đ / buổi
  assert.equal(sessionFee, 500000);

  const accruedSalary = completedSessions * sessionFee; // 2 * 500.000 = 1.000.000 đ
  assert.equal(accruedSalary, 1000000);

  const projectedSalary = totalSessions * sessionFee; // 20 * 500.000 = 10.000.000 đ
  assert.equal(projectedSalary, 10000000);

  const progressPct = Math.round((completedSessions / totalSessions) * 100);
  assert.equal(progressPct, 10);
});
