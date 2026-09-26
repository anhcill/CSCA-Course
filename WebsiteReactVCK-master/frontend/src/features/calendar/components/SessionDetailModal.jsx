import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  History,
  Lock,
  Play,
  Users,
  Video,
  X
} from "lucide-react";
import SessionChangeHistoryModal from "./SessionChangeHistoryModal";

const formatDateTime = (value) => {
  if (!value) return "Chưa xác định";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function SessionDetailModal({
  session,
  onClose,
  onJoin,
  isTeacher = false,
  basePath = ""
}) {
  if (!session) return null;

  const isLive = session.uiState === "live";
  const isJoinable = isLive || session.uiState === "open";
  const isCompleted = session.uiState === "completed";
  const isRescheduled = session.status === "rescheduled";
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-title"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl transition-all">
        {/* Header modal */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 p-6 bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-sky-300">
                <Video className="h-3.5 w-3.5" /> Buổi học trực tuyến
              </span>
              {isRescheduled && (
                <span className="rounded-full bg-rose-500 text-white px-2.5 py-0.5 text-xs font-black">
                  Đã đổi lịch
                </span>
              )}
            </div>
            <h2 id="session-title" className="mt-2 text-xl font-black text-slate-900 dark:text-white">
              {session.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nội dung thông tin buổi học */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Thông tin thời gian và địa điểm */}
          <div className="grid gap-3 sm:grid-cols-2 rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-4 text-xs">
            <div>
              <p className="font-semibold text-slate-500 dark:text-slate-400">Thời gian bắt đầu</p>
              <p className="mt-1 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
                {formatDateTime(session.start_time)}
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-500 dark:text-slate-400">Thời gian kết thúc</p>
              <p className="mt-1 font-bold text-slate-900 dark:text-white">
                {formatDateTime(session.end_time)}
              </p>
            </div>
            {session.instructor_name && (
              <div>
                <p className="font-semibold text-slate-500 dark:text-slate-400">Giảng viên phụ trách</p>
                <p className="mt-1 font-bold text-slate-900 dark:text-white">
                  {session.instructor_name}
                </p>
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-500 dark:text-slate-400">Hình thức học</p>
              <p className="mt-1 font-bold text-slate-900 dark:text-white">
                {session.provider || "Trực tuyến (Meet/Zoom)"}
              </p>
            </div>
          </div>

          {/* Cảnh báo đổi lịch nếu có */}
          {(isRescheduled || Boolean(session.change_reason)) && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">Lưu ý thay đổi lịch học:</p>
                <button
                  type="button"
                  onClick={() => setShowHistory(true)}
                  className="inline-flex items-center gap-1 font-bold text-amber-800 dark:text-amber-300 hover:underline"
                >
                  <History className="h-3.5 w-3.5" /> Xem lịch sử
                </button>
              </div>
              <p className="mt-0.5">{session.change_reason || "Giảng viên đã điều chỉnh thời gian của buổi học này."}</p>
            </div>
          )}

          {/* Nhóm nút hành động chính theo Section 3.2.E */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
              Hành động của buổi:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {isJoinable ? (
                <button
                  type="button"
                  onClick={() => onJoin(session)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                >
                  <Play className="h-4 w-4" /> Vào lớp học ngay
                </button>
              ) : isCompleted ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <CheckCircle2 className="h-4 w-4" /> Buổi học đã kết thúc
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <Lock className="h-4 w-4" /> Phòng mở trước 15 phút
                </div>
              )}

              {basePath && (
                <Link
                  to={`${basePath}/materials`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <FileText className="h-4 w-4 text-blue-600 dark:text-sky-400" /> Tài liệu buổi học
                </Link>
              )}

              {basePath && (
                <Link
                  to={`${basePath}/assignments`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <CalendarDays className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Bài tập & Quiz
                </Link>
              )}

              {isTeacher && session.live_class_id && (
                <Link
                  to={`/lms/teach/classes/${session.live_class_id}/attendance`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition"
                >
                  <Users className="h-4 w-4" /> Điểm danh học viên
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Footer modal */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-800/30 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Đóng
          </button>
        </div>
      </div>

      <SessionChangeHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        sessionId={session.id}
        sessionTitle={session.title}
      />
    </div>
  );
}
