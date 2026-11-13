import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
  FileText,
  FileCheck2,
  Languages,
  Calculator,
  Download,
  FolderOpen,
  StickyNote,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Laptop,
  Smartphone,
  Volume2,
  Search,
  RotateCcw,
  Video,
  Eye,
  ExternalLink,
  Copy,
  Lock,
  X,
  Info,
  Layers,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { useTheme } from "../../../context/ThemeContext";
import {
  fetchVideoCourseWorkspace,
  saveVideoCourseUnitNote,
  deleteVideoCourseUnitNote,
} from "../../api/lmsClient";
import { fetchMyTrustedDevices } from "../../api/accountSecurityClient";
import { LoadingState, ErrorState } from "../../../components/common/StateView";
import BunnyStreamPlayer from "../components/BunnyStreamPlayer";
import { formatTimeMMSS } from "../utils/videoTime";
import DocumentPreviewModal from "../components/DocumentPreviewModal";
import { speakChinese } from "../utils/speech";
import katex from "katex";
import "katex/dist/katex.min.css";

const renderKaTeX = (latex, displayMode = true) => {
  if (!latex || typeof latex !== "string") return "";
  const cleaned = latex.trim();
  try {
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return cleaned
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .replace(/\\[a-zA-Z]+/g, " ")
      .trim();
  }
};

const sanitizeTheoryHtml = (html) => {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return "";

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const allowedTags = new Set([
    "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "i", "li", "ol", "p", "pre", "span", "strong", "sub", "sup", "table", "tbody", "td",
    "th", "thead", "tr", "u", "ul",
  ]);
  const allowedAttributes = new Set(["colspan", "href", "rel", "rowspan", "target", "title", "class"]);
  documentNode.body.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName.toLowerCase())) {
      node.replaceWith(...node.childNodes);
      return;
    }
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (!allowedAttributes.has(name) || (name === "href" && !value.startsWith("https://") && !value.startsWith("http://") && !value.startsWith("/api/"))) {
        node.removeAttribute(attribute.name);
      }
    });
    if (node.tagName.toLowerCase() === "a") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  return documentNode.body.innerHTML;
};

const REQUIRED_WATCH_PERCENT = 60;

const isVideoRequirementCompleted = (unit) => {
  if (typeof unit?.isVideoCompleted === "boolean") return unit.isVideoCompleted;
  return Boolean(unit?.hasVideo) && Number(unit?.progressPercent || 0) >= REQUIRED_WATCH_PERCENT;
};

const formatVideoDurationLabel = (unit) => {
  const sec = Number(unit?.videoDurationSeconds || 0);
  if (sec > 0) {
    const mins = Math.max(1, Math.round(sec / 60));
    return `${formatTimeMMSS(sec)} (${mins}p)`;
  }
  const minsFallback = Number(unit?.durationMinutes || 0);
  if (minsFallback > 0 && minsFallback !== 120) {
    return `${minsFallback} phút`;
  }
  return unit?.hasVideo ? "Video HD" : "Chưa có video";
};

const recomputeSequentialLocks = (rawUnits = [], previewOnly = false, isAdminOrTeacher = false) => {
  if (isAdminOrTeacher) {
    return rawUnits.map((unit) => ({
      ...unit,
      isLocked: false,
      lockReason: null,
      requiredPrevUnitId: null,
      requiredPrevUnitTitle: null,
      requiredPrevUnitNumber: null,
    }));
  }
  if (previewOnly) {
    return rawUnits.map((unit) => ({
      ...unit,
      isLocked: !unit.isPublicPreview,
      lockReason: unit.isPublicPreview
        ? null
        : "Buổi này dành cho học viên của khóa. Nhắn Zalo 0812352005 để admin hỗ trợ bạn nhé 💙",
      requiredPrevUnitId: null,
      requiredPrevUnitTitle: null,
      requiredPrevUnitNumber: null,
    }));
  }
  const result = [];
  for (let idx = 0; idx < rawUnits.length; idx += 1) {
    const unit = rawUnits[idx];
    const quizCount = Number(unit.quizCount || 0);
    const completedQuizCount = Number(unit.completedQuizCount || 0);
    const isVideoCompleted = isVideoRequirementCompleted(unit);
    const isQuizCompleted = quizCount === 0 || completedQuizCount >= quizCount;
    const isCompleted = isVideoCompleted && isQuizCompleted;

    if (idx === 0) {
      result.push({
        ...unit,
        isVideoCompleted,
        isQuizCompleted,
        isCompleted,
        isLocked: false,
        lockReason: null,
        requiredPrevUnitId: null,
        requiredPrevUnitTitle: null,
        requiredPrevUnitNumber: null,
      });
      continue;
    }

    const prev = result[idx - 1];
    const prevLabel = prev.sessionNumber ? `Buổi ${prev.sessionNumber}` : `Bài ${idx}`;
    let isLocked = false;
    let lockReason = null;

    if (prev.isLocked) {
      isLocked = true;
      lockReason = `Bạn hãy hoàn thành buổi học trước để tiếp tục nhé (xem khoảng ${REQUIRED_WATCH_PERCENT}% video và hoàn thành trắc nghiệm nếu có).`;
    } else if (!prev.isVideoCompleted && !prev.isQuizCompleted) {
      isLocked = true;
      lockReason = `Bạn đã xem ${Math.round(prev.progressPercent || 0)}% video. Xem thêm đến ${REQUIRED_WATCH_PERCENT}% và hoàn thành ${prev.completedQuizCount || 0}/${prev.quizCount || 0} bài trắc nghiệm của ${prevLabel} để tiếp tục nhé.`;
    } else if (!prev.isVideoCompleted) {
      isLocked = true;
      lockReason = `Bạn đã xem ${Math.round(prev.progressPercent || 0)}% video của ${prevLabel}. Xem thêm đến ${REQUIRED_WATCH_PERCENT}% là có thể tiếp tục bài kế tiếp nhé.`;
    } else if (!prev.isQuizCompleted) {
      isLocked = true;
      lockReason = `Cần hoàn thành ${prev.completedQuizCount || 0}/${prev.quizCount || 0} bài trắc nghiệm của ${prevLabel} để mở khóa buổi tiếp theo.`;
    }

    result.push({
      ...unit,
      isVideoCompleted,
      isQuizCompleted,
      isCompleted,
      isLocked,
      lockReason,
      requiredPrevUnitId: isLocked ? prev.id : null,
      requiredPrevUnitTitle: isLocked ? prev.title : null,
      requiredPrevUnitNumber: isLocked ? (prev.sessionNumber || idx) : null,
    });
  }
  return result;
};

export default function VideoCourseWorkspacePage() {
  const { offeringId, unitId: paramUnitId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const { isDarkMode } = useTheme();

  const [workspaceData, setWorkspaceData] = useState(null);
  const [activeUnitId, setActiveUnitId] = useState(paramUnitId || null);
  const [activeTab, setActiveTab] = useState("files");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [mobileCurriculumOpen, setMobileCurriculumOpen] = useState(false);

  // Video Player & Watch Progress state
  const [isCompletedUnit, setIsCompletedUnit] = useState(false);
  const [currentProgressSeconds, setCurrentProgressSeconds] = useState(0);
  const [unitWatchPercent, setUnitWatchPercent] = useState(0);
  const [seekRequest, setSeekRequest] = useState(null);

  // Document preview modal state
  const [previewFile, setPreviewFile] = useState(null);
  const [showInlineSlidePreview, setShowInlineSlidePreview] = useState(true);

  // Vocabulary & Formula interactive filters
  const [vocabSearch, setVocabSearch] = useState("");
  const [vocabFlashcardMode, setVocabFlashcardMode] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [formulaSubjectFilter, setFormulaSubjectFilter] = useState("ALL");

  // Notes state
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Trusted devices modal
  const [trustedModalOpen, setTrustedModalOpen] = useState(false);
  const [deviceList, setDeviceList] = useState([]);
  const [deviceLoading, setDeviceLoading] = useState(false);

  // Load workspace data
  const loadWorkspace = useCallback(async (unitTarget) => {
    setLoading(true);
    setErrorMessage("");
    setErrorCode("");
    try {
      const res = await fetchVideoCourseWorkspace(offeringId, { unitId: unitTarget });
      if (res?.success && res.data) {
        const previewOnly = Boolean(res.data.capabilities?.isPublicPreviewAccess);
        const isAdminOrTeacher = authUser?.role === "admin" || authUser?.role === "creator" || Boolean(res.data.capabilities?.isAdminPreview);
        const normalizedUnits = recomputeSequentialLocks(res.data.units || [], previewOnly, isAdminOrTeacher);
        const au = res.data.activeUnit;
        const activeMeta = au ? normalizedUnits.find((u) => String(u.id) === String(au.id)) : null;

        setWorkspaceData({
          ...res.data,
          units: normalizedUnits,
          activeUnit: au ? {
            ...au,
            isLocked: Boolean(activeMeta?.isLocked ?? au.isLocked),
            lockReason: activeMeta?.lockReason ?? au.lockReason ?? null,
            requiredPrevUnitId: activeMeta?.requiredPrevUnitId ?? au.requiredPrevUnitId ?? null,
            requiredPrevUnitTitle: activeMeta?.requiredPrevUnitTitle ?? au.requiredPrevUnitTitle ?? null,
            requiredPrevUnitNumber: activeMeta?.requiredPrevUnitNumber ?? au.requiredPrevUnitNumber ?? null,
          } : null,
        });

        if (au?.id) {
          setActiveUnitId(au.id);
          setIsCompletedUnit(Boolean(activeMeta?.isCompleted ?? au.watchProgress?.isCompleted));
          setCurrentProgressSeconds(Number(au.watchProgress?.lastPositionSeconds || 0));
          setUnitWatchPercent(Number(au.watchProgress?.completionPercent || 0));
          setNotes((au.notes || []).map((n) => ({
            id: String(n.id),
            timestampSeconds: Number(n.timestampSeconds || 0),
            timestamp: formatTimeMMSS(n.timestampSeconds || 0),
            content: n.content,
          })));
        }
        return;
      }
      throw new Error(res?.message || "Không thể tải workspace khóa học video.");
    } catch (err) {
      setWorkspaceData(null);
      setNotes([]);
      setErrorMessage(err?.message || "Không thể tải không gian khóa học video.");
      setErrorCode(err?.errorCode || "");
    } finally {
      setLoading(false);
    }
  }, [authUser?.role, offeringId]);

  useEffect(() => {
    loadWorkspace(paramUnitId);
  }, [loadWorkspace, paramUnitId]);

  // Keep lessons sequential while giving learners a clear, friendly target.
  const handleSelectUnit = (unit) => {
    if (!unit) return;
    setMobileCurriculumOpen(false);
    if (String(unit.id) === String(activeUnitId)) return;

    const isAdminOrTeacher = authUser?.role === "admin" || authUser?.role === "creator" || Boolean(workspaceData?.capabilities?.isAdminPreview);
    if (!isAdminOrTeacher && unit.isLocked) {
      toast.error(
        unit.lockReason
        || `Bạn xem thêm đến ${REQUIRED_WATCH_PERCENT}% video và hoàn thành bài trắc nghiệm của buổi trước để tiếp tục nhé.`,
        { duration: 8000 },
      );

      // If only the quiz remains, guide the learner directly to it.
      const currentMeta = (workspaceData?.units || []).find((u) => String(u.id) === String(activeUnitId));
      if (
        currentMeta
        && String(unit.requiredPrevUnitId) === String(currentMeta.id)
        && currentMeta.isVideoCompleted
        && !currentMeta.isQuizCompleted
      ) {
        setActiveTab("exercises");
      }
      return;
    }

    setActiveUnitId(unit.id);
    navigate(`/video-courses/${offeringId}/units/${unit.id}`, { replace: true });
    loadWorkspace(unit.id);
  };

  // Sync detected real video duration from player metadata into sidebar
  const handleDurationDetected = useCallback((targetUnitId, detectedSeconds) => {
    const cleanSec = Math.round(Number(detectedSeconds || 0));
    if (!targetUnitId || cleanSec <= 0) return;

    setWorkspaceData((prev) => {
      if (!prev) return prev;
      let changed = false;
      const nextUnits = (prev.units || []).map((u) => {
        if (String(u.id) !== String(targetUnitId)) return u;
        if (Number(u.videoDurationSeconds || 0) === cleanSec) return u;
        changed = true;
        return {
          ...u,
          videoDurationSeconds: cleanSec,
          durationMinutes: Math.max(1, Math.round(cleanSec / 60)),
        };
      });
      if (!changed) return prev;
      return {
        ...prev,
        units: recomputeSequentialLocks(
          nextUnits,
          Boolean(prev.capabilities?.isPublicPreviewAccess),
          authUser?.role === "admin" || authUser?.role === "creator" || Boolean(prev.capabilities?.isAdminPreview),
        ),
      };
    });
  }, [authUser?.role]);

  // Sync live progress updates from BunnyStreamPlayer into workspace state
  const handlePlayerProgressChange = useCallback(({
    unitId: reportedUnitId,
    currentTimeSeconds,
    watchedSeconds,
    durationSeconds,
    completionPercent,
    isCompleted: videoReachedTarget,
  }) => {
    const targetId = reportedUnitId || activeUnitId;
    setCurrentProgressSeconds(currentTimeSeconds);
    setUnitWatchPercent(Number(completionPercent || 0));

    setWorkspaceData((prev) => {
      if (!prev) return prev;
      const rawUpdated = (prev.units || []).map((u) => {
        if (String(u.id) !== String(targetId)) return u;
        const mergedPercent = Math.min(100, Math.max(0, Number(completionPercent || 0)));
        const mergedWatched = Math.max(0, Number(watchedSeconds || 0));
        const mergedDuration = Number(durationSeconds || u.videoDurationSeconds || 0);
        const videoDone = Boolean(videoReachedTarget);
        const quizDone = Number(u.quizCount || 0) === 0 || Number(u.completedQuizCount || 0) >= Number(u.quizCount || 0);

        setIsCompletedUnit(videoDone && quizDone);

        return {
          ...u,
          progressPercent: mergedPercent,
          watchedSeconds: mergedWatched,
          videoDurationSeconds: mergedDuration,
          durationMinutes: mergedDuration > 0 ? Math.max(1, Math.round(mergedDuration / 60)) : u.durationMinutes,
          isVideoCompleted: videoDone,
          isQuizCompleted: quizDone,
          isCompleted: videoDone && quizDone,
          lastPositionSeconds: currentTimeSeconds,
        };
      });

      const updatedUnits = recomputeSequentialLocks(
        rawUpdated,
        Boolean(prev.capabilities?.isPublicPreviewAccess),
        authUser?.role === "admin" || authUser?.role === "creator" || Boolean(prev.capabilities?.isAdminPreview),
      );
      const completedCount = updatedUnits.filter((u) => u.isCompleted).length;
      const activeMeta = updatedUnits.find((u) => String(u.id) === String(activeUnitId));

      return {
        ...prev,
        units: updatedUnits,
        activeUnit: prev.activeUnit ? {
          ...prev.activeUnit,
          isLocked: Boolean(activeMeta?.isLocked),
          lockReason: activeMeta?.lockReason || null,
          requiredPrevUnitId: activeMeta?.requiredPrevUnitId || null,
          requiredPrevUnitTitle: activeMeta?.requiredPrevUnitTitle || null,
          requiredPrevUnitNumber: activeMeta?.requiredPrevUnitNumber || null,
        } : prev.activeUnit,
        progress: {
          completedUnits: completedCount,
          totalUnits: updatedUnits.length,
          overallPercent: updatedUnits.length > 0
            ? Math.round(updatedUnits.reduce((sum, unit) => sum + Math.min(100, Math.max(0, Number(unit.progressPercent || 0))), 0) / updatedUnits.length)
            : 0,
        },
      };
    });
  }, [activeUnitId, authUser?.role]);

  // Seek video player to specific timestamp and switch to video tab if needed
  const handleJumpToTimestamp = (seconds) => {
    const sec = Math.max(0, Math.floor(Number(seconds) || 0));
    setActiveTab("video");
    setSeekRequest({ seconds: sec, nonce: Date.now() });
    toast.success(`Đã chuyển video tới mốc ${formatTimeMMSS(sec)}`);
  };

  // Quick note from video player button
  const handleQuickNoteAtTime = (seconds) => {
    setCurrentProgressSeconds(seconds);
    setActiveTab("notes");
    toast(`Đang ghi chú tại mốc ${formatTimeMMSS(seconds)}`, { icon: "📝" });
  };

  // Unit navigation
  const currentIndex = useMemo(() => {
    if (!workspaceData?.units) return -1;
    return workspaceData.units.findIndex((u) => String(u.id) === String(activeUnitId));
  }, [workspaceData?.units, activeUnitId]);

  const activeUnitMeta = currentIndex >= 0 ? workspaceData?.units[currentIndex] : null;
  const activeVideoCompleted = isVideoRequirementCompleted(activeUnitMeta);
  const prevUnit = currentIndex > 0 ? workspaceData?.units[currentIndex - 1] : null;
  const nextUnit = currentIndex >= 0 && currentIndex < (workspaceData?.units?.length || 0) - 1
    ? workspaceData?.units[currentIndex + 1]
    : null;

  // Filter units by search
  const filteredUnits = useMemo(() => {
    const list = workspaceData?.units || [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((u) => u.title.toLowerCase().includes(term) || (u.sectionTitle || "").toLowerCase().includes(term));
  }, [workspaceData?.units, searchTerm]);

  // Filtered vocabulary
  const filteredVocabulary = useMemo(() => {
    const list = workspaceData?.activeUnit?.vocabulary || [];
    if (!vocabSearch.trim()) return list;
    const q = vocabSearch.toLowerCase();
    return list.filter(
      (v) =>
        (v.term || "").toLowerCase().includes(q)
        || (v.pinyin || "").toLowerCase().includes(q)
        || (v.meaning || "").toLowerCase().includes(q)
        || (v.sinoVietnamese || "").toLowerCase().includes(q),
    );
  }, [workspaceData?.activeUnit?.vocabulary, vocabSearch]);

  // Filtered formulas
  const filteredFormulas = useMemo(() => {
    const list = workspaceData?.activeUnit?.formulas || [];
    if (formulaSubjectFilter === "ALL") return list;
    return list.filter((f) => String(f.subject || "").toUpperCase() === formulaSubjectFilter);
  }, [workspaceData?.activeUnit?.formulas, formulaSubjectFilter]);

  // Notes are persisted by the video-course API; never show a locally-faked save.
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || noteSubmitting) return;
    const sec = Math.floor(currentProgressSeconds || 0);
    const timeFormatted = formatTimeMMSS(sec);
    const text = newNoteText.trim();

    setNoteSubmitting(true);
    try {
      const res = await saveVideoCourseUnitNote(offeringId, activeUnitId, {
        timestampSeconds: sec,
        content: text,
        unitType: workspaceData?.activeUnit?.type || "lesson",
      });
      if (res?.success && res.data) {
        setNotes((prev) => [
          {
            id: String(res.data.id),
            timestampSeconds: Number(res.data.timestampSeconds || sec),
            timestamp: formatTimeMMSS(res.data.timestampSeconds || sec),
            content: res.data.content,
          },
          ...prev,
        ]);
      } else {
        throw new Error(res?.message || "Không thể lưu ghi chú");
      }
      setNewNoteText("");
      toast.success(`Đã lưu ghi chú tại mốc ${timeFormatted}!`);
    } catch (error) {
      toast.error(error?.message || "Không thể lưu ghi chú. Vui lòng thử lại.");
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      await deleteVideoCourseUnitNote(offeringId, activeUnitId, id);
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(id)));
      toast.success("Đã xóa ghi chú.");
    } catch (error) {
      toast.error(error?.message || "Không thể xóa ghi chú.");
    }
  };

  const openFileUrl = (url, title = "tài liệu") => {
    if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/api/"))) {
      toast.loading(`Đang mở ${title}...`, { duration: 1800, id: "open-file" });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    toast.error("Tài liệu chưa có đường dẫn xem hợp lệ.");
  };

  // Open Trusted Devices modal
  const handleOpenDevicesModal = async () => {
    setTrustedModalOpen(true);
    setDeviceLoading(true);
    try {
      const res = await fetchMyTrustedDevices();
      if (res?.data?.devices) {
        setDeviceList(res.data.devices);
      }
    } catch (error) {
      setDeviceList([]);
      toast.error(error?.message || "Không thể tải danh sách thiết bị.");
    } finally {
      setDeviceLoading(false);
    }
  };

  // Keep hooks unconditional so loading-to-content renders preserve hook order.
  const slideFiles = useMemo(() => {
    return (workspaceData?.activeUnit?.files || []).filter((f) =>
      /\.(pdf|ppt|pptx|doc|docx)$/i.test(f.fileName || ""),
    );
  }, [workspaceData?.activeUnit?.files]);

  if (loading && !workspaceData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-6 dark:bg-slate-950">
        <LoadingState message="Đang chuẩn bị không gian học của bạn..." />
      </div>
    );
  }

  if (errorMessage && !workspaceData) {
    const isAccessError = [
      "VIDEO_COURSE_ACCESS_REQUIRED",
      "LMS_ACCESS_INACTIVE",
      "ENTITLEMENT_INACTIVE",
      "RECORD_MEMBERSHIP_REQUIRED",
    ].includes(errorCode);
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] p-6 dark:bg-slate-950">
        <div className="w-full max-w-3xl">
          <ErrorState
            title={isAccessError ? "Bạn chưa được cấp quyền học khóa này" : "Không thể mở không gian học video"}
            message={isAccessError
              ? "Khóa học này chưa được mở cho tài khoản của bạn. Nhắn Zalo 0812352005 để admin hỗ trợ bạn nhé 💙"
              : errorMessage}
            onRetry={isAccessError ? undefined : () => loadWorkspace(activeUnitId)}
          />
          {isAccessError && (
            <div className="mt-4 flex justify-center">
              <a
                href="https://zalo.me/0812352005"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
              >
                Liên hệ Zalo 0812352005
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  const {
    course,
    sourceClass,
    units = [],
    activeUnit,
    progress = {},
    capabilities = {
      canPlayVideo: true,
      canJoinLive: false,
      canCheckIn: false,
      showCalendar: false,
      canSubmitAssignments: true,
    },
  } = workspaceData;
  const isPublicPreviewAccess = Boolean(capabilities.isPublicPreviewAccess);
  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#f8fafc] text-slate-900"} font-sans antialiased transition-colors duration-200`}>
      {isPublicPreviewAccess && (
        <div className="border-b border-sky-200 bg-sky-50/90 px-4 py-2 text-center text-xs font-semibold text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-200">
          Bạn đang xem buổi học thử miễn phí. Muốn học toàn bộ khóa, hãy nhắn Zalo 0812352005 nhé 💙
        </div>
      )}
      {/* 1. TOP HEADER / SHELL */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          {/* Left: Back & Course Info */}
          <div className="flex items-center gap-3 truncate">
            <Link
              to="/courses"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Quay lại danh sách khóa học"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>

            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Sparkles className="h-3 w-3" />
                  Bài giảng Trực tuyến
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Video className="h-3 w-3 text-slate-400" />
                  Video chất lượng cao 1080p
                </span>
              </div>

              <h1 className="truncate text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {course?.title || "Không gian bài giảng Video"}
              </h1>
            </div>
          </div>

          {/* Right: Security & Progress */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Mobile Curriculum Button */}
            <button
              type="button"
              onClick={() => setMobileCurriculumOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 transition hover:bg-amber-500/20 active:scale-95"
              title="Mở lộ trình bài giảng"
            >
              <BookOpen className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-mono">
                {progress.completedUnits || 0}/{units.length} bài
              </span>
            </button>

            {/* Trusted device safety pill */}
            <button
              type="button"
              onClick={handleOpenDevicesModal}
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Bảo vệ 2 thiết bị tin cậy</span>
            </button>

            {/* Overall Progress */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="hidden sm:block text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tiến độ khóa</p>
                <p className="text-xs font-black text-amber-500 font-mono">
                  {progress.completedUnits || 0}/{progress.totalUnits || units.length} ({progress.overallPercent || 0}%)
                </p>
              </div>

              <div className="relative h-8 w-8">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-amber-500 transition-all duration-500"
                    strokeDasharray={`${progress.overallPercent || 0}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black font-mono">
                  {progress.overallPercent || 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN LAYOUT: Left Workspace & Right Curriculum Navigation */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 8/12: Active Unit Media & 8-Tab Content Workspace */}
          <main className="lg:col-span-8 space-y-5 min-w-0">
            {/* 1. MEDIA PLAYER OR SEQUENTIAL LOCK GATE */}
            {activeUnit?.isLocked ? (
              <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-10 text-center text-white shadow-2xl space-y-5">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-lg shadow-amber-500/10">
                  <Lock className="h-8 w-8" />
                </div>
                <div className="space-y-2 max-w-xl mx-auto">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300 border border-amber-500/30">
                    Điều kiện để tiếp tục bài kế tiếp
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    {activeUnit?.title || "Buổi học này đang tạm khóa"}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {activeUnit?.lockReason || `Bạn xem thêm đến ${REQUIRED_WATCH_PERCENT}% video và hoàn thành bài trắc nghiệm của buổi trước để tiếp tục nhé.`}
                  </p>
                </div>

                <div className="mx-auto max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Điều kiện 1</p>
                    <p className="text-xs font-bold text-white">Xem khoảng {REQUIRED_WATCH_PERCENT}% video</p>
                    <p className="text-[11px] text-slate-400">Tiến độ được ghi nhận tự động; bạn cứ học theo tốc độ phù hợp với mình nhé.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-sky-400">Điều kiện 2</p>
                    <p className="text-xs font-bold text-white">Hoàn thành Trắc nghiệm (Quiz)</p>
                    <p className="text-[11px] text-slate-400">Nộp xong bài trắc nghiệm củng cố (nếu buổi học đó có bài trắc nghiệm).</p>
                  </div>
                </div>

                {(() => {
                  const firstUnlockedIncomplete = units.find((u) => !u.isLocked && !u.isCompleted) || units[0];
                  if (!firstUnlockedIncomplete) return null;
                  return (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleSelectUnit(firstUnlockedIncomplete)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 px-6 py-3 text-xs sm:text-sm font-black text-slate-950 shadow-lg shadow-amber-500/20 transition"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>
                          Quay về {firstUnlockedIncomplete.sessionNumber ? `Buổi ${firstUnlockedIncomplete.sessionNumber}` : "bài đang học"}: {firstUnlockedIncomplete.title}
                        </span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            ) : capabilities.canPlayVideo !== false && (
              <div className="rounded-3xl overflow-hidden shadow-2xl border border-slate-200/80 dark:border-slate-800 bg-black">
                <BunnyStreamPlayer
                  key={activeUnit?.id}
                  video={activeUnit?.video}
                  videos={activeUnit?.videos || []}
                  unitId={activeUnit?.id}
                  unitTitle={activeUnit?.title}
                  courseId={course?.id}
                  liveClassId={sourceClass?.id}
                  initialProgress={activeUnit?.watchProgress}
                  userEmail={authUser?.email || authUser?.username || "student@molycourse.online"}
                  prevUnit={prevUnit}
                  nextUnit={nextUnit}
                  seekRequest={seekRequest}
                  onSelectUnit={handleSelectUnit}
                  onProgressChange={handlePlayerProgressChange}
                  onDurationDetected={handleDurationDetected}
                  onQuickNoteAtTime={handleQuickNoteAtTime}
                />
              </div>
            )}

            {/* Quick Access to Curriculum on Mobile */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobileCurriculumOpen(true)}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 text-slate-900 dark:text-white shadow-sm hover:border-amber-400 transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-black shadow-sm shrink-0">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Lộ trình bài giảng • Nhấn đổi bài
                    </p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {activeUnit?.sectionTitle || (activeUnit?.sessionNumber ? `Buổi ${activeUnit.sessionNumber}` : "Bài hiện tại")}: {activeUnit?.title}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2.5 py-1 rounded-xl">
                  {currentIndex + 1}/{units.length} bài
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            </div>

            {/* 2. ACTIVE UNIT TITLE & SEQUENTIAL UNLOCK CONDITIONS BAR (BELOW VIDEO) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">
                      {activeUnit?.sectionTitle || (activeUnit?.sessionNumber ? `Buổi ${activeUnit.sessionNumber}` : "Bài học")}
                    </span>
                    {activeUnitMeta && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        <Clock className="h-3 w-3 text-amber-500" />
                        {formatVideoDurationLabel(activeUnitMeta)}
                      </span>
                    )}
                    {isCompletedUnit && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> Đã mở khóa bài tiếp theo
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-snug break-words">
                    {activeUnit?.title || "Đang tải bài học..."}
                  </h2>
                </div>

                {/* Completion & Unit Switcher */}
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold border ${
                      isCompletedUnit
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {isCompletedUnit ? "Đã hoàn thành buổi học" : `${Math.round(unitWatchPercent)}% / ${REQUIRED_WATCH_PERCENT}% video`}
                    </span>
                  </span>

                  <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
                    <button
                      type="button"
                      disabled={!prevUnit}
                      onClick={() => prevUnit && handleSelectUnit(prevUnit)}
                      className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
                      title={prevUnit ? `Bài trước: ${prevUnit.title}` : "Hết bài"}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!nextUnit}
                      onClick={() => nextUnit && handleSelectUnit(nextUnit)}
                      className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
                      title={
                        nextUnit
                          ? nextUnit.isLocked
                            ? nextUnit.lockReason || `Xem khoảng ${REQUIRED_WATCH_PERCENT}% video và hoàn thành bài trắc nghiệm để tiếp tục nhé`
                            : `Bài tiếp: ${nextUnit.title}`
                          : "Hết bài"
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 2-Condition Unlock Checklist Strip for Current Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                    activeVideoCompleted
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/5 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {activeVideoCompleted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="font-bold truncate">
                      1. Xem khoảng {REQUIRED_WATCH_PERCENT}% video
                    </span>
                  </div>
                  <span className="font-mono font-black shrink-0">
                    {Math.round(unitWatchPercent)}% / {REQUIRED_WATCH_PERCENT}%
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if ((activeUnit?.quizzes?.length || 0) > 0) setActiveTab("exercises");
                  }}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs text-left transition ${
                    (activeUnitMeta?.quizCount || activeUnit?.quizzes?.length || 0) === 0 || activeUnitMeta?.isQuizCompleted
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {(activeUnitMeta?.quizCount || activeUnit?.quizzes?.length || 0) === 0 || activeUnitMeta?.isQuizCompleted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <FileCheck2 className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="font-bold truncate">
                      {(activeUnitMeta?.quizCount || activeUnit?.quizzes?.length || 0) > 0
                        ? "2. Hoàn thành bài Trắc nghiệm (Quiz)"
                        : "2. Trắc nghiệm: Không bắt buộc ở buổi này"}
                    </span>
                  </div>
                  {(activeUnitMeta?.quizCount || activeUnit?.quizzes?.length || 0) > 0 && (
                    <span className="font-mono font-black shrink-0">
                      {activeUnitMeta?.completedQuizCount ?? (activeUnit?.quizzes || []).filter((q) => q.isCompleted).length}/
                      {activeUnitMeta?.quizCount ?? (activeUnit?.quizzes || []).length} bài →
                    </span>
                  )}
                </button>
              </div>
            </div>

            {!activeUnit?.isLocked && (
              <>
            {/* 3. TABS BAR: THIẾT KẾ ĐẦY ĐỦ 7 TAB TIỆN ÍCH */}
            <div className="rounded-2xl bg-white/80 dark:bg-slate-900/80 p-2 sm:p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-sm backdrop-blur-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
                {[
                  { id: "files", label: "Tài liệu", fullLabel: "Tài liệu đính kèm", icon: FolderOpen, badge: (activeUnit?.files?.length || 0) || null },
                  { id: "exercises", label: "Bài tập", fullLabel: "Bài tập & Quiz", icon: FileCheck2, badge: (activeUnit?.quizzes?.length || 0) + (activeUnit?.assignments?.length || 0) || null },
                  { id: "vocabulary", label: "Từ vựng", fullLabel: "Từ vựng CSCA", icon: Languages, badge: (activeUnit?.vocabulary?.length || 0) || null },
                  { id: "formulas", label: "Công thức", fullLabel: "Công thức trọng tâm", icon: Calculator, badge: (activeUnit?.formulas?.length || 0) || null },
                  { id: "notes", label: "Ghi chú", fullLabel: "Ghi chú cá nhân", icon: StickyNote, badge: (notes?.length || 0) || null },
                  { id: "results", label: "Kết quả", fullLabel: "Kết quả học tập", icon: BarChart3 },
                ].map(({ id, label, fullLabel, icon: Icon, badge }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition duration-150 ${
                      activeTab === id
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/15 ring-2 ring-indigo-500/20 dark:bg-indigo-400 dark:text-slate-950 dark:ring-indigo-300/20"
                        : "bg-slate-100/90 text-slate-700 hover:bg-slate-200/90 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate sm:hidden">{label}</span>
                    <span className="truncate hidden sm:inline">{fullLabel}</span>
                    {badge && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                        activeTab === id
                          ? "bg-white/20 text-white dark:bg-black/20 dark:text-slate-950"
                          : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}>
                        {badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. TAB CONTENTS */}
            <div className="min-h-[380px]">
              {/* TAB 0: LÝ THUYẾT & SLIDE */}
              {activeTab === "theory" && (
                <div className="space-y-5">
                  <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          <span>Lý thuyết bài giảng & Slide trình chiếu</span>
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {activeUnit?.theory?.title || activeUnit?.title}
                        </p>
                      </div>
                      {slideFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowInlineSlidePreview((s) => !s)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-300"
                        >
                          <Layers className="h-4 w-4" />
                          <span>{showInlineSlidePreview ? "Thu gọn Slide" : `Mở Slide (${slideFiles.length})`}</span>
                        </button>
                      )}
                    </div>

                    {/* Summary Box */}
                    {activeUnit?.theory?.summary && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-sky-300 mb-1">
                          <Info className="h-4 w-4" /> Tóm tắt cốt lõi
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {activeUnit.theory.summary}
                        </p>
                      </div>
                    )}

                    {/* Key Takeaways */}
                    {activeUnit?.theory?.keyTakeaways && activeUnit.theory.keyTakeaways.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Kiến thức trọng tâm</h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {activeUnit.theory.keyTakeaways.map((takeaway, idx) => (
                            <div key={idx} className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-100 dark:border-slate-800">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">✓</span>
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{takeaway}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Theory HTML Content */}
                    <div className="prose prose-sm dark:prose-invert max-w-none pt-2">
                      {activeUnit?.theory?.contentHtml ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: sanitizeTheoryHtml(activeUnit.theory.contentHtml),
                          }}
                        />
                      ) : !activeUnit?.theory?.summary && !activeUnit?.theory?.keyTakeaways?.length && slideFiles.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                          <BookOpen className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Chưa có bài soạn lý thuyết văn bản cho bài học này.
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Học viên hãy theo dõi video bài giảng và các tài liệu đính kèm ở tab Tài liệu.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* Transcript / Subtitles if present */}
                    {activeUnit?.theory?.transcript && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                          <FileText className="h-4 w-4 text-purple-500" />
                          <span>Transcript bài giảng</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300 font-sans">
                          {activeUnit.theory.transcript}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Embedded Slide / Document Preview */}
                  {slideFiles.length > 0 && showInlineSlidePreview && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-amber-500" />
                          <span>Slide & Giáo trình trình chiếu trực tiếp: {slideFiles[0].fileName}</span>
                        </h4>
                      </div>
                      <DocumentPreviewModal
                        file={slideFiles[0]}
                        courseTitle={course?.title}
                        unitTitle={activeUnit?.title}
                        onDownload={slideFiles[0].downloadUrl ? () => openFileUrl(slideFiles[0].downloadUrl, slideFiles[0].fileName) : undefined}
                        inline
                      />
                    </div>
                  )}
                </div>
              )}
              {/* TAB 1: BÀI TẬP & QUIZ */}
              {activeTab === "exercises" && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Quizzes Section */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                          <FileCheck2 className="h-4 w-4 text-amber-500" />
                          Trắc nghiệm & Quiz củng cố (Điều kiện mở khóa buổi tiếp theo)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Nếu buổi học có bài trắc nghiệm, bạn hãy hoàn thành bài và xem khoảng {REQUIRED_WATCH_PERCENT}% video để tiếp tục buổi kế tiếp nhé.
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {(activeUnit?.quizzes || []).length} bài test
                      </span>
                    </div>

                    {(activeUnit?.quizzes || []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-3">
                        Buổi học này không yêu cầu bài trắc nghiệm; xem khoảng {REQUIRED_WATCH_PERCENT}% video là bạn có thể tiếp tục.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {activeUnit.quizzes.map((quiz) => (
                          <div
                            key={quiz.id}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border transition ${
                              quiz.isCompleted
                                ? "border-emerald-300/70 bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-950/20"
                                : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-amber-400"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{quiz.title}</h4>
                                {quiz.isCompleted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Đã hoàn thành
                                    {quiz.bestScore !== null && quiz.bestScore !== undefined
                                      ? ` • ${quiz.bestScore}${quiz.maxScore ? `/${quiz.maxScore}` : ""}`
                                      : ""}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
                                    Cần hoàn thành để mở khóa bài tiếp
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                                <span>Thời gian: {quiz.durationMinutes} phút</span>
                                <span>•</span>
                                <span>Điểm đạt: {quiz.passingScore}%</span>
                                {quiz.attemptsCount > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>Số lần nộp: {quiz.attemptsCount}</span>
                                  </>
                                )}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const profileId = workspaceData?.videoCourseProfileId || offeringId;
                                const params = new URLSearchParams({ backUrl: window.location.pathname + window.location.search });
                                if (profileId) {
                                  params.set("videoCourseProfileId", profileId);
                                }
                                navigate(`/quizzes/${quiz.id}?${params.toString()}`);
                              }}
                              className={`px-4 py-2 rounded-xl font-bold text-xs transition shadow-sm self-start sm:self-auto shrink-0 ${
                                quiz.isCompleted
                                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                  : "bg-indigo-600 hover:bg-indigo-500 text-white dark:bg-indigo-400 dark:hover:bg-indigo-300 dark:text-slate-950"
                              }`}
                            >
                              {quiz.isCompleted ? "Làm lại quiz →" : "Làm bài quiz →"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assignments Section */}
                  {capabilities.canSubmitAssignments !== false && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          Bài tập tự luận & Speaking
                        </h3>
                        <span className="text-xs text-slate-400 font-mono">
                          {(activeUnit?.assignments || []).length} bài tập
                        </span>
                      </div>

                      {(activeUnit?.assignments || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-3">Chưa có bài tập tự luận cho bài học này.</p>
                      ) : (
                        <div className="space-y-3">
                          {activeUnit.assignments.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{assignment.title}</h4>
                                  {assignment.isSubmitted ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                      Đã nộp bài {assignment.score !== null ? `• ${assignment.score}/${assignment.maxScore}đ` : ""}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                      Chưa nộp
                                    </span>
                                  )}
                                  
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Thang điểm: {assignment.maxScore}đ {assignment.dueDate ? `• Hạn nộp: ${new Date(assignment.dueDate).toLocaleDateString("vi-VN")}` : ""}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const profileId = workspaceData?.videoCourseProfileId || offeringId;
                                  const params = new URLSearchParams({ backUrl: window.location.pathname + window.location.search });
                                  if (profileId) {
                                    params.set("videoCourseProfileId", profileId);
                                  }
                                  navigate(`/assignments/${assignment.id}/submit?${params.toString()}`);
                                }}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm self-start sm:self-auto shrink-0"
                              >
                                {assignment.isSubmitted ? "Xem bài đã nộp" : "Nộp bài ngay"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: TỪ VỰNG */}
              {activeTab === "vocabulary" && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 sm:space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <Languages className="h-5 w-5 text-indigo-500" />
                        Sổ tay Từ vựng & Thuật ngữ
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Thuật ngữ tiếng Trung và CSCA của bài học kèm phát âm chuẩn.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setVocabFlashcardMode((m) => !m);
                          setFlashcardIndex(0);
                          setFlashcardFlipped(false);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                          vocabFlashcardMode
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800"
                        }`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{vocabFlashcardMode ? "Xem dạng bảng" : "Luyện Flashcard"}</span>
                      </button>

                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                        {filteredVocabulary.length} từ
                      </span>
                    </div>
                  </div>

                  {/* Search bar for vocabulary */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={vocabSearch}
                      onChange={(e) => setVocabSearch(e.target.value)}
                      placeholder="Tìm theo chữ Hán, Pinyin, âm Hán Việt hoặc nghĩa..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {filteredVocabulary.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Languages className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Không tìm thấy từ vựng phù hợp.</p>
                    </div>
                  ) : vocabFlashcardMode ? (
                    /* Interactive Flashcard Mode */
                    <div className="mx-auto max-w-md space-y-4 py-4">
                      {(() => {
                        const card = filteredVocabulary[flashcardIndex % filteredVocabulary.length];
                        return (
                          <div
                            onClick={() => setFlashcardFlipped((f) => !f)}
                            className="cursor-pointer rounded-3xl border-2 border-indigo-200 dark:border-indigo-800/80 bg-gradient-to-br from-indigo-50/70 via-white to-amber-50/40 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-950/40 p-8 text-center shadow-lg transition hover:shadow-xl min-h-[240px] flex flex-col items-center justify-center gap-3"
                          >
                            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                              Thẻ {(flashcardIndex % filteredVocabulary.length) + 1} / {filteredVocabulary.length} • Nhấn để lật
                            </span>
                            <div className="text-4xl font-black font-serif text-slate-900 dark:text-white">
                              {card.term}
                            </div>
                            <div className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">
                              {card.pinyin}
                            </div>
                            {flashcardFlipped && (
                              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1 w-full">
                                {card.sinoVietnamese && (
                                  <p className="text-xs font-bold uppercase text-slate-400">
                                    Hán Việt: {card.sinoVietnamese}
                                  </p>
                                )}
                                <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                                  {card.meaning}
                                </p>
                                {card.exampleSentence && (
                                  <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                                    {card.exampleSentence}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFlashcardIndex((i) => (i - 1 + filteredVocabulary.length) % filteredVocabulary.length);
                            setFlashcardFlipped(false);
                          }}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold"
                        >
                          ← Từ trước
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const card = filteredVocabulary[flashcardIndex % filteredVocabulary.length];
                            if (card) speakChinese(card.term);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 text-white px-4 py-2 text-xs font-bold"
                        >
                          <Volume2 className="h-4 w-4" /> Phát âm
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFlashcardIndex((i) => (i + 1) % filteredVocabulary.length);
                            setFlashcardFlipped(false);
                          }}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold"
                        >
                          Từ tiếp →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {filteredVocabulary.map((v) => (
                        <div
                          key={v.id}
                          className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-sm hover:shadow-md hover:border-indigo-400/50 transition-all duration-200"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-2xl font-black text-slate-900 dark:text-white font-serif tracking-wide group-hover:text-indigo-500 transition-colors">
                                {v.term}
                              </span>
                              <button
                                type="button"
                                onClick={() => speakChinese(v.term)}
                                className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition shadow-xs"
                                title="Phát âm"
                              >
                                <Volume2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-xs mt-1">
                              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/40 dark:border-amber-900/40">
                                {v.pinyin}
                              </span>
                              {v.sinoVietnamese && (
                                <span className="text-slate-400 text-[11px] font-medium">({v.sinoVietnamese})</span>
                              )}
                              {v.partOfSpeech && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                  {v.partOfSpeech}
                                </span>
                              )}
                            </div>

                            <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 pt-2.5">
                              {v.meaning}
                            </p>
                          </div>

                          {v.exampleSentence && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs space-y-0.5 bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-xl">
                              <p className="text-slate-700 dark:text-slate-300 font-medium">{v.exampleSentence}</p>
                              {v.exampleMeaning && (
                                <p className="text-slate-400 italic text-[11px]">{v.exampleMeaning}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: CÔNG THỨC & TRỌNG TÂM */}
              {activeTab === "formulas" && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 sm:space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-emerald-500" />
                        Sổ tay Công thức & Kiến thức trọng tâm
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Công thức Toán, Lý, Hóa CSCA và cấu trúc trọng điểm cần ghi nhớ.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { id: "ALL", label: "Tất cả" },
                        { id: "MATH", label: "Toán" },
                        { id: "PHYSICS", label: "Vật lý" },
                        { id: "CHEMISTRY", label: "Hóa học" },
                      ].map((subj) => (
                        <button
                          key={subj.id}
                          type="button"
                          onClick={() => setFormulaSubjectFilter(subj.id)}
                          className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                            formulaSubjectFilter === subj.id
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {subj.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredFormulas.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Calculator className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Chưa có công thức nào trong danh mục này.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredFormulas.map((fm) => {
                        const renderedLatex = renderKaTeX(fm.latexExpression || fm.latex, true);
                        return (
                          <div
                            key={fm.id}
                            className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-amber-400/50 transition-all duration-200"
                          >
                            <div className="space-y-3">
                              {/* Header Card: Subject badge + Name + Copy button */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      {fm.subject || "CSCA"}
                                    </span>
                                    {fm.chapterName && (
                                      <span className="text-[11px] font-medium text-slate-400">
                                        • {fm.chapterName}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
                                    {fm.nameVi} {fm.nameZh && <span className="text-slate-500 dark:text-slate-400 font-normal">({fm.nameZh})</span>}
                                  </h4>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(fm.latexExpression || fm.latex || "");
                                    toast.success("Đã sao chép công thức LaTeX!");
                                  }}
                                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-amber-500 hover:text-slate-950 dark:hover:bg-amber-400 transition"
                                  title="Sao chép mã LaTeX"
                                >
                                  <Copy className="h-3 w-3" />
                                  <span>Copy</span>
                                </button>
                              </div>

                              {/* Công thức KaTeX Display Box */}
                              <div className="rounded-xl bg-slate-950 dark:bg-black/70 p-3.5 text-center border border-slate-800 shadow-inner overflow-x-auto min-h-[58px] flex items-center justify-center text-amber-300 dark:text-amber-200">
                                {renderedLatex ? (
                                  <div
                                    className="katex-formula-rendered text-base sm:text-lg"
                                    dangerouslySetInnerHTML={{ __html: renderedLatex }}
                                  />
                                ) : (
                                  <span className="text-xs text-slate-500 italic">Chưa có biểu thức</span>
                                )}
                              </div>

                              {/* Mô tả */}
                              {fm.description && (
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                                  {fm.description}
                                </p>
                              )}
                            </div>

                            {/* Chú giải biến số nếu có */}
                            {fm.variablesExplanation && fm.variablesExplanation.length > 0 && (
                              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Chú giải:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {fm.variablesExplanation.map((v, i) => (
                                    <span key={i} className="text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
                                      <strong className="font-mono text-amber-600 dark:text-amber-400">{v.symbol}</strong>: {v.meaning}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: TÀI LIỆU (WITH INTERACTIVE PREVIEW MODAL) */}
              {activeTab === "files" && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-amber-500" />
                        Tài liệu, PDF, Word & Slide đính kèm
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {capabilities.allowFileDownload
                          ? "Xem trực tiếp trên trình duyệt hoặc tải về máy để ôn luyện."
                          : "Tài liệu được mở trực tiếp trên trình duyệt để bạn học thuận tiện."}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {(activeUnit?.files || []).length} tài liệu
                    </span>
                  </div>

                  {(activeUnit?.files || []).length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Chưa có tài liệu đính kèm cho bài học này.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeUnit.files.map((file) => (
                        <div
                          key={file.id}
                          onClick={() => setPreviewFile(file)}
                          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 font-bold text-xs uppercase">
                              {file.fileName.split(".").pop() || "FILE"}
                            </span>
                            <div className="truncate">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-amber-500 transition">
                                {file.fileName}
                              </p>
                              <p className="text-xs text-slate-400 font-mono">
                                {((file.sizeBytes || 1250000) / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-sm transition"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Xem tài liệu</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openFileUrl(file.viewUrl, file.fileName)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                              title="Mở tài liệu trong tab mới"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="hidden md:inline">Tab mới</span>
                            </button>

                            {file.downloadUrl ? (
                              <button
                                type="button"
                                onClick={() => openFileUrl(file.downloadUrl, file.fileName)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>Tải về</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                                <Eye className="h-3.5 w-3.5" />
                                Chỉ xem trực tuyến
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 7: GHI CHÚ CÁ NHÂN (CONNECTED TO TIMESTAMP SEEK & API) */}
              {activeTab === "notes" && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5 sm:space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <StickyNote className="h-5 w-5 text-amber-500" />
                        Ghi chú học tập cá nhân theo mốc thời gian
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Nhấn vào nhãn thời gian trên ghi chú để tua video tới đúng vị trí bài giảng.
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1 text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5" />
                      Mốc hiện tại: {formatTimeMMSS(currentProgressSeconds)}
                    </span>
                  </div>

                  {/* Add note input */}
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <textarea
                      rows={3}
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder={`Nhập ghi chú tại mốc ${formatTimeMMSS(currentProgressSeconds)}...`}
                      className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!newNoteText.trim() || noteSubmitting}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-bold text-xs transition shadow-sm"
                      >
                        {noteSubmitting ? "Đang lưu..." : `Lưu ghi chú (${formatTimeMMSS(currentProgressSeconds)})`}
                      </button>
                    </div>
                  </form>

                  {/* Notes list */}
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {notes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        Bạn chưa có ghi chú nào cho bài học này.
                      </p>
                    ) : (
                      notes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-amber-50/50 dark:bg-slate-800/60 border border-amber-200/60 dark:border-slate-700"
                        >
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => handleJumpToTimestamp(note.timestampSeconds ?? 0)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-200/70 dark:bg-amber-950/80 hover:bg-amber-300 px-2 py-0.5 rounded transition"
                              title="Nhấn để phát video tại mốc này"
                            >
                              <Play className="h-2.5 w-2.5 fill-current" />
                              <span>{note.timestamp || formatTimeMMSS(note.timestampSeconds || 0)}</span>
                            </button>
                            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">{note.content}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="text-slate-400 hover:text-red-500 text-xs transition p-1"
                            title="Xóa ghi chú"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 8: KẾT QUẢ */}
              {activeTab === "results" && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5 sm:space-y-6">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-indigo-500" />
                      Kết quả & Tiến độ bài học
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Tiến độ xem bài và kết quả trắc nghiệm của bạn trong buổi học này.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-center space-y-1">
                      <p className="text-xs text-slate-400 font-bold uppercase">Thời gian xem Video</p>
                      <p className="text-xl font-black text-amber-500 font-mono">
                        {Math.round(unitWatchPercent)}%
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {activeVideoCompleted ? "Đã sẵn sàng học bài tiếp" : `Mục tiêu ${REQUIRED_WATCH_PERCENT}% cho từng phần`}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-center space-y-1">
                      <p className="text-xs text-slate-400 font-bold uppercase">Trắc nghiệm (Quiz)</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white font-mono">
                        {activeUnitMeta?.completedQuizCount ?? (activeUnit?.quizzes || []).filter((q) => q.isCompleted).length}/
                        {activeUnitMeta?.quizCount ?? (activeUnit?.quizzes || []).length}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(activeUnitMeta?.quizCount ?? (activeUnit?.quizzes || []).length) === 0
                          ? "Không yêu cầu ở buổi này"
                          : activeUnitMeta?.isQuizCompleted
                            ? "Đã hoàn thành Quiz"
                            : "Cần hoàn thành để mở bài tiếp"}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-center space-y-1">
                      <p className="text-xs text-slate-400 font-bold uppercase">Tổng tiến độ khóa</p>
                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {progress.overallPercent || 0}%
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {progress.completedUnits || 0}/{progress.totalUnits || units.length} bài hoàn thành
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </main>

          {/* RIGHT 4/12: Curriculum & Lessons Sidebar */}
          <aside className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-500" />
                  Lộ trình bài giảng
                </h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  {progress.completedUnits || 0}/{units.length} hoàn thành
                </span>
              </div>

              {/* Sequential Unlock Policy Mini Banner */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="leading-snug">
                  Học theo thứ tự: Xem khoảng <strong>{REQUIRED_WATCH_PERCENT}% video</strong> và <strong>hoàn thành Quiz</strong> để tiếp tục bài kế tiếp nhé.
                </p>
              </div>
            </div>

            {/* Search filter in curriculum */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm bài giảng..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Units list */}
            <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
              {filteredUnits.map((unit, index) => {
                const isCurrent = String(unit.id) === String(activeUnitId);
                const isDone = Boolean(unit.isCompleted);
                const isLocked = Boolean(unit.isLocked);
                const pct = Math.min(100, Math.max(0, Math.round(unit.progressPercent || 0)));
                const videoDone = isVideoRequirementCompleted(unit);
                const hasQuiz = Number(unit.quizCount || 0) > 0;
                const quizDone = !hasQuiz || Number(unit.completedQuizCount || 0) >= Number(unit.quizCount || 0);
                const watchedSec = Number(unit.watchedSeconds || 0);
                const totalSec = Number(unit.videoDurationSeconds || 0);
                const durationLabel = formatVideoDurationLabel(unit);

                return (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => handleSelectUnit(unit)}
                    title={isLocked ? unit.lockReason || "Hoàn thành bài trước để mở khóa" : unit.title}
                    className={`group w-full text-left p-3.5 rounded-2xl transition-all duration-200 flex items-start gap-3 border ${
                      isCurrent
                        ? "bg-indigo-50 text-indigo-950 shadow-md shadow-indigo-500/10 border-indigo-200 dark:bg-indigo-950/35 dark:text-indigo-100 dark:border-indigo-800/70"
                        : isDone
                          ? "bg-emerald-50/60 text-slate-800 border-emerald-200/80 dark:bg-emerald-950/20 dark:text-slate-100 dark:border-emerald-800/50 hover:border-emerald-400"
                          : isLocked
                            ? "bg-slate-100/70 text-slate-400 border-slate-200/60 dark:bg-slate-900/60 dark:text-slate-500 dark:border-slate-800/80 opacity-80 hover:opacity-100"
                            : "bg-slate-50/90 text-slate-800 border-slate-200/80 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-800 hover:border-amber-400/60 hover:bg-white dark:hover:bg-slate-800"
                    }`}
                  >
                    {/* Status Icon Badge */}
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border text-xs font-black transition ${
                        isCurrent
                          ? "border-indigo-600/30 bg-indigo-600 text-white dark:border-indigo-400/30 dark:bg-indigo-400 dark:text-slate-950"
                          : isDone
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : isLocked
                              ? "border-slate-300 bg-slate-200/70 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {isLocked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isCurrent ? (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      ) : (
                        <span>{unit.sessionNumber || index + 1}</span>
                      )}
                    </span>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Row 1: Session Label + Real Video Duration */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider truncate ${
                              isCurrent
                                ? "text-indigo-700 dark:text-indigo-300"
                                : isLocked
                                  ? "text-slate-400 dark:text-slate-500"
                                  : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {unit.sectionTitle || `Buổi ${unit.sessionNumber || index + 1}`}
                          </span>
                          {isLocked && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-slate-200/90 dark:bg-slate-800 px-1.5 py-0.2 text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">
                              Khóa
                            </span>
                          )}
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-mono font-bold shrink-0 ${
                            isCurrent
                              ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200"
                              : "bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          <Clock className="h-2.5 w-2.5" />
                          <span>{durationLabel}</span>
                        </span>
                      </div>

                      {/* Row 2: Lesson Title (2 lines max) */}
                      <h4
                        className={`text-xs font-extrabold leading-snug line-clamp-2 ${
                          isCurrent
                            ? "text-indigo-950 dark:text-indigo-100"
                            : isLocked
                              ? "text-slate-500 dark:text-slate-400"
                              : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {unit.title}
                      </h4>

                      {/* Row 3: Progress bar with learning target and quiz status */}
                      <div
                        className={`pt-2 border-t space-y-1.5 ${
                          isCurrent
                            ? "border-indigo-200/80 dark:border-indigo-800/70"
                            : "border-slate-200/70 dark:border-slate-800"
                        }`}
                      >
                        <div
                          className={`relative h-2 w-full rounded-full overflow-hidden ${
                            isCurrent
                              ? "bg-indigo-200/80 dark:bg-indigo-900/70"
                              : "bg-slate-200/90 dark:bg-slate-700/70"
                          }`}
                        >
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              isCurrent
                                ? "bg-indigo-600 dark:bg-indigo-300"
                                : videoDone
                                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                  : pct > 0
                                    ? "bg-gradient-to-r from-amber-500 to-orange-400"
                                    : "bg-transparent"
                            }`}
                          />
                          {/* Learning target tick mark */}
                          <div
                            className={`pointer-events-none absolute inset-y-0 w-0.5 ${
                              isCurrent ? "bg-white/75" : "bg-slate-900/40 dark:bg-white/40"
                            }`}
                            style={{ left: `${REQUIRED_WATCH_PERCENT}%` }}
                            title={`Mục tiêu ${REQUIRED_WATCH_PERCENT}% để tiếp tục`}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                          <span
                            className={`font-mono font-semibold ${
                              isCurrent
                                ? "text-indigo-800 dark:text-indigo-200"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {totalSec > 0
                              ? `Đã xem: ${formatTimeMMSS(watchedSec)} / ${formatTimeMMSS(totalSec)}`
                              : watchedSec > 0
                                ? `Đã xem: ${formatTimeMMSS(watchedSec)}`
                                : isLocked
                                  ? "Hoàn thành buổi trước để mở"
                                  : "Chưa xem"}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`rounded-md px-1.5 py-0.5 font-mono font-black ${
                                isCurrent
                                  ? "bg-indigo-600 text-white dark:bg-indigo-300 dark:text-indigo-950"
                                  : videoDone
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                    : pct > 0
                                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                                      : "bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {pct}%/{REQUIRED_WATCH_PERCENT}%
                            </span>

                            {hasQuiz && (
                              <span
                                className={`rounded-md px-1.5 py-0.5 font-bold ${
                                  isCurrent
                                    ? quizDone
                                      ? "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950"
                                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200"
                                    : quizDone
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                      : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                                }`}
                              >
                                {quizDone ? "✓" : "📝"} Quiz {unit.completedQuizCount || 0}/{unit.quizCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>

      {/* 3. FULL DOCUMENT / SLIDE PREVIEW MODAL */}
      {previewFile && (
        <DocumentPreviewModal
          file={previewFile}
          courseTitle={course?.title}
          unitTitle={activeUnit?.title}
          onClose={() => setPreviewFile(null)}
          onDownload={previewFile.downloadUrl ? () => openFileUrl(previewFile.downloadUrl) : undefined}
        />
      )}

      {/* TRUSTED DEVICES DIALOG */}
      {trustedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Thiết bị tin cậy</h3>
                  <p className="text-xs text-slate-500">Giới hạn tối đa 2 thiết bị / trình duyệt</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTrustedModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Explanation Notice */}
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <p className="font-bold text-amber-700 dark:text-amber-400">
                🔒 Chính sách bảo mật khóa học video:
              </p>
              <p>
                Trình duyệt này đã được ghi nhớ; khi đăng xuất rồi đăng nhập lại trên cùng trình duyệt sẽ <strong>không chiếm thêm thiết bị</strong>. Học viên chỉ xem danh sách thiết bị; liên hệ Admin nếu cần đổi máy mới.
              </p>
            </div>

            {/* Devices list */}
            <div className="space-y-3 pt-1">
              {deviceLoading ? (
                <p className="text-center text-xs text-slate-400 py-4">Đang tải danh sách thiết bị...</p>
              ) : deviceList.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">Chưa có thiết bị nào được lưu.</p>
              ) : (
                deviceList.map((dev) => (
                  <div
                    key={dev.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm">
                        {dev.deviceName?.toLowerCase().includes("mobile") || dev.deviceName?.toLowerCase().includes("android") || dev.deviceName?.toLowerCase().includes("iphone") ? (
                          <Smartphone className="h-5 w-5" />
                        ) : (
                          <Laptop className="h-5 w-5" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{dev.deviceName || "Trình duyệt Web"}</p>
                          {dev.isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white">
                              Hiện tại
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          IP: {dev.lastIp || "127.0.0.1"} • Đăng nhập: {new Date(dev.lastLoginAt || Date.now()).toLocaleDateString("vi-VN")}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      Đã xác thực
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setTrustedModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MOBILE CURRICULUM DRAWER / MODAL */}
      {mobileCurriculumOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setMobileCurriculumOpen(false)}
          />
          <div className="relative z-10 max-h-[85vh] flex flex-col rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 space-y-3.5">
            {/* Drawer Handle */}
            <div className="mx-auto h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />

            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-500" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Lộ trình bài giảng
                </h3>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                  {progress.completedUnits || 0}/{units.length} hoàn thành
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileCurriculumOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sequential Unlock Info */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Học theo thứ tự: Xem khoảng <strong>{REQUIRED_WATCH_PERCENT}% video</strong> và <strong>hoàn thành Quiz</strong> để tiếp tục bài kế tiếp nhé.
              </p>
            </div>

            {/* Search input in drawer */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm bài giảng..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Drawer Units List */}
            <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1 pb-4">
              {filteredUnits.map((unit, index) => {
                const isCurrent = String(unit.id) === String(activeUnitId);
                const isDone = Boolean(unit.isCompleted);
                const isLocked = Boolean(unit.isLocked);
                const pct = Math.min(100, Math.max(0, Math.round(unit.progressPercent || 0)));
                const durationLabel = formatVideoDurationLabel(unit);

                return (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => {
                      handleSelectUnit(unit);
                      setMobileCurriculumOpen(false);
                    }}
                    className={`group w-full text-left p-3 rounded-2xl transition-all duration-200 flex items-start gap-3 border ${
                      isCurrent
                        ? "bg-indigo-50 text-indigo-950 shadow-sm border-indigo-200 dark:bg-indigo-950/35 dark:text-indigo-100 dark:border-indigo-800/70"
                        : isDone
                          ? "bg-emerald-50/60 text-slate-800 border-emerald-200/80 dark:bg-emerald-950/20 dark:text-slate-100 dark:border-emerald-800/50"
                          : isLocked
                            ? "bg-slate-100/70 text-slate-400 border-slate-200/60 dark:bg-slate-900/60 dark:text-slate-500 dark:border-slate-800/80 opacity-80"
                            : "bg-slate-50/90 text-slate-800 border-slate-200/80 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border text-xs font-black transition ${
                        isCurrent
                          ? "border-indigo-600/30 bg-indigo-600 text-white dark:border-indigo-400/30 dark:bg-indigo-400 dark:text-slate-950"
                          : isDone
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : isLocked
                              ? "border-slate-300 bg-slate-200/70 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {isLocked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isCurrent ? (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      ) : (
                        <span>{unit.sessionNumber || index + 1}</span>
                      )}
                    </span>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider truncate ${
                            isCurrent
                              ? "text-indigo-700 dark:text-indigo-300"
                              : isLocked
                                ? "text-slate-400 dark:text-slate-500"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {unit.sectionTitle || `Buổi ${unit.sessionNumber || index + 1}`}
                        </span>
                        {durationLabel && (
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                            {durationLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                        {unit.title}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>Video: {pct}%</span>
                        {Number(unit.quizCount || 0) > 0 && (
                          <span>• Quiz: {unit.completedQuizCount || 0}/{unit.quizCount}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
