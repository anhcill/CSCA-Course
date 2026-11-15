import express from "express";
import { getClient, query } from "../db/connect.js";
import { requireMolyCatalogRead } from "../middleware/requireMolyIntegration.js";
import { exportCatalogCourses } from "../services/courseCatalogSync.service.js";
import { ExternalIntegrationError } from "../services/externalCourseMapping.service.js";
import { isCatalogSyncKillSwitchActive } from "../services/integrationLogger.service.js";

const sendV2Error = (res, error, correlationId = null) => {
  if (error instanceof ExternalIntegrationError) {
    return res.status(error.statusCode).json({
      success: false,
      errorCode: error.errorCode,
      message: error.message,
      ...(correlationId ? { correlation_id: correlationId } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  console.error("[molyIntegrationV2] Unhandled v2 integration error:", error);
  return res.status(500).json({
    success: false,
    errorCode: "INTERNAL_ERROR",
    message: "Failed to process v2 catalog integration request.",
    ...(correlationId ? { correlation_id: correlationId } : {}),
  });
};

/**
 * Signed server-to-server v2 integration router on CSCA-Course (`/api/integrations/v2`).
 */
export const createMolyIntegrationV2Router = ({
  db = { query, getClient },
  verifyRead = requireMolyCatalogRead,
  env = process.env,
} = {}) => {
  const router = express.Router();

  router.get("/catalog/courses", verifyRead, async (req, res) => {
    const corr = req.molyIntegration?.correlationId || null;
    if (isCatalogSyncKillSwitchActive(env)) {
      return res.status(503).json({
        success: false,
        errorCode: "SYNC_KILL_SWITCH_ACTIVE",
        message: "Course catalog sync export is temporarily paused by kill switch.",
        correlation_id: corr,
      });
    }

    try {
      const exported = await exportCatalogCourses({
        db,
        cursor: req.query.cursor || null,
        afterRevision: req.query.afterRevision,
        afterId: req.query.afterId,
        snapshotAnchorRevision: req.query.snapshotAnchorRevision,
        limit: req.query.limit,
        includeTombstoned: req.query.includeTombstoned,
        correlationId: corr,
      });

      return res.status(200).json({
        success: true,
        correlation_id: exported.correlationId,
        data: {
          courses: exported.courses,
          pagination: exported.pagination,
        },
      });
    } catch (error) {
      return sendV2Error(res, error, corr);
    }
  });

  return router;
};

export default createMolyIntegrationV2Router();
