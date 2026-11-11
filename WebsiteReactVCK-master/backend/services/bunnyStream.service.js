import crypto from "crypto";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
export const MAX_BUNNY_VIDEO_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
export const PLAYBACK_TOKEN_TTL_SECONDS = 600; // 10 minutes
export const COMPLETION_THRESHOLD_PERCENT = 80;
export const MAX_SINGLE_HEARTBEAT_SECONDS = 90;

export const ALLOWED_BUNNY_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/MP2T",
  "application/vnd.apple.mpegurl",
]);

const STATUS_RANK = {
  created: 1,
  uploading: 2,
  processing: 3,
  ready: 4,
  failed: 4,
  deleted: 5,
};

export class BunnyStreamError extends Error {
  constructor(errorCode, message, { status = 400, details = undefined } = {}) {
    super(message);
    this.name = "BunnyStreamError";
    this.errorCode = errorCode;
    this.status = status;
    this.details = details;
  }
}

export const getBunnyConfig = () => ({
  libraryId: String(process.env.BUNNY_STREAM_LIBRARY_ID || "").trim(),
  apiKey: String(process.env.BUNNY_STREAM_API_KEY || "").trim(),
  tokenSecurityKey: String(
    process.env.BUNNY_STREAM_TOKEN_SECURITY_KEY
    || process.env.BUNNY_TOKEN_AUTHENTICATION_KEY
    || "",
  ).trim(),
  cdnHostname: String(process.env.BUNNY_STREAM_CDN_HOSTNAME || "").trim(),
  cdnTokenSecurityKey: String(process.env.BUNNY_STREAM_CDN_TOKEN_SECURITY_KEY || "").trim(),
  webhookSecret: String(process.env.BUNNY_STREAM_WEBHOOK_SECRET || "").trim(),
  liveHttpEnabled: process.env.BUNNY_STREAM_LIVE_HTTP !== "false",
});

const requireBunnyConfig = (config, fields) => {
  const missing = fields.filter((field) => !config[field]);
  if (missing.length > 0) {
    throw new BunnyStreamError(
      "BUNNY_NOT_CONFIGURED",
      `Thiếu cấu hình Bunny Stream: ${missing.join(", ")}`,
      { status: 503 },
    );
  }
};

// Map Bunny numeric status codes (0..8) or string statuses to our canonical playback_status
export const mapBunnyStatusToPlaybackStatus = (rawStatus) => {
  if (typeof rawStatus === "number" || /^\d+$/.test(String(rawStatus))) {
    const code = Number(rawStatus);
    switch (code) {
      case 0:
        return "created";
      case 6:
        return "uploading";
      case 1:
      case 2:
      case 4:
      case 7:
        return "processing";
      case 3:
        return "ready";
      case 5:
      case 8:
        return "failed";
      default:
        return "processing";
    }
  }

  const normalized = String(rawStatus || "").trim().toLowerCase();
  if (["created", "queued"].includes(normalized)) return "created";
  if (["uploading", "presigneduploadstarted"].includes(normalized)) return "uploading";
  if (["processing", "encoding", "transcoding", "presigneduploadfinished", "resolutionfinished"].includes(normalized)) {
    return "processing";
  }
  if (["ready", "finished", "completed"].includes(normalized)) return "ready";
  if (["failed", "error", "presigneduploadfailed"].includes(normalized)) return "failed";
  if (["deleted"].includes(normalized)) return "deleted";
  return null;
};

// Generate Bunny TUS presigned signature: SHA256(library_id + api_key + expiration_time + video_id)
// Note: Raw API key is NEVER included in the returned headers.
export const generateBunnyTusHeaders = ({
  libraryId,
  apiKey,
  videoGuid,
  expirationTimeSeconds,
}) => {
  const expire = expirationTimeSeconds || Math.floor(Date.now() / 1000) + 3600;
  const signaturePayload = `${libraryId}${apiKey}${expire}${videoGuid}`;
  const signature = crypto.createHash("sha256").update(signaturePayload).digest("hex");

  return {
    AuthorizationSignature: signature,
    AuthorizationExpire: expire,
    VideoId: String(videoGuid),
    LibraryId: String(libraryId),
  };
};

// Create video object in Bunny Stream & generate TUS upload credentials
export const createBunnyUploadIntent = async ({
  title,
  libraryId = null,
  collectionId = null,
  fileSizeBytes = 0,
  mimeType = "video/mp4",
  userId = null,
  db = { query },
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedTitle = typeof title === "string" ? title.trim().slice(0, 255) : "";
  if (!normalizedTitle) {
    throw new BunnyStreamError("VALIDATION_ERROR", "Tiêu đề video không được để trống", { status: 422 });
  }

  const parsedSize = Number(fileSizeBytes || 0);
  if (!Number.isSafeInteger(parsedSize) || parsedSize < 0 || parsedSize > MAX_BUNNY_VIDEO_SIZE_BYTES) {
    throw new BunnyStreamError("VALIDATION_ERROR", "Kích thước video không hợp lệ (tối đa 10GB)", { status: 422 });
  }

  const normalizedMime = String(mimeType || "video/mp4").trim();
  if (!ALLOWED_BUNNY_VIDEO_MIME_TYPES.has(normalizedMime)) {
    throw new BunnyStreamError("VALIDATION_ERROR", "Định dạng video không được hỗ trợ", { status: 422 });
  }

  const config = getBunnyConfig();
  requireBunnyConfig(config, ["libraryId", "apiKey", "cdnHostname"]);
  const requestedLibraryId = String(libraryId || config.libraryId).trim();
  if (requestedLibraryId !== config.libraryId) {
    throw new BunnyStreamError(
      "BUNNY_LIBRARY_NOT_ALLOWED",
      "Library Bunny Stream không thuộc cấu hình của hệ thống",
      { status: 403 },
    );
  }
  const targetLibraryId = config.libraryId;
  let videoGuid = crypto.randomUUID();

  if (config.liveHttpEnabled) {
    if (typeof fetchImpl !== "function") {
      throw new BunnyStreamError("BUNNY_UPSTREAM_ERROR", "Runtime không hỗ trợ kết nối Bunny Stream", { status: 503 });
    }
    const response = await fetchImpl(
      `https://video.bunnycdn.com/library/${encodeURIComponent(targetLibraryId)}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: normalizedTitle,
          ...(collectionId ? { collectionId } : {}),
        }),
      },
    );
    if (!response.ok) {
      throw new BunnyStreamError(
        "BUNNY_UPSTREAM_ERROR",
        `Không thể khởi tạo video trên Bunny Stream (HTTP ${response.status})`,
        { status: 502 },
      );
    }
    const data = await response.json();
    if (data?.guid) {
      videoGuid = String(data.guid);
    }
  }

  const expirationTimeSeconds = Math.floor(Date.now() / 1000) + 3600;
  const tusHeaders = generateBunnyTusHeaders({
    libraryId: targetLibraryId,
    apiKey: config.apiKey,
    videoGuid,
    expirationTimeSeconds,
  });

  const syntheticR2Key = `bunny://${targetLibraryId}/${videoGuid}`;
  const thumbnailUrl = `https://${config.cdnHostname}/${videoGuid}/thumbnail.jpg`;

  const insertRes = await db.query(
    `INSERT INTO video_assets
       (title, r2_key, mime_type, size_bytes, storage_bytes, duration_seconds,
        status, provider, provider_library_id, provider_video_id, playback_status,
        thumbnail_url, uploaded_by, provider_metadata)
     VALUES ($1, $2, $3, $4, $4, 0, 'pending', 'bunny_stream', $5, $6, 'uploading', $7, $8, $9::jsonb)
     RETURNING id, title, provider, provider_library_id, provider_video_id, playback_status, thumbnail_url, created_at`,
    [
      normalizedTitle,
      syntheticR2Key,
      normalizedMime,
      parsedSize,
      targetLibraryId,
      videoGuid,
      thumbnailUrl,
      userId,
      JSON.stringify({ collectionId: collectionId || null }),
    ],
  );

  const asset = insertRes.rows[0];

  await recordAuditEvent({
    db,
    actorId: userId,
    action: "video.upload_intent.created",
    entityType: "video_asset",
    entityId: String(asset.id),
    afterState: {
      assetId: asset.id,
      provider: "bunny_stream",
      libraryId: targetLibraryId,
      providerVideoId: videoGuid,
      playbackStatus: "uploading",
    },
    metadata: {
      fileSizeBytes: parsedSize,
      mimeType: normalizedMime,
    },
  });

  return {
    assetId: String(asset.id),
    title: asset.title,
    provider: "bunny_stream",
    libraryId: targetLibraryId,
    providerVideoId: videoGuid,
    playbackStatus: asset.playback_status,
    thumbnailUrl: asset.thumbnail_url,
    tusEndpoint: BUNNY_TUS_ENDPOINT,
    tusHeaders,
    expiresAt: new Date(expirationTimeSeconds * 1000).toISOString(),
  };
};

// Verify optional webhook signature if BUNNY_STREAM_WEBHOOK_SECRET is configured
export const verifyBunnyWebhookSignature = ({ rawBody, signatureHeader, secret }) => {
  const expectedSecret = secret !== undefined ? secret : getBunnyConfig().webhookSecret;
  if (!expectedSecret) return true; // No secret enforced
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  const normalizedHeader = signatureHeader.trim();
  if (normalizedHeader.length === expectedSecret.length) {
    return crypto.timingSafeEqual(Buffer.from(normalizedHeader), Buffer.from(expectedSecret));
  }
  const normalizedSig = normalizedHeader.replace(/^sha256=/i, "");
  const hmac = crypto
    .createHmac("sha256", expectedSecret)
    .update(rawBody || "")
    .digest("hex");

  if (normalizedSig.length !== hmac.length) return false;
  return crypto.timingSafeEqual(Buffer.from(normalizedSig), Buffer.from(hmac));
};

// Process Bunny Stream webhook idempotently and handle out-of-order status transitions
export const processBunnyWebhookEvent = async ({
  payload,
  rawBody = null,
  signatureHeader = null,
  db = { query },
}) => {
  if (!payload || typeof payload !== "object") {
    throw new BunnyStreamError("VALIDATION_ERROR", "Payload webhook không hợp lệ", { status: 422 });
  }

  const config = getBunnyConfig();
  requireBunnyConfig(config, ["libraryId"]);
  if (config.webhookSecret) {
    const bodyBuffer = rawBody || Buffer.from(JSON.stringify(payload));
    const isValidSig = verifyBunnyWebhookSignature({
      rawBody: bodyBuffer,
      signatureHeader,
      secret: config.webhookSecret,
    });
    if (!isValidSig) {
      throw new BunnyStreamError("INVALID_WEBHOOK_SIGNATURE", "Chữ ký webhook không hợp lệ", { status: 401 });
    }
  }

  const libraryId = String(
    payload.VideoLibraryId ?? payload.videoLibraryId ?? payload.libraryId ?? config.libraryId,
  ).trim();
  if (libraryId !== config.libraryId) {
    throw new BunnyStreamError("BUNNY_LIBRARY_NOT_ALLOWED", "Webhook không thuộc Bunny Library đã cấu hình", { status: 403 });
  }
  const videoGuid = String(
    payload.VideoGuid ?? payload.videoGuid ?? payload.videoId ?? "",
  ).trim();
  const rawStatus = payload.Status ?? payload.status;
  const nextStatus = mapBunnyStatusToPlaybackStatus(rawStatus);

  if (!videoGuid || !nextStatus) {
    throw new BunnyStreamError(
      "VALIDATION_ERROR",
      "Thiếu VideoGuid hoặc Status hợp lệ trong webhook Bunny Stream",
      { status: 422 },
    );
  }

  const payloadString = JSON.stringify(payload);
  const payloadHash = crypto.createHash("sha256").update(payloadString).digest("hex");
  const eventId = String(
    payload.EventId
    || payload.eventId
    || `bunny:${libraryId}:${videoGuid}:${rawStatus}:${payloadHash.slice(0, 16)}`,
  ).trim();

  // Check idempotency in video_provider_webhook_events
  const existingEventRes = await db.query(
    `SELECT id, status, payload_hash
     FROM video_provider_webhook_events
     WHERE event_id = $1`,
    [eventId],
  );

  if (existingEventRes.rows.length > 0) {
    const existing = existingEventRes.rows[0];
    if (existing.status === "processed" || existing.status === "ignored") {
      return {
        duplicate: true,
        eventId,
        status: existing.status,
        playbackStatus: nextStatus,
      };
    }
  } else {
    await db.query(
      `INSERT INTO video_provider_webhook_events
         (provider, event_id, event_type, payload_hash, payload_json, status)
       VALUES ('bunny_stream', $1, $2, $3, $4::jsonb, 'pending')
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, `status.${nextStatus}`, payloadHash, payloadString],
    );
  }

  // Locate the video asset
  const assetRes = await db.query(
    `SELECT id, playback_status, status, duration_seconds, storage_bytes,
            available_resolutions, thumbnail_url, provider_metadata
     FROM video_assets
     WHERE provider = 'bunny_stream'
       AND provider_library_id = $1
       AND provider_video_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [libraryId, videoGuid],
  );

  const asset = assetRes.rows[0];
  if (!asset) {
    await db.query(
      `UPDATE video_provider_webhook_events
       SET status = 'ignored', error_message = 'Video asset not found', processed_at = NOW()
       WHERE event_id = $1`,
      [eventId],
    );
    return {
      duplicate: false,
      ignored: true,
      reason: "ASSET_NOT_FOUND",
      eventId,
      playbackStatus: nextStatus,
    };
  }

  const currentRank = STATUS_RANK[asset.playback_status] || 0;
  const nextRank = STATUS_RANK[nextStatus] || 0;

  // Out-of-order protection: never downgrade a ready or deleted video to uploading/processing
  if (
    (asset.playback_status === "ready" && nextStatus !== "deleted")
    || (asset.playback_status === "deleted")
    || (currentRank > nextRank && nextStatus !== "failed")
  ) {
    await db.query(
      `UPDATE video_provider_webhook_events
       SET status = 'ignored', error_message = 'Out-of-order status transition ignored', processed_at = NOW()
       WHERE event_id = $1`,
      [eventId],
    );
    return {
      duplicate: false,
      ignored: true,
      outOfOrder: true,
      eventId,
      playbackStatus: asset.playback_status,
    };
  }

  const durationSeconds = payload.Length ?? payload.durationSeconds ?? asset.duration_seconds ?? 0;
  const storageBytes = payload.StorageSize ?? payload.storageBytes ?? asset.storage_bytes ?? 0;
  const availableResolutions = payload.AvailableResolutions ?? payload.availableResolutions ?? asset.available_resolutions ?? "360p,480p,720p,1080p";
  const thumbnailUrl = payload.ThumbnailUrl ?? payload.thumbnailUrl ?? asset.thumbnail_url;
  const processingError = nextStatus === "failed"
    ? String(payload.ErrorMessage || payload.errorMessage || "Bunny Stream encoding failed")
    : null;
  const legacyStatus = nextStatus === "ready" ? "ready" : nextStatus === "failed" ? "failed" : "pending";

  const updatedRes = await db.query(
    `UPDATE video_assets
     SET playback_status = $1,
         status = $2,
         duration_seconds = $3,
         storage_bytes = $4,
         size_bytes = GREATEST(COALESCE(size_bytes, 0), $4),
         available_resolutions = $5,
         thumbnail_url = COALESCE($6, thumbnail_url),
         processing_error = $7,
         provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $8::jsonb,
         updated_at = NOW()
     WHERE id = $9
     RETURNING id, playback_status, duration_seconds, available_resolutions, thumbnail_url, processing_error`,
    [
      nextStatus,
      legacyStatus,
      Math.max(0, Math.round(Number(durationSeconds || 0))),
      Math.max(0, Math.round(Number(storageBytes || 0))),
      String(availableResolutions || ""),
      thumbnailUrl || null,
      processingError,
      JSON.stringify({ lastWebhookEventId: eventId, lastWebhookAt: new Date().toISOString() }),
      asset.id,
    ],
  );

  // Sync duration_seconds onto linked independent lessons if ready
  if (nextStatus === "ready" && Number(durationSeconds) > 0) {
    await db.query(
      `UPDATE lessons
       SET duration_seconds = $1, updated_at = NOW()
       WHERE video_asset_id = $2 AND (duration_seconds IS NULL OR duration_seconds = 0)`,
      [Math.round(Number(durationSeconds)), asset.id],
    );
  }

  if (nextStatus === "ready") {
    const autoPublishRes = await db.query(
      `UPDATE class_session_videos
       SET is_published = TRUE,
           published_at = COALESCE(published_at, NOW()),
           updated_at = NOW()
       WHERE video_asset_id = $1
         AND EXISTS (
           SELECT 1 FROM video_assets
           WHERE id = $1
             AND COALESCE(provider_metadata ->> 'publishWhenReady', 'false') = 'true'
         )
       RETURNING id`,
      [asset.id],
    );
    if (autoPublishRes.rows.length > 0) {
      await db.query(
        `UPDATE video_assets
         SET published_at = COALESCE(published_at, NOW()),
             provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) - 'publishWhenReady',
             updated_at = NOW()
         WHERE id = $1`,
        [asset.id],
      );
    }
  }

  await db.query(
    `UPDATE video_provider_webhook_events
     SET status = 'processed', processed_at = NOW()
     WHERE event_id = $1`,
    [eventId],
  );

  return {
    duplicate: false,
    ignored: false,
    eventId,
    assetId: String(asset.id),
    playbackStatus: updatedRes.rows[0].playback_status,
    durationSeconds: Number(updatedRes.rows[0].duration_seconds || 0),
    availableResolutions: updatedRes.rows[0].available_resolutions,
  };
};

export const deleteBunnyVideo = async ({
  videoAsset,
  fetchImpl = globalThis.fetch,
}) => {
  if (!videoAsset || videoAsset.provider !== "bunny_stream") return { deletedUpstream: false };
  const config = getBunnyConfig();
  requireBunnyConfig(config, ["libraryId", "apiKey"]);
  if (!config.liveHttpEnabled) return { deletedUpstream: false };
  if (typeof fetchImpl !== "function") {
    throw new BunnyStreamError("BUNNY_UPSTREAM_ERROR", "Runtime không hỗ trợ kết nối Bunny Stream", { status: 503 });
  }

  const libraryId = String(videoAsset.provider_library_id || config.libraryId);
  const videoGuid = String(videoAsset.provider_video_id || "");
  if (libraryId !== config.libraryId || !videoGuid) {
    throw new BunnyStreamError("BUNNY_LIBRARY_NOT_ALLOWED", "Video không thuộc Bunny Library đã cấu hình", { status: 403 });
  }
  const response = await fetchImpl(
    `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(videoGuid)}`,
    { method: "DELETE", headers: { AccessKey: config.apiKey, Accept: "application/json" } },
  );
  if (!response.ok && response.status !== 404) {
    throw new BunnyStreamError(
      "BUNNY_UPSTREAM_ERROR",
      `Không thể xóa video trên Bunny Stream (HTTP ${response.status})`,
      { status: 502 },
    );
  }
  return { deletedUpstream: response.ok };
};

// Generate short-lived signed Bunny Embed URL and HLS playlist URL (5-10 min TTL)
// Never leaks BUNNY_STREAM_API_KEY or BUNNY_STREAM_TOKEN_SECURITY_KEY
export const generateBunnySignedPlayback = ({
  videoAsset,
  userId,
  userEmail = "",
  ipAddress = null,
  ttlSeconds = PLAYBACK_TOKEN_TTL_SECONDS,
}) => {
  const config = getBunnyConfig();
  requireBunnyConfig(config, ["libraryId", "tokenSecurityKey", "cdnHostname"]);
  const libraryId = String(videoAsset.provider_library_id || config.libraryId).trim();
  const videoGuid = String(videoAsset.provider_video_id || "").trim();

  if (!videoGuid) {
    throw new BunnyStreamError("VIDEO_NOT_READY", "Video chưa có định danh Bunny Stream", { status: 409 });
  }

  const effectiveTtl = Math.min(Math.max(60, Number(ttlSeconds) || PLAYBACK_TOKEN_TTL_SECONDS), 900);
  const expires = Math.floor(Date.now() / 1000) + effectiveTtl;

  // Bunny Embed View Token: SHA256_HEX(token_security_key + video_id + expires)
  const embedToken = crypto
    .createHash("sha256")
    .update(`${config.tokenSecurityKey}${videoGuid}${expires}`)
    .digest("hex");

  const embedUrl = `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoGuid)}?token=${embedToken}&expires=${expires}&autoplay=false&preload=true&responsive=true`;

  let hlsUrl = null;
  if (config.cdnTokenSecurityKey) {
    const hlsPath = `/${videoGuid}/playlist.m3u8`;
    const hlsToken = crypto
      .createHash("sha256")
      .update(`${config.cdnTokenSecurityKey}${hlsPath}${expires}`)
      .digest("base64url");
    hlsUrl = `https://${config.cdnHostname}${hlsPath}?token=${hlsToken}&expires=${expires}`;
  }

  const thumbnailUrl = videoAsset.thumbnail_url
    || `https://${config.cdnHostname}/${encodeURIComponent(videoGuid)}/thumbnail.jpg`;

  return {
    assetId: String(videoAsset.id),
    provider: "bunny_stream",
    libraryId,
    videoGuid,
    embedUrl,
    hlsUrl,
    thumbnailUrl,
    availableResolutions: videoAsset.available_resolutions
      ? String(videoAsset.available_resolutions).split(",").map((s) => s.trim()).filter(Boolean)
      : ["360p", "480p", "720p", "1080p"],
    durationSeconds: Number(videoAsset.duration_seconds || 0),
    expiresAt: new Date(expires * 1000).toISOString(),
    ttlSeconds: effectiveTtl,
    watermark: {
      userId: String(userId),
      email: userEmail || `user-${userId}`,
      ipAddress: ipAddress || null,
    },
  };
};

// Record learner video watch progress with anti-cheat validation
export const recordVideoWatchProgress = async ({
  userId,
  videoAssetId,
  courseId = null,
  liveClassId = null,
  classSessionId = null,
  lessonId = null,
  currentTimeSeconds = 0,
  watchedDeltaSeconds = null,
  durationSeconds = null,
  db = { query },
}) => {
  const assetRes = await db.query(
    `SELECT id, duration_seconds, playback_status
     FROM video_assets
     WHERE id = $1 AND deleted_at IS NULL`,
    [videoAssetId],
  );
  const asset = assetRes.rows[0];
  if (!asset) {
    throw new BunnyStreamError("NOT_FOUND", "Không tìm thấy video", { status: 404 });
  }

  const reportedDuration = Math.max(0, Math.round(Number(durationSeconds || 0)));
  if (Number(asset.duration_seconds || 0) <= 0 && reportedDuration > 0) {
    await db.query(
      `UPDATE video_assets
       SET duration_seconds = $1, updated_at = NOW()
       WHERE id = $2 AND (duration_seconds IS NULL OR duration_seconds <= 0)`,
      [reportedDuration, videoAssetId],
    );
    asset.duration_seconds = reportedDuration;
  }

  const effectiveDuration = Math.max(
    1,
    Number(asset.duration_seconds || 0) || reportedDuration || 600,
  );

  const clampedPosition = Math.min(
    effectiveDuration,
    Math.max(0, Number(currentTimeSeconds || 0)),
  );

  // Load existing progress if any
  const existingRes = await db.query(
    `SELECT id, last_position_seconds, watched_seconds, completion_percent, is_completed, completed_at
     FROM video_watch_progress
     WHERE user_id = $1 AND video_asset_id = $2`,
    [userId, videoAssetId],
  );
  const existing = existingRes.rows[0] || null;
  const prevWatched = Number(existing?.watched_seconds || 0);

  // Validate watched delta so a client cannot spoof completion or seek to 80% to unlock
  // Only actual playback delta (watchedDeltaSeconds) is credited; scrubbing/seeking position changes alone add 0s.
  let validDelta = 0;
  if (watchedDeltaSeconds !== null && watchedDeltaSeconds !== undefined) {
    const rawDelta = Number(watchedDeltaSeconds);
    if (Number.isFinite(rawDelta) && rawDelta > 0) {
      validDelta = Math.min(rawDelta, MAX_SINGLE_HEARTBEAT_SECONDS);
    }
  }

  const newWatchedSeconds = Math.min(
    effectiveDuration,
    Math.round((prevWatched + validDelta) * 100) / 100,
  );

  const computedPercent = Math.min(
    100,
    Math.round((newWatchedSeconds / effectiveDuration) * 100 * 100) / 100,
  );
  const finalPercent = Math.max(Number(existing?.completion_percent || 0), computedPercent);
  const isCompleted = Boolean(existing?.is_completed) || finalPercent >= COMPLETION_THRESHOLD_PERCENT;

  const upsertRes = await db.query(
    `INSERT INTO video_watch_progress
       (user_id, video_asset_id, course_id, live_class_id, class_session_id, lesson_id,
        last_position_seconds, watched_seconds, completion_percent, is_completed,
        completed_at, last_heartbeat_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (user_id, video_asset_id)
     DO UPDATE SET
       course_id = COALESCE(EXCLUDED.course_id, video_watch_progress.course_id),
       live_class_id = COALESCE(EXCLUDED.live_class_id, video_watch_progress.live_class_id),
       class_session_id = COALESCE(EXCLUDED.class_session_id, video_watch_progress.class_session_id),
       lesson_id = COALESCE(EXCLUDED.lesson_id, video_watch_progress.lesson_id),
       last_position_seconds = EXCLUDED.last_position_seconds,
       watched_seconds = EXCLUDED.watched_seconds,
       completion_percent = EXCLUDED.completion_percent,
       is_completed = EXCLUDED.is_completed,
       completed_at = COALESCE(video_watch_progress.completed_at, CASE WHEN EXCLUDED.is_completed THEN NOW() ELSE NULL END),
       last_heartbeat_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      videoAssetId,
      courseId,
      liveClassId,
      classSessionId,
      lessonId,
      clampedPosition,
      newWatchedSeconds,
      finalPercent,
      isCompleted,
    ],
  );

  const row = upsertRes.rows[0];

  // Also sync lesson_progress table if this is an independent lesson
  if (lessonId && courseId) {
    await db.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, course_id, last_position_seconds, is_completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET
         last_position_seconds = EXCLUDED.last_position_seconds,
         is_completed = lesson_progress.is_completed OR EXCLUDED.is_completed,
         updated_at = NOW()`,
      [userId, lessonId, courseId, Math.round(clampedPosition), isCompleted],
    );
  }

  return {
    videoAssetId: String(row.video_asset_id),
    lastPositionSeconds: Number(row.last_position_seconds),
    watchedSeconds: Number(row.watched_seconds),
    completionPercent: Number(row.completion_percent),
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at,
    lastHeartbeatAt: row.last_heartbeat_at,
  };
};
