import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider as AmplifyThemeProvider } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  createTeacherSessionFaceLiveness,
  fetchAdminTeacherFaceEnrollments,
  startAdminFaceSelfTest,
  verifyAdminFaceSelfTest,
  verifyTeacherSessionFace,
} from "../../api/teacherFaceAttendanceClient";

const VIETNAMESE_LIVENESS_TEXT = {
  hintMoveFaceFrontOfCameraText: "Đưa khuôn mặt vào giữa khung hình",
  hintTooManyFacesText: "Chỉ để 1 khuôn mặt trong khung hình",
  hintFaceDetectedText: "Đã nhận diện khuôn mặt",
  hintCanNotIdentifyText: "Đưa khuôn mặt vào gần khung hình hơn",
  hintTooCloseText: "Lùi ra xa camera một chút",
  hintTooFarText: "Tiến lại gần camera hơn",
  hintConnectingText: "Đang kết nối AWS Rekognition...",
  hintVerifyingText: "Đang xác thực người thật...",
  hintCheckCompleteText: "Đã hoàn tất quét khuôn mặt",
  hintIlluminationTooBrightText: "Ánh sáng quá chói, giảm sáng một chút",
  hintIlluminationTooDarkText: "Môi trường hơi tối, vui lòng thêm ánh sáng",
  hintIlluminationNormalText: "Ánh sáng đạt yêu cầu",
  hintHoldFaceForFreshnessText: "Giữ yên khuôn mặt trong giây lát",
  hintCenterFaceText: "Canh mặt vào giữa khung oval",
  hintCenterFaceInstructionText: "Giữ khuôn mặt thẳng trong khung oval rồi bấm bắt đầu.",
  cameraMinSpecificationsHeadingText: "Camera không đạt độ phân giải tối thiểu",
  cameraMinSpecificationsMessageText: "Camera cần độ phân giải tối thiểu 320x240 và 15fps.",
  cameraNotFoundHeadingText: "Không tìm thấy camera",
  cameraNotFoundMessageText: "Vui lòng kiểm tra thiết bị đã cấp quyền Camera cho trình duyệt / PWA.",
  retryCameraPermissionsText: "Thử cấp quyền lại",
  waitingCameraPermissionText: "Đang chờ cấp quyền camera...",
  a11yVideoLabelText: "Camera xác thực khuôn mặt",
  goodFitCaptionText: "Khung hình chuẩn",
  goodFitAltText: "Khuôn mặt nằm gọn trong khung oval",
  photosensitivityWarningBodyText: "Quá trình xác thực sẽ nháy ánh sáng nhiều màu trong khoảng 3 giây.",
  photosensitivityWarningHeadingText: "Lưu ý ánh sáng nhấp nháy",
  photosensitivityWarningInfoText: "Một số người nhạy cảm với ánh sáng nhấp nháy có thể thấy hơi chói nhẹ.",
  photosensitivityWarningLabelText: "Thông tin thêm về ánh sáng nhấp nháy",
  startScreenBeginCheckText: "Bắt đầu quét khuôn mặt",
  tooFarCaptionText: "Quá xa",
  tooFarAltText: "Khuôn mặt ở quá xa camera",
  recordingIndicatorText: "Đang quét",
  errorLabelText: "Lỗi xác thực",
  connectionTimeoutHeaderText: "Hết thời gian kết nối",
  connectionTimeoutMessageText: "Kết nối bị gián đoạn, vui lòng thử lại.",
  timeoutHeaderText: "Quá thời gian quét",
  timeoutMessageText: "Không kịp hoàn tất quét khuôn mặt. Vui lòng thử lại ở nơi đủ sáng.",
  faceDistanceHeaderText: "Di chuyển quá nhanh",
  faceDistanceMessageText: "Giữ khoảng cách ổn định trong lúc quét.",
  multipleFacesHeaderText: "Phát hiện nhiều khuôn mặt",
  multipleFacesMessageText: "Chỉ để một mình bạn trong khung hình.",
  clientHeaderText: "Lỗi trình duyệt",
  clientMessageText: "Trình duyệt gặp sự cố khi quét. Bạn có thể thử lại hoặc gửi ảnh duyệt tay.",
  serverHeaderText: "Lỗi máy chủ xác thực",
  serverMessageText: "Không thể hoàn tất xác thực với AWS. Vui lòng thử lại.",
  landscapeHeaderText: "Vui lòng xoay dọc điện thoại",
  landscapeMessageText: "Xoay thiết bị theo chiều dọc để tiếp tục.",
  portraitMessageText: "Giữ thiết bị thẳng đứng trong suốt quá trình quét.",
  tryAgainText: "Thử lại",
  cancelLivenessCheckText: "Hủy quét",
};

const fmtTime = (value) => {
  if (!value) return "--:--";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "--:--"
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

const fmtDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function AwsFaceLivenessModal({
  isOpen,
  sessionId,
  sessionTitle,
  sessionMeta = null,
  type = "check_in",
  adminTestMode = false,
  onClose,
  onSuccess,
}) {
  const [phase, setPhase] = useState("init"); // init | aws_liveness | active_challenge | mock_camera | manual_fallback | verifying | success | error
  const [livenessData, setLivenessData] = useState(null);
  const [challengeStep, setChallengeStep] = useState(1);
  const [straightBlob, setStraightBlob] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Admin test target teacher selection
  const [enrolledTeachers, setEnrolledTeachers] = useState([]);
  const [compareTeacherId, setCompareTeacherId] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const isCheckIn = type === "check_in";
  const actionLabel = adminTestMode
    ? "Test AWS Rekognition"
    : isCheckIn
      ? "Chấm công Vào ca"
      : "Chấm công Ra ca";

  const stopFallbackCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startLiveCameraStream = useCallback(async () => {
    stopFallbackCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setErrorMessage("Không thể mở camera. Vui lòng cấp quyền Camera cho trình duyệt / PWA.");
    }
  }, [stopFallbackCamera]);

  const initSession = useCallback(async () => {
    setPhase("init");
    setErrorMessage("");
    setReceipt(null);
    setChallengeStep(1);
    setStraightBlob(null);
    setLivenessData(null);
    stopFallbackCamera();

    try {
      const res = adminTestMode
        ? await startAdminFaceSelfTest()
        : await createTeacherSessionFaceLiveness(sessionId, type);
      const data = res?.data;
      setLivenessData(data);
      if (data?.mockMode || data?.mode === "mock") {
        setPhase("mock_camera");
      } else if (data?.mode === "active_challenge") {
        setPhase("active_challenge");
      } else {
        setPhase("aws_liveness");
      }
    } catch (error) {
      setErrorMessage(error?.message || "Không thể khởi tạo phiên AWS Rekognition");
      setPhase("error");
    }
  }, [adminTestMode, sessionId, type, stopFallbackCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopFallbackCamera();
      return undefined;
    }
    initSession();
    if (adminTestMode) {
      fetchAdminTeacherFaceEnrollments()
        .then((res) => {
          const list = (res?.data?.enrollments || []).filter((item) => item.status !== "not_enrolled");
          setEnrolledTeachers(list);
        })
        .catch(() => {});
    }
    return () => stopFallbackCamera();
  }, [isOpen, adminTestMode, initSession, stopFallbackCamera]);

  useEffect(() => {
    if (isOpen && (phase === "active_challenge" || phase === "mock_camera" || phase === "manual_fallback")) {
      startLiveCameraStream();
    } else {
      stopFallbackCamera();
    }
  }, [isOpen, phase, startLiveCameraStream, stopFallbackCamera]);

  const credentialProvider = useMemo(() => {
    const creds = livenessData?.credentials;
    return async () => {
      if (!creds) {
        throw new Error("Thiếu thông tin phiên xác thực AWS tạm thời.");
      }
      return {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        expiration: creds.expiration ? new Date(creds.expiration) : undefined,
      };
    };
  }, [livenessData]);

  const finishSuccess = (record, message) => {
    if (!adminTestMode) {
      toast.success(message || `${actionLabel} thành công!`);
    }
    setReceipt(record);
    setPhase("success");
    if (!adminTestMode) {
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated", { detail: record }));
    }
    onSuccess?.(record);
  };

  const handleAwsAnalysisComplete = async () => {
    setPhase("verifying");
    setErrorMessage("");
    try {
      const res = adminTestMode
        ? await verifyAdminFaceSelfTest({
            livenessSessionId: livenessData?.livenessSessionId,
            compareTeacherId: compareTeacherId || null,
          })
        : await verifyTeacherSessionFace({
            sessionId,
            type,
            livenessSessionId: livenessData?.livenessSessionId,
            manualFallback: false,
          });
      finishSuccess(res?.data, res?.message);
    } catch (error) {
      setErrorMessage(error?.message || "Xác thực khuôn mặt không thành công.");
      setPhase("error");
    }
  };

  const captureFrameBlob = () =>
    new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        reject(new Error("Camera chưa sẵn sàng, vui lòng chờ 1 giây."));
        return;
      }
      const canvas = document.createElement("canvas");
      const size = Math.min(video.videoWidth, video.videoHeight, 720);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Không thể chụp khung hình."))),
        "image/jpeg",
        0.9,
      );
    });

  const handleCameraSubmit = async ({ manualFallback }) => {
    try {
      setSubmitting(true);
      setErrorMessage("");
      const blob = await captureFrameBlob();
      const res = adminTestMode
        ? await verifyAdminFaceSelfTest({
            livenessSessionId: livenessData?.livenessSessionId,
            snapshotBlob: blob,
            challengeSnapshotBlob: blob,
            compareTeacherId: compareTeacherId || null,
          })
        : await verifyTeacherSessionFace({
            sessionId,
            type,
            livenessSessionId: manualFallback ? null : livenessData?.livenessSessionId,
            manualFallback,
            snapshotBlob: blob,
          });
      stopFallbackCamera();
      finishSuccess(res?.data, res?.message);
    } catch (error) {
      setErrorMessage(error?.message || "Không thể gửi ảnh chấm công.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleActiveChallengeCapture = async () => {
    try {
      setErrorMessage("");
      const frame = await captureFrameBlob();
      if (challengeStep === 1) {
        setStraightBlob(frame);
        setChallengeStep(2);
        return;
      }

      setSubmitting(true);
      setPhase("verifying");
      stopFallbackCamera();

      const res = adminTestMode
        ? await verifyAdminFaceSelfTest({
            livenessSessionId: livenessData?.livenessSessionId,
            snapshotBlob: straightBlob,
            challengeSnapshotBlob: frame,
            compareTeacherId: compareTeacherId || null,
          })
        : await verifyTeacherSessionFace({
            sessionId,
            type,
            livenessSessionId: livenessData?.livenessSessionId,
            manualFallback: false,
            snapshotBlob: straightBlob,
            challengeSnapshotBlob: frame,
          });
      finishSuccess(res?.data, res?.message);
    } catch (error) {
      setErrorMessage(error?.message || "Xác thực khuôn mặt chưa thành công.");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const recordedTime = isCheckIn ? receipt?.checkInAt : receipt?.checkOutAt;
  const recordedStatus = isCheckIn ? receipt?.checkInStatus : receipt?.checkOutStatus;
  const recordedLiveness = isCheckIn ? receipt?.checkInLivenessScore : receipt?.checkOutLivenessScore;
  const recordedSimilarity = isCheckIn ? receipt?.checkInFaceSimilarity : receipt?.checkOutFaceSimilarity;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={actionLabel}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-4"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                adminTestMode
                  ? "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"
                  : isCheckIn
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
              }`}
            >
              {adminTestMode ? (
                <FlaskConical className="h-5 w-5" />
              ) : isCheckIn ? (
                <LogIn className="h-5 w-5" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white sm:text-base">
                {adminTestMode ? "Admin Test AWS Rekognition (Dry-run)" : `${actionLabel} bằng khuôn mặt`}
              </h3>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {adminTestMode
                  ? "Kiểm tra kết nối AWS thực tế — không lưu công, không ảnh hưởng lương"
                  : sessionTitle || `Buổi học #${sessionId}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopFallbackCamera();
              onClose?.();
            }}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Đóng cửa sổ chấm công"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Context Banner: Admin Test options OR Session Info */}
        {adminTestMode ? (
          <div className="border-b border-slate-100 bg-violet-50/70 px-5 py-3 text-xs dark:border-slate-800 dark:bg-violet-950/25 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-violet-900 dark:text-violet-200">
                Chế độ đối chiếu ảnh mẫu (tùy chọn):
              </span>
              <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                DRY-RUN · KHÔNG TÍNH LƯƠNG
              </span>
            </div>
            <select
              value={compareTeacherId}
              onChange={(e) => setCompareTeacherId(e.target.value)}
              disabled={phase === "verifying"}
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Chỉ kiểm tra nhận diện khuôn mặt + chống giả mạo (DetectFaces)</option>
              {enrolledTeachers.map((t) => (
                <option key={t.teacherId} value={t.teacherId}>
                  So khớp CompareFaces với ảnh mẫu: {t.fullName} (@{t.username})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="border-b border-slate-100 bg-slate-50/90 px-5 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {sessionMeta?.classCode && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-black text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-sky-300 dark:border-blue-800">
                      {sessionMeta.classCode}
                    </span>
                  )}
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                    {sessionMeta?.classTitle || "Lớp giảng dạy"}
                  </span>
                </div>
                {(sessionMeta?.startTime || sessionMeta?.endTime) && (
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 text-indigo-500" />
                      {fmtDate(sessionMeta.startTime)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-200">
                      <Clock className="h-3 w-3 text-emerald-600" />
                      {fmtTime(sessionMeta.startTime)} – {fmtTime(sessionMeta.endTime)}
                    </span>
                  </p>
                )}
              </div>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                  isCheckIn ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"
                }`}
              >
                {isCheckIn ? "VÀO CA" : "RA CA"}
              </span>
            </div>

            {phase !== "success" && isCheckIn && sessionMeta?.lateMinutes > 0 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Lưu ý: Bạn đang chấm công Vào muộn khoảng <strong>{sessionMeta.lateMinutes} phút</strong> so với giờ bắt đầu.
              </p>
            )}
            {phase !== "success" && !isCheckIn && sessionMeta?.earlyLeaveMinutes > 0 && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Lưu ý: Buổi học còn <strong>{sessionMeta.earlyLeaveMinutes} phút</strong> nữa mới kết thúc — chấm công Ra ngay lúc này sẽ ghi nhận <strong>Về sớm</strong>.
              </p>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {phase === "init" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Đang khởi tạo phiên AWS Rekognition...
              </p>
            </div>
          )}

          {phase === "verifying" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                Đang gửi ảnh lên AWS Rekognition kiểm tra...
              </p>
              <p className="text-xs text-slate-500">Quá trình này chỉ mất 1–2 giây.</p>
            </div>
          )}

          {phase === "success" && receipt && adminTestMode && (
            <div className="space-y-4 py-1 text-center">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ring-8 ${
                  receipt.passed
                    ? "bg-emerald-100 text-emerald-600 ring-emerald-50 dark:bg-emerald-950 dark:ring-emerald-950/40"
                    : "bg-amber-100 text-amber-600 ring-amber-50 dark:bg-amber-950 dark:ring-amber-950/40"
                }`}
              >
                {receipt.passed ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
              </div>

              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {receipt.passed ? "Kết nối & Xác thực AWS Rekognition ĐẠT!" : "AWS phản hồi OK — Kết quả CHƯA ĐẠT ngưỡng"}
                </h4>
                {receipt.livenessReason && (
                  <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {receipt.livenessReason}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs space-y-2 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Region & Chế độ</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {receipt.region} · {receipt.mode}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Độ trễ phản hồi AWS</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-sky-400">
                    {receipt.latencyMs} ms
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Chống giả mạo (Liveness)</span>
                  <span className={`font-mono font-bold ${receipt.livenessPassed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    {receipt.livenessPassed ? "ĐẠT" : "KHÔNG ĐẠT"} ({receipt.livenessConfidence ?? "--"}%)
                  </span>
                </div>
                {receipt.samePersonSimilarity != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Khớp 2 bước (cùng 1 người)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {receipt.samePersonSimilarity}%
                    </span>
                  </div>
                )}
                {receipt.comparedAgainst && (
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">
                      CompareFaces ({receipt.comparedAgainst.fullName})
                    </span>
                    <span className={`font-mono font-bold ${receipt.faceMatched ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                      {receipt.faceMatched ? "KHỚP" : "KHÔNG KHỚP"} ({receipt.faceSimilarity}%)
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Tác động dữ liệu</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    An toàn · Không ghi chấm công / lương
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={initSession}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Chạy lại test
                </button>
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {phase === "success" && receipt && !adminTestMode && (
            <div className="space-y-4 py-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50 dark:bg-emerald-950 dark:ring-emerald-950/40">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {recordedStatus === "manual_review"
                    ? `Đã gửi ảnh ${actionLabel} chờ Admin duyệt`
                    : `${actionLabel} thành công!`}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Thông tin chấm công đã được ghi nhận theo giờ máy chủ.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs space-y-2 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Giờ ghi nhận ({isCheckIn ? "Vào" : "Ra"})</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white">
                    {fmtTime(recordedTime)} · {fmtDate(recordedTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Trạng thái</span>
                  <span className="font-bold">
                    {recordedStatus === "on_time" && <span className="text-emerald-600 dark:text-emerald-400">Đúng giờ</span>}
                    {recordedStatus === "late" && (
                      <span className="text-amber-700 dark:text-amber-400">Đi muộn {receipt.lateMinutes} phút</span>
                    )}
                    {recordedStatus === "early_leave" && (
                      <span className="text-amber-700 dark:text-amber-400">Về sớm {receipt.earlyLeaveMinutes} phút</span>
                    )}
                    {recordedStatus === "manual_review" && (
                      <span className="text-sky-700 dark:text-sky-400">Chờ Admin duyệt tay</span>
                    )}
                  </span>
                </div>
                {(recordedLiveness != null || recordedSimilarity != null) && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Xác thực AWS Rekognition</span>
                    <span className="font-mono font-bold text-indigo-700 dark:text-sky-300">
                      {recordedLiveness != null ? `Liveness ${recordedLiveness}%` : ""}
                      {recordedLiveness != null && recordedSimilarity != null ? " · " : ""}
                      {recordedSimilarity != null ? `Khớp ${recordedSimilarity}%` : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Trạng thái tính lương</span>
                  {receipt.payrollEligible ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Đủ điều kiện tính lương
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      {isCheckIn
                        ? "Nhớ chấm công Ra khi kết thúc buổi"
                        : "Đang chờ Admin xác nhận"}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onClose?.()}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                Hoàn tất
              </button>
            </div>
          )}

          {phase === "aws_liveness" && livenessData?.livenessSessionId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 px-3 py-2 text-[11px] font-semibold text-emerald-800 border border-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <ScanFace className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  AWS Rekognition Liveness ({livenessData.region})
                </span>
                {!adminTestMode && (
                  <button
                    type="button"
                    onClick={() => setPhase("manual_fallback")}
                    className="underline hover:text-emerald-950"
                  >
                    Lỗi camera? Gửi duyệt tay
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <AmplifyThemeProvider>
                  <FaceLivenessDetectorCore
                    sessionId={livenessData.livenessSessionId}
                    region={livenessData.region}
                    onAnalysisComplete={handleAwsAnalysisComplete}
                    onUserCancel={() => {
                      onClose?.();
                    }}
                    onError={(err) => {
                      const msg =
                        err?.error?.message
                        || err?.state
                        || "Quá trình quét khuôn mặt gặp sự cố. Vui lòng thử lại hoặc gửi ảnh duyệt tay.";
                      setErrorMessage(String(msg));
                      setPhase("error");
                    }}
                    displayText={VIETNAMESE_LIVENESS_TEXT}
                    config={{ credentialProvider }}
                  />
                </AmplifyThemeProvider>
              </div>
            </div>
          )}

          {phase === "active_challenge" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <ScanFace className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  AWS Rekognition ({livenessData?.region}) · Bước {challengeStep}/2
                </span>
                {!adminTestMode && (
                  <button
                    type="button"
                    onClick={() => setPhase("manual_fallback")}
                    className="underline hover:text-emerald-950"
                  >
                    Lỗi camera? Gửi duyệt tay
                  </button>
                )}
              </div>

              <div
                className={`w-full rounded-2xl border px-4 py-3 text-center ${
                  challengeStep === 1
                    ? "border-indigo-200 bg-indigo-50/80 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
                    : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  {challengeStep === 1 ? "Bước 1 / 2 · Nhận diện chính diện" : "Bước 2 / 2 · Thử thách chống giả mạo"}
                </p>
                <p className="mt-0.5 text-sm font-black">
                  {challengeStep === 1
                    ? "Nhìn thẳng vào giữa vòng tròn"
                    : livenessData?.challenge?.title || "Thực hiện cử chỉ xác thực"}
                </p>
                <p className="mt-0.5 text-xs opacity-90">
                  {challengeStep === 1
                    ? "Giữ khuôn mặt đủ sáng, không đeo khẩu trang rồi bấm chụp."
                    : livenessData?.challenge?.instruction || "Thực hiện theo hướng dẫn rồi bấm chụp."}
                </p>
              </div>

              <div className="relative h-64 w-64 overflow-hidden rounded-3xl bg-slate-900 ring-4 ring-slate-100 dark:ring-slate-800 shadow-md">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full -scale-x-100 object-cover"
                />
                <div
                  className={`pointer-events-none absolute inset-4 rounded-full border-2 border-dashed ${
                    challengeStep === 1 ? "border-white/80" : "border-amber-300"
                  }`}
                />
              </div>

              {errorMessage && (
                <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {errorMessage}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {challengeStep === 2 && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setStraightBlob(null);
                      setChallengeStep(1);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Chụp lại bước 1
                  </button>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleActiveChallengeCapture}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50 ${
                    challengeStep === 1
                      ? "bg-indigo-600 hover:bg-indigo-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  <Camera className="h-4 w-4" />
                  {challengeStep === 1 ? "Chụp bước 1 (Nhìn thẳng)" : `Chụp bước 2 & ${adminTestMode ? "Chạy Test AWS" : `Xác thực ${actionLabel}`}`}
                </button>
              </div>
            </div>
          )}

          {(phase === "mock_camera" || phase === "manual_fallback") && (
            <div className="flex flex-col items-center gap-4">
              {phase === "mock_camera" ? (
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <strong>Chế độ thử nghiệm (Mock AWS):</strong> Dùng để test luồng chấm công khi chưa kết nối AWS thật.
                </div>
              ) : (
                <div className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                  <strong>Gửi ảnh chờ Admin duyệt tay:</strong> Chụp trực tiếp khuôn mặt từ camera để ghi nhận giờ {isCheckIn ? "Vào" : "Ra"} ngay, không làm gián đoạn giờ dạy.
                </div>
              )}

              <div className="relative h-64 w-64 overflow-hidden rounded-3xl bg-slate-900 ring-4 ring-slate-100 dark:ring-slate-800 shadow-md">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full -scale-x-100 object-cover"
                />
                <div className="pointer-events-none absolute inset-4 rounded-full border-2 border-dashed border-white/75" />
              </div>

              {errorMessage && (
                <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleCameraSubmit({ manualFallback: phase === "manual_fallback" })}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang gửi...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    {phase === "manual_fallback"
                      ? "Chụp & gửi Admin duyệt"
                      : `Chụp xác thực ${actionLabel}`}
                  </>
                )}
              </button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Chưa hoàn tất xác thực tự động
                </h4>
                <p className="text-xs leading-relaxed text-rose-600 dark:text-rose-400">
                  {errorMessage}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={initSession}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Quét lại bằng AWS
                </button>
                {!adminTestMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setPhase("manual_fallback");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Gửi ảnh duyệt tay
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
}
