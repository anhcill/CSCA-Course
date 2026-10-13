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
  LayoutGrid,
  List,
  Layers,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
  BookOpen,
  School,
  CheckCircle2,
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

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
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

  // View mode: 'timeline' (Theo ngày học), 'tree' (Theo lớp & môn), 'table' (Dạng bảng)
  const [viewMode, setViewMode] = useState("timeline");

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
          classId: selectedClassId !== "all" ? selectedClassId : undefined,
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
  }, [selectedCourseId, selectedClassId, selectedDateFilter]);

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

  // Group files by Course -> Class for TREE view
  const treeGroups = useMemo(() => {
    const courseMap = new Map();

    for (const file of filteredFiles) {
      const courseKey = file.courseId || "other_course";
      const courseTitle = file.courseTitle || "Tài liệu chung môn học";
      const courseCategory = file.courseCategory || "CSCA";

      if (!courseMap.has(courseKey)) {
        courseMap.set(courseKey, {
          courseId: courseKey,
          courseTitle,
          courseCategory,
          classes: new Map(),
        });
      }

      const classKey = file.classId || "other_class";
      const classTitle = file.classTitle || "Tài liệu chung của khóa";
      const courseObj = courseMap.get(courseKey);

      if (!courseObj.classes.has(classKey)) {
        courseObj.classes.set(classKey, {
          classId: classKey,
          classTitle,
          files: [],
        });
      }

      courseObj.classes.get(classKey).files.push(file);
    }

    return Array.from(courseMap.values()).map((course) => ({
      ...course,
      classes: Array.from(course.classes.values()),
    }));
  }, [filteredFiles]);

  // Handlers for URL filters
  const handleCourseChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("courseId");
    else next.set("courseId", val);
    next.delete("classId"); // reset class when course changes
    setSearchParams(next);
  };

  const handleClassChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("classId");
    else next.set("classId", val);
    setSearchParams(next);
  };

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
              <p className="text-xs sm:text-sm text-emerald-100 max-w-2xl leading-relaxed">
                Quản lý các tệp tài liệu, đề thi, slide bài giảng được đăng tải mỗi ngày theo từng Lớp học và Giáo trình môn học.
              </p>
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
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/20 pt-4 text-xs">
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
            <div className="bg-white/10 rounded-xl p-3 backdrop-blur-xs">
              <span className="text-emerald-200 block text-[11px]">Tổng dung lượng</span>
              <span className="text-lg font-black">
                {formatBytes(files.reduce((acc, f) => acc + (Number(f.sizeBytes) || 0), 0))}
              </span>
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
                onClick={() => setViewMode("tree")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "tree"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Sắp xếp theo Cây Môn & Lớp"
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Theo Môn & Lớp</span>
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
        ) : filteredFiles.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Không tìm thấy tài liệu nào"
            description="Không có tài liệu nào khớp với bộ lọc hiện tại. Nhấp 'Đăng tài liệu mới' để bổ sung học liệu."
          />
        ) : viewMode === "timeline" ? (
          /* ================= VIEW 1: THEO NGÀY HỌC (TIMELINE) ================= */
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

                {/* Danh sách files của ngày đó */}
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
        ) : viewMode === "tree" ? (
          /* ================= VIEW 2: THEO CÂY MÔN HỌC & LỚP HỌC ================= */
          <div className="space-y-6">
            {treeGroups.map((course) => (
              <section
                key={course.courseId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs space-y-4 p-5"
              >
                {/* Course Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                      {course.courseCategory}
                    </span>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {course.courseTitle}
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {course.classes.reduce((acc, cl) => acc + cl.files.length, 0)} tài liệu
                  </span>
                </div>

                {/* Sub Classes */}
                <div className="space-y-4 pl-1 sm:pl-3">
                  {course.classes.map((cls) => (
                    <div
                      key={cls.classId}
                      className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/30 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <School className="h-4 w-4 text-slate-500" />
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            {cls.classTitle}
                          </h4>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {cls.files.length} file
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {cls.files.map((file) => (
                          <FileCard
                            key={file.id}
                            file={file}
                            onDelete={() => handleDeleteFile(file.id, file.name)}
                          />
                        ))}
                      </div>
                    </div>
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
                    <th className="px-4 py-3.5">Dung lượng</th>
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
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px]">
                          {formatBytes(file.sizeBytes)}
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
                      [{cls.courseCategory}] {cls.title} ({cls.courseTitle})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chọn Buổi học / Ngày học */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Gắn vào Buổi học / Ngày học cụ thể:
                </label>
                <select
                  value={uploadSessionId}
                  onChange={(e) => setUploadSessionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="">Tài liệu chung của lớp (không gắn ngày cụ thể)</option>
                  {uploadClassSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDateOnly(session.startTime)} - {session.title}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Gắn vào buổi học giúp học viên tìm thấy ngay trong lịch học và trang học mỗi ngày.
                </p>
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
                      <p className="text-[11px] text-slate-400">
                        {formatBytes(selectedUploadFile.size)}
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
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {formatBytes(file.sizeBytes)}
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
