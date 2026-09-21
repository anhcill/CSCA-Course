import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, LoaderCircle, Users } from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { EmptyState, ErrorState } from "../../../components/common/StateView";

export default function CourseClassListPage() {
  const { courseId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClasses = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetchCourseWorkspace(courseId);
      if (!response?.success || !response.data) throw new Error(response?.message || "Không thể tải lớp học.");
      setData(response.data);
    } catch (requestError) {
      setData(null);
      setError(requestError.message || "Không thể tải lớp học.");
    } finally { setLoading(false); }
  }, [courseId]);
  useEffect(() => { loadClasses(); }, [loadClasses]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center bg-[#f6f9fd]"><div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm"><LoaderCircle className="h-5 w-5 animate-spin text-blue-600" /> Đang tải lớp học...</div></div>;
  if (!data) return <div className="bg-[#f6f9fd] px-4 py-12"><div className="mx-auto max-w-xl"><ErrorState variant="light" title="Chưa thể mở khóa học" message={error} onRetry={loadClasses} /></div></div>;

  const { course = {}, classes = [] } = data;
  return (
    <main className="min-h-full bg-[#f6f9fd] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><Link to="/lms/catalog" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> Khóa học của tôi</Link><header className="mt-5 rounded-3xl border border-blue-100 bg-gradient-to-r from-[#eaf4ff] via-white to-[#f3f8ff] p-6 shadow-sm sm:p-8"><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-blue-100"><Users className="h-3.5 w-3.5" /> Chọn lớp học</span><h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{course.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Chỉ các lớp mà hệ thống quản lý đã xếp cho bạn được hiển thị. Chọn một lớp để mở nội dung và hoạt động học tập.</p></header>{classes.length === 0 ? <div className="mt-6"><EmptyState variant="light" icon={Users} title="Bạn chưa được xếp lớp" description="Bạn đã có quyền với khóa học này nhưng chưa có lớp hoạt động. Vui lòng liên hệ bộ phận quản lý để được xếp lớp." /></div> : <section className="mt-6 grid gap-4 md:grid-cols-2">{classes.map((liveClass) => <Link key={liveClass.id} to={`/lms/courses/${courseId}/classes/${liveClass.id}`} className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><BookOpen className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate text-lg font-black text-slate-900 group-hover:text-blue-700">{liveClass.title}</h2><p className="mt-1 text-xs text-slate-500">Giáo viên: {liveClass.instructor_name || "Chưa phân công"}</p></div></div>{liveClass.description && <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{liveClass.description}</p>}<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><span className="text-slate-500">Lớp đã được cấp quyền</span><span className="inline-flex items-center gap-1.5 font-bold text-blue-600">Vào lớp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></div></Link>)}</section>}</div></main>
  );
}
