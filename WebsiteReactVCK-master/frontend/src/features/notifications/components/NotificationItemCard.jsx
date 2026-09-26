import { Check, BookOpenCheck, GraduationCap, Radio, Bell, Calendar, Award } from "lucide-react";

export const getNotificationVisual = (item) => {
  const type = String(item.event_type || item.type || "system").toLowerCase();
  if (type.startsWith("session.") || type === "live_class") {
    if (type.includes("cancel")) {
      return { icon: Calendar, label: "Hủy lịch học", badgeClass: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-rose-300 dark:ring-rose-800" };
    }
    if (type.includes("reschedule")) {
      return { icon: Calendar, label: "Dời lịch học", badgeClass: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-amber-300 dark:ring-amber-800" };
    }
    return { icon: Radio, label: "Buổi học", badgeClass: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-indigo-300 dark:ring-indigo-800" };
  }
  if (type.startsWith("assignment.") || type.startsWith("quiz.") || type === "assignment") {
    return { icon: BookOpenCheck, label: "Bài tập & Quiz", badgeClass: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-blue-300 dark:ring-blue-800" };
  }
  if (type === "grade.published" || type === "attendance.updated" || type === "grade") {
    return { icon: GraduationCap, label: "Kết quả & Điểm danh", badgeClass: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-emerald-300 dark:ring-emerald-800" };
  }
  if (type.includes("cert")) {
    return { icon: Award, label: "Chứng chỉ", badgeClass: "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 ring-purple-300 dark:ring-purple-800" };
  }
  return { icon: Bell, label: "Hệ thống", badgeClass: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-300 dark:ring-slate-700" };
};

export default function NotificationItemCard({
  notification,
  onMarkRead,
  onOpen,
}) {
  const visual = getNotificationVisual(notification);
  const Icon = visual.icon;
  const createdAt = notification.created_at ? new Date(notification.created_at) : null;
  const isRead = Boolean(notification.is_read);

  return (
    <article
      className={`group relative rounded-2xl border p-4 sm:p-5 transition-all duration-200 hover:shadow-md ${
        isRead
          ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 text-slate-700 dark:text-slate-300"
          : "border-blue-200 dark:border-blue-800/80 bg-blue-50/60 dark:bg-blue-950/25 text-slate-900 dark:text-slate-100 ring-1 ring-blue-100/50 dark:ring-blue-900/30"
      }`}
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ${
            isRead
              ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              : "bg-blue-600 dark:bg-blue-500 text-white shadow-blue-500/20"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${visual.badgeClass}`}
            >
              {visual.label}
            </span>
            {!isRead && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                Mới
              </span>
            )}
          </div>

          <h2
            className={`mt-1.5 text-sm sm:text-base font-bold tracking-tight ${
              isRead ? "text-slate-800 dark:text-slate-200" : "text-slate-900 dark:text-white"
            }`}
          >
            {notification.title}
          </h2>

          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {notification.message}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/60">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {createdAt ? createdAt.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" }) : ""}
            </span>

            <div className="flex items-center gap-2">
              {!isRead && (
                <button
                  type="button"
                  onClick={() => onMarkRead(notification)}
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <Check className="h-3.5 w-3.5" /> Đã đọc
                </button>
              )}

              {notification.link_url && (
                <button
                  type="button"
                  onClick={() => onOpen(notification)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
                >
                  Xem ngay
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
