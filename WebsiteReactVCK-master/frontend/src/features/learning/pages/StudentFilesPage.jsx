/* eslint-disable react/prop-types */
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
  LayoutGrid,
  Search,
  BookOpen,
  School,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { fetchStudentFiles, fetchStudentClassesLookup } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";
import { getClassTheme } from "../../../utils/classThemes";

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
    className: "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/60",
    pill: "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300",
    glow: "hover:border-rose-400 dark:hover:border-rose-600/70",
  },
  doc: {
    label: "Word",
    icon: FileText,
    className: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 border-blue-200 dark:border-blue-900/60",
    pill: "bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-sky-300",
    glow: "hover:border-blue-400 dark:hover:border-blue-600/70",
  },
  sheet: {
    label: "Excel",
    icon: FileSpreadsheet,
    className: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60",
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300",
    glow: "hover:border-emerald-400 dark:hover:border-emerald-600/70",
  },
  slide: {
    label: "Slide",
    icon: FileText,
    className: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60",
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300",
    glow: "hover:border-amber-400 dark:hover:border-amber-600/70",
  },
  image: {
    label: "Ảnh",
    icon: Files,
    className: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/60",
    pill: "bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300",
    glow: "hover:border-purple-400 dark:hover:border-purple-600/70",
  },
  other: {
    label: "Tài liệu",
    icon: Files,
    className: "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/60",
    pill: "bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300",
    glow: "hover:border-teal-400 dark:hover:border-teal-600/70",
  },
};

function StudentFileCard({ file, onDownload }) {
  const kind = kindForFile(file);
  const config = fileConfig[kind] || fileConfig.other;
  const Icon = config.icon;
  const downloadUrl = file.downloadUrl || file.download_url;

  return (
    <div
      className={`group rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/95 p-4 flex flex-col justify-between space-y-3 shadow-xs hover:shadow-lg dark:hover:shadow-emerald-950/20 transition-all duration-200 hover:-translate-y-0.5 ${config.glow}`}
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105 ${config.className}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${config.pill}`}>
              {config.label}
            </span>
            {file.sizeBytes ? (
              <span className="text-[10px] font-semibold text-slate-400">
                {fileSize(file.sizeBytes)}
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block truncate">
              {file.courseTitle || "Khóa học"} {file.classTitle ? `· ${file.classTitle}` : ""}
            </span>
          </div>

          <h4
            className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white line-clamp-2 mt-0.5 leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors"
            title={file.name}
          >
            {downloadUrl ? (
              <a href={downloadUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {file.name}
              </a>
            ) : (
              file.name
            )}
          </h4>

          {file.sessionTitle && (
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate" title={file.sessionTitle}>
              Buổi: {file.sessionTitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[120px]">
          {file.uploadedBy || "Giáo viên"}
        </span>
        <button
          type="button"
          onClick={() => onDownload(file)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold shadow-xs transition active:scale-95"
        >
          <Download className="h-3.5 w-3.5" /> Tải về
        </button>
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
  const [activeClassId, setActiveClassId] = useState(urlClassId);
  const selectedTimePreset = searchParams.get("time") || "all"; // 'all', 'today', 'week'

  useEffect(() => {
    if (urlClassId) {
      setActiveClassId(urlClassId);
    }
  }, [urlClassId]);

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
          classId: viewMode === "by_class" ? undefined : (urlClassId || undefined),
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
  }, [selectedCourseId, urlClassId, viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    setActiveClassId(classId);
    const next = new URLSearchParams(searchParams);
    if (!classId) {
      next.delete("classId");
    } else {
      next.set("classId", classId);
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
    if (!activeClassId) return null;
    return classesLookup.find((c) => String(c.id) === String(activeClassId)) || null;
  }, [classesLookup, activeClassId]);

  // Files of active class
  const activeClassFiles = useMemo(() => {
    if (!activeClassId) return [];
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
    setActiveClassId(null);
    setSearchParams(next);
  };

  const handleClassFilterChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") {
      next.delete("classId");
      setActiveClassId(null);
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
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 py-5 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Banner Section */}
        <section className="rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white dark:border-emerald-900/40 dark:bg-gradient-to-r dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-3 py-1 text-xs font-bold ring-1 ring-emerald-200 dark:ring-emerald-800/40">
                <FolderOpen className="h-3.5 w-3.5" /> Kho tài liệu học tập
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {routeClassId ? "Tài Liệu Theo Buổi Của Lớp" : routeCourseId ? "Tài Liệu Môn Học" : "Tài Liệu & Học Liệu Mỗi Ngày"}
              </h1>
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode("by_class")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "by_class"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Sắp xếp thông minh theo từng Ô Lớp Học & Buổi học"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Theo Lớp & Buổi học</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "timeline"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Sắp xếp theo Ngày học (Timeline)"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Theo ngày học</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Dạng Thẻ lưới"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dạng thẻ</span>
              </button>
            </div>
          </div>

          {/* Filters Bar: Course -> Class -> Time */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {!routeCourseId && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Môn học / Khóa học:
                </label>
                <select
                  value={selectedCourseId}
                  onChange={handleCourseFilterChange}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
                >
                  <option value="all">Tất cả môn học ({filterOptions.courses.length})</option>
                  {filterOptions.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!routeClassId && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Lớp học:
                </label>
                <select
                  value={urlClassId || "all"}
                  onChange={handleClassFilterChange}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
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

            <div className={routeCourseId && routeClassId ? "sm:col-span-3" : ""}>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Tìm kiếm tài liệu:
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm tên bài, tên file, giảng viên..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 py-2 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Time & Kind Pills */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            {/* Kind Filters */}
            <div className="flex items-center gap-1 overflow-x-auto">
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
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    selectedKind === kind
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Time Filter Pills */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Thời gian:</span>
              {[
                ["all", "Tất cả"],
                ["today", "Hôm nay"],
                ["week", "Tuần này"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTimeFilterChange(key)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    selectedTimePreset === key
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Content Area */}
        {loading ? (
          <LoadingState message="Đang tải danh sách tài liệu..." count={3} />
        ) : errorMessage ? (
          <ErrorState title="Không tải được tài liệu" message={errorMessage} onRetry={loadData} />
        ) : visibleFiles.length === 0 && viewMode !== "by_class" ? (
          <EmptyState
            icon={FolderOpen}
            title="Chưa có tài liệu phù hợp"
            description="Tài liệu giáo viên chia sẻ theo từng buổi học sẽ xuất hiện tại đây."
          />
        ) : viewMode === "by_class" ? (
          /* ================= VIEW: THEO LỚP & BUỔI HỌC (DEFAULT & PRIMARY) ================= */
          !activeClassId ? (
            /* --- TẦNG 1: DANH SÁCH CÁC Ô TÀI LIỆU LỚP HỌC --- */
            <div className="space-y-4">
              {/* Toolbar tiêu đề & tìm kiếm lớp */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Danh sách Ô Tài Liệu Lớp Học ({searchedClasses.length} lớp)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Mỗi lớp là một ô tài liệu riêng biệt. Nhấp vào lớp để xem tài liệu sắp xếp thông minh theo từng buổi học.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={classSearchQuery}
                    onChange={(e) => setClassSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên lớp, môn học..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 py-2 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
                  />
                </div>
              </div>

              {searchedClasses.length === 0 && systemGeneralFiles.length === 0 ? (
                <EmptyState
                  icon={School}
                  title="Không tìm thấy lớp học nào"
                  description="Bạn chưa tham gia lớp học nào hoặc không có lớp phù hợp với từ khóa tìm kiếm."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {searchedClasses.map((cls, index) => {
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
                    const theme = getClassTheme(cls, index);

                    return (
                      <div
                        key={cls.id}
                        onClick={() => handleSelectClass(cls.id)}
                        className={`group relative rounded-3xl border ${theme.cardBorder} bg-white dark:bg-slate-900 p-5 shadow-xs hover:shadow-xl ${theme.borderHover} transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden`}
                      >
                        {/* Top Colorful Accent Strip */}
                        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${theme.topBar}`} />

                        {/* Hiệu ứng hào quang khi hover */}
                        <div className={`absolute -right-16 -top-16 w-36 h-36 rounded-full bg-gradient-to-br ${theme.glow} blur-2xl group-hover:scale-125 transition-all duration-500 pointer-events-none`} />

                        <div className="space-y-4">
                          {/* Course Category Badge & Class Status */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${theme.codeBadge} max-w-[200px] truncate`}>
                              <BookOpen className="h-3 w-3 shrink-0" />
                              <span className="truncate">[{cls.courseCategory}] {cls.courseTitle}</span>
                            </span>

                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Lớp học
                            </span>
                          </div>

                          {/* Class Name */}
                          <div className="flex items-start gap-3.5">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all duration-300 group-hover:scale-110 ${theme.iconBg}`}>
                              <School className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 transition-colors line-clamp-2 leading-snug">
                                {cls.title}
                              </h3>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                                {cls.courseTitle}
                              </p>
                            </div>
                          </div>

                          {/* Metrics */}
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                            <div className={`rounded-xl p-2.5 border ${theme.studentBox}`}>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Tài liệu</span>
                              <span className={`text-sm font-black ${clsFiles.length > 0 ? theme.studentText : "text-slate-400"}`}>
                                {clsFiles.length} file
                              </span>
                            </div>

                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Buổi có tài liệu</span>
                              <span className="text-sm font-black text-slate-900 dark:text-white">
                                {sessionsWithFilesCount} / {totalSessions} buổi
                              </span>
                            </div>
                          </div>

                          {latestFile && (
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3 py-2 flex items-center gap-1.5 truncate">
                              <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span className="truncate">
                                Mới nhất: <strong className="font-semibold text-slate-900 dark:text-white">{latestFile.name}</strong>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bottom action */}
                        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end text-xs font-bold">
                          <span className={`inline-flex items-center gap-1 ${theme.accentText} group-hover:translate-x-1 transition-transform`}>
                            <span>Vào xem theo buổi</span>
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Ô tài liệu chung hệ thống nếu có file không gán lớp */}
              {systemGeneralFiles.length > 0 && (
                <div className="mt-6 rounded-3xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/30 dark:bg-teal-950/20 p-5 shadow-xs">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 font-bold">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        Học liệu chung môn học & Giáo trình toàn hệ thống ({systemGeneralFiles.length} file)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Các tài liệu cấp môn học dùng chung cho tất cả học viên
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {systemGeneralFiles.map((file) => (
                      <StudentFileCard key={file.id} file={file} onDownload={download} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* --- TẦNG 2: XEM TÀI LIỆU CHI TIẾT THEO BUỔI HỌC CỦA LỚP ĐƯỢC CHỌN --- */
            <div className="space-y-5">
              {/* Top Navigation & Class Info Card */}
              <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectClass(null)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-slate-700 dark:hover:text-emerald-300 transition w-fit"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Quay lại danh sách lớp học</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Toggle hiển thị buổi */}
                    <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setSessionVisibilityFilter("all_sessions")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          sessionVisibilityFilter === "all_sessions"
                            ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                        }`}
                      >
                        Tất cả buổi ({activeClassSessionsGrouped.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSessionVisibilityFilter("only_with_files")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          sessionVisibilityFilter === "only_with_files"
                            ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                        }`}
                      >
                        Chỉ buổi có file ({activeClassSessionsGrouped.filter((s) => s.files.length > 0).length})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Class Info Header */}
                {activeClass && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                    <div className="flex items-center gap-3.5">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                        <School className="h-6 w-6" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                            {activeClass.courseCategory}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {activeClass.courseTitle}
                          </span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                          {activeClass.title}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-4 py-2 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span>{activeClassFiles.length} tài liệu trong lớp</span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span>{activeClassSessionsGrouped.length} buổi học</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 1. Phần Tài liệu chung của lớp (nếu có) */}
              {activeClassGeneralFiles.length > 0 && (
                <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                  <div className="bg-slate-50/80 dark:bg-slate-800/60 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 font-bold text-xs">
                        <FolderOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                          Tài liệu & Giáo trình chung của lớp
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {activeClassGeneralFiles.length} tệp tài liệu tham khảo chung toàn khóa
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {activeClassGeneralFiles.map((file) => (
                      <StudentFileCard key={file.id} file={file} onDownload={download} />
                    ))}
                  </div>
                </section>
              )}

              {/* 2. Danh sách Tài liệu Sắp xếp Thông minh theo Buổi học */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
                    Tài liệu sắp xếp theo từng buổi học ({displayedSessions.length} buổi)
                  </h3>
                </div>

                {displayedSessions.length === 0 ? (
                  <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <CalendarDays className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Chưa có buổi học nào có tài liệu đính kèm
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Nhấp vào &ldquo;Tất cả buổi&rdquo; để theo dõi lịch trình các buổi học của lớp.
                    </p>
                  </div>
                ) : (
                  displayedSessions.map((session, sIndex) => (
                    <section
                      key={session.id}
                      className={`rounded-3xl border transition-all ${
                        session.files.length > 0
                          ? "border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
                          : "border-dashed border-slate-200 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/40"
                      } overflow-hidden`}
                    >
                      {/* Session Header */}
                      <div className="bg-slate-50/80 dark:bg-slate-800/50 px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-black text-xs">
                            B{sIndex + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                {session.title || `Buổi học ${sIndex + 1}`}
                              </h4>
                              {session.chapterTitle && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                                  {session.chapterTitle}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {session.startTime && (
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3 text-slate-400" />
                                  {formatDateOnly(session.startTime)}
                                </span>
                              )}
                              {session.startTime && session.endTime && (
                                <>
                                  <span>·</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-slate-400" />
                                    {formatTimeRange(session.startTime, session.endTime)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              session.files.length > 0
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {session.files.length} tài liệu
                          </span>
                        </div>
                      </div>

                      {/* Session Files Grid */}
                      <div className="p-4">
                        {session.files.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {session.files.map((file) => (
                              <StudentFileCard key={file.id} file={file} onDownload={download} />
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 px-4 text-center rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-200/80 dark:border-slate-800/80">
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
          <div className="space-y-5">
            {timelineGroups.map(([dateKey, groupFiles]) => (
              <section
                key={dateKey}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs"
              >
                {/* Header Ngày học */}
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 px-5 py-3.5 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white capitalize">
                        {dateKey === "no-date" ? "Tài liệu học tập chung" : formatDateOnly(dateKey)}
                      </h3>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        {groupFiles.length} tài liệu học tập
                      </p>
                    </div>
                  </div>
                </div>

                {/* Danh sách file của ngày */}
                <div className="p-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {groupFiles.map((file) => (
                    <StudentFileCard key={file.id} file={file} onDownload={download} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* ================= CARDS GRID VIEW ================= */
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFiles.map((file) => (
              <StudentFileCard key={file.id} file={file} onDownload={download} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
