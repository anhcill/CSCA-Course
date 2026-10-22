/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Clock3,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  PlayCircle,
  Sparkles,
  Video,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchClassDetails, fetchCourseWorkspace } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";

const formatDuration = (seconds) => {
  const minutes = Math.round(Number(seconds || 0) / 60);
  return minutes ? `${minutes} phút` : null;
};

export default function TeacherClassCurriculumPage() {
  const { classId } = useParams();
  const location = useLocation();
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const classBasePath = location.pathname.startsWith("/admin/classes/")
    ? `/admin/classes/${classId}`
    : `/lms/teach/classes/${classId}`;
  const [workspace, setWorkspace] = useState(null);
  const [classInfo, setClassInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCurriculum = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detailResponse = await fetchClassDetails(classId);
      const detail = detailResponse?.data?.classInfo || detailResponse?.data;
      if (!detail) throw new Error("Không tìm thấy thông tin lớp học này.");
      const courseId = detail.courseId || detail.course_id;
      if (!courseId) throw new Error("Lớp học này chưa được gắn với khóa học nào.");

      const workspaceResponse = await fetchCourseWorkspace(courseId, { classId });
      if (!workspaceResponse?.success || !workspaceResponse.data) {
        throw new Error(workspaceResponse?.message || "Không thể tải giáo trình khóa học.");
      }
      setClassInfo(detail);
      setWorkspace(workspaceResponse.data);
    } catch (requestError) {
      setWorkspace(null);
      setClassInfo(null);
      setError(requestError.message || "Không thể tải giáo trình khóa học.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadCurriculum();
  }, [loadCurriculum]);

  const lessonsBySection = useMemo(() => {
    const groups = new Map();
    for (const lesson of workspace?.lessons || []) {
      const key = String(lesson.section_id || lesson.sectionId || "unassigned");
      groups.set(key, [...(groups.get(key) || []), lesson]);
    }
    return groups;
  }, [workspace?.lessons]);

  const sections = workspace?.sections || [];
  const unassignedLessons = lessonsBySection.get("unassigned") || [];
  const totalLessons = (workspace?.lessons || []).length;
  const videoLessonsCount = (workspace?.lessons || []).filter((l) => l.has_video).length;

  const totalDurationMinutes = useMemo(() => {
    const totalSec = (workspace?.lessons || []).reduce(
      (sum, l) => sum + Number(l.duration_seconds || l.durationSeconds || 0),
      0
    );
    return Math.round(totalSec / 60);
  }, [workspace?.lessons]);

  if (loading) {
    return (
      <div className="min-h-[60vh] p-4 flex items-center justify-center">
        <div className="rounded-3xl border border-white/80 bg-white/90 p-12 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
          <Loading loading={true} text="Đang mở giáo trình lớp học..." fullScreen={false} />
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="mx-auto max-w-xl py-12 px-4">
        <div className="rounded-3xl border border-white/80 bg-white/90 p-8 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
          <ErrorState title="Chưa thể mở giáo trình" message={error} onRetry={loadCurriculum} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-2.5 sm:p-4 lg:p-6 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
        
        {/* ================= 1. NÚT ĐIỀU HƯỚNG QUAY LẠI ================= */}
        <div className="flex items-center justify-between">
          <Link
            to={classBasePath}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-3.5 py-1.5 text-xs font-bold text-[#102f63] shadow-2xs backdrop-blur-md transition hover:bg-white hover:text-blue-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại lớp và lịch dạy
          </Link>

          {isAdmin && (
            <Link
              to="/admin/curriculum"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-blue-200 bg-white/90 px-3.5 py-1.5 text-xs font-bold text-blue-700 shadow-2xs backdrop-blur transition hover:bg-blue-50"
            >
              <BookOpen className="h-3.5 w-3.5" /> Quản lý kho giáo trình
            </Link>
          )}
        </div>

        {/* ================= 2. CALLIGRAPHIC HEADER HERO NỀN PHONG CẢNH Á ĐÔNG ================= */}
        <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md transition">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/40 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 space-y-1 sm:space-y-1.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 px-3 py-1 text-xs font-bold text-[#102f63] shadow-2xs">
                <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                <span>Giáo trình học phần & Lộ trình đào tạo</span>
              </div>
              <h1 className="font-['Dancing_Script',cursive] text-3xl sm:text-4xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
                {workspace.course?.title || workspace.course?.name || classInfo?.courseTitle || "Giáo Trình Khóa Học"}
              </h1>
              <p className="text-xs font-semibold italic text-[#244866] sm:text-sm">
                Lớp học: <strong className="font-bold text-[#102f63]">{classInfo?.title || "Lớp học"}</strong> · {totalLessons} bài học đã xuất bản
              </p>
              <p className="font-['Ma_Shan_Zheng',cursive] text-sm sm:text-base tracking-wider text-slate-600">
                —— 循序渐进 · 积厚流光。
              </p>
            </div>
          </div>
        </section>

        {/* ================= 3. 4 THẺ THỐNG KÊ NHANH (KPI TIẾN TRÌNH) ================= */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tổng chương</span>
              <Layers className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-1 text-2xl font-black text-[#102f63] font-mono">
              {sections.length}
            </p>
            <p className="text-[10px] text-slate-500">Chương mục bài học</p>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Tổng bài học</span>
              <BookOpen className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 text-2xl font-black text-[#102f63] font-mono">
              {totalLessons}
            </p>
            <p className="text-[10px] text-slate-500">Đã công bố cho lớp</p>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Bài có Video</span>
              <Video className="h-4 w-4 text-violet-600" />
            </div>
            <p className="mt-1 text-2xl font-black text-[#102f63] font-mono">
              {videoLessonsCount}
            </p>
            <p className="text-[10px] text-slate-500">Video bài giảng đa phương tiện</p>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Thời lượng</span>
              <Clock3 className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 text-2xl font-black text-[#102f63] font-mono">
              {totalDurationMinutes ? `${totalDurationMinutes}p` : "—"}
            </p>
            <p className="text-[10px] text-slate-500">Tổng thời lượng bài học</p>
          </div>
        </section>

        {/* ================= 4. DANH SÁCH CÁC CHƯƠNG VÀ BÀI HỌC ================= */}
        {sections.length === 0 && unassignedLessons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/80 bg-white/85 p-12 text-center backdrop-blur-md">
            <EmptyState
              icon={BookOpen}
              title="Chưa có giáo trình được công bố"
              description="Các chương và bài học đã xuất bản của khóa học này sẽ hiển thị tại đây."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section, index) => (
              <CurriculumSection
                key={section.id}
                index={index + 1}
                section={section}
                lessons={lessonsBySection.get(String(section.id)) || []}
              />
            ))}
            {unassignedLessons.length > 0 && (
              <CurriculumSection
                section={{ title: "Bài học bổ sung / Chưa phân chương" }}
                lessons={unassignedLessons}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CurriculumSection({ index, section, lessons }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/85 bg-white/92 shadow-[0_8px_30px_rgba(32,78,120,0.06)] backdrop-blur-xl transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-[#edf6fd]/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          {index && (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 font-mono text-xs font-black text-blue-700 dark:bg-blue-950/70 dark:text-sky-300 shadow-2xs">
              {index}
            </span>
          )}
          <div>
            {index && (
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">
                Chương {index}
              </p>
            )}
            <h2 className="font-black text-[#102f63] dark:text-white sm:text-base">
              {section.title}
            </h2>
          </div>
        </div>

        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-black text-[#102f63] shadow-2xs border border-sky-100 dark:bg-slate-800 dark:text-sky-200 font-mono">
          {lessons.length} bài học
        </span>
      </div>

      {lessons.length ? (
        <div className="divide-y divide-slate-100/80 dark:divide-slate-800/60">
          {lessons.map((lesson, lessonIndex) => (
            <LessonRow key={lesson.id} lesson={lesson} number={lessonIndex + 1} />
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs font-semibold text-slate-500 italic">
          Chương này chưa có bài học được xuất bản.
        </p>
      )}
    </section>
  );
}

function LessonRow({ lesson, number }) {
  const duration = formatDuration(lesson.duration_seconds || lesson.durationSeconds);
  const learningUrl = lesson.learning_url || lesson.learningUrl;
  return (
    <article className="flex flex-col gap-3 px-5 py-3.5 transition hover:bg-sky-50/40 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-slate-800/40">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-mono font-black text-slate-600 shadow-2xs dark:bg-slate-800 dark:text-slate-300">
          {number}
        </span>
        <div className="min-w-0 space-y-0.5">
          <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
            {lesson.title || lesson.name || "Bài học chưa đặt tên"}
          </h3>
          {lesson.description && (
            <p className="line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {lesson.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 pt-0.5">
            {duration && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock3 className="h-3 w-3 text-slate-400" /> {duration}
              </span>
            )}
            {lesson.has_video && (
              <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-sky-400">
                <PlayCircle className="h-3 w-3" /> Video bài giảng
              </span>
            )}
            {!lesson.has_video && !learningUrl && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3 text-slate-400" /> Lý thuyết & Bài tập
              </span>
            )}
          </div>
        </div>
      </div>

      {learningUrl && (
        <a
          href={learningUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-sky-200/90 bg-white/90 px-3.5 py-1.5 text-xs font-bold text-blue-700 shadow-2xs transition hover:bg-blue-600 hover:text-white dark:border-blue-900/70 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-blue-600"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Mở bài học
        </a>
      )}
    </article>
  );
}
