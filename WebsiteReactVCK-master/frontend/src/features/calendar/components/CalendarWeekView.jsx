import { useMemo } from "react";
import { AlertCircle, Bell, CheckCircle2, ClipboardList, Clock, FileQuestion, Video } from "lucide-react";

const getWeekDates = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    return dayDate;
  });
};

const formatTime = (isoString) => {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const WEEKDAY_NAMES = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];

export default function CalendarWeekView({
  currentDate,
  events = [],
  onSelectEvent,
  onJoinSession
}) {
  const weekDays = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const todayStr = new Date().toDateString();

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors duration-200">
      <div className="grid min-w-[780px] grid-cols-7 divide-x divide-slate-200/80 dark:divide-slate-800">
        {weekDays.map((dayDate, idx) => {
          const dateStr = dayDate.toDateString();
          const isToday = dateStr === todayStr;
          const dayEvents = events.filter(
            (ev) => new Date(ev.start_time || ev.due_date).toDateString() === dateStr
          );

          return (
            <div key={dateStr} className={`flex flex-col min-h-[460px] ${isToday ? "bg-blue-50/30 dark:bg-blue-950/20" : ""}`}>
              {/* Header ngày trong tuần */}
              <div className={`p-3 text-center border-b border-slate-200/80 dark:border-slate-800 ${
                isToday ? "bg-blue-100/60 dark:bg-blue-900/40 text-blue-700 dark:text-sky-300" : "bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300"
              }`}>
                <p className="text-[11px] font-bold uppercase tracking-wider">{WEEKDAY_NAMES[idx]}</p>
                <p className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                  isToday ? "bg-blue-600 text-white" : "text-slate-800 dark:text-white"
                }`}>
                  {dayDate.getDate()}
                </p>
              </div>

              {/* Danh sách sự kiện trong ngày */}
              <div className="flex-1 p-2 space-y-2">
                {dayEvents.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
                    Không có lịch
                  </div>
                ) : (
                  dayEvents.map((ev) => {
                    const isSession = ev.eventType === "SESSION";
                    const isAssignment = ev.eventType === "ASSIGNMENT_DUE";
                    const isQuiz = ev.eventType === "QUIZ_DUE";
                    const isRescheduled = ev.status === "rescheduled";
                    const isLive = ev.uiState === "live";

                    return (
                      <div
                        key={`${ev.eventType}-${ev.id}`}
                        onClick={() => onSelectEvent(ev)}
                        className={`group cursor-pointer rounded-xl p-2.5 text-xs transition border shadow-xs hover:-translate-y-0.5 hover:shadow-sm ${
                          isLive
                            ? "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-100"
                            : isSession
                            ? "bg-blue-50/70 dark:bg-slate-800 border-blue-100 dark:border-slate-700 hover:border-blue-300"
                            : isQuiz
                            ? "bg-purple-50/70 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/60 text-purple-900 dark:text-purple-200"
                            : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/60 text-amber-900 dark:text-amber-200"
                        }`}
                      >
                        {/* Type & status badge */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="inline-flex items-center gap-1 font-bold text-[10px] uppercase">
                            {isSession && <Video className="h-3 w-3 text-blue-600 dark:text-sky-400" />}
                            {isAssignment && <ClipboardList className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
                            {isQuiz && <FileQuestion className="h-3 w-3 text-purple-600 dark:text-purple-400" />}
                            {isSession ? "Buổi học" : isQuiz ? "Hết hạn Quiz" : "Hạn nộp bài"}
                          </span>
                          {isRescheduled && (
                            <span className="rounded bg-rose-500 text-white px-1 py-0.2 text-[9px] font-black">
                              Đã đổi lịch
                            </span>
                          )}
                        </div>

                        {/* Tiêu đề sự kiện */}
                        <p className="font-bold line-clamp-2 text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-sky-400">
                          {ev.title}
                        </p>

                        {/* Thời gian */}
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {formatTime(ev.start_time || ev.due_date)}
                            {ev.end_time && ` – ${formatTime(ev.end_time)}`}
                          </span>
                        </div>

                        {/* CTA nhanh nếu đang live hoặc có thể vào */}
                        {isSession && (isLive || ev.uiState === "open") && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJoinSession(ev);
                            }}
                            className="mt-2 w-full rounded-lg bg-blue-600 py-1 text-center font-bold text-white text-[11px] shadow-sm hover:bg-blue-700"
                          >
                            Vào lớp ngay
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
