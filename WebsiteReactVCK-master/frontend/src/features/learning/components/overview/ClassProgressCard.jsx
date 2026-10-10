/* eslint-disable react/prop-types */
import { BookOpen } from "lucide-react";

export default function ClassProgressCard({
  percent = 0,
  completedLessons = 0,
  totalLessons = 0,
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Tiến độ học tập</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Hoàn thành các bài giảng để nắm chắc kiến thức.</p>
          </div>
          <BookOpen className="h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400" aria-hidden="true" />
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

      </div>

      <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">Chọn chương ở trên, rồi mở buổi học để xem tài liệu và hoạt động.</p>
      </div>
    </section>
  );
}
