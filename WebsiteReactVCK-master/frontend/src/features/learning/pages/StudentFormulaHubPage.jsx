import { useEffect, useMemo, useState } from 'react';
import {
  Binary, Calendar, Check, ChevronDown, Copy,
  GraduationCap, ListFilter, Search, Sparkles, Star, Table
} from 'lucide-react';
import toast from 'react-hot-toast';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  getStoredFormulaSessions, toggleFormulaStar
} from '../data/mockFormulaData';
import { fetchFormulaSessions, toggleFormulaStarApi } from '../../api/lmsClient';

export default function StudentFormulaHubPage() {
  const [sessions, setSessions] = useState(() => getStoredFormulaSessions());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('ALL'); // 'ALL' | 'MATH' | 'PHYSICS' | 'CHEMISTRY'
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'cheatsheet'
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchFormulaSessions()
      .then((res) => {
        if (!isMounted) return;
        const apiSessions = res?.data?.sessions;
        if (Array.isArray(apiSessions) && apiSessions.length > 0) {
          setSessions(apiSessions);
        }
      })
      .catch(() => {
        // Fallback silently to mock/stored data
      });
    return () => { isMounted = false; };
  }, []);

  // Overall Statistics
  const stats = useMemo(() => {
    let totalFormulas = 0;
    let starredCount = 0;
    let mathCount = 0;
    let physicsCount = 0;
    let chemCount = 0;

    sessions.forEach((s) => {
      s.formulas.forEach((f) => {
        totalFormulas += 1;
        if (f.isStarred) starredCount += 1;
        if (s.subject === 'MATH') mathCount += 1;
        else if (s.subject === 'PHYSICS') physicsCount += 1;
        else if (s.subject === 'CHEMISTRY') chemCount += 1;
      });
    });

    return { totalFormulas, starredCount, mathCount, physicsCount, chemCount };
  }, [sessions]);

  // Filtered Sessions & Formulas
  const filteredSessions = useMemo(() => {
    return sessions.map((s) => {
      // Subject filter
      if (selectedSubject !== 'ALL' && s.subject !== selectedSubject) {
        return null;
      }

      // Filter individual formulas inside session
      const matchingFormulas = s.formulas.filter((f) => {
        if (showStarredOnly && !f.isStarred) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesMeta = (
            f.nameVi.toLowerCase().includes(q) ||
            (f.nameZh && f.nameZh.toLowerCase().includes(q)) ||
            (f.pinyin && f.pinyin.toLowerCase().includes(q)) ||
            f.latex.toLowerCase().includes(q) ||
            (f.description && f.description.toLowerCase().includes(q))
          );
          const matchesSession = s.chapter.toLowerCase().includes(q) || s.sessionTitle.toLowerCase().includes(q);
          const matchesVariables = f.variables?.some((v) =>
            v.symbol.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)
          );
          return matchesMeta || matchesSession || matchesVariables;
        }

        return true;
      });

      if (matchingFormulas.length === 0) return null;

      return {
        ...s,
        formulas: matchingFormulas,
      };
    }).filter(Boolean);
  }, [sessions, selectedSubject, showStarredOnly, searchQuery]);

  const handleToggleStar = async (sessionId, formulaId) => {
    const updated = toggleFormulaStar(sessionId, formulaId);
    setSessions([...updated]);
    try {
      await toggleFormulaStarApi(formulaId);
    } catch {
      // Offline or local storage fallback already updated
    }
  };

  const handleCopyLatex = (formula) => {
    navigator.clipboard.writeText(formula.latex);
    setCopiedId(formula.id);
    toast.success('Đã sao chép biểu thức LaTeX!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-700 via-blue-600 to-sky-700 p-6 sm:p-8 text-white shadow-xl shadow-indigo-600/15">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Sổ tay công thức & Thuật ngữ CSCA chuẩn hóa</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Công Thức Theo Buổi Học
            </h1>
            <p className="text-sm text-blue-100 leading-relaxed">
              Hệ thống công thức Toán học & Khoa học theo từng ngày học và chương học. Tra cứu công thức LaTeX, giải thích biến số và bài toán mẫu.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 shrink-0">
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">Tổng công thức</p>
              <p className="text-2xl font-black mt-0.5">{stats.totalFormulas}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">Đã lưu ⭐</p>
              <p className="text-2xl font-black text-amber-300 mt-0.5">{stats.starredCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-sky-200 uppercase tracking-wider">Toán CSCA</p>
              <p className="text-2xl font-black text-white mt-0.5">{stats.mathCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">Lý & Hóa</p>
              <p className="text-2xl font-black text-emerald-300 mt-0.5">{stats.physicsCount + stats.chemCount}</p>
            </div>
          </div>
        </div>

        {/* Decorative background shapes */}
        <div className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -top-10 -left-10 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 sm:p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên công thức, ký hiệu LaTeX, biến số, chương học..."
            className="w-full h-10 pl-10 pr-4 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Subject Filter Pills */}
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

          {/* Star Filter */}
          <button
            type="button"
            onClick={() => setShowStarredOnly(!showStarredOnly)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
              showStarredOnly
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 border-amber-300 dark:border-amber-800'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${showStarredOnly ? 'fill-current text-amber-500' : ''}`} />
            <span>Đã lưu</span>
          </button>

          {/* View Mode Switcher: Cards vs Cheat Sheet */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
                viewMode === 'card'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              title="Dạng thẻ chi tiết"
            >
              <ListFilter className="h-3.5 w-3.5" /> Thẻ
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cheatsheet')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
                viewMode === 'cheatsheet'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
              title="Bảng tra cứu tóm tắt Cheat Sheet"
            >
              <Table className="h-3.5 w-3.5" /> Bảng tra cứu
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Card View or Cheat Sheet View */}
      {filteredSessions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white/40 dark:bg-slate-900/40">
          <Binary className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Không tìm thấy công thức phù hợp</h3>
          <p className="text-xs text-slate-500 mt-1">Hãy thử xóa bộ lọc hoặc tìm kiếm bằng từ khóa khác.</p>
        </div>
      ) : viewMode === 'card' ? (
        /* === CARD VIEW === */
        <div className="space-y-5">
          {filteredSessions.map((s) => {
            const isExpanded = expandedSessionId === s.sessionId;
            return (
              <div
                key={s.sessionId}
                className="overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition hover:shadow-md"
              >
                {/* Session Header Card */}
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/40 dark:bg-slate-850/40 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                        <Calendar className="h-3.5 w-3.5" />
                        {s.formattedDate}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        <GraduationCap className="h-3.5 w-3.5" />
                        {s.classTitle}
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {s.subjectLabel}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-blue-600 dark:text-sky-400">
                        {s.chapter}
                      </p>
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                        {s.sessionTitle}
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {s.formulas.length} công thức trọng tâm
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedSessionId(isExpanded ? null : s.sessionId)}
                      className="flex items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Formulas List in Session */}
                <div className="p-5 sm:p-6 space-y-4">
                  {s.formulas.map((formula) => {
                    let formulaHtml = '';
                    try {
                      formulaHtml = katex.renderToString(formula.latex, {
                        displayMode: true,
                        throwOnError: false,
                      });
                    } catch {
                      formulaHtml = `<span>${formula.latex}</span>`;
                    }
                    const isCopied = copiedId === formula.id;

                    return (
                      <div
                        key={formula.id}
                        className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-850 p-4 sm:p-5 shadow-xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {formula.nameVi}
                              </h3>
                              {formula.nameZh && (
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  • {formula.nameZh}
                                </span>
                              )}
                            </div>
                            {formula.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {formula.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleCopyLatex(formula)}
                              className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                            >
                              {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              <span>{isCopied ? 'Đã copy' : 'Copy LaTeX'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStar(s.sessionId, formula.id)}
                              className={`p-1.5 rounded-xl border transition ${
                                formula.isStarred
                                  ? 'border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-800 dark:bg-amber-950/40'
                                  : 'border-slate-200 text-slate-400 hover:text-amber-500 dark:border-slate-700'
                              }`}
                            >
                              <Star className={`h-4 w-4 ${formula.isStarred ? 'fill-current' : ''}`} />
                            </button>
                          </div>
                        </div>

                        {/* KaTeX formula box */}
                        <div className="overflow-x-auto rounded-xl border border-blue-100 dark:border-slate-800 bg-blue-50/30 dark:bg-slate-800/60 py-3.5 px-4 text-center">
                          <div
                            className="text-base sm:text-xl font-serif text-slate-950 dark:text-white select-all"
                            dangerouslySetInnerHTML={{ __html: formulaHtml }}
                          />
                        </div>

                        {/* Variables explanation */}
                        {formula.variables && formula.variables.length > 0 && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {formula.variables.map((v, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                              >
                                <strong className="text-blue-600 dark:text-sky-400 font-mono">{v.symbol}:</strong> {v.meaning}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* === CHEAT SHEET TABLE VIEW === */
        <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 font-black text-slate-700 dark:text-slate-200">
                  <th className="py-3 px-4">Buổi học & Chương</th>
                  <th className="py-3 px-4">Tên công thức</th>
                  <th className="py-3 px-4 text-center">Biểu thức KaTeX</th>
                  <th className="py-3 px-4">Đại lượng chính</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSessions.flatMap((s) =>
                  s.formulas.map((formula) => {
                    let formulaHtml = '';
                    try {
                      formulaHtml = katex.renderToString(formula.latex, {
                        displayMode: false,
                        throwOnError: false,
                      });
                    } catch {
                      formulaHtml = `<span>${formula.latex}</span>`;
                    }

                    return (
                      <tr key={formula.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                        <td className="py-3.5 px-4 font-semibold text-slate-600 dark:text-slate-300 max-w-[200px]">
                          <span className="block text-xs font-bold text-blue-600 dark:text-sky-400">{s.chapter}</span>
                          <span className="text-[11px] text-slate-400">{s.formattedDate}</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white max-w-[180px]">
                          <span>{formula.nameVi}</span>
                          {formula.nameZh && (
                            <span className="block text-[11px] text-slate-400 font-normal">{formula.nameZh}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-serif text-slate-950 dark:text-white">
                          <div
                            className="inline-block bg-blue-50/40 dark:bg-slate-800 px-3 py-1.5 rounded-lg select-all"
                            dangerouslySetInnerHTML={{ __html: formulaHtml }}
                          />
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[220px]">
                          {formula.variables?.map((v) => `${v.symbol}: ${v.meaning}`).join(', ') || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleCopyLatex(formula)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 transition"
                            title="Copy LaTeX"
                          >
                            <Copy className="h-4 w-4" />
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
      )}
    </div>
  );
}
