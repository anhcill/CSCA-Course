
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";

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
    <section className="rounded-2xl sm:rounded-3xl border border-rose-200/90 bg-rose-50/80 p-3.5 sm:p-4 dark:border-rose-900/60 dark:bg-rose-950/30 space-y-3">
      <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <h3 className="text-xs sm:text-sm font-black tracking-tight">
          Phát hiện {conflicts.length} xung đột lịch học cần điều chỉnh
        </h3>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        {conflicts.map((conflict, idx) => (
          <div
            key={idx}
            className="flex flex-col justify-between rounded-2xl border border-rose-200/80 bg-white/95 p-3 dark:border-rose-900/70 dark:bg-slate-900/95"
          >
            <div className="min-w-0">
              <span className="inline-block rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">
                {conflict.type === "teacher_conflict" ? "Trùng lịch giảng viên" : "Trùng giờ trong lớp"}
              </span>
              <p className="mt-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {conflict.message}
              </p>

              <div className="mt-2 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                {conflict.sessionA && (
                  <div className="flex items-start gap-1.5 rounded-xl bg-slate-50/90 px-2.5 py-1.5 dark:bg-slate-800/70">
                    <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {conflict.sessionA.classTitle}:
                      </span>{" "}
                      {conflict.sessionA.title} ({formatTimeRange(conflict.sessionA.start, conflict.sessionA.end)})
                    </div>
                  </div>
                )}

                {conflict.sessionB && (
                  <div className="flex items-start gap-1.5 rounded-xl bg-slate-50/90 px-2.5 py-1.5 dark:bg-slate-800/70">
                    <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {conflict.sessionB.classTitle}:
                      </span>{" "}
                      {conflict.sessionB.title} ({formatTimeRange(conflict.sessionB.start, conflict.sessionB.end)})
                    </div>
                  </div>
                )}
              </div>
            </div>

            {onSelectSession && (
              <div className="mt-2.5 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onSelectSession(conflict.sessionA)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 hover:underline dark:text-sky-400"
                >
                  Xem buổi 1 <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectSession(conflict.sessionB)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 hover:underline dark:text-sky-400"
                >
                  Xem buổi 2 <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
