import { Link } from "react-router-dom";
import { ArrowRight, PlayCircle } from "lucide-react";

export default function ClassProgressCard({
  percent = 0,
  completedLessons = 0,
  totalLessons = 0,
  sections = [],
  basePath
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Tiến độ học tập</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Hoàn thành các bài giảng để nắm chắc kiến thức.</p>
          </div>
          <Link to={`${basePath}/learn`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline">
            Vào học ngay <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600 dark:text-slate-300">Tổng tiến độ hoàn thành</span>
            <span className="text-blue-600 dark:text-sky-400 font-black">{percent}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Đã hoàn thành {completedLessons} trên tổng số {totalLessons} bài học.
          </p>
        </div>

        {sections.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Các chương chính:</p>
            <div className="space-y-1.5">
              {sections.slice(0, 3).map((section, idx) => (
                <Link
                  key={section.id}
                  to={`${basePath}/learn`}
                  className="group flex items-center justify-between rounded-lg px-3 py-2 text-xs transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="truncate font-semibold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-sky-400">
                    {idx + 1}. {section.title}
                  </span>
                  <span className="shrink-0 text-slate-400 dark:text-slate-500 ml-2">
                    {section.lesson_count || 0} bài
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
        <Link
          to={`${basePath}/learn`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
        >
          <PlayCircle className="h-4 w-4 text-blue-600 dark:text-sky-400" /> Tiếp tục bài học đang dở
        </Link>
      </div>
    </section>
  );
}
