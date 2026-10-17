const JITSI_ALLOWED_HOSTS = new Set([
  "meet.jit.si",
  ...String(import.meta.env.VITE_JITSI_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
]);

export const MEETING_OPEN_EARLY_MINUTES = 15;
export const MEETING_CLOSE_LATE_MINUTES = 30;

export const getMeetingWindowState = (session, now = Date.now()) => {
  const startValue = session?.start_time ?? session?.startTime;
  const endValue = session?.end_time ?? session?.endTime;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  const current = now instanceof Date ? now.getTime() : Number(now);
  const opensAt = start - MEETING_OPEN_EARLY_MINUTES * 60 * 1000;
  const closesAt = end + MEETING_CLOSE_LATE_MINUTES * 60 * 1000;
  const isValid = Number.isFinite(start) && Number.isFinite(end);
  return {
    opensAt,
    closesAt,
    isOpen: isValid && current >= opensAt && current <= closesAt,
    isTooEarly: isValid && current < opensAt,
    isClosed: isValid && current > closesAt,
  };
};

export const isJitsiMeeting = (meetingUrl) => {
  try {
    const hostname = new URL(meetingUrl).hostname.toLowerCase();
    return JITSI_ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
};

// Reserve the target window inside the click event, before the access API is
// awaited. Browsers otherwise commonly treat window.open after an async call
// as a popup and block the one-click external meeting flow.
export const reserveMeetingWindow = () => {
  const meetingWindow = window.open("", "_blank");
  if (meetingWindow) meetingWindow.opener = null;
  return meetingWindow;
};

export const openReservedMeeting = (meetingWindow, meetingUrl, { sessionId, navigate } = {}) => {
  if (sessionId && isJitsiMeeting(meetingUrl)) {
    if (meetingWindow && !meetingWindow.closed) meetingWindow.close();
    const roomPath = `/lms/live-room/${encodeURIComponent(sessionId)}`;
    if (navigate) navigate(roomPath);
    else window.location.assign(roomPath);
    return "embedded";
  }

  if (meetingWindow && !meetingWindow.closed) {
    meetingWindow.location.replace(meetingUrl);
    return "external";
  }
  // If a browser blocks the auxiliary tab, preserve a working one-click
  // fallback instead of silently doing nothing.
  window.location.assign(meetingUrl);
  return "external";
};

export const closeReservedMeeting = (meetingWindow) => {
  if (meetingWindow && !meetingWindow.closed) meetingWindow.close();
};
