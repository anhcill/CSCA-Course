import React from "react";
import { LayoutGrid, Settings, BookOpen, UserRound, Bell } from "lucide-react";

export const CATEGORY_DEFINITIONS = [
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
                ? "bg-[#102f63] text-white shadow-md shadow-[#102f63]/25"
                : "border border-white/80 bg-white/85 text-[#17365f] hover:bg-white hover:text-[#102f63] shadow-xs backdrop-blur-md"
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-[#487291]"}`} />
            <span>{cat.label}</span>
            <span className={isActive ? "text-white/80" : "text-[#487291]"}>({count})</span>
          </button>
        );
      })}
    </div>
  );
}
