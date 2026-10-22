import React, { useState } from "react";
import {
  Settings,
  Mail,
  Bell,
  Calendar,
  CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";

const STORAGE_KEY = "csca_notification_settings";

const DEFAULT_SETTINGS = {
  email: true,
  system: true,
  assignment: true,
  exam: true,
};

const SETTINGS_LIST = [
  {
    id: "email",
    label: "Nhận thông báo qua email",
    icon: Mail,
  },
  {
    id: "system",
    label: "Thông báo trên hệ thống",
    icon: Bell,
  },
  {
    id: "assignment",
    label: "Thông báo bài tập mới",
    icon: Calendar,
  },
  {
    id: "exam",
    label: "Thông báo lịch thi",
    icon: CalendarDays,
  },
];

export default function NotificationSettingsWidget() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  const handleToggle = (id, label) => {
    setSettings((prev) => {
      const nextValue = !prev[id];
      const updated = { ...prev, [id]: nextValue };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn("Unable to save settings to localStorage", err);
      }
      toast.success(
        nextValue ? `Đã bật: ${label}` : `Đã tắt: ${label}`,
        { id: `setting-${id}`, duration: 1800 }
      );
      return updated;
    });
  };

  return (
    <section className="rounded-3xl border border-white/80 bg-white/85 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-slate-100/80">
        <Settings className="h-4 w-4 text-[#102f63]" />
        <h2 className="text-sm font-black text-[#102f63] tracking-tight">
          Cài đặt thông báo
        </h2>
      </div>

      <div className="space-y-3.5">
        {SETTINGS_LIST.map((item) => {
          const Icon = item.icon;
          const isOn = Boolean(settings[item.id]);

          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 text-[#487291] shrink-0" />
                <span className="truncate font-semibold text-[#17365f]">{item.label}</span>
              </div>

              {/* iOS-like toggle switch matching screenshot */}
              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                onClick={() => handleToggle(item.id, item.label)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                  isOn ? "bg-[#1d63a8]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out mt-0.5 ${
                    isOn ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
