import { useState } from 'react';
import { Binary, Plus, Trash2 } from 'lucide-react';
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

  const handleSave = (e) => {
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

    if (onAddFormula) {
      onAddFormula({
        id: `fm-${Date.now()}`,
        nameVi: newFormula.nameVi,
        nameZh: newFormula.nameZh,
        pinyin: newFormula.pinyin,
        latex: newFormula.latex,
        description: newFormula.description,
        conditions: newFormula.conditions,
        exampleProblem: newFormula.exampleProblem,
        exampleSolution: newFormula.exampleSolution,
        variables,
        isStarred: false,
      });
      toast.success('Đã thêm công thức mới vào buổi dạy!');
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
    previewHtml = '<span class="text-rose-500">Mã LaTeX chưa hợp lệ</span>';
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <Binary className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {session?.title ? `Quản lý Công thức: ${session.title}` : 'Quản lý Công thức của Buổi dạy'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tổng cộng <span className="font-bold text-blue-600 dark:text-sky-400">{formulas.length} công thức</span>. Học viên sẽ tra cứu các công thức này trong không gian buổi học và sổ tay ôn tập.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm công thức mới</span>
        </button>
      </div>

      {/* Formulas List */}
      {formulas.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white/40 dark:bg-slate-900/40">
          <Binary className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Chưa có công thức nào cho buổi học này
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Bấm nút &quot;Thêm công thức mới&quot; để bổ sung các định lý, công thức toán/khoa học trọng tâm.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
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
                className="overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
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

                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 p-4 text-center overflow-x-auto">
                  <div
                    className="text-lg font-serif select-all"
                    dangerouslySetInnerHTML={{ __html: formulaHtml }}
                  />
                </div>

                {formula.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {formula.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Formula Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Thêm Công thức Trọng tâm
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* LaTeX Expression & Math Toolbar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mã biểu thức LaTeX *
                </label>
                {/* Math presets bar */}
                <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px]">
                  {PRESET_SYMBOLS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleInsertSymbol(s.code)}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-200 font-mono transition"
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
                  className="w-full p-3 font-mono text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              {/* Live Preview Box */}
              <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/30 dark:bg-slate-850 p-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400 block mb-2">
                  Xem trước KaTeX hiển thị (Live Preview)
                </span>
                <div
                  className="overflow-x-auto py-2 text-lg sm:text-xl font-serif"
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
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              {/* Example problem & solution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Đề bài ví dụ minh họa
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Cho nón cụt có R=4, r=2, h=6..."
                    value={newFormula.exampleProblem}
                    onChange={(e) => setNewFormula({ ...newFormula, exampleProblem: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hướng dẫn giải (LaTeX)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: V = 56\pi"
                    value={newFormula.exampleSolution}
                    onChange={(e) => setNewFormula({ ...newFormula, exampleSolution: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-md shadow-blue-600/30"
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
