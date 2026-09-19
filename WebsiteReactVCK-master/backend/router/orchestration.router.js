import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";

const router = express.Router();
const adminOnly = [protectRoute, requireAdmin];

const sendError = (res, status, message, errorCode) => res.status(status).json({
  success: false, message, errorCode,
});

const serializeJob = (row) => ({
  id: String(row.id),
  eventType: row.event_type,
  entityType: row.entity_type,
  entityId: row.entity_id,
  status: row.status,
  retryCount: Number(row.retry_count || 0),
  maxRetries: Number(row.max_retries || 5),
  lastError: row.last_error || null,
  idempotencyKey: row.idempotency_key || null,
  correlationId: row.correlation_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  payload: row.payload || {},
});

router.get("/overview", ...adminOnly, async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS total_jobs,
              COUNT(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING'))::int AS outbox_pending,
              COUNT(*) FILTER (WHERE status = 'DEAD_LETTER')::int AS dead_letter_count,
              COUNT(*) FILTER (WHERE status = 'SUCCESS' AND created_at >= NOW() - INTERVAL '24 hours')::int AS successes,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS window_total,
              MAX(updated_at) AS last_sync_time
       FROM lms_sync_jobs`,
    );
    const row = result.rows[0] || {};
    const total = Number(row.window_total || 0);
    const successes = Number(row.successes || 0);
    return res.json({ success: true, data: {
      totalJobs: Number(row.total_jobs || 0),
      outboxPending: Number(row.outbox_pending || 0),
      deadLetterCount: Number(row.dead_letter_count || 0),
      successRate: total ? `${((successes / total) * 100).toFixed(1)}%` : "0.0%",
      lastSyncTime: row.last_sync_time || null,
    } });
  } catch (error) {
    console.error("Error loading sync overview:", error);
    return sendError(res, 500, "Không thể tải thống kê đồng bộ", "INTERNAL_ERROR");
  }
});

router.get("/delivery-queue", ...adminOnly, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "ALL";
  const allowedStatuses = new Set(["ALL", "PENDING", "PROCESSING", "SUCCESS", "FAILED", "DEAD_LETTER"]);
  if (!allowedStatuses.has(status)) return sendError(res, 422, "status không hợp lệ", "VALIDATION_ERROR");
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 10000);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const params = [];
  const filters = [];
  if (status !== "ALL") {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  params.push(limit, (page - 1) * limit);
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  try {
    const [items, total] = await Promise.all([
      query(`SELECT * FROM lms_sync_jobs ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      query(`SELECT COUNT(*)::int AS total FROM lms_sync_jobs ${where}`, params.slice(0, status === "ALL" ? 0 : 1)),
    ]);
    return res.json({ success: true, data: {
      items: items.rows.map(serializeJob),
      total: Number(total.rows[0]?.total || 0),
      page,
      limit,
    } });
  } catch (error) {
    console.error("Error loading delivery queue:", error);
    return sendError(res, 500, "Không thể tải hàng đợi đồng bộ", "INTERNAL_ERROR");
  }
});

router.post("/delivery-queue/:id/retry", ...adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return sendError(res, 422, "queueId không hợp lệ", "VALIDATION_ERROR");
  try {
    const result = await query(
      `UPDATE lms_sync_jobs
       SET status = 'PENDING', retry_count = 0, last_error = NULL,
           next_attempt_at = NOW(), processed_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('FAILED', 'DEAD_LETTER')
       RETURNING *`,
      [id],
    );
    if (result.rows.length === 0) return sendError(res, 409, "Job không ở trạng thái có thể retry", "INVALID_JOB_STATE");
    await recordAuditEvent({
      actorId: req.user.id,
      action: "sync.job_retried",
      entityType: "lms_sync_job",
      entityId: id,
      afterState: { status: "PENDING", manual: true },
      metadata: { ip: req.ip, correlationId: result.rows[0].correlation_id },
    });
    return res.json({ success: true, data: serializeJob(result.rows[0]) });
  } catch (error) {
    console.error("Error retrying sync job:", error);
    return sendError(res, 500, "Không thể retry job đồng bộ", "INTERNAL_ERROR");
  }
});

export default router;
