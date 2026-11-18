import express from "express";
import { Readable } from "stream";
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
  mintDelegatedVideoPlaybackToken,
  recordDelegatedVideoProgress,
} from "../services/delegatedLearning.service.js";
import { streamDelegatedLearningFile } from "../services/delegatedFiles.service.js";
import {
  getDelegatedAssignmentDetail,
  getDelegatedQuizDetail,
  saveDelegatedQuizAnswers,
  startDelegatedQuizAttempt,
  streamDelegatedSubmissionAsset,
  submitDelegatedAssignment,
  submitDelegatedQuizAttempt,
  uploadDelegatedQuizEssayAsset,
  uploadDelegatedSubmissionAsset,
} from "../services/delegatedAssessments.service.js";
import {
  createDelegatedUnitBookmark,
  createDelegatedUnitNote,
  createDelegatedUnitQaThread,
  deleteDelegatedUnitBookmark,
  deleteDelegatedUnitNote,
  getDelegatedUnitBookmarks,
  getDelegatedUnitNotes,
  getDelegatedUnitQaThreads,
  replyDelegatedUnitQaThread,
  updateDelegatedUnitNote,
  updateDelegatedUnitQaThreadStatus,
} from "../services/delegatedNotesQa.service.js";
import { ExternalIntegrationError } from "../services/externalCourseMapping.service.js";
import { isContentSyncKillSwitchActive } from "../services/integrationLogger.service.js";
import {
  exportContentStateForReconciliation,
  exportLearningStateForReconciliation,
  getMolyIntegrationHealthProbe,
} from "../services/molyIntegration.service.js";

const getDelegatedSessionHeader = (req) => req.get?.("X-Delegated-Session") || req.headers?.["x-delegated-session"] || null;
const getWriteCorrelationId = (req) => req.molyIntegration?.correlationId || req.get?.("X-Correlation-ID") || null;
const getWriteIdempotencyKey = (req) => req.molyIntegration?.idempotencyKey || req.get?.("Idempotency-Key") || req.body?.idempotencyKey || null;

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
  const customStatus = Number(error?.status || error?.statusCode);
  if (Number.isInteger(customStatus) && customStatus >= 400 && customStatus < 600 && error?.errorCode) {
    return res.status(customStatus).json({
      success: false,
      errorCode: error.errorCode,
      message: error.message || "Integration request failed.",
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
  fileStreamFetchImpl = null,
  fileReadStreamImpl = null,
  submissionUploadImpl = null,
  submissionFetchImpl = null,
} = {}) => {
  const router = express.Router();

  router.get("/health", verifyRead, async (req, res) => {
    const correlationId = req.molyIntegration?.correlationId || null;
    try {
      const probe = await getMolyIntegrationHealthProbe(db, { env });
      return res.status(probe.ready ? 200 : 503).json({
        success: probe.ready,
        ...(correlationId ? { correlation_id: correlationId } : {}),
        data: probe,
      });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/reconciliation/content-state", verifyRead, async (req, res) => {
    const correlationId = req.molyIntegration?.correlationId || null;
    try {
      const data = await exportContentStateForReconciliation(db, {
        courseId: req.query?.courseId ?? req.query?.course_id ?? null,
        courseIds: req.query?.courseIds ?? req.query?.course_ids ?? null,
        profileId: req.query?.profileId ?? req.query?.profile_id ?? null,
        profileIds: req.query?.profileIds ?? req.query?.profile_ids ?? null,
        limit: req.query?.limit,
        env,
      });
      return res.status(200).json({
        success: true,
        ...(correlationId ? { correlation_id: correlationId } : {}),
        data,
      });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/reconciliation/learning-state", verifyRead, async (req, res) => {
    const correlationId = req.molyIntegration?.correlationId || null;
    try {
      const data = await exportLearningStateForReconciliation(db, {
        externalUserId: req.query?.externalUserId ?? req.query?.external_user_id ?? null,
        externalUserIds: req.query?.externalUserIds ?? req.query?.external_user_ids ?? null,
        userId: req.query?.userId ?? req.query?.user_id ?? null,
        userIds: req.query?.userIds ?? req.query?.user_ids ?? null,
        courseId: req.query?.courseId ?? req.query?.course_id ?? null,
        courseIds: req.query?.courseIds ?? req.query?.course_ids ?? null,
        profileId: req.query?.profileId ?? req.query?.profile_id ?? null,
        profileIds: req.query?.profileIds ?? req.query?.profile_ids ?? null,
        limit: req.query?.limit,
        env,
      });
      return res.status(200).json({
        success: true,
        ...(correlationId ? { correlation_id: correlationId } : {}),
        data,
      });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/catalog/courses", verifyRead, async (req, res) => {
    const corr = req.molyIntegration?.correlationId || null;
    if (isContentSyncKillSwitchActive(env)) {
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
      if (isContentSyncKillSwitchActive(env)) {
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
        deviceSlotProof:
          req.get?.("X-Device-Slot-Proof")
          || req.headers?.["x-device-slot-proof"]
          || req.body?.deviceBindingProof
          || req.body?.device_binding_proof
          || null,
        clientIp: req.body?.clientIp || req.ip || null,
        userAgent: req.body?.userAgent || req.get?.("User-Agent") || "",
        actorRole: req.body?.actorRole ?? req.body?.metadata?.actorRole ?? null,
        actorEmail: req.body?.actorEmail ?? req.body?.metadata?.actorEmail ?? null,
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
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
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

  router.post("/learning/videos/:videoId/playback-token", verifyWrite, async (req, res) => {
    const correlationId = req.molyIntegration?.correlationId || req.get?.("X-Correlation-ID") || null;
    try {
      const sessionToken = req.get?.("X-Delegated-Session") || req.headers?.["x-delegated-session"] || null;
      const deviceSlotProof =
        req.get?.("X-Device-Slot-Proof")
        || req.headers?.["x-device-slot-proof"]
        || req.body?.deviceBindingProof
        || req.body?.device_binding_proof
        || null;
      const data = await mintDelegatedVideoPlaybackToken({
        db,
        sessionToken,
        videoId: req.params.videoId,
        unitId: req.body?.unitId ?? req.query?.unitId ?? null,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        ttlSeconds: req.body?.ttlSeconds ?? 60,
        deviceSlotProof,
        clientIp: req.body?.clientIp || req.ip || null,
        userAgent: req.body?.userAgent || req.get?.("User-Agent") || "",
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.put("/learning/videos/:videoId/progress", verifyWrite, async (req, res) => {
    const correlationId = req.molyIntegration?.correlationId || req.get?.("X-Correlation-ID") || null;
    try {
      const sessionToken = req.get?.("X-Delegated-Session") || req.headers?.["x-delegated-session"] || null;
      const data = await recordDelegatedVideoProgress({
        db,
        sessionToken,
        videoId: req.params.videoId,
        unitId: req.body?.unitId ?? null,
        profileId: req.body?.profileId ?? null,
        currentTimeSeconds: req.body?.currentTimeSeconds ?? req.body?.positionSeconds ?? 0,
        watchedDeltaSeconds: req.body?.watchedDeltaSeconds ?? req.body?.watchedSecondsDelta ?? 0,
        durationSeconds: req.body?.durationSeconds ?? null,
        clientSequence: req.body?.clientSequence ?? req.body?.seq ?? null,
        eventTimestamp: req.body?.eventTimestamp ?? req.body?.event_timestamp ?? null,
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  const sendStreamedResult = (res, result) => {
    for (const [headerName, headerValue] of Object.entries(result.headers || {})) {
      if (headerValue !== undefined && headerValue !== null) {
        res.setHeader(headerName, headerValue);
      }
    }
    res.status(result.status || 200);

    if (Buffer.isBuffer(result.body) || typeof result.body === "string") {
      return res.send(result.body);
    }
    const nodeStream = typeof result.body?.pipe === "function"
      ? result.body
      : (typeof result.body?.getReader === "function" ? Readable.fromWeb(result.body) : null);
    if (nodeStream) {
      const cleanup = () => {
        if (!res.writableEnded) {
          nodeStream.destroy?.();
        }
      };
      res.on("close", cleanup);
      nodeStream.on("error", () => {
        if (!res.writableEnded) res.destroy();
      });
      return nodeStream.pipe(res);
    }
    return res.end();
  };

  // ============================================================================
  // Day 5: Delegated Learning File Streaming Proxy (BFF only, <= 60s TTL)
  // ============================================================================
  router.get("/learning/files/:fileId/stream", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const result = await streamDelegatedLearningFile({
        db,
        fileId: req.params.fileId,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.query?.profileId ?? req.query?.profile_id ?? null,
        unitId: req.query?.unitId ?? req.query?.unit_id ?? null,
        disposition: req.query?.disposition ?? "inline",
        mode: req.query?.mode ?? "stream",
        rangeHeader: req.get?.("Range") || req.headers?.["range"] || null,
        ttlSeconds: req.query?.ttlSeconds ?? 60,
        fetchImpl: fileStreamFetchImpl || undefined,
        readStreamImpl: fileReadStreamImpl || undefined,
        env,
      });

      if (result.mode === "metadata") {
        return res.status(200).json({ success: true, data: result });
      }
      return sendStreamedResult(res, result);
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  // ============================================================================
  // Day 6: Delegated Quizzes & Assignments
  // ============================================================================
  router.get("/learning/offerings/:profileId/units/:unitId/quizzes/:quizId", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await getDelegatedQuizDetail({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        quizId: req.params.quizId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/quizzes/:quizId/attempts/start", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await startDelegatedQuizAttempt({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        quizId: req.params.quizId,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        unitId: req.body?.unitId ?? req.query?.unitId ?? null,
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.put("/learning/quizzes/attempts/:attemptId/answers", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await saveDelegatedQuizAnswers({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        attemptId: req.params.attemptId,
        questionId: req.body?.questionId ?? null,
        answer: req.body?.answer,
        answers: req.body?.answers ?? null,
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/quizzes/attempts/:attemptId/submit", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await submitDelegatedQuizAttempt({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        attemptId: req.params.attemptId,
        answers: req.body?.answers ?? null,
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/quizzes/:quizId/submission-assets", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await uploadDelegatedQuizEssayAsset({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        quizId: req.params.quizId,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        unitId: req.body?.unitId ?? req.query?.unitId ?? null,
        assetKind: req.body?.assetKind ?? "file",
        filename: req.body?.filename ?? req.body?.originalFilename ?? req.body?.fileName,
        mimeType: req.body?.mimeType,
        sizeBytes: req.body?.sizeBytes ?? null,
        contentBase64: req.body?.contentBase64 ?? null,
        uploadImpl: submissionUploadImpl || undefined,
        fetchImpl: submissionFetchImpl || undefined,
        env,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/submission-assets/:assetId/access", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const result = await streamDelegatedSubmissionAsset({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        assetId: req.params.assetId,
        profileId: req.query?.profileId ?? req.query?.profile_id ?? null,
        disposition: req.query?.disposition ?? "inline",
        fetchImpl: fileStreamFetchImpl || undefined,
        readStreamImpl: fileReadStreamImpl || undefined,
        env,
      });
      return sendStreamedResult(res, result);
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/offerings/:profileId/units/:unitId/assignments/:assignmentId", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await getDelegatedAssignmentDetail({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        assignmentId: req.params.assignmentId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/assignments/:assignmentId/submission-assets", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await uploadDelegatedSubmissionAsset({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        assignmentId: req.params.assignmentId,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        unitId: req.body?.unitId ?? req.query?.unitId ?? null,
        assetKind: req.body?.assetKind ?? "file",
        filename: req.body?.filename ?? req.body?.originalFilename ?? req.body?.fileName,
        mimeType: req.body?.mimeType,
        sizeBytes: req.body?.sizeBytes ?? null,
        contentBase64: req.body?.contentBase64 ?? null,
        uploadImpl: submissionUploadImpl || undefined,
        fetchImpl: submissionFetchImpl || undefined,
        env,
      });
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/assignments/:assignmentId/submit", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await submitDelegatedAssignment({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        assignmentId: req.params.assignmentId,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        unitId: req.body?.unitId ?? req.query?.unitId ?? null,
        contentText: req.body?.contentText ?? "",
        fileAssetId: req.body?.fileAssetId ?? null,
        fileAssetIds: req.body?.fileAssetIds ?? null,
        audioAssetId: req.body?.audioAssetId ?? null,
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  // ============================================================================
  // Day 7: Delegated Notes, Bookmarks & Unit Q&A
  // ============================================================================
  router.get("/learning/offerings/:profileId/units/:unitId/notes", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await getDelegatedUnitNotes({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/offerings/:profileId/units/:unitId/notes", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await createDelegatedUnitNote({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        timestampSeconds: req.body?.timestampSeconds ?? 0,
        content: req.body?.content,
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(data.idempotentReplay ? 200 : 201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.put("/learning/offerings/:profileId/units/:unitId/notes/:noteId", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await updateDelegatedUnitNote({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        noteId: req.params.noteId,
        timestampSeconds: req.body?.timestampSeconds,
        content: req.body?.content,
        expectedRevision: req.body?.expectedRevision ?? null,
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.delete("/learning/offerings/:profileId/units/:unitId/notes/:noteId", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await deleteDelegatedUnitNote({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        noteId: req.params.noteId,
        expectedRevision: req.body?.expectedRevision ?? req.query?.expectedRevision ?? null,
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/offerings/:profileId/units/:unitId/bookmarks", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await getDelegatedUnitBookmarks({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/offerings/:profileId/units/:unitId/bookmarks", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await createDelegatedUnitBookmark({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        videoAssetId: req.body?.videoAssetId ?? null,
        timestampSeconds: req.body?.timestampSeconds ?? 0,
        label: req.body?.label ?? "",
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(data.idempotentReplay ? 200 : 201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.delete("/learning/offerings/:profileId/units/:unitId/bookmarks/:bookmarkId", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await deleteDelegatedUnitBookmark({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        bookmarkId: req.params.bookmarkId,
        expectedRevision: req.body?.expectedRevision ?? req.query?.expectedRevision ?? null,
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.get("/learning/offerings/:profileId/units/:unitId/qa", verifyRead, async (req, res) => {
    const correlationId = req.get?.("X-Correlation-ID") || null;
    try {
      const data = await getDelegatedUnitQaThreads({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/offerings/:profileId/units/:unitId/qa", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await createDelegatedUnitQaThread({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        profileId: req.params.profileId,
        unitId: req.params.unitId,
        title: req.body?.title,
        body: req.body?.body ?? req.body?.question ?? req.body?.content,
        attachments: req.body?.attachments ?? [],
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(data.idempotentReplay ? 200 : 201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  router.post("/learning/qa/threads/:threadId/replies", verifyWrite, async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await replyDelegatedUnitQaThread({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        threadId: req.params.threadId,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        body: req.body?.body ?? req.body?.content,
        attachments: req.body?.attachments ?? [],
        expectedRevision: req.body?.expectedRevision ?? null,
        idempotencyKey: getWriteIdempotencyKey(req),
        correlationId,
        env,
      });
      return res.status(data.idempotentReplay ? 200 : 201).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  });

  const handleDelegatedQaThreadStatus = async (req, res) => {
    const correlationId = getWriteCorrelationId(req);
    try {
      const data = await updateDelegatedUnitQaThreadStatus({
        db,
        sessionToken: getDelegatedSessionHeader(req),
        threadId: req.params.threadId,
        profileId: req.body?.profileId ?? req.query?.profileId ?? null,
        status: req.body?.status,
        isPinned: req.body?.isPinned,
        markRead: req.body?.markRead ?? false,
        expectedRevision: req.body?.expectedRevision ?? null,
        correlationId,
        env,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return sendV2Error(res, error, correlationId);
    }
  };

  router.patch("/learning/qa/threads/:threadId/status", verifyWrite, handleDelegatedQaThreadStatus);
  router.put("/learning/qa/threads/:threadId", verifyWrite, handleDelegatedQaThreadStatus);

  return router;
};

export default createMolyIntegrationV2Router();
