/* eslint-disable react/prop-types */
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, FileQuestion } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Chưa có thời hạn";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function ClassPendingTasksCard({ pendingTasks = [], basePath }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Việc cần hoàn thành</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Quiz theo buổi học gần nhất, bài tập theo hạn nộp của lớp.</p>
          </div>
          <Link to={`${basePath}/assignments`} className="text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline">
            Xem tất cả
          </Link>
        </div>

        {pendingTasks.length === 0 ? (
          <div className="my-8 rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">Tất cả bài tập đã hoàn thành!</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bạn không có bài tập hoặc quiz nào còn tồn đọng.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {pendingTasks.map((item) => {
              const isQuiz = item.type === "quiz";
              const isLate = item.status === "late";
              const sessionText = item.session_start
                ? new Date(item.session_start).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : "Chưa xác định buổi học";
              const targetUrl = isQuiz
                ? `${basePath}/quizzes/${item.id}`
                : `${basePath}/assignments/${item.id}/submit`;

              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={targetUrl}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 transition hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isQuiz
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300"
                      }`}
                    >
                      {isQuiz ? <FileQuestion className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className={isQuiz ? "font-bold text-violet-700 dark:text-violet-300" : isLate ? "font-bold text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}>
                          {isQuiz ? `Buổi học: ${sessionText}` : `${isLate ? "Quá hạn: " : "Hạn nộp: "}${formatDateTime(item.due_date)}`}
                        </span>
                        {item.max_score && (
                          <span className="text-slate-400 dark:text-slate-500">· {item.max_score} điểm</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-sky-400 group-hover:bg-blue-600 group-hover:text-white transition">
                    Làm bài <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Cần xem lại kết quả bài nộp?</span>
        <Link to={`${basePath}/results`} className="font-semibold text-blue-600 dark:text-sky-400 hover:underline">
          Xem bảng điểm cá nhân
        </Link>
      </div>
    </section>
  );
}
