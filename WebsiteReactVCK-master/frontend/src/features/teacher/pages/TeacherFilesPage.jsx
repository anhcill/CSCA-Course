/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Files,
  Filter,
  FolderOpen,
  List,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
  BookOpen,
  School,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import {
  deleteClassFile,
  fetchTeacherClassesLookup,
  fetchTeacherFiles,
  uploadClassFile,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import FileUploadProgressBox from "../../../components/common/FileUploadProgressBox.jsx";
import { getClassTheme } from "../../../utils/classThemes";

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

const formatTimeRange = (start, end) => {
  if (!start) return "";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "";
  const sTime = s.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (!end) return sTime;
  const e = new Date(end);
  const eTime = e.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${sTime} - ${eTime}`;
};

function kindForFile(mime, name = "") {
  const val = (String(mime || "") + " " + String(name || "")).toLowerCase();
  if (val.includes("pdf")) return "pdf";
  if (val.includes("word") || val.includes("doc")) return "doc";
  if (val.includes("sheet") || val.includes("excel") || val.includes("xls") || val.includes("csv")) return "sheet";
  if (val.includes("presentation") || val.includes("powerpoint") || val.includes("ppt")) return "slide";
  if (val.includes("image") || val.includes("png") || val.includes("jpg") || val.includes("jpeg")) return "image";
  return "other";
}

const kindConfig = {
  pdf: { label: "PDF", icon: FileText, badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50" },
  doc: { label: "Word", icon: FileText, badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-sky-400 dark:border-blue-900/50" },
  sheet: { label: "Excel", icon: FileSpreadsheet, badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50" },
  slide: { label: "Slide", icon: FileText, badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50" },
  image: { label: "Ảnh", icon: Files, badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50" },
  other: { label: "File", icon: Files, badge: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
};

export default function TeacherFilesPage() {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();

  const [files, setFiles] = useState([]);
  const [classesLookup, setClassesLookup] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters from URL or state
  const selectedCourseId = searchParams.get("courseId") || "all";
  const selectedClassId = searchParams.get("classId") || "all";
  const selectedDateFilter = searchParams.get("date") || "all"; // 'all', 'today', 'week', or YYYY-MM-DD
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");

  // View mode: 'by_class' (Theo Lớp & Buổi học - MẶC ĐỊNH), 'timeline' (Theo ngày học), 'table' (Dạng bảng)
  const [viewMode, setViewMode] = useState("by_class");

  // Active class for drill-down in by_class mode
  const [activeClassId, setActiveClassId] = useState(
    selectedClassId !== "all" ? selectedClassId : null
  );

  // Filter in class detail: 'all_sessions' vs 'only_with_files'
  const [sessionVisibilityFilter, setSessionVisibilityFilter] = useState("all_sessions");

  // Filter for class cards search
  const [classSearchQuery, setClassSearchQuery] = useState("");

  // Sync activeClassId if URL selectedClassId changes
  useEffect(() => {
    if (selectedClassId !== "all") {
      setActiveClassId(selectedClassId);
    }
  }, [selectedClassId]);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadClassId, setUploadClassId] = useState("");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [uploadVisibility, setUploadVisibility] = useState("CLASS_ONLY");
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // Load lookup data & file list
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [lookupRes, filesRes] = await Promise.all([
        fetchTeacherClassesLookup().catch(() => ({ data: [] })),
        fetchTeacherFiles({
          courseId: selectedCourseId !== "all" ? selectedCourseId : undefined,
          classId: (viewMode !== "by_class" && selectedClassId !== "all") ? selectedClassId : undefined,
          date: selectedDateFilter !== "all" && selectedDateFilter !== "today" && selectedDateFilter !== "week"
            ? selectedDateFilter : undefined,
        }),
      ]);

      setClassesLookup(Array.isArray(lookupRes?.data) ? lookupRes.data : []);
      setFiles(Array.isArray(filesRes?.data) ? filesRes.data : []);
    } catch (err) {
      console.error("Lỗi tải danh sách tài liệu:", err);
      setError(err.message || "Không thể tải danh sách tài liệu học tập.");
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, selectedClassId, selectedDateFilter, viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique courses for filter dropdown
  const uniqueCourses = useMemo(() => {
    const map = new Map();
    for (const c of classesLookup) {
      if (c.courseId && !map.has(c.courseId)) {
        map.set(c.courseId, { id: c.courseId, title: c.courseTitle, category: c.courseCategory });
      }
    }
    // Also include courses from files if any
    for (const f of files) {
      if (f.courseId && !map.has(f.courseId)) {
        map.set(f.courseId, { id: f.courseId, title: f.courseTitle, category: f.courseCategory });
      }
    }
    return Array.from(map.values());
  }, [classesLookup, files]);

  // Filtered classes according to selectedCourseId
  const availableClasses = useMemo(() => {
    if (selectedCourseId === "all") return classesLookup;
    return classesLookup.filter((c) => String(c.courseId) === String(selectedCourseId));
  }, [classesLookup, selectedCourseId]);

  // Sessions for current upload class selection
  const uploadClassSessions = useMemo(() => {
    const cls = classesLookup.find((c) => String(c.id) === String(uploadClassId));
    return cls?.sessions || [];
  }, [classesLookup, uploadClassId]);

  // Set default uploadClassId when lookup arrives
  useEffect(() => {
    if (!uploadClassId && classesLookup.length > 0) {
      setUploadClassId(classesLookup[0].id);
    }
  }, [classesLookup, uploadClassId]);

  // Filter files by search and kind and date presets
  const filteredFiles = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    return files.filter((file) => {
      // Kind filter
      if (selectedKind !== "all") {
        if (kindForFile(file.mimeType, file.name) !== selectedKind) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (file.name || "").toLowerCase().includes(q);
        const matchSession = (file.sessionTitle || "").toLowerCase().includes(q);
        const matchCourse = (file.courseTitle || "").toLowerCase().includes(q);
        const matchClass = (file.classTitle || "").toLowerCase().includes(q);
        const matchUploader = (file.uploadedBy || "").toLowerCase().includes(q);
        if (!matchName && !matchSession && !matchCourse && !matchClass && !matchUploader) {
          return false;
        }
      }

      // Preset date filter
      if (selectedDateFilter === "today") {
        const fileDate = (file.sessionStartTime || file.uploadedAt || "").slice(0, 10);
        if (fileDate !== todayStr) return false;
      } else if (selectedDateFilter === "week") {
        const fileTime = new Date(file.sessionStartTime || file.uploadedAt).getTime();
        if (fileTime < startOfWeek.getTime()) return false;
      }

      return true;
    });
  }, [files, selectedKind, searchQuery, selectedDateFilter]);

  // Group files by date for TIMELINE view
  const timelineGroups = useMemo(() => {
    const map = new Map();
    for (const file of filteredFiles) {
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
  }, [filteredFiles]);

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

  const handleCourseChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("courseId");
    else next.set("courseId", val);
    next.delete("classId"); // reset class when course changes
    setActiveClassId(null);
    setSearchParams(next);
  };

  const handleClassChange = (e) => {
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

  // Filtered classes by search query in the grid
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
    return filteredFiles.filter((f) => String(f.classId) === String(activeClassId));
  }, [filteredFiles, activeClassId]);

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

  // Filter sessions by visibility toggle
  const displayedSessions = useMemo(() => {
    if (sessionVisibilityFilter === "only_with_files") {
      return activeClassSessionsGrouped.filter((s) => s.files.length > 0);
    }
    return activeClassSessionsGrouped;
  }, [activeClassSessionsGrouped, sessionVisibilityFilter]);

  // System general files (files without a class)
  const systemGeneralFiles = useMemo(() => {
    return filteredFiles.filter((f) => !f.classId);
  }, [filteredFiles]);

  const handleDateFilterChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("date");
    else next.set("date", val);
    setSearchParams(next);
  };

  // Upload file action with progress and error state
  const handleExecuteUpload = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!uploadClassId) return toast.error("Vui lòng chọn lớp học.");
    if (!selectedUploadFile) return toast.error("Vui lòng chọn file cần tải lên.");

    if (selectedUploadFile.size > 100 * 1024 * 1024) {
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Kích thước tệp vượt quá giới hạn",
        errorMessage: "Kích thước tài liệu không được vượt quá 100MB theo quy định.",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress({
      status: "uploading",
      percent: 5,
      stage: "init",
      message: "Đang khởi tạo liên kết tải lên an toàn...",
      loaded: 0,
      total: selectedUploadFile.size,
      errorMessage: "",
    });

    try {
      await uploadClassFile(uploadClassId, selectedUploadFile, {
        visibility: uploadVisibility,
        sessionId: uploadSessionId || undefined,
        onProgress: (p) => {
          setUploadProgress((curr) => ({
            ...curr,
            status: p.stage === "done" ? "success" : "uploading",
            percent: p.percent,
            stage: p.stage,
            message: p.message,
            loaded: p.loaded ?? curr?.loaded ?? 0,
            total: p.total ?? selectedUploadFile.size,
          }));
        },
      });

      setUploadProgress({
        status: "success",
        percent: 100,
        stage: "done",
        message: `Đã tải lên "${selectedUploadFile.name}" thành công!`,
        loaded: selectedUploadFile.size,
        total: selectedUploadFile.size,
      });
      toast.success(`Đã tải lên "${selectedUploadFile.name}" thành công!`);

      // Cho người dùng xem trạng thái hoàn tất 1.2s rồi tự đóng modal và reload dữ liệu
      setTimeout(async () => {
        setSelectedUploadFile(null);
        setUploadProgress(null);
        setIsUploadOpen(false);
        await loadData();
      }, 1200);
    } catch (err) {
      console.error("Lỗi upload tài liệu:", err);
      const errText = err.message || "Tải lên tài liệu thất bại. Vui lòng kiểm tra lại kết nối mạng và thử lại.";
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Đã xảy ra lỗi khi tải lên tài liệu",
        errorMessage: errText,
        loaded: 0,
        total: selectedUploadFile.size,
      });
      toast.error(errText);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete file action
  const handleDeleteFile = async (fileId, fileName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài liệu "${fileName}"?`)) return;
    try {
      await deleteClassFile(fileId);
      toast.success("Đã xóa tài liệu thành công.");
      setFiles((curr) => curr.filter((f) => String(f.id) !== String(fileId)));
    } catch (err) {
      toast.error(err.message || "Không thể xóa tài liệu.");
    }
  };

  if (loading && files.length === 0) {
    return <Loading loading text="Đang tải danh sách tài liệu..." fullScreen={false} className="min-h-[55vh] py-16" />;
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-5 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header Hero */}
        <header className="overflow-hidden rounded-3xl border border-emerald-300/60 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 dark:from-emerald-900 dark:via-teal-900 dark:to-slate-900 p-5 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                <FolderOpen className="h-3.5 w-3.5" /> Quản lý học liệu & bài giảng
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {isAdmin ? "Kho Tài Liệu Toàn Hệ Thống" : "Tài Liệu & Học Liệu Giảng Dạy"}
              </h1>
            </div>


            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-emerald-800 shadow-md transition hover:bg-emerald-50 active:scale-95"
            >
              <Plus className="h-4 w-4" /> Đăng tài liệu mới
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/20 pt-4 text-xs">
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
              <span className="text-emerald-200 block text-[11px]">Tổng số tài liệu</span>
              <span className="text-lg font-black">{files.length}</span>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
              <span className="text-emerald-200 block text-[11px]">Số môn / khóa học</span>
              <span className="text-lg font-black">{uniqueCourses.length}</span>
            </div>
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
              <span className="text-emerald-200 block text-[11px]">Lớp đang theo dõi</span>
              <span className="text-lg font-black">{availableClasses.length}</span>
            </div>
          </div>
        </header>

        {/* Filter Toolbar: Khóa/Môn -> Lớp -> Ngày */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Bộ lọc sắp xếp khoa học
              </h2>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
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
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Dạng Bảng chi tiết"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dạng bảng</span>
              </button>
            </div>
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. Môn học / Khóa học */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Giáo trình môn học:
              </label>
              <select
                value={selectedCourseId}
                onChange={handleCourseChange}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
              >
                <option value="all">Tất cả môn học ({uniqueCourses.length})</option>
                {uniqueCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.category}] {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Lớp học */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Lớp học:
              </label>
              <select
                value={selectedClassId}
                onChange={handleClassChange}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
              >
                <option value="all">Tất cả các lớp ({availableClasses.length})</option>
                {availableClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.title} ({cls.sessions?.length || 0} buổi)
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Ngày học */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Ngày học / Buổi học:
              </label>
              <select
                value={selectedDateFilter}
                onChange={handleDateFilterChange}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
              >
                <option value="all">Tất cả ngày</option>
                <option value="today">Hôm nay ({new Date().toLocaleDateString("vi-VN")})</option>
                <option value="week">Trong tuần này</option>
              </select>
            </div>

            {/* 4. Tìm kiếm từ khóa */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Tìm kiếm tài liệu:
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tên file, buổi học..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 py-2 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Quick Kind Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/70">
            <span className="text-[11px] font-bold text-slate-400 mr-1">Định dạng:</span>
            {[
              ["all", "Tất cả định dạng"],
              ["pdf", "PDF"],
              ["doc", "Word"],
              ["sheet", "Excel"],
              ["slide", "Slide"],
              ["image", "Hình ảnh"],
            ].map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => setSelectedKind(kind)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  selectedKind === kind
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Content Area according to viewMode */}
        {error ? (
          <ErrorState title="Chưa thể tải tài liệu" message={error} onRetry={loadData} />
        ) : filteredFiles.length === 0 && viewMode !== "by_class" ? (
          <EmptyState
            icon={FolderOpen}
            title="Không tìm thấy tài liệu nào"
            description="Không có tài liệu nào khớp với bộ lọc hiện tại. Nhấp 'Đăng tài liệu mới' để bổ sung học liệu."
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
                    Mỗi lớp là một ô tài liệu riêng biệt. Nhấp vào lớp để quản lý tài liệu chi tiết theo từng buổi học.
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

              {searchedClasses.length === 0 ? (
                <EmptyState
                  icon={School}
                  title="Không tìm thấy lớp học nào"
                  description="Không có lớp nào phù hợp với từ khóa tìm kiếm hoặc bộ lọc hiện tại."
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
                          {/* Top: Course Category Badge & Class Status */}
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

                          {/* Center: Class Icon & Class Name */}
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

                          {/* Class Metrics */}
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

                        {/* Bottom Action Footer */}
                        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadClassId(cls.id);
                              setUploadSessionId("");
                              setIsUploadOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Thêm file</span>
                          </button>

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
                        Các tài liệu cấp môn học dùng chung cho tất cả các lớp
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {systemGeneralFiles.map((file) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        onDelete={() => handleDeleteFile(file.id, file.name)}
                      />
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

                    <button
                      type="button"
                      onClick={() => {
                        setUploadClassId(activeClass?.id || "");
                        setUploadSessionId("");
                        setIsUploadOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Đăng tài liệu</span>
                    </button>
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
                      <FileCard
                        key={file.id}
                        file={file}
                        onDelete={() => handleDeleteFile(file.id, file.name)}
                      />
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
                      Nhấp vào &quot;Tất cả buổi&quot; hoặc bấm &quot;Đăng tài liệu&quot; để tải lên tài liệu cho các buổi học.
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

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              session.files.length > 0
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {session.files.length} tài liệu
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setUploadClassId(activeClass?.id || "");
                              setUploadSessionId(session.id);
                              setIsUploadOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-700 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-300 bg-white hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                            title={`Thêm tài liệu vào ${session.title}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Thêm file buổi này</span>
                          </button>
                        </div>
                      </div>

                      {/* Session Files Grid */}
                      <div className="p-4">
                        {session.files.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {session.files.map((file) => (
                              <FileCard
                                key={file.id}
                                file={file}
                                onDelete={() => handleDeleteFile(file.id, file.name)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 px-4 text-center rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-dashed border-slate-200/80 dark:border-slate-800/80">
                            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                              Buổi học này chưa có tài liệu đính kèm nào.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadClassId(activeClass?.id || "");
                                setUploadSessionId(session.id);
                                setIsUploadOpen(true);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Tải lên tài liệu (Slide, bài tập...) cho buổi này
                            </button>
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
          /* ================= VIEW 2: THEO NGÀY HỌC (TIMELINE) ================= */
          <div className="space-y-6">
            {timelineGroups.map(([dateKey, groupFiles]) => (
              <section
                key={dateKey}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Header Ngày học */}
                <div className="bg-slate-50/80 dark:bg-slate-800/50 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white capitalize">
                        {dateKey === "no-date" ? "Tài liệu học tập chung" : formatDateOnly(dateKey)}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {groupFiles.length} tệp tài liệu đăng tải
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groupFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      onDelete={() => handleDeleteFile(file.id, file.name)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* ================= VIEW 3: DẠNG BẢNG CHI TIẾT ================= */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3.5">Tên tài liệu</th>
                    <th className="px-4 py-3.5">Môn / Giáo trình</th>
                    <th className="px-4 py-3.5">Lớp học</th>
                    <th className="px-4 py-3.5">Ngày & Buổi học</th>
                    <th className="px-4 py-3.5">Người đăng</th>
                    <th className="px-4 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredFiles.map((file) => {
                    const kind = kindForFile(file.mimeType, file.name);
                    const config = kindConfig[kind];
                    const Icon = config.icon;
                    return (
                      <tr key={file.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5 min-w-0 max-w-xs">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${config.badge}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white truncate" title={file.name}>
                              {file.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium whitespace-nowrap">
                          {file.courseTitle || "—"}
                        </td>
                        <td className="px-4 py-3.5 font-medium whitespace-nowrap">
                          {file.classTitle || "Tài liệu chung"}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {file.sessionStartTime ? (
                            <div>
                              <span className="font-bold block text-slate-900 dark:text-white">
                                {formatDateOnly(file.sessionStartTime)}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {file.sessionTitle || "Buổi học"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Tài liệu chung</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                          {file.uploadedBy}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={file.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 transition"
                              title="Tải xuống"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id, file.name)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                              title="Xóa tài liệu"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL: TẢI LÊN TÀI LIỆU MỚI ================= */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Đăng tải tài liệu học tập
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gắn tài liệu vào Lớp và Ngày học cụ thể
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteUpload} className="space-y-4">
              {/* Chọn Lớp học */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Lớp học *
                </label>
                <select
                  required
                  value={uploadClassId}
                  onChange={(e) => {
                    setUploadClassId(e.target.value);
                    setUploadSessionId(""); // reset session
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="">-- Chọn lớp học --</option>
                  {classesLookup.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      [{cls.courseCategory}] {cls.title} ({cls.courseTitle}) {cls.sessions?.length ? `· ${cls.sessions.length} buổi học` : "· Chưa có lịch"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chọn Buổi học / Ngày học */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Gắn vào Buổi học / Ngày học cụ thể:
                  </label>
                  {uploadClassSessions.length > 0 && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {uploadClassSessions.length} buổi học trong lịch
                    </span>
                  )}
                </div>
                <select
                  value={uploadSessionId}
                  onChange={(e) => setUploadSessionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="">Tài liệu chung của lớp (không gắn ngày cụ thể)</option>
                  {uploadClassSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDateOnly(session.startTime)} — {session.title}
                    </option>
                  ))}
                </select>
                {uploadClassSessions.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-bold">Lớp này hiện chưa có buổi học nào trong lịch.</p>
                      <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                        Bạn có thể tải dưới dạng <strong>Tài liệu chung của lớp</strong>, hoặc vào mục <strong>Lịch giảng dạy</strong> để lên lịch các buổi học trước rồi quay lại gắn vào ngày cụ thể.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Gắn vào buổi học giúp học viên tìm thấy ngay trong chi tiết buổi học và lịch học mỗi ngày.
                  </p>
                )}
              </div>

              {/* Quyền hiển thị */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Quyền hiển thị:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="CLASS_ONLY"
                      checked={uploadVisibility === "CLASS_ONLY"}
                      onChange={() => setUploadVisibility("CLASS_ONLY")}
                      className="accent-emerald-600"
                    />
                    <div>
                      <span className="font-bold block">Chỉ lớp này</span>
                      <span className="text-[10px] text-slate-400">Chỉ học viên lớp được tải</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="COURSE"
                      checked={uploadVisibility === "COURSE"}
                      onChange={() => setUploadVisibility("COURSE")}
                      className="accent-emerald-600"
                    />
                    <div>
                      <span className="font-bold block">Toàn khóa học</span>
                      <span className="text-[10px] text-slate-400">Mọi lớp thuộc môn này</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Chọn File */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Tệp tài liệu *
                </label>
                <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 text-center hover:border-emerald-500 transition">
                  <input
                    type="file"
                    required
                    id="fileUploadInput"
                    onChange={(e) => setSelectedUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  {selectedUploadFile ? (
                    <div className="space-y-1">
                      <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-xs mx-auto">
                        {selectedUploadFile.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedUploadFile(null)}
                        className="text-xs font-bold text-rose-500 underline mt-1"
                      >
                        Chọn file khác
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="fileUploadInput" className="cursor-pointer space-y-1 block">
                      <UploadCloud className="mx-auto h-7 w-7 text-slate-400" />
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Nhấp để chọn file từ máy tính
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Hỗ trợ PDF, Word, Excel, Slide, Ảnh (Tối đa 100MB)
                      </p>
                    </label>
                  )}
                </div>
              </div>

              {/* Ô thông báo tiến độ tải & ô cảnh báo lỗi chi tiết */}
              {uploadProgress && (
                <FileUploadProgressBox
                  file={selectedUploadFile}
                  progress={uploadProgress}
                  onRetry={handleExecuteUpload}
                  onCancel={() => {
                    setUploadProgress(null);
                    setSelectedUploadFile(null);
                  }}
                />
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    if (isUploading) return;
                    setIsUploadOpen(false);
                    setUploadProgress(null);
                    setSelectedUploadFile(null);
                  }}
                  disabled={isUploading}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  {uploadProgress?.status === "success" ? "Đóng" : "Hủy"}
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedUploadFile || uploadProgress?.status === "success"}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {isUploading
                    ? "Đang tải lên..."
                    : uploadProgress?.status === "error"
                    ? "Thử tải lại"
                    : uploadProgress?.status === "success"
                    ? "Đã tải xong ✓"
                    : "Bắt đầu tải lên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FileCard({ file, onDelete }) {
  const kind = kindForFile(file.mimeType, file.name);
  const config = kindConfig[kind];
  const Icon = config.icon;

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs hover:border-emerald-400 hover:shadow-md transition flex flex-col justify-between space-y-3">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${config.badge}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-relaxed" title={file.name}>
            {file.name}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {file.classTitle || "Lớp học"}
            </span>
            {file.sessionTitle && (
              <>
                <span>·</span>
                <span className="truncate max-w-[140px]" title={file.sessionTitle}>
                  {file.sessionTitle}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5 text-[11px]">
        <span className="text-slate-400 text-[10px]">
          {file.sessionStartTime ? formatDateOnly(file.sessionStartTime) : (file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString("vi-VN") : "")}
        </span>
        <div className="flex items-center gap-1">
          <a
            href={file.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 transition"
            title="Tải xuống tài liệu"
          >
            <Download className="h-4 w-4" />
          </a>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              title="Xóa tài liệu"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
