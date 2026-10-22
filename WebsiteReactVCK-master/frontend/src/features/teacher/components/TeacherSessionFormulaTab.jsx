import { useState } from 'react';
import {
  Binary,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const PRESET_SYMBOLS = [
  { label: 'Phân số', code: '\\frac{a}{b}' },
  { label: 'Căn', code: '\\sqrt{x}' },
  { label: 'Mũ', code: 'x^2' },
  { label: 'Chỉ số', code: 'x_0' },
  { label: 'Tổng ∑', code: '\\sum_{i=1}^{n}' },
  { label: 'Tích phân ∫', code: '\\int_{a}^{b}' },
  { label: 'Vector →', code: '\\vec{F}' },
  { label: 'Số Pi π', code: '\\pi' },
  { label: 'Delta Δ', code: '\\Delta' },
  { label: 'Cộng trừ ±', code: '\\pm' },
  { label: 'Ngoặc tròn ( )', code: '\\left( x \\right)' },
  { label: 'Nhân ·', code: '\\cdot' },
];

export default function TeacherSessionFormulaTab({
  session,
  formulas = [],
  onAddFormula,
  onDeleteFormula,
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFormula, setNewFormula] = useState({
    nameVi: '',
    nameZh: '',
    pinyin: '',
    latex: 'V = \\frac{1}{3} \\pi h (R^2 + Rr + r^2)',
    description: '',
    conditions: '',
    exampleProblem: '',
    exampleSolution: '',
    variablesStr: 'R: Bán kính lớn, r: Bán kính nhỏ, h: Chiều cao',
  });

  const handleInsertSymbol = (code) => {
    setNewFormula((prev) => ({
      ...prev,
      latex: prev.latex + ' ' + code,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!newFormula.nameVi.trim() || !newFormula.latex.trim()) {
      toast.error('Vui lòng nhập tên công thức và mã biểu thức LaTeX!');
      return;
    }

    // Parse variablesStr into array
    const variables = newFormula.variablesStr
      ? newFormula.variablesStr.split(',').map((item) => {
          const [symbol, meaning] = item.split(':').map((s) => s.trim());
          return { symbol: symbol || '', meaning: meaning || '' };
        }).filter((v) => v.symbol)
      : [];

    const payload = {
      ...newFormula,
      variables,
    };

    if (onAddFormula) {
      await onAddFormula(payload);
      toast.success('Đã thêm công thức mới vào buổi dạy thành công! 📐');
      setShowAddModal(false);
      setNewFormula({
        nameVi: '',
        nameZh: '',
        pinyin: '',
        latex: '',
        description: '',
        conditions: '',
        exampleProblem: '',
        exampleSolution: '',
        variablesStr: '',
      });
    }
  };

  // Preview KaTeX live
  let previewHtml = '';
  try {
    previewHtml = katex.renderToString(newFormula.latex || 'V = ...', {
      displayMode: true,
      throwOnError: false,
    });
  } catch {
    previewHtml = '<span class="text-rose-500 font-semibold">Mã LaTeX chưa hợp lệ</span>';
  }

  return (
    <div className="space-y-4">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300 shadow-2xs">
              <Binary className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#102f63] dark:text-white">
              {session?.title ? `Quản Lý Công Thức: ${session.title}` : 'Quản Lý Công Thức Buổi Dạy'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tổng cộng <span className="font-bold text-blue-600 dark:text-sky-400 font-mono">{formulas.length} công thức</span>. Học viên sẽ tra cứu các công thức này trong không gian buổi học và sổ tay ôn tập.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm công thức mới</span>
        </button>
      </div>

      {/* Formulas List */}
      {formulas.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/80 bg-white/80 p-12 text-center backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60">
          <Binary className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Chưa có công thức nào cho buổi học này
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Bấm nút &quot;Thêm công thức mới&quot; để bổ sung các định lý, công thức toán/khoa học trọng tâm.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {formulas.map((formula) => {
            let formulaHtml = '';
            try {
              formulaHtml = katex.renderToString(formula.latex, {
                displayMode: true,
                throwOnError: false,
              });
            } catch {
              formulaHtml = `<span>${formula.latex}</span>`;
            }

            return (
              <div
                key={formula.id}
                className="overflow-hidden rounded-3xl border border-white/85 bg-white/92 p-5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-xl transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/90 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-[#102f63] dark:text-white">
                      {formula.nameVi}
                    </h3>
                    {formula.nameZh && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formula.nameZh} {formula.pinyin && `(${formula.pinyin})`}
                      </p>
                    )}
                  </div>

                  {onDeleteFormula && (
                    <button
                      type="button"
                      onClick={() => onDeleteFormula(formula.id)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      title="Xóa công thức"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="rounded-2xl border border-sky-100 dark:border-slate-800 bg-white/90 dark:bg-slate-950/80 p-4 text-center overflow-x-auto shadow-inner">
                  <div
                    className="text-lg font-serif select-all text-slate-900 dark:text-white"
                    dangerouslySetInnerHTML={{ __html: formulaHtml }}
                  />
                </div>

                {formula.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {formula.description}
                  </p>
                )}

                {Array.isArray(formula.variables) && formula.variables.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    {formula.variables.map((v, idx) => (
                      <span
                        key={idx}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <strong className="font-mono text-blue-700 dark:text-sky-300">{v.symbol}</strong>: {v.meaning}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Formula Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-base font-black text-[#102f63] dark:text-white">
                  Thêm Công Thức Trọng Tâm
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tên công thức (Tiếng Việt) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Thể tích khối nón cụt"
                    value={newFormula.nameVi}
                    onChange={(e) => setNewFormula({ ...newFormula, nameVi: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tên tiếng Trung (Đề CSCA)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 圆台体积公式"
                    value={newFormula.nameZh}
                    onChange={(e) => setNewFormula({ ...newFormula, nameZh: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* LaTeX Expression & Math Toolbar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mã biểu thức LaTeX *
                </label>
                {/* Math presets bar */}
                <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 text-[11px]">
                  {PRESET_SYMBOLS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleInsertSymbol(s.code)}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-200 font-mono font-bold shadow-2xs transition"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  required
                  placeholder="VD: V = \frac{1}{3} \pi h (R^2 + Rr + r^2)"
                  value={newFormula.latex}
                  onChange={(e) => setNewFormula({ ...newFormula, latex: e.target.value })}
                  className="w-full p-3 font-mono text-xs sm:text-sm rounded-xl border border-slate-200/90 bg-white text-slate-900 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Live Preview Box */}
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3.5 text-center dark:border-blue-900/60 dark:bg-slate-850">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400 block mb-1">
                  Xem trước KaTeX hiển thị (Live Preview)
                </span>
                <div
                  className="overflow-x-auto py-1 text-lg font-serif select-all"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>

              {/* Variables breakdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Giải thích biến số (Định dạng: Ký hiệu: Ý nghĩa, cách nhau bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  placeholder="VD: R: Bán kính lớn, r: Bán kính nhỏ, h: Chiều cao"
                  value={newFormula.variablesStr}
                  onChange={(e) => setNewFormula({ ...newFormula, variablesStr: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Conditions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Điều kiện áp dụng & Lưu ý
                </label>
                <input
                  type="text"
                  placeholder="VD: R > r > 0, h > 0"
                  value={newFormula.conditions}
                  onChange={(e) => setNewFormula({ ...newFormula, conditions: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-md shadow-blue-500/25"
                >
                  Lưu công thức
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
