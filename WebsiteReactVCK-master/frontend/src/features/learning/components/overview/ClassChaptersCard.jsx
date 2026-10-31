import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Layers, RefreshCw } from "lucide-react";
import { fetchClassChapters } from "../../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../../calendar/calendarSync";

const sessionDate = (value) => {
  if (!value) return "Chưa xếp lịch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xếp lịch";
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const objectiveLines = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);

export default function ClassChaptersCard({ classId, basePath }) {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchClassChapters(classId);
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error(response?.message || "Không thể tải danh sách chương.");
      }
      setChapters(response.data);
    } catch (requestError) {
      setError(requestError.message || "Không thể tải danh sách chương.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    reload();
    return subscribeToCalendarChanges(reload);
  }, [reload]);

  return (
    <section
      className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none"
      aria-labelledby="class-chapters-title"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-xs dark:bg-sky-950/60 dark:text-sky-400">
            <Layers className="h-5 w-5" />
          </span>
          <div>
            <h2 id="class-chapters-title" className="text-lg font-black text-[#102f63] dark:text-white">
              Lộ trình & Các chương học
            </h2>
            <p className="text-xs text-[#487291] dark:text-slate-400">Chi tiết từng chương, buổi học và mục tiêu trọng tâm</p>
          </div>
        </div>
        {!loading && !error && (
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:ring-sky-800/60">
            {chapters.length} chương học
          </span>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 p-8 text-center text-sm font-semibold text-sky-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-sky-300">
          Đang tải nội dung các chương...
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400">
          <p>{error}</p>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-white hover:bg-rose-700 transition"
          >
            <RefreshCw size={13} /> Thử lại
          </button>
        </div>
      ) : chapters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center text-sm text-[#487291] dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          Lớp chưa có chương nào được công bố. Giảng viên sẽ cập nhật nội dung học tại đây.
        </div>
      ) : (
        <ol className="space-y-4">
          {chapters.map((chapter, index) => {
            const sessions = [...(chapter.sessions || [])].sort(
              (a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0)
            );
            const objectives = objectiveLines(chapter.objectives);
            return (
              <li
                key={chapter.id}
                className="overflow-hidden rounded-2xl border border-white/90 bg-white/70 shadow-xs backdrop-blur-sm transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-sky-500/50"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-[11px] font-black text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        {index + 1}
                      </span>
                      <h3 className="text-base font-bold text-[#102f63] dark:text-white">
                        Chương {index + 1}: {chapter.title}
                      </h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {sessions.length} buổi học
                    </span>
                  </div>

                  {chapter.description && (
                    <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[#244866] dark:text-slate-300">
                      {chapter.description}
                    </p>
                  )}

                  {objectives.length > 0 && (
                    <div className="mt-3.5 rounded-xl bg-sky-50/50 p-3 border border-sky-100/80 dark:bg-slate-950/60 dark:border-slate-800">
                      <p className="text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300">Mục tiêu trọng tâm</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[#17365f] dark:text-slate-300">
                        {objectives.map((objective, objectiveIndex) => (
                          <li key={`${chapter.id}-${objectiveIndex}`}>{objective}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950/40">
                  {sessions.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Buổi học chưa được xếp lịch cụ thể.</p>
                  ) : (
                    <ul className="space-y-2">
                      {sessions.map((session, sIdx) => (
                        <li key={session.id}>
                          <Link
                            to={`${basePath}/sessions/${session.id}`}
                            className="group flex items-center justify-between gap-3 rounded-xl border border-white bg-white/90 px-3.5 py-2.5 shadow-2xs transition hover:border-sky-300 hover:bg-sky-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-500/50 dark:hover:bg-slate-800/60"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs sm:text-sm font-bold text-[#102f63] group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">
                                {session.title || `Buổi học ${sIdx + 1}`}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#487291] dark:text-slate-400">
                                <CalendarDays size={13} className="text-sky-500" />
                                <span>{sessionDate(session.start_time)}</span>
                                {session.status === "cancelled" && (
                                  <span className="font-bold text-rose-500">· Đã hủy</span>
                                )}
                              </p>
                            </div>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 transition group-hover:bg-sky-600 group-hover:text-white dark:bg-slate-800 dark:text-sky-400 dark:group-hover:bg-sky-600 dark:group-hover:text-white">
                              <ChevronRight size={16} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
