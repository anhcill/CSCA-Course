/* eslint-disable react/prop-types, no-unused-vars */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArchive,
  FiAward,
  FiBarChart2,
  FiBookOpen,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiClipboard,
  FiDownload,
  FiEdit3,
  FiFileText,
  FiFilter,
  FiLayers,
  FiMinus,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiTrash2,
  FiUserCheck,
  FiUserX,
  FiUsers,
  FiX,
  FiZap,
} from "react-icons/fi";
import { EmptyState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";
import QuestionBankSampler from "../components/QuestionBankSampler";
import FileUploadProgressBox from "../../../components/common/FileUploadProgressBox.jsx";
import TeacherQuizGradingModal from "../components/TeacherQuizGradingModal";
import {
  createTeacherQuiz,
  createQuestionBankItem,
  archiveTeacherQuiz,
  deleteTeacherQuiz,
  fetchAdminCourses,
  fetchClassDetails,
  fetchQuestionBank,
  fetchTeacherQuizTargets,
  fetchTeacherQuizzes,
  fetchTeacherQuizReport,
  uploadCourseQuizPaper,
  deleteTeacherFile,
} from "../../api/lmsClient";
import {
  optionIndexForQuizKey,
  parseQuizAnswerKey,
  parseQuizDescription,
  formatQuizDescription,
  QUIZ_OPTION_KEYS,
} from "../utils/quizAnswerKey";

const createBlankQuestion = () => ({
  id: `question-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: 0,
  explanation: "",
  points: 1,
});

const createPaperQuestion = (index) => ({
  ...createBlankQuestion(),
  questionText: `Câu ${index + 1} — xem nội dung trong file đề PDF.`,
  options: ["A", "B", "C", "D"],
});

const optionKeyAt = (index) => QUIZ_OPTION_KEYS[index] || String(index + 1);

const formatSessionTarget = (session) => {
  if (!session?.startTime) return session?.title || "Buổi học";
  const date = new Date(session.startTime);
  return `${date.toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${session.title || "Buổi học"}`;
};

const formatQuizSession = (quiz) => quiz?.sessionStart
  ? new Date(quiz.sessionStart).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "Chưa gắn buổi học";

const isQuizExpired = (quiz, now = new Date()) => {
  if (!quiz) return false;
  if (quiz.status === "DRAFT") return false;
  if (quiz.status === "ARCHIVED") return true;

  if (quiz.availableUntil) {
    const until = new Date(quiz.availableUntil);
    if (!isNaN(until.getTime()) && until < now) return true;
  }

  if (quiz.activityScope === "homework") {
    if (quiz.dueDate) {
      const due = new Date(quiz.dueDate);
      if (!isNaN(due.getTime()) && due < now) return true;
    }
  } else {
    if (quiz.sessionEnd) {
      const end = new Date(quiz.sessionEnd);
      if (!isNaN(end.getTime()) && end < now) return true;
    } else if (quiz.sessionStart) {
      const start = new Date(quiz.sessionStart);
      if (!isNaN(start.getTime()) && start < now) return true;
    }
  }

  return false;
};

const normalizeQuestionForSubmit = (question, index = 0, mode = "manual") => {
  const isEssay = question?.type === "essay" || Boolean(question?.isEssay);
  if (isEssay) {
    return {
      questionText: String(question?.questionText || `Câu ${index + 1} — xem nội dung tự luận trong đề.`).trim(),
      type: "essay",
      options: [],
      correctAnswer: null,
      explanation: String(question?.explanation || "").trim(),
      points: Number(question?.points) || 2,
    };
  }

  let rawOptions = Array.isArray(question?.options) ? question.options : [];
  let options = rawOptions
    .map((text, originalIndex) => ({ text: String(text || "").trim(), originalIndex }))
    .filter((option) => option.text);

  if (options.length < 2 && (mode === "paper" || !options.length || String(question?.questionText || "").includes("PDF"))) {
    options = ["A", "B", "C", "D"].map((text, originalIndex) => ({ text, originalIndex }));
  }

  let correctAnswer = options.findIndex((option) => option.originalIndex === question?.correctAnswer);
  if (correctAnswer === -1 && options.length > 0) {
    if (typeof question?.correctAnswer === "number" && question.correctAnswer >= 0 && question.correctAnswer < options.length) {
      correctAnswer = question.correctAnswer;
    } else {
      correctAnswer = 0;
    }
  }

  return {
    questionText: String(question?.questionText || `Câu ${index + 1}`).trim(),
    type: "single",
    options: options.map((option) => option.text),
    correctAnswer,
    explanation: String(question?.explanation || "").trim(),
    points: Number(question?.points) || 1,
  };
};

function AnswerKeySheet({ questions, onChooseAnswer, onScrollToQuestion, onToggleEssay, onUpdatePoints }) {
  const maxOptions = Math.max(4, ...questions.map((q) => q.options?.length || 4));
  const visibleKeys = QUIZ_OPTION_KEYS.slice(0, Math.min(maxOptions, 6));

  return (
    <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
      <div
        className="grid min-w-[320px] items-center gap-y-1.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200"
        style={{ gridTemplateColumns: `84px repeat(${visibleKeys.length}, minmax(32px, 1fr))` }}
      >
        <span className="text-[10px] font-black uppercase text-slate-400">Câu / Loại</span>
        {visibleKeys.map((key) => (
          <span key={key} className="text-xs font-black text-violet-700 dark:text-violet-300">
            {key}
          </span>
        ))}
        {questions.map((question, index) => {
          const isEssay = Boolean(question.isEssay || question.type === "essay");
          return (
            <div className="contents" key={question.id || `q-${index}`}>
              <div className="flex items-center justify-between pr-1 gap-1">
                <button
                  type="button"
                  onClick={() => onScrollToQuestion?.(index)}
                  className="font-black text-slate-700 hover:text-violet-600 dark:text-slate-200 text-[11px] truncate"
                  title={`Đi tới câu ${index + 1}`}
                >
                  Câu {index + 1}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleEssay?.(index)}
                  title={isEssay ? "Đang là Tự luận. Bấm để đổi thành Trắc nghiệm" : "Đang là Trắc nghiệm. Bấm để đổi thành Tự luận"}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase transition shrink-0 ${
                    isEssay
                      ? "bg-amber-500 text-white shadow-2xs hover:bg-amber-600"
                      : "bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-amber-950/50"
                  }`}
                >
                  {isEssay ? "✍️ TL" : "TN"}
                </button>
              </div>

              {isEssay ? (
                <div
                  className="flex items-center justify-between gap-1.5 rounded-lg border border-amber-300 bg-amber-50/90 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  style={{ gridColumn: `span ${visibleKeys.length}` }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="shrink-0 text-amber-600 dark:text-amber-400 text-xs">✍️</span>
                    <span className="truncate text-[10px] text-amber-800 dark:text-amber-300 font-extrabold">
                      Tự luận (Học sinh nộp ảnh bài làm)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Điểm:</span>
                    <input
                      type="number"
                      min="0.25"
                      max="50"
                      step="0.25"
                      value={question.points ?? 2}
                      onChange={(e) => onUpdatePoints?.(index, e.target.value)}
                      className="h-5 w-12 rounded border border-amber-300 bg-white px-1 text-center text-[11px] font-black text-amber-900 focus:border-amber-500 focus:outline-none dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                      title="Nhập số điểm cho câu tự luận này"
                    />
                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">đ</span>
                  </div>
                </div>
              ) : (
                visibleKeys.map((key) => {
                  const optionIndex = optionIndexForQuizKey(key);
                  const exists = optionIndex < (question.options?.length || 4);
                  const active = question.correctAnswer === optionIndex;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!exists}
                      onClick={() => onChooseAnswer(index, optionIndex)}
                      aria-label={`Câu ${index + 1}, chọn đáp án ${key}`}
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-black transition-all disabled:cursor-not-allowed disabled:opacity-20 ${
                        active
                          ? "border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-600/30 scale-105"
                          : "border-slate-300 bg-white text-slate-600 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-violet-950/30"
                      }`}
                    >
                      {key}
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuizStatsModal({ quiz, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [tabFilter, setTabFilter] = useState("all"); // "all" | "submitted" | "not_started"
  const [search, setSearch] = useState("");
  const [selectedAttemptForGrading, setSelectedAttemptForGrading] = useState(null);
  const suggestedFilterAppliedRef = useRef(false);

  const essayConfig = useMemo(() => quiz?.essayConfig || parseQuizDescription(quiz?.description)?.essayConfig, [quiz]);

  const loadReport = useCallback(async () => {
    if (!quiz?.id) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetchTeacherQuizReport(quiz.id);
      if (res?.success && res?.data) {
        setData(res.data);
      } else {
        throw new Error(res?.message || "Không thể tải báo cáo");
      }
    } catch (err) {
      console.error("Không thể tải báo cáo quiz:", err);
      setData(null);
      setLoadError(err?.message || "Không thể tải báo cáo chi tiết của quiz này.");
    } finally {
      setLoading(false);
    }
  }, [quiz]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const summary = data?.summary || {
    totalStudents: 0,
    submittedCount: 0,
    unsubmittedCount: 0,
    inProgressCount: 0,
    submissionRate: 0,
    avgScore: null,
    maxScore: null,
    minScore: null,
    passedCount: 0,
    failedCount: 0,
    distribution: { excellent: 0, good: 0, average: 0, weak: 0 },
  };

  const students = useMemo(() => data?.students || [], [data?.students]);
  const pendingEssayCount = useMemo(
    () => students.filter((student) => student.status === "submitted" && student.hasEssay && !student.essayGrade).length,
    [students],
  );
  const gradedEssayCount = useMemo(
    () => students.filter((student) => student.status === "submitted" && student.hasEssay && student.essayGrade).length,
    [students],
  );
  useEffect(() => {
    if (!suggestedFilterAppliedRef.current && pendingEssayCount > 0) {
      suggestedFilterAppliedRef.current = true;
      setTabFilter("pending_grading");
    }
  }, [pendingEssayCount]);
  const passRate = summary.submittedCount > 0
    ? Math.round((summary.passedCount / summary.submittedCount) * 100)
    : null;
  const distributionItems = [
    { key: "excellent", label: "Xuất sắc", range: "≥ 80%", value: summary.distribution?.excellent || 0, color: "#10b981" },
    { key: "good", label: "Khá", range: "65–79%", value: summary.distribution?.good || 0, color: "#3b82f6" },
    { key: "average", label: "Trung bình", range: "50–64%", value: summary.distribution?.average || 0, color: "#f59e0b" },
    { key: "weak", label: "Cần cố gắng", range: "< 50%", value: summary.distribution?.weak || 0, color: "#f43f5e" },
  ];
  const distributionTotal = distributionItems.reduce((total, item) => total + item.value, 0);
  let distributionCursor = 0;
  const donutSegments = distributionItems
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = distributionCursor;
      distributionCursor += (item.value / Math.max(distributionTotal, 1)) * 100;
      return `${item.color} ${start}% ${distributionCursor}%`;
    });
  const donutBackground = donutSegments.length
    ? `conic-gradient(${donutSegments.join(", ")})`
    : "conic-gradient(#cbd5e1 0 100%)";

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (tabFilter === "pending_grading" && !(s.status === "submitted" && s.hasEssay && !s.essayGrade)) return false;
      if (tabFilter === "submitted" && s.status !== "submitted") return false;
      if (tabFilter === "not_started" && s.status !== "not_started") return false;
      if (tabFilter === "in_progress" && s.status !== "in_progress") return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const nameMatch = (s.fullName || "").toLowerCase().includes(q);
        const userMatch = (s.username || "").toLowerCase().includes(q);
        const emailMatch = (s.email || "").toLowerCase().includes(q);
        if (!nameMatch && !userMatch && !emailMatch) return false;
      }
      return true;
    }).sort((a, b) => {
      const aPending = a.status === "submitted" && a.hasEssay && !a.essayGrade ? 1 : 0;
      const bPending = b.status === "submitted" && b.hasEssay && !b.essayGrade ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      return String(a.fullName || a.username || "").localeCompare(String(b.fullName || b.username || ""), "vi");
    });
  }, [students, tabFilter, search]);

  const gradingQueue = useMemo(
    () => students
      .filter((student) => student.status === "submitted" && student.attemptId)
      .sort((a, b) => {
        const aPending = a.hasEssay && !a.essayGrade ? 1 : 0;
        const bPending = b.hasEssay && !b.essayGrade ? 1 : 0;
        if (aPending !== bPending) return bPending - aPending;
        return String(a.fullName || a.username || "").localeCompare(String(b.fullName || b.username || ""), "vi");
      }),
    [students],
  );
  const selectedGradingIndex = selectedAttemptForGrading
    ? gradingQueue.findIndex((student) => student.attemptId === selectedAttemptForGrading.attemptId)
    : -1;

  const handleExportCSV = () => {
    if (!students.length) {
      toast.error("Không có dữ liệu học viên để xuất file");
      return;
    }
    const headers = [
      "STT",
      "Họ và tên",
      "Tên đăng nhập",
      "Email",
      "Trạng thái",
      "Điểm số",
      "Điểm tối đa",
      "Tỷ lệ (%)",
      "Kết quả",
      "Số lượt làm",
      "Thời gian nộp bài",
    ];

    const rows = students.map((s, idx) => {
      const statusText = s.status === "submitted" ? "Đã nộp bài" : (s.status === "in_progress" ? "Đang làm bài" : "Chưa làm bài");
      const resultText = s.status === "submitted" ? (s.passed ? "ĐẠT" : "CHƯA ĐẠT") : "CHƯA NỘP";
      const submittedTime = s.submittedAt ? new Date(s.submittedAt).toLocaleString("vi-VN") : "";
      return [
        idx + 1,
        `"${(s.fullName || "").replace(/"/g, '""')}"`,
        `"${(s.username || "").replace(/"/g, '""')}"`,
        `"${(s.email || "").replace(/"/g, '""')}"`,
        `"${statusText}"`,
        s.score !== null ? s.score : "",
        s.maxScore !== null ? s.maxScore : "",
        s.scorePercentage !== null ? `${s.scorePercentage}%` : "",
        `"${resultText}"`,
        s.attemptNumber || (s.status === "submitted" ? 1 : 0),
        `"${submittedTime}"`,
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanTitle = (quiz.title || "quiz").replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9-]/g, "_");
    link.setAttribute("href", url);
    link.setAttribute("download", `Bao_cao_quiz_${cleanTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Đã xuất file báo cáo điểm thành công!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-report-title"
        className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:border sm:border-slate-200 sm:dark:border-slate-800"
      >
        {/* Header Modal */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/20">
              <FiBarChart2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="quiz-report-title" className="truncate text-base font-black text-slate-950 dark:text-white sm:text-lg">
                  {quiz.title}
                </h2>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                  quiz.status === "PUBLISHED"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}>
                  {quiz.status === "PUBLISHED" ? "ĐANG CÔNG BỐ" : quiz.status === "ARCHIVED" ? "ĐÃ LƯU TRỮ" : "BẢN NHÁP"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {quiz.courseTitle} · {quiz.classTitle} {quiz.sessionTitle ? `· ${quiz.sessionTitle}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={loading || !students.length}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
              title="Xuất file Excel/CSV danh sách điểm"
            >
              <FiDownload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span className="hidden sm:inline">Xuất Excel</span>
            </button>
            <button
              type="button"
              onClick={loadReport}
              disabled={loading}
              className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              title="Làm mới dữ liệu"
            >
              <FiRefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition"
              aria-label="Đóng"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <Loading loading text="Đang tải dữ liệu thống kê kết quả học viên..." fullScreen={false} className="py-20" />
          ) : loadError ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-rose-200 bg-rose-50/70 px-6 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
              <FiAlertCircle className="h-10 w-10 text-rose-500" />
              <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white">Không tải được dữ liệu chấm bài</h3>
              <p className="mt-1 max-w-lg text-xs leading-5 text-slate-600 dark:text-slate-300">{loadError}</p>
              <button type="button" onClick={loadReport} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-black text-white hover:bg-sky-700">
                <FiRefreshCw className="h-3.5 w-3.5" /> Thử tải lại
              </button>
            </div>
          ) : (
            <>
              {/* Tổng quan gọn: điểm trung bình là tâm của biểu đồ phân bố. */}
              <section aria-labelledby="quiz-overview-title" className="border-b border-slate-200 pb-6 dark:border-slate-800">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 id="quiz-overview-title" className="text-sm font-black text-slate-950 dark:text-white">Tổng quan kết quả</h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Cập nhật từ {summary.submittedCount} bài đã nộp
                    </p>
                  </div>
                  {summary.inProgressCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                      <FiClock className="h-3.5 w-3.5" /> {summary.inProgressCount} học viên đang làm bài
                    </span>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-center">
                  <div className="grid grid-cols-2 border-y border-slate-200 dark:border-slate-800 sm:grid-cols-5">
                    {[
                      { label: "Học viên", value: summary.totalStudents, detail: "Sĩ số lớp", color: "text-slate-950 dark:text-white" },
                      { label: "Đã nộp", value: summary.submittedCount, detail: `${summary.submissionRate}% hoàn thành`, color: "text-emerald-600 dark:text-emerald-400" },
                      { label: "Cần chấm", value: pendingEssayCount, detail: `${gradedEssayCount} bài tự luận đã chấm`, color: pendingEssayCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400" },
                      { label: "Chưa làm", value: summary.unsubmittedCount, detail: "Cần nhắc nhở", color: "text-rose-600 dark:text-rose-400" },
                      { label: "Đạt chuẩn", value: passRate === null ? "—" : `${passRate}%`, detail: `${summary.passedCount}/${summary.submittedCount} bài ≥ ${quiz.passingScore || 60}%`, color: "text-amber-600 dark:text-amber-400" },
                    ].map((metric, index) => (
                      <div
                        key={metric.label}
                        className={`py-3 ${index % 2 === 0 ? "pr-3" : "border-l border-slate-200 pl-3 dark:border-slate-800"} ${index > 1 ? "border-t border-slate-200 dark:border-slate-800 sm:border-t-0" : ""} sm:px-4 sm:first:pl-0 sm:last:pr-0 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-slate-200 sm:dark:[&:not(:first-child)]:border-slate-800`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                        <p className={`mt-1 text-2xl font-black tabular-nums ${metric.color}`}>{metric.value}</p>
                        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400" title={metric.detail}>{metric.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-5 sm:gap-8">
                    <div
                      className="relative h-32 w-32 shrink-0 rounded-full sm:h-36 sm:w-36"
                      style={{ background: donutBackground }}
                      role="img"
                      aria-label={`Điểm trung bình ${summary.avgScore !== null ? `${summary.avgScore}%` : "chưa có"}; phân bố ${distributionItems.map((item) => `${item.label} ${item.value}`).join(", ")}`}
                    >
                      <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner dark:bg-slate-900">
                        <span className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">
                          {summary.avgScore !== null ? `${summary.avgScore}%` : "—"}
                        </span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">Điểm TB</span>
                        {summary.maxScore !== null && (
                          <span className="mt-1 text-[9px] font-semibold text-slate-400">Cao nhất {summary.maxScore}%</span>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      {distributionItems.map((item) => (
                        <div key={item.key} className="flex items-center gap-2 text-xs">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-300">
                            {item.label} <span className="font-medium text-slate-400">{item.range}</span>
                          </span>
                          <b className="font-black tabular-nums text-slate-950 dark:text-white">{item.value}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Danh sách học viên và bộ lọc */}
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Tabs lọc trạng thái */}
                  <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setTabFilter("pending_grading")}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        tabFilter === "pending_grading"
                          ? "bg-white text-amber-700 shadow-sm dark:bg-slate-900 dark:text-amber-400"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      Cần chấm tự luận ({pendingEssayCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabFilter("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        tabFilter === "all"
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      Tất cả ({summary.totalStudents})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabFilter("submitted")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        tabFilter === "submitted"
                          ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      Đã nộp bài ({summary.submittedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabFilter("not_started")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        tabFilter === "not_started"
                          ? "bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-400"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      Chưa làm ({summary.unsubmittedCount})
                    </button>
                    {summary.inProgressCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setTabFilter("in_progress")}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                          tabFilter === "in_progress"
                            ? "bg-white text-amber-700 shadow-sm dark:bg-slate-900 dark:text-amber-400"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        Đang làm ({summary.inProgressCount})
                      </button>
                    )}
                  </div>

                  {/* Tìm kiếm */}
                  <div className="relative w-full sm:w-64">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm tên hoặc username..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs font-medium outline-none focus:border-sky-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition"
                    />
                  </div>
                </div>

                {/* Bảng danh sách học viên */}
                {filteredStudents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 dark:border-slate-800">
                    <p className="text-xs font-semibold">Không tìm thấy học viên nào phù hợp với bộ lọc.</p>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold text-slate-400 md:hidden">Vuốt ngang để xem đầy đủ thông tin và thao tác.</p>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <table className="w-full min-w-[860px] text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                          <th className="py-3 px-3.5 text-center w-12">STT</th>
                          <th className="py-3 px-3.5">Học viên</th>
                          <th className="py-3 px-3.5 text-center">Trạng thái</th>
                          <th className="py-3 px-3.5 text-center">Điểm số</th>
                          <th className="py-3 px-3.5 text-center">Số lượt</th>
                          <th className="py-3 px-3.5">Thời gian nộp</th>
                          <th className="py-3 px-3.5 text-center">Đánh giá</th>
                          <th className="py-3 px-3.5 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {filteredStudents.map((student, index) => {
                          const isSubmitted = student.status === "submitted";
                          const isInProgress = student.status === "in_progress";
                          const score = student.scorePercentage;
                          let perfLevel = "Chưa làm bài";
                          let perfColor = "text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-400";
                          if (isSubmitted && score !== null) {
                            if (score >= 80) {
                              perfLevel = "Xuất sắc";
                              perfColor = "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
                            } else if (score >= 65) {
                              perfLevel = "Khá";
                              perfColor = "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
                            } else if (score >= 50) {
                              perfLevel = "Trung bình";
                              perfColor = "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
                            } else {
                              perfLevel = "Cần cố gắng";
                              perfColor = "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
                            }
                          }

                          return (
                            <tr key={student.userId || index} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition">
                              <td className="py-3 px-3.5 text-center font-mono text-[11px] text-slate-400 font-bold">
                                {index + 1}
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-2.5">
                                  {student.avatarUrl ? (
                                    <img
                                      src={student.avatarUrl}
                                      alt={student.fullName}
                                      className="h-8 w-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 font-black text-violet-700 dark:bg-violet-950 dark:text-violet-300 text-xs">
                                      {(student.fullName || "H")[0]?.toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 dark:text-white truncate">
                                      {student.fullName}
                                    </div>
                                    <div className="text-[11px] text-slate-400 truncate">
                                      @{student.username} {student.email ? `· ${student.email}` : ""}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                {isSubmitted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                                    <FiCheckCircle className="h-3 w-3" /> Đã nộp bài
                                  </span>
                                ) : isInProgress ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300">
                                    <FiClock className="h-3 w-3" /> Đang làm
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                                    <FiAlertTriangle className="h-3 w-3" /> Chưa làm
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                {isSubmitted && score !== null ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="font-black font-mono text-sm text-slate-950 dark:text-white">
                                      {score}%
                                    </span>
                                    {student.score !== null && student.maxScore !== null && (
                                      <span className="text-[10px] font-medium text-slate-400">
                                        ({student.score}/{student.maxScore}đ)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-600 dark:text-slate-300">
                                {student.totalAttempts || (isSubmitted ? 1 : 0)}
                              </td>
                              <td className="py-3 px-3.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {student.submittedAt
                                  ? new Date(student.submittedAt).toLocaleString("vi-VN", {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })
                                  : isSubmitted
                                    ? "Đã nộp"
                                    : "Chưa nộp bài"}
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <span className={`inline-block rounded-lg px-2 py-0.5 text-[10px] font-black border ${perfColor}`}>
                                  {perfLevel}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                {isSubmitted && student.attemptId ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAttemptForGrading(student)}
                                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-bold shadow-xs transition ${
                                      student.hasEssay && !student.essayGrade
                                        ? "bg-amber-600 text-white hover:bg-amber-500 animate-pulse"
                                        : student.essayGrade
                                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                        : "bg-violet-600 text-white hover:bg-violet-500"
                                    }`}
                                    title="Xem chi tiết bài làm & chấm điểm tự luận"
                                  >
                                    <FiEdit3 className="h-3 w-3" />
                                    {student.hasEssay
                                      ? student.essayGrade
                                        ? `Tự luận: +${student.essayGrade.score}đ`
                                        : "Chấm tự luận"
                                      : "Xem bài làm"}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/70 sm:px-6">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tổng cộng: <b>{filteredStudents.length}</b> / {summary.totalStudents} học viên
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-black text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* TEACHER ESSAY & QUIZ ATTEMPT GRADING MODAL */}
      {selectedAttemptForGrading && (
        <TeacherQuizGradingModal
          isOpen={Boolean(selectedAttemptForGrading)}
          onClose={() => setSelectedAttemptForGrading(null)}
          quizId={quiz.id}
          student={selectedAttemptForGrading}
          essayMaxScore={essayConfig?.maxScore || 3}
          positionLabel={selectedGradingIndex >= 0 ? `${selectedGradingIndex + 1}/${gradingQueue.length}` : ""}
          onPrevious={selectedGradingIndex > 0 ? () => setSelectedAttemptForGrading(gradingQueue[selectedGradingIndex - 1]) : null}
          onNext={selectedGradingIndex >= 0 && selectedGradingIndex < gradingQueue.length - 1
            ? () => setSelectedAttemptForGrading(gradingQueue[selectedGradingIndex + 1])
            : null}
          onGraded={(updatedStudent) => {
            setData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                students: prev.students.map((s) => (s.userId === updatedStudent.userId ? { ...s, ...updatedStudent } : s)),
              };
            });
            loadReport();
          }}
        />
      )}
    </div>
  );
}

export default function TeacherQuizPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizEditorBasePath = location.pathname.startsWith("/admin/")
    ? "/admin/quizzes"
    : "/lms/teacher/quizzes";
  const openNewQuizEditor = () => navigate(`${quizEditorBasePath}/new`);
  const openQuizEditor = (quizId) => navigate(`${quizEditorBasePath}/${quizId}/edit`);
  const requestedClassId = searchParams.get("classId");
  const requestedSessionId = searchParams.get("sessionId");
  const requestedScope = searchParams.get("scope") === "homework" ? "homework" : "session";
  const shouldOpenBuilder = searchParams.get("new") === "1";
  const quickCreateHandledRef = useRef(false);

  // Tab state: "assigned" | "create"
  const [activeTab, setActiveTab] = useState(
    shouldOpenBuilder || requestedClassId ? "create" : "assigned"
  );

  const [quizzes, setQuizzes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [targetClasses, setTargetClasses] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPaper, setUploadingPaper] = useState(false);

  // Filter & Search states for Assigned Quizzes
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiryTab, setExpiryTab] = useState("active"); // "active" | "expired" | "all"

  // Selected quiz for statistics modal
  const [selectedQuizForStats, setSelectedQuizForStats] = useState(null);

  // Builder States
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDesc, setQuizDesc] = useState("");
  const [quizMode, setQuizMode] = useState("manual");
  const [courseId, setCourseId] = useState("");
  const [liveClassId, setLiveClassId] = useState("");
  const [classSessionId, setClassSessionId] = useState("");
  const [activityScope, setActivityScope] = useState(requestedScope);
  const [dueDate, setDueDate] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [passScore, setPassScore] = useState(60);
  const [attemptLimit, setAttemptLimit] = useState(1);
  const [reviewPolicy, setReviewPolicy] = useState("after_submit");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [questions, setQuestions] = useState([createBlankQuestion()]);
  const [answerKeyPaste, setAnswerKeyPaste] = useState("");
  const [paperAnswerTab, setPaperAnswerTab] = useState("paste"); // "paste" | "manual"
  const [manualQuestionCount, setManualQuestionCount] = useState(40);
  const [quickFillSequence, setQuickFillSequence] = useState("");
  const [paperFile, setPaperFile] = useState(null);
  const [paperProgress, setPaperProgress] = useState(null);
  const [solutionFile, setSolutionFile] = useState(null);
  const [solutionProgress, setSolutionProgress] = useState(null);
  const [uploadingSolution, setUploadingSolution] = useState(false);
  const [deletingPaper, setDeletingPaper] = useState(false);
  const [deletingSolution, setDeletingSolution] = useState(false);
  const [hasEssaySection, setHasEssaySection] = useState(false);
  const [essayMaxScore, setEssayMaxScore] = useState(3);
  const [essayPrompt, setEssayPrompt] = useState("Học sinh trình bày bài làm tự luận ra giấy thi, chụp ảnh các trang bài làm rõ nét và tải lên trước khi bấm nộp bài.");
  const [essayRangeFrom, setEssayRangeFrom] = useState(36);
  const [essayRangeTo, setEssayRangeTo] = useState(40);
  const [essayRangePoints, setEssayRangePoints] = useState(2);
  const paperFileInputRef = useRef(null);
  const solutionFileInputRef = useRef(null);
  const [questionBank, setQuestionBank] = useState([]);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);

  const essayCount = useMemo(() => questions.filter((q) => q.isEssay || q.type === "essay").length, [questions]);
  const mcCount = questions.length - essayCount;
  const totalPoints = useMemo(() => {
    return questions.reduce((sum, q) => sum + (Number(q.points) || (q.isEssay || q.type === "essay" ? 2 : 1)), 0);
  }, [questions]);

  useEffect(() => {
    if (essayCount > 0 && !hasEssaySection) {
      setHasEssaySection(true);
    }
  }, [essayCount, hasEssaySection]);

  const parsedAnswerKey = useMemo(() => parseQuizAnswerKey(answerKeyPaste), [answerKeyPaste]);
  const matchedAnswerCount = useMemo(
    () => parsedAnswerKey.entries.filter(({ questionNumber }) => questionNumber <= questions.length).length,
    [parsedAnswerKey, questions.length],
  );
  const paperAnswersAreApplied = useMemo(() => {
    if (questions.length === 0) return false;
    const allHaveAnswers = questions.every((q) => {
      if (q.isEssay || q.type === "essay") return true;
      return typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < (q.options?.length || 4);
    });
    if (paperAnswerTab === "manual") {
      return allHaveAnswers;
    }
    if (!parsedAnswerKey.entries.length) return false;
    const largestQuestionNumber = Math.max(...parsedAnswerKey.entries.map((entry) => entry.questionNumber));
    return (
      questions.length >= largestQuestionNumber &&
      Array.from({ length: largestQuestionNumber }, (_, index) => {
        const q = questions[index];
        if (q?.isEssay || q?.type === "essay") return true;
        return parsedAnswerKey.answerByQuestion.has(index + 1);
      }).every(Boolean) &&
      allHaveAnswers
    );
  }, [paperAnswerTab, parsedAnswerKey, questions]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [quizResult, courseResult, classResult] = await Promise.allSettled([
        fetchTeacherQuizzes(),
        fetchAdminCourses(),
        requestedClassId ? fetchClassDetails(requestedClassId) : Promise.resolve(null),
      ]);
      if (quizResult.status === "rejected") throw quizResult.reason;
      const quizResponse = quizResult.value;
      const courseResponse = courseResult.status === "fulfilled" ? courseResult.value : null;
      const classResponse = classResult.status === "fulfilled" ? classResult.value : null;
      setQuizzes(quizResponse?.data || []);
      setCourses(courseResponse?.data || []);
      const preferredCourseId = classResponse?.data?.courseId;
      if (shouldOpenBuilder && !quickCreateHandledRef.current) {
        if (preferredCourseId) setCourseId(String(preferredCourseId));
        setActiveTab("create");
        quickCreateHandledRef.current = true;
      }
    } catch (error) {
      toast.error(error?.message || "Không thể tải dữ liệu đề kiểm tra");
    } finally {
      setLoading(false);
    }
  }, [requestedClassId, shouldOpenBuilder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setTargetClasses([]);
      setLiveClassId("");
      setClassSessionId("");
      return () => { cancelled = true; };
    }
    setTargetsLoading(true);
    setTargetClasses([]);
    setLiveClassId("");
    setClassSessionId("");
    setActivityScope(requestedScope);
    setDueDate("");
    fetchTeacherQuizTargets(courseId)
      .then((response) => {
        if (cancelled) return;
        const classes = Array.isArray(response?.data) ? response.data : [];
        setTargetClasses(classes);
        const linkedClass = requestedClassId ? classes.find((item) => String(item.id) === String(requestedClassId)) : null;
        if (linkedClass) {
          setLiveClassId(String(linkedClass.id));
          const linkedSession = requestedSessionId
            ? linkedClass.sessions?.find((session) => String(session.id) === String(requestedSessionId))
            : linkedClass.sessions?.[0];
          if (linkedSession) setClassSessionId(String(linkedSession.id));
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(error?.message || "Không thể tải các buổi học còn hiệu lực.");
      })
      .finally(() => { if (!cancelled) setTargetsLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, requestedClassId, requestedScope, requestedSessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setQuestionBank([]);
      return () => { cancelled = true; };
    }
    setQuestionBankLoading(true);
    fetchQuestionBank({ courseId })
      .then((response) => { if (!cancelled) setQuestionBank(Array.isArray(response?.data) ? response.data : []); })
      .catch((error) => { if (!cancelled) toast.error(error?.message || "Không thể tải ngân hàng câu hỏi."); })
      .finally(() => { if (!cancelled) setQuestionBankLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  const selectedTargetClass = useMemo(
    () => targetClasses.find((item) => String(item.id) === String(liveClassId)) || null,
    [liveClassId, targetClasses],
  );

  // Sorting Quizzes: Newest created always at the top
  const sortedQuizzes = useMemo(() => {
    return [...quizzes].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [quizzes]);

  const quizOverview = useMemo(() => {
    let active = 0;
    let expired = 0;
    let drafts = 0;
    let archived = 0;
    let submissions = 0;
    const now = new Date();
    for (const q of quizzes) {
      submissions += Number(q.attemptsCount || 0);
      if (q.status === "DRAFT") {
        drafts++;
      } else if (q.status === "ARCHIVED") {
        archived++;
        expired++;
      } else if (isQuizExpired(q, now)) {
        expired++;
      } else {
        active++;
      }
    }
    return { active, expired, drafts, archived, submissions, total: quizzes.length };
  }, [quizzes]);

  const { active: activeQuizzesCount, expired: expiredQuizzesCount } = quizOverview;

  // Filtering Quizzes
  const filteredQuizzes = useMemo(() => {
    const now = new Date();
    return sortedQuizzes.filter((quiz) => {
      const expired = isQuizExpired(quiz, now);
      if (expiryTab === "active" && (quiz.status !== "PUBLISHED" || expired)) return false;
      if (expiryTab === "draft" && quiz.status !== "DRAFT") return false;
      if (expiryTab === "expired" && quiz.status !== "ARCHIVED" && !(quiz.status === "PUBLISHED" && expired)) return false;

      if (statusFilter !== "all" && quiz.status !== statusFilter) return false;
      if (scopeFilter !== "all" && quiz.activityScope !== scopeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchTitle = (quiz.title || "").toLowerCase().includes(q);
        const matchCourse = (quiz.courseTitle || "").toLowerCase().includes(q);
        const matchClass = (quiz.classTitle || "").toLowerCase().includes(q);
        if (!matchTitle && !matchCourse && !matchClass) return false;
      }
      return true;
    });
  }, [sortedQuizzes, expiryTab, statusFilter, scopeFilter, searchQuery]);

  const resetBuilder = () => {
    setQuizTitle("");
    setQuizDesc("");
    setQuizMode("manual");
    setCourseId("");
    setLiveClassId("");
    setClassSessionId("");
    setActivityScope(requestedScope);
    setDueDate("");
    setTargetClasses([]);
    setTimeLimit(30);
    setPassScore(60);
    setAttemptLimit(1);
    setReviewPolicy("after_submit");
    setShuffleQuestions(true);
    setQuestions([createBlankQuestion()]);
    setAnswerKeyPaste("");
    setPaperAnswerTab("paste");
    setManualQuestionCount(40);
    setQuickFillSequence("");
    setPaperFile(null);
    setPaperProgress(null);
    setSolutionFile(null);
    setSolutionProgress(null);
    setUploadingSolution(false);
    setHasEssaySection(false);
    setEssayMaxScore(3);
    setEssayPrompt("Học sinh trình bày bài làm tự luận ra giấy thi, chụp ảnh các trang bài làm rõ nét và tải lên trước khi bấm nộp bài.");
  };

  const updateQuestion = (index, patch) => {
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )));
  };

  const selectQuizMode = (nextMode) => {
    if (nextMode === quizMode) return;
    setQuizMode(nextMode);
    setPaperFile(null);
    setAnswerKeyPaste("");
    setPaperAnswerTab("paste");
    setManualQuestionCount(40);
    setQuickFillSequence("");
    setQuestions([nextMode === "paper" ? createPaperQuestion(0) : createBlankQuestion()]);
  };

  const updateOption = (questionIndex, optionIndex, value) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      return {
        ...question,
        options: question.options.map((option, currentOptionIndex) => (
          currentOptionIndex === optionIndex ? value : option
        )),
      };
    }));
  };

  const addQuestionFromBank = (item) => {
    setQuestions((current) => [...current, {
      id: `bank-${item.id}-${Date.now()}`,
      questionText: item.questionText,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation || "",
      points: item.points || 1,
    }]);
    toast.success("Đã thêm câu hỏi từ ngân hàng vào đề.");
  };

  const saveQuestionToBank = async (questionIndex) => {
    if (!courseId) {
      toast.error("Hãy chọn khóa học trước khi lưu vào ngân hàng.");
      return;
    }
    const question = normalizeQuestionForSubmit(questions[questionIndex], questionIndex, quizMode);
    if (!question.questionText || question.options.length < 2 || question.correctAnswer < 0) {
      toast.error("Hoàn thiện nội dung, phương án và đáp án đúng của câu hỏi trước khi lưu.");
      return;
    }
    try {
      const response = await createQuestionBankItem({ courseId: Number(courseId), ...question });
      setQuestionBank((current) => [response.data, ...current]);
      toast.success("Đã lưu câu hỏi vào ngân hàng của khóa học.");
    } catch (error) {
      toast.error(error?.message || "Không thể lưu câu hỏi vào ngân hàng.");
    }
  };

  const addOption = (questionIndex) => {
    setQuestions((current) => current.map((question, index) => (
      index === questionIndex && question.options.length < QUIZ_OPTION_KEYS.length
        ? { ...question, options: [...question.options, ""] }
        : question
    )));
  };

  const removeOption = (questionIndex, optionIndex) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex || question.options.length <= 2) return question;
      const nextOptions = question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex);
      return {
        ...question,
        options: nextOptions,
        correctAnswer: Math.min(question.correctAnswer, nextOptions.length - 1),
      };
    }));
  };

  const applyPastedAnswerKey = () => {
    if (!parsedAnswerKey.entries.length) {
      toast.error("Chưa nhận diện được đáp án. Ví dụ hợp lệ: 1a 2b 3c hoặc 1 A, 2. B, Câu 3: C.");
      return;
    }
    let applied = 0;
    const largestQuestionNumber = Math.max(...parsedAnswerKey.entries.map((entry) => entry.questionNumber));
    setQuestions((current) => {
      const hasOnlyBlankStarter = current.length === 1
        && !current[0].questionText.trim()
        && current[0].options.every((option) => !option.trim());
      const allArePaperQuestions = current.every((q) => q.questionText.includes("file đề PDF"));
      let workingQuestions = current;
      if (quizMode === "paper" && (hasOnlyBlankStarter || allArePaperQuestions)) {
        workingQuestions = Array.from({ length: largestQuestionNumber }, (_, index) => {
          if (index === 0 && hasOnlyBlankStarter) return createPaperQuestion(0);
          return current[index] || createPaperQuestion(index);
        });
      } else if (quizMode === "paper" && largestQuestionNumber > current.length) {
        workingQuestions = [...current, ...Array.from({ length: largestQuestionNumber - current.length }, (_, index) => createPaperQuestion(current.length + index))];
      }
      return workingQuestions.map((question, index) => {
        const answerKey = parsedAnswerKey.answerByQuestion.get(index + 1);
        const validOpts = question.options?.filter((o) => String(o || "").trim());
        let currentOptions = question.options;
        if (quizMode === "paper" && (!validOpts || validOpts.length < 2)) {
          currentOptions = ["A", "B", "C", "D"];
        }
        if (!answerKey) {
          return {
            ...question,
            options: currentOptions,
            questionText: question.questionText || (quizMode === "paper" ? `Câu ${index + 1} — xem nội dung trong file đề PDF.` : question.questionText),
          };
        }
        const answerIndex = optionIndexForQuizKey(answerKey);
        if (answerIndex < 0) return { ...question, options: currentOptions };
        const nextOptions = [...currentOptions];
        while (nextOptions.length <= answerIndex) nextOptions.push(QUIZ_OPTION_KEYS[nextOptions.length] || `Phương án ${nextOptions.length + 1}`);
        applied += 1;
        return {
          ...question,
          options: nextOptions,
          correctAnswer: answerIndex,
          questionText: question.questionText || (quizMode === "paper" ? `Câu ${index + 1} — xem nội dung trong file đề PDF.` : question.questionText),
        };
      });
    });
    setManualQuestionCount(largestQuestionNumber);
    toast.success(`Đã gán ${applied} đáp án từ danh sách dán.${quizMode === "paper" ? " Bảng câu PDF đã được tạo." : ""}`);
  };

  const handleApplyQuestionCount = (countToSet) => {
    const targetCount = Math.max(1, Math.min(200, Number(countToSet) || 1));
    setManualQuestionCount(targetCount);
    setQuestions((current) => {
      const newQuestions = [];
      for (let i = 0; i < targetCount; i++) {
        const existing = current[i];
        const validOpts = existing?.options?.filter((o) => String(o || "").trim());
        if (existing && validOpts && validOpts.length >= 2) {
          newQuestions.push({
            ...existing,
            questionText: existing.questionText?.trim() || `Câu ${i + 1} — xem nội dung trong file đề PDF.`,
            options: existing.options,
            correctAnswer: typeof existing.correctAnswer === "number" && existing.correctAnswer >= 0 ? existing.correctAnswer : 0,
          });
        } else {
          newQuestions.push({
            ...createPaperQuestion(i),
            correctAnswer: typeof existing?.correctAnswer === "number" && existing.correctAnswer >= 0 ? existing.correctAnswer : 0,
          });
        }
      }
      const synced = newQuestions.map((q, idx) => `${idx + 1} ${QUIZ_OPTION_KEYS[q.correctAnswer] || "A"}`).join("\n");
      setAnswerKeyPaste(synced);
      return newQuestions;
    });
    toast.success(`Đã thiết lập bảng ${targetCount} câu hỏi.`);
  };

  const handleQuickFillSequence = () => {
    const raw = quickFillSequence.trim();
    if (!raw) {
      toast.error("Vui lòng nhập chuỗi đáp án (ví dụ: ABCDDCBA...).");
      return;
    }
    const letters = raw.toUpperCase().replace(/[^A-F]/g, "").split("");
    if (!letters.length) {
      toast.error("Không tìm thấy ký tự đáp án A/B/C/D hợp lệ trong chuỗi.");
      return;
    }
    setQuestions((current) => {
      const count = Math.max(current.length, letters.length);
      const newQuestions = [];
      for (let i = 0; i < count; i++) {
        let base = i < current.length ? current[i] : createPaperQuestion(i);
        const validOpts = base?.options?.filter((o) => String(o || "").trim());
        if (!validOpts || validOpts.length < 2) {
          base = {
            ...createPaperQuestion(i),
            ...base,
            options: ["A", "B", "C", "D"],
            questionText: base.questionText?.trim() || `Câu ${i + 1} — xem nội dung trong file đề PDF.`,
          };
        }
        const letter = letters[i];
        const newAns = letter ? optionIndexForQuizKey(letter) : base.correctAnswer;
        newQuestions.push({
          ...base,
          correctAnswer: newAns >= 0 ? newAns : (base.correctAnswer ?? 0),
        });
      }
      const synced = newQuestions.map((q, idx) => `${idx + 1} ${QUIZ_OPTION_KEYS[q.correctAnswer] || "A"}`).join("\n");
      setAnswerKeyPaste(synced);
      return newQuestions;
    });
    setManualQuestionCount((curr) => Math.max(curr, letters.length));
    toast.success(`Đã điền nhanh đáp án cho ${letters.length} câu.`);
    setQuickFillSequence("");
  };

  const handleSetAllAnswers = (optionIndex) => {
    setQuestions((current) => {
      const updated = current.map((q) => {
        if (q.isEssay || q.type === "essay") return q;
        return { ...q, correctAnswer: optionIndex };
      });
      const key = QUIZ_OPTION_KEYS[optionIndex] || "A";
      const synced = updated.map((q, idx) => (q.isEssay || q.type === "essay" ? `${idx + 1} TL` : `${idx + 1} ${key}`)).join("\n");
      setAnswerKeyPaste(synced);
      return updated;
    });
    toast.success(`Đã gán các câu trắc nghiệm thành đáp án ${QUIZ_OPTION_KEYS[optionIndex]}.`);
  };

  const handleToggleQuestionEssay = (index) => {
    setQuestions((curr) => {
      const next = [...curr];
      const target = next[index];
      if (!target) return curr;
      const isCurrentlyEssay = Boolean(target.isEssay || target.type === "essay");
      next[index] = {
        ...target,
        isEssay: !isCurrentlyEssay,
        type: !isCurrentlyEssay ? "essay" : "single",
        options: !isCurrentlyEssay ? [] : (target.options?.length >= 2 ? target.options : ["A", "B", "C", "D"]),
        correctAnswer: !isCurrentlyEssay ? null : (typeof target.correctAnswer === "number" && target.correctAnswer >= 0 ? target.correctAnswer : 0),
        points: !isCurrentlyEssay ? (Number(target.points) > 1 ? Number(target.points) : 2) : 1,
      };
      return next;
    });
  };

  const handleUpdateQuestionPoints = (index, pointsValue) => {
    const val = parseFloat(pointsValue);
    setQuestions((curr) => {
      const next = [...curr];
      if (!next[index]) return curr;
      next[index] = {
        ...next[index],
        points: isNaN(val) ? pointsValue : val,
      };
      return next;
    });
  };

  const handleMarkLastQuestionsAsEssay = (count) => {
    if (!questions.length) return;
    const startIdx = Math.max(0, questions.length - count);
    setQuestions((curr) =>
      curr.map((q, idx) => {
        if (idx >= startIdx) {
          return {
            ...q,
            isEssay: true,
            type: "essay",
            options: [],
            correctAnswer: null,
            points: Number(q.points) > 1 ? q.points : 2,
          };
        }
        return q;
      })
    );
    setHasEssaySection(true);
    toast.success(`Đã đánh dấu từ câu ${startIdx + 1} đến câu ${questions.length} là câu Tự luận.`);
  };

  const handleClearAllEssay = () => {
    setQuestions((curr) =>
      curr.map((q) => ({
        ...q,
        isEssay: false,
        type: "single",
        options: q.options?.length >= 2 ? q.options : ["A", "B", "C", "D"],
        correctAnswer: typeof q.correctAnswer === "number" && q.correctAnswer >= 0 ? q.correctAnswer : 0,
        points: 1,
      }))
    );
    toast.success("Đã chuyển tất cả câu hỏi về Trắc nghiệm.");
  };

  const handleApplyEssayRange = () => {
    const from = Math.max(1, Math.min(questions.length, essayRangeFrom));
    const to = Math.max(1, Math.min(questions.length, essayRangeTo));
    const minIdx = Math.min(from, to) - 1;
    const maxIdx = Math.max(from, to) - 1;
    const pts = Math.max(0.25, Math.min(50, Number(essayRangePoints) || 2));

    setQuestions((curr) =>
      curr.map((q, idx) => {
        if (idx >= minIdx && idx <= maxIdx) {
          return {
            ...q,
            isEssay: true,
            type: "essay",
            options: [],
            correctAnswer: null,
            points: pts,
          };
        }
        return q;
      })
    );
    setHasEssaySection(true);
    toast.success(`Đã đánh dấu câu ${minIdx + 1} đến câu ${maxIdx + 1} là Tự luận (${pts}đ/câu).`);
  };

  const handleDeletePaperFile = async () => {
    if (!paperFile) return;
    const fileId = paperFile.id;
    const fileName = paperFile.name || "file đề PDF";

    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${fileName}"?`)) {
      return;
    }

    if (fileId) {
      setDeletingPaper(true);
      try {
        await deleteTeacherFile(fileId);
        toast.success(`Đã xóa "${fileName}" thành công.`);
      } catch (err) {
        console.error("Lỗi xóa file đề:", err);
        toast.error(err?.message || "Không thể xóa file đề.");
        setDeletingPaper(false);
        return;
      } finally {
        setDeletingPaper(false);
      }
    }

    setPaperFile(null);
    setPaperProgress(null);
    if (paperFileInputRef.current) {
      paperFileInputRef.current.value = "";
    }
  };

  const handleReplacePaperFile = () => {
    paperFileInputRef.current?.click();
  };

  const handleDeleteSolutionFile = async () => {
    if (!solutionFile) return;
    const fileId = solutionFile.id;
    const fileName = solutionFile.name || "file lời giải PDF";

    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${fileName}"?`)) {
      return;
    }

    if (fileId) {
      setDeletingSolution(true);
      try {
        await deleteTeacherFile(fileId);
        toast.success(`Đã xóa "${fileName}" thành công.`);
      } catch (err) {
        console.error("Lỗi xóa file lời giải:", err);
        toast.error(err?.message || "Không thể xóa file lời giải.");
        setDeletingSolution(false);
        return;
      } finally {
        setDeletingSolution(false);
      }
    }

    setSolutionFile(null);
    setSolutionProgress(null);
    if (solutionFileInputRef.current) {
      solutionFileInputRef.current.value = "";
    }
  };

  const handleReplaceSolutionFile = () => {
    solutionFileInputRef.current?.click();
  };

  const handlePaperSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (quizMode !== "paper") return;
    if (!courseId) {
      toast.error("Hãy chọn khóa học trước khi tải đề PDF.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPaperFile(file);
      setPaperProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Định dạng tệp không hợp lệ",
        errorMessage: "Chỉ chấp nhận file PDF làm đề quiz.",
      });
      toast.error("Chỉ chấp nhận file PDF làm đề quiz.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setPaperFile(file);
      setPaperProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Kích thước tệp vượt quá giới hạn",
        errorMessage: "File đề PDF không được vượt quá 100MB.",
      });
      return;
    }

    // Nếu đã có file đề cũ trên R2, dọn dẹp file cũ
    const oldPaperId = paperFile?.id;
    if (oldPaperId) {
      deleteTeacherFile(oldPaperId).catch((err) => {
        console.warn("Không thể xóa file đề cũ trên R2:", err);
      });
    }

    setPaperFile(file);
    setUploadingPaper(true);
    setPaperProgress({
      status: "uploading",
      percent: 5,
      stage: "init",
      message: "Đang khởi tạo liên kết tải đề PDF...",
      loaded: 0,
      total: file.size,
    });

    try {
      const response = await uploadCourseQuizPaper(courseId, file, {
        onProgress: (p) => {
          setPaperProgress((curr) => ({
            ...curr,
            status: p.stage === "done" ? "success" : "uploading",
            percent: p.percent,
            stage: p.stage,
            message: p.message,
            loaded: p.loaded ?? curr?.loaded ?? 0,
            total: p.total ?? file.size,
          }));
        },
      });

      if (!response?.success || !response?.data?.id) throw new Error(response?.message || "Không thể xác nhận file PDF");
      setPaperFile({ id: response.data.id, name: response.data.name || file.name, size: file.size });
      setPaperProgress({
        status: "success",
        percent: 100,
        stage: "done",
        message: `Đã tải đề PDF "${file.name}" thành công!`,
        loaded: file.size,
        total: file.size,
      });
      toast.success("Đã tải đề PDF. Dán bảng đáp án để tạo quiz.");
    } catch (error) {
      const errText = error?.message || "Không thể tải đề PDF. Vui lòng thử lại.";
      setPaperProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Lỗi tải đề PDF",
        errorMessage: errText,
        loaded: 0,
        total: file.size,
      });
      toast.error(errText);
    } finally {
      setUploadingPaper(false);
    }
  };

  const handleSolutionSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!courseId) {
      toast.error("Hãy chọn khóa học trước khi tải file lời giải PDF.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSolutionFile(file);
      setSolutionProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Định dạng tệp không hợp lệ",
        errorMessage: "Chỉ chấp nhận file PDF làm lời giải chi tiết.",
      });
      toast.error("Chỉ chấp nhận file PDF làm lời giải chi tiết.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setSolutionFile(file);
      setSolutionProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Kích thước tệp vượt quá giới hạn",
        errorMessage: "File lời giải PDF không được vượt quá 100MB.",
      });
      return;
    }

    // Nếu đã có file lời giải cũ trên R2, dọn dẹp file cũ
    const oldSolutionId = solutionFile?.id;
    if (oldSolutionId) {
      deleteTeacherFile(oldSolutionId).catch((err) => {
        console.warn("Không thể xóa file lời giải cũ trên R2:", err);
      });
    }

    setSolutionFile(file);
    setUploadingSolution(true);
    setSolutionProgress({
      status: "uploading",
      percent: 5,
      stage: "init",
      message: "Đang khởi tạo liên kết tải file lời giải...",
      loaded: 0,
      total: file.size,
    });

    try {
      const response = await uploadCourseQuizPaper(courseId, file, {
        onProgress: (p) => {
          setSolutionProgress((curr) => ({
            ...curr,
            status: p.stage === "done" ? "success" : "uploading",
            percent: p.percent,
            stage: p.stage,
            message: p.message,
            loaded: p.loaded ?? curr?.loaded ?? 0,
            total: p.total ?? file.size,
          }));
        },
      });

      if (!response?.success || !response?.data?.id) throw new Error(response?.message || "Không thể xác nhận file PDF");
      setSolutionFile({ id: response.data.id, name: response.data.name || file.name, size: file.size });
      setSolutionProgress({
        status: "success",
        percent: 100,
        stage: "done",
        message: `Đã tải file lời giải "${file.name}" thành công!`,
        loaded: file.size,
        total: file.size,
      });
      toast.success("Đã tải file lời giải chi tiết.");
    } catch (error) {
      const errText = error?.message || "Không thể tải file lời giải. Vui lòng thử lại.";
      setSolutionProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Lỗi tải file lời giải PDF",
        errorMessage: errText,
        loaded: 0,
        total: file.size,
      });
      toast.error(errText);
    } finally {
      setUploadingSolution(false);
    }
  };

  const scrollToQuestion = (index) => {
    document.getElementById(`quiz-editor-question-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const validateQuestions = () => {
    for (let index = 0; index < questions.length; index += 1) {
      const normalized = normalizeQuestionForSubmit(questions[index], index, quizMode);
      if (!normalized.questionText) return `Câu ${index + 1} chưa có nội dung.`;
      if (normalized.type === "essay") {
        if (!Number.isFinite(normalized.points) || normalized.points <= 0 || normalized.points > 100) {
          return `Điểm của câu tự luận ${index + 1} không hợp lệ.`;
        }
        continue;
      }
      if (normalized.options.length < 2) return `Câu ${index + 1} cần tối thiểu 2 phương án lựa chọn (A, B...).`;
      if (normalized.correctAnswer < 0) return `Câu ${index + 1} chưa có đáp án đúng hợp lệ.`;
      if (!Number.isFinite(normalized.points) || normalized.points <= 0 || normalized.points > 100) return `Điểm của câu ${index + 1} không hợp lệ.`;
    }
    return "";
  };

  const handleSaveQuiz = async (status) => {
    if (uploadingPaper) {
      toast.error("Đợi file PDF tải xong trước khi lưu đề.");
      return;
    }
    if (uploadingSolution) {
      toast.error("Đợi file lời giải tải xong trước khi lưu đề.");
      return;
    }
    if (!courseId) {
      toast.error("Hãy chọn khóa học nhận quiz này.");
      return;
    }
    if (!liveClassId || !classSessionId) {
      toast.error("Hãy chọn đúng lớp và buổi học chưa kết thúc cho quiz.");
      return;
    }
    if (activityScope === "homework" && !dueDate) {
      toast.error("Quiz về nhà cần có hạn nộp.");
      return;
    }
    if (quizMode === "paper") {
      if (!paperFile) {
        toast.error("Hãy tải file PDF đề trước khi xuất bản.");
        return;
      }
      if (questions.length === 0) {
        toast.error("Đề kiểm tra cần ít nhất 1 câu hỏi.");
        return;
      }
      const unassignedIndex = questions.findIndex((q) => {
        if (q.type === "essay" || q.isEssay) return false;
        return typeof q.correctAnswer !== "number" || q.correctAnswer < 0 || q.correctAnswer >= (q.options?.length || 4);
      });
      if (unassignedIndex !== -1) {
        toast.error(`Câu ${unassignedIndex + 1} chưa được chọn đáp án đúng.`);
        return;
      }
      if (paperAnswerTab === "paste" && !paperAnswersAreApplied) {
        toast.error("Danh sách đáp án phải đủ liên tiếp từ Câu 1, sau đó nhấn “Gán đáp án”.");
        return;
      }
    }
    if (!quizTitle.trim()) {
      toast.error("Hãy nhập tiêu đề đề kiểm tra.");
      return;
    }
    const questionError = validateQuestions();
    if (questionError) {
      toast.error(questionError);
      return;
    }
    try {
      setSaving(true);
      const totalEssayPoints = questions
        .filter((q) => q.isEssay || q.type === "essay")
        .reduce((sum, q) => sum + (Number(q.points) || 2), 0);
      const hasAnyEssay = essayCount > 0 || hasEssaySection;

      const response = await createTeacherQuiz({
        title: quizTitle.trim(),
        description: formatQuizDescription({
          text: quizDesc.trim(),
          essayConfig: {
            enabled: hasAnyEssay,
            maxScore: totalEssayPoints > 0 ? totalEssayPoints : (Number(essayMaxScore) || 3),
            prompt: essayPrompt.trim(),
          },
        }),
        courseId: Number(courseId),
        liveClassId: Number(liveClassId),
        classSessionId: Number(classSessionId),
        activityScope,
        dueDate: activityScope === "homework" ? dueDate : undefined,
        durationMinutes: Number(timeLimit),
        passingScore: Number(passScore),
        attemptLimit: Number(attemptLimit),
        reviewPolicy,
        shuffleQuestions,
        paperFileId: paperFile?.id || undefined,
        solutionFileId: solutionFile?.id ? Number(solutionFile.id) : undefined,
        status,
        questions: questions.map((q, idx) => normalizeQuestionForSubmit(q, idx, quizMode)),
      });

      await loadData();
      toast.success(status === "PUBLISHED"
        ? `Đã xuất bản “${response?.data?.title || quizTitle.trim()}”. Quiz mới đã được đưa lên đầu danh sách.`
        : "Đã lưu nháp đề kiểm tra.");

      // Switch to assigned quizzes tab immediately & reset builder
      resetBuilder();
      setActiveTab("assigned");
    } catch (error) {
      toast.error(error?.message || "Không thể lưu đề kiểm tra");
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveQuiz = async (quiz) => {
    if (!window.confirm(`Lưu trữ quiz “${quiz.title}”? Học viên sẽ không thể bắt đầu lượt làm mới.`)) return;
    try {
      const response = await archiveTeacherQuiz(quiz.id);
      setQuizzes((current) => current.map((item) => (
        item.id === quiz.id ? { ...item, ...(response?.data || {}), status: "ARCHIVED" } : item
      )));
      toast.success("Đã lưu trữ quiz và giữ nguyên lịch sử bài làm.");
    } catch (error) {
      toast.error(error?.message || "Không thể lưu trữ quiz");
    }
  };

  return (
    <div className="min-h-screen bg-transparent px-4 py-5 pb-20 font-sans text-slate-900 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Calligraphic Hero Header */}
        <header className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/92 px-6 py-6 shadow-[0_14px_40px_rgba(32,78,120,0.1)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 md:flex md:items-center md:justify-between md:gap-6 sm:px-8">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-16 h-48 w-48 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="relative z-10">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/80 px-3 py-1 text-xs font-bold text-[#102f63] dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 shadow-2xs">
              <FiClipboard className="h-3.5 w-3.5 text-blue-600" />
              <span>Trung Tâm Đề & Chấm Quiz</span>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="font-['Ma_Shan_Zheng',cursive] text-xs tracking-wider text-slate-700 dark:text-sky-300">博观而约取，厚积而薄发</span>
            </div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs dark:text-white">
              Đăng Đề & Trung Tâm Quiz
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Không gian quản lý ngân hàng đề, phân phối câu hỏi theo buổi và ưu tiên các bài tự luận chờ chấm điểm.
            </p>
          </div>

          {/* 2 Tabs chuyển đổi chính */}
          <div className="relative z-10 mt-4 inline-flex rounded-2xl border border-white/90 bg-white/70 p-1.5 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/60 md:mt-0">
            <button
              type="button"
              onClick={() => setActiveTab("assigned")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === "assigned"
                  ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-sky-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <FiClipboard className="h-4 w-4" />
              <span>Quiz đã giao ({quizzes.length})</span>
            </button>
            <button
              type="button"
              onClick={openNewQuizEditor}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === "create"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <FiPlus className="h-4 w-4" />
              <span>Tạo quiz mới</span>
            </button>
          </div>
        </header>

        {activeTab === "assigned" && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Tổng quan kho quiz">
            {[
              { label: "Đang mở", value: quizOverview.active, detail: "Học viên đang có thể làm", tone: "sky" },
              { label: "Bản nháp", value: quizOverview.drafts, detail: "Cần hoàn thiện hoặc xuất bản", tone: "amber" },
              { label: "Đã kết thúc", value: quizOverview.expired, detail: "Xem lại điểm và bài nộp", tone: "slate" },
              { label: "Lượt đã nộp", value: quizOverview.submissions, detail: "Tổng bài làm đã ghi nhận", tone: "emerald" },
              { label: "Tổng số đề", value: quizOverview.total, detail: "Trong phạm vi bạn phụ trách", tone: "blue" },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/80 bg-white/92 p-4 shadow-[0_8px_30px_rgba(49,91,125,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${item.tone === "amber" ? "text-amber-600" : item.tone === "emerald" ? "text-emerald-600" : item.tone === "slate" ? "text-slate-600 dark:text-slate-300" : "text-[#102f63] dark:text-sky-300"}`}>{item.value}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{item.detail}</p>
              </div>
            ))}
          </section>
        )}

        {/* TAB 1: DANH SÁCH QUIZ ĐÃ GIAO */}
        {activeTab === "assigned" && (
          <section className="space-y-4 animate-in fade-in duration-200">
            {/* Thanh chuyển đổi trạng thái: Còn hạn vs Đã kết thúc / Xem lại */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/85 bg-white/88 p-2.5 shadow-[0_8px_24px_rgba(32,78,120,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex max-w-full overflow-x-auto rounded-xl border border-sky-100 bg-sky-50/80 p-1 dark:border-slate-800 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setExpiryTab("active")}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                    expiryTab === "active"
                      ? "bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Đang mở / Còn hạn</span>
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      expiryTab === "active"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {activeQuizzesCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setExpiryTab("draft")}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                    expiryTab === "draft"
                      ? "bg-white text-amber-700 shadow-xs dark:bg-slate-800 dark:text-amber-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <FiEdit3 className="h-3.5 w-3.5" />
                  <span>Bản nháp</span>
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                    {quizOverview.drafts}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setExpiryTab("expired")}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                    expiryTab === "expired"
                      ? "bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <FiArchive className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Đã kết thúc</span>
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      expiryTab === "expired"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {expiredQuizzesCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setExpiryTab("all")}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                    expiryTab === "all"
                      ? "bg-white text-sky-700 shadow-xs dark:bg-slate-800 dark:text-sky-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <span>Tất cả</span>
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      expiryTab === "all"
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {quizzes.length}
                  </span>
                </button>
              </div>

              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
                {expiryTab === "active" && "🟢 Hiển thị các bài quiz đang trong thời hạn làm bài"}
                {expiryTab === "draft" && "✏️ Đề đang soạn, học viên chưa nhìn thấy"}
                {expiryTab === "expired" && "📦 Đề đã hết hạn hoặc buổi học đã qua — xem lại kết quả & phổ điểm"}
                {expiryTab === "all" && "Toàn bộ bài quiz đã giao trong hệ thống"}
              </div>
            </div>

            {/* Thanh tìm kiếm & lọc */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/85 bg-white/88 p-3.5 shadow-[0_8px_24px_rgba(32,78,120,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên đề, lớp học, khóa học..."
                  className="w-full rounded-xl border border-sky-100 bg-sky-50/60 pl-10 pr-3 py-2 text-xs font-medium outline-none transition focus:border-sky-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                  className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  <option value="all">Tất cả dạng đề</option>
                  <option value="session">Quiz trong buổi học</option>
                  <option value="homework">Bài tập về nhà</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="PUBLISHED">Đang công bố</option>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="ARCHIVED">Đã lưu trữ</option>
                </select>

                <button
                  type="button"
                  onClick={openNewQuizEditor}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-black text-white hover:bg-sky-700 shadow-sm transition shrink-0"
                >
                  <FiPlus className="h-3.5 w-3.5" /> Thêm mới
                </button>
              </div>
            </div>

            {loading ? (
              <Loading loading text="Đang tải danh sách đề kiểm tra..." fullScreen={false} className="min-h-[40vh] py-16" />
            ) : filteredQuizzes.length === 0 ? (
              <EmptyState
                title={
                  quizzes.length === 0
                    ? "Chưa có đề quiz nào"
                    : expiryTab === "active"
                    ? "Không có đề quiz nào đang mở"
                    : expiryTab === "draft"
                    ? "Không có bản nháp nào"
                    : expiryTab === "expired"
                    ? "Chưa có đề quiz nào hết hạn"
                    : "Không có quiz phù hợp với tìm kiếm"
                }
                description={
                  quizzes.length === 0
                    ? "Tạo đề quiz đầu tiên cho lớp học để học viên làm bài và thống kê kết quả."
                    : expiryTab === "active"
                    ? (activeQuizzesCount === 0 && expiredQuizzesCount > 0
                        ? `Tất cả ${expiredQuizzesCount} bài quiz trước đó đã kết thúc. Bạn có thể chuyển sang tab “Đã kết thúc / Xem lại” để xem lại bài làm hoặc tạo quiz mới.`
                        : "Hiện không có quiz nào trong thời hạn nộp bài. Tạo đề quiz mới cho lớp học để học viên làm bài.")
                    : expiryTab === "draft"
                    ? "Các đề đang soạn sẽ nằm ở đây cho đến khi bạn kiểm tra đủ lớp, thời gian và câu hỏi rồi xuất bản."
                    : expiryTab === "expired"
                    ? "Các đề quiz sau khi hết hạn nộp hoặc buổi học kết thúc sẽ được tự động lưu trữ tại tab này."
                    : "Hãy thử thay đổi từ khóa hoặc bộ lọc trạng thái để xem các quiz khác."
                }
                actionLabel={
                  quizzes.length === 0 || expiryTab === "active"
                    ? "Tạo quiz mới"
                    : activeQuizzesCount > 0
                    ? "Xem quiz đang mở"
                    : "Tạo quiz mới"
                }
                onAction={() => {
                  if (expiryTab === "expired" && activeQuizzesCount > 0) {
                    setExpiryTab("active");
                  } else {
                    openNewQuizEditor();
                  }
                }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredQuizzes.map((quiz) => {
                  const isExpired = isQuizExpired(quiz);
                  return (
                    <article
                      key={quiz.id}
                      className={`group relative flex flex-col justify-between rounded-3xl border bg-white/92 p-5 shadow-[0_10px_28px_rgba(32,78,120,0.09)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900/92 ${
                        isExpired
                          ? "border-slate-200/90 hover:border-slate-400 opacity-95 dark:border-slate-800"
                          : "border-slate-200 hover:border-violet-400 dark:border-slate-800"
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Top Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                           {quiz.status === "ARCHIVED" ? (
                              <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                ĐÃ LƯU TRỮ
                              </span>
                            ) : isExpired ? (
                              <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                ĐÃ HẾT HẠN
                              </span>
                            ) : (
                              <span
                                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-black ${
                                  quiz.status === "PUBLISHED"
                                     ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                }`}
                              >
                                {quiz.status === "PUBLISHED" ? "ĐANG CÔNG BỐ" : "BẢN NHÁP"}
                              </span>
                            )}
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                                 quiz.activityScope === "homework"
                                   ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                                   : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                              }`}
                            >
                              {quiz.activityScope === "homework" ? "BTVN" : "BUỔI HỌC"}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-slate-400">
                            {new Date(quiz.createdAt).toLocaleDateString("vi-VN")}
                          </span>
                        </div>

                        {/* Title */}
                        <h2
                          onClick={() => quiz.status === "DRAFT" ? openQuizEditor(quiz.id) : setSelectedQuizForStats(quiz)}
                          className="line-clamp-2 cursor-pointer text-base font-black text-slate-950 transition hover:text-sky-700 dark:text-white dark:hover:text-sky-400"
                          title={quiz.title}
                        >
                          {quiz.title}
                        </h2>

                        {/* Course and Class */}
                        <div className="space-y-1 text-xs">
                          <p className="flex items-center gap-1.5 truncate font-bold text-sky-700 dark:text-sky-300">
                            <FiBookOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span className="truncate">{quiz.courseTitle}</span>
                          </p>
                          <p className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300 flex items-center gap-1.5">
                            <FiUsers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">
                              {quiz.classTitle} · {formatQuizSession(quiz)}
                              {isExpired && quiz.activityScope !== "homework" ? " (Buổi đã kết thúc)" : ""}
                            </span>
                          </p>
                          {quiz.activityScope === "homework" && (
                            <p className={`text-[11px] font-bold flex items-center gap-1 ${
                              isExpired
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-700 dark:text-emerald-300"
                            }`}>
                              <FiClock className="h-3 w-3 shrink-0" />
                              {isExpired ? "Đã hết hạn: " : "Hạn nộp: "}
                              {quiz.dueDate ? new Date(quiz.dueDate).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "Chưa đặt"}
                            </p>
                          )}
                        </div>

                        {/* PDF & Solution Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {quiz.hasPaper && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60">
                              📄 Đề PDF
                            </span>
                          )}
                          {quiz.hasSolution && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/60 dark:border-sky-900/60">
                              💡 Lời giải PDF
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stats & Actions */}
                      <div className="mt-4 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                            <span className="block text-[9px] font-bold uppercase text-slate-400">Câu</span>
                            <span className="mt-0.5 block font-mono text-xs font-black">{quiz.questionCount}</span>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                            <span className="block text-[9px] font-bold uppercase text-slate-400">Phút</span>
                            <span className="mt-0.5 block font-mono text-xs font-black">{quiz.timeLimitMinutes}</span>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                            <span className="block text-[9px] font-bold uppercase text-slate-400">Nộp</span>
                            <span className="mt-0.5 block font-mono text-xs font-black text-violet-600 dark:text-violet-300">
                              {quiz.attemptsCount}
                            </span>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                            <span className="block text-[9px] font-bold uppercase text-slate-400">Điểm TB</span>
                            <span className="mt-0.5 block font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                              {quiz.avgScore !== null ? `${quiz.avgScore}%` : "—"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => quiz.status === "DRAFT" ? openQuizEditor(quiz.id) : setSelectedQuizForStats(quiz)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-200/80 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800 transition hover:bg-sky-100 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
                          >
                            {quiz.status === "DRAFT" ? <FiEdit3 className="h-3.5 w-3.5" /> : <FiBarChart2 className="h-3.5 w-3.5" />}
                            <span>{quiz.status === "DRAFT" ? "Tiếp tục soạn đề" : isExpired ? "Xem lại & chấm bài" : "Theo dõi & chấm bài"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openQuizEditor(quiz.id)}
                            className="rounded-xl p-2 text-slate-400 transition hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950/30"
                            title="Sửa đề bằng trình soạn đề mới"
                          >
                            <FiEdit3 className="h-4 w-4" />
                          </button>

                          {quiz.status !== "ARCHIVED" && quiz.status !== "DRAFT" && (
                            <button type="button" onClick={() => handleArchiveQuiz(quiz)} className="rounded-xl p-2 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30" title="Lưu trữ quiz và giữ lịch sử điểm">
                              <FiArchive className="h-4 w-4" />
                            </button>
                          )}

                          {(quiz.status === "DRAFT" || Number(quiz.attemptsCount || 0) === 0) && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(`Xóa quiz “${quiz.title}”? Thao tác này không thể hoàn tác.`)) return;
                                try {
                                  await deleteTeacherQuiz(quiz.id);
                                  setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
                                  toast.success("Đã xóa quiz.");
                                } catch (error) {
                                  toast.error(error?.message || "Không thể xóa quiz");
                                }
                              }}
                              className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                              title="Chỉ xóa được đề chưa có lượt làm"
                            >
                              <FiTrash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: TẠO QUIZ MỚI (UI THU NHỎ, KHOA HỌC) */}
        {activeTab === "create" && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 animate-in fade-in duration-200">
            {/* Top Toolbar */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-xs">
                  <FiFileText className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-black text-slate-950 dark:text-white">
                    {activityScope === "homework" ? "Soạn Quiz bài tập về nhà" : "Soạn Quiz trong buổi học"}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Bố cục thu gọn khoa học: Thiết lập đề ở cột trái, bảng câu hỏi và đáp án ở cột phải.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetBuilder();
                    setActiveTab("assigned");
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                >
                  Hủy & Quay lại
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveQuiz("DRAFT")}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Lưu nháp
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveQuiz("PUBLISHED")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-black text-white shadow-sm shadow-violet-600/25 transition hover:bg-violet-500 disabled:opacity-50"
                >
                  <FiSend className="h-3.5 w-3.5" />
                  {saving ? "Đang lưu..." : "Xuất bản ngay"}
                </button>
              </div>
            </div>

            {/* Layout 2 cột thu gọn */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
              {/* CỘT TRÁI: CẤU HÌNH ĐỀ & PHẠM VI */}
              <div className="space-y-4">
                {/* Khối 1: Tên & Dạng bài */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-200">
                      Tên đề kiểm tra <b className="text-rose-500">*</b>
                    </label>
                    <input
                      value={quizTitle}
                      onChange={(e) => setQuizTitle(e.target.value)}
                      maxLength={255}
                      placeholder={activityScope === "homework" ? "Ví dụ: BTVN Quiz 03 — Hàm số lượng giác" : "Ví dụ: Quiz buổi 2 — Cấu trúc dữ liệu"}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>

                  {/* Dạng quiz */}
                  <div>
                    <span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">
                      Dạng quiz <b className="text-rose-500">*</b>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setActivityScope("session"); setDueDate(""); }}
                        className={`rounded-xl border p-2.5 text-left transition ${
                          activityScope === "session"
                            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40"
                            : "border-slate-200 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900"
                        }`}
                      >
                        <b className="block text-xs text-slate-900 dark:text-white">Làm trong buổi học</b>
                        <span className="mt-0.5 block text-[10px] text-slate-500">Làm trực tiếp trong ca học.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivityScope("homework")}
                        className={`rounded-xl border p-2.5 text-left transition ${
                          activityScope === "homework"
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                            : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900"
                        }`}
                      >
                        <b className="block text-xs text-slate-900 dark:text-white">Bài tập về nhà</b>
                        <span className="mt-0.5 block text-[10px] text-slate-500">Có thời hạn nộp bài riêng.</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Khối 2: Khóa học, Lớp, Buổi học, Hạn nộp */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-200">
                      Khóa học <b className="text-rose-500">*</b>
                    </label>
                    <select
                      value={courseId}
                      onChange={(e) => { setCourseId(e.target.value); setPaperFile(null); }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">Chọn khóa học nhận quiz...</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title || course.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-200">
                        Lớp học <b className="text-rose-500">*</b>
                      </label>
                      <select
                        value={liveClassId}
                        disabled={!courseId || targetsLoading || targetClasses.length === 0}
                        onChange={(e) => {
                          const nextClassId = e.target.value;
                          setLiveClassId(nextClassId);
                          const nextClass = targetClasses.find((item) => String(item.id) === nextClassId);
                          setClassSessionId(nextClass?.sessions?.[0]?.id ? String(nextClass.sessions[0].id) : "");
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-violet-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">{targetsLoading ? "Đang tải lớp..." : targetClasses.length ? "Chọn lớp..." : "Không có lớp khả dụng"}</option>
                        {targetClasses.map((item) => (
                          <option key={item.id} value={item.id}>{item.title}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-200">
                        Buổi học <b className="text-rose-500">*</b>
                      </label>
                      <select
                        value={classSessionId}
                        disabled={!selectedTargetClass || targetsLoading}
                        onChange={(e) => setClassSessionId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none transition focus:border-violet-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Chọn buổi học...</option>
                        {selectedTargetClass?.sessions?.map((session) => (
                          <option key={session.id} value={session.id}>{formatSessionTarget(session)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {activityScope === "homework" && (
                    <div>
                      <label className="mb-1 block text-xs font-black text-slate-700 dark:text-slate-200">
                        Hạn nộp Quiz về nhà <b className="text-rose-500">*</b>
                      </label>
                      <input
                        type="datetime-local"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full rounded-xl border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-xs font-semibold outline-none transition focus:border-emerald-500 dark:border-emerald-900/70 dark:bg-emerald-950/20 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Khối 3: Cài đặt làm bài & thời gian */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                        Thời gian (phút)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                        Điểm đạt (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={passScore}
                        onChange={(e) => setPassScore(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                        Số lượt làm
                      </label>
                      <select
                        value={attemptLimit}
                        onChange={(e) => setAttemptLimit(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {[1, 2, 3, 4, 5].map((cnt) => (
                          <option key={cnt} value={cnt}>{cnt} lượt</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                        Công bố đáp án
                      </label>
                      <select
                        value={reviewPolicy}
                        onChange={(e) => setReviewPolicy(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="after_submit">Ngay sau nộp</option>
                        <option value="after_close">Khi quiz đóng</option>
                        <option value="never">Không công bố</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="shuffle-toggle"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <label htmlFor="shuffle-toggle" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      Trộn thứ tự câu hỏi cho mỗi học viên
                    </label>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                      Hướng dẫn học viên <span className="font-normal text-slate-400">(tùy chọn)</span>
                    </label>
                    <textarea
                      value={quizDesc}
                      onChange={(e) => setQuizDesc(e.target.value)}
                      rows={2}
                      maxLength={4000}
                      placeholder="Ví dụ: Đọc kỹ đề, mỗi câu chỉ chọn 1 đáp án."
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white p-2.5 text-xs outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Khối 3.5: Cấu hình phần Tự luận (Học sinh nộp ảnh bài làm) */}
                <div className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-4 dark:border-violet-900/50 dark:bg-violet-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 font-bold text-sm">
                        ✍️
                      </span>
                      <div>
                        <b className="block text-xs font-black text-slate-900 dark:text-white">
                          Phần Tự luận (Học sinh chụp ảnh nộp bài làm)
                        </b>
                        <span className="block text-[10px] text-slate-500">
                          Áp dụng cho đề có phần giải toán, tự luận, chứng minh...
                        </span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasEssaySection}
                        onChange={(e) => setHasEssaySection(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-violet-600" />
                    </label>
                  </div>

                  {hasEssaySection && (
                    <div className="pt-3 border-t border-violet-200/60 dark:border-violet-900/40 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                            Điểm tối đa phần tự luận
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            max="50"
                            step="0.5"
                            value={essayMaxScore}
                            onChange={(e) => setEssayMaxScore(e.target.value)}
                            className="w-full rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 outline-none transition focus:border-violet-500 dark:border-violet-800 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">
                            Hướng dẫn làm tự luận
                          </label>
                          <input
                            type="text"
                            value={essayPrompt}
                            onChange={(e) => setEssayPrompt(e.target.value)}
                            placeholder="Ví dụ: Học sinh làm ra giấy thi, chụp ảnh rõ nét và tải lên."
                            className="w-full rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 outline-none transition focus:border-violet-500 dark:border-violet-800 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-violet-700/80 dark:text-violet-400/80">
                        💡 <b>Quy trình:</b> Học sinh xem đề PDF, khoanh trắc nghiệm bên phải và chụp ảnh bài tự luận tải lên. Phần trắc nghiệm tự động chấm ngay, phần tự luận giáo viên sẽ vào xem ảnh bài làm và cho điểm sau.
                      </p>
                    </div>
                  )}
                </div>

                {/* Khối 4: Chế độ tạo đề */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 space-y-3">
                  <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                    Chế độ đề thi <b className="text-rose-500">*</b>
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => selectQuizMode("paper")}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        quizMode === "paper"
                          ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500/20 dark:bg-violet-950/40"
                          : "border-slate-200 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900"
                      }`}
                    >
                      <b className="block text-xs text-slate-950 dark:text-white">📄 Dùng file đề PDF</b>
                      <span className="mt-0.5 block text-[10px] text-slate-500">Tải PDF đề, dán đáp án 1A, 2B...</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectQuizMode("manual")}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        quizMode === "manual"
                          ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500/20 dark:bg-violet-950/40"
                          : "border-slate-200 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900"
                      }`}
                    >
                      <b className="block text-xs text-slate-950 dark:text-white">✏️ Tự soạn từng câu</b>
                      <span className="mt-0.5 block text-[10px] text-slate-500">Nhập câu hỏi và phương án trong LMS.</span>
                    </button>
                  </div>

                  {/* Upload file đề PDF nếu mode === paper */}
                  {quizMode === "paper" && (
                    <div className="space-y-3 pt-1">
                      {/* Box 1: File đề PDF */}
                      <div className="rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/80 via-white to-purple-50/40 p-4 dark:border-violet-900/60 dark:from-violet-950/20 dark:via-slate-900 dark:to-purple-950/20 shadow-2xs">
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-white text-xs font-black">
                                1
                              </span>
                              <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                                {paperFile ? `Đề PDF: ${paperFile.name}` : "Tải file PDF đề kiểm tra (Bắt buộc)"}
                              </p>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              Học viên sẽ mở và đọc trực tiếp file PDF này ở khung đề bài bên trái khi làm bài.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              ref={paperFileInputRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              disabled={!courseId || uploadingPaper || deletingPaper}
                              onChange={handlePaperSelect}
                              className="hidden"
                            />
                            {!paperFile ? (
                              <button
                                type="button"
                                disabled={!courseId || uploadingPaper}
                                onClick={() => paperFileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                              >
                                <FiPlus className="h-3.5 w-3.5" />
                                <span>{uploadingPaper ? "Đang tải lên..." : "Chọn file PDF đề"}</span>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={uploadingPaper || deletingPaper}
                                  onClick={handleReplacePaperFile}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                                >
                                  <FiRefreshCw className="h-3 w-3" /> Thay file
                                </button>
                                <button
                                  type="button"
                                  disabled={uploadingPaper || deletingPaper}
                                  onClick={handleDeletePaperFile}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition disabled:opacity-50"
                                >
                                  <FiTrash2 className="h-3 w-3" /> {deletingPaper ? "Đang xóa..." : "Xóa"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {paperProgress && (
                          <div className="mt-3">
                            <FileUploadProgressBox
                              file={paperFile}
                              progress={paperProgress}
                              isDeleting={deletingPaper}
                              onReplace={handleReplacePaperFile}
                              onRemove={handleDeletePaperFile}
                              onCancel={handleDeletePaperFile}
                            />
                          </div>
                        )}
                      </div>

                      {/* Box 2: File lời giải PDF */}
                      <div className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50/80 via-white to-blue-50/40 p-4 dark:border-sky-900/60 dark:from-sky-950/20 dark:via-slate-900 dark:to-blue-950/20 shadow-2xs">
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-600 text-white text-xs font-black">
                                2
                              </span>
                              <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                                {solutionFile ? `Lời giải: ${solutionFile.name}` : "File lời giải chi tiết PDF (Tùy chọn)"}
                              </p>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              Học viên có thể xem lời giải chi tiết sau khi nộp bài hoặc khi kết thúc thời gian quiz.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              ref={solutionFileInputRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              disabled={!courseId || uploadingSolution || deletingSolution}
                              onChange={handleSolutionSelect}
                              className="hidden"
                            />
                            {!solutionFile ? (
                              <button
                                type="button"
                                disabled={!courseId || uploadingSolution}
                                onClick={() => solutionFileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                              >
                                <FiPlus className="h-3.5 w-3.5" />
                                <span>{uploadingSolution ? "Đang tải lên..." : "Chọn file lời giải PDF"}</span>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={uploadingSolution || deletingSolution}
                                  onClick={handleReplaceSolutionFile}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                                >
                                  <FiRefreshCw className="h-3 w-3" /> Thay file
                                </button>
                                <button
                                  type="button"
                                  disabled={uploadingSolution || deletingSolution}
                                  onClick={handleDeleteSolutionFile}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition disabled:opacity-50"
                                >
                                  <FiTrash2 className="h-3 w-3" /> {deletingSolution ? "Đang xóa..." : "Xóa"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {solutionProgress && (
                          <div className="mt-3">
                            <FileUploadProgressBox
                              file={solutionFile}
                              progress={solutionProgress}
                              isDeleting={deletingSolution}
                              onReplace={handleReplaceSolutionFile}
                              onRemove={handleDeleteSolutionFile}
                              onCancel={handleDeleteSolutionFile}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CỘT PHẢI: BẢNG ĐÁP ÁN HOẶC NỘI DUNG CÂU HỎI */}
              <div className="space-y-4">
                {quizMode === "paper" ? (
                  <>
                    <div className="rounded-2xl border border-violet-300 bg-violet-50/60 p-4 dark:border-violet-800 dark:bg-violet-950/20 space-y-3">
                      {/* Tab Switcher: Paste vs Manual */}
                      <div className="flex rounded-xl bg-violet-200/70 p-1 dark:bg-violet-900/40">
                        <button
                          type="button"
                          onClick={() => setPaperAnswerTab("paste")}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black transition ${
                            paperAnswerTab === "paste"
                              ? "bg-white text-violet-950 shadow-xs dark:bg-slate-900 dark:text-violet-200"
                              : "text-violet-700 hover:text-violet-950 dark:text-violet-300 dark:hover:text-white"
                          }`}
                        >
                          <FiClipboard className="h-3.5 w-3.5" /> Dán đáp án (1A, 2B...)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaperAnswerTab("manual");
                            if (questions.length <= 1) {
                              handleApplyQuestionCount(manualQuestionCount || 40);
                            }
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black transition ${
                            paperAnswerTab === "manual"
                              ? "bg-white text-violet-950 shadow-xs dark:bg-slate-900 dark:text-violet-200"
                              : "text-violet-700 hover:text-violet-950 dark:text-violet-300 dark:hover:text-white"
                          }`}
                        >
                          <FiEdit3 className="h-3.5 w-3.5" /> Nhập thủ công (Số câu)
                        </button>
                      </div>

                      {paperAnswerTab === "paste" ? (
                        /* Tab 1: Dán danh sách đáp án */
                        <div className="space-y-2.5">
                          <p className="text-xs text-violet-800 dark:text-violet-200">
                            Nhận diện thông minh: <b>1a 2b 3c</b>, <b>1. A</b>, <b>Câu 1: A</b>, bảng Excel... viết liền hoặc xuống dòng.
                          </p>
                          <textarea
                            value={answerKeyPaste}
                            onChange={(e) => setAnswerKeyPaste(e.target.value)}
                            rows={6}
                            placeholder={"Ví dụ:\n1a 2b 3c 4d\nhoặc:\n1. A\n2. B\nCâu 3: C..."}
                            className="w-full rounded-xl border border-violet-200 bg-white p-2.5 font-mono text-xs outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 dark:border-violet-800 dark:bg-slate-950 dark:text-white"
                          />
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-violet-800 dark:text-violet-200">
                              Nhận diện:{" "}
                              {parsedAnswerKey.entries.length === 0
                                ? "0 câu"
                                : questions.length === parsedAnswerKey.entries.length
                                  ? `${matchedAnswerCount}/${questions.length} câu`
                                  : `${parsedAnswerKey.entries.length} câu`}
                            </span>
                            <button
                              type="button"
                              onClick={applyPastedAnswerKey}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-500 transition shadow-xs"
                            >
                              <FiCheck className="h-3.5 w-3.5" /> Gán đáp án
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Tab 2: Nhập số câu thủ công */
                        <div className="space-y-3">
                          <div className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-800 dark:bg-slate-900 space-y-2">
                            <div className="flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-200">
                              <span>Số lượng câu hỏi của đề:</span>
                              <span className="text-violet-600 dark:text-violet-400 font-bold">{questions.length} câu</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="1"
                                max="200"
                                value={manualQuestionCount}
                                onChange={(e) => setManualQuestionCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                                className="w-20 rounded-lg border border-violet-300 bg-white px-2 py-1 text-center text-xs font-black text-slate-900 outline-none dark:border-violet-700 dark:bg-slate-950 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => handleApplyQuestionCount(manualQuestionCount)}
                                className="flex-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-500 transition shadow-xs"
                              >
                                Cập nhật số câu
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 pt-1">
                              <span className="text-[10px] text-slate-400">Chọn nhanh:</span>
                              {[10, 20, 25, 40, 50].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => handleApplyQuestionCount(preset)}
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-black transition ${
                                    questions.length === preset
                                      ? "bg-violet-600 text-white"
                                      : "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300"
                                  }`}
                                >
                                  {preset} câu
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Điền nhanh chuỗi đáp án */}
                          <div className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-800 dark:bg-slate-900 space-y-1.5">
                            <span className="block text-xs font-black text-slate-800 dark:text-slate-200">
                              Điền nhanh chuỗi đáp án:
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={quickFillSequence}
                                onChange={(e) => setQuickFillSequence(e.target.value.toUpperCase())}
                                placeholder="VD: ABCDABCDDCBA..."
                                className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-900 uppercase tracking-widest outline-none dark:border-violet-700 dark:bg-slate-950 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={handleQuickFillSequence}
                                disabled={!quickFillSequence.trim()}
                                className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-black text-white hover:bg-violet-500 transition disabled:opacity-40 shrink-0"
                              >
                                Điền nhanh
                              </button>
                            </div>
                          </div>

                          {/* Tiện ích gán tất cả */}
                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                              Đã tạo: {questions.length} câu
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSetAllAnswers(0)}
                                className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300"
                              >
                                Tất cả A
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetAllAnswers(1)}
                                className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300"
                              >
                                Tất cả B
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bảng đáp án trực quan */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-black text-slate-950 dark:text-white">Bảng đáp án trực quan</h3>
                            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-700 dark:text-violet-300">
                              {questions.length} câu
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Nhấn A, B, C, D cho câu Trắc nghiệm · Bấm nút <span className="font-bold text-amber-600 dark:text-amber-400">[✍️ TL]</span> để chuyển câu thành Tự luận
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold">
                          <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            TN: {mcCount} câu
                          </span>
                          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${essayCount > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-black ring-1 ring-amber-400/40" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                            ✍️ Tự luận: {essayCount} câu
                          </span>
                        </div>
                      </div>

                      {/* Thanh công cụ gắn nhanh câu Tự luận */}
                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 dark:text-amber-200">
                            <span>✍️ Công cụ đánh dấu Tự luận:</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleMarkLastQuestionsAsEssay(5)}
                              className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-black text-amber-800 shadow-2xs hover:bg-amber-100 hover:border-amber-400 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/60 transition"
                              title="Đánh dấu 5 câu cuối cùng của đề là Tự luận"
                            >
                              ✍️ 5 câu cuối là Tự luận
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkLastQuestionsAsEssay(10)}
                              className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-black text-amber-800 shadow-2xs hover:bg-amber-100 hover:border-amber-400 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/60 transition"
                              title="Đánh dấu 10 câu cuối cùng của đề là Tự luận"
                            >
                              ✍️ 10 câu cuối là Tự luận
                            </button>
                            {essayCount > 0 && (
                              <button
                                type="button"
                                onClick={handleClearAllEssay}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                                title="Đưa toàn bộ câu hỏi về dạng Trắc nghiệm"
                              >
                                🔘 Tất cả là TN
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Bộ chọn dải câu: Từ câu ... đến câu ... */}
                        <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-amber-200/50 dark:border-amber-900/30 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          <span className="text-[10px] text-amber-800 dark:text-amber-300">Đặt dải tự luận:</span>
                          <span className="text-[10px]">Từ câu</span>
                          <input
                            type="number"
                            min="1"
                            max={questions.length}
                            value={essayRangeFrom}
                            onChange={(e) => setEssayRangeFrom(Math.max(1, Math.min(questions.length, Number(e.target.value) || 1)))}
                            className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-xs font-black dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <span className="text-[10px]">đến câu</span>
                          <input
                            type="number"
                            min="1"
                            max={questions.length}
                            value={essayRangeTo}
                            onChange={(e) => setEssayRangeTo(Math.max(1, Math.min(questions.length, Number(e.target.value) || 1)))}
                            className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-xs font-black dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <span className="text-[10px]">thang</span>
                          <input
                            type="number"
                            min="0.25"
                            max="50"
                            step="0.25"
                            value={essayRangePoints}
                            onChange={(e) => setEssayRangePoints(e.target.value)}
                            className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-xs font-black dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <span className="text-[10px]">đ/câu</span>
                          <button
                            type="button"
                            onClick={handleApplyEssayRange}
                            className="rounded-md bg-amber-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-amber-500 transition shadow-2xs"
                          >
                            Áp dụng
                          </button>
                        </div>
                      </div>

                      <AnswerKeySheet
                        questions={questions}
                        onChooseAnswer={(questionIndex, answerIndex) => {
                          updateQuestion(questionIndex, { correctAnswer: answerIndex, isEssay: false, type: "single" });
                          setAnswerKeyPaste((currentText) => {
                            const lines = currentText ? currentText.split("\n") : [];
                            while (lines.length < questions.length) {
                              const idx = lines.length;
                              const existingKey = QUIZ_OPTION_KEYS[questions[idx]?.correctAnswer] || "A";
                              lines.push(`${idx + 1} ${existingKey}`);
                            }
                            lines[questionIndex] = `${questionIndex + 1} ${QUIZ_OPTION_KEYS[answerIndex] || "A"}`;
                            return lines.join("\n");
                          });
                        }}
                        onScrollToQuestion={scrollToQuestion}
                        onToggleEssay={handleToggleQuestionEssay}
                        onUpdatePoints={handleUpdateQuestionPoints}
                      />
                    </div>
                  </>
                ) : (
                  /* Chế độ tự soạn từng câu */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-black text-slate-950 dark:text-white">
                          Danh sách câu hỏi ({questions.length} câu)
                        </h3>
                        <p className="text-[10px] text-slate-400">Soạn nội dung và đánh dấu đáp án đúng cho từng câu.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuestions((curr) => [...curr, createBlankQuestion()])}
                        className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-500 shadow-xs transition"
                      >
                        <FiPlus className="h-3.5 w-3.5" /> Thêm câu
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {questions.map((question, questionIndex) => (
                        <div
                          key={question.id}
                          id={`quiz-editor-question-${questionIndex}`}
                          className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-lg bg-violet-600 px-2 py-0.5 text-[11px] font-black text-white">
                                Câu {questionIndex + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleQuestionEssay(questionIndex)}
                                className={`rounded-lg px-2 py-0.5 text-[10px] font-black transition ${
                                  question.isEssay || question.type === "essay"
                                    ? "bg-amber-500 text-white shadow-2xs hover:bg-amber-600"
                                    : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                                title="Chuyển đổi giữa câu Trắc nghiệm và Tự luận"
                              >
                                {question.isEssay || question.type === "essay" ? "✍️ Tự luận" : "🔘 Trắc nghiệm"}
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                Điểm:
                                <input
                                  type="number"
                                  min="0.25"
                                  max="100"
                                  step="0.25"
                                  value={question.points}
                                  onChange={(e) => updateQuestion(questionIndex, { points: e.target.value })}
                                  className="w-12 rounded border border-slate-300 bg-slate-50 px-1 py-0.5 text-center text-xs dark:border-slate-700 dark:bg-slate-950"
                                />
                              </label>
                              <button
                                type="button"
                                disabled={!courseId}
                                onClick={() => saveQuestionToBank(questionIndex)}
                                className="rounded px-2 py-1 text-[10px] font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-40 dark:text-violet-300"
                              >
                                Lưu NH
                              </button>
                              <button
                                type="button"
                                disabled={questions.length === 1}
                                onClick={() => setQuestions((curr) => curr.filter((_, idx) => idx !== questionIndex))}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                              >
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <textarea
                            value={question.questionText}
                            onChange={(e) => updateQuestion(questionIndex, { questionText: e.target.value })}
                            rows={2}
                            placeholder={
                              question.isEssay || question.type === "essay"
                                ? `Nhập nội dung/đề bài Câu tự luận ${questionIndex + 1}...`
                                : `Nhập nội dung Câu ${questionIndex + 1}...`
                            }
                            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-semibold outline-none focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                          />

                          {question.isEssay || question.type === "essay" ? (
                            <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/80 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                              <div className="flex items-center gap-2">
                                <span className="text-base">✍️</span>
                                <div>
                                  <p className="font-bold">Câu hỏi tự luận (giải trên giấy & chụp ảnh bài làm)</p>
                                  <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                                    Học sinh sẽ xem đề và chụp ảnh bài làm để tải lên nộp. Giáo viên chấm điểm và nhận xét sau khi nộp.
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleQuestionEssay(questionIndex)}
                                className="rounded-lg bg-amber-200 px-2 py-1 text-[10px] font-black text-amber-900 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100"
                              >
                                Chuyển sang TN
                              </button>
                            </div>
                          ) : (
                            <div className="grid gap-1.5 sm:grid-cols-2">
                            {question.options.map((option, optIdx) => {
                              const key = optionKeyAt(optIdx);
                              const active = question.correctAnswer === optIdx;
                              return (
                                <div
                                  key={key}
                                  className={`flex items-center gap-1.5 rounded-xl border p-1.5 transition ${
                                    active ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(questionIndex, { correctAnswer: optIdx })}
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                                      active ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 text-slate-500"
                                    }`}
                                  >
                                    {key}
                                  </button>
                                  <input
                                    value={option}
                                    onChange={(e) => updateOption(questionIndex, optIdx, e.target.value)}
                                    placeholder={`Đáp án ${key}`}
                                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        </div>
                      ))}
                    </div>

                    {/* Ngân hàng câu hỏi chèn nhanh */}
                    {courseId && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                            Ngân hàng câu hỏi khóa học
                          </span>
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            {questionBank.length}
                          </span>
                        </div>
                        <QuestionBankSampler
                          courseId={courseId}
                          onAdd={(items) =>
                            setQuestions((curr) => [
                              ...curr.filter((q) => q.questionText.trim() || q.options.some((o) => o.trim())),
                              ...items.map((it) => ({ ...it, id: crypto.randomUUID() })),
                            ])
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <span className="text-xs text-slate-500">
                Đã chuẩn bị <b>{questions.length}</b> câu hỏi · Thời gian làm bài <b>{timeLimit}</b> phút.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveQuiz("DRAFT")}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Lưu nháp
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveQuiz("PUBLISHED")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-violet-600/30 hover:bg-violet-500 disabled:opacity-50 transition"
                >
                  <FiSend className="h-4 w-4" />
                  {saving ? "Đang xuất bản..." : "Xuất bản cho học viên"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* MODAL THỐNG KÊ CHI TIẾT KẾT QUẢ QUIZ */}
      {selectedQuizForStats && (
        <QuizStatsModal
          quiz={selectedQuizForStats}
          onClose={() => setSelectedQuizForStats(null)}
        />
      )}
    </div>
  );
}
