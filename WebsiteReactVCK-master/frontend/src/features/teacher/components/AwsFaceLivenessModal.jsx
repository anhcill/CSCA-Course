import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider as AmplifyThemeProvider } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
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
  hintMoveFaceFrontOfCameraText: "Đưa mặt vào giữa khung",
  hintTooManyFacesText: "Chỉ 1 khuôn mặt trong khung",
  hintFaceDetectedText: "Đã nhận diện khuôn mặt",
  hintCanNotIdentifyText: "Đưa mặt lại gần hơn",
  hintTooCloseText: "Lùi ra xa một chút",
  hintTooFarText: "Tiến lại gần hơn",
  hintConnectingText: "Đang kết nối...",
  hintVerifyingText: "Đang xác thực...",
  hintCheckCompleteText: "Hoàn tất quét",
  hintIlluminationTooBrightText: "Hơi chói sáng",
  hintIlluminationTooDarkText: "Hơi tối, cần thêm sáng",
  hintIlluminationNormalText: "Ánh sáng tốt",
  hintHoldFaceForFreshnessText: "Giữ yên khuôn mặt",
  hintCenterFaceText: "Canh mặt giữa khung",
  hintCenterFaceInstructionText: "Giữ mặt thẳng trong khung rồi bấm bắt đầu.",
  cameraMinSpecificationsHeadingText: "Camera không đạt chuẩn",
  cameraMinSpecificationsMessageText: "Cần camera tối thiểu 320x240, 15fps.",
  cameraNotFoundHeadingText: "Không tìm thấy camera",
  cameraNotFoundMessageText: "Hãy cấp quyền Camera cho trình duyệt.",
  retryCameraPermissionsText: "Thử lại quyền Camera",
  waitingCameraPermissionText: "Chờ cấp quyền Camera...",
  a11yVideoLabelText: "Camera Face ID",
  goodFitCaptionText: "Chuẩn",
  goodFitAltText: "Mặt gọn trong khung",
  photosensitivityWarningBodyText: "Màn hình sẽ nháy sáng trong 3 giây.",
  photosensitivityWarningHeadingText: "Ánh sáng nhấp nháy",
  photosensitivityWarningInfoText: "Màn hình sẽ đổi màu nhẹ khi quét.",
  photosensitivityWarningLabelText: "Thông tin ánh sáng",
  startScreenBeginCheckText: "Bắt đầu quét",
  tooFarCaptionText: "Quá xa",
  tooFarAltText: "Mặt quá xa camera",
  recordingIndicatorText: "Đang quét",
  errorLabelText: "Lỗi",
  connectionTimeoutHeaderText: "Hết thời gian kết nối",
  connectionTimeoutMessageText: "Kết nối gián đoạn, hãy thử lại.",
  timeoutHeaderText: "Hết thời gian quét",
  timeoutMessageText: "Vui lòng thử lại ở nơi đủ sáng.",
  faceDistanceHeaderText: "Di chuyển quá nhanh",
  faceDistanceMessageText: "Giữ khoảng cách ổn định.",
  multipleFacesHeaderText: "Nhiều khuôn mặt",
  multipleFacesMessageText: "Chỉ để một mình bạn trong khung.",
  clientHeaderText: "Lỗi trình duyệt",
  clientMessageText: "Thử lại hoặc gửi ảnh duyệt tay.",
  serverHeaderText: "Lỗi máy chủ",
  serverMessageText: "Không thể xác thực, vui lòng thử lại.",
  landscapeHeaderText: "Xoay dọc thiết bị",
  landscapeMessageText: "Giữ điện thoại thẳng đứng.",
  portraitMessageText: "Giữ điện thoại thẳng đứng.",
  tryAgainText: "Thử lại",
  cancelLivenessCheckText: "Hủy",
};

const fmtTime = (value) => {
  if (!value) return "--:--";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "--:--"
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

export default function AwsFaceLivenessModal({
  isOpen,
  sessionId,
  sessionTitle,
  sessionMeta = null,
  type = "check_in",
  adminTestMode = false,
  defaultCompareTeacherId = "",
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

  const [enrolledTeachers, setEnrolledTeachers] = useState([]);
  const [compareTeacherId, setCompareTeacherId] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureLockRef = useRef(false);

  const isCheckIn = type === "check_in";
  const actionLabel = adminTestMode
    ? "Test Face ID"
    : isCheckIn
      ? "Chấm Vào"
      : "Chấm Ra";

  const attachVideoRef = useCallback((videoEl) => {
    videoRef.current = videoEl;
    if (videoEl && streamRef.current) {
      if (videoEl.srcObject !== streamRef.current) {
        videoEl.srcObject = streamRef.current;
      }
      videoEl.play().catch(() => {});
    }
  }, []);

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
      setErrorMessage("Chưa có quyền Camera. Hãy cho phép truy cập Camera rồi thử lại.");
    }
  }, [stopFallbackCamera]);

  const initSession = useCallback(async () => {
    captureLockRef.current = false;
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
      setErrorMessage(error?.message || "Không thể khởi tạo phiên Face ID.");
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
          if (list.length > 0) {
            const preferred = defaultCompareTeacherId
              ? list.find((item) => String(item.teacherId) === String(defaultCompareTeacherId))
              : null;
            setCompareTeacherId(String((preferred || list[0]).teacherId));
          } else {
            setCompareTeacherId("");
          }
        })
        .catch(() => {});
    }
    return () => stopFallbackCamera();
  }, [isOpen, adminTestMode, defaultCompareTeacherId, initSession, stopFallbackCamera]);

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
      if (!creds) throw new Error("Thiếu phiên xác thực AWS tạm thời.");
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
      setErrorMessage(error?.message || "Xác thực không thành công.");
      setPhase("error");
    }
  };

  const captureFrameBlob = () =>
    new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        reject(new Error("Camera chưa sẵn sàng, chờ 1 giây."));
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
        (blob) => (blob ? resolve(blob) : reject(new Error("Không thể chụp ảnh."))),
        "image/jpeg",
        0.9,
      );
    });

  const handleCameraSubmit = async ({ manualFallback }) => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;
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
      setErrorMessage(error?.message || "Không thể gửi ảnh.");
    } finally {
      captureLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleActiveChallengeCapture = async () => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;
    try {
      setErrorMessage("");
      const frame = await captureFrameBlob();
      if (challengeStep === 1) {
        setStraightBlob(frame);
        setChallengeStep(2);
        captureLockRef.current = false;
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
      setErrorMessage(error?.message || "Xác thực chưa thành công.");
      setPhase("error");
    } finally {
      captureLockRef.current = false;
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
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Compact Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                adminTestMode
                  ? "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"
                  : isCheckIn
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
              }`}
            >
              {adminTestMode ? (
                <FlaskConical className="h-4.5 w-4.5" />
              ) : isCheckIn ? (
                <LogIn className="h-4.5 w-4.5" />
              ) : (
                <LogOut className="h-4.5 w-4.5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                {adminTestMode ? "Test Face ID" : `Face ID · ${actionLabel}`}
              </h3>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {adminTestMode
                  ? "Thử nghiệm · Không lưu công"
                  : sessionTitle || `Buổi #${sessionId}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopFallbackCamera();
              onClose?.();
            }}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Minimal Context Strip */}
        {adminTestMode ? (
          <div className="border-b border-slate-100 bg-violet-50/60 px-4 py-2.5 dark:border-slate-800 dark:bg-violet-950/20">
            <select
              aria-label="Chọn ảnh mẫu để so khớp"
              value={compareTeacherId}
              onChange={(e) => setCompareTeacherId(e.target.value)}
              disabled={phase === "verifying"}
              className="w-full rounded-xl border border-violet-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Chỉ kiểm tra người thật (Liveness)</option>
              {enrolledTeachers.map((t) => (
                <option key={t.teacherId} value={String(t.teacherId)}>
                  So khớp: {t.fullName}
                </option>
              ))}
            </select>
          </div>
        ) : (sessionMeta?.startTime || sessionMeta?.lateMinutes > 0 || sessionMeta?.earlyLeaveMinutes > 0) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center gap-2 min-w-0">
              {sessionMeta?.classCode && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-black text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                  {sessionMeta.classCode}
                </span>
              )}
              {sessionMeta?.startTime && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <Clock className="h-3 w-3 text-indigo-500" />
                  {fmtTime(sessionMeta.startTime)}–{fmtTime(sessionMeta.endTime)}
                </span>
              )}
            </div>

            {phase !== "success" && isCheckIn && sessionMeta?.lateMinutes > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Muộn {sessionMeta.lateMinutes}p
              </span>
            )}
            {phase !== "success" && !isCheckIn && sessionMeta?.earlyLeaveMinutes > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Về sớm {sessionMeta.earlyLeaveMinutes}p
              </span>
            )}
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {phase === "init" && (
            <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Đang mở camera...
              </p>
            </div>
          )}

          {phase === "verifying" && (
            <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                Đang xác thực Face ID...
              </p>
            </div>
          )}

          {/* Admin Dry-Run Receipt */}
          {phase === "success" && receipt && adminTestMode && (
            <div className="space-y-4 py-1 text-center">
              <div
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ring-8 ${
                  receipt.passed
                    ? "bg-emerald-100 text-emerald-600 ring-emerald-50 dark:bg-emerald-950 dark:ring-emerald-950/40"
                    : "bg-amber-100 text-amber-600 ring-amber-50 dark:bg-amber-950 dark:ring-amber-950/40"
                }`}
              >
                {receipt.passed ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
              </div>

              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {receipt.passed ? "Xác thực ĐẠT" : "Chưa đạt ngưỡng"}
                </h4>
                {receipt.livenessReason && (
                  <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {receipt.livenessReason}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-left text-xs space-y-2 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Người thật (Liveness)</span>
                  <span className={`font-mono font-bold ${receipt.livenessPassed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    {receipt.livenessPassed ? "ĐẠT" : "TRƯỢT"} · {receipt.livenessConfidence ?? "--"}%
                  </span>
                </div>
                {receipt.comparedAgainst && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 truncate pr-2">
                      Khớp ({receipt.comparedAgainst.fullName})
                    </span>
                    <span className={`shrink-0 font-mono font-bold ${receipt.faceMatched ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                      {receipt.faceMatched ? "KHỚP" : "LỆCH"} · {receipt.faceSimilarity}%
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">AWS · Tốc độ</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-sky-400">
                    {receipt.region} · {receipt.latencyMs}ms
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={initSession}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Xong
                </button>
              </div>
            </div>
          )}

          {/* Teacher Check-In / Check-Out Receipt */}
          {phase === "success" && receipt && !adminTestMode && (
            <div className="space-y-4 py-1 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50 dark:bg-emerald-950 dark:ring-emerald-950/40">
                <CheckCircle2 className="h-7 w-7" />
              </div>

              <h4 className="text-base font-black text-slate-900 dark:text-white">
                {recordedStatus === "manual_review" ? "Đã gửi duyệt tay" : `${actionLabel} thành công`}
              </h4>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-left text-xs space-y-2 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Giờ ghi nhận</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white">
                    {fmtTime(recordedTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Trạng thái</span>
                  <span className="font-bold">
                    {recordedStatus === "on_time" && <span className="text-emerald-600 dark:text-emerald-400">Đúng giờ</span>}
                    {recordedStatus === "late" && <span className="text-amber-700 dark:text-amber-400">Muộn {receipt.lateMinutes}p</span>}
                    {recordedStatus === "early_leave" && <span className="text-amber-700 dark:text-amber-400">Về sớm {receipt.earlyLeaveMinutes}p</span>}
                    {recordedStatus === "manual_review" && <span className="text-sky-700 dark:text-sky-400">Chờ Admin duyệt</span>}
                  </span>
                </div>
                {(recordedLiveness != null || recordedSimilarity != null) && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Face ID</span>
                    <span className="font-mono font-bold text-indigo-700 dark:text-sky-300">
                      {recordedLiveness != null ? `${recordedLiveness}%` : ""}
                      {recordedLiveness != null && recordedSimilarity != null ? " · " : ""}
                      {recordedSimilarity != null ? `Khớp ${recordedSimilarity}%` : ""}
                    </span>
                  </div>
                )}
                {receipt.payrollEligible && (
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Tính công</span>
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Đủ điều kiện
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onClose?.()}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                Xong
              </button>
            </div>
          )}

          {/* AWS Streaming Liveness */}
          {phase === "aws_liveness" && livenessData?.livenessSessionId && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <AmplifyThemeProvider>
                  <FaceLivenessDetectorCore
                    sessionId={livenessData.livenessSessionId}
                    region={livenessData.region}
                    onAnalysisComplete={handleAwsAnalysisComplete}
                    onUserCancel={() => onClose?.()}
                    onError={(err) => {
                      setErrorMessage(String(err?.error?.message || err?.state || "Quét không thành công."));
                      setPhase("error");
                    }}
                    displayText={VIETNAMESE_LIVENESS_TEXT}
                    config={{ credentialProvider }}
                  />
                </AmplifyThemeProvider>
              </div>
              {!adminTestMode && (
                <button
                  type="button"
                  onClick={() => setPhase("manual_fallback")}
                  className="w-full text-center text-[11px] font-semibold text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
                >
                  Camera lỗi? Gửi ảnh duyệt tay
                </button>
              )}
            </div>
          )}

          {/* Active 2-Step Challenge (Ultra-clean Face ID Ring) */}
          {phase === "active_challenge" && (
            <div className="flex flex-col items-center gap-3.5">
              {/* Minimal Step Indicator */}
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <span
                  className={`rounded-full px-2.5 py-0.5 ${
                    challengeStep === 1
                      ? "bg-indigo-600 text-white"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  }`}
                >
                  1. Nhìn thẳng
                </span>
                <span className="text-slate-300 dark:text-slate-600">→</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 ${
                    challengeStep === 2
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  2. Cử chỉ
                </span>
              </div>

              {/* Single Crisp Prompt */}
              <p className="text-center text-base font-black text-slate-900 dark:text-white">
                {challengeStep === 1
                  ? "Nhìn thẳng vào camera"
                  : livenessData?.challenge?.title || "Thực hiện cử chỉ"}
              </p>

              {/* Big Clean Camera Ring */}
              <div
                className={`relative h-60 w-60 overflow-hidden rounded-full bg-slate-900 ring-4 shadow-lg transition-colors ${
                  challengeStep === 1
                    ? "ring-indigo-500/70"
                    : "ring-emerald-500/80"
                }`}
              >
                <video
                  ref={attachVideoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full -scale-x-100 object-cover"
                />
                <div
                  className={`pointer-events-none absolute inset-3 rounded-full border-2 border-dashed ${
                    challengeStep === 1 ? "border-white/75" : "border-emerald-300"
                  }`}
                />
              </div>

              {errorMessage && (
                <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {errorMessage}
                </p>
              )}

              <div className="flex w-full items-center justify-center gap-2">
                {challengeStep === 2 && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setStraightBlob(null);
                      setChallengeStep(1);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Lại
                  </button>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleActiveChallengeCapture}
                  className={`flex-1 max-w-[240px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50 ${
                    challengeStep === 1
                      ? "bg-indigo-600 hover:bg-indigo-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  <Camera className="h-4 w-4" />
                  {challengeStep === 1 ? "Chụp bước 1" : "Chụp & Xác thực"}
                </button>
              </div>

              {!adminTestMode && (
                <button
                  type="button"
                  onClick={() => setPhase("manual_fallback")}
                  className="text-[11px] font-semibold text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Camera lỗi? Gửi duyệt tay
                </button>
              )}
            </div>
          )}

          {/* Mock / Manual Fallback Camera */}
          {(phase === "mock_camera" || phase === "manual_fallback") && (
            <div className="flex flex-col items-center gap-3.5">
              <p className="text-center text-sm font-black text-slate-900 dark:text-white">
                {phase === "mock_camera" ? "Chế độ thử nghiệm" : "Chụp ảnh gửi duyệt tay"}
              </p>

              <div className="relative h-60 w-60 overflow-hidden rounded-full bg-slate-900 ring-4 ring-sky-500/70 shadow-lg">
                <video
                  ref={attachVideoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full -scale-x-100 object-cover"
                />
                <div className="pointer-events-none absolute inset-3 rounded-full border-2 border-dashed border-white/75" />
              </div>

              {errorMessage && (
                <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleCameraSubmit({ manualFallback: phase === "manual_fallback" })}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {submitting ? "Đang gửi..." : phase === "manual_fallback" ? "Chụp & Gửi duyệt" : "Chụp xác thực"}
              </button>
            </div>
          )}

          {/* Error Phase */}
          {phase === "error" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Chưa xác thực được
                </h4>
                <p className="text-xs leading-relaxed text-rose-600 dark:text-rose-400">
                  {errorMessage}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={initSession}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Thử lại
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
                    Gửi duyệt tay
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
