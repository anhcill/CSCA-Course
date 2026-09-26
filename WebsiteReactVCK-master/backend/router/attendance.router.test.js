import assert from "node:assert/strict";
import test from "node:test";
import { buildAttendancePolicy } from "./attendance.router.js";

test("attendance is allowed only on the scheduled local calendar day", () => {
  const policy = buildAttendancePolicy({
    attendanceDate: "2026-09-26",
    todayDate: "2026-09-26",
    status: "scheduled",
    attendanceLocked: false,
  });

  assert.equal(policy.isAttendanceDay, true);
  assert.equal(policy.canMarkAttendance, true);
  assert.equal(policy.reason, null);
});

test("attendance is rejected before or after the scheduled day", () => {
  const before = buildAttendancePolicy({
    attendanceDate: "2026-09-26",
    todayDate: "2026-09-25",
    status: "scheduled",
  });
  const after = buildAttendancePolicy({
    attendanceDate: "2026-09-26",
    todayDate: "2026-09-27",
    status: "scheduled",
  });

  assert.equal(before.canMarkAttendance, false);
  assert.equal(after.canMarkAttendance, false);
  assert.match(before.reason, /đúng ngày/i);
  assert.match(after.reason, /đúng ngày/i);
});

test("a recorded attendance session remains locked for every role", () => {
  const policy = buildAttendancePolicy({
    attendanceDate: "2026-09-26",
    todayDate: "2026-09-26",
    status: "scheduled",
    attendanceLocked: true,
  });

  assert.equal(policy.isLocked, true);
  assert.equal(policy.canMarkAttendance, false);
  assert.match(policy.reason, /không thể chỉnh sửa/i);
});

test("cancelled sessions can never be marked", () => {
  const policy = buildAttendancePolicy({
    attendanceDate: "2026-09-26",
    todayDate: "2026-09-26",
    status: "cancelled",
  });

  assert.equal(policy.canMarkAttendance, false);
  assert.match(policy.reason, /đã hủy/i);
});
