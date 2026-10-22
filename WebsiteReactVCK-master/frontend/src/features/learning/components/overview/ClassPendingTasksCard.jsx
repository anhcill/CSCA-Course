import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, FileQuestion } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Chưa có thời hạn";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ClassPendingTasksCard({ pendingTasks = [], basePath }) {
  return (
    <section className="flex flex-col justify-between rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h3 className="text-base sm:text-lg font-black text-[#102f63]">Việc cần hoàn thành</h3>
            <p className="mt-0.5 text-xs text-[#487291]">Quiz và bài tập cần làm theo hạn nộp của lớp.</p>
          </div>
          <Link
            to={`${basePath}/assignments`}
            className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100 transition"
          >
            Xem tất cả
          </Link>
        </div>

        {pendingTasks.length === 0 ? (
          <div className="my-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-bold text-[#102f63]">Tất cả bài tập đã hoàn thành!</p>
            <p className="mt-1 text-xs text-[#487291]">Bạn không có bài tập hoặc quiz nào còn tồn đọng.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {pendingTasks.map((item) => {
              const isQuiz = item.type === "quiz";
              const isLate = item.status === "late";
              const sessionText = item.session_start
                ? new Date(item.session_start).toLocaleString("vi-VN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Chưa xác định buổi học";
              const sessionId = item.class_session_id || item.classSessionId || item.session_id || item.sessionId;
              const targetUrl = sessionId
                ? `${basePath}/sessions/${sessionId}?tab=tasks`
                : isQuiz
                ? `${basePath}/quizzes/${item.id}`
                : `${basePath}/assignments/${item.id}/submit`;

              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={targetUrl}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-white/90 bg-white/70 p-3.5 shadow-2xs backdrop-blur-sm transition hover:border-sky-300 hover:bg-sky-50/60"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                        isQuiz
                          ? "bg-purple-100 text-purple-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {isQuiz ? <FileQuestion className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs sm:text-sm font-bold text-[#102f63] group-hover:text-sky-700">
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={
                            isQuiz
                              ? "font-bold text-violet-700"
                              : isLate
                              ? "font-bold text-rose-600"
                              : "text-[#487291]"
                          }
                        >
                          {isQuiz
                            ? `Buổi: ${sessionText}`
                            : `${isLate ? "Quá hạn: " : "Hạn nộp: "}${formatDateTime(item.due_date)}`}
                        </span>
                        {item.max_score && (
                          <span className="text-slate-400 font-medium">· {item.max_score} điểm</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 transition group-hover:bg-sky-600 group-hover:text-white">
                    {sessionId ? "Mở buổi" : "Làm bài"} <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-[#487291]">
        <span>Cần xem lại kết quả bài nộp?</span>
        <Link to={`${basePath}/results`} className="font-bold text-sky-700 hover:text-sky-900 hover:underline">
          Xem bảng điểm cá nhân →
        </Link>
      </div>
    </section>
  );
}
