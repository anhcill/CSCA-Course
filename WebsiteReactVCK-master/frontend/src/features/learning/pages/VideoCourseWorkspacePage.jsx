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
  Info,
  Volume2,
  Search,
  RotateCcw,
  Video,
  Eye,
  Copy,
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

const sanitizeTheoryHtml = (html) => {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return "";

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const allowedTags = new Set([
    "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "i", "li", "ol", "p", "pre", "span", "strong", "sub", "sup", "table", "tbody", "td",
    "th", "thead", "tr", "u", "ul",
  ]);
  const allowedAttributes = new Set(["colspan", "href", "rel", "rowspan", "target", "title"]);
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

export default function VideoCourseWorkspacePage() {
  const { offeringId, unitId: paramUnitId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const { isDarkMode } = useTheme();

  const [workspaceData, setWorkspaceData] = useState(null);
  const [activeUnitId, setActiveUnitId] = useState(paramUnitId || null);
  const [activeTab, setActiveTab] = useState("video");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Video Player & Watch Progress state
  const [isCompletedUnit, setIsCompletedUnit] = useState(false);
  const [currentProgressSeconds, setCurrentProgressSeconds] = useState(0);
  const [unitWatchPercent, setUnitWatchPercent] = useState(0);
  const [seekRequest, setSeekRequest] = useState(null);

  // Document / Slide Preview Modal State
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
    try {
      const res = await fetchVideoCourseWorkspace(offeringId, { unitId: unitTarget });
      if (res?.success && res.data) {
        setWorkspaceData(res.data);
        if (res.data.activeUnit?.id) {
          const au = res.data.activeUnit;
          setActiveUnitId(au.id);
          setIsCompletedUnit(Boolean(au.watchProgress?.isCompleted));
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
    } finally {
      setLoading(false);
    }
  }, [offeringId]);

  useEffect(() => {
    loadWorkspace(paramUnitId);
  }, [loadWorkspace, paramUnitId]);

  // Handle switching unit
  const handleSelectUnit = (unit) => {
    if (String(unit.id) === String(activeUnitId)) return;
    setActiveUnitId(unit.id);
    navigate(`/video-courses/${offeringId}/units/${unit.id}`, { replace: true });
    loadWorkspace(unit.id);
  };

  // Sync live progress updates from BunnyStreamPlayer into workspace state
  const handlePlayerProgressChange = useCallback(({
    currentTimeSeconds,
    completionPercent,
    isCompleted,
  }) => {
    setCurrentProgressSeconds(currentTimeSeconds);
    setUnitWatchPercent(completionPercent);
    if (isCompleted) {
      setIsCompletedUnit(true);
    }

    setWorkspaceData((prev) => {
      if (!prev) return prev;
      const updatedUnits = (prev.units || []).map((u) => {
        if (String(u.id) !== String(activeUnitId)) return u;
        return {
          ...u,
          progressPercent: Math.max(u.progressPercent || 0, completionPercent),
          isCompleted: u.isCompleted || isCompleted,
          lastPositionSeconds: currentTimeSeconds,
        };
      });
      const completedCount = updatedUnits.filter((u) => u.isCompleted).length;
      const totalCount = updatedUnits.length || 1;
      return {
        ...prev,
        units: updatedUnits,
        progress: {
          completedUnits: completedCount,
          totalUnits: updatedUnits.length,
          overallPercent: Math.round((completedCount / totalCount) * 100),
        },
      };
    });
  }, [activeUnitId]);

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

  const openFileUrl = (url) => {
    if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/api/"))) {
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

  if (loading && !workspaceData) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <LoadingState message="Đang khởi tạo không gian khóa học video Bunny Stream..." count={3} />
      </div>
    );
  }

  if (errorMessage && !workspaceData) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <ErrorState
          title="Không thể mở không gian học video"
          message={errorMessage}
          onRetry={() => loadWorkspace(activeUnitId)}
        />
      </div>
    );
  }

  const {
    course,
    sourceClass,
    mode,
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
  const isMirrorMode = mode === "RECORD_MIRROR";
  const slideFiles = (activeUnit?.files || []).filter((f) =>
    /\.(pdf|ppt|pptx|doc|docx)$/i.test(f.fileName || ""),
  );

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#f8fafc] text-slate-900"} font-sans antialiased transition-colors duration-200`}>
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
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                  isMirrorMode
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800"
                    : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
                }`}>
                  <Sparkles className="h-2.5 w-2.5" />
                  {isMirrorMode ? "Record kế thừa" : "Video độc lập"}
                </span>

                {isMirrorMode && sourceClass && (
                  <span className="hidden sm:inline-flex text-[11px] text-slate-500 dark:text-slate-400">
                    Nguồn: <strong className="ml-1 text-slate-700 dark:text-slate-300 font-semibold">{sourceClass.title}</strong>
                  </span>
                )}
              </div>

              <h1 className="truncate text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                {course?.title || "Không gian bài giảng Video"}
              </h1>
            </div>
          </div>

          {/* Right: Security & Progress */}
          <div className="flex items-center gap-3 shrink-0">
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
            {/* Active unit title & action bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">
                    {activeUnit?.sectionTitle || (activeUnit?.sessionNumber ? `Buổi ${activeUnit.sessionNumber}` : "Bài học")}
                  </span>
                  {isCompletedUnit && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> Đã hoàn thành
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-snug break-words">
                  {activeUnit?.title || "Đang tải bài học..."}
                </h2>
              </div>

              {/* Completion is derived from verified playback progress. */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border ${
                    isCompletedUnit
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isCompletedUnit ? "Đã hoàn thành" : `${Math.round(unitWatchPercent)}% đã xem`}</span>
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
                    title={nextUnit ? `Bài tiếp: ${nextUnit.title}` : "Hết bài"}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* TAB BAR: 8 tabs as specified in Section 4.2 */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 rounded-2xl p-1.5 backdrop-blur-sm shadow-sm overflow-x-auto scrollbar-none">
              <nav className="flex gap-1 min-w-max">
                {[
                  { id: "video", label: "Video bài giảng", icon: Video },
                  { id: "theory", label: "Lý thuyết & Slide", icon: BookOpen },
                  { id: "exercises", label: "Bài tập & Quiz", icon: FileCheck2 },
                  { id: "vocabulary", label: "Từ vựng", icon: Languages },
                  { id: "formulas", label: "Công thức / Trọng tâm", icon: Calculator },
                  { id: "files", label: "Tài liệu", icon: FolderOpen },
                  { id: "notes", label: "Ghi chú cá nhân", icon: StickyNote },
                  { id: "results", label: "Kết quả", icon: BarChart3 },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      activeTab === id
                        ? "bg-slate-900 text-white shadow dark:bg-amber-500 dark:text-slate-950"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* TAB CONTENTS */}
            <div className="min-h-[460px]">
              {/* TAB 1: VIDEO BÀI GIẢNG (BUNNY STREAM PLAYER) */}
              {activeTab === "video" && capabilities.canPlayVideo !== false && (
                <div className="space-y-4">
                  <BunnyStreamPlayer
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
                    onQuickNoteAtTime={handleQuickNoteAtTime}
                  />

                  {/* Interactive Video Chapters / Timestamps if available */}
                  {activeUnit?.theory?.timestamps && activeUnit.theory.timestamps.length > 0 && (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        Phân đoạn nội dung bài giảng (Chapters)
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {activeUnit.theory.timestamps.map((ts, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleJumpToTimestamp(ts.seconds)}
                            className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-2.5 text-left hover:border-amber-400 transition"
                          >
                            <span className="rounded-lg bg-amber-500/15 px-2 py-1 font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">
                              {formatTimeMMSS(ts.seconds)}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                              {ts.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LÝ THUYẾT & SLIDE */}
              {activeTab === "theory" && (
                <div className="space-y-5">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
                    {/* Summary Box */}
                    {activeUnit?.theory?.summary && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
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
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Kiến thức trọng tâm</h3>
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

                    {/* Theory Content Body */}
                    <div className="prose prose-sm dark:prose-invert max-w-none pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: sanitizeTheoryHtml(activeUnit?.theory?.contentHtml) || "<p>Chưa có văn bản lý thuyết cho bài học này.</p>",
                        }}
                      />
                    </div>
                  </div>

                  {/* Embedded Slide / PDF Preview Section */}
                  {slideFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-amber-500" />
                          <span>Slide & Giáo trình trình chiếu trực tiếp</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowInlineSlidePreview((s) => !s)}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {showInlineSlidePreview ? "Thu gọn trình chiếu" : "Mở trình chiếu Slide"}
                        </button>
                      </div>

                      {showInlineSlidePreview && (
                        <DocumentPreviewModal
                          file={slideFiles[0]}
                          courseTitle={course?.title}
                          unitTitle={activeUnit?.title}
                          onDownload={slideFiles[0].downloadUrl ? () => openFileUrl(slideFiles[0].downloadUrl) : undefined}
                          inline
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: BÀI TẬP & QUIZ */}
              {activeTab === "exercises" && (
                <div className="space-y-6">
                  {/* Quizzes Section */}
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-amber-500" />
                        Trắc nghiệm & Quiz củng cố
                      </h3>
                      <span className="text-xs text-slate-400 font-mono">
                        {(activeUnit?.quizzes || []).length} bài test
                      </span>
                    </div>

                    {(activeUnit?.quizzes || []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-3">Chưa có bài quiz nào cho bài học này.</p>
                    ) : (
                      <div className="space-y-3">
                        {activeUnit.quizzes.map((quiz) => (
                          <div
                            key={quiz.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-amber-400 transition"
                          >
                            <div className="space-y-1">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{quiz.title}</h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                                <span>Thời gian: {quiz.durationMinutes} phút</span>
                                <span>•</span>
                                <span>Điểm đạt: {quiz.passingScore}%</span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => navigate(`/lms/quizzes/${quiz.id}`)}
                              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs transition shadow-sm self-start sm:self-auto shrink-0"
                            >
                              Làm bài quiz →
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assignments Section */}
                  {capabilities.canSubmitAssignments !== false && (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
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
                                  {isMirrorMode && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                      Học viên Record
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Thang điểm: {assignment.maxScore}đ {assignment.dueDate ? `• Hạn nộp: ${new Date(assignment.dueDate).toLocaleDateString("vi-VN")}` : ""}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => navigate(`/lms/assignments/${assignment.id}/submit`)}
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
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      {filteredVocabulary.map((v) => (
                        <div
                          key={v.id}
                          className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4 space-y-2 hover:shadow-md transition"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-black text-slate-900 dark:text-white font-serif">{v.term}</span>
                            <button
                              type="button"
                              onClick={() => speakChinese(v.term)}
                              className="p-2 rounded-xl bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:text-blue-600 shadow-sm transition"
                              title="Nghe phát âm"
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono text-red-600 dark:text-amber-400 font-bold">{v.pinyin}</span>
                            {v.sinoVietnamese && (
                              <span className="text-slate-400">({v.sinoVietnamese})</span>
                            )}
                            {v.partOfSpeech && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                                {v.partOfSpeech}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 pt-1">
                            {v.meaning}
                          </p>

                          {v.exampleSentence && (
                            <div className="text-xs pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-0.5">
                              <p className="text-slate-700 dark:text-slate-300 font-medium">{v.exampleSentence}</p>
                              {v.exampleMeaning && (
                                <p className="text-slate-500 italic text-[11px]">{v.exampleMeaning}</p>
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
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
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

                    <div className="flex items-center gap-1.5">
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
                    <div className="space-y-4">
                      {filteredFormulas.map((fm) => (
                        <div
                          key={fm.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                {fm.subject} • {fm.chapterName}
                              </span>
                              <h4 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                                {fm.nameVi} {fm.nameZh ? `(${fm.nameZh})` : ""}
                              </h4>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(fm.latexExpression);
                                toast.success("Đã sao chép biểu thức công thức!");
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition"
                              title="Sao chép LaTeX"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </button>
                          </div>

                          {/* Formula Expression Box */}
                          <div className="rounded-xl bg-white dark:bg-slate-950 p-4 text-center font-mono text-base sm:text-lg font-bold border border-slate-200/80 dark:border-slate-800 text-indigo-600 dark:text-sky-300 overflow-x-auto">
                            {fm.latexExpression}
                          </div>

                          {fm.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {fm.description}
                            </p>
                          )}

                          {fm.variablesExplanation && fm.variablesExplanation.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Chú giải biến số:</p>
                              <div className="flex flex-wrap gap-2">
                                {fm.variablesExplanation.map((v, i) => (
                                  <span key={i} className="text-xs bg-slate-200/70 dark:bg-slate-700/70 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                    <strong className="font-mono">{v.symbol}</strong>: {v.meaning}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: TÀI LIỆU (WITH INTERACTIVE PREVIEW MODAL) */}
              {activeTab === "files" && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-amber-500" />
                        Tài liệu, PDF, Word & Slide đính kèm
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Xem trực tiếp trên trình duyệt hoặc tải về máy để ôn luyện.
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
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 font-bold text-xs uppercase">
                              {file.fileName.split(".").pop() || "FILE"}
                            </span>
                            <div className="truncate">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{file.fileName}</p>
                              <p className="text-xs text-slate-400 font-mono">
                                {((file.sizeBytes || 1250000) / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Xem trực tiếp</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openFileUrl(file.downloadUrl)}
                              disabled={!file.downloadUrl}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm border border-slate-200 dark:border-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 transition"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>{file.downloadUrl ? "Tải về" : "Chỉ xem"}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 7: GHI CHÚ CÁ NHÂN (CONNECTED TO TIMESTAMP SEEK & API) */}
              {activeTab === "notes" && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
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
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-indigo-500" />
                      Kết quả & Tiến độ bài học
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Thống kê tiến độ xem video (chuẩn hoàn thành ≥ 85%) và điểm số bài tập của bạn.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-center space-y-1">
                      <p className="text-xs text-slate-400 font-bold uppercase">Tiến độ xem Video</p>
                      <p className="text-xl font-black text-amber-500 font-mono">
                        {Math.round(unitWatchPercent)}%
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isCompletedUnit ? "Đã đạt chuẩn ≥ 85%" : "Cần đạt 85% để hoàn thành"}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-center space-y-1">
                      <p className="text-xs text-slate-400 font-bold uppercase">Bài tập nộp</p>
                      <p className="text-xl font-black text-slate-900 dark:text-white font-mono">
                        {(activeUnit?.assignments || []).filter((a) => a.isSubmitted).length}/{(activeUnit?.assignments || []).length}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isMirrorMode ? "Giáo viên lớp nguồn chấm" : "Hệ thống chấm điểm"}
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
          </main>

          {/* RIGHT 4/12: Curriculum & Lessons Sidebar */}
          <aside className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-500" />
                Danh sách bài học
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">
                {units.length} bài
              </span>
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
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredUnits.map((unit, index) => {
                const isCurrent = String(unit.id) === String(activeUnitId);
                const isDone = unit.isCompleted;
                const statusBadge = unit.videoStatus && unit.videoStatus !== "ready" && unit.videoStatus !== "none"
                  ? unit.videoStatus
                  : null;

                return (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => handleSelectUnit(unit)}
                    className={`w-full text-left p-3.5 rounded-2xl transition flex items-start gap-3 border ${
                      isCurrent
                        ? "bg-slate-900 text-white shadow-lg shadow-slate-950/20 border-slate-900 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500"
                        : isDone
                          ? "bg-emerald-50/50 text-slate-800 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-slate-200 dark:border-emerald-900/40 hover:bg-emerald-50"
                          : "bg-slate-50/80 text-slate-700 border-slate-200/70 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {/* Status Icon */}
                    <span className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className={`h-4 w-4 ${isCurrent ? "text-white dark:text-slate-950" : "text-emerald-500"}`} />
                      ) : isCurrent ? (
                        <Play className="h-4 w-4 fill-current text-white dark:text-slate-950" />
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 text-[10px] font-bold text-slate-400">
                          {index + 1}
                        </span>
                      )}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                          isCurrent ? "text-white/80 dark:text-slate-900/80" : "text-slate-400"
                        }`}>
                          {unit.sectionTitle || `Buổi ${unit.sessionNumber || index + 1}`}
                        </span>
                        <span className={`text-[10px] font-mono shrink-0 ${
                          isCurrent ? "text-white/80 dark:text-slate-900/80" : "text-slate-400"
                        }`}>
                          {unit.durationMinutes}p
                        </span>
                      </div>

                      <h4 className={`text-xs font-bold truncate mt-0.5 ${
                        isCurrent ? "text-white dark:text-slate-950" : "text-slate-900 dark:text-white"
                      }`}>
                        {unit.title}
                      </h4>

                      {(unit.progressPercent > 0 || statusBadge) && (
                        <div className="mt-1.5 flex items-center gap-2">
                          {unit.progressPercent > 0 && (
                            <div className="flex-1 h-1 rounded-full bg-black/15 dark:bg-white/15 overflow-hidden">
                              <div
                                style={{ width: `${Math.min(100, unit.progressPercent)}%` }}
                                className={`h-full rounded-full ${
                                  isCurrent ? "bg-amber-400 dark:bg-slate-950" : "bg-emerald-500"
                                }`}
                              />
                            </div>
                          )}
                          {statusBadge && (
                            <span className="rounded px-1.5 py-0.2 text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400">
                              {statusBadge}
                            </span>
                          )}
                        </div>
                      )}
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
    </div>
  );
}
