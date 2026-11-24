import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  FolderOpen,
  Link2,
  Plus,
  School,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  createCourse,
  createAdminCourse,
  createAdminLesson,
  createAdminSection,
  createLesson,
  createSection,
  deleteAdminCourse,
  deleteAdminLesson,
  deleteAdminSection,
  fetchAdminConsoleCourses,
  fetchAdminConsoleCurriculum,
  fetchAdminCourseDetail,
  fetchAdminCourses,
  updateAdminCourse,
  updateAdminLesson,
  updateAdminSection,
  updateCourseStatus,
  updateLessonLearningLink,
  uploadImageToCloudinary,
} from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";
import { useAuthContext } from "../../../context/AuthContext";
import CourseSessionCurriculumPanel from "../components/CourseSessionCurriculumPanel";

export default function AdminCurriculumPage() {
  const { authUser } = useAuthContext();
  const isAdmin = authUser?.role === "admin";
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseDetail, setCourseDetail] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Modals state
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [showLearningLinkModal, setShowLearningLinkModal] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // Active accordion section
  const [activeSectionId, setActiveSectionId] = useState(null);

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
  const thumbnailInputRef = useRef(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn tệp hình ảnh (JPG, PNG, WEBP, GIF, SVG)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Kích thước ảnh không vượt quá 10MB");
      return;
    }
    try {
      setUploadingThumbnail(true);
      const res = await uploadImageToCloudinary(file, { folder: "csca/courses" });
      setCourseForm((prev) => ({ ...prev, thumbnailUrl: res.publicUrl }));
      toast.success("Tải ảnh bìa thành công!");
    } catch (err) {
      console.error("Lỗi tải ảnh khóa học:", err);
      toast.error(err.message || "Không thể tải ảnh bìa");
    } finally {
      setUploadingThumbnail(false);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };

  // Section Form State
  const [sectionTitle, setSectionTitle] = useState("");
  const [submittingSection, setSubmittingSection] = useState(false);

  // Lesson Form State
  const [lessonForm, setLessonForm] = useState({
    title: "",
    learningUrl: "",
    durationSeconds: 600,
    isPreview: false,
  });
  const [submittingLesson, setSubmittingLesson] = useState(false);
  const [learningUrl, setLearningUrl] = useState("");
  const [savingLearningLink, setSavingLearningLink] = useState(false);

  // Course status toggles (Draft / Published)
  const [courseStatuses, setCourseStatuses] = useState({});

  const resetCourseForm = () => {
    setEditingCourse(null);
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
  };

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    setErrorMsg("");
    try {
      const res = await (isAdmin ? fetchAdminConsoleCourses() : fetchAdminCourses());
      if (res.success && res.data) {
        setCourses(res.data);
        const initialStatus = {};
        res.data.forEach((c) => {
          initialStatus[c.id] = c.is_published !== false ? "published" : "draft";
        });
        setCourseStatuses(initialStatus);

        // Keep the current selection without re-fetching whenever a card is clicked.
        setSelectedCourse((current) => current || res.data[0] || null);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error("Error loading courses:", err);
      setErrorMsg("Không thể nạp danh sách khóa học.");
    } finally {
      setLoadingCourses(false);
    }
  }, [isAdmin]);

  const coursesWithClasses = courses.filter((course) => Number(course.active_class_count || course.class_count || 0) > 0);

  const loadCourseDetailData = useCallback(async (course) => {
    if (!course?.id && !course?.slug) return;
    setLoadingDetail(true);
    try {
      const res = await (isAdmin
        ? fetchAdminConsoleCurriculum(course.id)
        : fetchAdminCourseDetail(course.id));
      if (res.success && res.data) {
        setCourseDetail(res.data);
        if (res.data.sections && res.data.sections.length > 0) {
          setActiveSectionId(res.data.sections[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading course details:", err);
      setCourseDetail(null);
      toast.error(err.message || "Không thể tải chương trình khóa học.");
    } finally {
      setLoadingDetail(false);
    }
  }, [isAdmin]);

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
      const res = isAdmin
        ? await updateAdminCourse({
          courseId,
          courseData: { isPublished: next === "published" },
        })
        : await updateCourseStatus({ courseId, isPublished: next === "published" });
      if (!res.success || !res.data) throw new Error(res.message || "Cập nhật trạng thái thất bại");
      toast.success(
        next === "published"
          ? "Đã công khai khóa học!"
          : "Đã chuyển khóa học về bản nháp"
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

  const handleOpenCourseModal = (course = null) => {
    if (course) {
      setEditingCourse(course);
      setCourseForm({
        title: course.title || course.name || "",
        slug: course.slug || "",
        category: course.category || "CSCA",
        level: course.level || "beginner",
        description: course.description || "",
        price: Number(course.price) || 0,
        thumbnailUrl: course.thumbnail_url || course.thumbnailUrl || "",
        status: course.is_published === false ? "draft" : "published",
      });
    } else {
      resetCourseForm();
    }
    setShowCourseModal(true);
  };

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    setSubmittingCourse(true);
    try {
      const payload = { ...courseForm, isFree: Number(courseForm.price) === 0 };
      const res = editingCourse
        ? await updateAdminCourse({ courseId: editingCourse.id, courseData: payload })
        : isAdmin ? await createAdminCourse(payload) : await createCourse(payload);
      if (res.success && res.data) {
        toast.success(editingCourse ? "Đã cập nhật khóa học." : "Tạo khóa học mới thành công!");
        setCourses((prev) => editingCourse
          ? prev.map((course) => course.id === editingCourse.id ? { ...course, ...res.data } : course)
          : [res.data, ...prev]);
        setSelectedCourse(res.data);
        setShowCourseModal(false);
        resetCourseForm();
      } else {
        toast.error(res.message || "Không thể lưu khóa học.");
      }
    } catch (err) {
      console.error("Error creating course:", err);
      toast.error(err.message || "Không thể lưu khóa học.");
    } finally {
      setSubmittingCourse(false);
    }
  };

  const handleDeleteCourse = async (course, event) => {
    event.stopPropagation();
    if (!window.confirm(`Xóa khóa học “${course.title || course.name}”? Khóa học đã có học viên hoặc tiến độ sẽ không thể xóa.`)) return;
    try {
      const res = await deleteAdminCourse(course.id);
      if (!res.success) throw new Error(res.message || "Không thể xóa khóa học");
      setCourses((current) => current.filter((item) => item.id !== course.id));
      if (selectedCourse?.id === course.id) {
        setSelectedCourse(null);
        setCourseDetail(null);
      }
      toast.success("Đã xóa khóa học.");
    } catch (error) {
      toast.error(error.message || "Không thể xóa khóa học.");
    }
  };

  const handleOpenSectionModal = (section = null) => {
    setEditingSection(section);
    setSectionTitle(section?.title || "");
    setShowSectionModal(true);
  };

  const closeSectionModal = () => {
    setShowSectionModal(false);
    setEditingSection(null);
    setSectionTitle("");
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    if (!selectedCourse || !sectionTitle.trim()) return;
    setSubmittingSection(true);
    try {
      const res = editingSection
        ? await updateAdminSection({
          sectionId: editingSection.id,
          sectionData: { title: sectionTitle.trim() },
        })
        : isAdmin
          ? await createAdminSection({
            courseId: selectedCourse.id,
            title: sectionTitle.trim(),
            sortOrder: (courseDetail?.sections?.length || 0) + 1,
          })
          : await createSection({
            courseId: selectedCourse.id,
            title: sectionTitle.trim(),
            sortOrder: (courseDetail?.sections?.length || 0) + 1,
          });

      if (res.success) {
        if (!res.data) throw new Error("Máy chủ không trả về chương học vừa tạo");
        const newSec = res.data;
        setCourseDetail((prev) => ({
          ...prev,
          sections: editingSection
            ? (prev?.sections || []).map((section) => (
              String(section.id) === String(editingSection.id) ? { ...section, ...newSec } : section
            ))
            : [...(prev?.sections || []), newSec],
        }));
        setActiveSectionId(newSec.id);
        closeSectionModal();
        toast.success(editingSection ? "Đã cập nhật chương học." : "Đã thêm chương học mới thành công!");
      } else {
        toast.error(res.message || "Không thể lưu chương học.");
      }
    } catch (err) {
      console.error("Error saving section:", err);
      toast.error(err.message || "Không thể lưu chương học.");
    } finally {
      setSubmittingSection(false);
    }
  };

  const handleOpenLessonModal = (sectionId, lesson = null) => {
    setSelectedSectionId(sectionId);
    setEditingLesson(lesson);
    setLessonForm({
      title: lesson?.title || "",
      learningUrl: lesson?.learning_url || "",
      durationSeconds: Number(lesson?.duration_seconds) || 600,
      isPreview: Boolean(lesson?.is_preview),
    });
    setShowLessonModal(true);
  };

  const closeLessonModal = () => {
    setShowLessonModal(false);
    setEditingLesson(null);
    setSelectedSectionId(null);
    setLessonForm({ title: "", learningUrl: "", durationSeconds: 600, isPreview: false });
  };

  const handleSaveLesson = async (e) => {
    e.preventDefault();
    if (!selectedCourse || !selectedSectionId || !lessonForm.title.trim()) return;
    setSubmittingLesson(true);
    try {
      const lessonData = {
        title: lessonForm.title.trim(),
        learningUrl: lessonForm.learningUrl.trim(),
        durationSeconds: Number(lessonForm.durationSeconds) || 600,
        isPreview: Boolean(lessonForm.isPreview),
      };
      const res = editingLesson
        ? await updateAdminLesson({ lessonId: editingLesson.id, lessonData })
        : isAdmin
          ? await createAdminLesson({
            sectionId: selectedSectionId,
            ...lessonData,
            sortOrder: (courseDetail?.lessons?.filter((l) => String(l.section_id) === String(selectedSectionId)).length || 0) + 1,
          })
          : await createLesson({
            sectionId: selectedSectionId,
            courseId: selectedCourse.id,
            ...lessonData,
            sortOrder: (courseDetail?.lessons?.filter((l) => String(l.section_id) === String(selectedSectionId)).length || 0) + 1,
          });

      if (res.success) {
        if (!res.data) throw new Error("Máy chủ không trả về bài học vừa tạo");
        const newLes = res.data;
        setCourseDetail((prev) => ({
          ...prev,
          lessons: editingLesson
            ? (prev?.lessons || []).map((lesson) => (
              String(lesson.id) === String(editingLesson.id) ? { ...lesson, ...newLes } : lesson
            ))
            : [...(prev?.lessons || []), newLes],
        }));
        closeLessonModal();
        toast.success(editingLesson ? "Đã cập nhật bài học." : "Đã thêm bài học vào chương thành công!");
      } else {
        toast.error(res.message || "Không thể lưu bài học.");
      }
    } catch (err) {
      console.error("Error saving lesson:", err);
      toast.error(err.message || "Không thể lưu bài học.");
    } finally {
      setSubmittingLesson(false);
    }
  };

  const handleDeleteSection = async (section, event) => {
    event.stopPropagation();
    if (!window.confirm(`Xóa chương “${section.title}”? Chương phải không còn bài học mới có thể xóa.`)) return;
    try {
      const res = await deleteAdminSection(section.id);
      if (!res.success) throw new Error(res.message || "Không thể xóa chương học");
      setCourseDetail((prev) => ({
        ...prev,
        sections: (prev?.sections || []).filter((item) => String(item.id) !== String(section.id)),
      }));
      if (String(activeSectionId) === String(section.id)) setActiveSectionId(null);
      toast.success("Đã xóa chương học.");
    } catch (error) {
      toast.error(error.message || "Không thể xóa chương học.");
    }
  };

  const handleDeleteLesson = async (lesson, event) => {
    event.stopPropagation();
    if (!window.confirm(`Xóa bài “${lesson.title}”? Bài đã có tiến độ học sẽ không thể xóa.`)) return;
    try {
      const res = await deleteAdminLesson(lesson.id);
      if (!res.success) throw new Error(res.message || "Không thể xóa bài học");
      setCourseDetail((prev) => ({
        ...prev,
        lessons: (prev?.lessons || []).filter((item) => String(item.id) !== String(lesson.id)),
      }));
      toast.success("Đã xóa bài học.");
    } catch (error) {
      toast.error(error.message || "Không thể xóa bài học.");
    }
  };

  const handleOpenLearningLinkModal = (lesson) => {
    setSelectedLesson(lesson);
    setLearningUrl(lesson.learning_url || "");
    setShowLearningLinkModal(true);
  };

  const handleSaveLearningLink = async (event) => {
    event.preventDefault();
    if (!selectedLesson) return;
    setSavingLearningLink(true);
    try {
      const res = isAdmin
        ? await updateAdminLesson({
          lessonId: selectedLesson.id,
          lessonData: { learningUrl: learningUrl.trim() },
        })
        : await updateLessonLearningLink({
          lessonId: selectedLesson.id,
          learningUrl: learningUrl.trim(),
        });
      if (!res?.success || !res.data) throw new Error(res?.message || "Không thể cập nhật link học");
      setCourseDetail((prev) => ({
        ...prev,
        lessons: (prev?.lessons || []).map((lesson) => (
          String(lesson.id) === String(selectedLesson.id)
            ? { ...lesson, ...res.data }
            : lesson
        )),
      }));
      setShowLearningLinkModal(false);
      setSelectedLesson(null);
      toast.success(res.message || "Đã cập nhật link học");
    } catch (err) {
      console.error("Error updating learning link:", err);
      toast.error(err.message || "Không thể cập nhật link học.");
    } finally {
      setSavingLearningLink(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";

  const levelLabels = {
    beginner: "Sơ cấp",
    intermediate: "Trung cấp",
    advanced: "Cao cấp",
  };

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      {/* Compact Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Khóa học & Chương trình giảng dạy
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isAdmin
              ? "Quản lý danh sách khóa học, đề cương chương bài và liên kết nội dung học."
              : "Biên tập chương bài trong các khóa học được phân công."}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="admin-create-course-btn"
              type="button"
              onClick={() => handleOpenCourseModal()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tạo khóa học mới</span>
            </button>
          </div>
        )}
      </div>

      {/* Courses List Card */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 sm:p-5 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              Danh sách khóa học
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chọn khóa học để xem và chỉnh sửa đề cương bài giảng.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {courses.length} khóa học
          </span>
        </div>

        {loadingCourses ? (
          <LoadingState message="Đang tải danh sách khóa học..." count={3} />
        ) : errorMsg ? (
          <ErrorState
            title="Lỗi tải khóa học"
            message={errorMsg}
            onRetry={loadCourses}
          />
        ) : courses.length === 0 ? (
          <EmptyState
            title="Chưa có khóa học nào"
            message={isAdmin ? "Hệ thống chưa có khóa học nào. Hãy tạo khóa học đầu tiên." : "Bạn chưa được phân công khóa học nào."}
            {...(isAdmin ? { actionLabel: "Tạo khóa học ngay", onAction: () => handleOpenCourseModal() } : {})}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {courses.map((c) => {
              const isSelected = selectedCourse?.id === c.id;
              const status = courseStatuses[c.id] || (c.is_published !== false ? "published" : "draft");
              const classCount = Number(c.class_count || 0);
              const activeClassCount = Number(c.active_class_count || 0);
              const activeEnrollments = Number(c.active_enrollments || 0);

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCourse(c)}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition cursor-pointer group ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/15 dark:border-blue-500 dark:bg-blue-950/30"
                      : "border-slate-200/80 bg-slate-50/50 hover:border-blue-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                          {c.category}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {levelLabels[c.level] || c.level}
                        </span>
                      </div>

                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => handleToggleStatus(c.id, e)}
                          title="Nhấp để đổi trạng thái Công khai / Bản nháp"
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition ${
                            status === "published"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          }`}
                        >
                          {status === "published" ? <Check className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                          <span>{status === "published" ? "Công khai" : "Bản nháp"}</span>
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            status === "published"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          }`}
                        >
                          {status === "published" ? "Công khai" : "Bản nháp"}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-sky-300 transition">
                        {c.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {c.description || "Chưa có mô tả chi tiết."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 ${
                          activeClassCount > 0
                            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-sky-300"
                            : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                        }`}
                      >
                        <School className="h-3 w-3" />
                        {activeClassCount > 0 ? `${activeClassCount} lớp đang dạy` : `${classCount} lớp`}
                      </span>
                      {classCount === 0 && activeEnrollments > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> Có học viên chưa có lớp
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-3 text-xs dark:border-slate-800">
                    <div className="min-w-0">
                      <span className="block font-black text-blue-700 dark:text-sky-300">
                        {c.is_free || Number(c.price) === 0 ? "Miễn phí" : `${Number(c.price).toLocaleString("vi-VN")} đ`}
                      </span>
                      <span
                        className="block max-w-40 truncate font-mono text-[10px] text-slate-400"
                        title={c.external_course_id || `Mã #${c.id}`}
                      >
                        {c.external_course_id || `Mã #${c.id}`}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleOpenCourseModal(c)}
                          className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={(event) => handleDeleteCourse(c, event)}
                          className="rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                        >
                          Xóa
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Course Curriculum Details */}
      {selectedCourse && (
        <div className="rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 sm:p-6 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none space-y-5">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Đang chỉnh sửa chương trình giảng dạy
              </span>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {selectedCourse.title}
                </h3>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                  {selectedCourse.category}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={isAdmin ? `/admin/files?courseId=${selectedCourse.id}` : `/lms/teach/files?courseId=${selectedCourse.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                title="Xem và quản lý tất cả tài liệu đăng tải của môn này"
              >
                <FolderOpen className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
                <span>Tài liệu theo ngày</span>
              </Link>

              <button
                type="button"
                onClick={() => handleOpenSectionModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm chương mới</span>
              </button>
            </div>
          </div>

          {Number(selectedCourse.class_count || 0) === 0 && (
            <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-black">Khóa học này chưa được gắn với lớp nào</p>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                    {Number(selectedCourse.active_enrollments || 0) > 0
                      ? `Khóa đang có ${Number(selectedCourse.active_enrollments)} học viên hoạt động. Hãy kiểm tra liên kết lớp học trước khi chỉnh sửa hoặc xóa.`
                      : "Kiểm tra thông tin đồng bộ trước khi tạo lớp hoặc thay đổi dữ liệu."}
                  </p>
                  {coursesWithClasses.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold">Khóa đang có lớp:</span>
                      {coursesWithClasses.slice(0, 4).map((course) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => setSelectedCourse(course)}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-amber-950/60"
                        >
                          {course.title} · {Number(course.active_class_count || course.class_count || 0)} lớp
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {loadingDetail ? (
            <LoadingState message="Đang tải các chương bài giảng..." count={2} />
          ) : !courseDetail || (!(courseDetail.sections?.length) && !(courseDetail.lessons?.length)) ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center dark:border-slate-800 dark:bg-slate-800/30 space-y-2.5">
              <BookOpen className="mx-auto h-8 w-8 text-slate-400" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Chưa có chương bài giảng</h4>
              <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
                Khóa học này chưa có chương mục nào. Bắt đầu bằng cách thêm chương đầu tiên.
              </p>
              <button
                type="button"
                onClick={() => handleOpenSectionModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm chương đầu tiên</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const knownSectionIds = new Set((courseDetail.sections || []).map((section) => String(section.id)));
                const unsectionedLessons = (courseDetail.lessons || []).filter(
                  (lesson) => !knownSectionIds.has(String(lesson.section_id))
                );
                const curriculumSections = [
                  ...(courseDetail.sections || []),
                  ...(unsectionedLessons.length > 0
                    ? [{ id: "unsectioned", title: "Bài học chưa phân chương", isUnsectioned: true }]
                    : []),
                ];

                return curriculumSections.map((sec, idx) => {
                  const secLessons = sec.isUnsectioned
                    ? unsectionedLessons
                    : (courseDetail.lessons || []).filter((lesson) => String(lesson.section_id) === String(sec.id));
                  const isOpen = activeSectionId === sec.id;

                  return (
                    <div
                      key={sec.id}
                      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/30"
                    >
                      {/* Section Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white px-4 py-3 dark:bg-slate-900/80">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => setActiveSectionId(isOpen ? null : sec.id)}
                        >
                          <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">
                            {sec.isUnsectioned ? "Khác" : `Chương ${idx + 1}`}
                          </span>
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {sec.title}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">
                            ({secLessons.length} bài)
                          </span>
                        </button>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {!sec.isUnsectioned && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenLessonModal(sec.id)}
                                className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-sky-300 dark:hover:bg-blue-900/60 transition"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Thêm bài học</span>
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSectionModal(sec)}
                                    className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition"
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => handleDeleteSection(sec, event)}
                                    className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                                  >
                                    Xóa
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveSectionId(isOpen ? null : sec.id)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                            aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Section Lessons List */}
                      {isOpen && (
                        <div className="divide-y divide-slate-200/70 border-t border-slate-200/70 px-4 py-1.5 dark:divide-slate-800 dark:border-slate-800">
                          {secLessons.length === 0 ? (
                            <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                              Chương này chưa có bài học nào. Nhấp &ldquo;Thêm bài học&rdquo; để bắt đầu.
                            </p>
                          ) : (
                            secLessons.map((les, lIdx) => (
                              <div
                                key={les.id}
                                className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 text-xs"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="shrink-0 font-mono text-slate-400">{lIdx + 1}.</span>
                                  <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
                                    {les.title}
                                  </span>
                                  {les.is_preview && (
                                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                      Học thử
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                      les.learning_url
                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                    }`}
                                  >
                                    {les.learning_url ? "Đã có liên kết" : "Chưa có liên kết"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLearningLinkModal(les)}
                                    className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-sky-300 dark:hover:bg-blue-900/60 transition"
                                  >
                                    <Link2 className="h-3 w-3" />
                                    <span>{les.learning_url ? "Đổi liên kết" : "Gắn liên kết"}</span>
                                  </button>
                                  {isAdmin && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenLessonModal(sec.id, les)}
                                        className="rounded-xl px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white transition"
                                      >
                                        Sửa
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(event) => handleDeleteLesson(les, event)}
                                        className="rounded-xl px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                                      >
                                        Xóa
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {isAdmin && courseDetail && (
            <CourseSessionCurriculumPanel
              courseId={selectedCourse.id}
              sections={courseDetail.sections || []}
              lessons={courseDetail.lessons || []}
            />
          )}
        </div>
      )}

      {/* Modal: Create / Edit Course */}
      {isAdmin && showCourseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editingCourse ? "Chỉnh sửa khóa học" : "Tạo khóa học mới"}
              </h3>
              <button
                type="button"
                onClick={() => { setShowCourseModal(false); resetCourseForm(); }}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên khóa học
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Ôn luyện CSCA Toán - Lý - Hóa chuyên sâu"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Đường dẫn khóa học (slug)
                </label>
                <input
                  type="text"
                  required
                  placeholder="on-luyen-csca-toan-ly-hoa"
                  value={courseForm.slug}
                  onChange={(e) => setCourseForm({ ...courseForm, slug: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Danh mục
                  </label>
                  <select
                    value={courseForm.category}
                    onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                    className={inputClass}
                  >
                    <option value="CSCA">CSCA</option>
                    <option value="HSK">HSK</option>
                    <option value="HSKK">HSKK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Trình độ
                  </label>
                  <select
                    value={courseForm.level}
                    onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })}
                    className={inputClass}
                  >
                    <option value="beginner">Sơ cấp</option>
                    <option value="intermediate">Trung cấp</option>
                    <option value="advanced">Cao cấp</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Học phí (VNĐ, 0 = Miễn phí)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={courseForm.price}
                  onChange={(e) => setCourseForm({ ...courseForm, price: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ảnh đại diện khóa học
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="https://... hoặc tải ảnh lên"
                    value={courseForm.thumbnailUrl}
                    onChange={(e) => setCourseForm({ ...courseForm, thumbnailUrl: e.target.value })}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => thumbnailInputRef.current?.click()}
                    disabled={uploadingThumbnail}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shrink-0 transition"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadingThumbnail ? "Đang tải..." : "Tải ảnh lên"}</span>
                  </button>
                </div>
                {courseForm.thumbnailUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={courseForm.thumbnailUrl}
                      alt="Ảnh đại diện khóa học"
                      className="h-10 w-16 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                    <span className="min-w-0 truncate text-[11px] text-slate-500">{courseForm.thumbnailUrl}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mô tả tổng quan
                </label>
                <textarea
                  rows={3}
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                  placeholder="Giới thiệu mục tiêu và lộ trình của khóa học..."
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowCourseModal(false); resetCourseForm(); }}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingCourse}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {submittingCourse ? "Đang lưu..." : editingCourse ? "Cập nhật khóa học" : "Tạo khóa học"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create or Edit Section */}
      {showSectionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editingSection ? "Chỉnh sửa chương học" : "Thêm chương mới"}
              </h3>
              <button
                type="button"
                onClick={closeSectionModal}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên chương bài giảng
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Chương 1: Giới thiệu cấu trúc đề thi"
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeSectionModal}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingSection || !sectionTitle.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {submittingSection ? "Đang lưu..." : editingSection ? "Cập nhật chương" : "Tạo chương"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create or Edit Lesson */}
      {showLessonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editingLesson ? "Chỉnh sửa bài học" : "Thêm bài học mới"}
              </h3>
              <button
                type="button"
                onClick={closeLessonModal}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLesson} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên bài học
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Bài 1: Phân tích dạng câu hỏi thường gặp"
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Liên kết học
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/... hoặc đường dẫn nội dung học"
                  value={lessonForm.learningUrl}
                  onChange={(e) => setLessonForm({ ...lessonForm, learningUrl: e.target.value })}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Học viên đã đăng ký khóa học sẽ thấy nút mở liên kết này trong bài học.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Thời lượng ước tính (giây)
                </label>
                <input
                  type="number"
                  min="60"
                  step="30"
                  value={lessonForm.durationSeconds}
                  onChange={(e) => setLessonForm({ ...lessonForm, durationSeconds: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>

              <label htmlFor="is-preview-checkbox" className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  id="is-preview-checkbox"
                  checked={lessonForm.isPreview}
                  onChange={(e) => setLessonForm({ ...lessonForm, isPreview: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600 dark:border-slate-700"
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Cho phép học thử miễn phí
                </span>
              </label>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeLessonModal}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingLesson || !lessonForm.title.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {submittingLesson ? "Đang lưu..." : editingLesson ? "Cập nhật bài học" : "Lưu bài học"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Set Learning Link */}
      {showLearningLinkModal && selectedLesson && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Cập nhật liên kết học</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {selectedLesson.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLearningLinkModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLearningLink} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Đường dẫn học (HTTPS)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={learningUrl}
                  onChange={(event) => setLearningUrl(event.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Để trống rồi lưu nếu muốn gỡ liên kết hiện tại.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLearningLinkModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingLearningLink}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {savingLearningLink ? "Đang lưu..." : "Lưu liên kết"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
