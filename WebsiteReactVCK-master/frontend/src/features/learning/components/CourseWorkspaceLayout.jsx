import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Users,
} from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import { ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";

const formatClassTitle = (title) => {
  if (!title) return "Lớp học";
  const str = String(title).trim();
  if (/^\d+$/.test(str)) return `Lớp ${str}`;
  return str;
};

export default function CourseWorkspaceLayout() {
  const { courseId, classId } = useParams();
  const location = useLocation();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchCourseWorkspace(courseId, { classId });
      if (!response?.success || !response.data) throw new Error(response?.message || "Không thể tải khóa học");
      setWorkspace(response.data);
    } catch (requestError) {
      setWorkspace(null);
      setError(requestError.message || "Bạn chưa được cấp quyền vào khóa học này.");
    } finally {
      setLoading(false);
    }
  }, [classId, courseId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const unsubscribe = subscribeToCalendarChanges(loadWorkspace);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadWorkspace();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadWorkspace]);

  if (loading) {
    return (
      <Loading
        loading={true}
        text="Đang mở không gian khóa học..."
        fullScreen={false}
        className="min-h-[55vh] py-16"
      />
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-full px-4 py-12">
        <div className="mx-auto max-w-xl space-y-4">
          <ErrorState title="Chưa thể mở khóa học" message={error} onRetry={loadWorkspace} />
          <div className="text-center">
            <Link
              to="/lms/my-learning"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <ArrowLeft className="h-4 w-4" /> Về khóa học của tôi
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { course = {}, selectedClass = {}, progress = {} } = workspace;
  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const isOverviewPage =
    location.pathname === basePath ||
    location.pathname === `${basePath}/` ||
    location.pathname === `${basePath}/overview`;
  const isSessionWorkspace = location.pathname.includes(`${basePath}/sessions/`);
  const isSubmittingOrQuiz =
    location.pathname.includes(`${basePath}/quizzes/`) ||
    (location.pathname.includes(`${basePath}/assignments/`) && location.pathname.includes("/submit"));
  const isFocusedView = isSessionWorkspace || isSubmittingOrQuiz;

  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const classDisplayName = formatClassTitle(selectedClass.title);

  return (
    <div className="min-h-full px-3 pb-12 pt-3 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1480px] space-y-4 sm:space-y-5">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#487291]">
            <Link
              to="/lms/my-learning"
              className="inline-flex items-center gap-1 font-bold text-[#17365f] hover:text-blue-700 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Khóa học của tôi
            </Link>
            <span className="text-slate-300">/</span>
            <Link
              to={`/lms/courses/${courseId}/classes`}
              className="max-w-[200px] truncate text-[#244866] hover:text-blue-700 transition sm:max-w-xs"
            >
              {course.title || "Khóa học"}
            </Link>
            <span className="text-slate-300">/</span>
            <span className="max-w-[240px] truncate font-bold text-[#102f63] sm:max-w-sm">
              {classDisplayName}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#17365f]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-white px-2.5 py-1 text-[11px] shadow-2xs backdrop-blur-sm">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              {selectedClass.student_count ? `${selectedClass.student_count} học viên` : "Học viên CSCA"}
            </span>
          </div>
        </div>

        {/* Compact Navigation Bar for Focused Quiz/Submit Views */}
        {isSubmittingOrQuiz && (
          <div className="rounded-2xl border border-white/80 bg-white/80 p-3 shadow-xs backdrop-blur-md flex items-center justify-between gap-3">
            <Link
              to={`${basePath}/assignments`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 transition"
            >
              <ArrowLeft className="h-4 w-4" /> Quay lại danh sách bài tập & quiz
            </Link>
            <span className="text-xs font-bold text-[#102f63]">
              {classDisplayName}
            </span>
          </div>
        )}

        {/* Subpage Compact Bar for Calendar/Assignments/Results (when not in Overview or Focused views) */}
        {!isOverviewPage && !isFocusedView && (
          <div className="rounded-2xl border border-white/85 bg-white/85 p-3 sm:px-4 shadow-xs backdrop-blur-md flex items-center justify-between gap-3">
            <Link
              to={basePath}
              className="inline-flex items-center gap-2 text-xs font-bold text-[#17365f] hover:text-blue-700 transition"
            >
              <ArrowLeft className="h-4 w-4" /> Quay lại {classDisplayName}
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to={`${basePath}/calendar`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#17365f] shadow-2xs hover:bg-white hover:text-blue-700 transition"
              >
                <CalendarDays className="h-3.5 w-3.5 text-blue-600" /> Lịch học của lớp
              </Link>
            </div>
          </div>
        )}

        {/* Child Route Outlet */}
        <Outlet context={workspace} />
      </div>
    </div>
  );
}
