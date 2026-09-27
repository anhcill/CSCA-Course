import assert from "node:assert/strict";
import test from "node:test";
import { buildClassCalendarIcs, buildGoogleCalendarUrl, escapeIcsText } from "./calendarIcs.service.js";

test("ICS export escapes text and does not include a meeting secret", () => {
  const ics = buildClassCalendarIcs({
    classTitle: "Lớp HSK, 4",
    calendarUrlBase: "https://www.molycourse.online/lms/courses/2/classes/3",
    sessions: [{ id: 8, title: "Buổi; 1, ôn tập", start_time: "2026-10-01T12:00:00.000Z", end_time: "2026-10-01T13:30:00.000Z", status: "scheduled" }],
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Buổi\\; 1\\, ôn tập/);
  assert.match(ics, /DTSTART:20261001T120000Z/);
  assert.match(ics, /sessions\/8/);
  assert.doesNotMatch(ics, /zoom\.us|meet\.google\.com/);
});

test("Google Calendar URL is a pre-filled event template", () => {
  const url = buildGoogleCalendarUrl({ title: "Buổi học", startTime: "2026-10-01T12:00:00.000Z", endTime: "2026-10-01T13:00:00.000Z" });
  assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(url, /action=TEMPLATE/);
  assert.match(url, /dates=20261001T120000Z%2F20261001T130000Z/);
  assert.equal(escapeIcsText("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
});
