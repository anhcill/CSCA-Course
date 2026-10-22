import { Play, ExternalLink, Clock, CalendarDays, Video } from "lucide-react";

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
  const showSessionBadge = item.sessionTitle && item.sessionTitle.trim() !== item.title.trim();

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
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/90 bg-white/95 p-3 sm:p-3.5 shadow-[0_4px_20px_rgba(32,78,120,0.05)] hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 transition-all duration-300 backdrop-blur-md cursor-pointer"
    >
      {/* Video Preview Thumbnail / Header */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-[#102f63] to-slate-950 shadow-inner">
        {/* Subtle decorative radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent" />

        {/* Center Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-blue-600 shadow-xl backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
            <Video className="h-3 w-3 text-red-400" />
            <span>HD</span>
          </span>
          {showSessionBadge && (
            <span className="hidden sm:inline-flex rounded-md bg-blue-600/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md line-clamp-1 max-w-[140px]">
              {item.sessionTitle}
            </span>
          )}
        </div>

        {/* Bottom Badges */}
        <div className="absolute inset-x-2.5 bottom-2 flex items-center justify-between text-[11px] font-medium text-white">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-[10px] backdrop-blur-md text-slate-200">
            <CalendarDays className="h-3 w-3 text-blue-300" />
            <span>{dateText}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-md">
            <Clock className="h-3 w-3" />
            <span>{durationText}</span>
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="mt-3 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition line-clamp-1">
            {item.title}
          </h4>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {item.description || "Video ghi lại toàn bộ tiến trình buổi học, kiến thức trọng tâm và giải đáp thắc mắc."}
          </p>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 truncate">
            <span className="truncate">{formatClassTitle(item.classTitle)}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenVideo}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-95"
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
