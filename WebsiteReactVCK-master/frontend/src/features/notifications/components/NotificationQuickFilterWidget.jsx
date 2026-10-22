import {
  Filter,
  Inbox,
  Calendar,
  CalendarDays,
  FileText,
  UserRound,
  Settings,
} from "lucide-react";

const QUICK_FILTERS = [
  {
    id: "all",
    label: "Tất cả thông báo",
    icon: Inbox,
    iconColor: "text-blue-600",
  },
  {
    id: "unread",
    label: "Chưa đọc",
    isDot: true,
    dotColor: "bg-rose-500",
  },
  {
    id: "assignment",
    label: "Bài tập mới",
    icon: Calendar,
    iconColor: "text-rose-500",
  },
  {
    id: "schedule",
    label: "Lịch thi & Lịch học",
    icon: CalendarDays,
    iconColor: "text-amber-500",
  },
  {
    id: "material",
    label: "Tài liệu mới",
    icon: FileText,
    iconColor: "text-emerald-500",
  },
  {
    id: "teacher",
    label: "Từ giảng viên",
    icon: UserRound,
    iconColor: "text-purple-500",
  },
  {
    id: "system",
    label: "Thông báo hệ thống",
    icon: Settings,
    iconColor: "text-blue-500",
  },
];

export default function NotificationQuickFilterWidget({
  activeFilter = "all",
  onSelectFilter,
  filterCounts = {},
}) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white/85 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100/80">
        <Filter className="h-4 w-4 text-[#102f63]" />
        <h2 className="text-sm font-black text-[#102f63] tracking-tight">
          Bộ lọc nhanh
        </h2>
      </div>

      <div className="space-y-1">
        {QUICK_FILTERS.map((item) => {
          const isActive = activeFilter === item.id;
          const count = filterCounts[item.id] ?? 0;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectFilter(item.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-[#dff1ff] text-[#17365f] font-bold shadow-xs"
                  : "text-[#244866] hover:bg-sky-50/70 hover:text-sky-700"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {item.isDot ? (
                  <span className="flex h-4 w-4 items-center justify-center shrink-0">
                    <span className={`h-2 w-2 rounded-full ${item.dotColor}`} />
                  </span>
                ) : (
                  <Icon className={`h-4 w-4 shrink-0 ${item.iconColor}`} />
                )}
                <span className="truncate">{item.label}</span>
              </div>
              <span
                className={`text-[11px] font-bold shrink-0 ${
                  isActive ? "text-[#102f63]" : "text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
