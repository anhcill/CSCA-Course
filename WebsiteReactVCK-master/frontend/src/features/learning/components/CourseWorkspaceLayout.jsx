import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, FileText, LayoutDashboard, Trophy } from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import { ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";
import ClassNextSessionHero from "./overview/ClassNextSessionHero";

const workspaceItems = [
  { to: "", label: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "learn", label: "Bài học", icon: BookOpen },
  { to: "calendar", label: "Lịch học", icon: CalendarDays },
  { to: "assignments", label: "Bài tập & Quiz", icon: ClipboardList },
  { to: "materials", label: "Tài liệu", icon: FileText },
  { to: "results", label: "Kết quả", icon: Trophy },
];

export default function CourseWorkspaceLayout() {
  const { courseId, classId } = useParams();
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

  const upcomingSessions = useMemo(() => (workspace?.upcomingSessions || [])
    .filter((session) => session.status !== "cancelled" && new Date(session.end_time).getTime() > Date.now())
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()), [workspace?.upcomingSessions]);
  const nextSession = upcomingSessions[0] || null;
  const isTodaySession = Boolean(
    nextSession?.start_time && new Date(nextSession.start_time).toDateString() === new Date().toDateString(),
  );

  if (loading) {
    return <Loading loading={true} text="Đang mở không gian khóa học..." fullScreen={false} className="min-h-[55vh] py-16" />;
  }

  if (!workspace) {
    return (
      <div className="bg-[#f6f9fd] dark:bg-slate-950 px-4 py-12">
        <div className="mx-auto max-w-xl space-y-4">
          <ErrorState title="Chưa thể mở khóa học" message={error} onRetry={loadWorkspace} />
          <div className="text-center">
            <Link
              to={`/lms/courses/${courseId}/classes`}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <ArrowLeft className="h-4 w-4" /> Chọn lớp học
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { course = {}, selectedClass = {} } = workspace;
  const basePath = `/lms/courses/${courseId}/classes/${classId}`;

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Link to="/lms/my-learning" className="hover:text-blue-700 dark:hover:text-sky-400">Khóa học của tôi</Link>
          <span>/</span>
          <Link to={`/lms/courses/${courseId}/classes`} className="hover:text-blue-700 dark:hover:text-sky-400">Lớp học</Link>
          <span>/</span>
          <span className="max-w-[260px] truncate font-semibold text-slate-700 dark:text-slate-300">
            {selectedClass.title || course.title}
          </span>
        </div>

        <ClassNextSessionHero
          nextSession={nextSession}
          isTodaySession={isTodaySession}
          otherSessions={upcomingSessions.slice(1, 3)}
          instructorName={selectedClass.instructor_name}
          classTitle={selectedClass.title}
          basePath={basePath}
        />

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-sm dark:shadow-none" aria-label="Điều hướng khóa học">
          {workspaceItems.map((item) => {
            const Icon = item.icon;
            const destination = item.to ? `${basePath}/${item.to}` : basePath;
            return (
              <NavLink
                key={item.label}
                to={destination}
                end={item.end}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </NavLink>
            );
          })}
        </nav>
        <Outlet context={workspace} />
      </div>
    </div>
  );
}
