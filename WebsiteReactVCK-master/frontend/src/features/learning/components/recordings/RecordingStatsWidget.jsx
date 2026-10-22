import { Video, Clock, School, Film } from "lucide-react";

export default function RecordingStatsWidget({ totalRecordings = 0, totalMinutes = 0, totalClasses = 0 }) {
  const hours = Math.round((totalMinutes / 60) * 10) / 10;

  return (
    <section className="rounded-2xl border border-white/85 bg-white/92 p-4 sm:p-5 shadow-[0_8px_30px_rgba(32,78,120,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3.5">
        <Film className="h-4 w-4 text-[#102f63]" />
        <h2 className="text-sm font-black text-[#102f63] tracking-tight">
          Thống kê bản ghi
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <div className="flex items-center gap-3 rounded-xl bg-blue-50/70 p-3 border border-blue-100/60">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500">Tổng số bản ghi</p>
            <p className="text-lg font-black text-[#102f63]">{totalRecordings} <span className="text-xs font-bold text-slate-400">video</span></p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-amber-50/70 p-3 border border-amber-100/60">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500">Tổng thời lượng học</p>
            <p className="text-lg font-black text-[#102f63]">{hours > 0 ? `${hours} giờ` : `${totalMinutes} phút`}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-emerald-50/70 p-3 border border-emerald-100/60">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <School className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500">Lớp học có bản ghi</p>
            <p className="text-lg font-black text-[#102f63]">{totalClasses} <span className="text-xs font-bold text-slate-400">lớp</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
