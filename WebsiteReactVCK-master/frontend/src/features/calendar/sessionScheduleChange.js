const timestamp = (value) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

export const hasSessionTimeChanged = (session = {}) => {
  const originalStart = timestamp(session.original_start_at ?? session.originalStartAt);
  const originalEnd = timestamp(session.original_end_at ?? session.originalEndAt);
  const currentStart = timestamp(session.start_time ?? session.startTime);
  const currentEnd = timestamp(session.end_time ?? session.endTime);

  return (originalStart !== null && currentStart !== null && originalStart !== currentStart)
    || (originalEnd !== null && currentEnd !== null && originalEnd !== currentEnd);
};

export const isSessionRescheduled = (session = {}) => (
  String(session.status || "").toLowerCase() === "rescheduled"
  || hasSessionTimeChanged(session)
  || Boolean(session.change_reason ?? session.changeReason)
);

export const sessionChangeReason = (session = {}) => (
  session.change_reason
  ?? session.changeReason
  ?? "Thời gian buổi học đã được cập nhật từ hệ thống quản lý."
);
