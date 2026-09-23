/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderOpen,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { ErrorState, LoadingState } from "../../../components/common/StateView";
import { fetchMyEnrolledCourses, fetchMyLiveSchedule } from "../../api/lmsClient";

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

const formatSessionTime = (value) => {
  if (!value) return "Chưa có lịch";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const coursePath = (course) => `/lms/courses/${course.course_id}/classes`;

function ProgressRing({ value }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 88 88" aria-label={`Tiến độ ${value}%`}>
        <circle cx="44" cy="44" r={radius} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke="#1677ff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-900 dark:text-white">{value}%</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    blue: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400",
    mint: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400",
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

export default function StudentDashboardPage() {
  const { authUser } = useAuthContext();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    const [courseResult, scheduleResult] = await Promise.allSettled([
      fetchMyEnrolledCourses(),
      fetchMyLiveSchedule(),
    ]);

    let failed = false;

    if (courseResult.status === "fulfilled") {
      setCourses(Array.isArray(courseResult.value?.courses) ? courseResult.value.courses : []);
    } else {
      failed = true;
    }

    if (scheduleResult.status === "fulfilled") {
      setSessions(Array.isArray(scheduleResult.value?.sessions) ? scheduleResult.value.sessions : []);
    } else {
      failed = true;
    }

    if (failed && courseResult.status === "rejected" && scheduleResult.status === "rejected") {
      setError("Không thể tải toàn bộ dữ liệu tổng quan. Vui lòng thử lại sau.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const inProgress = courses.filter((item) => {
      const p = getProgress(item);
      return p > 0 && p < 100;
    });

    const completed = courses.filter((item) => getProgress(item) >= 100);

    const average = courses.length
      ? Math.round(courses.reduce((sum, item) => sum + getProgress(item), 0) / courses.length)
      : 0;

    return {
      inProgress,
      completed,
      average,
    };
  }, [courses]);

  const recentCourse = useMemo(() => {
    if (!courses.length) return null;
    return [...courses].sort((a, b) => {
      const timeA = new Date(a.last_accessed_at || 0).getTime();
      const timeB = new Date(b.last_accessed_at || 0).getTime();
      return timeB - timeA;
    })[0];
  }, [courses]);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((s) => new Date(s.end_time || s.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 4);
  }, [sessions]);

  if (loading) {
    return (
      <div className="p-6 sm:p-10 max-w-[1480px] mx-auto">
        <LoadingState type="cards" count={4} message="Đang nạp không gian học tập của bạn..." />
      </div>
    );
  }

  if (error && !courses.length) {
    return (
      <div className="p-6 sm:p-10 max-w-xl mx-auto">
        <ErrorState title="Lỗi Kết Nối" message={error} onRetry={loadDashboard} />
      </div>
    );
  }

  const displayName = authUser?.fullName || authUser?.username || "bạn";

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 pb-12 pt-6 sm:px-8 lg:px-10 transition-colors duration-200">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="relative overflow-hidden rounded-[26px] border border-blue-100 dark:border-slate-800 bg-gradient-to-br from-[#e8f2ff] via-white to-[#eef8ff] dark:from-slate-900 dark:via-slate-900/95 dark:to-blue-950/30 px-6 py-7 shadow-[0_14px_50px_rgba(40,102,180,0.08)] dark:shadow-none sm:px-9 sm:py-8">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-200/40 dark:bg-blue-600/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-110px] left-1/3 h-64 w-64 rounded-full bg-emerald-100/70 dark:bg-emerald-600/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-900/60 bg-white/80 dark:bg-blue-950/50 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-sky-300">
                <Sparkles className="h-3.5 w-3.5" /> Không gian học tập cá nhân
              </span>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Chào {displayName}, tiếp tục hành trình học tập nhé.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Theo dõi tiến độ, mở lớp đã được xếp và xử lý các nhiệm vụ học tập ngay tại một nơi.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={recentCourse ? coursePath(recentCourse) : "/lms/catalog"} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                  <PlayCircle className="h-4 w-4" /> {recentCourse ? "Tiếp tục học" : "Xem khóa học"}
                </Link>
                <Link to="/lms/live-schedule" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-800/80 px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 transition hover:border-blue-200 dark:hover:border-slate-600 hover:text-blue-700 dark:hover:text-white">
                  <CalendarDays className="h-4 w-4" /> Xem lịch học
                </Link>
              </div>
            </div>

            {recentCourse ? (
              <div className="flex items-center gap-5 rounded-2xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-850 dark:bg-slate-900/90 p-4 shadow-sm backdrop-blur sm:min-w-[300px]">
                <ProgressRing value={getProgress(recentCourse)} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Đang học gần đây</p>
                  <p className="mt-1 line-clamp-2 text-sm font-black text-slate-900 dark:text-white">{recentCourse.title}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{recentCourse.completed_lessons || 0}/{recentCourse.total_lessons || 0} bài học hoàn thành</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/90 p-5 shadow-sm sm:min-w-[300px]">
                <p className="text-xs font-bold text-blue-700 dark:text-sky-400">Chưa có khóa học được cấp</p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Khóa học sẽ xuất hiện sau khi bộ phận quản lý xác nhận quyền học.</p>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={BookOpen} label="Khóa học đã cấp" value={courses.length} tone="blue" />
          <StatCard icon={Clock3} label="Đang học" value={stats.inProgress.length} tone="amber" />
          <StatCard icon={CheckCircle2} label="Đã hoàn thành" value={stats.completed.length} tone="mint" />
          <StatCard icon={BarChart3} label="Tiến độ trung bình" value={`${stats.average}%`} tone="violet" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-[22px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Khóa học của tôi</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Các khóa học bạn được hệ thống quản lý cấp quyền.</p>
              </div>
              <Link to="/lms/catalog" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-sky-400 hover:text-blue-800 dark:hover:text-sky-300">Xem tất cả <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>

            {courses.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-5 py-8 text-center">
                <BookOpen className="mx-auto h-7 w-7 text-slate-400 dark:text-slate-500" />
                <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">Bạn chưa có khóa học nào</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Liên hệ bộ phận quản lý để được cấp quyền học.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {courses.slice(0, 4).map((course) => {
                  const progress = getProgress(course);
                  return (
                    <Link key={course.course_id} to={coursePath(course)} className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-sky-400"><BookOpen className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-sm font-black text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-sky-400">{course.title}</h3>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{course.category || "Chương trình CSCA"}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 transition group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-sky-400" />
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-400">{progress}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] dark:shadow-none sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Lịch học sắp tới</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Các buổi live đã được xếp cho bạn.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-blue-600 dark:text-sky-400" />
            </div>
            <div className="mt-5 space-y-3">
              {upcomingSessions.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 px-4 py-7 text-center text-xs text-slate-500 dark:text-slate-400">Chưa có buổi học sắp tới.</div>
              ) : upcomingSessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{session.title || "Buổi học trực tuyến"}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{session.class_title || session.course_title || "CSCA LMS"}</p>
                    </div>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  </div>
                  <p className="mt-3 text-xs font-bold text-blue-700 dark:text-sky-400">{formatSessionTime(session.start_time)}</p>
                </div>
              ))}
            </div>
            <Link to="/lms/live-schedule" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-sky-400 hover:text-blue-800 dark:hover:text-sky-300">Mở lịch đầy đủ <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Bài tập & thi", "Theo dõi bài cần làm và deadline", FileCheck2, "/lms/assignments", "text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-400"],
            ["Tài nguyên", "Mở tài liệu của các lớp đã cấp", FolderOpen, "/lms/files", "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400"],
            ["Phân tích điểm", "Xem tiến độ theo từng khóa học", BarChart3, "/lms/analytics", "text-violet-600 bg-violet-50 dark:bg-violet-950/60 dark:text-violet-400"],
            ["Thông báo", "Cập nhật điểm, lịch và hệ thống", Bell, "/lms/notifications", "text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-400"],
          ].map(([label, description, Icon, to, tone]) => (
            <Link key={label} to={to} className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_8px_30px_rgba(41,72,110,0.04)] dark:shadow-none transition hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-slate-700 hover:shadow-md">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
              <p className="mt-4 text-sm font-black text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-sky-400">{label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
            </Link>
          ))}
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={loadDashboard} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 transition hover:text-blue-700 dark:hover:text-sky-400">
            <RefreshCw className="h-3.5 w-3.5" /> Cập nhật dữ liệu
          </button>
        </div>
      </div>
    </div>
  );
}
