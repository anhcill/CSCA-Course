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
    <section className="overflow-hidden rounded-3xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white shadow-lg dark:shadow-none sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-wider backdrop-blur">
              <Radio className="h-3.5 w-3.5" /> Buổi dạy tiếp theo
            </span>
            {isLive && <span className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-bold animate-pulse">Đang diễn ra</span>}
          </div>
          {nextSession ? (
            <>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">{nextSession.title}</h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-100">
                <Clock className="h-4 w-4 text-blue-200" /> {formatDateTime(nextSession.start_time || nextSession.startTime)}
              </p>
              <p className="mt-2 text-xs text-blue-100">Lớp: {classTitle || `Lớp #${classId}`}</p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-xl font-black text-white">Chưa có buổi dạy sắp tới</h1>
              <p className="mt-1 text-sm text-blue-100">Thiết lập lịch cố định hoặc thêm một buổi bù để học viên thấy lịch ngay.</p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {nextSession ? (
            <>
              <button type="button" onClick={() => onOpenSession(nextSession)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-50">
                <Play className="h-4 w-4" /> Mở không gian buổi học
              </button>
              <button type="button" onClick={() => onOpenAttendance(nextSession)} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/20">
                <CheckCircle2 className="h-4 w-4" /> Điểm danh
              </button>
            </>
          ) : (
            <button type="button" onClick={onCreateSession} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-50">
              <Plus className="h-4 w-4" /> Tạo lịch buổi học
            </button>
          )}
          <button type="button" onClick={onOpenSchedule} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/20">
            <CalendarDays className="h-4 w-4" /> Lịch của lớp
          </button>
        </div>
      </div>
    </section>
  );
}
