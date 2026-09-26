import { query } from "../db/connect.js";

/**
 * Service to manage reliable notification delivery, idempotency (dedupe),
 * and class-wide broadcasts.
 */

export const createNotification = async ({
  userId,
  title,
  message,
  eventType = "system",
  linkUrl = null,
  data = {},
  actorId = null,
  dedupeKey = null,
}) => {
  if (!userId || !title || !message) return null;

  try {
    if (dedupeKey) {
      const existing = await query(
        "SELECT id FROM notifications WHERE user_id = $1 AND dedupe_key = $2",
        [userId, dedupeKey]
      );
      if (existing.rows.length > 0) return existing.rows[0];
    }

    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type, event_type, link_url, data, actor_id, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, user_id, title, message, event_type, is_read, link_url, created_at`,
      [
        userId,
        title,
        message,
        eventType.split(".")[0] || "system",
        eventType,
        linkUrl,
        JSON.stringify(data || {}),
        actorId,
        dedupeKey,
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error("[NotificationService] createNotification error:", error);
    return null;
  }
};

export const broadcastToClass = async ({
  liveClassId,
  title,
  message,
  eventType = "system",
  linkUrl = null,
  data = {},
  actorId = null,
  dedupePrefix = null,
}) => {
  if (!liveClassId || !title || !message) return [];

  try {
    const studentsRes = await query(
      `SELECT student_id AS user_id FROM class_enrollments
       WHERE live_class_id = $1 AND status = 'active'`,
      [liveClassId]
    );

    const recipientIds = studentsRes.rows.map((r) => r.user_id).filter(Boolean);
    if (recipientIds.length === 0) return [];

    const outboxDedupe = dedupePrefix ? `${dedupePrefix}_outbox` : null;
    await query(
      `INSERT INTO notification_outbox (event_type, recipient_ids, payload, dedupe_key, actor_id, status)
       VALUES ($1, $2, $3, $4, $5, 'delivered')
       ON CONFLICT DO NOTHING`,
      [
        eventType,
        recipientIds,
        JSON.stringify({ title, message, linkUrl, data }),
        outboxDedupe,
        actorId,
      ]
    );

    const createdNotifications = [];
    for (const uid of recipientIds) {
      const dedupeKey = dedupePrefix ? `${dedupePrefix}_user_${uid}` : null;
      const notif = await createNotification({
        userId: uid,
        title,
        message,
        eventType,
        linkUrl,
        data,
        actorId,
        dedupeKey,
      });
      if (notif) createdNotifications.push(notif);
    }

    return createdNotifications;
  } catch (error) {
    console.error("[NotificationService] broadcastToClass error:", error);
    return [];
  }
};

export const notifySessionRescheduled = async ({
  session,
  liveClassId,
  oldStart,
  newStart,
  reason,
  actorId,
}) => {
  const formattedNew = newStart ? new Date(newStart).toLocaleString("vi-VN") : "";
  const dedupePrefix = `session_${session.id}_reschedule_${new Date(newStart).getTime()}`;
  return broadcastToClass({
    liveClassId,
    title: `Dời lịch học: ${session.title || "Buổi học"}`,
    message: `Buổi học đã được dời sang ${formattedNew}.${reason ? ` Lý do: ${reason}` : ""}`,
    eventType: "session.rescheduled",
    linkUrl: `/lms/live-schedule?date=${new Date(newStart).toISOString().split("T")[0]}`,
    data: { sessionId: session.id, liveClassId, oldStart, newStart, reason },
    actorId,
    dedupePrefix,
  });
};

export const notifySessionCancelled = async ({
  session,
  liveClassId,
  reason,
  actorId,
}) => {
  const dedupePrefix = `session_${session.id}_cancel_${Date.now()}`;
  return broadcastToClass({
    liveClassId,
    title: `Hủy buổi học: ${session.title || "Buổi học"}`,
    message: `Buổi học vào ${new Date(session.start_time).toLocaleString("vi-VN")} đã được hủy.${reason ? ` Lý do: ${reason}` : ""}`,
    eventType: "session.cancelled",
    linkUrl: `/lms/live-schedule`,
    data: { sessionId: session.id, liveClassId, reason },
    actorId,
    dedupePrefix,
  });
};
