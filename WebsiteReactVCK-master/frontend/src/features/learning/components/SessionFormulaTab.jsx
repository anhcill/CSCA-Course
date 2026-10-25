import { useMemo, useState } from 'react';
import {
  Binary, Check, ChevronDown, Copy,
  HelpCircle, Info, Lightbulb, Star
} from 'lucide-react';
import toast from 'react-hot-toast';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function SessionFormulaTab({
  session,
  formulas = [],
  onToggleStar,
}) {
  const [expandedSolutions, setExpandedSolutions] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const formulaGroups = useMemo(() => {
    const groups = new Map();
    formulas.forEach((formula) => {
      const chapterName = formula.chapterName?.trim() || 'Nội dung chung';
      if (!groups.has(chapterName)) groups.set(chapterName, []);
      groups.get(chapterName).push(formula);
    });
    return [...groups.entries()];
  }, [formulas]);

  const toggleSolution = (id) => {
    setExpandedSolutions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyLatex = (formula) => {
    navigator.clipboard.writeText(formula.latex);
    setCopiedId(formula.id);
    toast.success('Đã sao chép mã LaTeX vào bộ nhớ tạm!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!formulas || formulas.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center bg-white/60 dark:bg-slate-900/60">
        <Binary className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          Chưa có công thức cho buổi học này
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Giáo viên sẽ cập nhật các công thức toán học và khoa học trọng tâm của buổi học tại đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-blue-200/90 dark:border-blue-900/40 bg-gradient-to-r from-blue-50/90 via-sky-50/40 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <Binary className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {session?.title ? `Công thức trọng tâm: ${session.title}` : 'Công thức trọng tâm của buổi học'}
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Tổng hợp <span className="font-bold text-blue-600 dark:text-sky-400">{formulas.length} công thức</span> cốt lõi trong đề thi CSCA. Nhấp biểu tượng sao để lưu vào Sổ tay ôn thi nhanh.
          </p>
        </div>
      </div>

      {/* Formulas grouped by lesson topic */}
      {formulaGroups.map(([chapterName, chapterFormulas]) => (
        <section key={chapterName} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-800 dark:text-slate-100">
              {chapterName}
            </h3>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
              {chapterFormulas.length} công thức
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-blue-200 to-transparent dark:from-blue-900" />
          </div>
          <div className="space-y-5">
        {chapterFormulas.map((formula) => {
          let formulaHtml = '';
          try {
            formulaHtml = katex.renderToString(formula.latex, {
              displayMode: true,
              throwOnError: false,
            });
          } catch {
            formulaHtml = `<span>${formula.latex}</span>`;
          }

          const isSolutionOpen = Boolean(expandedSolutions[formula.id]);
          const isCopied = copiedId === formula.id;

          return (
            <div
              key={formula.id}
              className="overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition hover:shadow-md"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 px-5 py-4 bg-slate-50/50 dark:bg-slate-850/50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-blue-100 dark:bg-blue-950/70 px-2.5 py-0.5 text-[10px] font-black text-blue-700 dark:text-sky-300">
                      Công thức #{formula.id}
                    </span>
                    {formula.nameZh && (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {formula.nameZh} {formula.pinyin && `(${formula.pinyin})`}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {formula.nameVi}
                  </h3>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleCopyLatex(formula)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                    title="Sao chép mã LaTeX"
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{isCopied ? 'Đã chép' : 'Copy LaTeX'}</span>
                  </button>

                  {onToggleStar && (
                    <button
                      type="button"
                      onClick={() => onToggleStar(formula.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                        formula.isStarred
                          ? 'border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-700/60 dark:bg-amber-950/40'
                          : 'border-slate-200 bg-white text-slate-400 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-800'
                      }`}
                      title={formula.isStarred ? 'Bỏ lưu sổ tay' : 'Lưu vào sổ tay cá nhân'}
                    >
                      <Star className={`h-4 w-4 ${formula.isStarred ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </div>
              </div>

              {/* Main KaTeX Display Box */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="overflow-x-auto rounded-2xl border border-blue-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/40 via-white to-blue-50/40 dark:from-slate-800/40 dark:via-slate-850 dark:to-slate-800/40 py-5 px-6 text-center shadow-inner">
                  <div
                    className="katex-formula-render text-lg sm:text-2xl font-serif text-slate-950 dark:text-white select-all"
                    dangerouslySetInnerHTML={{ __html: formulaHtml }}
                  />
                </div>

                {formula.description && (
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {formula.description}
                  </p>
                )}

                {/* Variables explanation table */}
                {formula.variables && formula.variables.length > 0 && (
                  <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" /> Giải thích các đại lượng & biến số
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                      {formula.variables.map((v, i) => (
                        <div key={i} className="flex items-start gap-2 bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                          <span className="font-mono font-bold text-blue-600 dark:text-sky-400 shrink-0">
                            {v.symbol}:
                          </span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {v.meaning}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Condition note */}
                {formula.conditions && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl p-3">
                    <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <div>
                      <span className="font-bold">Điều kiện & Lưu ý: </span>
                      <span>{formula.conditions}</span>
                    </div>
                  </div>
                )}

                {/* Example Problem Accordion */}
                {formula.exampleProblem && (
                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSolution(formula.id)}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
                    >
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Ví dụ bài toán áp dụng trong đề CSCA
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isSolutionOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <div className="p-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {formula.exampleProblem}
                      </p>

                      {isSolutionOpen && formula.exampleSolution && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
                          <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                            Hướng dẫn giải nhanh:
                          </p>
                          <div
                            className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 p-3 rounded-xl font-mono text-emerald-900 dark:text-emerald-200"
                            dangerouslySetInnerHTML={{
                              __html: katex.renderToString(formula.exampleSolution, {
                                displayMode: false,
                                throwOnError: false,
                              }),
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </div>
        </section>
      ))}
    </div>
  );
}
