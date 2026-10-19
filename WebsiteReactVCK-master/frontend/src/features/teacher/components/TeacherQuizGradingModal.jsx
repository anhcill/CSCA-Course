import { useEffect, useState, useMemo, useRef } from "react";
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
  FiUploadCloud,
  FiTrash2,
  FiPaperclip,
  FiCheck,
  FiAlertCircle,
  FiEye,
  FiEyeOff,
  FiList,
  FiGrid,
} from "react-icons/fi";
import {
  fetchTeacherQuizAttempt,
  gradeTeacherQuizEssay,
  requestSubmissionUploadUrl,
  confirmSubmissionAsset,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { attachmentsForQuestion, normalizeEssayResponse } from "../../assignments/utils/quizQuestionPresentation";
import RichMathText from "../../../components/common/RichMathText.jsx";

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
  const [mcViewMode, setMcViewMode] = useState("omr"); // "omr" | "detailed"
  const [essayScore, setEssayScore] = useState(0);
  const [essayFeedback, setEssayFeedback] = useState("");
  const [gradesByQuestion, setGradesByQuestion] = useState({});
  const [lightboxImg, setLightboxImg] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [uploadingForQuestionId, setUploadingForQuestionId] = useState(null);
  const [showLatexPreview, setShowLatexPreview] = useState({});
  const [showOverallLatexPreview, setShowOverallLatexPreview] = useState(false);
  const fileInputRefs = useRef({});

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
            setGradesByQuestion(currentGrade.gradesByQuestion || {});
          } else {
            setEssayScore(0);
            setEssayFeedback("");
            setGradesByQuestion({});
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

  // Filter essay questions
  const essayQuestions = useMemo(() => (attemptDetail?.computed?.review || [])
    .map((item, index) => ({
      id: item.questionId,
      displayNumber: index + 1,
      prompt: item.questionText || item.prompt || "",
      points: Number(item.points) || 1,
      questionType: item.questionType,
    }))
    .filter((item) => item.questionType === "essay" || item.questionType === "translation"), [attemptDetail]);

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

  // Filter ONLY multiple choice questions
  const mcOnlyReview = useMemo(() => (attemptDetail?.computed?.review || []).filter(
    (item) => item.questionType !== "essay" && item.questionType !== "translation"
  ), [attemptDetail]);

  const mcScore = useMemo(() => {
    const raw = mcOnlyReview.reduce((sum, item) => sum + (item.earnedPoints || 0), 0);
    return Math.round(raw * 100) / 100;
  }, [mcOnlyReview]);

  const mcMaxScore = useMemo(() => {
    const raw = mcOnlyReview.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
    return Math.round(raw * 100) / 100;
  }, [mcOnlyReview]);

  const mcCorrectCount = useMemo(() => mcOnlyReview.filter((r) => r.isCorrect).length, [mcOnlyReview]);
  const mcUnansweredCount = useMemo(() => mcOnlyReview.filter((r) => !r.studentAnswer || (Array.isArray(r.studentAnswer) && r.studentAnswer.length === 0)).length, [mcOnlyReview]);
  const mcIncorrectCount = mcOnlyReview.length - mcCorrectCount - mcUnansweredCount;

  // Answer keys (A, B, C, D)
  const answerKeys = useMemo(() => {
    const keys = new Set();
    mcOnlyReview.forEach((item) => {
      if (Array.isArray(item.options)) {
        item.options.forEach((opt) => {
          if (opt?.key) keys.add(String(opt.key).toUpperCase());
        });
      }
    });
    return keys.size ? [...keys].sort() : ["A", "B", "C", "D"];
  }, [mcOnlyReview]);

  const totalPossibleScore = attemptDetail?.computed?.maxScore || student?.maxScore || (mcMaxScore + Number(essayMaxScore || 0));
  const projectedTotalScore = Math.min(totalPossibleScore, Math.round((mcScore + Number(essayScore || 0)) * 100) / 100);

  // Handle per-question score update
  const handleQuestionScoreChange = (qId, val, maxQScore) => {
    const num = Number(val);
    const safeScore = Math.max(0, Math.min(Number(maxQScore || 10), isNaN(num) ? 0 : num));
    setGradesByQuestion((prev) => {
      const next = {
        ...prev,
        [String(qId)]: {
          ...(prev[String(qId)] || {}),
          score: safeScore,
        },
      };
      // Auto sum
      const sum = Object.values(next).reduce((acc, item) => acc + (Number(item?.score) || 0), 0);
      setEssayScore(Math.round(sum * 100) / 100);
      return next;
    });
  };

  // Handle per-question feedback update
  const handleQuestionFeedbackChange = (qId, feedback) => {
    setGradesByQuestion((prev) => ({
      ...prev,
      [String(qId)]: {
        ...(prev[String(qId)] || {}),
        feedback,
      },
    }));
  };

  // Handle teacher file upload for a specific question
  const handleTeacherFileUpload = async (qId, files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      toast.error("Vui lòng chọn file hình ảnh (JPG, PNG, WEBP) hoặc file PDF bài chữa.");
      return;
    }
    setUploadingForQuestionId(qId);
    const toastId = toast.loading(`Đang tải tệp bài chữa "${file.name}"...`);
    try {
      const mimeType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
      const uploadRes = await requestSubmissionUploadUrl({
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        assetKind: "file",
      });
      const uploadData = uploadRes?.data;
      if (!uploadData?.uploadUrl || !uploadData?.assetId) throw new Error("Không thể khởi tạo upload");

      const putRes = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: uploadData.headers || { "Content-Type": mimeType },
        body: file,
      });
      if (!putRes.ok) throw new Error("Kho lưu trữ từ chối tệp tải lên");

      const confirmed = await confirmSubmissionAsset({
        assetId: uploadData.assetId,
        mimeType,
        sizeBytes: file.size,
      });
      const assetId = confirmed?.data?.id || uploadData.assetId;
      const fileItem = {
        assetId,
        id: `asset-${assetId}`,
        name: file.name,
        size: file.size,
        mimeType,
        isPdf,
        url: `/api/assignments/submission-assets/${assetId}/access`,
        uploadedAt: new Date().toISOString(),
      };

      setGradesByQuestion((prev) => {
        const cur = prev[String(qId)] || {};
        const atts = Array.isArray(cur.attachments) ? cur.attachments : [];
        return {
          ...prev,
          [String(qId)]: {
            ...cur,
            attachments: [...atts, fileItem],
          },
        };
      });
      toast.success(`Đã tải lên tệp bài chữa "${file.name}"!`, { id: toastId });
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(err?.message || "Lỗi khi tải tệp", { id: toastId });
    } finally {
      setUploadingForQuestionId(null);
    }
  };

  // Remove teacher attachment
  const handleRemoveTeacherAttachment = (qId, attId) => {
    setGradesByQuestion((prev) => {
      const cur = prev[String(qId)] || {};
      const atts = Array.isArray(cur.attachments) ? cur.attachments : [];
      return {
        ...prev,
        [String(qId)]: {
          ...cur,
          attachments: atts.filter((a) => a.id !== attId && a.assetId !== attId),
        },
      };
    });
    toast.success("Đã gỡ tệp đính kèm bài chữa");
  };

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
        gradesByQuestion,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-6xl h-[92vh] max-h-[900px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* HEADER */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/80 dark:bg-slate-950/60">
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
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition flex items-center gap-1.5 ${
                  activeTab === "essay"
                    ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>✍️ Bài Tự luận</span>
                <span className="rounded-full bg-violet-100 dark:bg-violet-950 px-1.5 py-0.2 text-[10px] font-bold">
                  {essayQuestions.length} câu{attachments.length > 0 ? ` · ${attachments.length} ảnh` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mc")}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition flex items-center gap-1.5 ${
                  activeTab === "mc"
                    ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>🔘 Trắc nghiệm</span>
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 text-[10px] font-bold">
                  {mcOnlyReview.length} câu · {mcScore}đ
                </span>
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
            /* TAB 1: ESSAY QUESTION-BY-QUESTION GRADING WITH LATEX & FILE UPLOADS */
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
              {/* Left Column: Questions, Student Photos & Per-Question Grading (7 cols) */}
              <div className="lg:col-span-7 h-full overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Bài giải tự luận của học viên</span>
                    <span className="rounded-full bg-violet-100 dark:bg-violet-950/60 px-2 py-0.5 text-xs font-bold text-violet-700 dark:text-violet-300">
                      {attachments.length} ảnh bài giải
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Bấm vào ảnh để phóng to & xoay
                  </span>
                </div>

                {/* Render questions list */}
                {essayGroups.length === 0 && unassignedAttachments.length === 0 && !normalizedEssay.generalNotes ? (
                  <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    <FiInfo className="mx-auto h-8 w-8 mb-2 text-amber-500" />
                    <p className="font-bold text-sm">Học viên chưa tải lên ảnh bài làm tự luận</p>
                    <p className="text-xs mt-1 text-amber-700/80 dark:text-amber-400/80">
                      Học viên đã nộp bài mà không đính kèm file ảnh bài giải. Bạn vẫn có thể nhập điểm hoặc nhận xét nếu cần.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Groups by question */}
                    {essayGroups.map((group) => {
                      const qId = String(group.id);
                      const qGrade = gradesByQuestion[qId] || {};
                      const currentQScore = qGrade.score !== undefined ? qGrade.score : "";
                      const currentQFeedback = qGrade.feedback || "";
                      const currentTeacherAttachments = Array.isArray(qGrade.attachments) ? qGrade.attachments : [];
                      const isPreviewingLatex = Boolean(showLatexPreview[qId]);

                      return (
                        <section
                          key={qId}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-4 space-y-3.5 shadow-xs"
                        >
                          {/* Question header */}
                          <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-lg bg-violet-600 text-white font-black px-2 py-0.5 text-xs">
                                  Câu {group.displayNumber}
                                </span>
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                  (Thang điểm: {group.points}đ)
                                </span>
                              </div>
                              {group.prompt && (
                                <div className="mt-2 text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                                  <RichMathText value={group.prompt} />
                                </div>
                              )}
                            </div>

                            <span className="shrink-0 rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              {group.attachments.length} ảnh nộp
                            </span>
                          </div>

                          {/* Student Photos */}
                          {group.attachments.length > 0 ? (
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Bài làm của học sinh:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {group.attachments.map((att, idx) => (
                                  <div
                                    key={att.id || idx}
                                    className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 shadow-xs transition hover:shadow-md"
                                  >
                                    <button
                                      type="button"
                                      className="relative flex h-52 w-full cursor-zoom-in items-center justify-center overflow-hidden bg-slate-900/10 dark:bg-slate-950"
                                      onClick={() => { setLightboxImg(att.url); setRotation(0); }}
                                    >
                                      <img
                                        src={att.url}
                                        alt={att.name || `Trang ${idx + 1}`}
                                        className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
                                        loading="lazy"
                                      />
                                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/30 opacity-0 transition group-hover:opacity-100">
                                        <span className="flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-md dark:bg-slate-900/90 dark:text-white">
                                          <FiMaximize2 className="h-3.5 w-3.5" /> Phóng to
                                        </span>
                                      </span>
                                    </button>
                                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs">
                                      <div className="min-w-0 pr-2">
                                        <span className="block truncate font-bold text-slate-900 dark:text-white text-[11px]">
                                          Trang {idx + 1} — {att.name || "Ảnh bài làm"}
                                        </span>
                                        {att.size && (
                                          <span className="block text-[10px] text-slate-400">
                                            {Math.round(att.size / 1024)} KB
                                          </span>
                                        )}
                                      </div>
                                      <a
                                        href={att.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                                        title="Mở tab mới"
                                      >
                                        <FiExternalLink className="h-4 w-4" />
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-3 text-center text-xs text-slate-400">
                              Học viên không gửi ảnh riêng cho câu này.
                            </div>
                          )}

                          {/* Student note for this question */}
                          {group.notes && (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-700 dark:text-slate-300">
                              <b className="text-slate-500">Ghi chú của học sinh: </b>
                              <span className="whitespace-pre-wrap">{group.notes}</span>
                            </div>
                          )}

                          {/* TEACHER GRADING BOX FOR THIS QUESTION */}
                          <div className="rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-white dark:bg-slate-900 p-3.5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="text-xs font-black text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                                <span>Chấm điểm Câu {group.displayNumber}</span>
                                <span className="text-[11px] font-semibold text-slate-400">(Tối đa {group.points}đ)</span>
                              </label>

                              {/* Input score per question */}
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={group.points}
                                  step="0.25"
                                  value={currentQScore}
                                  onChange={(e) => handleQuestionScoreChange(qId, e.target.value, group.points)}
                                  placeholder="0.0"
                                  className="w-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-center font-mono font-black text-sm text-slate-900 dark:text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                                />
                                <span className="text-xs font-bold text-slate-400">/ {group.points}đ</span>

                                {/* Quick buttons */}
                                <div className="flex items-center gap-1 ml-1">
                                  {[0, Number((group.points / 2).toFixed(2)), group.points].filter((v, i, a) => a.indexOf(v) === i).map((pt) => (
                                    <button
                                      key={pt}
                                      type="button"
                                      onClick={() => handleQuestionScoreChange(qId, pt, group.points)}
                                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-600 transition"
                                    >
                                      {pt}đ
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Question Feedback Textarea with LaTeX */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                  Nhận xét chi tiết (Hỗ trợ công thức LaTeX: $...$)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowLatexPreview((prev) => ({ ...prev, [qId]: !prev[qId] }))}
                                  className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                                >
                                  {isPreviewingLatex ? <><FiEyeOff className="h-3 w-3" /> Tắt xem trước</> : <><FiEye className="h-3 w-3" /> Xem trước LaTeX</>}
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                value={currentQFeedback}
                                onChange={(e) => handleQuestionFeedbackChange(qId, e.target.value)}
                                placeholder={`Nhận xét riêng cho Câu ${group.displayNumber} (ví dụ: Lời giải tốt, chú ý điều kiện tập xác định $\\Delta > 0$, $x \\in (0, 2)$)...`}
                                className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 font-medium transition"
                              />

                              {/* Live KaTeX Preview */}
                              {isPreviewingLatex && (
                                <div className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/50 dark:bg-violet-950/20 p-2.5 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                                  <span className="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
                                    Xem trước hiển thị:
                                  </span>
                                  {currentQFeedback ? (
                                    <RichMathText value={currentQFeedback} />
                                  ) : (
                                    <span className="italic text-slate-400">Chưa có nội dung để xem trước.</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* TEACHER CORRECTION FILE / IMAGE UPLOAD */}
                            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                  <FiPaperclip className="h-3.5 w-3.5" />
                                  <span>Ảnh bài chữa / Lời giải mẫu của GV:</span>
                                </span>

                                <input
                                  type="file"
                                  ref={(el) => { fileInputRefs.current[qId] = el; }}
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  disabled={uploadingForQuestionId === qId}
                                  onChange={(e) => {
                                    if (e.target.files) handleTeacherFileUpload(qId, e.target.files);
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={uploadingForQuestionId === qId}
                                  onClick={() => fileInputRefs.current[qId]?.click()}
                                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition disabled:opacity-50"
                                >
                                  <FiUploadCloud className="h-3.5 w-3.5" />
                                  {uploadingForQuestionId === qId ? "Đang tải lên..." : "Tải ảnh/file chữa bài"}
                                </button>
                              </div>

                              {/* Attached teacher files */}
                              {currentTeacherAttachments.length > 0 && (
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {currentTeacherAttachments.map((att, idx) => (
                                    <div
                                      key={att.id || idx}
                                      className="flex items-center justify-between rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20 p-2 text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 pr-2">
                                        <button
                                          type="button"
                                          onClick={() => { setLightboxImg(att.url); setRotation(0); }}
                                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-200/60 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 hover:scale-105 transition"
                                          title="Bấm để xem ảnh"
                                        >
                                          {att.isPdf ? "📕" : "🖼️"}
                                        </button>
                                        <div className="min-w-0">
                                          <p className="truncate font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                                            {att.name || "File bài chữa"}
                                          </p>
                                          {att.size && (
                                            <span className="text-[10px] text-slate-400">
                                              {Math.round(att.size / 1024)} KB
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <a
                                          href={att.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                          title="Mở tab mới"
                                        >
                                          <FiExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveTeacherAttachment(qId, att.id || att.assetId)}
                                          className="p-1 text-rose-400 hover:text-rose-600"
                                          title="Gỡ file này"
                                        >
                                          <FiTrash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </section>
                      );
                    })}

                    {/* Unassigned / Legacy attachments if any */}
                    {unassignedAttachments.length > 0 && (
                      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-slate-900 dark:text-white">
                            Ảnh bài làm chung (chưa gắn với câu cụ thể)
                          </h4>
                          <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold">
                            {unassignedAttachments.length} ảnh
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {unassignedAttachments.map((att, idx) => (
                            <div
                              key={att.id || idx}
                              className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 shadow-xs"
                            >
                              <button
                                type="button"
                                className="relative flex h-48 w-full cursor-zoom-in items-center justify-center overflow-hidden bg-slate-900/10 dark:bg-slate-950"
                                onClick={() => { setLightboxImg(att.url); setRotation(0); }}
                              >
                                <img
                                  src={att.url}
                                  alt={att.name || `Ảnh ${idx + 1}`}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              </button>
                              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-xs">
                                <span className="truncate font-bold text-[11px] text-slate-800 dark:text-slate-200">
                                  {att.name || `Ảnh bài giải ${idx + 1}`}
                                </span>
                                <a href={att.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700">
                                  <FiExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Total Score, Overall Comments & Submit Button (5 cols) */}
              <div className="lg:col-span-5 h-full overflow-y-auto p-4 sm:p-5 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between space-y-5">
                <form onSubmit={handleSave} className="space-y-5">
                  {/* Score Breakdown Summary Box */}
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/30 p-4 space-y-3 shadow-xs">
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

                  {/* Overall Essay Score Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-black text-slate-800 dark:text-slate-200">
                        Tổng điểm phần Tự luận <span className="text-rose-500">*</span> (Tối đa {essayMaxScore}đ)
                      </label>
                      <span className="text-[10px] text-slate-400">
                        (Tự động cộng từ các câu)
                      </span>
                    </div>
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

                  {/* Overall Feedback Textarea with LaTeX */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-800 dark:text-slate-200">
                        Lời nhận xét chung của giáo viên
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowOverallLatexPreview((prev) => !prev)}
                        className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                      >
                        {showOverallLatexPreview ? <><FiEyeOff className="h-3 w-3" /> Tắt xem trước</> : <><FiEye className="h-3 w-3" /> Xem trước LaTeX</>}
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={essayFeedback}
                      onChange={(e) => setEssayFeedback(e.target.value)}
                      placeholder="Ghi nhận xét tổng quát bài làm, tiến độ, lời khen hoặc lưu ý chung cho học viên (hỗ trợ công thức LaTeX $...$)..."
                      className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:text-white transition"
                    />

                    {showOverallLatexPreview && (
                      <div className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/50 dark:bg-violet-950/20 p-2.5 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                        <span className="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
                          Xem trước hiển thị:
                        </span>
                        {essayFeedback ? (
                          <RichMathText value={essayFeedback} />
                        ) : (
                          <span className="italic text-slate-400">Chưa có nội dung để xem trước.</span>
                        )}
                      </div>
                    )}
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
            /* TAB 2: MULTIPLE CHOICE RESULT SCREEN (OMR BUBBLE SHEET + DETAILED BREAKDOWN) */
            <div className="h-full flex flex-col overflow-hidden">
              {/* Sub-header with Metrics & View Mode Switcher */}
              <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 p-4 sm:px-6 bg-slate-50/50 dark:bg-slate-950/30 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Kết quả bài thi trắc nghiệm của học viên</span>
                    <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold px-2 py-0.5 text-xs">
                      {mcScore} / {mcMaxScore} điểm
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                      <FiCheckCircle className="h-3.5 w-3.5" /> {mcCorrectCount} đúng
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                      <FiAlertCircle className="h-3.5 w-3.5" /> {mcIncorrectCount} sai
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-slate-500 font-bold">
                      {mcUnansweredCount} bỏ trống
                    </span>
                  </div>
                </div>

                <div className="flex rounded-xl bg-slate-200/80 dark:bg-slate-800/80 p-1">
                  <button
                    type="button"
                    onClick={() => setMcViewMode("omr")}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition flex items-center gap-1.5 ${
                      mcViewMode === "omr"
                        ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-300"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <FiGrid className="h-3.5 w-3.5" /> Phiếu trả lời OMR
                  </button>
                  <button
                    type="button"
                    onClick={() => setMcViewMode("detailed")}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition flex items-center gap-1.5 ${
                      mcViewMode === "detailed"
                        ? "bg-white text-violet-700 shadow-xs dark:bg-slate-900 dark:text-violet-300"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    <FiList className="h-3.5 w-3.5" /> Chi tiết từng câu ({mcOnlyReview.length})
                  </button>
                </div>
              </div>

              {/* MC Body Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
                {mcOnlyReview.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center text-slate-500">
                    Đề thi này không có câu hỏi trắc nghiệm (toàn bộ là câu hỏi tự luận).
                  </div>
                ) : mcViewMode === "omr" ? (
                  /* OMR BUBBLE SHEET VIEW (Like Student Result Screen) */
                  <div className="space-y-4">
                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3 text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Bảng đối soát phiếu trả lời trắc nghiệm:
                      </span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">✓</span> Chọn đúng
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] text-white">✗</span> Chọn sai
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-50 text-[10px] dark:bg-emerald-950">A</span> Đáp án đúng
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-bold text-slate-400">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-[10px]">—</span> Bỏ trống
                        </span>
                      </div>
                    </div>

                    {/* OMR Grid table */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3 w-16">Câu</th>
                            {answerKeys.map((k) => (
                              <th key={k} className="py-2.5 px-2 text-center w-12">{k}</th>
                            ))}
                            <th className="py-2.5 px-3 text-center w-28">Đáp án chọn</th>
                            <th className="py-2.5 px-3 text-center w-24">Đáp án đúng</th>
                            <th className="py-2.5 px-3 text-center w-20">Điểm</th>
                            <th className="py-2.5 px-3 text-center w-24">Kết quả</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {mcOnlyReview.map((item, idx) => {
                            const studentAns = item.studentAnswer;
                            const studentKeys = Array.isArray(studentAns) ? studentAns.map(String) : (studentAns ? [String(studentAns)] : []);
                            const correctAns = item.correctAnswer;
                            const correctKeys = Array.isArray(correctAns) ? correctAns.map(String) : (correctAns ? [String(correctAns)] : []);
                            const isCorrect = item.isCorrect;
                            const isUnanswered = studentKeys.length === 0;

                            return (
                              <tr
                                key={item.questionId || idx}
                                className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                                  isCorrect ? "bg-emerald-50/20" : isUnanswered ? "" : "bg-rose-50/20"
                                }`}
                              >
                                <td className="py-2 px-3 font-black text-slate-800 dark:text-slate-200">
                                  Câu {item.position || (idx + 1)}
                                </td>

                                {/* Bubble options A, B, C, D */}
                                {answerKeys.map((key) => {
                                  const isSelected = studentKeys.includes(key);
                                  const isTheCorrectKey = correctKeys.includes(key);

                                  let bubbleClass = "border border-slate-300 dark:border-slate-700 text-slate-400 bg-white dark:bg-slate-900";
                                  if (isSelected && isCorrect) {
                                    bubbleClass = "bg-emerald-600 text-white font-black shadow-xs";
                                  } else if (isSelected && !isCorrect) {
                                    bubbleClass = "bg-rose-600 text-white font-black shadow-xs";
                                  } else if (isTheCorrectKey && (!isSelected || !isCorrect)) {
                                    bubbleClass = "border-2 border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-black";
                                  }

                                  return (
                                    <td key={key} className="py-2 px-2 text-center">
                                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs transition ${bubbleClass}`}>
                                        {key}
                                      </span>
                                    </td>
                                  );
                                })}

                                <td className="py-2 px-3 text-center">
                                  <span className={`inline-block font-mono font-black px-2 py-0.5 rounded-md ${
                                    isCorrect
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                      : isUnanswered
                                      ? "bg-slate-100 text-slate-400 dark:bg-slate-800"
                                      : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                  }`}>
                                    {isUnanswered ? "Chưa chọn" : studentKeys.join(", ")}
                                  </span>
                                </td>

                                <td className="py-2 px-3 text-center">
                                  <span className="inline-block font-mono font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    {correctKeys.join(", ") || "—"}
                                  </span>
                                </td>

                                <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                                  +{item.earnedPoints}/{item.points}đ
                                </td>

                                <td className="py-2 px-3 text-center">
                                  {isCorrect ? (
                                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 text-[10px]">
                                      ✓ Đúng
                                    </span>
                                  ) : isUnanswered ? (
                                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-2 py-0.5 text-[10px]">
                                      Bỏ trống
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold px-2 py-0.5 text-[10px]">
                                      ✗ Sai
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* DETAILED QUESTION-BY-QUESTION BREAKDOWN */
                  <div className="space-y-3">
                    {mcOnlyReview.map((item, index) => {
                      const studentAns = item.studentAnswer;
                      const isCorrect = item.isCorrect;
                      const options = Array.isArray(item.options) ? item.options : [];

                      return (
                        <article
                          key={item.questionId || index}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-2.5 shadow-xs"
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
                                {item.position || (index + 1)}
                              </span>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                Câu {item.position || (index + 1)}
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

                          {/* Question Text */}
                          {item.questionText && (
                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                              <RichMathText value={item.questionText} />
                            </div>
                          )}

                          {/* Options List */}
                          {options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {options.map((opt) => {
                                const isSelected = Array.isArray(studentAns) ? studentAns.includes(opt.key) : studentAns === opt.key;
                                const isCorrectOpt = Array.isArray(item.correctAnswer) ? item.correctAnswer.includes(opt.key) : item.correctAnswer === opt.key;

                                let optCardClass = "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300";
                                if (isSelected && isCorrectOpt) {
                                  optCardClass = "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200";
                                } else if (isSelected && !isCorrectOpt) {
                                  optCardClass = "border-rose-500 bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200";
                                } else if (isCorrectOpt) {
                                  optCardClass = "border-emerald-400 border-dashed bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300";
                                }

                                return (
                                  <div
                                    key={opt.key}
                                    className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs transition ${optCardClass}`}
                                  >
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                                      isSelected
                                        ? isCorrectOpt
                                          ? "bg-emerald-600 text-white"
                                          : "bg-rose-600 text-white"
                                        : isCorrectOpt
                                        ? "border border-emerald-500 text-emerald-600 font-black"
                                        : "border border-slate-400 text-slate-500"
                                    }`}>
                                      {opt.key}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <RichMathText value={opt.text || opt.key} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Explanation */}
                          {item.explanation && (
                            <div className="mt-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 p-2.5 text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                              <b>💡 Hướng dẫn / Lời giải chi tiết:</b>
                              <RichMathText value={item.explanation} className="mt-1" />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
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
