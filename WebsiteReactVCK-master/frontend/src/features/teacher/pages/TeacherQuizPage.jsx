/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiAlertTriangle,
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
import {
  createTeacherQuiz,
  createQuestionBankItem,
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

const normalizeQuestionForSubmit = (question, index = 0, mode = "manual") => {
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

function AnswerKeySheet({ questions, onChooseAnswer, onScrollToQuestion }) {
  const maxOptions = Math.max(4, ...questions.map((q) => q.options?.length || 4));
  const visibleKeys = QUIZ_OPTION_KEYS.slice(0, Math.min(maxOptions, 6));

  return (
    <div className="overflow-x-auto max-h-[360px] overflow-y-auto pr-1">
      <div
        className="grid min-w-[280px] items-center gap-y-1.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200"
        style={{ gridTemplateColumns: `56px repeat(${visibleKeys.length}, minmax(32px, 1fr))` }}
      >
        <span className="text-[10px] font-black uppercase text-slate-400">Câu</span>
        {visibleKeys.map((key) => (
          <span key={key} className="text-xs font-black text-violet-700 dark:text-violet-300">
            {key}
          </span>
        ))}
        {questions.map((question, index) => (
          <div className="contents" key={question.id || `q-${index}`}>
            <button
              type="button"
              onClick={() => onScrollToQuestion?.(index)}
              className="rounded-lg py-1 text-left font-black text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 text-[11px]"
              title={`Đi tới câu ${index + 1}`}
            >
              Câu {index + 1}
            </button>
            {visibleKeys.map((key) => {
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
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function QuizStatsModal({ quiz, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [tabFilter, setTabFilter] = useState("all"); // "all" | "submitted" | "not_started"
  const [search, setSearch] = useState("");

  const loadReport = useCallback(async () => {
    if (!quiz?.id) return;
    setLoading(true);
    try {
      const res = await fetchTeacherQuizReport(quiz.id);
      if (res?.success && res?.data) {
        setData(res.data);
      } else {
        throw new Error(res?.message || "Không thể tải báo cáo");
      }
    } catch (err) {
      console.warn("Lỗi tải báo cáo quiz, thử tải dự phòng:", err);
      if (quiz.classId) {
        try {
          const classRes = await fetchClassDetails(quiz.classId);
          const enrollments = classRes?.data?.students || classRes?.data?.enrollments || [];
          const students = enrollments.map((e) => ({
            userId: String(e.id || e.userId),
            username: e.username || e.name || "Học viên",
            email: e.email || "",
            avatarUrl: e.avatarUrl || e.avatar,
            fullName: e.fullName || e.name || e.username || "Học viên",
            status: "not_started",
            score: null,
            maxScore: null,
            scorePercentage: null,
            passed: false,
            attemptNumber: 0,
            totalAttempts: 0,
            startedAt: null,
            submittedAt: null,
          }));
          setData({
            quiz,
            summary: {
              totalStudents: students.length,
              submittedCount: quiz.attemptsCount || 0,
              unsubmittedCount: Math.max(0, students.length - (quiz.attemptsCount || 0)),
              inProgressCount: 0,
              submissionRate: students.length ? Math.round(((quiz.attemptsCount || 0) / students.length) * 100) : 0,
              avgScore: quiz.avgScore,
              maxScore: null,
              minScore: null,
              passedCount: 0,
              failedCount: 0,
              distribution: { excellent: 0, good: 0, average: 0, weak: 0 },
            },
            students,
          });
        } catch {
          toast.error("Không thể tải thông tin học sinh của lớp");
        }
      } else {
        toast.error("Không thể tải báo cáo chi tiết cho quiz này");
      }
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

  const students = data?.students || [];

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
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
    });
  }, [students, tabFilter, search]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header Modal */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/20">
              <FiBarChart2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-black text-slate-950 dark:text-white sm:text-lg">
                  {quiz.title}
                </h2>
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                  quiz.status === "PUBLISHED"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}>
                  {quiz.status === "PUBLISHED" ? "ĐANG CÔNG BỐ" : "BẢN NHÁP"}
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
              <FiDownload className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
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
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading ? (
            <Loading loading text="Đang tải dữ liệu thống kê kết quả học viên..." fullScreen={false} className="py-20" />
          ) : (
            <>
              {/* Thẻ KPI Tổng quan */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Học viên lớp</span>
                    <FiUsers className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                    {summary.totalStudents}
                  </div>
                  <span className="text-[10px] text-slate-500">Sĩ số chính thức</span>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-950/60 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Đã nộp bài</span>
                    <FiUserCheck className="h-4 w-4" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    {summary.submittedCount}
                    <span className="ml-1 text-xs font-bold opacity-80">({summary.submissionRate}%)</span>
                  </div>
                  <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Tỷ lệ nộp bài</span>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 dark:border-rose-950/60 dark:bg-rose-950/20">
                  <div className="flex items-center justify-between text-rose-700 dark:text-rose-300">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Chưa làm bài</span>
                    <FiUserX className="h-4 w-4" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">
                    {summary.unsubmittedCount}
                  </div>
                  <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80">Cần nhắc nhở</span>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 dark:border-violet-950/60 dark:bg-violet-950/20">
                  <div className="flex items-center justify-between text-violet-700 dark:text-violet-300">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Điểm trung bình</span>
                    <FiAward className="h-4 w-4" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-violet-700 dark:text-violet-300">
                    {summary.avgScore !== null ? `${summary.avgScore}%` : "—"}
                  </div>
                  <span className="text-[10px] text-violet-600/80 dark:text-violet-400/80">
                    {summary.maxScore !== null ? `Cao nhất: ${summary.maxScore}%` : "Chưa có điểm"}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-950/60 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Tỷ lệ đạt chuẩn</span>
                    <FiCheckCircle className="h-4 w-4" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">
                    {summary.submittedCount > 0
                      ? `${Math.round((summary.passedCount / summary.submittedCount) * 100)}%`
                      : "—"}
                  </div>
                  <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
                    {summary.passedCount}/{summary.submittedCount} bài đạt &ge; {quiz.passingScore || 60}%
                  </span>
                </div>
              </div>

              {/* Phổ điểm phân bố */}
              {summary.submittedCount > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-200">
                    <span>Phân bổ kết quả theo phổ điểm</span>
                    <span className="text-[11px] font-semibold text-slate-500">Dựa trên {summary.submittedCount} bài đã nộp</span>
                  </div>

                  {/* Thanh tiến trình phân bố */}
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 flex">
                    {summary.distribution.excellent > 0 && (
                      <div
                        style={{ width: `${(summary.distribution.excellent / summary.submittedCount) * 100}%` }}
                        className="bg-emerald-500 transition-all"
                        title={`Xuất sắc (>=80%): ${summary.distribution.excellent} học viên`}
                      />
                    )}
                    {summary.distribution.good > 0 && (
                      <div
                        style={{ width: `${(summary.distribution.good / summary.submittedCount) * 100}%` }}
                        className="bg-blue-500 transition-all"
                        title={`Khá (65-79%): ${summary.distribution.good} học viên`}
                      />
                    )}
                    {summary.distribution.average > 0 && (
                      <div
                        style={{ width: `${(summary.distribution.average / summary.submittedCount) * 100}%` }}
                        className="bg-amber-500 transition-all"
                        title={`Trung bình (50-64%): ${summary.distribution.average} học viên`}
                      />
                    )}
                    {summary.distribution.weak > 0 && (
                      <div
                        style={{ width: `${(summary.distribution.weak / summary.submittedCount) * 100}%` }}
                        className="bg-rose-500 transition-all"
                        title={`Cần cố gắng (<50%): ${summary.distribution.weak} học viên`}
                      />
                    )}
                  </div>

                  {/* Badges chi tiết */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                    <div className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                      <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300 font-semibold text-[11px]">Xuất sắc (&ge;80%):</span>
                      <b className="ml-auto font-black text-slate-900 dark:text-white">{summary.distribution.excellent}</b>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                      <span className="h-3 w-3 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300 font-semibold text-[11px]">Khá (65-79%):</span>
                      <b className="ml-auto font-black text-slate-900 dark:text-white">{summary.distribution.good}</b>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                      <span className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300 font-semibold text-[11px]">Trung bình (50-64%):</span>
                      <b className="ml-auto font-black text-slate-900 dark:text-white">{summary.distribution.average}</b>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                      <span className="h-3 w-3 rounded-full bg-rose-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300 font-semibold text-[11px]">Cần cố gắng (&lt;50%):</span>
                      <b className="ml-auto font-black text-slate-900 dark:text-white">{summary.distribution.weak}</b>
                    </div>
                  </div>
                </div>
              )}

              {/* Danh sách học viên và bộ lọc */}
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Tabs lọc trạng thái */}
                  <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
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
                  </div>

                  {/* Tìm kiếm */}
                  <div className="relative min-w-[200px] sm:w-64">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm tên hoặc username..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs font-medium outline-none focus:border-violet-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white transition"
                    />
                  </div>
                </div>

                {/* Bảng danh sách học viên */}
                {filteredStudents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 dark:border-slate-800">
                    <p className="text-xs font-semibold">Không tìm thấy học viên nào phù hợp với bộ lọc.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                          <th className="py-3 px-3.5 text-center w-12">STT</th>
                          <th className="py-3 px-3.5">Học viên</th>
                          <th className="py-3 px-3.5 text-center">Trạng thái</th>
                          <th className="py-3 px-3.5 text-center">Điểm số</th>
                          <th className="py-3 px-3.5 text-center">Số lượt</th>
                          <th className="py-3 px-3.5">Thời gian nộp</th>
                          <th className="py-3 px-3.5 text-center">Đánh giá</th>
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
    </div>
  );
}

export default function TeacherQuizPage() {
  const [searchParams] = useSearchParams();
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
  const paperFileInputRef = useRef(null);
  const solutionFileInputRef = useRef(null);
  const [questionBank, setQuestionBank] = useState([]);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);

  const parsedAnswerKey = useMemo(() => parseQuizAnswerKey(answerKeyPaste), [answerKeyPaste]);
  const matchedAnswerCount = useMemo(
    () => parsedAnswerKey.entries.filter(({ questionNumber }) => questionNumber <= questions.length).length,
    [parsedAnswerKey, questions.length],
  );
  const paperAnswersAreApplied = useMemo(() => {
    if (questions.length === 0) return false;
    const allHaveAnswers = questions.every(
      (q) => typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < (q.options?.length || 4)
    );
    if (paperAnswerTab === "manual") {
      return allHaveAnswers;
    }
    if (!parsedAnswerKey.entries.length) return false;
    const largestQuestionNumber = Math.max(...parsedAnswerKey.entries.map((entry) => entry.questionNumber));
    return (
      questions.length >= largestQuestionNumber &&
      Array.from({ length: largestQuestionNumber }, (_, index) => parsedAnswerKey.answerByQuestion.has(index + 1)).every(Boolean) &&
      allHaveAnswers
    );
  }, [paperAnswerTab, parsedAnswerKey, questions]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [quizResponse, courseResponse, classResponse] = await Promise.all([
        fetchTeacherQuizzes(),
        fetchAdminCourses(),
        requestedClassId ? fetchClassDetails(requestedClassId) : Promise.resolve(null),
      ]);
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

  // Filtering Quizzes
  const filteredQuizzes = useMemo(() => {
    return sortedQuizzes.filter((quiz) => {
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
  }, [sortedQuizzes, statusFilter, scopeFilter, searchQuery]);

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
      const updated = current.map((q) => ({ ...q, correctAnswer: optionIndex }));
      const key = QUIZ_OPTION_KEYS[optionIndex] || "A";
      const synced = updated.map((_, idx) => `${idx + 1} ${key}`).join("\n");
      setAnswerKeyPaste(synced);
      return updated;
    });
    toast.success(`Đã gán tất cả ${questions.length} câu thành đáp án ${QUIZ_OPTION_KEYS[optionIndex]}.`);
  };

  const handleDeletePaperFile = async () => {
    if (!paperFile) return;
    const fileId = paperFile.id;
    const fileName = paperFile.name || "file đề PDF";

    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${fileName}"? File sẽ bị xóa vĩnh viễn khỏi Cloudflare R2.`)) {
      return;
    }

    if (fileId) {
      setDeletingPaper(true);
      try {
        await deleteTeacherFile(fileId);
        toast.success(`Đã xóa "${fileName}" khỏi Cloudflare R2.`);
      } catch (err) {
        console.error("Lỗi xóa file đề trên R2:", err);
        toast.error(err?.message || "Không thể xóa file đề trên R2.");
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

    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${fileName}"? File sẽ bị xóa vĩnh viễn khỏi Cloudflare R2.`)) {
      return;
    }

    if (fileId) {
      setDeletingSolution(true);
      try {
        await deleteTeacherFile(fileId);
        toast.success(`Đã xóa "${fileName}" khỏi Cloudflare R2.`);
      } catch (err) {
        console.error("Lỗi xóa file lời giải trên R2:", err);
        toast.error(err?.message || "Không thể xóa file lời giải trên R2.");
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
      const unassignedIndex = questions.findIndex(
        (q) => typeof q.correctAnswer !== "number" || q.correctAnswer < 0 || q.correctAnswer >= (q.options?.length || 4)
      );
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
      const response = await createTeacherQuiz({
        title: quizTitle.trim(),
        description: quizDesc.trim(),
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 pb-20 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Header */}
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 md:flex-row md:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">
              <FiClipboard className="h-3.5 w-3.5" /> Quản lý Quiz & Kiểm tra
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Đề trắc nghiệm & Báo cáo điểm
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Giao quiz buổi học hoặc bài tập về nhà, theo dõi tiến độ nộp bài và phổ điểm của từng lớp.
            </p>
          </div>

          {/* 2 Tabs chuyển đổi chính */}
          <div className="inline-flex rounded-2xl bg-slate-200/80 p-1.5 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab("assigned")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                activeTab === "assigned"
                  ? "bg-white text-violet-700 shadow-md dark:bg-slate-800 dark:text-violet-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <FiClipboard className="h-4 w-4" />
              <span>Quiz đã giao ({quizzes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                activeTab === "create"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <FiPlus className="h-4 w-4" />
              <span>Tạo quiz mới</span>
            </button>
          </div>
        </header>

        {/* TAB 1: DANH SÁCH QUIZ ĐÃ GIAO */}
        {activeTab === "assigned" && (
          <section className="space-y-5 animate-in fade-in duration-200">
            {/* Thanh tìm kiếm & lọc */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên đề, lớp học, khóa học..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs font-medium outline-none transition focus:border-violet-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  <option value="all">Tất cả dạng đề</option>
                  <option value="session">Quiz trong buổi học</option>
                  <option value="homework">Bài tập về nhà</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="PUBLISHED">Đang công bố</option>
                  <option value="DRAFT">Bản nháp</option>
                </select>

                <button
                  type="button"
                  onClick={() => setActiveTab("create")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-black text-white hover:bg-violet-500 shadow-sm transition shrink-0"
                >
                  <FiPlus className="h-3.5 w-3.5" /> Thêm mới
                </button>
              </div>
            </div>

            {loading ? (
              <Loading loading text="Đang tải danh sách đề kiểm tra..." fullScreen={false} className="min-h-[40vh] py-16" />
            ) : filteredQuizzes.length === 0 ? (
              <EmptyState
                title={quizzes.length === 0 ? "Chưa có đề quiz nào" : "Không có quiz phù hợp với tìm kiếm"}
                description={
                  quizzes.length === 0
                    ? "Tạo đề quiz đầu tiên cho lớp học để học viên làm bài và thống kê kết quả."
                    : "Hãy thử thay đổi từ khóa hoặc bộ lọc trạng thái để xem các quiz khác."
                }
                actionLabel="Tạo quiz mới"
                onAction={() => setActiveTab("create")}
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredQuizzes.map((quiz) => (
                  <article
                    key={quiz.id}
                    className="group relative flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-black ${
                              quiz.status === "PUBLISHED"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {quiz.status === "PUBLISHED" ? "ĐANG CÔNG BỐ" : "BẢN NHÁP"}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                              quiz.activityScope === "homework"
                                ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                : "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
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
                        onClick={() => setSelectedQuizForStats(quiz)}
                        className="line-clamp-2 cursor-pointer text-base font-black text-slate-950 transition hover:text-violet-600 dark:text-white dark:hover:text-violet-400"
                        title={quiz.title}
                      >
                        {quiz.title}
                      </h2>

                      {/* Course and Class */}
                      <div className="space-y-1 text-xs">
                        <p className="flex items-center gap-1.5 truncate font-bold text-violet-700 dark:text-violet-300">
                          <FiBookOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{quiz.courseTitle}</span>
                        </p>
                        <p className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300 flex items-center gap-1.5">
                          <FiUsers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{quiz.classTitle} · {formatQuizSession(quiz)}</span>
                        </p>
                        {quiz.activityScope === "homework" && (
                          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <FiClock className="h-3 w-3 shrink-0" />
                            Hạn nộp: {quiz.dueDate ? new Date(quiz.dueDate).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "Chưa đặt"}
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
                          onClick={() => setSelectedQuizForStats(quiz)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50 border border-violet-200/80 dark:border-violet-800/80"
                        >
                          <FiBarChart2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                          <span>Xem thống kê & học viên</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Xóa quiz “${quiz.title}”? Toàn bộ lượt làm bài liên quan cũng sẽ bị xóa.`)) return;
                            try {
                              await deleteTeacherQuiz(quiz.id);
                              setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
                              toast.success("Đã xóa quiz.");
                            } catch (error) {
                              toast.error(error?.message || "Không thể xóa quiz");
                            }
                          }}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                          title="Xóa quiz này"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
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
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-black text-slate-950 dark:text-white">Bảng đáp án trực quan</h3>
                          <p className="text-[10px] text-slate-400">Nhấn vào nút A, B, C, D để đổi đáp án từng câu</p>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                          {questions.length} câu
                        </span>
                      </div>

                      <AnswerKeySheet
                        questions={questions}
                        onChooseAnswer={(questionIndex, answerIndex) => {
                          updateQuestion(questionIndex, { correctAnswer: answerIndex });
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
                            <span className="rounded-lg bg-violet-600 px-2 py-0.5 text-[11px] font-black text-white">
                              Câu {questionIndex + 1}
                            </span>
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
                            placeholder={`Nhập nội dung Câu ${questionIndex + 1}...`}
                            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-semibold outline-none focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                          />

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
