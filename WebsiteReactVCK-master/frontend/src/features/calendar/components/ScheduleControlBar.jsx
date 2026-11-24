import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, List } from "lucide-react";

export default function ScheduleControlBar({
  currentDate,
  onPrev,
  onNext,
  onToday,
  viewMode,
  onViewModeChange,
}) {
  const monthTitle = `Tháng ${currentDate.getMonth() + 1}, ${currentDate.getFullYear()}`;

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/80 bg-white/92 p-3 sm:px-4 sm:py-2.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-[0_6px_25px_rgba(0,0,0,0.4)] min-w-0 max-w-full">
      {/* Date Navigation */}
      <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Khoảng thời gian trước"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="px-1 text-center text-sm font-bold text-slate-800 dark:text-white sm:min-w-[120px] sm:text-base truncate">
            {monthTitle}
          </span>

          <button
            type="button"
            onClick={onNext}
            aria-label="Khoảng thời gian sau"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-400"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onToday}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-blue-50/60 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-blue-400"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          Hôm nay
        </button>
      </div>

      {/* View Mode Segmented Control */}
      <div className="grid grid-cols-3 sm:flex sm:items-center rounded-xl bg-slate-100/80 p-1 dark:bg-slate-950/80">
        <button
          type="button"
          onClick={() => onViewModeChange("week")}
          className={`rounded-lg px-2.5 sm:px-4 py-1.5 text-xs font-bold transition text-center ${
            viewMode === "week"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Tuần
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("month")}
          className={`rounded-lg px-2.5 sm:px-4 py-1.5 text-xs font-bold transition text-center ${
            viewMode === "month"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Tháng
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          className={`flex items-center justify-center gap-1 rounded-lg px-2.5 sm:px-3.5 py-1.5 text-xs font-bold transition ${
            viewMode === "list"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <List className="h-3.5 w-3.5 shrink-0" />
          <span>Danh sách</span>
        </button>
      </div>
    </div>
  );
}
