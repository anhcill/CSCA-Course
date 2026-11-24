import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  fetchAdminSyncOverview,
  fetchAdminDeliveryQueue,
  retryDeliveryQueueItem,
  fetchMolyInboxOps,
  retryMolyInboxJob,
  fetchMolyConflicts,
  resolveMolyConflict,
} from "../../features/api/lmsClient";
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

const STATUS_OPTIONS = [
  { key: "ALL", label: "Tất cả" },
  { key: "PENDING", label: "Chờ xử lý" },
  { key: "PROCESSING", label: "Đang xử lý" },
  { key: "FAILED", label: "Tạm lỗi" },
  { key: "DEAD_LETTER", label: "Lỗi cần xử lý lại" },
  { key: "SUCCESS", label: "Thành công" },
];

const INBOX_STATUS_LABELS = {
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  failed: "Tạm lỗi",
  dead_letter: "Lỗi dừng",
  processed: "Đã xử lý",
};

const CARD_CLASS =
  "rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";
const FILTER_BAR_CLASS =
  "rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

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
    return "Mã khóa học đã gắn với khóa khác. Kiểm tra mã nguồn khóa và liên kết cũ trước khi thử lại.";
  if (/duplicate key.*management_class_source_id|management_class_source_id.*duplicate/.test(error))
    return "Mã lớp đã tồn tại. Kiểm tra liên kết lớp hiện có trước khi thử lại.";
  if (/violates foreign key|foreign key constraint/.test(error))
    return "Một dữ liệu phụ thuộc chưa tồn tại. Kiểm tra bước đồng bộ và đồng bộ dữ liệu cha trước.";
  if (/không hợp lệ|invalid|validation|must be|phải là/.test(error))
    return "Kiểm tra dữ liệu nguồn trên hệ thống quản lý. Sau khi sửa dữ liệu, gửi lại sự kiện mới.";
  if (/timeout|connection|network|econn|503|502|500/.test(error))
    return "Kiểm tra kết nối giữa hai hệ thống rồi thử lại khi dịch vụ ổn định.";
  return "Xem chi tiết lỗi và đối chiếu dữ liệu nguồn. Chỉ thử lại sau khi đã xử lý nguyên nhân.";
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
  const [molyOps, setMolyOps] = useState(null);
  const [molyConflicts, setMolyConflicts] = useState([]);
  const [molyRetryingId, setMolyRetryingId] = useState(null);
  const [conflictUserInputs, setConflictUserInputs] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [ovRes, qRes] = await Promise.all([
        fetchAdminSyncOverview(),
        fetchAdminDeliveryQueue({
          status: statusFilter,
          page,
          limit: 20,
          search: appliedSearch,
        }),
      ]);
      if (!ovRes?.success) throw new Error(ovRes?.message || "Không thể tải tổng quan đồng bộ.");
      if (!qRes?.success) throw new Error(qRes?.message || "Không thể tải hàng đợi đồng bộ.");
      setOverview(ovRes.data || null);
      setQueue(Array.isArray(qRes.data?.items) ? qRes.data.items : []);
      setPagination({
        total: Number(qRes.data?.total || 0),
        limit: Number(qRes.data?.limit || 20),
      });

      const [opsSettled, conflictSettled] = await Promise.allSettled([
        fetchMolyInboxOps({ limit: 30 }),
        fetchMolyConflicts({ sourceSystem: "moly" }),
      ]);
      if (opsSettled.status === "fulfilled" && opsSettled.value?.success) {
        setMolyOps(opsSettled.value.data || null);
      }
      if (conflictSettled.status === "fulfilled" && conflictSettled.value?.success) {
        setMolyConflicts(
          Array.isArray(conflictSettled.value.data) ? conflictSettled.value.data : []
        );
      }
    } catch (err) {
      console.error("Error loading sync data:", err);
      setOverview(null);
      setQueue([]);
      setErrorMessage(err.message || "Không thể tải dữ liệu đồng bộ.");
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
      if (!response?.success || !retriedItem) {
        throw new Error(response?.message || "Không thể thử lại lệnh đồng bộ.");
      }
      toast.success(`Đã gửi yêu cầu thử lại cho lệnh #${item.id}.`);
      await loadData();
    } catch (error) {
      toast.error(error.message || `Thử lại lệnh #${item.id} thất bại.`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryMolyInbox = async (row) => {
    setMolyRetryingId(row.id);
    try {
      const res = await retryMolyInboxJob(row.id);
      if (!res?.success) throw new Error(res?.message || "Không thể thử lại sự kiện hộp thư.");
      toast.success(`Đã đưa sự kiện #${row.id} về hàng đợi chờ xử lý.`);
      await loadData();
    } catch (error) {
      toast.error(error.message || `Thử lại sự kiện #${row.id} thất bại.`);
    } finally {
      setMolyRetryingId(null);
    }
  };

  const handleResolveMolyConflict = async (conflict, action) => {
    try {
      const targetUserId =
        action === "link_existing"
          ? Number(conflictUserInputs[conflict.id] || conflict.candidate_user_id)
          : undefined;
      const res = await resolveMolyConflict(conflict.id, {
        action,
        ...(targetUserId ? { targetUserId } : {}),
        resolutionNote: "Resolved from AdminSyncPage",
      });
      if (!res?.success) throw new Error(res?.message || "Không thể xử lý xung đột tài khoản.");
      toast.success(`Đã xử lý xung đột #${conflict.id}.`);
      await loadData();
    } catch (error) {
      toast.error(error.message || `Xử lý xung đột #${conflict.id} thất bại.`);
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            Lỗi cần xử lý
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Tạm lỗi
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            Chờ xử lý
          </span>
        );
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
            Đang xử lý
          </span>
        );
      case "SUCCESS":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Thành công
          </span>
        );
      default:
        return (
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  const openConflicts = (molyConflicts || []).filter((c) => c.status === "open");

  return (
    <div className="min-w-0 space-y-5 pb-8">
      {/* Compact Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Đồng bộ dữ liệu
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Theo dõi hàng đợi đồng bộ hai chiều, xử lý lỗi và đối chiếu xung đột tài khoản.
            {overview?.lastSyncTime
              ? ` Cập nhật lúc ${new Date(overview.lastSyncTime).toLocaleString("vi-VN")}.`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={loadData} disabled={loading} className={BTN_SECONDARY}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${CARD_CLASS} min-w-0 p-4`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tổng lượt đồng bộ
              </p>
              <p className="mt-1.5 font-mono text-2xl font-black text-slate-900 dark:text-white">
                {(overview?.totalJobs ?? 0).toLocaleString("vi-VN")}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Trong 24 giờ qua</p>
        </div>

        <div className={`${CARD_CLASS} min-w-0 p-4`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Hàng đợi chờ xử lý
              </p>
              <p className="mt-1.5 font-mono text-2xl font-black text-sky-600 dark:text-sky-400">
                {overview?.outboxPending ?? 0}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Đang chờ hoặc đang xử lý
          </p>
        </div>

        <div className={`${CARD_CLASS} min-w-0 p-4`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Lỗi cần xử lý lại
              </p>
              <p className="mt-1.5 font-mono text-2xl font-black text-rose-600 dark:text-rose-400">
                {overview?.deadLetterCount ?? 0}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Cần kiểm tra hoặc thử lại thủ công
          </p>
        </div>

        <div className={`${CARD_CLASS} min-w-0 p-4`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tỷ lệ thành công
              </p>
              <p className="mt-1.5 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {overview?.successRate ?? "0.0%"}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Trong 24 giờ qua</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className={FILTER_BAR_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => changeStatus(key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === key
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
              placeholder="Tìm mã lệnh, loại sự kiện, lỗi..."
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
          <button type="button" onClick={loadData} className="font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* Main Delivery Queue Table */}
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Hàng đợi đồng bộ ({pagination.total})
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Danh sách lệnh đồng bộ dữ liệu gần đây và hướng dẫn xử lý khi có lỗi.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Mã lệnh</th>
                <th className="px-3 py-2.5">Loại đồng bộ</th>
                <th className="px-3 py-2.5">Đối tượng</th>
                <th className="px-3 py-2.5 text-center">Trạng thái</th>
                <th className="px-3 py-2.5 text-center">Lần thử</th>
                <th className="px-3 py-2.5">Chi tiết lỗi & Hướng xử lý</th>
                <th className="px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/70 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <Loading
                      loading={true}
                      text="Đang tải hàng đợi đồng bộ..."
                      fullScreen={false}
                    />
                  </td>
                </tr>
              ) : queue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Không có lệnh đồng bộ nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                queue.map((item) => (
                  <tr
                    key={item.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                        #{item.id}
                      </div>
                      <div className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] text-slate-400">
                        {item.correlationId}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {EVENT_STAGES[item.eventType] || "Xử lý đồng bộ"}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                        {item.eventType}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {new Date(item.createdAt).toLocaleTimeString("vi-VN")} ·{" "}
                        {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top font-mono text-[11px]">
                      <span className="text-slate-400">{item.entityType}:</span>{" "}
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {item.entityId}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-center">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-3 py-2.5 align-top text-center font-mono font-bold">
                      <span
                        className={
                          item.retryCount >= item.maxRetries
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-slate-600 dark:text-slate-300"
                        }
                      >
                        {item.retryCount}
                      </span>
                      <span className="text-slate-400">/{item.maxRetries}</span>
                    </td>
                    <td className="min-w-[240px] max-w-md px-3 py-2.5 align-top text-[11px]">
                      {item.lastError ? (
                        <div className="space-y-1">
                          <p className="font-semibold text-rose-600 dark:text-rose-400 whitespace-pre-wrap break-words">
                            {item.lastError}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300">
                            Hướng xử lý: {explainJobError(item)}
                          </p>
                          {item.status === "PENDING" && item.retryCount > 0 && item.nextAttemptAt && (
                            <p className="text-amber-600 dark:text-amber-400">
                              Thử lại tự động: {new Date(item.nextAttemptAt).toLocaleString("vi-VN")}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          title="Xem chi tiết lệnh đồng bộ"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canRetry(item) && (
                          <button
                            type="button"
                            onClick={() => handleRetry(item)}
                            disabled={retryingId === item.id}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            <RotateCcw
                              className={`h-3 w-3 ${retryingId === item.id ? "animate-spin" : ""}`}
                            />
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

        {pagination.total > pagination.limit && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Trang {page}/{totalPages} · {pagination.total} lệnh
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

      {/* Integration Inbox & Account Conflicts */}
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Hộp thư đồng bộ & Xung đột tài khoản
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Chờ xử lý: {molyOps?.inboxCounts?.pending ?? 0} · Tạm lỗi:{" "}
              {molyOps?.inboxCounts?.failed ?? 0} · Lỗi dừng:{" "}
              {molyOps?.inboxCounts?.dead_letter ?? 0} · Đã xử lý:{" "}
              {molyOps?.inboxCounts?.processed ?? 0}
            </p>
          </div>

          {molyOps?.killSwitchActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Tạm dừng đồng bộ đang bật
            </span>
          )}
        </div>

        <div className="space-y-4 p-4">
          {openConflicts.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-800/50 dark:bg-amber-950/20">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Xung đột tài khoản cần xử lý ({openConflicts.length})
              </div>
              {openConflicts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-200/70 bg-white px-3 py-2.5 text-xs dark:border-amber-800/40 dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white">
                      #{c.id} {c.conflict_type}
                    </span>{" "}
                    · Mã ngoài:{" "}
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {c.external_user_id || "—"}
                    </span>{" "}
                    · <span className="text-slate-600 dark:text-slate-300">{c.reason}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="ID tài khoản"
                      value={
                        conflictUserInputs[c.id] ??
                        (c.candidate_user_id ? String(c.candidate_user_id) : "")
                      }
                      onChange={(e) =>
                        setConflictUserInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleResolveMolyConflict(c, "link_existing")}
                      className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
                    >
                      Liên kết
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveMolyConflict(c, "dismiss")}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Bỏ qua
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Mã sự kiện</th>
                  <th className="px-3 py-2.5">Trạng thái / Lần thử</th>
                  <th className="px-3 py-2.5">Mã theo dõi</th>
                  <th className="px-3 py-2.5">Lỗi gần nhất</th>
                  <th className="px-3 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/70 dark:text-slate-200">
                {(molyOps?.items || []).map((row) => (
                  <tr
                    key={row.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        #{row.id} · {EVENT_STAGES[row.event_type] || row.event_type}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">{row.aggregate_id}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">
                        {INBOX_STATUS_LABELS[row.status] || row.status}
                      </span>{" "}
                      <span className="font-mono text-slate-400">
                        ({row.attempt_count}/{row.max_attempts})
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {row.correlation_id || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-rose-600 dark:text-rose-400">
                      {row.last_error_code
                        ? `${row.last_error_code}: ${row.last_error_message || ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {["failed", "dead_letter"].includes(row.status) && (
                        <button
                          type="button"
                          onClick={() => handleRetryMolyInbox(row)}
                          disabled={
                            molyRetryingId === row.id || Boolean(molyOps?.killSwitchActive)
                          }
                          className="rounded-xl bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          Thử lại
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(!molyOps?.items || molyOps.items.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Chưa có sự kiện nào trong hộp thư đồng bộ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Payload Inspection Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="text-base font-black text-[#102f63] dark:text-white">
                  Chi tiết lệnh đồng bộ #{selectedItem.id}
                </h3>
                <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Mã theo dõi: {selectedItem.correlationId}
                </p>
                {selectedItem.sourceEventId && (
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Mã sự kiện nguồn: {selectedItem.sourceEventId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Mã chống trùng lặp
                </span>
                <span className="mt-1 block break-all font-mono text-slate-900 dark:text-white">
                  {selectedItem.idempotencyKey}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Trạng thái
                </span>
                <div className="mt-1">{getStatusBadge(selectedItem.status)}</div>
              </div>
            </div>

            {selectedItem.lastError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs dark:border-rose-900/60 dark:bg-rose-950/30">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Lỗi tại bước: {EVENT_STAGES[selectedItem.eventType] || selectedItem.eventType}
                </span>
                <p className="mt-1 font-mono text-rose-600 dark:text-rose-300 break-words">
                  {selectedItem.lastError}
                </p>
                <p className="mt-2 text-slate-700 dark:text-slate-200">
                  Hướng xử lý: {explainJobError(selectedItem)}
                </p>
              </div>
            )}

            <div>
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mã nguồn đối chiếu
              </span>
              {sourceIdentifiers(selectedItem).length > 0 ? (
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {sourceIdentifiers(selectedItem).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="mt-0.5 break-all font-mono font-semibold text-slate-900 dark:text-white">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sử dụng Mã sự kiện nguồn và Mã theo dõi ở trên để tra cứu dữ liệu.
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className={BTN_SECONDARY}
              >
                Đóng
              </button>
              {canRetry(selectedItem) && (
                <button
                  type="button"
                  onClick={() => {
                    handleRetry(selectedItem);
                    setSelectedItem(null);
                  }}
                  className={BTN_PRIMARY}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Thử lại ngay</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
