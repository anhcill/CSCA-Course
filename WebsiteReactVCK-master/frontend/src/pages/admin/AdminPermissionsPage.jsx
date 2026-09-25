import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiShield,
  FiSearch,
  FiCheck,
  FiX,
  FiInfo,
  FiLock,
  FiFilter,
  FiAlertCircle,
} from "react-icons/fi";
import { fetchAdminPermissions, updateAdminPermission } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedScope, setSelectedScope] = useState("ALL");
  const [savingId, setSavingId] = useState(null);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminPermissions();
      if (res?.data) {
        setPermissions(res.data);
      }
    } catch (err) {
      console.error("Error loading permissions:", err);
      toast.error("Không thể tải danh sách quyền!");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const handleToggle = async (permId, role) => {
    const current = permissions.find((p) => p.id === permId);
    if (!current) return;
    const newValue = !current[role];

    // Optimistic update
    setPermissions((prev) =>
      prev.map((p) => (p.id === permId ? { ...p, [role]: newValue } : p))
    );
    setSavingId(`${permId}_${role}`);

    try {
      await updateAdminPermission(permId, { [role]: newValue });
      toast.success(
        `Đã cập nhật quyền [${current.code}] cho vai trò ${role.toUpperCase()} thành ${newValue ? "BẬT" : "TẮT"}! 🔒`
      );
    } catch {
      // Revert on error
      setPermissions((prev) =>
        prev.map((p) => (p.id === permId ? { ...p, [role]: !newValue } : p))
      );
      toast.error("Cập nhật quyền thất bại! Vui lòng thử lại.");
    } finally {
      setSavingId(null);
    }
  };

  const filteredPermissions = permissions.filter((perm) => {
    const matchesScope = selectedScope === "ALL" || perm.scope === selectedScope;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      perm.code.toLowerCase().includes(term) ||
      perm.name.toLowerCase().includes(term);
    return matchesScope && matchesSearch;
  });

  const getScopeBadge = (scope) => {
    switch (scope) {
      case "Application":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Application
          </span>
        );
      case "Course":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Course
          </span>
        );
      case "Class":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Class
          </span>
        );
      case "OwnData":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            OwnData
          </span>
        );
      default:
        return <span className="text-xs text-gray-400">{scope}</span>;
    }
  };

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 mb-2">
            <FiShield className="w-3.5 h-3.5" />
            <span>Role-Based Access Control (RBAC)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Ma Trận Phân Quyền LMS
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Thiết lập 15 mã quyền hạn theo 4 phạm vi (Scope) áp dụng đồng bộ toàn hệ thống.
          </p>
        </div>
      </div>

      {/* Security Principles Banner */}
      <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-800/40 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
        <FiAlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-gray-300">
          <p className="font-bold text-white">Nguyên Tắc Bảo Mật Zero-Trust & Phân Quyền 2 Lớp</p>
          <p className="text-gray-400 leading-relaxed">
            Frontend chỉ hiển thị các nút bấm dựa trên ma trận quyền. Mọi hành động thao tác (giao bài, chấm điểm, sửa lịch, xuất dữ liệu) đều bắt buộc phải được backend xác thực lại dựa trên <span className="font-mono text-blue-300">ApplicationMembership</span> và <span className="font-mono text-blue-300">ApplicationEntitlement</span>.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        {/* Scope Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {["ALL", "Application", "Course", "Class", "OwnData"].map((sc) => (
            <button
              key={sc}
              onClick={() => setSelectedScope(sc)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                selectedScope === sc
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {sc === "ALL" ? "Tất cả Scopes" : sc}
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
            placeholder="Tìm theo mã hoặc tên quyền..."
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3.5 px-5">Mã Quyền Hạn (Permission Code)</th>
                <th className="py-3.5 px-4">Mô Tả Chức Năng</th>
                <th className="py-3.5 px-4 text-center">Phạm Vi (Scope)</th>
                <th className="py-3.5 px-4 text-center">Quản Trị Viên (Admin)</th>
                <th className="py-3.5 px-4 text-center">Giáo Viên (Teacher)</th>
                <th className="py-3.5 px-4 text-center">Học Viên (Student)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <Loading loading={true} text="Đang tải ma trận phân quyền..." fullScreen={false} />
                  </td>
                </tr>
              ) : filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    Không tìm thấy quyền hạn phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredPermissions.map((perm) => (
                  <tr key={perm.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-4 px-5">
                      <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {perm.code}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-medium text-gray-900 dark:text-white">
                      {perm.name}
                    </td>
                    <td className="py-4 px-4 text-center">{getScopeBadge(perm.scope)}</td>

                    {/* Admin Toggle */}
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleToggle(perm.id, "admin")}
                        disabled={savingId === `${perm.id}_admin` || perm.code === "lms.permission.manage"}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-xl transition ${
                          perm.admin
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700"
                        } ${perm.code === "lms.permission.manage" ? "opacity-60 cursor-not-allowed" : "hover:scale-105"}`}
                        title={perm.code === "lms.permission.manage" ? "Quyền hệ thống bắt buộc" : "Nhấn để bật/tắt"}
                      >
                        {perm.admin ? <FiCheck className="w-4 h-4 stroke-[3]" /> : <FiX className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Teacher Toggle */}
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleToggle(perm.id, "teacher")}
                        disabled={savingId === `${perm.id}_teacher`}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-xl transition ${
                          perm.teacher
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700"
                        } hover:scale-105`}
                        title="Nhấn để bật/tắt quyền cho Giáo viên"
                      >
                        {perm.teacher ? <FiCheck className="w-4 h-4 stroke-[3]" /> : <FiX className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Student Toggle */}
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleToggle(perm.id, "student")}
                        disabled={savingId === `${perm.id}_student`}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-xl transition ${
                          perm.student
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700"
                        } hover:scale-105`}
                        title="Nhấn để bật/tắt quyền cho Học viên"
                      >
                        {perm.student ? <FiCheck className="w-4 h-4 stroke-[3]" /> : <FiX className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
