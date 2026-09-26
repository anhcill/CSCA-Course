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
    <section className="overflow-hidden rounded-3xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white shadow-lg dark:shadow-none sm:p-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="max-w-2xl space-y-3">
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
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-blue-100">
                <Video className="h-3 w-3" /> {nextSession.provider}
              </span>
            )}
          </div>

          {nextSession ? (
            <>
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
                {nextSession.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-blue-100">
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
              <h2 className="text-xl font-bold sm:text-2xl text-white">
                Hiện chưa có lịch buổi học mới
              </h2>
              <p className="text-sm text-blue-100">
                Giảng viên sẽ sớm cập nhật lịch buổi học trực tuyến tiếp theo cho lớp {classTitle || ""}.
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row lg:flex-col">
          <Link
            to={nextSession ? `${basePath}/sessions/${nextSession.id}` : `${basePath}/calendar`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-md transition hover:bg-blue-50 active:scale-95"
          >
            <CalendarDays className="h-4 w-4" />
            {nextSession ? "Xem chi tiết buổi học" : "Xem lịch toàn khóa"}
          </Link>
          <Link
            to={`${basePath}/learn`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500/40 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-blue-500/60 active:scale-95 border border-white/20"
          >
            <Play className="h-4 w-4" /> Vào phòng học bài giảng
          </Link>
        </div>
      </div>

      {otherSessions.length > 0 && (
        <div className="mt-6 border-t border-white/15 pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Các buổi tiếp theo trong tuần:</p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {otherSessions.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2 text-xs backdrop-blur">
                <span className="truncate font-semibold text-white">{item.title}</span>
                <span className="shrink-0 text-blue-200 ml-2">{formatDateTime(item.start_time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
