import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { getClient, query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  ExternalIntegrationError,
  listCourseMappings,
  resolveExternalCourseMapping,
  updateCourseMappingStatus,
  upsertManualCourseMapping,
} from "../services/externalCourseMapping.service.js";
import {
  getMolyOpsV2Overview,
  linkExternalIdentityManually,
  listIntegrationConflicts,
  listMolyInboxOps,
  resolveIntegrationConflict,
  retryCourseOutboxJob,
  retryMolyInboxJob,
  retryMolySubjectSync,
} from "../services/molyIntegration.service.js";

const sendError = (res, error) => {
  if (error instanceof ExternalIntegrationError) {
    return res.status(error.statusCode).json({
      success: false,
      errorCode: error.errorCode,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  if (error?.code === "23503") {
    return res.status(422).json({
      success: false,
      errorCode: "FOREIGN_KEY_VIOLATION",
      message: "Referenced local course or profile does not exist.",
    });
  }
  console.error("[externalCourseMapping] Unhandled error:", error);
  return res.status(500).json({
    success: false,
    errorCode: "INTERNAL_ERROR",
    message: "Failed to process external course mapping request.",
  });
};

/**
 * Admin endpoints for explicit manual course mappings between external systems and CSCA-Course.
 */
export const createExternalCourseMappingRouter = ({
  db = { query, getClient },
  recordAudit = recordAuditEvent,
  protect = protectRoute,
  adminGuard = requireAdmin,
  env = process.env,
} = {}) => {
  const router = express.Router();
  const guard = [protect, adminGuard];

  router.get("/course-mappings", ...guard, async (req, res) => {
    try {
      const items = await listCourseMappings(db, {
        sourceSystem: req.query.sourceSystem,
        status: req.query.status,
        localCourseId: req.query.localCourseId,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({ success: true, data: items });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/course-mappings/resolve", ...guard, async (req, res) => {
    try {
      const mapping = await resolveExternalCourseMapping(db, {
        sourceSystem: req.query.sourceSystem,
        externalCourseId: req.query.externalCourseId,
        requireActive: req.query.requireActive !== "false",
      });
      return res.json({ success: true, data: mapping });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/course-mappings", ...guard, async (req, res) => {
    try {
      const mapping = await upsertManualCourseMapping(
        db,
        {
          ...req.body,
          actorId: req.user?.id ?? null,
        },
        {
          recordAudit,
          auditMetadata: {
            ip: req.ip || null,
            via: "admin_api",
          },
          env,
        },
      );
      return res.status(201).json({
        success: true,
        data: mapping,
        message: "Manual external course mapping saved.",
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.patch("/course-mappings/:id/status", ...guard, async (req, res) => {
    try {
      const updated = await updateCourseMappingStatus(
        db,
        {
          id: req.params.id,
          status: req.body?.status,
          notes: req.body?.notes,
          actorId: req.user?.id ?? null,
        },
        {
          recordAudit,
          auditMetadata: {
            ip: req.ip || null,
            via: "admin_api",
          },
          env,
        },
      );
      return res.json({ success: true, data: updated });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/conflicts", ...guard, async (req, res) => {
    try {
      const items = await listIntegrationConflicts(db, {
        sourceSystem: req.query.sourceSystem,
        status: req.query.status,
        limit: req.query.limit,
      });
      return res.json({ success: true, data: items });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/conflicts/:id/resolve", ...guard, async (req, res) => {
    try {
      const result = await resolveIntegrationConflict(
        db,
        {
          conflictId: req.params.id,
          action: req.body?.action,
          targetUserId: req.body?.targetUserId,
          resolutionNote: req.body?.resolutionNote,
          replayInbox: req.body?.replayInbox !== false,
          actorId: req.user?.id ?? null,
        },
        { recordAudit, env },
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/identities/link", ...guard, async (req, res) => {
    try {
      const result = await linkExternalIdentityManually(
        db,
        {
          sourceSystem: req.body?.sourceSystem || "moly",
          externalUserId: req.body?.externalUserId,
          targetUserId: req.body?.targetUserId,
          status: req.body?.status || "active",
          sourceUpdatedAt: req.body?.sourceUpdatedAt || new Date(),
          actorId: req.user?.id ?? null,
        },
        { recordAudit, env },
      );
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/inbox-ops", ...guard, async (req, res) => {
    try {
      const overview = await listMolyInboxOps(db, {
        status: req.query.status,
        limit: req.query.limit,
      });
      return res.json({ success: true, data: overview });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/inbox-ops/:id/retry", ...guard, async (req, res) => {
    try {
      const result = await retryMolyInboxJob(
        db,
        {
          inboxId: req.params.id,
          actorId: req.user?.id ?? null,
          correlationId: req.headers["x-correlation-id"] || req.body?.correlationId || null,
        },
        { recordAudit, env },
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/ops/v2", ...guard, async (req, res) => {
    try {
      const overview = await getMolyOpsV2Overview(db, {
        limit: req.query.limit,
        env,
      });
      return res.json({ success: true, data: overview });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/outbox/:id/retry", ...guard, async (req, res) => {
    try {
      const result = await retryCourseOutboxJob(
        db,
        {
          outboxId: req.params.id,
          actorId: req.user?.id ?? null,
          correlationId: req.headers["x-correlation-id"] || req.body?.correlationId || null,
        },
        { recordAudit, env },
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/ops/retry-subject", ...guard, async (req, res) => {
    try {
      const result = await retryMolySubjectSync(
        db,
        {
          externalUserId: req.body?.externalUserId ?? req.body?.external_user_id ?? null,
          userId: req.body?.userId ?? req.body?.user_id ?? null,
          courseId: req.body?.courseId ?? req.body?.course_id ?? null,
          profileId: req.body?.profileId ?? req.body?.profile_id ?? null,
          domain: req.body?.domain || "all",
          actorId: req.user?.id ?? null,
          correlationId: req.headers["x-correlation-id"] || req.body?.correlationId || null,
        },
        { recordAudit, env },
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

const defaultRouter = createExternalCourseMappingRouter();
export default defaultRouter;
