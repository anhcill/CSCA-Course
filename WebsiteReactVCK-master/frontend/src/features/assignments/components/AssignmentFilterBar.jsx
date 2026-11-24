import { AlertCircle, Calendar, CheckCircle2, FileText, GraduationCap, LayoutGrid, Search } from "lucide-react";

export default function AssignmentFilterBar({
  activeFilter,
  onFilterChange,
  counts = {},
  searchQuery,
  onSearchChange,
  classes = [],
  selectedClass = "all",
  onClassChange,
  hideClassSelect = false,
}) {
  const filters = [
    { id: "active", label: "Cần làm", icon: FileText, count: counts.active ?? 0 },
    { id: "all", label: "Tất cả", icon: LayoutGrid, count: counts.all ?? 0 },
    { id: "quiz", label: "Kiểm tra", icon: Calendar, count: counts.quiz ?? 0 },
    { id: "submitted", label: "Đã nộp", icon: CheckCircle2, count: counts.submitted ?? 0 },
    { id: "overdue", label: "Quá hạn", icon: AlertCircle, count: counts.overdue ?? 0 },
  ];

  const showClassSelect = !hideClassSelect && classes.length > 1 && typeof onClassChange === "function";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/92 px-3 py-2 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-[0_6px_25px_rgba(0,0,0,0.4)]">
      {/* Cụm tabs lọc bên trái */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => {
          const Icon = f.icon;
          const isActive = activeFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>
                {f.label} ({f.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Cụm lọc lớp + tìm kiếm bên phải */}
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {showClassSelect && (
          <div className="relative flex-1 sm:flex-initial">
            <GraduationCap className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <select
              value={selectedClass}
              onChange={(e) => onClassChange(e.target.value)}
              aria-label="Lọc theo lớp học"
              className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 pl-8 pr-6 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white sm:max-w-[200px] dark:border-slate-700 dark:bg-slate-950/80 dark:text-white focus:dark:border-sky-500"
            >
              <option value="all">Tất cả lớp học ({classes.length})</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="relative flex-1 sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên bài tập, kiểm tra..."
            className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950/80 dark:text-white dark:placeholder:text-slate-500 focus:dark:border-sky-500 focus:dark:bg-slate-950"
          />
        </div>
      </div>
    </div>
  );
}
