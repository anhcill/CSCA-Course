const toGoogleUtc = (value) => {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};

export const googleCalendarEventUrl = ({ title, startTime, endTime, details = "" }) => {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "Buổi học CSCA",
    dates: `${toGoogleUtc(startTime)}/${toGoogleUtc(endTime)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const classCalendarIcsUrl = (classId) => `/api/live-classes/${encodeURIComponent(classId)}/calendar.ics`;
