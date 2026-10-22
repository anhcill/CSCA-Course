import { useState, useEffect, useCallback, useMemo } from "react";
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
  FiPrinter,
  FiFileText,
  FiSliders,
  FiLayers,
  FiSave,
  FiCheck,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  fetchAdminTeacherSalaries,
  fetchAdminTeacherSalaryDetail,
  updateTeacherHourlyRate,
  updateTeacherClassHourlyRate,
  updateSessionSalaryParameters,
  updateTeacherSalarySettlement,
  adminTeacherSalariesExportUrl,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";

const PRESET_RATES = [150000, 200000, 250000, 300000, 400000, 500000];

const PAYMENT_STATUS_LABELS = {
  all: "Tất cả trạng thái",
  pending: "Chưa thanh toán",
  processing: "Đang xử lý",
  paid: "Đã thanh toán",
  hold: "Tạm giữ",
};

export default function AdminTeacherSalaryPage() {
  const [data, setData] = useState({ kpis: null, teachers: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rateStatus, setRateStatus] = useState("all"); // all | assigned | unassigned
  const [paymentStatus, setPaymentStatus] = useState("all"); // all | pending | processing | paid | hold

  // Base rate edit modal
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [hourlyRateInput, setHourlyRateInput] = useState("");
  const [submittingRate, setSubmittingRate] = useState(false);

  // Detail & Settlement modal
  const [detailModalTeacherId, setDetailModalTeacherId] = useState(null);
  const [teacherDetail, setTeacherDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState("classes"); // classes | settlement | payslip
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");

  // Class rate override modal
  const [editingClassRate, setEditingClassRate] = useState(null); // { classId, title, currentRate, defaultRate }
  const [classRateInput, setClassRateInput] = useState("");
  const [submittingClassRate, setSubmittingClassRate] = useState(false);

  // Session edit modal
  const [editingSession, setEditingSession] = useState(null); // { id, title, durationHours, status }
  const [sessionHoursInput, setSessionHoursInput] = useState("");
  const [sessionStatusInput, setSessionStatusInput] = useState("ended");
  const [submittingSession, setSubmittingSession] = useState(false);

  // Settlement edit form state (inside Detail Modal)
  const [bonusInput, setBonusInput] = useState(0);
  const [deductionInput, setDeductionInput] = useState(0);
  const [settlementStatusInput, setSettlementStatusInput] = useState("pending");
  const [notesInput, setNotesInput] = useState("");
  const [savingSettlement, setSavingSettlement] = useState(false);

  const loadSalaries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAdminTeacherSalaries({ search, rateStatus, paymentStatus });
      setData(response?.data || { kpis: null, teachers: [] });
    } catch (error) {
      console.error("Error loading teacher salaries:", error);
      toast.error(error?.message || "Không thể tải danh sách lương giảng viên");
    } finally {
      setLoading(false);
    }
  }, [search, rateStatus, paymentStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSalaries();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadSalaries]);

  // Load / Reload teacher detail modal
  const loadDetailData = useCallback(async (teacherId) => {
    setLoadingDetail(true);
    try {
      const res = await fetchAdminTeacherSalaryDetail(teacherId);
      const detail = res?.data || null;
      setTeacherDetail(detail);

      if (detail?.settlement) {
        setBonusInput(detail.settlement.bonusAmount || 0);
        setDeductionInput(detail.settlement.deductionAmount || 0);
        setSettlementStatusInput(detail.settlement.paymentStatus || "pending");
        setNotesInput(detail.settlement.notes || "");
      }
    } catch (error) {
      console.error("Error loading teacher detail:", error);
      toast.error(error?.message || "Không thể tải chi tiết lương giảng viên");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleOpenDetailModal = (teacher) => {
    setDetailModalTeacherId(teacher.id);
    setDetailTab("classes");
    setSelectedClassFilter("all");
    loadDetailData(teacher.id);
  };

  const handleOpenEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setHourlyRateInput(String(teacher.hourlyRate || 0));
  };

  const handleSaveHourlyRate = async (e) => {
    e.preventDefault();
    if (!editingTeacher) return;

    const rateNum = Number(String(hourlyRateInput).replace(/\D/g, ""));
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
      if (detailModalTeacherId === editingTeacher.id) {
        loadDetailData(editingTeacher.id);
      }
    } catch (error) {
      console.error("Error updating hourly rate:", error);
      toast.error(error?.message || "Không thể cập nhật mức lương");
    } finally {
      setSubmittingRate(false);
    }
  };

  // Open & Save Class Override Rate
  const handleOpenClassRateModal = (cls) => {
    setEditingClassRate(cls);
    setClassRateInput(
      cls.teacherClassRateOverride ? String(cls.teacherClassRateOverride) : String(cls.effectiveHourlyRate || 0),
    );
  };

  const handleSaveClassRate = async (e, resetToDefault = false) => {
    if (e) e.preventDefault();
    if (!editingClassRate || !teacherDetail?.teacher) return;

    let targetRate = null;
    if (!resetToDefault) {
      const num = Number(String(classRateInput).replace(/\D/g, ""));
      if (!Number.isFinite(num) || num < 0) {
        toast.error("Vui lòng nhập mức thù lao hợp lệ!");
        return;
      }
      targetRate = num;
    }

    setSubmittingClassRate(true);
    try {
      await updateTeacherClassHourlyRate(teacherDetail.teacher.id, editingClassRate.classId, targetRate);
      toast.success(
        resetToDefault
          ? `Đã khôi phục mức lương mặc định của giảng viên cho lớp ${editingClassRate.code}!`
          : `Đã cập nhật đơn giá ${targetRate.toLocaleString("vi-VN")} ₫/giờ cho lớp ${editingClassRate.code}!`,
      );
      setEditingClassRate(null);
      loadDetailData(teacherDetail.teacher.id);
      loadSalaries();
    } catch (error) {
      console.error("Error updating class hourly rate:", error);
      toast.error(error?.message || "Không thể cập nhật mức lương cho lớp");
    } finally {
      setSubmittingClassRate(false);
    }
  };

  // Open & Save Session Adjustments
  const handleOpenSessionModal = (session) => {
    setEditingSession(session);
    setSessionHoursInput(String(session.durationHours || 2.0));
    setSessionStatusInput(session.status || (session.isCompleted ? "ended" : "scheduled"));
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();
    if (!editingSession || !teacherDetail?.teacher) return;

    const numH = Number(sessionHoursInput);
    if (!Number.isFinite(numH) || numH <= 0 || numH > 16) {
      toast.error("Số giờ của buổi học phải từ 0.25h đến 16h!");
      return;
    }

    setSubmittingSession(true);
    try {
      await updateSessionSalaryParameters(editingSession.id, {
        durationHours: numH,
        status: sessionStatusInput,
      });
      toast.success(`Đã cập nhật buổi học "${editingSession.title}" (${numH}h, ${sessionStatusInput})!`);
      setEditingSession(null);
      loadDetailData(teacherDetail.teacher.id);
      loadSalaries();
    } catch (error) {
      console.error("Error updating session parameters:", error);
      toast.error(error?.message || "Không thể cập nhật thông số buổi học");
    } finally {
      setSubmittingSession(false);
    }
  };

  // Toggle quick session completed status
  const handleToggleSessionStatus = async (session) => {
    if (!teacherDetail?.teacher) return;
    const nextStatus = session.isCompleted ? "scheduled" : "ended";
    try {
      await updateSessionSalaryParameters(session.id, { status: nextStatus });
      toast.success(
        nextStatus === "ended"
          ? `Đã đánh dấu hoàn thành buổi "${session.title}" (+${formatVnd(session.projectedAmount)})`
          : `Đã chuyển buổi "${session.title}" về chưa diễn ra`,
      );
      loadDetailData(teacherDetail.teacher.id);
      loadSalaries();
    } catch (error) {
      console.error("Error toggling session status:", error);
      toast.error(error?.message || "Không thể chuyển trạng thái buổi học");
    }
  };

  // Save Settlement & Payment Status
  const handleSaveSettlement = async (e) => {
    e.preventDefault();
    if (!teacherDetail?.teacher) return;

    setSavingSettlement(true);
    try {
      await updateTeacherSalarySettlement(teacherDetail.teacher.id, {
        bonusAmount: Number(bonusInput) || 0,
        deductionAmount: Number(deductionInput) || 0,
        paymentStatus: settlementStatusInput,
        notes: notesInput,
      });
      toast.success("Đã lưu quyết toán thù lao và cập nhật trạng thái thanh toán thành công! 💰");
      loadDetailData(teacherDetail.teacher.id);
      loadSalaries();
    } catch (error) {
      console.error("Error saving settlement:", error);
      toast.error(error?.message || "Không thể lưu quyết toán thù lao");
    } finally {
      setSavingSettlement(false);
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
    totalNetSalary: 0,
    totalProjectedSalary: 0,
    totalCompletedHours: 0,
    totalCompletedSessions: 0,
    paidCount: 0,
    pendingCount: 0,
  };

  // Filtered classes inside detail modal
  const displayedDetailClasses = useMemo(() => {
    if (!teacherDetail?.classes) return [];
    if (selectedClassFilter === "all") return teacherDetail.classes;
    return teacherDetail.classes.filter((c) => String(c.classId) === String(selectedClassFilter));
  }, [teacherDetail, selectedClassFilter]);

  const renderPaymentBadge = (status) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <FiCheck className="w-3 h-3" /> Đã thanh toán
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-mono bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-sky-300 border border-blue-200 dark:border-blue-800">
            <FiClock className="w-3 h-3" /> Đang xử lý
          </span>
        );
      case "hold":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-mono bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <FiAlertCircle className="w-3 h-3" /> Tạm giữ
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-mono bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <FiClock className="w-3 h-3" /> Chưa thanh toán
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Quản Trị Hệ Thống & Tài Chính Đào Tạo
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
            <FiDollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Quản Lý & Quyết Toán Bảng Lương Giảng Viên
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
            Admin quản lý đơn giá theo giờ, điều chỉnh thù lao theo từng lớp học & buổi học, ghi nhận thưởng / phạt và quyết toán chi trả.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={adminTeacherSalariesExportUrl({ format: "xlsx", search, rateStatus, paymentStatus })}
            download
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-sm"
            title="Xuất file Excel bảng lương chi tiết"
          >
            <FiDownload className="w-4 h-4" />
            <span>Xuất Excel</span>
          </a>
          <a
            href={adminTeacherSalariesExportUrl({ format: "csv", search, rateStatus, paymentStatus })}
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
            <span>Tổng thù lao dạy học</span>
            <FiDollarSign className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1.5 leading-tight font-mono">
            {formatVnd(kpis.totalAccruedSalary)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Từ {kpis.totalCompletedSessions} buổi ({kpis.totalCompletedHours}h đã dạy)
          </p>
        </div>

        {/* KPI 2: Tổng thực chi quyết toán */}
        <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-blue-800 dark:text-sky-400 font-bold uppercase tracking-wider font-mono">
            <span>Tổng thực chi sau điều chỉnh</span>
            <FiTrendingUp className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-sky-300 mt-1.5 leading-tight font-mono">
            {formatVnd(kpis.totalNetSalary)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Đã cộng thưởng và trừ phạt
          </p>
        </div>

        {/* KPI 3: Tình trạng thanh toán */}
        <div className="rounded-2xl border border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-purple-800 dark:text-purple-400 font-bold uppercase tracking-wider font-mono">
            <span>Tiến độ thanh toán</span>
            <FiCheckCircle className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1.5 font-mono">
            <span className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 leading-tight">
              {kpis.paidCount}
            </span>
            <span className="text-xs font-bold text-slate-400">/ {kpis.totalTeachersCount} đã chi trả</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Còn {kpis.pendingCount} giảng viên chưa quyết toán
          </p>
        </div>

        {/* KPI 4: Đơn giá & Nhân sự */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider font-mono">
            <span>Gán đơn giá</span>
            <FiUsers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1.5 font-mono">
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
                <FiCheckCircle className="w-3 h-3" /> Tất cả đã gán đơn giá
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Toolbar: Search, Filters */}
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

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Rate status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium hidden lg:inline">Đơn giá:</span>
            <select
              value={rateStatus}
              onChange={(e) => setRateStatus(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">Tất cả đơn giá</option>
              <option value="assigned">Đã gán lương (&gt; 0đ)</option>
              <option value="unassigned">Chưa gán lương (0đ)</option>
            </select>
          </div>

          {/* Payment status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium hidden lg:inline">Thanh toán:</span>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">Tất cả thanh toán</option>
              <option value="pending">Chưa thanh toán</option>
              <option value="processing">Đang xử lý</option>
              <option value="paid">Đã thanh toán</option>
              <option value="hold">Tạm giữ</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 uppercase tracking-wider text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
              <tr>
                <th className="py-3.5 px-5">Giảng Viên</th>
                <th className="py-3.5 px-3 text-center">Đơn Giá Cơ Bản</th>
                <th className="py-3.5 px-3 text-center">Lớp Phụ Trách</th>
                <th className="py-3.5 px-3 text-center">Tiến Độ Buổi Dạy</th>
                <th className="py-3.5 px-3 text-center">Giờ Dạy Thực Tế</th>
                <th className="py-3.5 px-3 text-right">Lương Dạy Học</th>
                <th className="py-3.5 px-3 text-right">Thưởng / Phạt</th>
                <th className="py-3.5 px-4 text-right">Thực Lĩnh</th>
                <th className="py-3.5 px-3 text-center">Trạng Thái</th>
                <th className="py-3.5 px-5 text-right">Hành Động</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12">
                    <Loading loading={true} text="Đang tải dữ liệu bảng lương..." fullScreen={false} />
                  </td>
                </tr>
              ) : data.teachers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Không tìm thấy giảng viên nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                data.teachers.map((t) => {
                  const roleBadge =
                    t.role === "admin"
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200"
                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200";

                  const adjustNet = Number(t.bonusAmount || 0) - Number(t.deductionAmount || 0);

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                    >
                      {/* Teacher Profile */}
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

                      {/* Hourly rate */}
                      <td className="py-3.5 px-3 text-center">
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

                      {/* Classes Count */}
                      <td className="py-3.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                        {t.classesCount} lớp
                      </td>

                      {/* Sessions Progress */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {t.completedSessions} / {t.totalSessions} buổi
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({t.progressPct}%)
                          </span>
                        </div>
                      </td>

                      {/* Completed Hours */}
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {t.completedHours}h
                        <span className="text-[10px] text-slate-400 block font-normal">
                          / {t.totalHours}h dự kiến
                        </span>
                      </td>

                      {/* Accrued Salary from hours */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatVnd(t.accruedSalary)}
                      </td>

                      {/* Bonus / Deduction */}
                      <td className="py-3.5 px-3 text-right font-mono text-[11px]">
                        {adjustNet > 0 ? (
                          <span className="text-emerald-600 font-bold">+{formatVnd(adjustNet)}</span>
                        ) : adjustNet < 0 ? (
                          <span className="text-rose-600 font-bold">{formatVnd(adjustNet)}</span>
                        ) : (
                          <span className="text-slate-400">0 ₫</span>
                        )}
                      </td>

                      {/* Net Salary (Thực lĩnh) */}
                      <td className="py-3.5 px-4 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                        {formatVnd(t.netAccruedSalary)}
                      </td>

                      {/* Payment Status Badge */}
                      <td className="py-3.5 px-3 text-center">
                        {renderPaymentBadge(t.paymentStatus)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailModal(t)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-2xs"
                            title="Xem chi tiết các lớp, buổi học & quyết toán"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                            <span>Chi tiết & Quyết toán</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Gán mức lương theo giờ cơ bản"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
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

      {/* Modal: Gán / Chỉnh sửa mức lương cơ bản theo giờ */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FiDollarSign className="w-5 h-5 text-emerald-600" />
                Đơn Giá Lương Theo Giờ Cơ Bản
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
                  Mức lương theo giờ cơ bản (VNĐ / giờ):
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
                  {submittingRate ? "Đang lưu..." : "Lưu Đơn Giá"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: CHI TIẾT BẢNG LƯƠNG & QUYẾT TOÁN TOÀN DIỆN */}
      {detailModalTeacherId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3 min-w-0">
                {teacherDetail?.teacher && (
                  <img
                    src={
                      teacherDetail.teacher.avatarUrl ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${teacherDetail.teacher.username || "Teacher"}`
                    }
                    alt=""
                    className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                      {teacherDetail?.teacher?.fullName || teacherDetail?.teacher?.username || "Chi Tiết Bảng Lương"}
                    </h3>
                    {teacherDetail?.summary?.paymentStatus && renderPaymentBadge(teacherDetail.summary.paymentStatus)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate font-mono">
                    @{teacherDetail?.teacher?.username} · {teacherDetail?.teacher?.email} · Đơn giá chuẩn:{" "}
                    <strong className="text-emerald-600">{formatVnd(teacherDetail?.teacher?.hourlyRate)}/h</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition"
                  title="In phiếu lương này"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">In phiếu lương</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalTeacherId(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Teacher KPI Strip */}
            {teacherDetail && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                {/* Lương dạy học */}
                <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
                  <p className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 font-mono">
                    Lương giờ dạy
                  </p>
                  <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                    {formatVnd(teacherDetail.summary.accruedSalary)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {teacherDetail.summary.completedSessions} buổi ({teacherDetail.summary.completedHours}h)
                  </p>
                </div>

                {/* Thưởng / Phụ cấp */}
                <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                  <p className="text-[10px] uppercase font-bold text-blue-800 dark:text-sky-400 font-mono">
                    Thưởng / Phụ cấp
                  </p>
                  <p className="text-base sm:text-lg font-black text-blue-700 dark:text-sky-300 font-mono mt-0.5">
                    +{formatVnd(teacherDetail.summary.bonusAmount)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Điều chỉnh cộng</p>
                </div>

                {/* Khấu trừ */}
                <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50">
                  <p className="text-[10px] uppercase font-bold text-rose-800 dark:text-rose-400 font-mono">
                    Khấu trừ / Phạt
                  </p>
                  <p className="text-base sm:text-lg font-black text-rose-700 dark:text-rose-300 font-mono mt-0.5">
                    -{formatVnd(teacherDetail.summary.deductionAmount)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Điều chỉnh giảm</p>
                </div>

                {/* Thực nhận ròng */}
                <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xs">
                  <p className="text-[10px] uppercase font-bold text-emerald-100 font-mono">
                    Thực lĩnh quyết toán
                  </p>
                  <p className="text-base sm:text-xl font-black font-mono mt-0.5">
                    {formatVnd(teacherDetail.summary.netAccruedSalary)}
                  </p>
                  <p className="text-[10px] text-emerald-100/80 mt-0.5 truncate">
                    Trạng thái: {PAYMENT_STATUS_LABELS[teacherDetail.summary.paymentStatus] || teacherDetail.summary.paymentStatus}
                  </p>
                </div>
              </div>
            )}

            {/* Modal Tabs Navigation */}
            <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900 shrink-0">
              <button
                type="button"
                onClick={() => setDetailTab("classes")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
                  detailTab === "classes"
                    ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <FiLayers className="w-4 h-4" />
                <span>Chi Tiết Lớp & Buổi Học ({teacherDetail?.classes?.length || 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab("settlement")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
                  detailTab === "settlement"
                    ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <FiSliders className="w-4 h-4" />
                <span>Quyết Toán & Điều Chỉnh Thù Lao</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab("payslip")}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
                  detailTab === "payslip"
                    ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <FiFileText className="w-4 h-4" />
                <span>Phiếu Lương In Ấn</span>
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {loadingDetail ? (
                <div className="py-16">
                  <Loading loading={true} text="Đang tải dữ liệu chi tiết giảng viên..." fullScreen={false} />
                </div>
              ) : !teacherDetail ? (
                <p className="text-center py-12 text-slate-400 text-xs">Không tìm thấy dữ liệu.</p>
              ) : detailTab === "classes" ? (
                /* TAB 1: CHI TIẾT TỪNG LỚP & BUỔI HỌC */
                <div className="space-y-4">
                  {/* Class selector bar if multiple classes */}
                  {teacherDetail.classes.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setSelectedClassFilter("all")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                          selectedClassFilter === "all"
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                        }`}
                      >
                        Tất cả các lớp ({teacherDetail.classes.length})
                      </button>
                      {teacherDetail.classes.map((cls) => (
                        <button
                          key={cls.classId}
                          type="button"
                          onClick={() => setSelectedClassFilter(cls.classId)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                            String(selectedClassFilter) === String(cls.classId)
                              ? "bg-emerald-600 text-white shadow-2xs"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                          }`}
                        >
                          {cls.code}: {cls.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {displayedDetailClasses.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                      Giảng viên chưa được phân công lớp học nào hoặc chưa có buổi học.
                    </div>
                  ) : (
                    displayedDetailClasses.map((cls) => (
                      <div
                        key={cls.classId}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 sm:p-5 space-y-3.5"
                      >
                        {/* Class Card Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-sky-300 border border-blue-200">
                                {cls.code}
                              </span>
                              <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                                {cls.title}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {cls.courseTitle} · Vai trò:{" "}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {cls.teachingRole === "lead" ? "Giảng viên chính" : "Trợ giảng / Đồng giảng"}
                              </strong>{" "}
                              · Đã dạy: <strong>{cls.completedSessions}/{cls.totalSessions} buổi</strong> ({cls.completedHours}h)
                            </p>
                          </div>

                          <div className="flex items-center sm:items-end justify-between sm:justify-start gap-4">
                            {/* Class rate info & override button */}
                            <div className="text-left sm:text-right">
                              <div className="flex items-center gap-1.5 justify-start sm:justify-end">
                                <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Đơn giá lớp:</span>
                                <span className="text-xs font-black text-[#102f63] dark:text-sky-300 font-mono">
                                  {formatVnd(cls.effectiveHourlyRate)}/h
                                </span>
                                {cls.hasCustomRate && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    Đơn giá riêng
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenClassRateModal(cls)}
                                className="mt-1 text-[11px] font-bold text-blue-600 dark:text-sky-400 hover:underline flex items-center gap-1 sm:justify-end"
                              >
                                <FiEdit2 className="w-3 h-3" /> Sửa đơn giá lớp này
                              </button>
                            </div>

                            {/* Class Accrued Total */}
                            <div className="text-right pl-3 border-l border-slate-200 dark:border-slate-800">
                              <p className="text-[10px] font-mono font-bold uppercase text-slate-400">Lương tạm tính</p>
                              <p className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                {formatVnd(cls.accruedSalary)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Sessions Table */}
                        {cls.sessions.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">Lớp này chưa có buổi học nào.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 font-mono uppercase text-[10px] text-slate-400 font-bold">
                                <tr>
                                  <th className="py-2.5 px-3">#</th>
                                  <th className="py-2.5 px-3">Tên buổi học</th>
                                  <th className="py-2.5 px-3">Thời gian</th>
                                  <th className="py-2.5 px-3 text-center">Thời lượng</th>
                                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                                  <th className="py-2.5 px-3 text-right">Thù lao</th>
                                  <th className="py-2.5 px-3 text-right">Thao tác</th>
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
                                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
                                        {sess.title}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                                        {dateStr} {timeStr && `(${timeStr})`}
                                      </td>
                                      <td className="py-2 px-3 text-center font-mono font-bold">
                                        <span className="inline-flex items-center gap-1">
                                          {sess.durationHours}h
                                          {sess.isCustomDuration && (
                                            <span className="text-[9px] text-blue-600" title="Thời lượng tùy chỉnh">(sửa)</span>
                                          )}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {sess.isCompleted ? (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleSessionStatus(sess)}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 hover:bg-rose-50 hover:text-rose-700 transition"
                                            title="Click để chuyển về chưa diễn ra"
                                          >
                                            <FiCheckCircle className="w-2.5 h-2.5" /> Đã dạy
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleSessionStatus(sess)}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 transition"
                                            title="Click để đánh dấu đã dạy"
                                          >
                                            Chưa diễn ra
                                          </button>
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
                                      <td className="py-2 px-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenSessionModal(sess)}
                                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-sky-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                          title="Chỉnh sửa giờ dạy / trạng thái buổi học"
                                        >
                                          <FiEdit2 className="w-3.5 h-3.5" />
                                        </button>
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
              ) : detailTab === "settlement" ? (
                /* TAB 2: QUYẾT TOÁN & ĐIỀU CHỈNH THÙ LAO */
                <form onSubmit={handleSaveSettlement} className="max-w-2xl mx-auto space-y-4">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <FiSliders className="w-4 h-4 text-emerald-600" />
                      Điều Chỉnh Quyết Toán & Thanh Toán Lương
                    </h4>
                    <p className="text-xs text-slate-500">
                      Ghi nhận các khoản thưởng chuyên cần, phụ cấp hỗ trợ học viên, các khoản khấu trừ và cập nhật trạng thái chi trả.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Thưởng / Phụ cấp */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Thưởng / Phụ cấp (VNĐ):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={bonusInput}
                        onChange={(e) => setBonusInput(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-emerald-600 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Khấu trừ */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Khấu trừ / Phạt (VNĐ):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={deductionInput}
                        onChange={(e) => setDeductionInput(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-rose-600 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  {/* Trạng thái thanh toán */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Trạng thái thanh toán thù lao:
                    </label>
                    <select
                      value={settlementStatusInput}
                      onChange={(e) => setSettlementStatusInput(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="pending">Chưa thanh toán</option>
                      <option value="processing">Đang xử lý thanh toán (Kế toán đã duyệt)</option>
                      <option value="paid">Đã thanh toán hoàn tất</option>
                      <option value="hold">Tạm giữ chi trả</option>
                    </select>
                  </div>

                  {/* Ghi chú quyết toán */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Ghi chú quyết toán & Chuyển khoản:
                    </label>
                    <textarea
                      rows={3}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Ví dụ: Đã chuyển khoản qua VCB số GD 882910 vào ngày 20/10; Thưởng 200k hỗ trợ học sinh ôn thi giải tỉnh..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Tính toán thực lĩnh tạm tính theo form */}
                  <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-emerald-900 dark:text-emerald-300">
                        Thực nhận dự kiến sau lưu:
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatVnd(teacherDetail.summary.accruedSalary)} (Lương dạy) + {formatVnd(bonusInput)} (Thưởng) - {formatVnd(deductionInput)} (Phạt)
                      </p>
                    </div>
                    <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                      {formatVnd(
                        Math.max(
                          0,
                          Number(teacherDetail.summary.accruedSalary || 0) +
                            Number(bonusInput || 0) -
                            Number(deductionInput || 0),
                        ),
                      )}
                    </p>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingSettlement}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50"
                    >
                      <FiSave className="w-4 h-4" />
                      <span>{savingSettlement ? "Đang lưu..." : "Lưu Quyết Toán Lương"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* TAB 3: PHIẾU LƯƠNG IN ẤN */
                <div className="max-w-2xl mx-auto bg-white dark:bg-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-800 dark:text-slate-200">
                  <div className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase">
                        Học Viện Tin Học CSCA
                      </h2>
                      <p className="text-xs text-slate-500">PHIẾU THANH TOÁN THÙ LAO GIẢNG DẠY</p>
                    </div>
                    <div className="text-right text-xs font-mono text-slate-400">
                      <p>Ngày xuất: {new Date().toLocaleDateString("vi-VN")}</p>
                      <p>Kỳ lương: Tổng hợp tích lũy</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-slate-400">Họ và tên giảng viên:</p>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">
                        {teacherDetail.teacher.fullName || teacherDetail.teacher.username}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Email & Tài khoản:</p>
                      <p className="font-mono">{teacherDetail.teacher.email}</p>
                    </div>
                  </div>

                  <table className="w-full text-xs divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
                    <thead className="text-[10px] uppercase font-bold text-slate-500 font-mono">
                      <tr>
                        <th className="py-2 text-left">Nội dung</th>
                        <th className="py-2 text-center">Số buổi / Giờ</th>
                        <th className="py-2 text-right">Đơn giá</th>
                        <th className="py-2 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {teacherDetail.classes.map((cls) => (
                        <tr key={cls.classId}>
                          <td className="py-2 text-left font-sans font-medium">
                            {cls.code}: {cls.title}
                          </td>
                          <td className="py-2 text-center">
                            {cls.completedSessions} buổi ({cls.completedHours}h)
                          </td>
                          <td className="py-2 text-right">{formatVnd(cls.effectiveHourlyRate)}/h</td>
                          <td className="py-2 text-right font-bold text-emerald-600">
                            {formatVnd(cls.accruedSalary)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="space-y-1.5 text-xs font-mono pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-sans">1. Tổng thù lao theo giờ:</span>
                      <span className="font-bold">{formatVnd(teacherDetail.summary.accruedSalary)}</span>
                    </div>
                    <div className="flex justify-between text-blue-600">
                      <span className="font-sans">2. Thưởng & Phụ cấp:</span>
                      <span>+{formatVnd(teacherDetail.summary.bonusAmount)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span className="font-sans">3. Khấu trừ:</span>
                      <span>-{formatVnd(teacherDetail.summary.deductionAmount)}</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-emerald-600 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <span className="font-sans">TỔNG THỰC LĨNH:</span>
                      <span>{formatVnd(teacherDetail.summary.netAccruedSalary)}</span>
                    </div>
                  </div>

                  {teacherDetail.summary.paymentNotes && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs">
                      <p className="font-bold text-slate-500">Ghi chú quyết toán:</p>
                      <p className="mt-0.5">{teacherDetail.summary.paymentNotes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-center text-xs pt-8">
                    <div>
                      <p className="font-bold">Người lập bảng</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">(Ký và ghi rõ họ tên)</p>
                      <div className="h-16" />
                    </div>
                    <div>
                      <p className="font-bold">Người nhận tiền</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">(Ký và ghi rõ họ tên)</p>
                      <div className="h-16" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900">
              <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                {teacherDetail?.summary?.formulaNote}
              </span>
              <button
                type="button"
                onClick={() => setDetailModalTeacherId(null)}
                className="ml-auto px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Chỉnh sửa đơn giá riêng theo từng lớp học */}
      {editingClassRate && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FiDollarSign className="w-5 h-5 text-emerald-600" />
                Đơn Giá Riêng Cho Lớp Học
              </h3>
              <button
                type="button"
                onClick={() => setEditingClassRate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => handleSaveClassRate(e, false)} className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-sky-300 border border-blue-200">
                  {editingClassRate.code}
                </span>
                <p className="font-bold text-slate-900 dark:text-white text-sm mt-1">
                  {editingClassRate.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đơn giá cơ bản của GV: <strong>{formatVnd(teacherDetail?.teacher?.hourlyRate)}/h</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mức lương riêng áp dụng cho lớp này (VNĐ / giờ):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    required
                    value={classRateInput}
                    onChange={(e) => setClassRateInput(e.target.value)}
                    placeholder="Ví dụ: 350000"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    VNĐ / giờ
                  </span>
                </div>
              </div>

              {/* Quick Select Presets */}
              <div className="grid grid-cols-3 gap-2">
                {PRESET_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setClassRateInput(String(rate))}
                    className={`px-2 py-1.5 rounded-xl text-xs font-bold font-mono transition border ${
                      Number(classRateInput) === rate
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {formatVnd(rate)}/h
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleSaveClassRate(null, true)}
                  disabled={submittingClassRate}
                  className="text-xs text-rose-600 hover:underline font-bold"
                >
                  Dùng lương mặc định
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingClassRate(null)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingClassRate}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                  >
                    {submittingClassRate ? "Đang lưu..." : "Lưu Đơn Giá Lớp"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Chỉnh sửa thông số buổi học (Thời lượng & Trạng thái) */}
      {editingSession && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FiClock className="w-5 h-5 text-emerald-600" />
                Chỉnh Sửa Giờ Dạy & Trạng Thái Buổi Học
              </h3>
              <button
                type="button"
                onClick={() => setEditingSession(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="font-bold text-slate-900 dark:text-white text-sm">
                  {editingSession.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  ID: #{editingSession.id} · Buổi #{editingSession.sessionNumber}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Thời lượng giảng dạy thực tế (Giờ):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.25"
                    max="12"
                    step="0.25"
                    required
                    value={sessionHoursInput}
                    onChange={(e) => setSessionHoursInput(e.target.value)}
                    placeholder="2.0"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    giờ
                  </span>
                </div>
                {/* Preset session hour buttons */}
                <div className="flex gap-2 mt-2">
                  {[1.0, 1.5, 2.0, 2.5, 3.0].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setSessionHoursInput(String(h))}
                      className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border ${
                        Number(sessionHoursInput) === h
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Trạng thái buổi học:
                </label>
                <select
                  value={sessionStatusInput}
                  onChange={(e) => setSessionStatusInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="ended">Đã dạy / Kết thúc (Được tính thù lao)</option>
                  <option value="scheduled">Chưa diễn ra (Dự kiến, chưa tính lương)</option>
                  <option value="live">Đang diễn ra</option>
                  <option value="cancelled">Đã hủy (Không tính thù lao)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingSession}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {submittingSession ? "Đang lưu..." : "Cập Nhật Buổi Học"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
