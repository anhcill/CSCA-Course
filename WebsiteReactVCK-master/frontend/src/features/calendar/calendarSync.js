const CALENDAR_CHANGE_EVENT = "csca:calendar-changed";
const CALENDAR_CHANGE_STORAGE_KEY = "csca:calendar-changed-at";

// The in-page event refreshes the screen that made the change. localStorage
// notifies other LMS tabs that the timetable was changed by an admin/teacher.
export const publishCalendarChange = (detail = {}) => {
  if (typeof window === "undefined") return;

  const payload = { at: Date.now(), ...detail };
  window.dispatchEvent(new CustomEvent(CALENDAR_CHANGE_EVENT, { detail: payload }));

  try {
    window.localStorage.setItem(CALENDAR_CHANGE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Calendar data remains server-authoritative; cross-tab signalling is optional.
  }
};

export const subscribeToCalendarChanges = (onChange) => {
  if (typeof window === "undefined") return () => {};

  const handleLocalChange = (event) => onChange(event.detail || {});
  const handleStorageChange = (event) => {
    if (event.key !== CALENDAR_CHANGE_STORAGE_KEY || !event.newValue) return;
    try {
      onChange(JSON.parse(event.newValue));
    } catch {
      onChange({});
    }
  };

  window.addEventListener(CALENDAR_CHANGE_EVENT, handleLocalChange);
  window.addEventListener("storage", handleStorageChange);
  return () => {
    window.removeEventListener(CALENDAR_CHANGE_EVENT, handleLocalChange);
    window.removeEventListener("storage", handleStorageChange);
  };
};
