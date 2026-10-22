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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/92 px-4 py-2.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
      {/* Cụm điều hướng ngày tháng bên trái */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Khoảng thời gian trước"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="min-w-[130px] text-center text-sm font-bold text-slate-800 sm:text-base">
          {monthTitle}
        </span>

        <button
          type="button"
          onClick={onNext}
          aria-label="Khoảng thời gian sau"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToday}
          className="ml-2 flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-blue-50/60 hover:text-blue-700"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
          Hôm nay
        </button>
      </div>

      {/* Cụm chọn chế độ xem bên phải (Tuần / Tháng / Danh sách) */}
      <div className="flex items-center rounded-xl bg-slate-100/80 p-1">
        <button
          type="button"
          onClick={() => onViewModeChange("week")}
          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${
            viewMode === "week"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Tuần
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("month")}
          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${
            viewMode === "month"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Tháng
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
            viewMode === "list"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          Danh sách
        </button>
      </div>
    </div>
  );
}
