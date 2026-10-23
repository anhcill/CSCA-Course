import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useSearchParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import PropTypes from "prop-types";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Mic,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { fetchSubmissions, gradeSubmission } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import GradingWorkflowPanel from "../components/GradingWorkflowPanel";
import SubmissionAnnotations from "../components/SubmissionAnnotations";
import usePersistentClassSelection from "../../teacher/hooks/usePersistentClassSelection";

/* ── Mẫu nhận xét nhanh phong cách Á Đông & Chuyên nghiệp ───────── */
const QUICK_FEEDBACK = [
  {
    label: "🌟 Xuất sắc",
    text: "Bài làm rất xuất sắc! Em nắm vững ngữ pháp, từ vựng phong phú và diễn đạt tự nhiên.",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  },
  {
    label: "🗣️ Khẩu ngữ HSKK",
    text: "Phần phát âm thanh điệu (đặc biệt thanh 4) cần dứt khoát hơn. Ngắt nhịp câu khá trôi chảy.",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
  },
  {
    label: "✍️ Ngữ pháp 把/被",
    text: "Cần chú ý bổ ngữ kết quả sau động từ chính trong câu chữ 把 và câu bị động 被.",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
  },
  {
    label: "👍 Khá tốt",
    text: "Bài làm tương đối tốt, còn một vài lỗi dùng liên từ chưa thật tự nhiên. Cố gắng phát huy!",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100",
  },
  {
    label: "⚠️ Cần xem lại",
    text: "Bài làm còn nhiều lỗi chính tả chữ Hán và sai cấu trúc câu. Em hãy xem lại bài giảng và nộp bổ sung nhé.",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  },
  {
    label: "⏳ Nhắc nộp đúng hạn",
    text: "Lần sau em chú ý theo dõi deadline để nộp bài đúng hạn quy định của lớp nhé.",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
  },
];

function countChineseChars(text) {
  return (text?.match(/[\u4e00-\u9fff]/g) || []).length;
}

function getSubmissionFileKind(file) {
  const fileName = String(file?.fileName || file?.name || "").toLowerCase();
  const fileUrl = String(file?.fileUrl || file?.url || "").split(/[?#]/)[0].toLowerCase();
  const mimeType = String(file?.mimeType || file?.contentType || "").toLowerCase();

  if (mimeType.startsWith("image/") || [fileName, fileUrl].some((value) => /\.(?:jpe?g|png|webp|gif|bmp|svg)$/.test(value))) return "image";
  if (mimeType === "application/pdf" || [fileName, fileUrl].some((value) => /\.pdf$/.test(value))) return "pdf";
  if ([fileName, fileUrl].some((value) => /\.(?:doc|docx|odt|rtf)$/.test(value)) || mimeType.includes("word") || mimeType.includes("opendocument.text")) return "document";
  return "file";
}

function getFileLabel(file, index) {
  return file?.fileName || file?.name || `Tệp ${index + 1}`;
}

function SubmissionFilePreview({ file, studentName, fileIndex }) {
  const fileUrl = file?.fileUrl || file?.url || "";
  const fileName = getFileLabel(file, fileIndex);
  const fileKind = getSubmissionFileKind(file);
  const canPreview = fileKind === "image" || fileKind === "pdf";
  const [previewStatus, setPreviewStatus] = useState(canPreview ? "loading" : "ready");

  if (!fileUrl) {
    return (
      <div role="alert" className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-rose-300 bg-rose-50/60 px-6 text-center dark:border-rose-900 dark:bg-rose-950/20">
        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Không tìm thấy đường dẫn của tệp này.</p>
        <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400">Hãy thử tải lại danh sách bài nộp.</p>
      </div>
    );
  }

  if (!canPreview) {
    const isDocument = fileKind === "document";
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/60 backdrop-blur-md">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 shadow-2xs dark:bg-sky-950/60 dark:text-sky-300">
          <FileText className="h-6 w-6" />
        </span>
        <p className="mt-4 max-w-md break-all text-sm font-bold text-[#102f63] dark:text-white">{fileName}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
          {isDocument
            ? "Tệp Word không thể xem trực tiếp ổn định trong trình duyệt. Mở ở tab mới hoặc tải xuống để chấm đầy đủ định dạng."
            : "Định dạng này chưa hỗ trợ xem trực tiếp. Bạn vẫn có thể mở hoặc tải tệp gốc."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#102f63] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-900/10 transition hover:bg-blue-800"
          >
            <ExternalLink className="h-4 w-4" /> Mở tệp
          </a>
          <a
            href={fileUrl}
            download={fileName}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-4 w-4" /> Tải xuống
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-64 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/80 shadow-inner dark:border-slate-800 dark:bg-slate-950/80">
      {previewStatus === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 dark:bg-slate-950/90" role="status" aria-live="polite">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span className="ml-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Đang tải bản xem trước...</span>
        </div>
      )}
      {previewStatus === "error" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950" role="alert">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Không thể hiển thị bản xem trước.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tệp có thể bị giới hạn truy cập hoặc trình duyệt không hỗ trợ định dạng này.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#102f63] px-3.5 py-2 text-xs font-bold text-white"><ExternalLink className="h-4 w-4" /> Mở tệp</a>
            <a href={fileUrl} download={fileName} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"><Download className="h-4 w-4" /> Tải xuống</a>
          </div>
        </div>
      )}
      {fileKind === "image" ? (
        <img
          src={fileUrl}
          alt={`Bài làm của ${studentName} - ${fileName}`}
          className="max-h-[70vh] min-h-64 w-full object-contain p-2"
          onLoad={() => setPreviewStatus("ready")}
          onError={() => setPreviewStatus("error")}
        />
      ) : (
        <iframe
          src={fileUrl}
          title={`Bản xem trước ${fileName} của ${studentName}`}
          className="h-[68vh] min-h-[32rem] w-full bg-white"
          onLoad={() => setPreviewStatus("ready")}
          onError={() => setPreviewStatus("error")}
        />
      )}
    </div>
  );
}

SubmissionFilePreview.propTypes = {
  file: PropTypes.shape({
    fileName: PropTypes.string,
    name: PropTypes.string,
    fileUrl: PropTypes.string,
    url: PropTypes.string,
    mimeType: PropTypes.string,
    contentType: PropTypes.string,
  }).isRequired,
  studentName: PropTypes.string,
  fileIndex: PropTypes.number.isRequired,
};

SubmissionFilePreview.defaultProps = {
  studentName: "học viên",
};

function normalizeAssignmentType(type) {
  return type === "writing" ? "essay" : type;
}

function getTypeBadge(type) {
  const normalizedType = normalizeAssignmentType(type || "");
  if (normalizedType.includes("hskk") || normalizedType.includes("speak")) {
    return { label: "HSKK Khẩu Ngữ", cls: "bg-violet-50 text-violet-700 border-violet-200" };
  }
  if (normalizedType.includes("quiz")) {
    return { label: "Trắc Nghiệm", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  if (normalizedType === "essay") {
    return { label: "Bài tự luận", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  if (normalizedType === "homework") {
    return { label: "Bài tập về nhà", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: "Bài tập", cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

export default function TeacherGradingPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedAssignmentId = searchParams.get("assignmentId") || "all";
  const requestedClassId = searchParams.get("classId") || "";
  const requestedSessionId = searchParams.get("sessionId") || "";
  const requestedSubmissionId = searchParams.get("submissionId") || "";
  const isAdminView = location.pathname.startsWith("/admin/");
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState(null);

  // Grading form state
  const [score, setScore] = useState(8.5);
  const [feedback, setFeedback] = useState("");
  const [rubricScores, setRubricScores] = useState([]);
  const [grading, setGrading] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [changeReason, setChangeReason] = useState("");

  // Filters & Sorting
  const [filterStatus, setFilterStatus] = useState("pending"); // all | pending | graded
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByDeadline, setSortByDeadline] = useState("asc"); // asc | desc

  // Audio player playback rate (0.75, 1, 1.25, 1.5)
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeFileIndex, setActiveGradingFileIndex] = useState(0);

  const submissionClassIds = useMemo(
    () => [...new Set(submissions.filter((submission) => submission.classId).map((submission) => submission.classId))],
    [submissions],
  );
  const [filterClass, setFilterClass] = usePersistentClassSelection({
    scope: "grading",
    availableClassIds: submissionClassIds,
    allValue: "all",
    ready: !loading,
    preferredValue: requestedClassId || null,
  });

  const subFiles = useMemo(() => {
    if (!selectedSub) return [];
    if (Array.isArray(selectedSub.fileAssets) && selectedSub.fileAssets.length > 0) {
      return selectedSub.fileAssets;
    }
    if (selectedSub.fileUrl) {
      return [{
        id: "default",
        fileName: selectedSub.fileName || "Tệp bài làm",
        fileUrl: selectedSub.fileUrl,
      }];
    }
    return [];
  }, [selectedSub]);

  const currentFile = subFiles[activeFileIndex] || subFiles[0] || null;

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSubmissions(requestedAssignmentId, {
        classId: requestedClassId || undefined,
        sessionId: requestedSessionId || undefined,
      });
      const rows = res.success && Array.isArray(res.data) ? res.data : [];
      const initialSubmission = requestedSubmissionId
        ? rows.find((row) => String(row.id) === String(requestedSubmissionId)) || rows[0]
        : rows[0];
      setSubmissions(rows);
      setSelectedSub(initialSubmission || null);
      setScore(initialSubmission?.score ?? 0);
      setFeedback(initialSubmission?.feedbackText || "");
      setAnnotations(initialSubmission?.annotations || []);
      setChangeReason("");
      setRubricScores(initialSubmission?.rubric?.map((criterion) => {
        const saved = (initialSubmission?.rubricScores || []).find((item) => item.criterionId === criterion.id);
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
  }, [requestedAssignmentId, requestedClassId, requestedSessionId, requestedSubmissionId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Handle selecting a submission from queue
  const handleSelectSub = useCallback((sub) => {
    setSelectedSub(sub);
    setActiveGradingFileIndex(0);
    setAnnotations(sub.annotations || []);
    setChangeReason("");
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

    if (filterStatus === "pending") list = list.filter((s) => !s.returnRequested && ["submitted", "late"].includes(s.status));
    if (filterStatus === "graded") list = list.filter((s) => s.status === "graded");

    if (filterClass !== "all") {
      list = list.filter((s) => String(s.classId) === String(filterClass));
    }

    if (filterType !== "all") {
      list = list.filter((s) => normalizeAssignmentType(s.assignmentType) === filterType);
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
      if (!selectedSub || grading || selectedSub.returnRequested) return;

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
          revision: selectedSub.revision,
          annotations,
          changeReason,
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
                ? { ...s, status: "graded", score: numScore, feedbackText: feedback, rubricScores, annotations, gradedAt: res.data?.graded_at || new Date().toISOString() }
                : s
            )
          );
          setSelectedSub((prev) => ({
            ...prev,
            status: "graded",
            score: numScore,
            feedbackText: feedback,
            rubricScores,
            annotations,
            gradedAt: res.data?.graded_at || new Date().toISOString(),
          }));

          // Automatically advance to the next pending submission if requested
          if (advanceToNext) {
            const currentIndex = filteredSubs.findIndex((s) => s.id === selectedSub.id);
            const nextSub = filteredSubs.find(
              (s, i) => i > currentIndex && !s.returnRequested && ["submitted", "late"].includes(s.status)
            );
            if (nextSub) {
              handleSelectSub(nextSub);
              toast("Đã chuyển sang bài nộp tiếp theo ➡️", { icon: "⏩" });
            }
          }
        }
      } catch (err) {
        console.error("Error grading:", err);
        toast.error(err.message || "Có lỗi xảy ra khi chấm điểm!");
      } finally {
        setGrading(false);
      }
    },
    [selectedSub, score, feedback, rubricScores, annotations, changeReason, grading, filteredSubs, handleSelectSub]
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
      pending: submissions.filter((s) => !s.returnRequested && ["submitted", "late"].includes(s.status)).length,
      graded: submissions.filter((s) => s.status === "graded").length,
      avgScore: (() => {
        const scored = submissions.filter((s) => s.score !== null && s.score !== undefined);
        return scored.length > 0
          ? (scored.reduce((a, s) => a + Number(s.score), 0) / scored.length).toFixed(1)
          : "—";
      })(),
    }),
    [submissions]
  );

  return (
    <div className="min-h-full p-2.5 sm:p-4 lg:p-6 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto max-w-[1440px] space-y-4 sm:space-y-5">
        
        {/* ================= 1. CALLIGRAPHIC HEADER HERO TRỰC TIẾP TRÊN NỀN PHONG CẢNH Á ĐÔNG ================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1 pb-1">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/85 px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs backdrop-blur-md">
              <Award className="h-3.5 w-3.5 text-blue-600" />
              <span>Cổng chấm bài & Thẩm định chuyên môn</span>
            </div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
              Không Gian Chấm Bài & Đánh Giá
            </h1>
            <p className="text-xs font-semibold italic text-slate-800 sm:text-sm">
              “Đánh giá công tâm, dẫn lối tri thức, tiếp sức tương lai.”
            </p>
            <p className="font-['Ma_Shan_Zheng',cursive] text-sm sm:text-base tracking-wider text-slate-700">
              —— 师者所以传道受业解惑也 · 严谨笃学。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={isAdminView ? "/admin/dashboard" : "/lms/teach"}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-3.5 py-2 text-xs font-bold text-[#102f63] shadow-sm backdrop-blur transition hover:bg-white hover:text-blue-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Tổng quan
            </Link>
            <Link
              to={isAdminView ? "/admin/student-progress" : "/lms/teach/student-progress"}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-3.5 py-2 text-xs font-bold text-[#102f63] shadow-sm backdrop-blur transition hover:bg-white hover:text-blue-700"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Sổ điểm lớp
            </Link>
          </div>
        </div>

        {/* ================= 2. BỐN THẺ KPI THỐNG KÊ KÍNH MỜ Á ĐÔNG ================= */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* KPI 1: Cần chấm */}
          <div className="rounded-3xl border border-amber-200/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-amber-900/40 dark:bg-slate-900/85">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Cần chấm
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black text-[#102f63] dark:text-white font-mono">
              {stats.pending}
            </p>
            <p className="text-[11px] text-amber-600/90 font-semibold mt-0.5">
              Bài nộp mới chờ thẩm định
            </p>
          </div>

          {/* KPI 2: Đã chấm */}
          <div className="rounded-3xl border border-emerald-200/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-emerald-900/40 dark:bg-slate-900/85">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Đã chấm
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black text-[#102f63] dark:text-white font-mono">
              {stats.graded}
            </p>
            <p className="text-[11px] text-emerald-600/90 font-semibold mt-0.5">
              Đã công bố điểm cho học viên
            </p>
          </div>

          {/* KPI 3: Điểm trung bình */}
          <div className="rounded-3xl border border-sky-200/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-sky-900/40 dark:bg-slate-900/85">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                Điểm TB
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                <Award className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black text-[#102f63] dark:text-white font-mono">
              {stats.avgScore} <span className="text-xs font-semibold text-slate-400 font-sans">/ 10</span>
            </p>
            <p className="text-[11px] text-sky-600/90 font-semibold mt-0.5">
              Toàn bộ bài đã đánh giá
            </p>
          </div>

          {/* KPI 4: Tổng bài nộp */}
          <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(20,60,100,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/85">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tổng bài nộp
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <FileCheck className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl sm:text-3xl font-black text-[#102f63] dark:text-white font-mono">
              {stats.total}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Hàng đợi chấm bài tự luận & file
            </p>
          </div>
        </section>

        {/* ================= 3. KHÔNG GIAN LÀM VIỆC CHÍNH (GRID 2 CỘT) ================= */}
        <div className="grid items-start gap-5 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
          
          {/* CỘT TRÁI: DANH SÁCH BÀI NỘP CHỜ CHẤM (FROSTED GLASS ASIDE) */}
          <aside
            aria-label="Danh sách bài nộp"
            className="rounded-3xl border border-white/80 bg-white/92 p-4 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-black text-[#102f63] dark:text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Hàng Đợi Chấm Bài
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {filteredSubs.length} bài khớp bộ lọc
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSortByDeadline((current) => (current === "asc" ? "desc" : "asc"))}
                className="rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs transition hover:bg-white hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                title="Đổi thứ tự theo ngày nộp"
              >
                {sortByDeadline === "asc" ? "Sớm nhất" : "Muộn nhất"}
              </button>
            </div>

            {/* 3 Pills lọc trạng thái */}
            <div className="mt-3 grid grid-cols-3 rounded-2xl bg-slate-100/80 p-1 text-[11px] font-bold dark:bg-slate-800/80">
              {[
                { id: "pending", label: `Cần chấm (${stats.pending})` },
                { id: "graded", label: `Đã chấm (${stats.graded})` },
                { id: "all", label: `Tất cả (${stats.total})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id)}
                  className={`rounded-xl py-1.5 transition text-center ${
                    filterStatus === tab.id
                      ? "bg-white text-blue-700 font-black shadow-xs dark:bg-slate-900 dark:text-sky-300"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Ô tìm kiếm học viên */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Tìm học viên, bài tập..."
                className="w-full rounded-2xl border border-slate-200/90 bg-white/90 pl-9 pr-3 py-2 text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Dropdown bộ lọc lớp & loại bài */}
            <div className="mt-2.5 grid grid-cols-1 gap-2">
              <select
                aria-label="Chọn lớp"
                value={filterClass}
                onChange={(event) => setFilterClass(event.target.value)}
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">Tất cả lớp học</option>
                {[...new Map(submissions.filter((sub) => sub.classId).map((sub) => [sub.classId, sub.classTitle || "Lớp học chưa đặt tên"]))].map(([classId, classTitle]) => (
                  <option key={classId} value={classId}>{classTitle}</option>
                ))}
              </select>

              <select
                aria-label="Loại bài tập"
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none shadow-2xs focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">Mọi loại bài tập</option>
                <option value="essay">Bài tự luận</option>
                <option value="homework">Bài tập về nhà</option>
                <option value="hskk">Khẩu ngữ HSKK</option>
                <option value="quiz">Trắc nghiệm</option>
              </select>
            </div>

            {/* Danh sách thẻ bài nộp có thanh cuộn mượt mà */}
            <div className="mt-3.5 max-h-[calc(100vh-360px)] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <Loading loading={true} text="Đang tải danh sách bài nộp..." fullScreen={false} className="py-10" />
              ) : filteredSubs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  Không tìm thấy bài nộp nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                filteredSubs.map((sub) => {
                  const selected = selectedSub?.id === sub.id;
                  const typeBadge = getTypeBadge(sub.assignmentType);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSelectSub(sub)}
                      className={`w-full rounded-2xl border p-3 text-left transition-all duration-200 ${
                        selected
                          ? "border-blue-400 bg-blue-50/80 shadow-md ring-2 ring-blue-500/20 dark:border-blue-600 dark:bg-blue-950/40"
                          : "border-white/80 bg-white/70 hover:border-blue-200 hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-tr from-sky-100 to-indigo-100 text-slate-600 shadow-2xs dark:from-slate-800 dark:to-slate-700 dark:text-slate-300">
                          {sub.studentAvatar ? (
                            <img src={sub.studentAvatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate text-xs font-black text-[#102f63] dark:text-white">
                              {sub.studentName}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                                sub.status === "graded"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              }`}
                            >
                              {sub.status === "graded" ? `${sub.score}/${sub.maxScore || 10}đ` : "Cần chấm"}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            {sub.assignmentTitle}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                            <span className={`px-1.5 py-0.2 rounded-md border font-semibold ${typeBadge.cls}`}>
                              {typeBadge.label}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {new Date(sub.submittedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* CỘT PHẢI: CHI TIẾT BÀI LÀM & KHU VỰC THẨM ĐỊNH CHẤM ĐIỂM */}
          <section aria-label="Bài làm và biểu mẫu chấm" className="min-w-0 space-y-4">
            {!selectedSub ? (
              <div className="flex min-h-[460px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/80 bg-white/80 p-8 text-center shadow-[0_12px_35px_rgba(49,91,125,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-950/60 dark:text-sky-300">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="mt-4 text-lg font-black text-[#102f63] dark:text-white">
                  Đã Xử Lý Hết Bài Nộp Hoặc Chưa Chọn Bài
                </h2>
                <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Hãy chọn một bài nộp từ danh sách bên trái để tiến hành chấm điểm, nghe bài thu âm HSKK hoặc thêm nhận xét chi tiết.
                </p>
              </div>
            ) : (
              <>
                {/* Thanh thông tin học viên & bài tập hiện tại (Glass Hero Bar) */}
                <div className="rounded-3xl border border-white/80 bg-white/92 p-4 sm:p-5 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 border border-blue-200/60 font-mono">
                          <BookOpen className="h-3 w-3" /> {selectedSub.classTitle || "Lớp CSCA"}
                        </span>
                        {selectedSub.sessionTitle && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {selectedSub.sessionTitle}
                          </span>
                        )}
                        {selectedSub.status === "late" && (
                          <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            Nộp muộn
                          </span>
                        )}
                      </div>

                      <h2 className="truncate text-lg sm:text-xl font-black text-[#102f63] dark:text-white">
                        {selectedSub.assignmentTitle}
                      </h2>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-black text-[#102f63] dark:text-sky-300">{selectedSub.studentName}</span>
                        {selectedSub.studentEmail && (
                          <span className="text-slate-400 font-mono">({selectedSub.studentEmail})</span>
                        )}
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500 font-medium">
                          Nộp lúc: {new Date(selectedSub.submittedAt).toLocaleString("vi-VN")}
                        </span>
                      </div>
                    </div>

                    {selectedSub.status === "graded" && (
                      <div className="shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3.5 text-center text-white shadow-md shadow-emerald-500/20">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">Điểm Đã Công Bố</p>
                        <p className="mt-0.5 text-2xl font-black font-mono">
                          {selectedSub.score} <span className="text-xs font-normal text-emerald-200">/ {selectedSub.maxScore || 10}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Khối chia 2 cột: Bài làm (Trái) & Bảng Nhập Điểm (Phải) */}
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20.5rem]">
                  
                  {/* BÀI LÀM CỦA HỌC VIÊN */}
                  <article className="min-w-0 rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                      <h3 className="text-sm font-black text-[#102f63] dark:text-white flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Nội Dung Bài Làm Của Học Viên
                      </h3>
                      <span className="text-xs text-slate-400 font-medium">
                        {subFiles.length > 0 ? `${subFiles.length} tệp đính kèm` : "Bài nộp trực tuyến"}
                      </span>
                    </div>

                    {/* Nội dung tự luận (Text) */}
                    {selectedSub.contentText && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                            Nội dung tự luận chữ Hán
                          </p>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 font-mono">
                            {countChineseChars(selectedSub.contentText)} chữ Hán
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm leading-7 text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                          {selectedSub.contentText}
                        </div>
                      </div>
                    )}

                    {/* Danh sách tệp đính kèm & Xem trước */}
                    {subFiles.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                              Tệp bài làm đính kèm
                            </p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-700 dark:text-slate-300" title={currentFile ? getFileLabel(currentFile, activeFileIndex) : ""}>
                              {currentFile ? `${activeFileIndex + 1}/${subFiles.length} · ${getFileLabel(currentFile, activeFileIndex)}` : ""}
                            </p>
                          </div>
                          {(currentFile?.fileUrl || currentFile?.url) && (
                            <div className="flex shrink-0 gap-2">
                              <a
                                href={currentFile.fileUrl || currentFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Mở riêng
                              </a>
                              <a
                                href={currentFile.fileUrl || currentFile.url}
                                download={getFileLabel(currentFile, activeFileIndex)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <Download className="h-3.5 w-3.5" /> Tải về
                              </a>
                            </div>
                          )}
                        </div>

                        {/* File switcher pills */}
                        {subFiles.length > 1 && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveGradingFileIndex((index) => Math.max(0, index - 1))}
                              disabled={activeFileIndex === 0}
                              aria-label="Xem tệp trước"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </button>
                            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" role="tablist">
                              {subFiles.map((file, idx) => {
                                const selected = activeFileIndex === idx || (!subFiles[activeFileIndex] && idx === 0);
                                const fileKind = getSubmissionFileKind(file);
                                return (
                                  <button
                                    key={file.id || idx}
                                    type="button"
                                    role="tab"
                                    onClick={() => setActiveGradingFileIndex(idx)}
                                    className={`flex max-w-48 shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                      selected
                                        ? "bg-blue-600 text-white shadow-xs"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                    }`}
                                  >
                                    <span>{fileKind === "image" ? "🖼️" : fileKind === "pdf" ? "PDF" : "📄"}</span>
                                    <span className="truncate">{getFileLabel(file, idx)}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveGradingFileIndex((index) => Math.min(subFiles.length - 1, index + 1))}
                              disabled={activeFileIndex >= subFiles.length - 1}
                              aria-label="Xem tệp tiếp theo"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </div>
                        )}

                        {currentFile && (
                          <SubmissionFilePreview
                            key={`${currentFile.id || currentFile.fileUrl || activeFileIndex}-${activeFileIndex}`}
                            file={currentFile}
                            fileIndex={activeFileIndex}
                            studentName={selectedSub.studentName}
                          />
                        )}
                      </div>
                    )}

                    {/* Audio HSKK */}
                    {selectedSub.audioUrl && (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/30 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-black text-violet-800 dark:text-violet-300">
                            <Mic className="h-4 w-4 text-violet-600" /> Bài thu âm Khẩu ngữ HSKK
                          </span>
                          <div className="flex gap-1 text-xs">
                            {[0.75, 1, 1.25, 1.5].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => {
                                  setPlaybackRate(rate);
                                  const audio = document.getElementById("hskk-audio-player");
                                  if (audio) audio.playbackRate = rate;
                                }}
                                className={`rounded-lg px-2 py-0.5 font-mono text-[11px] font-bold ${
                                  playbackRate === rate
                                    ? "bg-violet-600 text-white"
                                    : "bg-white text-violet-700 hover:bg-violet-100 dark:bg-slate-800 dark:text-violet-300"
                                }`}
                              >
                                {rate}×
                              </button>
                            ))}
                          </div>
                        </div>
                        <audio id="hskk-audio-player" src={selectedSub.audioUrl} controls className="w-full" />
                      </div>
                    )}

                    {/* Chú thích bài làm */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Ghi chú & Chú thích bài làm ({annotations.length})
                        </h4>
                      </div>
                      <SubmissionAnnotations
                        items={annotations}
                        onChange={setAnnotations}
                        fileUrl={currentFile?.fileUrl || currentFile?.url || selectedSub.fileUrl}
                        fileName={currentFile?.fileName || selectedSub.fileName}
                      />
                    </div>
                  </article>

                  {/* BẢNG NHẬP ĐIỂM & NHẬN XÉT (STICKY ASIDE) */}
                  <aside
                    aria-label="Nhập điểm và nhận xét"
                    className="self-start rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl lg:sticky lg:top-5 dark:border-slate-800 dark:bg-slate-900/95 space-y-4"
                  >
                    <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-[#102f63] dark:text-white flex items-center gap-1.5">
                          <Award className="h-4 w-4 text-blue-600" />
                          Ghi Điểm & Nhận Xét
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500 font-bold">
                          Ctrl + Enter
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Nhập điểm số và lời dặn dò của giảng viên
                      </p>
                    </div>

                    {/* Chấm theo rubric hay theo điểm tổng */}
                    {(selectedSub.rubric || []).length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Chấm theo tiêu chí</p>
                          <p className="text-base font-black font-mono text-blue-700 dark:text-sky-300">
                            {rubricScores.reduce((total, item) => total + (Number(item.score) || 0), 0)}/{selectedSub.maxScore}đ
                          </p>
                        </div>
                        {selectedSub.rubric.map((criterion) => {
                          const item = rubricScores.find((entry) => entry.criterionId === criterion.id) || { criterionId: criterion.id, score: 0, feedback: "" };
                          return (
                            <div key={criterion.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/60 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-bold text-slate-800 dark:text-white">{criterion.title}</p>
                                  {criterion.description && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{criterion.description}</p>
                                  )}
                                </div>
                                <label className="flex shrink-0 items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                                  <input
                                    type="number"
                                    min="0"
                                    max={criterion.maxPoints}
                                    step="0.25"
                                    value={item.score}
                                    onChange={(event) =>
                                      setRubricScores((current) =>
                                        current.map((entry) => (entry.criterionId === criterion.id ? { ...entry, score: event.target.value } : entry))
                                      )
                                    }
                                    className="w-14 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-center font-bold text-blue-700 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                                  />
                                  <span>/{criterion.maxPoints}</span>
                                </label>
                              </div>
                              <input
                                value={item.feedback}
                                onChange={(event) =>
                                  setRubricScores((current) =>
                                    current.map((entry) => (entry.criterionId === criterion.id ? { ...entry, feedback: event.target.value } : entry))
                                  )
                                }
                                maxLength={4000}
                                placeholder="Ghi chú tiêu chí này..."
                                className="w-full rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-xs outline-none focus:border-blue-500 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 dark:border-sky-950 dark:bg-sky-950/20">
                        <label htmlFor="score-input" className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Tổng điểm bài thi
                        </label>
                        <div className="mt-1 flex items-baseline gap-2">
                          <input
                            id="score-input"
                            type="number"
                            min="0"
                            max={selectedSub.maxScore || 10}
                            step="0.25"
                            value={score}
                            onChange={(event) => setScore(event.target.value)}
                            className="w-24 border-b-2 border-blue-500 bg-transparent pb-0.5 text-3xl font-black font-mono text-[#102f63] outline-none focus:border-blue-700 dark:text-white"
                          />
                          <span className="text-sm font-bold text-slate-500">
                            / {selectedSub.maxScore || 10} điểm
                          </span>
                        </div>

                        {/* Quick score buttons */}
                        <div className="mt-3 grid grid-cols-6 gap-1">
                          {[0, 5, 7, 8, 9, 10]
                            .filter((value) => value <= (selectedSub.maxScore || 10))
                            .map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setScore(value)}
                                className={`rounded-xl py-1 text-xs font-black transition ${
                                  Number(score) === value
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "bg-white text-slate-700 hover:bg-blue-50 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200"
                                }`}
                              >
                                {value}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Nhận xét của giảng viên */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="feedback-input" className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Nhận xét chi tiết cho học viên
                        </label>
                        <span className="text-[11px] text-slate-400">Tùy chọn</span>
                      </div>
                      <textarea
                        id="feedback-input"
                        rows={5}
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        placeholder="Nhận xét ưu điểm, lỗi ngữ pháp, phát âm và hướng dẫn khắc phục..."
                        className="w-full rounded-2xl border border-slate-200/90 bg-white/95 p-3 text-xs leading-5 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />

                      {/* Mẫu nhận xét nhanh */}
                      <details className="text-xs">
                        <summary className="cursor-pointer font-bold text-blue-600 hover:underline flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" /> Chèn mẫu nhận xét nhanh
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {QUICK_FEEDBACK.map((template) => (
                            <button
                              key={template.label}
                              type="button"
                              onClick={() =>
                                setFeedback((current) =>
                                  current.trim() ? `${current.trim()}\n${template.text}` : template.text
                                )
                              }
                              className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition shadow-2xs ${template.badgeClass}`}
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                      </details>
                    </div>

                    {/* Lý do sửa điểm nếu đã từng chấm */}
                    {selectedSub.status === "graded" && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                        <label className="block text-xs font-bold text-amber-800 dark:text-amber-200 mb-1">
                          Lý do sửa điểm đã công bố:
                        </label>
                        <textarea
                          required
                          minLength={10}
                          maxLength={2000}
                          value={changeReason}
                          onChange={(e) => setChangeReason(e.target.value)}
                          placeholder="Nêu rõ lý do điều chỉnh điểm để lưu vào nhật ký..."
                          className="w-full rounded-xl border border-amber-300 bg-white p-2 text-xs outline-none focus:border-amber-500 dark:bg-slate-900"
                          rows={2}
                        />
                      </div>
                    )}

                    {/* Các nút bấm hành động công bố điểm */}
                    <div className="space-y-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleGradeSubmit(true)}
                        disabled={grading || selectedSub.returnRequested}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-3 text-xs sm:text-sm font-black text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-700 hover:to-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {grading ? "Đang lưu điểm..." : "Công bố điểm & chuyển bài tiếp"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGradeSubmit(false)}
                        disabled={grading}
                        className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-white hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Công bố điểm, giữ bài hiện tại
                      </button>
                    </div>

                    {/* Workflow panel trả bài / phúc khảo */}
                    <GradingWorkflowPanel
                      key={selectedSub.id + ":" + selectedSub.revision}
                      submission={selectedSub}
                      payload={{ score, feedbackText: feedback, rubricScores, annotations }}
                      onRestore={(draft) => {
                        setScore(draft.score);
                        setFeedback(draft.feedbackText);
                        setRubricScores(draft.rubricScores || []);
                        setAnnotations(draft.annotations || []);
                      }}
                      onReturned={loadSubmissions}
                    />
                  </aside>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
