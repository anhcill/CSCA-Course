export default function AttendanceSessionHeader({
  sessions = [],
  selectedSessionId,
  onSessionChange,
  stats
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
              Chọn buổi học cần điểm danh và cập nhật trạng thái có mặt của học viên.
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
