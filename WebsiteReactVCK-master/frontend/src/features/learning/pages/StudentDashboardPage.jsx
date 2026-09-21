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
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { ErrorState } from "../../../components/common/StateView";
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
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
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
      <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-900">{value}%</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    mint: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(41,72,110,0.05)]">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
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

    const courseResponse = courseResult.status === "fulfilled" ? courseResult.value : null;
    const scheduleResponse = scheduleResult.status === "fulfilled" ? scheduleResult.value : null;

    if (courseResponse?.success) {
      setCourses(Array.isArray(courseResponse.data) ? courseResponse.data : []);
    } else {
      setCourses([]);
    }

    if (scheduleResponse?.success) {
      setSessions(Array.isArray(scheduleResponse.data) ? scheduleResponse.data : []);
    } else {
      setSessions([]);
    }

    if (courseResult.status === "rejected" && scheduleResult.status === "rejected") {
      setError("Không thể tải bảng điều khiển học tập. Vui lòng thử lại.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const inProgress = courses.filter((course) => {
      const progress = getProgress(course);
      return progress > 0 && progress < 100;
    });
    const completed = courses.filter((course) => getProgress(course) === 100);
    const average = courses.length
      ? Math.round(courses.reduce((sum, course) => sum + getProgress(course), 0) / courses.length)
      : 0;

    return { inProgress, completed, average };
  }, [courses]);

  const recentCourse = stats.inProgress[0] || courses[0] || null;
  const upcomingSessions = useMemo(
    () => [...sessions]
      .filter((session) => session.start_time && new Date(session.start_time) >= new Date())
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .slice(0, 3),
    [sessions],
  );

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center bg-[#f6f9fd]">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" /> Đang tải không gian học tập...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#f6f9fd] px-4 py-12 sm:px-8">
        <ErrorState title="Chưa thể tải dashboard" message={error} onRetry={loadDashboard} />
      </div>
    );
  }

  const displayName = authUser?.fullName || authUser?.username || "bạn";

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 pb-12 pt-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-gradient-to-br from-[#e8f2ff] via-white to-[#eef8ff] px-6 py-7 shadow-[0_14px_50px_rgba(40,102,180,0.08)] sm:px-9 sm:py-8">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-110px] left-1/3 h-64 w-64 rounded-full bg-emerald-100/70 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" /> Không gian học tập cá nhân
              </span>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Chào {displayName}, tiếp tục hành trình học tập nhé.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Theo dõi tiến độ, mở lớp đã được xếp và xử lý các nhiệm vụ học tập ngay tại một nơi.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={recentCourse ? coursePath(recentCourse) : "/lms/catalog"} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                  <PlayCircle className="h-4 w-4" /> {recentCourse ? "Tiếp tục học" : "Xem khóa học"}
                </Link>
                <Link to="/lms/live-schedule" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
                  <CalendarDays className="h-4 w-4" /> Xem lịch học
                </Link>
              </div>
            </div>

            {recentCourse ? (
              <div className="flex items-center gap-5 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur sm:min-w-[300px]">
                <ProgressRing value={getProgress(recentCourse)} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">Đang học gần đây</p>
                  <p className="mt-1 line-clamp-2 text-sm font-black text-slate-900">{recentCourse.title}</p>
                  <p className="mt-2 text-xs text-slate-500">{recentCourse.completed_lessons || 0}/{recentCourse.total_lessons || 0} bài học hoàn thành</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-sm sm:min-w-[300px]">
                <p className="text-xs font-bold text-blue-700">Chưa có khóa học được cấp</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Khóa học sẽ xuất hiện sau khi bộ phận quản lý xác nhận quyền học.</p>
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
          <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">Khóa học của tôi</h2>
                <p className="mt-1 text-xs text-slate-500">Các khóa học bạn được hệ thống quản lý cấp quyền.</p>
              </div>
              <Link to="/lms/catalog" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">Xem tất cả <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>

            {courses.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                <BookOpen className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-3 text-sm font-bold text-slate-700">Bạn chưa có khóa học nào</p>
                <p className="mt-1 text-xs text-slate-500">Liên hệ bộ phận quản lý để được cấp quyền học.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {courses.slice(0, 4).map((course) => {
                  const progress = getProgress(course);
                  return (
                    <Link key={course.course_id} to={coursePath(course)} className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><BookOpen className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-sm font-black text-slate-900 group-hover:text-blue-700">{course.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">{course.category || "Chương trình CSCA"}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs font-black text-slate-600">{progress}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(41,72,110,0.05)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Lịch học sắp tới</h2>
                <p className="mt-1 text-xs text-slate-500">Các buổi live đã được xếp cho bạn.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div className="mt-5 space-y-3">
              {upcomingSessions.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-7 text-center text-xs text-slate-500">Chưa có buổi học sắp tới.</div>
              ) : upcomingSessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{session.title || "Buổi học trực tuyến"}</p>
                      <p className="mt-1 text-xs text-slate-500">{session.class_title || session.course_title || "CSCA LMS"}</p>
                    </div>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  </div>
                  <p className="mt-3 text-xs font-bold text-blue-700">{formatSessionTime(session.start_time)}</p>
                </div>
              ))}
            </div>
            <Link to="/lms/live-schedule" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">Mở lịch đầy đủ <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Bài tập & thi", "Theo dõi bài cần làm và deadline", FileCheck2, "/lms/assignments", "text-amber-600 bg-amber-50"],
            ["Tài nguyên", "Mở tài liệu của các lớp đã cấp", FolderOpen, "/lms/files", "text-emerald-600 bg-emerald-50"],
            ["Phân tích điểm", "Xem tiến độ theo từng khóa học", BarChart3, "/lms/analytics", "text-violet-600 bg-violet-50"],
            ["Thông báo", "Cập nhật điểm, lịch và hệ thống", Bell, "/lms/notifications", "text-blue-600 bg-blue-50"],
          ].map(([label, description, Icon, to, tone]) => (
            <Link key={label} to={to} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(41,72,110,0.04)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
              <p className="mt-4 text-sm font-black text-slate-900 group-hover:text-blue-700">{label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
            </Link>
          ))}
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={loadDashboard} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-blue-700">
            <RefreshCw className="h-3.5 w-3.5" /> Cập nhật dữ liệu
          </button>
        </div>
      </div>
    </div>
  );
}
