import { useCallback, useEffect, useState } from "react";
import { Calendar, RefreshCw } from "lucide-react";
import { fetchAdminCalendar, fetchAdminSessionHistory, updateLiveSession } from "../../api/lmsClient";
import { LoadingState, ErrorState, EmptyState } from "../../../components/common/StateView";
import AdminCalendarConflictBanner from "../components/calendar/AdminCalendarConflictBanner";
import AdminCalendarFilterBar from "../components/calendar/AdminCalendarFilterBar";
import AdminCalendarSessionRow from "../components/calendar/AdminCalendarSessionRow";
import SessionChangeHistoryModal from "../../calendar/components/SessionChangeHistoryModal";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import AdminSessionRescheduleModal from "../components/calendar/AdminSessionRescheduleModal";

export default function AdminCalendarPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ sessions: [], conflicts: [], classes: [], teachers: [], summary: {} });
  const [filters, setFilters] = useState({ timeRange: "next_30_days", classId: "", teacherId: "", status: "" });
  const [selectedSessionForHistory, setSelectedSessionForHistory] = useState(null);
  const [selectedSessionForEdit, setSelectedSessionForEdit] = useState(null);

  const calculateDateRange = useCallback((timeRange) => {
    const now = new Date();
    if (timeRange === "this_week") {
      const day = now.getDay() || 7;
      const start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    if (timeRange === "next_week") {
      const day = now.getDay() || 7;
      const start = new Date(now);
      start.setDate(now.getDate() - day + 8);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    if (timeRange === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    if (timeRange === "all") return {};
    const from = new Date(now.getTime() - 2 * 86400000).toISOString();
    const to = new Date(now.getTime() + 30 * 86400000).toISOString();
    return { from, to };
  }, []);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const dateRange = calculateDateRange(filters.timeRange);
      const res = await fetchAdminCalendar({
        ...dateRange,
        classId: filters.classId,
        teacherId: filters.teacherId,
        status: filters.status,
      });
      setData(res?.data || { sessions: [], conflicts: [], classes: [], teachers: [], summary: {} });
    } catch (err) {
      console.error("Failed to load admin calendar:", err);
      setError("Không thể tải lịch điều phối.");
    } finally {
      setLoading(false);
    }
  }, [filters, calculateDateRange]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const unsubscribe = subscribeToCalendarChanges(loadCalendar);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadCalendar();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadCalendar]);

  const handleFilterChange = (key, val) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  };

  const summary = data.summary || {};
  const sessions = data.sessions || [];
  const conflicts = data.conflicts || [];

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      {/* Compact Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Lịch học toàn hệ thống
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Theo dõi buổi học các lớp, phát hiện trùng lịch giảng viên và xem lịch sử điều chỉnh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadCalendar}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Đang cập nhật..." : "Làm mới"}</span>
          </button>
        </div>
      </div>

      {/* Compact KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/85 bg-white/95 px-4 py-3 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tổng số buổi</p>
          <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{summary.total || 0}</p>
        </div>
        <div className="rounded-2xl border border-white/85 bg-white/95 px-4 py-3 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">Đã lên lịch</p>
          <p className="mt-1 text-xl font-black text-blue-600 dark:text-sky-400">{summary.scheduled || 0}</p>
        </div>
        <div className="rounded-2xl border border-white/85 bg-white/95 px-4 py-3 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Đã dời lịch</p>
          <p className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400">{summary.rescheduled || 0}</p>
        </div>
        <div className="rounded-2xl border border-white/85 bg-white/95 px-4 py-3 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Xung đột</p>
          <p className="mt-1 text-xl font-black text-rose-600 dark:text-rose-400">{conflicts.length}</p>
        </div>
      </div>

      {/* Conflict Detection Banner */}
      <AdminCalendarConflictBanner
        conflicts={conflicts}
        onSelectSession={(sess) => setSelectedSessionForHistory(sess)}
      />

      {/* Filter Bar */}
      <AdminCalendarFilterBar
        filters={filters}
        onChangeFilter={handleFilterChange}
        classes={data.classes || []}
        teachers={data.teachers || []}
        loading={loading}
      />

      {/* Sessions Data Table */}
      {loading ? (
        <LoadingState message="Đang tải lịch điều phối các lớp..." count={4} />
      ) : error ? (
        <ErrorState title="Lỗi tải lịch" message={error} onRetry={loadCalendar} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Không tìm thấy buổi học nào"
          description="Không có buổi học nào khớp với bộ lọc hiện tại. Thử chọn khoảng thời gian rộng hơn."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2.5">Buổi học & Lớp</th>
                  <th className="px-3 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5">Giảng viên</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {sessions.map((session) => (
                  <AdminCalendarSessionRow
                    key={session.id}
                    session={session}
                    onOpenHistory={(sess) => setSelectedSessionForHistory(sess)}
                    onReschedule={setSelectedSessionForEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session History Modal */}
      <SessionChangeHistoryModal
        isOpen={Boolean(selectedSessionForHistory)}
        onClose={() => setSelectedSessionForHistory(null)}
        sessionId={selectedSessionForHistory?.id}
        sessionTitle={selectedSessionForHistory?.title}
        loadHistory={fetchAdminSessionHistory}
      />
      <AdminSessionRescheduleModal
        session={selectedSessionForEdit}
        onClose={() => setSelectedSessionForEdit(null)}
        onSave={async ({ startTime, endTime, changeReason }) => {
          await updateLiveSession({
            sessionId: selectedSessionForEdit.id,
            startTime,
            endTime,
            changeReason,
            expectedVersion: selectedSessionForEdit.version,
          });
          setSelectedSessionForEdit(null);
          await loadCalendar();
        }}
      />
    </div>
  );
}
