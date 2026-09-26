/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchQuiz, submitQuiz } from "../../api/lmsClient";
import { ErrorState, LoadingState } from "../../../components/common/StateView";

function TimerRing({ seconds, total }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, seconds / total) : 0;
  const color = progress > 0.4 ? "#2563eb" : progress > 0.15 ? "#d97706" : "#e11d48";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    <div className={`relative h-16 w-16 shrink-0 ${progress <= 0.15 ? "animate-pulse" : ""}`}>
      <svg viewBox="0 0 90 90" className="h-full w-full -rotate-90">
        <circle cx="45" cy="45" r={radius} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="6" />
        <circle cx="45" cy="45" r={radius} fill="none" stroke={color} strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-xs font-black" style={{ color }}>{String(minutes).padStart(2, "0")}:{String(remainingSeconds).padStart(2, "0")}</span><span className="text-[8px] font-bold uppercase text-slate-500">Còn lại</span></div>
    </div>
  );
}

function ScoreRing({ score, total }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const color = progress >= 0.6 ? "#059669" : "#e11d48";
  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90"><circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="8" /><circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="font-mono text-3xl font-black" style={{ color }}>{score}</strong><span className="text-xs text-slate-500">/ {total} điểm</span></div>
    </div>
  );
}

function ProgressBar({ answered, total }) {
  const progress = total > 0 ? (answered / total) * 100 : 0;
  return <div className="h-1 w-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-gradient-to-r from-violet-600 via-blue-600 to-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} /></div>;
}

function AnswerSheet({ questions, answerKeys, answers, reviewByQuestion, disabled, onAnswer, onScrollToQuestion, onSubmit, submitting, inReview }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#101b2d] dark:shadow-none">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800">
        <div><h2 className="font-black text-blue-700 dark:text-blue-300">BẢNG LÀM BÀI</h2><p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Chọn đáp án theo nội dung đề ở bên trái</p></div>
        <div className="space-y-1 pt-0.5 text-right text-[10px] font-bold text-slate-500 dark:text-slate-300"><span className="mr-2 inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-600" />Đã làm</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full border border-slate-400" />Chưa làm</span></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <div className="grid min-w-[335px] items-center gap-y-1 text-center text-xs font-black text-slate-700 dark:text-slate-200" style={{ gridTemplateColumns: `64px repeat(${answerKeys.length}, minmax(38px, 1fr))` }}>
          <span />
          {answerKeys.map((key) => <span key={key}>{key}</span>)}
          {questions.map((question, index) => {
            const review = reviewByQuestion.get(String(question.id));
            const selected = answers[question.id];
            const selectedKeys = Array.isArray(selected) ? selected : [selected];
            return (
              <div className="contents" key={question.id}>
                <button type="button" onClick={() => onScrollToQuestion(index)} className="rounded-lg py-2 text-left font-black text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Câu {index + 1}</button>
                {answerKeys.map((key) => {
                  const option = (question.options || []).find((item) => item.key === key);
                  const active = Boolean(option && selectedKeys.includes(key));
                  const correctAnswer = review?.correctAnswer;
                  const isCorrect = Boolean(review) && (Array.isArray(correctAnswer) ? correctAnswer.includes(key) : correctAnswer === key);
                  const isWrong = Boolean(review) && active && !isCorrect;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!option || disabled}
                      onClick={() => option && onAnswer(question, key)}
                      aria-label={`Câu ${index + 1}, đáp án ${key}`}
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-35 ${
                        isCorrect ? "border-emerald-600 bg-emerald-600 text-white" : isWrong ? "border-rose-600 bg-rose-600 text-white" : active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white hover:border-blue-500 dark:border-slate-600 dark:bg-slate-900"
                      }`}
                    >{(active || isCorrect) && <span className="h-2 w-2 rounded-full bg-white" />}</button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {!disabled && !inReview && <div className="shrink-0 border-t border-slate-100 p-4 dark:border-slate-800"><button type="button" onClick={onSubmit} disabled={submitting} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55">{submitting ? "Đang nộp bài..." : "Nộp bài"}</button></div>}
    </section>
  );
}

export default function QuizPlayerPage() {
  const { quizId, courseId, classId } = useParams();
  const assignmentListPath = courseId && classId ? `/lms/courses/${courseId}/classes/${classId}/assignments` : "/lms/assignments";
  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [totalTime, setTotalTime] = useState(15 * 60);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [reviewMode, setReviewMode] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved");

  const questions = useMemo(() => quizData?.questions || [], [quizData]);
  const answerKeys = useMemo(() => {
    const keys = [...new Set(questions.flatMap((question) => (question.options || []).map((option) => option.key)))].sort();
    return keys.length ? keys : ["A", "B", "C", "D"];
  }, [questions]);
  const reviewByQuestion = useMemo(() => new Map((result?.review || []).map((item) => [String(item.questionId), item])), [result]);
  const answeredCount = useMemo(() => questions.filter((question) => {
    const value = answers[question.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length, [answers, questions]);
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetchQuiz(quizId);
      if (!response.success || !response.data || response.data.questions?.length === 0) throw new Error("Đề thi chưa sẵn sàng hoặc không tồn tại");
      const data = response.data;
      const isSubmitted = Boolean(data.result);
      const serverAnswers = data.attempt?.answers || {};
      let savedAnswers = {};
      if (!isSubmitted && Object.keys(serverAnswers).length === 0) {
        try { savedAnswers = JSON.parse(localStorage.getItem(`csca_quiz_${quizId}`) || "{}"); } catch { savedAnswers = {}; }
      }
      setQuizData(data);
      setResult(data.result || null);
      setAnswers(Object.keys(serverAnswers).length ? serverAnswers : savedAnswers);
      const limit = Number(data.timeLimitSeconds) || 15 * 60;
      setTotalTime(limit);
      const startedAt = data.attempt?.startedAt ? new Date(data.attempt.startedAt).getTime() : Date.now();
      setTimeLeft(Math.max(0, limit - Math.floor((Date.now() - startedAt) / 1000)));
    } catch (error) {
      console.error("Could not load quiz:", error);
      setLoadError(error?.message || "Không thể tải đề thi");
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  useEffect(() => {
    if (result || Object.keys(answers).length === 0) return undefined;
    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      try { localStorage.setItem(`csca_quiz_${quizId || "quiz"}`, JSON.stringify(answers)); } catch { /* Storage is only a convenience, never the source of truth. */ }
      setSaveStatus("saved");
    }, 300);
    return () => clearTimeout(timeout);
  }, [answers, quizId, result]);

  const handleSelect = useCallback((question, optionKey) => {
    if (result || reviewMode) return;
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

  const doSubmit = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    try {
      const response = await submitQuiz({ quizId, answers });
      if (!response.success || !response.data) throw new Error("Máy chủ chưa ghi nhận được bài thi");
      setResult(response.data);
      try { localStorage.removeItem(`csca_quiz_${quizId}`); } catch { /* no-op */ }
      toast.success(`Nộp bài thành công: ${response.data.score}/${response.data.maxScore} điểm.`);
    } catch (error) {
      console.error("Quiz submission failed:", error);
      toast.error(error?.message || "Không thể nộp bài. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }, [answers, quizId, result, submitting]);

  useEffect(() => {
    if (result || loading || reviewMode) return undefined;
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
  }, [doSubmit, loading, result, reviewMode]);

  const scrollToQuestion = (index) => {
    document.getElementById(`quiz-question-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowMobileSheet(false);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950"><div className="w-full max-w-md"><LoadingState message="Đang mở đề trắc nghiệm..." count={3} /></div></div>;
  if (loadError || !quizData) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950"><div className="w-full max-w-md"><ErrorState title="Không thể mở đề thi" message={loadError || "Không tìm thấy nội dung đề thi."} onRetry={loadQuiz} secondaryAction={<Link to={assignmentListPath} className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">← Bài tập & Quiz</Link>} /></div></div>;

  if (result && !reviewMode) {
    const score = Number(result.score || 0);
    const maxScore = Number(result.maxScore || 0);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
          <div className="text-5xl">{result.passed ? "🎉" : "📚"}</div>
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">Kết quả quiz</p><h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{quizData.title}</h1>
          <div className="my-7"><ScoreRing score={score} total={maxScore} /></div>
          <h2 className={`text-lg font-black ${result.passed ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>{result.passed ? "Bạn đã đạt yêu cầu" : "Bạn chưa đạt điểm yêu cầu"}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-300">{result.message || "Kết quả đã được chấm và khóa trên hệ thống."}</p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center"><div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"><b className="font-mono text-xl text-violet-600 dark:text-violet-300">{percentage}%</b><span className="mt-1 block text-[10px] font-bold uppercase text-slate-500">Chính xác</span></div><div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"><b className="font-mono text-xl text-blue-600 dark:text-blue-300">{answeredCount}/{questions.length}</b><span className="mt-1 block text-[10px] font-bold uppercase text-slate-500">Đã làm</span></div><div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950"><b className="font-mono text-xl text-emerald-600 dark:text-emerald-300">{score}/{maxScore}</b><span className="mt-1 block text-[10px] font-bold uppercase text-slate-500">Điểm</span></div></div>
          <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row dark:border-slate-800"><button type="button" onClick={() => setReviewMode(true)} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white transition hover:bg-blue-700">Xem đáp án & giải thích</button><Link to={assignmentListPath} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Về Bài tập & Quiz</Link></div>
        </div>
      </div>
    );
  }

  const answerSheet = <AnswerSheet questions={questions} answerKeys={answerKeys} answers={answers} reviewByQuestion={reviewByQuestion} disabled={Boolean(result) || reviewMode} onAnswer={handleSelect} onScrollToQuestion={scrollToQuestion} onSubmit={() => setShowConfirm(true)} submitting={submitting} inReview={reviewMode} />;

  return (
    <div className="min-h-screen bg-[#f4f7fc] pb-24 text-slate-950 dark:bg-[#081120] dark:text-slate-50 lg:pb-6">
      <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-[#101b2d]/95 dark:shadow-none"><ProgressBar answered={answeredCount} total={questions.length} /><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-6"><div className="min-w-0"><div className="flex items-center gap-2 text-xs"><Link to={assignmentListPath} className="font-bold text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300">← Bài tập & Quiz</Link><span className="text-slate-300">/</span><span className="font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">{reviewMode ? "Xem lại đáp án" : "Quiz"}</span></div><h1 className="mt-1 truncate text-sm font-black sm:text-base">{quizData.title}</h1>{quizData.description && <p className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">{quizData.description}</p>}</div><div className="flex shrink-0 items-center gap-3">{!reviewMode && !result && <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500 sm:block dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{saveStatus === "saving" ? "Đang lưu..." : "✓ Tự động lưu trên máy này"}</div>}<div className="hidden text-right sm:block"><b className="text-sm">{answeredCount}/{questions.length}</b><span className="block text-[10px] font-bold uppercase text-slate-500">Đã trả lời</span></div>{!reviewMode && !result && <TimerRing seconds={timeLeft} total={totalTime} />}{reviewMode && <button type="button" onClick={() => setReviewMode(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Kết quả</button>}</div></div></header>
      {reviewMode && <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-xs font-semibold text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">Bạn đang xem lại bài đã nộp. Đáp án đúng và giải thích được hiển thị cho từng câu.</div>}
      {quizData.paperUrl && <div className="border-b border-slate-200 bg-white px-4 py-2 text-center dark:border-slate-800 dark:bg-slate-900 lg:hidden"><a href={quizData.paperUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-700 underline underline-offset-4 dark:text-blue-300">Mở đề PDF trong tab mới</a></div>}
      <main className="mx-auto grid max-w-[1500px] gap-4 p-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(390px,0.85fr)] lg:p-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#101b2d] dark:shadow-none"><div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><p className="text-[11px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Đề kiểm tra</p><h2 className="mt-1 text-lg font-black">{quizData.title}</h2><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400"><span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{questions.length} câu</span><span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{quizData.durationMinutes} phút</span><span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">Đạt từ {quizData.passingScore}%</span></div></div><div className="space-y-4 p-4 sm:p-5">{questions.map((question, index) => { const review = reviewByQuestion.get(String(question.id)); const selected = answers[question.id]; const selectedKeys = Array.isArray(selected) ? selected : [selected]; return <article id={`quiz-question-${index}`} key={question.id} className="scroll-mt-28 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black leading-6 sm:text-base">{question.question_text}</h3><span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{question.points} điểm</span></div><div className="mt-3 grid gap-2">{(question.options || []).map((option) => { const active = selectedKeys.includes(option.key); const correctAnswer = review?.correctAnswer; const isCorrect = Boolean(review) && (Array.isArray(correctAnswer) ? correctAnswer.includes(option.key) : correctAnswer === option.key); const isWrong = Boolean(review) && active && !isCorrect; return <button key={option.key} type="button" disabled={Boolean(result) || reviewMode} onClick={() => handleSelect(question, option.key)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition disabled:cursor-default ${isCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" : isWrong ? "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100" : active ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:border-blue-500"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black ${isCorrect ? "border-emerald-600 bg-emerald-600 text-white" : isWrong ? "border-rose-600 bg-rose-600 text-white" : active ? "border-white bg-white text-blue-700" : "border-slate-300 text-slate-500 dark:border-slate-600"}`}>{option.key}</span><span className="flex-1 font-semibold">{option.text}</span>{isCorrect && <span className="text-xs font-black">✓ Đúng</span>}{isWrong && <span className="text-xs font-black">✕ Bạn chọn</span>}</button>; })}</div>{review?.explanation && <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100"><b>Giải thích: </b>{review.explanation}</div>}</div></div></article>; })}</div></section>
        {quizData.paperUrl && <section className="z-10 hidden min-h-[650px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 lg:col-start-1 lg:row-start-1 lg:block"><iframe src={`${quizData.paperUrl}#toolbar=0&navpanes=0&view=FitH`} title={`Đề PDF ${quizData.title}`} className="h-[calc(100vh-7rem)] min-h-[650px] w-full bg-white" /></section>}
        <div className="hidden min-h-0 lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">{answerSheet}</div>
      </main>
      {!reviewMode && !result && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"><div className="mx-auto flex max-w-lg gap-2"><button type="button" onClick={() => setShowMobileSheet(true)} className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">Bảng đáp án ({answeredCount}/{questions.length})</button><button type="button" onClick={() => setShowConfirm(true)} className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-black text-white">Nộp bài</button></div></div>}
      {showMobileSheet && <div className="fixed inset-0 z-40 flex items-end bg-slate-950/60 p-3 backdrop-blur-sm lg:hidden"><div className="max-h-[78vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><b className="text-sm">Bảng làm bài</b><button type="button" onClick={() => setShowMobileSheet(false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold dark:bg-slate-800">Đóng</button></div><div className="max-h-[68vh] overflow-auto">{answerSheet}</div></div></div>}
      {showConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"><div className="text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-xl">📝</span><h2 className="mt-3 text-lg font-black">Xác nhận nộp bài?</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Kết quả sẽ được chấm trên máy chủ và không thể sửa sau khi nộp.</p></div><div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs dark:bg-slate-950"><div className="flex justify-between"><span>Đã trả lời</span><b className="text-emerald-600 dark:text-emerald-300">{answeredCount}/{questions.length}</b></div><div className="mt-2 flex justify-between"><span>Chưa trả lời</span><b className="text-rose-600 dark:text-rose-300">{unansweredCount}</b></div></div>{unansweredCount > 0 && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">Bạn vẫn còn {unansweredCount} câu chưa chọn đáp án. Các câu này sẽ nhận 0 điểm.</p>}<div className="mt-5 flex gap-3"><button type="button" onClick={() => setShowConfirm(false)} disabled={submitting} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Làm tiếp</button><button type="button" onClick={doSubmit} disabled={submitting} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{submitting ? "Đang nộp..." : "Nộp bài"}</button></div></div></div>}
    </div>
  );
}
