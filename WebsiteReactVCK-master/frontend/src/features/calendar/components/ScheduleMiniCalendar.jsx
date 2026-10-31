import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

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
      isCurrentMonth: false,
    });
  }

  // Days in current month
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({
      date: new Date(year, month, day),
      isCurrentMonth: true,
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
      isCurrentMonth: false,
    });
  }
  if (currentWeek.length === 7) matrix.push(currentWeek);

  return matrix;
};

export default function ScheduleMiniCalendar({ currentDate, onDateChange, events = [] }) {
  const [viewDate, setViewDate] = useState(new Date(currentDate));

  // Đồng bộ viewDate khi currentDate thay đổi từ bên ngoài (ví dụ bấm Hôm nay hoặc tuần sau)
  useEffect(() => {
    setViewDate(new Date(currentDate));
  }, [currentDate]);

  const monthMatrix = getMonthMatrix(viewDate);
  const selectedStr = new Date(currentDate).toDateString();
  const todayStr = new Date().toDateString();

  const handlePrevMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    setViewDate(d);
  };

  const handleNextMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    setViewDate(d);
  };

  const monthTitle = `Tháng ${viewDate.getMonth() + 1}, ${viewDate.getFullYear()}`;

  return (
    <div className="rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      {/* Header Tháng & Nút prev/next */}
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">{monthTitle}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Tháng trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tiêu đề các thứ T2 -> CN */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Grid các ngày */}
      <div className="mt-1 space-y-1">
        {monthMatrix.map((week, wIdx) => (
          <div key={wIdx} className="grid grid-cols-7 gap-1 text-center">
            {week.map(({ date, isCurrentMonth }, dIdx) => {
              const dStr = date.toDateString();
              const isSelected = dStr === selectedStr;
              const isToday = dStr === todayStr;

              // Kiểm tra xem ngày này có lịch học hoặc hạn nộp không
              const dayEvents = events.filter((ev) => {
                const t = new Date(ev.start_time || ev.due_date);
                return t.toDateString() === dStr;
              });
              const hasSession = dayEvents.some((ev) => ev.eventType === "SESSION");
              const hasDeadline = dayEvents.some((ev) => ev.eventType !== "SESSION");

              return (
                <button
                  key={dIdx}
                  type="button"
                  onClick={() => {
                    onDateChange(date);
                    setViewDate(date);
                  }}
                  className={`relative flex flex-col h-7 w-7 items-center justify-center rounded-full text-xs transition mx-auto ${
                    isSelected
                      ? "bg-blue-600 font-bold text-white shadow-sm"
                      : isToday
                      ? "bg-blue-100 font-bold text-blue-700 hover:bg-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:hover:bg-blue-900/60"
                      : isCurrentMonth
                      ? "font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      : "text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <span className="leading-none">{date.getDate()}</span>
                  {(hasSession || hasDeadline) && (
                    <span className="absolute bottom-0.5 flex items-center gap-0.5">
                      {hasSession && (
                        <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-blue-600 dark:bg-blue-400"}`} />
                      )}
                      {hasDeadline && (
                        <span className={`h-1 w-1 rounded-full ${isSelected ? "bg-amber-300" : "bg-amber-500 dark:bg-amber-400"}`} />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
