import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Fingerprint,
  Loader2,
  LogIn,
  LogOut,
  ReceiptText,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherSessionFaceState } from "../../api/teacherFaceAttendanceClient";
import {
  checkInOrOutWithDeviceBiometrics,
  detectDeviceBiometricInfo,
  isDeviceBiometricsSupported,
  registerDeviceBiometrics,
  testDeviceBiometrics,
} from "../utils/deviceBiometrics";
import AttendanceReceiptModal from "./AttendanceReceiptModal.jsx";

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
  const bioSupported = isDeviceBiometricsSupported();
  const bioInfo = detectDeviceBiometricInfo();
  const BioIcon = bioInfo.kind === "face_id" ? ScanFace : Fingerprint;

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bioBusy, setBioBusy] = useState(false);
  const [modalConfig, setModalConfig] = useState(null);
  const [receiptState, setReceiptState] = useState(null);

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
      <div className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-2.5 text-xs text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
        Đang tải chấm công...
      </div>
    );
  }

  if (!state) return null;

  const { enrollment, biometricCredentials = [], attendance, policies } = state;
  const hasDeviceBio = biometricCredentials.length > 0;
  const enrollmentApproved = enrollment?.status === "approved";
  const canAttend = hasDeviceBio || enrollmentApproved;

  const sessionInfo = {
    id: sessionId,
    title: sessionTitle || state?.session?.title,
    classCode: state?.session?.classCode,
    classTitle: state?.session?.classTitle,
    startTime: state?.session?.startTime,
    endTime: state?.session?.endTime,
    liveClassId: state?.session?.liveClassId,
  };

  const handleAction = async (type) => {
    if (hasDeviceBio && bioSupported) {
      try {
        setBioBusy(true);
        const startedAt = Date.now();
        const res = await checkInOrOutWithDeviceBiometrics({ sessionId, type });
        const latencyMs = Date.now() - startedAt;
        setReceiptState({
          mode: type,
          record: res?.data || null,
          session: sessionInfo,
          deviceLabel: res?.data?.deviceLabel || bioInfo.label,
          latencyMs,
        });
        await loadState();
      } catch (error) {
        toast.error(error?.message || `Xác thực ${bioInfo.label} thất bại`);
      } finally {
        setBioBusy(false);
      }
      return;
    }
    setModalConfig({ type, adminTestMode: false });
  };

  const handleRegister = async () => {
    try {
      setBioBusy(true);
      await registerDeviceBiometrics();
      toast.success(`Đã bật ${bioInfo.label} thiết bị này!`);
      await loadState();
    } catch (error) {
      toast.error(error?.message || `Không thể đăng ký ${bioInfo.label}`);
    } finally {
      setBioBusy(false);
    }
  };

  const handleTest = async () => {
    try {
      setBioBusy(true);
      const res = await testDeviceBiometrics();
      setReceiptState({
        mode: "test",
        record: res?.data || null,
        session: sessionInfo,
        deviceLabel: res?.data?.deviceLabel || bioInfo.label,
        latencyMs: res?.data?.latencyMs ?? null,
      });
    } catch (error) {
      toast.error(error?.message || "Xác thực thất bại");
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-white/85 bg-white/92 p-3.5 sm:px-4 shadow-[0_8px_28px_rgba(32,78,120,0.07)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/92 dark:shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Compact Status Pills */}
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
              <BioIcon className="h-3.5 w-3.5" /> {bioInfo.label}
            </span>

            {!canAttend ? (
              bioSupported ? (
                <button
                  type="button"
                  disabled={bioBusy}
                  onClick={handleRegister}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BioIcon className="h-3.5 w-3.5" />}
                  Bật {bioInfo.label} máy này
                </button>
              ) : (
                <span className="text-amber-700 dark:text-amber-300 font-semibold">
                  Trình duyệt chưa hỗ trợ Face ID / Vân tay
                </span>
              )
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-1 dark:border-slate-700/80 dark:bg-slate-800/70">
                  <LogIn className="h-3.5 w-3.5 text-indigo-600 dark:text-sky-400" />
                  <span className="text-slate-500 dark:text-slate-400">Vào</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white">
                    {attendance?.checkInAt ? formatTime(attendance.checkInAt) : "--:--"}
                  </span>
                  {attendance?.checkInStatus === "late" && (
                    <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                      +{attendance.lateMinutes}p
                    </span>
                  )}
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-1 dark:border-slate-700/80 dark:bg-slate-800/70">
                  <LogOut className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-slate-500 dark:text-slate-400">Ra</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white">
                    {attendance?.checkOutAt ? formatTime(attendance.checkOutAt) : "--:--"}
                  </span>
                  {attendance?.checkOutStatus === "early_leave" && (
                    <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                      -{attendance.earlyLeaveMinutes}p
                    </span>
                  )}
                </div>

                {attendance?.payrollEligible ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> Đủ công
                  </span>
                ) : attendance?.checkInAt && !attendance?.checkOutAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                    <Clock className="h-3.5 w-3.5" /> Chưa chấm Ra
                  </span>
                ) : null}
              </>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canAttend && (
              !attendance?.checkInAt || attendance?.checkInStatus === "rejected" ? (
                <button
                  type="button"
                  disabled={bioBusy || !policies?.checkIn?.canCheckIn}
                  onClick={() => handleAction("check_in")}
                  title={policies?.checkIn?.reason || "Chấm Vào"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                  {policies?.checkIn?.canCheckIn
                    ? "Chấm Vào"
                    : policies?.checkIn?.opensAt
                      ? `Mở ${formatTime(policies.checkIn.opensAt)}`
                      : "Chấm Vào"}
                </button>
              ) : !attendance?.checkOutAt || attendance?.checkOutStatus === "rejected" ? (
                <button
                  type="button"
                  disabled={bioBusy || !policies?.checkOut?.canCheckOut}
                  onClick={() => handleAction("check_out")}
                  title={policies?.checkOut?.reason || "Chấm Ra"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  {bioBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  Chấm Ra
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setReceiptState({
                      mode: "check_out",
                      record: attendance,
                      session: sessionInfo,
                      deviceLabel: bioInfo.label,
                      latencyMs: null,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Đã xong · Xem phiếu
                </button>
              )
            )}

            {canAttend && attendance?.checkInAt && !attendance?.checkOutAt && (
              <button
                type="button"
                onClick={() =>
                  setReceiptState({
                    mode: "check_in",
                    record: attendance,
                    session: sessionInfo,
                    deviceLabel: bioInfo.label,
                    latencyMs: null,
                  })
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <ReceiptText className="h-3.5 w-3.5" /> Phiếu Vào
              </button>
            )}

            {isAdmin && hasDeviceBio && bioSupported && (
              <button
                type="button"
                disabled={bioBusy}
                onClick={handleTest}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <BioIcon className="h-3.5 w-3.5" /> Test {bioInfo.shortLabel}
              </button>
            )}
          </div>
        </div>
      </section>

      {modalConfig && (
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
            isOpen={Boolean(modalConfig)}
            adminTestMode={Boolean(modalConfig.adminTestMode)}
            defaultCompareTeacherId={authUser?.id ? String(authUser.id) : ""}
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
            onSuccess={(resultData) => {
              if (!modalConfig.adminTestMode) {
                setReceiptState({
                  mode: modalConfig.type === "check_out" ? "check_out" : "check_in",
                  record: resultData || null,
                  session: sessionInfo,
                  deviceLabel: "Camera AWS",
                  latencyMs: null,
                });
                loadState();
              }
            }}
          />
        </Suspense>
      )}

      <AttendanceReceiptModal
        isOpen={Boolean(receiptState)}
        mode={receiptState?.mode || "check_in"}
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
