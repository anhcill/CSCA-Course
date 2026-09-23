import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { ErrorState } from "../../../components/common/StateView";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

const matchesSearch = (course, keyword) => {
  if (!keyword) return true;
  return [course.title, course.category, course.level, course.description]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(keyword);
};

export default function StudentCourseListPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchMyEnrolledCourses();
      if (!response?.success) throw new Error(response?.message || "Không thể tải khóa học của bạn.");
      setCourses(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setCourses([]);
      setError(requestError.message || "Không thể tải khóa học của bạn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const visibleCourses = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return courses.filter((course) => {
      const progress = getProgress(course);
      const matchesFilter = filter === "all" || (filter === "progress" && progress > 0 && progress < 100) || (filter === "completed" && progress === 100);
      return matchesFilter && matchesSearch(course, keyword);
    });
  }, [courses, filter, search]);

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center bg-[#f6f9fd] dark:bg-slate-950">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-blue-600 dark:text-sky-400" /> Đang tải khóa học...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#f6f9fd] dark:bg-slate-950 px-4 py-12 sm:px-8">
        <ErrorState title="Chưa thể tải khóa học" message={error} onRetry={loadCourses} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 pb-12 pt-6 sm:px-8 lg:px-10 transition-colors duration-200">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="relative overflow-hidden rounded-[24px] border border-blue-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-7 shadow-[0_12px_40px_rgba(41,72,110,0.06)] dark:shadow-none sm:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-100 dark:bg-blue-600/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-sky-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Quyền học tập của bạn
              </span>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Khóa học của tôi</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Chỉ những khóa học được hệ thống quản lý cấp quyền mới hiển thị ở đây. Chọn khóa học để vào đúng lớp của bạn.
              </p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Tìm khóa học"
                placeholder="Tìm tên khóa học..."
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 pl-11 pr-4 text-sm text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-300 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Danh sách khóa học</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{courses.length} khóa học trong tài khoản của bạn.</p>
          </div>
          <div className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
            {[
              ["all", "Tất cả"],
              ["progress", "Đang học"],
              ["completed", "Đã hoàn thành"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  filter === id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-14 text-center shadow-sm">
            <ShieldCheck className="mx-auto h-9 w-9 text-slate-400 dark:text-slate-500" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Bạn chưa có khóa học nào</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Khóa học sẽ tự xuất hiện sau khi bộ phận quản lý xác nhận quyền học và xếp lớp cho bạn.
            </p>
            <button
              type="button"
              onClick={loadCourses}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-200 transition hover:border-blue-200 dark:hover:border-slate-600 hover:text-blue-700 dark:hover:text-white"
            >
              Tải lại danh sách
            </button>
          </div>
        ) : visibleCourses.length === 0 ? (
          <div className="rounded-[22px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-14 text-center shadow-sm">
            <Search className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Không tìm thấy khóa học</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Thử đổi từ khóa hoặc bộ lọc.</p>
          </div>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleCourses.map((course) => {
              const progress = getProgress(course);
              const completed = progress === 100;
              return (
                <Link
                  key={course.course_id}
                  to={`/lms/courses/${course.course_id}/classes`}
                  className="group overflow-hidden rounded-[22px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none transition hover:-translate-y-1 hover:border-blue-200 dark:hover:border-slate-700 hover:shadow-lg"
                >
                  <div className="relative h-36 overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 p-5">
                    <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
                    <div className="relative flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-blue-700">
                        {course.category || "CSCA"}
                      </span>
                    </div>
                    <p className="relative mt-5 line-clamp-2 text-lg font-black text-white">{course.title}</p>
                  </div>
                  <div className="space-y-4 p-5">
                    <p className="line-clamp-2 min-h-10 text-sm leading-5 text-slate-500 dark:text-slate-400">
                      {course.description || "Chương trình học được quản lý và cấp quyền riêng cho bạn."}
                    </p>
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Tiến độ học tập</span>
                        <span className={`font-black ${completed ? "text-emerald-600 dark:text-emerald-400" : "text-blue-700 dark:text-sky-400"}`}>
                          {progress}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${completed ? "bg-emerald-500" : "bg-blue-600"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                          completed ? "text-emerald-600 dark:text-emerald-400" : "text-blue-700 dark:text-sky-400"
                        }`}
                      >
                        {completed ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                        {completed ? "Đã hoàn thành" : "Đã được cấp quyền"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-black text-slate-600 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-sky-400">
                        Chọn lớp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
