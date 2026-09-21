import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CheckCircle2, LoaderCircle, RefreshCw, TrendingUp } from "lucide-react";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";
import { ErrorState } from "../../../components/common/StateView";

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

export default function StudentAnalyticsPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchMyEnrolledCourses();
      if (!response?.success) throw new Error(response?.message || "Không thể tải tiến độ học tập.");
      setCourses(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setCourses([]);
      setError(requestError.message || "Không thể tải tiến độ học tập.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const average = useMemo(() => (
    courses.length ? Math.round(courses.reduce((sum, course) => sum + getProgress(course), 0) / courses.length) : 0
  ), [courses]);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center bg-[#f6f9fd]"><div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm"><LoaderCircle className="h-5 w-5 animate-spin text-blue-600" /> Đang tải phân tích...</div></div>;
  }

  if (error) {
    return <div className="bg-[#f6f9fd] px-4 py-12 sm:px-8"><ErrorState variant="light" title="Chưa thể tải phân tích" message={error} onRetry={loadAnalytics} /></div>;
  }

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 pb-12 pt-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700"><BarChart3 className="h-3.5 w-3.5" /> Phân tích học tập</span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Tiến độ của bạn</h1>
            <p className="mt-2 text-sm text-slate-500">Số liệu được tính từ các khóa học đã được cấp quyền trong LMS.</p>
          </div>
          <button type="button" onClick={loadAnalytics} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"><RefreshCw className="h-4 w-4" /> Cập nhật</button>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)]"><TrendingUp className="h-5 w-5 text-blue-600" /><p className="mt-5 text-3xl font-black text-slate-950">{average}%</p><p className="mt-1 text-xs font-semibold text-slate-500">Tiến độ trung bình</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)]"><BookOpen className="h-5 w-5 text-violet-600" /><p className="mt-5 text-3xl font-black text-slate-950">{courses.length}</p><p className="mt-1 text-xs font-semibold text-slate-500">Khóa học đã cấp quyền</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)]"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="mt-5 text-3xl font-black text-slate-950">{courses.filter((course) => getProgress(course) === 100).length}</p><p className="mt-1 text-xs font-semibold text-slate-500">Khóa học hoàn thành</p></div>
        </section>

        <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">Tiến độ theo khóa học</h2><p className="mt-1 text-xs text-slate-500">Theo dõi khóa nào đang cần bạn tiếp tục.</p></div><BarChart3 className="h-5 w-5 text-violet-600" /></div>
          {courses.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">Chưa có dữ liệu khóa học để phân tích.</div> : <div className="mt-6 space-y-5">{courses.map((course) => { const progress = getProgress(course); return <div key={course.course_id}><div className="flex items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><BookOpen className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{course.title}</p><p className="mt-0.5 text-xs text-slate-500">{course.category || "Chương trình CSCA"}</p></div></div><span className="shrink-0 text-sm font-black text-slate-700">{progress}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${progress === 100 ? "bg-emerald-500" : "bg-blue-600"}`} style={{ width: `${progress}%` }} /></div></div>; })}</div>}
        </section>
      </div>
    </div>
  );
}
