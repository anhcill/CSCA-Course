import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, LoaderCircle } from "lucide-react";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";

export default function StudentCourseListPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchMyEnrolledCourses();
      setCourses(response?.success ? response.data || [] : []);
    } catch (requestError) {
      setCourses([]);
      setError(requestError.message || "Không thể tải các khóa học của bạn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-sm text-slate-300"><LoaderCircle className="h-5 w-5 animate-spin text-rose-400" /> Đang tải khóa học...</div></div>;
  }

  if (error) {
    return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể tải khóa học" message={error} onRetry={loadCourses} /></div>;
  }

  return (
    <main className="mx-auto max-w-6xl py-4 sm:py-8">
      <header className="mb-7 border-b border-white/10 pb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">LMS CSCA</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Khóa học của tôi</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Chọn khóa học đã được hệ thống quản lý cấp quyền. Sau đó chọn đúng lớp của bạn để bắt đầu học.</p>
      </header>

      {courses.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Bạn chưa có khóa học nào" description="Khi InternalManagement xác nhận thanh toán và xếp khóa học cho bạn, khóa học sẽ xuất hiện tại đây." />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <Link key={course.course_id} to={`/lms/courses/${course.course_id}/classes`} className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900 transition hover:border-rose-400/40 hover:bg-slate-800">
              <div className="flex gap-4 p-5">
                {course.thumbnail_url ? <img src={course.thumbnail_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300"><BookOpen className="h-7 w-7" /></div>}
                <div className="min-w-0 flex-1">
                  {course.category && <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">{course.category}</p>}
                  <h2 className="mt-1 truncate text-lg font-black text-white group-hover:text-rose-200">{course.title}</h2>
                  {course.level && <p className="mt-1 text-xs text-slate-400">Trình độ: {course.level}</p>}
                </div>
              </div>
              <div className="border-t border-white/10 bg-black/10 px-5 py-3">
                <div className="flex items-center justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2 text-slate-300"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Đã được cấp quyền</span><span className="inline-flex items-center gap-1.5 font-bold text-rose-300">Chọn lớp <ArrowRight className="h-4 w-4" /></span></div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
