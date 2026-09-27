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

function isImageSubmission(fileName) {
  return /\.(?:jpe?g|png|webp|gif)$/i.test(String(fileName || ""));
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
  const [rubricScores, setRubricScores] = useState([]);
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
      setRubricScores(rows[0]?.rubric?.map((criterion) => {
        const saved = (rows[0]?.rubricScores || []).find((item) => item.criterionId === criterion.id);
        return { criterionId: criterion.id, score: saved?.score ?? 0, feedback: saved?.feedback || "" };
      }) || []);
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
    setRubricScores((sub.rubric || []).map((criterion) => {
      const saved = (sub.rubricScores || []).find((item) => item.criterionId === criterion.id);
      return { criterionId: criterion.id, score: saved?.score ?? 0, feedback: saved?.feedback || "" };
    }));
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

      const numScore = (selectedSub.rubric || []).length
        ? rubricScores.reduce((total, item) => total + (Number(item.score) || 0), 0)
        : Number(score);
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
          rubricScores: selectedSub.rubric?.length ? rubricScores : undefined,
        });

        if (res?.success !== false) {
          toast.success(`Đã lưu điểm cho ${selectedSub.studentName}: ${numScore}/${maxScore} điểm! 🎉`);

          // Update local list
          setSubmissions((prev) =>
            prev.map((s) =>
              s.id === selectedSub.id
                ? { ...s, status: "graded", score: numScore, feedbackText: feedback, rubricScores }
                : s
            )
          );
          setSelectedSub((prev) => ({
            ...prev,
            status: "graded",
            score: numScore,
            feedbackText: feedback,
            rubricScores,
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
    [selectedSub, score, feedback, rubricScores, filteredSubs, handleSelectSub]
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
    <div className="min-h-screen bg-slate-100 pb-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">KHU VỰC GIÁO VIÊN</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Chấm bài</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Chọn bài nộp, xem bài làm, nhập điểm rồi lưu. Bài tiếp theo sẽ tự mở.
            </p>
            {requestedSessionId && (
              <p className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-300">Đang lọc bài tập của buổi học đã chọn.</p>
            )}
          </div>
          <div className="flex gap-2 self-start lg:self-auto">
            <div className="min-w-24 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Cần chấm</p>
              <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{stats.pending}</p>
            </div>
            <div className="min-w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Đã chấm</p>
              <p className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{stats.graded}</p>
            </div>
            <div className="hidden min-w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center sm:block dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Điểm TB</p>
              <p className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{stats.avgScore}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside aria-label="Danh sách bài nộp" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Bài nộp</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{filteredSubs.length} bài theo bộ lọc</p>
              </div>
              <button
                type="button"
                onClick={() => setSortByDeadline((current) => (current === "asc" ? "desc" : "asc"))}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Đổi thứ tự theo ngày nộp"
              >
                {sortByDeadline === "asc" ? "Gần nhất" : "Xa nhất"}
              </button>
            </div>

            <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-[11px] font-semibold dark:bg-slate-950">
              {[
                { id: "pending", label: `Cần chấm ${stats.pending}` },
                { id: "graded", label: `Đã chấm ${stats.graded}` },
                { id: "all", label: `Tất cả ${stats.total}` },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setFilterStatus(filter.id)}
                  className={`rounded-lg px-1 py-2 transition ${
                    filterStatus === filter.id
                      ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm học viên hoặc bài tập"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            <details className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
              <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">Lọc theo lớp hoặc loại bài</summary>
              <div className="mt-2 grid gap-2">
                <select value={filterClass} onChange={(event) => setFilterClass(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  <option value="all">Tất cả lớp</option>
                  {[...new Map(submissions.filter((sub) => sub.classId).map((sub) => [sub.classId, sub.classTitle || `Lớp #${sub.classId}`]))].map(([classId, classTitle]) => (
                    <option key={classId} value={classId}>{classTitle}</option>
                  ))}
                </select>
                <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  <option value="all">Mọi loại bài</option>
                  <option value="homework">Bài tự luận</option>
                  <option value="hskk">Khẩu ngữ HSKK</option>
                  <option value="quiz">Trắc nghiệm</option>
                </select>
              </div>
            </details>

            <div className="mt-3 max-h-[calc(100vh-315px)] space-y-1.5 overflow-y-auto pr-1">
              {loading ? (
                <Loading loading={true} text="Đang tải bài nộp..." fullScreen={false} className="py-10" />
              ) : filteredSubs.length === 0 ? (
                <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  Không có bài nộp phù hợp.
                </div>
              ) : (
                filteredSubs.map((sub) => {
                  const selected = selectedSub?.id === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSelectSub(sub)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500/20 dark:bg-emerald-950/20"
                          : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {sub.studentAvatar ? <img src={sub.studentAvatar} alt="" className="h-full w-full object-cover" /> : <IconUser />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{sub.studentName}</span>
                            <span className={`shrink-0 text-xs font-semibold ${sub.status === "graded" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                              {sub.status === "graded" ? `${sub.score}/${sub.maxScore || 10}` : "Mới"}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{sub.assignmentTitle}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                            <span>{getTypeBadge(sub.assignmentType).label}</span>
                            <span className="flex items-center gap-1"><IconClock />{new Date(sub.submittedAt).toLocaleDateString("vi-VN")}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section aria-label="Bài làm và biểu mẫu chấm" className="min-w-0">
            {!selectedSub ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl dark:bg-slate-800">✓</div>
                <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">Chưa có bài để chấm</h2>
                <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">Khi học viên nộp bài, bài làm sẽ xuất hiện trong danh sách bên trái để bạn xem và chấm tại đây.</p>
              </div>
            ) : (
              <>
                <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{selectedSub.classTitle || "CSCA-LMS"}</span>
                        {selectedSub.sessionTitle && <><span>•</span><span>{selectedSub.sessionTitle}</span></>}
                        {selectedSub.status === "late" && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Nộp muộn</span>}
                      </div>
                      <h2 className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">{selectedSub.assignmentTitle}</h2>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">{selectedSub.studentName}</span>{selectedSub.studentEmail && <span className="text-slate-400"> · {selectedSub.studentEmail}</span>}</p>
                    </div>
                    {selectedSub.status === "graded" && <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Đã chấm<br /><span className="text-lg">{selectedSub.score}/{selectedSub.maxScore || 10}</span></span>}
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
                  <article className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Bài làm của học viên</h3>
                    </div>
                    <div className="space-y-5 p-5">
                      {selectedSub.contentText && (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Nội dung tự luận</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{countChineseChars(selectedSub.contentText)} chữ Hán</p>
                          </div>
                          <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-800 dark:bg-slate-950 dark:text-slate-200">{selectedSub.contentText}</div>
                        </div>
                      )}

                      {selectedSub.fileUrl && (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tệp đính kèm</p>
                            <a href={selectedSub.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300">Mở toàn màn hình</a>
                          </div>
                          {isImageSubmission(selectedSub.fileName) ? (
                            <a href={selectedSub.fileUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                              <img src={selectedSub.fileUrl} alt={`Bài làm ảnh của ${selectedSub.studentName}`} className="max-h-[44rem] w-full object-contain" />
                            </a>
                          ) : (
                            <a href={selectedSub.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                              <IconFile /> <span className="truncate">{selectedSub.fileName || "Mở tệp bài làm"}</span>
                            </a>
                          )}
                        </div>
                      )}

                      {selectedSub.audioUrl && (
                        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><IconMic /> Bài nói HSKK</span>
                            <div className="flex gap-1 text-xs">
                              {[0.75, 1, 1.25, 1.5].map((rate) => <button key={rate} type="button" onClick={() => { setPlaybackRate(rate); const audio = document.getElementById("hskk-audio-player"); if (audio) audio.playbackRate = rate; }} className={`rounded-md px-2 py-1 ${playbackRate === rate ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"}`}>{rate}×</button>)}
                            </div>
                          </div>
                          <audio id="hskk-audio-player" src={selectedSub.audioUrl} controls className="w-full" />
                        </div>
                      )}

                      {!selectedSub.contentText && !selectedSub.fileUrl && !selectedSub.audioUrl && <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Học viên đã hoàn thành bài này. Không có nội dung bổ sung để xem.</p>}
                    </div>
                  </article>

                  <aside aria-label="Nhập điểm và nhận xét" className="self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ghi điểm & nhận xét</h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Lưu nhanh: Ctrl + Enter</p>
                    </div>

                    {(selectedSub.rubric || []).length > 0 ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-700 dark:text-slate-200">Chấm theo tiêu chí</p><p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{rubricScores.reduce((total, item) => total + (Number(item.score) || 0), 0)}/{selectedSub.maxScore}</p></div>
                        {selectedSub.rubric.map((criterion) => {
                          const item = rubricScores.find((entry) => entry.criterionId === criterion.id) || { criterionId: criterion.id, score: 0, feedback: "" };
                          return <div key={criterion.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{criterion.title}</p>{criterion.description && <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{criterion.description}</p>}</div><label className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><input type="number" min="0" max={criterion.maxPoints} step="0.25" value={item.score} onChange={(event) => setRubricScores((current) => current.map((entry) => entry.criterionId === criterion.id ? { ...entry, score: event.target.value } : entry))} className="w-14 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-center font-semibold text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />/{criterion.maxPoints}</label></div><input value={item.feedback} onChange={(event) => setRubricScores((current) => current.map((entry) => entry.criterionId === criterion.id ? { ...entry, feedback: event.target.value } : entry))} maxLength={4000} placeholder="Nhận xét tiêu chí này (nếu có)" className="mt-2 w-full border-b border-slate-200 bg-transparent pb-1 text-xs outline-none placeholder:text-slate-400 focus:border-emerald-500 dark:border-slate-700 dark:text-slate-200" /></div>;
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                        <label htmlFor="score-input" className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng điểm</label>
                        <div className="mt-1 flex items-end gap-2"><input id="score-input" type="number" min="0" max={selectedSub.maxScore || 10} step="0.25" value={score} onChange={(event) => setScore(event.target.value)} className="w-24 border-b-2 border-slate-300 bg-transparent pb-1 text-3xl font-bold tabular-nums text-slate-950 outline-none focus:border-emerald-500 dark:border-slate-600 dark:text-white" /><span className="pb-2 text-sm text-slate-500">/ {selectedSub.maxScore || 10}</span></div>
                        <div className="mt-3 grid grid-cols-6 gap-1">{[0, 5, 7, 8, 9, 10].filter((value) => value <= (selectedSub.maxScore || 10)).map((value) => <button key={value} type="button" onClick={() => setScore(value)} className={`rounded-md py-1.5 text-xs font-medium ${Number(score) === value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{value}</button>)}</div>
                      </div>
                    )}

                    <div className="mt-5">
                      <div className="flex items-center justify-between gap-2"><label htmlFor="feedback-input" className="text-sm font-medium text-slate-800 dark:text-slate-100">Nhận xét cho học viên</label><span className="text-[11px] text-slate-400">Tùy chọn</span></div>
                      <textarea id="feedback-input" rows={7} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Viết nhận xét ngắn, rõ ràng và hướng dẫn học viên cần cải thiện gì..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">Chèn mẫu nhận xét nhanh</summary>
                        <div className="mt-2 flex flex-wrap gap-1.5">{QUICK_FEEDBACK.map((template) => <button key={template.label} type="button" onClick={() => setFeedback((current) => current.trim() ? `${current.trim()}\n${template.text}` : template.text)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200">{template.label}</button>)}</div>
                      </details>
                    </div>

                    <div className="mt-5 space-y-2">
                      <button type="button" onClick={() => handleGradeSubmit(true)} disabled={grading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><IconCheck />{grading ? "Đang lưu..." : "Lưu điểm & chuyển bài tiếp"}</button>
                      <button type="button" onClick={() => handleGradeSubmit(false)} disabled={grading} className="w-full rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">Lưu điểm, chưa chuyển bài</button>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
