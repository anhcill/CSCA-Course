import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CheckCircle2, RefreshCw, TrendingUp } from "lucide-react";
import { fetchAssignments, fetchMyEnrolledCourses } from "../../api/lmsClient";
import { ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

export default function StudentAnalyticsPage() {
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, assignmentsResponse] = await Promise.all([
        fetchMyEnrolledCourses(),
        fetchAssignments(),
      ]);
      if (!response?.success) throw new Error(response?.message || "Không thể tải tiến độ học tập.");
      setCourses(Array.isArray(response.data) ? response.data : []);
      setAssignments(assignmentsResponse?.success && Array.isArray(assignmentsResponse.data) ? assignmentsResponse.data : []);
    } catch (requestError) {
      setCourses([]);
      setAssignments([]);
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

  const gradeSummary = useMemo(() => {
    const graded = assignments.filter((item) => item.score !== null && item.score !== undefined && Number.isFinite(Number(item.score)));
    const possible = graded.reduce((sum, item) => sum + Math.max(0, Number(item.max_score || item.maxScore || 0)), 0);
    const earned = graded.reduce((sum, item) => sum + Math.max(0, Number(item.score)), 0);
    return {
      gradedCount: graded.length,
      percentage: possible > 0 ? Math.round((earned / possible) * 100) : 0,
      earned,
      possible,
    };
  }, [assignments]);

  if (loading) {
    return <Loading loading={true} text="Đang tải phân tích..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  if (error) {
    return (
      <div className="bg-[#f6f9fd] dark:bg-slate-950 px-4 py-12 sm:px-8">
        <ErrorState title="Chưa thể tải phân tích" message={error} onRetry={loadAnalytics} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 pb-12 pt-6 sm:px-8 lg:px-10 transition-colors duration-200">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 dark:border-violet-900/60 bg-violet-50 dark:bg-violet-950/60 px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300">
              <BarChart3 className="h-3.5 w-3.5" /> Phân tích học tập
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Kết quả tổng quan</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Tổng hợp tiến độ và điểm các bài đã được chấm ở mọi khóa học/lớp của bạn.</p>
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-200 transition hover:border-blue-200 dark:hover:border-slate-600 hover:text-blue-700 dark:hover:text-white"
          >
            <RefreshCw className="h-4 w-4" /> Cập nhật
          </button>
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-5 text-3xl font-black text-slate-950 dark:text-white">{gradeSummary.percentage}%</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Điểm tổng ({gradeSummary.gradedCount} bài đã chấm)</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none">
            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-sky-400" />
            <p className="mt-5 text-3xl font-black text-slate-950 dark:text-white">{average}%</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Tiến độ trung bình</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none">
            <BookOpen className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <p className="mt-5 text-3xl font-black text-slate-950 dark:text-white">{courses.length}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Khóa học đã cấp quyền</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-5 text-3xl font-black text-slate-950 dark:text-white">{courses.filter((course) => getProgress(course) === 100).length}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Khóa học hoàn thành</p>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-5 py-4 text-sm text-emerald-900 dark:text-emerald-100">
          <span className="font-black">Tổng điểm đã chấm: </span>
          {gradeSummary.gradedCount ? `${gradeSummary.earned}/${gradeSummary.possible} điểm` : "Chưa có bài nào được chấm điểm."}
        </section>

        <section className="rounded-[22px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Tiến độ theo khóa học</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Theo dõi khóa nào đang cần bạn tiếp tục.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          {courses.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Chưa có dữ liệu khóa học để phân tích.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {courses.map((course) => {
                const progress = getProgress(course);
                return (
                  <div key={course.course_id}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
                          <BookOpen className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{course.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{course.category || "Chương trình CSCA"}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-black text-slate-700 dark:text-slate-300">{progress}%</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${progress === 100 ? "bg-emerald-500" : "bg-blue-600"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
