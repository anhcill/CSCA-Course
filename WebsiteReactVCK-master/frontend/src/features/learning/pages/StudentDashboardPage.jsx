import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FolderOpen,
  MessageCircle,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { ErrorState, LoadingState } from "../../../components/common/StateView";
import { fetchMyEnrolledCourses, fetchMyLiveSchedule, fetchNotifications, markNotificationAsRead } from "../../api/lmsClient";
import { getClassCoverImage } from "../../../utils/classWallpapers";

const QUICK_LINKS = [
  { label: "Khóa học", description: "Tiếp tục học tập", icon: BookOpen, to: "/lms/my-learning", tone: "blue" },
  { label: "Lịch học", description: "Xem thời khóa biểu", icon: CalendarDays, to: "/lms/calendar", tone: "rose" },
  { label: "Bài tập", description: "Xem và nộp bài", icon: FileCheck2, to: "/lms/assignments", tone: "emerald" },
  { label: "Kết quả", description: "Theo dõi tiến độ", icon: BarChart3, to: "/lms/analytics", tone: "amber" },
];

const TONES = {
  blue: { icon: "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400", bar: "bg-blue-500" },
  rose: { icon: "bg-rose-100 text-rose-500 dark:bg-rose-950/60 dark:text-rose-400", bar: "bg-rose-400" },
  emerald: { icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400", bar: "bg-emerald-500" },
  amber: { icon: "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400", bar: "bg-amber-400" },
};

const getProgress = (course) => {
  const value = Number(course?.progress_percent ?? course?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

const isToday = (dateValue) => {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const isTomorrow = (dateValue) => {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  );
};

const formatSessionTime = (startTime) => {
  if (!startTime) return { time: "--:--", dateBadge: "", isToday: false, isTomorrow: false };
  const d = new Date(startTime);
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  if (isToday(startTime)) {
    return { time, dateBadge: "Hôm nay", isToday: true, isTomorrow: false };
  }
  if (isTomorrow(startTime)) {
    return { time, dateBadge: "Ngày mai", isToday: false, isTomorrow: true };
  }

  const currentYear = new Date().getFullYear();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const dateBadge = year === currentYear ? `${day}/${month}` : `${day}/${month}/${String(year).slice(-2)}`;
  return { time, dateBadge, isToday: false, isTomorrow: false };
};

const cleanSessionTitle = (session) => {
  const raw = (session?.title || "").trim();
  if (raw && /[\p{L}\p{N}]/u.test(raw)) {
    return raw;
  }
  return session?.course_title || session?.class_title || "Buổi học trực tuyến";
};

const getSessionPath = (session) => {
  if (session?.status === "live") {
    return `/lms/live-room/${session.id}`;
  }
  if (session?.course_id && session?.live_class_id) {
    return `/lms/courses/${session.course_id}/classes/${session.live_class_id}/sessions/${session.id}`;
  }
  return "/lms/calendar";
};

const getNotificationTitle = (item) => {
  return item?.title || item?.message || "Thông báo học tập mới";
};

const getNotificationBody = (item) => {
  if (item?.title && item?.message && item.title.trim() !== item.message.trim()) {
    return item.message;
  }
  return item?.body || item?.description || "Nhấn để xem chi tiết";
};

const getNotificationUrl = (item) => {
  if (item?.link_url && typeof item.link_url === "string" && item.link_url.startsWith("/")) {
    return item.link_url;
  }
  return "/lms/notifications";
};

function QuickLink({ item }) {
  const Icon = item.icon;
  const tone = TONES[item.tone];
  return (
    <Link to={item.to} className="group flex min-w-0 items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-3 py-2 shadow-[0_8px_25px_rgba(50,100,150,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none dark:hover:bg-slate-800/90">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}><Icon className="h-3.5 w-3.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-black text-slate-900 dark:text-white">{item.label}</span>
        <span className="mt-0.5 block truncate text-[9px] text-slate-500 dark:text-slate-400">{item.description}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400" />
    </Link>
  );
}

const TONES_ARRAY = [
  { bar: "bg-sky-500", badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/60", button: "bg-sky-600 hover:bg-sky-700" },
  { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/60", button: "bg-emerald-600 hover:bg-emerald-700" },
  { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/60", button: "bg-amber-500 hover:bg-amber-600" },
  { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/60", button: "bg-rose-500 hover:bg-rose-600" },
];

const formatClassTitle = (title) => {
  if (!title) return "Lớp học";
  const str = String(title).trim();
  if (/^\d+$/.test(str)) return `Lớp ${str}`;
  return str;
};

function DashboardClassCard({ course, liveClass, index }) {
  const progress = getProgress(course);
  const completed = progress === 100;
  const started = progress > 0;
  const tone = TONES_ARRAY[index % TONES_ARRAY.length];
  const cover = getClassCoverImage(liveClass || course, course.course_id || course.id);
  const progressTotal = Number(course.progress_total || 0);
  const progressCompleted = Number(course.progress_completed || 0);
  const progressUnit = course.progress_source === "sessions" ? "buổi" : "bài";
  const targetPath = liveClass
    ? `/lms/courses/${course.course_id}/classes/${liveClass.id}`
    : `/lms/courses/${course.course_id}/classes`;
  const displayClassTitle = liveClass ? formatClassTitle(liveClass.title) : course.title;

  return (
    <Link
      to={targetPath}
      className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/85 bg-white shadow-[0_8px_24px_rgba(45,87,122,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(45,87,122,0.18)] hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-sky-500/50"
    >
      {/* Scenic Oriental Landscape Banner Header - Compact size */}
      <div className="relative h-28 sm:h-32 w-full overflow-hidden bg-sky-100 dark:bg-slate-800">
        <img
          src={cover}
          alt={displayClassTitle}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#102f63]/85 via-transparent to-white/10 dark:from-slate-950/90 dark:to-transparent" />

        {/* Status Badge */}
        <span
          className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black shadow-xs ${
            completed
              ? "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300"
              : started
              ? tone.badge
              : "bg-white/90 text-slate-600 dark:bg-slate-800/90 dark:text-slate-300"
          }`}
        >
          {completed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
          {completed ? "Đã hoàn thành" : started ? "Đang học" : "Sắp bắt đầu"}
        </span>

        {/* Titles overlaid on banner */}
        <div className="absolute inset-x-2.5 bottom-2.5">
          <p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/85 dark:text-slate-300">
            {course.title}
          </p>
          <h3 className="mt-0.5 line-clamp-1 text-sm sm:text-base font-black text-white drop-shadow">
            {displayClassTitle}
          </h3>
        </div>
      </div>

      {/* Body content */}
      <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1">
        {/* Teacher row */}
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 shadow-2xs dark:bg-sky-950/60 dark:text-sky-400">
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-medium">Giáo viên</span>
            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">
              {liveClass?.instructor_name || "CSCA"}
            </span>
          </span>
        </div>

        {/* Progress row */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold">
            <span className="text-slate-500 dark:text-slate-400">
              {progressTotal > 0
                ? `${progressCompleted}/${progressTotal} ${progressUnit} học`
                : "Tiến độ học tập"}
            </span>
            <span className="font-black text-[#17365f] dark:text-sky-400">{progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                completed ? "bg-emerald-500" : tone.bar
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-3">
          <span
            className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white shadow-xs transition group-hover:brightness-105 ${tone.button}`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {completed ? "Xem lại lớp học" : "Vào lớp học"}
            <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function StudentDashboardPage() {
  const { authUser } = useAuthContext();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    const [courseResult, scheduleResult, notificationResult] = await Promise.allSettled([
      fetchMyEnrolledCourses(),
      fetchMyLiveSchedule(),
      fetchNotifications({ page: 1, limit: 4 }),
    ]);

    if (courseResult.status === "fulfilled") {
      setCourses(Array.isArray(courseResult.value?.data) ? courseResult.value.data : []);
    } else if (!silent) {
      setCourses([]);
      setError("Không thể tải dữ liệu trang chủ. Vui lòng thử lại.");
    }
    if (scheduleResult.status === "fulfilled") {
      setSessions(Array.isArray(scheduleResult.value?.data) ? scheduleResult.value.data : []);
    } else if (!silent) {
      setSessions([]);
    }
    if (notificationResult.status === "fulfilled") {
      setNotifications(Array.isArray(notificationResult.value?.data?.notifications) ? notificationResult.value.data.notifications : []);
    } else if (!silent) {
      setNotifications([]);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => loadDashboard({ silent: true });
    const intervalId = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("csca:notifications-updated", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("csca:notifications-updated", refresh);
    };
  }, [loadDashboard]);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((session) => new Date(session.end_time || session.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 4);
  }, [sessions]);

  const classCards = useMemo(() => {
    return courses.flatMap((course) => {
      const classes = Array.isArray(course.classes) ? course.classes : [];
      if (classes.length > 0) {
        return classes.map((liveClass) => ({ course, liveClass }));
      }
      return [{ course, liveClass: null }];
    });
  }, [courses]);

  const hasTodaySession = useMemo(() => {
    return upcomingSessions.some((s) => isToday(s.start_time));
  }, [upcomingSessions]);

  const displayName = authUser?.fullName || authUser?.username || "bạn";

  if (loading) return <LoadingState type="cards" count={4} message="Đang chuẩn bị không gian học tập..." />;
  if (error && courses.length === 0) {
    return <div className="mx-auto max-w-xl px-5 py-16"><ErrorState title="Chưa thể tải trang chủ" message={error} onRetry={loadDashboard} /></div>;
  }

  return (
    <div className="student-dashboard-page min-h-full p-3 sm:p-4 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(235px,0.96fr)_minmax(220px,0.86fr)]">
          <section className="relative min-h-[220px] overflow-hidden">
            <div className="relative z-10 max-w-2xl px-2 py-5 sm:px-3 sm:py-6">
              <p className="font-['Dancing_Script',cursive] text-[40px] font-bold leading-[1.05] text-[#102f63] drop-shadow-sm sm:text-[44px] xl:whitespace-nowrap dark:text-sky-200">Chào mừng trở lại!</p>
              <p className="mt-3 max-w-lg text-xs font-semibold italic leading-5 text-slate-700 sm:text-sm dark:text-slate-300">“Học để biết, học để làm, học để chung sống, học để tự khẳng định.”</p>
              <p className="mt-1.5 font-['Ma_Shan_Zheng',cursive] text-xl text-[#17365f] dark:text-sky-400">博学而笃志，切问而近思。</p>
              <p className="mt-4 inline-flex rounded-full border border-white/70 bg-white/70 px-3.5 py-1.5 text-[11px] font-bold text-blue-800 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:text-blue-300">Xin chào, {displayName}</p>
            </div>
          </section>

          <section className="flex h-[220px] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-[0_10px_35px_rgba(56,96,130,0.1)] dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-1.5 text-xs font-black text-[#102f63] dark:text-white">
                <CalendarDays className="h-3.5 w-3.5 text-rose-500" />
                {hasTodaySession ? "Lịch học hôm nay" : "Lịch học sắp tới"}
                {hasTodaySession && (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
                    Hôm nay
                  </span>
                )}
              </h2>
              <Link to="/lms/calendar" className="text-[9px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Xem toàn bộ
              </Link>
            </div>
            <div className="mt-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {upcomingSessions.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 px-4 py-7 text-center text-xs text-slate-500 dark:text-slate-400">
                  Chưa có lịch học sắp tới.
                </p>
              ) : (
                upcomingSessions.map((session, index) => {
                  const { time, dateBadge, isToday: itemIsToday, isTomorrow: itemIsTomorrow } = formatSessionTime(session.start_time);
                  const tone = Object.values(TONES)[index % 4];
                  const targetPath = getSessionPath(session);
                  const title = cleanSessionTitle(session);
                  const subTitle = session.class_title
                    ? `Lớp: ${session.class_title}`
                    : (session.course_title || "Lớp trực tuyến");
                  const isLive = session.status === "live";

                  return (
                    <Link
                      key={session.id}
                      to={targetPath}
                      className="group grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60"
                    >
                      <div className="flex flex-col text-left leading-tight">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-800 dark:text-slate-200">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.bar}`} />
                          {time}
                        </span>
                        <span
                          className={`text-[8px] font-bold ${
                            itemIsToday
                              ? "text-rose-600 dark:text-rose-400"
                              : itemIsTomorrow
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {dateBadge}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="truncate text-[10px] font-black text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400">
                            {title}
                          </p>
                          {isLive && (
                            <span className="shrink-0 rounded-full bg-rose-500 px-1 text-[7px] font-black uppercase text-white">
                              Live
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[8px] text-slate-400 dark:text-slate-500">
                          {subTitle}
                        </p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="flex h-[220px] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-[0_10px_35px_rgba(56,96,130,0.1)] dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-1.5 text-xs font-black text-[#102f63] dark:text-white">
                <Bell className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Thông báo mới
              </h2>
              <Link to="/lms/notifications" className="text-[9px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Xem tất cả
              </Link>
            </div>
            <div className="mt-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {notifications.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 px-4 py-7 text-center text-xs text-slate-500 dark:text-slate-400">
                  Chưa có thông báo mới.
                </p>
              ) : (
                notifications.map((item, index) => {
                  const Icon = [FileCheck2, CalendarDays, FolderOpen, MessageCircle][index % 4];
                  const tone = Object.values(TONES)[index % 4];
                  const title = getNotificationTitle(item);
                  const body = getNotificationBody(item);
                  const targetUrl = getNotificationUrl(item);

                  return (
                    <Link
                      key={item.id}
                      to={targetUrl}
                      onClick={() => {
                        if (!item.is_read) {
                          setNotifications((current) => current.map((notification) => (
                            notification.id === item.id ? { ...notification, is_read: true } : notification
                          )));
                          markNotificationAsRead(item.id)
                            .then(() => window.dispatchEvent(new CustomEvent("csca:notifications-updated")))
                            .catch((error) => console.warn("Unable to mark notification as read", error));
                        }
                      }}
                      className="group flex w-full items-start gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60"
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${tone.icon} transition-transform group-hover:scale-105`}>
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="line-clamp-1 text-[10px] font-black text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400">
                            {title}
                          </p>
                          {!item.is_read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" title="Chưa đọc" />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[8px] text-slate-500 dark:text-slate-400">
                          {body}
                        </p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:col-span-2">
            {QUICK_LINKS.map((item) => <QuickLink key={item.to} item={item} />)}
          </section>

          <section className="relative min-h-[360px] overflow-hidden rounded-3xl bg-cover bg-center shadow-[0_12px_38px_rgba(56,96,130,0.16)] dark:shadow-none xl:col-start-3 xl:row-start-2 xl:row-span-2" style={{ backgroundImage: "url('/student-campus-spring.webp')" }}>
            <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/20 to-[#17365f]/45 dark:from-slate-950/85 dark:via-slate-950/50 dark:to-slate-950/90" />
            <div className="relative flex min-h-[360px] flex-col items-center justify-between p-5 text-center">
              <p className="font-['Ma_Shan_Zheng',cursive] text-2xl leading-tight text-[#102f63] dark:text-sky-200">保持热爱<br />奔赴山海</p>
              <div className="w-full rounded-2xl border border-white/70 bg-white/80 px-3 py-2.5 text-[10px] italic text-[#17365f] shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 dark:text-sky-300">“Mỗi bước tiến hôm nay đều đưa bạn đến gần hơn với ước mơ.”</div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/80 bg-white/75 p-4 sm:p-5 shadow-[0_10px_35px_rgba(56,96,130,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none xl:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-[#102f63] dark:text-white">Lớp học của tôi</h2>
                <p className="text-xs text-[#487291] dark:text-slate-400">Mỗi thẻ là một lớp học bạn đang theo học</p>
              </div>
              <Link to="/lms/my-learning" className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300 transition">
                Xem tất cả <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {classCards.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 px-5 py-9 text-center dark:border-slate-800 dark:bg-slate-800/40">
                <BookOpen className="mx-auto h-8 w-8 text-sky-300 dark:text-sky-500" />
                <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">Bạn chưa có lớp học nào</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lớp học sẽ xuất hiện sau khi quản trị viên cấp quyền và xếp lớp.</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {classCards.slice(0, 6).map(({ course, liveClass }, index) => (
                  <DashboardClassCard
                    key={`${course.course_id}-${liveClass?.id || index}`}
                    course={course}
                    liveClass={liveClass}
                    index={index}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
