/* eslint-disable react/prop-types */
import { Link } from "react-router-dom";
import { CalendarDays, Clock, Play, Video } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Chưa có thời hạn";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function ClassNextSessionHero({
  nextSession,
  isTodaySession,
  otherSessions = [],
  instructorName,
  classTitle,
  basePath
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-sky-300/70 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-5 py-4 text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)] dark:border-blue-700/70 dark:from-blue-700 dark:via-indigo-700 dark:to-violet-800 sm:px-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                isTodaySession
                  ? "bg-amber-400 text-slate-950 animate-pulse"
                  : "bg-white/20 text-white backdrop-blur"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {isTodaySession ? "Hôm nay có buổi học" : "Buổi học tiếp theo"}
            </span>
            {nextSession?.status === "rescheduled" && (
              <span className="rounded-full bg-rose-500/90 px-2.5 py-0.5 text-xs font-bold text-white">
                Đã đổi lịch
              </span>
            )}
            {nextSession?.provider && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/20 px-2.5 py-0.5 text-xs font-medium text-white">
                <Video className="h-3 w-3" /> {nextSession.provider}
              </span>
            )}
          </div>

          {nextSession ? (
            <>
              <h2 className="line-clamp-2 text-xl font-black tracking-tight text-white sm:text-2xl">
                {nextSession.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-blue-50 sm:text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Clock className="h-4 w-4 text-blue-200" />
                  {formatDateTime(nextSession.start_time)}
                </span>
                <span>·</span>
                <span>Giảng viên: <strong className="text-white">{instructorName || "CSCA"}</strong></span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                Hiện chưa có lịch buổi học mới
              </h2>
              <p className="text-xs text-blue-50 sm:text-sm">
                Giảng viên sẽ sớm cập nhật lịch buổi học trực tuyến tiếp theo cho lớp {classTitle || ""}.
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to={nextSession ? `${basePath}/sessions/${nextSession.id}` : "/lms/calendar"}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-300 px-3.5 py-2 text-xs font-black text-slate-900 shadow-sm transition hover:bg-amber-200 active:scale-95"
          >
            <CalendarDays className="h-4 w-4" />
            {nextSession ? "Xem chi tiết buổi học" : "Xem lịch toàn khóa"}
          </Link>
          <Link
            to={nextSession ? `${basePath}/sessions/${nextSession.id}?tab=content` : "/lms/calendar"}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/35 bg-white/15 px-3.5 py-2 text-xs font-bold text-white backdrop-blur transition hover:bg-white/25 active:scale-95"
          >
            <Play className="h-4 w-4" /> Mở không gian buổi học
          </Link>
        </div>
      </div>

      {otherSessions.length > 0 && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-white/20 pt-3">
          <p className="mr-1 text-[10px] font-black uppercase tracking-wider text-cyan-100">Sắp tới:</p>
          <div className="flex flex-wrap gap-2">
            {otherSessions.map((item) => (
              <Link key={item.id} to={`${basePath}/sessions/${item.id}`} className="flex max-w-[280px] items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] backdrop-blur transition hover:bg-white/25">
                <span className="truncate font-semibold text-white">{item.title}</span>
                <span className="shrink-0 text-cyan-100">{formatDateTime(item.start_time)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
