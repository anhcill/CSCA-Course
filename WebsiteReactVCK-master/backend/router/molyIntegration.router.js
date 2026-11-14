import express from "express";
import { getClient, query } from "../db/connect.js";
import {
  requireMolyIntegration,
  requireMolyReadIntegration,
} from "../middleware/requireMolyIntegration.js";
import { ExternalIntegrationError } from "../services/externalCourseMapping.service.js";
import {
  MOLY_SOURCE_SYSTEM,
  enqueueMolyIntegrationEvent,
  parseGrantWirePayload,
  parseProvisionWirePayload,
  parseRevokeWirePayload,
  queryCourseOwnershipForMoly,
} from "../services/molyIntegration.service.js";

const sendError = (res, error, correlationId = null) => {
  if (error instanceof ExternalIntegrationError) {
    return res.status(error.statusCode).json({
      success: false,
      errorCode: error.errorCode,
      message: error.message,
      ...(correlationId ? { correlation_id: correlationId } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  console.error("[molyIntegration] Unhandled integration error:", error);
  return res.status(500).json({
    success: false,
    errorCode: "INTERNAL_ERROR",
    message: "Failed to process Moly integration request.",
    ...(correlationId ? { correlation_id: correlationId } : {}),
  });
};

/**
 * Signed server-to-server integration endpoints for Moly Studio.
 * Mutating routes validate signature/freshness and durably enqueue into
 * `integration_inbox` before acknowledgment.
 */
export const createMolyIntegrationRouter = ({
  db = { query, getClient },
  verifyMutation = requireMolyIntegration,
  verifyRead = requireMolyReadIntegration,
} = {}) => {
  const router = express.Router();

  const handleInboxMutation = (parseFn) => async (req, res) => {
    const headerMeta = req.molyIntegration || {};
    const correlationId = headerMeta.correlationId || req.body?.correlation_id || null;
    try {
      const parsed = parseFn(req.body, headerMeta);
      const enqueued = await enqueueMolyIntegrationEvent(db, parsed, {
        headersSnapshot: {
          correlationId: headerMeta.correlationId || parsed.correlationId,
          eventTimestamp: headerMeta.eventTimestamp || null,
          idempotencyKey: headerMeta.idempotencyKey || parsed.idempotencyKey,
        },
      });
      return res.status(enqueued.httpStatus).json(enqueued.body);
    } catch (error) {
      return sendError(res, error, correlationId);
    }
  };

  router.post("/users/provision", verifyMutation, handleInboxMutation(parseProvisionWirePayload));
  router.post("/entitlements/grant", verifyMutation, handleInboxMutation(parseGrantWirePayload));
  router.post("/entitlements/revoke", verifyMutation, handleInboxMutation(parseRevokeWirePayload));

  router.post("/ownership/query", verifyRead, async (req, res) => {
    const headerMeta = req.molyIntegration || {};
    const correlationId = headerMeta.correlationId || req.body?.correlation_id || null;
    try {
      const result = await queryCourseOwnershipForMoly(db, req.body, headerMeta);
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error, correlationId);
    }
  });

  router.post("/moly/events/status", verifyRead, async (req, res) => {
    const headerMeta = req.molyIntegration || {};
    const correlationId = headerMeta.correlationId || req.body?.correlation_id || null;
    try {
      const eventId = typeof req.body?.event_id === "string" ? req.body.event_id.trim() : null;
      const idempotencyKey = typeof req.body?.idempotency_key === "string" ? req.body.idempotency_key.trim() : null;
      if (!eventId && !idempotencyKey) {
        throw new ExternalIntegrationError(422, "VALIDATION_ERROR", "event_id or idempotency_key is required.");
      }
      const rows = (await db.query(
        `SELECT id, source_system, event_id, idempotency_key, correlation_id, event_type,
                status, attempt_count, max_attempts, next_retry_at, processed_at,
                last_error_code, last_error_message, response_status, response_body,
                created_at, updated_at
         FROM integration_inbox
         WHERE source_system = $1
           AND ($2::text IS NULL OR event_id = $2)
           AND ($3::text IS NULL OR idempotency_key = $3)
         ORDER BY id DESC
         LIMIT 10`,
        [MOLY_SOURCE_SYSTEM, eventId, idempotencyKey],
      )).rows;
      return res.status(200).json({
        success: true,
        correlation_id: correlationId,
        data: rows,
      });
    } catch (error) {
      return sendError(res, error, correlationId);
    }
  });

  return router;
};

const defaultRouter = createMolyIntegrationRouter();
export default defaultRouter;
