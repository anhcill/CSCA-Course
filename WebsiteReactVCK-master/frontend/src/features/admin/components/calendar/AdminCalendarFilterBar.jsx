
import { RefreshCw } from "lucide-react";

const SELECT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";

export default function AdminCalendarFilterBar({
  filters,
  onChangeFilter,
  classes = [],
  teachers = [],
  onRefresh,
  loading = false,
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
      {onRefresh && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Bộ lọc lịch học
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Đang cập nhật..." : "Làm mới"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Thời gian
          </label>
          <select
            value={filters.timeRange || "next_30_days"}
            onChange={(e) => onChangeFilter("timeRange", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="this_week">Tuần này</option>
            <option value="next_week">Tuần tới</option>
            <option value="this_month">Tháng này</option>
            <option value="next_30_days">30 ngày tới</option>
            <option value="all">Tất cả thời gian</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Lớp học
          </label>
          <select
            value={filters.classId || ""}
            onChange={(e) => onChangeFilter("classId", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Tất cả các lớp</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.title} {cls.course_title ? `(${cls.course_title})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Giảng viên
          </label>
          <select
            value={filters.teacherId || ""}
            onChange={(e) => onChangeFilter("teacherId", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Tất cả giảng viên</option>
            {teachers.map((tch) => (
              <option key={tch.id} value={tch.id}>
                {tch.full_name} ({tch.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Trạng thái buổi học
          </label>
          <select
            value={filters.status || ""}
            onChange={(e) => onChangeFilter("status", e.target.value)}
            className={SELECT_CLASS}
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
