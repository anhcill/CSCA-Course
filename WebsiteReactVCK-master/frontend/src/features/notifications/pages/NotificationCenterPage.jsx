import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Check, RefreshCw, Bell } from "lucide-react";
import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  markNotificationAsUnread,
} from "../../api/lmsClient";
import { useAuthContext } from "../../../context/AuthContext";
import { resolveLmsDestination } from "../../../utils/lmsNavigation";

import NotificationHeroHeader from "../components/NotificationHeroHeader";
import NotificationCategoryTabs from "../components/NotificationCategoryTabs";
import NotificationItemCard from "../components/NotificationItemCard";
import NotificationQuickFilterWidget from "../components/NotificationQuickFilterWidget";
import NotificationSettingsWidget from "../components/NotificationSettingsWidget";

const DEFAULT_MOCK_NOTIFICATIONS = [
  {
    id: "mock-1",
    title: "Có bài tập mới: Bài tập chương 3 - Kinh tế vi mô",
    message: "Giảng viên Trần Minh đã đăng bài tập chương 3. Hạn nộp: 20/01/2025.",
    category: "course",
    quickFilterType: "assignment",
    icon_type: "assignment",
    is_read: false,
    is_new: true,
    timeDisplay: "2 giờ trước",
    dateGroup: "Hôm nay",
    link_url: "/lms/assignments",
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: "mock-2",
    title: "Cập nhật lịch thi giữa kỳ",
    message: "Lịch thi giữa kỳ môn Tiếng Trung HSK2 đã được cập nhật. Vui lòng xem chi tiết lịch thi.",
    category: "course",
    quickFilterType: "schedule",
    icon_type: "exam",
    is_read: false,
    is_new: true,
    timeDisplay: "5 giờ trước",
    dateGroup: "Hôm nay",
    link_url: "/lms/calendar",
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: "mock-3",
    title: "Tài liệu mới được đăng tải",
    message: "Giảng viên Lý Hoa đã đăng tài liệu “Giáo trình HSK2 - Unit 3” trong môn Tiếng Trung HSK2.",
    category: "course",
    quickFilterType: "material",
    icon_type: "material",
    is_read: false,
    is_new: false,
    timeDisplay: "8 giờ trước",
    dateGroup: "Hôm nay",
    link_url: "/lms/files",
    created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
  },
  {
    id: "mock-4",
    title: "Thông báo từ giảng viên",
    message: "Giảng viên Nguyễn Văn An đã đăng thông báo về kế hoạch học tập tuần tới.",
    category: "teacher",
    quickFilterType: "teacher",
    icon_type: "teacher",
    is_read: true,
    is_new: false,
    timeDisplay: "1 ngày trước",
    dateGroup: "Hôm qua",
    link_url: "/lms/calendar",
    created_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
  },
  {
    id: "mock-5",
    title: "Nhắc nhở: Hạn nộp bài tập sắp đến",
    message: "Bài tập “Phân tích thị trường” của môn Kinh tế vi mô sẽ hết hạn sau 2 ngày.",
    category: "reminder",
    quickFilterType: "assignment",
    icon_type: "reminder",
    is_read: true,
    is_new: false,
    timeDisplay: "1 ngày trước",
    dateGroup: "Hôm qua",
    link_url: "/lms/assignments",
    created_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
  },
  {
    id: "mock-6",
    title: "Điểm bài kiểm tra đã được công bố",
    message: "Giảng viên Trần Minh đã công bố điểm bài kiểm tra “Chương 2 - Cung cầu”.",
    category: "course",
    quickFilterType: "assignment",
    icon_type: "grade",
    is_read: true,
    is_new: false,
    timeDisplay: "12/01/2025",
    dateGroup: "12/01/2025",
    link_url: "/lms/analytics",
    created_at: "2025-01-12T14:30:00.000Z",
  },
  {
    id: "mock-7",
    title: "Thông báo hệ thống",
    message: "Hệ thống sẽ được bảo trì vào 22:00 - 24:00 ngày 14/01/2025. Một số tính năng có thể tạm thời không khả dụng.",
    category: "system",
    quickFilterType: "system",
    icon_type: "system",
    is_read: true,
    is_new: false,
    timeDisplay: "12/01/2025",
    dateGroup: "12/01/2025",
    link_url: null,
    created_at: "2025-01-12T09:15:00.000Z",
  },
  {
    id: "mock-8",
    title: "Cập nhật chính sách học bổng CSCA kỳ mới",
    message: "Thông tin xét duyệt học bổng du học CSC năm 2025 đã được cập nhật tại cổng thông tin sinh viên.",
    category: "system",
    quickFilterType: "system",
    icon_type: "system",
    is_read: true,
    is_new: false,
    timeDisplay: "11/01/2025",
    dateGroup: "11/01/2025",
    link_url: "/policy-and-legal",
    created_at: "2025-01-11T16:00:00.000Z",
  },
  {
    id: "mock-9",
    title: "Tài liệu ôn thi HSK cấp tốc đã được cập nhật",
    message: "Hệ thống vừa cập nhật trọn bộ từ vựng & cấu trúc ngữ pháp trọng tâm phục vụ kỳ thi sắp tới.",
    category: "system",
    quickFilterType: "material",
    icon_type: "material",
    is_read: true,
    is_new: false,
    timeDisplay: "10/01/2025",
    dateGroup: "10/01/2025",
    link_url: "/lms/files",
    created_at: "2025-01-10T10:00:00.000Z",
  },
  {
    id: "mock-10",
    title: "Thầy Lê Hoàng phản hồi bài viết luận chuyên sâu",
    message: "Giảng viên đã nhận xét và chấm điểm chi tiết bài tập tổ hợp xác suất nâng cao của bạn.",
    category: "teacher",
    quickFilterType: "teacher",
    icon_type: "teacher",
    is_read: true,
    is_new: false,
    timeDisplay: "09/01/2025",
    dateGroup: "09/01/2025",
    link_url: "/lms/assignments",
    created_at: "2025-01-09T15:20:00.000Z",
  },
  {
    id: "mock-11",
    title: "Lịch học bù môn Toán chuyên sâu CSCA",
    message: "Thầy Lê Hoàng thông báo dời lịch buổi học bù sang 19:30 Thứ Bảy tuần này qua phòng học trực tuyến.",
    category: "teacher",
    quickFilterType: "schedule",
    icon_type: "teacher",
    is_read: true,
    is_new: false,
    timeDisplay: "08/01/2025",
    dateGroup: "08/01/2025",
    link_url: "/lms/calendar",
    created_at: "2025-01-08T11:45:00.000Z",
  },
  {
    id: "mock-12",
    title: "Nhắc nhở: Hoàn thành bài khảo sát đánh giá giảng viên",
    message: "Khảo sát chất lượng giảng dạy giữa kỳ sẽ đóng vào 23:59 ngày mai. Vui lòng dành 3 phút gửi ý kiến phản hồi.",
    category: "reminder",
    quickFilterType: "teacher",
    icon_type: "reminder",
    is_read: true,
    is_new: false,
    timeDisplay: "07/01/2025",
    dateGroup: "07/01/2025",
    link_url: null,
    created_at: "2025-01-07T08:30:00.000Z",
  },
];

function normalizeApiNotification(raw) {
  const type = String(raw.event_type || raw.type || "system").toLowerCase();
  let category = "system";
  let quickFilterType = "system";
  let icon_type = "system";

  if (type.includes("assign") || type.includes("quiz")) {
    category = "course";
    quickFilterType = "assignment";
    icon_type = "assignment";
  } else if (type.includes("session") || type.includes("schedule") || type.includes("exam")) {
    category = "course";
    quickFilterType = "schedule";
    icon_type = "exam";
  } else if (type.includes("file") || type.includes("material")) {
    category = "course";
    quickFilterType = "material";
    icon_type = "material";
  } else if (type.includes("teach") || type.includes("instructor")) {
    category = "teacher";
    quickFilterType = "teacher";
    icon_type = "teacher";
  } else if (type.includes("remind") || type.includes("deadline")) {
    category = "reminder";
    quickFilterType = "assignment";
    icon_type = "reminder";
  } else if (type.includes("grade")) {
    category = "course";
    quickFilterType = "assignment";
    icon_type = "grade";
  }

  const createdAt = raw.created_at ? new Date(raw.created_at) : new Date();
  const now = new Date();
  const diffHours = Math.round((now.getTime() - createdAt.getTime()) / (3600 * 1000));
  let timeDisplay = "";
  let dateGroup = "Hôm nay";

  if (diffHours < 24 && createdAt.getDate() === now.getDate()) {
    timeDisplay = diffHours <= 1 ? "Vừa xong" : `${diffHours} giờ trước`;
    dateGroup = "Hôm nay";
  } else if (diffHours < 48) {
    timeDisplay = "1 ngày trước";
    dateGroup = "Hôm qua";
  } else {
    timeDisplay = createdAt.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    dateGroup = timeDisplay;
  }

  return {
    id: raw.id,
    title: raw.title || "Thông báo từ CSCA",
    message: raw.message || raw.body || "",
    category,
    quickFilterType,
    icon_type,
    is_read: Boolean(raw.is_read),
    is_new: !raw.is_read,
    timeDisplay,
    dateGroup,
    link_url: raw.link_url || null,
    created_at: raw.created_at,
    isFromApi: true,
  };
}

export default function NotificationCenterPage() {
  const navigate = useNavigate();
  const { authUser } = useAuthContext();

  const [items, setItems] = useState(DEFAULT_MOCK_NOTIFICATIONS.slice(0, 0));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all"); // Top horizontal pills
  const [activeQuickFilter, setActiveQuickFilter] = useState("all"); // Right sidebar quick filter
  const [markingAll, setMarkingAll] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetchNotifications({ page: 1, limit: 50 });
      const apiList = result?.data?.notifications;
      setItems(Array.isArray(apiList) ? apiList.map(normalizeApiNotification) : []);
    } catch (err) {
      console.warn("Unable to load notifications", err);
      setItems([]);
      setLoadError(err?.message || "Không thể tải thông báo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Counts for Category Tabs (Top horizontal bar)
  const categoryCounts = useMemo(() => {
    const counts = { all: items.length, system: 0, course: 0, teacher: 0, reminder: 0 };
    items.forEach((item) => {
      if (counts[item.category] !== undefined) {
        counts[item.category] += 1;
      }
    });
    return counts;
  }, [items]);

  // Counts for Quick Filter (Right sidebar widget)
  const filterCounts = useMemo(() => {
    let unread = 0;
    let assignment = 0;
    let schedule = 0;
    let material = 0;
    let teacher = 0;
    let system = 0;

    items.forEach((item) => {
      if (!item.is_read) unread += 1;
      if (item.quickFilterType === "assignment") assignment += 1;
      if (item.quickFilterType === "schedule") schedule += 1;
      if (item.quickFilterType === "material") material += 1;
      if (item.quickFilterType === "teacher") teacher += 1;
      if (item.quickFilterType === "system") system += 1;
    });

    return {
      all: items.length,
      unread,
      assignment,
      schedule,
      material,
      teacher,
      system,
    };
  }, [items]);

  // Handle Category selection
  const handleSelectCategory = (catId) => {
    setActiveCategory(catId);
    setActiveQuickFilter("all"); // reset quick filter when changing main tab
  };

  // Handle Quick Filter selection
  const handleSelectQuickFilter = (filterId) => {
    setActiveQuickFilter(filterId);
    // If selecting a category-like quick filter, sync or allow independent view
    if (filterId === "all") {
      setActiveCategory("all");
    }
  };

  // Filter items based on activeCategory & activeQuickFilter
  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Filter by top category
      if (activeCategory !== "all" && item.category !== activeCategory) {
        return false;
      }

      // 2. Filter by right quick filter
      if (activeQuickFilter === "unread" && item.is_read) {
        return false;
      }
      if (
        activeQuickFilter !== "all" &&
        activeQuickFilter !== "unread" &&
        item.quickFilterType !== activeQuickFilter
      ) {
        return false;
      }

      return true;
    });
  }, [items, activeCategory, activeQuickFilter]);

  // Group visible items by dateGroup
  const groupedItems = useMemo(() => {
    const groups = [];
    const groupMap = new Map();

    visibleItems.forEach((item) => {
      const gName = item.dateGroup || "Khác";
      if (!groupMap.has(gName)) {
        groupMap.set(gName, []);
        groups.push(gName);
      }
      groupMap.get(gName).push(item);
    });

    return groups.map((name) => ({
      name,
      list: groupMap.get(name),
    }));
  }, [visibleItems]);

  // Mark single notification as read
  const handleMarkRead = async (notification) => {
    if (notification.is_read) return;
    setItems((prev) =>
      prev.map((it) => (it.id === notification.id ? { ...it, is_read: true, is_new: false } : it))
    );
    window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
    if (notification.isFromApi) {
      try {
        await markNotificationAsRead(notification.id);
      } catch (err) {
        console.warn("Unable to update read state on server", err);
      }
    }
  };

  // Toggle read state
  const handleToggleRead = async (notification) => {
    const nextRead = !notification.is_read;
    setItems((prev) =>
      prev.map((it) =>
        it.id === notification.id ? { ...it, is_read: nextRead, is_new: !nextRead } : it
      )
    );
    window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
    if (notification.isFromApi) {
      try {
        if (nextRead) await markNotificationAsRead(notification.id);
        else await markNotificationAsUnread(notification.id);
      } catch (err) {
        setItems((prev) => prev.map((it) => (
          it.id === notification.id
            ? { ...it, is_read: notification.is_read, is_new: !notification.is_read }
            : it
        )));
        toast.error(err?.message || "Không thể cập nhật trạng thái thông báo");
      }
    }
  };

  // Open notification destination
  const handleOpenItem = async (notification) => {
    await handleMarkRead(notification);
    if (!notification.link_url) return;
    const dest = resolveLmsDestination(notification.link_url, authUser);
    if (!dest) return;
    if (dest.kind === "internal") navigate(dest.value);
    else window.open(dest.value, "_blank", "noopener,noreferrer");
  };

  // Delete notification
  const handleDeleteItem = async (id) => {
    try {
      await deleteNotification(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
      toast.success("Đã xóa thông báo", { duration: 1500 });
    } catch (err) {
      toast.error(err?.message || "Không thể xóa thông báo");
    }
  };

  // Mark all as read
  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead();
    } catch {
      // ignore
    } finally {
      setItems((prev) => prev.map((it) => ({ ...it, is_read: true, is_new: false })));
      setMarkingAll(false);
      window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
      toast.success("Đã đánh dấu tất cả là đã đọc", { duration: 1800 });
    }
  };

  const unreadCount = filterCounts.unread;

  return (
    <div className="min-h-full p-2.5 sm:p-3.5 xl:px-4 xl:py-3">
      <div className="mx-auto max-w-[1440px]">
        {/* Main 2-column layout matching the design */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_310px]">
          {/* Left Column: Title, Category Pills Bar, Timeline List */}
          <div className="space-y-3 min-w-0">
            {/* Title & Inspirational Quote Banner directly over the landscape */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <NotificationHeroHeader />

              {/* Action Buttons: Mark all read & Refresh */}
              <div className="flex items-center gap-2 self-start sm:self-center">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAll}
                    disabled={markingAll}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/85 bg-white/85 dark:border-slate-800 dark:bg-slate-900/90 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-400 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
                    <span>{markingAll ? "Đang xử lý..." : "Đọc tất cả"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/85 bg-white/85 dark:border-slate-800 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 shadow-xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-400 disabled:opacity-60"
                  title="Làm mới danh sách"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
                </button>
              </div>
            </div>

            {/* Horizontal Category Filter Pills Bar */}
            <NotificationCategoryTabs
              activeCategory={activeCategory}
              onSelectCategory={handleSelectCategory}
              categoryCounts={categoryCounts}
            />

            {/* Notification items grouped by timeline */}
            {loadError ? (
              <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/90 dark:bg-slate-900/90 p-8 text-center shadow-xs">
                <h3 className="text-sm font-bold text-rose-800 dark:text-rose-400">Không thể tải thông báo</h3>
                <p className="mt-1 text-xs text-rose-600 dark:text-slate-400">{loadError}</p>
                <button type="button" onClick={loadData} className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700">
                  Thử lại
                </button>
              </div>
            ) : groupedItems.length === 0 ? (
              <div className="rounded-2xl border border-white/85 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90 p-12 text-center shadow-xs backdrop-blur-md">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <Bell className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-slate-800 dark:text-slate-100">
                  Không có thông báo nào trong danh mục này
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {activeQuickFilter === "unread"
                    ? "Tuyệt vời! Bạn đã đọc hết tất cả thông báo."
                    : "Các thông báo và cập nhật mới sẽ hiển thị tại đây khi có phát sinh."}
                </p>
                {(activeCategory !== "all" || activeQuickFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory("all");
                      setActiveQuickFilter("all");
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                  >
                    Xem tất cả thông báo
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {groupedItems.map((group) => (
                  <section key={group.name} className="space-y-2.5">
                    {/* Section Header: Hôm nay, Hôm qua, 12/01/2025... */}
                    <h2 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 tracking-tight pt-1">
                      {group.name}
                    </h2>

                    <div className="space-y-2.5">
                      {group.list.map((notification) => (
                        <NotificationItemCard
                          key={notification.id}
                          notification={notification}
                          onMarkRead={handleMarkRead}
                          onToggleRead={handleToggleRead}
                          onOpen={handleOpenItem}
                          onDelete={handleDeleteItem}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Widgets */}
          <div className="space-y-4">
            {/* Widget 1: Bộ lọc nhanh */}
            <NotificationQuickFilterWidget
              activeFilter={activeQuickFilter}
              onSelectFilter={handleSelectQuickFilter}
              filterCounts={filterCounts}
            />

            {/* Widget 2: Cài đặt thông báo */}
            <NotificationSettingsWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
