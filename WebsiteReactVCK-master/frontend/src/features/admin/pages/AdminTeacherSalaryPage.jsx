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
  FiPrinter,
  FiFileText,
  FiSliders,
  FiLayers,
  FiSave,
  FiCheck,
  FiX,
  FiShield,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  fetchAdminTeacherSalaries,
  fetchAdminTeacherSalaryDetail,
  updateTeacherHourlyRate,
  updateTeacherClassHourlyRate,
  updateSessionSalaryParameters,
  cancelLiveSession,
  updateTeacherSalarySettlement,
  adminTeacherSalariesExportUrl,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import AdminTeacherFaceEnrollmentsPanel from "../components/AdminTeacherFaceEnrollmentsPanel.jsx";
import { overrideAdminSessionFaceAttendance } from "../../api/teacherFaceAttendanceClient";

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
  const [activeSection, setActiveSection] = useState("payroll"); // payroll | biometrics
  const [pendingFaceCount, setPendingFaceCount] = useState(0);

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
  const [editingClassRate, setEditingClassRate] = useState(null);
  const [classRateInput, setClassRateInput] = useState("");
  const [submittingClassRate, setSubmittingClassRate] = useState(false);

  // Session edit modal
  const [editingSession, setEditingSession] = useState(null);
  const [sessionHoursInput, setSessionHoursInput] = useState("");
  const [sessionStatusInput, setSessionStatusInput] = useState("ended");
  const [submittingSession, setSubmittingSession] = useState(false);

  // Settlement edit form state (inside Detail Modal)
  const [bonusInput, setBonusInput] = useState(0);
  const [deductionInput, setDeductionInput] = useState(0);
  const [settlementStatusInput, setSettlementStatusInput] = useState("pending");
  const [notesInput, setNotesInput] = useState("");
  const [savingSettlement, setSavingSettlement] = useState(false);

  // Face attendance photo preview & override busy state
  const [facePreviewSession, setFacePreviewSession] = useState(null);
  const [overridingSessionId, setOverridingSessionId] = useState(null);

  const formatVnd = (amount) => `${Number(amount || 0).toLocaleString("vi-VN")} ₫`;

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

  const handleFaceAttendanceOverride = async (sess, decision) => {
    if (!detailModalTeacherId) return;
    let note = "";
    if (decision === "approved" || decision === "rejected") {
      const promptLabel =
        decision === "approved"
          ? "Ghi chú duyệt tính lương cho buổi này (tùy chọn):"
          : "Nhập lý do từ chối tính lương buổi này:";
      const entered = window.prompt(promptLabel, "");
      if (entered === null) return;
      note = entered;
    }

    try {
      setOverridingSessionId(sess.id);
      const res = await overrideAdminSessionFaceAttendance(sess.id, detailModalTeacherId, {
        decision,
        note,
      });
      toast.success(res?.message || "Đã cập nhật trạng thái chấm công tính lương");
      await Promise.all([loadDetailData(detailModalTeacherId), loadSalaries()]);
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật trạng thái chấm công");
    } finally {
      setOverridingSessionId(null);
    }
  };

  const handleSaveHourlyRate = async (e) => {
    e.preventDefault();
    if (!editingTeacher) return;

    const rateNum = Number(String(hourlyRateInput).replace(/\D/g, ""));
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error("Vui lòng nhập mức lương hợp lệ.");
      return;
    }

    setSubmittingRate(true);
    try {
      await updateTeacherHourlyRate(editingTeacher.id, rateNum);
      toast.success(
        `Đã gán mức lương ${rateNum.toLocaleString("vi-VN")} ₫/giờ cho ${editingTeacher.fullName || editingTeacher.username}.`,
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

  const handleOpenClassRateModal = (cls) => {
    setEditingClassRate(cls);
    setClassRateInput(
      cls.teacherClassRateOverride
        ? String(cls.teacherClassRateOverride)
        : String(cls.effectiveHourlyRate || 0),
    );
  };

  const handleSaveClassRate = async (e, resetToDefault = false) => {
    if (e) e.preventDefault();
    if (!editingClassRate || !teacherDetail?.teacher) return;

    let targetRate = null;
    if (!resetToDefault) {
      const num = Number(String(classRateInput).replace(/\D/g, ""));
      if (!Number.isFinite(num) || num < 0) {
        toast.error("Vui lòng nhập mức thù lao hợp lệ.");
        return;
      }
      targetRate = num;
    }

    setSubmittingClassRate(true);
    try {
      await updateTeacherClassHourlyRate(
        teacherDetail.teacher.id,
        editingClassRate.classId,
        targetRate,
      );
      toast.success(
        resetToDefault
          ? `Đã khôi phục đơn giá mặc định cho lớp ${editingClassRate.code}.`
          : `Đã cập nhật đơn giá ${targetRate.toLocaleString("vi-VN")} ₫/giờ cho lớp ${editingClassRate.code}.`,
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
      toast.error("Số giờ của buổi học phải từ 0.25h đến 16h.");
      return;
    }

    setSubmittingSession(true);
    try {
      if (sessionStatusInput === "cancelled") {
        const reason = window.prompt(
          "Nhập lý do hủy buổi học (giáo trình sẽ tự dồn sang buổi tiếp theo):",
          "Giáo viên bận",
        );
        if (!reason?.trim()) {
          setSubmittingSession(false);
          return;
        }
        await cancelLiveSession({ sessionId: editingSession.id, reason: reason.trim() });
      } else {
        await updateSessionSalaryParameters(editingSession.id, {
          durationHours: numH,
          status: sessionStatusInput,
        });
      }
      toast.success(
        sessionStatusInput === "cancelled"
          ? `Đã hủy buổi "${editingSession.title}", không tính lương và cập nhật lại lịch.`
          : `Đã cập nhật buổi học "${editingSession.title}" (${numH}h).`,
      );
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
      toast.success("Đã lưu quyết toán thù lao và cập nhật trạng thái thanh toán.");
      loadDetailData(teacherDetail.teacher.id);
      loadSalaries();
    } catch (error) {
      console.error("Error saving settlement:", error);
      toast.error(error?.message || "Không thể lưu quyết toán thù lao");
    } finally {
      setSavingSettlement(false);
    }
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

  const displayedDetailClasses = useMemo(() => {
    if (!teacherDetail?.classes) return [];
    if (selectedClassFilter === "all") return teacherDetail.classes;
    return teacherDetail.classes.filter((c) => String(c.classId) === String(selectedClassFilter));
  }, [teacherDetail, selectedClassFilter]);

  const renderPaymentBadge = (status) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300">
            <FiCheck className="h-3 w-3" /> Đã thanh toán
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-sky-300">
            <FiClock className="h-3 w-3" /> Đang xử lý
          </span>
        );
      case "hold":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
            <FiAlertCircle className="h-3 w-3" /> Tạm giữ
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300">
            <FiClock className="h-3 w-3" /> Chưa thanh toán
          </span>
        );
    }
  };

  return (
    <div className="min-w-0 space-y-5 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Lương & chấm công giảng viên
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Quản lý đơn giá theo giờ, đối soát chấm công khuôn mặt và quyết toán chi trả.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={adminTeacherSalariesExportUrl({
              format: "xlsx",
              search,
              rateStatus,
              paymentStatus,
            })}
            download
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            title="Xuất file Excel bảng lương chi tiết"
          >
            <FiDownload className="h-3.5 w-3.5" />
            <span>Xuất Excel</span>
          </a>
          <a
            href={adminTeacherSalariesExportUrl({
              format: "csv",
              search,
              rateStatus,
              paymentStatus,
            })}
            download
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Xuất file CSV"
          >
            <FiDownload className="h-3.5 w-3.5" />
            <span>Xuất CSV</span>
          </a>
          <button
            type="button"
            onClick={loadSalaries}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards (2x2 mobile / 4-col desktop) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-3.5 sm:p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thù lao dạy học
            </span>
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FiDollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="mt-2 truncate font-mono text-base sm:text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatVnd(kpis.totalAccruedSalary)}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {kpis.totalCompletedSessions} buổi ({kpis.totalCompletedHours}h)
          </p>
        </div>

        <div className="min-w-0 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-3.5 sm:p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thực chi quyết toán
            </span>
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FiTrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <p className="mt-2 truncate font-mono text-base sm:text-xl font-black tabular-nums text-blue-600 dark:text-sky-400">
            {formatVnd(kpis.totalNetSalary)}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            Sau thưởng & khấu trừ
          </p>
        </div>

        <div className="min-w-0 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-3.5 sm:p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tiến độ chi trả
            </span>
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <FiCheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1 font-mono">
            <span className="text-base sm:text-xl font-black tabular-nums text-purple-600 dark:text-purple-400">
              {kpis.paidCount}
            </span>
            <span className="truncate text-[11px] font-bold text-slate-400">
              / {kpis.totalTeachersCount} đã trả
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            Còn {kpis.pendingCount} chưa quyết toán
          </p>
        </div>

        <div className="min-w-0 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-3.5 sm:p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Gán đơn giá
            </span>
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <FiUsers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1 font-mono">
            <span className="text-base sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {kpis.assignedHourlyRateCount}
            </span>
            <span className="truncate text-[11px] font-bold text-slate-400">
              / {kpis.totalTeachersCount} GV
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px]">
            {kpis.unassignedHourlyRateCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <FiAlertCircle className="h-3 w-3 shrink-0" /> {kpis.unassignedHourlyRateCount} chưa gán
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <FiCheckCircle className="h-3 w-3 shrink-0" /> Đã gán đầy đủ
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Section Switcher Tabs (Payroll vs Biometrics) */}
      <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 dark:border-slate-800 dark:bg-slate-900/90">
        <button
          type="button"
          onClick={() => setActiveSection("payroll")}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
            activeSection === "payroll"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <FiDollarSign className="h-3.5 w-3.5" />
          <span>Bảng lương & quyết toán</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection("biometrics")}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
            activeSection === "biometrics"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <FiShield className="h-3.5 w-3.5" />
          <span>Xác thực khuôn mặt</span>
          {pendingFaceCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                activeSection === "biometrics"
                  ? "bg-white text-blue-700"
                  : "bg-amber-500 text-white"
              }`}
            >
              {pendingFaceCount}
            </span>
          )}
        </button>
      </div>

      {/* Biometrics Panel (kept mounted for instant switching & live pending badge) */}
      <div className={activeSection === "biometrics" ? "block" : "hidden"}>
        <AdminTeacherFaceEnrollmentsPanel
          onEnrollmentReviewed={loadSalaries}
          onPendingCountChange={setPendingFaceCount}
        />
      </div>

      {/* Payroll Section */}
      {activeSection === "payroll" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-3 md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900/90">
            <div className="relative w-full md:w-72">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, email giảng viên..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rateStatus}
                onChange={(e) => setRateStatus(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value="all">Tất cả đơn giá</option>
                <option value="assigned">Đã gán lương (&gt; 0đ)</option>
                <option value="unassigned">Chưa gán lương (0đ)</option>
              </select>

              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              >
                <option value="all">Tất cả thanh toán</option>
                <option value="pending">Chưa thanh toán</option>
                <option value="processing">Đang xử lý</option>
                <option value="paid">Đã thanh toán</option>
                <option value="hold">Tạm giữ</option>
              </select>
            </div>
          </div>

          {/* Main Payroll Table */}
          <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-left text-xs">
                <thead className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 pl-4">Giảng viên</th>
                    <th className="px-3 py-2.5 text-center">Đơn giá cơ bản</th>
                    <th className="px-3 py-2.5 text-center">Lớp</th>
                    <th className="px-3 py-2.5 text-center">Tiến độ buổi</th>
                    <th className="px-3 py-2.5 text-center">Giờ dạy</th>
                    <th className="px-3 py-2.5 text-right">Lương dạy</th>
                    <th className="px-3 py-2.5 text-right">Thưởng / Phạt</th>
                    <th className="px-3 py-2.5 text-right">Thực lĩnh</th>
                    <th className="px-3 py-2.5 text-center">Trạng thái</th>
                    <th className="px-3 py-2.5 pr-4 text-right">Thao tác</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-12">
                        <Loading
                          loading={true}
                          text="Đang tải dữ liệu bảng lương..."
                          fullScreen={false}
                        />
                      </td>
                    </tr>
                  ) : data.teachers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        Không tìm thấy giảng viên nào phù hợp.
                      </td>
                    </tr>
                  ) : (
                    data.teachers.map((t) => {
                      const roleBadge =
                        t.role === "admin"
                          ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/70"
                          : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70";

                      const adjustNet = Number(t.bonusAmount || 0) - Number(t.deductionAmount || 0);

                      return (
                        <tr
                          key={t.id}
                          className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-3 py-2.5 pl-4">
                            <div className="flex items-center gap-2.5 min-w-[190px]">
                              <img
                                src={
                                  t.avatarUrl ||
                                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.username || "Teacher"}`
                                }
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover dark:border-slate-700 dark:bg-slate-800"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate font-bold text-slate-900 dark:text-white text-xs sm:text-sm max-w-[160px]">
                                    {t.fullName || t.username}
                                  </p>
                                  <span
                                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${roleBadge}`}
                                  >
                                    {t.role === "admin" ? "Admin" : "GV"}
                                  </span>
                                </div>
                                <p className="truncate font-mono text-[11px] text-slate-400 max-w-[200px]">
                                  @{t.username} · {t.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            {t.hourlyRate > 0 ? (
                              <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {formatVnd(t.hourlyRate)}/h
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300">
                                Chưa gán
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {t.classesCount} lớp
                          </td>

                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {t.completedSessions} / {t.totalSessions} buổi
                              </span>
                              <span className="text-[10px] text-slate-400">({t.progressPct}%)</span>
                              {t.attendancePendingSessions > 0 && (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300">
                                  {t.attendancePendingSessions} thiếu vào/ra
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {t.completedHours}h
                            <span className="block font-sans text-[10px] font-normal text-slate-400">
                              / {t.totalHours}h
                            </span>
                          </td>

                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatVnd(t.accruedSalary)}
                          </td>

                          <td className="px-3 py-2.5 text-right font-mono text-[11px] whitespace-nowrap">
                            {adjustNet > 0 ? (
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                +{formatVnd(adjustNet)}
                              </span>
                            ) : adjustNet < 0 ? (
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                {formatVnd(adjustNet)}
                              </span>
                            ) : (
                              <span className="text-slate-400">0 ₫</span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-right font-mono text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {formatVnd(t.netAccruedSalary)}
                          </td>

                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            {renderPaymentBadge(t.paymentStatus)}
                          </td>

                          <td className="px-3 py-2.5 pr-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDetailModal(t)}
                                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs transition hover:bg-blue-700"
                                title="Xem chi tiết các lớp, buổi học & quyết toán"
                              >
                                <FiEye className="h-3.5 w-3.5" />
                                <span>Chi tiết</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(t)}
                                className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                                title="Gán đơn giá theo giờ cơ bản"
                              >
                                <FiEdit2 className="h-3.5 w-3.5" />
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
        </div>
      )}

      {/* Modal: Gán / Chỉnh sửa mức lương cơ bản theo giờ */}
      {editingTeacher && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setEditingTeacher(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-base font-black text-[#102f63] dark:text-white">
                <FiDollarSign className="h-5 w-5 text-emerald-600" />
                Đơn giá lương cơ bản
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="rounded-xl bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHourlyRate} className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <img
                  src={
                    editingTeacher.avatarUrl ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${editingTeacher.username || "Teacher"}`
                  }
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-600"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {editingTeacher.fullName || editingTeacher.username}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                    {editingTeacher.email}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Mức lương theo giờ (VNĐ / giờ)
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 pr-20 font-mono text-sm font-black text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    VNĐ / giờ
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Chọn nhanh mức chuẩn
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setHourlyRateInput(String(rate))}
                      className={`rounded-xl border px-2 py-1.5 font-mono text-xs font-bold transition ${
                        Number(hourlyRateInput) === rate
                          ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {formatVnd(rate)}/h
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingRate}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingRate ? "Đang lưu..." : "Lưu đơn giá"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: CHI TIẾT BẢNG LƯƠNG & QUYẾT TOÁN */}
      {detailModalTeacherId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setDetailModalTeacherId(null)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex min-w-0 items-center gap-3">
                {teacherDetail?.teacher && (
                  <img
                    src={
                      teacherDetail.teacher.avatarUrl ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${teacherDetail.teacher.username || "Teacher"}`
                    }
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover dark:border-slate-700"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base sm:text-lg font-black text-[#102f63] dark:text-white">
                      {teacherDetail?.teacher?.fullName ||
                        teacherDetail?.teacher?.username ||
                        "Chi tiết bảng lương"}
                    </h3>
                    {teacherDetail?.summary?.paymentStatus &&
                      renderPaymentBadge(teacherDetail.summary.paymentStatus)}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                    @{teacherDetail?.teacher?.username} · {teacherDetail?.teacher?.email} · Đơn giá:{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {formatVnd(teacherDetail?.teacher?.hourlyRate)}/h
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  title="In phiếu lương này"
                >
                  <FiPrinter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">In phiếu lương</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalTeacherId(null)}
                  className="rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Teacher KPI Strip */}
            {teacherDetail && (
              <div className="grid shrink-0 grid-cols-2 gap-2.5 border-b border-slate-100 bg-white p-4 sm:grid-cols-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-400">
                    Lương giờ dạy
                  </p>
                  <p className="mt-0.5 truncate font-mono text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-300">
                    {formatVnd(teacherDetail.summary.accruedSalary)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    {teacherDetail.summary.completedSessions} buổi (
                    {teacherDetail.summary.completedHours}h)
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-200/70 bg-blue-50/60 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                  <p className="text-[10px] font-bold uppercase text-blue-800 dark:text-sky-400">
                    Thưởng / Phụ cấp
                  </p>
                  <p className="mt-0.5 truncate font-mono text-sm sm:text-base font-black text-blue-700 dark:text-sky-300">
                    +{formatVnd(teacherDetail.summary.bonusAmount)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    Điều chỉnh cộng
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/60 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
                  <p className="text-[10px] font-bold uppercase text-rose-800 dark:text-rose-400">
                    Khấu trừ / Phạt
                  </p>
                  <p className="mt-0.5 truncate font-mono text-sm sm:text-base font-black text-rose-700 dark:text-rose-300">
                    -{formatVnd(teacherDetail.summary.deductionAmount)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    Điều chỉnh giảm
                  </p>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-3 text-white shadow-xs">
                  <p className="text-[10px] font-bold uppercase text-blue-100">
                    Thực lĩnh quyết toán
                  </p>
                  <p className="mt-0.5 truncate font-mono text-sm sm:text-lg font-black">
                    {formatVnd(teacherDetail.summary.netAccruedSalary)}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-blue-100/85">
                    {PAYMENT_STATUS_LABELS[teacherDetail.summary.paymentStatus] ||
                      teacherDetail.summary.paymentStatus}
                  </p>
                </div>
              </div>
            )}

            {/* Attendance Audit Strip */}
            {teacherDetail && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] sm:px-5 dark:border-slate-800 dark:bg-slate-900/60">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  Đối soát chấm công:
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-bold ${
                    teacherDetail.teacher?.faceEnrollmentStatus === "approved"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : teacherDetail.teacher?.faceEnrollmentStatus === "pending_approval"
                        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300"
                        : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  Khuôn mặt:{" "}
                  {teacherDetail.teacher?.faceEnrollmentStatus === "approved"
                    ? "Đã duyệt & khóa"
                    : teacherDetail.teacher?.faceEnrollmentStatus === "pending_approval"
                      ? "Chờ duyệt"
                      : "Chưa đăng ký"}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono font-bold ${
                    (teacherDetail.summary?.attendancePendingSessions || 0) > 0
                      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300"
                      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  Thiếu vào/ra: {teacherDetail.summary?.attendancePendingSessions || 0} buổi
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Đi muộn: {teacherDetail.summary?.lateSessionsCount || 0}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Về sớm: {teacherDetail.summary?.earlyLeaveSessionsCount || 0}
                </span>
              </div>
            )}

            {/* Modal Tabs Navigation */}
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/30 px-4 pt-2.5 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setDetailTab("classes")}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-bold transition ${
                  detailTab === "classes"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FiLayers className="h-3.5 w-3.5" />
                <span>Lớp & buổi học ({teacherDetail?.classes?.length || 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab("settlement")}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-bold transition ${
                  detailTab === "settlement"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FiSliders className="h-3.5 w-3.5" />
                <span>Quyết toán & điều chỉnh</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab("payslip")}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-xs font-bold transition ${
                  detailTab === "payslip"
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FiFileText className="h-3.5 w-3.5" />
                <span>Phiếu lương</span>
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {loadingDetail ? (
                <div className="py-16">
                  <Loading
                    loading={true}
                    text="Đang tải dữ liệu chi tiết giảng viên..."
                    fullScreen={false}
                  />
                </div>
              ) : !teacherDetail ? (
                <p className="py-12 text-center text-xs text-slate-400">Không tìm thấy dữ liệu.</p>
              ) : detailTab === "classes" ? (
                /* TAB 1: CHI TIẾT TỪNG LỚP & BUỔI HỌC */
                <div className="space-y-4">
                  {teacherDetail.classes.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setSelectedClassFilter("all")}
                        className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          selectedClassFilter === "all"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                      >
                        Tất cả ({teacherDetail.classes.length})
                      </button>
                      {teacherDetail.classes.map((cls) => (
                        <button
                          key={cls.classId}
                          type="button"
                          onClick={() => setSelectedClassFilter(cls.classId)}
                          className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                            String(selectedClassFilter) === String(cls.classId)
                              ? "bg-blue-600 text-white shadow-xs"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          }`}
                        >
                          {cls.code}: {cls.title}
                        </button>
                      ))}
                    </div>
                  )}

                  {displayedDetailClasses.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 dark:border-slate-700">
                      Giảng viên chưa được phân công lớp học nào hoặc chưa có buổi học.
                    </div>
                  ) : (
                    displayedDetailClasses.map((cls) => (
                      <div
                        key={cls.classId}
                        className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30"
                      >
                        {/* Class Card Header */}
                        <div className="flex flex-col justify-between gap-3 border-b border-slate-200/70 pb-3 sm:flex-row sm:items-center dark:border-slate-700/80">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-sky-300">
                                {cls.code}
                              </span>
                              <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">
                                {cls.title}
                              </h4>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {cls.courseTitle} ·{" "}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {cls.teachingRole === "lead" ? "Giảng viên chính" : "Trợ giảng"}
                              </strong>{" "}
                              · Đã dạy:{" "}
                              <strong>
                                {cls.completedSessions}/{cls.totalSessions} buổi
                              </strong>{" "}
                              ({cls.completedHours}h)
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-4 sm:items-end sm:justify-start">
                            <div className="text-left sm:text-right">
                              <div className="flex flex-wrap items-center justify-start gap-1.5 sm:justify-end">
                                <span className="text-[10px] font-bold uppercase text-slate-400">
                                  Đơn giá lớp:
                                </span>
                                <span className="font-mono text-xs font-black text-[#102f63] dark:text-sky-300">
                                  {formatVnd(cls.effectiveHourlyRate)}/h
                                </span>
                                {cls.hasCustomRate && (
                                  <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300">
                                    Riêng
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenClassRateModal(cls)}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline dark:text-sky-400"
                              >
                                <FiEdit2 className="h-3 w-3" /> Sửa đơn giá lớp
                              </button>
                            </div>

                            <div className="border-l border-slate-200 pl-3 text-right dark:border-slate-700">
                              <p className="text-[10px] font-bold uppercase text-slate-400">
                                Lương tạm tính
                              </p>
                              <p className="font-mono text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                                {formatVnd(cls.accruedSalary)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Sessions Table */}
                        {cls.sessions.length === 0 ? (
                          <p className="py-2 text-xs italic text-slate-400">
                            Lớp này chưa có buổi học nào.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
                            <table className="min-w-full divide-y divide-slate-100 text-left text-xs dark:divide-slate-800">
                              <thead className="bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                                <tr>
                                  <th className="px-3 py-2">#</th>
                                  <th className="px-3 py-2">Buổi học</th>
                                  <th className="px-3 py-2">Thời gian</th>
                                  <th className="px-3 py-2 text-center">Thời lượng</th>
                                  <th className="px-3 py-2">Chấm công vào/ra</th>
                                  <th className="px-3 py-2 text-center">Trạng thái</th>
                                  <th className="px-3 py-2 text-right">Thù lao</th>
                                  <th className="px-3 py-2 text-right">Sửa</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {cls.sessions.map((sess) => {
                                  const sDate = sess.startTime ? new Date(sess.startTime) : null;
                                  const eDate = sess.endTime ? new Date(sess.endTime) : null;
                                  const dateStr =
                                    sDate && !Number.isNaN(sDate.getTime())
                                      ? sDate.toLocaleDateString("vi-VN", {
                                          weekday: "short",
                                          day: "2-digit",
                                          month: "2-digit",
                                          year: "numeric",
                                        })
                                      : "Chưa định";
                                  const timeStr =
                                    sDate && !Number.isNaN(sDate.getTime())
                                      ? sDate.toLocaleTimeString("vi-VN", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "";
                                  const endTimeStr =
                                    eDate && !Number.isNaN(eDate.getTime())
                                      ? eDate.toLocaleTimeString("vi-VN", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "";
                                  const fa = sess.faceAttendance || {};
                                  const fmtHm = (val) =>
                                    val && !Number.isNaN(new Date(val).getTime())
                                      ? new Date(val).toLocaleTimeString("vi-VN", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "--:--";
                                  const actualDurationStr = (() => {
                                    if (!fa.checkInAt || !fa.checkOutAt) return null;
                                    const mins = Math.max(
                                      0,
                                      Math.round(
                                        (new Date(fa.checkOutAt) - new Date(fa.checkInAt)) / 60000,
                                      ),
                                    );
                                    const h = Math.floor(mins / 60);
                                    const m = mins % 60;
                                    return h > 0 ? `${h}h${m > 0 ? ` ${m}p` : ""}` : `${m}p`;
                                  })();
                                  const isBusyOverride = overridingSessionId === sess.id;

                                  return (
                                    <tr
                                      key={sess.id}
                                      className={
                                        sess.isAttendancePending
                                          ? "bg-amber-50/40 dark:bg-amber-950/15"
                                          : sess.isCompleted
                                            ? "bg-emerald-50/20 dark:bg-emerald-950/10"
                                            : ""
                                      }
                                    >
                                      <td className="px-3 py-2 font-mono font-bold text-slate-400">
                                        {sess.sessionNumber}
                                      </td>
                                      <td className="max-w-[200px] truncate px-3 py-2 font-bold text-slate-900 dark:text-white">
                                        {sess.title}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                        {dateStr}{" "}
                                        {timeStr &&
                                          `(${timeStr}${endTimeStr ? `–${endTimeStr}` : ""})`}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-center font-mono font-bold text-slate-700 dark:text-slate-200">
                                        <span className="inline-flex items-center gap-1">
                                          {sess.durationHours}h
                                          {sess.isCustomDuration && (
                                            <span
                                              className="text-[9px] text-blue-600 dark:text-blue-400"
                                              title="Thời lượng tùy chỉnh"
                                            >
                                              (sửa)
                                            </span>
                                          )}
                                        </span>
                                        {actualDurationStr && (
                                          <span className="block text-[9px] font-normal text-slate-400">
                                            Thực tế: {actualDurationStr}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-[11px]">
                                        {!fa.required && !fa.hasRecord ? (
                                          <span className="text-slate-400">Không bắt buộc</span>
                                        ) : (
                                          <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-1 font-mono">
                                              <span className="text-slate-600 dark:text-slate-300">
                                                Vào: <strong>{fmtHm(fa.checkInAt)}</strong>
                                              </span>
                                              {fa.lateMinutes > 0 && (
                                                <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                  Muộn {fa.lateMinutes}p
                                                </span>
                                              )}
                                              <span className="text-slate-300 dark:text-slate-600">
                                                |
                                              </span>
                                              <span className="text-slate-600 dark:text-slate-300">
                                                Ra: <strong>{fmtHm(fa.checkOutAt)}</strong>
                                              </span>
                                              {fa.earlyLeaveMinutes > 0 && (
                                                <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                  Sớm {fa.earlyLeaveMinutes}p
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              {fa.adminOverrideStatus === "approved" && (
                                                <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                  Đã duyệt
                                                </span>
                                              )}
                                              {fa.adminOverrideStatus === "rejected" && (
                                                <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                                  Từ chối
                                                </span>
                                              )}
                                              {sess.isAttendancePending && (
                                                <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                  Chờ xác nhận lương
                                                </span>
                                              )}
                                              {(fa.checkInPhotoUrl || fa.checkOutPhotoUrl) && (
                                                <button
                                                  type="button"
                                                  onClick={() => setFacePreviewSession(sess)}
                                                  className="text-[10px] font-bold text-blue-600 hover:underline dark:text-sky-400"
                                                >
                                                  Xem ảnh
                                                </button>
                                              )}
                                              {(fa.required || fa.hasRecord) && (
                                                <>
                                                  {fa.adminOverrideStatus !== "approved" &&
                                                    !fa.payrollEligible && (
                                                      <button
                                                        type="button"
                                                        disabled={isBusyOverride}
                                                        onClick={() =>
                                                          handleFaceAttendanceOverride(
                                                            sess,
                                                            "approved",
                                                          )
                                                        }
                                                        className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                                      >
                                                        Duyệt lương
                                                      </button>
                                                    )}
                                                  {fa.adminOverrideStatus !== "rejected" && (
                                                    <button
                                                      type="button"
                                                      disabled={isBusyOverride}
                                                      onClick={() =>
                                                        handleFaceAttendanceOverride(
                                                          sess,
                                                          "rejected",
                                                        )
                                                      }
                                                      className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300"
                                                    >
                                                      Từ chối
                                                    </button>
                                                  )}
                                                  {fa.adminOverrideStatus && (
                                                    <button
                                                      type="button"
                                                      disabled={isBusyOverride}
                                                      onClick={() =>
                                                        handleFaceAttendanceOverride(sess, "reset")
                                                      }
                                                      className="text-[9px] font-bold text-slate-500 hover:underline dark:text-slate-400"
                                                    >
                                                      Hoàn tác
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-center">
                                        {sess.isAttendancePending ? (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300">
                                            Thiếu vào/ra
                                          </span>
                                        ) : sess.isCompleted ? (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleSessionStatus(sess)}
                                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 transition hover:bg-rose-50 hover:text-rose-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300"
                                            title="Bấm để chuyển về chưa diễn ra"
                                          >
                                            <FiCheckCircle className="h-2.5 w-2.5" /> Đã dạy
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleToggleSessionStatus(sess)}
                                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-400"
                                            title="Bấm để đánh dấu đã dạy"
                                          >
                                            Chưa diễn ra
                                          </button>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-black">
                                        {sess.isCompleted ? (
                                          <span className="text-emerald-600 dark:text-emerald-400">
                                            +{formatVnd(sess.earnedAmount)}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] font-semibold text-slate-400">
                                            Dự kiến: {formatVnd(sess.projectedAmount)}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenSessionModal(sess)}
                                          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-sky-300"
                                          title="Chỉnh sửa giờ dạy / trạng thái buổi học"
                                        >
                                          <FiEdit2 className="h-3.5 w-3.5" />
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
                <form onSubmit={handleSaveSettlement} className="mx-auto max-w-2xl space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-1">
                    <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                      <FiSliders className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Điều chỉnh quyết toán & thanh toán
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ghi nhận thưởng, phụ cấp, khấu trừ và cập nhật trạng thái chi trả cho giảng viên.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Thưởng / Phụ cấp (VNĐ)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={bonusInput}
                        onChange={(e) => setBonusInput(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs font-bold text-emerald-600 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Khấu trừ / Phạt (VNĐ)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={deductionInput}
                        onChange={(e) => setDeductionInput(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs font-bold text-rose-600 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-rose-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Trạng thái thanh toán
                    </label>
                    <select
                      value={settlementStatusInput}
                      onChange={(e) => setSettlementStatusInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                    >
                      <option value="pending">Chưa thanh toán</option>
                      <option value="processing">Đang xử lý thanh toán</option>
                      <option value="paid">Đã thanh toán hoàn tất</option>
                      <option value="hold">Tạm giữ chi trả</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Ghi chú quyết toán & chuyển khoản
                    </label>
                    <textarea
                      rows={3}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Ví dụ: Đã chuyển khoản qua VCB ngày 20/10; Thưởng hỗ trợ học viên ôn thi..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs dark:border-emerald-800/80 dark:bg-emerald-950/40">
                    <div>
                      <p className="font-bold text-emerald-900 dark:text-emerald-300">
                        Thực nhận dự kiến sau lưu
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatVnd(teacherDetail.summary.accruedSalary)} + {formatVnd(bonusInput)} −{" "}
                        {formatVnd(deductionInput)}
                      </p>
                    </div>
                    <p className="font-mono text-lg font-black text-emerald-700 dark:text-emerald-300">
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

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={savingSettlement}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      <FiSave className="h-3.5 w-3.5" />
                      <span>{savingSettlement ? "Đang lưu..." : "Lưu quyết toán"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* TAB 3: PHIẾU LƯƠNG IN ẤN */
                <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white">
                        Học Viện Tin Học CSCA
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        PHIẾU THANH TOÁN THÙ LAO GIẢNG DẠY
                      </p>
                    </div>
                    <div className="text-left sm:text-right font-mono text-xs text-slate-400">
                      <p>Ngày xuất: {new Date().toLocaleDateString("vi-VN")}</p>
                      <p>Kỳ lương: Tổng hợp tích lũy</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-slate-400">Họ và tên giảng viên</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {teacherDetail.teacher.fullName || teacherDetail.teacher.username}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Email & tài khoản</p>
                      <p className="break-all font-mono">{teacherDetail.teacher.email}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 border-y border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
                      <thead className="bg-slate-50/90 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                        <tr>
                          <th className="px-2 py-2 text-left">Nội dung</th>
                          <th className="px-2 py-2 text-center">Số buổi / Giờ</th>
                          <th className="px-2 py-2 text-right">Đơn giá</th>
                          <th className="px-2 py-2 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800/60">
                        {teacherDetail.classes.map((cls) => (
                          <tr key={cls.classId}>
                            <td className="px-2 py-2 text-left font-sans font-medium">
                              {cls.code}: {cls.title}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-center">
                              {cls.completedSessions} buổi ({cls.completedHours}h)
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              {formatVnd(cls.effectiveHourlyRate)}/h
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {formatVnd(cls.accruedSalary)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-100 pt-2 font-mono text-xs dark:border-slate-800">
                    <div className="flex justify-between gap-4">
                      <span className="font-sans text-slate-500 dark:text-slate-400">
                        1. Tổng thù lao theo giờ:
                      </span>
                      <span className="font-bold">
                        {formatVnd(teacherDetail.summary.accruedSalary)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-blue-600 dark:text-sky-400">
                      <span className="font-sans">2. Thưởng & phụ cấp:</span>
                      <span>+{formatVnd(teacherDetail.summary.bonusAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400">
                      <span className="font-sans">3. Khấu trừ:</span>
                      <span>-{formatVnd(teacherDetail.summary.deductionAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-black text-emerald-600 dark:border-slate-700 dark:text-emerald-400">
                      <span className="font-sans">TỔNG THỰC LĨNH:</span>
                      <span>{formatVnd(teacherDetail.summary.netAccruedSalary)}</span>
                    </div>
                  </div>

                  {teacherDetail.summary.paymentNotes && (
                    <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">
                      <p className="font-bold text-slate-500 dark:text-slate-400">
                        Ghi chú quyết toán:
                      </p>
                      <p className="mt-0.5">{teacherDetail.summary.paymentNotes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-6 text-center text-xs">
                    <div>
                      <p className="font-bold">Người lập bảng</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">(Ký và ghi rõ họ tên)</p>
                      <div className="h-14" />
                    </div>
                    <div>
                      <p className="font-bold">Người nhận tiền</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">(Ký và ghi rõ họ tên)</p>
                      <div className="h-14" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
              <span className="hidden truncate font-mono text-xs text-slate-500 sm:inline dark:text-slate-400">
                {teacherDetail?.summary?.formulaNote}
              </span>
              <button
                type="button"
                onClick={() => setDetailModalTeacherId(null)}
                className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Chỉnh sửa đơn giá riêng theo từng lớp học */}
      {editingClassRate && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setEditingClassRate(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-base font-black text-[#102f63] dark:text-white">
                <FiDollarSign className="h-5 w-5 text-emerald-600" />
                Đơn giá riêng cho lớp
              </h3>
              <button
                type="button"
                onClick={() => setEditingClassRate(null)}
                className="rounded-xl bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => handleSaveClassRate(e, false)} className="space-y-4">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-sky-300">
                  {editingClassRate.code}
                </span>
                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                  {editingClassRate.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Đơn giá cơ bản của GV:{" "}
                  <strong>{formatVnd(teacherDetail?.teacher?.hourlyRate)}/h</strong>
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Mức lương áp dụng cho lớp này (VNĐ / giờ)
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 pr-20 font-mono text-sm font-black text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    VNĐ / giờ
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PRESET_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setClassRateInput(String(rate))}
                    className={`rounded-xl border px-2 py-1.5 font-mono text-xs font-bold transition ${
                      Number(classRateInput) === rate
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {formatVnd(rate)}/h
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleSaveClassRate(null, true)}
                  disabled={submittingClassRate}
                  className="text-xs font-bold text-rose-600 hover:underline dark:text-rose-400"
                >
                  Dùng lương mặc định
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingClassRate(null)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingClassRate}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submittingClassRate ? "Đang lưu..." : "Lưu đơn giá"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Chỉnh sửa thông số buổi học */}
      {editingSession && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setEditingSession(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-base font-black text-[#102f63] dark:text-white">
                <FiClock className="h-5 w-5 text-blue-600" />
                Chỉnh sửa giờ dạy & buổi học
              </h3>
              <button
                type="button"
                onClick={() => setEditingSession(null)}
                className="rounded-xl bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="space-y-4">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingSession.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Mã buổi: #{editingSession.id} · Buổi #{editingSession.sessionNumber}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Thời lượng giảng dạy thực tế (Giờ)
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 pr-14 font-mono text-sm font-black text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    giờ
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[1.0, 1.5, 2.0, 2.5, 3.0].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setSessionHoursInput(String(h))}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition ${
                        Number(sessionHoursInput) === h
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Trạng thái buổi học
                </label>
                <select
                  value={sessionStatusInput}
                  onChange={(e) => setSessionStatusInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                >
                  <option value="ended">Đã dạy / Kết thúc (tính thù lao)</option>
                  <option value="scheduled">Chưa diễn ra (dự kiến, chưa tính lương)</option>
                  <option value="live">Đang diễn ra</option>
                  <option value="cancelled">Đã hủy (không tính thù lao)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingSession}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submittingSession ? "Đang lưu..." : "Cập nhật buổi học"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Face Attendance Snapshot Lightbox Modal */}
      {facePreviewSession && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setFacePreviewSession(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-black text-[#102f63] dark:text-white">
                  Ảnh chấm công: {facePreviewSession.title}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ảnh đối chiếu khuôn mặt khi vào lớp và ra lớp
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFacePreviewSession(null)}
                className="shrink-0 rounded-xl bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-white">Vào ca</p>
                {facePreviewSession.faceAttendance?.checkInPhotoUrl ? (
                  <img
                    src={facePreviewSession.faceAttendance.checkInPhotoUrl}
                    alt="Ảnh chấm công vào"
                    className="aspect-square w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-800"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    Chưa có ảnh vào ca
                  </div>
                )}
                <div className="space-y-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  <p>
                    Giờ vào:{" "}
                    {facePreviewSession.faceAttendance?.checkInAt
                      ? new Date(facePreviewSession.faceAttendance.checkInAt).toLocaleString(
                          "vi-VN",
                        )
                      : "—"}
                  </p>
                  {facePreviewSession.faceAttendance?.checkInLivenessScore != null && (
                    <p>
                      Xác thực trực tiếp:{" "}
                      {facePreviewSession.faceAttendance.checkInLivenessScore}%
                    </p>
                  )}
                  {facePreviewSession.faceAttendance?.checkInFaceSimilarity != null && (
                    <p>
                      Khớp khuôn mặt: {facePreviewSession.faceAttendance.checkInFaceSimilarity}%
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200/80 p-3 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-800 dark:text-white">Ra ca</p>
                {facePreviewSession.faceAttendance?.checkOutPhotoUrl ? (
                  <img
                    src={facePreviewSession.faceAttendance.checkOutPhotoUrl}
                    alt="Ảnh chấm công ra"
                    className="aspect-square w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-800"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    Chưa có ảnh ra ca
                  </div>
                )}
                <div className="space-y-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  <p>
                    Giờ ra:{" "}
                    {facePreviewSession.faceAttendance?.checkOutAt
                      ? new Date(facePreviewSession.faceAttendance.checkOutAt).toLocaleString(
                          "vi-VN",
                        )
                      : "—"}
                  </p>
                  {facePreviewSession.faceAttendance?.checkOutLivenessScore != null && (
                    <p>
                      Xác thực trực tiếp:{" "}
                      {facePreviewSession.faceAttendance.checkOutLivenessScore}%
                    </p>
                  )}
                  {facePreviewSession.faceAttendance?.checkOutFaceSimilarity != null && (
                    <p>
                      Khớp khuôn mặt: {facePreviewSession.faceAttendance.checkOutFaceSimilarity}%
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
