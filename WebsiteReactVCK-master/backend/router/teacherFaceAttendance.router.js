import express from "express";
import multer from "multer";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requireRole from "../middleware/requireRole.js";
import { getPublicAwsRekognitionStatus } from "../services/awsRekognition.service.js";
import {
  adminOverrideSessionAttendance,
  completeTeacherSessionDeviceBiometricVerification,
  completeTeacherSessionFaceVerification,
  getTeacherFaceEnrollment,
  getTeacherSessionAttendanceState,
  getTeacherTodaySmartAttendance,
  listTeacherFaceEnrollmentsForAdmin,
  readLocalFacePreviewBuffer,
  reviewTeacherFaceEnrollment,
  startAdminFaceSelfTest,
  startTeacherSessionDeviceBiometric,
  startTeacherSessionFaceLiveness,
  submitTeacherFaceEnrollment,
  verifyAdminFaceSelfTest,
} from "../services/teacherFaceAttendance.service.js";
import {
  beginTeacherBiometricAssertion,
  beginTeacherBiometricRegistration,
  completeTeacherBiometricRegistration,
  listTeacherBiometricCredentials,
  resolveWebAuthnContext,
  revokeTeacherBiometricCredential,
  verifyTeacherBiometricAssertion,
} from "../services/teacherDeviceBiometrics.service.js";

const router = express.Router();

const faceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype || "")) {
      return cb(null, true);
    }
    const err = new Error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.");
    err.status = 422;
    err.code = "INVALID_IMAGE_TYPE";
    return cb(err);
  },
});

const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const handleRouteError = (res, error, fallbackMessage = "Đã có lỗi xảy ra") => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(422).json({
      success: false,
      message: "Ảnh khuôn mặt không được vượt quá 6MB.",
      errorCode: "IMAGE_TOO_LARGE",
    });
  }
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    success: false,
    message: error?.message || fallbackMessage,
    errorCode: error?.code || (status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
  });
};

// Local dev preview endpoint (only active when R2 is not configured in non-production)
router.get("/local-preview", protectRoute, requireTeacher, async (req, res) => {
  try {
    const key = String(req.query.key || "");
    if (req.user.role !== "admin" && !key.includes(`/${req.user.id}/`)) {
      return res.status(403).json({ success: false, message: "Không có quyền xem ảnh này." });
    }
    const buffer = await readLocalFacePreviewBuffer(key);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(buffer);
  } catch (error) {
    return handleRouteError(res, error, "Không thể tải ảnh xem trước");
  }
});

// Teacher status, device biometrics & enrollment info
router.get("/status", protectRoute, requireTeacher, async (req, res) => {
  try {
    const [enrollment, biometricCredentials] = await Promise.all([
      getTeacherFaceEnrollment(req.user.id),
      listTeacherBiometricCredentials(req.user.id).catch(() => []),
    ]);
    return res.json({
      success: true,
      data: {
        aws: getPublicAwsRekognitionStatus(),
        enrollment,
        biometricCredentials,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể kiểm tra trạng thái chấm công sinh trắc học");
  }
});

// ---------------------------------------------------------------------------
// Device-native WebAuthn Biometrics (iOS Face ID / Touch ID / Android / Windows Hello)
// ---------------------------------------------------------------------------
router.post("/biometrics/register/options", protectRoute, requireTeacher, async (req, res) => {
  try {
    const ctx = resolveWebAuthnContext(req);
    const data = await beginTeacherBiometricRegistration({
      teacherId: req.user.id,
      username: req.user.username,
      fullName: req.user.fullName || req.user.full_name || req.user.username,
      ...ctx,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, "Không thể khởi tạo đăng ký Face ID / Vân tay thiết bị");
  }
});

router.post("/biometrics/register/verify", protectRoute, requireTeacher, async (req, res) => {
  try {
    const saved = await completeTeacherBiometricRegistration({
      teacherId: req.user.id,
      challengeToken: req.body?.challengeToken,
      credentialId: req.body?.credentialId,
      clientDataJSON: req.body?.clientDataJSON,
      authenticatorData: req.body?.authenticatorData || null,
      publicKeySpki: req.body?.publicKeySpki,
      publicKeyAlg: req.body?.publicKeyAlg ?? -7,
      transports: req.body?.transports,
      deviceLabel: req.body?.deviceLabel || "",
      userAgent: req.headers["user-agent"] || "",
    });
    return res.status(201).json({
      success: true,
      message: "Đã đăng ký Face ID / Vân tay cho thiết bị này!",
      data: saved,
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể lưu Face ID / Vân tay thiết bị");
  }
});

router.delete("/biometrics/:credentialRowId", protectRoute, requireTeacher, async (req, res) => {
  try {
    const credentialRowId = parsePositiveId(req.params.credentialRowId);
    if (!credentialRowId) {
      return res.status(422).json({ success: false, message: "ID thiết bị không hợp lệ." });
    }
    const removed = await revokeTeacherBiometricCredential({
      teacherId: req.user.id,
      credentialRowId,
    });
    return res.json({
      success: true,
      message: "Đã gỡ Face ID / Vân tay khỏi thiết bị.",
      data: removed,
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể gỡ thiết bị sinh trắc học");
  }
});

router.post("/biometrics/test/options", protectRoute, requireTeacher, async (req, res) => {
  try {
    const ctx = resolveWebAuthnContext(req);
    const data = await beginTeacherBiometricAssertion({
      teacherId: req.user.id,
      purpose: "self_test",
      sessionId: 0,
      type: "self_test",
      ...ctx,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, "Không thể khởi tạo test Face ID / Vân tay thiết bị");
  }
});

router.post("/biometrics/test/verify", protectRoute, requireTeacher, async (req, res) => {
  try {
    const startedAt = Date.now();
    const result = await verifyTeacherBiometricAssertion({
      teacherId: req.user.id,
      purpose: "self_test",
      sessionId: 0,
      type: "self_test",
      challengeToken: req.body?.challengeToken,
      credentialId: req.body?.credentialId,
      clientDataJSON: req.body?.clientDataJSON,
      authenticatorData: req.body?.authenticatorData,
      signature: req.body?.signature,
    });
    return res.json({
      success: true,
      message: "Xác thực Face ID / Vân tay thiết bị thành công!",
      data: {
        ...result,
        latencyMs: Date.now() - startedAt,
        dryRun: true,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "Xác thực Face ID / Vân tay thiết bị thất bại");
  }
});

router.post("/sessions/:sessionId/biometric/options", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) {
      return res.status(422).json({ success: false, message: "sessionId không hợp lệ." });
    }
    const ctx = resolveWebAuthnContext(req);
    const data = await startTeacherSessionDeviceBiometric({
      sessionId,
      teacherId: req.user.id,
      role: req.user.role,
      type: String(req.body?.type || ""),
      ...ctx,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, "Không thể khởi tạo chấm công bằng Face ID / Vân tay máy");
  }
});

router.post("/sessions/:sessionId/biometric/verify", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) {
      return res.status(422).json({ success: false, message: "sessionId không hợp lệ." });
    }
    const type = String(req.body?.type || "");
    const record = await completeTeacherSessionDeviceBiometricVerification({
      sessionId,
      teacherId: req.user.id,
      role: req.user.role,
      type,
      challengeToken: req.body?.challengeToken,
      credentialId: req.body?.credentialId,
      clientDataJSON: req.body?.clientDataJSON,
      authenticatorData: req.body?.authenticatorData,
      signature: req.body?.signature,
      ip: req.ip || req.headers["x-forwarded-for"] || null,
      userAgent: req.headers["user-agent"] || null,
    });
    const label = type === "check_in" ? "Chấm Vào" : "Chấm Ra";
    return res.json({
      success: true,
      message: `${label} bằng Face ID / Vân tay thiết bị thành công!`,
      data: record,
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể xác thực chấm công bằng Face ID / Vân tay máy");
  }
});

// Smart Attendance: today's teaching sessions + auto-recommended Check-in / Check-out target
router.get("/today", protectRoute, requireTeacher, async (req, res) => {
  try {
    const payload = await getTeacherTodaySmartAttendance({
      teacherId: req.user.id,
    });
    return res.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể tải danh sách chấm công hôm nay");
  }
});

// Teacher submits reference face photo (live camera)
router.post(
  "/enrollment",
  protectRoute,
  requireTeacher,
  faceUpload.single("photo"),
  async (req, res) => {
    try {
      const consentAccepted =
        req.body?.consentAccepted === true
        || req.body?.consentAccepted === "true"
        || req.body?.consentAccepted === "1";

      const enrollment = await submitTeacherFaceEnrollment({
        teacherId: req.user.id,
        imageBuffer: req.file?.buffer,
        mimeType: req.file?.mimetype || "image/jpeg",
        consentAccepted,
      });

      return res.status(201).json({
        success: true,
        message: "Đã gửi ảnh khuôn mặt mẫu. Vui lòng chờ Admin duyệt và khóa để bắt đầu chấm công.",
        data: enrollment,
      });
    } catch (error) {
      return handleRouteError(res, error, "Không thể đăng ký khuôn mặt mẫu");
    }
  },
);

// Session check-in/out status + time window policy
router.get("/sessions/:sessionId", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) {
      return res.status(422).json({ success: false, message: "sessionId không hợp lệ." });
    }

    const state = await getTeacherSessionAttendanceState({
      sessionId,
      teacherId: req.user.id,
      role: req.user.role,
    });
    return res.json({ success: true, data: state });
  } catch (error) {
    return handleRouteError(res, error, "Không thể tải trạng thái chấm công buổi học");
  }
});

// Start AWS Rekognition Face Liveness session & issue 15-min temporary STS credentials
router.post("/sessions/:sessionId/liveness-session", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) {
      return res.status(422).json({ success: false, message: "sessionId không hợp lệ." });
    }
    const type = String(req.body?.type || "");
    const payload = await startTeacherSessionFaceLiveness({
      sessionId,
      teacherId: req.user.id,
      role: req.user.role,
      type,
    });
    return res.json({ success: true, data: payload });
  } catch (error) {
    return handleRouteError(res, error, "Không thể khởi tạo phiên xác thực khuôn mặt");
  }
});

// Complete check-in / check-out verification (AWS Streaming Liveness, Active 2-Frame AWS Challenge, or manual fallback)
router.post(
  "/sessions/:sessionId/verify",
  protectRoute,
  requireTeacher,
  faceUpload.fields([
    { name: "snapshot", maxCount: 1 },
    { name: "challengeSnapshot", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const sessionId = parsePositiveId(req.params.sessionId);
      if (!sessionId) {
        return res.status(422).json({ success: false, message: "sessionId không hợp lệ." });
      }

      const type = String(req.body?.type || "");
      const livenessSessionId = req.body?.livenessSessionId ? String(req.body.livenessSessionId) : null;
      const manualFallback =
        req.body?.manualFallback === true
        || req.body?.manualFallback === "true"
        || req.body?.manualFallback === "1";

      const snapshotFile = req.files?.snapshot?.[0] || null;
      const challengeFile = req.files?.challengeSnapshot?.[0] || null;

      const record = await completeTeacherSessionFaceVerification({
        sessionId,
        teacherId: req.user.id,
        role: req.user.role,
        type,
        livenessSessionId,
        manualFallback,
        fallbackSnapshotBuffer: snapshotFile?.buffer || null,
        fallbackMimeType: snapshotFile?.mimetype || "image/jpeg",
        challengeSnapshotBuffer: challengeFile?.buffer || null,
        ip: req.ip || req.headers["x-forwarded-for"] || null,
        userAgent: req.headers["user-agent"] || null,
      });

      const label = type === "check_in" ? "Chấm công Vào" : "Chấm công Ra";
      const message = manualFallback
        ? `Đã gửi ảnh ${label} để Admin duyệt tay.`
        : `${label} bằng khuôn mặt thành công!`;

      return res.json({ success: true, message, data: record });
    } catch (error) {
      return handleRouteError(res, error, "Không thể xác thực chấm công khuôn mặt");
    }
  },
);

// Admin: list all teacher face enrollments
router.get("/admin/enrollments", protectRoute, requireRole("admin"), async (_req, res) => {
  try {
    const items = await listTeacherFaceEnrollmentsForAdmin();
    return res.json({
      success: true,
      data: {
        aws: getPublicAwsRekognitionStatus(),
        enrollments: items,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể tải danh sách đăng ký khuôn mặt giảng viên");
  }
});

// Admin: approve (lock), reject, or unlock a teacher's face enrollment
router.patch("/admin/enrollments/:teacherId", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const teacherId = parsePositiveId(req.params.teacherId);
    if (!teacherId) {
      return res.status(422).json({ success: false, message: "teacherId không hợp lệ." });
    }
    const action = String(req.body?.action || "");
    const note = req.body?.note || "";
    const updated = await reviewTeacherFaceEnrollment({
      teacherId,
      action,
      reviewNote: note,
      adminId: req.user.id,
    });

    const msgMap = {
      approve: "Đã duyệt và khóa khuôn mặt mẫu cho giảng viên.",
      reject: "Đã từ chối ảnh đăng ký khuôn mặt.",
      unlock: "Đã mở khóa để giảng viên chụp đăng ký lại khuôn mặt.",
    };
    return res.json({
      success: true,
      message: msgMap[action] || "Đã cập nhật trạng thái duyệt khuôn mặt.",
      data: updated,
    });
  } catch (error) {
    return handleRouteError(res, error, "Không thể cập nhật trạng thái duyệt khuôn mặt");
  }
});

// Admin: approve / reject / reset payroll eligibility for a teacher's session attendance
router.patch(
  "/admin/sessions/:sessionId/teachers/:teacherId/override",
  protectRoute,
  requireRole("admin"),
  async (req, res) => {
    try {
      const sessionId = parsePositiveId(req.params.sessionId);
      const teacherId = parsePositiveId(req.params.teacherId);
      if (!sessionId || !teacherId) {
        return res.status(422).json({ success: false, message: "sessionId hoặc teacherId không hợp lệ." });
      }

      const decision = String(req.body?.decision || "");
      const note = req.body?.note || "";
      const updated = await adminOverrideSessionAttendance({
        sessionId,
        teacherId,
        decision,
        note,
        adminId: req.user.id,
      });

      const msgMap = {
        approved: "Đã duyệt tính lương cho buổi dạy này.",
        rejected: "Đã từ chối tính lương buổi dạy này.",
        reset: "Đã hoàn tác duyệt tay về trạng thái chấm công tự động.",
      };
      return res.json({
        success: true,
        message: msgMap[decision] || "Đã cập nhật duyệt chấm công buổi dạy.",
        data: updated,
      });
    } catch (error) {
      return handleRouteError(res, error, "Không thể cập nhật duyệt chấm công buổi dạy");
    }
  },
);

// Admin dry-run self-test: start real AWS Rekognition test session (no payroll/attendance writes)
router.post("/admin/self-test/session", protectRoute, requireRole("admin"), async (req, res) => {
  try {
    const payload = await startAdminFaceSelfTest({ adminId: req.user.id });
    return res.json({ success: true, data: payload });
  } catch (error) {
    return handleRouteError(res, error, "Không thể khởi tạo phiên test AWS Rekognition");
  }
});

// Admin dry-run self-test: verify live frames against AWS Rekognition (+ optional enrolled teacher comparison)
router.post(
  "/admin/self-test/verify",
  protectRoute,
  requireRole("admin"),
  faceUpload.fields([
    { name: "snapshot", maxCount: 1 },
    { name: "challengeSnapshot", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const livenessSessionId = req.body?.livenessSessionId ? String(req.body.livenessSessionId) : null;
      const compareTeacherId = req.body?.compareTeacherId ? parsePositiveId(req.body.compareTeacherId) : null;
      const snapshotFile = req.files?.snapshot?.[0] || null;
      const challengeFile = req.files?.challengeSnapshot?.[0] || null;

      const report = await verifyAdminFaceSelfTest({
        adminId: req.user.id,
        livenessSessionId,
        straightSnapshotBuffer: snapshotFile?.buffer || null,
        challengeSnapshotBuffer: challengeFile?.buffer || null,
        compareTeacherId,
      });

      return res.json({
        success: true,
        message: report.passed
          ? "Test AWS Rekognition thành công (Dry-run, không ảnh hưởng lương)."
          : "Đã nhận phản hồi từ AWS Rekognition — chưa đạt ngưỡng xác thực.",
        data: report,
      });
    } catch (error) {
      return handleRouteError(res, error, "Không thể chạy bài test AWS Rekognition");
    }
  },
);

export default router;
