import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchTeacherFaceStatus,
  submitTeacherFaceEnrollment,
} from "../../api/teacherFaceAttendanceClient";

const STATUS_BADGES = {
  approved: {
    label: "Đã duyệt & khóa",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: Lock,
  },
  pending_approval: {
    label: "Đang chờ Admin duyệt",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300",
    icon: Clock,
  },
  rejected: {
    label: "Bị từ chối — Cần chụp lại",
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300",
    icon: ShieldAlert,
  },
  unlocked: {
    label: "Đã mở khóa — Mời chụp lại",
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
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState(null);
  const [awsStatus, setAwsStatus] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

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
      setCameraError(
        "Không thể mở camera. Vui lòng cấp quyền Camera cho trình duyệt / ứng dụng PWA rồi thử lại.",
      );
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Camera chưa sẵn sàng, vui lòng chờ 1 giây.");
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
          toast.error("Không thể chụp ảnh từ camera.");
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
      toast.error("Vui lòng chụp ảnh khuôn mặt trước khi gửi.");
      return;
    }
    if (!consentAccepted) {
      toast.error("Vui lòng tích đồng ý sử dụng ảnh cho mục đích chấm công.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await submitTeacherFaceEnrollment({
        blob: capturedBlob,
        consentAccepted: true,
      });
      toast.success(res?.message || "Đã gửi ảnh khuôn mặt mẫu thành công!");
      setCameraOpen(false);
      setCapturedBlob(null);
      await loadStatus();
      window.dispatchEvent(new CustomEvent("csca:teacher-face-attendance-updated"));
    } catch (error) {
      toast.error(error?.message || "Không thể gửi ảnh đăng ký khuôn mặt");
    } finally {
      setSubmitting(false);
    }
  };

  const statusKey = enrollment?.status || "not_enrolled";
  const badge = STATUS_BADGES[statusKey] || STATUS_BADGES.not_enrolled;
  const BadgeIcon = badge.icon;
  const isLocked = statusKey === "approved";

  return (
    <div
      id="face-enrollment"
      className="rounded-3xl border border-white/80 bg-white/95 p-5 sm:p-6 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-xl transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-2xs dark:bg-indigo-950/60 dark:text-indigo-400">
            <ScanFace className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#102f63] dark:text-white">Khuôn mặt chấm công</h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.className}`}
              >
                <BadgeIcon className="h-3 w-3" />
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dùng để chấm công Vào / Ra trước và sau mỗi buổi dạy bằng AWS Rekognition
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          Đang kiểm tra hồ sơ khuôn mặt...
        </div>
      ) : (
        <div className="space-y-4">
          {enrollment?.photoUrl && !cameraOpen && (
            <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/60">
              <img
                src={enrollment.photoUrl}
                alt="Ảnh khuôn mặt mẫu"
                className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white dark:ring-slate-700 shadow-xs"
              />
              <div className="min-w-0 flex-1 text-xs space-y-1">
                <p className="font-bold text-slate-800 dark:text-white">
                  {isLocked
                    ? "Khuôn mặt mẫu đã được Admin duyệt & khóa"
                    : statusKey === "pending_approval"
                      ? "Ảnh mẫu đang chờ Admin duyệt"
                      : "Ảnh mẫu gần nhất"}
                </p>
                {enrollment.submittedAt && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Gửi lúc: {new Date(enrollment.submittedAt).toLocaleString("vi-VN")}
                  </p>
                )}
                {enrollment.reviewNote && (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    Ghi chú Admin: {enrollment.reviewNote}
                  </p>
                )}
              </div>
            </div>
          )}

          {isLocked ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="leading-relaxed">
                Bạn đã sẵn sàng chấm công khuôn mặt Vào / Ra trước mỗi buổi học. Vì lý do bảo mật lương, ảnh gốc đã được khóa — nếu cần chụp lại, vui lòng nhắn Admin mở khóa.
              </p>
            </div>
          ) : !cameraOpen ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Chụp 1 ảnh chính diện trực tiếp từ camera nơi đủ sáng (không đeo khẩu trang/kính râm). Sau khi gửi, Admin sẽ duyệt và khóa ảnh gốc để kích hoạt chấm công tự động.
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <Camera className="h-4 w-4" />
                {enrollment ? "Chụp đăng ký lại khuôn mặt" : "Mở camera đăng ký khuôn mặt"}
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#102f63] dark:text-white">
                  Chụp ảnh khuôn mặt trực tiếp
                </p>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setCameraOpen(false);
                    setCapturedBlob(null);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
                    className="h-56 w-56 rounded-2xl object-cover ring-4 ring-white shadow-md dark:ring-slate-700"
                  />
                  <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 max-w-md">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                    />
                    <span>
                      Tôi đồng ý cung cấp ảnh khuôn mặt này cho hệ thống Moly Course để xác thực chấm công Vào/Ra và tính lương giảng dạy (theo Nghị định 13/2023/NĐ-CP).
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
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
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang gửi...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Gửi Admin duyệt & khóa
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative h-64 w-64 overflow-hidden rounded-3xl bg-slate-900 ring-4 ring-white shadow-md dark:ring-slate-700">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="h-full w-full -scale-x-100 object-cover"
                    />
                    <div className="pointer-events-none absolute inset-4 rounded-full border-2 border-dashed border-white/75" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                    Đưa khuôn mặt vào giữa vòng tròn, nhìn thẳng camera và giữ yên khi chụp.
                  </p>
                  <button
                    type="button"
                    onClick={handleCapture}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-700"
                  >
                    <Camera className="h-4 w-4" /> Chụp ảnh mẫu
                  </button>
                </div>
              )}
            </div>
          )}

          {awsStatus && !awsStatus.configured && !awsStatus.mockMode && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300">
              Lưu ý hệ thống: Key AWS Rekognition chưa được điền trên server — bạn vẫn có thể chụp và gửi ảnh mẫu trước để Admin duyệt sẵn.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
