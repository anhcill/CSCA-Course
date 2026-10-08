import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiLayers,
  FiSearch,
  FiEye,
  FiX,
  FiActivity,
  FiChevronLeft,
  FiChevronRight,
  FiZap,
} from "react-icons/fi";
import { fetchAdminSyncOverview, fetchAdminDeliveryQueue, retryDeliveryQueueItem } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";

const EVENT_STAGES = {
  "teacher.upserted": "Đồng bộ hồ sơ giáo viên",
  "course.upserted": "Tạo hoặc cập nhật khóa học",
  "class.upserted": "Tạo hoặc cập nhật lớp học",
  "class.teacher.assigned": "Phân công giáo viên",
  "student.provisioned": "Tạo hoặc liên kết học viên",
  "class.membership.changed": "Ghi danh học viên vào lớp",
  "entitlement.changed": "Cấp quyền học",
  "payment.refunded": "Thu hồi quyền sau hoàn tiền",
};

const explainJobError = (item) => {
  const error = (item?.lastError || "").toLowerCase();
  if (!error) return null;
  if (/email đã liên kết|identity.*conflict|student.*khác/.test(error))
    return "Kiểm tra học viên có cùng email ở hai lớp. Liên kết về một mã học viên chung trên hệ thống quản lý rồi đồng bộ lại.";
  if (/chưa có giáo viên|teacher.*chưa|role dạy học|giáo viên.*role/.test(error))
    return "Đồng bộ hồ sơ giáo viên có email và vai trò dạy học trước, sau đó thử lại khóa hoặc lớp.";
  if (/chưa có mapping khóa|course.*chưa|khóa.*chưa/.test(error))
    return "Đảm bảo sự kiện khóa học đã thành công trước khi thử lại lớp hoặc quyền học.";
  if (/chưa có mapping lớp|class.*chưa|lớp.*chưa/.test(error))
    return "Đảm bảo sự kiện lớp học đã thành công trước khi ghi danh học viên hoặc gửi điểm danh.";
  if (/chưa được provision|học viên.*chưa/.test(error))
    return "Đồng bộ tài khoản học viên trước khi ghi danh hoặc cấp quyền học.";
  if (/duplicate key.*external_course_id|external_course_id.*duplicate/.test(error))
    return "Mã khóa học Web đã gắn với khóa khác. Kiểm tra mã nguồn khóa và liên kết cũ trước khi thử lại.";
  if (/duplicate key.*management_class_source_id|management_class_source_id.*duplicate/.test(error))
    return "Mã lớp đã tồn tại trên Web. Kiểm tra liên kết lớp hiện có trước khi thử lại.";
  if (/violates foreign key|foreign key constraint/.test(error))
    return "Một dữ liệu phụ thuộc chưa tồn tại. Xem bước sự kiện và đồng bộ dữ liệu cha trước.";
  if (/không hợp lệ|invalid|validation|must be|phải là/.test(error))
    return "Kiểm tra dữ liệu nguồn của sự kiện này trên hệ thống quản lý. Sau khi sửa dữ liệu, gửi lại sự kiện mới.";
  if (/timeout|connection|network|econn|503|502|500/.test(error))
    return "Kiểm tra kết nối và tình trạng Railway của hai hệ thống, rồi thử lại khi dịch vụ ổn định.";
  return "Xem lỗi đầy đủ bên dưới và đối chiếu dữ liệu nguồn. Chỉ thử lại sau khi nguyên nhân đã được xử lý.";
};

const sourceIdentifiers = (item) => {
  const payload = item?.sourcePayload || {};
  return [
    ["Giáo viên", payload.teacherSourceId],
    ["Khóa học", payload.courseSourceId],
    ["Lớp", payload.classSourceId],
    ["Học viên", payload.studentSourceId || payload.externalStudentId],
    ["Ghi danh", payload.membershipSourceId],
  ].filter(([, value]) => typeof value === "string" && value.trim());
};

export default function AdminSyncPage() {
  const [overview, setOverview] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, limit: 20 });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [ovRes, qRes] = await Promise.all([
        fetchAdminSyncOverview(),
        fetchAdminDeliveryQueue({ status: statusFilter, page, limit: 20, search: appliedSearch }),
      ]);
      if (!ovRes?.success) throw new Error(ovRes?.message || "Không thể tải tổng quan đồng bộ.");
      if (!qRes?.success) throw new Error(qRes?.message || "Không thể tải hàng đợi đồng bộ.");
      setOverview(ovRes.data || null);
      setQueue(Array.isArray(qRes.data?.items) ? qRes.data.items : []);
      setPagination({ total: Number(qRes.data?.total || 0), limit: Number(qRes.data?.limit || 20) });
    } catch (err) {
      console.error("Error loading sync data:", err);
      setOverview(null);
      setQueue([]);
      setErrorMessage(err.message || "Không thể tải dữ liệu đồng bộ!");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, appliedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(searchTerm);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const handleRetry = async (item) => {
    setRetryingId(item.id);
    try {
      const response = await retryDeliveryQueueItem(item.id);
      const retriedItem = response?.data;
      if (!response?.success || !retriedItem) throw new Error(response?.message || "Không thể thử lại job.");
      toast.success(`Đã phát lệnh thử lại cho job #${item.id}! Hệ thống đang tái xử lý.`);
      await loadData();
    } catch (error) {
      toast.error(error.message || `Thử lại job #${item.id} thất bại!`);
    } finally {
      setRetryingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const canRetry = (item) => ["FAILED", "DEAD_LETTER"].includes(item.status);
  const changeStatus = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "DEAD_LETTER":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            DEAD LETTER
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            FAILED
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
            PENDING
          </span>
        );
      case "SUCCESS":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            SUCCESS
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 mb-2">
            <FiActivity className="w-3.5 h-3.5" />
            <span>MolyBridge Sync Monitor & Outbox Queue</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Giám Sát Đồng Bộ & Hàng Đợi Outbox
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Theo dõi trạng thái đồng bộ hai chiều giữa LMS và hệ thống MolyInternal trung tâm.
          </p>
          {overview?.lastSyncTime && <p className="mt-2 text-[11px] font-mono text-gray-400">Cập nhật queue gần nhất: {new Date(overview.lastSyncTime).toLocaleString("vi-VN")}</p>}
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition border border-gray-700"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới hàng đợi</span>
        </button>
      </div>

      {/* KPI Stats Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tổng Lệnh Đồng Bộ
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <FiLayers className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 dark:text-white mt-3 font-mono">
            {(overview?.totalJobs ?? 0).toLocaleString()}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Lệnh tạo trong 24 giờ qua</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Hàng Đợi Chờ Xử Lý
            </span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
              <FiClock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-sky-500 mt-3 font-mono">
            {overview?.outboxPending ?? 0}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Đang chờ hoặc đang xử lý</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Dead-Letter Queue (DLQ)
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <FiAlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-rose-500 mt-3 font-mono">
            {overview?.deadLetterCount ?? 0}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Lệnh cần sửa dữ liệu hoặc kiểm tra thủ công</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tỷ Lệ Thành Công
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <FiCheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-500 mt-3 font-mono">
            {overview?.successRate ?? "0.0%"}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Trong số lệnh tạo trong 24 giờ qua</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {["ALL", "PENDING", "PROCESSING", "FAILED", "DEAD_LETTER", "SUCCESS"].map((st) => (
            <button
              key={st}
              onClick={() => changeStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === st
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {st}
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
            placeholder="Tìm toàn bộ hàng đợi theo ID, sự kiện, lỗi..."
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-purple-500 transition"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
          <span>{errorMessage}</span>
          <button type="button" onClick={loadData} className="shrink-0 font-bold underline">Thử lại</button>
        </div>
      )}

      {/* Delivery Queue Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3.5 px-5">Job ID & Correlation</th>
                <th className="py-3.5 px-4">Sự Kiện (Event)</th>
                <th className="py-3.5 px-4">Entity Map</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4 text-center">Retries</th>
                <th className="py-3.5 px-5">Lỗi Gần Nhất</th>
                <th className="py-3.5 px-5 text-right">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <Loading loading={true} text="Đang nạp dữ liệu hàng đợi Outbox..." fullScreen={false} />
                  </td>
                </tr>
              ) : queue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Không có bản ghi hàng đợi nào phù hợp.
                  </td>
                </tr>
              ) : (
                queue.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-4 px-5">
                      <div className="font-mono font-bold text-gray-900 dark:text-white">{item.id}</div>
                      <div className="font-mono text-[10px] text-gray-400 mt-0.5">{item.correlationId}</div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                        {item.eventType}
                      </span>
                      <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">{EVENT_STAGES[item.eventType] || "Xử lý đồng bộ"}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(item.createdAt).toLocaleTimeString("vi-VN")} -{" "}
                        {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px]">
                      <span className="text-gray-500">{item.entityType}:</span>{" "}
                      <span className="font-semibold text-gray-900 dark:text-white">{item.entityId}</span>
                    </td>
                    <td className="py-4 px-4 text-center">{getStatusBadge(item.status)}</td>
                    <td className="py-4 px-4 text-center font-mono font-bold">
                      <span className={item.retryCount >= item.maxRetries ? "text-rose-500" : "text-gray-500"}>
                        {item.retryCount}
                      </span>
                      <span className="text-gray-400">/{item.maxRetries}</span>
                    </td>
                    <td className="py-4 px-5 min-w-64 max-w-md text-[11px]">
                      {item.lastError ? (
                        <div className="space-y-1.5">
                          <p className="font-semibold text-rose-600 dark:text-rose-400 whitespace-pre-wrap break-words">{item.lastError}</p>
                          <p className="text-gray-600 dark:text-gray-300 whitespace-normal">Cách xử lý: {explainJobError(item)}</p>
                          {item.status === "PENDING" && item.retryCount > 0 && item.nextAttemptAt && (
                            <p className="text-amber-600 dark:text-amber-400">Thử lại tự động: {new Date(item.nextAttemptAt).toLocaleString("vi-VN")}</p>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
                          title="Xem lỗi và dữ liệu sự kiện"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        {canRetry(item) && (
                          <button
                            onClick={() => handleRetry(item)}
                            disabled={retryingId === item.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-[11px] transition shadow-sm"
                          >
                            <FiZap className={`w-3.5 h-3.5 ${retryingId === item.id ? "animate-spin" : ""}`} />
                            <span>Thử lại</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Hiển thị trang {page}/{totalPages} · {pagination.total} giao dịch</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40 transition"><FiChevronLeft className="h-3.5 w-3.5" /> Trước</button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40 transition">Sau <FiChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {/* Payload Drawer / Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Chi Tiết Giao Dịch Outbox #{selectedItem.id}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Correlation ID: {selectedItem.correlationId}
                </p>
                {selectedItem.sourceEventId && <p className="text-xs text-gray-500 font-mono mt-0.5">Event ID: {selectedItem.sourceEventId}</p>}
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-white transition"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">Idempotency Key</span>
                <span className="font-mono text-gray-900 dark:text-white">{selectedItem.idempotencyKey}</span>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">Trạng Thái</span>
                <div className="mt-0.5">{getStatusBadge(selectedItem.status)}</div>
              </div>
            </div>

            {selectedItem.lastError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-mono">
                  <span className="font-bold block text-[10px] uppercase">Lỗi cụ thể tại bước {EVENT_STAGES[selectedItem.eventType] || selectedItem.eventType}:</span>
                {selectedItem.lastError}
                  <p className="mt-2 text-gray-700 dark:text-gray-200 font-sans">Cách xử lý: {explainJobError(selectedItem)}</p>
              </div>
            )}

            <div>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2">Mã nguồn để đối chiếu:</span>
              {sourceIdentifiers(selectedItem).length > 0 ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sourceIdentifiers(selectedItem).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs">
                      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                      <dd className="font-mono text-gray-900 dark:text-white break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-xs text-gray-500 dark:text-gray-400">Event ID và Correlation ID ở phía trên dùng để tra cứu log.</p>}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Đóng
              </button>
              {canRetry(selectedItem) && <button
                onClick={() => {
                  handleRetry(selectedItem);
                  setSelectedItem(null);
                }}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md"
              >
                <FiZap className="w-4 h-4" />
                <span>Kích hoạt Thử lại ngay</span>
              </button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
