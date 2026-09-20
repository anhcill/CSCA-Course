import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, LoaderCircle, Users } from "lucide-react";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import { fetchCourseWorkspace } from "../../api/lmsClient";

export default function CourseClassListPage() {
  const { courseId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchCourseWorkspace(courseId);
      if (!response?.success || !response.data) throw new Error(response?.message || "Không thể tải lớp học.");
      setData(response.data);
    } catch (requestError) {
      setData(null);
      setError(requestError.message || "Không thể tải lớp học.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-sm text-slate-300"><LoaderCircle className="h-5 w-5 animate-spin text-rose-400" /> Đang tải lớp học...</div></div>;
  if (!data) return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể mở khóa học" message={error} onRetry={loadClasses} /></div>;

  const { course, classes } = data;
  return (
    <main className="mx-auto max-w-5xl py-4 sm:py-8">
      <Link to="/lms/catalog" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Khóa học của tôi</Link>
      <header className="mt-6 mb-7 border-b border-white/10 pb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">Chọn lớp học</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{course.title}</h1>
        <p className="mt-2 text-sm text-slate-400">Chỉ các lớp mà hệ thống quản lý đã xếp cho bạn được hiển thị. Chọn một lớp để mở các chức năng học tập.</p>
      </header>

      {classes.length === 0 ? <EmptyState icon={Users} title="Bạn chưa được xếp lớp" description="Bạn đã có quyền với khóa học này nhưng chưa có lớp học hoạt động. Vui lòng liên hệ bộ phận quản lý để được xếp lớp." /> : (
        <section className="grid gap-4 md:grid-cols-2">
          {classes.map((liveClass) => (
            <Link key={liveClass.id} to={`/lms/courses/${courseId}/classes/${liveClass.id}`} className="group rounded-2xl border border-white/10 bg-slate-900 p-5 transition hover:border-rose-400/40 hover:bg-slate-800">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-500/10 p-3 text-violet-300"><BookOpen className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate text-lg font-black text-white group-hover:text-rose-200">{liveClass.title}</h2><p className="mt-1 text-xs text-slate-400">Giáo viên: {liveClass.instructor_name || "Chưa phân công"}</p></div></div>
              {liveClass.description && <p className="mt-4 line-clamp-2 text-sm text-slate-400">{liveClass.description}</p>}
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm"><span className="text-slate-500">Lớp học đã được cấp</span><span className="inline-flex items-center gap-1.5 font-bold text-rose-300">Vào lớp <ArrowRight className="h-4 w-4" /></span></div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
