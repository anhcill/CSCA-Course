import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, MapPin, Moon, Sun, Sunset } from "lucide-react";

const TIME_RANGES = {
  evening_only: {
    label: "Buổi tối (17h - 23h)",
    shortLabel: "Tối",
    hours: [17, 18, 19, 20, 21, 22, 23],
    startHour: 17,
    icon: Moon,
  },
  afternoon_evening: {
    label: "Chiều & Tối (14h - 23h)",
    shortLabel: "Chiều & Tối",
    hours: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    startHour: 14,
    icon: Sunset,
  },
  all_day: {
    label: "Cả ngày (08h - 23h)",
    shortLabel: "Cả ngày",
    hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    startHour: 8,
    icon: Sun,
  },
};

const ROW_HEIGHT = 62; // desktop px per hour
const MOBILE_ROW_HEIGHT = 56; // mobile px per hour
const WEEKDAY_NAMES = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TIME_RANGE_STORAGE_KEY = "csca_calendar_time_range";
const MOBILE_SPAN_STORAGE_KEY = "csca_calendar_mobile_span";
const DEFAULT_TIME_RANGE = "afternoon_evening";

const getInitialTimeRange = () => {
  if (typeof window === "undefined") return DEFAULT_TIME_RANGE;
  try {
    const savedRange = window.localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return savedRange && TIME_RANGES[savedRange] ? savedRange : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

const getInitialMobileSpan = () => {
  if (typeof window === "undefined") return 1;
  try {
    const saved = Number(window.localStorage.getItem(MOBILE_SPAN_STORAGE_KEY));
    return saved === 3 ? 3 : 1;
  } catch {
    return 1;
  }
};

const getWeekDates = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    return dayDate;
  });
};

const getEventColor = (title = "") => {
  const lower = title.toLowerCase();
  if (lower.includes("trung") || lower.includes("hsk") || lower.includes("hskk") || lower.includes("tiếng")) {
    return {
      border: "border-l-rose-500",
      bg: "bg-rose-50/95 hover:bg-rose-100/90 dark:bg-rose-950/45 dark:hover:bg-rose-950/65",
      cardBorder: "border-rose-200/80 dark:border-rose-900/50",
      time: "text-rose-600 dark:text-rose-400",
      text: "text-rose-950 dark:text-rose-100",
      dot: "bg-rose-500",
    };
  }
  if (lower.includes("vật lý") || lower.includes("lý") || lower.includes("physics") || lower.includes("hóa")) {
    return {
      border: "border-l-emerald-500",
      bg: "bg-emerald-50/95 hover:bg-emerald-100/90 dark:bg-emerald-950/45 dark:hover:bg-emerald-950/65",
      cardBorder: "border-emerald-200/80 dark:border-emerald-900/50",
      time: "text-emerald-600 dark:text-emerald-400",
      text: "text-emerald-950 dark:text-emerald-100",
      dot: "bg-emerald-500",
    };
  }
  if (lower.includes("kỹ năng") || lower.includes("thảo luận") || lower.includes("phản xạ") || lower.includes("nhóm")) {
    return {
      border: "border-l-amber-500",
      bg: "bg-amber-50/95 hover:bg-amber-100/90 dark:bg-amber-950/45 dark:hover:bg-amber-950/65",
      cardBorder: "border-amber-200/80 dark:border-amber-900/50",
      time: "text-amber-600 dark:text-amber-400",
      text: "text-amber-950 dark:text-amber-100",
      dot: "bg-amber-500",
    };
  }
  return {
    border: "border-l-blue-500",
    bg: "bg-blue-50/95 hover:bg-blue-100/90 dark:bg-blue-950/45 dark:hover:bg-blue-950/65",
    cardBorder: "border-blue-200/80 dark:border-blue-900/50",
    time: "text-blue-600 dark:text-sky-400",
    text: "text-blue-950 dark:text-blue-100",
    dot: "bg-blue-500",
  };
};

const formatHourRange = (ev) => {
  const start = new Date(ev.start_time || ev.due_date);
  const end = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 90 * 60 * 1000);
  return `${start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function ScheduleWeeklyTimetable({
  currentDate,
  onDateChange,
  events = [],
  onSelectEvent,
}) {
  const [rangeKey, setRangeKey] = useState(getInitialTimeRange);
  const [mobileSpan, setMobileSpan] = useState(getInitialMobileSpan); // 1 | 3 (Google Calendar mobile 1-day or 3-day)
  const [nowTick, setNowTick] = useState(() => new Date());
  const touchStartRef = useRef(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const selectedRange = TIME_RANGES[rangeKey] || TIME_RANGES[DEFAULT_TIME_RANGE];
  const hours = selectedRange.hours;
  const minHour = selectedRange.startHour;

  const handleRangeChange = (nextRange) => {
    setRangeKey(nextRange);
    try {
      window.localStorage.setItem(TIME_RANGE_STORAGE_KEY, nextRange);
    } catch {
      // Ignore storage errors
    }
  };

  const handleMobileSpanChange = (span) => {
    setMobileSpan(span);
    try {
      window.localStorage.setItem(MOBILE_SPAN_STORAGE_KEY, String(span));
    } catch {
      // Ignore storage errors
    }
  };

  const weekDays = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const selectedDayStr = new Date(currentDate).toDateString();
  const todayStr = nowTick.toDateString();
  const nowHoursFloat = nowTick.getHours() + nowTick.getMinutes() / 60;

  // Events in current week
  const displayEvents = useMemo(() => {
    const weekStart = weekDays[0].getTime();
    const weekEnd = weekDays[6].getTime() + 24 * 60 * 60 * 1000;
    return events.filter((ev) => {
      const time = new Date(ev.start_time || ev.due_date).getTime();
      return time >= weekStart && time < weekEnd;
    });
  }, [weekDays, events]);

  // Index events by day string for fast O(1) lookup (zero lag on mobile!)
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of displayEvents) {
      const key = new Date(ev.start_time || ev.due_date).toDateString();
      if (!map.has(key)) map.set(key, { sessions: [], deadlines: [] });
      if (ev.eventType && ev.eventType !== "SESSION") {
        map.get(key).deadlines.push(ev);
      } else {
        map.get(key).sessions.push(ev);
      }
    }
    for (const bucket of map.values()) {
      bucket.sessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      bucket.deadlines.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    }
    return map;
  }, [displayEvents]);

  const hasAnySessionThisWeek = displayEvents.some((ev) => ev.eventType === "SESSION");

  const hiddenOutOfRangeSessionsCount = useMemo(() => {
    const maxHour = minHour + hours.length;
    return displayEvents.filter((ev) => {
      if (ev.eventType && ev.eventType !== "SESSION") return false;
      const start = new Date(ev.start_time || ev.due_date);
      const end = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 90 * 60 * 1000);
      const startHours = start.getHours() + start.getMinutes() / 60;
      const endHours = end.getHours() + end.getMinutes() / 60;
      return endHours <= minHour || startHours >= maxHour;
    }).length;
  }, [displayEvents, minHour, hours.length]);

  // Mobile 1-day or 3-day slice (fits 100% of mobile viewport — ZERO horizontal scroll!)
  const mobileVisibleDays = useMemo(() => {
    const selectedIdx = Math.max(
      0,
      weekDays.findIndex((d) => d.toDateString() === selectedDayStr),
    );
    if (mobileSpan === 1) return [weekDays[selectedIdx]];
    const startIdx = Math.min(Math.max(0, selectedIdx), 4); // 0..4 so 3 days stay in week
    return weekDays.slice(startIdx, startIdx + 3);
  }, [weekDays, selectedDayStr, mobileSpan]);

  // Auto-fit hours on mobile so a morning class is never clipped off-screen in 1-day / 3-day view
  const mobileHours = useMemo(() => {
    let startH = minHour;
    let endH = minHour + hours.length - 1;
    for (const dayDate of mobileVisibleDays) {
      const bucket = eventsByDay.get(dayDate.toDateString());
      if (!bucket) continue;
      for (const ev of bucket.sessions) {
        const s = new Date(ev.start_time);
        const e = ev.end_time ? new Date(ev.end_time) : new Date(s.getTime() + 90 * 60 * 1000);
        startH = Math.min(startH, Math.max(6, s.getHours()));
        endH = Math.max(endH, Math.min(23, e.getHours() + (e.getMinutes() > 0 ? 1 : 0)));
      }
    }
    const list = [];
    for (let h = startH; h <= endH; h += 1) list.push(h);
    return { hours: list, minHour: startH };
  }, [mobileVisibleDays, eventsByDay, minHour, hours.length]);

  // Lightweight swipe left/right on mobile to step days without horizontal scroll lag
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current || !onDateChange || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + (dx < 0 ? mobileSpan : -mobileSpan));
    onDateChange(nextDate);
  };

  const selectedMobileBucket = eventsByDay.get(selectedDayStr) || { sessions: [], deadlines: [] };
  const otherWeekSessions = useMemo(
    () =>
      displayEvents
        .filter((ev) => ev.eventType === "SESSION" && new Date(ev.start_time).toDateString() !== selectedDayStr)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [displayEvents, selectedDayStr],
  );

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Top Toolbar: Mobile (1 ngày / 3 ngày + Time Range) & Desktop (Time Range) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/90 px-3 py-2 sm:px-4 sm:py-2.5 dark:border-slate-800 dark:bg-slate-950/80">
        {/* Mobile Google-Calendar 1-day / 3-day toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <button
            type="button"
            onClick={() => handleMobileSpanChange(1)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              mobileSpan === 1
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            1 ngày
          </button>
          <button
            type="button"
            onClick={() => handleMobileSpanChange(3)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              mobileSpan === 3
                ? "bg-blue-600 text-white shadow-2xs"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            3 ngày
          </button>
        </div>

        {/* Desktop label */}
        <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>Khung giờ hiển thị:</span>
        </div>

        {/* Time range pills */}
        <div className="flex items-center gap-0.5 sm:gap-1 rounded-xl border border-slate-200/70 bg-white p-0.5 sm:p-1 dark:border-slate-800 dark:bg-slate-900">
          {Object.entries(TIME_RANGES).map(([key, config]) => {
            const Icon = config.icon;
            const isActive = rangeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleRangeChange(key)}
                className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
                title={config.label}
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span>{config.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MOBILE GOOGLE CALENDAR VIEW (< md): 7-Day Strip + 1-Day / 3-Day Grid  */}
      {/* Zero horizontal scroll — 100% fits viewport at buttery 60fps!         */}
      {/* ===================================================================== */}
      <div className="md:hidden">
        {/* Google Calendar 7-Day Week Strip (always visible, fits 100% width!) */}
        <div className="grid grid-cols-7 gap-0.5 border-b border-slate-200/80 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
          {weekDays.map((dayDate, idx) => {
            const dStr = dayDate.toDateString();
            const isSelected = dStr === selectedDayStr;
            const isToday = dStr === todayStr;
            const bucket = eventsByDay.get(dStr);
            const hasSess = Boolean(bucket?.sessions.length);
            const hasDl = Boolean(bucket?.deadlines.length);

            return (
              <button
                key={dStr}
                type="button"
                onClick={() => onDateChange?.(dayDate)}
                className="flex flex-col items-center gap-1 rounded-xl py-1 transition active:scale-95"
              >
                <span
                  className={`text-[10px] font-bold uppercase ${
                    isSelected
                      ? "text-blue-600 dark:text-sky-400"
                      : isToday
                        ? "text-blue-500 dark:text-sky-400"
                        : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {WEEKDAY_SHORT[idx]}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold transition ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                      : isToday
                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-400 dark:bg-blue-950/60 dark:text-sky-300 dark:ring-sky-500/60"
                        : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {dayDate.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {hasSess && (
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-blue-500 dark:bg-sky-400" : "bg-blue-500/80"}`} />
                  )}
                  {hasDl && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* All-Day / Deadline Chips Row for visible mobile day(s) */}
        {mobileVisibleDays.some((d) => (eventsByDay.get(d.toDateString())?.deadlines.length || 0) > 0) && (
          <div className="border-b border-amber-200/60 bg-amber-50/40 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Hạn nộp:
              </span>
              {mobileVisibleDays.flatMap((d) =>
                (eventsByDay.get(d.toDateString())?.deadlines || []).map((dl) => {
                  const isQuiz = dl.eventType === "QUIZ_DUE";
                  return (
                    <button
                      key={`mob-dl-${dl.eventType}-${dl.id}`}
                      type="button"
                      onClick={() => onSelectEvent?.(dl)}
                      className={`max-w-full truncate rounded-lg border px-2 py-1 text-[11px] font-bold ${
                        isQuiz
                          ? "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-200"
                          : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-sky-200"
                      }`}
                    >
                      {isQuiz ? "Quiz: " : "BT: "}
                      {dl.title}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        )}

        {/* Mobile Timeline Body (Swipe left/right to navigate days, ZERO horizontal scroll!) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="select-none"
        >
          {/* 3-day column headers when mobileSpan === 3 */}
          {mobileSpan === 3 && (
            <div className="grid grid-cols-[44px_repeat(3,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="py-1.5 text-center text-[10px] font-bold text-slate-400">Giờ</div>
              {mobileVisibleDays.map((dayDate) => {
                const isToday = dayDate.toDateString() === todayStr;
                const isSelected = dayDate.toDateString() === selectedDayStr;
                const wdIdx = (dayDate.getDay() + 6) % 7;
                return (
                  <button
                    key={`m3-hdr-${dayDate.toISOString()}`}
                    type="button"
                    onClick={() => onDateChange?.(dayDate)}
                    className={`border-l border-slate-200/70 py-1.5 text-center dark:border-slate-800 ${
                      isSelected ? "bg-blue-50/70 dark:bg-blue-950/35" : ""
                    }`}
                  >
                    <span className={`block text-[10px] font-bold ${isToday || isSelected ? "text-blue-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"}`}>
                      {WEEKDAY_SHORT[wdIdx]} · {dayDate.getDate()}/{dayDate.getMonth() + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected day empty-state helper + Quick Jump to other sessions in this week (1-day mode) */}
          {mobileSpan === 1 && selectedMobileBucket.sessions.length === 0 ? (
            <div className="p-4 space-y-3">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center dark:border-slate-800 dark:bg-slate-950/40">
                <CalendarDays className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="mt-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Không có buổi học vào {WEEKDAY_NAMES[(new Date(currentDate).getDay() + 6) % 7]}, {new Date(currentDate).getDate()}/{new Date(currentDate).getMonth() + 1}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Chạm ngày có chấm xanh phía trên hoặc vuốt ngang để xem ngày khác.
                </p>
              </div>

              {otherWeekSessions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Lịch trong tuần này ({otherWeekSessions.length})
                  </p>
                  {otherWeekSessions.map((ev) => {
                    const start = new Date(ev.start_time);
                    const wdIdx = (start.getDay() + 6) % 7;
                    const color = getEventColor(ev.title);
                    return (
                      <button
                        key={`wk-jump-${ev.id}`}
                        type="button"
                        onClick={() => onSelectEvent?.(ev)}
                        className={`flex w-full items-center justify-between gap-2.5 rounded-2xl border border-l-4 p-3 text-left transition active:scale-[0.99] ${color.border} ${color.bg} ${color.cardBorder}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold">
                            <span className={color.time}>
                              {WEEKDAY_SHORT[wdIdx]} {start.getDate()}/{start.getMonth() + 1} · {formatHourRange(ev)}
                            </span>
                          </div>
                          <p className={`mt-0.5 truncate text-xs font-extrabold ${color.text}`}>
                            {ev.title}
                          </p>
                          {(ev.class_title || ev.room) && (
                            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {ev.class_title || ev.room}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Vertical Google Calendar Hourly Grid (1-Day or 3-Day — zero horizontal scroll!) */
            <div
              className={`relative grid ${
                mobileSpan === 1
                  ? "grid-cols-[48px_minmax(0,1fr)]"
                  : "grid-cols-[44px_repeat(3,minmax(0,1fr))]"
              }`}
            >
              {/* Left Hour Gutter */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {mobileHours.hours.map((hour) => (
                  <div
                    key={`mh-${hour}`}
                    style={{ height: `${MOBILE_ROW_HEIGHT}px` }}
                    className="flex items-start justify-center pt-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500"
                  >
                    {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                  </div>
                ))}
              </div>

              {/* Day Columns (1 or 3) */}
              {mobileVisibleDays.map((dayDate) => {
                const dStr = dayDate.toDateString();
                const isToday = dStr === todayStr;
                const dayEvents = eventsByDay.get(dStr)?.sessions || [];
                const totalHeight = mobileHours.hours.length * MOBILE_ROW_HEIGHT;
                const showNowLine =
                  isToday
                  && nowHoursFloat >= mobileHours.minHour
                  && nowHoursFloat <= mobileHours.minHour + mobileHours.hours.length;
                const nowTopPx = (nowHoursFloat - mobileHours.minHour) * MOBILE_ROW_HEIGHT;

                return (
                  <div
                    key={`mcol-${dStr}`}
                    style={{ height: `${totalHeight}px` }}
                    className={`relative border-l border-slate-100 dark:border-slate-800/80 ${
                      isToday ? "bg-blue-50/15 dark:bg-blue-950/10" : ""
                    }`}
                  >
                    {mobileHours.hours.map((hour) => (
                      <div
                        key={`ml-${hour}`}
                        style={{ height: `${MOBILE_ROW_HEIGHT}px` }}
                        className="border-b border-slate-100/90 dark:border-slate-800/70"
                      />
                    ))}

                    {/* Google Calendar Live Red Current-Time Line */}
                    {showNowLine && (
                      <div
                        style={{ top: `${nowTopPx}px` }}
                        className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      >
                        <span className="-ml-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs" />
                        <div className="h-[2px] flex-1 bg-rose-500" />
                      </div>
                    )}

                    {/* Event Blocks */}
                    {dayEvents.map((ev, evIndex) => {
                      const start = new Date(ev.start_time || ev.due_date);
                      const end = ev.end_time
                        ? new Date(ev.end_time)
                        : new Date(start.getTime() + 90 * 60 * 1000);
                      const startH = start.getHours() + start.getMinutes() / 60;
                      const endH = end.getHours() + end.getMinutes() / 60;
                      const topPx = Math.max(0, (startH - mobileHours.minHour) * MOBILE_ROW_HEIGHT);
                      const durH = Math.max(0.5, endH - Math.max(mobileHours.minHour, startH));
                      const heightPx = Math.max(58, durH * MOBILE_ROW_HEIGHT - 4);
                      const color = getEventColor(ev.title);

                      const overlapPrev =
                        evIndex > 0
                        && Math.abs(new Date(dayEvents[evIndex - 1].start_time).getTime() - start.getTime()) < 30 * 60 * 1000;
                      const overlapNext =
                        evIndex < dayEvents.length - 1
                        && Math.abs(new Date(dayEvents[evIndex + 1].start_time).getTime() - start.getTime()) < 30 * 60 * 1000;

                      const posStyle = overlapPrev
                        ? { left: "51%", right: "3px" }
                        : overlapNext
                          ? { left: "3px", right: "51%" }
                          : { left: "4px", right: "4px" };

                      return (
                        <button
                          key={`mev-${ev.id}`}
                          type="button"
                          onClick={() => onSelectEvent?.(ev)}
                          style={{
                            top: `${topPx + 2}px`,
                            height: `${heightPx}px`,
                            ...posStyle,
                          }}
                          className={`absolute z-10 flex flex-col justify-between overflow-hidden rounded-xl border border-l-4 p-2 text-left shadow-2xs transition active:scale-[0.98] ${color.border} ${color.bg} ${color.cardBorder}`}
                        >
                          <div className="min-w-0">
                            <p className={`text-[10px] font-bold leading-tight ${color.time}`}>
                              {formatHourRange(ev)}
                            </p>
                            <h4
                              className={`mt-0.5 break-words font-extrabold leading-snug ${
                                mobileSpan === 1 ? "text-xs line-clamp-3" : "text-[11px] line-clamp-2"
                              } ${color.text}`}
                            >
                              {ev.title}
                            </h4>
                          </div>
                          {(ev.class_title || ev.room) && (
                            <p className="mt-1 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              {ev.class_title || ev.room}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* DESKTOP 7-DAY GOOGLE CALENDAR GRID (>= md) — GPU-smooth, zero blur    */}
      {/* ===================================================================== */}
      <div className="hidden md:block">
        {hiddenOutOfRangeSessionsCount > 0 && rangeKey !== "all_day" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 bg-amber-50/80 px-4 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              Có <strong>{hiddenOutOfRangeSessionsCount}</strong> buổi học tuần này nằm ngoài khung giờ đang chọn.
            </span>
            <button
              type="button"
              onClick={() => handleRangeChange("all_day")}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
            >
              Xem Cả ngày (08h–23h)
            </button>
          </div>
        )}

        {!hasAnySessionThisWeek && (
          <div className="flex items-center justify-between border-b border-blue-100/60 bg-blue-50/40 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/90">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              Tuần này không có buổi học trực tuyến nào được xếp lịch.
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Sử dụng các nút điều hướng hoặc lịch mini để chọn tuần khác.
            </span>
          </div>
        )}

        <div
          className="overflow-x-auto [scrollbar-width:thin]"
          style={{ WebkitOverflowScrolling: "touch", contain: "layout style" }}
        >
          <div className="min-w-[780px]">
            {/* 7-Day Column Header */}
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-center py-3 text-xs font-semibold text-slate-400 dark:text-slate-500">
                Giờ
              </div>

              {weekDays.map((dayDate, idx) => {
                const isToday = dayDate.toDateString() === todayStr;
                const dateIsoDay = dayDate.toDateString();
                const dayNum = dayDate.getDate();
                const monthNum = dayDate.getMonth() + 1;
                const dayDeadlines = eventsByDay.get(dateIsoDay)?.deadlines || [];

                return (
                  <div
                    key={dayDate.toISOString()}
                    className={`relative flex flex-col items-center justify-center border-l border-slate-200/70 py-2.5 text-center dark:border-slate-800 ${
                      isToday ? "bg-blue-50/40 dark:bg-blue-950/30" : ""
                    }`}
                  >
                    <span
                      className={`text-xs font-bold ${
                        isToday ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {WEEKDAY_NAMES[idx]}
                    </span>
                    <span
                      className={`mt-0.5 text-[11px] font-semibold ${
                        isToday ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {dayNum}/{monthNum < 10 ? `0${monthNum}` : monthNum}
                    </span>

                    {dayDeadlines.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent?.(dayDeadlines[0]);
                        }}
                        className="mt-1 inline-flex items-center gap-0.5 rounded-full border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        {dayDeadlines.length} hạn nộp
                      </button>
                    )}

                    {isToday && (
                      <div className="absolute bottom-0 h-0.5 w-8 rounded-full bg-blue-600 dark:bg-blue-500" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Deadlines Strip Row */}
            {displayEvents.some((ev) => ev.eventType !== "SESSION") && (
              <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-center justify-center p-2 text-center text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  Hạn nộp
                </div>
                {weekDays.map((dayDate) => {
                  const dateIsoDay = dayDate.toDateString();
                  const dayDeadlines = eventsByDay.get(dateIsoDay)?.deadlines || [];
                  return (
                    <div
                      key={`deadline-row-${dateIsoDay}`}
                      className="space-y-1 border-l border-slate-200/60 p-1.5 dark:border-slate-800"
                    >
                      {dayDeadlines.map((dl) => {
                        const isQuiz = dl.eventType === "QUIZ_DUE";
                        const scopeLabel = dl.class_title || dl.course_title || "Lớp học";
                        const dueTime = new Date(dl.due_date).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        return (
                          <button
                            key={`dl-chip-${dl.eventType}-${dl.id}`}
                            type="button"
                            onClick={() => onSelectEvent?.(dl)}
                            title={`${dl.title} - ${scopeLabel}`}
                            className={`w-full rounded-lg border p-1.5 text-left transition ${
                              isQuiz
                                ? "border-purple-200/70 bg-purple-50/90 text-purple-900 hover:bg-purple-100 dark:border-purple-800/70 dark:bg-purple-950/60 dark:text-purple-200"
                                : "border-blue-200/70 bg-blue-50/90 text-blue-900 hover:bg-blue-100 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-200"
                            }`}
                          >
                            <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-slate-400">
                              <span className={isQuiz ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400"}>
                                {isQuiz ? "Quiz" : "Bài tập"}
                              </span>
                              <span>{dueTime}</span>
                            </div>
                            <p className="line-clamp-2 text-[10px] font-bold leading-tight text-slate-800 dark:text-slate-100">
                              {dl.title}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                              {scopeLabel}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Desktop Timetable Grid */}
            <div className="relative grid grid-cols-[64px_repeat(7,1fr)]">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    className="flex items-start justify-center pt-2 text-[11px] font-bold text-slate-500 dark:text-slate-400"
                  >
                    {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                  </div>
                ))}
              </div>

              {weekDays.map((dayDate, dayIdx) => {
                const isToday = dayDate.toDateString() === todayStr;
                const dateIsoDay = dayDate.toDateString();
                const dayEvents = eventsByDay.get(dateIsoDay)?.sessions || [];
                const showNowLine =
                  isToday
                  && nowHoursFloat >= minHour
                  && nowHoursFloat <= minHour + hours.length;
                const nowTopPx = (nowHoursFloat - minHour) * ROW_HEIGHT;

                return (
                  <div
                    key={dayIdx}
                    className={`relative border-l border-slate-100 dark:border-slate-800 ${
                      isToday ? "bg-blue-50/15 dark:bg-blue-950/10" : ""
                    }`}
                    style={{ height: `${hours.length * ROW_HEIGHT}px` }}
                  >
                    {hours.map((_, hIdx) => (
                      <div
                        key={hIdx}
                        style={{ height: `${ROW_HEIGHT}px` }}
                        className="border-b border-slate-100/90 dark:border-slate-800/80"
                      />
                    ))}

                    {showNowLine && (
                      <div
                        style={{ top: `${nowTopPx}px` }}
                        className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      >
                        <span className="-ml-1.5 h-2.5 w-2.5 rounded-full bg-rose-500" />
                        <div className="h-[2px] flex-1 bg-rose-500" />
                      </div>
                    )}

                    {dayEvents.map((ev, evIndex) => {
                      const start = new Date(ev.start_time || ev.due_date);
                      const end = ev.end_time
                        ? new Date(ev.end_time)
                        : new Date(start.getTime() + 90 * 60 * 1000);

                      const startHours = start.getHours() + start.getMinutes() / 60;
                      const endHours = end.getHours() + end.getMinutes() / 60;

                      if (endHours <= minHour || startHours >= minHour + hours.length) {
                        return null;
                      }

                      const topPx = Math.max(0, (startHours - minHour) * ROW_HEIGHT);
                      const durationHours = Math.max(0.5, endHours - Math.max(minHour, startHours));
                      const heightPx = Math.max(66, durationHours * ROW_HEIGHT - 4);
                      const color = getEventColor(ev.title);

                      const overlappingWithPrevious =
                        evIndex > 0
                        && Math.abs(new Date(dayEvents[evIndex - 1].start_time).getTime() - start.getTime()) < 30 * 60 * 1000;
                      const widthStyle = overlappingWithPrevious
                        ? { left: "51%", right: "2px" }
                        : evIndex < dayEvents.length - 1
                            && Math.abs(new Date(dayEvents[evIndex + 1].start_time).getTime() - start.getTime()) < 30 * 60 * 1000
                          ? { left: "2px", right: "51%" }
                          : { left: "3px", right: "3px" };

                      return (
                        <div
                          key={ev.id}
                          onClick={() => onSelectEvent?.(ev)}
                          style={{
                            top: `${topPx + 2}px`,
                            height: `${heightPx}px`,
                            ...widthStyle,
                          }}
                          className={`absolute z-10 flex cursor-pointer flex-col justify-between overflow-y-auto rounded-xl border border-l-4 p-2 shadow-2xs transition hover:z-30 hover:shadow-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${color.border} ${color.bg} ${color.cardBorder}`}
                        >
                          <div className="min-w-0">
                            <p className={`text-[11px] font-bold leading-tight ${color.time}`}>
                              {formatHourRange(ev)}
                            </p>
                            <h4 className={`mt-1 break-words whitespace-normal text-xs font-bold leading-snug ${color.text}`}>
                              {ev.title}
                            </h4>
                          </div>

                          {(ev.room || ev.class_title) && (
                            <div className="mt-1 flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                              <span className="break-words whitespace-normal font-medium leading-tight">
                                {ev.room || ev.class_title}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
