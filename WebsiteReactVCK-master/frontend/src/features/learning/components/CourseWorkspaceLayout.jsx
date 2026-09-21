import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, FileText, LayoutDashboard, LoaderCircle, Trophy } from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { ErrorState } from "../../../components/common/StateView";

const workspaceItems = [
  { to: "", label: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "learn", label: "Bài học", icon: BookOpen },
  { to: "assignments", label: "Bài tập & Quiz", icon: ClipboardList },
  { to: "schedule", label: "Lịch học", icon: CalendarDays },
  { to: "files", label: "Tài liệu", icon: FileText },
  { to: "results", label: "Kết quả", icon: Trophy },
];

export default function CourseWorkspaceLayout() {
  const { courseId, classId } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetchCourseWorkspace(courseId, { classId });
      if (!response?.success || !response.data) throw new Error(response?.message || "Không thể tải khóa học");
      setWorkspace(response.data);
    } catch (requestError) {
      setWorkspace(null);
      setError(requestError.message || "Bạn chưa được cấp quyền vào khóa học này.");
    } finally { setLoading(false); }
  }, [classId, courseId]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center bg-[#f6f9fd]"><div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm"><LoaderCircle className="h-5 w-5 animate-spin text-blue-600" /> Đang mở không gian khóa học...</div></div>;
  if (!workspace) return <div className="bg-[#f6f9fd] px-4 py-12"><div className="mx-auto max-w-xl space-y-4"><ErrorState title="Chưa thể mở khóa học" message={error} onRetry={loadWorkspace} /><div className="text-center"><Link to={`/lms/courses/${courseId}/classes`} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"><ArrowLeft className="h-4 w-4" /> Chọn lớp học</Link></div></div></div>;

  const { course = {}, progress = {}, selectedClass = {} } = workspace;
  const completedLessons = Number(progress.completedLessons || 0);
  const totalLessons = Number(progress.totalLessons || 0);
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const basePath = `/lms/courses/${courseId}/classes/${classId}`;

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500"><Link to="/lms/catalog" className="hover:text-blue-700">Khóa học của tôi</Link><span>/</span><Link to={`/lms/courses/${courseId}/classes`} className="hover:text-blue-700">Lớp học</Link><span>/</span><span className="max-w-[260px] truncate font-semibold text-slate-700">{selectedClass.title || course.title}</span></div>
        <section className="overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-[#e9f3ff] via-white to-[#f2f8ff] p-6 shadow-sm sm:p-8"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Không gian khóa học</p><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{course.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{course.description || "Theo dõi bài học, lịch học, tài liệu và kết quả của riêng lớp này."}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-white px-3 py-1.5 text-blue-700 shadow-sm ring-1 ring-blue-100">Lớp: {selectedClass.title || "Đang cập nhật"}</span>{course.category && <span className="rounded-full bg-white px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-slate-100">{course.category}</span>}{course.level && <span className="rounded-full bg-white px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-slate-100">{course.level}</span>}</div></div><div className="min-w-[220px] rounded-2xl border border-white bg-white/90 p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-semibold"><span className="text-slate-500">Tiến độ bài học</span><span className="text-blue-600">{percent}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{completedLessons}/{totalLessons} bài đã hoàn thành</p></div></div></section>
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Điều hướng khóa học">{workspaceItems.map((item) => { const Icon = item.icon; const destination = item.to ? `${basePath}/${item.to}` : basePath; return <NavLink key={item.label} to={destination} end={item.end} className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-4 w-4" /> {item.label}</NavLink>; })}</nav>
        <Outlet context={workspace} />
      </div>
    </div>
  );
}
