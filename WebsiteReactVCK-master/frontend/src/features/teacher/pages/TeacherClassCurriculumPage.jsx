/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Clock3, ExternalLink, FileText, PlayCircle } from "lucide-react";
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
    ? `/admin/classes/${classId}` : `/lms/teach/classes/${classId}`;
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

  useEffect(() => { loadCurriculum(); }, [loadCurriculum]);

  const lessonsBySection = useMemo(() => {
    const groups = new Map();
    for (const lesson of workspace?.lessons || []) {
      const key = String(lesson.section_id || lesson.sectionId || "unassigned");
      groups.set(key, [...(groups.get(key) || []), lesson]);
    }
    return groups;
  }, [workspace?.lessons]);

  if (loading) return <Loading loading text="Đang mở giáo trình lớp học..." fullScreen={false} className="min-h-[55vh] py-16" />;
  if (error || !workspace) return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể mở giáo trình" message={error} onRetry={loadCurriculum} /></div>;

  const sections = workspace.sections || [];
  const unassignedLessons = lessonsBySection.get("unassigned") || [];
  const totalLessons = (workspace.lessons || []).length;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <Link to={classBasePath} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400">
          <ArrowLeft className="h-4 w-4" /> Quay lại lớp và lịch dạy
        </Link>

        <section className="overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-800 px-5 py-4 text-white shadow-sm dark:border-blue-900/60 dark:shadow-none sm:px-6 sm:py-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 space-y-1 sm:space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold backdrop-blur">
                <BookOpen className="h-3.5 w-3.5" /> Giáo trình lớp học
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {workspace.course?.title || workspace.course?.name || classInfo?.courseTitle || "Giáo trình khóa học"}
              </h1>
              <p className="text-xs font-medium text-blue-100 sm:text-sm">
                Lớp: <strong className="font-bold text-white">{classInfo?.title || `Lớp #${classId}`}</strong> · {totalLessons} bài học đã công bố
              </p>
            </div>
            {isAdmin && (
              <Link
                to="/admin/curriculum"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50"
              >
                <BookOpen className="h-3.5 w-3.5" /> Quản lý giáo trình
              </Link>
            )}
          </div>
        </section>

        {sections.length === 0 && unassignedLessons.length === 0 ? (
          <EmptyState icon={BookOpen} title="Chưa có giáo trình được công bố" description="Các chương và bài học đã xuất bản sẽ hiển thị tại đây." />
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
            {unassignedLessons.length > 0 && <CurriculumSection section={{ title: "Bài học chưa phân chương" }} lessons={unassignedLessons} />}
          </div>
        )}
      </div>
    </div>
  );
}

function CurriculumSection({ index, section, lessons }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          {index && <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">Chương {index}</p>}
          <h2 className="mt-0.5 font-bold text-slate-900 dark:text-white">{section.title}</h2>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
          {lessons.length} bài học
        </span>
      </div>
      {lessons.length ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {lessons.map((lesson, lessonIndex) => (
            <LessonRow key={lesson.id} lesson={lesson} number={lessonIndex + 1} />
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs text-slate-500">Chương này chưa có bài học được xuất bản.</p>
      )}
    </section>
  );
}

function LessonRow({ lesson, number }) {
  const duration = formatDuration(lesson.duration_seconds || lesson.durationSeconds);
  const learningUrl = lesson.learning_url || lesson.learningUrl;
  return (
    <article className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {number}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
            {lesson.title || lesson.name || "Bài học chưa đặt tên"}
          </h3>
          {lesson.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {lesson.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {duration && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" /> {duration}
              </span>
            )}
            {lesson.has_video && (
              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-sky-400">
                <PlayCircle className="h-3.5 w-3.5" /> Video
              </span>
            )}
            {!lesson.has_video && !learningUrl && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Nội dung bài học
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
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/70 dark:text-sky-300 dark:hover:bg-blue-950/30"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Mở tài liệu
        </a>
      )}
    </article>
  );
}
