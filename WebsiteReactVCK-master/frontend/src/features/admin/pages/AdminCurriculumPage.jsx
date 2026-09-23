import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import VideoUploader from "../components/VideoUploader";
import {
  fetchAdminCourses,
  fetchAdminCourseDetail,
  createCourse,
  createSection,
  createLesson,
  updateCourseStatus,
} from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";

export default function AdminCurriculumPage() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseDetail, setCourseDetail] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Modals state
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(null);

  // Active accordion section
  const [activeSectionId, setActiveSectionId] = useState(null);

  // Uploaded video assets from VideoUploader
  const [uploadedVideos, setUploadedVideos] = useState([]);

  // Course Form State
  const [courseForm, setCourseForm] = useState({
    title: "",
    slug: "",
    category: "CSCA",
    level: "beginner",
    description: "",
    price: 0,
    thumbnailUrl: "",
    status: "published",
  });
  const [submittingCourse, setSubmittingCourse] = useState(false);

  // Section Form State
  const [sectionTitle, setSectionTitle] = useState("");
  const [submittingSection, setSubmittingSection] = useState(false);

  // Lesson Form State
  const [lessonForm, setLessonForm] = useState({
    title: "",
    videoAssetId: "",
    r2Key: "",
    durationSeconds: 600,
    isPreview: false,
  });
  const [submittingLesson, setSubmittingLesson] = useState(false);

  // Course status toggles (Draft / Published)
  const [courseStatuses, setCourseStatuses] = useState({});

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    setErrorMsg("");
    try {
      const res = await fetchAdminCourses();
      if (res.success && res.data) {
        setCourses(res.data);
        const initialStatus = {};
        res.data.forEach((c) => {
          initialStatus[c.id] = c.is_published !== false ? "published" : "draft";
        });
        setCourseStatuses(initialStatus);

        // Auto select first course if none selected
        if (!selectedCourse && res.data.length > 0) {
          setSelectedCourse(res.data[0]);
        }
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error("Error loading courses:", err);
      setErrorMsg("Không thể nạp danh sách khóa học.");
    } finally {
      setLoadingCourses(false);
    }
  }, [selectedCourse]);

  const loadCourseDetailData = useCallback(async (course) => {
    if (!course?.id && !course?.slug) return;
    setLoadingDetail(true);
    try {
      const res = await fetchAdminCourseDetail(course.id);
      if (res.success && res.data) {
        setCourseDetail(res.data);
        if (res.data.sections && res.data.sections.length > 0) {
          setActiveSectionId(res.data.sections[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading course details:", err);
      setCourseDetail(null);
      toast.error(err.message || "Không thể nạp curriculum khóa học.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (selectedCourse) {
      loadCourseDetailData(selectedCourse);
    }
  }, [selectedCourse, loadCourseDetailData]);

  // Toggle publish / draft status
  const handleToggleStatus = async (courseId, e) => {
    e.stopPropagation();
    const current = courseStatuses[courseId] || "draft";
    const next = current === "published" ? "draft" : "published";
    try {
      const res = await updateCourseStatus({ courseId, isPublished: next === "published" });
      if (!res.success || !res.data) throw new Error(res.message || "Cập nhật trạng thái thất bại");
      toast.success(
        next === "published"
          ? "Đã công khai khóa học lên Catalog!"
          : "Đã chuyển khóa học về chế độ Nháp (Draft)"
      );
      setCourseStatuses((prev) => ({ ...prev, [courseId]: next }));
      setCourses((prev) => prev.map((course) => (
        course.id === courseId ? { ...course, is_published: next === "published" } : course
      )));
      setSelectedCourse((prev) => (
        prev?.id === courseId ? { ...prev, is_published: next === "published" } : prev
      ));
    } catch (err) {
      console.error("Error updating course status:", err);
      toast.error(err.message || "Không thể cập nhật trạng thái khóa học.");
    }
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    setSubmittingCourse(true);
    try {
      const res = await createCourse(courseForm);
      if (res.success && res.data) {
        toast.success("Tạo khóa học mới thành công! 🎉");
        setCourses((prev) => [res.data, ...prev]);
        setSelectedCourse(res.data);
        setShowCourseModal(false);
        setCourseForm({
          title: "",
          slug: "",
          category: "CSCA",
          level: "beginner",
          description: "",
          price: 0,
          thumbnailUrl: "",
          status: "published",
        });
      } else {
        toast.error(res.message || "Tạo khóa học thất bại!");
      }
    } catch (err) {
      console.error("Error creating course:", err);
      toast.error(err.message || "Lỗi tạo khóa học!");
    } finally {
      setSubmittingCourse(false);
    }
  };

  const handleCreateSection = async (e) => {
    e.preventDefault();
    if (!selectedCourse || !sectionTitle.trim()) return;
    setSubmittingSection(true);
    try {
      const nextSortOrder = (courseDetail?.sections?.length || 0) + 1;
      const res = await createSection({
        courseId: selectedCourse.id,
        title: sectionTitle.trim(),
        sortOrder: nextSortOrder,
      });

      if (res.success) {
        if (!res.data) throw new Error("Máy chủ không trả về chương học vừa tạo");
        const newSec = res.data;
        setCourseDetail((prev) => ({
          ...prev,
          sections: [...(prev?.sections || []), newSec],
        }));
        setActiveSectionId(newSec.id);
        setShowSectionModal(false);
        setSectionTitle("");
        toast.success("Đã thêm chương học mới thành công! 📖");
      } else {
        toast.error(res.message || "Lỗi tạo chương!");
      }
    } catch (err) {
      console.error("Error creating section:", err);
      toast.error("Lỗi khi thêm chương học!");
    } finally {
      setSubmittingSection(false);
    }
  };

  const handleOpenLessonModal = (sectionId) => {
    setSelectedSectionId(sectionId);
    setLessonForm({
      title: "",
      videoAssetId: "",
      r2Key: "",
      durationSeconds: 600,
      isPreview: false,
    });
    setShowLessonModal(true);
  };

  const handleCreateLesson = async (e) => {
    e.preventDefault();
    if (!selectedCourse || !selectedSectionId || !lessonForm.title.trim()) return;
    setSubmittingLesson(true);
    try {
      const res = await createLesson({
        sectionId: selectedSectionId,
        courseId: selectedCourse.id,
        title: lessonForm.title.trim(),
        videoAssetId: lessonForm.videoAssetId,
        durationSeconds: Number(lessonForm.durationSeconds) || 600,
        isPreview: Boolean(lessonForm.isPreview),
        sortOrder: (courseDetail?.lessons?.filter((l) => String(l.section_id) === String(selectedSectionId)).length || 0) + 1,
      });

      if (res.success) {
        if (!res.data) throw new Error("Máy chủ không trả về bài học vừa tạo");
        const newLes = res.data;
        setCourseDetail((prev) => ({
          ...prev,
          lessons: [...(prev?.lessons || []), newLes],
        }));
        setShowLessonModal(false);
        setLessonForm({
          title: "",
          videoAssetId: "",
          r2Key: "",
          durationSeconds: 600,
          isPreview: false,
        });
        toast.success("Đã thêm bài giảng vào chương thành công! 🎥");
      } else {
        toast.error(res.message || "Lỗi tạo bài giảng!");
      }
    } catch (err) {
      console.error("Error creating lesson:", err);
      toast.error("Lỗi khi thêm bài giảng!");
    } finally {
      setSubmittingLesson(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 md:px-8 font-sans">
      <div className="container mx-auto max-w-6xl space-y-10">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30 uppercase tracking-wider">
                Admin Console
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Khóa Học & Chương Trình Giảng Dạy</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Quản Lý Khóa Học & Curriculum
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-xs md:text-sm mt-1">
              Khởi tạo lộ trình CSCA/HSK/HSKK, biên tập danh mục chương bài và đính kèm Video Cloudflare R2.
            </p>
          </div>

          <button
            id="admin-create-course-btn"
            onClick={() => setShowCourseModal(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2.5 rounded-2xl transition shadow-lg shadow-rose-600/30 flex items-center gap-2 text-sm"
          >
            <span>+</span>
            <span>Tạo Khóa Học Mới</span>
          </button>
        </div>

        {/* Video Uploader Section */}
        <VideoUploader
          onVideoUploaded={(asset) => {
            setUploadedVideos((prev) => [asset, ...prev]);
            toast.success(`Đã lưu video "${asset.title || asset.filename}" vào kho Cloudflare R2!`);
          }}
        />

        {/* Courses Table / Management Grid */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Danh Sách Khóa Học Trong Hệ Thống</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chọn khóa học để xem và điều chỉnh đề cương bài giảng</p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Tổng cộng: <strong className="text-slate-900 dark:text-white">{courses.length}</strong> khóa
            </span>
          </div>

          {loadingCourses ? (
            <LoadingState message="Đang nạp danh sách khóa học hệ thống..." count={3} />
          ) : errorMsg ? (
            <ErrorState
              title="Lỗi Tải Khóa Học"
              message={errorMsg}
              onRetry={loadCourses}
            />
          ) : courses.length === 0 ? (
            <EmptyState
              title="Chưa Có Khóa Học Nào"
              message="Hệ thống chưa có khóa học nào. Hãy nhấp nút bên dưới để tạo khóa học đầu tiên."
              actionLabel="+ Tạo Khóa Học Ngay"
              onAction={() => setShowCourseModal(true)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((c) => {
                const isSelected = selectedCourse?.id === c.id;
                const status = courseStatuses[c.id] || (c.is_published !== false ? "published" : "draft");

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCourse(c)}
                    className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between group shadow-sm ${
                      isSelected
                        ? "bg-rose-500/10 border-rose-500 text-rose-950 dark:text-white shadow-lg shadow-rose-600/10"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30">
                            {c.category}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize font-mono">{c.level}</span>
                        </div>

                        {/* Status badge toggle button */}
                        <button
                          onClick={(e) => handleToggleStatus(c.id, e)}
                          title="Nhấp để đổi trạng thái Công khai / Nháp"
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border transition ${
                            status === "published"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                          }`}
                        >
                          {status === "published" ? "✓ Public" : "✎ Draft"}
                        </button>
                      </div>

                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition">
                          {c.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1 font-light">
                          {c.description || "Chưa có mô tả chi tiết."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex justify-between items-center text-xs">
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        {c.is_free || Number(c.price) === 0 ? "Miễn Phí" : `${Number(c.price).toLocaleString("vi-VN")} đ`}
                      </span>
                      <span className={`text-[11px] font-semibold transition ${isSelected ? "text-rose-600 dark:text-rose-400" : "text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"}`}>
                        {isSelected ? "● Đang quản lý" : "Chọn quản lý →"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Course Curriculum Details */}
        {selectedCourse && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mb-0.5">Đang quản lý chương trình giảng dạy cho:</span>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedCourse.title}</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20 font-bold">
                    {selectedCourse.category}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowSectionModal(true)}
                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition border border-slate-300 dark:border-slate-700 flex items-center gap-2"
              >
                <span>+</span>
                <span>Thêm Chương Mới</span>
              </button>
            </div>

            {loadingDetail ? (
              <LoadingState message="Đang tải các chương bài giảng của khóa học..." count={2} />
            ) : !courseDetail || courseDetail.sections?.length === 0 ? (
              <div className="p-8 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-center space-y-3">
                <div className="text-3xl">📚</div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Chưa Có Chương Bài Giảng</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  Khóa học này hiện chưa có chương mục nào. Nhấp vào nút bên dưới để thiết kế chương đề mục đầu tiên.
                </p>
                <button
                  onClick={() => setShowSectionModal(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
                >
                  + Thêm Chương Đầu Tiên
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {courseDetail.sections.map((sec, idx) => {
                  const secLessons = (courseDetail.lessons || []).filter(
                    (l) => String(l.section_id) === String(sec.id)
                  );
                  const isOpen = activeSectionId === sec.id;

                  return (
                    <div
                      key={sec.id}
                      className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition"
                    >
                      {/* Section Header */}
                      <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-transparent">
                        <div
                          className="flex items-center gap-3 cursor-pointer flex-1"
                          onClick={() => setActiveSectionId(isOpen ? null : sec.id)}
                        >
                          <span className="text-xs font-mono font-bold text-rose-500 dark:text-rose-400">
                            Chương {idx + 1}:
                          </span>
                          <span className="font-semibold text-sm text-slate-900 dark:text-white">{sec.title}</span>
                          <span className="text-xs text-slate-500 font-mono">
                            ({secLessons.length} bài)
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleOpenLessonModal(sec.id)}
                            className="bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                          >
                            <span>+ Thêm Bài Giảng</span>
                          </button>
                          <button
                            onClick={() => setActiveSectionId(isOpen ? null : sec.id)}
                            className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs p-1"
                          >
                            {isOpen ? "▲" : "▼"}
                          </button>
                        </div>
                      </div>

                      {/* Section Lessons List */}
                      {isOpen && (
                        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800/60 divide-y divide-slate-200 dark:divide-slate-800/40 bg-slate-50/50 dark:bg-slate-900/30">
                          {secLessons.length === 0 ? (
                            <p className="text-xs text-slate-500 py-3 text-center">
                              Chương này chưa có bài giảng nào. Nhấp &ldquo;+ Thêm Bài Giảng&rdquo; để thêm bài.
                            </p>
                          ) : (
                            secLessons.map((les, lIdx) => (
                              <div
                                key={les.id}
                                className="py-3 flex items-center justify-between flex-wrap gap-3 text-xs"
                              >
                                <div className="flex items-center gap-3 truncate max-w-md">
                                  <span className="text-slate-500 font-mono">{lIdx + 1}.</span>
                                  <span className="text-slate-800 dark:text-slate-200 font-medium truncate">{les.title}</span>
                                  {les.is_preview && (
                                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      Học Thử
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 font-mono">
                                  <span>{Math.floor((les.duration_seconds || 600) / 60)} phút</span>
                                  <span className="text-slate-400 dark:text-slate-500 text-[10px] hidden sm:inline">
                                    {les.r2_key ? `R2: ${les.r2_key}` : "Chưa gắn video R2"}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Create Course */}
      {showCourseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tạo Khóa Học Mới</h3>
              <button
                onClick={() => setShowCourseModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên Khóa Học</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Ôn Luyện CSCA Toán - Lý - Hóa Chuyên Sâu"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">URL Slug</label>
                <input
                  type="text"
                  required
                  placeholder="on-luyen-csca-toan-ly-hoa"
                  value={courseForm.slug}
                  onChange={(e) => setCourseForm({ ...courseForm, slug: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Danh Mục</label>
                  <select
                    value={courseForm.category}
                    onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="CSCA">CSCA</option>
                    <option value="HSK">HSK</option>
                    <option value="HSKK">HSKK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Trình Độ</label>
                  <select
                    value={courseForm.level}
                    onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="beginner">Sơ Cấp (Beginner)</option>
                    <option value="intermediate">Trung Cấp (Intermediate)</option>
                    <option value="advanced">Cao Cấp (Advanced)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Học Phí (VNĐ, 0 = Miễn phí)</label>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={courseForm.price}
                  onChange={(e) => setCourseForm({ ...courseForm, price: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Mô Tả Tổng Quan</label>
                <textarea
                  rows={3}
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  placeholder="Giới thiệu mục tiêu và định hướng lộ trình của khóa học..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingCourse}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition shadow-lg shadow-rose-600/30"
                >
                  {submittingCourse ? "Đang Lưu..." : "Lưu Khóa Học"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Section */}
      {showSectionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Thêm Chương Mới</h3>
              <button
                onClick={() => setShowSectionModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên Chương Bài Giảng</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Chương 1: Giới Thiệu Cấu Trúc Đề Thi"
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSectionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingSection || !sectionTitle.trim()}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs transition"
                >
                  {submittingSection ? "Đang lưu..." : "Tạo Chương"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Lesson */}
      {showLessonModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Thêm Bài Giảng Mới</h3>
              <button
                onClick={() => setShowLessonModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên Bài Giảng</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bài 1: Phân Tích Dạng Câu Hỏi Thường Gặp"
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời Lượng (Giây)</label>
                  <input
                    type="number"
                    min="60"
                    step="30"
                    value={lessonForm.durationSeconds}
                    onChange={(e) => setLessonForm({ ...lessonForm, durationSeconds: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                    ≈ {Math.floor((lessonForm.durationSeconds || 600) / 60)} phút
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Video Cloudflare R2</label>
                  {uploadedVideos.length > 0 ? (
                    <select
                      value={lessonForm.videoAssetId}
                      onChange={(e) => {
                        const selected = uploadedVideos.find((v) => String(v.id) === e.target.value);
                        setLessonForm({
                          ...lessonForm,
                          videoAssetId: e.target.value,
                          r2Key: selected?.r2_key || "",
                        });
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                    >
                      <option value="">-- Chọn Video R2 --</option>
                      {uploadedVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title || v.filename || v.r2_key}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Nhập R2 Key hoặc Asset ID..."
                      value={lessonForm.r2Key}
                      onChange={(e) => setLessonForm({ ...lessonForm, r2Key: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is-preview-checkbox"
                  checked={lessonForm.isPreview}
                  onChange={(e) => setLessonForm({ ...lessonForm, isPreview: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="is-preview-checkbox" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  Cho phép học thử miễn phí (Preview Lesson)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLessonModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingLesson || !lessonForm.title.trim()}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-lg shadow-rose-600/30"
                >
                  {submittingLesson ? "Đang lưu..." : "Lưu Bài Giảng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
