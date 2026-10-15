/* eslint-disable react/prop-types */
import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  FiX,
  FiCheckCircle,
  FiFileText,
  FiClock,
  FiMaximize2,
  FiRotateCw,
  FiExternalLink,
  FiInfo,
} from "react-icons/fi";
import { fetchTeacherQuizAttempt, gradeTeacherQuizEssay } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { attachmentsForQuestion, normalizeEssayResponse } from "../../assignments/utils/quizQuestionPresentation";

export default function TeacherQuizGradingModal({
  isOpen,
  onClose,
  quizId,
  student,
  essayMaxScore = 3,
  onGraded,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attemptDetail, setAttemptDetail] = useState(null);
  const [activeTab, setActiveTab] = useState("essay"); // "essay" | "mc"
  const [essayScore, setEssayScore] = useState(0);
  const [essayFeedback, setEssayFeedback] = useState("");
  const [lightboxImg, setLightboxImg] = useState(null);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!isOpen || !quizId || !student?.attemptId) return;

    let isMounted = true;
    setLoading(true);
    fetchTeacherQuizAttempt(quizId, student.attemptId)
      .then((res) => {
        if (!isMounted) return;
        if (res?.success && res?.data) {
          setAttemptDetail(res.data);
          const currentGrade = res.data.attempt?.essayGrade;
          if (currentGrade && typeof currentGrade.score === "number") {
            setEssayScore(currentGrade.score);
            setEssayFeedback(currentGrade.feedback || "");
          } else {
            setEssayScore(0);
            setEssayFeedback("");
          }
        } else {
          toast.error("Không thể tải chi tiết bài nộp của học viên");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading attempt detail:", err);
        toast.error("Lỗi khi tải bài nộp học viên");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, quizId, student?.attemptId]);

  const attempt = attemptDetail?.attempt;
  const essay = attempt?.essay;
  const essayQuestions = useMemo(() => (attemptDetail?.computed?.review || [])
    .map((item, index) => ({
      id: item.questionId,
      displayNumber: index + 1,
      prompt: item.questionText || item.prompt || "",
      questionType: item.questionType,
    }))
    .filter((item) => item.questionType === "essay"), [attemptDetail]);
  const normalizedEssay = useMemo(() => normalizeEssayResponse(essay, essayQuestions), [essay, essayQuestions]);
  const attachments = normalizedEssay.attachments;
  const essayGroups = useMemo(() => essayQuestions.map((question) => ({
    ...question,
    attachments: attachmentsForQuestion(attachments, question.id),
    notes: normalizedEssay.notesByQuestion[String(question.id)] || "",
  })), [attachments, essayQuestions, normalizedEssay.notesByQuestion]);
  const unassignedAttachments = useMemo(
    () => attachments.filter((attachment) => !attachment?.questionId),
    [attachments],
  );

  const mcReview = useMemo(() => attemptDetail?.computed?.review || [], [attemptDetail]);
  const mcScore = useMemo(() => {
    const raw = mcReview.reduce((sum, item) => sum + (item.earnedPoints || 0), 0);
    return Math.round(raw * 100) / 100;
  }, [mcReview]);

  const totalPossibleScore = attemptDetail?.computed?.maxScore || student?.maxScore || 10;
  const projectedTotalScore = Math.min(totalPossibleScore, Math.round((mcScore + Number(essayScore || 0)) * 100) / 100);

  const handleSave = async (e) => {
    e.preventDefault();
    const numericScore = Number(essayScore);
    if (isNaN(numericScore) || numericScore < 0) {
      toast.error("Điểm tự luận phải là số lớn hơn hoặc bằng 0!");
      return;
    }
    if (numericScore > Number(essayMaxScore || 10)) {
      toast.error(`Điểm tự luận không được vượt quá ${essayMaxScore} điểm!`);
      return;
    }

    setSaving(true);
    try {
      const res = await gradeTeacherQuizEssay(quizId, student.attemptId, {
        essayScore: numericScore,
        essayFeedback: essayFeedback.trim(),
      });
      if (res?.success) {
        toast.success(`Đã lưu điểm tự luận (${numericScore}đ) cho học viên ${student.fullName || student.username}! 🌟`);
        if (onGraded) {
          onGraded({
            ...student,
            score: res.data.score,
            essayGrade: res.data.essayGrade,
          });
        }
        onClose();
      } else {
        throw new Error(res?.message || "Không thể lưu điểm");
      }
    } catch (err) {
      toast.error(err?.message || "Lỗi khi lưu điểm tự luận");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-5xl h-[90vh] max-h-[850px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* HEADER */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 bg-slate-50/70 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
              <FiFileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Chấm bài thi & Bài làm tự luận
                </h2>
                <span className="rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-bold px-2 py-0.5 text-[10px]">
                  Lượt {student?.attemptNumber || 1}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{student?.fullName}</span>
                <span>·</span>
                <span>@{student?.username}</span>
                {student?.submittedAt && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <FiClock className="h-3 w-3" />
                      {new Date(student.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switchers */}
            <div className="flex rounded-xl bg-slate-200/70 dark:bg-slate-800/80 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("essay")}
                className={`rounded-lg px-3 py-1 text-xs font-black transition ${
                  activeTab === "essay"
                    ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                ✍️ Bài Tự luận {attachments.length > 0 && `(${attachments.length})`}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mc")}
                className={`rounded-lg px-3 py-1 text-xs font-black transition ${
                  activeTab === "mc"
                    ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                🔘 Trắc nghiệm ({mcReview.length} câu)
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              title="Đóng modal"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* BODY */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center py-20">
              <Loading loading text="Đang tải dữ liệu bài làm của học viên..." fullScreen={false} />
            </div>
          ) : activeTab === "essay" ? (
            /* TAB 1: ESSAY & HANDWRITTEN PHOTO GRADING */
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
              {/* Left Column: Photos & Notes (7 cols) */}
              <div className="lg:col-span-7 h-full overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Ảnh bài làm tự luận của học viên</span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                      {attachments.length} ảnh
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Bấm vào ảnh để phóng to & xoay ảnh
                  </span>
                </div>

                {attachments.length === 0 && essayGroups.every((group) => !group.notes) ? (
                  <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    <FiInfo className="mx-auto h-8 w-8 mb-2 text-amber-500" />
                    <p className="font-bold text-sm">Học viên không tải lên ảnh bài làm tự luận</p>
                    <p className="text-xs mt-1 text-amber-700/80 dark:text-amber-400/80">
                      Học viên đã nộp bài mà không đính kèm file ảnh bài giải. Bạn vẫn có thể nhập điểm hoặc nhận xét nếu cần.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[...essayGroups, ...(unassignedAttachments.length ? [{ id: "legacy", displayNumber: null, prompt: "Ảnh cũ chưa gắn với câu cụ thể", attachments: unassignedAttachments, notes: essay?.notes || "" }] : [])]
                      .filter((group) => group.attachments.length || group.notes)
                      .map((group) => (
                        <section key={group.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                {group.displayNumber ? `Câu ${group.displayNumber}` : "Bài nộp cũ"}
                              </h4>
                              {group.prompt && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{group.prompt}</p>}
                            </div>
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                              {group.attachments.length} ảnh
                            </span>
                          </div>
                          {group.attachments.length > 0 && (
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                              {group.attachments.map((att, idx) => (
                                <div key={att.id || idx} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xs transition hover:shadow-md dark:border-slate-800 dark:bg-slate-950/60">
                                  <button type="button" className="relative flex h-56 w-full cursor-zoom-in items-center justify-center overflow-hidden bg-slate-900/10 dark:bg-slate-950" onClick={() => { setLightboxImg(att.url); setRotation(0); }}>
                                    <img src={att.url} alt={att.name || `Trang ${idx + 1}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-105" loading="lazy" />
                                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/30 opacity-0 transition group-hover:opacity-100">
                                      <span className="flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-md dark:bg-slate-900/90 dark:text-white"><FiMaximize2 className="h-3.5 w-3.5" /> Xem phóng to</span>
                                    </span>
                                  </button>
                                  <div className="flex items-center justify-between border-t border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="min-w-0 pr-2"><span className="block truncate font-bold text-slate-900 dark:text-white">Trang {idx + 1} — {att.name || "Ảnh bài làm"}</span>{att.size && <span className="block text-[10px] text-slate-400">{Math.round(att.size / 1024)} KB</span>}</div>
                                    <a href={att.url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Mở ảnh trong tab mới"><FiExternalLink className="h-4 w-4" /></a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {group.notes && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><b className="text-slate-500">Ghi chú: </b><span className="whitespace-pre-wrap">{group.notes}</span></div>}
                        </section>
                      ))}
                  </div>
                )}

                {/* Ghi chú học sinh */}
                {normalizedEssay.generalNotes && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                      Ghi chú của học viên:
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap leading-relaxed">
                      {normalizedEssay.generalNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Teacher Grading Form (5 cols) */}
              <div className="lg:col-span-5 h-full overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col justify-between space-y-6">
                <form onSubmit={handleSave} className="space-y-5">
                  {/* Score Summary Box */}
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/30 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-violet-900 dark:text-violet-200">
                      <span>Cơ cấu điểm thi</span>
                      <span className="text-[11px] font-medium text-violet-700 dark:text-violet-400">
                        Thang điểm: {totalPossibleScore}đ
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-violet-100 dark:border-violet-900/40">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Trắc nghiệm</span>
                        <b className="text-base font-black text-emerald-600 dark:text-emerald-400">
                          {mcScore} đ
                        </b>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-violet-100 dark:border-violet-900/40">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Tự luận</span>
                        <b className="text-base font-black text-violet-600 dark:text-violet-400">
                          +{Number(essayScore || 0)} đ
                        </b>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-violet-200/60 dark:border-violet-900/60">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Tổng điểm sau khi chấm:
                      </span>
                      <span className="font-mono text-lg font-black text-violet-700 dark:text-violet-300">
                        {projectedTotalScore} / {totalPossibleScore} đ
                      </span>
                    </div>
                  </div>

                  {/* Input Score */}
                  <div>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1.5">
                      Điểm phần Tự luận <span className="text-rose-500">*</span> (Tối đa {essayMaxScore}đ)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={essayMaxScore}
                        step="0.25"
                        value={essayScore}
                        onChange={(e) => setEssayScore(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
                        placeholder="0.0"
                        required
                      />
                      <span className="font-bold text-xs text-slate-400 shrink-0">
                        / {essayMaxScore} đ
                      </span>
                    </div>

                    {/* Quick chips */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-slate-400">Chọn nhanh:</span>
                      {[0, 1, 1.5, 2, 2.5, Number(essayMaxScore)].filter((s, i, a) => s <= essayMaxScore && a.indexOf(s) === i).map((pt) => (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => setEssayScore(pt)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-violet-400 hover:text-violet-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 transition"
                        >
                          {pt}đ
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Textarea */}
                  <div>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1.5">
                      Lời nhận xét của giáo viên
                    </label>
                    <textarea
                      rows={4}
                      value={essayFeedback}
                      onChange={(e) => setEssayFeedback(e.target.value)}
                      placeholder="Ghi nhận xét chi tiết bài làm, lời giải của học viên (ví dụ: Câu 21 giải tốt, câu 22 chú ý điều kiện tập xác định)..."
                      className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:text-white transition"
                    />
                  </div>

                  {/* Status if already graded */}
                  {attempt?.essayGrade && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                      <FiCheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <b>Đã chấm trước đó:</b> {attempt.essayGrade.score}đ bởi {attempt.essayGrade.graderName || "Giáo viên"}
                        {attempt.essayGrade.gradedAt && (
                          <span className="block text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                            Lúc: {new Date(attempt.essayGrade.gradedAt).toLocaleString("vi-VN")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/30 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.99] transition disabled:opacity-60"
                  >
                    <FiCheckCircle className="h-4 w-4" />
                    {saving ? "Đang lưu điểm..." : "Lưu điểm & Công bố kết quả"}
                  </button>
                </form>

                <p className="text-[11px] text-slate-400 text-center">
                  Điểm số sau khi lưu sẽ tự động đồng bộ vào bảng điểm lớp học và hiển thị ngay cho học viên.
                </p>
              </div>
            </div>
          ) : (
            /* TAB 2: MULTIPLE CHOICE QUESTION-BY-QUESTION REVIEW */
            <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Đối chiếu đáp án trắc nghiệm
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Học viên đạt: <b>{mcScore}</b> điểm trắc nghiệm ({mcReview.filter((r) => r.isCorrect).length}/{mcReview.length} câu đúng)
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {mcReview.map((item, index) => {
                  const studentAns = item.studentAnswer;
                  const isCorrect = item.isCorrect;

                  return (
                    <article
                      key={item.questionId || index}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                              isCorrect
                                ? "bg-emerald-600 text-white"
                                : studentAns
                                ? "bg-rose-600 text-white"
                                : "bg-slate-400 text-white"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Câu {index + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">
                            Học viên chọn:{" "}
                            <b
                              className={`font-mono px-2 py-0.5 rounded-md ${
                                isCorrect
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                  : studentAns
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                  : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                              }`}
                            >
                              {Array.isArray(studentAns) ? studentAns.join(", ") : studentAns || "Chưa chọn"}
                            </b>
                          </span>

                          <span className="text-slate-500">
                            Đáp án đúng:{" "}
                            <b className="font-mono bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-md">
                              {Array.isArray(item.correctAnswer) ? item.correctAnswer.join(", ") : item.correctAnswer}
                            </b>
                          </span>

                          <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                            +{item.earnedPoints}/{item.points}đ
                          </span>
                        </div>
                      </div>

                      {item.explanation && (
                        <div className="mt-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 p-2.5 text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                          <b>💡 Hướng dẫn / Lời giải:</b> {item.explanation}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULL-SCREEN LIGHTBOX MODAL */}
      {lightboxImg && (
        <div className="fixed inset-0 z-60 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 animate-fadeIn">
          {/* Controls Bar */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
              className="rounded-xl bg-slate-800/90 text-white p-2.5 hover:bg-slate-700 transition flex items-center gap-1.5 text-xs font-bold"
              title="Xoay ảnh 90°"
            >
              <FiRotateCw className="h-4 w-4" /> Xoay ảnh
            </button>
            <a
              href={lightboxImg}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-slate-800/90 text-white p-2.5 hover:bg-slate-700 transition flex items-center gap-1.5 text-xs font-bold"
              title="Mở tab mới"
            >
              <FiExternalLink className="h-4 w-4" /> Mở ảnh gốc
            </a>
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="rounded-xl bg-rose-600 text-white p-2.5 hover:bg-rose-500 transition"
              title="Đóng xem ảnh"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>

          <div className="relative max-h-[85vh] max-w-[90vw] overflow-auto flex items-center justify-center">
            <img
              src={lightboxImg}
              alt="Ảnh bài làm phóng to"
              style={{ transform: `rotate(${rotation}deg)` }}
              className="max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-300 select-none shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
