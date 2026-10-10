/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, ChevronRight, RefreshCw } from "lucide-react";
import { fetchClassChapters } from "../../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../../calendar/calendarSync";

const sessionDate = (value) => {
  if (!value) return "Chưa xếp lịch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xếp lịch";
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
};

const objectiveLines = (value) => String(value || "")
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
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none" aria-labelledby="class-chapters-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-blue-600 dark:text-sky-400">
          <BookOpen size={19} aria-hidden="true" />
          <h2 id="class-chapters-title" className="text-lg font-black text-slate-950 dark:text-white">Các chương của lớp</h2>
        </div>
        {!loading && !error && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-sky-300">{chapters.length} chương</span>}
      </div>

      {loading ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">Đang tải các chương...</p>
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <p>{error}</p>
          <button type="button" onClick={reload} className="inline-flex items-center gap-1 font-bold hover:underline"><RefreshCw size={14} /> Thử lại</button>
        </div>
      ) : chapters.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">Lớp chưa có chương nào. Quản trị viên sẽ cập nhật nội dung học tại đây.</p>
      ) : (
        <ol className="space-y-3">
          {chapters.map((chapter, index) => {
            const sessions = [...(chapter.sessions || [])].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
            const objectives = objectiveLines(chapter.objectives);
            return (
              <li key={chapter.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/30">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Chương {index + 1}: {chapter.title}</h3>
                    <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{sessions.length} buổi học</span>
                  </div>
                  {chapter.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{chapter.description}</p>}
                  {objectives.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mục tiêu</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                        {objectives.map((objective, objectiveIndex) => <li key={`${chapter.id}-${objectiveIndex}`}>{objective}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                  {sessions.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Buổi học chưa được xếp lịch.</p>
                  ) : (
                    <ul className="space-y-2">
                      {sessions.map((session) => (
                        <li key={session.id}>
                          <Link to={`${basePath}/sessions/${session.id}`} className="group flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 transition hover:bg-blue-50 dark:bg-slate-900 dark:hover:bg-slate-800">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-sky-300">{session.title || `Buổi học ${index + 1}`}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><CalendarDays size={13} aria-hidden="true" /> {sessionDate(session.start_time)}{session.status === "cancelled" ? " · Đã hủy" : ""}</p>
                            </div>
                            <ChevronRight size={17} className="shrink-0 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-sky-300" aria-hidden="true" />
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
