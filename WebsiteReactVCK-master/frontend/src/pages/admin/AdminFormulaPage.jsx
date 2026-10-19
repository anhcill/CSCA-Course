import { useMemo, useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  getStoredFormulaSessions, saveFormulaSessions
} from '../../features/learning/data/mockFormulaData';
import { deleteFormulaApi } from '../../features/api/lmsClient';

const PRESET_SYMBOLS = [
  { label: 'Phân số', code: '\\frac{a}{b}' },
  { label: 'Căn', code: '\\sqrt{x}' },
  { label: 'Mũ', code: 'x^2' },
  { label: 'Tổng ∑', code: '\\sum_{i=1}^{n}' },
  { label: 'Tích phân ∫', code: '\\int_{a}^{b}' },
  { label: 'Vector', code: '\\vec{F}' },
  { label: 'Pi π', code: '\\pi' },
  { label: 'Delta Δ', code: '\\Delta' },
  { label: '±', code: '\\pm' },
];

export default function AdminFormulaPage() {
  const [sessions, setSessions] = useState(() => getStoredFormulaSessions());
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFormula, setNewFormula] = useState({
    sessionId: sessions[0]?.sessionId || '',
    nameVi: '',
    nameZh: '',
    pinyin: '',
    latex: '',
    description: '',
    variablesStr: '',
    conditions: '',
  });

  // Flat list of all formulas across sessions
  const allFormulas = useMemo(() => {
    return sessions.flatMap((s) =>
      s.formulas.map((f) => ({
        ...f,
        sessionId: s.sessionId,
        chapter: s.chapter,
        sessionTitle: s.sessionTitle,
        subject: s.subject,
        subjectLabel: s.subjectLabel,
      }))
    );
  }, [sessions]);

  // Filtered formulas
  const filteredFormulas = useMemo(() => {
    return allFormulas.filter((f) => {
      if (selectedSubject !== 'ALL' && f.subject !== selectedSubject) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          f.nameVi.toLowerCase().includes(q) ||
          (f.nameZh && f.nameZh.toLowerCase().includes(q)) ||
          f.latex.toLowerCase().includes(q) ||
          f.chapter.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allFormulas, selectedSubject, searchQuery]);

  const handleDelete = async (formulaId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa công thức này khỏi hệ thống?')) return;
    const updated = sessions.map((s) => ({
      ...s,
      formulas: s.formulas.filter((f) => f.id !== formulaId),
    }));
    saveFormulaSessions(updated);
    setSessions(updated);
    toast.success('Đã xóa công thức thành công!');
    try {
      await deleteFormulaApi(formulaId);
    } catch {
      // LocalStorage fallback already updated
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!newFormula.nameVi.trim() || !newFormula.latex.trim()) {
      toast.error('Vui lòng nhập tên công thức và mã LaTeX!');
      return;
    }

    const targetSession = sessions.find((s) => s.sessionId === newFormula.sessionId) || sessions[0];
    if (!targetSession) return;

    const variables = newFormula.variablesStr
      ? newFormula.variablesStr.split(',').map((item) => {
          const [symbol, meaning] = item.split(':').map((s) => s.trim());
          return { symbol: symbol || '', meaning: meaning || '' };
        }).filter((v) => v.symbol)
      : [];

    const created = {
      id: `fm-adm-${Date.now()}`,
      nameVi: newFormula.nameVi,
      nameZh: newFormula.nameZh,
      pinyin: newFormula.pinyin,
      latex: newFormula.latex,
      description: newFormula.description,
      conditions: newFormula.conditions,
      variables,
      isStarred: false,
    };

    targetSession.formulas.unshift(created);
    saveFormulaSessions(sessions);
    setSessions([...sessions]);
    toast.success('Đã tạo mới công thức thành công!');
    setShowAddModal(false);
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
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
            Học liệu & Khung chương trình
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
            Quản Lý Thư Viện Công Thức
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Quản trị các công thức Toán, Lý, Hóa chuẩn hóa cho học viên và các lớp học CSCA.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm công thức chuẩn</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 sm:p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên công thức, mã LaTeX, chương học..."
            className="w-full h-10 pl-10 pr-4 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 text-xs font-semibold">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'MATH', label: 'Toán học' },
              { id: 'PHYSICS', label: 'Vật lý' },
              { id: 'CHEMISTRY', label: 'Hóa học' },
            ].map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubject(sub.id)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  selectedSubject === sub.id
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Formulas Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 font-black text-slate-700 dark:text-slate-200">
                <th className="py-3 px-4">Tên công thức</th>
                <th className="py-3 px-4">Môn học & Chương</th>
                <th className="py-3 px-4 text-center">Biểu thức KaTeX</th>
                <th className="py-3 px-4">Mã LaTeX gốc</th>
                <th className="py-3 px-4 text-center">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredFormulas.map((f) => {
                let html = '';
                try {
                  html = katex.renderToString(f.latex, { displayMode: false, throwOnError: false });
                } catch {
                  html = `<span>${f.latex}</span>`;
                }

                return (
                  <tr key={f.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white max-w-[200px]">
                      <span>{f.nameVi}</span>
                      {f.nameZh && <span className="block text-[11px] text-slate-400 font-normal">{f.nameZh}</span>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300 mb-1">
                        {f.subjectLabel}
                      </span>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{f.chapter}</p>
                    </td>
                    <td className="py-3.5 px-4 text-center font-serif">
                      <div
                        className="inline-block bg-blue-50/40 dark:bg-slate-800 px-3 py-1.5 rounded-lg select-all"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-[200px] truncate select-all">
                      {f.latex}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(f.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title="Xóa công thức"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Formula Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Thêm Công Thức Vào Thư Viện Chuẩn
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Gắn vào buổi học / chương
                </label>
                <select
                  value={newFormula.sessionId}
                  onChange={(e) => setNewFormula({ ...newFormula, sessionId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                >
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.subjectLabel} - {s.chapter} ({s.sessionTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tên công thức (Tiếng Việt) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Định lý Viète"
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
                    placeholder="VD: 韦达定理"
                    value={newFormula.nameZh}
                    onChange={(e) => setNewFormula({ ...newFormula, nameZh: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mã biểu thức LaTeX *
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px]">
                  {PRESET_SYMBOLS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewFormula((p) => ({ ...p, latex: p.latex + ' ' + s.code }))}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-blue-50 text-slate-700 dark:text-slate-200 font-mono transition"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  required
                  placeholder="VD: x_1 + x_2 = -\\frac{b}{a}"
                  value={newFormula.latex}
                  onChange={(e) => setNewFormula({ ...newFormula, latex: e.target.value })}
                  className="w-full p-3 font-mono text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/30 dark:bg-slate-850 p-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400 block mb-2">
                  Xem trước KaTeX hiển thị
                </span>
                <div
                  className="overflow-x-auto py-2 text-lg sm:text-xl font-serif"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Giải thích biến số (VD: a: Hệ số bậc hai, b: Hệ số bậc một)
                </label>
                <input
                  type="text"
                  placeholder="VD: a: Hệ số bậc hai, b: Hệ số bậc một"
                  value={newFormula.variablesStr}
                  onChange={(e) => setNewFormula({ ...newFormula, variablesStr: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
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
