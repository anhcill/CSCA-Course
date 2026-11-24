import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileCheck2,
  Play,
  Sparkles,
  UserCheck,
  UserRound,
  Video,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { ErrorState, LoadingState } from "../../../components/common/StateView";
import {
  checkInToSession,
  fetchAssignments,
  fetchMyEnrolledCourses,
  fetchMyLiveSchedule,
  fetchMySessionCheckIn,
  getLiveSessionAccess,
} from "../../api/lmsClient";
import { getClassCoverImage } from "../../../utils/classWallpapers";
import { enterAssessmentFullscreen } from "../../../utils/assessmentDisplay.js";
import {
  closeReservedMeeting,
  getMeetingWindowState,
  openReservedMeeting,
  reserveMeetingWindow,
} from "../../liveClass/utils/meetingLaunch";
import { isRecordingMode } from "../utils/learningMode.js";

const TONES_ARRAY = [
  { bar: "bg-sky-500", badge: "bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/60", button: "bg-sky-600 hover:bg-sky-700" },
  { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/60", button: "bg-emerald-600 hover:bg-emerald-700" },
  { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/60", button: "bg-amber-500 hover:bg-amber-600" },
  { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/60", button: "bg-rose-500 hover:bg-rose-600" },
];

const getProgress = (item) => {
  if (item?.progress_percent != null || item?.progressPercent != null) {
    const value = Number(item?.progress_percent ?? item?.progressPercent ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }
  const total = Number(item?.progress_total || item?.total_lessons || item?.total_sessions || 0);
  const completed = Number(item?.progress_completed || item?.completed_lessons || item?.completed_sessions || 0);
  if (total > 0) {
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  }
  return 0;
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

const formatSessionTime = (startTime, endTime) => {
  if (!startTime) return { timeRange: "--:--", dateBadge: "", isToday: false, isTomorrow: false };
  const start = new Date(startTime);
  const startStr = start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const endStr = endTime
    ? new Date(endTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const timeRange = endStr ? `${startStr} – ${endStr}` : startStr;

  if (isToday(startTime)) {
    return { timeRange, dateBadge: "Hôm nay", isToday: true, isTomorrow: false };
  }
  if (isTomorrow(startTime)) {
    return { timeRange, dateBadge: "Ngày mai", isToday: false, isTomorrow: true };
  }

  const day = String(start.getDate()).padStart(2, "0");
  const month = String(start.getMonth() + 1).padStart(2, "0");
  return { timeRange, dateBadge: `${day}/${month}`, isToday: false, isTomorrow: false };
};

const cleanSessionTitle = (session) => {
  const raw = (session?.title || "").trim();
  if (raw && /[\p{L}\p{N}]/u.test(raw)) {
    return raw;
  }
  return session?.course_title || session?.class_title || "Buổi học trực tuyến";
};

const getSessionDetailPath = (session) => {
  if (session?.course_id && session?.live_class_id) {
    return `/lms/courses/${session.course_id}/classes/${session.live_class_id}/sessions/${session.id}`;
  }
  return "/lms/calendar";
};

const formatClassTitle = (title) => {
  if (!title) return "Lớp học";
  const str = String(title).trim();
  if (/^\d+$/.test(str)) return `Lớp ${str}`;
  return str;
};

const isQuizTask = (item) => {
  const value = String(item?.type || item?.assignment_type || "").toLowerCase();
  return value.includes("quiz") || value.includes("trac_nghiem");
};

const getTaskActionPath = (item) => {
  const quiz = isQuizTask(item);
  if (item?.course_id && item?.live_class_id) {
    return quiz
      ? `/lms/courses/${item.course_id}/classes/${item.live_class_id}/quizzes/${item.id}`
      : `/lms/courses/${item.course_id}/classes/${item.live_class_id}/assignments/${item.id}/submit`;
  }
  return quiz ? `/lms/quizzes/${item.id}` : `/lms/assignments/${item.id}/submit`;
};

const formatDeadlineBadge = (dueDateValue) => {
  if (!dueDateValue) return { label: "Không giới hạn", urgent: false, overdue: false };
  const dueMs = new Date(dueDateValue).getTime();
  if (!Number.isFinite(dueMs)) return { label: "Không giới hạn", urgent: false, overdue: false };
  const diffMs = dueMs - Date.now();
  if (diffMs < 0) return { label: "Quá hạn", urgent: true, overdue: true };
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return { label: "Còn < 1 giờ", urgent: true, overdue: false };
  if (diffHours < 24) return { label: `Còn ${diffHours} giờ`, urgent: true, overdue: false };
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return { label: "Hạn ngày mai", urgent: true, overdue: false };
  const d = new Date(dueMs);
  return {
    label: `Hạn ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
    urgent: false,
    overdue: false,
  };
};

function DashboardClassCard({ course, liveClass, index }) {
  const targetItem = liveClass || course;
  const recordingMode = isRecordingMode(liveClass, course);
  const progressTotal = liveClass
    ? Number(liveClass.progress_total || 0)
    : Number(course.progress_total || 0);
  const progressCompleted = liveClass
    ? Number(liveClass.progress_completed || 0)
    : Number(course.progress_completed || 0);
  const progressUnit = (liveClass?.progress_source || course.progress_source) === "sessions" ? "buổi" : "bài";
  const progress = progressTotal > 0
    ? Math.max(0, Math.min(100, Math.round((progressCompleted / progressTotal) * 100)))
    : getProgress(targetItem);
  const completed = progress === 100;
  const started = progress > 0;
  const tone = TONES_ARRAY[index % TONES_ARRAY.length];
  const cover = getClassCoverImage(targetItem, course.course_id || course.id);
  const classBasePath = liveClass
    ? `/lms/courses/${course.course_id}/classes/${liveClass.id}`
    : `/lms/courses/${course.course_id}/classes`;
  const displayClassTitle = liveClass ? formatClassTitle(liveClass.title) : course.title;

  return (
    <div className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/85 bg-white shadow-[0_8px_24px_rgba(45,87,122,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(45,87,122,0.18)] hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-sky-500/50">
      <Link to={classBasePath} className="block">
        <div className="relative h-28 sm:h-32 w-full overflow-hidden bg-sky-100 dark:bg-slate-800">
          <img
            src={cover}
            alt={displayClassTitle}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#102f63]/85 via-transparent to-white/10 dark:from-slate-950/90 dark:to-transparent" />

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
            {completed ? "Đã hoàn thành" : recordingMode ? "Học qua bản ghi" : started ? "Đang học" : "Sắp bắt đầu"}
          </span>

          <div className="absolute inset-x-2.5 bottom-2.5">
            <p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/85 dark:text-slate-300">
              {course.title}
            </p>
            <h3 className="mt-0.5 line-clamp-1 text-sm sm:text-base font-black text-white drop-shadow">
              {displayClassTitle}
            </h3>
          </div>
        </div>
      </Link>

      <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1">
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

        <div className="mt-3 flex items-center gap-1.5">
          <Link
            to={classBasePath}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white shadow-xs transition hover:brightness-105 ${tone.button}`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>{completed ? "Xem lại" : "Vào lớp"}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          {liveClass && (
            <Link
              to={`${classBasePath}/assignments`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Bài tập của lớp"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [checkInMap, setCheckInMap] = useState({});
  const [checkingInId, setCheckingInId] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    const [courseResult, scheduleResult, assignmentResult] = await Promise.allSettled([
      fetchMyEnrolledCourses(),
      fetchMyLiveSchedule(),
      fetchAssignments(),
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
    if (assignmentResult.status === "fulfilled") {
      setAssignments(Array.isArray(assignmentResult.value?.data) ? assignmentResult.value.data : []);
    } else if (!silent) {
      setAssignments([]);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => loadDashboard({ silent: true });
    const intervalId = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [loadDashboard]);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((session) => session.status !== "cancelled" && new Date(session.end_time || session.start_time).getTime() + 30 * 60 * 1000 >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 4);
  }, [sessions]);

  const todaySessionIds = useMemo(
    () => upcomingSessions.filter((s) => isToday(s.start_time)).map((s) => s.id),
    [upcomingSessions],
  );

  useEffect(() => {
    if (todaySessionIds.length === 0) return undefined;
    let active = true;
    Promise.allSettled(todaySessionIds.map((id) => fetchMySessionCheckIn(id))).then((results) => {
      if (!active) return;
      const nextMap = {};
      results.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value?.data) {
          nextMap[String(todaySessionIds[idx])] = res.value.data;
        }
      });
      setCheckInMap((prev) => ({ ...prev, ...nextMap }));
    });
    return () => { active = false; };
  }, [todaySessionIds]);

  const handleQuickJoin = async (session) => {
    if (!session || joiningId) return;
    setJoiningId(session.id);
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) {
        throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      }
      openReservedMeeting(meetingWindow, result.data.meetUrl, {
        sessionId: session.id,
        provider: result.data.provider,
        navigate,
      });
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (err) {
      closeReservedMeeting(meetingWindow);
      toast.error(err?.message || "Không thể mở phòng học lúc này.");
    } finally {
      setJoiningId(null);
    }
  };

  const handleQuickCheckIn = async (sessionId) => {
    if (!sessionId || checkingInId) return;
    setCheckingInId(sessionId);
    try {
      const response = await checkInToSession(sessionId);
      setCheckInMap((prev) => ({
        ...prev,
        [String(sessionId)]: {
          ...(prev[String(sessionId)] || {}),
          ...(response?.data || {}),
          status: response?.data?.status || "present",
          canCheckIn: false,
        },
      }));
      window.dispatchEvent(new CustomEvent("csca:student-checkin-updated", { detail: { sessionId } }));
      toast.success(response?.message || "Đã báo có mặt thành công!");
    } catch (err) {
      toast.error(err?.message || "Chưa thể báo có mặt lúc này.");
    } finally {
      setCheckingInId(null);
    }
  };

  const actionableTasks = useMemo(() => {
    const now = Date.now();
    return assignments
      .filter((item) => {
        const hasScore = item.score !== undefined && item.score !== null;
        if (hasScore) return false;
        const subStatus = String(item.submission_status || "").toLowerCase();
        const isSubmitted = Boolean(item.submitted_at) || subStatus === "submitted" || item.status === "submitted";
        if (isSubmitted && !item.can_resubmit) return false;
        const availableUntil = item.available_until ? new Date(item.available_until).getTime() : null;
        if (availableUntil && availableUntil <= now && !item.can_resubmit) return false;
        return true;
      })
      .sort((a, b) => {
        const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        return dueA - dueB;
      });
  }, [assignments]);

  const classCards = useMemo(() => {
    return courses.flatMap((course) => {
      const classes = Array.isArray(course.classes) ? course.classes : [];
      if (classes.length > 0) {
        return classes.map((liveClass) => ({ course, liveClass }));
      }
      return [{ course, liveClass: null }];
    });
  }, [courses]);

  const todaySessionsCount = useMemo(
    () => upcomingSessions.filter((s) => isToday(s.start_time)).length,
    [upcomingSessions],
  );

  const displayName = authUser?.fullName || authUser?.username || "bạn";

  if (loading) return <LoadingState type="cards" count={4} message="Đang chuẩn bị không gian học tập..." />;
  if (error && courses.length === 0) {
    return <div className="mx-auto max-w-xl px-5 py-16"><ErrorState title="Chưa thể tải trang chủ" message={error} onRetry={loadDashboard} /></div>;
  }

  return (
    <div className="student-dashboard-page min-h-full p-3 sm:p-4 lg:px-6 lg:py-4">
      <div className="mx-auto max-w-[1440px] space-y-5">
        {/* 1. Compact Header + 3 Actionable KPI Cards */}
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="px-1">
            <p className="font-['Dancing_Script',cursive] text-4xl sm:text-[46px] font-bold leading-none text-[#102f63] drop-shadow-xs dark:text-sky-200">
              Xin chào, {displayName}!
            </p>
            <p className="mt-2 text-xs sm:text-sm font-semibold italic text-slate-700 dark:text-slate-300">
              “Học để biết, học để làm, học để tự khẳng định.” ·{" "}
              <span className="font-['Ma_Shan_Zheng',cursive] text-base text-[#17365f] dark:text-sky-400">
                博学而笃志，切问而近思
              </span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[460px]">
            <Link
              to={authUser?.hasActiveLiveEnrollment === true ? "/lms/my-learning" : "/courses"}
              className="group rounded-2xl border border-white/85 bg-white/90 px-2.5 py-2 sm:px-3.5 sm:py-2.5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900/90"
            >
              <span className="block truncate text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Lớp học</span>
              <span className="mt-1 flex items-baseline justify-between">
                <strong className="font-mono text-lg sm:text-2xl font-black text-[#102f63] dark:text-white">{classCards.length}</strong>
                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-500 transition group-hover:scale-110" />
              </span>
            </Link>

            <Link
              to="/lms/calendar"
              className="group rounded-2xl border border-white/85 bg-white/90 px-2.5 py-2 sm:px-3.5 sm:py-2.5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-rose-300 dark:border-slate-800 dark:bg-slate-900/90"
            >
              <span className="block truncate text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hôm nay</span>
              <span className="mt-1 flex items-baseline justify-between">
                <strong className="font-mono text-lg sm:text-2xl font-black text-[#102f63] dark:text-white">{todaySessionsCount}</strong>
                <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-500 transition group-hover:scale-110" />
              </span>
            </Link>

            <Link
              to="/lms/assignments"
              className="group rounded-2xl border border-white/85 bg-white/90 px-2.5 py-2 sm:px-3.5 sm:py-2.5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-amber-300 dark:border-slate-800 dark:bg-slate-900/90"
            >
              <span className="block truncate text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cần nộp</span>
              <span className="mt-1 flex items-baseline justify-between">
                <strong className="font-mono text-lg sm:text-2xl font-black text-[#102f63] dark:text-white">{actionableTasks.length}</strong>
                <FileCheck2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 transition group-hover:scale-110" />
              </span>
            </Link>
          </div>
        </section>

        {/* 2. TODAY FOCUS DOCK (2 Columns: Live Sessions 1-Tap + Pending Assignments 1-Tap) */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Cột 1: Lịch học hôm nay / sắp tới (kèm Vào phòng & Báo có mặt 1 chạm) */}
          <section className="flex flex-col justify-between rounded-3xl border border-white/85 bg-white/92 p-4 sm:p-5 shadow-[0_10px_35px_rgba(56,96,130,0.09)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
                    <Video className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                      <span>{todaySessionsCount > 0 ? "Buổi học hôm nay" : "Buổi học sắp tới"}</span>
                      {todaySessionsCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                          {todaySessionsCount} ca hôm nay
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Vào phòng trực tuyến và báo có mặt chỉ với 1 chạm
                    </p>
                  </div>
                </div>
                <Link
                  to="/lms/calendar"
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Lịch tuần <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-3.5 space-y-2.5">
                {upcomingSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-800/40">
                    <CalendarDays className="mx-auto h-7 w-7 text-slate-400" />
                    <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">Hiện chưa có buổi học sắp diễn ra</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Bạn có thể ôn lại từ vựng, công thức hoặc xem bản ghi các buổi trước.</p>
                  </div>
                ) : (
                  upcomingSessions.map((session) => {
                    const { timeRange, dateBadge, isToday: itemIsToday, isTomorrow: itemIsTomorrow } = formatSessionTime(session.start_time, session.end_time);
                    const windowState = getMeetingWindowState(session);
                    const isLiveNow = session.status === "live" || windowState.isOpen;
                    const detailPath = getSessionDetailPath(session);
                    const checkInInfo = checkInMap[String(session.id)];
                    const checkInStatus = String(checkInInfo?.status || checkInInfo?.attendance_status || "").toLowerCase();
                    const isCheckedIn = checkInStatus === "present" || checkInStatus === "late";
                    const canSelfCheckIn = Boolean(itemIsToday && checkInInfo?.canCheckIn && !checkInStatus);

                    return (
                      <div
                        key={session.id}
                        className={`rounded-2xl border p-3.5 transition ${
                          isLiveNow
                            ? "border-emerald-300 bg-emerald-50/60 shadow-xs dark:border-emerald-500/40 dark:bg-emerald-500/10"
                            : "border-slate-200/80 bg-slate-50/70 hover:border-sky-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:border-sky-500/40"
                        }`}
                      >
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                  isLiveNow
                                    ? "bg-emerald-600 text-white animate-pulse"
                                    : itemIsToday
                                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                                    : itemIsTomorrow
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                                    : "bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                                }`}
                              >
                                {isLiveNow ? "ĐANG MỞ PHÒNG" : dateBadge}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">
                                <Clock className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                                {timeRange}
                              </span>
                              {isCheckedIn && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" /> Đã điểm danh
                                </span>
                              )}
                            </div>

                            <Link
                              to={detailPath}
                              className="block truncate text-sm font-black text-[#102f63] hover:text-blue-600 dark:text-white dark:hover:text-sky-300"
                            >
                              {cleanSessionTitle(session)}
                            </Link>
                            <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {session.class_title ? `Lớp: ${session.class_title}` : (session.course_title || "Lớp trực tuyến CSCA")}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {isLiveNow && (
                              <button
                                type="button"
                                disabled={joiningId === session.id}
                                onClick={() => handleQuickJoin(session)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-500 active:scale-95 disabled:opacity-60"
                              >
                                <Play className="h-3.5 w-3.5 fill-current" />
                                {joiningId === session.id ? "Đang mở..." : "Vào phòng"}
                              </button>
                            )}
                            {canSelfCheckIn && (
                              <button
                                type="button"
                                disabled={checkingInId === session.id}
                                onClick={() => handleQuickCheckIn(session.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-500/40 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                {checkingInId === session.id ? "Đang ghi..." : "Tôi có mặt"}
                              </button>
                            )}
                            <Link
                              to={detailPath}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-sky-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/40 dark:hover:text-sky-300"
                            >
                              Chi tiết
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Cột 2: Bài tập & Quiz cần hoàn thành */}
          <section className="flex flex-col justify-between rounded-3xl border border-white/85 bg-white/92 p-4 sm:p-5 shadow-[0_10px_35px_rgba(56,96,130,0.09)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                      <span>Bài tập & Quiz cần làm</span>
                      {actionableTasks.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                          {actionableTasks.length} bài
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sắp xếp theo hạn nộp gần nhất để không trễ deadline
                    </p>
                  </div>
                </div>
                <Link
                  to="/lms/assignments"
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Tất cả bài <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-3.5 space-y-2.5">
                {actionableTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-8 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                    <p className="mt-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">Tuyệt vời! Bạn đã hoàn thành hết bài tập</p>
                    <p className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">Chưa có bài tập hay bài kiểm tra nào đang chờ nộp.</p>
                  </div>
                ) : (
                  actionableTasks.slice(0, 4).map((task) => {
                    const quiz = isQuizTask(task);
                    const deadline = formatDeadlineBadge(task.due_date);
                    const targetUrl = getTaskActionPath(task);
                    const inProgress = String(task.submission_status || "").toLowerCase() === "in_progress";

                    return (
                      <Link
                        key={`${quiz ? "quiz" : "asg"}-${task.id}`}
                        to={targetUrl}
                        onClick={enterAssessmentFullscreen}
                        className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition hover:border-sky-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:border-sky-500/40 dark:hover:bg-slate-800"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                quiz
                                  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                                  : "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                              }`}
                            >
                              {quiz ? "QUIZ" : "BÀI TẬP"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                deadline.overdue
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                                  : deadline.urgent
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                  : "bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {deadline.label}
                            </span>
                          </div>
                          <p className="truncate text-sm font-black text-[#102f63] group-hover:text-blue-600 dark:text-white dark:group-hover:text-sky-300">
                            {task.title}
                          </p>
                          <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {task.class_title || task.course_title || "Lớp học CSCA"}
                          </p>
                        </div>

                        <span className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-[#102f63] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition group-hover:bg-blue-700 dark:bg-blue-600 dark:group-hover:bg-blue-500">
                          {inProgress ? "Làm tiếp" : task.can_resubmit ? "Nộp lại" : "Làm ngay"}
                          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 3. LỚP HỌC CỦA TÔI */}
        {authUser?.hasActiveLiveEnrollment === true && (
        <section className="rounded-3xl border border-white/80 bg-white/85 p-4 sm:p-5 shadow-[0_10px_35px_rgba(56,96,130,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#102f63] dark:text-white">Lớp học của tôi</h2>
              <p className="text-xs text-[#487291] dark:text-slate-400">Chọn lớp để xem lộ trình buổi học, tài liệu và kết quả</p>
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
            <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {classCards.slice(0, 8).map(({ course, liveClass }, index) => (
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
        )}

        {/* 4. Dải châm ngôn Á Đông gọn gàng dưới chân trang */}
        <section
          className="relative overflow-hidden rounded-3xl bg-cover bg-center px-5 py-4 shadow-[0_8px_28px_rgba(56,96,130,0.12)] dark:shadow-none"
          style={{ backgroundImage: "url('/student-campus-spring.webp')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/75 to-[#17365f]/60 dark:from-slate-950/90 dark:via-slate-900/80 dark:to-slate-950/90" />
          <div className="relative flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-['Ma_Shan_Zheng',cursive] text-xl sm:text-2xl text-[#102f63] dark:text-sky-200">
              保持热爱 · 奔赴山海
            </p>
            <p className="text-xs italic font-semibold text-[#17365f] dark:text-slate-300">
              “Mỗi bước tiến hôm nay đều đưa bạn đến gần hơn với ước mơ.”
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
