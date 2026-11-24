import { createPortal } from "react-dom";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Fingerprint,
  LogIn,
  LogOut,
  ScanFace,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";

const fmtFullTime = (value) => {
  if (!value) return "--:--:--";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "--:--:--"
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const fmtShortTime = (value) => {
  if (!value) return "--:--";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "--:--"
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

const fmtFullDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};

export default function AttendanceReceiptModal({
  isOpen,
  mode = "check_in", // "check_in" | "check_out" | "test"
  record = null,
  session = null,
  teacherName = "",
  deviceLabel = "",
  biometricKind = "fingerprint", // "face_id" | "fingerprint"
  latencyMs = null,
  onClose,
}) {
  if (!isOpen) return null;

  const isTest = mode === "test";
  const isCheckOut = mode === "check_out";
  const BioIcon = biometricKind === "face_id" ? ScanFace : Fingerprint;

  const timestamp = isTest
    ? record?.verifiedAt || record?.testedAt || new Date().toISOString()
    : isCheckOut
      ? record?.checkOutAt || new Date().toISOString()
      : record?.checkInAt || new Date().toISOString();

  const headerTone = isTest
    ? "from-violet-600 via-indigo-600 to-blue-600"
    : isCheckOut
      ? "from-emerald-600 via-teal-600 to-emerald-700"
      : "from-blue-600 via-indigo-600 to-indigo-700";

  const title = isTest
    ? "Xác thực sinh trắc học thành công"
    : isCheckOut
      ? "Chấm công Ra ca thành công"
      : "Chấm công Vào ca thành công";

  const statusBadge = () => {
    if (isTest) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          <Sparkles className="h-3 w-3" /> Dry-run · Hợp lệ
        </span>
      );
    }
    const status = isCheckOut ? record?.checkOutStatus : record?.checkInStatus;
    if (status === "on_time") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" /> Đúng giờ
        </span>
      );
    }
    if (status === "late") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          Muộn {record?.lateMinutes || 0} phút
        </span>
      );
    }
    if (status === "early_leave") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          Về sớm {record?.earlyLeaveMinutes || 0} phút
        </span>
      );
    }
    if (status === "manual_review") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
          Chờ Admin duyệt
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        Đã ghi nhận
      </span>
    );
  };

  const sessionTitle = session?.title || (isTest ? "Kiểm tra thiết bị cá nhân" : `Buổi học #${session?.id || record?.sessionId || ""}`);
  const classTitle = session?.classTitle || (isTest ? "Chế độ kiểm tra (không ảnh hưởng công)" : "Lớp giảng dạy");
  const classCode = session?.classCode || (session?.liveClassId ? `LIVE-${session.liveClassId}` : "");
  const hasScheduleWindow = Boolean(session?.startTime || session?.endTime);

  const methodText = (() => {
    const provider = isCheckOut ? record?.checkOutProvider : record?.checkInProvider;
    if (provider === "aws_rekognition") return "Camera · AWS Rekognition";
    if (provider === "manual") return "Ảnh gửi Admin duyệt tay";
    const base = deviceLabel || (biometricKind === "face_id" ? "Face ID thiết bị" : "Vân tay thiết bị");
    return latencyMs != null ? `${base} · ${latencyMs}ms` : base;
  })();

  const receiptCode = isTest
    ? `TEST-${Date.now().toString().slice(-6)}`
    : `ATT-${session?.id || record?.sessionId || "0"}-${isCheckOut ? "OUT" : "IN"}`;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
      >
        {/* Top Executive Gradient Header */}
        <div className={`relative bg-gradient-to-br ${headerTone} px-5 pt-6 pb-7 text-center text-white`}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng biên lai"
            className="absolute right-3.5 top-3.5 rounded-full bg-white/15 p-1.5 text-white/90 transition hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 ring-8 ring-white/10 backdrop-blur-xs">
            {isTest ? (
              <BioIcon className="h-7 w-7 text-white" />
            ) : isCheckOut ? (
              <LogOut className="h-7 w-7 text-white" />
            ) : (
              <LogIn className="h-7 w-7 text-white" />
            )}
          </div>

          <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-white/80">
            Moly Course · Xác nhận chấm công
          </p>
          <h3 className="mt-0.5 text-base font-black tracking-tight text-white">
            {title}
          </h3>

          <div className="mt-3 inline-flex flex-col items-center rounded-2xl bg-black/20 px-4 py-2 backdrop-blur-xs">
            <span className="font-mono text-2xl font-black tracking-wider text-white">
              {fmtFullTime(timestamp)}
            </span>
            <span className="mt-0.5 text-[11px] font-medium capitalize text-white/85">
              {fmtFullDate(timestamp)}
            </span>
          </div>
        </div>

        {/* Ticket-Style Side Cutouts & Dashed Divider */}
        <div className="relative flex items-center bg-white dark:bg-slate-900">
          <span className="-ml-3 h-6 w-6 rounded-full bg-slate-950/75" />
          <div className="mx-2 flex-1 border-t-2 border-dashed border-slate-200 dark:border-slate-700/80" />
          <span className="-mr-3 h-6 w-6 rounded-full bg-slate-950/75" />
        </div>

        {/* Structured Details Slip */}
        <div className="px-5 pt-2 pb-5 space-y-3 text-xs">
          {/* Session & Class Card */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-800/60 space-y-1.5">
            <div className="flex items-start gap-2">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Tiết / Buổi dạy
                </p>
                <p className="font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                  {sessionTitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70">
              <div className="flex items-center gap-1.5 min-w-0">
                {classCode && (
                  <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-black text-blue-700 dark:bg-blue-950 dark:text-sky-300">
                    {classCode}
                  </span>
                )}
                <span className="truncate font-bold text-slate-700 dark:text-slate-200">
                  {classTitle}
                </span>
              </div>
              {hasScheduleWindow && (
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <CalendarDays className="h-3 w-3" />
                  {fmtShortTime(session.startTime)}–{fmtShortTime(session.endTime)}
                </span>
              )}
            </div>
          </div>

          {/* Key-Value Rows */}
          <div className="space-y-2 px-0.5">
            {teacherName && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <User className="h-3.5 w-3.5" /> Giảng viên
                </span>
                <span className="font-bold text-slate-900 dark:text-white truncate">
                  {teacherName}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <Clock className="h-3.5 w-3.5" /> Trạng thái
              </span>
              {statusBadge()}
            </div>

            {!isTest && record?.checkInAt && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <LogIn className="h-3.5 w-3.5 text-indigo-500" /> Giờ Vào ca
                </span>
                <span className="font-mono font-black text-slate-900 dark:text-white">
                  {fmtFullTime(record.checkInAt)}
                </span>
              </div>
            )}

            {!isTest && record?.checkOutAt && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <LogOut className="h-3.5 w-3.5 text-emerald-500" /> Giờ Ra ca
                </span>
                <span className="font-mono font-black text-slate-900 dark:text-white">
                  {fmtFullTime(record.checkOutAt)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <BioIcon className="h-3.5 w-3.5 text-emerald-500" /> Xác thực
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                {methodText}
              </span>
            </div>
          </div>

          {/* Payroll Eligibility Banner */}
          {isTest ? (
            <div className="flex items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/80 px-3 py-2 text-[11px] font-bold text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200">
              <ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <span>Chế độ kiểm tra · Không ghi vào công & bảng lương.</span>
            </div>
          ) : record?.payrollEligible ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Đủ điều kiện tính lương buổi dạy này.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
              <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {isCheckOut
                  ? "Đã ghi nhận giờ Ra · Đang chờ Admin xác nhận."
                  : "Đã ghi nhận Vào ca · Nhớ chấm Ra sau khi kết thúc buổi."}
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-1 space-y-2">
            <button
              type="button"
              onClick={onClose}
              className={`w-full rounded-2xl py-2.5 text-xs font-black text-white shadow-md transition active:scale-[0.98] ${
                isCheckOut
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : isTest
                    ? "bg-violet-600 hover:bg-violet-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              Hoàn tất
            </button>
            <p className="text-center font-mono text-[10px] text-slate-400">
              Mã xác nhận: #{receiptCode}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
