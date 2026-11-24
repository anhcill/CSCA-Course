import crypto from "crypto";
import {
  CompareFacesCommand,
  CreateFaceLivenessSessionCommand,
  DetectFacesCommand,
  GetFaceLivenessSessionResultsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

export const DEFAULT_AWS_REKOGNITION_REGION = "ap-southeast-2";
export const DEFAULT_LIVENESS_MIN_CONFIDENCE = 85;
export const DEFAULT_FACE_MATCH_MIN_SIMILARITY = 90;

export const STREAMING_LIVENESS_REGIONS = new Set([
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "ap-northeast-1",
  "ap-south-1",
  "ap-southeast-5",
  "ap-southeast-7",
  "sa-east-1",
]);

export const ACTIVE_CHALLENGES = [
  {
    code: "smile",
    title: "Mỉm cười tươi",
    instruction: "Hãy mỉm cười rõ nét nhìn vào camera rồi bấm chụp.",
  },
  {
    code: "turn_left",
    title: "Quay nhẹ mặt sang trái",
    instruction: "Quay nhẹ đầu sang trái (khoảng 15–25°) rồi bấm chụp.",
  },
  {
    code: "turn_right",
    title: "Quay nhẹ mặt sang phải",
    instruction: "Quay nhẹ đầu sang phải (khoảng 15–25°) rồi bấm chụp.",
  },
];

export const getAwsRekognitionConfig = (env = process.env) => {
  const region = (env.AWS_REKOGNITION_REGION || DEFAULT_AWS_REKOGNITION_REGION).trim();
  const accessKeyId = (env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (env.AWS_SECRET_ACCESS_KEY || "").trim();
  const livenessRoleArn = (env.AWS_LIVENESS_ROLE_ARN || "").trim();
  const livenessMinConfidence = Number(env.AWS_FACE_LIVENESS_MIN_CONFIDENCE || DEFAULT_LIVENESS_MIN_CONFIDENCE);
  const faceMatchMinSimilarity = Number(env.AWS_FACE_MATCH_MIN_SIMILARITY || DEFAULT_FACE_MATCH_MIN_SIMILARITY);
  const isProduction = env.NODE_ENV === "production";
  const mockRequested = env.AWS_REKOGNITION_MOCK === "true";
  const mockMode = mockRequested && !isProduction;

  const hasAwsKeys = Boolean(accessKeyId && secretAccessKey);
  const supportsStreamingLiveness = STREAMING_LIVENESS_REGIONS.has(region) && Boolean(livenessRoleArn);
  const modeOverride = (env.AWS_FACE_LIVENESS_MODE || "auto").trim().toLowerCase();

  let mode = "unconfigured";
  if (mockMode) {
    mode = "mock";
  } else if (hasAwsKeys) {
    if (modeOverride === "active_challenge") {
      mode = "active_challenge";
    } else if (modeOverride === "streaming_liveness" && supportsStreamingLiveness) {
      mode = "streaming_liveness";
    } else {
      mode = supportsStreamingLiveness ? "streaming_liveness" : "active_challenge";
    }
  }

  return {
    region,
    accessKeyId,
    secretAccessKey,
    livenessRoleArn,
    livenessMinConfidence: Number.isFinite(livenessMinConfidence)
      ? Math.min(Math.max(livenessMinConfidence, 50), 99)
      : DEFAULT_LIVENESS_MIN_CONFIDENCE,
    faceMatchMinSimilarity: Number.isFinite(faceMatchMinSimilarity)
      ? Math.min(Math.max(faceMatchMinSimilarity, 60), 99)
      : DEFAULT_FACE_MATCH_MIN_SIMILARITY,
    hasAwsKeys,
    hasLivenessRole: Boolean(livenessRoleArn),
    supportsStreamingLiveness,
    mode,
    configured: mode === "streaming_liveness" || mode === "active_challenge",
    mockMode,
  };
};

export const getPublicAwsRekognitionStatus = (env = process.env) => {
  const cfg = getAwsRekognitionConfig(env);
  return {
    configured: cfg.configured,
    mode: cfg.mode,
    hasAwsKeys: cfg.hasAwsKeys,
    hasLivenessRole: cfg.hasLivenessRole,
    supportsStreamingLiveness: cfg.supportsStreamingLiveness,
    mockMode: cfg.mockMode,
    region: cfg.region,
    livenessMinConfidence: cfg.livenessMinConfidence,
    faceMatchMinSimilarity: cfg.faceMatchMinSimilarity,
  };
};

const createRekognitionClient = (cfg) => new RekognitionClient({
  region: cfg.region,
  credentials: {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  },
});

const createStsClient = (cfg) => new STSClient({
  region: cfg.region,
  credentials: {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  },
});

const assertAwsConfigured = (cfg, { requireRole = false } = {}) => {
  if (!cfg.hasAwsKeys) {
    const error = new Error(
      "AWS Rekognition chưa được cấu hình (thiếu AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).",
    );
    error.code = "AWS_REKOGNITION_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }
  if (requireRole && !cfg.hasLivenessRole) {
    const error = new Error(
      "AWS Face Liveness chưa có IAM Role tạm (thiếu AWS_LIVENESS_ROLE_ARN).",
    );
    error.code = "AWS_LIVENESS_ROLE_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }
};

const getChallengeSigningSecret = (env = process.env) =>
  env.JWT_SECRET || env.AWS_SECRET_ACCESS_KEY || "moly-face-challenge-dev-secret";

export const createActiveChallengeToken = ({ teacherId, sessionId, type, challengeCode, ttlMs = 3 * 60 * 1000 }, env = process.env) => {
  const payload = {
    t: Number(teacherId),
    s: Number(sessionId),
    y: String(type),
    c: String(challengeCode),
    exp: Date.now() + ttlMs,
    n: crypto.randomBytes(6).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getChallengeSigningSecret(env))
    .update(encoded)
    .digest("base64url");
  return `chal.${encoded}.${sig}`;
};

export const verifyActiveChallengeToken = ({ token, teacherId, sessionId, type }, env = process.env) => {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== "chal") {
    const err = new Error("Mã phiên thử thách khuôn mặt không hợp lệ.");
    err.code = "INVALID_CHALLENGE_TOKEN";
    err.status = 422;
    throw err;
  }
  const [, encoded, sig] = parts;
  const expected = crypto
    .createHmac("sha256", getChallengeSigningSecret(env))
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    const err = new Error("Chữ ký phiên thử thách khuôn mặt không hợp lệ.");
    err.code = "INVALID_CHALLENGE_SIGNATURE";
    err.status = 422;
    throw err;
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (Date.now() > Number(payload.exp || 0)) {
    const err = new Error("Phiên chấm công đã hết hạn (quá 3 phút). Vui lòng mở lại camera.");
    err.code = "CHALLENGE_EXPIRED";
    err.status = 422;
    throw err;
  }
  if (
    Number(payload.t) !== Number(teacherId)
    || Number(payload.s) !== Number(sessionId)
    || String(payload.y) !== String(type)
  ) {
    const err = new Error("Mã phiên chấm công không khớp với buổi học hiện tại.");
    err.code = "CHALLENGE_MISMATCH";
    err.status = 422;
    throw err;
  }

  return payload;
};

export const detectSingleClearFace = async ({ imageBytes, attributes = ["DEFAULT"] }, env = process.env) => {
  const cfg = getAwsRekognitionConfig(env);
  if (cfg.mockMode || !cfg.hasAwsKeys) {
    return {
      validatedByAws: false,
      faceCount: 1,
      confidence: 99.0,
      faceDetail: null,
    };
  }

  const client = createRekognitionClient(cfg);
  const response = await client.send(new DetectFacesCommand({
    Image: { Bytes: imageBytes },
    Attributes: attributes,
  }));

  const faces = Array.isArray(response.FaceDetails) ? response.FaceDetails : [];
  if (faces.length === 0) {
    const error = new Error("Không phát hiện khuôn mặt rõ ràng trong ảnh. Vui lòng chụp lại nơi đủ sáng.");
    error.code = "NO_FACE_DETECTED";
    error.status = 422;
    throw error;
  }
  if (faces.length > 1) {
    const error = new Error("Phát hiện nhiều hơn 1 khuôn mặt trong khung hình. Vui lòng chỉ chụp 1 mình bạn.");
    error.code = "MULTIPLE_FACES_DETECTED";
    error.status = 422;
    throw error;
  }

  const confidence = Number(faces[0]?.Confidence || 0);
  if (confidence < 85) {
    const error = new Error("Ảnh khuôn mặt chưa đủ rõ nét. Vui lòng bỏ khẩu trang/kính râm và chụp lại.");
    error.code = "LOW_FACE_QUALITY";
    error.status = 422;
    throw error;
  }

  return {
    validatedByAws: true,
    faceCount: 1,
    confidence: Number(confidence.toFixed(2)),
    faceDetail: faces[0],
  };
};

export const evaluateActiveChallengePair = ({ challengeCode, straightFace, challengeFace }) => {
  const yaw1 = Number(straightFace?.Pose?.Yaw ?? 0);
  const yaw2 = Number(challengeFace?.Pose?.Yaw ?? 0);
  const yawDelta = Math.abs(yaw2 - yaw1);

  if (challengeCode === "smile") {
    const smiling = Boolean(challengeFace?.Smile?.Value);
    const smileConf = Number(challengeFace?.Smile?.Confidence ?? 0);
    const passed = smiling && smileConf >= 65;
    return {
      passed,
      confidence: Number(Math.min(99, passed ? Math.max(88, smileConf) : smileConf).toFixed(2)),
      reason: passed
        ? null
        : "Chưa phát hiện nụ cười rõ ràng ở bước 2. Vui lòng mỉm cười tươi hơn và thử lại.",
    };
  }

  if (challengeCode === "turn_left" || challengeCode === "turn_right") {
    const passed = yawDelta >= 10;
    const score = passed ? Math.min(99, 85 + Math.min(14, yawDelta * 0.5)) : Math.max(40, yawDelta * 4);
    return {
      passed,
      confidence: Number(score.toFixed(2)),
      reason: passed
        ? null
        : "Góc quay khuôn mặt ở bước 2 chưa đủ rõ (cần quay nhẹ sang hướng yêu cầu so với ảnh nhìn thẳng).",
    };
  }

  return { passed: false, confidence: 0, reason: "Thử thách xác thực không hợp lệ." };
};

export const verifyActiveChallengeWithAws = async ({
  challengeCode,
  straightImageBytes,
  challengeImageBytes,
}, env = process.env) => {
  const cfg = getAwsRekognitionConfig(env);
  assertAwsConfigured(cfg);

  const [straightDet, challengeDet] = await Promise.all([
    detectSingleClearFace({ imageBytes: straightImageBytes, attributes: ["ALL"] }, env),
    detectSingleClearFace({ imageBytes: challengeImageBytes, attributes: ["ALL"] }, env),
  ]);

  const challengeEval = evaluateActiveChallengePair({
    challengeCode,
    straightFace: straightDet.faceDetail,
    challengeFace: challengeDet.faceDetail,
  });

  if (!challengeEval.passed) {
    return {
      isLive: false,
      confidence: challengeEval.confidence,
      reason: challengeEval.reason,
      provider: "aws_rekognition",
    };
  }

  // Ensure Frame 1 and Frame 2 are the same person (prevents swapping photos between steps)
  const samePerson = await compareFaces({
    sourceImageBytes: straightImageBytes,
    targetImageBytes: challengeImageBytes,
  }, env);

  if (samePerson.similarity < 80) {
    return {
      isLive: false,
      confidence: Number(samePerson.similarity.toFixed(2)),
      reason: "Hai ảnh bước 1 và bước 2 không khớp cùng một khuôn mặt. Vui lòng thử lại.",
      provider: "aws_rekognition",
    };
  }

  return {
    isLive: true,
    confidence: challengeEval.confidence,
    samePersonSimilarity: samePerson.similarity,
    reason: null,
    provider: "aws_rekognition",
  };
};

export const createFaceLivenessSession = async ({ teacherId, sessionId, type }, env = process.env) => {
  const cfg = getAwsRekognitionConfig(env);

  if (cfg.mockMode) {
    const mockId = `mock-liveness-${sessionId}-${teacherId}-${type}-${crypto.randomBytes(6).toString("hex")}`;
    return {
      mode: "mock",
      livenessSessionId: mockId,
      region: cfg.region,
      provider: "mock",
      mockMode: true,
      credentials: null,
      challenge: null,
    };
  }

  assertAwsConfigured(cfg);

  // Active 2-Frame Challenge mode (works in ap-southeast-2 and every AWS Rekognition region!)
  if (cfg.mode === "active_challenge") {
    const picked = ACTIVE_CHALLENGES[crypto.randomInt(0, ACTIVE_CHALLENGES.length)];
    const token = createActiveChallengeToken({
      teacherId,
      sessionId,
      type,
      challengeCode: picked.code,
    }, env);

    return {
      mode: "active_challenge",
      livenessSessionId: token,
      region: cfg.region,
      provider: "aws_rekognition",
      mockMode: false,
      credentials: null,
      challenge: picked,
    };
  }

  // Streaming AWS Rekognition Face Liveness mode (regions with StartFaceLivenessSession)
  assertAwsConfigured(cfg, { requireRole: true });

  const rekognition = createRekognitionClient(cfg);
  const sts = createStsClient(cfg);

  const clientRequestToken = crypto
    .createHash("sha256")
    .update(`${teacherId}:${sessionId}:${type}:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 64);

  const [sessionResp, stsResp] = await Promise.all([
    rekognition.send(new CreateFaceLivenessSessionCommand({
      ClientRequestToken: clientRequestToken,
      Settings: {
        AuditImagesLimit: 1,
      },
    })),
    sts.send(new AssumeRoleCommand({
      RoleArn: cfg.livenessRoleArn,
      RoleSessionName: `moly-liveness-t${teacherId}-${Date.now()}`.slice(0, 64),
      DurationSeconds: 900,
    })),
  ]);

  if (!sessionResp?.SessionId || !stsResp?.Credentials) {
    const error = new Error("Không thể khởi tạo phiên AWS Face Liveness.");
    error.code = "AWS_LIVENESS_INIT_FAILED";
    error.status = 502;
    throw error;
  }

  return {
    mode: "streaming_liveness",
    livenessSessionId: sessionResp.SessionId,
    region: cfg.region,
    provider: "aws_rekognition",
    mockMode: false,
    challenge: null,
    credentials: {
      accessKeyId: stsResp.Credentials.AccessKeyId,
      secretAccessKey: stsResp.Credentials.SecretAccessKey,
      sessionToken: stsResp.Credentials.SessionToken,
      expiration: stsResp.Credentials.Expiration
        ? new Date(stsResp.Credentials.Expiration).toISOString()
        : new Date(Date.now() + 14 * 60 * 1000).toISOString(),
    },
  };
};

export const getFaceLivenessSessionResults = async ({ livenessSessionId }, env = process.env) => {
  const cfg = getAwsRekognitionConfig(env);

  if (cfg.mockMode && String(livenessSessionId || "").startsWith("mock-liveness-")) {
    return {
      status: "SUCCEEDED",
      confidence: 96.5,
      isLive: true,
      referenceImageBytes: null,
      provider: "mock",
    };
  }

  assertAwsConfigured(cfg);
  const rekognition = createRekognitionClient(cfg);
  const result = await rekognition.send(new GetFaceLivenessSessionResultsCommand({
    SessionId: livenessSessionId,
  }));

  const confidence = Number(result?.Confidence || 0);
  const status = String(result?.Status || "UNKNOWN");
  const isLive = status === "SUCCEEDED" && confidence >= cfg.livenessMinConfidence;
  const rawBytes = result?.ReferenceImage?.Bytes || null;
  const referenceImageBytes = rawBytes ? Buffer.from(rawBytes) : null;

  return {
    status,
    confidence: Number(confidence.toFixed(2)),
    isLive,
    referenceImageBytes,
    provider: "aws_rekognition",
  };
};

export const compareFaces = async ({ sourceImageBytes, targetImageBytes }, env = process.env) => {
  const cfg = getAwsRekognitionConfig(env);

  if (cfg.mockMode) {
    return {
      matched: true,
      similarity: 97.2,
      faceMatchesCount: 1,
      provider: "mock",
    };
  }

  assertAwsConfigured(cfg);
  const rekognition = createRekognitionClient(cfg);
  const response = await rekognition.send(new CompareFacesCommand({
    SourceImage: { Bytes: sourceImageBytes },
    TargetImage: { Bytes: targetImageBytes },
    SimilarityThreshold: 0,
  }));

  const matches = Array.isArray(response?.FaceMatches) ? response.FaceMatches : [];
  const bestSimilarity = matches.reduce(
    (max, item) => Math.max(max, Number(item?.Similarity || 0)),
    0,
  );

  return {
    matched: bestSimilarity >= cfg.faceMatchMinSimilarity,
    similarity: Number(bestSimilarity.toFixed(2)),
    faceMatchesCount: matches.length,
    provider: "aws_rekognition",
  };
};
