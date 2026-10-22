import React from "react";
import { AlertCircle, Calendar, CheckCircle2, FileText, LayoutGrid, Search } from "lucide-react";

export default function AssignmentFilterBar({
  activeFilter,
  onFilterChange,
  counts = {},
  searchQuery,
  onSearchChange,
}) {
  const filters = [
    { id: "all", label: "Tất cả", icon: LayoutGrid, count: counts.all ?? 0 },
    { id: "homework", label: "Bài tập", icon: FileText, count: counts.homework ?? 0 },
    { id: "quiz", label: "Kiểm tra", icon: Calendar, count: counts.quiz ?? 0 },
    { id: "submitted", label: "Đã nộp", icon: CheckCircle2, count: counts.submitted ?? 0 },
    { id: "overdue", label: "Quá hạn", icon: AlertCircle, count: counts.overdue ?? 0 },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/92 px-3 py-2 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
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
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
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

      {/* Ô tìm kiếm bên phải */}
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm tên bài tập, kiểm tra..."
          className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/80 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white"
        />
      </div>
    </div>
  );
}
