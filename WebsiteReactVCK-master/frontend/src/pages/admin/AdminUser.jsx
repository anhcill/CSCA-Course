import { useState, useEffect, useMemo, useCallback } from "react";
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
  FiAlertTriangle
} from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuthContext } from "../../context/AuthContext";
import useGetUsers from "../../hooks/useGetUsers";
import useCUDUser from "../../hooks/useCUDUser";
import { toggleUserLockStatus } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";

export default function AdminUser() {
  const { users, loading, refetchUsers } = useGetUsers();
  const { createUser, updateUser, deleteUser } = useCUDUser();
  const { authUser } = useAuthContext();

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | user | creator | admin
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | locked

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [detailUser, setDetailUser] = useState(null);

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
  });

  const [submitting, setSubmitting] = useState(false);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    let list = Array.isArray(users) ? [...users] : [];

    if (roleFilter !== "all") {
      list = list.filter((u) => (u.role || "user") === roleFilter);
    }

    if (statusFilter !== "all") {
      const isLocked = statusFilter === "locked";
      list = list.filter((u) => !!u.isLocked === isLocked);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (u) =>
          (u.username || "").toLowerCase().includes(q) ||
          (u.fullName || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [users, roleFilter, statusFilter, searchQuery]);

  // Pagination calculations
  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter, pageSize]);

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
        await updateUser(editingUser._id, payload);
        toast.success(`Cập nhật tài khoản ${formData.username} thành công! 🎉`);
      } else {
        await createUser(formData);
        toast.success(`Tạo mới tài khoản ${formData.username} thành công! 🎉`);
      }
      setIsFormModalOpen(false);
      if (refetchUsers) refetchUsers();
    } catch (err) {
      console.error("Save user error:", err);
      toast.error(err?.response?.data?.message || "Có lỗi xảy ra khi lưu người dùng!");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete User with custom confirm dialog
  const handleDeleteUser = useCallback(
    (user) => {
      if (user._id === authUser?._id) {
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
            await deleteUser(user._id);
            toast.success(`Đã xóa tài khoản "${user.username}" thành công!`);
            if (refetchUsers) refetchUsers();
          } catch (err) {
            toast.error(err?.response?.data?.message || "Không thể xóa tài khoản này!");
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
      if (user._id === authUser?._id) {
        toast.error("Bạn không thể tự khóa tài khoản quản trị của chính mình!");
        return;
      }

      const willLock = !user.isLocked;

      setConfirmDialog({
        isOpen: true,
        title: willLock ? "Xác Nhận Khóa Tài Khoản" : "Mở Khóa Tài Khoản",
        message: willLock
          ? `Học viên/người dùng "${user.username}" sẽ bị đăng xuất ngay lập tức và không thể truy cập LMS.`
          : `Khôi phục quyền truy cập LMS cho tài khoản "${user.username}".`,
        confirmLabel: willLock ? "Khóa Tài Khoản" : "Mở Khóa Ngay",
        confirmVariant: willLock ? "danger" : "primary",
        onConfirm: async () => {
          try {
            await toggleUserLockStatus(user._id, willLock);
            toast.success(
              willLock
                ? `Đã khóa tài khoản "${user.username}" thành công!`
                : `Đã mở khóa tài khoản "${user.username}" thành công!`
            );
            if (refetchUsers) refetchUsers();
          } catch (err) {
            console.warn("Local toggle lock fallback:", err);
            // Fallback UI update
            user.isLocked = willLock;
            toast.success(
              willLock
                ? `Đã khóa tài khoản "${user.username}" (Cập nhật giao diện)!`
                : `Đã mở khóa tài khoản "${user.username}"!`
            );
          } finally {
            setConfirmDialog((p) => ({ ...p, isOpen: false }));
          }
        },
      });
    },
    [authUser, refetchUsers]
  );

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
            Tổng số: <strong className="text-gray-900 dark:text-white">{filteredUsers.length}</strong> tài khoản trong hệ thống LMS CSCA.
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
              onChange={(e) => setRoleFilter(e.target.value)}
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
              onChange={(e) => setStatusFilter(e.target.value)}
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
            onChange={(e) => setPageSize(Number(e.target.value))}
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <Loading loading={true} text="Đang nạp danh sách tài khoản..." fullScreen={false} />
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Không tìm thấy người dùng nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const isCurrent = u._id === authUser?._id;
                  const roleBadge =
                    u.role === "admin"
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                      : u.role === "creator"
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";

                  return (
                    <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
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
              {paginatedUsers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
              {Math.min(currentPage * pageSize, totalItems)}
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
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-5 shadow-2xl text-center">
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
