
import { CalendarDays, CheckCircle2, Clock, Play, Plus, Radio, Sparkles } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Chưa có lịch";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TeacherNextSessionHero({
  classTitle,
  nextSession,
  onOpenSession,
  onOpenAttendance,
  onOpenSchedule,
  onCreateSession,
}) {
  const isLive = String(nextSession?.status || "").toLowerCase() === "live";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/85 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] dark:shadow-none backdrop-blur-md transition">
      {/* Background ambient decorative glows */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/40 blur-3xl" />

      <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-950/50 border border-sky-200/80 dark:border-sky-800 px-3 py-1 text-xs font-bold text-sky-700 dark:text-sky-300 shadow-2xs">
              <Radio className="h-3 w-3 text-sky-600" /> Buổi dạy tiếp theo
            </span>
            {isLive ? (
              <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-700 animate-pulse">
                Đang diễn ra
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                <Sparkles className="w-3 h-3 text-amber-500 inline mr-1" /> Sắp diễn ra
              </span>
            )}
          </div>

          {nextSession ? (
            <>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white leading-tight truncate">
                {nextSession.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold text-[#244866] dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-sky-600 shrink-0" />
                  {formatDateTime(nextSession.start_time || nextSession.startTime)}
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>Lớp: <strong className="text-[#102f63] dark:text-sky-300 font-bold">{classTitle || "Lớp học"}</strong></span>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl sm:text-2xl font-black text-[#102f63] dark:text-white">Chưa có buổi dạy sắp tới</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Thiết lập lịch cố định hoặc thêm buổi bù để học viên thấy lịch ngay.</p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {nextSession ? (
            <>
              <button
                type="button"
                onClick={() => onOpenSession(nextSession)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:brightness-105 active:scale-95"
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Mở không gian buổi học
              </button>
              <button
                type="button"
                onClick={() => onOpenAttendance(nextSession)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Điểm danh
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onCreateSession}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Tạo lịch buổi học
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSchedule}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
          >
            <CalendarDays className="h-3.5 w-3.5 text-blue-600" /> Lịch của lớp
          </button>
        </div>
      </div>
    </section>
  );
}
