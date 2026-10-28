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
  FiWifi
} from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuthContext } from "../../context/AuthContext";
import useCUDUser from "../../hooks/useCUDUser";
import { fetchAdminUsers, toggleUserLockStatus } from "../../features/api/lmsClient";
import { fetchAdminTrustedDevices, removeAdminTrustedDevice } from "../../features/api/accountSecurityClient";
import Loading from "../../components/Loading.jsx";

const formatSecurityTime = (value) => value
  ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  : "Chưa có dữ liệu";

const isMobileDevice = (device) => /iphone|ipad|android|mobile/i.test(
  `${device?.deviceName || ""} ${device?.userAgent || ""}`,
);

const LOCK_REASON_LABELS = {
  DEVICE_LIMIT_ABUSE: "Cố đăng nhập thiết bị thứ tư quá 3 lần",
  ADMIN_LOCK: "Quản trị viên khóa thủ công",
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
  const [detailDevices, setDetailDevices] = useState({ limit: null, used: 0, devices: [], security: null });
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
    }).then((response) => {
      if (!active) return;
      const nextUsers = Array.isArray(response?.data) ? response.data : [];
      const pagination = response?.pagination || {};
      setUsers(nextUsers);
      setTotalItems(Number(pagination.total) || 0);
      setServerTotalPages(Number(pagination.totalPages) || 0);
      if (currentPage > 1 && nextUsers.length === 0) {
        setCurrentPage((page) => Math.max(1, page - 1));
      }
    }).catch((error) => {
      if (!active || error?.name === "AbortError") return;
      setUsers([]);
      setTotalItems(0);
      setServerTotalPages(0);
      setLoadError(error?.message || "Không thể tải danh sách người dùng.");
    }).finally(() => {
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
      toast.error("Vui lòng điền tên đăng nhập và email!");
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error("Mật khẩu là bắt buộc khi tạo tài khoản mới!");
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password;
        await updateUser(editingUser.id, payload);
        toast.success(`Cập nhật tài khoản ${formData.username} thành công! 🎉`);
      } else {
        await createUser(formData);
        toast.success(`Tạo mới tài khoản ${formData.username} thành công! 🎉`);
      }
      setIsFormModalOpen(false);
      if (refetchUsers) refetchUsers();
    } catch (err) {
      console.error("Save user error:", err);
      toast.error(err?.message || "Có lỗi xảy ra khi lưu người dùng!");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete User with custom confirm dialog
  const handleDeleteUser = useCallback(
    (user) => {
      if (user.id === authUser?.id) {
        toast.error("Bạn không thể tự xóa tài khoản quản trị của chính mình!");
        return;
      }

      setConfirmDialog({
        isOpen: true,
        title: "Xác Nhận Xóa Tài Khoản",
        message: `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${user.username}" (${user.email})? Thao tác này không thể hoàn tác!`,
        confirmLabel: "Xóa Vĩnh Viễn",
        confirmVariant: "danger",
        onConfirm: async () => {
          try {
            await deleteUser(user.id);
            toast.success(`Đã xóa tài khoản "${user.username}" thành công!`);
            if (refetchUsers) refetchUsers();
          } catch (err) {
            toast.error(err?.message || "Không thể xóa tài khoản này!");
          } finally {
            setConfirmDialog((p) => ({ ...p, isOpen: false }));
          }
        },
      });
    },
    [authUser, deleteUser, refetchUsers]
  );

  // Toggle Lock/Unlock User with confirm dialog
  const handleToggleLock = useCallback(
    (user) => {
      if (user.id === authUser?.id) {
        toast.error("Bạn không thể tự khóa tài khoản quản trị của chính mình!");
        return;
      }

      const willLock = !user.isLocked;

      setConfirmDialog({
        isOpen: true,
        title: willLock ? "Xác Nhận Khóa Tài Khoản" : "Mở Khóa Tài Khoản",
        message: willLock
          ? `Học viên/người dùng "${user.username}" sẽ bị đăng xuất ngay lập tức và không thể truy cập LMS.`
          : user.lockedReason === "DEVICE_LIMIT_ABUSE"
            ? `Mở khóa tài khoản "${user.username}" và đặt lại số lần vi phạm. Hai vị trí thiết bị vẫn được giữ nguyên; hãy xóa một thiết bị cũ nếu người dùng cần đăng nhập máy mới.`
            : `Khôi phục quyền truy cập LMS cho tài khoản "${user.username}".`,
        confirmLabel: willLock ? "Khóa Tài Khoản" : "Mở Khóa Ngay",
        confirmVariant: willLock ? "danger" : "primary",
        onConfirm: async () => {
          try {
            await toggleUserLockStatus(user.id, willLock);
            toast.success(
              willLock
                ? `Đã khóa tài khoản "${user.username}" thành công!`
                : `Đã mở khóa tài khoản "${user.username}" thành công!`
            );
            if (refetchUsers) refetchUsers();
          } catch (err) {
            console.error("Toggle user lock error:", err);
            toast.error(err?.message || "Không thể cập nhật trạng thái khóa tài khoản trên máy chủ.");
          } finally {
            setConfirmDialog((p) => ({ ...p, isOpen: false }));
          }
        },
      });
    },
    [authUser, refetchUsers]
  );

  const handleRemoveTrustedDevice = useCallback((device) => {
    if (!detailUser?.id) return;
    setConfirmDialog({
      isOpen: true,
      title: "Xóa Thiết Bị Tin Cậy",
      message: device.isCurrent
        ? `Đây là thiết bị admin đang sử dụng. Xóa “${device.deviceName}” sẽ thu hồi phiên hiện tại ngay sau thao tác.`
        : `Xóa “${device.deviceName}” khỏi tài khoản ${detailUser.username}? Tất cả phiên đăng nhập trên thiết bị này sẽ bị thu hồi ngay.`,
      confirmLabel: "Xóa Thiết Bị",
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
  }, [detailUser, loadDetailDevices, refetchUsers]);

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Quản Trị Người Dùng & Phân Quyền
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            Danh Sách Học Viên & Giảng Viên
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
            Tổng số: <strong className="text-gray-900 dark:text-white">{totalItems}</strong> tài khoản phù hợp.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenFormModal(null)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/30"
        >
          <FiPlus className="w-4 h-4" />
          <span>Thêm Người Dùng Mới</span>
        </button>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <FiSearch className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm theo tên, email, username..."
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Role filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="hidden sm:inline">Vai trò:</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="user">Học viên (User)</option>
              <option value="creator">Giảng viên (Creator)</option>
              <option value="admin">Quản trị viên (Admin)</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="hidden sm:inline">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="locked">Đã bị khóa 🔒</option>
            </select>
          </div>

          {/* Page size selector */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none"
          >
            <option value={8}>8 dòng/trang</option>
            <option value={15}>15 dòng/trang</option>
            <option value={30}>30 dòng/trang</option>
          </select>
        </div>
      </div>

      {/* Main Users Table */}
      <div className="bg-white dark:bg-gray-800/90 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900/60 uppercase tracking-wider text-[10px] font-bold text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-3.5 px-6">Người Dùng</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4 text-center">Vai Trò</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-4">Ngày Tham Gia</th>
                <th className="py-3.5 px-6 text-right">Thao Tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-sans">
              {loading || searchPending ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <Loading loading={true} text="Đang nạp danh sách tài khoản..." fullScreen={false} />
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-rose-600 dark:text-rose-400">
                    <p>{loadError}</p>
                    <button type="button" onClick={refetchUsers} className="mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500">
                      Thử lại
                    </button>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Không tìm thấy người dùng nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u.id === authUser?.id;
                  const roleBadge =
                    u.role === "admin"
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                      : u.role === "creator"
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";

                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              u.avatarUrl ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username || "User"}`
                            }
                            alt=""
                            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-gray-900 dark:text-white text-sm">
                                {u.fullName || u.username}
                              </p>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                  Bạn
                                </span>
                              )}
                              {u.isInternalTestAccount && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
                                  TEST NỘI BỘ
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 font-mono">@{u.username}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-gray-600 dark:text-gray-300 text-xs">
                        {u.email}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase font-mono border ${roleBadge}`}
                        >
                          {u.role === "admin" ? "Admin" : u.role === "creator" ? "Giảng viên" : "Học viên"}
                        </span>
                        {(u.role === "creator" || u.role === "admin") && (
                          <span className="block mt-1 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {Number(u.hourlyRate || u.hourly_rate || 0).toLocaleString("vi-VN")} ₫/h
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {u.isLocked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <FiLock className="w-3 h-3" /> Đã Khóa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <FiUserCheck className="w-3 h-3" /> Hoạt Động
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-gray-400 text-xs">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("vi-VN") : "Hôm nay"}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View detail button */}
                          <button
                            type="button"
                            onClick={() => setDetailUser(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                            title="Xem chi tiết"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>

                          {/* Lock/Unlock button */}
                          <button
                            type="button"
                            onClick={() => handleToggleLock(u)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg transition disabled:opacity-30 ${
                              u.isLocked
                                ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                : "text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                            }`}
                            title={u.isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                          >
                            {u.isLocked ? <FiLock className="w-4 h-4" /> : <FiUnlock className="w-4 h-4" />}
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => handleOpenFormModal(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                            title="Chỉnh sửa tài khoản"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            disabled={isCurrent}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-30"
                            title="Xóa tài khoản"
                          >
                            <FiTrash2 className="w-4 h-4" />
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
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400">
          <div>
            Hiển thị{" "}
            <strong>
              {users.length > 0 && !loadError ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
              {users.length > 0 && !loadError ? Math.min(currentPage * pageSize, totalItems) : 0}
            </strong>{" "}
            trong tổng số <strong>{totalItems}</strong> người dùng
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              title="Trang trước"
            >
              <FiChevronLeft className="w-4 h-4" />
            </button>

            {/* Page buttons */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => Math.abs(page - currentPage) <= 2 || page === 1 || page === totalPages)
              .map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-xl font-bold font-mono transition text-xs ${
                    currentPage === page
                      ? "bg-blue-600 text-white shadow-sm"
                      : "border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {page}
                </button>
              ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              title="Trang tiếp"
            >
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL 1: CREATE / EDIT USER
          ══════════════════════════════════════════════════════════ */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {editingUser ? "Chỉnh Sửa Thông Tin Tài Khoản" : "Thêm Người Dùng Mới"}
            </h3>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">Tên đăng nhập (Username):</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">Họ và tên đầy đủ:</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">Email:</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">
                  {editingUser ? "Mật khẩu mới (Để trống nếu không đổi):" : "Mật khẩu khởi tạo:"}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? "••••••••" : "Nhập mật khẩu ít nhất 6 ký tự"}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700 dark:text-gray-300">Vai trò (Role):</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white focus:outline-none"
                  >
                    <option value="user">Học viên (User)</option>
                    <option value="creator">Giảng viên (Creator)</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-gray-700 dark:text-gray-300">Giới tính:</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white focus:outline-none"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>
              </div>

              {(formData.role === "creator" || formData.role === "admin") && (
                <div className="space-y-2 p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-emerald-800 dark:text-emerald-300 text-xs">
                      Thù lao theo giờ (VNĐ/giờ):
                    </label>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs">
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
                    className="w-full bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[150000, 200000, 250000, 300000, 400000].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setFormData({ ...formData, hourlyRate: rate })}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition ${
                          formData.hourlyRate === rate
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {rate.toLocaleString("vi-VN")} ₫
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-md shadow-blue-600/30 disabled:opacity-50"
                >
                  {submitting ? "Đang Lưu..." : editingUser ? "Lưu Cập Nhật" : "Tạo Tài Khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 2: USER DETAIL DRAWER / MODAL
          ══════════════════════════════════════════════════════════ */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-h-[92vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:p-8">
            <img
              src={
                detailUser.avatarUrl ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${detailUser.username || "User"}`
              }
              alt=""
              className="w-20 h-20 rounded-full mx-auto border-2 border-blue-500/30 bg-gray-100 dark:bg-gray-800 shadow-md"
            />

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {detailUser.fullName || detailUser.username}
              </h3>
              <p className="text-xs text-gray-500 font-mono">@{detailUser.username}</p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2.5 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="text-gray-900 dark:text-white font-mono font-medium">{detailUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vai trò:</span>
                <span className="font-bold uppercase font-mono text-blue-600 dark:text-blue-400">
                  {detailUser.role}
                </span>
              </div>
              {(detailUser.role === "creator" || detailUser.role === "admin") && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Mức lương theo giờ:</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {Number(detailUser.hourlyRate || detailUser.hourly_rate || 0).toLocaleString("vi-VN")} ₫/giờ
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Trạng thái:</span>
                <span className={detailUser.isLocked ? "text-rose-500 font-bold" : "text-emerald-500 font-bold"}>
                  {detailUser.isLocked ? "Đang bị khóa" : "Hoạt động bình thường"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ngày tạo:</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono">
                  {detailUser.createdAt ? new Date(detailUser.createdAt).toLocaleDateString("vi-VN") : "N/A"}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-gray-900 dark:text-white">Thiết bị tin cậy</h4>
                  <p className="text-[11px] text-gray-500">
                    {detailDevices.limit === null
                      ? `${detailDevices.used} thiết bị · giảng viên/admin không bị giới hạn`
                      : `${detailDevices.used}/${detailDevices.limit} vị trí đã dùng · chỉ admin được quyền xóa`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadDetailDevices(detailUser.id)}
                  disabled={detailDevicesLoading}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  {detailDevicesLoading ? "Đang tải..." : "Làm mới"}
                </button>
              </div>

              {(detailDevices.security?.lockedReason || detailUser.lockedReason || detailDevices.security?.deviceLimitAttempts > 0 || detailUser.deviceLimitAttempts > 0) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-black">
                    Lý do khóa: {LOCK_REASON_LABELS[detailDevices.security?.lockedReason || detailUser.lockedReason] || "Chưa bị khóa tự động"}
                  </p>
                  <p className="mt-1">
                    Số lần vi phạm thiết bị hiện tại: {detailDevices.security?.deviceLimitAttempts ?? detailUser.deviceLimitAttempts ?? 0}/3
                  </p>
                  {(detailDevices.security?.deviceLimitLastAttemptAt || detailUser.deviceLimitLastAttemptAt) && (
                    <p className="mt-1">
                      Lần vi phạm gần nhất: {formatSecurityTime(detailDevices.security?.deviceLimitLastAttemptAt || detailUser.deviceLimitLastAttemptAt)}
                    </p>
                  )}
                </div>
              )}

              {detailDevicesError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {detailDevicesError}
                </div>
              )}

              {!detailDevicesLoading && !detailDevicesError && detailDevices.devices.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-500 dark:border-gray-700">
                  Tài khoản chưa có thiết bị tin cậy.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {!detailDevicesLoading && detailDevices.devices.map((device) => {
                  const DeviceIcon = isMobileDevice(device) ? FiSmartphone : FiMonitor;
                  return (
                    <div key={device.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <DeviceIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black text-gray-900 dark:text-white">{device.deviceName}</p>
                          {device.isCurrent && (
                            <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Thiết bị admin hiện tại
                            </span>
                          )}
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
                            <FiWifi /> IP gần nhất: {device.lastIp || "Không xác định"}
                          </p>
                          <p className="mt-1 text-[10px] text-gray-500">IP đầu tiên: {device.firstIp || "Không xác định"}</p>
                          <p className="mt-1 text-[10px] text-gray-500">Đăng nhập: {formatSecurityTime(device.lastLoginAt)}</p>
                          <p className="mt-1 text-[10px] text-gray-500">Ghi nhận từ: {formatSecurityTime(device.firstSeenAt)}</p>
                          <p className="mt-1 text-[10px] text-gray-500">
                            {device.activeSessions > 0 ? `${device.activeSessions} phiên còn hiệu lực` : "Không có phiên còn hiệu lực"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTrustedDevice(device)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white py-2 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900 dark:bg-gray-900 dark:text-rose-300"
                      >
                        <FiTrash2 /> Xóa thiết bị
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="w-full py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CONFIRM DIALOG MODAL (CHỐNG BẤM NHẦM)
          ══════════════════════════════════════════════════════════ */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center text-xl">
              <FiAlertTriangle />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {confirmDialog.title}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-light">
                {confirmDialog.message}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog((p) => ({ ...p, isOpen: false }))}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-xs transition"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`flex-1 py-2.5 text-white font-bold rounded-xl text-xs transition shadow-md ${
                  confirmDialog.confirmVariant === "danger"
                    ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                    : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/30"
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
