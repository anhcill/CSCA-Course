import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  LogIn,
  LogOut,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherSessionFaceState } from "../../api/teacherFaceAttendanceClient";

const AwsFaceLivenessModal = lazy(() => import("./AwsFaceLivenessModal.jsx"));

const formatTime = (value) => {
  if (!value) return "--:--";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "--:--"
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

export default function TeacherSessionCheckInBar({ sessionId, sessionTitle }) {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalConfig, setModalConfig] = useState(null); // { type, adminTestMode }

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const res = await fetchTeacherSessionFaceState(sessionId);
      setState(res?.data || null);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadState();
    const onAttendanceUpdated = () => loadState();
    window.addEventListener("csca:teacher-face-attendance-updated", onAttendanceUpdated);
    return () => window.removeEventListener("csca:teacher-face-attendance-updated", onAttendanceUpdated);
  }, [loadState]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-xs text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
        Đang tải trạng thái chấm công khuôn mặt...
      </div>
    );
  }

  if (!state) return null;

  const { enrollment, attendance, policies } = state;
  const enrollmentApproved = enrollment?.status === "approved";

  return (
    <>
      <section className="rounded-3xl border border-white/85 bg-white/92 p-4 sm:px-5 sm:py-4 shadow-[0_8px_28px_rgba(32,78,120,0.07)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/92 dark:shadow-none">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Compact Status + 2-Step Check-in / Check-out Timeline */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-black text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-sky-300">
                <ScanFace className="h-3.5 w-3.5" /> Chấm công buổi dạy
              </span>

              {attendance?.payrollEligible ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> Đủ điều kiện tính lương
                </span>
              ) : attendance?.adminOverrideStatus === "rejected" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                  Admin từ chối tính lương
                </span>
              ) : attendance?.checkInAt ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <Clock className="h-3.5 w-3.5" /> Cần chấm công Ra khi kết thúc buổi
                </span>
              ) : null}
            </div>

            {!enrollmentApproved ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {enrollment?.status === "pending_approval"
                    ? "Ảnh khuôn mặt mẫu của bạn đang chờ Admin duyệt khóa."
                    : "Chưa có ảnh khuôn mặt mẫu được duyệt khóa."}
                </span>
                <Link
                  to="/lms/teach/settings"
                  className="font-bold text-indigo-700 underline hover:text-indigo-900 dark:text-sky-400"
                >
                  Đăng ký trong Cài đặt →
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Step 1: Check-In pill */}
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-1.5 dark:border-slate-700/80 dark:bg-slate-800/70">
                  <LogIn className="h-3.5 w-3.5 text-indigo-600 dark:text-sky-400" />
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Vào:</span>
                  {attendance?.checkInAt ? (
                    <>
                      <span className="font-mono font-black text-slate-900 dark:text-white">
                        {formatTime(attendance.checkInAt)}
                      </span>
                      {attendance.checkInStatus === "late" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          Muộn {attendance.lateMinutes}p
                        </span>
                      )}
                      {attendance.checkInStatus === "manual_review" && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-bold text-sky-800 dark:bg-sky-950/70 dark:text-sky-300">
                          Chờ duyệt
                        </span>
                      )}
                      {attendance.checkInStatus === "on_time" && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                          Đúng giờ
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">Chưa chấm</span>
                  )}
                </div>

                {/* Step 2: Check-Out pill */}
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-1.5 dark:border-slate-700/80 dark:bg-slate-800/70">
                  <LogOut className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">Ra:</span>
                  {attendance?.checkOutAt ? (
                    <>
                      <span className="font-mono font-black text-slate-900 dark:text-white">
                        {formatTime(attendance.checkOutAt)}
                      </span>
                      {attendance.checkOutStatus === "early_leave" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          Sớm {attendance.earlyLeaveMinutes}p
                        </span>
                      )}
                      {attendance.checkOutStatus === "manual_review" && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-bold text-sky-800 dark:bg-sky-950/70 dark:text-sky-300">
                          Chờ duyệt
                        </span>
                      )}
                      {attendance.checkOutStatus === "on_time" && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                          Đúng giờ
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">Chưa chấm</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {enrollmentApproved && (
              !attendance?.checkInAt || attendance?.checkInStatus === "rejected" ? (
                <button
                  type="button"
                  disabled={!policies?.checkIn?.canCheckIn}
                  onClick={() => setModalConfig({ type: "check_in", adminTestMode: false })}
                  title={policies?.checkIn?.reason || "Chấm công Vào bằng khuôn mặt"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {policies?.checkIn?.canCheckIn
                    ? "Chấm công Vào"
                    : policies?.checkIn?.opensAt
                      ? `Mở từ ${formatTime(policies.checkIn.opensAt)}`
                      : "Chấm công Vào"}
                </button>
              ) : !attendance?.checkOutAt || attendance?.checkOutStatus === "rejected" ? (
                <button
                  type="button"
                  disabled={!policies?.checkOut?.canCheckOut}
                  onClick={() => setModalConfig({ type: "check_out", adminTestMode: false })}
                  title={policies?.checkOut?.reason || "Chấm công Ra bằng khuôn mặt"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Chấm công Ra
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Đã chấm đủ Vào & Ra
                </span>
              )
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setModalConfig({ type: "admin_test", adminTestMode: true })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-900/50"
                title="Test thử AWS Rekognition không lưu vào chấm công hay lương"
              >
                <FlaskConical className="h-3.5 w-3.5" /> Test AWS
              </button>
            )}
          </div>
        </div>

        {enrollmentApproved && !attendance?.checkInAt && policies?.checkIn?.reason && (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {policies.checkIn.reason}
          </p>
        )}
      </section>

      {modalConfig && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
              <div className="flex items-center gap-2 rounded-2xl bg-white px-5 py-4 text-xs font-bold text-slate-700 shadow-xl dark:bg-slate-900 dark:text-slate-100">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                Đang tải bộ quét khuôn mặt AWS Rekognition...
              </div>
            </div>
          }
        >
          <AwsFaceLivenessModal
            isOpen={Boolean(modalConfig)}
            adminTestMode={Boolean(modalConfig.adminTestMode)}
            sessionId={sessionId}
            sessionTitle={sessionTitle || state?.session?.title}
            sessionMeta={{
              classCode: state?.session?.classCode,
              classTitle: state?.session?.classTitle,
              startTime: state?.session?.startTime,
              endTime: state?.session?.endTime,
              lateMinutes: policies?.checkIn?.lateMinutes || 0,
              earlyLeaveMinutes: policies?.checkOut?.earlyLeaveMinutes || 0,
            }}
            type={modalConfig.type}
            onClose={() => setModalConfig(null)}
            onSuccess={() => {
              if (!modalConfig.adminTestMode) loadState();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
