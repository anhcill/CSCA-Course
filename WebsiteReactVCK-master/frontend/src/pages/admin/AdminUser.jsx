import { useState, useEffect, useCallback } from "react";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiLock,
  FiUnlock,
  FiEye,
  FiChevronLeft,
  FiChevronRight,
  FiUserCheck,
  FiAlertTriangle,
  FiMonitor,
  FiSmartphone,
  FiWifi,
  FiRefreshCw,
  FiX,
  FiUsers,
  FiShield,
} from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuthContext } from "../../context/AuthContext";
import useCUDUser from "../../hooks/useCUDUser";
import { fetchAdminUsers, toggleUserLockStatus } from "../../features/api/lmsClient";
import {
  fetchAdminTrustedDevices,
  removeAdminTrustedDevice,
} from "../../features/api/accountSecurityClient";
import Loading from "../../components/Loading.jsx";

const formatSecurityTime = (value) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Chưa có dữ liệu";

const isMobileDevice = (device) =>
  /iphone|ipad|android|mobile/i.test(`${device?.deviceName || ""} ${device?.userAgent || ""}`);

const LOCK_REASON_LABELS = {
  DEVICE_LIMIT_ABUSE: "Cố đăng nhập thiết bị thứ tư quá 3 lần",
  ADMIN_LOCK: "Quản trị viên khóa thủ công",
};

const ROLE_TABS = [
  { id: "all", label: "Tất cả" },
  { id: "user", label: "Học viên" },
  { id: "creator", label: "Giảng viên" },
  { id: "admin", label: "Quản trị" },
];

const ROLE_LABELS = {
  admin: "Quản trị",
  creator: "Giảng viên",
  user: "Học viên",
};

export default function AdminUser() {
  const { createUser, updateUser, deleteUser } = useCUDUser();
  const { authUser } = useAuthContext();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [totalItems, setTotalItems] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(0);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refetchUsers = useCallback(() => setRefreshIndex((value) => value + 1), []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | user | creator | admin
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | locked

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchPending = searchQuery.trim() !== debouncedSearch;

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [detailDevices, setDetailDevices] = useState({
    limit: null,
    used: 0,
    devices: [],
    security: null,
  });
  const [detailDevicesLoading, setDetailDevicesLoading] = useState(false);
  const [detailDevicesError, setDetailDevicesError] = useState("");

  // Confirm dialog modal state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "",
    confirmVariant: "danger", // danger | warning | primary
    onConfirm: null,
  });

  const [formData, setFormData] = useState({
    username: "",
    fullName: "",
    email: "",
    password: "",
    role: "user",
    gender: "male",
    hourlyRate: 0,
  });

  const [submitting, setSubmitting] = useState(false);

  const totalPages = Math.max(1, serverTotalPages);

  const loadDetailDevices = useCallback(async (userId) => {
    if (!userId) return;
    try {
      setDetailDevicesLoading(true);
      setDetailDevicesError("");
      const response = await fetchAdminTrustedDevices(userId);
      setDetailDevices(response?.data || { limit: null, used: 0, devices: [], security: null });
    } catch (error) {
      setDetailDevicesError(error?.message || "Không thể tải thiết bị tin cậy.");
    } finally {
      setDetailDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (searchPending) return undefined;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadError("");

    fetchAdminUsers({
      page: currentPage,
      limit: pageSize,
      search: debouncedSearch,
      role: roleFilter,
      status: statusFilter,
      signal: controller.signal,
    })
      .then((response) => {
        if (!active) return;
        const nextUsers = Array.isArray(response?.data) ? response.data : [];
        const pagination = response?.pagination || {};
        setUsers(nextUsers);
        setTotalItems(Number(pagination.total) || 0);
        setServerTotalPages(Number(pagination.totalPages) || 0);
        if (currentPage > 1 && nextUsers.length === 0) {
          setCurrentPage((page) => Math.max(1, page - 1));
        }
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;
        setUsers([]);
        setTotalItems(0);
        setServerTotalPages(0);
        setLoadError(error?.message || "Không thể tải danh sách người dùng.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentPage, pageSize, debouncedSearch, roleFilter, statusFilter, refreshIndex, searchPending]);

  useEffect(() => {
    if (!detailUser?.id) {
      setDetailDevices({ limit: null, used: 0, devices: [], security: null });
      setDetailDevicesError("");
      return;
    }
    setDetailDevices({ limit: null, used: 0, devices: [], security: null });
    loadDetailDevices(detailUser.id);
  }, [detailUser?.id, loadDetailDevices]);

  // Open Form Modal for Create or Edit
  const handleOpenFormModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username || "",
        fullName: user.fullName || user.username || "",
        email: user.email || "",
        password: "",
        role: user.role || "user",
        gender: user.gender || "male",
        hourlyRate: Number(user.hourlyRate ?? user.hourly_rate ?? 0),
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: "",
        fullName: "",
        email: "",
        password: "",
        role: "user",
        gender: "male",
        hourlyRate: 0,
      });
    }
    setIsFormModalOpen(true);
  };

  // Submit User Create / Update
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    if (!formData.username.trim() || !formData.email.trim()) {
      toast.error("Vui lòng điền tên đăng nhập và email.");
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error("Mật khẩu là bắt buộc khi tạo tài khoản mới.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password;
        await updateUser(editingUser.id, payload);
        toast.success(`Đã cập nhật tài khoản ${formData.username}.`);
      } else {
        await createUser(formData);
        toast.success(`Đã tạo mới tài khoản ${formData.username}.`);
      }
      setIsFormModalOpen(false);
      if (refetchUsers) refetchUsers();
    } catch (err) {
      console.error("Save user error:", err);
      toast.error(err?.message || "Có lỗi xảy ra khi lưu người dùng.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete User with custom confirm dialog
  const handleDeleteUser = useCallback(
    (user) => {
      if (user.id === authUser?.id) {
        toast.error("Bạn không thể tự xóa tài khoản quản trị của chính mình.");
        return;
      }

      setConfirmDialog({
        isOpen: true,
        title: "Xác nhận xóa tài khoản",
        message: `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${user.username}" (${user.email})? Thao tác này không thể hoàn tác.`,
        confirmLabel: "Xóa vĩnh viễn",
        confirmVariant: "danger",
        onConfirm: async () => {
          try {
            await deleteUser(user.id);
            toast.success(`Đã xóa tài khoản "${user.username}".`);
            if (refetchUsers) refetchUsers();
          } catch (err) {
            toast.error(err?.message || "Không thể xóa tài khoản này.");
          } finally {
            setConfirmDialog((p) => ({ ...p, isOpen: false }));
          }
        },
      });
    },
    [authUser, deleteUser, refetchUsers],
  );

  // Toggle Lock/Unlock User with confirm dialog
  const handleToggleLock = useCallback(
    (user) => {
      if (user.id === authUser?.id) {
        toast.error("Bạn không thể tự khóa tài khoản quản trị của chính mình.");
        return;
      }

      const willLock = !user.isLocked;

      setConfirmDialog({
        isOpen: true,
        title: willLock ? "Xác nhận khóa tài khoản" : "Mở khóa tài khoản",
        message: willLock
          ? `Tài khoản "${user.username}" sẽ bị đăng xuất ngay lập tức và không thể truy cập hệ thống.`
          : user.lockedReason === "DEVICE_LIMIT_ABUSE"
            ? `Mở khóa tài khoản "${user.username}" và đặt lại số lần vi phạm. Hai vị trí thiết bị vẫn được giữ nguyên; hãy xóa thiết bị cũ nếu người dùng cần đăng nhập máy mới.`
            : `Khôi phục quyền truy cập hệ thống cho tài khoản "${user.username}".`,
        confirmLabel: willLock ? "Khóa tài khoản" : "Mở khóa ngay",
        confirmVariant: willLock ? "danger" : "primary",
        onConfirm: async () => {
          try {
            await toggleUserLockStatus(user.id, willLock);
            toast.success(
              willLock
                ? `Đã khóa tài khoản "${user.username}".`
                : `Đã mở khóa tài khoản "${user.username}".`,
            );
            if (refetchUsers) refetchUsers();
          } catch (err) {
            console.error("Toggle user lock error:", err);
            toast.error(err?.message || "Không thể cập nhật trạng thái khóa tài khoản.");
          } finally {
            setConfirmDialog((p) => ({ ...p, isOpen: false }));
          }
        },
      });
    },
    [authUser, refetchUsers],
  );

  const handleRemoveTrustedDevice = useCallback(
    (device) => {
      if (!detailUser?.id) return;
      setConfirmDialog({
        isOpen: true,
        title: "Xóa thiết bị tin cậy",
        message: device.isCurrent
          ? `Đây là thiết bị quản trị đang sử dụng. Xóa “${device.deviceName}” sẽ thu hồi phiên hiện tại ngay sau thao tác.`
          : `Xóa “${device.deviceName}” khỏi tài khoản ${detailUser.username}? Tất cả phiên đăng nhập trên thiết bị này sẽ bị thu hồi ngay.`,
        confirmLabel: "Xóa thiết bị",
        confirmVariant: "danger",
        onConfirm: async () => {
          try {
            await removeAdminTrustedDevice(detailUser.id, device.id);
            toast.success("Đã xóa thiết bị và giải phóng một vị trí đăng nhập.");
            if (device.isCurrent) {
              window.dispatchEvent(new CustomEvent("csca:session-expired"));
            } else {
              await loadDetailDevices(detailUser.id);
              refetchUsers();
            }
          } catch (error) {
            toast.error(error?.message || "Không thể xóa thiết bị tin cậy.");
          } finally {
            setConfirmDialog((current) => ({ ...current, isOpen: false }));
          }
        },
      });
    },
    [detailUser, loadDetailDevices, refetchUsers],
  );

  const lockedOnPage = users.filter((u) => u.isLocked).length;

  return (
    <div className="min-w-0 space-y-5 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Quản lý người dùng
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Quản lý tài khoản học viên, giảng viên, phân quyền và thiết bị tin cậy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refetchUsers}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenFormModal(null)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <FiPlus className="h-3.5 w-3.5" />
            <span>Thêm người dùng</span>
          </button>
        </div>
      </div>

      {/* Compact Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tài khoản phù hợp
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FiUsers className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
            {totalItems}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Theo bộ lọc hiện tại
          </p>
        </div>

        <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đang hiển thị
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FiUserCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            {users.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Trang {currentPage} / {totalPages}
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đang bị khóa
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <FiShield className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400">
            {lockedOnPage}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Trên trang hiện tại
          </p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Role Quick Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setRoleFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  roleFilter === tab.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Dropdowns */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:w-64">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm tên, email, tên đăng nhập..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Đã bị khóa</option>
              </select>

              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value={8}>8 dòng / trang</option>
                <option value={15}>15 dòng / trang</option>
                <option value={30}>30 dòng / trang</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Users Table */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
            <thead className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5 pl-4">Người dùng</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5 text-center">Vai trò</th>
                <th className="px-3 py-2.5 text-center">Trạng thái</th>
                <th className="px-3 py-2.5">Ngày tham gia</th>
                <th className="px-3 py-2.5 pr-4 text-right">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading || searchPending ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <Loading
                      loading={true}
                      text="Đang tải danh sách tài khoản..."
                      fullScreen={false}
                    />
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-rose-600 dark:text-rose-400">
                    <p>{loadError}</p>
                    <button
                      type="button"
                      onClick={refetchUsers}
                      className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    Không tìm thấy người dùng nào phù hợp.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u.id === authUser?.id;
                  const roleBadge =
                    u.role === "admin"
                      ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/70"
                      : u.role === "creator"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70"
                        : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70";

                  return (
                    <tr
                      key={u.id}
                      className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-2.5 pl-4">
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                          <img
                            src={
                              u.avatarUrl ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username || "User"}`
                            }
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover dark:border-slate-700 dark:bg-slate-800"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-bold text-slate-900 dark:text-white text-xs sm:text-sm max-w-[180px]">
                                {u.fullName || u.username}
                              </p>
                              {isCurrent && (
                                <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  Bạn
                                </span>
                              )}
                              {u.isInternalTestAccount && (
                                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300">
                                  Test nội bộ
                                </span>
                              )}
                            </div>
                            <p className="truncate font-mono text-[11px] text-slate-400">
                              @{u.username}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {u.email}
                      </td>

                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${roleBadge}`}
                        >
                          {ROLE_LABELS[u.role] || "Học viên"}
                        </span>
                        {(u.role === "creator" || u.role === "admin") && (
                          <span className="mt-0.5 block font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {Number(u.hourlyRate || u.hourly_rate || 0).toLocaleString("vi-VN")} ₫/h
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {u.isLocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
                            <FiLock className="h-3 w-3" /> Đã khóa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <FiUserCheck className="h-3 w-3" /> Hoạt động
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("vi-VN") : "Hôm nay"}
                      </td>

                      <td className="px-3 py-2.5 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailUser(u)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-400"
                            title="Xem chi tiết & thiết bị"
                          >
                            <FiEye className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleLock(u)}
                            disabled={isCurrent}
                            className={`rounded-lg p-1.5 transition disabled:opacity-30 ${
                              u.isLocked
                                ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                : "text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                            }`}
                            title={u.isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                          >
                            {u.isLocked ? (
                              <FiLock className="h-4 w-4" />
                            ) : (
                              <FiUnlock className="h-4 w-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenFormModal(u)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                            title="Chỉnh sửa tài khoản"
                          >
                            <FiEdit2 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            disabled={isCurrent}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            title="Xóa tài khoản"
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row dark:border-slate-800 dark:text-slate-400">
          <div>
            Hiển thị{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              {users.length > 0 && !loadError ? (currentPage - 1) * pageSize + 1 : 0} –{" "}
              {users.length > 0 && !loadError ? Math.min(currentPage * pageSize, totalItems) : 0}
            </strong>{" "}
            / <strong className="text-slate-800 dark:text-slate-200">{totalItems}</strong> tài khoản
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Trang trước"
            >
              <FiChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (page) => Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages,
              )
              .map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 w-8 rounded-xl font-mono text-xs font-bold transition ${
                    currentPage === page
                      ? "bg-blue-600 text-white shadow-xs"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {page}
                </button>
              ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Trang tiếp"
            >
              <FiChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: CREATE / EDIT USER */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setIsFormModalOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <h3 className="text-base font-black text-[#102f63] dark:text-white">
                {editingUser ? "Chỉnh sửa tài khoản" : "Thêm người dùng mới"}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="rounded-xl bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Tên đăng nhập
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Họ và tên
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  {editingUser ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu khởi tạo"}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? "••••••••" : "Nhập mật khẩu ít nhất 6 ký tự"}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Vai trò</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    <option value="user">Học viên</option>
                    <option value="creator">Giảng viên</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Giới tính</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>
              </div>

              {(formData.role === "creator" || formData.role === "admin") && (
                <div className="space-y-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      Thù lao theo giờ (VNĐ/giờ)
                    </label>
                    <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {Number(formData.hourlyRate || 0).toLocaleString("vi-VN")} ₫/h
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={formData.hourlyRate || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        hourlyRate: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    placeholder="VD: 250000"
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-emerald-700 dark:bg-slate-800 dark:text-white"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[150000, 200000, 250000, 300000, 400000].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setFormData({ ...formData, hourlyRate: rate })}
                        className={`rounded-lg px-2 py-1 font-mono text-[10px] font-bold transition ${
                          formData.hourlyRate === rate
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
                        }`}
                      >
                        {rate.toLocaleString("vi-VN")} ₫
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Đang lưu..." : editingUser ? "Lưu cập nhật" : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: USER DETAIL & TRUSTED DEVICES */}
      {detailUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setDetailUser(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={
                    detailUser.avatarUrl ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${detailUser.username || "User"}`
                  }
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 bg-slate-100 object-cover dark:border-slate-700 dark:bg-slate-800"
                />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-[#102f63] dark:text-white">
                    {detailUser.fullName || detailUser.username}
                  </h3>
                  <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                    @{detailUser.username} · {detailUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="shrink-0 rounded-xl bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/50 space-y-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400">Vai trò</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {ROLE_LABELS[detailUser.role] || detailUser.role}
                </span>
              </div>
              {(detailUser.role === "creator" || detailUser.role === "admin") && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">Thù lao theo giờ</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {Number(detailUser.hourlyRate || detailUser.hourly_rate || 0).toLocaleString(
                      "vi-VN",
                    )}{" "}
                    ₫/giờ
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400">Trạng thái</span>
                <span
                  className={
                    detailUser.isLocked
                      ? "font-bold text-rose-600 dark:text-rose-400"
                      : "font-bold text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {detailUser.isLocked ? "Đang bị khóa" : "Hoạt động bình thường"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400">Ngày tạo</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {detailUser.createdAt
                    ? new Date(detailUser.createdAt).toLocaleDateString("vi-VN")
                    : "N/A"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Thiết bị tin cậy
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {detailDevices.limit === null
                      ? `${detailDevices.used} thiết bị · giảng viên và quản trị không bị giới hạn`
                      : `${detailDevices.used}/${detailDevices.limit} vị trí đã dùng · chỉ quản trị viên được phép xóa`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadDetailDevices(detailUser.id)}
                  disabled={detailDevicesLoading}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {detailDevicesLoading ? "Đang tải..." : "Làm mới"}
                </button>
              </div>

              {(detailDevices.security?.lockedReason ||
                detailUser.lockedReason ||
                detailDevices.security?.deviceLimitAttempts > 0 ||
                detailUser.deviceLimitAttempts > 0) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-black">
                    Lý do khóa:{" "}
                    {LOCK_REASON_LABELS[
                      detailDevices.security?.lockedReason || detailUser.lockedReason
                    ] || "Chưa bị khóa tự động"}
                  </p>
                  <p className="mt-1">
                    Số lần vi phạm thiết bị:{" "}
                    {detailDevices.security?.deviceLimitAttempts ??
                      detailUser.deviceLimitAttempts ??
                      0}
                    /3
                  </p>
                  {(detailDevices.security?.deviceLimitLastAttemptAt ||
                    detailUser.deviceLimitLastAttemptAt) && (
                    <p className="mt-1">
                      Lần vi phạm gần nhất:{" "}
                      {formatSecurityTime(
                        detailDevices.security?.deviceLimitLastAttemptAt ||
                          detailUser.deviceLimitLastAttemptAt,
                      )}
                    </p>
                  )}
                </div>
              )}

              {detailDevicesError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300">
                  {detailDevicesError}
                </div>
              )}

              {!detailDevicesLoading &&
                !detailDevicesError &&
                detailDevices.devices.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Tài khoản chưa có thiết bị tin cậy.
                  </div>
                )}

              <div className="grid gap-3 sm:grid-cols-2">
                {!detailDevicesLoading &&
                  detailDevices.devices.map((device) => {
                    const DeviceIcon = isMobileDevice(device) ? FiSmartphone : FiMonitor;
                    return (
                      <div
                        key={device.id}
                        className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/60"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            <DeviceIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                              {device.deviceName}
                            </p>
                            {device.isCurrent && (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                Thiết bị hiện tại
                              </span>
                            )}
                            <p className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                              <FiWifi className="shrink-0" /> IP gần nhất:{" "}
                              {device.lastIp || "Không xác định"}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              IP đầu tiên: {device.firstIp || "Không xác định"}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Đăng nhập: {formatSecurityTime(device.lastLoginAt)}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Ghi nhận từ: {formatSecurityTime(device.firstSeenAt)}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {device.activeSessions > 0
                                ? `${device.activeSessions} phiên còn hiệu lực`
                                : "Không có phiên còn hiệu lực"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTrustedDevice(device)}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-800/70 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          <FiTrash2 className="h-3.5 w-3.5" /> Xóa thiết bị
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRM DIALOG */}
      {confirmDialog.isOpen && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setConfirmDialog((p) => ({ ...p, isOpen: false }))}
        >
          <div
            className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-xl text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <FiAlertTriangle />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {confirmDialog.title}
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {confirmDialog.message}
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDialog((p) => ({ ...p, isOpen: false }))}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`flex-1 rounded-xl py-2 text-xs font-bold text-white shadow-sm transition ${
                  confirmDialog.confirmVariant === "danger"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
