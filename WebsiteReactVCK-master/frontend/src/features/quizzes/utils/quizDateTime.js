const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET = "+07:00";

const inputFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function toVietnamDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    inputFormatter.formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function vietnamDateTimeInputToIso(value) {
  if (!value) return null;
  const text = String(value).trim();
  const hasTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text);
  const date = new Date(localDateTime && !hasTimeZone ? `${text}${VIETNAM_OFFSET}` : text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
