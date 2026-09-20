import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Trophy,
} from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { ErrorState } from "../../../components/common/StateView";

const workspaceItems = [
  { to: "", label: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "learn", label: "Bài học", icon: BookOpen },
  { to: "assignments", label: "Bài tập & Quiz", icon: ClipboardList },
  { to: "schedule", label: "Lịch học Live", icon: CalendarDays },
  { to: "files", label: "Tài liệu", icon: FileText },
  { to: "results", label: "Kết quả", icon: Trophy },
];

export default function CourseWorkspaceLayout() {
  const { courseId } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchCourseWorkspace(courseId);
      if (!response?.success || !response.data) throw new Error(response?.message || "Không thể tải khóa học");
      setWorkspace(response.data);
    } catch (requestError) {
      setWorkspace(null);
      setError(requestError.message || "Bạn chưa được cấp quyền vào khóa học này.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-sm text-slate-300">
          <LoaderCircle className="h-5 w-5 animate-spin text-rose-400" /> Đang mở không gian khóa học...
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12">
        <ErrorState
          title="Chưa thể mở khóa học"
          message={error}
          onRetry={loadWorkspace}
        />
        <div className="text-center"><Link to="/lms/catalog" className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-100 hover:bg-slate-700"><ArrowLeft className="h-4 w-4" /> Danh mục khóa học</Link></div>
      </div>
    );
  }

  const { course, progress } = workspace;
  const basePath = `/lms/courses/${courseId}/workspace`;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Link to="/lms/catalog" className="hover:text-white">Danh mục khóa học</Link>
          <span>/</span>
          <Link to="/lms/catalog" className="hover:text-white">Danh mục khóa học</Link>
          <span>/</span>
          <span className="max-w-[240px] truncate text-slate-200">{course.title}</span>
        </div>

        <section className="overflow-hidden rounded-3xl border border-rose-500/20 bg-gradient-to-br from-rose-950/45 via-slate-900 to-slate-950 p-5 shadow-xl shadow-rose-950/10 sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="min-w-0">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">Không gian khóa học</p>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{course.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{course.description || "Theo dõi bài học, lịch học và kết quả của riêng khóa học này."}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {course.category && <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 font-bold text-rose-200">{course.category}</span>}
                {course.level && <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 font-bold text-sky-200">{course.level}</span>}
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-slate-300">Giảng viên: {course.instructor_name || "CSCA Academy"}</span>
              </div>
            </div>
            <div className="min-w-[200px] rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Tiến độ bài học</span><span className="font-black text-emerald-400">{progress.percent}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} /></div>
              <p className="mt-2 text-[11px] text-slate-500">{progress.completedLessons}/{progress.totalLessons} bài đã hoàn thành</p>
            </div>
          </div>
        </section>

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80 p-1.5" aria-label="Điều hướng khóa học">
          {workspaceItems.map((item) => {
            const Icon = item.icon;
            const destination = item.to ? `${basePath}/${item.to}` : basePath;
            return (
              <NavLink
                key={item.label}
                to={destination}
                end={item.end}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${isActive ? "bg-rose-600 text-white shadow-lg shadow-rose-950/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
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
