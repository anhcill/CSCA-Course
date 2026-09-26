import { CalendarDays, Clock, FileQuestion, Video, ClipboardList } from "lucide-react";

const formatDateTime = (isoString) => {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function CalendarListView({
  events = [],
  onSelectEvent,
  onJoinSession
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
        <CalendarDays className="mx-auto h-9 w-9 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">Chưa có lịch sự kiện nào</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Các buổi học và hạn nộp bài tập sẽ xuất hiện tại đây.</p>
      </div>
    );
  }

  // Sắp xếp sự kiện tăng dần theo thời gian
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = new Date(a.start_time || a.due_date).getTime();
    const timeB = new Date(b.start_time || b.due_date).getTime();
    return timeA - timeB;
  });

  return (
    <div className="space-y-3" role="feed" aria-label="Danh sách sự kiện và lịch học">
      {sortedEvents.map((ev) => {
        const isSession = ev.eventType === "SESSION";
        const isAssignment = ev.eventType === "ASSIGNMENT_DUE";
        const isQuiz = ev.eventType === "QUIZ_DUE";
        const isRescheduled = ev.status === "rescheduled";
        const isLive = ev.uiState === "live";
        const isJoinable = isLive || ev.uiState === "open";

        return (
          <article
            key={`${ev.eventType}-${ev.id}`}
            onClick={() => onSelectEvent(ev)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectEvent(ev);
              }
            }}
            className={`group cursor-pointer rounded-2xl border p-4 sm:p-5 shadow-xs transition hover:shadow-md ${
              isLive
                ? "border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20"
                : "border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  isLive ? "bg-rose-600 text-white animate-pulse" : isSession ? "bg-blue-600 text-white" : isQuiz ? "bg-purple-600 text-white" : "bg-amber-600 text-white"
                }`}>
                  {isSession ? <Video className="h-5 w-5" /> : isQuiz ? <FileQuestion className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {isSession ? "Buổi học" : isQuiz ? "Quiz" : "Hạn nộp bài"}
                    </span>
                    {isRescheduled && (
                      <span className="rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black">
                        Đã đổi lịch
                      </span>
                    )}
                    {ev.class_title && (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {ev.class_title}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400">
                    {ev.title}
                  </h3>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-sky-400">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDateTime(ev.start_time || ev.due_date)}
                    </span>
                    {ev.instructor_name && <span>GV: {ev.instructor_name}</span>}
                    {ev.provider && <span>Hình thức: {ev.provider}</span>}
                  </div>

                  {isRescheduled && ev.change_reason && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg">
                      Lý do đổi lịch: {ev.change_reason}
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
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                  >
                    Vào lớp ngay
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectEvent(ev)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Chi tiết
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
