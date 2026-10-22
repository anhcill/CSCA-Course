import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, Sparkles, Users } from "lucide-react";
import { fetchCourseWorkspace } from "../../api/lmsClient";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";
import { getClassTheme } from "../../../utils/classThemes";

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
    return <Loading loading={true} text="Đang tải danh sách lớp học..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  if (!data) {
    return (
      <div className="min-h-full px-4 py-12">
        <div className="mx-auto max-w-xl">
          <ErrorState title="Chưa thể mở khóa học" message={error} onRetry={loadClasses} />
        </div>
      </div>
    );
  }

  const { course = {}, classes = [] } = data;

  return (
    <main className="min-h-full px-3 pb-12 pt-3 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <div className="px-1">
          <Link
            to="/lms/my-learning"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#17365f] transition hover:text-sky-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Khóa học của tôi
          </Link>
        </div>

        {/* Calligraphy Header Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/80 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-sky-200/30 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200 shadow-2xs">
              <Users className="h-3.5 w-3.5" /> Chọn lớp học
            </span>
            <h1 className="mt-2.5 font-['Dancing_Script',cursive] text-3xl sm:text-4xl lg:text-[42px] font-bold text-[#102f63] leading-tight">
              {course.title || "Danh sách lớp học"}
            </h1>
            <p className="mt-2 text-xs sm:text-sm font-semibold italic text-[#244866]">
              “Vạn dặm đường dài, bắt đầu từ một bước chân.” ·{" "}
              <span className="font-['Ma_Shan_Zheng',cursive] text-base text-[#17365f]">千里之行 · 始于足下</span>
            </p>
          </div>
        </section>

        {classes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white bg-white/80 p-8 text-center shadow-sm backdrop-blur-md">
            <EmptyState
              icon={Users}
              title="Bạn chưa được xếp lớp"
              description="Bạn đã có quyền với khóa học này nhưng chưa có lớp hoạt động. Vui lòng liên hệ bộ phận quản lý để được xếp lớp."
            />
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-4.5">
            {classes.map((liveClass, index) => {
              const theme = getClassTheme(liveClass, index);
              const displayTitle = liveClass.title?.startsWith("Lớp") ? liveClass.title : `Lớp ${liveClass.title}`;
              return (
                <Link
                  key={liveClass.id}
                  to={`/lms/courses/${courseId}/classes/${liveClass.id}`}
                  className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-4 shadow-[0_10px_30px_rgba(45,87,122,0.08)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-sky-300 sm:p-5"
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
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/80 shadow-2xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Đã cấp quyền
                      </span>
                    </div>

                    {/* Class Title & Teacher */}
                    <div className="mt-3.5 space-y-1.5">
                      <h2 className="line-clamp-2 text-base sm:text-lg font-black tracking-tight text-[#102f63] transition-colors group-hover:text-sky-700">
                        {displayTitle}
                      </h2>
                      <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1 text-xs font-semibold text-[#17365f]">
                        <GraduationCap className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                        <span className="truncate max-w-[170px]">
                          GV: {liveClass.instructor_name || "Chưa phân công"}
                        </span>
                      </div>
                    </div>

                    {liveClass.description && (
                      <p className="mt-2 line-clamp-2 text-[11px] sm:text-xs leading-relaxed text-[#487291]">
                        {liveClass.description}
                      </p>
                    )}
                  </div>

                  {/* Footer Action */}
                  <div className="relative mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#487291]">
                      <Sparkles className="h-3 w-3 text-amber-500" /> Trực tuyến
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all duration-200 ${theme.buttonBg} group-hover:scale-105`}
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
