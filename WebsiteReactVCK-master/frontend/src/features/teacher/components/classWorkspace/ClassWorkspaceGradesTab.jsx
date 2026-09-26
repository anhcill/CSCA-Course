import { Award, CheckCircle2, ClipboardCheck } from "lucide-react";

export default function ClassWorkspaceGradesTab({
  assignments = [],
  classId,
  onOpenGradingModal
}) {
  const gradedCount = assignments.filter((a) => (a.avgScore || a.avg_score) !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Bảng điểm & Kết quả học tập</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Xem điểm trung bình và thực hiện chấm bài cho học viên.</p>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <Award className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Chưa có dữ liệu bảng điểm</p>
          <p className="mt-1 text-xs text-slate-500">Bảng điểm sẽ tổng hợp sau khi học viên nộp và giáo viên chấm bài.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">
              <tr>
                <th className="py-3 px-4">Bài tập / Nhiệm vụ</th>
                <th className="py-3 px-4 text-center">Tỷ lệ nộp</th>
                <th className="py-3 px-4 text-center">Cần chấm</th>
                <th className="py-3 px-4 text-center">Điểm trung bình</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
              {assignments.map((asm) => (
                <tr key={asm.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                    {asm.title}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {asm.submittedCount ?? asm.submitted_count ?? 0}/{asm.totalCount ?? asm.total_count ?? 0}
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold">
                    {Number(asm.pendingGradingCount || asm.pending_grading_count || 0) > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {asm.pendingGradingCount || asm.pending_grading_count} bài
                      </span>
                    ) : (
                      <span className="text-slate-400">Đã chấm xong</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center font-black text-blue-600 dark:text-sky-400">
                    {asm.avgScore ?? asm.avg_score ?? "—"}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenGradingModal(asm)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    >
                      Mở chấm bài
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
