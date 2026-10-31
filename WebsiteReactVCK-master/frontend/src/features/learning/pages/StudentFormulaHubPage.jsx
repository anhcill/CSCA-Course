import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Binary,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  GraduationCap,
  RefreshCw,
  Search,
  Star,
  Table,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import toast from "react-hot-toast";
import {
  fetchFormulaSessions,
  toggleFormulaStarApi,
} from "../../api/lmsClient";
import FormulaDetailModal from "../components/FormulaDetailModal";
import usePersistentClassSelection from "../hooks/usePersistentClassSelection";
import { normalizeLatexMath } from "../../quizzes/math/normalizeMath";

// Instant KaTeX rendering cache to avoid re-parsing on every frame
const katexCache = new Map();
function renderCachedKatex(latex, displayMode = false) {
  if (!latex) return "";
  const normalized = normalizeLatexMath(String(latex));
  const key = `${displayMode ? "D" : "I"}:${normalized}`;
  if (katexCache.has(key)) return katexCache.get(key);
  try {
    const html = katex.renderToString(normalized, { displayMode, throwOnError: false, strict: "ignore" });
    katexCache.set(key, html);
    return html;
  } catch {
    return `<span>${latex}</span>`;
  }
}

export default function StudentFormulaHubPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("sessions"); // "sessions" | "cheatsheet" | "starred"
  const [selectedSubject, setSelectedSubject] = useState("ALL"); // "ALL" | "MATH" | "PHYSICS" | "CHEMISTRY"
  const [selectedSessionId, setSelectedSessionId] = useState("ALL"); // "ALL" or specific sessionId
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFormula, setSelectedFormula] = useState(null);
  const [selectedFormulaSession, setSelectedFormulaSession] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedSessionIds, setExpandedSessionIds] = useState(new Set());

  const toggleSessionExpand = (sessionId) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchFormulaSessions();
      const apiSessions = res?.data?.sessions;
      if (!res?.success || !Array.isArray(apiSessions)) throw new Error(res?.message || "Dữ liệu công thức không hợp lệ");
      setSessions(apiSessions);
    } catch (err) {
      console.error("Error loading formula sessions:", err);
      setSessions([]);
      setError(err.message || "Không thể tải danh sách công thức");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Overall Statistics Calculation
  const stats = useMemo(() => {
    let totalFormulas = 0;
    let starredCount = 0;
    let mathCount = 0;
    let physicsCount = 0;
    let chemCount = 0;

    sessions.forEach((s) => {
      (s.formulas || []).forEach((f) => {
        totalFormulas += 1;
        if (f.isStarred) starredCount += 1;
        if (s.subject === "MATH") mathCount += 1;
        else if (s.subject === "PHYSICS") physicsCount += 1;
        else if (s.subject === "CHEMISTRY") chemCount += 1;
      });
    });

    return { totalFormulas, starredCount, mathCount, physicsCount, chemCount };
  }, [sessions]);

  // Distinct Classes List for Class selector
  const classList = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      const id = String(s.classId || s.courseId || "default");
      const title = s.classTitle || s.courseTitle || "Lớp học CSCA";
      if (!map.has(id)) {
        map.set(id, title);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [sessions]);

  const classIds = useMemo(() => classList.map((item) => item.id), [classList]);
  const [selectedClassId, setSelectedClassId] = usePersistentClassSelection({
    scope: "formula",
    availableClassIds: classIds,
    allValue: "ALL",
    ready: !loading,
  });

  // Filtered Sessions according to Class, Subject & Search
  const filteredSessions = useMemo(() => {
    return sessions
      .map((s) => {
        // Filter by class
        if (selectedClassId !== "ALL" && String(s.classId || s.courseId) !== String(selectedClassId)) {
          return null;
        }
        // Filter by subject
        if (selectedSubject !== "ALL" && s.subject !== selectedSubject) {
          return null;
        }

        // Filter individual formulas inside session
        const matchingFormulas = (s.formulas || []).filter((f) => {
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchesMeta =
              String(f.nameVi || "").toLowerCase().includes(q) ||
              String(f.nameZh || "").toLowerCase().includes(q) ||
              String(f.pinyin || "").toLowerCase().includes(q) ||
              String(f.latex || "").toLowerCase().includes(q) ||
              String(f.description || "").toLowerCase().includes(q);
            const matchesSession =
              String(s.chapter || "").toLowerCase().includes(q) ||
              String(s.sessionTitle || "").toLowerCase().includes(q);
            const matchesVariables = (f.variables || []).some(
              (v) =>
                String(v.symbol || "").toLowerCase().includes(q) ||
                String(v.meaning || "").toLowerCase().includes(q)
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
      })
      .filter(Boolean);
  }, [sessions, selectedClassId, selectedSubject, searchQuery]);

  // Flattened All Formulas for Cheatsheet & Starred tabs
  const allFormulas = useMemo(() => {
    const list = [];
    filteredSessions.forEach((s) => {
      (s.formulas || []).forEach((f) => {
        list.push({
          ...f,
          session: s,
          sessionId: s.sessionId,
          sessionTitle: s.sessionTitle || s.chapter,
          chapter: s.chapter,
          classTitle: s.classTitle || "Lớp học",
          subjectLabel: s.subjectLabel || "Toán CSCA",
        });
      });
    });
    return list;
  }, [filteredSessions]);

  // Filter formulas specifically for Cheatsheet view (supports filtering by selectedSessionId)
  const cheatsheetFormulas = useMemo(() => {
    if (activeTab === "starred") {
      return allFormulas.filter((f) => f.isStarred);
    }
    if (selectedSessionId !== "ALL") {
      return allFormulas.filter((f) => String(f.sessionId) === String(selectedSessionId));
    }
    return allFormulas;
  }, [allFormulas, activeTab, selectedSessionId]);

  // Title of active session when filtered in Cheatsheet view
  const activeSessionInfo = useMemo(() => {
    if (selectedSessionId === "ALL") return null;
    const found = sessions.find((s) => String(s.sessionId) === String(selectedSessionId));
    return found ? (found.chapter || found.sessionTitle || "Buổi học") : "Buổi đã chọn";
  }, [sessions, selectedSessionId]);

  const handleToggleStar = async (formula) => {
    try {
      await toggleFormulaStarApi(formula.id);
      setSessions((current) =>
        current.map((session) => ({
          ...session,
          formulas: (session.formulas || []).map((f) =>
            String(f.id) === String(formula.id)
              ? { ...f, isStarred: !f.isStarred }
              : f
          ),
        }))
      );
      if (selectedFormula && String(selectedFormula.id) === String(formula.id)) {
        setSelectedFormula((prev) => ({ ...prev, isStarred: !prev.isStarred }));
      }
    } catch (requestError) {
      toast.error(requestError.message || "Không thể cập nhật công thức đã lưu.");
    }
  };

  const handleCopyLatex = (e, formula) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formula.latex);
    setCopiedId(formula.id);
    toast.success("Đã copy công thức LaTeX!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenFormulaModal = (formula, session) => {
    setSelectedFormula(formula);
    setSelectedFormulaSession(session || formula.session);
  };

  if (!loading && error) {
    return (
      <div className="min-h-[60vh] px-4 py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white/90 dark:border-rose-900/50 dark:bg-slate-900/90 p-8 text-center shadow-sm backdrop-blur-md">
          <Binary className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="mt-4 text-lg font-black text-[#102f63] dark:text-white">Chưa thể tải kho công thức</h1>
          <p className="mt-2 text-sm text-[#487291] dark:text-slate-400">{error}</p>
          <button type="button" onClick={loadSessions} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700">
            <RefreshCw className="h-4 w-4" /> Thử lại
          </button>
        </div>
      </div>
    );
  }

  // Reusable Cheatsheet Table Component
  const renderFormulaTable = (formulasList, emptyMessage) => (
    <div className="overflow-hidden rounded-2xl border border-white/85 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-md">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full text-left border-collapse table-auto text-xs">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-md text-[10px] font-semibold text-slate-400 dark:text-slate-400">
              <th className="py-2.5 pl-3.5 pr-2 min-w-[150px]">Tên công thức</th>
              <th className="py-2.5 px-2 text-center min-w-[180px]">Biểu thức KaTeX</th>
              <th className="py-2.5 px-2 min-w-[130px] max-w-[180px]">Môn học & Buổi</th>
              <th className="py-2.5 px-2 min-w-[170px]">Đại lượng chính</th>
              <th className="py-2.5 pr-3.5 pl-2 text-right whitespace-nowrap min-w-[110px]">Thao tác</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100/90 dark:divide-slate-800/90 text-xs">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-1" />
                  <p className="font-semibold">Đang tải danh sách công thức...</p>
                </td>
              </tr>
            ) : formulasList.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              formulasList.map((formula) => {
                const formulaHtml = renderCachedKatex(formula.latex, false);

                return (
                  <tr
                    key={formula.id}
                    onClick={() => handleOpenFormulaModal(formula, formula.session)}
                    className="transition hover:bg-blue-50/40 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    {/* Tên công thức & Tên tiếng Trung */}
                    <td className="py-2 pl-3.5 pr-2 min-w-[150px] align-middle">
                      <div>
                        <h4 className="font-bold text-[11px] text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition leading-snug">
                          {formula.nameVi}
                        </h4>
                        {formula.nameZh && (
                          <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5 leading-none">
                            {formula.nameZh} {formula.pinyin && `(${formula.pinyin})`}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Biểu thức KaTeX */}
                    <td className="py-2 px-2 text-center align-middle font-serif select-all">
                      <div
                        className="inline-block rounded-lg bg-blue-50/40 dark:bg-slate-800/80 px-2.5 py-1 text-xs sm:text-sm text-[#102f63] dark:text-sky-300 font-medium"
                        dangerouslySetInnerHTML={{ __html: formulaHtml }}
                      />
                    </td>

                    {/* Môn & Buổi */}
                    <td className="py-2 px-2 align-middle">
                      <div className="min-w-0">
                        <p className="font-semibold text-[10px] text-slate-700 dark:text-slate-300 truncate">
                          {formula.subjectLabel}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate">
                          {formula.chapter || formula.sessionTitle}
                        </p>
                      </div>
                    </td>

                    {/* Đại lượng chính */}
                    <td className="py-2 px-2 align-middle">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 line-clamp-2">
                        {formula.variables && formula.variables.length > 0
                          ? formula.variables.map((v, idx) => (
                              <span key={idx}>
                                {idx > 0 ? "; " : ""}
                                <span
                                  className="font-serif font-semibold text-slate-800 dark:text-slate-200"
                                  dangerouslySetInnerHTML={{ __html: renderCachedKatex(v.symbol, false) }}
                                />
                                {v.meaning ? `: ${v.meaning}` : ""}
                              </span>
                            ))
                          : "—"}
                      </p>
                    </td>

                    {/* Thao tác: Chi tiết, Copy LaTeX, Star */}
                    <td className="py-2 pr-3.5 pl-2 text-right whitespace-nowrap align-middle">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleOpenFormulaModal(formula, formula.session)}
                          className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-300 shadow-2xs hover:bg-blue-600 hover:text-white transition"
                        >
                          Chi tiết
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleCopyLatex(e, formula)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                          title="Copy LaTeX"
                        >
                          {copiedId === formula.id ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStar(formula)}
                          className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                            formula.isStarred
                              ? "border-amber-300 bg-amber-50 text-amber-500"
                              : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-amber-500"
                          }`}
                          title={formula.isStarred ? "Bỏ lưu" : "Lưu vào công thức quan trọng"}
                        >
                          <Star className={`h-3 w-3 ${formula.isStarred ? "fill-current" : ""}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3 pb-8 sm:pb-12">
      <div className="mx-auto max-w-[1440px] space-y-3.5">
        {/* Calligraphic Header directly on Scenic Background */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-0.5 pb-1">
          <div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] dark:text-white drop-shadow-xs sm:text-5xl">
              Sổ tay Công thức
            </h1>
            <p className="mt-1 text-xs font-semibold italic text-slate-800 dark:text-slate-300 sm:text-sm">
              “Hiểu rõ bản chất, vận dụng linh hoạt mọi bài toán.”
            </p>
            <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 dark:text-slate-400 sm:text-base">
              —— 析理入微，格物致知。
            </p>
          </div>

          {/* 4 Compact Metric Pill Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tổng công thức</span>
              <span className="text-sm font-extrabold text-[#102f63] dark:text-white">{stats.totalFormulas}</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Đã lưu ⭐</span>
              <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">{stats.starredCount}</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Toán CSCA</span>
              <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{stats.mathCount}</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Lý & Hóa</span>
              <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{stats.physicsCount + stats.chemCount}</span>
            </div>
          </div>
        </div>

        {/* Toolbar: View Tabs, Class Selector, Subject Pills & Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/85 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-2.5 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-xl transition-all">
          {/* View mode switcher */}
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === "sessions"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Theo buổi học</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSessionId("ALL");
                setActiveTab("cheatsheet");
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === "cheatsheet"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Table className="h-3.5 w-3.5" />
              <span>Bảng tra cứu ({allFormulas.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("starred")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                activeTab === "starred"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              <span>Công thức đã lưu ⭐ ({stats.starredCount})</span>
            </button>
          </div>

          {/* Right: Class Selector, Subject Pills & Search */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Class Pill / Dropdown Selector */}
            <div className="flex items-center gap-1 text-xs">
              <span className="hidden sm:inline-block font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                Lớp:
              </span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="h-8 rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100 px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white dark:focus:border-blue-500 dark:focus:bg-slate-800"
              >
                <option value="ALL">Tất cả lớp học</option>
                {classList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Selector Pills */}
            <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-xl p-0.5 text-xs">
              {[
                { id: "ALL", label: "Tất cả môn" },
                { id: "MATH", label: "Toán" },
                { id: "PHYSICS", label: "Lý" },
                { id: "CHEMISTRY", label: "Hóa" },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedSubject(sub.id)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    selectedSubject === sub.id
                      ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-52">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm công thức, LaTeX, biến số..."
                className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white dark:focus:border-blue-500 dark:focus:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* TAB 1: SESSIONS VIEW (Theo buổi học) - CHỈ hiển thị các ô công thức theo buổi học */}
        {activeTab === "sessions" && (
          <div>
            {loading ? (
              <div className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-12 text-center shadow-xs">
                <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Đang tải danh sách công thức...</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-12 text-center shadow-xs">
                <Binary className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Chưa có công thức nào trong các buổi học</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Các công thức toán học CSCA sẽ hiển thị tại đây khi giáo viên cập nhật theo buổi học.</p>
              </div>
            ) : (
              /* Session Cards Grid: Chỉ hiển thị các ô công thức theo buổi */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredSessions.map((session, index) => {
                  const formulas = session.formulas || [];
                  const isExpanded = expandedSessionIds.has(session.sessionId);
                  const visibleFormulas = isExpanded ? formulas : formulas.slice(0, 4);

                  return (
                    <div
                      key={session.sessionId || index}
                      className="group flex flex-col justify-between rounded-2xl border border-white/85 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        {/* Header: Class & Subject */}
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 font-bold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 truncate max-w-[170px]">
                            <GraduationCap className="h-3 w-3 shrink-0" />
                            {session.classTitle || "Lớp học CSCA"}
                          </span>
                          <span className="rounded-md bg-blue-100/70 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300">
                            {session.subjectLabel || "Toán CSCA"}
                          </span>
                        </div>

                        {/* Title & Topic */}
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug line-clamp-1">
                            {session.chapter || session.sessionTitle}
                          </h3>
                          {session.sessionTitle && session.sessionTitle !== session.chapter && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {session.sessionTitle}
                            </p>
                          )}
                        </div>

                        {/* Formulas List (4 formulas preview + clean expand button) */}
                        <div className="space-y-1.5 pt-0.5">
                          {visibleFormulas.map((f, fIdx) => {
                            const miniHtml = renderCachedKatex(f.latex, false);

                            return (
                              <button
                                key={f.id || fIdx}
                                type="button"
                                onClick={() => handleOpenFormulaModal(f, session)}
                                className="w-full flex items-center justify-between gap-2 rounded-xl border border-blue-100/70 dark:border-slate-800 bg-white/90 dark:bg-slate-800/80 px-3 py-2 text-left transition hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-blue-50/70 dark:hover:bg-slate-800 hover:shadow-2xs group/item"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400 truncate block">
                                    {f.nameVi}
                                  </span>
                                  {f.nameZh && (
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono truncate block">
                                      {f.nameZh} {f.pinyin ? `(${f.pinyin})` : ""}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="shrink-0 text-xs sm:text-sm font-serif text-[#102f63] dark:text-sky-300 font-semibold max-w-[140px] truncate"
                                  dangerouslySetInnerHTML={{ __html: miniHtml }}
                                />
                              </button>
                            );
                          })}

                          {/* Expand / Collapse toggle if session has more than 4 formulas */}
                          {formulas.length > 4 && (
                            <button
                              type="button"
                              onClick={() => toggleSessionExpand(session.sessionId)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1 rounded-xl border border-blue-200/70 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/40 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 transition"
                            >
                              {isExpanded ? (
                                <>
                                  <span>Thu gọn danh sách</span>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                <>
                                  <span>Xem thêm {formulas.length - 4} công thức khác ({formulas.length} tổng)</span>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="space-y-2 pt-3 mt-3 border-t border-slate-100/90 dark:border-slate-800/90">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 dark:text-slate-500">Số lượng công thức:</span>
                          <span className="font-extrabold text-[#102f63] dark:text-white">{formulas.length} công thức</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {/* Nút Bảng tra cứu: Nhấn vào thì mở bảng tra cứu của riêng buổi học đó */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSessionId(String(session.sessionId));
                              setSelectedClassId(String(session.classId || session.courseId || "ALL"));
                              setActiveTab("cheatsheet");
                            }}
                            className="flex items-center justify-center gap-1 rounded-xl border border-blue-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-[#102f63] dark:text-slate-200 shadow-2xs hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-400 transition"
                          >
                            <Table className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                            <span>Bảng tra cứu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (formulas.length > 0) {
                                handleOpenFormulaModal(formulas[0], session);
                              }
                            }}
                            className="flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-blue-700 transition"
                          >
                            <span>Xem chi tiết</span>
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2 & 3: CHEATSHEET & STARRED (Bảng tra cứu công thức) */}
        {(activeTab === "cheatsheet" || activeTab === "starred") && (
          <div className="space-y-3">
            {/* Banner khi đang xem bảng tra cứu của 1 buổi cụ thể */}
            {activeTab === "cheatsheet" && selectedSessionId !== "ALL" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200/90 dark:border-blue-900/50 bg-white/95 dark:bg-slate-900/90 p-3 shadow-xs backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                    <Table className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Bảng tra cứu của buổi:{" "}
                      <span className="text-blue-700 dark:text-blue-400 font-extrabold">{activeSessionInfo}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Hiển thị {cheatsheetFormulas.length} công thức toán học chuyên đề của buổi này.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSessionId("ALL")}
                  className="flex items-center gap-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs hover:bg-blue-600 hover:text-white transition"
                >
                  <span>Xem tất cả buổi học ({allFormulas.length})</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                  activeTab === "starred" ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400" : "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                }`}>
                  {activeTab === "starred" ? <Star className="h-3.5 w-3.5 fill-current" /> : <Table className="h-3.5 w-3.5" />}
                </div>
                <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wide">
                  {activeTab === "starred"
                    ? `Công thức đã lưu ⭐ (${cheatsheetFormulas.length})`
                    : `Bảng tra cứu công thức (${cheatsheetFormulas.length})`}
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Bấm vào dòng để mở chi tiết giải thích
              </span>
            </div>

            {renderFormulaTable(
              cheatsheetFormulas,
              activeTab === "starred"
                ? "Bạn chưa đánh dấu lưu công thức nào. Hãy bấm ngôi sao để lưu công thức cần ôn tập nhé!"
                : "Không tìm thấy công thức nào theo bộ lọc hiện tại."
            )}
          </div>
        )}

        {/* Formula Detail Modal ("công thức nhấn vào ra tab mới thu gọn ui") */}
        <FormulaDetailModal
          formula={selectedFormula}
          sessionInfo={selectedFormulaSession}
          isOpen={Boolean(selectedFormula)}
          onClose={() => {
            setSelectedFormula(null);
            setSelectedFormulaSession(null);
          }}
          onToggleStar={handleToggleStar}
        />
      </div>
    </div>
  );
}
