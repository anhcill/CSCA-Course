import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.resolve("backend", ".env") });

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

export const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024;

export const ALLOWED_SUBMISSION_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
  "application/zip",
]);

export const ALLOWED_SUBMISSION_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
]);

export const MAX_SUBMISSION_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_SUBMISSION_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_LEARNING_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/zip",
]);

export const MAX_LEARNING_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const getR2Config = () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || process.env.R2_PRIVATE_BUCKET;
  const endpoint = process.env.R2_S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    const error = new Error("Cloudflare R2 chưa được cấu hình đầy đủ");
    error.code = "R2_NOT_CONFIGURED";
    throw error;
  }

  return { accessKeyId, secretAccessKey, bucketName, endpoint: endpoint.replace(/\/$/, "") };
};

const getTtl = (envName, fallback, max) => {
  const parsed = Number.parseInt(process.env[envName] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 60), max);
};

const encodePathSegment = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
  `%${character.charCodeAt(0).toString(16).toUpperCase()}`
));

const encodeQuery = (value) => encodePathSegment(String(value));

const buildCanonicalQuery = (params) => Object.entries(params)
  .sort(([first], [second]) => first.localeCompare(second))
  .map(([key, value]) => `${encodeQuery(key)}=${encodeQuery(value)}`)
  .join("&");

const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);

const createPresignedUrl = ({ method, key, expiresInSeconds }) => {
  const { accessKeyId, secretAccessKey, bucketName, endpoint } = getR2Config();
  const endpointUrl = new URL(endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = key.split("/").map(encodePathSegment).join("/");
  const basePath = endpointUrl.pathname.replace(/\/$/, "");
  const canonicalUri = `${basePath}/${encodePathSegment(bucketName)}/${encodedKey}`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expiresInSeconds,
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = buildCanonicalQuery(queryParams);
  const canonicalHeaders = `host:${endpointUrl.host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${secretAccessKey}`, dateStamp),
        "auto",
      ),
      "s3",
    ),
    "aws4_request",
  );
  const signature = hmac(signingKey, stringToSign, "hex");
  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;

  return `${endpointUrl.origin}${canonicalUri}?${finalQuery}`;
};

const validateR2Key = (r2Key) => (
  typeof r2Key === "string"
  && r2Key.length <= 500
  && r2Key.startsWith("videos/")
  && !r2Key.includes("..")
  && !/[\\\s]/.test(r2Key)
);

const validateSubmissionR2Key = (r2Key) => (
  typeof r2Key === "string"
  && r2Key.length <= 500
  && r2Key.startsWith("submissions/")
  && !r2Key.includes("..")
  && !/[\\\s]/.test(r2Key)
);

const validateLearningFileKey = (r2Key) => (
  typeof r2Key === "string"
  && r2Key.length <= 500
  && r2Key.startsWith("learning-files/")
  && !r2Key.includes("..")
  && !/[\\\s]/.test(r2Key)
);

/** Generate a real AWS SigV4 presigned PUT URL for a private R2 bucket. */
export const generateUploadPresignedUrl = async ({ filename, mimeType, sizeBytes }) => {
  getR2Config();
  if (typeof filename !== "string" || !filename.trim()) throw new Error("filename không hợp lệ");
  if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) throw new Error("Định dạng video không được hỗ trợ");
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_VIDEO_SIZE_BYTES) {
    throw new Error("Kích thước video không hợp lệ hoặc vượt quá 1GB");
  }

  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  const fileKey = `videos/${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safeFilename}`;
  const expiresInSeconds = getTtl("R2_UPLOAD_URL_TTL_SECONDS", 900, 3600);

  return {
    uploadUrl: createPresignedUrl({ method: "PUT", key: fileKey, expiresInSeconds }),
    fileKey,
    mimeType,
    expiresInSeconds,
    headers: { "Content-Type": mimeType },
  };
};

/** Generate a short-lived AWS SigV4 presigned GET URL for a private R2 object. */
export const generatePlaybackSignedUrl = async ({ r2Key }) => {
  getR2Config();
  if (!validateR2Key(r2Key)) throw new Error("r2Key không hợp lệ");
  const expiresInSeconds = getTtl("R2_PLAYBACK_URL_TTL_SECONDS", 600, 900);
  const playbackUrl = createPresignedUrl({ method: "GET", key: r2Key, expiresInSeconds });
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return { playbackUrl, expiresAt, expiresInSeconds };
};

/** Generate a signed HEAD request URL so admin confirm can verify the R2 object exists. */
export const generateVideoHeadSignedUrl = async ({ r2Key }) => {
  getR2Config();
  if (!validateR2Key(r2Key)) throw new Error("r2Key không hợp lệ");
  const expiresInSeconds = getTtl("R2_UPLOAD_URL_TTL_SECONDS", 900, 3600);
  return {
    headUrl: createPresignedUrl({ method: "HEAD", key: r2Key, expiresInSeconds }),
    expiresInSeconds,
  };
};

/** Generate a server-owned presigned PUT URL for a learner submission. */
export const generateSubmissionUploadPresignedUrl = async ({ userId, filename, mimeType, sizeBytes, assetKind }) => {
  getR2Config();
  const maxSize = assetKind === "audio" ? MAX_SUBMISSION_AUDIO_SIZE_BYTES : MAX_SUBMISSION_FILE_SIZE_BYTES;
  const allowedTypes = assetKind === "audio"
    ? ALLOWED_SUBMISSION_AUDIO_MIME_TYPES
    : ALLOWED_SUBMISSION_FILE_MIME_TYPES;
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new Error("userId không hợp lệ");
  if (assetKind !== "file" && assetKind !== "audio") throw new Error("Loại tệp không hợp lệ");
  if (typeof filename !== "string" || !filename.trim()) throw new Error("filename không hợp lệ");
  if (!allowedTypes.has(mimeType)) throw new Error("Định dạng tệp không được hỗ trợ");
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > maxSize) {
    throw new Error("Kích thước tệp không hợp lệ hoặc vượt giới hạn");
  }

  const safeFilename = path.basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);
  const fileKey = `submissions/${Number(userId)}/${assetKind}/${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safeFilename}`;
  const expiresInSeconds = getTtl("R2_SUBMISSION_UPLOAD_URL_TTL_SECONDS", 900, 3600);

  return {
    uploadUrl: createPresignedUrl({ method: "PUT", key: fileKey, expiresInSeconds }),
    fileKey,
    mimeType,
    sizeBytes: Number(sizeBytes),
    expiresInSeconds,
    headers: { "Content-Type": mimeType },
  };
};

/** Generate a short-lived signed GET URL for a validated learner submission asset. */
export const generateSubmissionPlaybackSignedUrl = async ({ r2Key }) => {
  getR2Config();
  if (!validateSubmissionR2Key(r2Key)) throw new Error("r2Key bài nộp không hợp lệ");
  const expiresInSeconds = getTtl("R2_SUBMISSION_PLAYBACK_URL_TTL_SECONDS", 600, 900);
  const playbackUrl = createPresignedUrl({ method: "GET", key: r2Key, expiresInSeconds });
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return { playbackUrl, expiresAt, expiresInSeconds };
};

/** Generate a signed HEAD request URL so the API can verify the uploaded object. */
export const generateSubmissionHeadSignedUrl = async ({ r2Key }) => {
  getR2Config();
  if (!validateSubmissionR2Key(r2Key)) throw new Error("r2Key bài nộp không hợp lệ");
  const expiresInSeconds = getTtl("R2_SUBMISSION_UPLOAD_URL_TTL_SECONDS", 900, 3600);
  return {
    headUrl: createPresignedUrl({ method: "HEAD", key: r2Key, expiresInSeconds }),
    expiresInSeconds,
  };
};

/** Generate a server-owned presigned PUT URL for teacher learning material. */
export const generateLearningFileUploadPresignedUrl = async ({ userId, filename, mimeType, sizeBytes }) => {
  getR2Config();
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new Error("userId không hợp lệ");
  if (typeof filename !== "string" || !filename.trim()) throw new Error("filename không hợp lệ");
  if (!ALLOWED_LEARNING_FILE_MIME_TYPES.has(mimeType)) throw new Error("Định dạng tài liệu không được hỗ trợ");
  if (!Number.isSafeInteger(Number(sizeBytes)) || Number(sizeBytes) <= 0 || Number(sizeBytes) > MAX_LEARNING_FILE_SIZE_BYTES) {
    throw new Error("Kích thước tài liệu không hợp lệ hoặc vượt quá 100MB");
  }
  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  const fileKey = `learning-files/${Number(userId)}/${Date.now()}_${crypto.randomBytes(8).toString("hex")}_${safeFilename}`;
  const expiresInSeconds = getTtl("R2_FILE_UPLOAD_URL_TTL_SECONDS", 900, 3600);
  return {
    uploadUrl: createPresignedUrl({ method: "PUT", key: fileKey, expiresInSeconds }),
    fileKey,
    mimeType,
    sizeBytes: Number(sizeBytes),
    expiresInSeconds,
    headers: { "Content-Type": mimeType },
  };
};

export const generateLearningFilePlaybackSignedUrl = async ({ r2Key }) => {
  getR2Config();
  if (!validateLearningFileKey(r2Key)) throw new Error("storageKey tài liệu không hợp lệ");
  const expiresInSeconds = getTtl("R2_FILE_PLAYBACK_URL_TTL_SECONDS", 600, 900);
  const downloadUrl = createPresignedUrl({ method: "GET", key: r2Key, expiresInSeconds });
  return { downloadUrl, expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds, expiresInSeconds };
};

export const generateLearningFileHeadSignedUrl = async ({ r2Key }) => {
  getR2Config();
  if (!validateLearningFileKey(r2Key)) throw new Error("storageKey tài liệu không hợp lệ");
  const expiresInSeconds = getTtl("R2_FILE_UPLOAD_URL_TTL_SECONDS", 900, 3600);
  return { headUrl: createPresignedUrl({ method: "HEAD", key: r2Key, expiresInSeconds }), expiresInSeconds };
};
