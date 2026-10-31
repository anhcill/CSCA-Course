import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  Copy,
  Lightbulb,
  Sparkles,
  Star,
  Tag,
  X,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import toast from "react-hot-toast";
import RichMathText from "../../../components/common/RichMathText";
import { normalizeLatexMath } from "../../quizzes/math/normalizeMath";

function renderSymbolKatex(symbol) {
  if (!symbol) return "";
  try {
    return katex.renderToString(normalizeLatexMath(String(symbol)), {
      displayMode: false,
      throwOnError: false,
      strict: "ignore",
    });
  } catch {
    return String(symbol);
  }
}

export default function FormulaDetailModal({
  formula,
  sessionInfo,
  isOpen,
  onClose,
  onToggleStar,
}) {
  const [copied, setCopied] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !formula) return null;

  let formulaHtml = "";
  try {
    formulaHtml = katex.renderToString(normalizeLatexMath(formula.latex || ""), {
      displayMode: true,
      throwOnError: false,
      strict: "ignore",
    });
  } catch {
    formulaHtml = `<span>${formula.latex}</span>`;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(formula.latex);
    setCopied(true);
    toast.success("Đã sao chép biểu thức LaTeX!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Render via createPortal onto document.body to cover the entire screen 100% (header + sidebar included)
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-5 sm:p-6 shadow-[0_25px_70px_rgba(16,47,99,0.20)] dark:shadow-2xl flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60">
                {sessionInfo?.subjectLabel || "Toán học CSCA"}
              </span>
              {sessionInfo?.classTitle && (
                <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60">
                  {sessionInfo.classTitle}
                </span>
              )}
              {sessionInfo?.sessionTitle && (
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[220px]">
                  {sessionInfo.sessionTitle}
                </span>
              )}
            </div>

            <h3 className="text-lg sm:text-xl font-extrabold text-[#102f63] dark:text-white leading-snug">
              {formula.nameVi}
            </h3>
            {formula.nameZh && (
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                {formula.nameZh}{" "}
                {formula.pinyin && (
                  <span className="font-mono text-slate-400 dark:text-slate-500 font-normal">
                    ({formula.pinyin})
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleStar && (
              <button
                type="button"
                onClick={() => onToggleStar(formula)}
                className={`p-2 rounded-xl border transition ${
                  formula.isStarred
                    ? "border-amber-300 bg-amber-50 text-amber-500 shadow-2xs"
                    : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
                title={formula.isStarred ? "Bỏ lưu" : "Lưu vào công thức trọng tâm"}
              >
                <Star className={`h-4 w-4 ${formula.isStarred ? "fill-current" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto space-y-3.5 py-3.5 pr-1 [scrollbar-width:thin]">
          {/* Beautiful Bright KaTeX Box */}
          <div
            className="relative rounded-2xl border border-blue-200/80 dark:border-slate-700/60 bg-[#f0f7ff] dark:bg-slate-950/80 p-5 text-center shadow-xs"
          >
            <div
              className="text-lg sm:text-2xl font-serif text-[#102f63] dark:text-sky-300 select-all overflow-x-auto py-2 font-semibold"
              dangerouslySetInnerHTML={{ __html: formulaHtml }}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-lg border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-sky-300 shadow-2xs hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white transition"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Đã chép" : "Copy LaTeX"}</span>
            </button>
          </div>

          {/* Description (Ý nghĩa công thức) */}
          {formula.description && (
            <div
              className="rounded-2xl border border-blue-100 dark:border-slate-800 bg-[#f8fbff] dark:bg-slate-805/50 dark:bg-slate-800/50 p-3.5 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5"
            >
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#102f63] dark:text-blue-300">Ý nghĩa: </span>
                <RichMathText as="span" className="leading-relaxed text-slate-700 dark:text-slate-300" text={formula.description} />
              </div>
            </div>
          )}

          {/* Conditions / Scope (Điều kiện áp dụng) */}
          {formula.conditions && (
            <div
              className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-[#fffbeb] dark:bg-amber-950/30 p-3.5 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5"
            >
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-900 dark:text-amber-300">Điều kiện áp dụng: </span>
                <RichMathText as="span" className="text-xs text-amber-950 dark:text-amber-200" text={formula.conditions} />
              </div>
            </div>
          )}

          {/* Variables breakdown table */}
          {formula.variables && formula.variables.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Giải thích các đại lượng &amp; biến số
              </h4>
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 text-xs shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr
                      className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                    >
                      <th className="py-2.5 px-3.5 w-32">Ký hiệu</th>
                      <th className="py-2.5 px-3.5">Tên gọi &amp; Ý nghĩa vật lý / toán học</th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/60"
                  >
                    {formula.variables.map((v, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/50 transition">
                        <td className="py-2 px-3.5 font-serif font-bold text-blue-600 dark:text-sky-300">
                          <span
                            className="inline-block bg-blue-50/70 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 px-1.5 py-0.5 rounded font-serif font-bold"
                            dangerouslySetInnerHTML={{ __html: renderSymbolKatex(v.symbol) }}
                          />
                        </td>
                        <td className="py-2 px-3.5 text-slate-700 dark:text-slate-300">
                          <RichMathText as="span" text={v.meaning} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Example problem & solution */}
          {formula.exampleProblem && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Bài tập ví dụ minh họa
              </h4>
              <div
                className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-[#f0fdf4] dark:bg-emerald-950/20 p-3.5 text-xs space-y-2 shadow-2xs"
              >
                <div className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                  <span className="font-bold text-emerald-800 dark:text-emerald-400">Đề bài: </span>
                  <RichMathText as="span" text={formula.exampleProblem} />
                </div>
                {formula.exampleSolution && (
                  <div className="border-t border-emerald-200/70 dark:border-emerald-900/50 pt-2 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    <span className="font-bold text-emerald-800 dark:text-emerald-400 font-sans">Lời giải: </span>
                    <RichMathText as="span" text={formula.exampleSolution} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#102f63] dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 px-6 py-2 text-xs font-bold text-white shadow-xs transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
