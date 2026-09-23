import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiLayers,
  FiBookOpen,
  FiCheckCircle,
  FiClock,
  FiChevronLeft,
  FiChevronRight,
  FiAlertTriangle
} from "react-icons/fi";
import useGetCourse from "../../hooks/useGetCourse";
import { toast } from "react-hot-toast";
import axios from "axios";
import { useAuthContext } from "../../context/AuthContext";
import useGetUsers from "../../hooks/useGetUsers";
import SimpleRichTextEditor from "../../components/SimpleRichTextEditor";
import Loading from "../../components/Loading";
import Error from "../../components/Error";
import { useTranslation } from "react-i18next";

export default function AdminCourses() {
  const { t } = useTranslation();
  const { courses, loading, error } = useGetCourse();
  const { authUser } = useAuthContext();
  const { users } = useGetUsers();

  const [localCourses, setLocalCourses] = useState(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | published | draft
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const [formData, setFormData] = useState({
    nameCourse: "",
    description: "",
    imageCourse: "",
    category: "CSCA",
    status: "published",
  });

  const [submitting, setSubmitting] = useState(false);

  // Active courses list
  const allCourses = useMemo(() => {
    return localCourses || (Array.isArray(courses) ? courses : []);
  }, [courses, localCourses]);

  // Filtered by role
  const roleFiltered = useMemo(() => {
    if (authUser?.role === "admin") return allCourses;
    return allCourses.filter((c) => c?.author === authUser?._id);
  }, [allCourses, authUser]);

  // Filtered by search, category, and status
  const filteredCourses = useMemo(() => {
    let list = [...roleFiltered];

    if (statusFilter !== "all") {
      list = list.filter((c) => (c.status || "published") === statusFilter);
    }

    if (categoryFilter !== "all") {
      list = list.filter((c) => (c.category || "CSCA") === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.nameCourse || "").toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [roleFiltered, statusFilter, categoryFilter, searchQuery]);

  // Pagination
  const totalItems = filteredCourses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCourses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCourses.slice(start, start + pageSize);
  }, [filteredCourses, currentPage, pageSize]);

  // Toggle Publish / Draft status
  const handleToggleStatus = useCallback(
    (course) => {
      const newStatus = course.status === "draft" ? "published" : "draft";
      const updated = allCourses.map((c) =>
        c._id === course._id ? { ...c, status: newStatus } : c
      );
      setLocalCourses(updated);
      toast.success(
        `Đã chuyển khóa học "${course.nameCourse}" sang trạng thái ${
          newStatus === "published" ? "Xuất Bản (Published) 🟢" : "Bản Nháp (Draft) 🟡"
        }!`
      );
    },
    [allCourses]
  );

  // Delete Course with custom confirm modal
  const handleDelete = useCallback(
    (courseId, courseName) => {
      setConfirmDialog({
        isOpen: true,
        title: "Xác Nhận Xóa Khóa Học",
        message: `Bạn có chắc chắn muốn xóa khóa học "${courseName}"? Toàn bộ các bài học bên trong cũng sẽ bị gỡ bỏ!`,
        onConfirm: async () => {
          try {
            await axios.delete(`/api/course/${courseId}`);
            toast.success(t("adminCourse_deleteSuccess"));
            setLocalCourses((prev) => (prev || courses).filter((c) => c._id !== courseId));
          } catch (err) {
            console.error("Delete course error:", err);
            toast.error(t("adminCourse_deleteError"));
          } finally {
            setConfirmDialog((p) => ({ ...p, isOpen: false }));
          }
        },
      });
    },
    [courses, t]
  );

  // Submit create or edit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const courseData = {
        ...formData,
        author: authUser._id,
      };

      if (editingCourse) {
        await axios.put(`/api/course/${editingCourse._id}`, courseData);
        toast.success(t("adminCourse_updateSuccess"));
        setLocalCourses((prev) =>
          (prev || courses).map((c) =>
            c._id === editingCourse._id ? { ...c, ...courseData } : c
          )
        );
      } else {
        const res = await axios.post("/api/course", courseData);
        toast.success(t("adminCourse_createSuccess"));
        const newCourse = res?.data || { ...courseData, _id: `c_${Date.now()}` };
        setLocalCourses((prev) => [newCourse, ...(prev || courses)]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Submit course error:", err);
      toast.error(t("common_errorPrefix"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading loading={loading} text="Đang tải danh sách khóa học..." />;
  if (error) return <Error error={error} />;

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            {t("adminCourse_title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
            Tổng cộng <strong className="text-blue-600 dark:text-blue-400">{allCourses.length}</strong> khóa học đang được quản lý trong hệ thống.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/lms/admin/curriculum"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-600/25"
          >
            <FiLayers className="w-4 h-4" />
            <span>Soạn Giáo Trình & Video R2</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setEditingCourse(null);
              setFormData({
                nameCourse: "",
                description: "",
                imageCourse: "",
                category: "CSCA",
                status: "published",
              });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/30"
          >
            <FiPlus className="w-4 h-4" />
            <span>{t("adminCourse_addCourseButton")}</span>
          </button>
        </div>
      </div>

      {/* Toolbar Filters & Search */}
      <div className="bg-white dark:bg-gray-800/90 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <FiSearch className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm khóa học..."
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="hidden sm:inline">Phân loại:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none"
            >
              <option value="all">Tất cả danh mục</option>
              <option value="CSCA">CSCA</option>
              <option value="HSK">HSK</option>
              <option value="LIVE">Live Class</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="hidden sm:inline">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="published">Đã xuất bản (Published)</option>
              <option value="draft">Bản nháp (Draft)</option>
            </select>
          </div>

          {/* Page size selector */}
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none"
          >
            <option value={6}>6 khóa/trang</option>
            <option value={12}>12 khóa/trang</option>
            <option value={24}>24 khóa/trang</option>
          </select>
        </div>
      </div>

      {/* Courses Table */}
      <div className="bg-white dark:bg-gray-800/90 shadow-sm rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900/60 uppercase tracking-wider text-[10px] font-bold text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-3.5 px-6">Khóa Học</th>
                <th className="py-3.5 px-4">Tác Giả / Giảng Viên</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái</th>
                <th className="py-3.5 px-6 text-right">Hành Động</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-sans">
              {paginatedCourses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-500">
                    Không tìm thấy khóa học nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                paginatedCourses.map((course) => {
                  const author = users.find((user) => user._id === course.author);
                  const isPublished = course.status !== "draft";

                  return (
                    <tr key={course._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3.5">
                          <img
                            src={course.imageCourse || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=200"}
                            alt={course.nameCourse}
                            className="w-14 h-10 rounded-xl object-cover border border-gray-200 dark:border-gray-700 shrink-0 bg-gray-100"
                          />
                          <div className="space-y-0.5">
                            <p className="font-bold text-gray-900 dark:text-white text-sm">
                              {course.nameCourse}
                            </p>
                            <p className="text-gray-400 line-clamp-1 text-[11px] max-w-md">
                              {course.description ? course.description.replace(/<[^>]*>/g, "") : "Chưa có mô tả khóa học"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono text-gray-600 dark:text-gray-300 text-xs">
                        {author ? author.username : "CSCA Faculty"}
                      </td>

                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(course)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-mono border transition ${
                            isPublished
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:opacity-80"
                              : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:opacity-80"
                          }`}
                          title="Bấm để chuyển trạng thái Xuất bản / Bản nháp"
                        >
                          {isPublished ? <FiCheckCircle className="w-3 h-3" /> : <FiClock className="w-3 h-3" />}
                          <span>{isPublished ? "Xuất Bản" : "Bản Nháp"}</span>
                        </button>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/courses/${course._id}/lessons`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 transition"
                            title="Xem danh sách bài học"
                          >
                            <FiBookOpen className="w-3.5 h-3.5 text-blue-500" />
                            <span>Bài học</span>
                          </Link>

                          <Link
                            to="/lms/admin/curriculum"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold transition"
                            title="Mở trình soạn giáo trình R2"
                          >
                            <FiLayers className="w-3.5 h-3.5" />
                            <span>Giáo trình</span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCourse(course);
                              setFormData({
                                nameCourse: course.nameCourse || "",
                                description: course.description || "",
                                imageCourse: course.imageCourse || "",
                                category: course.category || "CSCA",
                                status: course.status || "published",
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                            title="Sửa thông tin"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(course._id, course.nameCourse)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                            title="Xóa khóa học"
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

        {/* Pagination Controls */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400">
          <div>
            Hiển thị{" "}
            <strong>
              {paginatedCourses.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
              {Math.min(currentPage * pageSize, totalItems)}
            </strong>{" "}
            trong tổng số <strong>{totalItems}</strong> khóa học
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <FiChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
            >
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Add / Edit Course */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {editingCourse ? t("adminCourse_modal_editTitle") : t("adminCourse_modal_addTitle")}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">
                  {t("adminCourse_form_courseNameLabel")}:
                </label>
                <input
                  type="text"
                  required
                  value={formData.nameCourse}
                  onChange={(e) => setFormData({ ...formData, nameCourse: e.target.value })}
                  placeholder={t("adminCourse_form_courseNamePlaceholder")}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">
                  {t("adminCourse_form_descriptionLabel")}:
                </label>
                <SimpleRichTextEditor
                  value={formData.description}
                  onChange={(value) => setFormData({ ...formData, description: value })}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300">
                  {t("adminCourse_form_imageUrlLabel")}:
                </label>
                <input
                  type="url"
                  required
                  value={formData.imageCourse}
                  onChange={(e) => setFormData({ ...formData, imageCourse: e.target.value })}
                  placeholder={t("adminCourse_form_imageUrlPlaceholder")}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-white"
                >
                  {t("common_cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-md shadow-blue-600/30 disabled:opacity-50"
                >
                  {submitting ? "Đang Lưu..." : editingCourse ? t("common_update") : t("common_addNew")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center text-xl">
              <FiAlertTriangle />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {confirmDialog.title}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
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
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-rose-600/30"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
