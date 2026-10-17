import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Users,
  Video,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherDashboardStats, getLiveSessionAccess } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState, PermissionDeniedState } from "../../../components/common/StateView";
import { closeReservedMeeting, getMeetingWindowState, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

const EMPTY_DATA = {
  stats: {
    activeClassesCount: 0,
    totalStudentsCount: 0,
    pendingGradingCount: 0,
    attendanceRate: 0,
    todaySessionsCount: 0,
  },
  classes: [],
  todaySessions: [],
  pendingSubmissions: [],
  pagination: { page: 1, limit: 8, total: 0, totalPages: 0 },
};

const TEACHER_CLASS_THEMES = [
  {
    topBar: "from-blue-500 via-indigo-500 to-sky-500",
    codeBadge: "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-sky-300 ring-1 ring-blue-200/60 dark:ring-blue-800/60",
    studentBox: "bg-blue-50/50 dark:bg-blue-950/30 border-blue-100/60 dark:border-blue-900/40",
    studentText: "text-blue-700 dark:text-sky-300",
    glow: "from-blue-500/10 to-indigo-500/5",
    borderHover: "hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-blue-500/10",
    buttonBg: "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20",
  },
  {
    topBar: "from-purple-500 via-fuchsia-500 to-pink-500",
    codeBadge: "bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 ring-1 ring-purple-200/60 dark:ring-purple-800/60",
    studentBox: "bg-purple-50/50 dark:bg-purple-950/30 border-purple-100/60 dark:border-purple-900/40",
    studentText: "text-purple-700 dark:text-purple-300",
    glow: "from-purple-500/10 to-fuchsia-500/5",
    borderHover: "hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-purple-500/10",
    buttonBg: "bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white shadow-purple-500/20",
  },
  {
    topBar: "from-emerald-500 via-teal-500 to-cyan-500",
    codeBadge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 ring-1 ring-emerald-200/60 dark:ring-emerald-800/60",
    studentBox: "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-100/60 dark:border-emerald-900/40",
    studentText: "text-emerald-700 dark:text-emerald-300",
    glow: "from-emerald-500/10 to-teal-500/5",
    borderHover: "hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-emerald-500/10",
    buttonBg: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/20",
  },
  {
    topBar: "from-amber-400 via-orange-500 to-rose-500",
    codeBadge: "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-800/60",
    studentBox: "bg-amber-50/50 dark:bg-amber-950/30 border-amber-100/60 dark:border-amber-900/40",
    studentText: "text-amber-700 dark:text-amber-300",
    glow: "from-amber-500/10 to-orange-500/5",
    borderHover: "hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-amber-500/10",
    buttonBg: "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-orange-500/20",
  },
];

const formatDateTime = (value, fallback = "Chưa có lịch") => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function TeacherHubPage() {
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const isTeacher = authUser?.role === "creator" || authUser?.role === "admin";
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherDashboardStats({
        status: "all",
        page: 1,
        limit: 8,
      });
      const nextData = { ...EMPTY_DATA, ...(response?.data || {}) };
      setData(nextData);
    } catch (loadError) {
      setError(loadError.message || "Không thể tải bảng điều khiển giảng viên");
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTeacher) loadDashboard();
  }, [isTeacher, loadDashboard]);

  const openLiveRoom = async (session) => {
    const accessWindow = getMeetingWindowState(session);
    if (accessWindow.isTooEarly) return toast("Phòng dạy mở trước giờ bắt đầu 15 phút.", { icon: "⏰" });
    if (accessWindow.isClosed) return toast("Phòng dạy đã đóng sau giờ học 30 phút.");
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) throw new Error("Chưa có link phòng trực tuyến");
      openReservedMeeting(meetingWindow, result.data.meetUrl, {
        sessionId: session.id,
        provider: result.data.provider,
        navigate,
      });
      toast.success("Đang mở phòng học");
    } catch (openError) {
      closeReservedMeeting(meetingWindow);
      toast.error(openError.message || "Không thể mở phòng học");
    }
  };

  if (!isTeacher) {
    return <PermissionDeniedState title="Không có quyền truy cập" message="Khu vực này chỉ dành cho Giảng viên và Quản trị viên." />;
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-5 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="mx-auto max-w-7xl space-y-3.5">
        {/* Header & KPI Thống kê gộp chung, nhỏ gọn */}
        <section className="overflow-hidden rounded-2xl border border-blue-100 dark:border-slate-800 bg-gradient-to-r from-[#eaf4ff] via-white to-[#f3f8ff] dark:from-slate-900 dark:via-slate-900/95 dark:to-blue-950/30 p-3 sm:p-4 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-center">
            {/* Cột trái: Tiêu đề & mô tả */}
            <div className="lg:col-span-5 space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-sky-300 shadow-xs ring-1 ring-blue-100 dark:ring-slate-700">
                <Users className="h-3 w-3" /> Bàn làm việc giảng viên
              </span>
              <h1 className="text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-xl">
                Tổng quan giảng dạy
              </h1>
            </div>

            {/* Cột phải: 4 ô thống kê nhỏ gọn */}
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["Lớp đang phụ trách", loading ? "..." : data.stats.activeClassesCount, Users, "text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-blue-950/60"],
                ["Tổng học viên", loading ? "..." : data.stats.totalStudentsCount, BookOpen, "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/60"],
                ["Bài chờ chấm", loading ? "..." : data.stats.pendingGradingCount, ClipboardCheck, "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60"],
                ["Chuyên cần TB", loading ? "..." : `${data.stats.attendanceRate}%`, CheckCircle2, "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60"],
              ].map(([label, value, Icon, iconStyle]) => (
                <div key={label} className="flex items-center gap-2 rounded-xl bg-white/90 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 p-2 sm:p-2.5 shadow-xs">
                  <div className={`flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">{value}</p>
                    <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {loading ? (
          <Loading loading={true} text="Đang đồng bộ dữ liệu giảng dạy..." fullScreen={false} className="py-12" />
        ) : error ? (
          <ErrorState title="Chưa thể tải dữ liệu" message={error} onRetry={loadDashboard} />
        ) : (
          <>

            {/* Danh sách lớp phụ trách */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600 dark:text-sky-400" /> Lớp đang phụ trách
                  </h2>
                </div>

                <Link to="/lms/teach/calendar" className="text-xs font-bold text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline">
                  Mở lịch dạy <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {data.classes.length === 0 ? (
                <EmptyState icon={BookOpen} title="Chưa có lớp được phân công" description="Khi quản trị viên phân công lớp, số liệu sẽ xuất hiện tại đây." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.classes.map((item, index) => {
                    const theme = TEACHER_CLASS_THEMES[index % TEACHER_CLASS_THEMES.length];
                    return (
                      <article
                        key={item.id}
                        className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${theme.borderHover}`}
                      >
                        {/* Top Colorful Accent Strip */}
                        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${theme.topBar}`} />

                        {/* Soft Background Glow */}
                        <div
                          className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${theme.glow} blur-xl`}
                        />

                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${theme.codeBadge}`}>
                            {item.code || "LỚP"}
                          </span>
                          {item.isLiveNow ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 ring-1 ring-rose-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                              Đang live
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {item.status || "Hoạt động"}
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-sm font-black text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-sky-400 transition-colors">
                            {item.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                            {item.courseTitle || "Lớp trực tuyến"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className={`rounded-xl p-2.5 border ${theme.studentBox}`}>
                            <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Học viên</p>
                            <p className={`font-black text-sm mt-0.5 ${theme.studentText}`}>{item.totalStudents}</p>
                          </div>
                          <div className="rounded-xl p-2.5 border bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-100/60 dark:border-emerald-900/40">
                            <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Chuyên cần</p>
                            <p className="font-black text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">{item.attendanceRate ?? "—"}%</p>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{item.nextSession ? formatDateTime(item.nextSession) : "Chưa có session kế tiếp"}</span>
                        </div>

                        <Link
                          to={`/lms/teach/classes/${item.id}`}
                          className={`w-full inline-flex justify-center items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm ${theme.buttonBg}`}
                        >
                          Quản lý lớp <ArrowRight className="w-3.5 h-3.5 transition group-hover:translate-x-1" />
                        </Link>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Session hôm nay */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-sm">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600 dark:text-sky-400" /> Buổi dạy hôm nay ({data.todaySessions.length})
              </h2>
              {data.todaySessions.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Hôm nay không có buổi dạy" description="Không có buổi học trực tuyến nào diễn ra hôm nay." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {data.todaySessions.map((session) => {
                    const accessWindow = getMeetingWindowState(session);
                    return (
                    <div
                      key={session.id}
                      className="group relative overflow-hidden rounded-2xl border border-blue-100 dark:border-slate-800 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/60 p-3.5 flex items-center justify-between gap-3 shadow-xs hover:border-blue-300 dark:hover:border-slate-700 transition"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                      <div className="min-w-0 pl-1.5">
                        <p className="text-sm font-black text-slate-900 dark:text-white truncate">{session.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{session.className}</p>
                        <p className="text-[11px] text-blue-600 dark:text-sky-400 font-bold mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(session.startTime)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openLiveRoom(session)}
                        disabled={!accessWindow.isOpen}
                        className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 transition-all duration-200 hover:scale-105 shrink-0 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none disabled:hover:scale-100"
                        title={accessWindow.isOpen ? "Vào phòng dạy" : accessWindow.isClosed ? "Phòng đã đóng sau giờ học 30 phút" : "Phòng mở trước giờ dạy 15 phút"}
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
