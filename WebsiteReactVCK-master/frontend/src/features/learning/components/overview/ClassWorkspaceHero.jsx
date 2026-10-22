import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  GraduationCap,
  Sparkles,
  Video,
} from "lucide-react";
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

const formatClassTitle = (title) => {
  if (!title) return "Lớp học";
  const str = String(title).trim();
  if (/^\d+$/.test(str)) return `Lớp ${str}`;
  return str;
};

export default function ClassWorkspaceHero({
  classTitle,
  instructorName,
  percent = 0,
  nextSession,
  isTodaySession = false,
  otherSessions = [],
  basePath,
}) {
  const classDisplayName = formatClassTitle(classTitle);
  const clampedPercent = Math.max(0, Math.min(100, Number(percent || 0)));

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6 transition">
      {/* Background ambient subtle decorative glows */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/40 blur-3xl" />

      <div className="relative grid gap-5 lg:grid-cols-12 lg:items-center">
        {/* Left Side (Col 1-6): Class identity, Scholar quote, Badges, Timetable button */}
        <div className="space-y-3 lg:col-span-6 flex flex-col justify-between">
          <div>
            <h1 className="font-['Dancing_Script',cursive] text-3xl sm:text-4xl lg:text-[42px] font-bold text-[#102f63] leading-none">
              {classDisplayName}
            </h1>
            <p className="mt-2 text-xs sm:text-sm font-semibold italic text-[#244866]">
              “Học để thấu hiểu, luyện để tinh thông.” ·{" "}
              <span className="font-['Ma_Shan_Zheng',cursive] text-sm sm:text-base text-[#17365f]">
                博学审问 · 慎思明辨
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 border border-white px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs">
              <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
              Giảng viên: {instructorName || "CSCA"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-bold text-emerald-700 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Đang theo học
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200/80 px-3 py-1 text-xs font-bold text-sky-700 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              Tiến độ: {clampedPercent}%
            </span>
          </div>

          <div className="pt-2">
            <Link
              to={`${basePath}/calendar`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#17365f] via-[#102f63] to-[#0d2754] px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-950/20 transition hover:shadow-lg hover:brightness-105 active:scale-95"
            >
              <CalendarDays className="h-3.5 w-3.5 text-sky-300" /> Lịch học của lớp
            </Link>
          </div>
        </div>

        {/* Right Side (Col 7-12): Buổi học hôm nay / gần nhất / tiếp theo */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-50/60 via-white/80 to-blue-50/40 p-4 sm:p-5 shadow-2xs backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                isTodaySession
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300 animate-pulse"
                  : "bg-sky-100 text-sky-800 ring-1 ring-sky-200"
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              {isTodaySession ? "Hôm nay có buổi học" : "Buổi học tiếp theo"}
            </span>
            {nextSession && isSessionRescheduled(nextSession) && (
              <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                Đã đổi lịch
              </span>
            )}
            {nextSession?.provider && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                <Video className="h-3 w-3 text-emerald-600" /> {nextSession.provider}
              </span>
            )}
          </div>

          {nextSession ? (
            <div className="space-y-1.5 py-2.5">
              <h2 className="line-clamp-2 text-base sm:text-lg font-black tracking-tight text-[#102f63]">
                {nextSession.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#244866]">
                <span className="inline-flex items-center gap-1.5 font-bold text-sky-700">
                  <Clock className="h-3.5 w-3.5 text-sky-600" />
                  {formatDateTime(nextSession.start_time)}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1 py-2.5">
              <h2 className="text-sm sm:text-base font-bold text-[#102f63]">
                Hiện chưa có lịch buổi học mới
              </h2>
              <p className="text-xs text-[#487291]">
                Giảng viên sẽ sớm cập nhật lịch buổi học trực tuyến tiếp theo cho lớp.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Link
              to={nextSession ? `${basePath}/sessions/${nextSession.id}` : `${basePath}/calendar`}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-600/20 transition active:scale-95"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {nextSession ? "Xem chi tiết buổi học" : "Xem lịch học"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {otherSessions.length > 0 && (
            <div className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-sky-100/80 pt-2.5 text-xs">
              <span className="font-bold text-[#102f63] dark:text-sky-300">Sắp tới:</span>
              <div className="flex flex-wrap items-center gap-2">
                {otherSessions.map((item) => (
                  <Link
                    key={item.id}
                    to={`${basePath}/sessions/${item.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-white dark:bg-slate-800/90 px-3 py-1.5 text-xs shadow-2xs transition hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-slate-700"
                  >
                    <span className="font-bold text-[#102f63] dark:text-white max-w-[150px] truncate">
                      {item.title}
                    </span>
                    <span className="rounded-md bg-sky-50 dark:bg-sky-950/80 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/60">
                      {item.start_time
                        ? new Date(item.start_time).toLocaleString("vi-VN", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
