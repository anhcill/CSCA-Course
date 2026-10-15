import PropTypes from "prop-types";

export default function AttendanceSessionHeader({
  sessions = [],
  selectedSessionId,
  onSessionChange,
  stats,
  policy,
  loading = false,
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
      {/* Top Header: Title & Session Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
          Sổ Điểm Danh Lớp Học Trực Tuyến
        </h1>

        {sessions.length > 0 && (
          <select
            value={selectedSessionId}
            onChange={onSessionChange}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({new Date(s.start_time).toLocaleDateString("vi-VN")})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Notice / Policy Banner */}
      {!loading && sessions.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
          Hôm nay không có buổi học nào để điểm danh.
        </div>
      ) : policy?.isLocked ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
          Điểm danh đã được chốt. Dữ liệu chỉ đọc để bảo đảm tính minh bạch.
        </div>
      ) : policy?.canMarkAttendance ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">
          Bạn đang điểm danh trong ngày hợp lệ. Kiểm tra kỹ trước khi chốt vì kết quả sẽ không thể sửa lại.
        </div>
      ) : policy?.reason ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
          {policy.reason}
        </div>
      ) : null}

      {/* Stats Row - Compact inside the same box */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-2.5 text-center">
          <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight">{stats.total}</p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">Tổng học viên</p>
        </div>
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-2.5 text-center">
          <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-tight">{stats.present}</p>
          <p className="text-[10px] sm:text-[11px] text-emerald-700 dark:text-emerald-300 font-medium mt-0.5">Có mặt</p>
        </div>
        <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-500/20 rounded-xl p-2.5 text-center">
          <p className="text-lg sm:text-xl font-bold text-rose-600 dark:text-rose-400 leading-tight">{stats.absent}</p>
          <p className="text-[10px] sm:text-[11px] text-rose-700 dark:text-rose-300 font-medium mt-0.5">Vắng mặt</p>
        </div>
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-500/20 rounded-xl p-2.5 text-center">
          <p className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400 leading-tight">{stats.excused}</p>
          <p className="text-[10px] sm:text-[11px] text-amber-700 dark:text-amber-300 font-medium mt-0.5">Có phép</p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-500/20 rounded-xl p-2.5 text-center">
          <p className="text-lg sm:text-xl font-bold text-sky-600 dark:text-sky-400 font-mono leading-tight">{stats.rate}%</p>
          <p className="text-[10px] sm:text-[11px] text-sky-700 dark:text-sky-300 font-medium mt-0.5">Tỷ lệ chuyên cần</p>
        </div>
      </div>
    </div>
  );
}

AttendanceSessionHeader.propTypes = {
  sessions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string,
    start_time: PropTypes.string,
  })),
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
