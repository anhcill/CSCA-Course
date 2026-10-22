import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock, Video } from "lucide-react";
import { isSessionRescheduled } from "../../../calendar/sessionScheduleChange.js";

const formatDateTime = (value) => {
  if (!value) return "Chưa có thời hạn";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ClassNextSessionHero({
  nextSession,
  isTodaySession,
  otherSessions = [],
  instructorName,
  classTitle,
  basePath,
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.1)] backdrop-blur-md sm:p-6 transition">
      {/* Decorative subtle oriental ambient glow */}
      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-amber-200/30 blur-3xl" />

      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="min-w-0 max-w-2xl space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                isTodaySession
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300 animate-pulse"
                  : "bg-sky-100 text-sky-800 ring-1 ring-sky-200"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {isTodaySession ? "Hôm nay có buổi học" : "Buổi học tiếp theo"}
            </span>
            {nextSession && isSessionRescheduled(nextSession) && (
              <span className="rounded-full bg-rose-500/90 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                Đã đổi lịch
              </span>
            )}
            {nextSession?.provider && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                <Video className="h-3 w-3 text-emerald-600" /> {nextSession.provider}
              </span>
            )}
          </div>

          {nextSession ? (
            <>
              <h2 className="line-clamp-2 text-xl font-black tracking-tight text-[#102f63] sm:text-2xl">
                {nextSession.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-[#244866]">
                <span className="inline-flex items-center gap-1.5 font-bold text-sky-700">
                  <Clock className="h-4 w-4 text-sky-600" />
                  {formatDateTime(nextSession.start_time)}
                </span>
                <span>·</span>
                <span>
                  Giảng viên: <strong className="text-[#102f63] font-bold">{instructorName || "CSCA"}</strong>
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-[#102f63] sm:text-xl">
                Hiện chưa có lịch buổi học mới
              </h2>
              <p className="text-xs text-[#487291] sm:text-sm">
                Giảng viên sẽ sớm cập nhật lịch buổi học trực tuyến tiếp theo cho lớp {classTitle || ""}.
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2.5">
          <Link
            to={nextSession ? `${basePath}/sessions/${nextSession.id}` : `${basePath}/calendar`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700 active:scale-95"
          >
            <CalendarDays className="h-4 w-4" />
            {nextSession ? "Xem chi tiết buổi học" : "Xem lịch toàn khóa"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {otherSessions.length > 0 && (
        <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5">
          <p className="mr-1 text-xs font-bold text-[#102f63] dark:text-sky-300">Sắp tới:</p>
          <div className="flex flex-wrap gap-2">
            {otherSessions.map((item) => (
              <Link
                key={item.id}
                to={`${basePath}/sessions/${item.id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-white dark:bg-slate-800/90 px-3 py-1.5 text-xs shadow-2xs transition hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-slate-700"
              >
                <span className="font-bold text-[#102f63] dark:text-white max-w-[150px] truncate">{item.title}</span>
                <span className="rounded-md bg-sky-50 dark:bg-sky-950/80 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/60">
                  {formatDateTime(item.start_time)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
