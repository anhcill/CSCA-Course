import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock, Plus, Video } from "lucide-react";

const formatDateTime = (value) => {
  if (!value) return "Chưa có thời hạn";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function ClassWorkspaceScheduleTab({
  sessions = [],
  classId,
  onOpenCreateSession
}) {
  return (
    <div className="space-y-4">
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Lịch giảng dạy & Buổi học</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Các buổi học trực tuyến đã lên lịch cho lớp.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/lms/teach/classes/${classId}/attendance`}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            Mở sổ điểm danh
          </Link>
          <button
            type="button"
            onClick={onOpenCreateSession}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" /> Thêm buổi học
          </button>
        </div>
      </div>

      {/* Danh sách sessions */}
      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <CalendarDays className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Lớp chưa có buổi học nào</p>
          <p className="mt-1 text-xs text-slate-500">Hãy thêm buổi học đầu tiên để học viên có thể vào lớp đúng giờ.</p>
          <button
            type="button"
            onClick={onOpenCreateSession}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Tạo buổi học mới
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const isLive = s.status === "LIVE" || s.status === "live";
            return (
              <div
                key={s.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-xs transition hover:shadow-sm ${
                  isLive ? "border-rose-300 bg-rose-50/30 dark:border-rose-900" : "border-slate-200/80 dark:border-slate-800"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isLive ? "bg-rose-600 text-white animate-pulse" : "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400"
                  }`}>
                    <Video className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {s.title}
                      </span>
                      {s.status === "RESCHEDULED" && (
                        <span className="rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-bold">
                          Đã đổi lịch
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-sky-400">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(s.start_time || s.startTime)}
                      </span>
                      {s.meet_url || s.meetUrl ? <span>Đã có link phòng</span> : <span>Chưa gán link</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Link
                    to={`/lms/teach/classes/${classId}/attendance?sessionId=${s.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Điểm danh
                  </Link>
                  {(s.meet_url || s.meetUrl) && (
                    <a
                      href={s.meet_url || s.meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                    >
                      Vào phòng dạy
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
