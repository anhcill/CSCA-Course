import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, CheckCircle2, Clock3, LockKeyhole, Radio, RotateCcw, Users, Video } from "lucide-react";
import { fetchMyLiveSchedule, getLiveSessionAccess } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

const formatDate = (value, options) => new Date(value).toLocaleDateString("vi-VN", options);
const formatTime = (value) => new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

function sessionState(session) {
  const now = Date.now();
  const start = new Date(session.start_time).getTime();
  const end = new Date(session.end_time).getTime();
  if (session.status === "live" || (now >= start && now <= end)) return "live";
  if (now > end) return "completed";
  if (start - now <= 15 * 60 * 1000) return "open";
  return "upcoming";
}

const stateStyle = {
  live: { label: "Đang diễn ra", className: "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 ring-rose-200 dark:ring-rose-800/60" },
  open: { label: "Phòng đã mở", className: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800/60" },
  upcoming: { label: "Sắp diễn ra", className: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-blue-200 dark:ring-blue-800/60" },
  completed: { label: "Đã kết thúc", className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200 dark:ring-slate-700" },
};

export default function LiveClassSchedulePage() {
  const { courseId, classId } = useParams();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [joiningId, setJoiningId] = useState("");

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await fetchMyLiveSchedule({ courseId, classId });
      setSessions(result?.success && Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      console.error("Unable to load live schedule", error);
      setErrorMessage("Không thể tải lịch học trực tuyến. Vui lòng kiểm tra kết nối rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }, [classId, courseId]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  const enrichedSessions = useMemo(
    () => sessions.map((session) => ({ ...session, uiState: sessionState(session) })),
    [sessions],
  );
  const visibleSessions = useMemo(() => {
    const today = new Date().toDateString();
    if (filter === "today") return enrichedSessions.filter((session) => new Date(session.start_time).toDateString() === today);
    if (filter === "upcoming") return enrichedSessions.filter((session) => ["live", "open", "upcoming"].includes(session.uiState));
    if (filter === "completed") return enrichedSessions.filter((session) => session.uiState === "completed");
    return enrichedSessions;
  }, [enrichedSessions, filter]);
  const stats = useMemo(() => ({
    total: sessions.length,
    today: enrichedSessions.filter((session) => new Date(session.start_time).toDateString() === new Date().toDateString()).length,
    live: enrichedSessions.filter((session) => session.uiState === "live").length,
    upcoming: enrichedSessions.filter((session) => ["open", "upcoming"].includes(session.uiState)).length,
  }), [enrichedSessions, sessions.length]);

  const handleJoin = async (session) => {
    const now = Date.now();
    const start = new Date(session.start_time).getTime();
    const end = new Date(session.end_time).getTime();
    if (now > end) return toast("Buổi học này đã kết thúc.");
    if (start - now > 15 * 60 * 1000) return toast("Phòng học mở trước giờ học 15 phút. Hẹn gặp lại bạn sau nhé!", { icon: "⏰" });
    setJoiningId(session.id);
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) throw new Error("Phòng học chưa sẵn sàng");
      window.open(result.data.meetUrl, "_blank", "noopener,noreferrer");
      toast.success(`Đang mở phòng ${result.data.provider || "trực tuyến"}.`);
    } catch (error) {
      toast.error(error.message || "Không thể truy cập phòng học. Vui lòng thử lại sau.");
    } finally { setJoiningId(""); }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-r from-[#eaf4ff] via-white to-[#f1f7ff] dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900 p-6 shadow-sm dark:shadow-md sm:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900/50"><Radio className="h-3.5 w-3.5" /> Lớp học trực tuyến</span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{classId ? "Lịch học của lớp" : courseId ? "Lịch học của khóa học" : "Lịch học trực tuyến"}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Theo dõi buổi học sắp tới và vào phòng học ngay khi phòng được mở.</p>
            </div>
            <div className="rounded-2xl bg-white/90 dark:bg-slate-900/90 px-5 py-4 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900/50"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Buổi học sắp tới</p><p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.upcoming}</p></div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tổng buổi học", stats.total, CalendarDays, "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50"],
            ["Hôm nay", stats.today, Clock3, "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50"],
            ["Đang live", stats.live, Video, "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50"],
            ["Sắp diễn ra", stats.upcoming, CheckCircle2, "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50"],
          ].map(([label, value, Icon, iconClass]) => <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-4 w-4" /></div><p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</p><p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p></div>)}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-sm"><div className="flex flex-wrap gap-1">{[["all", "Tất cả"], ["today", "Hôm nay"], ["upcoming", "Sắp diễn ra"], ["completed", "Đã kết thúc"]].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${filter === value ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"}`}>{label}</button>)}</div></section>

        {loading ? <LoadingState message="Đang tải lịch học..." count={3} /> : errorMessage ? <ErrorState title="Không tải được lịch học" message={errorMessage} onRetry={loadSchedule} /> : visibleSessions.length === 0 ? <EmptyState icon={CalendarDays} title="Chưa có buổi học phù hợp" description="Lịch học sẽ xuất hiện tại đây khi giáo viên lên lịch cho lớp của bạn." /> : (
          <section className="space-y-3">{visibleSessions.map((session) => {
            const state = stateStyle[session.uiState];
            const isJoinable = ["live", "open"].includes(session.uiState);
            const duration = session.end_time && session.start_time ? Math.max(0, Math.round((new Date(session.end_time) - new Date(session.start_time)) / 60000)) : null;
            return <article key={session.id} className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${session.uiState === "live" ? "border-rose-300 dark:border-rose-800/80 ring-1 ring-rose-200 dark:ring-rose-900/50" : "border-slate-200 dark:border-slate-800"}`}><div className="flex flex-col gap-5 md:flex-row md:items-center"><div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40"><span className="text-lg font-bold">{formatTime(session.start_time)}</span><span className="text-[10px] font-semibold uppercase">{formatDate(session.start_time, { day: "2-digit", month: "2-digit" })}</span></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${state.className}`}>{state.label}</span>{session.course_title && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{session.course_title}</span>}</div><h2 className="mt-2 truncate text-base font-bold text-slate-900 dark:text-white">{session.title}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatTime(session.start_time)} – {formatTime(session.end_time)}{duration ? ` · ${duration} phút` : ""}</span>{session.class_title && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {session.class_title}</span>}</div></div>{session.uiState === "completed" ? <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400"><CheckCircle2 className="h-4 w-4" /> Đã kết thúc</span> : <button type="button" onClick={() => handleJoin(session)} disabled={Boolean(joiningId)} className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${isJoinable ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>{isJoinable ? <Video className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}{joiningId === session.id ? "Đang vào lớp..." : isJoinable ? "Vào lớp" : "Chưa mở phòng"}</button>}</div></article>;
          })}</section>
        )}
        {!loading && !errorMessage && <button type="button" onClick={loadSchedule} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"><RotateCcw className="h-3.5 w-3.5" /> Làm mới lịch học</button>}
      </div>
    </div>
  );
}
