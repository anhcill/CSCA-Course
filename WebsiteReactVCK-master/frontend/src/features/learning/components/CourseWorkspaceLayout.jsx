import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, ClipboardList, FileText, LayoutDashboard, Trophy, Users } from "lucide-react";
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
  const navigate = useNavigate();
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

  const { course = {}, progress = {}, selectedClass = {}, classes = [] } = workspace;
  const completedLessons = Number(progress.completedLessons || 0);
  const totalLessons = Number(progress.totalLessons || 0);
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const basePath = `/lms/courses/${courseId}/classes/${classId}`;

  const handleClassChange = (event) => {
    const nextClassId = event.target.value;
    if (nextClassId && nextClassId !== classId) {
      navigate(`/lms/courses/${courseId}/classes/${nextClassId}`);
    }
  };

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

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-none sm:px-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-xl">
                {selectedClass.title || course.title}
              </h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                {course.title}{course.category ? ` · ${course.category}` : ""}{course.level ? ` · ${course.level}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                {classes.length > 1 ? (
                  <div className="relative inline-flex items-center">
                    <span className="sr-only">Đổi lớp học</span>
                    <Users className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-600 dark:text-sky-400" />
                    <select
                      value={classId}
                      onChange={handleClassChange}
                      aria-label="Chọn lớp học khác"
                      className="cursor-pointer appearance-none rounded-full bg-white dark:bg-slate-800 pl-8 pr-8 py-1.5 text-xs font-bold text-blue-700 dark:text-sky-300 shadow-sm ring-1 ring-blue-200 dark:ring-slate-700 outline-none hover:ring-blue-400 transition"
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800">
                          Lớp: {cls.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-600 dark:text-sky-400" />
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1.5 text-blue-700 dark:text-sky-300 shadow-sm ring-1 ring-blue-100 dark:ring-slate-700">
                    <Users className="h-3.5 w-3.5" /> Lớp: {selectedClass.title || "Đang cập nhật"}
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-[210px] rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">Tiến độ bài học</span>
                <span className="text-blue-600 dark:text-sky-400 font-bold">{percent}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                {completedLessons}/{totalLessons} bài đã hoàn thành
              </p>
            </div>
          </div>
        </section>

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
