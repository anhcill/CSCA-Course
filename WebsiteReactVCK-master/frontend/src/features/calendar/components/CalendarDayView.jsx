import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, Clock, FileQuestion, Video } from "lucide-react";

const formatTime = (isoString) => {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function CalendarDayView({
  currentDate,
  events = [],
  onSelectEvent,
  onJoinSession
}) {
  const dateStr = new Date(currentDate).toDateString();
  const dayEvents = events.filter(
    (ev) => new Date(ev.start_time || ev.due_date).toDateString() === dateStr
  );

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition-colors duration-200">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          Lịch trình ngày {new Date(currentDate).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {dayEvents.length} sự kiện và nhiệm vụ trong ngày.
        </p>
      </div>

      {dayEvents.length === 0 ? (
        <div className="py-16 text-center">
          <CalendarDays className="mx-auto h-9 w-9 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">Không có lịch học hoặc hạn nộp nào trong ngày</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bạn có thể chọn ngày khác hoặc chuyển sang chế độ xem Tuần.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayEvents.map((ev) => {
            const isSession = ev.eventType === "SESSION";
            const isAssignment = ev.eventType === "ASSIGNMENT_DUE";
            const isQuiz = ev.eventType === "QUIZ_DUE";
            const isRescheduled = ev.status === "rescheduled";
            const isLive = ev.uiState === "live";
            const isJoinable = isLive || ev.uiState === "open";

            return (
              <div
                key={`${ev.eventType}-${ev.id}`}
                onClick={() => onSelectEvent(ev)}
                className={`group cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition hover:shadow-md ${
                  isLive
                    ? "border-rose-300 bg-rose-50/50 dark:bg-rose-950/30 dark:border-rose-900"
                    : isSession
                    ? "border-blue-100 bg-blue-50/40 dark:bg-slate-800/50 dark:border-slate-700"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30"
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isLive ? "bg-rose-600 text-white animate-pulse" : isSession ? "bg-blue-600 text-white" : isQuiz ? "bg-purple-600 text-white" : "bg-amber-600 text-white"
                  }`}>
                    {isSession ? <Video className="h-5 w-5" /> : isQuiz ? <FileQuestion className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {isSession ? "Buổi học trực tuyến" : isQuiz ? "Hạn chót Quiz" : "Hạn nộp bài tập"}
                      </span>
                      {isRescheduled && (
                        <span className="rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black">
                          Đã đổi lịch
                        </span>
                      )}
                      {ev.provider && (
                        <span className="rounded-full bg-white dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {ev.provider}
                        </span>
                      )}
                    </div>

                    <h4 className="mt-1 text-base font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400">
                      {ev.title}
                    </h4>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(ev.start_time || ev.due_date)}
                        {ev.end_time && ` – ${formatTime(ev.end_time)}`}
                      </span>
                      {ev.instructor_name && <span>Giảng viên: <strong className="text-slate-700 dark:text-slate-200">{ev.instructor_name}</strong></span>}
                      {ev.class_title && <span>Lớp: {ev.class_title}</span>}
                    </div>

                    {isRescheduled && ev.change_reason && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg">
                        Lý do thay đổi: {ev.change_reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                  {isSession && isJoinable ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJoinSession(ev);
                      }}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                    >
                      Vào lớp ngay
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectEvent(ev)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      Xem chi tiết
                    </button>
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
