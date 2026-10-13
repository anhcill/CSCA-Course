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
  Layers,
  Search,
  UserRound,
  BookOpen,
  School,
} from "lucide-react";
import { fetchStudentFiles } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

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
  pdf: { label: "PDF", icon: FileText, className: "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50" },
  doc: { label: "Word", icon: FileText, className: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 border-blue-200 dark:border-blue-900/50" },
  sheet: { label: "Excel", icon: FileSpreadsheet, className: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50" },
  slide: { label: "Slide", icon: FileText, className: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50" },
  image: { label: "Ảnh", icon: Files, className: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50" },
  other: { label: "File", icon: Files, className: "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/50" },
};

export default function StudentFilesPage() {
  const { courseId: routeCourseId, classId: routeClassId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");
  const [viewMode, setViewMode] = useState("timeline"); // 'timeline' hoặc 'cards'

  // URL filters
  const selectedCourseId = routeCourseId || searchParams.get("courseId") || "all";
  const selectedClassId = routeClassId || searchParams.get("classId") || "all";
  const selectedTimePreset = searchParams.get("time") || "all"; // 'all', 'today', 'week'

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await fetchStudentFiles({
        courseId: selectedCourseId !== "all" ? selectedCourseId : undefined,
        classId: selectedClassId !== "all" ? selectedClassId : undefined,
      });
      setFiles(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
      console.error("Unable to load student files", error);
      setErrorMessage("Không thể tải tài liệu học tập. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedCourseId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Extract unique courses and classes for filters
  const filterOptions = useMemo(() => {
    const coursesMap = new Map();
    const classesMap = new Map();

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
  }, [files]);

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
    setSearchParams(next);
  };

  const handleClassFilterChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("classId");
    else next.set("classId", val);
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
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
                Tất cả slide bài giảng, đề ôn tập và tài liệu học tập được sắp xếp theo từng Ngày học và Lớp học để bạn dễ dàng ôn luyện.
              </p>
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode("timeline")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "timeline"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Theo ngày học</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Dạng thẻ</span>
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
                  value={selectedClassId}
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
          <ErrorState title="Không tải được tài liệu" message={errorMessage} onRetry={loadFiles} />
        ) : visibleFiles.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Chưa có tài liệu phù hợp"
            description="Tài liệu giáo viên chia sẻ theo từng buổi học sẽ xuất hiện tại đây."
          />
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
                <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groupFiles.map((file) => {
                    const kind = kindForFile(file);
                    const config = fileConfig[kind];
                    const Icon = config.icon;
                    return (
                      <div
                        key={file.id}
                        className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/40 p-4 flex flex-col justify-between space-y-3 hover:border-emerald-400 hover:shadow-md transition"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${config.className}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {fileSize(file.sizeBytes || file.size_bytes)}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block truncate">
                              {file.courseTitle || "CSCA Course"} · {file.classTitle || "Lớp học"}
                            </span>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 mt-0.5 leading-relaxed" title={file.name}>
                              {file.name}
                            </h4>
                            {file.sessionTitle && (
                              <p className="mt-1 text-[11px] text-slate-500 truncate" title={file.sessionTitle}>
                                Buổi: {file.sessionTitle}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
                          <span className="text-[10px] text-slate-400">
                            {file.uploadedBy || "Giảng viên"}
                          </span>
                          <button
                            type="button"
                            onClick={() => download(file)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 px-3 py-1.5 text-xs font-bold shadow-2xs transition"
                          >
                            <Download className="h-3.5 w-3.5" /> Tải về
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* ================= CARDS GRID VIEW ================= */
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFiles.map((file) => {
              const kind = kindForFile(file);
              const config = fileConfig[kind];
              const Icon = config.icon;
              return (
                <article
                  key={file.id}
                  className="flex min-h-56 flex-col justify-between rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs transition hover:border-emerald-400 hover:shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${config.className}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {fileSize(file.sizeBytes || file.size_bytes)}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          {file.courseTitle || "Tài liệu chung"}
                        </span>
                        {file.classTitle && (
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {file.classTitle}
                          </span>
                        )}
                      </div>

                      <h2 className="mt-2.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-white" title={file.name}>
                        {file.name}
                      </h2>

                      {file.sessionTitle && (
                        <p className="mt-1 text-xs text-slate-500 truncate" title={file.sessionTitle}>
                          Buổi: {file.sessionTitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3.5">
                    <span className="text-[11px] text-slate-400">
                      {file.sessionStartTime ? formatDateOnly(file.sessionStartTime) : (file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString("vi-VN") : "")}
                    </span>
                    <button
                      type="button"
                      onClick={() => download(file)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 px-3.5 py-2 text-xs font-bold shadow-2xs transition"
                    >
                      <Download className="h-3.5 w-3.5" /> Tải về
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
