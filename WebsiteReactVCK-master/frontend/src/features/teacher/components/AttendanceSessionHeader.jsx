import PropTypes from "prop-types";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

export default function AttendanceSessionHeader({
  sessions = [],
  selectedSessionId,
  onSessionChange,
  stats,
  policy,
  loading = false,
}) {
  return (
    <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.1)] backdrop-blur-md space-y-4">
      {/* Top Header: Title & Session Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400 shadow-2xs">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#102f63] dark:text-white">
              Sổ Điểm Danh Buổi Học
            </h2>
            <p className="text-xs text-[#487291] dark:text-slate-400">
              Chọn buổi học để ghi nhận chuyên cần và theo dõi học viên
            </p>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="relative">
            <select
              value={selectedSessionId}
              onChange={onSessionChange}
              aria-label="Chọn buổi học"
              className="w-full sm:w-auto appearance-none rounded-2xl border border-white/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 pl-4 pr-10 py-2.5 text-xs font-bold text-[#102f63] dark:text-white shadow-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10 cursor-pointer"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {new Date(s.start_time).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>

      {/* Notice / Policy Banner */}
      {!loading && sessions.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Hôm nay không có buổi học nào cần điểm danh. Bạn có thể chọn buổi học khác từ danh sách.</span>
        </div>
      ) : policy?.isLocked ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Điểm danh buổi học này đã được chốt và khóa chỉnh sửa để bảo đảm tính minh bạch.</span>
        </div>
      ) : policy?.canMarkAttendance ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/30 px-3.5 py-2.5 text-xs font-semibold text-sky-800 dark:text-sky-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600" />
          <span>Buổi học hợp lệ để điểm danh. Vui lòng rà soát kỹ trước khi bấm &quot;Chốt & khóa điểm danh&quot;.</span>
        </div>
      ) : policy?.reason ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{policy.reason}</span>
        </div>
      ) : null}

      {/* 5 Stats Tiles: Frosted Glass Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 p-3 text-center shadow-2xs">
          <p className="text-xl sm:text-2xl font-black text-[#102f63] dark:text-white leading-tight">
            {stats.total}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5 flex items-center justify-center gap-1">
            <Users className="h-3 w-3" /> Tổng học viên
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/40 p-3 text-center shadow-2xs">
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">
            {stats.present}
          </p>
          <p className="text-[10px] sm:text-[11px] text-emerald-700 dark:text-emerald-300 font-bold mt-0.5 flex items-center justify-center gap-1">
            <UserCheck className="h-3 w-3" /> Có mặt
          </p>
        </div>

        <div className="rounded-2xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/40 p-3 text-center shadow-2xs">
          <p className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 leading-tight">
            {stats.absent}
          </p>
          <p className="text-[10px] sm:text-[11px] text-rose-700 dark:text-rose-300 font-bold mt-0.5 flex items-center justify-center gap-1">
            <UserX className="h-3 w-3" /> Vắng mặt
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/40 p-3 text-center shadow-2xs">
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 leading-tight">
            {stats.excused}
          </p>
          <p className="text-[10px] sm:text-[11px] text-amber-700 dark:text-amber-300 font-bold mt-0.5 flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" /> Có phép
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-sky-200/70 dark:border-sky-900/50 bg-sky-50/70 dark:bg-sky-950/40 p-3 text-center shadow-2xs">
          <p className="text-xl sm:text-2xl font-black text-sky-600 dark:text-sky-400 font-mono leading-tight">
            {stats.rate}%
          </p>
          <p className="text-[10px] sm:text-[11px] text-sky-700 dark:text-sky-300 font-bold mt-0.5 flex items-center justify-center gap-1">
            <BarChart3 className="h-3 w-3" /> Chuyên cần
          </p>
        </div>
      </div>
    </div>
  );
}

AttendanceSessionHeader.propTypes = {
  sessions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string,
      start_time: PropTypes.string,
    })
  ),
  selectedSessionId: PropTypes.string,
  onSessionChange: PropTypes.func.isRequired,
  stats: PropTypes.shape({
    total: PropTypes.number.isRequired,
    present: PropTypes.number.isRequired,
    absent: PropTypes.number.isRequired,
    excused: PropTypes.number.isRequired,
    rate: PropTypes.number.isRequired,
  }).isRequired,
  policy: PropTypes.shape({
    isLocked: PropTypes.bool,
    canMarkAttendance: PropTypes.bool,
    reason: PropTypes.string,
  }),
  loading: PropTypes.bool,
};
