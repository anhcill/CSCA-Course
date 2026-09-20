import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchClassroomDetail,
  fetchCourseProgress,
  sendProgressHeartbeat,
  fetchVideoPlaybackUrl,
  fetchLessonNotes,
  createLessonNote,
  deleteLessonNote,
  fetchLessonComments,
  postLessonComment,
} from "../../api/lmsClient";
import { LoadingState, ErrorState } from "../../../components/common/StateView";

export default function ClassroomPage() {
  const { courseId } = useParams();
  const videoRef = useRef(null);
  const videoRequestRef = useRef(0);

  const [courseData, setCourseData] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoErrorMessage, setVideoErrorMessage] = useState("");

  // Tabs state
  const [activeTab, setActiveTab] = useState("content");
  const [currentTime, setCurrentTime] = useState(0);

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

  const loadClassroomData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setCourseData(null);
    setActiveLesson(null);
    setProgressMap({});
    setPlaybackUrl("");
    setVideoError(false);
    try {
      const detailRes = await fetchClassroomDetail(courseId);
      if (detailRes.success && detailRes.data) {
        setCourseData(detailRes.data);

        // Load progress
        try {
          const progRes = await fetchCourseProgress(courseId);
          if (progRes.success && progRes.data?.progressList) {
            const map = {};
            progRes.data.progressList.forEach((p) => {
              map[p.lesson_id] = p;
            });
            setProgressMap(map);
          }
        } catch {
          setProgressMap({});
        }

        // Set initial active lesson
        if (detailRes.data.lessons && detailRes.data.lessons.length > 0) {
          setActiveLesson(detailRes.data.lessons[0]);
        }
      } else {
        setErrorMessage(detailRes.message || "Không thể tải dữ liệu khóa học.");
      }
    } catch (err) {
      console.error("Error loading classroom:", err);
      setErrorMessage(err.message || "Lỗi kết nối máy chủ khi nạp khóa học.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadClassroomData();
  }, [loadClassroomData]);

  const loadVideoSource = useCallback(async (lesson) => {
    const requestId = videoRequestRef.current + 1;
    videoRequestRef.current = requestId;
    setLoadingVideo(true);
    setVideoError(false);
    setVideoErrorMessage("");
    setPlaybackUrl("");
    try {
      if (!lesson?.has_video) {
        setVideoErrorMessage("Bài học này chưa được gắn video đã sẵn sàng.");
        setVideoError(true);
        return;
      }

      const playRes = await fetchVideoPlaybackUrl({ lessonId: lesson.id });
      if (!playRes.success || !playRes.data?.playbackUrl) throw new Error("Không nhận được link phát video bảo mật");
      if (videoRequestRef.current === requestId) setPlaybackUrl(playRes.data.playbackUrl);
    } catch (err) {
      console.error("Error loading video playback URL:", err);
      if (videoRequestRef.current === requestId) {
        setVideoErrorMessage(
          err.status === 403
            ? "Bạn không còn quyền xem video của bài học này. Vui lòng kiểm tra trạng thái đăng ký khóa học."
            : "Đường truyền video bảo mật chưa sẵn sàng hoặc đã hết hạn. Vui lòng thử tải lại.",
        );
        setVideoError(true);
        setPlaybackUrl("");
      }
    } finally {
      if (videoRequestRef.current === requestId) setLoadingVideo(false);
    }
  }, []);

  useEffect(() => {
    if (activeLesson) {
      loadVideoSource(activeLesson);
    }
  }, [activeLesson, loadVideoSource]);

  // Notes actions
  const loadNotes = useCallback(async () => {
    if (!activeLesson) return;
    try {
      const res = await fetchLessonNotes(activeLesson.id);
      if (res.success && res.data) {
        const sorted = [...res.data].sort((a, b) => (a.timestamp_s || 0) - (b.timestamp_s || 0));
        setNotes(sorted);
      }
    } catch (err) {
      console.error("Error loading notes:", err);
    }
  }, [activeLesson]);

  // Comments actions
  const loadComments = useCallback(async () => {
    if (!activeLesson) return;
    try {
      const res = await fetchLessonComments(activeLesson.id);
      if (res.success && res.data) {
        setComments(res.data);
      }
    } catch (err) {
      console.error("Error loading comments:", err);
    }
  }, [activeLesson]);

  // Lazy load notes or comments when active lesson or active tab changes
  useEffect(() => {
    if (!activeLesson) return;
    if (activeTab === "notes") {
      loadNotes();
    } else if (activeTab === "qa") {
      loadComments();
    }
  }, [activeLesson, activeTab, loadNotes, loadComments]);

  // Heartbeat timer for progress tracking (every 10s)
  useEffect(() => {
    if (!activeLesson || !videoRef.current) return;

    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused && !videoError) {
        const currentPos = videoRef.current.currentTime;
        const duration = videoRef.current.duration || 1;
        const isFinished = currentPos / duration > 0.9;

        sendProgressHeartbeat({
          lessonId: activeLesson.id,
          courseId,
          lastPositionSeconds: currentPos,
          isCompleted: isFinished,
        }).then((res) => {
          if (res.success && res.data) {
            setProgressMap((prev) => ({
              ...prev,
              [activeLesson.id]: res.data,
            }));
          }
        }).catch(() => {
          // Suppress heartbeat network error logs in UI
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeLesson, courseId, videoError]);


  const handleReloadVideo = () => {
    if (activeLesson) {
      toast("Đang làm mới link bảo mật video...");
      loadVideoSource(activeLesson);
    }
  };

  const handleLoadedMetadata = () => {
    setVideoError(false);
    if (activeLesson && progressMap[activeLesson.id]?.last_position_seconds && videoRef.current) {
      videoRef.current.currentTime = progressMap[activeLesson.id].last_position_seconds;
    }
  };

  const handleVideoEnded = () => {
    if (!activeLesson) return;
    sendProgressHeartbeat({
      lessonId: activeLesson.id,
      courseId,
      lastPositionSeconds: videoRef.current?.duration || 0,
      isCompleted: true,
    }).then((res) => {
      if (res.success && res.data) {
        setProgressMap((prev) => ({
          ...prev,
          [activeLesson.id]: res.data,
        }));
        toast.success("Tuyệt vời! Bạn đã hoàn thành bài học này 🎉");
      }
    });
  };

  const handleManualComplete = () => {
    if (!activeLesson) return;
    const isCurrentlyDone = progressMap[activeLesson.id]?.is_completed;
    sendProgressHeartbeat({
      lessonId: activeLesson.id,
      courseId,
      lastPositionSeconds: videoRef.current?.currentTime || 0,
      isCompleted: !isCurrentlyDone,
    }).then((res) => {
      if (res.success && res.data) {
        setProgressMap((prev) => ({
          ...prev,
          [activeLesson.id]: res.data,
        }));
        toast.success(
          !isCurrentlyDone
            ? "Đã đánh dấu hoàn thành bài học! 🎉"
            : "Đã đánh dấu chưa hoàn thành"
        );
      }
    });
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };



  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim() || !activeLesson) return;
    setSubmittingNote(true);
    try {
      const timestampSeconds = Math.floor(currentTime);
      const res = await createLessonNote({
        lessonId: activeLesson.id,
        content: noteText.trim(),
        timestampSeconds,
      });
      if (res.success) {
        setNoteText("");
        loadNotes();
        toast.success("Đã thêm ghi chú thành công!");
      }
    } catch (err) {
      console.error("Error adding note:", err);
      toast.error("Lỗi khi thêm ghi chú!");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const res = await deleteLessonNote(noteId);
      if (res.success) {
        setNotes((prev) => prev.filter((n) => String(n.id) !== String(noteId)));
        toast.success("Đã xóa ghi chú!");
      }
    } catch (err) {
      console.error("Error deleting note:", err);
      toast.error("Lỗi khi xóa ghi chú!");
    }
  };


  const handleAddComment = async (e, parentId = null) => {
    e.preventDefault();
    const content = parentId ? replyText : commentText;
    if (!content.trim() || !activeLesson) return;
    setSubmittingComment(true);
    try {
      const res = await postLessonComment({
        lessonId: activeLesson.id,
        content: content.trim(),
        parentId,
      });
      if (res.success) {
        if (parentId) {
          setReplyText("");
          setReplyToId(null);
        } else {
          setCommentText("");
        }
        loadComments();
        toast.success("Đã gửi bình luận!");
      }
    } catch (err) {
      console.error("Error posting comment:", err);
      toast.error("Lỗi khi gửi bình luận!");
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === null) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-950 text-white items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState message="Đang chuẩn bị không gian học tập bảo mật..." count={3} />
        </div>
      </div>
    );
  }

  if (errorMessage || !courseData || !courseData.course) {
    return (
      <div className="flex h-screen bg-slate-950 text-white items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Không Thể Mở Phòng Học"
            message={errorMessage || "Không tìm thấy thông tin khóa học hoặc bạn chưa đăng ký khóa học này."}
            onRetry={loadClassroomData}
            secondaryAction={
              <Link
                to={`/lms/courses/${courseId}/workspace`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition"
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

  // Reusable Curriculum List Component
  const CurriculumList = () => (
    <div className="space-y-6">
      {sections.map((section, idx) => {
        const sectionLessons = lessons.filter((l) => String(l.section_id) === String(section.id));
        const completedInSection = sectionLessons.filter((l) => progressMap[l.id]?.is_completed).length;
        const totalInSection = sectionLessons.length;

        return (
          <div key={section.id} className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate max-w-[70%]">
                Chương {idx + 1}: {section.title}
              </h4>
              <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                {completedInSection}/{totalInSection} bài
              </span>
            </div>

            <div className="space-y-1.5">
              {sectionLessons.map((lesson) => {
                const isCurrent = String(activeLesson?.id) === String(lesson.id);
                const isDone = progressMap[lesson.id]?.is_completed;
                const accessible = isLessonAccessible(lesson);

                return (
                  <button
                    key={lesson.id}
                    onClick={() => handleSelectLesson(lesson)}
                    className={`w-full p-3 rounded-xl text-left flex items-center justify-between transition text-sm ${
                      isCurrent
                        ? "bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30"
                        : accessible
                        ? "bg-slate-950/60 hover:bg-slate-800/80 text-slate-300"
                        : "bg-slate-950/40 text-slate-500 hover:bg-slate-900/60 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <span className="text-xs flex-shrink-0">
                        {isDone ? (
                          <span className="text-emerald-400 font-bold">✓</span>
                        ) : !accessible ? (
                          <span className="text-slate-500" title="Bài học bị khóa">🔒</span>
                        ) : isCurrent ? (
                          <span>▶</span>
                        ) : (
                          <span className="text-slate-500">○</span>
                        )}
                      </span>
                      <span className="truncate">{lesson.title}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                      {lesson.is_preview && (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Thử
                        </span>
                      )}
                      <span className="text-[10px] font-mono opacity-60">
                        {Math.floor(lesson.duration_seconds / 60)}p
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Left / Main Classroom Media Area */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto">
        {/* Course 100% Completion Celebration Banner */}
        {progressPercent === 100 && (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white px-6 py-2.5 text-center text-sm font-bold flex items-center justify-center gap-2 shadow-inner">
            <span>🏆 Chúc mừng bạn! Bạn đã hoàn thành 100% bài học xuất sắc!</span>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link
              to={`/lms/courses/${course?.slug || course?.id}`}
              className="text-slate-400 hover:text-white text-xs font-semibold transition flex items-center gap-1"
            >
              <span>←</span>
              <span>Chi Tiết Khóa</span>
            </Link>
            <div className="h-4 w-[1px] bg-slate-800 hidden sm:block"></div>
            <h1 className="text-base md:text-lg font-bold text-white truncate max-w-[220px] md:max-w-md">
              {course?.title || "Phòng Học Trực Tuyến"}
            </h1>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Tiến độ khóa học:</span>
            <div className="w-28 md:w-36 bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300 shadow-sm shadow-emerald-500/50"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="text-xs font-bold text-emerald-400 font-mono">{progressPercent}%</span>
            <span className="text-[11px] text-slate-500 hidden md:inline font-mono">
              ({completedLessonsCount}/{totalLessonsCount})
            </span>
          </div>
        </div>

        {/* Video Player Container */}
        <div className="bg-black flex items-center justify-center p-0 md:p-4 relative min-h-[300px] md:min-h-[480px]">
          {/* Loading Video Overlay */}
          {loadingVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 space-y-3 z-20">
              <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-slate-300">Đang nạp luồng video Cloudflare R2...</p>
            </div>
          )}

          {/* R2 Playback Error Fallback State */}
          {videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 space-y-4 z-20 p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-2xl">
                ⚠️
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-base font-bold text-white">Không Thể Phát Video Bài Học</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {videoErrorMessage || "Đường truyền video bảo mật Cloudflare R2 có thể đã hết hạn mã ký hoặc kết nối mạng bị gián đoạn."}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReloadVideo}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-lg shadow-rose-600/30 flex items-center gap-2"
                >
                  <span>🔄 Tải Lại Bài Học</span>
                </button>
                <a
                  href="https://zalo.me/0987654321"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Báo Lỗi Kỹ Thuật
                </a>
              </div>
            </div>
          )}

          {/* HTML5 Secure Video Element */}
          {playbackUrl && !videoError && (
            <video
              ref={videoRef}
              src={playbackUrl}
              controls
              autoPlay
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
              onError={() => {
                setPlaybackUrl("");
                setVideoErrorMessage("Không thể tải luồng video bảo mật. Vui lòng thử tải lại.");
                setVideoError(true);
              }}
              className="w-full max-w-5xl max-h-[70vh] rounded-none md:rounded-2xl shadow-2xl border border-slate-900 object-cover"
            />
          )}
        </div>

        {/* Lesson Information & Navigation Bar */}
        <div className="bg-slate-900 border-t border-slate-800 p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/25">
                R2 Secure Stream
              </span>
              {progressMap[activeLesson?.id]?.is_completed && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  ✓ Đã hoàn thành
                </span>
              )}
            </div>
            <h2 className="text-lg md:text-xl font-bold text-white">{activeLesson?.title}</h2>
            <p className="text-xs text-slate-400 font-mono">
              Thời lượng bài giảng: {Math.floor((activeLesson?.duration_seconds || 600) / 60)} phút
            </p>
          </div>

          {/* Quick Actions & Navigation Controls */}
          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap sm:flex-nowrap">
            {/* Mark completed button */}
            <button
              onClick={handleManualComplete}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                progressMap[activeLesson?.id]?.is_completed
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                  : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <span>{progressMap[activeLesson?.id]?.is_completed ? "✓ Đã Học Xong" : "○ Đánh Dấu Đã Học"}</span>
            </button>

            {/* Prev lesson button */}
            <button
              disabled={!prevLesson}
              onClick={() => prevLesson && handleSelectLesson(prevLesson)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition disabled:opacity-30 disabled:hover:bg-slate-800 text-left min-w-[110px]"
            >
              <span className="text-[9px] text-slate-400 uppercase font-bold block">← Bài Trước</span>
              <span className="truncate block max-w-[120px]">{prevLesson ? prevLesson.title : "Hết"}</span>
            </button>

            {/* Next lesson button */}
            <button
              disabled={!nextLesson}
              onClick={() => nextLesson && handleSelectLesson(nextLesson)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition disabled:opacity-30 disabled:hover:bg-rose-600 shadow-md shadow-rose-600/20 text-right min-w-[110px]"
            >
              <span className="text-[9px] text-rose-200 uppercase font-bold block">Bài Tiếp Theo →</span>
              <span className="truncate block max-w-[120px]">{nextLesson ? nextLesson.title : "Hết"}</span>
            </button>
          </div>
        </div>

        {/* Tab System below video */}
        <div className="bg-slate-900 border-t border-slate-800 flex-1 flex flex-col min-h-[420px]">
          {/* Vercel Underline Glow Tab Navigation */}
          <div className="flex border-b border-white/[0.08] bg-slate-950/40 backdrop-blur-md overflow-x-auto px-6 gap-6">
            <button
              onClick={() => setActiveTab("content")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "content" ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>📚 Tổng Quan</span>
              {activeTab === "content" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 shadow-[0_-2px_10px_rgba(244,63,94,0.8)] rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "notes" ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>📝 Ghi Chú Cá Nhân</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                activeTab === "notes"
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                  : "bg-slate-800 text-slate-400 border-white/[0.06]"
              }`}>
                {notes.length}
              </span>
              {activeTab === "notes" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 shadow-[0_-2px_10px_rgba(244,63,94,0.8)] rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("qa")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "qa" ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>💬 Hỏi Đáp & Thảo Luận</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
                activeTab === "qa"
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                  : "bg-slate-800 text-slate-400 border-white/[0.06]"
              }`}>
                {comments.length}
              </span>
              {activeTab === "qa" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 shadow-[0_-2px_10px_rgba(244,63,94,0.8)] rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("resources")}
              className={`group relative py-3.5 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 whitespace-nowrap ${
                activeTab === "resources" ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>📎 Tài Liệu Bài Giảng</span>
              {activeTab === "resources" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500 shadow-[0_-2px_10px_rgba(244,63,94,0.8)] rounded-full" />
              )}
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="p-6 flex-1 overflow-y-auto">
            {/* CONTENT OVERVIEW TAB */}
            {activeTab === "content" && (
              <div className="space-y-6 max-w-3xl leading-relaxed">
                <div>
                  <h3 className="text-base font-bold text-white mb-2">Giới thiệu bài học</h3>
                  <p className="text-sm text-slate-300">
                    <strong className="text-rose-400">&ldquo;{activeLesson?.title}&rdquo;</strong>
                    {activeLesson?.description
                      ? ` — ${activeLesson.description}`
                      : " chưa có mô tả chi tiết. Hãy theo dõi video và hoàn thành bài học theo lộ trình."}
                  </p>
                </div>

                <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                  <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    <span className="text-rose-400">🎯</span>
                    <span>Thông tin bài học:</span>
                  </h4>
                  <p className="text-xs text-slate-300">
                    {activeLesson?.has_video ? "Video đã được cấp quyền theo enrollment của bạn." : "Video chưa được gắn cho bài học này."}
                  </p>
                </div>
              </div>
            )}

            {/* NOTES TAB */}
            {activeTab === "notes" && (
              <div className="space-y-6 max-w-3xl">
                {/* Note creation input form */}
                <form onSubmit={handleAddNote} className="space-y-3 bg-slate-950/50 p-4 border border-slate-800 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Thêm ghi chú học tập</span>
                    <span>
                      Vị trí video: <strong className="text-rose-400 font-mono bg-rose-500/10 px-2 py-0.5 rounded">{formatTime(currentTime)}</strong>
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Ghi chú kiến thức hoặc câu hỏi cần xem lại..."
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !noteText.trim()}
                      className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-5 rounded-xl transition text-sm flex-shrink-0"
                    >
                      {submittingNote ? "Đang lưu..." : "Lưu Ghi Chú"}
                    </button>
                  </div>
                </form>

                {notes.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">Bạn chưa tạo ghi chú nào cho bài học này.</p>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <button
                            onClick={() => handleSeek(note.timestamp_s || 0)}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold font-mono hover:bg-rose-500/20 transition border border-rose-500/20"
                            title="Nhấp để phát video tại thời điểm này"
                          >
                            ⏱️ {formatTime(note.timestamp_s || 0)}
                          </button>
                          <p className="text-sm text-slate-200">{note.content}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition text-xs flex-shrink-0"
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
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !commentText.trim()}
                      className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold px-6 rounded-xl transition text-sm flex-shrink-0"
                    >
                      Gửi
                    </button>
                  </div>
                </form>

                {parentComments.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">Chưa có bình luận nào. Hãy đặt câu hỏi đầu tiên!</p>
                ) : (
                  <div className="space-y-5">
                    {parentComments.map((comment) => {
                      const username = comment.username || comment.user?.username || "Học viên CSCA";
                      const avatar = comment.avatar_url || comment.profile_pic || comment.user?.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80";
                      const role = comment.role || comment.user?.role;
                      const commentReplies = comment.replies || comments.filter((c) => String(c.parent_id) === String(comment.id));

                      return (
                        <div key={comment.id} className="space-y-3 border-b border-slate-800/60 pb-5 last:border-0">
                          <div className="flex gap-3.5 items-start">
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 flex-shrink-0 border border-slate-700">
                              <img src={avatar} alt={username} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">{username}</span>
                                {role === "admin" && (
                                  <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                    Giảng viên
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {comment.created_at ? new Date(comment.created_at).toLocaleDateString("vi-VN") : "Hôm nay"}
                                </span>
                              </div>
                              <p className="text-sm text-slate-300 leading-relaxed font-light">{comment.content}</p>
                              <div className="flex items-center gap-4 text-xs pt-1">
                                <button
                                  onClick={() => setReplyToId(replyToId === comment.id ? null : comment.id)}
                                  className="text-slate-400 hover:text-white font-semibold transition text-[11px]"
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
                                  <div key={reply.id} className="flex gap-3 items-start bg-slate-900/40 p-3 rounded-xl border border-slate-800/60">
                                    <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-800 flex-shrink-0 border border-slate-700">
                                      <img src={replyAvatar} alt={replyUsername} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white">{replyUsername}</span>
                                        {replyRole === "admin" && (
                                          <span className="text-[8px] uppercase font-bold px-1 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                            Giảng viên
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-300 leading-relaxed font-light">{reply.content}</p>
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
                                className="flex-1 bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                              />
                              <button
                                type="submit"
                                disabled={submittingComment || !replyText.trim()}
                                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold px-4 rounded-xl transition text-xs flex-shrink-0"
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
                <h3 className="text-base font-bold text-white mb-2">Tài liệu học tập đi kèm bài giảng</h3>
                <p className="text-sm text-slate-500 py-8 text-center">
                  Bài học này chưa có tài liệu đính kèm.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Curriculum Sidebar (Desktop - hidden on mobile) */}
      <div className="hidden lg:flex w-96 bg-slate-900 border-l border-slate-800 flex-col h-full">
        <div className="p-5 border-b border-slate-800">
          <h3 className="font-bold text-base text-white mb-1">Nội Dung Khóa Học</h3>
          <p className="text-xs text-slate-400">
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
        className="lg:hidden fixed bottom-6 right-6 z-40 bg-rose-600 hover:bg-rose-500 text-white font-bold p-4 rounded-full shadow-2xl flex items-center justify-center border border-rose-500/30"
        title="Xem danh sách bài học"
      >
        📚
      </button>

      {/* Mobile Drawer Bottom Sheet Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowMobileSidebar(false)}></div>
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[75vh] w-full flex flex-col z-10 overflow-hidden shadow-2xl">
            <div className="p-4.5 border-b border-slate-800 flex items-center justify-between px-5 py-4">
              <div>
                <h3 className="font-bold text-white text-base">Nội Dung Khóa Học</h3>
                <p className="text-xs text-slate-400">
                  Đã hoàn thành {completedLessonsCount} / {totalLessonsCount} bài học
                </p>
              </div>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="text-slate-400 hover:text-white font-bold text-lg p-2"
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
