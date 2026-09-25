import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiBookOpen,
  FiSearch,
  FiLink,
  FiCheckCircle,
  FiClock,
  FiUsers,
  FiExternalLink,
  FiX,
  FiRefreshCw,
  FiPlus,
} from "react-icons/fi";
import { fetchAdminClasses, updateAdminClassMapping } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";

export default function AdminClassesPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [mappingModalClass, setMappingModalClass] = useState(null);
  const [molyClassIdInput, setMolyClassIdInput] = useState("");
  const [molyCourseIdInput, setMolyCourseIdInput] = useState("");

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminClasses();
      if (res?.data) {
        setClasses(res.data);
      }
    } catch (err) {
      console.error("Error loading classes:", err);
      toast.error("Không thể tải danh sách lớp học!");
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
                <th className="py-3.5 px-5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <Loading loading={true} text="Đang tải danh sách lớp học & Moly..." fullScreen={false} />
                  </td>
                </tr>
              ) : filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Không tìm thấy lớp học nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredClasses.map((cls) => (
                  <tr key={cls.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                    <td className="py-4 px-5">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px] block">
                        {cls.code}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white mt-0.5 block">
                        {cls.name}
                      </span>
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
                    <td className="py-4 px-5 text-right">
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
