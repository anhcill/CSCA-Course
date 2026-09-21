import { useOutletContext } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Trophy } from "lucide-react";

const formatDate = (value) => value ? new Date(value).toLocaleDateString("vi-VN") : "—";

export default function CourseResultsPage() {
  const { progress = {}, assignments = [] } = useOutletContext();
  const graded = assignments.filter((item) => item.score !== null && item.score !== undefined);
  const averageScore = graded.length ? (graded.reduce((sum, item) => sum + Number(item.score || 0), 0) / graded.length).toFixed(1) : null;

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 sm:grid-cols-3">{[["Hoàn thành bài học", `${progress.percent || 0}%`, CheckCircle2, "bg-emerald-50 text-emerald-600"], ["Bài đã chấm", graded.length, ClipboardCheck, "bg-blue-50 text-blue-600"], ["Điểm trung bình", averageScore ?? "—", Trophy, "bg-violet-50 text-violet-600"]].map(([label, value, Icon, tone]) => <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span><p className="mt-4 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-bold text-slate-500">{label}</p></div>)}</section>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div><h2 className="text-lg font-black text-slate-950">Điểm và nhận xét</h2><p className="mt-1 text-xs text-slate-500">Chỉ hiển thị kết quả thuộc lớp học hiện tại.</p></div>{graded.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center"><ClipboardCheck className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-700">Chưa có bài được chấm</p><p className="mt-1 text-xs text-slate-500">Điểm và nhận xét sẽ xuất hiện sau khi giáo viên hoàn tất chấm bài.</p></div> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Bài tập</th><th className="px-3 py-3">Điểm</th><th className="px-3 py-3">Nhận xét</th><th className="px-3 py-3">Ngày chấm</th></tr></thead><tbody>{graded.map((item) => <tr key={`${item.type}-${item.id}`} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4 font-bold text-slate-900">{item.title}</td><td className="px-3 py-4 font-black text-emerald-600">{item.score}/{item.max_score || 10}</td><td className="max-w-md px-3 py-4 text-slate-600">{item.feedback_text || "Giáo viên chưa để lại nhận xét."}</td><td className="px-3 py-4 text-slate-500">{formatDate(item.graded_at)}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
