import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchCourseDetail,
  checkEnrollmentStatus,
  enrollInCourse,
  fetchCoursesCatalog,
  fetchVideoPlaybackUrl,
  fetchCourseRatings,
} from "../../api/lmsClient";
import { LoadingState, ErrorState } from "../../../components/common/StateView";

export default function CourseDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [courseData, setCourseData] = useState(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [relatedCourses, setRelatedCourses] = useState([]);
  const [previewVideoModal, setPreviewVideoModal] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [ratingsData, setRatingsData] = useState({ summary: { avgScore: 0, count: 0, distribution: {} }, ratings: [] });

  const loadCourseDetails = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetchCourseDetail(slug);
      if (res.success && res.data) {
        setCourseData(res.data);
        if (res.data.sections && res.data.sections.length > 0) {
          setActiveSection(res.data.sections[0].id);
        }

        // Check enrollment status if logged in
        if (res.data.course?.id) {
          try {
            const enrollRes = await checkEnrollmentStatus(res.data.course.id);
            if (enrollRes.success && enrollRes.data?.isEnrolled) {
              setIsEnrolled(true);
            }
          } catch {
            // Guest or not enrolled
          }
          try {
            const ratingsRes = await fetchCourseRatings(res.data.course.id);
            if (ratingsRes.success && ratingsRes.data) setRatingsData(ratingsRes.data);
          } catch (ratingsErr) {
            console.error("Error loading course ratings:", ratingsErr);
          }
        }

        // Fetch related courses in same category
        try {
          const catalogRes = await fetchCoursesCatalog();
          if (catalogRes.success && catalogRes.data) {
            const filtered = catalogRes.data.filter(
              (c) => String(c.id) !== String(res.data.course.id) && c.category === res.data.course.category
            );
            if (filtered.length === 0) {
              const anyOther = catalogRes.data.filter((c) => String(c.id) !== String(res.data.course.id));
              setRelatedCourses(anyOther.slice(0, 3));
            } else {
              setRelatedCourses(filtered.slice(0, 3));
            }
          }
        } catch (catErr) {
          console.error("Error loading related courses:", catErr);
        }
      } else {
        setErrorMessage(res.message || "Không tìm thấy khóa học yêu cầu.");
      }
    } catch (err) {
      console.error("Error loading course details:", err);
      setErrorMessage(err.message || "Lỗi kết nối máy chủ. Vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadCourseDetails();
  }, [loadCourseDetails]);

  const handleEnroll = async () => {
    if (!courseData?.course?.id) return;
    setEnrolling(true);
    try {
      const res = await enrollInCourse(courseData.course.id);
      if (res.success) {
        setIsEnrolled(true);
        toast.success("Đăng ký khóa học thành công! Chúc bạn học tốt 🎉");
        navigate(`/lms/learn/${courseData.course.id}`);
      }
    } catch (err) {
      console.error("Error enrolling:", err);
      toast.error(err.message || "Có lỗi xảy ra khi đăng ký khóa học!");
    } finally {
      setEnrolling(false);
    }
  };

  const handlePreviewVideo = async (lesson) => {
    if (!lesson) return;
    if (!isEnrolled) {
      toast("Bạn cần đăng ký khóa học trước khi xem video học thử.");
      return;
    }

    setLoadingPreview(true);
    try {
      const res = await fetchVideoPlaybackUrl({ lessonId: lesson.id });
      if (!res.success || !res.data?.playbackUrl) throw new Error("Video học thử chưa sẵn sàng");
      setPreviewVideoModal({ ...lesson, playbackUrl: res.data.playbackUrl });
    } catch (err) {
      console.error("Error loading preview video:", err);
      toast.error(err.message || "Không thể tải video học thử.");
    } finally {
      setLoadingPreview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <LoadingState message="Đang tải thông tin chi tiết khóa học..." count={2} />
        </div>
      </div>
    );
  }

  if (errorMessage || !courseData || !courseData.course) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Khóa Học Không Tồn Tại"
            message={errorMessage || "Khóa học bạn đang tìm kiếm có thể đã bị thay đổi địa chỉ hoặc tạm ẩn khỏi hệ thống."}
            onRetry={loadCourseDetails}
            secondaryAction={
              <Link
                to="/lms/catalog"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition"
              >
                ← Quay Về Catalog
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const { course, sections = [], lessons = [] } = courseData;

  // Calculate total course duration
  const totalSeconds = lessons.reduce((acc, l) => acc + (l.duration_seconds || 0), 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);
  const formattedDuration = totalHours > 0 ? `${totalHours} giờ ${totalMins} phút` : `${totalMins} phút`;

  // Learning outcomes
  const outcomes =
    course.category === "CSCA"
      ? [
          "Nắm trọn vẹn toàn bộ thuật ngữ chuyên ngành Toán/Lý/Hóa bằng tiếng Trung",
          "Thành thạo phương pháp làm bài trắc nghiệm và tự luận đạt điểm tối đa",
          "Luyện tập chi tiết các đề thi CSCA thực tế qua các năm học gần đây",
          "Cung cấp kỹ năng phỏng vấn học bổng trực tiếp với Ban tuyển sinh Trung Quốc",
        ]
      : [
          `Làm chủ hoàn toàn các từ vựng cốt lõi theo tiêu chuẩn của bài thi ${course.category}`,
          "Phát triển toàn diện 4 kỹ năng Nghe - Đọc - Viết và Phản xạ Nói tự nhiên",
          "Nắm vững các bẫy ngữ pháp thường gặp và mẹo tối ưu điểm số khi thi thật",
          "Sở hữu lộ trình luyện đề thi thử bài bản và sửa lỗi chi tiết cùng giảng viên",
        ];

  const prerequisites =
    course.level === "beginner"
      ? [
          "Không yêu cầu kiến thức nền tảng hay chứng chỉ tiếng Trung trước đó.",
          "Chuẩn bị máy tính hoặc điện thoại có kết nối Internet để tham gia học.",
          "Tinh thần quyết tâm, tự giác và kiên trì rèn luyện hàng ngày.",
        ]
      : [
          `Đã hoàn thành cấp độ ${course.category === "CSCA" ? "tiếng Trung cơ bản" : "dưới"} hoặc có trình độ tương đương.`,
          "Có khả năng tự học tốt và hoàn thành đầy đủ bài tập được giao.",
          "Sử dụng tai nghe và mic hoạt động ổn định cho các bài học nói/HSKK.",
        ];

  // Level display helper
  const levelBadge = {
    beginner: { text: "Sơ Cấp", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    intermediate: { text: "Trung Cấp", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    advanced: { text: "Cao Cấp", bg: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  }[course.level] || { text: course.level || "Cơ Bản", bg: "bg-slate-800 text-slate-300 border-slate-700" };

  // Category badge helper
  const categoryBadge = {
    CSCA: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    HSK: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    HSKK: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  }[course.category] || "bg-rose-500/20 text-rose-400 border-rose-500/30";

  // Reusable Sticky Enrollment Card
  const EnrollmentCard = () => (
    <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
      {/* Thumbnail / Video Preview */}
      <div className="relative h-48 rounded-2xl overflow-hidden bg-slate-950 group border border-slate-800/80">
        <img
          src={course.thumbnail_url || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80"}
          alt={course.title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
        />
        <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center">
          <button
            onClick={() => handlePreviewVideo(lessons.find((l) => l.is_preview))}
            disabled={loadingPreview}
            className="w-14 h-14 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-rose-600/40 transform group-hover:scale-110 transition duration-300"
            title="Xem video giới thiệu"
          >
            <span className="text-white text-xl pl-1">{loadingPreview ? "…" : "▶"}</span>
          </button>
        </div>
        <span className="absolute bottom-3 right-3 px-2.5 py-1 bg-slate-950/80 backdrop-blur rounded-lg text-xs font-semibold text-white border border-white/10">
          Xem giới thiệu
        </span>
      </div>

      {/* Pricing Section */}
      <div className="space-y-1">
        <span className="text-slate-400 text-xs font-medium block">Học phí trọn khóa</span>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black text-rose-500">
            {course.is_free || Number(course.price) === 0 ? "Miễn Phí" : `${Number(course.price).toLocaleString("vi-VN")} đ`}
          </span>
          {!course.is_free && Number(course.price) > 0 && (
            <>
              <span className="text-slate-500 text-sm line-through">
                {(Number(course.price) * 1.5).toLocaleString("vi-VN")} đ
              </span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                -33% Ưu đãi
              </span>
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {isEnrolled ? (
          <button
            onClick={() => navigate(`/lms/learn/${course.id}`)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-2xl transition duration-200 shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 text-base"
          >
            <span>Vào Học Ngay</span>
            <span>➔</span>
          </button>
        ) : (
          <>
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 rounded-2xl transition duration-200 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 text-base disabled:opacity-50"
            >
              {enrolling ? "Đang Xử Lý..." : course.is_free || Number(course.price) === 0 ? "Đăng Ký Học Ngay (Miễn Phí)" : `Mua Khóa Học • ${Number(course.price).toLocaleString("vi-VN")} đ`}
            </button>
            <a
              href="https://zalo.me/0987654321"
              target="_blank"
              rel="noreferrer"
              className="w-full border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-semibold py-3 rounded-2xl transition duration-200 flex items-center justify-center gap-2 text-sm bg-slate-950/40"
            >
              <span>💬 Nhận Tư Vấn Lộ Trình CSCA</span>
            </a>
          </>
        )}
      </div>

      {/* Course Inclusions Checklist */}
      <div className="pt-5 border-t border-slate-800 space-y-3.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Khóa học này bao gồm:</h4>
        <div className="grid grid-cols-1 gap-3 text-xs md:text-sm text-slate-300">
          <div className="flex items-center gap-3">
            <span className="text-rose-500">🎬</span>
            <span>{lessons.length} bài giảng video chất lượng cao</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-rose-500">📖</span>
            <span>{sections.length} chương nội dung bài bản chuẩn khung</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-rose-500">⏰</span>
            <span>Tổng thời lượng: {formattedDuration}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-rose-500">🛡️</span>
            <span>Truy cập trọn đời trên mọi thiết bị</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-rose-500">🎓</span>
            <span>Cấp chứng nhận hoàn thành khóa học</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Breadcrumb Navigation Bar */}
      <div className="bg-slate-900/80 border-b border-slate-800/80 text-xs py-3 px-4 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center gap-2 text-slate-400">
          <Link to="/lms/catalog" className="hover:text-white transition">LMS Catalog</Link>
          <span>/</span>
          <span className="uppercase text-slate-300">{course.category}</span>
          <span>/</span>
          <span className="text-slate-200 font-medium truncate">{course.title}</span>
        </div>
      </div>

      {/* Hero Banner Section */}
      <div className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-b border-slate-800 py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          {/* Left Hero Details (Spans 2 columns on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${categoryBadge}`}>
                {course.category}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${levelBadge.bg}`}>
                Trình độ: {levelBadge.text}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Lộ Trình Du Học CSCA 2026
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
              {course.title}
            </h1>

            <p className="text-slate-300 text-base md:text-lg leading-relaxed font-light">
              {course.description}
            </p>

            {/* Instructor and Stats Row */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-300 pt-4 border-t border-slate-800/80">
              {/* Teacher Info */}
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-rose-500 bg-slate-800 flex-shrink-0">
                  <img
                    src={course.instructor_avatar_url || "/logo192.png"}
                    alt={course.instructor_name || "Giảng viên CSCA Academy"}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Giảng viên hướng dẫn</div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{course.instructor_name || "Đội ngũ CSCA Academy"}</span>
                    <span className="text-rose-400 text-xs" title="Giảng viên đã xác minh">✓</span>
                  </div>
                </div>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
                <span className="text-amber-400">★</span>
                <span className="text-white font-bold">{Number(ratingsData.summary.avgScore || course.ratings_avg || 0).toFixed(1)}</span>
                <span className="text-slate-400 text-xs">({ratingsData.summary.count || course.ratings_count || 0} đánh giá)</span>
              </div>

              {/* Student Enrolled Count */}
              <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                <span>👥</span>
                <span className="text-white font-bold">{Number(course.enrolled_count || 0).toLocaleString("vi-VN")}</span>
                <span className="text-slate-400">học viên</span>
              </div>
            </div>
          </div>

          {/* Desktop Right Column: Sticky Card Placeholder */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-20">
              <EnrollmentCard />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Content Area (Spans 2 columns on desktop) */}
        <div className="lg:col-span-2 space-y-12">
          {/* Mobile Enrollment Card */}
          <div className="block lg:hidden">
            <EnrollmentCard />
          </div>

          {/* What you will learn Section */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-rose-500/10 text-rose-400 rounded-xl text-lg">🎯</span>
              <h3 className="text-xl font-bold text-white">Bạn Sẽ Đạt Được Gì Sau Khóa Học?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {outcomes.map((outcome, idx) => (
                <div key={idx} className="flex gap-3 items-start bg-slate-950/40 p-4 rounded-2xl border border-slate-800/60">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <p className="text-sm text-slate-300 leading-relaxed">{outcome}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Prerequisites Section */}
          <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl text-lg">📋</span>
              <h3 className="text-xl font-bold text-white">Yêu Cầu Đầu Vào</h3>
            </div>
            <ul className="space-y-3 list-disc pl-6 text-sm text-slate-300">
              {prerequisites.map((reqText, idx) => (
                <li key={idx} className="leading-relaxed">{reqText}</li>
              ))}
            </ul>
          </section>

          {/* Curriculum Accordion Section */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-rose-500/10 text-rose-400 rounded-xl text-lg">📚</span>
                <h3 className="text-xl font-bold text-white">Nội Dung Khóa Học</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Tổng: <strong className="text-white">{sections.length}</strong> chương • <strong className="text-white">{lessons.length}</strong> bài giảng
              </span>
            </div>

            {sections.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                Khóa học đang được ban chuyên môn hoàn thiện các chương bài giảng.
              </div>
            ) : (
              <div className="space-y-3">
                {sections.map((section, idx) => {
                  const sectionLessons = lessons.filter((l) => String(l.section_id) === String(section.id));
                  const isOpen = activeSection === section.id;
                  const sectionSeconds = sectionLessons.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
                  const sectionMins = Math.floor(sectionSeconds / 60);

                  return (
                    <div
                      key={section.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition duration-150 hover:border-slate-700"
                    >
                      <button
                        onClick={() => setActiveSection(isOpen ? null : section.id)}
                        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition"
                      >
                        <div className="flex items-center gap-3 pr-4">
                          <span className="text-xs font-mono text-rose-400 font-bold">
                            Chương {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-200">{section.title}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400 flex-shrink-0">
                          <span>{sectionLessons.length} bài ({sectionMins}p)</span>
                          <span className="text-[10px] text-slate-500">{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-6 pb-4 pt-1 border-t border-slate-800/60 divide-y divide-slate-800/40">
                          {sectionLessons.length === 0 ? (
                            <p className="text-xs text-slate-500 py-3">Bài học đang được cập nhật...</p>
                          ) : (
                            sectionLessons.map((lesson) => (
                              <div
                                key={lesson.id}
                                className="py-3 flex items-center justify-between text-sm transition hover:text-white"
                              >
                                <div className="flex items-center gap-3 truncate">
                                  <span className="text-rose-500 text-xs flex-shrink-0">▶</span>
                                  <span className="text-slate-300 font-medium truncate">{lesson.title}</span>
                                  {lesson.is_preview && (
                                    <button
                                      onClick={() => handlePreviewVideo(lesson)}
                                      className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition flex-shrink-0"
                                    >
                                      Học thử
                                    </button>
                                  )}
                                </div>
                                <span className="text-slate-500 text-xs font-mono pl-4 flex-shrink-0">
                                  {Math.floor(lesson.duration_seconds / 60)} phút
                                </span>
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
          </section>

          {/* Instructor Bio Section */}
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-rose-500/10 text-rose-400 rounded-xl text-lg">👨‍🏫</span>
              <h3 className="text-xl font-bold text-white">Giảng Viên Hướng Dẫn</h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-rose-500 flex-shrink-0 bg-slate-800">
                <img
                  src={course.instructor_avatar_url || "/logo192.png"}
                  alt={course.instructor_name || "Giảng viên CSCA Academy"}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-2.5">
                <h4 className="text-lg font-bold text-white">{course.instructor_name || "Đội ngũ CSCA Academy"}</h4>
                <p className="text-xs text-rose-400 font-semibold uppercase tracking-wider">
                  Giảng viên phụ trách khóa học
                </p>
                <p className="text-sm text-slate-300 leading-relaxed font-light">
                  Thông tin chuyên môn và nội dung giảng dạy được cập nhật theo hồ sơ giảng viên phụ trách khóa học.
                </p>
              </div>
            </div>
          </section>

          {/* Reviews Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl text-lg">⭐</span>
              <h3 className="text-xl font-bold text-white">Đánh Giá Từ Học Viên</h3>
            </div>

            {/* Rating Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center md:text-left items-center">
              <div className="space-y-1">
                <div className="text-5xl font-black text-white">{Number(ratingsData.summary.avgScore || course.ratings_avg || 0).toFixed(1)}</div>
                <div className="text-sm text-amber-400">★★★★★</div>
                <div className="text-xs text-slate-400">{ratingsData.summary.count || course.ratings_count || 0} đánh giá xếp hạng</div>
              </div>
              <div className="md:col-span-2 space-y-2 text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="w-10">5 sao</span>
                  <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full" style={{ width: `${((ratingsData.summary.distribution?.[5] || 0) / Math.max(ratingsData.summary.count || 0, 1)) * 100}%` }}></div>
                  </div>
                  <span className="w-8 text-right">{Math.round(((ratingsData.summary.distribution?.[5] || 0) / Math.max(ratingsData.summary.count || 0, 1)) * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-10">4 sao</span>
                  <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full" style={{ width: `${((ratingsData.summary.distribution?.[4] || 0) / Math.max(ratingsData.summary.count || 0, 1)) * 100}%` }}></div>
                  </div>
                  <span className="w-8 text-right">{Math.round(((ratingsData.summary.distribution?.[4] || 0) / Math.max(ratingsData.summary.count || 0, 1)) * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-10">3 sao</span>
                  <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full" style={{ width: `${((ratingsData.summary.distribution?.[3] || 0) / Math.max(ratingsData.summary.count || 0, 1)) * 100}%` }}></div>
                  </div>
                  <span className="w-8 text-right">{Math.round(((ratingsData.summary.distribution?.[3] || 0) / Math.max(ratingsData.summary.count || 0, 1)) * 100)}%</span>
                </div>
              </div>
            </div>

            {/* Testimonials List */}
            <div className="space-y-4">
              {ratingsData.ratings.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center">
                  Khóa học chưa có đánh giá nào.
                </p>
              ) : ratingsData.ratings.map((rev) => (
                <div key={rev.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800">
                        <img src={rev.avatar_url || "/logo192.png"} alt={rev.username || "Học viên"} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <h5 className="text-sm font-bold text-white">{rev.username || "Học viên CSCA"}</h5>
                        <div className="flex gap-1 text-[10px] text-amber-400">
                          {Array.from({ length: Number(rev.score) || 0 }).map((_, i) => (
                            <span key={i}>★</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">{rev.created_at ? new Date(rev.created_at).toLocaleDateString("vi-VN") : ""}</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed font-light pl-1">{rev.review || "Học viên chưa để lại nhận xét."}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Related Courses Section */}
          {relatedCourses.length > 0 && (
            <section className="space-y-6">
              <h3 className="text-xl font-bold text-white">Khóa Học Cùng Nhóm Đề Xuất</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedCourses.map((relCourse) => (
                  <div
                    key={relCourse.id}
                    onClick={() => navigate(`/lms/catalog/course/${relCourse.slug || relCourse.id}`)}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden cursor-pointer hover:border-slate-700 transition group flex flex-col h-full shadow-lg"
                  >
                    <div className="h-32 bg-slate-950 overflow-hidden relative">
                      <img
                        src={relCourse.thumbnail_url || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80"}
                        alt={relCourse.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                          {relCourse.category}
                        </span>
                        <h4 className="text-sm font-bold text-white mt-2 group-hover:text-rose-400 transition line-clamp-2">
                          {relCourse.title}
                        </h4>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                        <span className="text-slate-400 capitalize">Cấp độ: {relCourse.level}</span>
                        <span className="font-bold text-rose-500">
                          {relCourse.is_free || Number(relCourse.price) === 0
                            ? "Miễn Phí"
                            : `${Number(relCourse.price).toLocaleString("vi-VN")} đ`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Empty column for grid spacing on desktop */}
        <div className="hidden lg:block lg:col-span-1"></div>
      </div>

      {/* Video Preview Modal */}
      {previewVideoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  Học thử miễn phí
                </span>
                <h4 className="text-base font-bold text-white mt-1">{previewVideoModal.title}</h4>
              </div>
              <button
                onClick={() => setPreviewVideoModal(null)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              <video
                src={previewVideoModal.playbackUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setPreviewVideoModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
