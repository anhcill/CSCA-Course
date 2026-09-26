import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchSubmissions, gradeSubmission } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";

/* ── SVG Icons ────────────────────────────────────────────────── */
const IconUser = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const IconCheck = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const IconClock = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
  </svg>
);
const IconMic = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);
const IconFile = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconArrowRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

/* Quick feedback chips */
const QUICK_FEEDBACK = [
  { label: "🌟 Xuất sắc", text: "Bài làm rất xuất sắc! Em nắm vững ngữ pháp, từ vựng phong phú và diễn đạt tự nhiên.", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { label: "🗣️ Khẩu ngữ HSKK", text: "Phần phát âm thanh điệu (đặc biệt thanh 4) cần dứt khoát hơn. Ngắt nhịp câu khá trôi chảy.", cls: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  { label: "✍️ Ngữ pháp 把/被", text: "Cần chú ý bổ ngữ kết quả sau động từ chính trong câu chữ 把 và câu bị động 被.", cls: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  { label: "👍 Khá tốt", text: "Bài làm tương đối tốt, còn một vài lỗi dùng liên từ chưa thật tự nhiên. Cố gắng phát huy!", cls: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  { label: "⚠️ Cần xem lại", text: "Bài làm còn nhiều lỗi chính tả chữ Hán và sai cấu trúc câu. Em hãy xem lại bài giảng và nộp bổ sung nhé.", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { label: "⏳ Nhắc nộp đúng hạn", text: "Lần sau em chú ý theo dõi deadline để nộp bài đúng hạn quy định của lớp nhé.", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
];

function countChineseChars(text) {
  return (text?.match(/[\u4e00-\u9fff]/g) || []).length;
}

function getTypeBadge(type) {
  if ((type || "").includes("hskk") || (type || "").includes("speak")) {
    return { label: "HSKK Khẩu Ngữ", cls: "bg-violet-500/20 text-violet-400 border-violet-500/30" };
  }
  if ((type || "").includes("quiz")) {
    return { label: "Trắc Nghiệm", cls: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
  }
  return { label: "Bài Luận Tự Luận", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
}

export default function TeacherGradingPage() {
  const [searchParams] = useSearchParams();
  const requestedAssignmentId = searchParams.get("assignmentId") || "all";
  const requestedClassId = searchParams.get("classId") || "";
  const requestedSessionId = searchParams.get("sessionId") || "";
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState(null);

  // Grading form state
  const [score, setScore] = useState(8.5);
  const [feedback, setFeedback] = useState("");
  const [grading, setGrading] = useState(false);

  // Filters & Sorting
  const [filterStatus, setFilterStatus] = useState("pending"); // all | pending | graded
  const [filterClass, setFilterClass] = useState(requestedClassId || "all");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByDeadline, setSortByDeadline] = useState("asc"); // asc | desc

  // Audio player playback rate (0.75, 1, 1.25, 1.5)
  const [playbackRate, setPlaybackRate] = useState(1);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSubmissions(requestedAssignmentId, {
        classId: requestedClassId || undefined,
        sessionId: requestedSessionId || undefined,
      });
      const rows = res.success && Array.isArray(res.data) ? res.data : [];
      setSubmissions(rows);
      setSelectedSub(rows[0] || null);
      setScore(rows[0]?.score || 0);
    } catch (err) {
      console.error("Error loading submissions:", err);
      setSubmissions([]);
      setSelectedSub(null);
      toast.error(err.message || "Không thể tải hàng chờ chấm bài");
    } finally {
      setLoading(false);
    }
  }, [requestedAssignmentId, requestedClassId, requestedSessionId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    setFilterClass(requestedClassId || "all");
  }, [requestedClassId]);

  // Handle selecting a submission from queue
  const handleSelectSub = useCallback((sub) => {
    setSelectedSub(sub);
    setScore(sub.score !== null && sub.score !== undefined ? sub.score : 8.5);
    setFeedback(sub.feedbackText || "");
  }, []);

  // Filtered and sorted submissions
  const filteredSubs = useMemo(() => {
    let list = [...submissions];

    if (filterStatus === "pending") list = list.filter((s) => ["submitted", "late"].includes(s.status));
    if (filterStatus === "graded") list = list.filter((s) => s.status === "graded");

    if (filterClass !== "all") {
      list = list.filter((s) => s.classId === filterClass);
    }

    if (filterType !== "all") {
      list = list.filter((s) => s.assignmentType === filterType);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.studentName || "").toLowerCase().includes(q) ||
          (s.assignmentTitle || "").toLowerCase().includes(q) ||
          (s.classTitle || "").toLowerCase().includes(q) ||
          (s.sessionTitle || "").toLowerCase().includes(q)
      );
    }

    // Sort by deadline
    list.sort((a, b) => {
      const timeA = new Date(a.dueDate || a.submittedAt).getTime();
      const timeB = new Date(b.dueDate || b.submittedAt).getTime();
      return sortByDeadline === "asc" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [submissions, filterStatus, filterClass, filterType, searchQuery, sortByDeadline]);

  // Grade submit logic (with auto advance to next submission)
  const handleGradeSubmit = useCallback(
    async (advanceToNext = true) => {
      if (!selectedSub) return;

      const numScore = Number(score);
      const maxScore = selectedSub.maxScore || 10;

      if (isNaN(numScore) || numScore < 0 || numScore > maxScore) {
        toast.error(`Điểm số phải nằm trong thang điểm từ 0 đến ${maxScore}!`);
        return;
      }

      setGrading(true);
      try {
        const res = await gradeSubmission({
          submissionId: selectedSub.id,
          score: numScore,
          feedbackText: feedback,
        });

        if (res?.success !== false) {
          toast.success(`Đã lưu điểm cho ${selectedSub.studentName}: ${numScore}/${maxScore} điểm! 🎉`);

          // Update local list
          setSubmissions((prev) =>
            prev.map((s) =>
              s.id === selectedSub.id
                ? { ...s, status: "graded", score: numScore, feedbackText: feedback }
                : s
            )
          );
          setSelectedSub((prev) => ({
            ...prev,
            status: "graded",
            score: numScore,
            feedbackText: feedback,
          }));

          // Automatically advance to the next pending submission if requested
          if (advanceToNext) {
            const currentIndex = filteredSubs.findIndex((s) => s.id === selectedSub.id);
            const nextSub = filteredSubs.find(
                (s, i) => i > currentIndex && ["submitted", "late"].includes(s.status)
            );
            if (nextSub) {
              handleSelectSub(nextSub);
              toast("Đã chuyển sang bài nộp tiếp theo ➡️", { icon: "⏩" });
            }
          }
        }
      } catch (err) {
        console.error("Error grading:", err);
        toast.error("Có lỗi xảy ra khi chấm điểm!");
      } finally {
        setGrading(false);
      }
    },
    [selectedSub, score, feedback, filteredSubs, handleSelectSub]
  );

  // Keyboard shortcut: Ctrl+Enter (or Cmd+Enter) to submit and advance
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleGradeSubmit(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGradeSubmit]);

  // Overall metrics
  const stats = useMemo(
    () => ({
      total: submissions.length,
              pending: submissions.filter((s) => ["submitted", "late"].includes(s.status)).length,
      graded: submissions.filter((s) => s.status === "graded").length,
      avgScore: (() => {
        const scored = submissions.filter((s) => s.score !== null && s.score !== undefined);
        return scored.length > 0
          ? (scored.reduce((a, s) => a + Number(s.score), 0) / scored.length).toFixed(1)
          : "-";
      })(),
    }),
    [submissions]
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-16">
      {/* Top Breadcrumb & Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto max-w-7xl px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider font-mono">
                Teacher Workspace
              </span>
              <span>/</span>
              <span>Chấm Điểm & Phản Hồi Bài Tập</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Cổng Chấm Bài Tổng (Grading Workspace)
            </h1>
            {requestedSessionId && (
              <p className="text-xs text-sky-600 dark:text-sky-300 font-medium">
                Đang mở hàng chờ bài tập về nhà của buổi học đã chọn.
              </p>
            )}
          </div>

          {/* Key Metrics Chips */}
          <div className="flex items-center gap-2">
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-xl text-center shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Chờ Chấm</span>
              <span className="text-amber-500 dark:text-amber-400 font-mono font-black text-base">{stats.pending}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-xl text-center shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Đã Chấm</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black text-base">{stats.graded}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-xl text-center shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Điểm TB</span>
              <span className="text-sky-600 dark:text-sky-400 font-mono font-black text-base">{stats.avgScore}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 3-Column Split Workspace */}
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ══════════════════════════════════════════════════════════
              COLUMN 1: SUBMISSIONS QUEUE (LEFT - 3.5 COLUMNS)
              ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Hàng Đợi Bài Nộp ({filteredSubs.length})
              </h3>
              <button
                type="button"
                onClick={() => setSortByDeadline((p) => (p === "asc" ? "desc" : "asc"))}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-mono flex items-center gap-1"
                title="Sắp xếp theo hạn nộp"
              >
                <span>Hạn nộp</span>
                <span>{sortByDeadline === "asc" ? "↑ Gần" : "↓ Xa"}</span>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
              {[
                { id: "pending", label: `Chờ (${stats.pending})` },
                { id: "graded", label: `Đã chấm (${stats.graded})` },
                { id: "all", label: `Tất cả (${stats.total})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterStatus(f.id)}
                  className={`py-1.5 rounded-lg font-bold transition text-center ${
                    filterStatus === f.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search & Class Dropdown */}
            <div className="space-y-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên học viên, bài tập..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <div className="flex gap-2">
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="w-1/2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value="all">Tất cả lớp</option>
                  {[...new Map(submissions
                    .filter((sub) => sub.classId)
                    .map((sub) => [sub.classId, sub.classTitle || `Lớp #${sub.classId}`]))]
                    .map(([classId, classTitle]) => (
                      <option key={classId} value={classId}>{classTitle}</option>
                    ))}
                </select>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-1/2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value="all">Mọi loại bài</option>
                  <option value="homework">Bài luận</option>
                  <option value="hskk">Khẩu ngữ HSKK</option>
                  <option value="quiz">Trắc nghiệm</option>
                </select>
              </div>
            </div>

            {/* List of Submissions */}
            {loading ? (
              <Loading loading={true} text="Đang tải danh sách bài nộp..." fullScreen={false} className="py-12" />
            ) : filteredSubs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80">
                Không tìm thấy bài nộp nào trong bộ lọc.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
                {filteredSubs.map((sub) => {
                  const tb = getTypeBadge(sub.assignmentType);
                  const isSelected = selectedSub?.id === sub.id;

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSelectSub(sub)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                        isSelected
                          ? "bg-emerald-600/10 border-emerald-500 ring-1 ring-emerald-500 shadow-lg shadow-emerald-500/10"
                          : "bg-slate-50/80 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300">
                          {sub.studentAvatar ? (
                            <img src={sub.studentAvatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <IconUser />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">{sub.studentName}</span>
                            <span
                              className={`shrink-0 text-[10px] font-black font-mono px-2 py-0.5 rounded-full border ${
                                sub.status === "graded"
                                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {sub.status === "graded" ? `${sub.score}đ` : "Chờ chấm"}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate font-medium">{sub.assignmentTitle}</p>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                            <span className={`px-1.5 py-0.5 rounded border font-semibold ${tb.cls}`}>
                              {tb.label}
                            </span>
                            <span className="font-mono flex items-center gap-1">
                              <IconClock />
                              {new Date(sub.submittedAt).toLocaleDateString("vi-VN")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              COLUMN 2: SUBMISSION VIEWER (CENTER - 5 COLUMNS)
              ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl min-h-[500px]">
            {!selectedSub ? (
              <div className="h-full flex items-center justify-center py-24 text-center text-slate-500 text-xs">
                Chọn một bài nộp ở cột bên trái để bắt đầu xem và chấm điểm.
              </div>
            ) : (
              <>
                {/* Submission Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                        {selectedSub.classTitle || "CSCA-LMS"}
                      </span>
                      {selectedSub.status === "late" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30">
                          Nộp Quá Hạn
                        </span>
                      )}
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                      {selectedSub.assignmentTitle}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Học viên: <strong className="text-slate-900 dark:text-white">{selectedSub.studentName}</strong> •{" "}
                      <span className="font-mono text-slate-500">{selectedSub.studentEmail}</span>
                    </p>
                    {selectedSub.sessionTitle && (
                      <p className="text-[11px] text-sky-600 dark:text-sky-300">
                        Buổi học: {selectedSub.sessionTitle}
                      </p>
                    )}
                  </div>

                  {selectedSub.status === "graded" && (
                    <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-2xl px-4 py-2 text-center shrink-0">
                      <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{selectedSub.score}</span>
                      <span className="text-[9px] text-emerald-600 dark:text-emerald-500/80 uppercase font-bold block">Đã chấm</span>
                    </div>
                  )}
                </div>

                {/* Text Content with Chinese Character Counter */}
                {selectedSub.contentText && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-bold uppercase tracking-wider text-[10px]">Nội Dung Bài Luận:</span>
                      <span className="font-mono bg-slate-100 dark:bg-slate-950 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px]">
                        Số chữ Hán: <strong className="text-rose-500 dark:text-rose-400">{countChineseChars(selectedSub.contentText)}</strong> ký tự
                      </span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-wrap selection:bg-rose-500/30">
                      {selectedSub.contentText}
                    </div>
                  </div>
                )}

                {/* File Attachment Preview */}
                {selectedSub.fileUrl && (
                  <div className="space-y-2">
                    <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500 dark:text-slate-400">
                      Tệp Đính Kèm Của Học Viên:
                    </span>
                    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-sky-500 dark:text-sky-400">
                          <IconFile />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                            {selectedSub.fileName || "Tai_lieu_bai_tap.pdf"}
                          </p>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Định dạng tệp đã được quét virus</p>
                        </div>
                      </div>
                      <a
                        href={selectedSub.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-400 rounded-xl text-xs font-semibold transition border border-slate-300 dark:border-slate-700"
                      >
                        Mở Xem Tệp
                      </a>
                    </div>
                  </div>
                )}

                {/* Audio Player for HSKK with Speed Controls */}
                {selectedSub.audioUrl && (
                  <div className="space-y-2 bg-slate-50 dark:bg-slate-950/70 p-4 rounded-2xl border border-violet-500/20">
                    <div className="flex items-center justify-between text-xs text-violet-600 dark:text-violet-400 font-bold">
                      <span className="flex items-center gap-1.5">
                        <IconMic /> Bản Ghi Âm Khẩu Ngữ HSKK
                      </span>
                      {/* Playback speed controller */}
                      <div className="flex items-center gap-1 text-[10px] font-mono">
                        <span className="text-slate-500 mr-1">Tốc độ:</span>
                        {[0.75, 1, 1.25, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              setPlaybackRate(rate);
                              const audioEl = document.getElementById("hskk-audio-player");
                              if (audioEl) audioEl.playbackRate = rate;
                            }}
                            className={`px-2 py-0.5 rounded ${
                              playbackRate === rate
                                ? "bg-violet-600 text-white font-bold"
                                : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <audio
                      id="hskk-audio-player"
                      src={selectedSub.audioUrl}
                      controls
                      className="w-full h-10 rounded-xl"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              COLUMN 3: GRADING & FEEDBACK PANEL (RIGHT - 3 COLUMNS)
              ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>⭐</span>
                <span>Chấm Điểm & Lời Phê</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-500">Phím tắt: Ctrl+Enter</span>
            </div>

            {/* Score Input (Keyboard Friendly + Slider) */}
            <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label htmlFor="score-input" className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                  Điểm số:
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="score-input"
                    type="number"
                    min="0"
                    max={selectedSub?.maxScore || 10}
                    step="0.25"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="w-20 bg-white dark:bg-slate-900 border border-amber-500/50 rounded-xl px-2.5 py-1 text-center font-mono font-black text-amber-500 dark:text-amber-400 text-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-xs text-slate-500 font-mono">/ {selectedSub?.maxScore || 10}</span>
                </div>
              </div>

              {/* Slider Controller */}
              <input
                type="range"
                min="0"
                max={selectedSub?.maxScore || 10}
                step="0.5"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                <span>0</span>
                <span>2.5</span>
                <span>5.0</span>
                <span>7.5</span>
                <span>10.0</span>
              </div>
            </div>

            {/* Quick Feedback Chips */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 block">
                Mẫu Nhận Xét Nhanh (Click 1-chạm):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_FEEDBACK.map((qf) => (
                  <button
                    key={qf.label}
                    type="button"
                    onClick={() => setFeedback(qf.text)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition hover:scale-105 ${qf.cls}`}
                  >
                    {qf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Detailed Feedback Textarea */}
            <div className="space-y-1.5">
              <label htmlFor="feedback-input" className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 block">
                Lời Nhận Xét Chi Tiết:
              </label>
              <textarea
                id="feedback-input"
                rows={5}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Nhập góp ý sửa lỗi ngữ pháp, thanh điệu, biểu dương học viên..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none font-sans leading-relaxed"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => handleGradeSubmit(true)}
                disabled={grading || !selectedSub}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition shadow-lg shadow-emerald-600/30 text-xs flex items-center justify-center gap-2"
              >
                <IconCheck />
                <span>{grading ? "Đang Lưu..." : "Lưu Điểm & Chuyển Tiếp (Ctrl+Enter)"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleGradeSubmit(false)}
                disabled={grading || !selectedSub}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold py-2 rounded-xl text-xs transition border border-slate-300 dark:border-white/10 flex items-center justify-center gap-1.5"
              >
                <span>Chỉ Lưu Điểm (Không Chuyển Bài)</span>
                <IconArrowRight />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
