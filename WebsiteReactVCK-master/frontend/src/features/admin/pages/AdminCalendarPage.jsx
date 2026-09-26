import { useCallback, useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { fetchAdminCalendar } from "../../api/lmsClient";
import { LoadingState, ErrorState, EmptyState } from "../../../components/common/StateView";
import AdminCalendarConflictBanner from "../components/calendar/AdminCalendarConflictBanner";
import AdminCalendarFilterBar from "../components/calendar/AdminCalendarFilterBar";
import AdminCalendarSessionRow from "../components/calendar/AdminCalendarSessionRow";
import SessionChangeHistoryModal from "../../calendar/components/SessionChangeHistoryModal";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";

export default function AdminCalendarPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ sessions: [], conflicts: [], classes: [], teachers: [], summary: {} });
  const [filters, setFilters] = useState({ timeRange: "next_30_days", classId: "", teacherId: "", status: "" });
  const [selectedSessionForHistory, setSelectedSessionForHistory] = useState(null);

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
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header Hero */}
        <section className="rounded-3xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/40 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-950 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
                <Calendar className="h-3.5 w-3.5" /> Điều phối lịch toàn trường
              </span>
              <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                Trung tâm Quản trị Lịch học
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Theo dõi tất cả buổi học của các lớp, phát hiện xung đột giảng viên/lớp và xem lịch sử điều chỉnh.
              </p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng số buổi</p>
                <p className="mt-0.5 text-lg font-black text-slate-800 dark:text-slate-200">{summary.total || 0}</p>
              </div>
              <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-center">
                <p className="text-[10px] font-bold text-blue-500 uppercase">Đã lên lịch</p>
                <p className="mt-0.5 text-lg font-black text-blue-600 dark:text-blue-400">{summary.scheduled || 0}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center">
                <p className="text-[10px] font-bold text-amber-500 uppercase">Đã dời lịch</p>
                <p className="mt-0.5 text-lg font-black text-amber-600 dark:text-amber-400">{summary.rescheduled || 0}</p>
              </div>
              <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-center">
                <p className="text-[10px] font-bold text-rose-500 uppercase">Xung đột</p>
                <p className="mt-0.5 text-lg font-black text-rose-600 dark:text-rose-400">{conflicts.length}</p>
              </div>
            </div>
          </div>
        </section>

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
          onRefresh={loadCalendar}
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
          <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-850/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Buổi học & Lớp</th>
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4">Giảng viên</th>
                    <th className="py-3 px-4">Trạng thái</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {sessions.map((session) => (
                    <AdminCalendarSessionRow
                      key={session.id}
                      session={session}
                      onOpenHistory={(sess) => setSelectedSessionForHistory(sess)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit History Modal */}
        <SessionChangeHistoryModal
          isOpen={Boolean(selectedSessionForHistory)}
          onClose={() => setSelectedSessionForHistory(null)}
          sessionId={selectedSessionForHistory?.id}
          sessionTitle={selectedSessionForHistory?.title}
        />
      </div>
    </div>
  );
}
