import { AlertTriangle, Clock, MapPin, User, ChevronRight } from "lucide-react";

const formatTimeRange = (start, end) => {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const timeStr = `${s.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} - ${
    e ? e.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""
  }`;
  const dateStr = s.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${dateStr}, ${timeStr}`;
};

export default function AdminCalendarConflictBanner({
  conflicts = [],
  onSelectSession,
}) {
  if (!conflicts || conflicts.length === 0) return null;

  return (
    <div className="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-400">
        <AlertTriangle className="h-5 w-5 shrink-0 animate-bounce" />
        <h3 className="text-sm font-black uppercase tracking-wide">
          Phát hiện {conflicts.length} xung đột lịch học cần điều phối
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
        {conflicts.map((conflict, idx) => (
          <div
            key={idx}
            className="flex flex-col justify-between rounded-2xl border border-rose-200/80 dark:border-rose-900/80 bg-white/90 dark:bg-slate-900/90 p-4 shadow-xs"
          >
            <div>
              <span className="inline-block rounded-md bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700 dark:text-rose-300">
                {conflict.type === "teacher_conflict" ? "Trùng lịch giảng viên" : "Trùng giờ trong lớp"}
              </span>
              <p className="mt-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {conflict.message}
              </p>

              <div className="mt-3 space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {conflict.sessionA.classTitle}:
                    </span>{" "}
                    {conflict.sessionA.title} ({formatTimeRange(conflict.sessionA.start, conflict.sessionA.end)})
                  </div>
                </div>

                <div className="flex items-start gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {conflict.sessionB.classTitle}:
                    </span>{" "}
                    {conflict.sessionB.title} ({formatTimeRange(conflict.sessionB.start, conflict.sessionB.end)})
                  </div>
                </div>
              </div>
            </div>

            {onSelectSession && (
              <div className="mt-3 flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onSelectSession(conflict.sessionA)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Xem buổi 1 <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectSession(conflict.sessionB)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Xem buổi 2 <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
