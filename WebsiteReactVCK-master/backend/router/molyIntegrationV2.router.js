import express from "express";
import { getClient, query } from "../db/connect.js";
import {
  requireMolyCatalogRead,
  requireMolyIntegration,
} from "../middleware/requireMolyIntegration.js";
import { exportCatalogCourses } from "../services/courseCatalogSync.service.js";
import { exportCourseCurriculum } from "../services/courseCurriculumSync.service.js";
import {
  getDelegatedUnitDetail,
  getDelegatedWorkspace,
  getPublicPreviewUnit,
  mintDelegatedLearningSession,
} from "../services/delegatedLearning.service.js";
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
  verifyWrite = requireMolyIntegration,
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

  router.get("/catalog/courses/:courseId/curriculum", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      if (isCatalogSyncKillSwitchActive(env)) {
        return res.status(503).json({
          success: false,
          errorCode: "SYNC_KILL_SWITCH_ACTIVE",
          message: "Catalog integration sync is temporarily paused by kill switch.",
          ...(correlationId ? { correlation_id: correlationId } : {}),
        });
      }
      const data = await exportCourseCurriculum({
        db,
        courseId: req.params.courseId,
        profileId: req.query?.profileId ?? req.query?.profile_id ?? null,
        afterRevision: req.query?.after_revision ?? req.query?.afterRevision ?? "0",
        afterId: req.query?.after_id ?? req.query?.afterId ?? "0",
        cursor: req.query?.cursor || null,
        limit: req.query?.limit ?? 200,
        includeTombstoned: req.query?.include_tombstoned ?? req.query?.includeTombstoned ?? true,
        correlationId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/sessions", verifyWrite, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await mintDelegatedLearningSession({
        db,
        externalUserId: req.body?.externalUserId ?? req.body?.userId,
        courseId: req.body?.courseId ?? null,
        profileId: req.body?.profileId,
        scopes: req.body?.scopes,
        ttlSeconds: req.body?.ttlSeconds,
        correlationId,
        metadata: req.body?.metadata || {},
        env,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/offerings/:profileId/workspace", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const sessionToken = req.get?.("X-Delegated-Session") || req.headers?.["x-delegated-session"] || null;
      const data = await getDelegatedWorkspace({
        db,
        sessionToken,
        profileId: req.params.profileId,
        unitId: req.query?.unitId ?? req.query?.unit_id ?? null,
        env,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/offerings/:profileId/units/:unitId", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const sessionToken = req.get?.("X-Delegated-Session") || req.headers?.["x-delegated-session"] || null;
      const data = await getDelegatedUnitDetail({
        db,
        sessionToken,
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        env,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/preview/offerings/:profileId/units/:unitId", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await getPublicPreviewUnit({
        db,
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        env,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  return router;
};

export default createMolyIntegrationV2Router();
