import { LayoutGrid, Settings, BookOpen, UserRound, Bell } from "lucide-react";

const CATEGORY_DEFINITIONS = [
  { id: "all", label: "Tất cả", icon: LayoutGrid },
  { id: "system", label: "Hệ thống", icon: Settings },
  { id: "course", label: "Khóa học", icon: BookOpen },
  { id: "teacher", label: "Giảng viên", icon: UserRound },
  { id: "reminder", label: "Nhắc nhở", icon: Bell },
];

export default function NotificationCategoryTabs({
  activeCategory = "all",
  onSelectCategory,
  categoryCounts = {},
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      {CATEGORY_DEFINITIONS.map((cat) => {
        const Icon = cat.icon;
        const isActive = activeCategory === cat.id;
        const count = categoryCounts[cat.id] ?? 0;

        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${
              isActive
                ? "bg-[#102f63] dark:bg-sky-600 text-white shadow-md shadow-[#102f63]/25 dark:shadow-sky-900/30"
                : "border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/80 text-[#17365f] dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-[#102f63] dark:hover:text-white shadow-xs backdrop-blur-md"
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-[#487291] dark:text-slate-400"}`} />
            <span>{cat.label}</span>
            <span className={isActive ? "text-white/80" : "text-[#487291] dark:text-slate-400"}>({count})</span>
          </button>
        );
      })}
    </div>
  );
}
