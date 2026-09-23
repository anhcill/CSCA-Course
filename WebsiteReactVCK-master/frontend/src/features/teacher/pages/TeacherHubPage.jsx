import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Filter,
  RefreshCw,
  Users,
  Video,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { fetchTeacherDashboardStats } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from "../../../components/common/StateView";

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
  atRiskStudents: [],
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

const formatRelative = (value) => {
  if (!value) return "Chưa có hoạt động";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có hoạt động";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Vừa cập nhật";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

const riskLabel = { danger: "Báo động", warning: "Cần theo dõi" };

export default function TeacherHubPage() {
  const { authUser } = useAuthContext();
  const isTeacher = authUser?.role === "creator" || authUser?.role === "admin";
  const [data, setData] = useState(EMPTY_DATA);
  const [classOptions, setClassOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [classFilter, setClassFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingPage, setPendingPage] = useState(1);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchTeacherDashboardStats({
        classId: classFilter === "all" ? undefined : classFilter,
        status: statusFilter,
        page: pendingPage,
        limit: 8,
      });
      const nextData = { ...EMPTY_DATA, ...(response?.data || {}) };
      setData(nextData);
      if (classFilter === "all") setClassOptions(nextData.classes || []);
    } catch (loadError) {
      setError(loadError.message || "Không thể tải bảng điều khiển giảng viên");
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, [classFilter, pendingPage, statusFilter]);

  useEffect(() => {
    if (isTeacher) loadDashboard();
  }, [isTeacher, loadDashboard]);

  const filteredRiskStudents = useMemo(
    () => (data.atRiskStudents || []).filter((student) => riskFilter === "all" || student.riskLevel === riskFilter),
    [data.atRiskStudents, riskFilter],
  );

  const resetFilters = () => {
    setClassFilter("all");
    setRiskFilter("all");
    setStatusFilter("all");
    setPendingPage(1);
  };

  const openLiveRoom = (session) => {
    if (!session.meetUrl) {
      toast.error("Session này chưa có đường dẫn phòng học");
      return;
    }
    window.open(session.meetUrl, "_blank", "noopener,noreferrer");
  };

  if (!isTeacher) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 flex items-center justify-center">
        <div className="max-w-md w-full">
          <PermissionDeniedState
            title="Yêu cầu quyền giảng viên"
            message="Chỉ giáo viên phụ trách lớp hoặc quản trị viên mới có quyền vào Teacher Hub."
            redirectPath="/lms/my-learning"
          />
        </div>
      </div>
    );
  }

  const stats = data.stats || EMPTY_DATA.stats;
  const totalPages = Number(data.pagination?.totalPages || 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-emerald-500/20 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/25 mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Trung tâm giảng dạy CSCA LMS
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">Bảng điều khiển giảng viên</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-2 max-w-3xl">
              Số liệu được tổng hợp từ lớp phụ trách, session Live, tiến độ học tập và hàng chờ chấm bài của bạn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadDashboard} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm">
              <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Làm mới
            </button>
            <Link to="/lms/teacher/schedule" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm">
              <CalendarDays className="w-4 h-4 text-sky-600 dark:text-sky-400" /> Thời khóa biểu
            </Link>
            <Link to="/lms/teacher/grading" className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/25">
              <ClipboardCheck className="w-4 h-4" /> Chấm bài ({Number(stats.pendingGradingCount || 0)})
            </Link>
          </div>
        </div>

        {loading ? (
          <LoadingState type="list" count={4} message="Đang tổng hợp dữ liệu Teacher Hub..." />
        ) : error ? (
          <ErrorState title="Không thể tải Teacher Hub" message={error} onRetry={loadDashboard} />
        ) : null}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                ["Lớp đang phụ trách", `${Number(stats.activeClassesCount || 0)} lớp`, Video, "text-emerald-600 dark:text-emerald-400"],
                ["Học viên đang học", `${Number(stats.totalStudentsCount || 0)} học viên`, Users, "text-blue-600 dark:text-blue-400"],
                ["Bài chờ chấm", `${Number(stats.pendingGradingCount || 0)} bài`, ClipboardCheck, "text-amber-600 dark:text-amber-400"],
                ["Chuyên cần trung bình", `${Number(stats.attendanceRate || 0)}%`, Award, "text-purple-600 dark:text-purple-400"],
                ["Session hôm nay", `${Number(stats.todaySessionsCount || 0)} session`, CalendarDays, "text-sky-600 dark:text-sky-400"],
              ].map(([label, value, Icon, color]) => (
                <div key={label} className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-2 shadow-sm">
                  <div className={`flex items-center justify-between ${color}`}>
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">{value}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Dữ liệu hiện tại</p>
                </div>
              ))}
            </div>

            <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Lớp đang phụ trách</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sĩ số, tiến độ, chuyên cần và session kế tiếp theo dữ liệu thật.</p>
                </div>
                <Link to="/lms/teacher/schedule" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline">Mở lịch dạy <ArrowRight className="w-3.5 h-3.5" /></Link>
              </div>
              {data.classes.length === 0 ? (
                <EmptyState icon={BookOpen} title="Chưa có lớp được phân công" description="Dashboard không dùng dữ liệu demo. Khi quản trị viên phân công lớp, số liệu sẽ xuất hiện tại đây." actionLabel="Mở thời khóa biểu" actionTo="/lms/teacher/schedule" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.classes.map((item) => (
                    <article key={item.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 hover:border-emerald-500/40 rounded-2xl p-5 space-y-4 transition shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/10 font-mono">{item.code}</span>
                        <span className={`text-[10px] font-bold ${item.isLiveNow ? "text-rose-500 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>{item.isLiveNow ? "● Đang live" : item.status}</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">{item.title}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.courseTitle || "Lớp trực tuyến"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-transparent"><p className="text-slate-500 dark:text-slate-400">Học viên</p><p className="font-mono font-bold text-slate-900 dark:text-white mt-1">{item.totalStudents}</p></div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-transparent"><p className="text-slate-500 dark:text-slate-400">Chuyên cần</p><p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">{item.attendanceRate === null ? "—" : `${item.attendanceRate}%`}</p></div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400"><span>Tiến độ chương trình</span><span className="font-mono text-slate-900 dark:text-white">{item.progressPct === null ? "—" : `${item.progressPct}%`}</span></div>
                        <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, item.progressPct || 0))}%` }} /></div>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{item.nextSession ? formatDateTime(item.nextSession) : "Chưa có session kế tiếp"}</div>
                      <Link to={`/lms/teacher/classes/${item.id}`} className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white border border-slate-300 dark:border-white/10 transition">Quản lý lớp <ArrowRight className="w-3.5 h-3.5" /></Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-slate-900/80 border border-sky-200 dark:border-sky-500/20 rounded-3xl p-6 sm:p-8 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-sky-200 dark:border-sky-500/20 pb-4">
                <div><h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><CalendarDays className="w-5 h-5 text-sky-600 dark:text-sky-400" /> Session hôm nay</h2><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Các phòng học thuộc lớp bạn phụ trách trong ngày hiện tại.</p></div>
              </div>
              {data.todaySessions.length === 0 ? <EmptyState icon={CalendarDays} title="Hôm nay chưa có session" description="Không có buổi học nào được lên lịch trong ngày hôm nay." /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {data.todaySessions.map((session) => <div key={session.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm"><div><p className="text-sm font-bold text-slate-900 dark:text-white">{session.title}</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{session.className}</p><p className="text-[11px] text-sky-600 dark:text-sky-300 font-mono mt-2">{formatDateTime(session.startTime)} — {new Date(session.endTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p></div><button type="button" onClick={() => openLiveRoom(session)} className="shrink-0 p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white" title="Mở phòng học"><Video className="w-4 h-4" /></button></div>)}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-slate-900/80 border border-amber-200 dark:border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-amber-200 dark:border-amber-500/20 pb-4">
                <div><h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /> Học viên cần hỗ trợ</h2><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cảnh báo được tính từ chuyên cần, tiến độ, điểm và bài quá hạn; không có dữ liệu mẫu.</p></div>
                <div className="flex flex-wrap gap-2">
                  <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPendingPage(1); }} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200"><option value="all">Tất cả lớp</option>{classOptions.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1"><Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />{[["all", "Tất cả"], ["danger", "Báo động"], ["warning", "Theo dõi"]].map(([value, label]) => <button key={value} type="button" onClick={() => setRiskFilter(value)} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${riskFilter === value ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`}>{label}</button>)}</div>
                </div>
              </div>
              {filteredRiskStudents.length === 0 ? <EmptyState icon={CheckCircle2} title="Không có cảnh báo trong bộ lọc" description="Hiện chưa có học viên nào thỏa điều kiện cảnh báo." /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredRiskStudents.map((student) => <article key={`${student.classId}-${student.id}`} className={`rounded-2xl p-4 border shadow-sm ${student.riskLevel === "danger" ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30" : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30"}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</h3><p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{student.className}</p></div><span className="text-[10px] uppercase font-black text-amber-700 dark:text-amber-300">{riskLabel[student.riskLevel]}</span></div><p className="text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-950/80 rounded-xl p-3 mt-3 border border-slate-200/50 dark:border-transparent">{student.riskReason || "Cần theo dõi thêm"}</p><div className="grid grid-cols-3 gap-2 text-center text-[10px] mt-3"><div><p className="text-slate-500">Điểm</p><p className="font-mono font-bold text-slate-900 dark:text-white mt-1">{student.gpa === null ? "—" : `${student.gpa}/10`}</p></div><div><p className="text-slate-500">Chuyên cần</p><p className="font-mono font-bold text-slate-900 dark:text-white mt-1">{student.attendanceRate || "—"}</p></div><div><p className="text-slate-500">Vắng</p><p className="font-mono font-bold text-rose-600 dark:text-rose-300 mt-1">{student.missedSessionsCount}</p></div></div><div className="flex items-center justify-between mt-4"><span className="text-[11px] text-slate-500 dark:text-slate-400">Hoạt động: {formatRelative(student.lastActive)}</span><Link to={`/lms/teacher/classes/${student.classId}`} className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline">Mở lớp <ExternalLink className="w-3.5 h-3.5" /></Link></div></article>)}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 space-y-5 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Bài nộp chờ chấm</h2><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Hàng chờ được lọc server-side theo lớp và trạng thái.</p></div><div className="flex items-center gap-2"><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPendingPage(1); }} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200"><option value="all">Tất cả trạng thái</option><option value="submitted">Mới nộp</option><option value="late">Nộp trễ</option></select><Link to="/lms/teacher/grading" className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline">Mở workspace <ArrowRight className="w-3.5 h-3.5" /></Link></div></div>
              {data.pendingSubmissions.length === 0 ? <EmptyState icon={CheckCircle2} title="Không có bài đang chờ chấm" description="Hàng chờ hiện tại đã được xử lý hoặc chưa có học viên nộp bài." actionLabel="Mở workspace chấm bài" actionTo="/lms/teacher/grading" /> : <div className="space-y-3">{data.pendingSubmissions.map((submission) => <div key={submission.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-slate-900 dark:text-white">{submission.studentName}</span><span className="text-[10px] uppercase font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">{submission.track}</span><span className="text-[11px] text-slate-500 dark:text-slate-400">{submission.className}</span></div><p className="text-xs text-slate-700 dark:text-slate-300 mt-1">{submission.assignmentTitle}</p><p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1">Nộp {formatRelative(submission.submittedAt)} · Hạn {formatDateTime(submission.dueDate, "Không có deadline")}</p></div><Link to={`/lms/teacher/grading?submissionId=${submission.id}`} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20"><ClipboardCheck className="w-4 h-4" /> Chấm bài</Link></div>)}</div>}
              {totalPages > 1 && <div className="flex items-center justify-center gap-3 pt-2"><button type="button" disabled={pendingPage <= 1} onClick={() => setPendingPage((page) => page - 1)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs disabled:opacity-40">Trước</button><span className="text-xs text-slate-500 dark:text-slate-400">Trang {pendingPage}/{totalPages}</span><button type="button" disabled={pendingPage >= totalPages} onClick={() => setPendingPage((page) => page + 1)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs disabled:opacity-40">Sau</button></div>}
            </section>

            <div className="flex justify-end"><button type="button" onClick={resetFilters} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">Xóa bộ lọc</button></div>
          </>
        )}
      </div>
    </div>
  );
}
