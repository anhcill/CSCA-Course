import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Files,
  FolderOpen,
  Eye,
  LayoutGrid,
  Search,
  BookOpen,
  School,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import { fetchStudentFiles, fetchStudentClassesLookup } from "../../api/lmsClient";
import { ErrorState } from "../../../components/common/StateView";
import usePersistentClassSelection from "../hooks/usePersistentClassSelection";

const mimeType = (file) => String(file.mimeType || file.mime_type || "").toLowerCase();
const fileSize = (value) => {
  const bytes = Number(value) || 0;
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateOnly = (dateString) => {
  if (!dateString) return "Chưa có ngày";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Chưa có ngày";
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatTimeRange = (startTime, endTime) => {
  if (!startTime) return "";
  const start = new Date(startTime);
  const startStr = Number.isNaN(start.getTime())
    ? ""
    : start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (!endTime) return startStr;
  const end = new Date(endTime);
  const endStr = Number.isNaN(end.getTime())
    ? ""
    : end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return startStr && endStr ? `${startStr} - ${endStr}` : startStr;
};

function kindForFile(file) {
  const value = (mimeType(file) + " " + String(file.name || "")).toLowerCase();
  if (value.includes("pdf")) return "pdf";
  if (value.includes("word") || value.includes("document") || value.includes("doc")) return "doc";
  if (value.includes("sheet") || value.includes("excel") || value.includes("xls") || value.includes("csv")) return "sheet";
  if (value.includes("presentation") || value.includes("powerpoint") || value.includes("ppt")) return "slide";
  if (value.includes("image") || value.includes("png") || value.includes("jpg") || value.includes("jpeg")) return "image";
  return "other";
}

const fileConfig = {
  pdf: {
    label: "PDF",
    icon: FileText,
    className: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200/80 dark:border-rose-900/60",
    pill: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300",
  },
  doc: {
    label: "Word",
    icon: FileText,
    className: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200/80 dark:border-blue-900/60",
    pill: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300",
  },
  sheet: {
    label: "Excel",
    icon: FileSpreadsheet,
    className: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/60",
    pill: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
  },
  slide: {
    label: "Slide",
    icon: FileText,
    className: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200/80 dark:border-amber-900/60",
    pill: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
  },
  image: {
    label: "Ảnh",
    icon: Files,
    className: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200/80 dark:border-purple-900/60",
    pill: "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300",
  },
  other: {
    label: "Tài liệu",
    icon: Files,
    className: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-900/60",
    pill: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300",
  },
};

function StudentFileCard({ file, onDownload }) {
  const kind = kindForFile(file);
  const config = fileConfig[kind] || fileConfig.other;
  const Icon = config.icon;
  const downloadUrl = file.downloadUrl || file.download_url;
  const viewUrl = file.viewUrl || file.view_url || downloadUrl;
  const canDownload = file.canDownload !== false && Boolean(downloadUrl);

  return (
    <div className="group/file flex flex-col justify-between rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-xs transition space-y-2">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${config.className}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${config.pill}`}>
              {config.label}
            </span>
          </div>
          {file.sizeBytes ? (
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
              {fileSize(file.sizeBytes)}
            </span>
          ) : null}
        </div>

        <div>
          <h4
            className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug group-hover/file:text-blue-600 dark:group-hover/file:text-blue-400 transition"
            title={file.name}
          >
            {viewUrl ? (
              <a href={viewUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {file.name}
              </a>
            ) : (
              file.name
            )}
          </h4>
          {file.sessionTitle && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
              Buổi: {file.sessionTitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px]">
        <span className="text-slate-400 dark:text-slate-500 truncate max-w-[100px]">
          {file.uploadedBy || "Giáo viên"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-slate-600 transition"
              title="Xem trực tuyến"
            >
              <Eye className="h-3 w-3" />
              <span>Xem</span>
            </a>
          )}
          {canDownload ? (
            <button
              type="button"
              onClick={() => onDownload(file)}
              className="inline-flex items-center gap-1 rounded-md bg-[#102f63] dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white px-2 py-0.5 text-[10px] font-bold shadow-2xs transition active:scale-95"
              title="Tải về máy"
            >
              <Download className="h-3 w-3" />
              <span>Tải</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              Chỉ xem
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentFilesPage() {
  const { courseId: routeCourseId, classId: routeClassId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [classesLookup, setClassesLookup] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [classSearchQuery, setClassSearchQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");
  const [viewMode, setViewMode] = useState("by_class"); // 'by_class' (default) | 'timeline' | 'cards'
  const [sessionVisibilityFilter, setSessionVisibilityFilter] = useState("all_sessions"); // 'all_sessions' | 'only_with_files'

  // URL / route filters
  const selectedCourseId = routeCourseId || searchParams.get("courseId") || "all";
  const urlClassId = routeClassId || searchParams.get("classId") || null;
  const selectedTimePreset = searchParams.get("time") || "all"; // 'all', 'today', 'week'

  const eligibleClassIds = useMemo(() => classesLookup
    .filter((item) => selectedCourseId === "all" || String(item.courseId) === String(selectedCourseId))
    .map((item) => item.id), [classesLookup, selectedCourseId]);
  const [activeClassId, setActiveClassId] = usePersistentClassSelection({
    scope: "files",
    availableClassIds: eligibleClassIds,
    allValue: "all",
    ready: !loading,
    preferredValue: urlClassId,
  });
  const requestedClassId = viewMode === "by_class" || activeClassId === "all"
    ? undefined
    : activeClassId;

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [lookupRes, filesRes] = await Promise.all([
        fetchStudentClassesLookup().catch((err) => {
          console.warn("fetchStudentClassesLookup warning:", err);
          return { data: [] };
        }),
        fetchStudentFiles({
          courseId: selectedCourseId !== "all" ? selectedCourseId : undefined,
          classId: requestedClassId,
        }),
      ]);

      setClassesLookup(Array.isArray(lookupRes?.data) ? lookupRes.data : []);
      setFiles(Array.isArray(filesRes?.data) ? filesRes.data : []);
    } catch (error) {
      console.error("Unable to load student files", error);
      setErrorMessage("Không thể tải tài liệu học tập. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }, [requestedClassId, selectedCourseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Statistics calculation for Header Badges
  const stats = useMemo(() => {
    let pdfCount = 0;
    let docCount = 0;
    let otherCount = 0;

    files.forEach((f) => {
      const k = kindForFile(f);
      if (k === "pdf") pdfCount += 1;
      else if (k === "doc") docCount += 1;
      else otherCount += 1;
    });

    return { pdfCount, docCount, otherCount };
  }, [files]);

  // Extract unique courses and classes for filters
  const filterOptions = useMemo(() => {
    const coursesMap = new Map();
    const classesMap = new Map();

    for (const c of classesLookup) {
      if (c.courseId && !coursesMap.has(c.courseId)) {
        coursesMap.set(c.courseId, { id: c.courseId, title: c.courseTitle, category: c.courseCategory });
      }
      if (c.id && !classesMap.has(c.id)) {
        classesMap.set(c.id, { id: c.id, title: c.title, courseId: c.courseId });
      }
    }

    for (const f of files) {
      if (f.courseId && !coursesMap.has(f.courseId)) {
        coursesMap.set(f.courseId, { id: f.courseId, title: f.courseTitle, category: f.courseCategory });
      }
      if (f.classId && !classesMap.has(f.classId)) {
        classesMap.set(f.classId, { id: f.classId, title: f.classTitle, courseId: f.courseId });
      }
    }

    return {
      courses: Array.from(coursesMap.values()),
      classes: Array.from(classesMap.values()),
    };
  }, [classesLookup, files]);

  // Available classes for current course selection
  const availableClasses = useMemo(() => {
    if (selectedCourseId === "all") return classesLookup;
    return classesLookup.filter((c) => String(c.courseId) === String(selectedCourseId));
  }, [classesLookup, selectedCourseId]);

  // Filtered files based on search, kind, time
  const visibleFiles = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    return files.filter((file) => {
      // Kind filter
      const matchesKind = selectedKind === "all" || kindForFile(file) === selectedKind;
      if (!matchesKind) return false;

      // Text search
      const needle = query.trim().toLowerCase();
      if (needle) {
        const matchesQuery = [
          file.name,
          file.courseTitle,
          file.course_title,
          file.classTitle,
          file.sessionTitle,
          file.teacherName,
          file.teacher_name,
          file.uploadedBy,
        ].some((val) => String(val || "").toLowerCase().includes(needle));
        if (!matchesQuery) return false;
      }

      // Time preset
      if (selectedTimePreset === "today") {
        const fileDate = (file.sessionStartTime || file.uploadedAt || "").slice(0, 10);
        if (fileDate !== todayStr) return false;
      } else if (selectedTimePreset === "week") {
        const fileTime = new Date(file.sessionStartTime || file.uploadedAt).getTime();
        if (fileTime < startOfWeek.getTime()) return false;
      }

      return true;
    });
  }, [files, query, selectedKind, selectedTimePreset]);

  // Handlers for URL filters & Class selection
  const handleSelectClass = (classId) => {
    const nextClassId = classId || "all";
    setActiveClassId(nextClassId);
    const next = new URLSearchParams(searchParams);
    if (nextClassId === "all") {
      next.delete("classId");
    } else {
      next.set("classId", nextClassId);
    }
    setSearchParams(next);
  };

  // Filtered classes by search in the grid
  const searchedClasses = useMemo(() => {
    if (!classSearchQuery.trim()) return availableClasses;
    const q = classSearchQuery.trim().toLowerCase();
    return availableClasses.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.courseTitle || "").toLowerCase().includes(q) ||
        (c.courseCategory || "").toLowerCase().includes(q)
    );
  }, [availableClasses, classSearchQuery]);

  // Currently active class
  const activeClass = useMemo(() => {
    if (!activeClassId || activeClassId === "all") return null;
    return classesLookup.find((c) => String(c.id) === String(activeClassId)) || null;
  }, [classesLookup, activeClassId]);

  // Files of active class
  const activeClassFiles = useMemo(() => {
    if (!activeClassId || activeClassId === "all") return [];
    return visibleFiles.filter((f) => String(f.classId) === String(activeClassId));
  }, [visibleFiles, activeClassId]);

  // General files of active class (not tied to any session)
  const activeClassGeneralFiles = useMemo(() => {
    return activeClassFiles.filter((f) => !f.classSessionId);
  }, [activeClassFiles]);

  // Smart Sessions grouping for active class
  const activeClassSessionsGrouped = useMemo(() => {
    if (!activeClass) return [];

    const sessionsList = Array.isArray(activeClass.sessions) ? [...activeClass.sessions] : [];
    const sessionMap = new Map();

    sessionsList.forEach((s) => {
      sessionMap.set(String(s.id), {
        ...s,
        files: [],
      });
    });

    activeClassFiles.forEach((f) => {
      if (f.classSessionId) {
        const sId = String(f.classSessionId);
        if (!sessionMap.has(sId)) {
          sessionMap.set(sId, {
            id: sId,
            classId: activeClass.id,
            title: f.sessionTitle || "Buổi học bổ sung",
            startTime: f.sessionStartTime || f.uploadedAt,
            endTime: f.sessionEndTime || null,
            status: "active",
            files: [],
          });
        }
        sessionMap.get(sId).files.push(f);
      }
    });

    return Array.from(sessionMap.values()).sort((a, b) => {
      if (a.startTime && b.startTime) {
        return new Date(a.startTime) - new Date(b.startTime);
      }
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }, [activeClass, activeClassFiles]);

  // Displayed sessions according to visibility toggle
  const displayedSessions = useMemo(() => {
    if (sessionVisibilityFilter === "only_with_files") {
      return activeClassSessionsGrouped.filter((s) => s.files.length > 0);
    }
    return activeClassSessionsGrouped;
  }, [activeClassSessionsGrouped, sessionVisibilityFilter]);

  // System/Course general files (files without a specific class)
  const systemGeneralFiles = useMemo(() => {
    return visibleFiles.filter((f) => !f.classId);
  }, [visibleFiles]);

  // Group files by date for Timeline view
  const timelineGroups = useMemo(() => {
    const map = new Map();
    for (const file of visibleFiles) {
      const dateKey = file.sessionStartTime
        ? file.sessionStartTime.slice(0, 10)
        : (file.uploadedAt ? file.uploadedAt.slice(0, 10) : "no-date");
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey).push(file);
    }

    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "no-date") return 1;
      if (b[0] === "no-date") return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [visibleFiles]);

  const download = (file) => {
    const url = file.downloadUrl || file.download_url;
    if (!url) return toast.error("Tài liệu này chưa có đường dẫn tải xuống.");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCourseFilterChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("courseId");
    else next.set("courseId", val);
    next.delete("classId");
    setActiveClassId("all");
    setSearchParams(next);
  };

  const handleClassFilterChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") {
      next.delete("classId");
      setActiveClassId("all");
    } else {
      next.set("classId", val);
      setActiveClassId(val);
    }
    setSearchParams(next);
  };

  const handleTimeFilterChange = (val) => {
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("time");
    else next.set("time", val);
    setSearchParams(next);
  };

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px] space-y-3">
        {/* Calligraphic Header directly on Scenic Background */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-0.5 pb-1">
          <div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl font-extrabold tracking-tight text-[#102f63] dark:text-white drop-shadow-xs sm:text-5xl">
              Kho Tài Liệu Học Tập
            </h1>
            <p className="mt-1 text-xs font-semibold italic text-slate-800 dark:text-slate-300 sm:text-sm">
              “Sách vở là kho tàng tri thức, tích lũy mỗi ngày để vươn xa.”
            </p>
            <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm tracking-wider text-slate-600 dark:text-slate-400 sm:text-base">
              —— 积学以明志，温故而知新。
            </p>
          </div>

          {/* 4 Compact Metric Pill Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tổng tài liệu</span>
              <span className="text-sm font-extrabold text-[#102f63] dark:text-white">{files.length} file</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Lớp học</span>
              <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{availableClasses.length} lớp</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Tài liệu PDF</span>
              <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{stats.pdfCount} file</span>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 px-3 py-1.5 shadow-sm backdrop-blur-md text-center">
              <span className="block text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Slide & Khác</span>
              <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">{stats.otherCount} file</span>
            </div>
          </div>
        </div>

        {/* Toolbar: View Switcher, Course / Class Filters, File Type, Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 p-2.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
          {/* View mode switcher */}
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setViewMode("by_class")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                viewMode === "by_class"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
              title="Sắp xếp thông minh theo từng Ô Lớp Học & Buổi học"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>Theo Lớp & Buổi học</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                viewMode === "timeline"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
              title="Sắp xếp theo Ngày học (Timeline)"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Theo ngày học ({timelineGroups.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                viewMode === "cards"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              }`}
              title="Dạng Thẻ lưới"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Dạng tất cả thẻ ({visibleFiles.length})</span>
            </button>
          </div>

          {/* Right: Course Filter, Class Filter, Format Pills, Time, Search */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Course Dropdown */}
            {!routeCourseId && (
              <div className="flex items-center gap-1 text-xs">
                <span className="hidden sm:inline-block font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                  Môn:
                </span>
                <select
                  value={selectedCourseId}
                  onChange={handleCourseFilterChange}
                  className="h-8 rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100 px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white dark:focus:border-blue-500 dark:focus:bg-slate-800"
                >
                  <option value="all">Tất cả môn ({filterOptions.courses.length})</option>
                  {filterOptions.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Class Dropdown */}
            {!routeClassId && (
              <div className="flex items-center gap-1 text-xs">
                <span className="hidden sm:inline-block font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                  Lớp:
                </span>
                <select
                  value={activeClassId || "all"}
                  onChange={handleClassFilterChange}
                  className="h-8 rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100 px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white dark:focus:border-blue-500 dark:focus:bg-slate-800 max-w-[160px] truncate"
                >
                  <option value="all">Tất cả các lớp ({filterOptions.classes.length})</option>
                  {filterOptions.classes.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Format Chips */}
            <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-xl p-0.5 text-xs">
              {[
                ["all", "Tất cả"],
                ["pdf", "PDF"],
                ["doc", "Word"],
                ["sheet", "Excel"],
                ["slide", "Slide"],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSelectedKind(kind)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    selectedKind === kind
                      ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Time Filter Pills */}
            <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-xl p-0.5 text-xs">
              {[
                ["all", "Tất cả"],
                ["today", "Hôm nay"],
                ["week", "Tuần này"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTimeFilterChange(key)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    selectedTimePreset === key
                      ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm tên bài, tên file, giảng viên..."
                className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white dark:focus:border-blue-500 dark:focus:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-12 text-center shadow-xs">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Đang tải danh sách tài liệu...</p>
          </div>
        ) : errorMessage ? (
          <ErrorState title="Không tải được tài liệu" message={errorMessage} onRetry={loadData} />
        ) : visibleFiles.length === 0 && viewMode !== "by_class" ? (
          <div className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-12 text-center shadow-xs">
            <FolderOpen className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Chưa có tài liệu phù hợp</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Tài liệu giáo viên chia sẻ theo từng buổi học sẽ xuất hiện tại đây.</p>
          </div>
        ) : viewMode === "by_class" ? (
          /* ================= VIEW: THEO LỚP & BUỔI HỌC (DEFAULT & PRIMARY) ================= */
          activeClassId === "all" || !activeClass ? (
            /* --- TẦNG 1: DANH SÁCH CÁC Ô TÀI LIỆU LỚP HỌC --- */
            <div className="space-y-3">
              {/* Toolbar tiêu đề & tìm kiếm lớp */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 p-3 shadow-xs backdrop-blur-md">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#102f63] dark:text-white flex items-center gap-1.5">
                    <FolderOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Danh sách Ô Tài Liệu Lớp Học ({searchedClasses.length} lớp)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Mỗi lớp là một ô tài liệu riêng biệt. Nhấp vào lớp để xem tài liệu sắp xếp thông minh theo từng buổi học.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    value={classSearchQuery}
                    onChange={(e) => setClassSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên lớp, môn học..."
                    className="h-8 w-full rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white dark:focus:border-blue-500 dark:focus:bg-slate-800"
                  />
                </div>
              </div>

              {searchedClasses.length === 0 && systemGeneralFiles.length === 0 ? (
                <div className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-12 text-center shadow-xs">
                  <School className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Không tìm thấy lớp học nào</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Bạn chưa tham gia lớp học nào hoặc không có lớp phù hợp với từ khóa tìm kiếm.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchedClasses.map((cls) => {
                    const clsFiles = files.filter((f) => String(f.classId) === String(cls.id));
                    const sessionsWithFilesCount = new Set(
                      clsFiles.filter((f) => f.classSessionId).map((f) => String(f.classSessionId))
                    ).size;
                    const totalSessions = cls.sessions?.length || 0;
                    const latestFile = clsFiles
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(b.uploadedAt || b.sessionStartTime || 0) -
                          new Date(a.uploadedAt || a.sessionStartTime || 0)
                      )[0];

                    return (
                      <div
                        key={cls.id}
                        onClick={() => handleSelectClass(cls.id)}
                        className="group flex flex-col justify-between rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-3.5 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                      >
                        <div className="space-y-2.5">
                          {/* Course Category Badge & Class Status */}
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 font-bold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 truncate max-w-[190px]">
                              <BookOpen className="h-3 w-3 shrink-0" />
                              <span className="truncate">[{cls.courseCategory || "CSCA"}] {cls.courseTitle}</span>
                            </span>

                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Lớp học
                            </span>
                          </div>

                          {/* Class Title & Icon */}
                          <div className="flex items-start gap-2.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 transition group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white">
                              <GraduationCap className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-xs sm:text-sm font-extrabold text-[#102f63] dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug line-clamp-1">
                                {cls.title}
                              </h3>
                              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {cls.courseTitle}
                              </p>
                            </div>
                          </div>

                          {/* Metrics */}
                          <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-2 text-center">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Tài liệu</span>
                              <span className={`text-sm font-black ${clsFiles.length > 0 ? "text-[#102f63] dark:text-white" : "text-slate-400 dark:text-slate-500"}`}>
                                {clsFiles.length} file
                              </span>
                            </div>

                            <div className="rounded-xl bg-blue-50/40 dark:bg-blue-950/30 border border-blue-100/60 dark:border-blue-900/40 p-2 text-center">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">Buổi có tài liệu</span>
                              <span className="text-sm font-black text-blue-700 dark:text-blue-300">
                                {sessionsWithFilesCount} / {totalSessions} buổi
                              </span>
                            </div>
                          </div>

                          {latestFile && (
                            <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 truncate">
                              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="truncate">
                                Mới nhất: <strong className="font-semibold text-slate-800 dark:text-slate-200">{latestFile.name}</strong>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bottom action */}
                        <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-100/80 dark:border-slate-800/80 text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Xem theo buổi học</span>
                          <span className="inline-flex items-center gap-1">
                            <span>Vào xem</span>
                            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Ô tài liệu chung hệ thống nếu có file không gán lớp */}
              {systemGeneralFiles.length > 0 && (
                <div className="mt-4 rounded-2xl border border-blue-100 dark:border-slate-800 bg-white/92 dark:bg-slate-900/90 p-4 shadow-xs backdrop-blur-md space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#102f63] dark:text-white">
                        Học liệu chung môn học &amp; Giáo trình ({systemGeneralFiles.length} file)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Các tài liệu cấp môn học dùng chung cho tất cả học viên
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {systemGeneralFiles.map((file) => (
                      <StudentFileCard key={file.instanceId || file.id} file={file} onDownload={download} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* --- TẦNG 2: XEM TÀI LIỆU CHI TIẾT THEO BUỔI HỌC CỦA LỚP ĐƯỢC CHỌN --- */
            <div className="space-y-3">
              {/* Top Navigation & Class Info Card */}
              <div className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 p-3.5 shadow-xs backdrop-blur-md space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectClass(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-400 transition w-fit shadow-2xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Quay lại danh sách lớp học</span>
                  </button>

                  <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setSessionVisibilityFilter("all_sessions")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        sessionVisibilityFilter === "all_sessions"
                          ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      Tất cả buổi ({activeClassSessionsGrouped.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSessionVisibilityFilter("only_with_files")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        sessionVisibilityFilter === "only_with_files"
                          ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      Chỉ buổi có file ({activeClassSessionsGrouped.filter((s) => s.files.length > 0).length})
                    </button>
                  </div>
                </div>

                {/* Class Info Header */}
                {activeClass && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 font-bold">
                        <GraduationCap className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50">
                            {activeClass.courseCategory || "CSCA"}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {activeClass.courseTitle}
                          </span>
                        </div>
                        <h2 className="text-sm sm:text-base font-extrabold text-[#102f63] dark:text-white">
                          {activeClass.title}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                      <span className="text-[#102f63] dark:text-white">{activeClassFiles.length} tài liệu trong lớp</span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{activeClassSessionsGrouped.length} buổi học</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 1. Phần Tài liệu chung của lớp (nếu có) */}
              {activeClassGeneralFiles.length > 0 && (
                <section className="rounded-2xl border border-blue-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 p-3.5 shadow-xs space-y-2.5">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold text-xs">
                      <FolderOpen className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#102f63] dark:text-white">
                        Tài liệu &amp; Giáo trình chung của lớp ({activeClassGeneralFiles.length} file)
                      </h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        Tệp tài liệu tham khảo chung toàn khóa
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {activeClassGeneralFiles.map((file) => (
                      <StudentFileCard key={file.instanceId || file.id} file={file} onDownload={download} />
                    ))}
                  </div>
                </section>
              )}

              {/* 2. Danh sách Tài liệu Sắp xếp Thông minh theo Buổi học */}
              <div className="space-y-3">
                {displayedSessions.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl bg-white/95 dark:bg-slate-900/90 border border-white/80 dark:border-slate-800 shadow-xs">
                    <CalendarDays className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      Chưa có buổi học nào có tài liệu đính kèm
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Nhấp vào &ldquo;Tất cả buổi&rdquo; để theo dõi lịch trình các buổi học của lớp.
                    </p>
                  </div>
                ) : (
                  displayedSessions.map((session, sIndex) => (
                    <section
                      key={session.id}
                      className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md overflow-hidden transition hover:shadow-md"
                    >
                      {/* Session Header */}
                      <div className="bg-slate-50/80 dark:bg-slate-800/70 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/50 font-black text-xs">
                            B{sIndex + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                {session.title || `Buổi học ${sIndex + 1}`}
                              </h4>
                              {session.chapterTitle && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                                  {session.chapterTitle}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {session.startTime && (
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                  {formatDateOnly(session.startTime)}
                                </span>
                              )}
                              {session.startTime && session.endTime && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                    {formatTimeRange(session.startTime, session.endTime)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                              session.files.length > 0
                                ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/50"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {session.files.length} tài liệu
                          </span>
                        </div>
                      </div>

                      {/* Session Files Grid */}
                      <div className="p-3">
                        {session.files.length > 0 ? (
                          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                            {session.files.map((file) => (
                              <StudentFileCard key={file.instanceId || file.id} file={file} onDownload={download} />
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 px-3 text-center rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-dashed border-slate-200/70 dark:border-slate-700/60">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                              Buổi học này chưa có tài liệu đính kèm từ giáo viên.
                            </p>
                          </div>
                        )}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          )
        ) : viewMode === "timeline" ? (
          /* ================= TIMELINE VIEW (THEO NGÀY HỌC) ================= */
          <div className="space-y-3">
            {timelineGroups.map(([dateKey, groupFiles]) => (
              <section
                key={dateKey}
                className="rounded-2xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md overflow-hidden"
              >
                {/* Header Ngày học */}
                <div className="bg-slate-50/80 dark:bg-slate-800/70 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/50 font-bold text-xs">
                      <CalendarDays className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#102f63] dark:text-white capitalize">
                        {dateKey === "no-date" ? "Tài liệu học tập chung" : formatDateOnly(dateKey)}
                      </h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                        {groupFiles.length} tài liệu học tập
                      </p>
                    </div>
                  </div>
                </div>

                {/* Danh sách file của ngày */}
                <div className="p-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {groupFiles.map((file) => (
                    <StudentFileCard key={file.instanceId || file.id} file={file} onDownload={download} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* ================= CARDS GRID VIEW ================= */
          <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFiles.map((file) => (
              <StudentFileCard key={file.instanceId || file.id} file={file} onDownload={download} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
