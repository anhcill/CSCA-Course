import { useEffect, useState } from "react";
import { History, X, Clock, User, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { fetchSessionChangeHistory } from "../../api/lmsClient";

const formatDateTime = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  return Number.isNaN(d.getTime())
    ? String(val)
    : d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
};

const scopeLabel = (scope) => {
  if (scope === "single") return "Chỉ buổi học này";
  if (scope === "this_and_following") return "Buổi này và các buổi sau";
  if (scope === "all_future") return "Tất cả các buổi tới";
  return scope || "Buổi học";
};

export default function SessionChangeHistoryModal({
  isOpen,
  onClose,
  sessionId,
  sessionTitle = "Buổi học",
}) {
  const [loading, setLoading] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    let isMounted = true;
    setLoading(true);
    setError("");

    fetchSessionChangeHistory(sessionId)
      .then((res) => {
        if (!isMounted) return;
        const data = res?.data || {};
        setHistoryLogs(Array.isArray(data.history) ? data.history : []);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load session history:", err);
        setError("Không thể tải lịch sử thay đổi.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Lịch sử thay đổi lịch học
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-sm">
                {sessionTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Timeline */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-xs">Đang tải lịch sử điều phối...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-50 dark:bg-rose-950/40 p-4 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : historyLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Chưa có lịch sử thay đổi nào được ghi nhận cho buổi học này.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {historyLogs.map((log) => {
                const before = log.before_state || {};
                const after = log.after_state || {};
                return (
                  <div key={log.id} className="relative space-y-2">
                    {/* Timeline bullet */}
                    <span className="absolute -left-6 top-1.5 flex h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 bg-amber-500 shadow-sm" />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        {log.actor_name || "Quản trị viên"}
                        {log.actor_role && (
                          <span className="ml-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 uppercase">
                            {log.actor_role}
                          </span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Phạm vi:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {scopeLabel(log.scope)}
                        </span>
                      </div>

                      {(before.startTime || after.startTime) && (
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <span className="line-through text-slate-400">
                            {formatDateTime(before.startTime || before.start_time)}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {formatDateTime(after.startTime || after.start_time)}
                          </span>
                        </div>
                      )}

                      {log.reason && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            Lý do thay đổi:
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {log.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
