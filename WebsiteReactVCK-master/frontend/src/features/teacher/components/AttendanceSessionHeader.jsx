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
    <div className="space-y-4">
      {/* Top Control Bar: Select Session */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              Sổ Điểm Danh Lớp Học Trực Tuyến
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chỉ hiển thị buổi diễn ra hôm nay. Sau khi chốt, kết quả được lưu và khóa chỉnh sửa.
            </p>
          </div>

          {sessions.length > 0 && (
            <select
              value={selectedSessionId}
              onChange={onSessionChange}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({new Date(s.start_time).toLocaleDateString("vi-VN")})
                </option>
              ))}
            </select>
          )}
        </div>

        {!loading && sessions.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
            Hôm nay không có buổi học nào để điểm danh.
          </div>
        ) : policy?.isLocked ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
            Điểm danh đã được chốt. Dữ liệu chỉ đọc để bảo đảm tính minh bạch.
          </div>
        ) : policy?.canMarkAttendance ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs font-semibold text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">
            Bạn đang điểm danh trong ngày hợp lệ. Kiểm tra kỹ trước khi chốt vì kết quả sẽ không thể sửa lại.
          </div>
        ) : policy?.reason ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
            {policy.reason}
          </div>
        ) : null}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 text-center shadow-xs">
          <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">Tổng học viên</p>
        </div>
        <div className="bg-emerald-50 dark:bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 text-center shadow-xs">
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.present}</p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1">Có mặt</p>
        </div>
        <div className="bg-rose-50 dark:bg-slate-900 border border-rose-500/30 rounded-2xl p-4 text-center shadow-xs">
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{stats.absent}</p>
          <p className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold mt-1">Vắng mặt</p>
        </div>
        <div className="bg-amber-50 dark:bg-slate-900 border border-amber-500/30 rounded-2xl p-4 text-center shadow-xs">
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.excused}</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold mt-1">Có phép</p>
        </div>
        <div className="col-span-2 md:col-span-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 text-center shadow-xs">
          <p className="text-2xl font-black text-blue-600 dark:text-sky-400 font-mono">{stats.rate}%</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">Tỷ lệ chuyên cần</p>
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
