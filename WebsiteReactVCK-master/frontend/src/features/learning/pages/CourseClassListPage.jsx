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
    <main className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/lms/catalog"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 transition hover:text-blue-700 dark:hover:text-sky-400"
        >
          <ArrowLeft className="h-4 w-4" /> Khóa học của tôi
        </Link>
        <header className="mt-5 rounded-3xl border border-blue-100 dark:border-slate-800 bg-gradient-to-r from-[#eaf4ff] via-white to-[#f3f8ff] dark:from-slate-900 dark:via-slate-900/95 dark:to-blue-950/30 p-6 shadow-sm dark:shadow-none sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-sky-300 shadow-sm ring-1 ring-blue-100 dark:ring-slate-700">
            <Users className="h-3.5 w-3.5" /> Chọn lớp học
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {course.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Chỉ các lớp mà hệ thống quản lý đã xếp cho bạn được hiển thị. Chọn một lớp để mở nội dung và hoạt động học tập.
          </p>
        </header>

        {classes.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={Users}
              title="Bạn chưa được xếp lớp"
              description="Bạn đã có quyền với khóa học này nhưng chưa có lớp hoạt động. Vui lòng liên hệ bộ phận quản lý để được xếp lớp."
            />
          </div>
        ) : (
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {classes.map((liveClass) => (
              <Link
                key={liveClass.id}
                to={`/lms/courses/${courseId}/classes/${liveClass.id}`}
                className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none transition hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-slate-700 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-950/60 p-3 text-blue-600 dark:text-sky-400">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-sky-400">
                      {liveClass.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Giáo viên: {liveClass.instructor_name || "Chưa phân công"}
                    </p>
                  </div>
                </div>
                {liveClass.description && (
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {liveClass.description}
                  </p>
                )}
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Lớp đã được cấp quyền</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-blue-600 dark:text-sky-400">
                    Vào lớp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
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
