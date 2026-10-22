/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Library,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherDashboardStats, getLiveSessionAccess } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState, PermissionDeniedState } from "../../../components/common/StateView";
import { closeReservedMeeting, getMeetingWindowState, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";
import { getClassCoverImage } from "../../../utils/classWallpapers";

const EMPTY_DATA = {
  stats: {
    activeClassesCount: 0,
    totalStudentsCount: 0,
    pendingGradingCount: 0,
    attendanceRate: 100,
    todaySessionsCount: 0,
  },
  classes: [],
  todaySessions: [],
  pendingSubmissions: [],
  atRiskStudents: [],
  pagination: { page: 1, limit: 8, total: 0, totalPages: 0 },
};

const formatSessionTimeOnly = (value) => {
  if (!value) return "--:--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--:--"
    : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

const TONES_ARRAY = [
  { bar: "bg-sky-500", badge: "bg-sky-50 text-sky-700", button: "bg-sky-600 hover:bg-sky-700" },
  { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", button: "bg-emerald-600 hover:bg-emerald-700" },
  { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700", button: "bg-amber-500 hover:bg-amber-600" },
  { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700", button: "bg-rose-500 hover:bg-rose-600" },
];

export default function TeacherHubPage() {
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const isTeacher = authUser?.role === "creator" || authUser?.role === "admin";
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherDashboardStats({
        status: "all",
        page: 1,
        limit: 12,
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
    if (accessWindow.isTooEarly) {
      return toast("Phòng dạy mở trước giờ bắt đầu 15 phút.", { icon: "⏰" });
    }
    if (accessWindow.isClosed) {
      return toast("Phòng dạy đã đóng sau giờ học 30 phút.");
    }
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) {
        throw new Error("Chưa có link phòng trực tuyến");
      }
      openReservedMeeting(meetingWindow, result.data.meetUrl, {
        sessionId: session.id,
        provider: result.data.provider,
        navigate,
      });
      toast.success("Đang mở phòng dạy");
    } catch (openError) {
      closeReservedMeeting(meetingWindow);
      toast.error(openError.message || "Không thể mở phòng dạy");
    }
  };

  // Lọc lớp theo ô tìm kiếm
  const filteredClasses = useMemo(() => {
    const list = Array.isArray(data.classes) ? data.classes : [];
    const q = search.trim().toLowerCase();
    if (!q) return list;

    return list.filter((item) => {
      const titleMatch = (item.title || "").toLowerCase().includes(q);
      const courseMatch = (item.courseTitle || "").toLowerCase().includes(q);
      const codeMatch = (item.code || "").toLowerCase().includes(q);
      return titleMatch || courseMatch || codeMatch;
    });
  }, [data.classes, search]);

  const displayName = authUser?.fullName || authUser?.username || "Thầy/Cô";

  if (!isTeacher) {
    return (
      <PermissionDeniedState
        title="Không có quyền truy cập"
        message="Khu vực này chỉ dành cho Giảng viên và Quản trị viên."
      />
    );
  }

  return (
    <div className="min-h-full px-3 pb-12 pt-1 sm:px-5 lg:px-6 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-4">
        {/* 1. Tiêu đề Tổng quan giảng dạy (Khắc họa trực tiếp trên nền phong cảnh Á Đông) */}
        <section className="pt-0.5 pb-1">
          <h1 className="font-['Dancing_Script',cursive] text-4xl sm:text-5xl font-extrabold tracking-tight text-[#102f63] drop-shadow-xs">
            Tổng quan giảng dạy
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-semibold italic text-[#244866]">
            “Dạy học là thắp sáng một ngọn lửa, không phải đổ đầy một chiếc bình.”
          </p>
          <p className="mt-0.5 font-['Ma_Shan_Zheng',cursive] text-sm sm:text-base tracking-wider text-[#17365f]">
            —— 学为人师 · 行为世范
          </p>
        </section>

        {/* 2. 4 ô thẻ thống kê (Đồng nhất màu nền kính mờ mềm mại chuẩn phong cách học viên) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Lớp phụ trách",
              value: loading ? "..." : data.stats.activeClassesCount,
              icon: BookOpen,
              to: "/lms/teach/classes",
              iconStyle: "bg-blue-50 text-blue-600",
              subtext: "Đang hoạt động",
            },
            {
              label: "Tổng học viên",
              value: loading ? "..." : data.stats.totalStudentsCount,
              icon: Users,
              to: "/lms/teach/student-progress",
              iconStyle: "bg-violet-50 text-violet-600",
              subtext: "Đang theo học",
            },
            {
              label: "Bài chờ chấm",
              value: loading ? "..." : data.stats.pendingGradingCount,
              icon: ClipboardCheck,
              to: "/lms/teacher/grading",
              iconStyle: "bg-amber-50 text-amber-600",
              subtext: "Nhấn để chấm ngay →",
            },
            {
              label: "Chuyên cần TB",
              value: loading
                ? "..."
                : data.stats.attendanceRate !== null && data.stats.attendanceRate !== undefined
                ? `${data.stats.attendanceRate}%`
                : "—%",
              icon: CheckCircle2,
              to: "/lms/teach/attendance",
              iconStyle: "bg-emerald-50 text-emerald-600",
              subtext: "Tất cả các lớp",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to}
                className="group flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-[0_8px_25px_rgba(32,78,120,0.06)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-sky-300"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconStyle} shadow-2xs`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl sm:text-2xl font-black text-[#102f63] leading-none font-mono">
                    {item.value}
                  </p>
                  <p className="text-xs font-bold text-slate-800 leading-tight mt-1 truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                    {item.subtext}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600 shrink-0" />
              </Link>
            );
          })}
        </section>

        {loading ? (
          <Loading loading={true} text="Đang đồng bộ dữ liệu giảng dạy..." fullScreen={false} className="py-16" />
        ) : error ? (
          <div className="px-4 py-12 sm:px-8">
            <ErrorState title="Chưa thể tải dữ liệu" message={error} onRetry={loadDashboard} />
          </div>
        ) : (
          /* 3. Bố cục 2 cột chính */
          <div className="grid gap-5 xl:grid-cols-12 items-start">
            {/* Cột trái: Lớp đang phụ trách (8/12 cols) */}
            <div className="space-y-3.5 xl:col-span-8">
              {/* Header của danh sách lớp học: tích hợp gọn gàng ô tìm kiếm, không dùng thanh ngang cồng kềnh */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 px-1">
                <div>
                  <h2 className="text-lg font-black text-[#102f63] flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    Lớp đang phụ trách ({data.classes.length})
                  </h2>
                  <p className="mt-0.5 text-xs text-[#487291]">
                    Mỗi thẻ là một lớp học bạn đang quản lý giảng dạy.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative w-48 sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm lớp, khóa học..."
                      aria-label="Tìm kiếm lớp học"
                      className="h-8 w-full rounded-xl border border-white/85 bg-white/90 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 shadow-2xs focus:border-sky-300 focus:bg-white backdrop-blur-md"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={loadDashboard}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/85 bg-white/90 text-sky-700 shadow-2xs hover:bg-white transition"
                    title="Làm mới"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>

                  <Link
                    to="/lms/teach/classes"
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900 transition shrink-0 ml-1"
                  >
                    Xem tất cả <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {filteredClasses.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/90 bg-white/80 px-6 py-14 text-center shadow-sm backdrop-blur">
                  <GraduationCap className="mx-auto h-10 w-10 text-sky-400" />
                  <h3 className="mt-4 text-base font-black text-slate-900">
                    {search ? "Không tìm thấy lớp phù hợp" : "Chưa có lớp nào được phân công"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {search
                      ? "Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc."
                      : "Khi quản trị viên phân công lớp giảng dạy, số liệu sẽ xuất hiện tại đây."}
                  </p>
                </div>
              ) : (
                /* Thẻ lớp học của Giảng viên - Hoàn toàn đồng nhất ảnh nền, phong cách và bố cục với thẻ học viên */
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {filteredClasses.map((item, index) => {
                    const tone = TONES_ARRAY[index % TONES_ARRAY.length];
                    const cover = getClassCoverImage(item, item.id);

                    // Tính toán tiến độ phần trăm chính xác theo buổi học
                    const completedSessions = Number(item.completedSessions || 0);
                    const totalSessions = Number(item.totalSessions || 0);
                    const progressPercent = totalSessions > 0
                      ? Math.min(100, Math.round((completedSessions / totalSessions) * 100))
                      : Math.min(100, Math.max(0, Math.round(Number(item.progressPct || 0))));
                    const isCompleted = progressPercent === 100;

                    return (
                      <article
                        key={item.id}
                        className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/85 bg-white shadow-[0_8px_24px_rgba(45,87,122,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(45,87,122,0.18)] hover:border-sky-300"
                      >
                        {/* Banner ảnh phong cảnh Á Đông CSCA - Đồng nhất 100% với ô học viên */}
                        <div className="relative h-28 sm:h-32 w-full overflow-hidden bg-sky-100">
                          <img
                            src={cover}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = "/student-campus-spring.webp";
                            }}
                            alt={item.title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#102f63]/85 via-transparent to-white/10" />

                          {/* Huy hiệu trạng thái trên góc trái */}
                          <span
                            className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black shadow-xs ${
                              item.isLiveNow
                                ? "bg-rose-500 text-white animate-pulse"
                                : tone.badge
                            }`}
                          >
                            {item.isLiveNow ? <Video className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
                            {item.isLiveNow ? "Đang Live" : "Hoạt động"}
                          </span>

                          {/* Mã lớp trên góc phải */}
                          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#102f63]/75 backdrop-blur-md px-2 py-0.5 text-[9px] font-black text-white border border-white/20">
                            {item.code || `LIVE-${item.id}`}
                          </span>

                          {/* Tiêu đề khóa & lớp nổi bật trên nền ảnh */}
                          <div className="absolute inset-x-2.5 bottom-2.5">
                            <p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/85">
                              {item.courseTitle || "Khóa học CSCA"}
                            </p>
                            <h3 className="mt-0.5 line-clamp-1 text-sm sm:text-base font-black text-white drop-shadow">
                              {item.title}
                            </h3>
                          </div>
                        </div>

                        {/* Thân thẻ lớp học */}
                        <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1">
                          {/* Hàng thông tin Giảng viên phụ trách & Sĩ số học viên */}
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 shadow-2xs">
                                <UserRound className="h-3.5 w-3.5" />
                              </span>
                              <div className="min-w-0">
                                <span className="block text-[9px] text-slate-400 font-medium">Giảng viên phụ trách</span>
                                <span className="block truncate text-xs font-bold text-slate-800">
                                  {item.instructor_name || item.teacherDisplayName || displayName}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-[#102f63] bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100 shrink-0 font-mono">
                              {item.totalStudents || 0} học viên
                            </span>
                          </div>

                          {/* Hàng tiến độ buổi học & thanh % hoàn thành */}
                          <div className="mt-2.5">
                            <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold">
                              <span className="text-slate-500 font-medium">
                                {totalSessions > 0
                                  ? `${completedSessions}/${totalSessions} buổi học`
                                  : "Tiến độ buổi học"}
                              </span>
                              <span className="font-black text-[#17365f] font-mono">
                                {progressPercent}%
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isCompleted ? "bg-emerald-500" : tone.bar
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Nút hành động Vào lớp học */}
                          <div className="mt-3">
                            <Link
                              to={`/lms/teach/classes/${item.id}`}
                              className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white shadow-xs transition hover:brightness-105 ${tone.button}`}
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>Vào lớp học</span>
                              <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cột phải: Buổi dạy hôm nay & Tiện ích giảng dạy (4/12 cols) */}
            <div className="space-y-4 xl:col-span-4">
              {/* Buổi dạy hôm nay */}
              <section className="rounded-3xl border border-white/80 bg-white/90 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-[#102f63] flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-rose-500" />
                    Buổi dạy hôm nay ({data.todaySessions.length})
                  </h3>
                  <Link
                    to="/lms/teach/calendar"
                    className="text-[11px] font-bold text-sky-700 hover:underline"
                  >
                    Xem lịch dạy
                  </Link>
                </div>

                {data.todaySessions.length === 0 ? (
                  <p className="rounded-2xl bg-sky-50/50 border border-sky-100 px-4 py-8 text-center text-xs text-slate-500">
                    Hôm nay không có buổi học trực tuyến nào diễn ra.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {data.todaySessions.map((session) => {
                      const accessWindow = getMeetingWindowState(session);
                      return (
                        <div
                          key={session.id}
                          className="group relative overflow-hidden rounded-2xl border border-sky-100 bg-white/90 p-3 flex items-center justify-between gap-3 shadow-2xs hover:border-sky-300 transition"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">
                              {session.title}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              Lớp: {session.className}
                            </p>
                            <p className="text-[11px] text-blue-600 font-bold mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatSessionTimeOnly(session.startTime)} - {formatSessionTimeOnly(session.endTime)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openLiveRoom(session)}
                            disabled={!accessWindow.isOpen}
                            className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 transition-all duration-200 hover:scale-105 shrink-0 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none disabled:hover:scale-100"
                            title={
                              accessWindow.isOpen
                                ? "Vào phòng dạy"
                                : accessWindow.isClosed
                                ? "Phòng đã đóng sau giờ học 30 phút"
                                : "Phòng mở trước giờ dạy 15 phút"
                            }
                          >
                            <Video className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Bài chờ chấm nhanh */}
              <section className="rounded-3xl border border-white/80 bg-white/90 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-[#102f63] flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-amber-500" />
                    Bài nộp chờ chấm ({data.pendingSubmissions.length})
                  </h3>
                  <Link
                    to="/lms/teacher/grading"
                    className="text-[11px] font-bold text-sky-700 hover:underline"
                  >
                    Xem tất cả
                  </Link>
                </div>

                {data.pendingSubmissions.length === 0 ? (
                  <p className="rounded-2xl bg-amber-50/40 border border-amber-100/60 px-4 py-7 text-center text-xs text-slate-500">
                    Tất cả bài tập đã được chấm xong! ✨
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.pendingSubmissions.slice(0, 4).map((sub) => (
                      <Link
                        key={sub.id}
                        to={`/lms/teacher/grading?submissionId=${sub.id}`}
                        className="group flex items-center justify-between gap-2 py-2.5 hover:bg-slate-50/80 px-1 rounded-xl transition"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600">
                            {sub.assignmentTitle}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {sub.studentName} · {sub.className}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Chờ chấm
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Phím tắt tiện ích nhanh */}
              <section className="rounded-3xl border border-white/80 bg-white/90 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#487291] mb-3">
                  Tiện ích nhanh
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Lịch dạy", to: "/lms/teach/calendar", icon: CalendarDays },
                    { label: "Điểm danh", to: "/lms/teach/attendance", icon: Users },
                    { label: "Bảng lương", to: "/lms/teach/salary", icon: Wallet },
                    { label: "Ngân hàng đề", to: "/lms/teach/question-bank", icon: Library },
                  ].map((act) => {
                    const Icon = act.icon;
                    return (
                      <Link
                        key={act.label}
                        to={act.to}
                        className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/90 p-2.5 shadow-2xs transition hover:-translate-y-0.5 hover:shadow-sm"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-[11px] font-bold text-slate-800 truncate">
                          {act.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>

              {/* Thẻ châm ngôn Á Đông CSCA */}
              <section
                className="relative min-h-[190px] overflow-hidden rounded-3xl bg-cover bg-center shadow-[0_12px_38px_rgba(56,96,130,0.16)] flex flex-col justify-between p-5 text-center"
                style={{ backgroundImage: "url('/student-campus-spring.webp')" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/20 to-[#17365f]/50" />
                <div className="relative z-10 flex min-h-[160px] flex-col items-center justify-between">
                  <p className="font-['Ma_Shan_Zheng',cursive] text-2xl leading-tight text-[#102f63]">
                    春华秋实<br />桃李满园
                  </p>
                  <div className="w-full rounded-2xl border border-white/70 bg-white/85 px-3 py-2 text-[10px] italic text-[#17365f] shadow-sm backdrop-blur">
                    “Mỗi hạt mầm tri thức gieo xuống hôm nay sẽ nở hoa rực rỡ vào ngày mai.”
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
