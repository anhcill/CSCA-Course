import { useState, useRef, useEffect } from "react";
import {
  Calendar,
  FolderOpen,
  UserRound,
  Bell,
  FileText,
  Settings,
  MoreVertical,
  Check,
  ExternalLink,
  Trash2,
} from "lucide-react";

const getNotificationVisualConfig = (item) => {
  const type = String(
    item.icon_type || item.event_type || item.type || item.category || "system"
  ).toLowerCase();
  const title = String(item.title || "").toLowerCase();

  // Assignment / Homework / Quiz
  if (type.includes("assign") || type.includes("quiz") || type.includes("bai_tap") || title.includes("quiz") || title.includes("btvn")) {
    return {
      icon: Calendar,
      boxClass: "bg-rose-50 text-rose-500 border border-rose-100/80",
    };
  }

  // Material / Files
  if (type.includes("material") || type.includes("file") || type.includes("tai_lieu") || type.includes("folder")) {
    return {
      icon: FolderOpen,
      boxClass: "bg-emerald-50 text-emerald-500 border border-emerald-100/80",
    };
  }

  // Teacher / Instructor
  if (type.includes("teach") || type.includes("giang_vien") || type.includes("instructor") || title.includes("giảng viên") || title.includes("thầy")) {
    return {
      icon: UserRound,
      boxClass: "bg-purple-50 text-purple-500 border border-purple-100/80",
    };
  }

  // Reminder
  if (type.includes("remind") || type.includes("nhac_nho") || type.includes("deadline")) {
    return {
      icon: Bell,
      boxClass: "bg-amber-50 text-amber-500 border border-amber-100/80",
    };
  }

  // Grade / Results
  if (type.includes("grade") || type.includes("score") || type.includes("diem") || type.includes("result")) {
    return {
      icon: FileText,
      boxClass: "bg-emerald-50 text-emerald-500 border border-emerald-100/80",
    };
  }

  // Live class / Schedule / System
  return {
    icon: Settings,
    boxClass: "bg-sky-50 text-sky-500 border border-sky-100/80",
  };
};

export default function NotificationItemCard({
  notification,
  onMarkRead,
  onToggleRead,
  onOpen,
  onDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const visual = getNotificationVisualConfig(notification);
  const Icon = visual.icon;
  const isRead = Boolean(notification.is_read);
  const isNew = Boolean(notification.is_new ?? !isRead);

  const handleCardClick = () => {
    if (onOpen) onOpen(notification);
    else if (!isRead && onMarkRead) onMarkRead(notification);
  };

  return (
    <article
      onClick={handleCardClick}
      className="group relative flex items-center justify-between gap-3.5 sm:gap-4 rounded-3xl border border-white/90 bg-white/95 p-4 sm:p-5 shadow-[0_4px_24px_rgba(32,78,120,0.06)] hover:shadow-md transition-all duration-200 backdrop-blur-md cursor-pointer hover:border-sky-200"
    >
      {/* Icon Box */}
      <div
        className={`flex h-12 w-12 sm:h-13 sm:w-13 shrink-0 items-center justify-center rounded-2xl shadow-2xs transition-transform duration-200 group-hover:scale-105 ${visual.boxClass}`}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>

      {/* Content info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm sm:text-base font-bold text-[#102f63] line-clamp-1 group-hover:text-blue-700 transition">
            {notification.title}
          </h3>
          {isNew && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-500 border border-rose-200/60 leading-none shrink-0">
              Mới
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-[#487291] leading-relaxed line-clamp-2">
          {notification.message}
        </p>
      </div>

      {/* Right meta actions */}
      <div
        className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 ml-1"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
          {notification.timeDisplay || "Vừa xong"}
        </span>

        {/* Read / Unread Indicator Dot */}
        {!isRead && (
          <span
            className="h-2.5 w-2.5 rounded-full bg-blue-600 shrink-0 shadow-xs shadow-blue-500/50"
            title="Chưa đọc"
          />
        )}

        {/* 3-dots Menu Button */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="rounded-xl bg-[#dff1ff] p-1.5 sm:p-2 text-[#17365f] hover:bg-[#d0e5f9] transition active:scale-95 shadow-2xs"
            aria-label="Tùy chọn thông báo"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-white/90 bg-white p-2 shadow-xl z-30">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (onToggleRead) onToggleRead(notification);
                  else if (!isRead && onMarkRead) onMarkRead(notification);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#17365f] hover:bg-sky-50 hover:text-sky-700 transition"
              >
                <Check className="h-3.5 w-3.5" />
                {isRead ? "Đánh dấu chưa đọc" : "Đánh dấu đã đọc"}
              </button>

              {notification.link_url && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (onOpen) onOpen(notification);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#17365f] hover:bg-sky-50 hover:text-sky-700 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Xem chi tiết
                </button>
              )}

              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(notification.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa thông báo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
