import { Video, Clock, School, Film } from "lucide-react";

export default function RecordingStatsWidget({ totalRecordings = 0, totalMinutes = 0, totalClasses = 0 }) {
  const hours = Math.round((totalMinutes / 60) * 10) / 10;

  return (
    <section className="rounded-2xl border border-white/85 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 p-4 sm:p-5 shadow-[0_8px_30px_rgba(32,78,120,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3.5">
        <Film className="h-4 w-4 text-[#102f63] dark:text-blue-400" />
        <h2 className="text-sm font-black text-[#102f63] dark:text-white tracking-tight">
          Thống kê bản ghi
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <div className="flex items-center gap-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 p-3 border border-blue-100/60 dark:border-blue-900/40">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tổng số bản ghi</p>
            <p className="text-lg font-black text-[#102f63] dark:text-white">{totalRecordings} <span className="text-xs font-bold text-slate-400 dark:text-slate-500">video</span></p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 p-3 border border-amber-100/60 dark:border-amber-900/40">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tổng thời lượng học</p>
            <p className="text-lg font-black text-[#102f63] dark:text-white">{hours > 0 ? `${hours} giờ` : `${totalMinutes} phút`}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 p-3 border border-emerald-100/60 dark:border-emerald-900/40">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <School className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Lớp học có bản ghi</p>
            <p className="text-lg font-black text-[#102f63] dark:text-white">{totalClasses} <span className="text-xs font-bold text-slate-400 dark:text-slate-500">lớp</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
