import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronRight, LoaderCircle } from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { useTheme } from "../../../context/ThemeContext";
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "../../api/lmsClient";
import { resolveLmsDestination } from "../../../utils/lmsNavigation";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const typeMeta = (type) => {
  const normalized = String(type || "system").toLowerCase();
  if (normalized.includes("assignment")) return { icon: "📝", label: "Bài tập" };
  if (normalized.includes("grade")) return { icon: "🌟", label: "Kết quả" };
  if (normalized.includes("live")) return { icon: "🔴", label: "Lớp trực tiếp" };
  if (normalized.includes("certificate")) return { icon: "🎓", label: "Chứng chỉ" };
  return { icon: "🔔", label: "Hệ thống" };
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const { authUser } = useAuthContext();
  const { isDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchNotifications({ page: 1, limit: 6 });
      const data = result?.data || {};
      const items = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(items);
      setUnreadCount(Number(data.unreadCount ?? items.filter((item) => !item.is_read).length));
    } catch {
      // An empty bell is safer than demo alerts with inaccessible links.
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const markOne = async (notification) => {
    if (notification.is_read) return;
    try {
      await markNotificationAsRead(notification.id);
      setNotifications((items) => items.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // A read-state failure must not stop the learner from opening the item.
    }
  };

  const openNotification = async (notification) => {
    await markOne(notification);
    const destination = resolveLmsDestination(notification.link_url, authUser);
    setOpen(false);
    if (!destination) return;
    if (destination.kind === "external") {
      window.open(destination.value, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(destination.value);
  };

  const markAll = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Keep the current state if the server rejected the change.
    }
  };

  const palette = isDarkMode
    ? {
      button: "border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-white",
      menu: "border-slate-700 bg-slate-900 text-slate-100 shadow-slate-950/45",
      header: "border-slate-800 bg-slate-950/80",
      muted: "text-slate-400",
      item: "hover:bg-slate-800/80",
      unread: "bg-blue-500/10",
      icon: "border-slate-700 bg-slate-950",
      footer: "border-slate-800 bg-slate-950/60",
      mark: "text-blue-300 hover:text-blue-200",
    }
    : {
      button: "border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
      menu: "border-slate-200 bg-white text-slate-900 shadow-slate-900/15",
      header: "border-slate-100 bg-slate-50/80",
      muted: "text-slate-500",
      item: "hover:bg-slate-50",
      unread: "bg-blue-50/70",
      icon: "border-slate-100 bg-white",
      footer: "border-slate-100 bg-slate-50/70",
      mark: "text-blue-600 hover:text-blue-700",
    };

  return (
    <div ref={menuRef} className="relative text-left">
      <button
        type="button"
        onClick={() => setOpen((visible) => !visible)}
        className={`relative rounded-xl p-2.5 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${palette.button}`}
        title="Trung tâm thông báo"
        aria-label={unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : "Trung tâm thông báo"}
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white shadow-sm">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className={`absolute right-0 z-[60] mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl ${palette.menu}`}>
          <div className={`flex items-center justify-between border-b p-4 ${palette.header}`}>
            <div>
              <p className="text-sm font-black">Thông báo</p>
              <p className={`mt-0.5 text-[11px] ${palette.muted}`}>{unreadCount ? `${unreadCount} thông báo chưa đọc` : "Bạn đã đọc hết thông báo"}</p>
            </div>
            {unreadCount > 0 && <button type="button" onClick={markAll} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${palette.mark}`}><CheckCheck className="h-3.5 w-3.5" /> Đọc tất cả</button>}
          </div>

          <div className="max-h-[min(29rem,65vh)] overflow-y-auto">
            {loading ? <div className={`flex items-center justify-center gap-2 px-4 py-10 text-xs ${palette.muted}`}><LoaderCircle className="h-4 w-4 animate-spin" /> Đang tải thông báo...</div> : notifications.length === 0 ? <div className={`px-5 py-10 text-center text-xs ${palette.muted}`}>Chưa có thông báo mới.</div> : notifications.map((notification) => {
              const meta = typeMeta(notification.type);
              const destination = resolveLmsDestination(notification.link_url, authUser);
              return <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left transition last:border-b-0 dark:border-slate-800 ${palette.item} ${notification.is_read ? "" : palette.unread}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base ${palette.icon}`}>{meta.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className={`text-[10px] font-bold ${palette.muted}`}>{meta.label}</span>{!notification.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}</span>
                  <span className="mt-1 block truncate text-xs font-bold">{notification.title}</span>
                  <span className={`mt-1 block line-clamp-2 text-[11px] leading-4 ${palette.muted}`}>{notification.message}</span>
                  <span className={`mt-1.5 block text-[10px] ${palette.muted}`}>{formatTime(notification.created_at)}</span>
                </span>
                {destination && <ChevronRight className={`mt-3 h-4 w-4 shrink-0 ${palette.muted}`} />}
              </button>;
            })}
          </div>

          <div className={`border-t p-2.5 text-center ${palette.footer}`}><Link to="/lms/notifications" onClick={() => setOpen(false)} className={`inline-flex items-center gap-1 text-xs font-bold ${palette.mark}`}>Xem tất cả thông báo <ChevronRight className="h-3.5 w-3.5" /></Link></div>
        </div>
      )}
    </div>
  );
}
