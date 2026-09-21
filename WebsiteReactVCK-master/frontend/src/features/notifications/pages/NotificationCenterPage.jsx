import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bell, BookOpenCheck, Check, CheckCheck, CircleAlert, GraduationCap, Radio, RefreshCw } from "lucide-react";
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

const visualForType = (type) => {
  const value = String(type || "system").toLowerCase();
  if (value.includes("assignment")) return { icon: BookOpenCheck, className: "bg-blue-50 text-blue-600", label: "Bài tập" };
  if (value.includes("grade")) return { icon: GraduationCap, className: "bg-amber-50 text-amber-600", label: "Kết quả" };
  if (value.includes("live")) return { icon: Radio, className: "bg-rose-50 text-rose-600", label: "Lớp trực tiếp" };
  return { icon: Bell, className: "bg-violet-50 text-violet-600", label: "Hệ thống" };
};

export default function NotificationCenterPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeView, setActiveView] = useState("all");
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true); setErrorMessage("");
    try {
      const result = await fetchNotifications({ page: 1, limit: 50, unreadOnly: activeView === "unread" });
      const data = result?.data || {};
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (error) {
      console.error("Unable to load notifications", error);
      setErrorMessage("Không thể tải thông báo. Vui lòng thử lại sau.");
    } finally { setLoading(false); }
  }, [activeView]);
  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const labels = useMemo(() => [["all", "Tất cả"], ["unread", `Chưa đọc${unreadCount ? ` (${unreadCount})` : ""}`]], [unreadCount]);
  const markOne = async (notification) => {
    if (notification.is_read) return;
    try {
      await markNotificationAsRead(notification.id);
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) { toast.error(error.message || "Không thể cập nhật thông báo."); }
  };
  const openNotification = async (notification) => {
    await markOne(notification);
    const url = notification.link_url;
    if (!url || url === "#") return;
    if (url.startsWith("/")) navigate(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc.");
    } catch (error) { toast.error(error.message || "Không thể cập nhật thông báo.");
    } finally { setMarkingAll(false); }
  };

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-blue-100 bg-gradient-to-r from-[#edf6ff] via-white to-[#f4f8ff] p-6 shadow-sm sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-blue-100"><Bell className="h-3.5 w-3.5" /> Trung tâm thông báo</span><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Luôn nắm được điều quan trọng</h1><p className="mt-2 text-sm leading-6 text-slate-600">Nhận cập nhật về bài tập, kết quả học tập, lớp trực tiếp và hoạt động hệ thống.</p></div><div className="rounded-2xl bg-white px-5 py-4 text-center shadow-sm ring-1 ring-blue-100"><p className="text-xs font-medium text-slate-500">Chưa đọc</p><p className="mt-1 text-2xl font-bold text-blue-600">{unreadCount}</p></div></div></section>
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1">{labels.map(([value, label]) => <button key={value} type="button" onClick={() => setActiveView(value)} className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${activeView === value ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{label}</button>)}</div><div className="flex items-center gap-2">{unreadCount > 0 && <button type="button" onClick={markAll} disabled={markingAll} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"><CheckCheck className="h-3.5 w-3.5" /> {markingAll ? "Đang cập nhật..." : "Đánh dấu đã đọc"}</button>}<button type="button" onClick={loadNotifications} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600" title="Làm mới"><RefreshCw className="h-4 w-4" /></button></div></section>
        {loading ? <LoadingState variant="light" message="Đang tải thông báo..." count={3} /> : errorMessage ? <ErrorState variant="light" title="Không tải được thông báo" message={errorMessage} onRetry={loadNotifications} /> : notifications.length === 0 ? <EmptyState variant="light" icon={Bell} title="Chưa có thông báo" description={activeView === "unread" ? "Bạn đã đọc tất cả thông báo." : "Thông báo mới sẽ xuất hiện tại đây."} /> : <section className="space-y-3">{notifications.map((notification) => {
          const visual = visualForType(notification.type); const Icon = visual.icon; const createdAt = notification.created_at ? new Date(notification.created_at) : null;
          return <article key={notification.id} className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${notification.is_read ? "border-slate-100 bg-white" : "border-blue-200 bg-blue-50/40"}`}><div className="flex gap-4"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${visual.className}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-100">{visual.label}</span>{!notification.is_read && <span className="h-2 w-2 rounded-full bg-blue-600" />}</div><h2 className="mt-2 text-sm font-bold text-slate-900">{notification.title}</h2><p className="mt-1 text-xs leading-5 text-slate-600">{notification.message}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-slate-400">{createdAt ? createdAt.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : ""}</span><div className="flex gap-2">{!notification.is_read && <button type="button" onClick={() => markOne(notification)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"><Check className="h-3.5 w-3.5" /> Đã đọc</button>}{notification.link_url && notification.link_url !== "#" && <button type="button" onClick={() => openNotification(notification)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700">Xem chi tiết</button>}</div></div></div></div></article>;
        })}</section>}
        {!loading && !errorMessage && <p className="flex items-center gap-1.5 text-xs text-slate-400"><CircleAlert className="h-3.5 w-3.5" /> Thông báo được lấy trực tiếp từ hộp thư LMS của bạn.</p>}
      </div>
    </div>
  );
}
