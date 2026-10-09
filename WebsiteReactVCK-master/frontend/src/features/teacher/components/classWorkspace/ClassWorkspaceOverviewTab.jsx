/* eslint-disable react/prop-types */
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Users,
} from "lucide-react";

export default function ClassWorkspaceOverviewTab({
  stats = {},
  atRiskStudents = [],
  onOpenCreateSession
}) {
  return (
    <div className="space-y-3.5">
      {/* Gộp Ghi chú lớp học & 4 Thẻ KPI */}
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/70 dark:border-blue-950/70 dark:bg-blue-950/20 p-3 sm:p-3.5 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-center">
          {/* Cột trái: Ghi chú */}
          <div className="lg:col-span-5 flex items-start gap-2.5">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
              <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight">
                Lớp là tổng quan, buổi học là không gian làm việc
              </h2>
              <p className="mt-0.5 text-[11px] sm:text-xs leading-4 text-slate-600 dark:text-slate-300 line-clamp-2">
                Chọn một buổi trong lịch bên dưới để giao bài, tạo Quiz, tải tài liệu, điểm danh và xem kết quả. Mọi dữ liệu đó được gắn riêng với đúng buổi học.
              </p>
            </div>
          </div>

          {/* Cột phải: 4 ô chỉ số thống kê */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Sĩ số lớp", stats.totalStudents || stats.total_students || 0, Users, "text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-blue-950/60"],
              ["Chuyên cần TB", `${stats.attendanceRate || stats.average_attendance_rate || 0}%`, CheckCircle2, "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60"],
              ["Bài cần chấm", stats.pendingGrading || stats.pending_assignments_count || 0, BookOpen, "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60"],
              ["Buổi đã học", stats.completedSessions || stats.completed_sessions_count || 0, CalendarDays, "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60"],
            ].map(([label, value, Icon, iconStyle]) => (
              <div key={label} className="flex items-center gap-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800 p-2 shadow-xs">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">{value}</p>
                  <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Phím tắt thao tác giảng dạy */}
      <aside className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
          <h4 className="text-sm font-black text-slate-900 dark:text-white">Thao tác giảng dạy nhanh</h4>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onOpenCreateSession}
              className="flex w-full items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition"
            >
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Lên lịch buổi học
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={onOpenCreateSession}
              className="flex w-full items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition"
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Thêm buổi học để chuẩn bị nội dung
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
      </aside>

      {/* Học viên cần chú ý */}
      {atRiskStudents.length > 0 && (
        <section className="rounded-2xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-5">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-black">Học viên cần theo dõi ({atRiskStudents.length})</h4>
          </div>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
            Các học viên có tỷ lệ chuyên cần thấp hoặc trễ hạn nhiều bài tập.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {atRiskStudents.slice(0, 3).map((st) => (
              <div key={st.id} className="rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-white dark:bg-slate-900 p-3 text-xs">
                <p className="font-bold text-slate-900 dark:text-white">{st.fullName || st.name || st.username}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Chuyên cần: <strong className="text-amber-600">{st.attendanceRate || 0}%</strong> · Nợ bài: <strong>{st.missingAssignments || 0}</strong>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
