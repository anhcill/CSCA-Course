import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiFileText,
  FiSearch,
  FiCheckCircle,
  FiAlertTriangle,
  FiRefreshCw,
  FiUser,
  FiGlobe,
  FiClock,
  FiEye,
  FiX,
} from "react-icons/fi";
import { fetchAdminAuditLogs } from "../../features/api/lmsClient";

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [selectedLog, setSelectedLog] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminAuditLogs({ action: actionFilter });
      if (res?.data?.logs) {
        setLogs(res.data.logs);
      }
    } catch (err) {
      console.error("Error loading audit logs:", err);
      toast.error("Không thể tải nhật ký kiểm toán!");
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      log.actor.toLowerCase().includes(term) ||
      log.action.toLowerCase().includes(term) ||
      log.target.toLowerCase().includes(term) ||
      log.details.toLowerCase().includes(term);
    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 mb-2">
            <FiFileText className="w-3.5 h-3.5" />
            <span>Immutable Security Audit Log</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Nhật Ký Kiểm Toán (Audit Trail)
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Ghi vết bất biến mọi hành vi quan trọng: cấp quyền học, sửa điểm, đồng bộ Moly và thao tác bảo mật.
          </p>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition border border-gray-700"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới nhật ký</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        {/* Action Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {["ALL", "ENTITLEMENT_GRANT", "GRADE_SUBMISSION", "MOLY_BRIDGE_SYNC"].map((act) => (
            <button
              key={act}
              onClick={() => setActionFilter(act)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                actionFilter === act
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {act === "ALL" ? "Tất cả hành động" : act}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-72">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo actor, action, target..."
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-amber-500 transition"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3.5 px-5">Tài Khoản (Actor)</th>
                <th className="py-3.5 px-4">Hành Động (Action)</th>
                <th className="py-3.5 px-4">Đối Tượng (Target)</th>
                <th className="py-3.5 px-4">Địa Chỉ IP</th>
                <th className="py-3.5 px-4">Thời Gian</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-5 text-right">Chi Tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Không có bản ghi nhật ký kiểm toán nào.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-4 px-5">
                      <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <FiUser className="w-3.5 h-3.5 text-gray-400" />
                        <span>{log.actor}</span>
                      </div>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 mt-1">
                        {log.role}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400 text-[11px]">
                      {log.action}
                    </td>
                    <td className="py-4 px-4 font-medium text-gray-900 dark:text-white max-w-xs truncate">
                      {log.target}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <FiGlobe className="w-3 h-3 text-gray-400" />
                        <span>{log.ipAddress}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <FiClock className="w-3 h-3 text-gray-400" />
                        <span>
                          {new Date(log.timestamp).toLocaleTimeString("vi-VN")} -{" "}
                          {new Date(log.timestamp).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      {log.status === "SUCCESS" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <FiCheckCircle className="w-3 h-3" />
                          SUCCESS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          <FiAlertTriangle className="w-3 h-3" />
                          FAILED
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
                        title="Xem chi tiết"
                      >
                        <FiEye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Chi Tiết Audit Log #{selectedLog.id}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bản ghi xác thực hành vi quản trị bảo mật.
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-white transition"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">Thực hiện bởi</span>
                <span className="font-bold text-gray-900 dark:text-white">{selectedLog.actor}</span>
                <span className="ml-2 font-mono text-[10px] text-purple-400">({selectedLog.role})</span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">Hành động & Đối tượng</span>
                <span className="font-mono text-indigo-400 font-bold block">{selectedLog.action}</span>
                <span className="text-gray-900 dark:text-white mt-1 block">{selectedLog.target}</span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">Nội dung chi tiết</span>
                <p className="text-gray-900 dark:text-white mt-1 leading-relaxed">{selectedLog.details}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
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
