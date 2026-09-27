import { query } from "../db/connect.js";
import { broadcastToClass } from "./notification.service.js";

const safeAnnouncement = (row) => ({
  id: row.id,
  liveClassId: row.live_class_id,
  classSessionId: row.class_session_id,
  title: row.title,
  message: row.message,
  linkUrl: row.link_url,
  attachmentUrl: row.attachment_url,
  status: row.status,
  scheduledAt: row.scheduled_at,
  sentAt: row.sent_at,
  createdAt: row.created_at,
  createdBy: row.created_by,
});

export const serializeAnnouncement = safeAnnouncement;

export const deliverClassAnnouncement = async (announcementId) => {
  const claim = await query(
    `UPDATE class_announcements
     SET status = 'sending', delivery_attempts = delivery_attempts + 1, updated_at = NOW()
     WHERE id = $1
       AND status IN ('draft', 'scheduled', 'failed')
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
     RETURNING *`,
    [announcementId],
  );
  const announcement = claim.rows[0];
  if (!announcement) return { delivered: false, reason: "not_due_or_already_processed" };

  try {
    const attachmentMessage = announcement.attachment_url ? " Có tài liệu đính kèm trong thông báo." : "";
    const notifications = await broadcastToClass({
      liveClassId: announcement.live_class_id,
      title: announcement.title,
      message: `${announcement.message}${attachmentMessage}`,
      eventType: "announcement.published",
      linkUrl: announcement.link_url || "/lms/live-schedule",
      data: {
        announcementId: announcement.id,
        classSessionId: announcement.class_session_id,
        attachmentUrl: announcement.attachment_url,
      },
      actorId: announcement.created_by,
      dedupePrefix: `announcement_${announcement.id}`,
    });
    const sent = await query(
      `UPDATE class_announcements
       SET status = 'sent', sent_at = NOW(), updated_at = NOW(), last_error = NULL
       WHERE id = $1 RETURNING *`,
      [announcement.id],
    );
    return { delivered: true, recipients: notifications.length, announcement: safeAnnouncement(sent.rows[0]) };
  } catch (error) {
    await query(
      `UPDATE class_announcements
       SET status = 'failed', last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [announcement.id, String(error.message || error).slice(0, 1000)],
    );
    throw error;
  }
};

export const processScheduledClassAnnouncements = async ({ limit = 25 } = {}) => {
  // Recover a claim if a worker stopped between claiming and delivering it.
  await query(
    `UPDATE class_announcements
     SET status = 'scheduled', updated_at = NOW()
     WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'`,
  );
  const due = await query(
    `SELECT id FROM class_announcements
     WHERE status IN ('scheduled', 'failed') AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC LIMIT $1`,
    [Math.max(1, Math.min(Number(limit) || 25, 100))],
  );
  const results = [];
  for (const row of due.rows) {
    try {
      results.push(await deliverClassAnnouncement(row.id));
    } catch (error) {
      console.error("[announcement] scheduled delivery failed:", error.message);
      results.push({ delivered: false, reason: "failed" });
    }
  }
  return results;
};
