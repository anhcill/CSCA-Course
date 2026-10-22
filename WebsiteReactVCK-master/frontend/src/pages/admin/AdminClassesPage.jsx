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
  FiImage,
  FiUploadCloud,
  FiX,
  FiRefreshCw,
  FiShuffle,
  FiCheck,
  FiTrash2,
} from "react-icons/fi";
import {
  fetchAdminClasses, updateAdminClassMapping, reviewAdminClass,
  fetchPendingMembershipApprovals, reviewAdminMembership,
  updateAdminClassFileDownloadPolicy,
  updateAdminClassPresentation,
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
  const [teacherNameInput, setTeacherNameInput] = useState("");
  const [coverImageUrlInput, setCoverImageUrlInput] = useState("");
  const [savingPresentation, setSavingPresentation] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef(null);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [res, memberships] = await Promise.all([fetchAdminClasses(), fetchPendingMembershipApprovals()]);
      if (!res?.success || !Array.isArray(res.data)) throw new Error(res?.message || "Không thể tải danh sách lớp học.");
      if (!memberships?.success || !Array.isArray(memberships.data)) throw new Error(memberships?.message || "Không thể tải ghi danh chờ duyệt.");
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

  const openMappingModal = (cls) => {
    setMappingModalClass(cls);
    setMolyClassIdInput(cls.managementClassId.startsWith("MOLY_CLS_Pending") ? "" : cls.managementClassId);
    setMolyCourseIdInput(cls.managementCourseId.startsWith("MOLY_CRS_Pending") ? "" : cls.managementCourseId);
  };

  const openPresentationModal = (cls) => {
    setPresentationModalClass(cls);
    setTeacherNameInput(cls.teacherName === "Chưa phân công" ? "" : cls.teacherName || "");
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
      await updateAdminClassPresentation(presentationModalClass.id, {
        teacherName: teacherNameInput.trim(),
        coverImageUrl: coverImageUrlInput.trim(),
      });
      await loadClasses();
      setPresentationModalClass(null);
      toast.success("Đã cập nhật tên giáo viên và ảnh lớp.");
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật thẻ lớp.");
    } finally {
      setSavingPresentation(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!molyClassIdInput.trim() || !molyCourseIdInput.trim()) {
      toast.error("Vui lòng nhập đầy đủ Moly Class ID và Moly Course ID!");
      return;
    }

    try {
      await updateAdminClassMapping(mappingModalClass.id, {
        managementClassId: molyClassIdInput.trim(),
        managementCourseId: molyCourseIdInput.trim(),
      });
      await loadClasses();
      toast.success(`Đã lưu ánh xạ lớp [${mappingModalClass.code}] vào MolyInternal! 🎉`);
      setMappingModalClass(null);
    } catch (error) {
      toast.error(error?.message || "Lưu mapping thất bại!");
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
      setClasses((current) => current.map((item) => (
        item.id === cls.id ? { ...item, allowFileDownload } : item
      )));
      toast.success(allowFileDownload ? "Đã cho phép tải tài liệu" : "Đã bật chế độ chỉ xem");
    } catch (error) {
      toast.error(error?.message || "Không thể cập nhật quyền tải tài liệu");
    } finally {
      setSavingDownloadPolicy("");
    }
  };

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
    <div className="space-y-8 font-sans pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 mb-2">
            <FiLink className="w-3.5 h-3.5" />
            <span>Moly Course & Class Mapping Bridge</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Quản Lý Lớp Học & Ánh Xạ Moly
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Liên kết lớp học LMS với Master Data từ MolyInternal để quản trị sĩ số và quyền học.
          </p>
        </div>
        <button
          onClick={loadClasses}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition border border-gray-700"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Làm mới danh sách</span>
        </button>
      </div>

      {(classes.some((item) => item.approvalStatus === "pending") || pendingMemberships.length > 0) && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="text-base font-bold text-amber-950 dark:text-amber-100">Chờ duyệt từ hệ thống quản lý</h2>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Lịch học vẫn đồng bộ; lớp và ghi danh chỉ mở cho học viên sau khi quản trị viên duyệt.</p>
          <div className="mt-4 space-y-2">
            {classes.filter((item) => item.approvalStatus === "pending").map((item) => (
              <div key={`class-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-gray-900">
                <div><span className="font-bold">Lớp: {item.name}</span><span className="ml-2 text-xs text-gray-500">{item.managementClassId}</span></div>
                <div className="flex gap-2">
                  <button type="button" disabled={Boolean(reviewing)} onClick={() => review("class", item.id, "approved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Duyệt lớp</button>
                  <button type="button" disabled={Boolean(reviewing)} onClick={() => review("class", item.id, "rejected")} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">Từ chối</button>
                </div>
              </div>
            ))}
            {pendingMemberships.map((item) => (
              <div key={`membership-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-gray-900">
                <div><span className="font-bold">Học viên: {item.student_name}</span><span className="ml-2 text-xs text-gray-500">{item.class_title} · {item.email}</span></div>
                <div className="flex gap-2">
                  <button type="button" disabled={Boolean(reviewing)} onClick={() => review("membership", item.id, "approved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Duyệt ghi danh</button>
                  <button type="button" disabled={Boolean(reviewing)} onClick={() => review("membership", item.id, "rejected")} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">Từ chối</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KPI Stats Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tổng Số Lớp Học
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <FiBookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 dark:text-white mt-3 font-mono">
            {classes.length}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Đang vận hành trong học kỳ</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Đã Ánh Xạ Moly (Mapped)
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <FiCheckCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-500 mt-3 font-mono">
            {classes.filter((c) => c.mappingStatus === "MAPPED").length}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Đồng bộ hai chiều tự động</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Chờ Ánh Xạ (Pending Bridge)
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <FiClock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-500 mt-3 font-mono">
            {classes.filter((c) => c.mappingStatus === "PENDING").length}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Chưa gán Management IDs</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {["ALL", "MAPPED", "PENDING"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === st
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {st === "ALL" ? "Tất cả trạng thái" : st}
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
            placeholder="Tìm theo mã lớp, tên lớp, giáo viên..."
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Classes Table */}
      {errorMessage && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <span>{errorMessage}</span>
          <button type="button" onClick={loadClasses} className="shrink-0 font-bold underline">Thử lại</button>
        </div>
      )}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="py-3.5 px-5">Mã & Tên Lớp Học</th>
                <th className="py-3.5 px-4">Giáo Viên Phụ Trách</th>
                <th className="py-3.5 px-4">Moly Class ID</th>
                <th className="py-3.5 px-4">Moly Course ID</th>
                <th className="py-3.5 px-4 text-center">Sĩ Số</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái Mapping</th>
                <th className="py-3.5 px-4 text-center">Tài Liệu</th>
                <th className="py-3.5 px-5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12">
                    <Loading loading={true} text="Đang tải danh sách lớp học & Moly..." fullScreen={false} />
                  </td>
                </tr>
              ) : filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {errorMessage ? "Danh sách lớp học chưa tải được." : "Không tìm thấy lớp học nào phù hợp."}
                  </td>
                </tr>
              ) : (
                filteredClasses.map((cls) => (
                  <tr key={cls.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <img
                          src={getClassCoverImage(cls)}
                          alt={cls.name}
                          className="h-10 w-16 rounded-xl object-cover border border-gray-200 dark:border-gray-700 shrink-0 shadow-xs"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px] block">
                            {cls.code}
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white mt-0.5 block truncate">
                            {cls.name}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-medium text-gray-900 dark:text-white">
                      {cls.teacherName}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {cls.managementClassId}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {cls.managementCourseId}
                    </td>
                    <td className="py-4 px-4 text-center font-mono font-bold">
                      <span className="text-gray-900 dark:text-white">{cls.studentCount}</span>
                      <span className="text-[10px] text-gray-400 block font-normal">học viên</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      {cls.mappingStatus === "MAPPED" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          MAPPED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          PENDING
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        type="button"
                        disabled={savingDownloadPolicy === cls.id}
                        onClick={() => toggleDownloadPolicy(cls)}
                        className={`inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                          cls.allowFileDownload
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                        title="Bấm để đổi chính sách tải tài liệu của lớp"
                      >
                        {cls.allowFileDownload ? <FiDownload className="h-3.5 w-3.5" /> : <FiEye className="h-3.5 w-3.5" />}
                        {cls.allowFileDownload ? "Cho tải" : "Chỉ xem"}
                      </button>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        type="button"
                        onClick={() => openPresentationModal(cls)}
                        className="mr-2 inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
                      >
                        <FiEdit3 className="h-3.5 w-3.5" /> Thẻ lớp
                      </button>
                      <Link
                        to={`/admin/classes/${cls.id}`}
                        className="mr-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
                      >
                        <FiExternalLink className="h-3.5 w-3.5" /> Xem lớp
                      </Link>
                      <button
                        onClick={() => openMappingModal(cls)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-xs transition shadow-sm"
                      >
                        <FiLink className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Cấu hình Mapping</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {presentationModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Thẻ lớp — {presentationModalClass.name}</h3>
                <p className="mt-0.5 text-xs text-gray-500">Thông tin hiển thị trên thẻ lớp học viên. Nếu chưa cài ảnh riêng, hệ thống tự động gán ảnh ngẫu nhiên từ học viện.</p>
              </div>
              <button type="button" onClick={() => setPresentationModalClass(null)} className="rounded-xl bg-gray-100 p-2 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-700 dark:text-gray-300">Tên giáo viên hiển thị trên thẻ lớp</label>
                <input
                  value={teacherNameInput}
                  onChange={(event) => setTeacherNameInput(event.target.value)}
                  maxLength={255}
                  placeholder={presentationModalClass.systemTeacherName || "Ví dụ: TS. Nguyễn Minh Anh"}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Ảnh nền của lớp</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const randomWp = getRandomWallpaper();
                        setCoverImageUrlInput(randomWp.cloudinaryUrl);
                        toast.success(`Đã chọn ngẫu nhiên: ${randomWp.title}`);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
                    >
                      <FiShuffle className="h-3 w-3" /> Đổi ngẫu nhiên
                    </button>
                    {coverImageUrlInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setCoverImageUrlInput("");
                          toast.success("Đã khôi phục ảnh ngẫu nhiên mặc định.");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300"
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
                    placeholder="Dán link ảnh hoặc tải ảnh lên bên cạnh"
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                  >
                    <FiUploadCloud className="h-4 w-4" /> {uploadingCover ? "Đang tải..." : "Tải ảnh"}
                  </button>
                </div>
              </div>

              {/* Preview Box */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-600 dark:text-gray-400">Xem trước hiển thị học viên</span>
                  {coverImageUrlInput ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                      <FiCheck className="h-3 w-3" /> Ảnh riêng của lớp (Admin cài đặt)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800">
                      Ảnh ngẫu nhiên học viện (Tự động)
                    </span>
                  )}
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-slate-900 shadow-md dark:border-gray-800">
                  <img
                    src={coverImageUrlInput || getClassCoverImage(presentationModalClass)}
                    alt="Xem trước ảnh lớp"
                    className="h-44 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-black/20 to-transparent" />
                  <div className="absolute inset-x-4 bottom-3">
                    <span className="rounded bg-sky-500/80 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-xs">
                      {presentationModalClass.code}
                    </span>
                    <h4 className="mt-1 text-base font-black text-white drop-shadow">
                      {presentationModalClass.name}
                    </h4>
                    <p className="text-xs text-sky-200">
                      GV: {teacherNameInput.trim() || presentationModalClass.teacherName || "Chưa phân công"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Wallpaper Picker Gallery (15 aesthetic oriental landscape wallpapers) */}
              <div>
                <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Hoặc chọn nhanh từ bộ sưu tập 15 ảnh nền học viện CSCA:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-52 overflow-y-auto p-1.5 rounded-2xl border border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/50">
                  {CSCA_WALLPAPERS.map((wp) => {
                    const isSelected = coverImageUrlInput === wp.cloudinaryUrl || coverImageUrlInput === wp.url;
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
                            ? "border-sky-500 ring-2 ring-sky-500 shadow-md"
                            : "border-gray-200 hover:border-sky-300 dark:border-gray-700"
                        }`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-slate-200 dark:bg-gray-700">
                          <img
                            src={wp.cloudinaryUrl || wp.url}
                            alt={wp.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-sky-600/40 flex items-center justify-center">
                              <span className="rounded-full bg-white p-1 text-sky-600 shadow">
                                <FiCheck className="h-3 w-3 stroke-[3]" />
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="p-1 bg-white dark:bg-gray-900">
                          <p className="truncate text-[10px] font-bold text-gray-800 dark:text-gray-200">
                            {wp.title}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-gray-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
              <button
                type="button"
                onClick={() => setPresentationModalClass(null)}
                className="rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSavePresentation}
                disabled={savingPresentation || uploadingCover}
                className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60 shadow-md"
              >
                {savingPresentation ? "Đang lưu..." : "Lưu thẻ lớp"}
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Mapping Configuration Modal */}
      {mappingModalClass && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Ánh Xạ MolyInternal — {mappingModalClass.code}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Gán các ID định danh từ hệ thống quản lý trung tâm.
                </p>
              </div>
              <button
                onClick={() => setMappingModalClass(null)}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-white transition"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Moly Management Class ID:
                </label>
                <input
                  type="text"
                  value={molyClassIdInput}
                  onChange={(e) => setMolyClassIdInput(e.target.value)}
                  placeholder="Ví dụ: MOLY_CLS_8820"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white font-mono outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Moly Management Course ID:
                </label>
                <input
                  type="text"
                  value={molyCourseIdInput}
                  onChange={(e) => setMolyCourseIdInput(e.target.value)}
                  placeholder="Ví dụ: MOLY_CRS_9921"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white font-mono outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setMappingModalClass(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveMapping}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
              >
                <FiCheckCircle className="w-4 h-4" />
                <span>Lưu & Kích hoạt Mapping</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
