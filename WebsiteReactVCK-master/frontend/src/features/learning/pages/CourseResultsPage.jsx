import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, Sparkles, Trophy } from "lucide-react";
import { fetchMyFinalGrade } from "../../api/lmsClient";

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("vi-VN") : "—");

export default function CourseResultsPage() {
  const { classId } = useParams();
  const [finalGrade, setFinalGrade] = useState(null);
  const [finalError, setFinalError] = useState("");

  useEffect(() => {
    let active = true;
    setFinalGrade(null);
    setFinalError("");
    fetchMyFinalGrade(classId)
      .then((r) => {
        if (active) setFinalGrade(r?.data);
      })
      .catch((e) => {
        if (active) setFinalError(e.message);
      });
    return () => {
      active = false;
    };
  }, [classId]);

  const { progress = {}, allAssignments, assignments = [] } = useOutletContext() || {};
  const graded = (allAssignments || assignments || []).filter((item) => item.score !== null && item.score !== undefined);
  const averageScore = graded.length
    ? (graded.reduce((sum, item) => sum + Number(item.score || 0), 0) / graded.length).toFixed(1)
    : null;

  return (
    <div className="space-y-5 pb-10">
      {finalError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-bold text-rose-700">
          {finalError}
        </div>
      )}

      {finalGrade && (
        <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Trophy className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-emerald-950">Điểm tổng kết đã chốt</h2>
          </div>
          <p className="mt-3 text-3xl sm:text-4xl font-black text-emerald-700">{finalGrade.total ?? "—"}/100</p>
          <p className="mt-1 text-xs text-emerald-900 font-semibold">
            {finalGrade.passed === null
              ? "Chưa xác định"
              : finalGrade.passed
              ? "✓ Đạt yêu cầu khóa học"
              : "Chưa đạt yêu cầu"}{" "}
            · Chốt lúc {new Date(finalGrade.finalizedAt).toLocaleString("vi-VN")}
          </p>
          {finalGrade.policy?.weights && (
            <p className="mt-2 text-[11px] text-emerald-800">
              Trọng số: bài tập {finalGrade.policy.weights.assignment}%, quiz{" "}
              {finalGrade.policy.weights.quiz}%, chuyên cần {finalGrade.policy.weights.attendance}%.
            </p>
          )}
        </section>
      )}

      {/* 3 Metric Cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Hoàn thành bài học", `${progress.percent || 0}%`, CheckCircle2, "bg-emerald-50 text-emerald-600"],
          ["Bài đã chấm điểm", `${graded.length} bài`, ClipboardCheck, "bg-sky-50 text-sky-600"],
          ["Điểm trung bình", averageScore ? `${averageScore}/10` : "—", Trophy, "bg-amber-50 text-amber-600"],
        ].map(([label, value, Icon, tone]) => (
          <div
            key={label}
            className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <Sparkles className="h-4 w-4 text-slate-300" />
            </div>
            <p className="mt-4 text-2xl sm:text-3xl font-black text-[#102f63]">{value}</p>
            <p className="mt-1 text-xs font-bold text-[#487291]">{label}</p>
          </div>
        ))}
      </section>

      {/* Bảng điểm chi tiết các bài */}
      <section className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-[#102f63]">Chi tiết điểm số & Nhận xét của giảng viên</h2>
          <p className="mt-0.5 text-xs text-[#487291]">
            Tổng hợp kết quả các bài kiểm tra và bài tập về nhà đã được giáo viên chấm.
          </p>
        </div>

        {graded.length === 0 ? (
          <div className="my-8 rounded-2xl border border-dashed border-slate-200 bg-white/50 px-5 py-10 text-center">
            <ClipboardCheck className="mx-auto h-8 w-8 text-[#487291]" />
            <p className="mt-3 text-sm font-bold text-[#102f63]">Chưa có bài nào được chấm điểm</p>
            <p className="mt-1 text-xs text-[#487291]">
              Điểm số và nhận xét sẽ hiển thị tại đây ngay khi giáo viên hoàn tất chấm bài.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-[#487291]">
                <tr>
                  <th className="px-3 py-3">Bài tập / Bài thi</th>
                  <th className="px-3 py-3">Điểm số</th>
                  <th className="px-3 py-3">Nhận xét của giảng viên</th>
                  <th className="px-3 py-3">Ngày chấm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {graded.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className="hover:bg-sky-50/40 transition">
                    <td className="px-3 py-3.5 font-bold text-[#102f63]">{item.title}</td>
                    <td className="px-3 py-3.5 font-black text-sky-700">
                      {item.score}/{item.max_score || 10}
                    </td>
                    <td className="max-w-md px-3 py-3.5 text-xs text-[#244866]">
                      {item.feedback_text || "Giáo viên chưa để lại nhận xét thêm."}
                    </td>
                    <td className="px-3 py-3.5 text-xs text-[#487291]">{formatDate(item.graded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
