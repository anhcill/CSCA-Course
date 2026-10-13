/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiBookOpen,
  FiCheck,
  FiCheckCircle,
  FiDownload,
  FiExternalLink,
  FiEye,
  FiFileText,
  FiFlag,
  FiMaximize2,
  FiMinimize2,
  FiRotateCcw,
  FiSend,
  FiTarget,
} from "react-icons/fi";
import { fetchQuiz, saveQuizAnswers, submitQuiz } from "../../api/lmsClient";
import { ErrorState, LoadingState } from "../../../components/common/StateView";

function ScoreRing({ score, total }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const color = progress >= 0.6 ? "#10b981" : "#ef4444";
  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="font-mono text-3xl font-black text-white">{score}</strong>
        <span className="text-xs text-slate-400">/ {total} điểm</span>
      </div>
    </div>
  );
}

export default function QuizPlayerPage() {
  const { quizId, courseId, classId } = useParams();
  const navigate = useNavigate();
  const assignmentListPath = courseId && classId ? `/lms/courses/${courseId}/classes/${classId}/assignments` : "/lms/assignments";

  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState({});
  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [totalTime, setTotalTime] = useState(60 * 60);
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [reviewMode, setReviewMode] = useState(false);
  const [activeViewerTab, setActiveViewerTab] = useState("paper"); // "paper" | "solution" | "questions"
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState("paper"); // "paper" | "sheet"
  const [saveStatus, setSaveStatus] = useState("saved");

  const containerRef = useRef(null);

  const questions = useMemo(() => quizData?.questions || [], [quizData]);
  const isTimed = useMemo(() => Number(quizData?.durationMinutes || 0) > 0, [quizData]);

  const answerKeys = useMemo(() => {
    const keys = [...new Set(questions.flatMap((question) => (question.options || []).map((option) => option.key)))].sort();
    return keys.length ? keys : ["A", "B", "C", "D"];
  }, [questions]);

  const reviewByQuestion = useMemo(
    () => new Map((result?.review || []).map((item) => [String(item.questionId), item])),
    [result]
  );

  const answeredCount = useMemo(() => questions.filter((question) => {
    const value = answers[question.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length, [answers, questions]);

  const unansweredCount = Math.max(0, questions.length - answeredCount);

  // Toggle HTML5 Fullscreen API
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const el = containerRef.current || document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetchQuiz(quizId);
      if (!response.success || !response.data || response.data.questions?.length === 0) {
        throw new Error("Đề thi chưa sẵn sàng hoặc không tồn tại");
      }
      const data = response.data;
      const isSubmitted = Boolean(data.result);
      const serverAnswers = data.attempt?.answers || {};
      let savedAnswers = {};
      if (!isSubmitted && !data.attempt && Object.keys(serverAnswers).length === 0) {
        try {
          savedAnswers = JSON.parse(localStorage.getItem(`csca_quiz_${quizId}`) || "{}");
        } catch {
          savedAnswers = {};
        }
      }
      setQuizData(data);
      setResult(data.result || null);
      setAnswers(Object.keys(serverAnswers).length ? serverAnswers : savedAnswers);

      const limit = Number(data.timeLimitSeconds) || Number(data.durationMinutes || 60) * 60;
      setTotalTime(limit);
      const startedAt = data.attempt?.startedAt ? new Date(data.attempt.startedAt).getTime() : Date.now();
      const expiresAt = data.attempt?.expiresAt ? new Date(data.attempt.expiresAt).getTime() : startedAt + limit * 1000;
      setTimeLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

      if (isSubmitted) {
        setReviewMode(true);
      }
    } catch (error) {
      console.error("Could not load quiz:", error);
      setLoadError(error?.message || "Không thể tải đề thi");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  // Autosave answers
  useEffect(() => {
    if (result || Object.keys(answers).length === 0) return undefined;
    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(`csca_quiz_${quizId || "quiz"}`, JSON.stringify(answers));
      } catch {
        /* Offline convenience */
      }
      saveQuizAnswers({ quizId, answers })
        .then(() => setSaveStatus("saved"))
        .catch(async (error) => {
          setSaveStatus("error");
          if (error?.errorCode === "QUIZ_ATTEMPT_EXPIRED") {
            toast("Đã hết thời gian, hệ thống đang tải kết quả đã lưu.", { icon: "⏱️" });
            await loadQuiz();
          }
        });
    }, 650);
    return () => clearTimeout(timeout);
  }, [answers, quizId, result, loadQuiz]);

  const handleSelect = useCallback((question, optionKey) => {
    if (result && !reviewMode) return;
    if (result && reviewMode) return; // Read-only in review
    setAnswers((current) => {
      if (question.question_type === "multiple_choice") {
        const previous = Array.isArray(current[question.id]) ? current[question.id] : [];
        const next = previous.includes(optionKey) ? previous.filter((key) => key !== optionKey) : [...previous, optionKey];
        if (next.length === 0) {
          const rest = { ...current };
          delete rest[question.id];
          return rest;
        }
        return { ...current, [question.id]: next };
      }
      return { ...current, [question.id]: optionKey };
    });
  }, [result, reviewMode]);

  const toggleFlag = useCallback((questionId) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  const doSubmit = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    try {
      const response = await submitQuiz({ quizId, answers });
      if (!response.success || !response.data) throw new Error("Máy chủ chưa ghi nhận được bài thi");
      setResult(response.data);
      if (response.data.solutionUrl) {
        setQuizData((curr) => ({ ...curr, solutionUrl: response.data.solutionUrl }));
      }
      try {
        localStorage.removeItem(`csca_quiz_${quizId}`);
      } catch {
        /* no-op */
      }
      toast.success(`Nộp bài thành công: ${response.data.score}/${response.data.maxScore} điểm.`);
      setReviewMode(true);
    } catch (error) {
      console.error("Quiz submission failed:", error);
      toast.error(error?.message || "Không thể nộp bài. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }, [answers, quizId, result, submitting]);

  // Timer countdown
  useEffect(() => {
    if (result || loading || reviewMode || !isTimed) return undefined;
    const timer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          clearInterval(timer);
          toast.error("Đã hết thời gian, hệ thống đang nộp bài.");
          doSubmit();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [doSubmit, isTimed, loading, result, reviewMode]);

  const handleExit = () => {
    if (!result && answeredCount > 0) {
      setShowExitConfirm(true);
    } else {
      navigate(assignmentListPath);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070d19] p-6 text-white">
        <div className="w-full max-w-md">
          <LoadingState message="Đang khởi tạo đề làm bài..." count={3} />
        </div>
      </div>
    );
  }

  if (loadError || !quizData) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070d19] p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0c1527] p-6 text-center">
          <ErrorState
            title="Không thể mở đề thi"
            message={loadError || "Không tìm thấy nội dung đề thi."}
            onRetry={loadQuiz}
            secondaryAction={
              <Link to={assignmentListPath} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700">
                ← Bài tập & Quiz
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // Active paper/solution URL
  const currentViewUrl = activeViewerTab === "solution" && quizData.solutionUrl ? quizData.solutionUrl : quizData.paperUrl;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-[#060c18] text-slate-100 select-none font-sans"
    >
      {/* TOP BAR / HEADER */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/90 bg-[#091122] px-3 sm:px-5 gap-2 z-20">
        {/* Left: Title & Exit */}
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white shadow-md shadow-rose-950/50">
            <FiTarget className="h-5 w-5 animate-spin-slow" />
          </div>

          <div className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-wider text-rose-400">
              {quizData.activityScope === "homework" ? "BÀI TẬP VỀ NHÀ" : "LUYỆN CHỦ ĐỀ"}
            </span>
            <h1 className="truncate text-sm sm:text-base font-black text-white" title={quizData.title}>
              {quizData.title.toUpperCase()}
            </h1>
          </div>

          <button
            type="button"
            onClick={handleExit}
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            title="Thoát ra danh sách bài tập"
          >
            <FiArrowLeft className="h-3.5 w-3.5" /> Thoát
          </button>

          {/* Mode Pill */}
          <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0d172a] px-3 py-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-[10px]">
              🎯
            </span>
            <div className="leading-tight">
              <span className="block text-[9px] font-bold text-slate-400 uppercase">Chế độ</span>
              <span className="block text-xs font-bold text-slate-200">
                {isTimed ? "Thi tính giờ" : "Tự do luyện tập"}
              </span>
            </div>
          </div>
        </div>

        {/* Center / Right: Progress & Timer */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Answered badge */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0d172a] px-3 py-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 text-xs font-black">
              ✓
            </span>
            <div className="leading-tight">
              <span className="block text-[9px] font-bold text-slate-400 uppercase">Đã làm</span>
              <span className="block text-xs font-mono font-black text-white">
                {answeredCount}/{questions.length} câu
              </span>
            </div>
          </div>

          {/* Timer / Duration Red Pill */}
          <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-3.5 py-1.5 text-white shadow-lg shadow-red-950/40">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white font-black text-xs">
              {isTimed && !result ? "⏱️" : "✓"}
            </div>
            <div className="leading-tight text-left">
              <span className="block text-xs font-black tracking-tight">
                {result
                  ? `Đã nộp bài: ${result.score}/${result.maxScore} đ`
                  : isTimed
                  ? `Còn lại: ${formatTimer(timeLeft)}`
                  : "Không giới hạn thời gian"}
              </span>
              <span className="block text-[10px] text-red-100 font-semibold">
                {result
                  ? `${result.percentage}% chính xác`
                  : isTimed
                  ? `Thời gian: ${quizData.durationMinutes} phút`
                  : "Làm theo nhịp của bạn"}
              </span>
            </div>
          </div>

          {/* Mobile exit button */}
          <button
            type="button"
            onClick={handleExit}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300"
            title="Thoát"
          >
            <FiArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* MOBILE SWITCHER TABS */}
      <div className="flex lg:hidden shrink-0 border-b border-slate-800 bg-[#0a1222] px-3 py-1.5 gap-2">
        <button
          type="button"
          onClick={() => setMobileTab("paper")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${
            mobileTab === "paper" ? "bg-rose-600 text-white" : "bg-slate-800/60 text-slate-400"
          }`}
        >
          📄 Đề thi {quizData.solutionUrl && reviewMode ? "/ Lời giải" : ""}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("sheet")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-black transition ${
            mobileTab === "sheet" ? "bg-rose-600 text-white" : "bg-slate-800/60 text-slate-400"
          }`}
        >
          📋 Bảng làm bài ({answeredCount}/{questions.length})
        </button>
      </div>

      {/* MAIN SPLIT VIEW */}
      <main className="flex flex-1 min-h-0 overflow-hidden p-2 sm:p-3.5 gap-2 sm:gap-3.5">
        {/* LEFT COLUMN: PDF VIEWER / QUESTION CARDS (~68% width) */}
        <section
          className={`flex-[7] min-w-0 flex flex-col rounded-2xl border border-slate-800/80 bg-[#0a1222] overflow-hidden shadow-2xl ${
            mobileTab === "sheet" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Top Viewer Subheader (Tabs for Review Mode & Solution File) */}
          {reviewMode && (
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#0d1629] px-4 py-2.5 gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-black uppercase text-slate-400 mr-1">Chế độ xem:</span>
                {quizData.paperUrl && (
                  <button
                    type="button"
                    onClick={() => setActiveViewerTab("paper")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                      activeViewerTab === "paper"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <FiFileText className="h-3.5 w-3.5" /> Đề bài (PDF)
                  </button>
                )}

                {quizData.solutionUrl ? (
                  <button
                    type="button"
                    onClick={() => setActiveViewerTab("solution")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                      activeViewerTab === "solution"
                        ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-400/30"
                        : "bg-slate-800/70 text-amber-300 hover:bg-slate-800"
                    }`}
                  >
                    <FiBookOpen className="h-3.5 w-3.5" /> Lời giải chi tiết (PDF)
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500 italic px-2">
                    (Giáo viên chưa gắn file lời giải PDF riêng)
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setActiveViewerTab("questions")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                    activeViewerTab === "questions"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <FiEye className="h-3.5 w-3.5" /> Chi tiết từng câu
                </button>
              </div>

              {currentViewUrl && activeViewerTab !== "questions" && (
                <a
                  href={currentViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:underline"
                >
                  <FiExternalLink className="h-3.5 w-3.5" /> Mở trong tab mới
                </a>
              )}
            </div>
          )}

          {/* Viewer Content Area */}
          <div className="flex-1 min-h-0 bg-slate-900 overflow-hidden relative">
            {activeViewerTab === "questions" ? (
              /* Inline Question-by-Question breakdown */
              <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#0a1222]">
                <div className="rounded-2xl border border-slate-800 bg-[#0e182b] p-4 text-xs">
                  <h3 className="font-black text-white text-sm mb-1">Chi tiết câu hỏi & Đáp án đối chiếu</h3>
                  <p className="text-slate-400">
                    Màu xanh lá là đáp án chính xác. Màu đỏ là lựa chọn chưa chính xác.
                  </p>
                </div>

                {questions.map((question, index) => {
                  const review = reviewByQuestion.get(String(question.id));
                  const selected = answers[question.id];
                  const selectedKeys = Array.isArray(selected) ? selected : [selected];
                  const isUserCorrect = review?.isCorrect;

                  return (
                    <article
                      key={question.id}
                      id={`quiz-question-card-${index}`}
                      className="rounded-2xl border border-slate-800/90 bg-[#0e1728] p-4 sm:p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                            review
                              ? isUserCorrect
                                ? "bg-emerald-600 text-white"
                                : "bg-rose-600 text-white"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className="text-sm sm:text-base font-bold text-white leading-relaxed">
                              {question.question_text}
                            </h4>
                            <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-mono font-bold text-slate-300">
                              {question.points} đ
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(question.options || []).map((option) => {
                              const active = selectedKeys.includes(option.key);
                              const correctAnswer = review?.correctAnswer;
                              const isCorrectOption =
                                Boolean(review) &&
                                (Array.isArray(correctAnswer)
                                  ? correctAnswer.includes(option.key)
                                  : correctAnswer === option.key);
                              const isWrongChosen = Boolean(review) && active && !isCorrectOption;

                              return (
                                <div
                                  key={option.key}
                                  className={`flex items-center gap-3 rounded-xl border p-3 text-xs font-semibold transition ${
                                    isCorrectOption
                                      ? "border-emerald-500 bg-emerald-950/30 text-emerald-200"
                                      : isWrongChosen
                                      ? "border-rose-500 bg-rose-950/30 text-rose-200"
                                      : active
                                      ? "border-blue-500 bg-blue-950/30 text-blue-200"
                                      : "border-slate-800 bg-[#09101d] text-slate-300"
                                  }`}
                                >
                                  <span
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                                      isCorrectOption
                                        ? "border-emerald-400 bg-emerald-600 text-white"
                                        : isWrongChosen
                                        ? "border-rose-400 bg-rose-600 text-white"
                                        : active
                                        ? "border-blue-400 bg-blue-600 text-white"
                                        : "border-slate-700 bg-slate-800 text-slate-400"
                                    }`}
                                  >
                                    {option.key}
                                  </span>
                                  <span className="flex-1">{option.text}</span>
                                  {isCorrectOption && (
                                    <span className="text-[11px] font-black text-emerald-400">✓ Đúng</span>
                                  )}
                                  {isWrongChosen && (
                                    <span className="text-[11px] font-black text-rose-400">✕ Bạn chọn</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {review?.explanation && (
                            <div className="mt-3.5 rounded-xl border border-sky-900/60 bg-sky-950/30 p-3.5 text-xs text-sky-200 leading-relaxed">
                              <b className="font-bold text-sky-300">💡 Giải thích chi tiết: </b>
                              {review.explanation}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : currentViewUrl ? (
              /* Embedded PDF Iframe */
              <iframe
                src={`${currentViewUrl}#toolbar=0&navpanes=0&view=FitH`}
                title={`Tài liệu ${quizData.title}`}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              /* Fallback if no PDF was provided in creation */
              <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#0a1222]">
                <div className="rounded-2xl border border-slate-800 bg-[#0e182b] p-4 text-xs">
                  <h3 className="font-black text-white text-sm mb-1">Nội dung câu hỏi đề thi</h3>
                  <p className="text-slate-400">
                    Đề thi được soạn trực tiếp trên hệ thống. Đọc nội dung dưới đây và chọn đáp án ở bảng bên phải.
                  </p>
                </div>

                {questions.map((question, index) => {
                  const selected = answers[question.id];
                  const selectedKeys = Array.isArray(selected) ? selected : [selected];

                  return (
                    <article
                      key={question.id}
                      id={`quiz-question-card-${index}`}
                      className="rounded-2xl border border-slate-800/90 bg-[#0e1728] p-4 sm:p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-xs font-black text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className="text-sm sm:text-base font-bold text-white leading-relaxed">
                              {question.question_text}
                            </h4>
                            <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-mono font-bold text-slate-300">
                              {question.points} đ
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(question.options || []).map((option) => {
                              const active = selectedKeys.includes(option.key);
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => handleSelect(question, option.key)}
                                  className={`flex items-center gap-3 rounded-xl border p-3 text-xs font-semibold text-left transition ${
                                    active
                                      ? "border-rose-500 bg-rose-950/40 text-white shadow-sm ring-1 ring-rose-500/40"
                                      : "border-slate-800 bg-[#09101d] text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
                                  }`}
                                >
                                  <span
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                                      active
                                        ? "border-rose-400 bg-rose-600 text-white"
                                        : "border-slate-700 bg-slate-800 text-slate-400"
                                    }`}
                                  >
                                    {option.key}
                                  </span>
                                  <span className="flex-1">{option.text}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: OMR BUBBLE ANSWER SHEET (~32% width, exact match screenshot) */}
        <section
          className={`flex-[3] min-w-[320px] max-w-[440px] flex flex-col rounded-2xl border border-slate-800/80 bg-[#0b1323] overflow-hidden shadow-2xl ${
            mobileTab === "paper" ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* OMR Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-slate-800/90 px-4 py-3.5 bg-[#091120]">
            <div>
              <h2 className="text-sm font-black tracking-wider text-white">BẢNG LÀM BÀI</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                {quizData.paperUrl ? "Chọn đáp án theo nội dung trong PDF" : "Chọn đáp án cho từng câu"}
              </p>
            </div>

            {/* Legend matching screenshot */}
            <div className="flex items-center gap-2 pt-1 text-[10px] font-bold text-slate-400">
              <span className="inline-flex items-center gap-1 text-slate-300">
                <i className="h-2 w-2 rounded-full bg-red-600 shadow-xs shadow-red-600/50" /> Đã làm
              </span>
              <span className="inline-flex items-center gap-1 text-slate-400">
                <i className="h-2 w-2 rounded-full border border-slate-500" /> Chưa làm
              </span>
            </div>
          </div>

          {/* OMR Table Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-thin">
            <div className="w-full">
              {/* Table Column Headers */}
              <div className="grid grid-cols-[64px_repeat(4,1fr)_34px] items-center gap-1 border-b border-slate-800/60 pb-2 text-center text-xs font-black text-slate-400">
                <span className="text-left pl-1 text-[11px] uppercase tracking-wider text-slate-500">Câu</span>
                {answerKeys.slice(0, 4).map((key) => (
                  <span key={key} className="text-slate-300 font-black">
                    {key}
                  </span>
                ))}
                <span className="flex justify-center text-slate-500" title="Đánh dấu câu hỏi cần xem lại">
                  <FiFlag className="h-3 w-3" />
                </span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-800/40">
                {questions.map((question, index) => {
                  const review = reviewByQuestion.get(String(question.id));
                  const selected = answers[question.id];
                  const selectedKeys = Array.isArray(selected) ? selected : [selected];
                  const isFlagged = flaggedQuestions.has(question.id);

                  return (
                    <div
                      key={question.id}
                      className="grid grid-cols-[64px_repeat(4,1fr)_34px] items-center gap-1 py-1.5 text-center transition hover:bg-slate-800/20"
                    >
                      {/* Row Label */}
                      <span className="text-left pl-1 text-xs font-black text-slate-300">
                        Câu {index + 1}
                      </span>

                      {/* Bubble Buttons A, B, C, D */}
                      {answerKeys.slice(0, 4).map((key) => {
                        const option = (question.options || []).find((item) => item.key === key);
                        const isChosen = Boolean(selectedKeys.includes(key));

                        // Review state colors
                        const correctAnswer = review?.correctAnswer;
                        const isCorrectOption =
                          Boolean(review) &&
                          (Array.isArray(correctAnswer)
                            ? correctAnswer.includes(key)
                            : correctAnswer === key);
                        const isWrongChoice = Boolean(review) && isChosen && !isCorrectOption;

                        let bubbleStyle =
                          "border-2 border-slate-600/90 text-slate-400 bg-transparent hover:border-rose-400 hover:text-white";

                        if (reviewMode && review) {
                          if (isCorrectOption) {
                            bubbleStyle = "border-2 border-emerald-500 bg-emerald-600 text-white font-black shadow-sm";
                          } else if (isWrongChoice) {
                            bubbleStyle = "border-2 border-rose-500 bg-rose-600 text-white font-black shadow-sm";
                          } else {
                            bubbleStyle = "border border-slate-700/60 text-slate-600 bg-transparent opacity-40";
                          }
                        } else if (isChosen) {
                          // Vibrant Red Circle matching screenshot exactly
                          bubbleStyle =
                            "border-2 border-red-600 bg-red-600 text-white font-black shadow-md shadow-red-600/40 scale-105";
                        }

                        return (
                          <div key={key} className="flex justify-center">
                            <button
                              type="button"
                              disabled={reviewMode || Boolean(result)}
                              onClick={() => handleSelect(question, key)}
                              aria-label={`Câu ${index + 1}, đáp án ${key}`}
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform active:scale-95 disabled:cursor-default ${bubbleStyle}`}
                            >
                              {/* In screenshot, bubbles are circular rings or filled */}
                              {isChosen || (reviewMode && (isCorrectOption || isWrongChoice)) ? (
                                <span>{key}</span>
                              ) : (
                                <span className="opacity-0 hover:opacity-100 text-[10px]">{key}</span>
                              )}
                            </button>
                          </div>
                        );
                      })}

                      {/* Flag / Bookmark Button */}
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => toggleFlag(question.id)}
                          aria-label={`Đánh dấu câu ${index + 1}`}
                          className={`rounded-lg p-1 transition ${
                            isFlagged
                              ? "text-amber-400 fill-amber-400 hover:text-amber-300"
                              : "text-slate-600 hover:text-slate-400"
                          }`}
                          title={isFlagged ? "Bỏ đánh dấu" : "Đánh dấu xem lại"}
                        >
                          <FiFlag className={`h-3.5 w-3.5 ${isFlagged ? "fill-amber-400" : ""}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* OMR Footer matching screenshot */}
          <div className="shrink-0 border-t border-slate-800/90 bg-[#091120] p-3 sm:p-4">
            <div className="flex items-center gap-2.5">
              {/* Fullscreen Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
              >
                {isFullscreen ? (
                  <>
                    <FiMinimize2 className="h-3.5 w-3.5 text-slate-400" />
                    <span>Thu nhỏ</span>
                  </>
                ) : (
                  <>
                    <FiMaximize2 className="h-3.5 w-3.5 text-slate-400" />
                    <span>Toàn màn hình</span>
                  </>
                )}
              </button>

              {/* Submit / Finish Button */}
              {!reviewMode && !result ? (
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={submitting}
                  className="flex-[1.2] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 py-2.5 px-4 text-xs font-black text-white shadow-lg shadow-rose-950/50 transition hover:from-red-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSend className="h-3.5 w-3.5" />
                  <span>{submitting ? "Đang nộp..." : "Nộp bài"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(assignmentListPath)}
                  className="flex-[1.2] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 px-4 text-xs font-black text-slate-200 hover:bg-slate-700 transition"
                >
                  <FiArrowLeft className="h-3.5 w-3.5" />
                  <span>Thoát ra LMS</span>
                </button>
              )}
            </div>

            {/* Save status badge */}
            {!reviewMode && !result && (
              <div className="mt-2 text-center text-[10px] text-slate-500">
                {saveStatus === "saving" && "Đang lưu nháp tự động..."}
                {saveStatus === "saved" && "✓ Tiến độ bài làm đã được lưu an toàn"}
                {saveStatus === "error" && "⚠ Lỗi lưu nháp - Đang kết nối lại"}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* CONFIRM SUBMIT MODAL */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-[#0e1728] p-6 shadow-2xl text-slate-100">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-2xl text-rose-400">
                📝
              </span>
              <h3 className="mt-3 text-lg font-black text-white">Xác nhận nộp bài?</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Sau khi nộp, hệ thống sẽ tự động chấm điểm và khóa bài làm. Bạn có thể xem lời giải chi tiết ngay sau đó.
              </p>
            </div>

            <div className="mt-5 space-y-2 rounded-2xl border border-slate-800 bg-[#09101d] p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Đã trả lời:</span>
                <b className="font-mono font-black text-emerald-400">
                  {answeredCount}/{questions.length} câu
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Chưa trả lời:</span>
                <b className={`font-mono font-black ${unansweredCount > 0 ? "text-rose-400" : "text-slate-400"}`}>
                  {unansweredCount} câu
                </b>
              </div>
              {flaggedQuestions.size > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Đã đánh dấu:</span>
                  <b className="font-mono font-black text-amber-400">{flaggedQuestions.size} câu</b>
                </div>
              )}
            </div>

            {unansweredCount > 0 && (
              <div className="mt-3.5 rounded-xl border border-amber-900/60 bg-amber-950/30 p-2.5 text-[11px] font-semibold text-amber-300">
                ⚠ Bạn vẫn còn {unansweredCount} câu chưa chọn đáp án. Các câu này sẽ nhận 0 điểm.
              </div>
            )}

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                onClick={doSubmit}
                disabled={submitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 py-2.5 text-xs font-black text-white shadow-md shadow-rose-950/50 hover:from-red-500 hover:to-rose-500 transition disabled:opacity-50"
              >
                {submitting ? "Đang nộp..." : "Xác nhận nộp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM EXIT MODAL */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-[#0e1728] p-6 shadow-2xl text-slate-100">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-2xl text-amber-400">
                🚪
              </span>
              <h3 className="mt-3 text-lg font-black text-white">Rời khỏi bài làm?</h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Các câu trả lời bạn đã chọn đã được lưu nháp trên hệ thống. Bạn có thể quay lại làm tiếp trong thời gian cho phép.
              </p>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Ở lại làm bài
              </button>
              <button
                type="button"
                onClick={() => navigate(assignmentListPath)}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-black text-white hover:bg-rose-500 transition"
              >
                Xác nhận thoát
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
