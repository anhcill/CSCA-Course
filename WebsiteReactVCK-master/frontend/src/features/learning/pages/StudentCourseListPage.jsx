import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { ErrorState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";
import { getClassCoverImage } from "../../../utils/classWallpapers";

const TONES = [
  { bar: "bg-sky-500", badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/60", button: "bg-sky-600 hover:bg-sky-700" },
  { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/60", button: "bg-emerald-600 hover:bg-emerald-700" },
  { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/60", button: "bg-amber-500 hover:bg-amber-600" },
  { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/60", button: "bg-rose-500 hover:bg-rose-600" },
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
      if (!response?.success) throw new Error(response?.message || "Không thể tải lớp học của bạn.");
      setCourses(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setCourses([]);
      setError(requestError.message || "Không thể tải lớp học của bạn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get("search") || "");
  }, [location.search]);

  const visibleCourses = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return courses.filter((course) => matchesSearch(course, keyword));
  }, [courses, search]);

  const classCards = useMemo(() => visibleCourses.flatMap((course) => {
    const classes = Array.isArray(course.classes) ? course.classes : [];
    return classes
      .map((liveClass) => ({ course, liveClass }))
      .filter(({ liveClass }) => {
        const progress = getProgress(liveClass);
        return filter === "all"
          || (filter === "progress" && progress > 0 && progress < 100)
          || (filter === "completed" && progress === 100);
      });
  }), [filter, visibleCourses]);

  const totalClasses = useMemo(() => courses.reduce(
    (total, course) => total + (Array.isArray(course.classes) ? course.classes.length : 0),
    0,
  ), [courses]);

  if (loading) return <Loading loading={true} text="Đang tải lớp học..." fullScreen={false} className="min-h-[65vh] py-16" />;
  if (error) {
    return <div className="px-4 py-12 sm:px-8"><ErrorState title="Chưa thể tải lớp học" message={error} onRetry={loadCourses} /></div>;
  }

  return (
    <div className="min-h-full px-3 pb-12 pt-3 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1480px]">
        <section className="relative min-h-[178px] overflow-hidden px-3 py-5 sm:px-5">
          <div className="relative z-10 max-w-xl">
            <p className="font-['Dancing_Script',cursive] text-[44px] font-bold leading-none text-[#102f63] sm:text-[52px] dark:text-sky-200">Khóa học</p>
            <p className="mt-3 text-sm font-semibold italic text-[#244866] dark:text-slate-300">“Học không chỉ để biết, mà để trưởng thành.”</p>
            <p className="mt-2 font-['Ma_Shan_Zheng',cursive] text-xl text-[#17365f] dark:text-sky-400">学而不止 · 行而致远</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/80 bg-white/80 p-3 shadow-[0_12px_35px_rgba(49,91,125,0.1)] backdrop-blur-md sm:p-4 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                ["all", `Tất cả (${totalClasses})`],
                ["progress", "Đang học"],
                ["completed", "Đã hoàn thành"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition ${filter === id ? "bg-sky-600 text-white shadow-md shadow-sky-600/20" : "bg-white/80 text-slate-600 hover:bg-sky-50 hover:text-sky-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Tìm lớp học"
                placeholder="Tìm lớp, khóa học, giáo viên..."
                className="h-10 w-full rounded-xl border border-white bg-white/90 pl-10 pr-4 text-xs text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500 dark:focus:border-sky-500"
              />
            </div>
          </div>
        </section>

        <div className="mb-4 mt-5 flex items-end justify-between gap-4 px-1">
          <div>
            <h1 className="text-lg font-black text-[#102f63] dark:text-white">Các lớp của tôi</h1>
            <p className="mt-1 text-xs text-[#487291] dark:text-slate-400">Mỗi thẻ là một lớp học bạn đang được xếp.</p>
          </div>
          <button type="button" onClick={loadCourses} className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300">
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </button>
        </div>

        {courses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white bg-white/80 px-6 py-14 text-center shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <ShieldCheck className="mx-auto h-10 w-10 text-sky-400" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Bạn chưa có khóa học nào</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Khóa học sẽ xuất hiện sau khi bộ phận quản lý cấp quyền và xếp lớp cho bạn.</p>
            <Link to="/courses" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-700">
              <Compass className="h-4 w-4" /> Khám phá khóa học
            </Link>
          </div>
        ) : classCards.length === 0 ? (
          <div className="rounded-3xl border border-white/80 bg-white/80 px-6 py-14 text-center shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
            <GraduationCap className="mx-auto h-10 w-10 text-sky-400" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Chưa có lớp phù hợp</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Bạn có khóa học nhưng chưa được xếp lớp, hoặc không có lớp khớp bộ lọc hiện tại.</p>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {classCards.map(({ course, liveClass }, index) => {
              const progress = getProgress(liveClass);
              const completed = progress === 100;
              const started = progress > 0;
              const tone = TONES[index % TONES.length];
              const cover = getClassCoverImage(liveClass || course, course.course_id || course.id);
              const progressTotal = Number(liveClass.progress_total || 0);
              const progressCompleted = Number(liveClass.progress_completed || 0);
              const progressUnit = liveClass.progress_source === "sessions" ? "buổi" : "bài";

              return (
                <Link
                  key={`${course.course_id}-${liveClass.id}`}
                  to={`/lms/courses/${course.course_id}/classes/${liveClass.id}`}
                  className="group overflow-hidden rounded-3xl border border-white/85 bg-white shadow-[0_12px_32px_rgba(45,87,122,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(45,87,122,0.2)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-sky-500/50"
                >
                  <div className="relative h-40 overflow-hidden bg-sky-100 dark:bg-slate-800">
                    <img src={cover} alt={liveClass.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#102f63]/75 via-transparent to-white/5 dark:from-slate-950/90 dark:to-transparent" />
                    <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black shadow-sm ${completed ? "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300" : started ? tone.badge : "bg-white/90 text-slate-600 dark:bg-slate-800/90 dark:text-slate-300"}`}>
                      {completed ? <CheckCircle2 className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                      {completed ? "Đã hoàn thành" : started ? "Đang học" : "Sắp bắt đầu"}
                    </span>
                    <div className="absolute inset-x-3 bottom-3">
                      <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/80 dark:text-slate-300">{course.title}</p>
                      <h2 className="mt-1 line-clamp-1 text-lg font-black text-white drop-shadow">{liveClass.title}</h2>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400"><UserRound className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500">Giáo viên</span>
                        <span className="block truncate font-bold text-slate-700 dark:text-slate-200">{liveClass.instructor_name || "Chưa phân công"}</span>
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-slate-500 dark:text-slate-400">{progressTotal > 0 ? `${progressCompleted}/${progressTotal} ${progressUnit} học` : "Tiến độ học tập"}</span>
                        <span className="font-black text-[#17365f] dark:text-sky-400">{progress}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full ${completed ? "bg-emerald-500" : tone.bar}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <span className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition ${tone.button}`}>
                      <BookOpen className="h-4 w-4" /> {completed ? "Xem lại lớp học" : "Vào lớp học"} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
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
