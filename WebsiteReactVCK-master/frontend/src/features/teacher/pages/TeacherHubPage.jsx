import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

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

const formatDateTime = (value, fallback = "Chưa có lịch") => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function TeacherHubPage() {
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
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) throw new Error("Chưa có link phòng trực tuyến");
      openReservedMeeting(meetingWindow, result.data.meetUrl);
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
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                Ưu tiên các buổi học trực tuyến hôm nay, chấm bài nộp và quản lý các lớp phụ trách.
              </p>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sĩ số, tiến độ, chuyên cần và session kế tiếp.</p>
                </div>
                <Link to="/lms/teach/calendar" className="text-xs font-bold text-blue-600 dark:text-sky-400 inline-flex items-center gap-1 hover:underline">
                  Mở lịch dạy <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {data.classes.length === 0 ? (
                <EmptyState icon={BookOpen} title="Chưa có lớp được phân công" description="Khi quản trị viên phân công lớp, số liệu sẽ xuất hiện tại đây." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {data.classes.map((item) => (
                    <article key={item.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700 rounded-2xl p-3.5 space-y-2.5 transition shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.code || "LỚP"}
                        </span>
                        <span className={`text-[10px] font-bold ${item.isLiveNow ? "text-rose-500 animate-pulse" : "text-slate-500"}`}>
                          {item.isLiveNow ? "● Đang live" : item.status}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{item.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{item.courseTitle || "Lớp trực tuyến"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-2 border border-slate-100 dark:border-transparent">
                          <p className="text-slate-500 text-[11px]">Học viên</p>
                          <p className="font-bold text-slate-900 dark:text-white mt-0.5">{item.totalStudents}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-2 border border-slate-100 dark:border-transparent">
                          <p className="text-slate-500 text-[11px]">Chuyên cần</p>
                          <p className="font-bold text-emerald-600 mt-0.5">{item.attendanceRate ?? "—"}%</p>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {item.nextSession ? formatDateTime(item.nextSession) : "Chưa có session kế tiếp"}
                      </div>
                      <Link
                        to={`/lms/teach/classes/${item.id}`}
                        className="w-full inline-flex justify-center items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold text-white transition shadow-sm"
                      >
                        Quản lý lớp <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </article>
                  ))}
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
                  {data.todaySessions.map((session) => (
                    <div key={session.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{session.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{session.className}</p>
                        <p className="text-[11px] text-blue-600 dark:text-sky-400 font-semibold mt-1">
                          {formatDateTime(session.startTime)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openLiveRoom(session)}
                        className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
                        title="Vào phòng dạy"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
