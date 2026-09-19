import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiFilter,
  FiTrash2,
  FiSend,
  FiX,
  FiLayers,
  FiRadio,
  FiAward,
  FiVideo,
  FiBook,
  FiFlame,
} from "react-icons/fi";
import { useAuthContext } from "../../../context/AuthContext";
import { EmptyState, LoadingState } from "../../../components/common/StateView";

const INITIAL_NOTIFICATIONS = [
  {
    id: "notif_01",
    type: "grade",
    title: "Điểm bài tập Viết đoạn văn HSK 4",
    message: "Lão sư Nguyễn Minh Khánh đã chấm bài của bạn: 9.5/10 kèm lời khen ngợi xuất sắc về cấu trúc ngữ pháp.",
    linkUrl: "/lms/assignments",
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "notif_02",
    type: "live_class",
    title: "Lớp học trực tuyến sắp diễn ra",
    message: "Buổi luyện phản xạ khẩu ngữ HSKK Trung cấp sẽ bắt đầu lúc 19:30 tối nay trên phòng Google Meet.",
    linkUrl: "/lms/live-schedule",
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "notif_03",
    type: "assignment",
    title: "Bài tập mới: Ngữ pháp bổ ngữ kết quả",
    message: "Thầy Hoàng Nam vừa giao bài tập mới cho lớp HSK 4 Cấp Tốc. Hạn nộp là 23:59 Chủ nhật tuần này.",
    linkUrl: "/lms/assignments",
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "notif_04",
    type: "streak",
    title: "Duy trì chuỗi học 14 ngày liên tiếp! 🔥",
    message: "Chúc mừng bạn đã đạt cột mốc Daily Streak 14 ngày, nhận ngay 50 XP và huy hiệu Cần Cù.",
    linkUrl: "/lms/leaderboard",
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: "notif_05",
    type: "system",
    title: "Cập nhật hạ tầng Cloudflare R2 & MolyBridge",
    message: "Hệ thống vừa nâng cấp cổng phân phối tài liệu R2 với tốc độ tải siêu tốc và bảo mật cao.",
    linkUrl: "#",
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
];

export default function NotificationCenterPage() {
  const { authUser } = useAuthContext();
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState("all"); // all | unread | assignment | grade | live_class | system
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  // Broadcast form
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState("ALL"); // ALL | CLASS
  const [broadcastType, setBroadcastType] = useState("system");

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast.success("Đã đánh dấu đọc tất cả thông báo! ✨");
  };

  const handleMarkAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const handleDelete = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.success("Đã xóa thông báo!");
  };

  const handleSendBroadcast = (e) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) {
      toast.error("Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo!");
      return;
    }

    const newNotif = {
      id: `notif_${Date.now()}`,
      type: broadcastType,
      title: broadcastTitle.trim(),
      message: broadcastMsg.trim(),
      linkUrl: "#",
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setNotifications((prev) => [newNotif, ...prev]);
    toast.success("Đã phát thông báo thành công đến toàn hệ thống! 📢");
    setIsBroadcastOpen(false);
    setBroadcastTitle("");
    setBroadcastMsg("");
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return !n.isRead;
    if (activeTab !== "all") return n.type === activeTab;
    return true;
  });

  const getNotifIcon = (type) => {
    switch (type) {
      case "assignment":
        return <FiBook className="w-5 h-5 text-blue-400" />;
      case "grade":
        return <FiAward className="w-5 h-5 text-amber-400" />;
      case "live_class":
        return <FiVideo className="w-5 h-5 text-rose-400" />;
      case "streak":
        return <FiFlame className="w-5 h-5 text-orange-400" />;
      default:
        return <FiBell className="w-5 h-5 text-purple-400" />;
    }
  };

  const isPrivileged = authUser?.role === "admin" || authUser?.role === "creator";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8 pb-20 font-sans">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-2">
              <FiBell className="w-3.5 h-3.5" />
              <span>Real-time Notification Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Trung Tâm Thông Báo
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Cập nhật tức thì điểm bài nộp, lịch học trực tuyến, bài tập mới và các thông báo hệ thống.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition"
              >
                <FiCheck className="w-4 h-4" />
                <span>Đánh dấu đã đọc tất cả</span>
              </button>
            )}

            {isPrivileged && (
              <button
                type="button"
                onClick={() => setIsBroadcastOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-600/25"
              >
                <FiRadio className="w-4 h-4" />
                <span>Phát Thông Báo Mới</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/70 border border-white/10 p-2 rounded-2xl">
          {[
            ["all", "Tất cả"],
            ["unread", `Chưa đọc (${unreadCount})`],
            ["assignment", "Bài tập"],
            ["grade", "Điểm số"],
            ["live_class", "Lớp Live"],
            ["system", "Hệ thống"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setActiveTab(val)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                activeTab === val
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Notification List */}
        {filteredNotifications.length === 0 ? (
          <EmptyState
            icon={FiBell}
            title="Không có thông báo nào"
            description="Bạn đã cập nhật hết toàn bộ thông báo trong danh mục này."
          />
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                className={`rounded-2xl p-5 border transition flex items-start justify-between gap-4 ${
                  notif.isRead
                    ? "bg-slate-900/50 border-white/5 opacity-80"
                    : "bg-slate-900/90 border-purple-500/30 shadow-lg shadow-purple-950/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-white/10 shrink-0 mt-0.5">
                    {getNotifIcon(notif.type)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{notif.title}</h3>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                      {notif.message}
                    </p>
                    <span className="text-[11px] text-slate-500 font-mono block pt-1">
                      {new Date(notif.createdAt).toLocaleTimeString("vi-VN")} -{" "}
                      {new Date(notif.createdAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!notif.isRead && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                      title="Đánh dấu đã đọc"
                    >
                      <FiCheck className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(notif.id)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition"
                    title="Xóa thông báo"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Broadcast Modal */}
      {isBroadcastOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500">
                  <FiRadio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    Phát Thông Báo Mới
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Gửi thông báo tức thì tới học viên và giáo viên.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBroadcastOpen(false)}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-white transition"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Tiêu đề thông báo <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Ví dụ: Thay đổi lịch học lớp HSK 4 sang tối thứ Sáu"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-purple-500 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Phân loại:
                  </label>
                  <select
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-purple-500 transition"
                  >
                    <option value="system">Hệ thống (System)</option>
                    <option value="assignment">Bài tập (Assignment)</option>
                    <option value="live_class">Lớp trực tuyến (Live Class)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Đối tượng nhận:
                  </label>
                  <select
                    value={broadcastTarget}
                    onChange={(e) => setBroadcastTarget(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-purple-500 transition"
                  >
                    <option value="ALL">Toàn trường (All Users)</option>
                    <option value="CLASS">Chỉ lớp HSK4-ONLINE-01</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Nội dung thông báo <span className="text-rose-500">*</span>:
                </label>
                <textarea
                  rows={4}
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Nhập thông tin chi tiết cần thông báo đến học viên..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 text-xs text-gray-900 dark:text-white outline-none focus:border-purple-500 transition resize-none leading-relaxed"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsBroadcastOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition"
                >
                  <FiSend className="w-4 h-4" />
                  <span>Phát Thông Báo Ngay</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
