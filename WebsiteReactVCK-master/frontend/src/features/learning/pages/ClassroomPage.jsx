import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchClassroomDetail,
  fetchCourseProgress,
  sendProgressHeartbeat,
  fetchLessonNotes,
  createLessonNote,
  deleteLessonNote,
  fetchLessonComments,
  postLessonComment,
} from "../../api/lmsClient";
import { LoadingState, ErrorState } from "../../../components/common/StateView";

export default function ClassroomPage() {
  const { courseId, classId } = useParams();

  const [courseData, setCourseData] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Tabs state
  const [activeTab, setActiveTab] = useState("content");

  // Notes state
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  // Comments state
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyToId, setReplyToId] = useState(null);
  const [replyText, setReplyText] = useState("");

  // Mobile drawer state
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const loadLessonNotes = useCallback(async (lessonId) => {
    if (!lessonId) return;
    try {
      const response = await fetchLessonNotes(lessonId);
      setNotes(response?.success && Array.isArray(response.data) ? response.data : []);
    } catch {
      // Fallback: graceful degradation
      setNotes([]);
    }
  }, []);

  const loadLessonComments = useCallback(async (lessonId) => {
    if (!lessonId) return;
    try {
      const response = await fetchLessonComments(lessonId);
      setComments(response?.success && Array.isArray(response.data) ? response.data : []);
    } catch {
      setComments([]);
    }
  }, []);

  const loadClassroomData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [detailResponse, progressResponse] = await Promise.all([
        fetchClassroomDetail(courseId),
        fetchCourseProgress(courseId).catch(() => ({ success: false, data: { progressList: [] } })),
      ]);
      if (!detailResponse?.success || !detailResponse.data) {
        throw new Error(detailResponse?.message || "Không thể tải nội dung khóa học.");
      }
      const detail = detailResponse.data;

      setCourseData(detail);

      // Create a fast lookup map for progress: { [lesson_id]: { is_completed, watched_seconds } }
      const pMap = {};
      const progressList = progressResponse?.success && Array.isArray(progressResponse.data?.progressList)
        ? progressResponse.data.progressList
        : [];
      if (Array.isArray(progressList)) {
        progressList.forEach((p) => {
          pMap[p.lesson_id] = p;
        });
      }
      setProgressMap(pMap);

      // Find first available lesson or preview lesson
      if (detail.lessons && detail.lessons.length > 0) {
        // Find last accessed lesson or default to first
        const firstLesson = detail.lessons[0];
        setActiveLesson(firstLesson);
      }
    } catch (err) {
      setErrorMessage(err.message || "Không thể tải thông tin phòng học.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadClassroomData();
  }, [loadClassroomData]);

  // Lesson-specific collaboration data is loaded whenever the learner changes lesson.
  useEffect(() => {
    if (!activeLesson) return;

    loadLessonNotes(activeLesson.id);
    loadLessonComments(activeLesson.id);
  }, [activeLesson, loadLessonNotes, loadLessonComments]);

  const handleManualComplete = async () => {
    if (!activeLesson) return;
    try {
      const dur = Math.floor(activeLesson.duration_seconds || 600);
      await sendProgressHeartbeat({
        lessonId: activeLesson.id,
        courseId: courseData?.course?.id || courseId,
        lastPositionSeconds: dur,
        isCompleted: true,
      });
      setProgressMap((prev) => ({
        ...prev,
        [activeLesson.id]: {
          ...(prev[activeLesson.id] || {}),
          is_completed: true,
          watched_seconds: dur,
        },
      }));
      toast.success("Đã ghi nhận hoàn thành bài học!");
    } catch (err) {
      toast.error(err.message || "Không thể cập nhật tiến độ.");
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim() || !activeLesson) return;
    setSubmittingNote(true);
    try {
      const res = await createLessonNote({
        lessonId: activeLesson.id,
        timestampSeconds: 0,
        content: noteText.trim(),
      });
      if (!res?.success || !res.data) throw new Error(res?.message || "Không thể lưu ghi chú.");
      setNotes((prev) => [res.data, ...prev]);
      setNoteText("");
      toast.success("Đã lưu ghi chú.");
    } catch (err) {
      toast.error(err.message || "Không thể lưu ghi chú.");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteLessonNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success("Đã xóa ghi chú.");
    } catch (err) {
      toast.error(err.message || "Không thể xóa ghi chú.");
    }
  };

  const handleAddComment = async (e, parentId = null) => {
    e.preventDefault();
    const content = parentId ? replyText : commentText;
    if (!content.trim() || !activeLesson) return;
    setSubmittingComment(true);
    try {
      const res = await postLessonComment({ lessonId: activeLesson.id, content: content.trim(), parentId });
      if (!res?.success || !res.data) throw new Error(res?.message || "Không thể gửi bình luận.");
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: [...(c.replies || []), res.data] }
              : c
          )
        );
        setReplyText("");
        setReplyToId(null);
      } else {
        setComments((prev) => [res.data, ...prev]);
        setCommentText("");
      }
      toast.success("Đã gửi bình luận!");
    } catch (err) {
      toast.error(err.message || "Không thể gửi bình luận.");
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] bg-[#f6f9fd] dark:bg-slate-950 items-center justify-center p-6 transition-colors">
        <div className="max-w-md w-full">
          <LoadingState message="Đang chuẩn bị không gian học tập bảo mật..." count={3} />
        </div>
      </div>
    );
  }

  if (errorMessage || !courseData || !courseData.course) {
    return (
      <div className="flex min-h-[60vh] bg-[#f6f9fd] dark:bg-slate-950 items-center justify-center p-6 transition-colors">
        <div className="max-w-md w-full">
          <ErrorState
            title="Không Thể Mở Phòng Học"
            message={errorMessage || "Không tìm thấy thông tin khóa học hoặc bạn chưa đăng ký khóa học này."}
            onRetry={loadClassroomData}
            secondaryAction={
              <Link
                to={`/lms/courses/${courseId}/classes`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                ← Quay Về Khóa Học
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const { course, sections = [], lessons = [] } = courseData;
  const completedLessonsCount = Object.values(progressMap).filter((p) => p.is_completed).length;
  const totalLessonsCount = lessons.length || 1;
  const progressPercent = Math.round((completedLessonsCount / totalLessonsCount) * 100);

  const currentIndex = lessons.findIndex((l) => String(l.id) === String(activeLesson?.id));
  const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

  // Filter top level comments
  const parentComments = comments.filter((c) => !c.parent_id);

  // Lesson selector logic: check if lesson is locked (e.g. not preview and course has locked progression)
  const isLessonAccessible = (lesson) => {
    return Boolean(courseData.access?.canLearn) && Boolean(lesson);
  };

  const handleSelectLesson = (lesson) => {
    if (!isLessonAccessible(lesson)) {
      toast("🔒 Bài học này đã khóa. Vui lòng đăng ký khóa học để tiếp tục học bài này!", {
        icon: "🔒",
      });
      return;
    }
    setActiveLesson(lesson);
    setShowMobileSidebar(false);
  };

  const renderLessonButtons = (items) => (
    <div className="space-y-1.5">
      {items.map((lesson) => {
        const isCurrent = String(activeLesson?.id) === String(lesson.id);
        const isDone = progressMap[lesson.id]?.is_completed;
        const accessible = isLessonAccessible(lesson);

        return (
          <button
            key={lesson.id}
            onClick={() => handleSelectLesson(lesson)}
            className={`w-full p-3 rounded-xl text-left flex items-center justify-between transition text-sm ${
              isCurrent
                ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25"
                : accessible
                  ? "bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800"
                  : "bg-slate-50 dark:bg-slate-800/30 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer border border-slate-100 dark:border-slate-800"
            }`}
          >
            <div className="flex items-center gap-3 truncate">
              <span className="text-xs flex-shrink-0">
                {isDone ? (
                  <span className="text-emerald-500 font-bold">✓</span>
                ) : !accessible ? (
                  <span className="text-slate-400 dark:text-slate-500" title="Bài học bị khóa">🔒</span>
                ) : isCurrent ? (
                  <span>▶</span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">○</span>
                )}
              </span>
              <span className="truncate">{lesson.title}</span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 pl-2">
              {lesson.learning_url && (
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/15 text-current border border-current/20">
                  Link
                </span>
              )}
              {lesson.is_preview && (
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
                  Thử
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  // Reusable Curriculum List Component
  const CurriculumList = () => {
    const sectionIds = new Set(sections.map((section) => String(section.id)));
    const unsectionedLessons = lessons.filter((lesson) => !sectionIds.has(String(lesson.section_id)));

    if (lessons.length === 0) {
      return <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Khóa học chưa có bài học nào.</p>;
    }

    return (
      <div className="space-y-6">
        {sections.map((section, idx) => {
        const sectionLessons = lessons.filter((l) => String(l.section_id) === String(section.id));
        const completedInSection = sectionLessons.filter((l) => progressMap[l.id]?.is_completed).length;
        const totalInSection = sectionLessons.length;

        return (
          <div key={section.id} className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate max-w-[70%]">
                Chương {idx + 1}: {section.title}
              </h4>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex-shrink-0">
                {completedInSection}/{totalInSection} bài
              </span>
            </div>

            {sectionLessons.length > 0 ? renderLessonButtons(sectionLessons) : (
              <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Chương này chưa có bài học.</p>
            )}
          </div>
        );
      })}
        {unsectionedLessons.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bài học chưa phân chương</h4>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{unsectionedLessons.length} bài</span>
            </div>
            {renderLessonButtons(unsectionedLessons)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-72px)] bg-[#f6f9fd] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Left / Main Classroom Media Area */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto">
        {/* Course 100% Completion Celebration Banner */}
        {progressPercent === 100 && (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white px-6 py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2 shadow-inner">
            <span>🏆 Chúc mừng bạn! Bạn đã hoàn thành 100% bài học xuất sắc!</span>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link
              to={`/lms/courses/${courseId}/classes/${classId}`}
              className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-sky-400 text-xs font-semibold transition flex items-center gap-1"
            >
              <span>←</span>
              <span>Chi Tiết Khóa</span>
            </Link>
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
            <h1 className="text-base md:text-lg font-bold text-slate-900 dark:text-white truncate max-w-[220px] md:max-w-md">
              {course?.title || "Phòng Học Trực Tuyến"}
            </h1>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">Tiến độ khóa học:</span>
            <div className="w-28 md:w-36 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300 shadow-sm shadow-emerald-500/50"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">{progressPercent}%</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden md:inline font-mono">
              ({completedLessonsCount}/{totalLessonsCount})
            </span>
          </div>
        </div>

        {/* Lesson link: course content now opens from the link supplied by the teacher/admin. */}
        <div className="p-5 md:p-8 bg-gradient-to-br from-blue-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/30 border-b border-slate-200 dark:border-slate-800 min-h-[260px] flex items-center justify-center">
          <div className="w-full max-w-3xl rounded-3xl border border-blue-100 dark:border-blue-900/60 bg-white/90 dark:bg-slate-950/70 shadow-xl shadow-blue-950/5 p-6 md:p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-blue-600 text-white text-2xl shadow-lg shadow-blue-600/30">↗</div>
            <div className="space-y-2">
              <span className="inline-flex text-[10px] uppercase tracking-wider font-bold rounded-full px-2.5 py-1 bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-sky-300 border border-blue-100 dark:border-blue-900/60">Link học của bài</span>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{activeLesson?.title || "Chọn bài học để bắt đầu"}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
                {activeLesson?.learning_url
                  ? "Nhấn nút bên dưới để mở nội dung học do giảng viên cung cấp trong một tab mới."
                  : "Giảng viên chưa công bố link học cho bài này. Vui lòng quay lại sau hoặc liên hệ giảng viên."}
              </p>
            </div>
            {activeLesson?.learning_url && (
              <a
                href={activeLesson.learning_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition shadow-lg shadow-blue-600/25"
              >
                Mở link học <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>

        {/* Lesson Information & Navigation Bar */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300 border border-blue-100 dark:border-blue-900/40">
                Link học
              </span>
              {progressMap[activeLesson?.id]?.is_completed && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
                  ✓ Đã hoàn thành
                </span>
              )}
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{activeLesson?.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Học xong nội dung ở link, hãy đánh dấu hoàn thành để cập nhật tiến độ.
            </p>
          </div>

          {/* Quick Actions & Navigation Controls */}
          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap sm:flex-nowrap">
            {/* Mark completed button */}
            <button
              onClick={handleManualComplete}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                progressMap[activeLesson?.id]?.is_completed
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/80"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>{progressMap[activeLesson?.id]?.is_completed ? "✓ Đã Học Xong" : "○ Đánh Dấu Đã Học"}</span>
            </button>

            {/* Prev lesson button */}
            <button
              disabled={!prevLesson}
              onClick={() => prevLesson && handleSelectLesson(prevLesson)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition disabled:opacity-30 disabled:hover:bg-slate-100 dark:disabled:hover:bg-slate-800 text-left min-w-[110px]"
            >
              <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold block">← Bài Trước</span>
              <span className="truncate block max-w-[120px]">{prevLesson ? prevLesson.title : "Hết"}</span>
            </button>

            {/* Next lesson button */}
            <button
              disabled={!nextLesson}
              onClick={() => nextLesson && handleSelectLesson(nextLesson)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition disabled:opacity-30 disabled:hover:bg-blue-600 shadow-md shadow-blue-600/20 text-right min-w-[110px]"
            >
              <span className="text-[9px] text-blue-100 uppercase font-bold block">Bài Tiếp Theo →</span>
              <span className="truncate block max-w-[120px]">{nextLesson ? nextLesson.title : "Hết"}</span>
            </button>
          </div>
        </div>

        {/* Lesson details, notes and discussion */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex-1 flex flex-col min-h-[420px]">
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto px-6 gap-6">
            <button
              onClick={() => setActiveTab("content")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "content" ? "text-blue-700 dark:text-sky-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>📚 Tổng Quan</span>
              {activeTab === "content" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 dark:bg-sky-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "notes" ? "text-blue-700 dark:text-sky-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>📝 Ghi Chú Cá Nhân</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                activeTab === "notes"
                  ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border-blue-100 dark:border-blue-900/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              }`}>
                {notes.length}
              </span>
              {activeTab === "notes" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 dark:bg-sky-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("qa")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "qa" ? "text-blue-700 dark:text-sky-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>💬 Hỏi Đáp & Thảo Luận</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                activeTab === "qa"
                  ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border-blue-100 dark:border-blue-900/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              }`}>
                {comments.length}
              </span>
              {activeTab === "qa" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 dark:bg-sky-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("resources")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "resources" ? "text-blue-700 dark:text-sky-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>📎 Tài Liệu Bài Giảng</span>
              {activeTab === "resources" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 dark:bg-sky-400 rounded-full" />
              )}
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="p-6 flex-1 overflow-y-auto">
            {/* CONTENT OVERVIEW TAB */}
            {activeTab === "content" && (
              <div className="space-y-6 max-w-3xl leading-relaxed">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Giới thiệu bài học</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <strong className="text-blue-700 dark:text-sky-400">&ldquo;{activeLesson?.title}&rdquo;</strong>
                    {activeLesson?.description
                      ? ` — ${activeLesson.description}`
                      : " chưa có mô tả chi tiết. Hãy mở link học và hoàn thành bài theo lộ trình."}
                  </p>
                </div>

                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                    <span className="text-blue-600 dark:text-sky-400">🎯</span>
                    <span>Thông tin bài học:</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {activeLesson?.learning_url
                      ? "Link học đã được cấp cho tài khoản đã đăng ký khóa học."
                      : "Giảng viên chưa gắn link học cho bài này."}
                  </p>
                </div>
              </div>
            )}

            {/* NOTES TAB */}
            {activeTab === "notes" && (
              <div className="space-y-6 max-w-3xl">
                {/* Note creation input form */}
                <form onSubmit={handleAddNote} className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Thêm ghi chú học tập cho bài này</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Ghi chú kiến thức hoặc câu hỏi cần xem lại..."
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400 dark:focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !noteText.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-5 rounded-xl transition text-sm flex-shrink-0"
                    >
                      {submittingNote ? "Đang lưu..." : "Lưu Ghi Chú"}
                    </button>
                  </div>
                </form>

                {notes.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Bạn chưa tạo ghi chú nào cho bài học này.</p>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 text-xs font-bold border border-blue-100 dark:border-blue-900/40">
                            📝 Ghi chú bài học
                          </span>
                          <p className="text-sm text-slate-700 dark:text-slate-200">{note.content}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition text-xs flex-shrink-0"
                          title="Xóa ghi chú"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Q&A / COMMENTS TAB */}
            {activeTab === "qa" && (
              <div className="space-y-6 max-w-3xl">
                {/* Main comment form */}
                <form onSubmit={(e) => handleAddComment(e)} className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Đặt câu hỏi thảo luận với giảng viên & học viên..."
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400 dark:focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !commentText.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-6 rounded-xl transition text-sm flex-shrink-0"
                    >
                      Gửi
                    </button>
                  </div>
                </form>

                {parentComments.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Chưa có bình luận nào. Hãy đặt câu hỏi đầu tiên!</p>
                ) : (
                  <div className="space-y-5">
                    {parentComments.map((comment) => {
                      const username = comment.username || comment.user?.username || "Học viên CSCA";
                      const avatar = comment.avatar_url || comment.profile_pic || comment.user?.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80";
                      const role = comment.role || comment.user?.role;
                      const commentReplies = comment.replies || comments.filter((c) => String(c.parent_id) === String(comment.id));

                      return (
                        <div key={comment.id} className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-5 last:border-0">
                          <div className="flex gap-3.5 items-start">
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200 dark:border-slate-700">
                              <img src={avatar} alt={username} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900 dark:text-white">{username}</span>
                                {role === "admin" && (
                                  <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-100 dark:border-blue-900/40">
                                    Giảng viên
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                  {comment.created_at ? new Date(comment.created_at).toLocaleDateString("vi-VN") : "Hôm nay"}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-light">{comment.content}</p>
                              <div className="flex items-center gap-4 text-xs pt-1">
                                <button
                                  onClick={() => setReplyToId(replyToId === comment.id ? null : comment.id)}
                                  className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-sky-400 font-semibold transition text-[11px]"
                                >
                                  {replyToId === comment.id ? "Đóng trả lời" : "Trả lời"}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Nested Replies */}
                          {commentReplies.length > 0 && (
                            <div className="pl-12 space-y-3">
                              {commentReplies.map((reply) => {
                                const replyUsername = reply.username || reply.user?.username || "Trợ giảng CSCA";
                                const replyAvatar = reply.avatar_url || reply.profile_pic || reply.user?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
                                const replyRole = reply.role || reply.user?.role;

                                return (
                                  <div key={reply.id} className="flex gap-3 items-start bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 border border-slate-200 dark:border-slate-700">
                                      <img src={replyAvatar} alt={replyUsername} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">{replyUsername}</span>
                                        {replyRole === "admin" && (
                                          <span className="text-[8px] uppercase font-bold px-1 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-100 dark:border-blue-900/40">
                                            Giảng viên
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-light">{reply.content}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Inline Reply Form */}
                          {replyToId === comment.id && (
                            <form onSubmit={(e) => handleAddComment(e, comment.id)} className="pl-12 flex gap-2">
                              <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder={`Trả lời ${username}...`}
                                className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-400 dark:focus:border-sky-500"
                              />
                              <button
                                type="submit"
                                disabled={submittingComment || !replyText.trim()}
                                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-bold px-4 rounded-xl transition text-xs flex-shrink-0"
                              >
                                Gửi
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* RESOURCES TAB */}
            {activeTab === "resources" && (
              <div className="space-y-4 max-w-3xl">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Tài liệu học tập đi kèm bài giảng</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                  Bài học này chưa có tài liệu đính kèm.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Curriculum Sidebar (Desktop - hidden on mobile) */}
      <div className="hidden lg:flex w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex-col h-full">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">Nội Dung Khóa Học</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đã hoàn thành {completedLessonsCount} / {totalLessonsCount} bài giảng
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <CurriculumList />
        </div>
      </div>

      {/* Mobile Drawer Trigger Floating Button */}
      <button
        onClick={() => setShowMobileSidebar(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white font-bold p-4 rounded-full shadow-2xl flex items-center justify-center border border-blue-500/30"
        title="Xem danh sách bài học"
      >
        📚
      </button>

      {/* Mobile Drawer Bottom Sheet Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowMobileSidebar(false)}></div>
          <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl max-h-[75vh] w-full flex flex-col z-10 overflow-hidden shadow-2xl">
            <div className="border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-5 py-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Nội Dung Khóa Học</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Đã hoàn thành {completedLessonsCount} / {totalLessonsCount} bài học
                </p>
              </div>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-lg p-2"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <CurriculumList />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
