import { Link } from "react-router-dom";
import { Play, ExternalLink, Clock, CalendarDays, Video, BookOpen } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Chưa cập nhật ngày";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật ngày";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatClassTitle = (title) => {
  if (!title) return "Lớp học trực tuyến";
  const str = String(title).trim();
  if (/^\d+$/.test(str)) return `Lớp ${str}`;
  return str;
};

export default function RecordingCard({ item, onPlay }) {
  const durationText = item.durationMinutes ? `${item.durationMinutes} phút` : "Bản ghi";
  const dateText = formatDateTime(item.recordedAt);
  const sessionUrl = item.courseId && item.classId && item.sessionId
    ? `/lms/courses/${item.courseId}/classes/${item.classId}/sessions/${item.sessionId}`
    : null;

  const handleOpenVideo = (e) => {
    e.stopPropagation();
    if (onPlay) {
      onPlay(item);
    } else if (item.openUrl) {
      window.open(item.openUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <article
      onClick={handleOpenVideo}
      className="group relative flex min-w-[170px] max-w-[210px] flex-[0_1_210px] flex-col justify-between overflow-hidden rounded-xl border border-sky-100/90 bg-white/90 p-2 shadow-[0_4px_16px_rgba(67,125,161,0.08)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_8px_22px_rgba(67,125,161,0.14)] cursor-pointer sm:p-2.5"
    >
      {/* Video Preview Thumbnail / Header */}
      <div className="relative aspect-[16/8.5] w-full overflow-hidden rounded-lg bg-gradient-to-br from-sky-100 via-blue-200 to-cyan-100 shadow-inner">
        {/* Subtle decorative radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/55 via-transparent to-transparent" />

        {/* Center Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-sky-700 shadow-md backdrop-blur-md transition-all duration-300 group-hover:scale-105 group-hover:bg-sky-600 group-hover:text-white sm:h-10 sm:w-10">
            <Play className="ml-0.5 h-4 w-4 fill-current sm:h-5 sm:w-5" />
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-md">
            <Video className="h-2.5 w-2.5 text-rose-300" />
            <span>HD</span>
          </span>
          {item.sessionTitle && (
            <span className="hidden max-w-[120px] rounded-md bg-sky-700/85 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-md line-clamp-1 sm:inline-flex">
              {item.sessionTitle}
            </span>
          )}
        </div>

        {/* Bottom Badges */}
        <div className="absolute inset-x-2.5 bottom-2 flex items-center justify-between text-[11px] font-medium text-white">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[9px] backdrop-blur-md text-slate-100">
            <CalendarDays className="h-2.5 w-2.5 text-sky-200" />
            <span>{dateText}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-bold text-amber-200 backdrop-blur-md">
            <Clock className="h-2.5 w-2.5" />
            <span>{durationText}</span>
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="mt-2 flex flex-1 flex-col justify-between">
        <div>
          <h4 className="text-[11px] font-bold text-slate-800 transition line-clamp-1 group-hover:text-sky-700 sm:text-xs">
            {item.title}
          </h4>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-semibold text-sky-700 sm:text-[11px]">
            <BookOpen className="h-3 w-3 shrink-0 text-sky-500" />
            <span className="line-clamp-1">{item.sessionTitle ? `Buổi học: ${item.sessionTitle}` : "Video bổ trợ của lớp"}</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 line-clamp-2 leading-relaxed sm:text-[11px]">
            {item.description || "Video ghi lại toàn bộ tiến trình buổi học, kiến thức trọng tâm và giải đáp thắc mắc."}
          </p>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-sky-100 pt-2">
          <div className="min-w-0 flex-1 text-[10px] font-semibold text-slate-500 truncate sm:text-[11px]">
            <span className="truncate">{formatClassTitle(item.classTitle)}</span>
          </div>

          <div className="flex min-w-0 items-center gap-1 shrink-0">
            {sessionUrl && (
              <Link
                to={sessionUrl}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 transition hover:bg-sky-100"
              >
                <CalendarDays className="h-3 w-3" />
                <span className="hidden sm:inline">Xem buổi</span>
              </Link>
            )}
            <button
              type="button"
              onClick={handleOpenVideo}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-bold text-white shadow-xs transition hover:bg-sky-700 active:scale-95 sm:gap-1.5 sm:px-2.5 sm:text-[11px]"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>Xem video</span>
              <ExternalLink className="h-3 w-3 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
