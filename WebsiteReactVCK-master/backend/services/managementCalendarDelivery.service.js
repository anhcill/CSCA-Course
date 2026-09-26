import crypto from "crypto";
import { getClient } from "../db/connect.js";

const SOURCE_SYSTEM = "CSCA_COURSE_LMS";
const OUTBOX_TABLE = "lms_management_calendar_outbox";
const SUPPORTED_EVENT_TYPES = new Set([
  "lms.schedule.upserted",
  "lms.schedule.archived",
  "lms.session.upserted",
  "lms.session.cancelled",
]);
const MAX_ERROR_LENGTH = 1500;

const text = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const asJson = (value) => (typeof value === "string" ? JSON.parse(value) : value);

const configuredEndpoint = () => {
  // Calendar uses the same signed InternalManagement webhook as attendance.
  // The fallback lets existing deployments opt in without a second secret.
  const rawUrl = text(
    process.env.MANAGEMENT_CALENDAR_WEBHOOK_URL || process.env.MANAGEMENT_ATTENDANCE_WEBHOOK_URL,
    1000,
  );
  const secret = text(
    process.env.MANAGEMENT_CALENDAR_WEBHOOK_SECRET || process.env.MANAGEMENT_ATTENDANCE_WEBHOOK_SECRET,
    1000,
  );
  if (!rawUrl || !secret) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { url: url.toString(), secret };
  } catch {
    return null;
  }
};

const deliveryError = (error) => String(error?.message || error || "Không thể gửi lịch sang InternalManagement")
  .replace(/\s+/g, " ")
  .slice(0, MAX_ERROR_LENGTH);

const retryDelaySeconds = (retryCount) => Math.min(60 * 60, 30 * (2 ** Math.min(retryCount, 7)));

const updateDelivery = async (client, id, values) => {
  const fields = [];
  const params = [];
  Object.entries(values).forEach(([column, value]) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  });
  params.push(id);
  await client.query(
    `UPDATE ${OUTBOX_TABLE} SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
    params,
  );
};

const markRetryableFailure = async (client, job, error, { incrementRetry = true } = {}) => {
  const retryCount = Number(job.retry_count || 0) + (incrementRetry ? 1 : 0);
  const exhausted = retryCount >= Number(job.max_retries || 12);
  await updateDelivery(client, job.id, {
    status: exhausted ? "DEAD_LETTER" : "PENDING",
    retry_count: retryCount,
    last_error: deliveryError(error),
    next_attempt_at: new Date(Date.now() + retryDelaySeconds(retryCount) * 1000),
    locked_at: null,
    locked_by: null,
    processed_at: exhausted ? new Date() : null,
  });
  return exhausted ? "DEAD_LETTER" : "PENDING";
};

const markPermanentFailure = async (client, job, error) => {
  await updateDelivery(client, job.id, {
    status: "DEAD_LETTER",
    last_error: deliveryError(error),
    locked_at: null,
    locked_by: null,
    processed_at: new Date(),
  });
  return "DEAD_LETTER";
};

const claimAvailableDeliveries = async (client, limit, workerId) => {
  const result = await client.query(
    `WITH claimable AS (
       SELECT id FROM ${OUTBOX_TABLE}
       WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
          OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '15 minutes')
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE ${OUTBOX_TABLE} job
     SET status = 'PROCESSING', locked_at = NOW(), locked_by = $2, last_attempt_at = NOW(), updated_at = NOW()
     FROM claimable WHERE job.id = claimable.id RETURNING job.*`,
    [limit, workerId],
  );
  return result.rows;
};

const deliverClaimedJob = async (client, job) => {
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    const status = await markRetryableFailure(client, job,
      "Chưa cấu hình MANAGEMENT_CALENDAR_WEBHOOK_URL hoặc MANAGEMENT_CALENDAR_WEBHOOK_SECRET", { incrementRetry: false });
    return { id: job.id, status, reason: "NOT_CONFIGURED" };
  }

  const payload = asJson(job.payload);
  const payloadJson = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac("sha256", endpoint.secret).update(payloadJson).digest("hex")}`;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10000);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      signal: abortController.signal,
      body: JSON.stringify({ eventId: job.event_id, eventType: job.event_type, payloadJson }),
    });
    if (response.ok) {
      await updateDelivery(client, job.id, {
        status: "SUCCESS", last_error: null, locked_at: null, locked_by: null, processed_at: new Date(),
      });
      return { id: job.id, status: "SUCCESS" };
    }
    const responseText = (await response.text()).slice(0, 900);
    const error = `InternalManagement trả HTTP ${response.status}${responseText ? `: ${responseText}` : ""}`;
    if (response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500) {
      return { id: job.id, status: await markRetryableFailure(client, job, error) };
    }
    return { id: job.id, status: await markPermanentFailure(client, job, error) };
  } catch (error) {
    return { id: job.id, status: await markRetryableFailure(client, job, error) };
  } finally {
    clearTimeout(timeout);
  }
};

const dateOnly = (value) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
};

const timestamp = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const schedulePayload = (schedule) => ({
  id: String(schedule.id),
  liveClassId: String(schedule.live_class_id),
  title: schedule.title || null,
  dayOfWeek: Number(schedule.day_of_week),
  startTime: schedule.start_time,
  endTime: schedule.end_time,
  timezone: schedule.timezone,
  startDate: dateOnly(schedule.start_date),
  endDate: dateOnly(schedule.end_date),
  status: schedule.status,
  version: Number(schedule.version || 1),
});

const sessionPayload = (session) => ({
  id: String(session.id),
  liveClassId: String(session.live_class_id),
  scheduleId: session.schedule_id === null || session.schedule_id === undefined ? null : String(session.schedule_id),
  title: session.title || null,
  startTime: timestamp(session.start_time),
  endTime: timestamp(session.end_time),
  status: session.status,
  meetingUrl: session.meet_url || null,
  changeReason: session.change_reason || null,
  version: Number(session.version || 1),
});

export const enqueueManagementCalendarDelivery = async (client, {
  managementClassId,
  eventType,
  lmsSchedule = null,
  lmsSession = null,
  correlationId,
}) => {
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) throw new Error("Unsupported Management calendar event type");
  if (!managementClassId) return null;

  const eventId = crypto.randomUUID();
  const payload = {
    schemaVersion: 1,
    sourceSystem: SOURCE_SYSTEM,
    occurredAt: new Date().toISOString(),
    correlationId,
    managementClassId: String(managementClassId),
    lmsSchedule: lmsSchedule ? schedulePayload(lmsSchedule) : null,
    lmsSession: lmsSession ? sessionPayload(lmsSession) : null,
  };
  const payloadJson = JSON.stringify(payload);
  const entity = lmsSession || lmsSchedule;
  const entityId = entity?.id ?? eventId;
  const version = Number(entity?.version || 1);
  const result = await client.query(
    `INSERT INTO ${OUTBOX_TABLE}
       (event_id, event_type, payload, payload_hash, correlation_id, idempotency_key)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id, event_id, status`,
    [
      eventId,
      eventType,
      payloadJson,
      crypto.createHash("sha256").update(payloadJson).digest("hex"),
      correlationId,
      `calendar:${eventType}:${entityId}:v${version}:${eventId}`,
    ],
  );
  return result.rows[0];
};

export const processAvailableManagementCalendarDeliveries = async ({ workerId, limit = 10 }) => {
  const client = await getClient();
  try {
    const jobs = await claimAvailableDeliveries(client, limit, workerId);
    const results = [];
    for (const job of jobs) results.push(await deliverClaimedJob(client, job));
    return results;
  } finally {
    client.release();
  }
};
