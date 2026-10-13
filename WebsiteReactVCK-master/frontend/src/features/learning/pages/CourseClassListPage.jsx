import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, Sparkles, Users } from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";

const CLASS_THEMES = [
  {
    topBar: "from-blue-500 via-indigo-500 to-violet-500",
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/30",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 ring-blue-200/60 dark:ring-blue-800/60",
    glow: "from-blue-500/15 to-indigo-500/5",
    borderHover: "hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-blue-500/10",
    buttonBg: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-600/25",
  },
  {
    topBar: "from-emerald-500 via-teal-500 to-cyan-500",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/30",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-emerald-200/60 dark:ring-emerald-800/60",
    glow: "from-emerald-500/15 to-teal-500/5",
    borderHover: "hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-emerald-500/10",
    buttonBg: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/25",
  },
  {
    topBar: "from-purple-500 via-fuchsia-500 to-pink-500",
    iconBg: "bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-purple-500/30",
    badge: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 ring-purple-200/60 dark:ring-purple-800/60",
    glow: "from-purple-500/15 to-fuchsia-500/5",
    borderHover: "hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-purple-500/10",
    buttonBg: "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white shadow-purple-600/25",
  },
  {
    topBar: "from-amber-400 via-orange-500 to-rose-500",
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/30",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ring-amber-200/60 dark:ring-amber-800/60",
    glow: "from-amber-500/15 to-orange-500/5",
    borderHover: "hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-amber-500/10",
    buttonBg: "bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white shadow-amber-600/25",
  },
];

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
        <header className="mt-3 rounded-2xl border border-blue-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/50 dark:from-slate-900 dark:via-slate-900/95 dark:to-blue-950/20 p-4 sm:p-5 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white shadow-xs">
              <Users className="h-3.5 w-3.5" /> Chọn lớp học
            </span>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
              {course.title}
            </h1>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
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
          <section className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-4.5">
            {classes.map((liveClass, index) => {
              const theme = CLASS_THEMES[index % CLASS_THEMES.length];
              const displayTitle = liveClass.title?.startsWith("Lớp") ? liveClass.title : `Lớp ${liveClass.title}`;
              return (
                <Link
                  key={liveClass.id}
                  to={`/lms/courses/${courseId}/classes/${liveClass.id}`}
                  className={`group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/95 p-4 sm:p-5 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${theme.borderHover}`}
                >
                  {/* Top Colorful Accent Strip */}
                  <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${theme.topBar}`} />

                  {/* Soft Background Glow */}
                  <div
                    className={`pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br ${theme.glow} blur-2xl transition-transform duration-500 group-hover:scale-150`}
                  />

                  <div className="relative">
                    {/* Header Row: Icon & Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-md ${theme.iconBg} transition-transform duration-300 group-hover:scale-110`}
                      >
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200/80 dark:ring-emerald-800/80 shadow-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Đã cấp quyền
                      </span>
                    </div>

                    {/* Class Title & Teacher */}
                    <div className="mt-3.5 space-y-1.5">
                      <h2 className="line-clamp-2 text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white transition-colors group-hover:text-blue-600 dark:group-hover:text-sky-400">
                        {displayTitle}
                      </h2>
                      <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <GraduationCap className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400 shrink-0" />
                        <span className="truncate max-w-[170px]">
                          GV: {liveClass.instructor_name || "Chưa phân công"}
                        </span>
                      </div>
                    </div>

                    {liveClass.description && (
                      <p className="mt-2 line-clamp-2 text-[11px] sm:text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {liveClass.description}
                      </p>
                    )}
                  </div>

                  {/* Footer Action */}
                  <div className="relative mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                      <Sparkles className="h-3 w-3 text-amber-500" /> Trực tuyến
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shadow-md transition-all duration-200 ${theme.buttonBg} group-hover:scale-105`}
                    >
                      Vào lớp <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
