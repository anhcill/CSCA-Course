import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  createLiveSession,
  fetchClassChapters,
  fetchLiveClassRoster,
  fetchLiveClasses,
  fetchMyLiveSchedule,
  getLiveSessionAccess,
} from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import { useAuthContext } from "../../../context/AuthContext";
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

/* ── SVG Icons ───────────────────────────────────────────────── */
const IconVideo = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);
const IconClock = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
  </svg>
);
const IconUsers = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconCalendar = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const IconChecklist = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);
const IconPlus = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);
const IconSparkles = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>
);

function getSessionStatus(s) {
  const now = Date.now();
  const start = new Date(s.start_time).getTime();
  const end = new Date(s.end_time).getTime();
  if (s.status === "live" || (now >= start && now <= end)) return "LIVE";
  if (now > end) return "ENDED";
  if (start - now <= 30 * 60 * 1000) return "IMMINENT";
  if (new Date(s.start_time).toDateString() === new Date().toDateString()) return "TODAY";
  return "UPCOMING";
}

const toIsoDateTime = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const STATUS_CFG = {
  LIVE:     { label: "ĐANG DẠY LIVE",    cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30", dot: true },
  IMMINENT: { label: "CHUẨN BỊ MỞ LỚP",  cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", dot: true },
  TODAY:    { label: "LỊCH HÔM NAY",      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  UPCOMING: { label: "SẮP DIỄN RA",     cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25" },
  ENDED:    { label: "ĐÃ HOÀN THÀNH",   cls: "bg-slate-200/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700/50" },
};

const WEEKDAYS = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export default function TeacherSchedulePage() {
  const navigate = useNavigate();
  const { authUser } = useAuthContext();

  const [sessions, setSessions] = useState([]);
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("list");

  // Create Session Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    title: "",
    liveClassId: "",
    startTime: "",
    endTime: "",
    meetUrl: "",
  });
  const [submittingSession, setSubmittingSession] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [chapterMode, setChapterMode] = useState("existing");
  const [chapterId, setChapterId] = useState("");
  const [newChapter, setNewChapter] = useState({ title: "", description: "", objectives: "" });
  const [canManageCurriculum, setCanManageCurriculum] = useState(false);

  // Student Roster Modal state
  const [rosterSession, setRosterSession] = useState(null);
  const [rosterStudents, setRosterStudents] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const loadSchedule = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage("");
    }
    try {
      const [scheduleRes, classesRes] = await Promise.all([
        fetchMyLiveSchedule(),
        fetchLiveClasses(),
      ]);
      if (!scheduleRes?.success || !classesRes?.success) {
        throw new Error(scheduleRes?.message || classesRes?.message || "Không thể tải lịch dạy");
      }
      setSessions(scheduleRes.data || []);
      const classes = classesRes.success ? (classesRes.data || []) : [];
      const courseClasses = classes.filter((liveClass) => liveClass.course_id);
      setLiveClasses(courseClasses);
      setSessionForm((previous) => {
        if (courseClasses.some((liveClass) => String(liveClass.id) === String(previous.liveClassId))) {
          return previous;
        }
        return courseClasses[0]
          ? { ...previous, liveClassId: String(courseClasses[0].id) }
          : { ...previous, liveClassId: "" };
      });
    } catch (err) {
      console.error("Error loading teacher schedule:", err);
      if (!silent) setErrorMessage("Không thể tải danh sách lớp học và lịch dạy của giáo viên.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    if (!showCreateModal || !sessionForm.liveClassId) return;
    let cancelled = false;
    fetchClassChapters(sessionForm.liveClassId).then((response) => {
      if (cancelled) return;
      const items = (Array.isArray(response?.data) ? response.data : [])
        .filter((chapter) => String(chapter.assigned_teacher_id) === String(authUser?.id));
      setChapters(items);
      setCanManageCurriculum(Boolean(response?.canManageCurriculum));
      setChapterId(items[0] ? String(items[0].id) : "");
      setChapterMode(items.length ? "existing" : response?.canManageCurriculum ? "new" : "existing");
    }).catch(() => { if (!cancelled) toast.error("Không tải được các chương của lớp."); });
    return () => { cancelled = true; };
  }, [showCreateModal, sessionForm.liveClassId, authUser?.id]);

  // Silently refresh so timetable edits made in another session show up
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadSchedule({ silent: true });
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [loadSchedule]);

  useEffect(() => {
    const unsubscribe = subscribeToCalendarChanges(loadSchedule);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadSchedule();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadSchedule]);

  // Host starts or opens meeting
  const handleHostMeeting = async (session) => {
    const meetingWindow = reserveMeetingWindow();
    try {
      const r = await getLiveSessionAccess(session.id);
      if (r.success && r.data?.meetUrl) {
        toast.success(`Đang mở phòng giảng dạy ${r.data.provider || "Google Meet"}... 👨‍🏫`);
        openReservedMeeting(meetingWindow, r.data.meetUrl, {
          sessionId: session.id,
          provider: r.data.provider,
          navigate,
        });
      } else {
        closeReservedMeeting(meetingWindow);
        toast.error("Chưa cấu hình link phòng học cho buổi học này!");
      }
    } catch {
      closeReservedMeeting(meetingWindow);
      toast.error("Lỗi khi kết nối phòng học trực tuyến!");
    }
  };

  const handleCreateSessionSubmit = async (e) => {
    e.preventDefault();
    if (!sessionForm.title.trim() || !sessionForm.startTime) {
      toast.error("Vui lòng điền đầy đủ tiêu đề và thời gian bắt đầu!");
      return;
    }
    const startTime = toIsoDateTime(sessionForm.startTime);
    const endTime = toIsoDateTime(
      sessionForm.endTime || new Date(new Date(sessionForm.startTime).getTime() + 90 * 60000).toISOString(),
    );
    if (!startTime || !endTime) {
      toast.error("Thời gian buổi học không hợp lệ.");
      return;
    }
    setSubmittingSession(true);
    try {
      const liveClassId = sessionForm.liveClassId;
      if (!liveClassId) {
        throw new Error("Chọn một lớp đã gắn với khóa học. Quản trị viên tạo lớp và lịch cố định trước.");
      }
      if (chapterMode === "existing" && !chapterId) throw new Error("Chọn chương cho buổi học.");
      if (chapterMode === "new" && !newChapter.title.trim()) throw new Error("Nhập tên chương mới.");

      await createLiveSession({
        liveClassId,
        title: sessionForm.title.trim(),
        startTime,
        endTime,
        meetUrl: sessionForm.meetUrl || undefined,
        status: "scheduled",
        ...(chapterMode === "existing"
          ? { chapterId: Number(chapterId) }
          : { newChapter: {
            title: newChapter.title.trim(),
            description: newChapter.description.trim(),
            objectives: newChapter.objectives.trim(),
          } }),
      });
      setShowCreateModal(false);
      setSessionForm((previous) => ({
        ...previous,
        title: "",
        liveClassId: String(liveClassId),
        startTime: "",
        endTime: "",
        meetUrl: "",
      }));
      setNewChapter({ title: "", description: "", objectives: "" });
      await loadSchedule();
      toast.success("Đã bổ sung buổi học cho khóa học thành công! 📅");
    } catch (err) {
      console.error("Error creating live session:", err);
      toast.error(err?.message || "Không thể tạo buổi học. Vui lòng thử lại.");
    } finally {
      setSubmittingSession(false);
    }
  };

  const handleOpenRoster = async (session) => {
    setRosterSession(session);
    setRosterStudents([]);
    setRosterLoading(true);
    try {
      const response = await fetchLiveClassRoster(session.live_class_id);
      setRosterStudents(response.data || []);
    } catch (err) {
      console.error("Error loading live class roster:", err);
      toast.error(err?.message || "Không thể tải danh sách học viên.");
    } finally {
      setRosterLoading(false);
    }
  };

  const enriched = useMemo(() => sessions.map((s) => ({ ...s, _st: getSessionStatus(s) })), [sessions]);

  const filtered = useMemo(() => {
    if (filter === "LIVE") return enriched.filter((s) => s._st === "LIVE");
    if (filter === "TODAY") {
      const todayStr = new Date().toDateString();
      return enriched.filter((s) => new Date(s.start_time).toDateString() === todayStr);
    }
    if (filter === "WEEK") {
      const now = new Date();
      const ws = new Date(now);
      ws.setDate(now.getDate() - now.getDay());
      const we = new Date(ws);
      we.setDate(ws.getDate() + 7);
      return enriched.filter((s) => {
        const d = new Date(s.start_time);
        return d >= ws && d < we;
      });
    }
    return enriched;
  }, [enriched, filter]);

  const stats = useMemo(() => ({
    total: sessions.length,
    live: enriched.filter((s) => s._st === "LIVE").length,
    done: enriched.filter((s) => s._st === "ENDED").length,
    upcoming: enriched.filter((s) => !["ENDED", "LIVE"].includes(s._st)).length,
  }), [enriched, sessions.length]);

  const calGrid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => []);
    filtered.forEach((s) => g[new Date(s.start_time).getDay()].push(s));
    return g;
  }, [filtered]);

  return (
    <div className="min-h-full px-3 pb-12 pt-3 sm:px-5 lg:px-6 text-slate-900 dark:text-slate-100 space-y-6">
      {/* ── Calligraphy Hero Banner ────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-5 sm:p-6 backdrop-blur-xl shadow-[0_12px_35px_rgba(49,91,125,0.08)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#1a446c]/10 text-[#102f63] dark:text-sky-300 border border-[#1a446c]/20 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#1a446c] dark:bg-sky-400 animate-pulse" />
              <span>Khu Vực Giảng Viên · Lịch Giảng Dạy & Giáo Trình</span>
            </div>
            <h1 className="font-['Dancing_Script'] text-3xl sm:text-4xl font-bold tracking-tight text-[#102f63] dark:text-sky-200">
              Giáo Trình & Lịch Dạy Trực Tuyến
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium italic">
              “Giảng giải cặn kẽ, khơi nguồn trí tuệ, đồng hành từng bước đường học vấn.”
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Oriental calligraphy watermark pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-white/80 dark:border-slate-700 font-['Ma_Shan_Zheng'] text-base text-[#102f63]/80 dark:text-sky-300/80 tracking-widest select-none shadow-2xs">
              学 贵 得 师 · 循 序 渐 进
            </div>

            <Link
              to="/lms/teach/attendance"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/85 dark:bg-slate-800/85 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition border border-white/90 dark:border-slate-700 shadow-2xs hover:shadow-sm"
            >
              <IconChecklist className="w-4 h-4 text-[#1a446c] dark:text-sky-400" />
              <span>Bảng Điểm Danh</span>
            </Link>

            <button
              id="create-session-btn"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#17365f] via-[#1a446c] to-emerald-600 hover:from-[#102f63] hover:to-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-700/20 active:scale-98"
            >
              <IconPlus className="w-4 h-4" />
              <span>Bổ Sung Buổi Dạy</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 4 Stats Metric Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
        {[
          {
            label: "Tổng số buổi dạy",
            value: stats.total,
            icon: IconCalendar,
            accent: "from-sky-500/15 to-blue-500/10 text-sky-700 dark:text-sky-300",
            iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
          },
          {
            label: "Đang diễn ra Live",
            value: stats.live,
            icon: IconVideo,
            accent: "from-rose-500/15 to-pink-500/10 text-rose-600 dark:text-rose-400",
            iconBg: "bg-rose-500/15 text-rose-500 dark:text-rose-400",
            pulse: stats.live > 0,
          },
          {
            label: "Đã hoàn thành",
            value: stats.done,
            icon: IconChecklist,
            accent: "from-emerald-500/15 to-teal-500/10 text-emerald-700 dark:text-emerald-400",
            iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Buổi dạy sắp tới",
            value: stats.upcoming,
            icon: IconClock,
            accent: "from-amber-500/15 to-orange-500/10 text-amber-700 dark:text-amber-400",
            iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          },
        ].map((st) => {
          const Icon = st.icon;
          return (
            <div
              key={st.label}
              className="relative overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(49,91,125,0.06)] flex items-center justify-between gap-3 group transition hover:shadow-[0_14px_35px_rgba(49,91,125,0.12)]"
            >
              <div>
                <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  {st.value}
                </p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  {st.label}
                </p>
              </div>
              <div className={`w-11 h-11 rounded-2xl ${st.iconBg} flex items-center justify-center shrink-0 shadow-2xs`}>
                <Icon className={`w-5 h-5 ${st.pulse ? "animate-pulse" : ""}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Filter Bar & View Switcher ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 rounded-2xl border border-white/70 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 p-2 sm:p-2.5 backdrop-blur-md">
        {/* Filter Pills */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: "ALL", label: "Tất Cả Buổi Dạy" },
            { id: "LIVE", label: "Đang Dạy Live 🔴" },
            { id: "TODAY", label: "Hôm Nay" },
            { id: "WEEK", label: "Tuần Này" },
          ].map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? f.id === "LIVE"
                      ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                      : "bg-[#1a446c] text-white shadow-md shadow-[#1a446c]/25"
                    : "bg-white/75 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-white/80 dark:border-slate-700/60"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* View Switcher: List vs Calendar */}
        <div className="flex items-center gap-1 bg-white/75 dark:bg-slate-800/70 border border-white/80 dark:border-slate-700/60 rounded-xl p-1 shadow-2xs">
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === "list"
                ? "bg-[#1a446c] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Danh Sách
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              viewMode === "calendar"
                ? "bg-[#1a446c] text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Lịch Tuần
          </button>
        </div>
      </div>

      {/* ── Content Area: List View or Calendar Grid ────────────── */}
      {loading ? (
        <LoadingState message="Đang nạp lịch giảng dạy của giáo viên..." count={3} />
      ) : errorMessage ? (
        <ErrorState title="Lỗi Tải Lịch Dạy" message={errorMessage} onRetry={loadSchedule} />
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-8 text-center backdrop-blur-xl shadow-sm">
          <EmptyState
            title="Chưa Có Buổi Dạy Nào"
            message="Bạn chưa có buổi học trực tuyến nào trong bộ lọc này. Hãy lên lịch buổi học đầu tiên!"
            actionLabel="+ Bổ Sung Buổi Dạy"
            onAction={() => setShowCreateModal(true)}
          />
        </div>
      ) : viewMode === "list" ? (
        /* List View */
        <div className="space-y-3.5">
          {filtered.map((s) => {
            const cfg = STATUS_CFG[s._st] || STATUS_CFG.UPCOMING;
            const isLive = s._st === "LIVE";
            const dur = s.start_time && s.end_time ? Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000) : 90;

            return (
              <div
                key={s.id}
                className={`relative overflow-hidden rounded-3xl border transition-all p-4 sm:p-5 backdrop-blur-xl shadow-[0_10px_30px_rgba(49,91,125,0.06)] hover:shadow-[0_16px_36px_rgba(49,91,125,0.12)] ${
                  isLive
                    ? "border-rose-400/80 dark:border-rose-500/70 bg-gradient-to-r from-rose-50/70 via-white/85 to-white/90 dark:from-rose-950/30 dark:via-slate-900/85 dark:to-slate-900/85 ring-2 ring-rose-500/20"
                    : "border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Session Details */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold border ${cfg.cls}`}>
                        {cfg.dot && <span className="w-2 h-2 rounded-full bg-rose-500 dark:bg-rose-400 animate-pulse" />}
                        {cfg.label}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                        {s.provider || "Google Meet"}
                      </span>
                      {s.class_title && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1a446c]/10 text-[#102f63] dark:text-sky-300 border border-[#1a446c]/20 truncate max-w-[240px]">
                          {s.class_title}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                      {s.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                      <span className="inline-flex items-center gap-1.5 bg-white/70 dark:bg-slate-800/60 px-2.5 py-1 rounded-xl border border-white/80 dark:border-slate-700/50">
                        <IconClock className="w-3.5 h-3.5 text-[#1a446c] dark:text-sky-400" />
                        <span>
                          {new Date(s.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {new Date(s.end_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-white/70 dark:bg-slate-800/60 px-2.5 py-1 rounded-xl border border-white/80 dark:border-slate-700/50">
                        <IconSparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>{dur} phút</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-white/70 dark:bg-slate-800/60 px-2.5 py-1 rounded-xl border border-white/80 dark:border-slate-700/50">
                        <IconUsers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{s.enrolled_count ?? 0} học viên</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-white/70 dark:bg-slate-800/60 px-2.5 py-1 rounded-xl border border-white/80 dark:border-slate-700/50">
                        <IconCalendar className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                        <span>{new Date(s.start_time).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                      </span>
                    </div>
                  </div>

                  {/* Teacher Action Controls */}
                  <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
                    {/* Launch / Host meeting button */}
                    <button
                      onClick={() => handleHostMeeting(s)}
                      className={`px-4 sm:px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 ${
                        isLive
                          ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/35 animate-pulse"
                          : "bg-gradient-to-r from-[#17365f] to-[#1a446c] hover:opacity-95 text-white shadow-md shadow-[#1a446c]/20"
                      }`}
                    >
                      <IconVideo className="w-4 h-4" />
                      <span>{isLive ? "Đang Giảng Dạy (Vào Phòng)" : "Mở Phòng Dạy"}</span>
                    </button>

                    {/* Attendance Direct Link */}
                    <button
                      onClick={() => navigate(`/lms/teach/attendance?sessionId=${s.id}`)}
                      className="px-3.5 sm:px-4 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition border border-white/90 dark:border-slate-700 shadow-2xs hover:shadow-sm flex items-center gap-1.5"
                    >
                      <IconChecklist className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Điểm Danh</span>
                    </button>

                    {/* Student Roster Button */}
                    <button
                      onClick={() => handleOpenRoster(s)}
                      className="px-3 py-2.5 rounded-2xl bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition border border-white/90 dark:border-slate-700 shadow-2xs hover:shadow-sm"
                      title="Xem danh sách học viên lớp"
                    >
                      <IconUsers className="w-4 h-4 text-[#1a446c] dark:text-sky-400" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Calendar Grid View */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              className="space-y-2 rounded-3xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-3.5 backdrop-blur-xl shadow-[0_10px_30px_rgba(49,91,125,0.06)]"
            >
              <div className="text-center text-xs font-bold text-[#102f63] dark:text-sky-300 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                {day}
              </div>
              {calGrid[i].length === 0 ? (
                <div className="h-24 rounded-2xl flex items-center justify-center text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  Trống lịch
                </div>
              ) : (
                calGrid[i].map((s) => {
                  const cfg = STATUS_CFG[s._st] || STATUS_CFG.UPCOMING;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleHostMeeting(s)}
                      className="cursor-pointer w-full text-left rounded-2xl border border-white/90 dark:border-slate-800 bg-white/90 dark:bg-slate-950/70 p-2.5 text-[11px] space-y-1.5 transition hover:border-sky-400/80 hover:shadow-sm"
                    >
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      <p className="font-bold text-slate-900 dark:text-white truncate">{s.title}</p>
                      <p className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                        {new Date(s.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: Create Live Session ─────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
            <div className="shrink-0 flex justify-between items-center px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#1a446c] dark:text-sky-400">Giảng viên phụ trách</p>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">Bổ Sung Buổi Dạy Mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <form id="create-live-session-form" onSubmit={handleCreateSessionSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Tiêu Đề Buổi Dạy <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Ôn Tập Thuật Ngữ CSCA Chuyên Sâu & Giải Đề Mẫu"
                  value={sessionForm.title}
                  onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Lớp thuộc khóa học <span className="text-rose-500">*</span></label>
                {liveClasses.length > 0 ? (
                  <select
                    required
                    value={sessionForm.liveClassId}
                    onChange={(e) => {
                      setSessionForm({ ...sessionForm, liveClassId: e.target.value });
                    }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 font-medium"
                  >
                    {liveClasses.map((liveClass) => (
                      <option key={liveClass.id} value={liveClass.id}>{liveClass.title}{liveClass.course_title ? ` — ${liveClass.course_title}` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    Chưa có lớp nào gắn với khóa học. Quản trị viên cần tạo lớp và lịch cố định trước.
                  </div>
                )}
                <p className="mt-1 text-[11px] text-slate-500">Đây là buổi bổ sung, không thay đổi lịch cố định của khóa học.</p>
              </div>

              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/60 dark:bg-sky-950/20 space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Chương học của buổi này</label>
                <select
                  value={chapterMode}
                  onChange={(e) => setChapterMode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {chapters.length > 0 && <option value="existing">Chọn chương đã có</option>}
                  {canManageCurriculum && <option value="new">Thêm chương mới cùng buổi dạy</option>}
                </select>
                {chapterMode === "existing" && chapters.length > 0 ? (
                  <select
                    value={chapterId}
                    onChange={(e) => setChapterId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                ) : !canManageCurriculum ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Admin chưa gán chương hoặc cấp quyền quản lý chương cho bạn ở lớp này.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <input
                      required
                      maxLength={255}
                      value={newChapter.title}
                      onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
                      placeholder="Tên chương"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                    <textarea
                      maxLength={5000}
                      rows={2}
                      value={newChapter.objectives}
                      onChange={(e) => setNewChapter({ ...newChapter, objectives: e.target.value })}
                      placeholder="Mục tiêu học tập (tùy chọn)"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Thời Gian Bắt Đầu <span className="text-rose-500">*</span></label>
                  <input
                    type="datetime-local"
                    required
                    value={sessionForm.startTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, startTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Thời Gian Kết Thúc</label>
                  <input
                    type="datetime-local"
                    value={sessionForm.endTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, endTime: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Link phòng học trực tuyến</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={sessionForm.meetUrl}
                  onChange={(e) => setSessionForm({ ...sessionForm, meetUrl: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-mono outline-none focus:border-sky-500"
                />
              </div>
            </form>

            <div className="shrink-0 px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="create-live-session-form"
                disabled={submittingSession || !sessionForm.liveClassId}
                className="bg-gradient-to-r from-[#17365f] via-[#1a446c] to-emerald-600 hover:from-[#102f63] hover:to-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-md shadow-emerald-700/20"
              >
                {submittingSession ? "Đang lưu..." : "Bổ Sung Buổi Dạy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Student Roster ──────────────────────────────── */}
      {rosterSession && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
            <div className="shrink-0 flex justify-between items-center px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-black text-emerald-600 dark:text-emerald-400">Danh Sách Học Viên Ghi Danh</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{rosterSession.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setRosterSession(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
              {rosterLoading ? (
                <LoadingState message="Đang tải danh sách học viên..." count={4} />
              ) : rosterStudents.length === 0 ? (
                <EmptyState title="Chưa có học viên" message="Lớp này chưa có học viên đang hoạt động." />
              ) : rosterStudents.map((stu, idx) => (
                <div
                  key={stu.id}
                  className="p-3.5 bg-white/70 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex items-center justify-between gap-4 transition hover:bg-white dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 w-5 text-right">{idx + 1}.</span>
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-tr from-sky-400 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                      {stu.avatar_url ? (
                        <img src={stu.avatar_url} alt={stu.username} className="w-full h-full object-cover" />
                      ) : (
                        <span>{(stu.username || stu.email || "?").slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{stu.username || stu.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{stu.email}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/25">
                      Chuyên cần: {stu.attendance_rate || 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex justify-between items-center">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                Tổng cộng: <strong className="text-slate-900 dark:text-white font-bold">{rosterStudents.length}</strong> học viên
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRosterSession(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sId = rosterSession.id;
                    setRosterSession(null);
                    navigate(`/lms/teach/attendance?sessionId=${sId}`);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition shadow-md shadow-emerald-700/20"
                >
                  Chuyển Sang Bảng Điểm Danh →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
