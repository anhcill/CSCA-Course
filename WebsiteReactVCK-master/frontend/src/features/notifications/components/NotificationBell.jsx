import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

/* MOCK_UI_ONLY: Dữ liệu mẫu thông báo dự phòng khi backend chưa có thông báo mới */
const MOCK_NOTIFICATIONS = [
  {
    id: "notif-1",
    type: "grade",
    title: "Điểm bài tập Viết đoạn văn HSK 4",
    message: "Giáo viên Trần Thị Lan đã chấm bài của đại ca: 9.5/10 kèm lời khen ngợi xuất sắc.",
    link_url: "/lms/assignments",
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "notif-2",
    type: "live_class",
    title: "Lớp học trực tuyến sắp bắt đầu",
    message: "Buổi luyện khẩu ngữ HSKK Trung cấp sẽ diễn ra lúc 19:30 tối nay trên Google Meet.",
    link_url: "/lms/live-classes",
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "notif-3",
    type: "streak",
    title: "Duy trì chuỗi học 14 ngày!",
    message: "Chúc mừng đại ca đã giữ vững chuỗi Daily Streak và mở khóa 50 XP cùng Huy hiệu Cần Cù.",
    link_url: "/lms/leaderboard",
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "notif-4",
    type: "certificate",
    title: "Chứng chỉ khóa học đã sẵn sàng",
    message: "Chứng chỉ hoàn thành xuất sắc Khóa học HSK 3 đã được cấp phát chính thức trên hệ thống.",
    link_url: "/lms/certificates",
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "notif-5",
    type: "assignment",
    title: "Bài tập mới được giao",
    message: "Thầy Hoàng vừa giao bài tập: Dịch thuật ngữ pháp bài 12. Hạn nộp 23:59 Chủ nhật này.",
    link_url: "/lms/assignments",
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
];

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "unread"
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    fetchNotifs();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifs = async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (data.success && data.data && Array.isArray(data.data.notifications) && data.data.notifications.length > 0) {
        setNotifications(data.data.notifications);
        setUnreadCount(data.data.unreadCount ?? data.data.notifications.filter((n) => !n.is_read).length);
      } else {
        // Sử dụng dữ liệu mẫu MOCK_UI_ONLY
        setNotifications(MOCK_NOTIFICATIONS);
        setUnreadCount(MOCK_NOTIFICATIONS.filter((n) => !n.is_read).length);
      }
    } catch {
      // Fallback khi lỗi API
      setNotifications(MOCK_NOTIFICATIONS);
      setUnreadCount(MOCK_NOTIFICATIONS.filter((n) => !n.is_read).length);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // Bỏ qua lỗi kết nối
    }
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleMarkAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const getNotifMeta = (type) => {
    switch (type) {
      case "assignment":
        return { icon: "📝", label: "Bài tập", tagClass: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
      case "grade":
        return { icon: "🌟", label: "Điểm số", tagClass: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
      case "live_class":
        return { icon: "🔴", label: "Lớp Live", tagClass: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
      case "streak":
        return { icon: "🔥", label: "Cột mốc", tagClass: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
      case "certificate":
        return { icon: "🎓", label: "Chứng chỉ", tagClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
      default:
        return { icon: "🔔", label: "Hệ thống", tagClass: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return !n.is_read;
    return true;
  });

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        title="Trung tâm thông báo"
      >
        <span className="text-lg leading-none select-none">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-md animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 mt-3 w-84 sm:w-96 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden divide-y divide-slate-800 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="p-4 bg-slate-950/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Trung Tâm Thông Báo</span>
              {unreadCount > 0 && (
                <span className="bg-rose-500/20 text-rose-400 text-xs px-2 py-0.5 rounded-full font-mono border border-rose-500/30 font-bold">
                  {unreadCount} mới
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline font-semibold transition"
              >
                Đã đọc tất cả
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 bg-slate-950/40 flex items-center gap-2 text-xs border-b border-slate-800">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                activeTab === "all"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab("unread")}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
                activeTab === "unread"
                  ? "bg-slate-800 text-amber-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Chưa đọc
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
              )}
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <span className="text-3xl block">✨</span>
                <p className="text-xs font-semibold text-slate-300">
                  {activeTab === "unread"
                    ? "Đại ca đã xem hết mọi thông báo mới rồi!"
                    : "Chưa có thông báo nào dành cho đại ca."}
                </p>
                <p className="text-[11px] text-slate-500">
                  Thông báo về lớp học, điểm thi và chứng chỉ sẽ hiển thị tại đây.
                </p>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const meta = getNotifMeta(n.type);
                return (
                  <Link
                    key={n.id}
                    to={n.link_url || "#"}
                    onClick={() => {
                      handleMarkAsRead(n.id);
                      setOpen(false);
                    }}
                    className={`p-4 flex items-start gap-3 transition block hover:bg-slate-850/80 group ${
                      !n.is_read ? "bg-amber-500/[0.03]" : "bg-transparent opacity-85"
                    }`}
                  >
                    <div className="text-lg p-2.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0 group-hover:border-slate-700 transition">
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${meta.tagClass}`}>
                          {meta.label}
                        </span>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Chưa đọc"></span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-white leading-snug group-hover:text-amber-400 transition-colors line-clamp-1">
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-400 leading-normal line-clamp-2">
                        {n.message}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono block pt-0.5">
                        {new Date(n.created_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="p-3 bg-slate-950/60 text-center border-t border-slate-800">
            <Link
              to="/lms/assignments"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-400 hover:text-amber-400 font-semibold transition"
            >
              Xem danh sách bài tập & lịch học →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
