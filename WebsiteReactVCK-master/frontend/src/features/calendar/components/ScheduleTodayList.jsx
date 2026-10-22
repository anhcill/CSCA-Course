/* eslint-disable react/prop-types */
import React from "react";
import { CalendarCheck, Clock, MapPin, Play, Video } from "lucide-react";

const WEEKDAY_NAMES_MAP = {
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
  0: "Chủ nhật",
};

export default function ScheduleTodayList({
  currentDate,
  events = [],
  onJoinSession,
  isTeacher = false,
}) {
  const d = new Date(currentDate);
  const weekday = WEEKDAY_NAMES_MAP[d.getDay()];
  const dateFormatted = `${d.getDate()}/${d.getMonth() + 1 < 10 ? `0${d.getMonth() + 1}` : d.getMonth() + 1}`;
  const headerDateStr = `${weekday}, ${dateFormatted}`;

  const currentDayStr = d.toDateString();
  const isToday = currentDayStr === new Date().toDateString();
  const headerTitle = isToday
    ? (isTeacher ? "Lịch dạy hôm nay" : "Lịch học hôm nay")
    : (isTeacher ? "Lịch dạy theo ngày" : "Lịch học theo ngày");

  // Lấy các buổi học thật (SESSION) trong ngày đang chọn
  const todayRealEvents = events.filter((ev) => {
    if (ev.eventType !== "SESSION") return false;
    return new Date(ev.start_time).toDateString() === currentDayStr;
  });

  // Sắp xếp theo giờ bắt đầu
  todayRealEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const now = Date.now();

  return (
    <div className="rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">{headerTitle}</h3>
        <span className="text-xs font-bold text-blue-600 dark:text-sky-400">{headerDateStr}</span>
      </div>

      {/* Danh sách các buổi học */}
      {todayRealEvents.length === 0 ? (
        <div className="py-6 px-3 text-center rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
          <CalendarCheck className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600 mb-1" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {isTeacher ? "Không có lịch dạy" : "Không có buổi học"}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isToday
              ? (isTeacher ? "Hôm nay bạn không có ca dạy nào." : "Hôm nay bạn không có lịch học nào.")
              : (isTeacher ? "Không có ca dạy nào vào ngày đã chọn." : "Không có buổi học nào vào ngày đã chọn.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {todayRealEvents.map((session) => {
            const start = new Date(session.start_time);
            const end = new Date(session.end_time || start.getTime() + 90 * 60 * 1000);
            const startMs = start.getTime();
            const endMs = end.getTime();

            const isLive = session.status === "live" || (now >= startMs && now <= endMs);
            const isOpen = startMs - now <= 15 * 60 * 1000 && now < endMs;
            const isCompleted = now > endMs;

            const startTimeStr = start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
            const endTimeStr = end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

            return (
              <div
                key={session.id}
                className="flex items-center justify-between gap-2.5 rounded-2xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-800/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Cột thời gian */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isLive ? "bg-rose-500 animate-ping" : isOpen ? "bg-emerald-500" : isCompleted ? "bg-slate-300" : "bg-blue-500"
                      }`}
                    />
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-tight">
                      <div>{startTimeStr}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{endTimeStr}</div>
                    </div>
                  </div>

                  {/* Thông tin môn học & lớp */}
                  <div className="min-w-0 border-l border-slate-100 dark:border-slate-800 pl-2">
                    <h4 className="truncate text-xs font-bold text-slate-800 dark:text-white" title={session.title}>
                      {session.title}
                    </h4>
                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="truncate">{session.class_title || session.room || "Trực tuyến"}</span>
                    </p>
                  </div>
                </div>

                {/* Hành động */}
                <div className="shrink-0">
                  {isLive || isOpen || isTeacher ? (
                    <button
                      type="button"
                      onClick={() => onJoinSession && onJoinSession(session)}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 text-[11px] font-bold shadow-xs transition active:scale-95"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{isTeacher ? "Vào dạy" : "Vào lớp"}</span>
                    </button>
                  ) : isCompleted ? (
                    <span className="inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                      Đã kết thúc
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/60 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-sky-300">
                      Sắp tới
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
