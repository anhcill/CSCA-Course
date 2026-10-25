import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  FolderOpen,
  GraduationCap,
  PlaySquare,
  Search,
  School,
  Sparkles,
  RefreshCw,
  X,
  Play,
} from "lucide-react";
import { fetchStudentRecordings } from "../../api/lmsClient";
import { ErrorState, LoadingState } from "../../../components/common/StateView";

import StudentRecordingsHeroHeader from "../components/recordings/StudentRecordingsHeroHeader";
import RecordingCard from "../components/recordings/RecordingCard";
import RecordingStatsWidget from "../components/recordings/RecordingStatsWidget";
import RecordingDriveFoldersWidget from "../components/recordings/RecordingDriveFoldersWidget";
import RecordingStudyTipsWidget from "../components/recordings/RecordingStudyTipsWidget";
import usePersistentClassSelection from "../hooks/usePersistentClassSelection";

const dateValue = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const formatDateTime = (value) => {
  if (!dateValue(value)) return "Chưa cập nhật ngày";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatClassTitle = (title) => {
  if (!title) return "Lớp học";
  const str = String(title).trim();
  if (/^\d+$/.test(str)) return `Lớp ${str}`;
  return str;
};

export default function StudentRecordingsPage() {
  const [data, setData] = useState({ classes: [], recordings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchStudentRecordings();
      const payload = response?.data;
      if (Array.isArray(payload)) {
        const classMap = new Map();
        payload.forEach((item) =>
          classMap.set(item.classId, {
            id: item.classId,
            title: item.classTitle,
            courseTitle: item.courseTitle,
            folderUrl: item.driveUrl || item.openUrl || null,
            folderOpenUrl: item.openUrl || null,
            folderPublished: true,
          })
        );
        setData({ classes: [...classMap.values()], recordings: payload });
      } else if (payload && (Array.isArray(payload.recordings) || Array.isArray(payload.classes))) {
        setData({
          classes: payload.classes || [],
          recordings: payload.recordings || [],
        });
      } else {
        setData({ classes: [], recordings: [] });
      }
    } catch (loadError) {
      console.error("Error loading live recordings:", loadError);
      setError("Không thể tải danh sách bản ghi buổi học. Vui lòng thử lại sau.");
      setData({ classes: [], recordings: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const classes = useMemo(() => {
    return data.classes
      .map((c) => {
        const driveUrl = c.folderOpenUrl || c.folderUrl || null;
        return {
          ...c,
          classDriveUrl: driveUrl,
          folderOpenUrl: c.folderOpenUrl || driveUrl,
        };
      })
      .sort(
        (a, b) =>
          dateValue(b.latestRecordingAt) - dateValue(a.latestRecordingAt) ||
          String(a.title).localeCompare(String(b.title), "vi")
      );
  }, [data.classes]);

  const classIds = useMemo(() => classes.map((item) => item.id), [classes]);
  const [classId, setClassId] = usePersistentClassSelection({
    scope: "recordings",
    availableClassIds: classIds,
    allValue: "all",
    ready: !loading,
  });

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return classes.flatMap((classItem) => {
      if (classId !== "all" && classItem.id !== classId) return [];
      const items = data.recordings
        .filter((item) => item.classId === classItem.id)
        .filter(
          (item) =>
            !needle ||
            [
              item.title,
              item.description,
              item.classTitle,
              item.courseTitle,
              item.sessionTitle,
              formatDateTime(item.recordedAt),
            ].some((value) => String(value || "").toLowerCase().includes(needle))
        )
        .sort((a, b) => dateValue(b.recordedAt) - dateValue(a.recordedAt));

      const classMatches =
        !needle ||
        [classItem.title, classItem.courseTitle].some((value) =>
          String(value || "").toLowerCase().includes(needle)
        );
      if (!classMatches && items.length === 0) return [];

      return [
        {
          ...classItem,
          classDriveUrl:
            classItem.classDriveUrl ||
            classItem.folderOpenUrl ||
            classItem.folderUrl ||
            null,
          items,
        },
      ];
    });
  }, [classId, classes, data.recordings, search]);

  const classCards = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return classes
      .map((classItem) => {
        const recordings = data.recordings
          .filter((item) => item.classId === classItem.id)
          .sort((a, b) => dateValue(b.recordedAt) - dateValue(a.recordedAt));
        return {
          ...classItem,
          recordings,
          latest: recordings[0] || null,
          sessionCount: new Set(recordings.filter((item) => item.sessionId).map((item) => item.sessionId)).size,
          matches: !needle || [
            classItem.title,
            classItem.courseTitle,
            ...recordings.flatMap((item) => [item.title, item.sessionTitle]),
          ].some((value) => String(value || "").toLowerCase().includes(needle)),
        };
      })
      .filter((item) => item.matches);
  }, [classes, data.recordings, search]);

  const visibleCount = classId === "all" ? classCards.length : groups.length;

  // Total stats
  const totalRecordings = data.recordings.length;
  const totalMinutes = useMemo(() => {
    return data.recordings.reduce((sum, item) => sum + (Number(item.durationMinutes) || 60), 0);
  }, [data.recordings]);
  const classesWithRecordings = useMemo(() => {
    const classSet = new Set(data.recordings.map((r) => r.classId));
    return classSet.size;
  }, [data.recordings]);

  const handlePlayVideo = (item) => {
    if (item.openUrl) {
      window.open(item.openUrl, "_blank", "noopener,noreferrer");
    } else {
      setSelectedVideo(item);
    }
  };

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px]">
        {/* Main 2-Column Grid */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_310px]">
          {/* Left Column: Hero Header + Search Bar + Class Groups & Video Cards */}
          <div className="space-y-4 min-w-0">
            {/* Title & Inspirational Quote Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <StudentRecordingsHeroHeader />

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  onClick={loadRecordings}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/85 bg-white/90 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-white hover:text-blue-600 disabled:opacity-60"
                  title="Làm mới danh sách"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
                  <span>Làm mới</span>
                </button>
              </div>
            </div>

            {/* Floating Glassmorphism Search & Filter Toolbar */}
            <section className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-2xl border border-white/85 bg-white/92 p-2.5 sm:p-3 shadow-[0_8px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm bản ghi, bài giảng, chủ đề..."
                  className="h-10 w-full rounded-xl border border-slate-200/80 bg-white/90 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="relative min-w-[160px] sm:min-w-[200px]">
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 pr-8 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
                  >
                    <option value="all">Tất cả lớp ({classes.length})</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatClassTitle(c.title)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Content List: Classes & Recordings */}
            {loading ? (
              <LoadingState message="Đang tải danh sách bản ghi buổi học..." count={2} />
            ) : error && visibleCount === 0 ? (
              <ErrorState title="Chưa thể tải bản ghi" message={error} onRetry={loadRecordings} />
            ) : visibleCount === 0 ? (
              <div className="rounded-2xl border border-white/85 bg-white/90 p-12 text-center shadow-xs backdrop-blur-md">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <PlaySquare className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-800">
                  Chưa có bản ghi nào phù hợp
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {search
                    ? `Không tìm thấy kết quả phù hợp với từ khóa "${search}".`
                    : "Chưa có video bản ghi hoặc thư mục nào được phát hành cho lớp học này."}
                </p>
                {(search || classId !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setClassId("all");
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                  >
                    Xem tất cả lớp
                  </button>
                )}
              </div>
            ) : classId === "all" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {classCards.map((classItem) => (
                  <button
                    key={classItem.id}
                    type="button"
                    onClick={() => setClassId(classItem.id)}
                    className="group flex min-w-0 flex-col justify-between rounded-2xl border border-white/80 bg-white/95 p-3.5 text-left shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-blue-200/60 bg-blue-50 px-2 py-0.5 font-bold text-blue-700">
                          <BookOpen className="h-3 w-3 shrink-0" />
                          <span className="truncate">[{classItem.courseTitle || "CSCA"}]</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Lớp học</span>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white"><GraduationCap className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-1 text-sm font-extrabold leading-snug text-[#102f63] transition group-hover:text-blue-600">{formatClassTitle(classItem.title)}</h3>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">{classItem.courseTitle || "Khóa học CSCA"}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-2"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Bản ghi</span><span className="text-sm font-black text-[#102f63]">{classItem.recordings.length} video</span></div>
                        <div className="rounded-xl border border-blue-100/60 bg-blue-50/40 p-2"><span className="block text-[9px] font-bold uppercase tracking-wider text-blue-600">Buổi có video</span><span className="text-sm font-black text-blue-700">{classItem.sessionCount} buổi</span></div>
                      </div>

                      {classItem.latest && <div className="flex items-center gap-1.5 truncate rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-[10px] text-slate-600"><Sparkles className="h-3 w-3 shrink-0 text-amber-500" /><span className="truncate">Mới nhất: <strong className="font-semibold text-slate-800">{classItem.latest.sessionTitle || classItem.latest.title}</strong></span></div>}
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-xs font-bold text-blue-600 group-hover:text-blue-700"><span className="text-[10px] text-slate-400">Xem video theo buổi học</span><span className="inline-flex items-center gap-1">Vào xem <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                <button type="button" onClick={() => setClassId("all")} className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs font-bold text-slate-600 shadow-xs hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5" /> Danh sách lớp</button>
                {groups.map((group) => (
                  <section
                    key={group.id}
                    className="overflow-hidden rounded-3xl border border-white/85 bg-white/92 shadow-[0_10px_35px_rgba(32,78,120,0.06)] backdrop-blur-md"
                  >
                    {/* Class Group Banner */}
                    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-100/70 bg-[#ebf5fc] p-4 sm:p-5">
                      <div className="flex items-center gap-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/25">
                          <School className="h-5 w-5" />
                        </span>
                        <div>
                          <h2
                            className="text-base sm:text-lg font-black tracking-tight text-[#102f63]"
                            style={{ color: "#102f63" }}
                          >
                            {formatClassTitle(group.title)}
                          </h2>
                          <p
                            className="mt-0.5 text-xs font-semibold text-slate-700"
                            style={{ color: "#334155" }}
                          >
                            <span>{group.courseTitle || "Khóa học CSCA"}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span
                              className="font-bold text-blue-700"
                              style={{ color: "#1d4ed8" }}
                            >
                              {group.items.length} bản ghi
                            </span>
                          </p>
                        </div>
                      </div>

                      {group.classDriveUrl && (
                        <a
                          href={group.classDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 active:scale-95 self-start sm:self-auto"
                        >
                          <FolderOpen className="h-4 w-4" />
                          <span>Mở Drive của lớp</span>
                          <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                        </a>
                      )}
                    </header>

                    {/* Class Days & Cards */}
                    {group.items.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Bản ghi các buổi học được tự động đồng bộ vào thư mục Google Drive của lớp học.
                      </div>
                    ) : (
                      <div className="p-3 sm:p-4">
                        <div className="flex flex-wrap items-start gap-2">
                          {group.items.map((item) => (
                            <RecordingCard
                              key={item.id}
                              item={item}
                              onPlay={handlePlayVideo}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Widgets */}
          <div className="space-y-4">
            {/* Widget 1: Recording Stats */}
            <RecordingStatsWidget
              totalRecordings={totalRecordings}
              totalMinutes={totalMinutes}
              totalClasses={classesWithRecordings}
            />

            {/* Widget 2: Class Drive Folders */}
            <RecordingDriveFoldersWidget classes={classes} />

            {/* Widget 3: Study Tips */}
            <RecordingStudyTipsWidget />
          </div>
        </div>
      </div>

      {/* Video Modal if direct in-app preview is used */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-slate-900 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between border-b border-slate-800 p-4 text-white">
              <div className="min-w-0 pr-4">
                <h3 className="truncate text-sm font-bold">{selectedVideo.title}</h3>
                <p className="text-xs text-slate-400">{formatClassTitle(selectedVideo.classTitle)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideo(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="aspect-video w-full bg-black flex items-center justify-center p-8 text-center text-white">
              <div>
                <Play className="mx-auto h-16 w-16 text-blue-500 mb-3" />
                <p className="text-sm font-bold">Mở video trên Google Drive để xem độ phân giải cao nhất</p>
                {selectedVideo.openUrl && (
                  <a
                    href={selectedVideo.openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition"
                  >
                    <span>Mở ngay trên Google Drive</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
