import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Users } from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";

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

  if (loading) {
    return <Loading loading={true} text="Đang tải lớp học..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  if (!data) {
    return (
      <div className="bg-[#f6f9fd] dark:bg-slate-950 px-4 py-12">
        <div className="mx-auto max-w-xl">
          <ErrorState title="Chưa thể mở khóa học" message={error} onRetry={loadClasses} />
        </div>
      </div>
    );
  }

  const { course = {}, classes = [] } = data;

  return (
    <main className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 py-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/lms/my-learning"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 transition hover:text-blue-700 dark:hover:text-sky-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Khóa học của tôi
        </Link>
        <header className="mt-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-sky-300 ring-1 ring-blue-100 dark:ring-slate-700">
              <Users className="h-3.5 w-3.5" /> Chọn lớp học
            </span>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {course.title}
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Chỉ các lớp mà hệ thống quản lý đã xếp cho bạn được hiển thị. Chọn một lớp để mở nội dung và hoạt động học tập.
          </p>
        </header>

        {classes.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Users}
              title="Bạn chưa được xếp lớp"
              description="Bạn đã có quyền với khóa học này nhưng chưa có lớp hoạt động. Vui lòng liên hệ bộ phận quản lý để được xếp lớp."
            />
          </div>
        ) : (
          <section className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 sm:gap-4">
            {classes.map((liveClass) => (
              <Link
                key={liveClass.id}
                to={`/lms/courses/${courseId}/classes/${liveClass.id}`}
                className="group relative flex aspect-square flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4.5 shadow-sm dark:shadow-none transition hover:-translate-y-1 hover:border-blue-300 dark:hover:border-slate-700 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 transition group-hover:bg-blue-600 group-hover:text-white">
                      <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60">
                      Đã cấp quyền
                    </span>
                  </div>

                  <div className="mt-2.5 sm:mt-3">
                    <h2 className="line-clamp-2 text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400">
                      {liveClass.title}
                    </h2>
                    <p className="mt-0.5 sm:mt-1 truncate text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                      Giáo viên: {liveClass.instructor_name || "Chưa phân công"}
                    </p>
                  </div>

                  {liveClass.description && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] sm:text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {liveClass.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5 sm:pt-3 text-xs">
                  <span className="hidden sm:inline text-[11px] text-slate-400 dark:text-slate-500">Lớp học</span>
                  <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-sky-400 text-xs ml-auto sm:ml-0">
                    Vào lớp <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 transition group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
