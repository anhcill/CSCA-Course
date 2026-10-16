import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiArrowLeft,
  FiBookOpen,
  FiCamera,
  FiCheckCircle,
  FiClipboard,
  FiExternalLink,
  FiEye,
  FiFileText,
  FiFlag,
  FiMaximize2,
  FiMinimize2,
  FiRotateCcw,
  FiSend,
  FiTarget,
  FiTrash2,
  FiUploadCloud,
  FiX,
  FiZoomIn,
} from "react-icons/fi";
import {
  confirmSubmissionAsset,
  fetchQuiz,
  requestSubmissionUploadUrl,
  saveQuizAnswers,
  submitQuiz,
} from "../../api/lmsClient";
import { ErrorState, LoadingState } from "../../../components/common/StateView";
import { parseQuizDescription } from "../../teacher/utils/quizAnswerKey";
import {
  attachmentsForQuestion,
  buildEssayResponse,
  isEssayQuestion,
  normalizeEssayResponse,
  preserveQuestionOrder,
} from "../utils/quizQuestionPresentation";

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("Không thể đọc file ảnh."));
  reader.readAsDataURL(file);
});

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
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [reviewMode, setReviewMode] = useState(false);
  const [activeViewerTab, setActiveViewerTab] = useState("paper"); // "split" | "paper" | "solution" | "questions"
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState("paper"); // "paper" | "mc" | "essay" | "sheet"
  const [saveStatus, setSaveStatus] = useState("saved");

  const [selectedEssayQuestionId, setSelectedEssayQuestionId] = useState(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState(null);

  // Essay / Handwritten response states
  const [answerPanelTab, setAnswerPanelTab] = useState("mc"); // "mc" | "essay"
  const [essayAttachments, setEssayAttachments] = useState([]); // [{ id, name, size, url, uploadedAt, isPdf }]
  const [essayNotes, setEssayNotes] = useState("");
  const [essayNotesByQuestion, setEssayNotesByQuestion] = useState({});
  const [uploadingEssay, setUploadingEssay] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [lightboxRotation, setLightboxRotation] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const containerRef = useRef(null);

  const questions = useMemo(() => preserveQuestionOrder(quizData?.questions), [quizData]);
  const essayQuestions = useMemo(() => questions.filter(isEssayQuestion), [questions]);
  const multipleChoiceQuestions = useMemo(() => questions.filter((question) => !isEssayQuestion(question)), [questions]);
  const isTimed = useMemo(() => Number(quizData?.durationMinutes || 0) > 0, [quizData]);
  const essayConfig = useMemo(
    () => quizData?.essayConfig || parseQuizDescription(quizData?.description)?.essayConfig || null,
    [quizData?.description, quizData?.essayConfig],
  );
  const hasEssay = Boolean(essayConfig?.enabled) || essayQuestions.length > 0;
  const hasBoth = multipleChoiceQuestions.length > 0 && hasEssay;

  const answerKeys = useMemo(() => {
    const keys = [...new Set(questions.flatMap((question) => (question.options || []).map((option) => option.key)))].sort();
    return keys.length ? keys : ["A", "B", "C", "D"];
  }, [questions]);

  const reviewByQuestion = useMemo(
    () => new Map((result?.review || []).map((item) => [String(item.questionId), item])),
    [result]
  );
  const answerReviewAvailable = Boolean(
    result && (result.reviewAvailable ?? (Array.isArray(result.review) && result.review.length > 0)),
  );
  const canViewSolution = Boolean(reviewMode && answerReviewAvailable && quizData?.solutionUrl);
  const hasSplitReview = Boolean(reviewMode && answerReviewAvailable && quizData?.paperUrl && quizData?.solutionUrl);
  const reviewSummary = useMemo(() => multipleChoiceQuestions.reduce((summary, question) => {
    const review = reviewByQuestion.get(String(question.id));
    if (!review) return { ...summary, unavailable: summary.unavailable + 1 };
    if (review.isCorrect) return { ...summary, correct: summary.correct + 1 };
    const studentAnswer = review.studentAnswer ?? answers[question.id];
    const isBlank = Array.isArray(studentAnswer) ? studentAnswer.length === 0 : !studentAnswer;
    return isBlank
      ? { ...summary, unanswered: summary.unanswered + 1 }
      : { ...summary, incorrect: summary.incorrect + 1 };
  }, { correct: 0, incorrect: 0, unanswered: 0, unavailable: 0 }), [answers, multipleChoiceQuestions, reviewByQuestion]);

  const answeredCount = useMemo(() => multipleChoiceQuestions.filter((question) => {
    const value = answers[question.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length, [answers, multipleChoiceQuestions]);

  const unansweredCount = Math.max(0, multipleChoiceQuestions.length - answeredCount);
  const essayPayload = useMemo(() => buildEssayResponse({
    attachments: essayAttachments,
    notesByQuestion: essayNotesByQuestion,
    generalNotes: essayNotes,
    essayQuestions,
  }), [essayAttachments, essayNotes, essayNotesByQuestion, essayQuestions]);

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
      if (!response.success || !response.data) {
        throw new Error("Đề thi chưa sẵn sàng hoặc không tồn tại");
      }
      const data = response.data;
      const parsedDesc = parseQuizDescription(data.description);
      const isEssayEnabled = Boolean(data.essayConfig?.enabled || parsedDesc?.essayConfig?.enabled);

      if ((!data.questions || data.questions.length === 0) && !isEssayEnabled) {
        throw new Error("Đề thi chưa có câu hỏi nào");
      }

      const isSubmitted = Boolean(data.result);
      const serverAnswers = data.attempt?.answers || {};
      let loadedEssay = serverAnswers._essay || data.result?.essay || null;
      let savedAnswers = {};
      let savedEssay = null;

      if (!isSubmitted && !data.attempt && Object.keys(serverAnswers).length === 0) {
        try {
          const local = JSON.parse(localStorage.getItem(`csca_quiz_${quizId}`) || "{}");
          if (local && typeof local === "object") {
            if (local._essay) {
              savedEssay = local._essay;
              delete local._essay;
            }
            savedAnswers = local;
          }
        } catch {
          savedAnswers = {};
        }
      }

      const mcAnswers = { ...serverAnswers };
      if (mcAnswers._essay) {
        if (!loadedEssay) loadedEssay = mcAnswers._essay;
        delete mcAnswers._essay;
      }

      setQuizData(data);
      setResult(data.result || null);
      setAnswers(Object.keys(mcAnswers).length ? mcAnswers : savedAnswers);

      const sourceEssay = loadedEssay || savedEssay || null;
      const orderedQuestions = preserveQuestionOrder(data.questions);
      const normalizedEssay = normalizeEssayResponse(sourceEssay, orderedQuestions.filter(isEssayQuestion));
      const normalizedAttachmentKeys = new Set(normalizedEssay.attachments.map((attachment) => (
        attachment.assetId || attachment.id || attachment.url
      )).filter(Boolean));
      const generalAttachments = (Array.isArray(sourceEssay?.attachments) ? sourceEssay.attachments : [])
        .filter((attachment) => {
          const key = attachment?.assetId || attachment?.id || attachment?.url;
          return key && !normalizedAttachmentKeys.has(key);
        });
      setEssayAttachments([...normalizedEssay.attachments, ...generalAttachments]);
      setEssayNotesByQuestion(normalizedEssay.notesByQuestion);
      setEssayNotes(normalizedEssay.generalNotes);

      // If quiz is exclusively essay (0 MC questions), switch to essay panel
      if ((!data.questions || data.questions.length === 0) && isEssayEnabled) {
        setAnswerPanelTab("essay");
      }

      const limit = Number(data.timeLimitSeconds) || Number(data.durationMinutes || 60) * 60;
      const startedAt = data.attempt?.startedAt ? new Date(data.attempt.startedAt).getTime() : Date.now();
      const expiresAt = data.attempt?.expiresAt ? new Date(data.attempt.expiresAt).getTime() : startedAt + limit * 1000;
      setTimeLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

      if (isSubmitted) {
        setReviewMode(true);
        if (data.result?.reviewAvailable !== false && data.paperUrl && data.solutionUrl) {
          setActiveViewerTab("split");
        } else if (!data.paperUrl && data.result?.reviewAvailable !== false && data.solutionUrl) {
          setActiveViewerTab("solution");
        } else if (!data.paperUrl) {
          setActiveViewerTab("questions");
        }
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

  // Upload the original file bytes (image or PDF) so handwriting and metadata are preserved.
  const handleAddImages = useCallback(async (files, question = null) => {
    if (result || reviewMode) return;
    const fileList = Array.from(files);
    const validFiles = fileList.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      return isImage || isPdf;
    });

    if (validFiles.length === 0) {
      toast.error("Vui lòng chọn file hình ảnh (JPG, PNG, WEBP...) hoặc file PDF bài làm.");
      return;
    }
    setUploadingEssay(true);
    const toastId = toast.loading(`Đang xử lý & lưu ${validFiles.length} file vào kho Cloudflare R2...`);
    try {
      const newItems = [];
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        let previewUrl = null;
        if (!isPdf) {
          previewUrl = await readFileAsDataUrl(file);
        }
        const rawName = file.name || (isPdf ? `document_${Date.now()}_${i + 1}.pdf` : `photo_${Date.now()}_${i + 1}.jpg`);
        const extension = rawName.match(/\.[a-zA-Z0-9]+$/)?.[0] || (isPdf ? ".pdf" : ".jpg");
        const cleanBase = rawName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || `file_${Date.now()}`;
        const filename = `${cleanBase}${extension}`;
        const mimeType = file.type || (isPdf ? "application/pdf" : "application/octet-stream");

        let cloudflareAssetId = null;
        let cloudflareUrl = null;

        try {
          const uploadRes = await requestSubmissionUploadUrl({
            filename,
            mimeType,
            sizeBytes: file.size,
            assetKind: "file",
          });

          const uploadData = uploadRes?.data;
          if (uploadData?.uploadUrl && uploadData?.assetId) {
            const r2Put = await fetch(uploadData.uploadUrl, {
              method: "PUT",
              headers: uploadData.headers || { "Content-Type": mimeType },
              body: file,
            });

            if (!r2Put.ok) throw new Error(`Kho lưu trữ từ chối file ${rawName}.`);
            const confirmed = await confirmSubmissionAsset({
              assetId: uploadData.assetId,
              mimeType,
              sizeBytes: file.size,
            });
            cloudflareAssetId = confirmed?.data?.id || uploadData.assetId;
            cloudflareUrl = `/api/assignments/submission-assets/${cloudflareAssetId}/access`;
          }
        } catch (r2Err) {
          throw new Error(r2Err?.message || `Không thể lưu file ${rawName} lên kho bài nộp.`);
        }

        if (!cloudflareAssetId || !cloudflareUrl) {
          throw new Error(`Không thể xác nhận file ${rawName}. Vui lòng thử lại.`);
        }

        newItems.push({
          id: cloudflareAssetId ? `asset-${cloudflareAssetId}` : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          assetId: cloudflareAssetId || null,
          name: filename,
          size: file.size,
          mimeType,
          isPdf,
          url: cloudflareUrl,
          previewUrl,
          isCloudflare: true,
          questionId: question?.id || null,
          questionNumber: question?.displayNumber || null,
          uploadedAt: new Date().toISOString(),
        });
      }

      setEssayAttachments((prev) => [...prev, ...newItems]);
      const cloudflareCount = newItems.filter((item) => item.isCloudflare).length;
      if (cloudflareCount > 0) {
        toast.success(
          question
            ? `Đã lưu ${cloudflareCount} file cho Câu ${question.displayNumber} vào Cloudflare R2! ☁️`
            : `Đã lưu ${cloudflareCount} file bài làm vào Cloudflare R2! ☁️`,
          { id: toastId }
        );
      } else {
        toast.success(`Đã thêm ${newItems.length} file bài làm!`, { id: toastId });
      }
    } catch (err) {
      console.error("Lỗi tải file tự luận:", err);
      toast.error(err?.message || "Không thể xử lý file, vui lòng thử lại!", { id: toastId });
    } finally {
      setUploadingEssay(false);
    }
  }, [result, reviewMode]);

  const handleRemoveImage = useCallback((imgId) => {
    if (result || reviewMode) return;
    setEssayAttachments((prev) => prev.filter((img) => img.id !== imgId));
    toast.success("Đã xóa file bài làm");
  }, [result, reviewMode]);

  // Listen for Ctrl+V clipboard paste to easily attach screenshots
  useEffect(() => {
    const handlePaste = async (e) => {
      if (result || reviewMode) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        // 1. Check focused element inside a question card
        const activeEl = document.activeElement;
        const cardEl = activeEl?.closest("[data-essay-question-id]");
        const qId = cardEl?.getAttribute("data-essay-question-id") || selectedEssayQuestionId;
        const targetQ = essayQuestions.find((q) => String(q.id) === String(qId)) || null;

        if (targetQ) {
          await handleAddImages(imageFiles, targetQ);
          return;
        }

        // 2. If only 1 essay question
        if (essayQuestions.length === 1) {
          await handleAddImages(imageFiles, essayQuestions[0]);
          return;
        }

        // 3. Target the first essay question that has no images yet, or essayQuestions[0]
        if (essayQuestions.length > 1) {
          const firstUnanswered = essayQuestions.find((q) => attachmentsForQuestion(essayAttachments, q.id).length === 0) || essayQuestions[0];
          await handleAddImages(imageFiles, firstUnanswered);
          return;
        }

        await handleAddImages(imageFiles, null);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [essayQuestions, essayAttachments, selectedEssayQuestionId, handleAddImages, result, reviewMode]);

  // Autosave answers & essay attachments
  useEffect(() => {
    const hasWork = Object.keys(answers).length > 0 || essayAttachments.length > 0 || essayPayload.notes.trim().length > 0;
    if (result || !hasWork) return undefined;
    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      const payloadAnswers = {
        ...answers,
        _essay: essayPayload,
      };
      try {
        localStorage.setItem(`csca_quiz_${quizId || "quiz"}`, JSON.stringify(payloadAnswers));
      } catch {
        /* Offline convenience */
      }
      saveQuizAnswers({ quizId, answers: payloadAnswers })
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
  }, [answers, essayAttachments.length, essayPayload, quizId, result, loadQuiz]);

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
      const payloadAnswers = {
        ...answers,
        _essay: essayPayload,
      };
      const response = await submitQuiz({ quizId, answers: payloadAnswers });
      if (!response.success || !response.data) throw new Error("Máy chủ chưa ghi nhận được bài thi");
      setResult(response.data);
      if (response.data.solutionUrl) {
        setQuizData((curr) => ({ ...curr, solutionUrl: response.data.solutionUrl }));
      }
      if (response.data.reviewAvailable !== false && quizData?.paperUrl && response.data.solutionUrl) {
        setActiveViewerTab("split");
      } else if (!quizData?.paperUrl && response.data.reviewAvailable !== false && response.data.solutionUrl) {
        setActiveViewerTab("solution");
      } else if (!quizData?.paperUrl) {
        setActiveViewerTab("questions");
      }
      try {
        localStorage.removeItem(`csca_quiz_${quizId}`);
      } catch {
        /* no-op */
      }
      if (hasEssay) {
        toast.success("Nộp bài thành công! Bài tự luận đã được chuyển đến giáo viên để chấm điểm.");
      } else {
        toast.success(`Nộp bài thành công: ${response.data.score}/${response.data.maxScore} điểm.`);
      }
      setReviewMode(true);
    } catch (error) {
      console.error("Quiz submission failed:", error);
      toast.error(error?.message || "Không thể nộp bài. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }, [answers, essayPayload, hasEssay, quizData?.paperUrl, quizId, result, submitting]);

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
    const hasUnsavedWork = answeredCount > 0
      || essayAttachments.length > 0
      || Object.values(essayNotesByQuestion).some((note) => String(note || "").trim())
      || essayNotes.trim();
    if (!result && hasUnsavedWork) {
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

  const currentViewUrl = activeViewerTab === "solution" && canViewSolution ? quizData.solutionUrl : quizData.paperUrl;
  const activityLabel = quizData.activityScope === "homework" ? "QUIZ VỀ NHÀ" : "QUIZ TẠI LỚP";
  const unassignedEssayAttachments = essayAttachments.filter((attachment) => !attachment?.questionId);
  const reviewPolicyMessage = quizData.reviewPolicy === "never"
    ? "Giáo viên không công bố đáp án cho quiz này. Bạn vẫn có thể xem lại lựa chọn và bài tự luận đã nộp."
    : quizData.reviewPolicy === "after_close"
      ? "Đáp án sẽ được công bố sau khi quiz đóng. Hiện tại bạn chỉ có thể xem lại bài đã nộp."
      : "Đáp án chi tiết chưa sẵn sàng. Vui lòng quay lại sau hoặc liên hệ giáo viên.";

  const renderSubmitActions = () => (
    <>
      <div className="flex items-center gap-2">
        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
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
            className="flex-[1.3] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 py-2.5 px-4 text-xs font-black text-white shadow-lg shadow-rose-950/50 transition hover:from-red-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiSend className="h-3.5 w-3.5" />
            <span>{submitting ? "Đang nộp..." : "Nộp bài"}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(assignmentListPath)}
            className="flex-[1.3] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 px-4 text-xs font-black text-slate-200 hover:bg-slate-700 transition"
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
    </>
  );

  const renderOmrPanel = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* OMR Header */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-800/90 px-3.5 py-3 bg-[#091120]">
        <div>
          <h2 className="text-xs font-black tracking-wider text-white flex items-center gap-1.5">
            <span>🔘</span> {reviewMode ? "KẾT QUẢ TỪNG CÂU" : "BẢNG TRẮC NGHIỆM"}
          </h2>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
            {reviewMode
              ? answerReviewAvailable
                ? `${reviewSummary.correct} đúng • ${reviewSummary.incorrect} sai • ${reviewSummary.unanswered} bỏ trống`
                : "Các lựa chọn của bạn được giữ nguyên; đáp án đúng chưa được công bố"
              : quizData.paperUrl ? "Chọn đáp án theo file PDF" : "Chọn đáp án cho từng câu"}
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">
          {reviewMode && answerReviewAvailable ? (
            <>
              <span className="inline-flex items-center gap-1 text-emerald-300"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Đúng</span>
              <span className="inline-flex items-center gap-1 text-rose-300"><i className="h-2 w-2 rounded-full bg-rose-500" /> Sai</span>
              <span className="inline-flex items-center gap-1 text-slate-300"><i className="h-2 w-2 rounded-full border border-slate-500" /> Bỏ trống</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-slate-300"><i className="h-2 w-2 rounded-full bg-red-600 shadow-xs shadow-red-600/50" /> Đã chọn</span>
              <span className="inline-flex items-center gap-1 text-slate-400"><i className="h-2 w-2 rounded-full border border-slate-500" /> Chưa chọn</span>
            </>
          )}
        </div>
      </div>

      {reviewMode && !answerReviewAvailable && multipleChoiceQuestions.length > 0 && (
        <div className="shrink-0 border-b border-amber-800/60 bg-amber-950/30 px-3.5 py-2 text-[10px] font-semibold leading-relaxed text-amber-200">
          🔒 {reviewPolicyMessage}
        </div>
      )}

      {/* OMR Table Body */}
      <div className="flex-1 min-h-0 overflow-auto px-2.5 py-2 scrollbar-thin">
        <div className="w-full" style={{ minWidth: `${132 + (answerKeys.length * 38)}px` }}>
          {/* Table Column Headers */}
          <div
            className="grid items-center gap-1 border-b border-slate-800/60 pb-2 text-center text-xs font-black text-slate-400"
            style={{ gridTemplateColumns: `56px repeat(${answerKeys.length}, minmax(30px, 1fr)) ${reviewMode ? "72px" : "30px"}` }}
          >
            <span className="text-left pl-1 text-[10px] uppercase tracking-wider text-slate-500">Câu</span>
            {answerKeys.map((key) => (
              <span key={key} className="text-slate-300 font-black">
                {key}
              </span>
            ))}
            {reviewMode ? (
              <span className="text-[9px] uppercase tracking-wide text-slate-500">Kết quả</span>
            ) : (
              <span className="flex justify-center text-slate-500" title="Đánh dấu câu hỏi cần xem lại"><FiFlag className="h-3 w-3" /></span>
            )}
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-800/40">
            {questions.map((question, index) => {
              const review = reviewByQuestion.get(String(question.id));
              const selected = answers[question.id];
              const selectedKeys = Array.isArray(selected) ? selected : [selected];
              const isFlagged = flaggedQuestions.has(question.id);
              const questionAttachments = attachmentsForQuestion(essayAttachments, question.id);
              const isEssay = isEssayQuestion(question);
              const reviewStudentAnswer = review?.studentAnswer ?? selected;
              const isUnanswered = Array.isArray(reviewStudentAnswer) ? reviewStudentAnswer.length === 0 : !reviewStudentAnswer;
              const rowStatus = isEssay
                ? result?.essayGrade ? "Đã chấm" : "Chờ chấm"
                : !answerReviewAvailable || !review ? "Ẩn đáp án"
                  : review.isCorrect ? "Đúng" : isUnanswered ? "Bỏ trống" : "Sai";
              const rowStatusClass = isEssay
                ? result?.essayGrade ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                : !answerReviewAvailable || !review ? "bg-slate-700/60 text-slate-300"
                  : review.isCorrect ? "bg-emerald-500/15 text-emerald-300"
                    : isUnanswered ? "bg-slate-700/60 text-slate-300" : "bg-rose-500/15 text-rose-300";

              return (
                <div
                  key={question.id}
                  className={`grid items-center gap-1 py-1.5 text-center transition ${
                    reviewMode && answerReviewAvailable && !isEssay
                      ? review?.isCorrect ? "bg-emerald-950/10" : isUnanswered ? "bg-slate-900/20" : "bg-rose-950/10"
                      : "hover:bg-slate-800/20"
                  }`}
                  style={{ gridTemplateColumns: `56px repeat(${answerKeys.length}, minmax(30px, 1fr)) ${reviewMode ? "72px" : "30px"}` }}
                >
                  {/* Row Label */}
                  <span className="text-left pl-1 text-xs font-black text-slate-300">
                    Câu {index + 1}
                  </span>

                  {isEssay ? (
                    <div className="flex items-center justify-center px-1" style={{ gridColumn: `span ${answerKeys.length}` }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEssayQuestionId(question.id);
                          setAnswerPanelTab("essay");
                          setMobileTab("essay");
                          const el = document.getElementById(`essay-card-${question.id}`);
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="w-full flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition active:scale-95"
                        title={`${reviewMode ? "Xem lại" : "Xem và nộp"} bài tự luận câu ${question.displayNumber}`}
                      >
                        <span className="flex items-center gap-1">
                          <span>✍️ Tự luận</span>
                          <span className="font-mono text-[10px] text-amber-400/90">({question.points || 2}đ)</span>
                        </span>
                        <span className="text-[10px] font-bold text-amber-400 underline">{questionAttachments.length} file</span>
                      </button>
                    </div>
                  ) : (
                    answerKeys.map((key) => {
                      const optionExists = (question.options || []).some((option) => option.key === key);
                      const isChosen = Boolean(selectedKeys.includes(key));
                      const correctAnswer = review?.correctAnswer;
                      const isCorrectOption =
                        answerReviewAvailable && Boolean(review) &&
                        (Array.isArray(correctAnswer)
                          ? correctAnswer.includes(key)
                          : correctAnswer === key);
                      const isWrongChosen = answerReviewAvailable && Boolean(review) && isChosen && !isCorrectOption;

                      return (
                        <div key={key} className="flex justify-center">
                          {optionExists ? (
                            <button
                              type="button"
                              onClick={() => handleSelect(question, key)}
                              disabled={Boolean(result) || reviewMode}
                              title={reviewMode && isChosen ? `Bạn đã chọn ${key}` : `Chọn đáp án ${key}`}
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition-all ${
                                reviewMode && answerReviewAvailable && review
                                  ? isCorrectOption
                                    ? "bg-emerald-600 text-white ring-2 ring-emerald-400/50"
                                    : isWrongChosen
                                      ? "bg-rose-600 text-white ring-2 ring-rose-400/40"
                                      : "border border-slate-700 bg-slate-900/60 text-slate-500"
                                  : isChosen
                                    ? reviewMode
                                      ? "bg-blue-600 text-white ring-2 ring-blue-400/40"
                                      : "bg-red-600 text-white shadow-md shadow-red-900/50 scale-105"
                                    : "border border-slate-700/80 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:bg-slate-800/80 hover:text-slate-200"
                              } disabled:cursor-default`}
                            >
                              {isChosen || reviewMode ? <span>{key}</span> : <span className="opacity-0 hover:opacity-100 text-[10px]">{key}</span>}
                            </button>
                          ) : <span className="text-slate-800">—</span>}
                        </div>
                      );
                    })
                  )}

                  <div className="flex justify-center px-0.5">
                    {reviewMode ? (
                      <span className={`w-full rounded-md px-1 py-1 text-[9px] font-black ${rowStatusClass}`}>{rowStatus}</span>
                    ) : (
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800/90 bg-[#091120] p-3">
        {renderSubmitActions()}
      </div>
    </div>
  );

  const renderEssayPanel = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Essay Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-slate-800/90 px-3.5 py-3 bg-[#091120]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 text-sm">
            ✍️
          </span>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">PHẦN BÀI LÀM TỰ LUẬN</h3>
            <p className="text-[10px] text-slate-400">
              {reviewMode ? "Xem lại file, ghi chú đã nộp và kết quả chấm" : "Tải ảnh, gửi file PDF hoặc dán ảnh (Ctrl+V)"}
            </p>
          </div>
        </div>
        <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-mono font-bold text-amber-300">
          {essayConfig?.maxScore ? `${essayConfig.maxScore} đ` : "Chấm điểm"}
        </span>
      </div>

      {/* Essay Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5 space-y-3.5 scrollbar-thin">
        {/* Review feedback if graded */}
        {reviewMode && result && (
          <div
            className={`rounded-2xl border p-3.5 text-xs ${
              result.essayGrade
                ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                : "border-sky-500/40 bg-sky-950/30 text-sky-200"
            }`}
          >
            {result.essayGrade ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-black text-emerald-300 flex items-center gap-1.5">
                    <FiCheckCircle className="h-4 w-4 text-emerald-400" /> KẾT QUẢ CHẤM TỰ LUẬN
                  </span>
                  <span className="rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-black text-white font-mono">
                    {result.essayGrade.score} / {essayConfig?.maxScore || 10} đ
                  </span>
                </div>
                {result.essayGrade.feedback ? (
                  <div className="mt-2 rounded-xl bg-black/30 p-2.5 text-[11px] text-slate-200">
                    <b className="text-emerald-300">Nhận xét của giáo viên: </b>
                    {result.essayGrade.feedback}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-300 italic">Không có nhận xét thêm từ giáo viên.</p>
                )}
                {result.essayGrade.gradedAt && (
                  <div className="mt-1 text-[10px] text-emerald-400/80 text-right">
                    Đã chấm: {new Date(result.essayGrade.gradedAt).toLocaleString("vi-VN")}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <span className="text-lg">⏳</span>
                <div>
                  <b className="font-black text-sky-300 block">Đang chờ giáo viên chấm tự luận</b>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Phần trắc nghiệm bạn đạt <b className="text-white">{result.mcScore ?? result.score} điểm</b>. Điểm tự luận sẽ được cập nhật sau khi giáo viên hoàn tất việc chấm bài.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prompt */}
        {essayConfig?.prompt && (
          <div className="rounded-xl border border-slate-800 bg-[#091120] p-3 text-xs text-slate-300">
            <span className="text-[10px] font-black uppercase text-amber-400 block mb-1">
              📌 Yêu cầu phần tự luận:
            </span>
            <p className="whitespace-pre-wrap leading-relaxed text-slate-200 text-[11px]">{essayConfig.prompt}</p>
          </div>
        )}

        {/* Essay Questions List */}
        {essayQuestions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="block text-[11px] font-black uppercase text-amber-400 tracking-wider">
                BÀI NỘP THEO TỪNG CÂU ({essayQuestions.length} CÂU)
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                Đã nộp: {essayAttachments.length} file
              </span>
            </div>

            {essayQuestions.map((question) => {
              const questionAttachments = attachmentsForQuestion(essayAttachments, question.id);
              const isSelected = selectedEssayQuestionId === question.id;
              const isDragOver = dragOverQuestionId === question.id;

              return (
                <div
                  key={question.id}
                  id={`essay-card-${question.id}`}
                  data-essay-question-id={question.id}
                  onClick={() => setSelectedEssayQuestionId(question.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverQuestionId(question.id);
                  }}
                  onDragLeave={() => setDragOverQuestionId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverQuestionId(null);
                    if (e.dataTransfer.files) handleAddImages(e.dataTransfer.files, question);
                  }}
                  className={`rounded-2xl border p-3.5 space-y-2.5 transition-all ${
                    isSelected
                      ? "border-amber-500/80 bg-[#0d182b] shadow-lg shadow-amber-950/20"
                      : "border-slate-800 bg-[#091120] hover:border-slate-700"
                  } ${isDragOver ? "ring-2 ring-amber-400 bg-amber-950/20" : ""}`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-300 font-mono text-[11px] font-black">
                        {question.displayNumber}
                      </span>
                      <span className="font-black text-white">Câu {question.displayNumber}</span>
                      <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
                        {question.points || 2}đ
                      </span>
                    </div>
                    <span className="text-[11px] font-bold">
                      {reviewMode ? (
                        result?.essayGrade
                          ? <span className="text-emerald-400">✓ Đã chấm</span>
                          : <span className="text-sky-300">⏳ Chờ chấm</span>
                      ) : questionAttachments.length > 0 ? (
                        <span className="text-emerald-400">✓ {questionAttachments.length} file</span>
                      ) : (
                        <span className="text-slate-500">Chưa nộp file</span>
                      )}
                    </span>
                  </div>

                  {question.question_text && (
                    <p className="line-clamp-2 text-[11px] leading-4 text-slate-400 font-medium">{question.question_text}</p>
                  )}

                  {/* Action Buttons for this question: Up ảnh, Gửi file, Dán ảnh */}
                  {!reviewMode && !result && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <input
                        id={`essay-card-upload-${question.id}`}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        disabled={uploadingEssay}
                        onChange={(e) => {
                          if (e.target.files) handleAddImages(e.target.files, question);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor={`essay-card-upload-${question.id}`}
                        className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-amber-600/90 hover:bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-white transition active:scale-95 shadow-xs"
                      >
                        <FiCamera className="h-3 w-3" />
                        <span>Up ảnh</span>
                      </label>

                      <label
                        htmlFor={`essay-card-upload-${question.id}`}
                        className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition active:scale-95"
                      >
                        <FiFileText className="h-3 w-3 text-sky-400" />
                        <span>Gửi file PDF</span>
                      </label>

                      <button
                        type="button"
                        onClick={async () => {
                          setSelectedEssayQuestionId(question.id);
                          try {
                            const clipboardItems = await navigator.clipboard?.read?.();
                            if (clipboardItems) {
                              const imageFiles = [];
                              for (const item of clipboardItems) {
                                for (const type of item.types) {
                                  if (type.startsWith("image/")) {
                                    const blob = await item.getType(type);
                                    imageFiles.push(new File([blob], `pasted_${Date.now()}.png`, { type }));
                                  }
                                }
                              }
                              if (imageFiles.length > 0) {
                                await handleAddImages(imageFiles, question);
                                return;
                              }
                            }
                          } catch {
                            /* fallback */
                          }
                          toast(`Bấm vào Câu ${question.displayNumber} rồi nhấn phím Ctrl+V để dán ảnh bài làm!`, { icon: "📋" });
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1.5 text-[11px] font-bold text-amber-300 transition"
                        title="Dán ảnh bài làm từ clipboard hoặc nhấn phím Ctrl+V"
                      >
                        <FiClipboard className="h-3 w-3" />
                        <span>Dán ảnh (Ctrl+V)</span>
                      </button>
                    </div>
                  )}

                  {/* Empty state prompt for question */}
                  {!reviewMode && !result && questionAttachments.length === 0 && (
                    <div
                      className={`rounded-xl border border-dashed p-2 text-center transition ${
                        isDragOver ? "border-amber-400 bg-amber-500/15" : "border-slate-800/80 bg-slate-900/40"
                      }`}
                    >
                      <span className="text-[10px] text-slate-400">
                        Kéo thả ảnh/PDF hoặc nhấn <kbd className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[9px] text-amber-300">Ctrl+V</kbd> để dán ảnh vào câu này
                      </span>
                    </div>
                  )}

                  {/* Thumbnails of attachments for this question */}
                  {questionAttachments.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {questionAttachments.map((att, idx) => (
                        <div
                          key={att.id || idx}
                          className="group relative rounded-xl border border-slate-700 bg-slate-900 overflow-hidden shadow-xs aspect-[4/3]"
                        >
                          {att.isPdf || att.name?.toLowerCase().endsWith(".pdf") ? (
                            <div className="h-full w-full flex flex-col items-center justify-center p-2 bg-[#09101d] text-center">
                              <FiFileText className="h-7 w-7 text-rose-400 mb-1" />
                              <span className="text-[10px] font-bold text-slate-200 line-clamp-1 w-full px-1">{att.name}</span>
                              <span className="text-[8px] text-slate-400 uppercase font-mono">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={att.previewUrl || att.url}
                              alt={att.name || `Trang ${idx + 1}`}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                            />
                          )}
                          <span className="absolute bottom-1 left-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[8px] font-mono font-bold text-white">
                            Trang {idx + 1}
                          </span>
                          {/* Actions Overlay */}
                          <div className={`absolute inset-0 flex items-center justify-center gap-1.5 transition backdrop-blur-xs ${
                            reviewMode || result ? "bg-black/25 opacity-100" : "bg-black/70 opacity-0 group-hover:opacity-100"
                          }`}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (att.isPdf || att.name?.toLowerCase().endsWith(".pdf")) {
                                  window.open(att.url, "_blank");
                                } else {
                                  setLightboxImg(att.url);
                                  setLightboxRotation(0);
                                }
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow hover:bg-blue-500"
                              title="Xem phóng to"
                            >
                              <FiZoomIn className="h-3.5 w-3.5" />
                            </button>
                            {!reviewMode && !result && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveImage(att.id);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white shadow hover:bg-rose-500"
                                title="Xóa file này"
                              >
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {reviewMode || result ? (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
                      <b className="mb-1 block text-[9px] uppercase tracking-wide text-slate-500">Ghi chú / bài làm đã nhập</b>
                      {essayNotesByQuestion[String(question.id)]?.trim() || "Không có ghi chú văn bản cho câu này."}
                    </div>
                  ) : (
                    <textarea
                      value={essayNotesByQuestion[String(question.id)] || ""}
                      onChange={(event) => setEssayNotesByQuestion((current) => ({ ...current, [String(question.id)]: event.target.value }))}
                      onFocus={() => setSelectedEssayQuestionId(question.id)}
                      placeholder={`Ghi chú, đáp số hoặc lời giải tóm tắt cho câu ${question.displayNumber}...`}
                      rows={2}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/90 p-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-500 transition"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unassignedEssayAttachments.length > 0 && (
          <div className="rounded-2xl border border-sky-800/60 bg-sky-950/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wide text-sky-300">File bài làm chung</span>
              <span className="text-[10px] font-semibold text-slate-400">{unassignedEssayAttachments.length} file</span>
            </div>
            <div className="space-y-1.5">
              {unassignedEssayAttachments.map((attachment, index) => (
                <a
                  key={attachment.id || attachment.assetId || `${attachment.url || attachment.previewUrl}-${index}`}
                  href={attachment.url || attachment.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-2 text-[11px] font-semibold text-slate-200 hover:border-sky-500 hover:text-white"
                >
                  <span className="min-w-0 truncate"><FiFileText className="mr-1.5 inline h-3.5 w-3.5 text-sky-400" />{attachment.name || `File ${index + 1}`}</span>
                  <FiExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Global Multi-page / General Dropzone */}
        {!reviewMode && !result && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              if (e.dataTransfer.files) handleAddImages(e.dataTransfer.files, null);
            }}
            className={`rounded-2xl border-2 border-dashed p-3 text-center transition ${
              isDraggingOver ? "border-amber-400 bg-amber-500/10" : "border-slate-800 bg-[#070e1b] hover:border-slate-700"
            }`}
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={uploadingEssay}
              onChange={(e) => {
                if (e.target.files) handleAddImages(e.target.files, null);
                e.target.value = "";
              }}
              id="student-general-essay-file-input"
              className="hidden"
            />
            <label htmlFor="student-general-essay-file-input" className="cursor-pointer flex flex-col items-center gap-1.5 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <FiUploadCloud className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white hover:underline">
                  {uploadingEssay ? "Đang tải file bài làm..." : "Tải toàn bộ bài tự luận (nhiều trang gộp)"}
                </span>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Dành cho bài thi làm trên nhiều trang giấy • Hỗ trợ ảnh JPG, PNG hoặc PDF
                </p>
              </div>
            </label>
          </div>
        )}

        {/* General Notes */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
            {reviewMode ? "Ghi chú chung đã gửi:" : "Ghi chú chung cho giáo viên:"}
          </label>
          {reviewMode || result ? (
            <div className="min-h-[52px] whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-xs leading-relaxed text-slate-300">
              {essayNotes.trim() || "Không có ghi chú chung."}
            </div>
          ) : (
            <textarea
              value={essayNotes}
              onChange={(e) => setEssayNotes(e.target.value)}
              placeholder="Lời nhắn hoặc ghi chú thêm cho bài thi tự luận..."
              rows={2}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/90 p-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none transition"
            />
          )}
        </div>
      </div>

      {/* Footer with Submit and Fullscreen */}
      <div className="shrink-0 border-t border-slate-800/90 bg-[#091120] p-3 sm:p-4">
        {renderSubmitActions()}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex h-screen w-screen flex-col overflow-hidden bg-[#060c18] text-slate-100 font-sans"
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
              {activityLabel}
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
                {quizData.activityScope === "homework" ? "Quiz về nhà" : isTimed ? "Quiz tại lớp tính giờ" : "Quiz tại lớp"}
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
              <span className="block text-[9px] font-bold text-slate-400 uppercase">Tiến độ</span>
              <span className="block text-xs font-mono font-black text-white">
                TN: {answeredCount}/{multipleChoiceQuestions.length}
                {hasEssay ? ` • TL: ${essayAttachments.length} file` : ""}
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
                  ? hasEssay
                    ? result.essayGrade
                      ? `Điểm: ${result.score}/${result.maxScore} đ`
                      : `TN: ${result.mcScore ?? result.score} đ`
                    : `Đã nộp bài: ${result.score}/${result.maxScore} đ`
                  : isTimed
                  ? `Còn lại: ${formatTimer(timeLeft)}`
                  : "Không giới hạn thời gian"}
              </span>
              <span className="block text-[10px] text-red-100 font-semibold">
                {result
                  ? hasEssay && !result.essayGrade
                    ? "⏳ Đang chờ chấm tự luận"
                    : `${result.percentage}% chính xác`
                  : isTimed
                  ? `Thời gian: ${quizData.durationMinutes} phút`
                  : "Làm theo nhịp của bạn"}
              </span>
            </div>
          </div>


          {/* Fullscreen Button in Header */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            title="Chế độ toàn màn hình"
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
      <div className="flex lg:hidden shrink-0 border-b border-slate-800 bg-[#0a1222] px-2 py-1.5 gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setMobileTab("paper")}
          className={`flex-1 min-w-[90px] rounded-lg py-1.5 text-xs font-black transition ${
            mobileTab === "paper" ? "bg-rose-600 text-white" : "bg-slate-800/60 text-slate-400"
          }`}
        >
          📄 {reviewMode ? "Xem lại bài" : "Đề thi"}
        </button>

        {hasBoth ? (
          <>
            <button
              type="button"
              onClick={() => setMobileTab("mc")}
              className={`flex-1 min-w-[110px] rounded-lg py-1.5 text-xs font-black transition ${
                mobileTab === "mc" ? "bg-red-600 text-white" : "bg-slate-800/60 text-slate-400"
              }`}
            >
              🔘 Trắc nghiệm ({answeredCount}/{multipleChoiceQuestions.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("essay")}
              className={`flex-1 min-w-[110px] rounded-lg py-1.5 text-xs font-black transition ${
                mobileTab === "essay" ? "bg-amber-600 text-white" : "bg-slate-800/60 text-slate-400"
              }`}
            >
              ✍️ Tự luận ({essayAttachments.length} file)
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMobileTab("sheet")}
            className={`flex-1 min-w-[110px] rounded-lg py-1.5 text-xs font-black transition ${
              mobileTab === "sheet" ? "bg-rose-600 text-white" : "bg-slate-800/60 text-slate-400"
            }`}
          >
            📋 Làm bài {hasEssay ? `(TL: ${essayAttachments.length} file)` : `(TN: ${answeredCount}/${multipleChoiceQuestions.length})`}
          </button>
        )}
      </div>

      {/* MAIN SPLIT VIEW */}
      <main className="flex flex-1 min-h-0 overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3">
        {/* LEFT COLUMN: PDF VIEWER / QUESTION CARDS */}
        <section
          className={`min-w-0 flex flex-col rounded-2xl border border-slate-800/80 bg-[#0a1222] overflow-hidden shadow-2xl flex-1 lg:flex-[7] ${
            mobileTab === "paper" ? "flex" : "hidden lg:flex"
          }`}
        >
          {/* Top Viewer Subheader (Tabs for Review Mode & Solution File) */}
          {reviewMode && (
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#0d1629] px-2.5 sm:px-4 py-2.5 gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="hidden sm:inline text-[11px] font-black uppercase text-slate-400 mr-1 whitespace-nowrap">Chế độ xem:</span>
                {hasSplitReview && (
                  <button
                    type="button"
                    onClick={() => setActiveViewerTab("split")}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                      activeViewerTab === "split"
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-slate-800/70 text-violet-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-[11px]">◫</span> Chia đôi
                  </button>
                )}
                {quizData.paperUrl && (
                  <button
                    type="button"
                    onClick={() => setActiveViewerTab("paper")}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                      activeViewerTab === "paper"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <FiFileText className="h-3.5 w-3.5" /> Đề bài (PDF)
                  </button>
                )}

                {canViewSolution ? (
                  <button
                    type="button"
                    onClick={() => setActiveViewerTab("solution")}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                      activeViewerTab === "solution"
                        ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-400/30"
                        : "bg-slate-800/70 text-amber-300 hover:bg-slate-800"
                    }`}
                  >
                    <FiBookOpen className="h-3.5 w-3.5" /> Lời giải
                  </button>
                ) : quizData.solutionUrl && !answerReviewAvailable ? (
                  <span className="shrink-0 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">🔒 Lời giải chưa mở</span>
                ) : !quizData.solutionUrl ? (
                  <span className="hidden xl:inline shrink-0 text-[10px] font-semibold text-slate-500 italic px-2">Không có file lời giải riêng</span>
                ) : null}

                {!answerReviewAvailable && (
                  <span className="sm:hidden shrink-0 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">Đáp án chưa công bố</span>
                )}

                <button
                  type="button"
                  onClick={() => setActiveViewerTab("questions")}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-black transition ${
                    activeViewerTab === "questions"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <FiEye className="h-3.5 w-3.5" /> Chi tiết từng câu
                </button>
              </div>

              {currentViewUrl && !["questions", "split"].includes(activeViewerTab) && (
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
            {activeViewerTab === "split" && hasSplitReview ? (
              <div className="grid h-full grid-cols-1 overflow-y-auto bg-slate-950 lg:grid-cols-2 lg:overflow-hidden">
                <div className="flex min-h-[68vh] flex-col border-b border-slate-700 lg:min-h-0 lg:border-b-0 lg:border-r">
                  <div className="flex h-9 shrink-0 items-center justify-between bg-[#111b2e] px-3 text-[11px] font-black text-slate-200">
                    <span><FiFileText className="mr-1.5 inline h-3.5 w-3.5 text-rose-400" />Đề bài</span>
                    <a href={quizData.paperUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white" title="Mở đề trong tab mới"><FiExternalLink /></a>
                  </div>
                  <iframe
                    src={`${quizData.paperUrl}#toolbar=0&navpanes=0&view=FitH`}
                    title={`Đề bài ${quizData.title}`}
                    className="min-h-0 flex-1 border-0 bg-white"
                  />
                </div>
                <div className="flex min-h-[68vh] flex-col lg:min-h-0">
                  <div className="flex h-9 shrink-0 items-center justify-between bg-amber-950/40 px-3 text-[11px] font-black text-amber-200">
                    <span><FiBookOpen className="mr-1.5 inline h-3.5 w-3.5" />File lời giải</span>
                    <a href={quizData.solutionUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-200" title="Mở lời giải trong tab mới"><FiExternalLink /></a>
                  </div>
                  <iframe
                    src={`${quizData.solutionUrl}#toolbar=0&navpanes=0&view=FitH`}
                    title={`Lời giải ${quizData.title}`}
                    className="min-h-0 flex-1 border-0 bg-white"
                  />
                </div>
              </div>
            ) : activeViewerTab === "questions" ? (
              /* Inline Question-by-Question breakdown */
              <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#0a1222]">
                <div className={`rounded-2xl border p-4 text-xs ${answerReviewAvailable ? "border-slate-800 bg-[#0e182b]" : "border-amber-800/60 bg-amber-950/20"}`}>
                  <h3 className="font-black text-white text-sm mb-1">Chi tiết câu hỏi & Đáp án đối chiếu</h3>
                  <p className={answerReviewAvailable ? "text-slate-400" : "text-amber-200"}>
                    {answerReviewAvailable
                      ? "Màu xanh lá là đáp án đúng; màu đỏ là đáp án bạn chọn sai. Phần tự luận hiển thị đúng file và ghi chú đã nộp."
                      : `🔒 ${reviewPolicyMessage}`}
                  </p>
                </div>

                {questions.map((question, index) => {
                  const review = reviewByQuestion.get(String(question.id));
                  const selected = answers[question.id];
                  const selectedKeys = Array.isArray(selected) ? selected : [selected];
                  const isUserCorrect = review?.isCorrect;
                  const isEssay = isEssayQuestion(question);
                  const questionAttachments = attachmentsForQuestion(essayAttachments, question.id);
                  const questionNote = essayNotesByQuestion[String(question.id)]?.trim();
                  const reviewStudentAnswer = review?.studentAnswer ?? selected;
                  const isUnanswered = Array.isArray(reviewStudentAnswer) ? reviewStudentAnswer.length === 0 : !reviewStudentAnswer;
                  const resultLabel = isEssay
                    ? result?.essayGrade ? "Đã chấm" : "Chờ chấm"
                    : !answerReviewAvailable || !review ? "Chưa công bố" : isUserCorrect ? "Đúng" : isUnanswered ? "Bỏ trống" : "Sai";

                  return (
                    <article
                      key={question.id}
                      id={`quiz-question-card-${index}`}
                      className={`rounded-2xl border bg-[#0e1728] p-4 sm:p-5 ${
                        isEssay ? "border-amber-800/50"
                          : answerReviewAvailable && review
                            ? isUserCorrect ? "border-emerald-800/60" : isUnanswered ? "border-slate-700" : "border-rose-800/60"
                            : "border-slate-800/90"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                            isEssay
                              ? result?.essayGrade ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                              : answerReviewAvailable && review
                                ? isUserCorrect
                                  ? "bg-emerald-600 text-white"
                                  : isUnanswered ? "bg-slate-600 text-white" : "bg-rose-600 text-white"
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
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-mono font-bold text-slate-300">{question.points} đ</span>
                              <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${
                                isEssay
                                  ? result?.essayGrade ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                                  : answerReviewAvailable && review
                                    ? isUserCorrect ? "bg-emerald-500/15 text-emerald-300" : isUnanswered ? "bg-slate-700 text-slate-300" : "bg-rose-500/15 text-rose-300"
                                    : "bg-slate-700 text-slate-300"
                              }`}>{resultLabel}</span>
                            </div>
                          </div>

                          {isEssay ? (
                            <div className="mt-3 space-y-2.5 rounded-xl border border-amber-500/20 bg-amber-950/10 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <span className="font-bold text-amber-300">Bài tự luận đã nộp</span>
                                <span className="text-slate-400">{questionAttachments.length} file</span>
                              </div>
                              {questionAttachments.length > 0 ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {questionAttachments.map((attachment, attachmentIndex) => (
                                    <a
                                      key={attachment.id || attachment.assetId || `${attachment.url || attachment.previewUrl}-${attachmentIndex}`}
                                      href={attachment.url || attachment.previewUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2 text-[11px] font-semibold text-slate-200 hover:border-amber-500"
                                    >
                                      <span className="truncate"><FiFileText className="mr-1.5 inline h-3.5 w-3.5 text-amber-400" />{attachment.name || `File ${attachmentIndex + 1}`}</span>
                                      <FiExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                    </a>
                                  ))}
                                </div>
                              ) : <p className="text-[11px] italic text-slate-500">Không có file riêng cho câu này.</p>}
                              <div className="rounded-lg bg-slate-950/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
                                <b className="mb-1 block text-[9px] uppercase text-slate-500">Ghi chú / nội dung đã nhập</b>
                                {questionNote || "Không có ghi chú văn bản cho câu này."}
                              </div>
                              {result?.essayGrade?.feedback && (
                                <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-2.5 text-[11px] text-emerald-200">
                                  <b>Nhận xét của giáo viên: </b>{result.essayGrade.feedback}
                                </div>
                              )}
                            </div>
                          ) : <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(question.options || []).map((option) => {
                              const active = selectedKeys.includes(option.key);
                              const correctAnswer = review?.correctAnswer;
                              const isCorrectOption =
                                answerReviewAvailable && Boolean(review) &&
                                (Array.isArray(correctAnswer)
                                  ? correctAnswer.includes(option.key)
                                  : correctAnswer === option.key);
                              const isWrongChosen = answerReviewAvailable && Boolean(review) && active && !isCorrectOption;

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
                          </div>}

                          {!isEssay && answerReviewAvailable && review?.explanation && (
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
                  const questionAttachments = attachmentsForQuestion(essayAttachments, question.id);

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

                          {isEssayQuestion(question) ? (
                            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 space-y-2">
                              <div className="flex items-center justify-between font-bold text-amber-300">
                                <span className="flex items-center gap-1.5">
                                  <span>✍️ Câu hỏi tự luận</span>
                                </span>
                                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-mono text-amber-200">
                                  {question.points} điểm
                                </span>
                              </div>
                              <p className="text-slate-300 text-xs leading-relaxed">Làm bài ra giấy rồi tải ảnh đúng cho câu này.</p>
                              {!reviewMode && !result && (
                                <>
                                  <input
                                    id={`essay-upload-${question.id}`}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    disabled={uploadingEssay}
                                    onChange={(event) => {
                                      if (event.target.files) handleAddImages(event.target.files, question);
                                      event.target.value = "";
                                    }}
                                    className="hidden"
                                  />
                                  <label htmlFor={`essay-upload-${question.id}`} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-500">
                                    <FiCamera className="h-3.5 w-3.5" /> Tải ảnh câu {question.displayNumber} ({questionAttachments.length})
                                  </label>
                                  <textarea
                                    value={essayNotesByQuestion[String(question.id)] || ""}
                                    onChange={(event) => setEssayNotesByQuestion((current) => ({ ...current, [String(question.id)]: event.target.value }))}
                                    placeholder={`Ghi chú hoặc lời giải vắn tắt cho câu ${question.displayNumber}...`}
                                    rows={2}
                                    className="w-full rounded-lg border border-amber-500/20 bg-slate-950/60 p-2 text-xs text-white outline-none focus:border-amber-400"
                                  />
                                </>
                              )}
                              {(reviewMode || result) && <span className="font-bold text-amber-300">Đã nộp {questionAttachments.length} ảnh cho câu này.</span>}
                            </div>
                          ) : (
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
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: SINGLE TABBED ANSWER PANEL (SWITCH BETWEEN MC & ESSAY) */}
        <section
          className={`w-full lg:w-[380px] xl:w-[430px] 2xl:w-[460px] shrink-0 flex flex-col rounded-2xl border border-slate-800/80 bg-[#0b1323] overflow-hidden shadow-2xl ${
            hasBoth
              ? (mobileTab === "mc" || mobileTab === "essay" ? "flex" : "hidden lg:flex")
              : (mobileTab === "paper" ? "hidden lg:flex" : "flex")
          }`}
        >
          {hasBoth && (
            <div className="flex shrink-0 border-b border-slate-800 bg-[#080e1b] p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAnswerPanelTab("mc");
                  setMobileTab("mc");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-black transition ${
                  answerPanelTab === "mc"
                    ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-rose-950/40"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🔘 Trắc nghiệm</span>
                <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-mono">
                  {answeredCount}/{multipleChoiceQuestions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAnswerPanelTab("essay");
                  setMobileTab("essay");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-black transition ${
                  answerPanelTab === "essay"
                    ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-orange-950/40"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>✍️ Tự luận</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
                    essayAttachments.length > 0 ? "bg-amber-400/20 text-amber-300 font-bold" : "bg-black/30"
                  }`}
                >
                  {essayAttachments.length} file
                </span>
              </button>
            </div>
          )}

          {(!hasEssay || (hasBoth && answerPanelTab === "mc")) ? (
            renderOmrPanel()
          ) : (
            renderEssayPanel()
          )}
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
                Sau khi nộp, hệ thống sẽ ghi nhận và khóa bài thi.
                {quizData.reviewPolicy === "after_submit"
                  ? " Bạn có thể đối chiếu đáp án ngay sau đó."
                  : quizData.reviewPolicy === "after_close"
                    ? " Đáp án được mở sau khi quiz đóng."
                    : " Giáo viên không công bố đáp án cho quiz này."}
              </p>
            </div>

            <div className="mt-5 space-y-2 rounded-2xl border border-slate-800 bg-[#09101d] p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Trắc nghiệm đã làm:</span>
                <b className="font-mono font-black text-emerald-400">
                  {answeredCount}/{multipleChoiceQuestions.length} câu
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Trắc nghiệm chưa làm:</span>
                <b className={`font-mono font-black ${unansweredCount > 0 ? "text-rose-400" : "text-slate-400"}`}>
                  {unansweredCount} câu
                </b>
              </div>
              {hasEssay && (
                <div className="flex justify-between border-t border-slate-800/80 pt-1.5 mt-1.5">
                  <span className="text-slate-400">File bài làm tự luận:</span>
                  <b className={`font-mono font-black ${essayAttachments.length > 0 ? "text-amber-400" : "text-rose-400"}`}>
                    {essayAttachments.length} file
                  </b>
                </div>
              )}
              {flaggedQuestions.size > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Đã đánh dấu:</span>
                  <b className="font-mono font-black text-amber-400">{flaggedQuestions.size} câu</b>
                </div>
              )}
            </div>

            {unansweredCount > 0 && (
              <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-2.5 text-[11px] font-semibold text-amber-300">
                ⚠ Bạn vẫn còn {unansweredCount} câu trắc nghiệm chưa chọn đáp án.
              </div>
            )}

            {hasEssay && essayAttachments.length === 0 && (
              <div className="mt-2.5 rounded-xl border border-rose-900/60 bg-rose-950/30 p-2.5 text-[11px] font-semibold text-rose-300">
                ⚠ Quiz có phần tự luận nhưng bạn chưa đính kèm file bài làm nào. Hãy kiểm tra kỹ trước khi nộp.
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

      {/* FULLSCREEN LIGHTBOX MODAL FOR ESSAY PHOTOS */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">Xem ảnh bài làm tự luận</span>
              <span className="text-xs text-slate-400">({lightboxRotation}° xoay)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLightboxRotation((r) => (r + 90) % 360)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                <FiRotateCcw className="h-3.5 w-3.5" /> Xoay 90°
              </button>
              <a
                href={lightboxImg}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                <FiExternalLink className="h-3.5 w-3.5" /> Mở tab mới
              </a>
              <button
                type="button"
                onClick={() => {
                  setLightboxImg(null);
                  setLightboxRotation(0);
                }}
                className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <img
              src={lightboxImg}
              alt="Ảnh tự luận phóng to"
              style={{ transform: `rotate(${lightboxRotation}deg)` }}
              className="max-h-full max-w-full object-contain transition-transform duration-200 shadow-2xl rounded-lg"
            />
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
