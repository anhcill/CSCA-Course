import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  createLiveSession,
  fetchLiveClassRoster,
  fetchLiveClasses,
  fetchMyLiveSchedule,
  getLiveSessionAccess,
} from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

/* ── SVG Icons ───────────────────────────────────────────────── */
const IconVideo = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);
const IconClock = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
  </svg>
);
const IconUsers = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconCalendar = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const IconChecklist = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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
  LIVE:     { label: "ĐANG DẠY LIVE",    cls: "bg-rose-500/20 text-rose-400 border-rose-500/40", dot: true },
  IMMINENT: { label: "CHUẨN BỊ MỞ LỚP",  cls: "bg-amber-500/20 text-amber-400 border-amber-500/40", dot: true },
  TODAY:    { label: "LỊCH HÔM NAY",      cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  UPCOMING: { label: "SẮP DIỄN RA",     cls: "bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600/40" },
  ENDED:    { label: "ĐÃ HOÀN THÀNH",   cls: "bg-slate-100 dark:bg-slate-800/60 text-slate-500 border-slate-200 dark:border-slate-700/40" },
};

const WEEKDAYS = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export default function TeacherSchedulePage() {
  const navigate = useNavigate();

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

  // Refresh silently so timetable edits made by an administrator in another
  // browser are visible to the teacher without a manual reload.
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
        openReservedMeeting(meetingWindow, r.data.meetUrl);
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

      await createLiveSession({
        liveClassId,
        title: sessionForm.title.trim(),
        startTime,
        endTime,
        meetUrl: sessionForm.meetUrl || undefined,
        status: "scheduled",
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-16">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <span>Khu Vực Giảng Viên • Teacher Hub</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Quản Lý Lịch Dạy & Lớp Học Live
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-xs md:text-sm mt-1">
              Khởi tạo buổi học Meet/Zoom, mở phòng giảng dạy trực tuyến và theo dõi học viên theo từng lớp.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/lms/teacher/attendance"
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition border border-slate-300 dark:border-slate-700 flex items-center gap-2"
            >
              <IconChecklist />
              <span>Bảng Điểm Danh</span>
            </Link>

            <button
              id="create-session-btn"
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30 flex items-center gap-2"
            >
              <span>+</span>
              <span>Tạo Buổi Dạy Mới</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Tổng số buổi dạy", value: stats.total, color: "text-slate-900 dark:text-white" },
            { label: "Đang diễn ra Live", value: stats.live, color: "text-rose-500 dark:text-rose-400" },
            { label: "Đã hoàn thành", value: stats.done, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Buổi dạy sắp tới", value: stats.upcoming, color: "text-amber-500 dark:text-amber-400" },
          ].map((st) => (
            <div key={st.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center shadow-sm">
              <p className={`text-2xl font-black ${st.color}`}>{st.value}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">{st.label}</p>
            </div>
          ))}
        </div>

        {/* Filter and View Toggles */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="flex gap-2 flex-wrap">
            {[
              { id: "ALL", label: "Tất Cả Buổi Dạy" },
              { id: "LIVE", label: "Đang Dạy Live 🔴" },
              { id: "TODAY", label: "Hôm Nay" },
              { id: "WEEK", label: "Tuần Này" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  filter === f.id
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "list" ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Danh Sách
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "calendar" ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Lịch Tuần
            </button>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <LoadingState message="Đang nạp lịch giảng dạy của giáo viên..." count={3} />
        ) : errorMessage ? (
          <ErrorState title="Lỗi Tải Lịch Dạy" message={errorMessage} onRetry={loadSchedule} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Chưa Có Buổi Dạy Nào"
            message="Bạn chưa có buổi học trực tuyến nào trong bộ lọc này. Hãy lên lịch buổi học đầu tiên!"
            actionLabel="+ Tạo Buổi Dạy Ngay"
            onAction={() => setShowCreateModal(true)}
          />
        ) : viewMode === "list" ? (
          <div className="space-y-4">
            {filtered.map((s) => {
              const cfg = STATUS_CFG[s._st] || STATUS_CFG.UPCOMING;
              const isLive = s._st === "LIVE";
              const dur = s.start_time && s.end_time ? Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000) : 90;

              return (
                <div
                  key={s.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-5 md:p-6 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm ${
                    isLive ? "border-emerald-500/60 shadow-lg shadow-emerald-500/10 bg-gradient-to-r from-emerald-50/50 to-white dark:from-slate-900 dark:to-emerald-950/20" : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Session Info */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold border ${cfg.cls}`}>
                          {cfg.dot && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                          {cfg.label}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {s.provider || "Google Meet"}
                        </span>
                        {s.class_title && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20 truncate max-w-[220px]">
                            {s.class_title}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white truncate">
                        {s.title}
                      </h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
                        <span className="inline-flex items-center gap-1.5">
                          <IconClock />
                          <span>
                            {new Date(s.start_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(s.end_time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <IconClock />
                          <span>{dur} phút</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <IconUsers />
                          <span>{s.enrolled_count ?? 0} học viên</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <IconCalendar />
                          <span>{new Date(s.start_time).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                        </span>
                      </div>
                    </div>

                    {/* Teacher Action Controls */}
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      {/* Host Meet/Zoom Controller Button */}
                      <button
                        onClick={() => handleHostMeeting(s)}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
                          isLive
                            ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 animate-pulse"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
                        }`}
                      >
                        <IconVideo />
                        <span>{isLive ? "Đang Giảng Dạy (Vào Phòng)" : "Mở Phòng Dạy"}</span>
                      </button>

                      {/* Attendance Direct Link */}
                      <button
                        onClick={() => navigate(`/lms/teacher/attendance?sessionId=${s.id}`)}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition border border-slate-300 dark:border-slate-700 flex items-center gap-1.5"
                      >
                        <IconChecklist />
                        <span>Điểm Danh</span>
                      </button>

                      {/* Student Roster Button */}
                      <button
                        onClick={() => handleOpenRoster(s)}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition border border-slate-300 dark:border-slate-700"
                        title="Xem danh sách học viên lớp"
                      >
                        <IconUsers />
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
              <div key={day} className="space-y-2 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/70 rounded-2xl p-3 shadow-sm">
                <div className="text-center text-xs font-bold text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
                  {day}
                </div>
                {calGrid[i].length === 0 ? (
                  <div className="h-24 rounded-xl flex items-center justify-center text-[10px] text-slate-400 dark:text-slate-600">
                    Trống
                  </div>
                ) : (
                  calGrid[i].map((s) => {
                    const cfg = STATUS_CFG[s._st] || STATUS_CFG.UPCOMING;
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleHostMeeting(s)}
                        className="cursor-pointer w-full text-left bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-[11px] space-y-1 transition hover:border-emerald-500/50"
                      >
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{s.title}</p>
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
      </div>

      {/* Modal: Create Live Session */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-lg w-full shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
            <div className="shrink-0 flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Bổ Sung Buổi Dạy</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 text-base transition"
              >
                ✕
              </button>
            </div>

            <form id="create-live-session-form" onSubmit={handleCreateSessionSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tiêu Đề Buổi Dạy</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Ôn Tập Thuật Ngữ CSCA Chuyên Sâu & Giải Đề Mẫu"
                  value={sessionForm.title}
                  onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Lớp thuộc khóa học</label>
                {liveClasses.length > 0 ? (
                  <select
                    required
                    value={sessionForm.liveClassId}
                    onChange={(e) => {
                      setSessionForm({ ...sessionForm, liveClassId: e.target.value });
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
                <p className="mt-1 text-[10px] text-slate-500">Đây là buổi bổ sung, không thay đổi lịch cố định của khóa học.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời Gian Bắt Đầu</label>
                  <input
                    type="datetime-local"
                    required
                    value={sessionForm.startTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, startTime: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời Gian Kết Thúc</label>
                  <input
                    type="datetime-local"
                    value={sessionForm.endTime}
                    onChange={(e) => setSessionForm({ ...sessionForm, endTime: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Link Phòng Học (Meet / Zoom URL)</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={sessionForm.meetUrl}
                  onChange={(e) => setSessionForm({ ...sessionForm, meetUrl: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </form>

            <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="create-live-session-form"
                disabled={submittingSession || !sessionForm.liveClassId}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-emerald-600/30"
              >
                {submittingSession ? "Đang lưu..." : "Bổ Sung Buổi Dạy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Student Roster */}
      {rosterSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
            <div className="shrink-0 flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">Danh Sách Học Viên Ghi Danh</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{rosterSession.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setRosterSession(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 text-base transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {rosterLoading ? (
                <LoadingState message="Đang tải danh sách học viên..." count={4} />
              ) : rosterStudents.length === 0 ? (
                <EmptyState title="Chưa có học viên" message="Lớp này chưa có học viên đang hoạt động." />
              ) : rosterStudents.map((stu, idx) => (
                <div
                  key={stu.id}
                  className="p-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{idx + 1}.</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                      {stu.avatar_url ? (
                        <img src={stu.avatar_url} alt={stu.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300">
                          {(stu.username || stu.email || "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{stu.username || stu.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{stu.email}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Chuyên cần: {stu.attendance_rate || 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur flex justify-between items-center">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                Tổng cộng: <strong className="text-slate-900 dark:text-white">{rosterStudents.length}</strong> học viên
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRosterSession(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sId = rosterSession.id;
                    setRosterSession(null);
                    navigate(`/lms/teacher/attendance?sessionId=${sId}`);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md shadow-emerald-600/30"
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
