import crypto from "crypto";
import os from "os";
import { getClient } from "../db/connect.js";

const SOURCE_SYSTEM = "CSCA_COURSE_LMS";
const EVENT_TYPE = "lms.attendance.recorded";
const MAX_ERROR_LENGTH = 1500;

const text = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

const asJson = (value) => (typeof value === "string" ? JSON.parse(value) : value);

const configuredEndpoint = () => {
  const rawUrl = text(process.env.MANAGEMENT_ATTENDANCE_WEBHOOK_URL, 1000);
  const secret = text(process.env.MANAGEMENT_ATTENDANCE_WEBHOOK_SECRET, 1000);
  if (!rawUrl || !secret) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { url: url.toString(), secret };
  } catch {
    return null;
  }
};

const deliveryError = (error) => String(error?.message || error || "Không thể gửi điểm danh sang InternalManagement")
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
    `UPDATE lms_management_attendance_outbox
     SET ${fields.join(", ")}, updated_at = NOW()
     WHERE id = $${params.length}`,
    params,
  );
};

const markRetryableFailure = async (client, job, error, { incrementRetry = true } = {}) => {
  const retryCount = Number(job.retry_count || 0) + (incrementRetry ? 1 : 0);
  const maxRetries = Number(job.max_retries || 12);
  const exhausted = retryCount >= maxRetries;
  const delay = retryDelaySeconds(retryCount);
  await updateDelivery(client, job.id, {
    status: exhausted ? "DEAD_LETTER" : "PENDING",
    retry_count: retryCount,
    last_error: deliveryError(error),
    next_attempt_at: new Date(Date.now() + (delay * 1000)),
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

const claimDeliveryById = async (client, id, workerId) => {
  const result = await client.query(
    `UPDATE lms_management_attendance_outbox
     SET status = 'PROCESSING', locked_at = NOW(), locked_by = $2, last_attempt_at = NOW(), updated_at = NOW()
     WHERE id = $1
       AND (
         (status = 'PENDING' AND next_attempt_at <= NOW())
         OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '15 minutes')
       )
     RETURNING *`,
    [id, workerId],
  );
  return result.rows[0] || null;
};

const claimAvailableDeliveries = async (client, limit, workerId) => {
  const result = await client.query(
    `WITH claimable AS (
       SELECT id
       FROM lms_management_attendance_outbox
       WHERE (status = 'PENDING' AND next_attempt_at <= NOW())
          OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '15 minutes')
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE lms_management_attendance_outbox job
     SET status = 'PROCESSING', locked_at = NOW(), locked_by = $2, last_attempt_at = NOW(), updated_at = NOW()
     FROM claimable
     WHERE job.id = claimable.id
     RETURNING job.*`,
    [limit, workerId],
  );
  return result.rows;
};

const deliverClaimedJob = async (client, job) => {
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    const status = await markRetryableFailure(client, job,
      "Chưa cấu hình MANAGEMENT_ATTENDANCE_WEBHOOK_URL hoặc MANAGEMENT_ATTENDANCE_WEBHOOK_SECRET", { incrementRetry: false });
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
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        eventId: job.event_id,
        eventType: job.event_type,
        payloadJson,
      }),
    });
    if (response.ok) {
      await updateDelivery(client, job.id, {
        status: "SUCCESS",
        last_error: null,
        locked_at: null,
        locked_by: null,
        processed_at: new Date(),
      });
      return { id: job.id, status: "SUCCESS" };
    }

    const responseText = (await response.text()).slice(0, 900);
    const error = `InternalManagement trả HTTP ${response.status}${responseText ? `: ${responseText}` : ""}`;
    // Mapping class/student may be provisioned a few moments after the LMS event.
    // Treat conflict, timeout and rate-limit responses as retryable; other 4xx are invalid payloads.
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

export const enqueueManagementAttendanceDelivery = async (client, {
  managementClassId,
  lmsSession,
  attendance,
  correlationId,
}) => {
  const eventId = crypto.randomUUID();
  const payload = {
    schemaVersion: 1,
    sourceSystem: SOURCE_SYSTEM,
    occurredAt: new Date().toISOString(),
    correlationId,
    managementClassId: String(managementClassId),
    lmsSession: {
      id: String(lmsSession.id),
      title: lmsSession.title || null,
      startTime: new Date(lmsSession.start_time).toISOString(),
      endTime: new Date(lmsSession.end_time).toISOString(),
      status: lmsSession.status,
    },
    attendance,
  };
  const payloadJson = JSON.stringify(payload);
  const result = await client.query(
    `INSERT INTO lms_management_attendance_outbox
       (event_id, event_type, payload, payload_hash, correlation_id, idempotency_key)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id, event_id, status`,
    [
      eventId,
      EVENT_TYPE,
      payloadJson,
      crypto.createHash("sha256").update(payloadJson).digest("hex"),
      correlationId,
      `attendance:${lmsSession.id}:${eventId}`,
    ],
  );
  return result.rows[0];
};

export const attemptManagementAttendanceDeliveryById = async (id, {
  workerId = `web-${os.hostname()}-${process.pid}`,
} = {}) => {
  const client = await getClient();
  try {
    const job = await claimDeliveryById(client, id, workerId);
    if (!job) return { id, status: "PENDING" };
    return await deliverClaimedJob(client, job);
  } finally {
    client.release();
  }
};

export const processAvailableManagementAttendanceDeliveries = async ({ workerId, limit = 10 }) => {
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
