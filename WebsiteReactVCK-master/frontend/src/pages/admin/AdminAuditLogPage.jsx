import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Globe,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { fetchAdminAuditLogs } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";

const ACTION_OPTIONS = [
  { key: "ALL", label: "Tất cả" },
  { key: "ENTITLEMENT_GRANT", label: "Cấp quyền học" },
  { key: "GRADE_SUBMISSION", label: "Cập nhật điểm" },
  { key: "MOLY_BRIDGE_SYNC", label: "Đồng bộ dữ liệu" },
];

const ACTION_LABELS = {
  ENTITLEMENT_GRANT: "Cấp quyền học",
  GRADE_SUBMISSION: "Cập nhật điểm",
  MOLY_BRIDGE_SYNC: "Đồng bộ dữ liệu",
};

const CARD_CLASS =
  "rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";
const FILTER_BAR_CLASS =
  "rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";
const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [selectedLog, setSelectedLog] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, limit: 20 });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetchAdminAuditLogs({
        action: actionFilter,
        search: appliedSearch,
        page,
        limit: 20,
      });
      if (!res?.success) throw new Error(res?.message || "Không thể tải nhật ký hoạt động.");
      setLogs(Array.isArray(res.data?.logs) ? res.data.logs : []);
      setPagination({
        total: Number(res.data?.total || 0),
        limit: Number(res.data?.limit || 20),
      });
    } catch (err) {
      console.error("Error loading audit logs:", err);
      setLogs([]);
      setErrorMessage(err.message || "Không thể tải nhật ký hoạt động.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, appliedSearch, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const changeAction = (action) => {
    setActionFilter(action);
    setPage(1);
  };

  return (
    <div className="min-w-0 space-y-5 pb-8">
      {/* Compact Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Nhật ký hoạt động
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Lịch sử cấp quyền học, cập nhật điểm số, đồng bộ dữ liệu và thao tác quản trị.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={loadLogs} disabled={loading} className={BTN_SECONDARY}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className={FILTER_BAR_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {ACTION_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => changeAction(key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  actionFilter === key
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tài khoản, hành động, đối tượng..."
              className={`${INPUT_CLASS} pl-8`}
            />
          </div>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <span>{errorMessage}</span>
          <button type="button" onClick={loadLogs} className="font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* Audit Log Table */}
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Bản ghi hoạt động ({pagination.total})
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Bấm biểu tượng xem để kiểm tra nội dung chi tiết của từng bản ghi.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Người thực hiện</th>
                <th className="px-3 py-2.5">Hành động</th>
                <th className="px-3 py-2.5">Đối tượng</th>
                <th className="px-3 py-2.5">Địa chỉ IP</th>
                <th className="px-3 py-2.5">Thời gian</th>
                <th className="px-3 py-2.5 text-center">Kết quả</th>
                <th className="px-3 py-2.5 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/70 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <Loading
                      loading={true}
                      text="Đang tải nhật ký hoạt động..."
                      fullScreen={false}
                    />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Chưa có bản ghi nhật ký hoạt động nào phù hợp.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                        <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span>{log.actor}</span>
                      </div>
                      <span className="mt-0.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {log.role}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {ACTION_LABELS[log.action] || log.action}
                      </div>
                      {ACTION_LABELS[log.action] && (
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {log.action}
                        </div>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {log.target}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>{log.ipAddress || "—"}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>
                          {new Date(log.timestamp).toLocaleTimeString("vi-VN")} ·{" "}
                          {new Date(log.timestamp).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {log.status === "SUCCESS" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Thành công
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3" />
                          Thất bại
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        title="Xem chi tiết bản ghi"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > pagination.limit && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Trang {page}/{totalPages} · {pagination.total} bản ghi
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className={BTN_SECONDARY}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Trước</span>
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className={BTN_SECONDARY}
              >
                <span>Sau</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-[#102f63] dark:text-white">
                  Chi tiết nhật ký #{selectedLog.id}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Thông tin bản ghi hoạt động hệ thống.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Người thực hiện
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedLog.actor}
                  </span>
                  <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {selectedLog.role}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Hành động & Đối tượng
                </span>
                <span className="mt-1 block font-bold text-blue-700 dark:text-blue-400">
                  {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                </span>
                <span className="mt-0.5 block text-slate-800 dark:text-slate-200">
                  {selectedLog.target}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Thời gian
                  </span>
                  <span className="mt-1 block font-mono text-slate-800 dark:text-slate-200">
                    {new Date(selectedLog.timestamp).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Địa chỉ IP
                  </span>
                  <span className="mt-1 block font-mono text-slate-800 dark:text-slate-200">
                    {selectedLog.ipAddress || "—"}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nội dung chi tiết
                </span>
                <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-800 dark:text-slate-200">
                  {selectedLog.details || "Không có chi tiết bổ sung."}
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3.5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className={BTN_SECONDARY}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
