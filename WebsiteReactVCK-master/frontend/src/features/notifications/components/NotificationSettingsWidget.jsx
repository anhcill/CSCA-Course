import { useEffect, useState } from "react";
import {
  Settings,
  Bell,
  Calendar,
  CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";
import { fetchNotificationPreferences, updateNotificationPreferences } from "../../api/lmsClient";

const DEFAULT_SETTINGS = {
  system: true,
  assignments: true,
  calendar: true,
  grades: true,
};

const SETTINGS_LIST = [
  {
    id: "system",
    label: "Thông báo trên hệ thống",
    icon: Bell,
  },
  {
    id: "assignments",
    label: "Thông báo bài tập mới",
    icon: Calendar,
  },
  {
    id: "calendar",
    label: "Thông báo lịch học và lịch thi",
    icon: CalendarDays,
  },
  { id: "grades", label: "Thông báo điểm số", icon: Bell },
];

export default function NotificationSettingsWidget() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    let active = true;
    fetchNotificationPreferences()
      .then((response) => {
        if (active) setSettings((current) => ({ ...current, ...(response?.data || {}) }));
      })
      .catch((error) => console.warn("Unable to load notification preferences", error));
    return () => { active = false; };
  }, []);

  const handleToggle = async (id, label) => {
    const previous = settings;
    const nextValue = !previous[id];
    setSettings({ ...previous, [id]: nextValue });
    setSavingKey(id);
    try {
      const response = await updateNotificationPreferences({ [id]: nextValue });
      setSettings((current) => ({ ...current, ...(response?.data || {}) }));
      window.dispatchEvent(new CustomEvent("csca:notifications-updated"));
      toast.success(nextValue ? `Đã bật: ${label}` : `Đã tắt: ${label}`, { id: `setting-${id}`, duration: 1800 });
    } catch (error) {
      setSettings(previous);
      toast.error(error?.message || "Không thể lưu cài đặt thông báo");
    } finally {
      setSavingKey("");
    }
  };

  return (
    <section className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/90 p-4 sm:p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-slate-100/80 dark:border-slate-800">
        <Settings className="h-4 w-4 text-[#102f63] dark:text-sky-400" />
        <h2 className="text-sm font-black text-[#102f63] dark:text-white tracking-tight">
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
                <Icon className="h-4 w-4 text-[#487291] dark:text-slate-400 shrink-0" />
                <span className="truncate font-semibold text-[#17365f] dark:text-slate-200">{item.label}</span>
              </div>

              {/* iOS-like toggle switch matching screenshot */}
              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                disabled={savingKey === item.id}
                onClick={() => handleToggle(item.id, item.label)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                  isOn ? "bg-[#1d63a8] dark:bg-sky-600" : "bg-slate-300 dark:bg-slate-700"
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
