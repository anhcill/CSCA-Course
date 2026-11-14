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
      const mapping = await upsertManualCourseMapping(db, {
        ...req.body,
        actorId: req.user?.id ?? null,
      });
      await recordAudit({
        db,
        actorId: req.user?.id ?? null,
        action: "integration.course_mapping_upserted",
        entityType: "external_course_mapping",
        entityId: mapping.id,
        afterState: mapping,
        metadata: {
          ip: req.ip || null,
          sourceSystem: mapping.sourceSystem,
          externalCourseId: mapping.externalCourseId,
          localCourseId: mapping.localCourseId,
        },
      });
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
      const updated = await updateCourseMappingStatus(db, {
        id: req.params.id,
        status: req.body?.status,
        notes: req.body?.notes,
        actorId: req.user?.id ?? null,
      });
      await recordAudit({
        db,
        actorId: req.user?.id ?? null,
        action: "integration.course_mapping_status_updated",
        entityType: "external_course_mapping",
        entityId: updated.id,
        afterState: updated,
        metadata: {
          ip: req.ip || null,
          status: updated.status,
        },
      });
      return res.json({ success: true, data: updated });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

const defaultRouter = createExternalCourseMappingRouter();
export default defaultRouter;
