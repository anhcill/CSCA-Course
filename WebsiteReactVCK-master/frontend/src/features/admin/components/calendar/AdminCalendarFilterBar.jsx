import { Filter, RefreshCw, Calendar, Users, BookOpen } from "lucide-react";

export default function AdminCalendarFilterBar({
  filters,
  onChangeFilter,
  classes = [],
  teachers = [],
  onRefresh,
  loading = false,
}) {
  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Filter className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            Bộ lọc điều phối lịch
          </span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Đang cập nhật..." : "Làm mới"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Khoảng thời gian */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Thời gian
          </label>
          <select
            value={filters.timeRange || "next_30_days"}
            onChange={(e) => onChangeFilter("timeRange", e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="this_week">Tuần này</option>
            <option value="next_week">Tuần tới</option>
            <option value="this_month">Tháng này</option>
            <option value="next_30_days">30 ngày tới</option>
            <option value="all">Tất cả thời gian</option>
          </select>
        </div>

        {/* Lọc theo lớp học */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Lớp học
          </label>
          <select
            value={filters.classId || ""}
            onChange={(e) => onChangeFilter("classId", e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Tất cả các lớp</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.title} {cls.course_title ? `(${cls.course_title})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Lọc theo giảng viên */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Giảng viên
          </label>
          <select
            value={filters.teacherId || ""}
            onChange={(e) => onChangeFilter("teacherId", e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Tất cả giảng viên</option>
            {teachers.map((tch) => (
              <option key={tch.id} value={tch.id}>
                {tch.full_name} ({tch.email})
              </option>
            ))}
          </select>
        </div>

        {/* Lọc theo trạng thái */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Trạng thái buổi học
          </label>
          <select
            value={filters.status || ""}
            onChange={(e) => onChangeFilter("status", e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="scheduled">Đã lên lịch</option>
            <option value="live">Đang diễn ra</option>
            <option value="rescheduled">Đã dời lịch</option>
            <option value="cancelled">Đã hủy</option>
            <option value="completed">Đã kết thúc</option>
          </select>
        </div>
      </div>
    </section>
  );
}
