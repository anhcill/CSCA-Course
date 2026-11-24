
import { Video, User, History, Settings2, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";

const getStatusBadge = (status, hasReason) => {
  if (status === "cancelled") {
    return {
      label: "Đã hủy",
      className: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800",
    };
  }
  if (status === "rescheduled" || hasReason) {
    return {
      label: "Đã dời lịch",
      className: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800",
    };
  }
  if (status === "live") {
    return {
      label: "Đang diễn ra",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800 animate-pulse",
    };
  }
  if (status === "completed") {
    return {
      label: "Đã kết thúc",
      className: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
    };
  }
  return {
    label: "Đã lên lịch",
    className: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800",
  };
};

const formatTimeRange = (start, end) => {
  if (!start) return { dateStr: "", timeStr: "" };
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const timeStr = `${s.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })} - ${
    e ? e.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }) : ""
  }`;
  const dateStr = s.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
  return { dateStr, timeStr };
};

export default function AdminCalendarSessionRow({
  session,
  onOpenHistory,
  onReschedule,
}) {
  const hasReason = Boolean(session.change_reason);
  const statusBadge = getStatusBadge(session.status, hasReason);
  const { dateStr, timeStr } = formatTimeRange(session.start_time, session.end_time);

  return (
    <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
      <td className="px-3 py-2.5 text-xs">
        <div className="min-w-[180px]">
          <span className="font-bold text-slate-900 dark:text-white block">
            {session.title || `Buổi học #${session.session_number}`}
          </span>
          <span className="text-[11px] font-medium text-blue-600 dark:text-sky-400 block mt-0.5">
            {session.live_class_title}
            {session.course_title ? ` · ${session.course_title}` : ""}
          </span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 dark:text-slate-100">{timeStr || "—"}</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{dateStr}</span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-semibold">{session.teacher_name || "Chưa phân công"}</span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        <div className="space-y-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          {hasReason && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 italic max-w-[200px] truncate" title={session.change_reason}>
              {session.change_reason}
            </p>
          )}
        </div>
      </td>

      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1.5">
          {!(["completed", "ended", "cancelled"].includes(session.status)) && (
            <button
              type="button"
              onClick={() => onReschedule(session)}
              className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 transition"
              title="Đổi ngày hoặc giờ cho buổi học này"
            >
              <CalendarClock className="h-3.5 w-3.5" /> Đổi buổi
            </button>
          )}

          {(hasReason || session.change_log_count > 0 || session.status === "rescheduled") && (
            <button
              type="button"
              onClick={() => onOpenHistory(session)}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60 transition"
              title="Xem lịch sử thay đổi"
            >
              <History className="h-3.5 w-3.5" /> Lịch sử
            </button>
          )}

          <Link
            to={`/admin/classes/${session.live_class_id}`}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
            title="Mở lớp để quản lý lịch cố định và các buổi học"
          >
            <Settings2 className="h-3.5 w-3.5" /> Quản lý
          </Link>

          {session.meeting_url && (
            <a
              href={session.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition"
              title="Mở phòng học trực tuyến"
            >
              <Video className="h-3.5 w-3.5" /> Phòng học
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
