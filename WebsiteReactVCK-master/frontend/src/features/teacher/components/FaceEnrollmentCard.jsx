import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  Fingerprint,
  FlaskConical,
  Loader2,
  Lock,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  Smartphone,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import {
  deleteTeacherBiometricCredential,
  fetchTeacherFaceStatus,
  reviewAdminTeacherFaceEnrollment,
  submitTeacherFaceEnrollment,
} from "../../api/teacherFaceAttendanceClient";
import {
  detectDeviceBiometricInfo,
  isDeviceBiometricsSupported,
  registerDeviceBiometrics,
  testDeviceBiometrics,
} from "../utils/deviceBiometrics";
import AttendanceReceiptModal from "./AttendanceReceiptModal.jsx";

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
  const bioSupported = isDeviceBiometricsSupported();
  const bioInfo = detectDeviceBiometricInfo();
  const BioIcon = bioInfo.kind === "face_id" ? ScanFace : Fingerprint;

  const [loading, setLoading] = useState(true);
  const [biometrics, setBiometrics] = useState([]);
  const [bioBusy, setBioBusy] = useState(false);
  const [showAwsSection, setShowAwsSection] = useState(false);

  const [enrollment, setEnrollment] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingSelf, setReviewingSelf] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [receiptState, setReceiptState] = useState(null);

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
      setBiometrics(Array.isArray(res?.data?.biometricCredentials) ? res.data.biometricCredentials : []);
    } catch (error) {
      console.error("Không thể tải trạng thái sinh trắc học:", error);
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

  // --- Device-native Face ID / Fingerprint Handlers ---
  const handleRegisterDevice = async () => {
    try {
      setBioBusy(true);
      await registerDeviceBiometrics();
      toast.success("Đã bật Face ID / Vân tay trên thiết bị này!");
      await loadStatus();
    } catch (error) {
      toast.error(error?.message || "Không thể đăng ký Face ID / Vân tay");
    } finally {
      setBioBusy(false);
    }
  };

  const handleTestDevice = async () => {
    try {
      setBioBusy(true);
      const res = await testDeviceBiometrics();
      setReceiptState({
        mode: "test",
        record: res?.data || null,
        session: null,
        deviceLabel: res?.data?.deviceLabel || bioInfo.label,
        latencyMs: res?.data?.latencyMs ?? null,
      });
      await loadStatus();
    } catch (error) {
      toast.error(error?.message || "Xác thực thất bại");
    } finally {
      setBioBusy(false);
    }
  };

  const handleRemoveDevice = async (rowId) => {
    try {
      setBioBusy(true);
      await deleteTeacherBiometricCredential(rowId);
      toast.success("Đã gỡ thiết bị.");
      await loadStatus();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
    } catch (error) {
      toast.error(error?.message || "Không thể gỡ thiết bị");
    } finally {
      setBioBusy(false);
    }
  };

  // --- Optional AWS Camera Enrollment Handlers ---
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
        if (!blob) return toast.error("Không thể chụp ảnh.");
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleSubmitAws = async () => {
    if (!capturedBlob || !consentAccepted) return;
    try {
      setSubmitting(true);
      await submitTeacherFaceEnrollment({ blob: capturedBlob, consentAccepted: true });
      toast.success("Đã lưu ảnh mẫu!");
      setCameraOpen(false);
      setCapturedBlob(null);
      await loadStatus();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
    } catch (error) {
      toast.error(error?.message || "Không thể đăng ký ảnh mẫu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminSelfReview = async (action) => {
    if (!authUser?.id) return;
    try {
      setReviewingSelf(true);
      await reviewAdminTeacherFaceEnrollment(authUser.id, { action, note: "" });
      toast.success(action === "approve" ? "Đã duyệt & khóa!" : "Đã mở khóa.");
      await loadStatus();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật");
    } finally {
      setReviewingSelf(false);
    }
  };

  const statusKey = enrollment?.status || "not_enrolled";
  const badge = STATUS_BADGES[statusKey] || STATUS_BADGES.not_enrolled;
  const BadgeIcon = badge.icon;
  const isLocked = statusKey === "approved";
  const hasDeviceBio = biometrics.length > 0;

  return (
    <>
      <div
        id="face-enrollment"
        className="rounded-3xl border border-white/80 bg-white/95 p-4 sm:p-5 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none space-y-4"
      >
        {/* PRIMARY: Device Face ID / Fingerprint (Free · 0.5s) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <BioIcon className="h-5 w-5" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#102f63] dark:text-white">
                {bioInfo.label} chấm công
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                  hasDeviceBio
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {hasDeviceBio ? <CheckCircle2 className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                {hasDeviceBio ? `Đã bật (${biometrics.length})` : "Chưa bật"}
              </span>
            </div>
          </div>

          {hasDeviceBio && bioSupported && (
            <button
              type="button"
              disabled={bioBusy}
              onClick={handleTestDevice}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BioIcon className="h-3.5 w-3.5" />}
              Test {bioInfo.shortLabel}
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
            {/* Registered Devices List */}
            {biometrics.length > 0 && (
              <div className="space-y-2">
                {biometrics.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800 dark:text-white">
                          {cred.deviceLabel}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {cred.lastUsedAt
                            ? `Dùng gần nhất: ${new Date(cred.lastUsedAt).toLocaleString("vi-VN")}`
                            : `Đăng ký: ${new Date(cred.createdAt).toLocaleDateString("vi-VN")}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={bioBusy}
                      onClick={() => handleRemoveDevice(cred.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                      title="Gỡ thiết bị này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 1-Tap Register Button */}
            {bioSupported ? (
              <button
                type="button"
                disabled={bioBusy}
                onClick={handleRegisterDevice}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {bioBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BioIcon className="h-4 w-4" />}
                {hasDeviceBio ? "Thêm thiết bị này" : `Đăng ký ${bioInfo.label} máy này`}
              </button>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Trình duyệt hiện tại chưa hỗ trợ Face ID / Vân tay. Hãy mở bằng Safari (iPhone) hoặc Chrome (Android).
              </p>
            )}

            {/* Collapsible Optional Camera AWS Section */}
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAwsSection((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ScanFace className="h-3.5 w-3.5" />
                  Ảnh mẫu camera (AWS dự phòng)
                  <span className={`rounded-full border px-2 py-0.2 text-[10px] font-bold ${badge.className}`}>
                    {badge.label}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showAwsSection ? "rotate-180" : ""}`} />
              </button>

              {showAwsSection && (
                <div className="mt-3 space-y-3">
                  {enrollment?.photoUrl && !cameraOpen && (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                      <img
                        src={enrollment.photoUrl}
                        alt="Ảnh mẫu"
                        className="h-12 w-12 shrink-0 rounded-xl object-cover ring-2 ring-white dark:ring-slate-700"
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-bold text-slate-800 dark:text-white inline-flex items-center gap-1">
                          <BadgeIcon className="h-3.5 w-3.5" /> {badge.label}
                        </p>
                        {enrollment.submittedAt && (
                          <p className="text-[10px] text-slate-400">
                            {new Date(enrollment.submittedAt).toLocaleString("vi-VN")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!cameraOpen ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {enrollment ? "Chụp lại" : "Chụp ảnh mẫu"}
                        </button>
                      )}
                      {isAdmin && statusKey === "pending_approval" && (
                        <button
                          type="button"
                          disabled={reviewingSelf}
                          onClick={() => handleAdminSelfReview("approve")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt & Khóa
                        </button>
                      )}
                      {isAdmin && isLocked && (
                        <button
                          type="button"
                          disabled={reviewingSelf}
                          onClick={() => handleAdminSelfReview("unlock")}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Unlock className="h-3.5 w-3.5" /> Mở khóa
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setTestModalOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                        >
                          <FlaskConical className="h-3.5 w-3.5" /> Test AWS
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#102f63] dark:text-white">
                          {capturedPreview ? "Xem lại ảnh" : "Nhìn thẳng camera"}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            setCameraOpen(false);
                            setCapturedBlob(null);
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {cameraError ? (
                        <p className="text-xs text-rose-600 dark:text-rose-400">{cameraError}</p>
                      ) : capturedPreview ? (
                        <div className="flex flex-col items-center gap-2.5">
                          <img src={capturedPreview} alt="Preview" className="h-44 w-44 rounded-3xl object-cover" />
                          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={consentAccepted}
                              onChange={(e) => setConsentAccepted(e.target.checked)}
                              className="h-4 w-4 rounded"
                            />
                            <span>Đồng ý dùng ảnh này để chấm công</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={startCamera}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              Chụp lại
                            </button>
                            <button
                              type="button"
                              disabled={submitting || !consentAccepted}
                              onClick={handleSubmitAws}
                              className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {submitting ? "Đang lưu..." : "Lưu"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2.5">
                          <div className="relative h-48 w-48 overflow-hidden rounded-full bg-slate-900">
                            <video
                              ref={attachStreamToVideo}
                              playsInline
                              muted
                              autoPlay
                              className="h-full w-full -scale-x-100 object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleCapture}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"
                          >
                            <Camera className="h-4 w-4" /> Chụp ảnh
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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

      <AttendanceReceiptModal
        isOpen={Boolean(receiptState)}
        mode={receiptState?.mode || "test"}
        record={receiptState?.record || null}
        session={receiptState?.session || null}
        teacherName={authUser?.fullName || authUser?.username || ""}
        deviceLabel={receiptState?.deviceLabel || bioInfo.label}
        biometricKind={bioInfo.kind}
        latencyMs={receiptState?.latencyMs ?? null}
        onClose={() => setReceiptState(null)}
      />
    </>
  );
}
