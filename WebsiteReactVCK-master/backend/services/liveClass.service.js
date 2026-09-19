import { query } from "../db/connect.js";

const MEETING_HOSTS = ["meet.google.com", "zoom.us"];

export const getMeetingProvider = (meetingUrl) => {
  if (!meetingUrl) return null;
  let hostname;
  try {
    hostname = new URL(meetingUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostname === "meet.google.com") return "Google Meet";
  if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) return "Zoom";
  return null;
};

export const validateMeetingUrl = (meetingUrl) => {
  if (meetingUrl === undefined || meetingUrl === null || meetingUrl === "") return null;
  if (typeof meetingUrl !== "string" || meetingUrl.length > 500) return "meetUrl không hợp lệ";

  try {
    const parsed = new URL(meetingUrl);
    const hostname = parsed.hostname.toLowerCase();
    const isGoogleMeet = hostname === "meet.google.com";
    const isZoom = hostname === "zoom.us" || hostname.endsWith(".zoom.us");
    if (parsed.protocol !== "https:" || (!isGoogleMeet && !isZoom)) {
      return "meetUrl phải là đường dẫn HTTPS của Google Meet hoặc Zoom";
    }
  } catch {
    return "meetUrl không hợp lệ";
  }

  return null;
};

const formatSessionNotification = (session, mode) => {
  const start = new Date(session.start_time).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  });

  if (mode === "link-changed") {
    return {
      title: "Link phòng học đã được cập nhật",
      message: `Buổi học “${session.title}” lúc ${start} đã có link Meet/Zoom mới.`,
      dedupeKey: `live-session:${session.id}:link:${new Date(session.updated_at).getTime()}`,
    };
  }

  return {
    title: "Buổi học Live sắp bắt đầu",
    message: `Buổi học “${session.title}” sẽ bắt đầu lúc ${start}.`,
    dedupeKey: `live-session:${session.id}:upcoming`,
  };
};

export const notifyClassStudents = async (session, mode = "upcoming") => {
  const notification = formatSessionNotification(session, mode);
  await query(
    `INSERT INTO notifications (user_id, title, message, type, link_url, dedupe_key)
     SELECT ce.user_id, $2, $3, 'live_class', $4, $5
     FROM class_enrollments ce
     WHERE ce.live_class_id = $1 AND ce.status = 'active'
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [session.live_class_id, notification.title, notification.message, "/lms/live-schedule", notification.dedupeKey],
  );
};

export const notifyUpcomingSessions = async (sessions) => {
  for (const session of sessions) {
    await notifyClassStudents(session, "upcoming");
  }
};

export const isSupportedMeetingHost = (meetingUrl) => {
  if (!meetingUrl) return false;
  try {
    const hostname = new URL(meetingUrl).hostname.toLowerCase();
    return MEETING_HOSTS.includes(hostname) || hostname.endsWith(".zoom.us");
  } catch {
    return false;
  }
};
