import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  List,
  Plus
} from "lucide-react";
import PropTypes from "prop-types";

const getHeaderTitle = (date, viewMode) => {
  const d = new Date(date);
  if (viewMode === "day") {
    return d.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }
  if (viewMode === "month") {
    return d.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  }
  if (viewMode === "week") {
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatShort = (dateVal) =>
      dateVal.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    return `${formatShort(monday)} – ${formatShort(sunday)}, ${d.getFullYear()}`;
  }
  return "Danh sách lịch học & nhiệm vụ";
};

export default function CalendarViewHeader({
  currentDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  isTeacher = false,
  canManageFixedSchedule = false,
  onCreateClick
}) {
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    onDateChange(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    onDateChange(d);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const viewModes = [
    { id: "week", label: "Tuần", icon: CalendarDays },
    { id: "day", label: "Ngày", icon: CalendarIcon },
    { id: "month", label: "Tháng", icon: CalendarRange },
    { id: "list", label: "Danh sách", icon: List }
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors duration-200">
      {/* Cụm điều hướng thời gian */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToday}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Hôm nay
        </button>

        <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Khoảng thời gian trước"
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Khoảng thời gian sau"
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <h2 className="text-sm font-black capitalize text-slate-900 dark:text-white sm:text-base ml-1">
          {getHeaderTitle(currentDate, viewMode)}
        </h2>
      </div>

      {/* Cụm chuyển đổi chế độ xem và hành động */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 p-1">
          {viewModes.map((item) => {
            const Icon = item.icon;
            const active = viewMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewModeChange(item.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  active
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>

        {isTeacher && onCreateClick && (
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> {canManageFixedSchedule ? "Tạo lịch học" : "Bổ sung buổi học"}
          </button>
        )}
      </div>
    </div>
  );
}

CalendarViewHeader.propTypes = {
  currentDate: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string, PropTypes.number]).isRequired,
  onDateChange: PropTypes.func.isRequired,
  viewMode: PropTypes.oneOf(["week", "day", "month", "list"]).isRequired,
  onViewModeChange: PropTypes.func.isRequired,
  isTeacher: PropTypes.bool,
  canManageFixedSchedule: PropTypes.bool,
  onCreateClick: PropTypes.func,
};
