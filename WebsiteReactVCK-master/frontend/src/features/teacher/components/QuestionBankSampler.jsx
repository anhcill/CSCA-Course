import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Compass, Sparkles, ArrowRight } from "lucide-react";
import { sampleQuestionBank } from "../../api/lmsClient";

export default function QuestionBankSampler({ courseId, onAdd }) {
  const [blueprint, setBlueprint] = useState({ easy: 0, medium: 0, hard: 0 });
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);

  const sample = async () => {
    const totalSelected = (blueprint.easy || 0) + (blueprint.medium || 0) + (blueprint.hard || 0);
    if (totalSelected === 0) {
      return toast.error("Vui lòng nhập số lượng câu hỏi cần rút (tối thiểu 1 câu).");
    }

    setBusy(true);
    try {
      const r = await sampleQuestionBank({
        courseId: Number(courseId),
        blueprint,
        tag: tag.trim(),
      });
      if (onAdd && Array.isArray(r.data)) {
        onAdd(r.data);
      }
      toast.success(`Đã rút thành công ${r.data?.length || 0} câu hỏi ngẫu nhiên theo ma trận.`);
    } catch (e) {
      toast.error(e.message || "Không thể rút câu hỏi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>Thiết lập ma trận số lượng câu hỏi ngẫu nhiên cần rút:</span>
        </p>
        <Link
          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition"
          to="/lms/teach/question-bank"
        >
          <span>Quản lý kho câu hỏi</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { key: "easy", label: "Dễ (Nhận biết)", badge: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
          { key: "medium", label: "Vừa (Vận dụng)", badge: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
          { key: "hard", label: "Khó (Vận dụng cao)", badge: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800" },
        ].map(({ key, label, badge }) => (
          <div key={key} className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/70 p-2.5 space-y-1">
            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge}`}>
              {label}
            </span>
            <input
              type="number"
              min="0"
              max="100"
              value={blueprint[key]}
              onChange={(e) =>
                setBlueprint({ ...blueprint, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) })
              }
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-center text-xs font-mono font-bold text-slate-800 dark:text-white outline-none focus:border-blue-500"
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
          Lọc theo thẻ chủ đề (tùy chọn):
        </label>
        <input
          aria-label="Chủ đề rút câu"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Ví dụ: Hàm số, BĐT, Hình học (bỏ trống để rút tất cả)..."
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-blue-500"
        />
      </div>

      <button
        type="button"
        disabled={!courseId || busy}
        onClick={sample}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#102f63] dark:bg-blue-600 hover:bg-blue-700 py-2.5 text-xs font-bold text-white shadow-xs disabled:opacity-50 transition"
      >
        <Compass className="h-4 w-4" />
        <span>{busy ? "Đang rút câu hỏi..." : "Rút câu hỏi tự động theo cấu trúc"}</span>
      </button>
    </div>
  );
}
