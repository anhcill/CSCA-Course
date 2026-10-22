import React, { useMemo, useState } from "react";
import { Clock, MapPin, Moon, Sun, Sunset } from "lucide-react";

const TIME_RANGES = {
  evening_only: {
    label: "Buổi tối (17h - 23h)",
    shortLabel: "Buổi tối",
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

const ROW_HEIGHT = 62; // pixels per hour for comfortable reading
const WEEKDAY_NAMES = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

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
      bg: "bg-rose-50/95 hover:bg-rose-100/90",
      cardBorder: "border-rose-100",
      time: "text-rose-600",
      text: "text-rose-950",
    };
  }
  if (lower.includes("vật lý") || lower.includes("lý") || lower.includes("physics") || lower.includes("hóa")) {
    return {
      border: "border-l-emerald-500",
      bg: "bg-emerald-50/95 hover:bg-emerald-100/90",
      cardBorder: "border-emerald-100",
      time: "text-emerald-600",
      text: "text-emerald-950",
    };
  }
  if (lower.includes("kỹ năng") || lower.includes("thảo luận") || lower.includes("phản xạ") || lower.includes("nhóm")) {
    return {
      border: "border-l-amber-500",
      bg: "bg-amber-50/95 hover:bg-amber-100/90",
      cardBorder: "border-amber-100",
      time: "text-amber-600",
      text: "text-amber-950",
    };
  }
  return {
    border: "border-l-blue-500",
    bg: "bg-blue-50/95 hover:bg-blue-100/90",
    cardBorder: "border-blue-100",
    time: "text-blue-600",
    text: "text-blue-950",
  };
};

export default function ScheduleWeeklyTimetable({
  currentDate,
  events = [],
  onSelectEvent,
  onJoinSession,
}) {
  const [rangeKey, setRangeKey] = useState("evening_only");
  const selectedRange = TIME_RANGES[rangeKey] || TIME_RANGES.evening_only;
  const hours = selectedRange.hours;
  const minHour = selectedRange.startHour;

  const weekDays = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const today = new Date();
  const todayStr = today.toDateString();

  // Hiển thị sessions của tuần hiện tại từ database thật
  const displayEvents = useMemo(() => {
    const weekStart = weekDays[0].getTime();
    const weekEnd = weekDays[6].getTime() + 24 * 60 * 60 * 1000;

    const realWeekEvents = events.filter((ev) => {
      const time = new Date(ev.start_time || ev.due_date).getTime();
      return time >= weekStart && time < weekEnd;
    });

    return realWeekEvents;
  }, [weekDays, events]);

  const hasAnySessionThisWeek = displayEvents.some((ev) => ev.eventType === "SESSION");

  return (
    <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-[0_10px_35px_rgba(32,78,120,0.06)] backdrop-blur-md">
      {/* Thanh bộ lọc khung giờ (Đẩy buổi tối lên đầu theo yêu cầu) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Clock className="h-3.5 w-3.5 text-blue-600" />
          <span>Khung giờ hiển thị:</span>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-xs border border-slate-200/70">
          {Object.entries(TIME_RANGES).map(([key, config]) => {
            const Icon = config.icon;
            const isActive = rangeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRangeKey(key)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                title={config.label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{config.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!hasAnySessionThisWeek && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50/40 border-b border-blue-100/60 text-xs">
          <span className="text-slate-600 font-medium">
            Tuần này không có buổi học trực tuyến nào được xếp lịch.
          </span>
          <span className="text-slate-400 text-[11px]">
            Sử dụng các nút điều hướng hoặc lịch mini để chọn tuần học khác.
          </span>
        </div>
      )}

      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="min-w-[820px]">
          {/* Header 7 cột ngày trong tuần */}
          <div className="grid grid-cols-[68px_repeat(7,1fr)] border-b border-slate-200/80 bg-slate-50/50">
            <div className="flex items-center justify-center py-3 text-xs font-semibold text-slate-400">
              Giờ
            </div>

            {weekDays.map((dayDate, idx) => {
              const isToday = dayDate.toDateString() === todayStr;
              const dateIsoDay = dayDate.toDateString();
              const dayNum = dayDate.getDate();
              const monthNum = dayDate.getMonth() + 1;

              // Đếm hạn nộp bài trong ngày nếu có
              const dayDeadlinesCount = displayEvents.filter(
                (ev) => ev.eventType !== "SESSION" && new Date(ev.due_date || ev.start_time).toDateString() === dateIsoDay
              ).length;

              return (
                <div
                  key={dayDate.toISOString()}
                  className={`relative flex flex-col items-center justify-center border-l border-slate-200/70 py-2.5 text-center transition ${
                    isToday ? "bg-blue-50/40" : ""
                  }`}
                >
                  <span
                    className={`text-xs font-bold ${
                      isToday ? "text-blue-600" : "text-slate-700"
                    }`}
                  >
                    {WEEKDAY_NAMES[idx]}
                  </span>
                  <span
                    className={`mt-0.5 text-[11px] font-semibold ${
                      isToday ? "text-blue-600" : "text-slate-400"
                    }`}
                  >
                    {dayNum}/{monthNum < 10 ? `0${monthNum}` : monthNum}
                  </span>

                  {dayDeadlinesCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const firstDeadline = displayEvents.find(
                          (ev) => ev.eventType !== "SESSION" && new Date(ev.due_date || ev.start_time).toDateString() === dateIsoDay
                        );
                        if (firstDeadline && onSelectEvent) onSelectEvent(firstDeadline);
                      }}
                      className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition cursor-pointer shadow-2xs"
                      title={`Nhấp để xem chi tiết ${dayDeadlinesCount} hạn nộp bài tập / quiz`}
                    >
                      {dayDeadlinesCount} hạn nộp
                    </button>
                  )}

                  {isToday && (
                    <div className="absolute bottom-0 h-0.5 w-8 rounded-full bg-blue-600" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Hàng sự kiện hạn nộp bài tập / Quiz trong tuần nếu có */}
          {displayEvents.some((ev) => ev.eventType !== "SESSION") && (
            <div className="grid grid-cols-[68px_repeat(7,1fr)] border-b border-amber-200/60 bg-amber-50/30">
              <div className="flex items-center justify-center p-2 text-[10px] font-bold text-amber-700 text-center">
                Hạn nộp
              </div>
              {weekDays.map((dayDate) => {
                const dateIsoDay = dayDate.toDateString();
                const dayDeadlines = displayEvents.filter(
                  (ev) => ev.eventType !== "SESSION" && new Date(ev.due_date || ev.start_time).toDateString() === dateIsoDay
                );
                return (
                  <div
                    key={`deadline-row-${dateIsoDay}`}
                    className="border-l border-slate-200/60 p-1.5 space-y-1"
                  >
                    {dayDeadlines.map((dl) => {
                      const isQuiz = dl.eventType === "QUIZ_DUE";
                      const dueTime = new Date(dl.due_date).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        <button
                          key={`dl-chip-${dl.eventType}-${dl.id}`}
                          type="button"
                          onClick={() => onSelectEvent && onSelectEvent(dl)}
                          className={`w-full text-left truncate rounded-lg p-1.5 transition cursor-pointer border shadow-2xs hover:shadow-xs group ${
                            isQuiz
                              ? "bg-purple-50/90 border-purple-200/70 text-purple-900 hover:bg-purple-100"
                              : "bg-blue-50/90 border-blue-200/70 text-blue-900 hover:bg-blue-100"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-0.5">
                            <span className={isQuiz ? "text-purple-600" : "text-blue-600"}>
                              {isQuiz ? "Quiz" : "Bài tập"}
                            </span>
                            <span>{dueTime}</span>
                          </div>
                          <p className="truncate text-[10px] font-bold text-slate-800 group-hover:text-blue-700">
                            {dl.title}
                          </p>
                          {dl.total_students > 0 && (
                            <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                              Đã nộp: {dl.submitted_count || 0}/{dl.total_students}
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

          {/* Body thời khóa biểu */}
          <div className="relative grid grid-cols-[68px_repeat(7,1fr)]">
            {/* Cột các mốc giờ bên trái */}
            <div className="divide-y divide-slate-100">
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  className="flex items-start justify-center pt-2 text-[11px] font-bold text-slate-500"
                >
                  {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                </div>
              ))}
            </div>

            {/* 7 cột ngày với các thẻ sự kiện */}
            {weekDays.map((dayDate, dayIdx) => {
              const isToday = dayDate.toDateString() === todayStr;
              const dateIsoDay = dayDate.toDateString();

              // Lấy các buổi học (SESSION) trong ngày
              const dayEvents = displayEvents.filter((ev) => {
                if (ev.eventType && ev.eventType !== "SESSION") return false;
                const evDate = new Date(ev.start_time);
                return evDate.toDateString() === dateIsoDay;
              });

              // Sắp xếp theo giờ bắt đầu
              dayEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

              return (
                <div
                  key={dayIdx}
                  className={`relative border-l border-slate-100 ${
                    isToday ? "bg-blue-50/15" : ""
                  }`}
                  style={{ height: `${hours.length * ROW_HEIGHT}px` }}
                >
                  {/* Đường kẻ ngang mỗi giờ */}
                  {hours.map((hour, hIdx) => (
                    <div
                      key={hIdx}
                      style={{ height: `${ROW_HEIGHT}px` }}
                      className="border-b border-slate-100/90"
                    />
                  ))}

                  {/* Render thẻ lớp học với chữ tự động xuống dòng đầy đủ */}
                  {dayEvents.map((ev, evIndex) => {
                    const start = new Date(ev.start_time || ev.due_date);
                    const end = ev.end_time
                      ? new Date(ev.end_time)
                      : new Date(start.getTime() + 90 * 60 * 1000);

                    const startHours = start.getHours() + start.getMinutes() / 60;
                    const endHours = end.getHours() + end.getMinutes() / 60;

                    // Nếu sự kiện nằm ngoài khung giờ đang chọn, bỏ qua
                    if (endHours <= minHour || startHours >= minHour + hours.length) {
                      return null;
                    }

                    const topPx = Math.max(0, (startHours - minHour) * ROW_HEIGHT);
                    const durationHours = Math.max(0.5, endHours - Math.max(minHour, startHours));
                    const heightPx = Math.max(68, durationHours * ROW_HEIGHT - 4);

                    const color = getEventColor(ev.title);
                    const timeRange = `${start.toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })} - ${end.toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`;

                    // Xử lý nếu có 2 buổi trùng giờ trong ngày thì chia đôi cột (side-by-side)
                    const overlappingWithPrevious = evIndex > 0 && Math.abs(
                      new Date(dayEvents[evIndex - 1].start_time).getTime() - start.getTime()
                    ) < 30 * 60 * 1000;

                    const widthStyle = overlappingWithPrevious
                      ? { left: "51%", right: "2px" }
                      : (evIndex < dayEvents.length - 1 && Math.abs(
                          new Date(dayEvents[evIndex + 1].start_time).getTime() - start.getTime()
                        ) < 30 * 60 * 1000)
                      ? { left: "2px", right: "51%" }
                      : { left: "3px", right: "3px" };

                    return (
                      <div
                        key={ev.id}
                        onClick={() => onSelectEvent && onSelectEvent(ev)}
                        style={{
                          top: `${topPx + 2}px`,
                          height: `${heightPx}px`,
                          ...widthStyle,
                        }}
                        className={`absolute z-10 flex cursor-pointer flex-col justify-between overflow-y-auto rounded-xl border-l-4 border-t border-r border-b p-2 shadow-xs transition hover:z-30 hover:-translate-y-0.5 hover:shadow-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${color.border} ${color.bg} ${color.cardBorder}`}
                      >
                        <div className="min-w-0">
                          {/* Khung giờ rõ ràng */}
                          <p className={`text-[11px] font-bold leading-tight ${color.time}`}>
                            {timeRange}
                          </p>

                          {/* Tiêu đề tự động xuống dòng không bị cắt chữ (...) */}
                          <h4
                            className={`mt-1 break-words whitespace-normal text-xs font-bold leading-snug sm:text-[13px] ${color.text}`}
                          >
                            {ev.title}
                          </h4>
                        </div>

                        {/* Phòng học / Lớp học tự động xuống dòng rõ ràng */}
                        {(ev.room || ev.class_title) && (
                          <div className="mt-1 flex items-start gap-1 text-[11px] text-slate-500">
                            <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
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
  );
}
