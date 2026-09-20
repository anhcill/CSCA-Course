/* eslint-disable react/prop-types */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchQuiz, submitQuiz } from "../../api/lmsClient";
import { LoadingState, ErrorState } from "../../../components/common/StateView";

/* ── SVG Timer Ring ───────────────────────────────────────────── */
function TimerRing({ seconds, total }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, seconds / total) : 0;
  const offset = c * (1 - pct);
  
  // Dynamic warning color
  const color = pct > 0.4 ? "#10b981" : pct > 0.15 ? "#f59e0b" : "#f43f5e";
  const isUrgent = pct <= 0.15;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className={`relative w-20 h-20 shrink-0 ${isUrgent ? "animate-pulse" : ""}`}>
      <svg viewBox="0 0 90 90" className="w-full h-full -rotate-90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="45"
          cy="45"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black font-mono tracking-tight" style={{ color }}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
        <span className="text-[8px] text-slate-500 uppercase font-semibold">Còn lại</span>
      </div>
    </div>
  );
}

/* ── SVG Score Ring ───────────────────────────────────────────── */
function ScoreRing({ score, total }) {
  const pct = total > 0 ? Math.min(1, score / total) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const passed = pct >= 0.6;
  const color = passed ? "#10b981" : "#f43f5e";

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black font-mono tracking-tight" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-slate-400 font-medium">/ {total} điểm</span>
      </div>
    </div>
  );
}

/* ── Top Progress Bar ─────────────────────────────────────────── */
function ProgressBar({ answered, total }) {
  const pct = total > 0 ? (answered / total) * 100 : 0;
  return (
    <div className="w-full h-1 bg-slate-800">
      <div
        className="h-full bg-gradient-to-r from-rose-500 to-emerald-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function QuizPlayerPage() {
  const { quizId, courseId } = useParams();
  const assignmentListPath = courseId
    ? `/lms/courses/${courseId}/workspace/assignments`
    : "/lms/assignments";

  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [totalTime, setTotalTime] = useState(15 * 60);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [reviewMode, setReviewMode] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [navFilter, setNavFilter] = useState("all"); // all | answered | flagged | unanswered
  const [showMobileNav, setShowMobileNav] = useState(false);

  // Autosave UI status
  const [saveStatus, setSaveStatus] = useState("saved"); // "saving" | "saved"

  const questions = useMemo(() => quizData?.questions || [], [quizData]);

  // Load quiz data
  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetchQuiz(quizId);
      if (!res.success || !res.data || res.data.questions?.length === 0) throw new Error("Đề thi chưa sẵn sàng hoặc không tồn tại");
      setQuizData(res.data);
      const limit = res.data.timeLimitSeconds || 15 * 60;
      setTotalTime(limit);
      const serverAnswers = res.data.attempt?.answers || {};
      let localAnswers = {};
      try {
        localAnswers = JSON.parse(localStorage.getItem(`csca_quiz_${quizId}`) || "{}");
      } catch {
        localAnswers = {};
      }
      setAnswers(Object.keys(serverAnswers).length > 0 ? serverAnswers : localAnswers);
      if (res.data.result) setResult(res.data.result);
      const startedAt = res.data.attempt?.startedAt ? new Date(res.data.attempt.startedAt).getTime() : Date.now();
      setTimeLeft(Math.max(0, limit - Math.floor((Date.now() - startedAt) / 1000)));
    } catch (err) {
      console.error("Could not load quiz:", err);
      setLoadError(err.message || "Không thể tải đề thi");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  // Autosave when answers change
  useEffect(() => {
    if (Object.keys(answers).length === 0) return;
    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(`csca_quiz_${quizId || "demo"}`, JSON.stringify(answers));
      } catch {
        // ignore storage errors
      }
      setSaveStatus("saved");
    }, 350);
    return () => clearTimeout(timeout);
  }, [answers, quizId]);

  // Submit handler
  const doSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await submitQuiz({ quizId, answers });
      if (!res.success || !res.data) throw new Error("Máy chủ chưa ghi nhận được bài thi");
      setResult(res.data);
      toast.success(`Nộp bài trắc nghiệm thành công! Điểm: ${res.data.score}/${res.data.maxScore}`);
    } catch (err) {
      console.error("Quiz submission failed:", err);
      toast.error(err.message || "Không thể nộp bài thi. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }, [quizId, answers]);

  // Auto submit on timer expiry
  const handleAutoSubmit = useCallback(() => {
    toast.error("Đã hết thời gian làm bài! Hệ thống đang tự động nộp bài thi...", {
      duration: 5000,
    });
    doSubmit();
  }, [doSubmit]);

  // Timer countdown
  useEffect(() => {
    if (result || loading) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [result, loading, handleAutoSubmit]);

  const handleSelect = useCallback(
    (qId, optKey) => {
      if (result) return;
      setAnswers((prev) => ({ ...prev, [qId]: optKey }));
    },
    [result]
  );

  const toggleFlag = useCallback((qId) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
  }, []);

  // Keyboard navigation & shortcuts (1,2,3,4 to choose A,B,C,D; Arrow keys)
  useEffect(() => {
    if (result && !reviewMode) return;
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((p) => Math.max(0, p - 1));
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((p) => Math.min(questions.length - 1, p + 1));
      }
      if (!result && ["1", "2", "3", "4"].includes(e.key)) {
        const q = questions[idx];
        if (q && q.options && q.options[parseInt(e.key, 10) - 1]) {
          handleSelect(q.id, q.options[parseInt(e.key, 10) - 1].key);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [questions, idx, result, reviewMode, handleSelect]);

  const currentQ = questions[idx];
  const currentReview = result?.review?.find((item) => String(item.questionId) === String(currentQ?.id));
  const answeredCount = Object.keys(answers).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  // Filtered question indices for navigator
  const filteredQIndices = useMemo(() => {
    return questions
      .map((_, i) => i)
      .filter((i) => {
        const qId = questions[i]?.id;
        if (navFilter === "answered") return !!answers[qId];
        if (navFilter === "flagged") return flagged.has(qId);
        if (navFilter === "unanswered") return !answers[qId];
        return true;
      });
  }, [questions, navFilter, flagged, answers]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState message="Đang khởi tạo đề thi trắc nghiệm và câu hỏi..." count={3} />
        </div>
      </div>
    );
  }

  // Error state
  if (loadError || !quizData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Không Thể Nạp Đề Thi"
            message={loadError || "Không tìm thấy nội dung đề thi tương ứng hoặc đường truyền bị gián đoạn."}
            onRetry={loadQuiz}
            secondaryAction={
              <Link
                to={assignmentListPath}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                ← Quay Lại Danh Sách Bài Tập
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW MODE 1: RESULTS SUMMARY SCREEN
     ══════════════════════════════════════════════════════════════ */
  if (result && !reviewMode) {
    const score = result.score || 0;
    const maxScore = result.maxScore || 10;
    const pct = Math.round((score / maxScore) * 100);
    const passed = result.passed === true;
    const timeSpent = Math.max(0, totalTime - timeLeft);
    const tsMins = Math.floor(timeSpent / 60);
    const tsSecs = timeSpent % 60;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4">
        <div className="container mx-auto max-w-2xl space-y-8">
          <div
            className={`bg-gradient-to-b ${
              passed ? "from-emerald-950/40 border-emerald-500/40" : "from-rose-950/40 border-rose-500/40"
            } to-slate-900 border rounded-3xl p-8 text-center space-y-6 shadow-2xl backdrop-blur-sm`}
          >
            <div className="text-5xl">{passed ? "🎉" : "📖"}</div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Kết Quả Đánh Giá Năng Lực
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-white">{quizData.title}</h2>
            </div>

            <ScoreRing score={score} total={maxScore} />

            <div className="space-y-2">
              <p className={`text-lg font-black ${passed ? "text-emerald-400" : "text-rose-400"}`}>
                {passed ? "CHÚC MỪNG: BẠN ĐÃ ĐẠT YÊU CẦU!" : "CHƯA ĐẠT: CẦN ÔN TẬP THÊM KIẾN THỨC!"}
              </p>
              <p className="text-xs md:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                {result.message ||
                  (passed
                    ? "Bạn nắm vững kiến trúc ngữ pháp và từ vựng trọng tâm bài thi."
                    : "Hãy xem lại giải thích đáp án chi tiết và thử làm lại lần nữa nhé!")}
              </p>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <p className="text-xl font-black text-amber-400 font-mono">{pct}%</p>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Độ chính xác</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <p className="text-xl font-black text-sky-400 font-mono">
                  {tsMins}:{String(tsSecs).padStart(2, "0")}
                </p>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Thời gian làm</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <p className="text-xl font-black text-emerald-400 font-mono">
                  {answeredCount}/{questions.length}
                </p>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Số câu đã làm</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setReviewMode(true)}
                className="flex-1 px-5 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/25"
              >
                🔍 Xem Lại Đáp Án & Giải Thích
              </button>

              <button
                type="button"
                disabled
                className="flex-1 px-5 py-3 bg-slate-800 text-slate-500 font-bold rounded-xl text-xs border border-slate-700 cursor-not-allowed"
                title="Mỗi đề chỉ được nộp một lượt"
              >
                🔒 Lượt Làm Bài Đã Khóa
              </button>

              <Link
                to={assignmentListPath}
                className="flex-1 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition border border-slate-700 text-center"
              >
                ← Danh Sách Bài Tập
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW MODE 2: ACTIVE QUIZ PLAYER OR REVIEW MODE
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-12">
      {/* Top Header & Sticky Progress */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-md">
        <ProgressBar answered={answeredCount} total={questions.length} />

        <div className="container mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Link
                to={assignmentListPath}
                className="text-xs text-slate-400 hover:text-white transition"
              >
                ← Bài Tập
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                {reviewMode ? "CHẾ ĐỘ XEM LẠI ĐÁP ÁN" : "BÀI THI TRẮC NGHIỆM"}
              </span>
            </div>
            <h1 className="text-sm md:text-base font-black text-white truncate max-w-sm md:max-w-md">
              {quizData.title}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Autosave UI Indicator */}
            {!reviewMode && !result && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px]">
                {saveStatus === "saving" ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span className="text-amber-400 font-medium">Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <span className="text-emerald-400">✓</span>
                    <span className="text-slate-400 font-mono">💾 Tự động lưu</span>
                  </>
                )}
              </div>
            )}

            {/* Answered Counter */}
            <div className="hidden md:block text-right">
              <p className="text-xs font-bold text-white">
                {answeredCount}/{questions.length}
              </p>
              <p className="text-[10px] text-slate-400 uppercase">Đã trả lời</p>
            </div>

            {/* Timer Ring */}
            {!result && !reviewMode && <TimerRing seconds={timeLeft} total={totalTime} />}

            {/* Exit Review Mode Button */}
            {reviewMode && (
              <button
                type="button"
                onClick={() => setReviewMode(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white rounded-xl transition border border-slate-700"
              >
                Về Kết Quả
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Review Mode Banner */}
      {reviewMode && (
        <div className="bg-sky-950/40 border-b border-sky-800/40 px-4 py-2 text-center text-xs text-sky-300">
          💡 Bạn đang ở chế độ xem lại đáp án chi tiết. Mỗi câu hỏi hiển thị đáp án đúng cùng giải thích ngữ pháp HSK.
        </div>
      )}

      {/* Main Content Area */}
      {questions.length > 0 && currentQ && (
        <div className="container mx-auto max-w-5xl px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left/Center: Current Question Card */}
            <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              {/* Question Header */}
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-4 border-b border-slate-800">
                <span className="font-bold text-slate-200">
                  Câu hỏi {idx + 1} / {questions.length}
                </span>

                <div className="flex items-center gap-3">
                  <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                    Điểm: <strong className="text-rose-400">{currentQ.points || 2}</strong>
                  </span>

                  {!result && !reviewMode && (
                    <button
                      type="button"
                      onClick={() => toggleFlag(currentQ.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                        flagged.has(currentQ.id)
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      <span>🚩</span>
                      <span>{flagged.has(currentQ.id) ? "Đã đánh dấu" : "Đánh dấu xem lại"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <div className="space-y-2">
                <h3 className="text-lg md:text-xl font-bold text-white leading-relaxed font-sans">
                  {currentQ.question_text}
                </h3>
              </div>

              {/* Options List */}
              <div className="space-y-3 pt-2">
                {(currentQ.options || []).map((opt) => {
                   const isSelected = answers[currentQ.id] === opt.key;
                   const correctAnswer = currentReview?.correctAnswer;
                   const isCorrect = Boolean(currentReview) && (Array.isArray(correctAnswer) ? correctAnswer.includes(opt.key) : opt.key === correctAnswer);
                   const isWrong = Boolean(currentReview) && isSelected && !isCorrect;

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleSelect(currentQ.id, opt.key)}
                      disabled={!!result || reviewMode}
                      className={`w-full p-4 rounded-2xl text-left border transition-all duration-150 flex items-center justify-between text-sm ${
                        isCorrect
                          ? "bg-emerald-500/15 border-emerald-500 text-emerald-200 font-bold ring-1 ring-emerald-500"
                          : isWrong
                          ? "bg-rose-500/15 border-rose-500 text-rose-200 ring-1 ring-rose-500"
                          : isSelected
                          ? "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/30 font-semibold"
                          : "bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition ${
                            isCorrect
                              ? "bg-emerald-500 text-white"
                              : isWrong
                              ? "bg-rose-500 text-white"
                              : isSelected
                              ? "bg-white text-rose-600"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {opt.key}
                        </span>
                        <span className="font-sans">{opt.text}</span>
                      </div>

                      <div className="text-xs shrink-0 font-medium">
                        {isCorrect && <span className="text-emerald-400">✓ Đáp án đúng</span>}
                        {isWrong && <span className="text-rose-400">✕ Bạn đã chọn sai</span>}
                        {!result && !reviewMode && isSelected && (
                          <span className="text-white/80 font-mono">Đã chọn</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Grammar & Vocabulary Explanation (in Review / Result Mode) */}
              {result && currentReview?.explanation && (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 text-xs space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider">
                    <span>💡 Phân Tích Ngữ Pháp & Đáp Án</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed font-light">{currentReview.explanation}</p>
                </div>
              )}

              {/* Card Bottom Navigation */}
              <div className="flex justify-between items-center pt-6 border-t border-slate-800">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => setIdx((p) => Math.max(0, p - 1))}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold disabled:opacity-30 transition"
                >
                  ← Câu Trước
                </button>

                <button
                  type="button"
                  onClick={() => setShowMobileNav(!showMobileNav)}
                  className="lg:hidden px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-mono"
                >
                  Câu {idx + 1}/{questions.length} ▤
                </button>

                {idx < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setIdx((p) => Math.min(questions.length - 1, p + 1))}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/30"
                  >
                    Câu Tiếp →
                  </button>
                ) : !result && !reviewMode ? (
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    disabled={submitting}
                    className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs transition shadow-lg shadow-emerald-600/30"
                  >
                    {submitting ? "Đang Nộp..." : "Xác Nhận Nộp Bài"}
                  </button>
                ) : reviewMode ? (
                  <button
                    type="button"
                    onClick={() => setReviewMode(false)}
                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition"
                  >
                    Về Trang Điểm Số
                  </button>
                ) : null}
              </div>
            </div>

            {/* Right: Question Navigator Sidebar */}
            <div
              className={`${
                showMobileNav
                  ? "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end lg:relative lg:inset-auto lg:bg-transparent"
                  : "hidden lg:block"
              }`}
            >
              <div
                className={`${
                  showMobileNav
                    ? "w-full bg-slate-900 rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto"
                    : "bg-slate-900 border border-slate-800 rounded-3xl p-5"
                } space-y-4 shadow-xl`}
              >
                {showMobileNav && (
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white uppercase">Danh Sách Câu Hỏi</span>
                    <button
                      type="button"
                      onClick={() => setShowMobileNav(false)}
                      className="text-xs text-slate-400 hover:text-white font-bold px-2 py-1"
                    >
                      Đóng ✕
                    </button>
                  </div>
                )}

                <div className="hidden lg:block">
                  <h4 className="font-bold text-xs text-slate-300 uppercase tracking-wider">
                    Danh Sách Câu Hỏi
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Nhấp vào số câu để chuyển nhanh</p>
                </div>

                {/* Filter Tabs */}
                <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px]">
                  {[
                    { id: "all", label: "Tất cả" },
                    { id: "answered", label: "Đã làm" },
                    { id: "flagged", label: "Đánh dấu" },
                    { id: "unanswered", label: "Chưa" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setNavFilter(f.id)}
                      className={`py-1.5 rounded-lg font-bold transition text-center ${
                        navFilter === f.id
                          ? "bg-slate-800 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Question Buttons Grid */}
                <div className="grid grid-cols-5 gap-2 pt-1">
                  {filteredQIndices.map((qi) => {
                    const q = questions[qi];
                    const isAnswered = !!answers[q?.id];
                    const isCurrent = idx === qi;
                    const isFlagged = flagged.has(q?.id);
                    const questionReview = result?.review?.find((item) => String(item.questionId) === String(q?.id));
                    const isCorrect = Boolean(questionReview?.isCorrect);
                    const isWrong = Boolean(questionReview && isAnswered && !questionReview.isCorrect);

                    return (
                      <button
                        key={q?.id || qi}
                        type="button"
                        onClick={() => {
                          setIdx(qi);
                          setShowMobileNav(false);
                        }}
                        className={`h-10 rounded-xl font-mono text-xs font-bold border transition relative flex items-center justify-center ${
                          isCurrent
                            ? "ring-2 ring-rose-500 bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/30"
                            : isCorrect
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : isWrong
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : isFlagged
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : isAnswered
                            ? "bg-slate-800 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {qi + 1}
                        {isFlagged && !isCurrent && (
                          <span className="absolute -top-1 -right-1 text-[10px]">🚩</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Color Legend */}
                <div className="text-[10px] text-slate-400 space-y-1.5 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Đã trả lời ({answeredCount})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span>Cần xem lại ({flagged.size})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span>Chưa trả lời ({unansweredCount})</span>
                  </div>
                </div>

                {/* Submit Action in Navigator */}
                {!result && !reviewMode && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowConfirm(true)}
                      disabled={submitting}
                      className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-lg shadow-rose-600/30"
                    >
                      Nộp Bài Thi ({answeredCount}/{questions.length})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 mx-auto flex items-center justify-center text-xl">
                ⏱️
              </div>
              <h3 className="text-lg font-bold text-white">Xác Nhận Nộp Bài Trắc Nghiệm?</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-light">
                Hệ thống sẽ ghi nhận điểm số của bạn ngay lập tức và tính vào kết quả môn học.
              </p>
            </div>

            {/* Answered Metrics */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Đã trả lời:</span>
                <span className="text-emerald-400 font-bold">
                  {answeredCount} / {questions.length} câu
                </span>
              </div>
              <div className="flex justify-between">
                <span>Chưa trả lời:</span>
                <span className="text-rose-400 font-bold">{unansweredCount} câu</span>
              </div>
              <div className="flex justify-between">
                <span>Đánh dấu xem lại:</span>
                <span className="text-amber-400 font-bold">{flagged.size} câu</span>
              </div>
            </div>

            {/* Unanswered questions alert */}
            {unansweredCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-300 flex items-start gap-2">
                <span>⚠️</span>
                <span>
                  Bạn còn <strong>{unansweredCount} câu</strong> chưa điền đáp án. Các câu chưa trả lời sẽ nhận 0 điểm!
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Làm Tiếp
              </button>
              <button
                type="button"
                onClick={doSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {submitting ? "Đang Gửi..." : "Nộp Bài Ngay"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 z-20 shadow-2xl">
        <div className="flex items-center justify-between max-w-lg mx-auto gap-2">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => setIdx((p) => Math.max(0, p - 1))}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold disabled:opacity-30"
          >
            ← Trước
          </button>
          <button
            type="button"
            onClick={() => setShowMobileNav(true)}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-mono"
          >
            {idx + 1}/{questions.length} (Lưới)
          </button>
          {idx < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setIdx((p) => p + 1)}
              className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold"
            >
              Tiếp →
            </button>
          ) : !result && !reviewMode ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
            >
              Nộp Bài
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
