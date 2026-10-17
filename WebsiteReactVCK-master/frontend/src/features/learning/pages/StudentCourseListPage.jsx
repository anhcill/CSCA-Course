import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Compass, GraduationCap, RefreshCw, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";

const COURSE_THEMES = [
  {
    // Blue / Indigo / Sky
    headerBg: "bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500",
    patternGlow: "bg-sky-400/20",
    tagBg: "bg-white/20 text-white backdrop-blur-md border border-white/25",
    barColor: "bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400",
    btnBg: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20",
    badgeActive: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300 ring-1 ring-blue-200/50 dark:ring-blue-800/50",
    borderHover: "hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-blue-500/10",
  },
  {
    // Purple / Fuchsia / Pink
    headerBg: "bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500",
    patternGlow: "bg-pink-400/20",
    tagBg: "bg-white/20 text-white backdrop-blur-md border border-white/25",
    barColor: "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-400",
    btnBg: "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white shadow-purple-500/20",
    badgeActive: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 ring-1 ring-purple-200/50 dark:ring-purple-800/50",
    borderHover: "hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-purple-500/10",
  },
  {
    // Emerald / Teal / Cyan
    headerBg: "bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-500",
    patternGlow: "bg-emerald-400/20",
    tagBg: "bg-white/20 text-white backdrop-blur-md border border-white/25",
    barColor: "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-400",
    btnBg: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/20",
    badgeActive: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-1 ring-emerald-200/50 dark:ring-emerald-800/50",
    borderHover: "hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-emerald-500/10",
  },
  {
    // Amber / Orange / Rose
    headerBg: "bg-gradient-to-br from-amber-500 via-orange-600 to-rose-500",
    patternGlow: "bg-amber-400/20",
    tagBg: "bg-white/20 text-white backdrop-blur-md border border-white/25",
    barColor: "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-400",
    btnBg: "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-orange-500/20",
    badgeActive: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-200/50 dark:ring-amber-800/50",
    borderHover: "hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-amber-500/10",
  },
  {
    // Rose / Pink / Purple
    headerBg: "bg-gradient-to-br from-rose-600 via-pink-600 to-purple-600",
    patternGlow: "bg-rose-400/20",
    tagBg: "bg-white/20 text-white backdrop-blur-md border border-white/25",
    barColor: "bg-gradient-to-r from-rose-500 via-pink-500 to-purple-400",
    btnBg: "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-rose-500/20",
    badgeActive: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 ring-1 ring-rose-200/50 dark:ring-rose-800/50",
    borderHover: "hover:border-rose-400 dark:hover:border-rose-500 hover:shadow-rose-500/10",
  },
];

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

const matchesSearch = (course, keyword) => {
  if (!keyword) return true;
  const classText = (Array.isArray(course.classes) ? course.classes : [])
    .flatMap((liveClass) => [liveClass.title, liveClass.instructor_name]);
  return [course.title, course.category, course.level, course.description, ...classText]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(keyword);
};

export default function StudentCourseListPage() {
  const location = useLocation();
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

  useEffect(() => {
    const requestedSearch = new URLSearchParams(location.search).get("search") || "";
    setSearch(requestedSearch);
  }, [location.search]);

  const visibleCourses = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return courses.filter((course) => {
      const progress = getProgress(course);
      const matchesFilter = filter === "all" || (filter === "progress" && progress > 0 && progress < 100) || (filter === "completed" && progress === 100);
      return matchesFilter && matchesSearch(course, keyword);
    });
  }, [courses, filter, search]);

  if (loading) {
    return <Loading loading={true} text="Đang tải khóa học..." fullScreen={false} className="min-h-[65vh] py-16" />;
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
      <div className="mx-auto max-w-[1480px] space-y-4">
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm dark:shadow-none sm:px-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              Khóa học của tôi
            </h1>
            <div className="relative w-full max-w-xs sm:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Tìm khóa học"
                placeholder="Tìm tên khóa học..."
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 pl-10 pr-4 text-xs sm:text-sm text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-400 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/10"
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
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Bạn chưa có khóa học nào</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
              Khóa học sẽ tự xuất hiện sau khi bộ phận quản lý xác nhận quyền học và xếp lớp cho bạn.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/courses"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Compass className="h-4 w-4" /> Khám phá khóa học
              </Link>
              <button
                type="button"
                onClick={loadCourses}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-200 transition hover:border-blue-200 dark:hover:border-slate-600 hover:text-blue-700 dark:hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Tải lại danh sách
              </button>
            </div>
          </div>
        ) : visibleCourses.length === 0 ? (
          <div className="rounded-[22px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-14 text-center shadow-sm">
            <Search className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Không tìm thấy khóa học</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Thử đổi từ khóa hoặc bộ lọc.</p>
          </div>
        ) : (
          <section className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleCourses.map((course, index) => {
              const theme = COURSE_THEMES[index % COURSE_THEMES.length];
              const progress = getProgress(course);
              const completed = progress === 100;
              const hasStarted = progress > 0;
              const progressTotal = Number(course.progress_total || 0);
              const progressCompleted = Number(course.progress_completed || 0);
              const progressUnit = course.progress_source === "sessions" ? "buổi học" : "bài học";
              const classes = Array.isArray(course.classes) ? course.classes : [];

              return (
                <div
                  key={course.course_id}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${theme.borderHover}`}
                >
                  <div>
                    {/* Top Vibrant Header Banner */}
                    <div className={`relative min-h-[120px] overflow-hidden ${theme.headerBg} p-4 sm:p-5 flex flex-col justify-between`}>
                      <div className="absolute -right-6 -top-8 h-36 w-36 rounded-full bg-white/15 blur-2xl transition-transform duration-500 group-hover:scale-125" />
                      <div className={`absolute -left-10 -bottom-10 h-32 w-32 rounded-full ${theme.patternGlow} blur-2xl`} />

                      <div className="relative flex items-center justify-between gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
                          <BookOpen className="h-4.5 w-4.5" />
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ${theme.tagBg} shadow-xs`}>
                          {course.category || "CSCA"}
                        </span>
                      </div>
                      <h3 className="relative mt-3 line-clamp-2 text-base sm:text-lg font-black leading-snug text-white drop-shadow-xs">
                        {course.title}
                      </h3>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-3 p-4 sm:p-5">
                      {course.description && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
                          {course.description}
                        </p>
                      )}

                      <div className="pt-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-500 dark:text-slate-400">
                            {progressTotal > 0 ? `${progressCompleted}/${progressTotal} ${progressUnit}` : "Tiến độ học tập"}
                          </span>
                          <span className={`font-black ${completed ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-sky-400"}`}>
                            {progress}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/5">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${completed ? "bg-gradient-to-r from-emerald-500 to-teal-400" : theme.barColor}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
                            completed
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60"
                              : hasStarted
                              ? theme.badgeActive
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                          }`}
                        >
                          {completed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : hasStarted ? (
                            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                          ) : (
                            <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          {completed ? "Đã hoàn thành" : hasStarted ? "Đang học" : "Chưa bắt đầu"}
                        </span>
                      </div>

                      <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-100">
                            <Users className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
                            Lớp của bạn
                          </span>
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                            {classes.length} lớp
                          </span>
                        </div>

                        {classes.length === 0 ? (
                          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                            Bạn đã có khóa học nhưng chưa được xếp lớp.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {classes.map((liveClass) => {
                              const displayTitle = liveClass.title?.startsWith("Lớp")
                                ? liveClass.title
                                : `Lớp ${liveClass.title}`;
                              return (
                                <Link
                                  key={liveClass.id}
                                  to={`/lms/courses/${course.course_id}/classes/${liveClass.id}`}
                                  className="group/class flex items-center gap-3 py-2.5 first:pt-1 last:pb-0"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover/class:bg-blue-600 group-hover/class:text-white dark:bg-blue-950/60 dark:text-sky-400">
                                    <GraduationCap className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-black text-slate-900 transition group-hover/class:text-blue-600 dark:text-white dark:group-hover/class:text-sky-400">
                                      {displayTitle}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                      GV: {liveClass.instructor_name || "Chưa phân công"}
                                    </span>
                                  </span>
                                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${theme.btnBg}`}>
                                    Vào lớp <ArrowRight className="h-3 w-3 transition group-hover/class:translate-x-0.5" />
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/40 sm:px-5">
                    <Link
                      to="/lms/live-schedule"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400 transition"
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> Xem lịch
                    </Link>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
