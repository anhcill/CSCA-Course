import assert from "node:assert/strict";
import test from "node:test";
import { buildAttendancePolicy, buildStudentCheckInPolicy, canManageSession } from "./attendance.router.js";

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

test("student check-in is limited to the live session window on the academy day", () => {
  const session = { startTime: "2026-09-26T02:00:00.000Z", endTime: "2026-09-26T03:30:00.000Z", status: "scheduled" };
  assert.equal(buildStudentCheckInPolicy({ ...session, now: "2026-09-26T01:44:59.000Z" }).canCheckIn, false);
  assert.equal(buildStudentCheckInPolicy({ ...session, now: "2026-09-26T01:45:00.000Z" }).canCheckIn, true);
  assert.equal(buildStudentCheckInPolicy({ ...session, now: "2026-09-26T03:30:01.000Z" }).canCheckIn, false);
  assert.equal(buildStudentCheckInPolicy({ ...session, now: "2026-09-27T02:20:00.000Z" }).canCheckIn, false);
});

test("student cannot overwrite an attendance record or a finalized sheet", () => {
  const session = { startTime: "2026-09-26T02:00:00.000Z", endTime: "2026-09-26T03:30:00.000Z", status: "scheduled", now: "2026-09-26T02:20:00.000Z" };
  assert.equal(buildStudentCheckInPolicy({ ...session, checkedIn: true }).canCheckIn, false);
  assert.equal(buildStudentCheckInPolicy({ ...session, finalized: true }).canCheckIn, false);
  assert.equal(buildStudentCheckInPolicy({ ...session, status: "cancelled" }).canCheckIn, false);
  assert.equal(buildStudentCheckInPolicy({ ...session, status: "ended" }).canCheckIn, false);
});

test("revoked class teacher cannot access attendance even when still recorded as instructor", async () => {
  const session = { live_class_id: 7, instructor_id: 11 };
  const teacher = { id: 11, role: "creator" };
  const db = (status) => ({ query: async () => ({ rows: status ? [{ status }] : [] }) });
  assert.equal(await canManageSession(session, teacher, db("active")), true);
  assert.equal(await canManageSession(session, teacher, db("revoked")), false);
  assert.equal(await canManageSession(session, teacher, db(null)), true);
  assert.equal(await canManageSession(session, { id: 12, role: "creator" }, db(null)), false);
  assert.equal(await canManageSession(session, { id: 12, role: "admin" }, db("revoked")), true);
});
