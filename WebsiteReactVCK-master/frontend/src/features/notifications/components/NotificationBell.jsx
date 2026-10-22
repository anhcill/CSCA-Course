import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import Loading from "../../../components/Loading.jsx";
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

export default function NotificationBell({ variant = "default" }) {
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
    const handleUpdate = () => loadNotifications();
    window.addEventListener("csca:notifications-updated", handleUpdate);
    return () => window.removeEventListener("csca:notifications-updated", handleUpdate);
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
      window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
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
      window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
    } catch {
      // Keep the current state if the server rejected the change.
    }
  };

  const palette = isDarkMode
    ? {
      button: "border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800 hover:text-white",
      menu: "border-slate-800 bg-slate-900 text-slate-100 shadow-2xl",
      header: "bg-slate-900 text-slate-100",
      border: "border-slate-800",
      muted: "text-slate-400",
      item: "hover:bg-slate-800/60",
      read: "bg-slate-900",
      unread: "bg-slate-900",
      unreadDot: "bg-sky-400",
      icon: "border-slate-700/80 bg-slate-800 text-slate-200",
      footer: "bg-slate-900",
      mark: "text-sky-400 hover:text-sky-300",
      title: "text-slate-100",
    }
    : variant === "bare"
    ? {
      button: "border border-white/85 bg-[#e4f4ff]/85 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md hover:bg-white hover:text-blue-700",
      menu: "border-[#bcdbf3] bg-[#edf6fd] text-[#102f63] shadow-[0_22px_55px_rgba(20,60,95,0.22)] backdrop-blur-xl",
      header: "bg-[#edf6fd] text-[#102f63]",
      border: "border-[#d8ebf9]",
      muted: "text-[#487291]",
      item: "hover:bg-[#e1f0fb]",
      read: "bg-[#edf6fd]",
      unread: "bg-[#edf6fd]",
      unreadDot: "bg-sky-600",
      icon: "border-[#bcdbf3] bg-[#dbeffc] text-sky-800 shadow-xs",
      footer: "bg-[#edf6fd]",
      mark: "text-sky-700 hover:text-sky-900",
      title: "text-[#102f63]",
    }
    : {
      button: "border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
      menu: "border-slate-200 bg-white text-slate-900 shadow-2xl",
      header: "bg-white text-slate-900",
      border: "border-slate-100",
      muted: "text-slate-500",
      item: "hover:bg-slate-50",
      read: "bg-white",
      unread: "bg-white",
      unreadDot: "bg-sky-600",
      icon: "border-slate-200/80 bg-slate-50 text-slate-700 shadow-xs",
      footer: "bg-white",
      mark: "text-sky-600 hover:text-sky-700",
      title: "text-slate-900",
    };

  return (
    <div ref={menuRef} className="relative text-left">
      <button
        type="button"
        onClick={() => setOpen((visible) => !visible)}
        className={`relative rounded-xl p-2 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${palette.button}`}
        title="Trung tâm thông báo"
        aria-label={unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : "Trung tâm thông báo"}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 z-[60] mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border shadow-2xl ${palette.border} ${palette.menu}`}>
          <div className={`flex items-center justify-between border-b ${palette.border} p-4 ${palette.header}`}>
            <div>
              <p className={`text-sm font-black ${palette.title}`}>Thông báo</p>
              <p className={`mt-0.5 text-[11px] ${palette.muted}`}>
                {unreadCount ? `${unreadCount} thông báo chưa đọc` : "Bạn đã đọc hết thông báo"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${palette.mark}`}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Đọc tất cả
              </button>
            )}
          </div>

          <div className="max-h-[min(29rem,65vh)] overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <Loading loading={true} text="Đang tải thông báo..." fullScreen={false} className="py-8" />
            ) : notifications.length === 0 ? (
              <div className={`px-5 py-10 text-center text-xs ${palette.muted}`}>Chưa có thông báo mới.</div>
            ) : (
              notifications.map((notification) => {
                const meta = typeMeta(notification.type);
                const destination = resolveLmsDestination(notification.link_url, authUser);
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`flex w-full items-start gap-3 border-b ${palette.border} p-4 text-left transition last:border-b-0 ${palette.item} ${notification.is_read ? palette.read : palette.unread}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base ${palette.icon}`}>
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold ${palette.muted}`}>{meta.label}</span>
                        {!notification.is_read && (
                          <span className={`h-1.5 w-1.5 rounded-full ${palette.unreadDot}`} />
                        )}
                      </span>
                      <span className={`mt-1 block truncate text-xs ${notification.is_read ? "font-semibold opacity-85" : "font-extrabold"} ${palette.title}`}>
                        {notification.title}
                      </span>
                      <span className={`mt-1 block line-clamp-2 text-[11px] leading-4 ${palette.muted}`}>
                        {notification.message}
                      </span>
                      <span className={`mt-1.5 block text-[10px] ${palette.muted}`}>
                        {formatTime(notification.created_at)}
                      </span>
                    </span>
                    {destination && <ChevronRight className={`mt-3 h-4 w-4 shrink-0 ${palette.muted}`} />}
                  </button>
                );
              })
            )}
          </div>

          <div className={`border-t ${palette.border} p-3 text-center ${palette.footer}`}>
            <Link
              to="/lms/notifications"
              onClick={() => setOpen(false)}
              className={`inline-flex items-center gap-1 text-xs font-bold transition ${palette.mark}`}
            >
              Xem tất cả thông báo <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
