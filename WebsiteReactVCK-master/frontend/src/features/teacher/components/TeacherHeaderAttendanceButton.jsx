import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Fingerprint,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherTodaySmartAttendance } from "../../api/teacherFaceAttendanceClient";
import {
  checkInOrOutWithDeviceBiometrics,
  detectDeviceBiometricInfo,
  isDeviceBiometricsSupported,
  registerDeviceBiometrics,
  testDeviceBiometrics,
} from "../utils/deviceBiometrics";

const AwsFaceLivenessModal = lazy(() => import("./AwsFaceLivenessModal.jsx"));

const fmtTime = (value) => {
  if (!value) return "--:--";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "--:--"
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

export default function TeacherHeaderAttendanceButton({ isDarkMode }) {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const bioSupported = isDeviceBiometricsSupported();
  const bioInfo = detectDeviceBiometricInfo();
  const BioIcon = bioInfo.kind === "face_id" ? ScanFace : Fingerprint;

  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const containerRef = useRef(null);

  const loadToday = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchTeacherTodaySmartAttendance();
      setData(res?.data || null);
    } catch {
      // ignore background header fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToday();
    const onAttendanceUpdated = () => loadToday();
    window.addEventListener("csca:teacher-face-attendance-updated", onAttendanceUpdated);
    return () => window.removeEventListener("csca:teacher-face-attendance-updated", onAttendanceUpdated);
  }, [loadToday]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const biometrics = data?.biometricCredentials || [];
  const hasDeviceBio = biometrics.length > 0;
  const enrollment = data?.enrollment || null;
  const enrollmentApproved = enrollment?.status === "approved";
  const canAttend = hasDeviceBio || enrollmentApproved;

  const recommended = data?.recommended || null;
  const sessions = data?.sessions || [];
  const summary = data?.summary || { totalTodaySessions: 0, completedTodayCount: 0 };

  const isCheckInReady = canAttend && recommended?.actionType === "check_in";
  const isCheckOutReady = canAttend && recommended?.actionType === "check_out";
  const isAllDone = canAttend && recommended?.actionType === "completed_today" && summary.totalTodaySessions > 0;

  const triggerAttendance = async (session, type) => {
    if (hasDeviceBio && bioSupported) {
      try {
        setBioBusy(true);
        const res = await checkInOrOutWithDeviceBiometrics({ sessionId: session.id, type });
        toast.success(res?.message || (type === "check_in" ? "Chấm Vào thành công!" : "Chấm Ra thành công!"));
        setOpen(false);
        await loadToday();
      } catch (error) {
        toast.error(error?.message || "Xác thực Face ID / Vân tay thất bại");
      } finally {
        setBioBusy(false);
      }
      return;
    }

    setOpen(false);
    setActiveModal({ session, type, adminTestMode: false });
  };

  const handleQuickRegister = async () => {
    try {
      setBioBusy(true);
      await registerDeviceBiometrics();
      toast.success("Đã bật Face ID / Vân tay máy này!");
      await loadToday();
    } catch (error) {
      toast.error(error?.message || "Không thể đăng ký Face ID / Vân tay");
    } finally {
      setBioBusy(false);
    }
  };

  const handleQuickTest = async () => {
    try {
      setBioBusy(true);
      const res = await testDeviceBiometrics();
      const ms = res?.data?.latencyMs ?? "";
      toast.success(`Face ID / Vân tay OK!${ms ? ` (${ms}ms)` : ""}`);
      await loadToday();
    } catch (error) {
      toast.error(error?.message || "Xác thực thất bại");
    } finally {
      setBioBusy(false);
    }
  };

  const triggerClass = isCheckInReady
    ? "border-indigo-400/70 bg-indigo-600 text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
    : isCheckOutReady
      ? "border-emerald-400/70 bg-emerald-600 text-white shadow-md shadow-emerald-600/30 hover:bg-emerald-500"
      : !isDarkMode
        ? "border-white/85 bg-[#e4f4ff]/85 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md hover:bg-white hover:text-blue-700"
        : "border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700 hover:text-white shadow-sm";

  const triggerLabel = isCheckInReady
    ? "Chấm Vào"
    : isCheckOutReady
      ? "Chấm Ra"
      : isAllDone
        ? "Đã chấm"
        : "Chấm công";

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) loadToday();
          }}
          aria-expanded={open}
          title={`Chấm công ${bioInfo.label}`}
          className={`relative inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition ${triggerClass}`}
        >
          {isAllDone ? (
            <ShieldCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <BioIcon className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{triggerLabel}</span>
          {(isCheckInReady || isCheckOutReady) && (
            <span className="flex h-2 w-2 rounded-full bg-white animate-pulse" />
          )}
        </button>

        {open && (
          <div className="fixed inset-x-3 top-[4.5rem] z-[60] max-h-[calc(100dvh-5.5rem)] overflow-hidden rounded-2xl border border-[#c4def0] bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(20.5rem,calc(100vw-2rem))]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BioIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-black text-slate-900 dark:text-white">
                  Chấm công · {bioInfo.label}
                </span>
              </div>
              <button
                type="button"
                onClick={loadToday}
                disabled={loading}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-sky-400"
                title="Làm mới"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-3 space-y-2.5 text-xs sm:max-h-[70vh]">
              {/* Primary 1-Tap Device Biometrics Action */}
              {bioSupported && (
                !hasDeviceBio ? (
                  <button
                    type="button"
                    disabled={bioBusy}
                    onClick={handleQuickRegister}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BioIcon className="h-4 w-4" />}
                    Bật {bioInfo.label} máy này
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={bioBusy}
                      onClick={handleQuickTest}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BioIcon className="h-3.5 w-3.5" />}
                      Test {bioInfo.label}
                    </button>
                    <Link
                      to="/lms/teach/settings#face-enrollment"
                      onClick={() => setOpen(false)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Thiết bị
                    </Link>
                  </div>
                )
              )}

              {/* Recommended active session */}
              {recommended?.session && canAttend && (
                <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {recommended.session.title}
                    </p>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-indigo-700 dark:text-sky-300">
                      {fmtTime(recommended.session.startTime)}–{fmtTime(recommended.session.endTime)}
                    </span>
                  </div>

                  {isCheckInReady && (
                    <button
                      type="button"
                      disabled={bioBusy}
                      onClick={() => triggerAttendance(recommended.session, "check_in")}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                      Chấm Vào ngay
                    </button>
                  )}

                  {isCheckOutReady && (
                    <button
                      type="button"
                      disabled={bioBusy}
                      onClick={() => triggerAttendance(recommended.session, "check_out")}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      Chấm Ra ngay
                    </button>
                  )}

                  {recommended.actionType === "upcoming" && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-sky-300">
                      <Clock className="h-3.5 w-3.5" />
                      Mở từ {fmtTime(recommended.opensAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Today's sessions */}
              {sessions.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> Hôm nay ({sessions.length})
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {summary.completedTodayCount}/{summary.totalTodaySessions}
                    </span>
                  </p>
                  {sessions.map((sess) => {
                    const att = sess.attendance;
                    const canIn = canAttend && sess.policies?.checkIn?.canCheckIn;
                    const canOut = canAttend && sess.policies?.checkOut?.canCheckOut;
                    return (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-800 dark:text-slate-100">
                            {sess.title}
                          </p>
                          <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {fmtTime(sess.startTime)}–{fmtTime(sess.endTime)}
                            {att?.checkInAt ? ` · Vào ${fmtTime(att.checkInAt)}` : ""}
                            {att?.checkOutAt ? ` · Ra ${fmtTime(att.checkOutAt)}` : ""}
                          </p>
                        </div>
                        {att?.payrollEligible ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : canOut ? (
                          <button
                            type="button"
                            disabled={bioBusy}
                            onClick={() => triggerAttendance(sess, "check_out")}
                            className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white"
                          >
                            Ra
                          </button>
                        ) : canIn ? (
                          <button
                            type="button"
                            disabled={bioBusy}
                            onClick={() => triggerAttendance(sess, "check_in")}
                            className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white"
                          >
                            Vào
                          </button>
                        ) : (
                          <Link
                            to={`/lms/teach/classes/${sess.liveClassId}/sessions/${sess.id}`}
                            onClick={() => setOpen(false)}
                            className="shrink-0 text-[10px] font-bold text-indigo-600 hover:underline dark:text-sky-400"
                          >
                            Mở
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 py-3 text-center text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Hôm nay không có ca dạy
                </p>
              )}

              {isAdmin && (
                <div className="border-t border-slate-100 pt-2 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <Link
                    to="/admin/teacher-salaries"
                    onClick={() => setOpen(false)}
                    className="font-semibold text-indigo-600 hover:underline dark:text-sky-400"
                  >
                    Bảng lương & Công →
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setActiveModal({ session: null, type: "admin_test", adminTestMode: true });
                    }}
                    className="font-semibold text-slate-400 hover:text-violet-600 dark:hover:text-violet-400"
                  >
                    Test AWS
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activeModal && (
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
            isOpen={Boolean(activeModal)}
            adminTestMode={Boolean(activeModal.adminTestMode)}
            defaultCompareTeacherId={authUser?.id ? String(authUser.id) : ""}
            sessionId={activeModal.session?.id || 0}
            sessionTitle={activeModal.session?.title}
            sessionMeta={
              activeModal.session
                ? {
                    classCode: activeModal.session.classCode,
                    classTitle: activeModal.session.classTitle,
                    startTime: activeModal.session.startTime,
                    endTime: activeModal.session.endTime,
                    lateMinutes: activeModal.session.policies?.checkIn?.lateMinutes || 0,
                    earlyLeaveMinutes: activeModal.session.policies?.checkOut?.earlyLeaveMinutes || 0,
                  }
                : null
            }
            type={activeModal.type}
            onClose={() => setActiveModal(null)}
            onSuccess={() => {
              if (!activeModal.adminTestMode) loadToday();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
