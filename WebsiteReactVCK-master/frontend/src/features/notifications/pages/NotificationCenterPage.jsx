import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bell, CheckCheck, RefreshCw, Radio, BookOpenCheck, GraduationCap, Inbox } from "lucide-react";
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";
import { useAuthContext } from "../../../context/AuthContext";
import { resolveLmsDestination } from "../../../utils/lmsNavigation";
import NotificationItemCard from "../components/NotificationItemCard";

const CATEGORY_TABS = [
  { id: "all", label: "Tất cả", icon: Inbox },
  { id: "unread", label: "Chưa đọc", icon: Bell },
  { id: "session", label: "Lịch & Buổi học", icon: Radio },
  { id: "assignment", label: "Bài tập & Quiz", icon: BookOpenCheck },
  { id: "grade", label: "Kết quả & Điểm danh", icon: GraduationCap },
];

export default function NotificationCenterPage() {
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const isUnread = activeTab === "unread";
      const categoryParam = isUnread ? null : activeTab;
      const result = await fetchNotifications({
        page: 1,
        limit: 50,
        unreadOnly: isUnread,
        category: categoryParam,
      });
      const data = result?.data || {};
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (error) {
      console.error("Unable to load notifications", error);
      setErrorMessage("Không thể tải thông báo. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markOne = async (notification) => {
    if (notification.is_read) return;
    try {
      await markNotificationAsRead(notification.id);
      setNotifications((items) =>
        items.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      toast.error(error.message || "Không thể cập nhật thông báo.");
    }
  };

  const openNotification = async (notification) => {
    await markOne(notification);
    const destination = resolveLmsDestination(notification.link_url, authUser);
    if (!destination) return;
    if (destination.kind === "internal") navigate(destination.value);
    else window.open(destination.value, "_blank", "noopener,noreferrer");
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead();
      setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc.");
    } catch (error) {
      toast.error(error.message || "Không thể cập nhật thông báo.");
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Hero header */}
        <section className="rounded-3xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/40 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-100 dark:ring-blue-900/50">
                <Bell className="h-3.5 w-3.5" /> Hộp thư thông báo
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Cập nhật học tập & Lịch trình
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Thông báo tự động về thay đổi lịch học, bài tập mới, quiz mở và kết quả đánh giá.
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 px-6 py-4 text-center shadow-sm ring-1 ring-blue-100 dark:ring-blue-900/50">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Chưa đọc</p>
              <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">{unreadCount}</p>
            </div>
          </div>
        </section>

        {/* Filter Tab bar */}
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              const badge = tab.id === "unread" && unreadCount > 0 ? ` (${unreadCount})` : "";
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  {tab.label}
                  {badge}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={markingAll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? "Đang xử lý..." : "Đọc tất cả"}
              </button>
            )}
            <button
              type="button"
              onClick={loadNotifications}
              className="rounded-xl p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400"
              title="Làm mới"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Content list */}
        {loading ? (
          <LoadingState message="Đang tải danh sách thông báo..." count={3} />
        ) : errorMessage ? (
          <ErrorState title="Không tải được thông báo" message={errorMessage} onRetry={loadNotifications} />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Chưa có thông báo nào"
            description={
              activeTab === "unread"
                ? "Tuyệt vời! Bạn đã đọc hết tất cả các thông báo."
                : "Các cập nhật liên quan đến lớp học sẽ hiển thị tại đây."
            }
          />
        ) : (
          <section className="space-y-3">
            {notifications.map((notification) => (
              <NotificationItemCard
                key={notification.id}
                notification={notification}
                onMarkRead={markOne}
                onOpen={openNotification}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
