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
  ExternalLink,
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
import { getClassCoverImage } from "../../../utils/classWallpapers";

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

const fileSize = (value) => {
  const bytes = Number(value) || 0;
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  pdf: {
    label: "PDF",
    icon: FileText,
    badge: "bg-rose-50 text-rose-600 border-rose-200/80",
    pill: "bg-rose-100 text-rose-700",
  },
  doc: {
    label: "Word",
    icon: FileText,
    badge: "bg-blue-50 text-blue-600 border-blue-200/80",
    pill: "bg-blue-100 text-blue-700",
  },
  sheet: {
    label: "Excel",
    icon: FileSpreadsheet,
    badge: "bg-emerald-50 text-emerald-600 border-emerald-200/80",
    pill: "bg-emerald-100 text-emerald-700",
  },
  slide: {
    label: "Slide",
    icon: FileText,
    badge: "bg-amber-50 text-amber-600 border-amber-200/80",
    pill: "bg-amber-100 text-amber-700",
  },
  image: {
    label: "Ảnh",
    icon: Files,
    badge: "bg-purple-50 text-purple-600 border-purple-200/80",
    pill: "bg-purple-100 text-purple-700",
  },
  other: {
    label: "Tài liệu",
    icon: Files,
    badge: "bg-indigo-50 text-indigo-600 border-indigo-200/80",
    pill: "bg-indigo-100 text-indigo-700",
  },
};

const TONES_ARRAY = [
  {
    badge: "bg-blue-500/90 text-white",
    bar: "bg-blue-600",
    button: "bg-gradient-to-r from-blue-600 to-sky-600",
    lightBg: "bg-blue-50 text-blue-700",
  },
  {
    badge: "bg-violet-500/90 text-white",
    bar: "bg-violet-600",
    button: "bg-gradient-to-r from-violet-600 to-purple-600",
    lightBg: "bg-violet-50 text-violet-700",
  },
  {
    badge: "bg-emerald-500/90 text-white",
    bar: "bg-emerald-600",
    button: "bg-gradient-to-r from-emerald-600 to-teal-600",
    lightBg: "bg-emerald-50 text-emerald-700",
  },
  {
    badge: "bg-amber-500/90 text-white",
    bar: "bg-amber-600",
    button: "bg-gradient-to-r from-amber-600 to-orange-600",
    lightBg: "bg-amber-50 text-amber-700",
  },
  {
    badge: "bg-rose-500/90 text-white",
    bar: "bg-rose-600",
    button: "bg-gradient-to-r from-rose-600 to-pink-600",
    lightBg: "bg-rose-50 text-rose-700",
  },
];

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

  // Overall file stats
  const fileStats = useMemo(() => {
    let pdfCount = 0;
    let slideCount = 0;
    let docCount = 0;
    let otherCount = 0;
    for (const f of files) {
      const k = kindForFile(f.mimeType, f.name);
      if (k === "pdf") pdfCount++;
      else if (k === "slide") slideCount++;
      else if (k === "doc") docCount++;
      else otherCount++;
    }
    return {
      pdfCount,
      slideCount,
      docCount,
      otherCount,
      pdfOrSlideCount: pdfCount + slideCount,
    };
  }, [files]);

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
    return <Loading loading text="Đang đồng bộ kho tài liệu giảng dạy..." fullScreen={false} className="min-h-[55vh] py-16" />;
  }

  return (
    <div className="min-h-full p-2.5 sm:p-4 lg:p-6 text-slate-900 transition-colors">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
        {/* ================= 1. CALLIGRAPHIC HEADER HERO TRỰC TIẾP TRÊN NỀN PHONG CẢNH Á ĐÔNG ================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1 pb-1">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/85 px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs backdrop-blur-md">
              <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
              <span>Quản lý học liệu & bài giảng</span>
            </div>
            <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
              {isAdmin ? "Kho Tài Liệu Toàn Hệ Thống" : "Tài Liệu & Học Liệu Giảng Dạy"}
            </h1>
            <p className="text-xs font-semibold italic text-slate-800 sm:text-sm">
              “Sách vở là kho tàng tri thức, tích lũy mỗi ngày để vươn xa.”
            </p>
            <p className="font-['Ma_Shan_Zheng',cursive] text-xs sm:text-sm tracking-wider text-slate-600">
              —— 积学以明志，温故而知新。
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setUploadClassId(classesLookup[0]?.id || "");
                setUploadSessionId("");
                setIsUploadOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#102f63] to-[#1d4f8d] px-4 py-2.5 text-xs font-black text-white shadow-[0_8px_20px_rgba(16,47,99,0.22)] transition hover:brightness-110 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Đăng tài liệu mới</span>
            </button>
          </div>
        </div>

        {/* ================= 2. 4 THẺ THỐNG KÊ KÍNH MỜ (QUICK STAT TILES) ĐỒNG BỘ VỚI TỔNG QUAN ================= */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Tổng số tài liệu",
              value: files.length,
              subtext: "Đã đăng tải toàn hệ thống",
              icon: Files,
              iconStyle: "bg-blue-50 text-blue-600",
            },
            {
              label: "Số môn / khóa học",
              value: uniqueCourses.length,
              subtext: "Giáo trình đang lưu trữ",
              icon: BookOpen,
              iconStyle: "bg-violet-50 text-violet-600",
            },
            {
              label: "Lớp đang theo dõi",
              value: availableClasses.length,
              subtext: "Có phân công giảng dạy",
              icon: School,
              iconStyle: "bg-amber-50 text-amber-600",
            },
            {
              label: "Tài liệu PDF & Slide",
              value: fileStats.pdfOrSlideCount,
              subtext: `${fileStats.pdfCount} PDF · ${fileStats.slideCount} Slide`,
              icon: Sparkles,
              iconStyle: "bg-emerald-50 text-emerald-600",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-[0_8px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-sky-300"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconStyle} shadow-2xs`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-black text-[#102f63] leading-none font-mono">
                    {item.value}
                  </p>
                  <p className="text-xs font-bold text-slate-800 leading-tight mt-1 truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                    {item.subtext}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        {/* ================= 3. BỘ LỌC SẮP XẾP KHOA HỌC TRÊN NỀN KÍNH MỜ ================= */}
        <section className="rounded-2xl border border-white/80 bg-white/92 p-3.5 sm:p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md space-y-3.5">
          {/* Header & View Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-2xs">
                <Filter className="h-4 w-4" />
              </span>
              <h2 className="text-xs font-black uppercase tracking-wider text-[#102f63]">
                Bộ lọc sắp xếp khoa học
              </h2>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100/90 p-1">
              <button
                type="button"
                onClick={() => setViewMode("by_class")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "by_class"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
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
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
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
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
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
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Giáo trình môn học:
              </label>
              <select
                value={selectedCourseId}
                onChange={handleCourseChange}
                className="w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
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
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Lớp học:
              </label>
              <select
                value={selectedClassId}
                onChange={handleClassChange}
                className="w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
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
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Ngày học / Buổi học:
              </label>
              <select
                value={selectedDateFilter}
                onChange={handleDateFilterChange}
                className="w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
              >
                <option value="all">Tất cả ngày</option>
                <option value="today">Hôm nay ({new Date().toLocaleDateString("vi-VN")})</option>
                <option value="week">Trong tuần này</option>
              </select>
            </div>

            {/* 4. Tìm kiếm từ khóa */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Tìm kiếm tài liệu:
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tên file, buổi học..."
                  className="w-full rounded-xl border border-slate-200/90 bg-white/95 py-2 pl-8 pr-3 text-xs font-semibold text-slate-800 outline-none shadow-2xs focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Quick Kind Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
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
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                  selectedKind === kind
                    ? "bg-[#102f63] text-white shadow-xs font-bold"
                    : "bg-white/80 border border-slate-200/80 text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ================= 4. KHU VỰC NỘI DUNG THEO VIEW MODE ================= */}
        {error ? (
          <ErrorState title="Chưa thể tải tài liệu" message={error} onRetry={loadData} />
        ) : filteredFiles.length === 0 && viewMode !== "by_class" ? (
          <EmptyState
            icon={FolderOpen}
            title="Không tìm thấy tài liệu nào"
            description="Không có tài liệu nào khớp với bộ lọc hiện tại. Nhấp 'Đăng tài liệu mới' để bổ sung học liệu."
          />
        ) : viewMode === "by_class" ? (
          /* ================= VIEW 1: THEO LỚP & BUỔI HỌC (DEFAULT & PRIMARY) ================= */
          !activeClassId ? (
            /* --- TẦNG 1: DANH SÁCH CÁC Ô TÀI LIỆU LỚP HỌC (ĐỒNG NHẤT ẢNH PHONG CẢNH CSCA) --- */
            <div className="space-y-4">
              {/* Toolbar tiêu đề & tìm kiếm lớp */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 p-3.5 sm:p-4 shadow-sm backdrop-blur-md">
                <div>
                  <h3 className="text-sm font-black text-[#102f63] flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-blue-600" />
                    Danh sách Ô Tài Liệu Lớp Học ({searchedClasses.length} lớp)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mỗi lớp là một ô tài liệu riêng biệt. Nhấp vào lớp để quản lý tài liệu chi tiết theo từng buổi học.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={classSearchQuery}
                    onChange={(e) => setClassSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên lớp, môn học..."
                    className="h-8 w-full rounded-xl border border-slate-200/90 bg-white pl-8 pr-3 text-xs text-slate-800 shadow-2xs outline-none focus:border-blue-500"
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
                /* Grid thẻ lớp học mang phong cách phong cảnh Á Đông CSCA */
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
                    const tone = TONES_ARRAY[index % TONES_ARRAY.length];
                    const cover = getClassCoverImage(cls, cls.id);

                    return (
                      <article
                        key={cls.id}
                        onClick={() => handleSelectClass(cls.id)}
                        className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/85 bg-white shadow-[0_8px_24px_rgba(45,87,122,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(45,87,122,0.18)] hover:border-sky-300 cursor-pointer"
                      >
                        {/* Banner ảnh phong cảnh Á Đông CSCA - Đồng nhất 100% với học viên & tổng quan */}
                        <div className="relative h-28 sm:h-32 w-full overflow-hidden bg-sky-100">
                          <img
                            src={cover}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = "/student-campus-spring.webp";
                            }}
                            alt={cls.title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#102f63]/90 via-[#102f63]/30 to-white/10" />

                          {/* Huy hiệu khóa học trên góc trái */}
                          <span
                            className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black shadow-xs ${tone.badge} max-w-[190px] truncate`}
                          >
                            <BookOpen className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">[{cls.courseCategory || "CSCA"}] {cls.courseTitle || "Khóa học"}</span>
                          </span>

                          {/* Huy hiệu Lớp học trên góc phải */}
                          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#102f63]/75 backdrop-blur-md px-2 py-0.5 text-[9px] font-black text-white border border-white/20">
                            {cls.code || `LIVE-${cls.id}`}
                          </span>

                          {/* Tiêu đề lớp học nổi bật trên nền ảnh */}
                          <div className="absolute inset-x-2.5 bottom-2.5">
                            <p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/80">
                              {cls.courseTitle || "Khóa học CSCA"}
                            </p>
                            <h3 className="mt-0.5 line-clamp-1 text-sm sm:text-base font-black text-white drop-shadow">
                              {cls.title}
                            </h3>
                          </div>
                        </div>

                        {/* Thân thẻ tài liệu lớp học */}
                        <div className="p-3.5 sm:p-4 flex flex-col justify-between flex-1 space-y-3">
                          {/* 2 Ô thống kê tài liệu & buổi học */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-2.5 text-center">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Tài liệu
                              </span>
                              <span className="text-sm font-black text-blue-700 font-mono">
                                {clsFiles.length} file
                              </span>
                            </div>

                            <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-2.5 text-center">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Buổi có tài liệu
                              </span>
                              <span className="text-sm font-black text-slate-800 font-mono">
                                {sessionsWithFilesCount} / {totalSessions} buổi
                              </span>
                            </div>
                          </div>

                          {/* Tệp tài liệu mới nhất (nếu có) */}
                          {latestFile ? (
                            <div className="flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-900">
                              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                              <span className="truncate">
                                Mới nhất: <strong>{latestFile.name}</strong>
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic px-1">
                              Chưa có tài liệu đính kèm nào.
                            </div>
                          )}

                          {/* Hàng nút hành động dưới cùng */}
                          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadClassId(cls.id);
                                setUploadSessionId("");
                                setIsUploadOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Thêm file</span>
                            </button>

                            <span className="inline-flex items-center gap-1 text-blue-600 transition group-hover:translate-x-0.5">
                              <span>Vào xem theo buổi</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Ô tài liệu chung hệ thống nếu có file không gán lớp */}
              {systemGeneralFiles.length > 0 && (
                <div className="mt-6 rounded-3xl border border-white/90 bg-white/92 p-5 shadow-sm backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-3 border-b border-slate-100 pb-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 font-bold">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-[#102f63]">
                        Học liệu chung môn học & Giáo trình toàn hệ thống ({systemGeneralFiles.length} file)
                      </h3>
                      <p className="text-xs text-slate-500">
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
            <div className="space-y-4">
              {/* Header điều hướng & tóm tắt lớp đang chọn */}
              <div className="rounded-3xl border border-white/90 bg-white/92 p-4 sm:p-5 shadow-sm backdrop-blur-md space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectClass(null)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-[#102f63] bg-white border border-slate-200/90 shadow-2xs hover:bg-sky-50 hover:text-blue-700 transition w-fit"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Quay lại danh sách lớp học</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Toggle hiển thị buổi */}
                    <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setSessionVisibilityFilter("all_sessions")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          sessionVisibilityFilter === "all_sessions"
                            ? "bg-white text-blue-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Tất cả buổi ({activeClassSessionsGrouped.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSessionVisibilityFilter("only_with_files")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          sessionVisibilityFilter === "only_with_files"
                            ? "bg-white text-blue-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-900"
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
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Đăng tài liệu</span>
                    </button>
                  </div>
                </div>

                {/* Class Info Header */}
                {activeClass && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-3.5">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 font-bold shadow-2xs">
                        <School className="h-6 w-6" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {activeClass.courseCategory || "CSCA"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {activeClass.courseTitle}
                          </span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-[#102f63] mt-0.5">
                          {activeClass.title}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-bold text-slate-700 bg-sky-50/70 px-4 py-2 rounded-2xl border border-sky-100/80">
                      <span>{activeClassFiles.length} tài liệu trong lớp</span>
                      <span className="text-slate-300">·</span>
                      <span>{activeClassSessionsGrouped.length} buổi học</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 1. Phần Tài liệu chung của lớp (nếu có) */}
              {activeClassGeneralFiles.length > 0 && (
                <section className="rounded-3xl border border-white/90 bg-white/92 overflow-hidden shadow-sm backdrop-blur-md">
                  <div className="bg-sky-50/50 px-5 py-3.5 border-b border-sky-100/70 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-xs">
                        <FolderOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-[#102f63]">
                          Tài liệu & Giáo trình chung của lớp
                        </h3>
                        <p className="text-[11px] text-slate-500">
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
              <div className="space-y-3.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#102f63] flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                    Tài liệu sắp xếp theo từng buổi học ({displayedSessions.length} buổi)
                  </h3>
                </div>

                {displayedSessions.length === 0 ? (
                  <div className="p-12 text-center rounded-3xl bg-white/90 border border-white/90 backdrop-blur-md">
                    <CalendarDays className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                    <p className="text-sm font-bold text-slate-800">
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
                          ? "border-white/90 bg-white/92 shadow-sm backdrop-blur-md"
                          : "border-dashed border-slate-200/90 bg-white/60"
                      } overflow-hidden`}
                    >
                      {/* Session Header */}
                      <div className="bg-slate-50/70 px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-black text-xs font-mono shadow-2xs">
                            B{sIndex + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-slate-900">
                                {session.title || `Buổi học ${sIndex + 1}`}
                              </h4>
                              {session.chapterTitle && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-600 font-semibold">
                                  {session.chapterTitle}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
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
                            className={`text-xs font-bold px-2.5 py-1 rounded-full font-mono ${
                              session.files.length > 0
                                ? "bg-blue-50 text-blue-700 border border-blue-200/70"
                                : "bg-slate-100 text-slate-500"
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200/80 shadow-2xs transition"
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
                          <div className="py-6 px-4 text-center rounded-2xl bg-white/40 border border-dashed border-slate-200/80">
                            <p className="text-xs font-medium text-slate-400">
                              Buổi học này chưa có tài liệu đính kèm nào.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadClassId(activeClass?.id || "");
                                setUploadSessionId(session.id);
                                setIsUploadOpen(true);
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
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
          <div className="space-y-4">
            {timelineGroups.map(([dateKey, groupFiles]) => (
              <section
                key={dateKey}
                className="rounded-3xl border border-white/90 bg-white/92 overflow-hidden shadow-sm backdrop-blur-md"
              >
                {/* Header Ngày học */}
                <div className="bg-sky-50/50 px-5 py-3.5 border-b border-sky-100/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-xs">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-[#102f63] capitalize">
                        {dateKey === "no-date" ? "Tài liệu học tập chung" : formatDateOnly(dateKey)}
                      </h3>
                      <p className="text-[11px] text-slate-500">
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
          <div className="rounded-3xl border border-white/90 bg-white/92 overflow-hidden shadow-sm backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-sky-50/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                  <tr>
                    <th className="px-4 py-3.5">Tên tài liệu</th>
                    <th className="px-4 py-3.5">Môn / Giáo trình</th>
                    <th className="px-4 py-3.5">Lớp học</th>
                    <th className="px-4 py-3.5">Ngày & Buổi học</th>
                    <th className="px-4 py-3.5">Người đăng</th>
                    <th className="px-4 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFiles.map((file) => {
                    const kind = kindForFile(file.mimeType, file.name);
                    const config = kindConfig[kind] || kindConfig.other;
                    const Icon = config.icon;
                    return (
                      <tr key={file.id} className="hover:bg-sky-50/40 transition">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5 min-w-0 max-w-xs">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${config.badge}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="font-bold text-slate-900 truncate" title={file.name}>
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
                              <span className="font-bold block text-slate-900">
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
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={file.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white transition shadow-2xs"
                              title="Tải xuống"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id, file.name)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f63]/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-white/90 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#102f63]">
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
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteUpload} className="space-y-4">
              {/* Chọn Lớp học */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn Lớp học *
                </label>
                <select
                  required
                  value={uploadClassId}
                  onChange={(e) => {
                    setUploadClassId(e.target.value);
                    setUploadSessionId("");
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
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
                  <label className="block text-xs font-bold text-slate-700">
                    Gắn vào Buổi học / Ngày học cụ thể:
                  </label>
                  {uploadClassSessions.length > 0 && (
                    <span className="text-[11px] font-semibold text-blue-600 font-mono">
                      {uploadClassSessions.length} buổi học trong lịch
                    </span>
                  )}
                </div>
                <select
                  value={uploadSessionId}
                  onChange={(e) => setUploadSessionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="">Tài liệu chung của lớp (không gắn ngày cụ thể)</option>
                  {uploadClassSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDateOnly(session.startTime)} — {session.title}
                    </option>
                  ))}
                </select>
                {uploadClassSessions.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-bold">Lớp này hiện chưa có buổi học nào trong lịch.</p>
                      <p className="mt-0.5 text-slate-600">
                        Bạn có thể tải dưới dạng <strong>Tài liệu chung của lớp</strong>, hoặc vào mục <strong>Lịch giảng dạy</strong> để lên lịch các buổi học trước rồi quay lại gắn vào ngày cụ thể.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Gắn vào buổi học giúp học viên tìm thấy ngay trong chi tiết buổi học và lịch học mỗi ngày.
                  </p>
                )}
              </div>

              {/* Quyền hiển thị */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quyền hiển thị:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-sky-50/50 transition">
                    <input
                      type="radio"
                      name="visibility"
                      value="CLASS_ONLY"
                      checked={uploadVisibility === "CLASS_ONLY"}
                      onChange={() => setUploadVisibility("CLASS_ONLY")}
                      className="accent-blue-600"
                    />
                    <div>
                      <span className="font-bold block text-slate-800">Chỉ lớp này</span>
                      <span className="text-[10px] text-slate-400">Chỉ học viên lớp được tải</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-sky-50/50 transition">
                    <input
                      type="radio"
                      name="visibility"
                      value="COURSE"
                      checked={uploadVisibility === "COURSE"}
                      onChange={() => setUploadVisibility("COURSE")}
                      className="accent-blue-600"
                    />
                    <div>
                      <span className="font-bold block text-slate-800">Toàn khóa học</span>
                      <span className="text-[10px] text-slate-400">Mọi lớp thuộc môn này</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Chọn File */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn Tệp tài liệu *
                </label>
                <div className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-blue-500 transition bg-slate-50/50">
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
                      <p className="text-xs font-bold text-slate-900 truncate max-w-xs mx-auto">
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
                      <UploadCloud className="mx-auto h-7 w-7 text-blue-500" />
                      <p className="text-xs font-bold text-blue-600">
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
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isUploading) return;
                    setIsUploadOpen(false);
                    setUploadProgress(null);
                    setSelectedUploadFile(null);
                  }}
                  disabled={isUploading}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  {uploadProgress?.status === "success" ? "Đóng" : "Hủy"}
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedUploadFile || uploadProgress?.status === "success"}
                  className="rounded-xl bg-[#102f63] hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
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
  const config = kindConfig[kind] || kindConfig.other;
  const Icon = config.icon;
  const downloadUrl = file.downloadUrl || file.download_url;
  const viewUrl = file.viewUrl || file.view_url || downloadUrl;

  return (
    <div className="group/file rounded-2xl border border-white/90 bg-white p-3.5 shadow-2xs hover:border-blue-300 hover:shadow-md transition flex flex-col justify-between space-y-3">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${config.badge}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${config.pill}`}>
              {config.label}
            </span>
          </div>

          {file.sizeBytes || file.size ? (
            <span className="text-[10px] font-mono text-slate-400">
              {fileSize(file.sizeBytes || file.size)}
            </span>
          ) : null}
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-relaxed group-hover/file:text-blue-600 transition" title={file.name}>
            {viewUrl ? (
              <a href={viewUrl} target="_blank" rel="noreferrer" className="hover:underline flex items-start gap-1">
                <span>{file.name}</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover/file:opacity-100 transition shrink-0 mt-0.5" />
              </a>
            ) : (
              file.name
            )}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
            <span className="font-semibold text-blue-700">
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

      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px]">
        <span className="text-slate-400 text-[10px]">
          {file.sessionStartTime ? formatDateOnly(file.sessionStartTime) : (file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString("vi-VN") : "")}
        </span>
        <div className="flex items-center gap-1">
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white transition shadow-2xs"
              title="Tải xuống tài liệu"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
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
