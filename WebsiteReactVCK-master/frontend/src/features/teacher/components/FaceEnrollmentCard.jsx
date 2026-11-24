import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  Lock,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  Unlock,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import {
  fetchTeacherFaceStatus,
  reviewAdminTeacherFaceEnrollment,
  submitTeacherFaceEnrollment,
} from "../../api/teacherFaceAttendanceClient";

const AwsFaceLivenessModal = lazy(() => import("./AwsFaceLivenessModal.jsx"));

const STATUS_BADGES = {
  approved: {
    label: "Đã khóa",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: Lock,
  },
  pending_approval: {
    label: "Chờ duyệt",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300",
    icon: Clock,
  },
  rejected: {
    label: "Cần chụp lại",
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300",
    icon: ShieldAlert,
  },
  unlocked: {
    label: "Đã mở khóa",
    className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300",
    icon: RefreshCw,
  },
  not_enrolled: {
    label: "Chưa đăng ký",
    className: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: ScanFace,
  },
};

export default function FaceEnrollmentCard() {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState(null);
  const [awsStatus, setAwsStatus] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingSelf, setReviewingSelf] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const attachStreamToVideo = useCallback((videoEl) => {
    videoRef.current = videoEl;
    if (videoEl && streamRef.current) {
      if (videoEl.srcObject !== streamRef.current) {
        videoEl.srcObject = streamRef.current;
      }
      videoEl.play().catch(() => {});
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchTeacherFaceStatus();
      setEnrollment(res?.data?.enrollment || null);
      setAwsStatus(res?.data?.aws || null);
    } catch (error) {
      console.error("Không thể tải trạng thái khuôn mặt giảng viên:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => stopCamera();
  }, [loadStatus, stopCamera]);

  useEffect(() => () => {
    if (capturedPreview) URL.revokeObjectURL(capturedPreview);
  }, [capturedPreview]);

  const startCamera = async () => {
    setCameraError("");
    setCapturedBlob(null);
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
      setCapturedPreview("");
    }
    setCameraOpen(true);
    stopCamera();

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
      setCameraError("Chưa có quyền Camera. Hãy cho phép truy cập Camera rồi thử lại.");
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Camera chưa sẵn sàng, chờ 1 giây.");
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
      (blob) => {
        if (!blob) {
          toast.error("Không thể chụp ảnh.");
          return;
        }
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleSubmit = async () => {
    if (!capturedBlob) {
      toast.error("Chưa có ảnh khuôn mặt.");
      return;
    }
    if (!consentAccepted) {
      toast.error("Vui lòng xác nhận đồng ý.");
      return;
    }

    try {
      setSubmitting(true);
      await submitTeacherFaceEnrollment({
        blob: capturedBlob,
        consentAccepted: true,
      });
      toast.success("Đã lưu ảnh Face ID!");
      setCameraOpen(false);
      setCapturedBlob(null);
      await loadStatus();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
    } catch (error) {
      toast.error(error?.message || "Không thể đăng ký khuôn mặt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminSelfReview = async (action) => {
    if (!authUser?.id) return;
    try {
      setReviewingSelf(true);
      await reviewAdminTeacherFaceEnrollment(authUser.id, { action, note: "" });
      toast.success(action === "approve" ? "Đã duyệt & khóa Face ID!" : "Đã mở khóa Face ID.");
      await loadStatus();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật trạng thái");
    } finally {
      setReviewingSelf(false);
    }
  };

  const statusKey = enrollment?.status || "not_enrolled";
  const badge = STATUS_BADGES[statusKey] || STATUS_BADGES.not_enrolled;
  const BadgeIcon = badge.icon;
  const isLocked = statusKey === "approved";

  return (
    <>
      <div
        id="face-enrollment"
        className="rounded-3xl border border-white/80 bg-white/95 p-4 sm:p-5 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none space-y-3.5"
      >
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <ScanFace className="h-5 w-5" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#102f63] dark:text-white">
                Face ID chấm công
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.className}`}
              >
                <BadgeIcon className="h-3 w-3" />
                {badge.label}
              </span>
            </div>
          </div>

          {isAdmin && !cameraOpen && (
            <button
              type="button"
              onClick={() => setTestModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Test Face ID
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
            Đang tải...
          </div>
        ) : (
          <div className="space-y-3">
            {/* Enrolled Photo Preview */}
            {enrollment?.photoUrl && !cameraOpen && (
              <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                <img
                  src={enrollment.photoUrl}
                  alt="Ảnh Face ID"
                  className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white dark:ring-slate-700 shadow-xs"
                />
                <div className="min-w-0 flex-1 text-xs space-y-0.5">
                  <p className="font-bold text-slate-800 dark:text-white">
                    {isLocked ? "Sẵn sàng chấm công" : statusKey === "pending_approval" ? "Đã gửi ảnh mẫu" : "Ảnh gần nhất"}
                  </p>
                  {enrollment.submittedAt && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(enrollment.submittedAt).toLocaleString("vi-VN")}
                    </p>
                  )}
                  {enrollment.reviewNote && (
                    <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 truncate">
                      {enrollment.reviewNote}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Action Row */}
            {!cameraOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                {!isLocked && (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
                  >
                    <Camera className="h-4 w-4" />
                    {enrollment ? "Chụp lại" : "Đăng ký Face ID"}
                  </button>
                )}

                {isAdmin && statusKey === "pending_approval" && (
                  <button
                    type="button"
                    disabled={reviewingSelf}
                    onClick={() => handleAdminSelfReview("approve")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {reviewingSelf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Duyệt & Khóa
                  </button>
                )}

                {isAdmin && isLocked && (
                  <button
                    type="button"
                    disabled={reviewingSelf}
                    onClick={() => handleAdminSelfReview("unlock")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    Mở khóa để chụp lại
                  </button>
                )}

                {!isAdmin && isLocked && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Đã kích hoạt chấm công Vào / Ra.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#102f63] dark:text-white">
                    {capturedPreview ? "Xem lại ảnh" : "Nhìn thẳng vào vòng tròn"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setCameraOpen(false);
                      setCapturedBlob(null);
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Đóng camera"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {cameraError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300">
                    {cameraError}
                  </div>
                ) : capturedPreview ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={capturedPreview}
                      alt="Ảnh vừa chụp"
                      className="h-52 w-52 rounded-3xl object-cover ring-4 ring-white shadow-md dark:ring-slate-700"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={consentAccepted}
                        onChange={(e) => setConsentAccepted(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                      />
                      <span>Đồng ý dùng ảnh này để chấm công khuôn mặt</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Chụp lại
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !consentAccepted}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {submitting ? "Đang gửi..." : "Lưu Face ID"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative h-56 w-56 overflow-hidden rounded-3xl bg-slate-900 ring-4 ring-white shadow-md dark:ring-slate-700">
                      <video
                        ref={attachStreamToVideo}
                        playsInline
                        muted
                        autoPlay
                        className="h-full w-full -scale-x-100 object-cover"
                      />
                      <div className="pointer-events-none absolute inset-4 rounded-full border-2 border-dashed border-white/80" />
                    </div>
                    <button
                      type="button"
                      onClick={handleCapture}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-700"
                    >
                      <Camera className="h-4 w-4" /> Chụp ảnh
                    </button>
                  </div>
                )}
              </div>
            )}

            {awsStatus && !awsStatus.configured && !awsStatus.mockMode && (
              <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300">
                Server chưa cấu hình AWS Rekognition key.
              </p>
            )}
          </div>
        )}
      </div>

      {testModalOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
              <div className="flex items-center gap-2 rounded-2xl bg-white px-5 py-4 text-xs font-bold text-slate-700 shadow-xl dark:bg-slate-900 dark:text-slate-100">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                Đang mở camera...
              </div>
            </div>
          }
        >
          <AwsFaceLivenessModal
            isOpen={testModalOpen}
            adminTestMode={true}
            defaultCompareTeacherId={authUser?.id ? String(authUser.id) : ""}
            sessionId={0}
            type="admin_test"
            onClose={() => setTestModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
