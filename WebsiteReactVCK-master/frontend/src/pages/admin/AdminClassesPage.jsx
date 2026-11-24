import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiBookOpen,
  FiSearch,
  FiLink,
  FiCheckCircle,
  FiClock,
  FiExternalLink,
  FiDownload,
  FiEye,
  FiEdit3,
  FiUploadCloud,
  FiX,
  FiRefreshCw,
  FiShuffle,
  FiCheck,
  FiTrash2,
  FiChevronDown,
  FiChevronUp,
  FiAlertCircle,
} from "react-icons/fi";
import {
  fetchAdminClasses,
  updateAdminClassMapping,
  reviewAdminClass,
  fetchPendingMembershipApprovals,
  reviewAdminMembership,
  updateAdminClassFileDownloadPolicy,
  updateAdminClassPresentation,
  updateAdminClassTeacher,
  fetchAdminUsers,
  uploadImageToCloudinary,
} from "../../features/api/lmsClient";
import {
  CSCA_WALLPAPERS,
  getClassCoverImage,
  getRandomWallpaper,
} from "../../utils/classWallpapers";
import Loading from "../../components/Loading.jsx";

export default function AdminClassesPage() {
  const [classes, setClasses] = useState([]);
  const [pendingMemberships, setPendingMemberships] = useState([]);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [reviewing, setReviewing] = useState("");
  const [savingDownloadPolicy, setSavingDownloadPolicy] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [mappingModalClass, setMappingModalClass] = useState(null);
  const [molyClassIdInput, setMolyClassIdInput] = useState("");
  const [molyCourseIdInput, setMolyCourseIdInput] = useState("");
  const [presentationModalClass, setPresentationModalClass] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teacherIdInput, setTeacherIdInput] = useState("");
  const [coverImageUrlInput, setCoverImageUrlInput] = useState("");
  const [savingPresentation, setSavingPresentation] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef(null);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [res, memberships] = await Promise.all([
        fetchAdminClasses(),
        fetchPendingMembershipApprovals(),
      ]);
      if (!res?.success || !Array.isArray(res.data)) {
        throw new Error(res?.message || "Không thể tải danh sách lớp học.");
      }
      if (!memberships?.success || !Array.isArray(memberships.data)) {
        throw new Error(memberships?.message || "Không thể tải ghi danh chờ duyệt.");
      }
      setClasses(res.data);
      setPendingMemberships(memberships.data);
    } catch (err) {
      console.error("Error loading classes:", err);
      setClasses([]);
      setPendingMemberships([]);
      setErrorMessage(err?.message || "Không thể tải danh sách lớp học.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    let cancelled = false;
    setTeachersLoading(true);
    fetchAdminUsers({ role: "creator", status: "active", limit: 100 })
      .then((response) => {
        if (!cancelled) setTeachers(Array.isArray(response?.data) ? response.data : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setTeachers([]);
          toast.error(error?.message || "Không thể tải danh sách giảng viên.");
        }
      })
      .finally(() => {
        if (!cancelled) setTeachersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openMappingModal = (cls) => {
    setMappingModalClass(cls);
    setMolyClassIdInput(
      cls.managementClassId.startsWith("MOLY_CLS_Pending") ? "" : cls.managementClassId,
    );
    setMolyCourseIdInput(
      cls.managementCourseId.startsWith("MOLY_CRS_Pending") ? "" : cls.managementCourseId,
    );
  };

  const openPresentationModal = (cls) => {
    setPresentationModalClass(cls);
    setTeacherIdInput(cls.teacherId || "");
    setCoverImageUrlInput(cls.coverImageUrl || "");
  };

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn một tệp ảnh.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ảnh lớp không được vượt quá 10MB.");
      return;
    }
    setUploadingCover(true);
    try {
      const uploaded = await uploadImageToCloudinary(file, { folder: "csca/classes" });
      setCoverImageUrlInput(uploaded.publicUrl);
      toast.success("Đã tải ảnh nền lớp.");
    } catch (error) {
      toast.error(error?.message || "Không thể tải ảnh lớp.");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleSavePresentation = async () => {
    if (!presentationModalClass) return;
    setSavingPresentation(true);
    try {
      const selectedTeacher = teachers.find(
        (teacher) => String(teacher.id) === String(teacherIdInput),
      );
      const teacherName = selectedTeacher
        ? selectedTeacher.fullName || selectedTeacher.username || selectedTeacher.email
        : "";
      await Promise.all([
        updateAdminClassTeacher(presentationModalClass.id, teacherIdInput || null),
        updateAdminClassPresentation(presentationModalClass.id, {
          teacherName,
          coverImageUrl: coverImageUrlInput.trim(),
        }),
      ]);
      await loadClasses();
      setPresentationModalClass(null);
      toast.success("Đã cập nhật giảng viên phụ trách và ảnh lớp.");
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật thẻ lớp.");
    } finally {
      setSavingPresentation(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!molyClassIdInput.trim() || !molyCourseIdInput.trim()) {
      toast.error("Vui lòng nhập đầy đủ mã lớp và mã khóa học đồng bộ.");
      return;
    }

    try {
      await updateAdminClassMapping(mappingModalClass.id, {
        managementClassId: molyClassIdInput.trim(),
        managementCourseId: molyCourseIdInput.trim(),
      });
      await loadClasses();
      toast.success(`Đã lưu mã đồng bộ cho lớp [${mappingModalClass.code}].`);
      setMappingModalClass(null);
    } catch (error) {
      toast.error(error?.message || "Lưu liên kết mã lớp thất bại.");
    }
  };

  const review = async (type, id, decision) => {
    setReviewing(`${type}:${id}`);
    try {
      if (type === "class") await reviewAdminClass(id, decision);
      else await reviewAdminMembership(id, decision);
      toast.success(decision === "approved" ? "Đã duyệt" : "Đã từ chối");
      await loadClasses();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu quyết định duyệt");
    } finally {
      setReviewing("");
    }
  };

  const toggleDownloadPolicy = async (cls) => {
    setSavingDownloadPolicy(cls.id);
    try {
      const allowFileDownload = !cls.allowFileDownload;
      await updateAdminClassFileDownloadPolicy(cls.id, allowFileDownload);
      setClasses((current) =>
        current.map((item) =>
          item.id === cls.id ? { ...item, allowFileDownload } : item,
        ),
      );
      toast.success(allowFileDownload ? "Đã cho phép tải tài liệu" : "Đã bật chế độ chỉ xem");
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật quyền tải tài liệu");
    } finally {
      setSavingDownloadPolicy("");
    }
  };

  const pendingClasses = classes.filter((item) => item.approvalStatus === "pending");
  const totalPendingCount = pendingClasses.length + pendingMemberships.length;
  const mappedCount = classes.filter((c) => c.mappingStatus === "MAPPED").length;
  const pendingMappingCount = classes.filter((c) => c.mappingStatus === "PENDING").length;

  const filteredClasses = classes.filter((cls) => {
    const matchesStatus = statusFilter === "ALL" || cls.mappingStatus === statusFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      cls.code.toLowerCase().includes(term) ||
      cls.name.toLowerCase().includes(term) ||
      cls.teacherName.toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-w-0 space-y-5 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Quản lý lớp học
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Theo dõi lớp học, phân công giảng viên, quyền tải tài liệu và liên kết mã đồng bộ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadClasses}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Collapsible Pending Approvals Alert (hidden when 0) */}
      {totalPendingCount > 0 && (
        <section className="rounded-2xl sm:rounded-3xl border border-amber-200/90 bg-amber-50/90 shadow-xs dark:border-amber-800/70 dark:bg-amber-950/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setPendingExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-amber-100/50 dark:hover:bg-amber-950/50"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <FiAlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-100">
                    Ghi danh & lớp chờ duyệt
                  </h2>
                  <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {totalPendingCount} yêu cầu
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-200/80 truncate">
                  Lớp và học viên chỉ được mở quyền học sau khi quản trị viên xác nhận.
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-lg p-1 text-amber-700 dark:text-amber-300">
              {pendingExpanded ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
            </span>
          </button>

          {pendingExpanded && (
            <div className="space-y-2 border-t border-amber-200/80 px-4 py-3 dark:border-amber-800/60">
              {pendingClasses.map((item) => (
                <div
                  key={`class-${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-white px-3 py-2.5 dark:border-amber-800/60 dark:bg-slate-900"
                >
                  <div className="min-w-0 text-xs">
                    <span className="mr-2 inline-flex rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      Mở lớp
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.managementClassId}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={Boolean(reviewing)}
                      onClick={() => review("class", item.id, "approved")}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Duyệt lớp
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(reviewing)}
                      onClick={() => review("class", item.id, "rejected")}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
              {pendingMemberships.map((item) => (
                <div
                  key={`membership-${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-white px-3 py-2.5 dark:border-amber-800/60 dark:bg-slate-900"
                >
                  <div className="min-w-0 text-xs">
                    <span className="mr-2 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Ghi danh
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {item.student_name}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {item.class_title} · {item.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={Boolean(reviewing)}
                      onClick={() => review("membership", item.id, "approved")}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Duyệt ghi danh
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(reviewing)}
                      onClick={() => review("membership", item.id, "rejected")}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng số lớp
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FiBookOpen className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
            {classes.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Lớp đang quản lý
          </p>
        </div>

        <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Đã liên kết mã
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FiCheckCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            {mappedCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Đồng bộ dữ liệu tự động
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chờ liên kết mã
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <FiClock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
            {pendingMappingCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Chưa gán mã hệ thống
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: "Tất cả" },
            { id: "MAPPED", label: "Đã liên kết" },
            { id: "PENDING", label: "Chờ liên kết" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === item.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm mã lớp, tên lớp, giảng viên..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <span>{errorMessage}</span>
          <button type="button" onClick={loadClasses} className="shrink-0 font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* Classes Table */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5 pl-4">Lớp học</th>
                <th className="px-3 py-2.5">Giảng viên</th>
                <th className="px-3 py-2.5">Mã đồng bộ</th>
                <th className="px-3 py-2.5 text-center">Sĩ số</th>
                <th className="px-3 py-2.5 text-center">Trạng thái</th>
                <th className="px-3 py-2.5 text-center">Tài liệu</th>
                <th className="px-3 py-2.5 pr-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <Loading loading={true} text="Đang tải danh sách lớp học..." fullScreen={false} />
                  </td>
                </tr>
              ) : filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    {errorMessage
                      ? "Danh sách lớp học chưa tải được."
                      : "Không tìm thấy lớp học nào phù hợp."}
                  </td>
                </tr>
              ) : (
                filteredClasses.map((cls) => (
                  <tr
                    key={cls.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2.5 pl-4">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <img
                          src={getClassCoverImage(cls)}
                          alt={cls.name}
                          className="h-10 w-16 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <span className="block font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                            {cls.code}
                          </span>
                          <span className="mt-0.5 block truncate font-bold text-slate-900 dark:text-white max-w-[220px]">
                            {cls.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {cls.teacherName || (
                        <span className="text-slate-400 italic">Chưa phân công</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="space-y-0.5">
                        <p className="truncate max-w-[160px]" title={`Mã lớp: ${cls.managementClassId}`}>
                          Lớp: <span className="text-slate-700 dark:text-slate-300">{cls.managementClassId}</span>
                        </p>
                        <p className="truncate max-w-[160px]" title={`Mã khóa: ${cls.managementCourseId}`}>
                          Khóa: <span className="text-slate-700 dark:text-slate-300">{cls.managementCourseId}</span>
                        </p>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {cls.studentCount}
                      </span>
                      <span className="block text-[10px] font-sans text-slate-400">học viên</span>
                    </td>

                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {cls.mappingStatus === "MAPPED" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Đã liên kết
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Chờ liên kết
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        disabled={savingDownloadPolicy === cls.id}
                        onClick={() => toggleDownloadPolicy(cls)}
                        className={`inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                          cls.allowFileDownload
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                        title="Bấm để đổi quyền tải tài liệu của lớp"
                      >
                        {cls.allowFileDownload ? (
                          <FiDownload className="h-3 w-3" />
                        ) : (
                          <FiEye className="h-3 w-3" />
                        )}
                        {cls.allowFileDownload ? "Cho tải" : "Chỉ xem"}
                      </button>
                    </td>

                    <td className="px-3 py-2.5 pr-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPresentationModal(cls)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <FiEdit3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Thẻ lớp</span>
                        </button>
                        <Link
                          to={`/admin/classes/${cls.id}`}
                          className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/80"
                        >
                          <FiExternalLink className="h-3.5 w-3.5" />
                          <span>Xem lớp</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => openMappingModal(cls)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <FiLink className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Liên kết mã</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Thẻ lớp & Phân công giảng viên */}
      {presentationModalClass && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setPresentationModalClass(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black text-[#102f63] dark:text-white">
                  Thẻ lớp — {presentationModalClass.name}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Cập nhật giảng viên phụ trách và ảnh nền hiển thị cho học viên.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPresentationModalClass(null)}
                className="shrink-0 rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Giảng viên phụ trách lớp
                </label>
                <select
                  value={teacherIdInput}
                  onChange={(event) => setTeacherIdInput(event.target.value)}
                  disabled={teachersLoading || savingPresentation}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                >
                  <option value="">Chưa phân công</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.fullName || teacher.username || teacher.email} · {teacher.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Giảng viên được chọn sẽ có quyền vào lớp, đăng bài và quản lý buổi học.
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Ảnh nền của lớp
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const randomWp = getRandomWallpaper();
                        setCoverImageUrlInput(randomWp.cloudinaryUrl);
                        toast.success(`Đã chọn ngẫu nhiên: ${randomWp.title}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                    >
                      <FiShuffle className="h-3 w-3" /> Đổi ngẫu nhiên
                    </button>
                    {coverImageUrlInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setCoverImageUrlInput("");
                          toast.success("Đã khôi phục ảnh mặc định.");
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <FiTrash2 className="h-3 w-3" /> Gỡ ảnh riêng
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    value={coverImageUrlInput}
                    onChange={(event) => setCoverImageUrlInput(event.target.value)}
                    placeholder="Dán link ảnh hoặc tải ảnh lên"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                  />
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    <FiUploadCloud className="h-4 w-4" />
                    {uploadingCover ? "Đang tải..." : "Tải ảnh"}
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-600 dark:text-slate-400">
                    Xem trước thẻ lớp
                  </span>
                  {coverImageUrlInput ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <FiCheck className="h-3 w-3" /> Ảnh riêng của lớp
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                      Ảnh mặc định tự động
                    </span>
                  )}
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm dark:border-slate-800">
                  <img
                    src={coverImageUrlInput || getClassCoverImage(presentationModalClass)}
                    alt="Xem trước ảnh lớp"
                    className="h-44 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-black/20 to-transparent" />
                  <div className="absolute inset-x-4 bottom-3">
                    <span className="rounded bg-blue-500/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                      {presentationModalClass.code}
                    </span>
                    <h4 className="mt-1 text-base font-black text-white drop-shadow">
                      {presentationModalClass.name}
                    </h4>
                    <p className="text-xs text-sky-200">
                      GV:{" "}
                      {teachers.find((teacher) => String(teacher.id) === String(teacherIdInput))
                        ?.fullName ||
                        teachers.find((teacher) => String(teacher.id) === String(teacherIdInput))
                          ?.username ||
                        "Chưa phân công"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Wallpaper Gallery */}
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Chọn nhanh từ bộ sưu tập ảnh nền CSCA
                </label>
                <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-800/50">
                  {CSCA_WALLPAPERS.map((wp) => {
                    const isSelected =
                      coverImageUrlInput === wp.cloudinaryUrl || coverImageUrlInput === wp.url;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => {
                          setCoverImageUrlInput(wp.cloudinaryUrl);
                          toast.success(`Đã chọn ảnh: ${wp.title}`);
                        }}
                        className={`group relative overflow-hidden rounded-xl border text-left transition duration-200 ${
                          isSelected
                            ? "border-blue-500 ring-2 ring-blue-500 shadow-sm"
                            : "border-slate-200 hover:border-blue-300 dark:border-slate-700"
                        }`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                          <img
                            src={wp.cloudinaryUrl || wp.url}
                            alt={wp.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-blue-600/40">
                              <span className="rounded-full bg-white p-1 text-blue-600 shadow">
                                <FiCheck className="h-3 w-3 stroke-[3]" />
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="bg-white p-1 dark:bg-slate-900">
                          <p className="truncate text-[10px] font-bold text-slate-800 dark:text-slate-200">
                            {wp.title}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-slate-200/80 bg-white/95 px-5 py-3.5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
              <button
                type="button"
                onClick={() => setPresentationModalClass(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSavePresentation}
                disabled={savingPresentation || uploadingCover}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                {savingPresentation ? "Đang lưu..." : "Lưu thẻ lớp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Liên kết mã lớp đồng bộ */}
      {mappingModalClass && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs"
          onClick={() => setMappingModalClass(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-3.5 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black text-[#102f63] dark:text-white">
                  Liên kết mã đồng bộ — {mappingModalClass.code}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Nhập mã lớp và mã khóa học từ hệ thống quản lý để đồng bộ sĩ số và quyền học.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMappingModalClass(null)}
                className="shrink-0 rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                  Mã lớp trên hệ thống quản lý
                </label>
                <input
                  type="text"
                  value={molyClassIdInput}
                  onChange={(e) => setMolyClassIdInput(e.target.value)}
                  placeholder="Ví dụ: MOLY_CLS_8820"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 font-mono text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                  Mã khóa học trên hệ thống quản lý
                </label>
                <input
                  type="text"
                  value={molyCourseIdInput}
                  onChange={(e) => setMolyCourseIdInput(e.target.value)}
                  placeholder="Ví dụ: MOLY_CRS_9921"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 font-mono text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMappingModalClass(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveMapping}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <FiCheckCircle className="h-3.5 w-3.5" />
                <span>Lưu liên kết</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
