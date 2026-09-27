const pad = (value) => String(value).padStart(2, "0");

const formatUtc = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid calendar date");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};

export const escapeIcsText = (value = "") => String(value)
  .replace(/\\/g, "\\\\")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,")
  .replace(/\r?\n/g, "\\n");

const foldLine = (line) => line.length <= 73 ? line : line.match(/.{1,73}/g).join("\r\n ");

export const buildClassCalendarIcs = ({ classTitle, sessions, calendarUrlBase = "" }) => {
  const events = (sessions || []).map((session) => {
    const sessionUrl = calendarUrlBase ? `${calendarUrlBase.replace(/\/$/, "")}/sessions/${session.id}` : "";
    const description = [
      "Buổi học CSCA Academy.",
      session.change_reason ? `Ghi chú: ${session.change_reason}` : "",
      sessionUrl ? `Mở không gian buổi học: ${sessionUrl}` : "",
    ].filter(Boolean).join("\n");
    return [
      "BEGIN:VEVENT",
      `UID:csca-session-${session.id}@csca.academy`,
      `DTSTAMP:${formatUtc(new Date())}`,
      `DTSTART:${formatUtc(session.start_time)}`,
      `DTEND:${formatUtc(session.end_time)}`,
      `SUMMARY:${escapeIcsText(session.title || classTitle)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `STATUS:${session.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    ].map(foldLine).join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CSCA Academy//LMS Calendar//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(classTitle || "Lịch học CSCA")}`,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};

export const buildGoogleCalendarUrl = ({ title, startTime, endTime, details = "", location = "" }) => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "Buổi học CSCA",
    dates: `${formatUtc(startTime)}/${formatUtc(endTime)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
