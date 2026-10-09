/* eslint-disable react/prop-types */
import { CalendarDays, CheckCircle2, Clock, Play, Plus, Radio } from "lucide-react";

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
  classId,
  nextSession,
  onOpenSession,
  onOpenAttendance,
  onOpenSchedule,
  onCreateSession,
}) {
  const isLive = String(nextSession?.status || "").toLowerCase() === "live";

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-3 text-white shadow-sm sm:px-4 sm:py-3">
      <div className="flex flex-col justify-between gap-2.5 lg:flex-row lg:items-center">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider backdrop-blur">
              <Radio className="h-3 w-3" /> Buổi dạy tiếp theo
            </span>
            {isLive && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold animate-pulse">Đang diễn ra</span>}
          </div>
          {nextSession ? (
            <>
              <h1 className="mt-1 text-base sm:text-lg font-black tracking-tight text-white leading-tight truncate">{nextSession.title}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-blue-100">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-blue-200" /> {formatDateTime(nextSession.start_time || nextSession.startTime)}
                </span>
                <span className="text-blue-300/80">•</span>
                <span>Lớp: {classTitle || `Lớp #${classId}`}</span>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-base sm:text-lg font-black text-white">Chưa có buổi dạy sắp tới</h1>
              <p className="mt-0.5 text-xs text-blue-100">Thiết lập lịch cố định hoặc thêm buổi bù để học viên thấy lịch ngay.</p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {nextSession ? (
            <>
              <button type="button" onClick={() => onOpenSession(nextSession)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-blue-700 shadow-xs transition hover:bg-blue-50">
                <Play className="h-3.5 w-3.5" /> Mở không gian buổi học
              </button>
              <button type="button" onClick={() => onOpenAttendance(nextSession)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20">
                <CheckCircle2 className="h-3.5 w-3.5" /> Điểm danh
              </button>
            </>
          ) : (
            <button type="button" onClick={onCreateSession} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-black text-blue-700 shadow-xs transition hover:bg-blue-50">
              <Plus className="h-3.5 w-3.5" /> Tạo lịch buổi học
            </button>
          )}
          <button type="button" onClick={onOpenSchedule} className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20">
            <CalendarDays className="h-3.5 w-3.5" /> Lịch của lớp
          </button>
        </div>
      </div>
    </section>
  );
}
