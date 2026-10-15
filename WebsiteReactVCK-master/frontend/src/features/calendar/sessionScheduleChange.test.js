import test from "node:test";
import assert from "node:assert/strict";
import {
  hasSessionTimeChanged,
  isSessionRescheduled,
  sessionChangeReason,
} from "./sessionScheduleChange.js";

test("detects a Management time update even when status remains scheduled", () => {
  const session = {
    status: "scheduled",
    original_start_at: "2026-10-15T01:00:00.000Z",
    original_end_at: "2026-10-15T02:00:00.000Z",
    start_time: "2026-10-15T02:00:00.000Z",
    end_time: "2026-10-15T03:00:00.000Z",
  };

  assert.equal(hasSessionTimeChanged(session), true);
  assert.equal(isSessionRescheduled(session), true);
});

test("keeps an unchanged scheduled session unmarked", () => {
  const session = {
    status: "scheduled",
    original_start_at: "2026-10-15T01:00:00.000Z",
    original_end_at: "2026-10-15T02:00:00.000Z",
    start_time: "2026-10-15T01:00:00.000Z",
    end_time: "2026-10-15T02:00:00.000Z",
  };

  assert.equal(hasSessionTimeChanged(session), false);
  assert.equal(isSessionRescheduled(session), false);
});

test("recognizes explicit status and change reason variants", () => {
  assert.equal(isSessionRescheduled({ status: "RESCHEDULED" }), true);
  assert.equal(isSessionRescheduled({ status: "scheduled", changeReason: "Đổi phòng học" }), true);
  assert.equal(sessionChangeReason({}), "Thời gian buổi học đã được cập nhật từ hệ thống quản lý.");
});
