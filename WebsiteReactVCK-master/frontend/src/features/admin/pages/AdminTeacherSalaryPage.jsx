import { useState, useEffect, useCallback } from "react";
import {
  FiDollarSign,
  FiEdit2,
  FiSearch,
  FiEye,
  FiDownload,
  FiRefreshCw,
  FiUsers,
  FiClock,
  FiTrendingUp,
  FiAlertCircle,
  FiCheckCircle,
  FiCalendar,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  fetchAdminTeacherSalaries,
  fetchAdminTeacherSalaryDetail,
  updateTeacherHourlyRate,
  adminTeacherSalariesExportUrl,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";

const PRESET_RATES = [150000, 200000, 250000, 300000, 400000, 500000];

export default function AdminTeacherSalaryPage() {
  const [data, setData] = useState({ kpis: null, teachers: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rateStatus, setRateStatus] = useState("all"); // all | assigned | unassigned

  // Edit rate modal state
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [hourlyRateInput, setHourlyRateInput] = useState("");
  const [submittingRate, setSubmittingRate] = useState(false);

  // Detail breakdown modal state
  const [detailModalTeacherId, setDetailModalTeacherId] = useState(null);
  const [teacherDetail, setTeacherDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadSalaries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAdminTeacherSalaries({ search, rateStatus });
      setData(response?.data || { kpis: null, teachers: [] });
    } catch (error) {
      console.error("Error loading teacher salaries:", error);
      toast.error(error?.message || "Không thể tải danh sách lương giảng viên");
    } finally {
      setLoading(false);
    }
  }, [search, rateStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSalaries();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadSalaries]);

  const handleOpenEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setHourlyRateInput(String(teacher.hourlyRate || 0));
  };

  const handleSaveHourlyRate = async (e) => {
    e.preventDefault();
    if (!editingTeacher) return;

    const rateNum = Number(hourlyRateInput.replace(/\D/g, ""));
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error("Vui lòng nhập mức lương hợp lệ!");
      return;
    }

    setSubmittingRate(true);
    try {
      await updateTeacherHourlyRate(editingTeacher.id, rateNum);
      toast.success(
        `Đã gán mức lương ${rateNum.toLocaleString("vi-VN")} ₫/giờ cho giảng viên ${editingTeacher.fullName || editingTeacher.username}! 🎉`,
      );
      setEditingTeacher(null);
      loadSalaries();
    } catch (error) {
      console.error("Error updating hourly rate:", error);
      toast.error(error?.message || "Không thể cập nhật mức lương");
    } finally {
      setSubmittingRate(false);
    }
  };

  const handleOpenDetailModal = async (teacher) => {
    setDetailModalTeacherId(teacher.id);
    setLoadingDetail(true);
    setTeacherDetail(null);
    try {
      const res = await fetchAdminTeacherSalaryDetail(teacher.id);
      setTeacherDetail(res?.data || null);
    } catch (error) {
      console.error("Error loading teacher detail:", error);
      toast.error(error?.message || "Không thể tải chi tiết lương giảng viên");
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatVnd = (amount) => {
    return Number(amount || 0).toLocaleString("vi-VN") + " ₫";
  };

  const kpis = data.kpis || {
    totalTeachersCount: 0,
    assignedHourlyRateCount: 0,
    unassignedHourlyRateCount: 0,
    totalAccruedSalary: 0,
    totalProjectedSalary: 0,
    totalCompletedHours: 0,
    totalCompletedSessions: 0,
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Quản Trị Hệ Thống & Đào Tạo
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
            <FiDollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Quản Lý Lương & Thù Lao Giảng Viên
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
            Admin tổng quản lý gán mức lương theo giờ (VNĐ/giờ), theo dõi số buổi đã dạy và tính toán thù lao tạm thời tự động.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={adminTeacherSalariesExportUrl({ format: "xlsx", search, rateStatus })}
            download
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-sm"
            title="Xuất file Excel"
          >
            <FiDownload className="w-4 h-4" />
            <span>Xuất Excel</span>
          </a>
          <a
            href={adminTeacherSalariesExportUrl({ format: "csv", search, rateStatus })}
            download
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition shadow-2xs"
            title="Xuất file CSV"
          >
            <FiDownload className="w-4 h-4" />
            <span>Xuất CSV</span>
          </a>
          <button
            type="button"
            onClick={loadSalaries}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Tổng thù lao tạm tính */}
        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-400 font-bold uppercase tracking-wider font-mono">
            <span>Tổng thù lao tạm tính</span>
            <FiDollarSign className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1.5 leading-tight">
            {formatVnd(kpis.totalAccruedSalary)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Đã tích lũy từ {kpis.totalCompletedSessions} buổi ({kpis.totalCompletedHours}h đã dạy)
          </p>
        </div>

        {/* KPI 2: Tổng lương dự kiến toàn khóa */}
        <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-blue-800 dark:text-sky-400 font-bold uppercase tracking-wider font-mono">
            <span>Ngân sách dự kiến</span>
            <FiTrendingUp className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-sky-300 mt-1.5 leading-tight">
            {formatVnd(kpis.totalProjectedSalary)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Tổng chi phí toàn khóa khi dạy đủ
          </p>
        </div>

        {/* KPI 3: Tổng giờ dạy đã hoàn thành */}
        <div className="rounded-2xl border border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-purple-800 dark:text-purple-400 font-bold uppercase tracking-wider font-mono">
            <span>Giờ dạy thực tế</span>
            <FiClock className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 mt-1.5 leading-tight">
            {kpis.totalCompletedHours} giờ
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Đã hoàn thành {kpis.totalCompletedSessions} buổi học
          </p>
        </div>

        {/* KPI 4: Tình trạng gán lương */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
            <span>Giảng viên & Đơn giá</span>
            <FiUsers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
              {kpis.assignedHourlyRateCount}
            </span>
            <span className="text-xs font-bold text-slate-400">/ {kpis.totalTeachersCount} giảng viên</span>
          </div>
          <p className="text-[11px] mt-1 flex items-center gap-1">
            {kpis.unassignedHourlyRateCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                <FiAlertCircle className="w-3 h-3" /> {kpis.unassignedHourlyRateCount} người chưa gán lương
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <FiCheckCircle className="w-3 h-3" /> Tất cả đã được gán lương
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Toolbar: Search and Filter */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <FiSearch className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, email giảng viên..."
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">Trạng thái gán lương:</span>
          <select
            value={rateStatus}
            onChange={(e) => setRateStatus(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
          >
            <option value="all">Tất cả giảng viên</option>
            <option value="assigned">Đã gán lương theo giờ (&gt; 0đ)</option>
            <option value="unassigned">Chưa gán lương (0đ)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 uppercase tracking-wider text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
              <tr>
                <th className="py-3.5 px-5">Giảng Viên</th>
                <th className="py-3.5 px-4 text-center">Mức Lương / Giờ</th>
                <th className="py-3.5 px-4 text-center">Lớp</th>
                <th className="py-3.5 px-4 text-center">Tiến Độ Buổi Dạy</th>
                <th className="py-3.5 px-4 text-center">Số Giờ Đã Dạy</th>
                <th className="py-3.5 px-4 text-right">Lương Tạm Tính</th>
                <th className="py-3.5 px-4 text-right">Lương Dự Kiến</th>
                <th className="py-3.5 px-5 text-right">Hành Động</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12">
                    <Loading loading={true} text="Đang tải dữ liệu bảng lương..." fullScreen={false} />
                  </td>
                </tr>
              ) : data.teachers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Không tìm thấy giảng viên nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                data.teachers.map((t) => {
                  const roleBadge =
                    t.role === "admin"
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200"
                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200";

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                    >
                      {/* Giảng viên Info */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              t.avatarUrl ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.username || "Teacher"}`
                            }
                            alt=""
                            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 dark:text-white text-sm">
                                {t.fullName || t.username}
                              </p>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase font-mono border ${roleBadge}`}
                              >
                                {t.role === "admin" ? "Admin" : "Giảng viên"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">@{t.username} · {t.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Mức lương / giờ */}
                      <td className="py-3.5 px-4 text-center">
                        {t.hourlyRate > 0 ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono font-bold">
                            <span>{formatVnd(t.hourlyRate)}/h</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200">
                            Chưa gán
                          </span>
                        )}
                      </td>

                      {/* Số lớp phụ trách */}
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                        {t.classesCount} lớp
                      </td>

                      {/* Tiến độ buổi dạy */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {t.completedSessions} / {t.totalSessions} buổi
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({t.progressPct}%)
                          </span>
                        </div>
                      </td>

                      {/* Số giờ đã dạy */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {t.completedHours}h
                        <span className="text-[10px] text-slate-400 block font-normal">
                          / {t.totalHours}h dự kiến
                        </span>
                      </td>

                      {/* Lương tạm tính */}
                      <td className="py-3.5 px-4 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                        {formatVnd(t.accruedSalary)}
                      </td>

                      {/* Lương dự kiến */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400 text-xs">
                        {formatVnd(t.projectedSalary)}
                      </td>

                      {/* Hành động */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-sky-300 font-bold text-xs transition border border-blue-200/60 dark:border-blue-800"
                            title="Gán mức lương theo giờ"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                            <span>Gán lương</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(t)}
                            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Xem chi tiết các buổi dạy"
                          >
                            <FiEye className="w-4 h-4" />
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
      </div>

      {/* Modal: Gán / Chỉnh sửa mức lương theo giờ */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FiDollarSign className="w-5 h-5 text-emerald-600" />
                Gán Lương Theo Giờ Cho Giảng Viên
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveHourlyRate} className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                <img
                  src={
                    editingTeacher.avatarUrl ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${editingTeacher.username || "Teacher"}`
                  }
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600"
                />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingTeacher.fullName || editingTeacher.username}
                  </p>
                  <p className="text-xs text-slate-500 font-mono truncate">{editingTeacher.email}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mức lương theo giờ (VNĐ / giờ):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    required
                    value={hourlyRateInput}
                    onChange={(e) => setHourlyRateInput(e.target.value)}
                    placeholder="Ví dụ: 250000"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    VNĐ / giờ
                  </span>
                </div>
              </div>

              {/* Quick Select Presets */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-2">
                  Chọn nhanh mức lương chuẩn:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setHourlyRateInput(String(rate))}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold font-mono transition border ${
                        Number(hourlyRateInput) === rate
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500"
                      }`}
                    >
                      {formatVnd(rate)}/h
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview calculation */}
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs space-y-1">
                <p className="font-bold">Xem trước thù lao:</p>
                <p>
                  • 1 buổi dạy 2 giờ = <strong>{formatVnd(Number(hourlyRateInput || 0) * 2)}</strong>
                </p>
                <p>
                  • Khóa 20 buổi (40 giờ) = <strong>{formatVnd(Number(hourlyRateInput || 0) * 40)}</strong>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingRate}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition disabled:opacity-50"
                >
                  {submittingRate ? "Đang lưu..." : "Lưu Mức Lương"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết các buổi dạy của giảng viên */}
      {detailModalTeacherId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FiCalendar className="w-5 h-5 text-emerald-600" />
                  Chi Tiết Bảng Lương Giảng Viên
                </h3>
                {teacherDetail?.teacher && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {teacherDetail.teacher.fullName || teacherDetail.teacher.username} ({teacherDetail.teacher.email}) · Đơn giá:{" "}
                    <strong className="text-emerald-600 font-mono">{formatVnd(teacherDetail.teacher.hourlyRate)}/h</strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailModalTeacherId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4">
              {loadingDetail ? (
                <div className="py-12">
                  <Loading loading={true} text="Đang tải danh sách buổi dạy..." fullScreen={false} />
                </div>
              ) : !teacherDetail || teacherDetail.classes.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">
                  Giảng viên này chưa được phân công lớp học nào hoặc chưa có buổi học.
                </p>
              ) : (
                teacherDetail.classes.map((cls) => (
                  <div
                    key={cls.classId}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-sky-300 border border-blue-200">
                            {cls.code}
                          </span>
                          <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {cls.title}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {cls.courseTitle} · {cls.avgDurationHours}h/buổi · {cls.completedSessions}/{cls.totalSessions} buổi đã dạy
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-[10px] font-mono font-bold uppercase text-slate-400">Lương tạm tính của lớp</p>
                        <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatVnd(cls.accruedSalary)}
                        </p>
                      </div>
                    </div>

                    {cls.sessions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Chưa có buổi học nào.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/60 font-mono uppercase text-[10px] text-slate-400 font-bold">
                            <tr>
                              <th className="py-2 px-3">#</th>
                              <th className="py-2 px-3">Tên buổi học</th>
                              <th className="py-2 px-3">Thời gian</th>
                              <th className="py-2 px-3 text-center">Thời lượng</th>
                              <th className="py-2 px-3 text-center">Trạng thái</th>
                              <th className="py-2 px-3 text-right">Thù lao</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {cls.sessions.map((sess) => {
                              const sDate = sess.startTime ? new Date(sess.startTime) : null;
                              const dateStr = sDate && !Number.isNaN(sDate.getTime())
                                ? sDate.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
                                : "Chưa định";
                              const timeStr = sDate && !Number.isNaN(sDate.getTime())
                                ? sDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                                : "";

                              return (
                                <tr
                                  key={sess.id}
                                  className={sess.isCompleted ? "bg-emerald-50/20 dark:bg-emerald-950/10" : ""}
                                >
                                  <td className="py-2 px-3 font-mono font-bold text-slate-400">
                                    {sess.sessionNumber}
                                  </td>
                                  <td className="py-2 px-3 font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                                    {sess.title}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                                    {dateStr} {timeStr && `(${timeStr})`}
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                                    {sess.durationHours}h
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {sess.isCompleted ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                                        <FiCheckCircle className="w-2.5 h-2.5" /> Đã dạy
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                        Chưa diễn ra
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-black">
                                    {sess.isCompleted ? (
                                      <span className="text-emerald-600 dark:text-emerald-400">
                                        +{formatVnd(sess.earnedAmount)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[11px]">
                                        Dự kiến: {formatVnd(sess.projectedAmount)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-right shrink-0">
              <button
                type="button"
                onClick={() => setDetailModalTeacherId(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs"
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
