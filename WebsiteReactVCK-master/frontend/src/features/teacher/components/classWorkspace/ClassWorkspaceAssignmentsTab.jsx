import { BookOpen, Calendar, CheckCircle2, Clock, Plus } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Không giới hạn";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function ClassWorkspaceAssignmentsTab({
  assignments = [],
  classId,
  onOpenCreateAssignment,
  onOpenGradingModal
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Bài tập & Quiz của lớp</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Quản lý nhiệm vụ, bài tập và theo dõi bài nộp của học viên.</p>
        </div>
        <button
          type="button"
          onClick={onOpenCreateAssignment}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" /> Giao bài tập mới
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <BookOpen className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Lớp chưa có bài tập nào</p>
          <p className="mt-1 text-xs text-slate-500">Giao bài tập để đánh giá mức độ tiếp thu bài học của học viên.</p>
          <button
            type="button"
            onClick={onOpenCreateAssignment}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Tạo bài tập ngay
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((asm) => (
            <div
              key={asm.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 dark:bg-blue-950 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-sky-300">
                    {asm.type === "quiz" ? "Quiz" : "Bài tập tự luận"}
                  </span>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {asm.title}
                  </h4>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-amber-500" /> Hạn nộp: {formatDateTime(asm.due_date || asm.dueDate)}
                  </span>
                  <span>Đã nộp: <strong className="text-slate-700 dark:text-slate-200">{asm.submittedCount ?? asm.submitted_count ?? 0}/{asm.totalCount ?? asm.total_count ?? 0}</strong></span>
                  {Number(asm.pendingGradingCount || asm.pending_grading_count || 0) > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      Cần chấm: {asm.pendingGradingCount || asm.pending_grading_count}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenGradingModal(asm)}
                  className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                >
                  Chấm bài
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
