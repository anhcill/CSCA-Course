import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Search, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  batchImportFormulasApi,
  deleteFormulaApi,
  fetchAdminFormulas,
} from '../../features/api/lmsClient';
import { ErrorState, LoadingState } from '../../components/common/StateView';

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
  const [formulas, setFormulas] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newFormula, setNewFormula] = useState({
    subject: 'MATH',
    chapterName: 'Kho công thức chuẩn',
    nameVi: '',
    nameZh: '',
    pinyin: '',
    latex: '',
    description: '',
    variablesStr: '',
    conditions: '',
  });

  const loadFormulas = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchAdminFormulas({
        subject: selectedSubject,
        search: searchQuery,
        limit: 100,
      });
      if (!response?.success || !Array.isArray(response.data?.formulas)) {
        throw new Error(response?.message || 'Không thể tải kho công thức.');
      }
      setFormulas(response.data.formulas);
    } catch (loadError) {
      setFormulas([]);
      setError(loadError?.message || 'Không thể tải kho công thức.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedSubject]);

  useEffect(() => {
    const timer = window.setTimeout(loadFormulas, 250);
    return () => window.clearTimeout(timer);
  }, [loadFormulas]);

  // Filtered formulas
  const filteredFormulas = useMemo(() => {
    return formulas;
  }, [formulas]);

  const handleDelete = async (formulaId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa công thức này khỏi hệ thống?')) return;
    try {
      await deleteFormulaApi(formulaId);
      setFormulas((current) => current.filter((formula) => formula.id !== formulaId));
      toast.success('Đã xóa công thức thành công!');
    } catch (deleteError) {
      toast.error(deleteError?.message || 'Không thể xóa công thức.');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!newFormula.nameVi.trim() || !newFormula.latex.trim()) {
      toast.error('Vui lòng nhập tên công thức và mã LaTeX!');
      return;
    }

    const variables = newFormula.variablesStr
      ? newFormula.variablesStr.split(',').map((item) => {
          const [symbol, meaning] = item.split(':').map((s) => s.trim());
          return { symbol: symbol || '', meaning: meaning || '' };
        }).filter((v) => v.symbol)
      : [];

    setSaving(true);
    try {
      await batchImportFormulasApi([{
        subject: newFormula.subject,
        chapterName: newFormula.chapterName.trim(),
        nameVi: newFormula.nameVi.trim(),
        nameZh: newFormula.nameZh.trim(),
        pinyin: newFormula.pinyin.trim(),
        latex: newFormula.latex.trim(),
        description: newFormula.description.trim(),
        conditions: newFormula.conditions.trim(),
        variables,
      }]);
      toast.success('Đã tạo mới công thức thành công!');
      setShowAddModal(false);
      setNewFormula({
        subject: 'MATH', chapterName: 'Kho công thức chuẩn', nameVi: '', nameZh: '',
        pinyin: '', latex: '', description: '', variablesStr: '', conditions: '',
      });
      await loadFormulas();
    } catch (saveError) {
      toast.error(saveError?.message || 'Không thể lưu công thức.');
    } finally {
      setSaving(false);
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

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100';

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      {/* Compact Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Thư viện công thức
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Quản trị công thức Toán, Lý, Hóa chuẩn hóa cho học viên và các lớp học CSCA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadFormulas}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Thêm công thức</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên công thức, mã LaTeX, chương học..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-slate-800">
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
              className={`rounded-lg px-3 py-1.5 transition ${
                selectedSubject === sub.id
                  ? 'bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-sky-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState title="Không thể tải kho công thức" message={error} onRetry={loadFormulas} />}

      {/* Formulas Table */}
      <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2.5">Tên công thức</th>
                <th className="px-3 py-2.5">Môn học & Chương</th>
                <th className="px-3 py-2.5 text-center">Hiển thị công thức</th>
                <th className="px-3 py-2.5">Mã LaTeX</th>
                <th className="px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6">
                    <LoadingState message="Đang tải kho công thức..." />
                  </td>
                </tr>
              ) : filteredFormulas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                    Không có công thức phù hợp.
                  </td>
                </tr>
              ) : (
                filteredFormulas.map((f) => {
                  let html = '';
                  try {
                    html = katex.renderToString(f.latex, { displayMode: false, throwOnError: false });
                  } catch {
                    html = `<span>${f.latex}</span>`;
                  }

                  return (
                    <tr key={f.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-white max-w-[200px]">
                        <span>{f.nameVi}</span>
                        {f.nameZh && (
                          <span className="block text-[11px] font-normal text-slate-400">{f.nameZh}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 mb-1">
                          {f.subjectLabel || f.subject}
                        </span>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                          {f.chapterName || 'Kho công thức chuẩn'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center font-serif">
                        <div
                          className="inline-block rounded-xl bg-blue-50/50 px-3 py-1.5 select-all dark:bg-slate-800"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-[200px] truncate select-all">
                        {f.latex}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(f.id)}
                          className="rounded-xl p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition"
                          title="Xóa công thức"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Formula Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Thêm công thức mới
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Môn học *
                  </label>
                  <select
                    value={newFormula.subject}
                    onChange={(e) => setNewFormula({ ...newFormula, subject: e.target.value })}
                    className={inputClass}
                  >
                    <option value="MATH">Toán học</option>
                    <option value="PHYSICS">Vật lý</option>
                    <option value="CHEMISTRY">Hóa học</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Chương / nhóm công thức *
                  </label>
                  <input
                    required
                    maxLength={255}
                    value={newFormula.chapterName}
                    onChange={(e) => setNewFormula({ ...newFormula, chapterName: e.target.value })}
                    placeholder="VD: Phương trình bậc hai"
                    className={inputClass}
                  />
                </div>
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
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tên tiếng Trung (nếu có)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: 韦达定理"
                    value={newFormula.nameZh}
                    onChange={(e) => setNewFormula({ ...newFormula, nameZh: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mã biểu thức LaTeX *
                </label>
                <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1.5 text-[11px] dark:bg-slate-800">
                  {PRESET_SYMBOLS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewFormula((p) => ({ ...p, latex: p.latex + ' ' + s.code }))}
                      className="rounded-lg bg-white px-2 py-1 font-mono text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition"
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
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 text-center dark:border-blue-900/60 dark:bg-slate-800/70">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
                  Xem trước hiển thị
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
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{saving ? 'Đang lưu...' : 'Lưu công thức'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
