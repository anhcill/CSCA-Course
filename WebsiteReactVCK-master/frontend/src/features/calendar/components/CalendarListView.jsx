import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { CalendarDays, Clock, FileQuestion, Video, ClipboardList } from "lucide-react";
import { isSessionRescheduled, sessionChangeReason } from "../sessionScheduleChange.js";

const formatDateTime = (isoString) => {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function CalendarListView({
  events = [],
  onSelectEvent,
  onJoinSession,
  isTeacher = false,
}) {
  const [filterTab, setFilterTab] = useState("all"); // all | upcoming | sessions | deadlines

  const { allSorted, upcomingCount, sessionCount, deadlineCount, filteredEvents } = useMemo(() => {
    const now = Date.now();
    const sorted = [...events].sort((a, b) => {
      const timeA = new Date(a.start_time || a.due_date).getTime();
      const timeB = new Date(b.start_time || b.due_date).getTime();
      return timeA - timeB;
    });

    const isUpcoming = (ev) => {
      const endOrDue = new Date(ev.end_time || ev.start_time || ev.due_date).getTime();
      return endOrDue >= now;
    };

    const upCount = sorted.filter(isUpcoming).length;
    const sessCount = sorted.filter((ev) => ev.eventType === "SESSION").length;
    const dlCount = sorted.length - sessCount;

    let filtered = sorted;
    if (filterTab === "upcoming") filtered = sorted.filter(isUpcoming);
    else if (filterTab === "sessions") filtered = sorted.filter((ev) => ev.eventType === "SESSION");
    else if (filterTab === "deadlines") filtered = sorted.filter((ev) => ev.eventType !== "SESSION");

    return {
      allSorted: sorted,
      upcomingCount: upCount,
      sessionCount: sessCount,
      deadlineCount: dlCount,
      filteredEvents: filtered,
    };
  }, [events, filterTab]);

  if (allSorted.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
        <CalendarDays className="mx-auto h-9 w-9 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">Chưa có lịch sự kiện nào</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Các buổi học và hạn nộp sẽ xuất hiện tại đây.</p>
      </div>
    );
  }

  const todayStr = new Date().toDateString();

  const tabs = [
    { key: "all", label: `Tất cả (${allSorted.length})` },
    { key: "upcoming", label: `Sắp tới (${upcomingCount})` },
    { key: "sessions", label: `Buổi học (${sessionCount})` },
    { key: "deadlines", label: `Bài tập (${deadlineCount})` },
  ];

  return (
    <div className="space-y-3 min-w-0">
      {/* Quick Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilterTab(tab.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
              filterTab === tab.key
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-8 px-4 text-center">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Không có mục nào trong bộ lọc này</p>
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            Xem tất cả ({allSorted.length})
          </button>
        </div>
      ) : (
        <div className="space-y-2" role="feed" aria-label="Danh sách lịch">
          {filteredEvents.map((ev) => {
            const isSession = ev.eventType === "SESSION";
            const isQuiz = ev.eventType === "QUIZ_DUE";
            const isRescheduled = isSessionRescheduled(ev);
            const isLive = ev.uiState === "live";
            const isJoinable = isLive || ev.uiState === "open";
            const isToday = new Date(ev.start_time || ev.due_date).toDateString() === todayStr;

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
                className={`group cursor-pointer rounded-2xl border p-3 shadow-xs transition hover:shadow-md min-w-0 ${
                  isLive
                    ? "border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20"
                    : isToday
                      ? "border-blue-300/80 dark:border-sky-800/80 bg-blue-50/30 dark:bg-sky-950/20"
                      : "border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        isLive
                          ? "bg-rose-600 text-white animate-pulse"
                          : isSession
                            ? "bg-blue-600 text-white"
                            : isQuiz
                              ? "bg-purple-600 text-white"
                              : "bg-amber-600 text-white"
                      }`}
                    >
                      {isSession ? <Video className="h-4 w-4" /> : isQuiz ? <FileQuestion className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {isSession ? "Buổi học" : isQuiz ? "Quiz" : "Bài tập"}
                        </span>
                        {isLive && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                            Đang diễn ra
                          </span>
                        )}
                        {!isLive && isToday && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
                            Hôm nay
                          </span>
                        )}
                        {isRescheduled && (
                          <span className="rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-black">
                            Đổi lịch
                          </span>
                        )}
                        {ev.class_title && (
                          <span className="max-w-full truncate rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                            {ev.class_title}
                          </span>
                        )}
                        {!isSession && ev.total_students > 0 && (
                          <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-sky-300">
                            Nộp: {ev.submitted_count || 0}/{ev.total_students}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-1 break-words text-sm font-black leading-snug text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400">
                        {ev.title}
                      </h3>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-sky-400">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {formatDateTime(ev.start_time || ev.due_date)}
                        </span>
                        {ev.provider && <span className="truncate">{ev.provider}</span>}
                      </div>

                      {isRescheduled && (
                        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg break-words">
                          Đổi lịch: {sessionChangeReason(ev)}
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
                        className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                      >
                        {isTeacher ? "Vào dạy" : "Vào lớp"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        {!isSession && isTeacher ? "Bài nộp" : "Chi tiết"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

CalendarListView.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object),
  onSelectEvent: PropTypes.func.isRequired,
  onJoinSession: PropTypes.func.isRequired,
  isTeacher: PropTypes.bool,
};
