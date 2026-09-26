import { useMemo } from "react";
import { FileQuestion, Video, ClipboardList } from "lucide-react";

const getMonthMatrix = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDay = (firstDay.getDay() + 6) % 7; // Monday as 0
  const daysInMonth = lastDay.getDate();

  const matrix = [];
  let currentWeek = [];

  // Padding days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    currentWeek.push({
      date: new Date(year, month - 1, prevMonthLastDay - i),
      isCurrentMonth: false
    });
  }

  // Days in current month
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({
      date: new Date(year, month, day),
      isCurrentMonth: true
    });
    if (currentWeek.length === 7) {
      matrix.push(currentWeek);
      currentWeek = [];
    }
  }

  // Padding days for next month
  let nextDay = 1;
  while (currentWeek.length > 0 && currentWeek.length < 7) {
    currentWeek.push({
      date: new Date(year, month + 1, nextDay++),
      isCurrentMonth: false
    });
  }
  if (currentWeek.length === 7) matrix.push(currentWeek);

  return matrix;
};

const WEEKDAY_HEADERS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function CalendarMonthView({
  currentDate,
  events = [],
  onSelectEvent,
  onSelectDate
}) {
  const monthMatrix = useMemo(() => getMonthMatrix(currentDate), [currentDate]);
  const todayStr = new Date().toDateString();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors duration-200">
      {/* Header thứ */}
      <div className="grid grid-cols-7 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-center text-xs font-bold text-slate-500 dark:text-slate-400 py-2.5">
        {WEEKDAY_HEADERS.map((name) => (
          <div key={name}>{name}</div>
        ))}
      </div>

      {/* Grid các ngày */}
      <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
        {monthMatrix.map((week, wIdx) => (
          <div key={wIdx} className="grid grid-cols-7 divide-x divide-slate-200/80 dark:divide-slate-800 min-h-[90px]">
            {week.map(({ date, isCurrentMonth }) => {
              const dateStr = date.toDateString();
              const isToday = dateStr === todayStr;
              const dayEvents = events.filter(
                (ev) => new Date(ev.start_time || ev.due_date).toDateString() === dateStr
              );

              return (
                <div
                  key={dateStr}
                  onClick={() => onSelectDate && onSelectDate(date)}
                  className={`p-1.5 flex flex-col justify-between transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer ${
                    !isCurrentMonth ? "bg-slate-50/40 dark:bg-slate-950/40 text-slate-400 dark:text-slate-600" : ""
                  } ${isToday ? "bg-blue-50/30 dark:bg-blue-950/20" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isToday ? "bg-blue-600 text-white" : isCurrentMonth ? "text-slate-800 dark:text-slate-200" : "text-slate-400"
                    }`}>
                      {date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-blue-600 dark:text-sky-400">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const isSession = ev.eventType === "SESSION";
                      return (
                        <div
                          key={`${ev.eventType}-${ev.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(ev);
                          }}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold flex items-center gap-1 ${
                            isSession ? "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-sky-300" : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                          }`}
                        >
                          {isSession ? <Video className="h-2.5 w-2.5 shrink-0" /> : <ClipboardList className="h-2.5 w-2.5 shrink-0" />}
                          <span className="truncate">{ev.title}</span>
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <p className="text-[9px] text-slate-400 font-bold">+{dayEvents.length - 2} khác</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
