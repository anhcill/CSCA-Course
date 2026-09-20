import { useOutletContext } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Trophy } from "lucide-react";
import { EmptyState } from "../../../components/common/StateView";

const formatDate = (value) => value ? new Date(value).toLocaleDateString("vi-VN") : "—";

export default function CourseResultsPage() {
  const { progress, assignments } = useOutletContext();
  const graded = assignments.filter((item) => item.score !== null && item.score !== undefined);
  const totalScore = graded.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const averageScore = graded.length ? (totalScore / graded.length).toFixed(1) : null;

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-5"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="mt-4 text-2xl font-black text-white">{progress.percent}%</p><p className="text-xs text-slate-400">Hoàn thành bài học</p></div>
        <div className="rounded-2xl border border-amber-400/15 bg-amber-500/5 p-5"><ClipboardCheck className="h-5 w-5 text-amber-300" /><p className="mt-4 text-2xl font-black text-white">{graded.length}</p><p className="text-xs text-slate-400">Bài đã được chấm</p></div>
        <div className="rounded-2xl border border-violet-400/15 bg-violet-500/5 p-5"><Trophy className="h-5 w-5 text-violet-300" /><p className="mt-4 text-2xl font-black text-white">{averageScore ?? "—"}</p><p className="text-xs text-slate-400">Điểm trung bình</p></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
        <div><h2 className="text-lg font-black text-white">Điểm và nhận xét</h2><p className="mt-1 text-xs text-slate-400">Chỉ hiển thị kết quả thuộc khóa học hiện tại.</p></div>
        {graded.length === 0 ? <div className="mt-5"><EmptyState icon={ClipboardCheck} title="Chưa có bài được chấm" description="Sau khi giáo viên chấm bài nộp, điểm và nhận xét sẽ xuất hiện ở đây." /></div> : (
          <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Bài tập</th><th className="px-3 py-3">Điểm</th><th className="px-3 py-3">Nhận xét</th><th className="px-3 py-3">Ngày chấm</th></tr></thead><tbody>{graded.map((item) => <tr key={`${item.type}-${item.id}`} className="border-b border-white/5"><td className="px-3 py-4 font-bold text-white">{item.title}</td><td className="px-3 py-4 font-black text-emerald-300">{item.score}/{item.max_score}</td><td className="max-w-md px-3 py-4 text-slate-300">{item.feedback_text || "Giáo viên chưa để lại nhận xét."}</td><td className="px-3 py-4 text-slate-500">{formatDate(item.graded_at)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
