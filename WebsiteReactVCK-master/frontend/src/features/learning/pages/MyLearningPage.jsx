import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchMyEnrolledCourses } from "../../api/lmsClient";
import {
  BookOpen,
  Award,
  CheckCircle2,
  Clock,
  Search,
  Play,
  Flame,
  Zap,
  CalendarDays,
  Sparkles,
  BookMarked
} from "lucide-react";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";

// MOCK_UI_ONLY: Dữ liệu mẫu minh họa Gamification & Buổi học Live sắp tới khi backend chưa nối đủ
const MOCK_UI_ONLY = {
  gamification: {
    totalXp: 1450,
    streakDays: 7,
    studyHours: 28.5,
  },
  upcomingLive: {
    title: "Luyện Đề HSK 4 — Chữa Kỹ Kỹ Năng Đọc & Nghe",
    startTime: "19:30 Tối Nay",
    teacher: "Cô Vương Lệ Mai",
    countdownMinutes: 45,
    meetUrl: "https://meet.google.com/csca-live-demo",
  }
};

export default function MyLearningPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadMyCourses();
  }, []);

  const loadMyCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyEnrolledCourses();
      if (res && res.success) {
        setCourses(res.data || []);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error("Error loading enrolled courses:", err);
      setError("Không thể tải danh sách khóa học. Vui lòng kiểm tra kết nối mạng và thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBadgeColor = (category) => {
    switch (category) {
      case "HSK":
        return "bg-red-500/15 text-red-400 border-red-500/25";
      case "HSKK":
        return "bg-amber-500/15 text-amber-400 border-amber-500/25";
      case "CSCA":
        return "bg-indigo-500/15 text-indigo-400 border-indigo-500/25";
      default:
        return "bg-blue-500/15 text-blue-400 border-blue-500/25";
    }
  };

  // Filter & Search
  const filteredCourses = courses.filter((course) => {
    const matchesCategory = selectedCategory === "ALL" || course.category === selectedCategory;
    const matchesSearch =
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (course.description && course.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Stats
  const totalEnrolled = courses.length;
  const inProgressCourses = courses.filter((c) => c.progress_percent > 0 && c.progress_percent < 100);
  const inProgressCount = inProgressCourses.length;
  const completedCount = courses.filter((c) => c.progress_percent === 100).length;

  // Bài học đang học gần đây nhất để làm Hero "Tiếp tục học"
  const recentCourse = inProgressCourses.length > 0 ? inProgressCourses[0] : (courses.length > 0 ? courses[0] : null);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Compact Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1.5">
              <Sparkles className="w-3 h-3" />
              <span>Bảng Điều Khiển Học Viên CSCA</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Tổng Quan Học Tập
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5 max-w-xl">
              Theo dõi tiến độ, làm bài tập và tiếp tục chinh phục các bài giảng HSK, HSKK & CSCA.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/lms/catalog"
              className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-slate-200 border border-white/10 hover:bg-white/10 hover:text-white transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-rose-400" /> Khám Phá Khóa Học
            </Link>
          </div>
        </div>

        {/* Gamification & Progress Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-slate-400 font-semibold block uppercase tracking-wider">
                Đã đăng ký
              </span>
              <span className="text-xl sm:text-2xl font-black text-white mt-0.5 block font-mono">
                {totalEnrolled}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-slate-400 font-semibold block uppercase tracking-wider">
                Đang học
              </span>
              <span className="text-xl sm:text-2xl font-black text-white mt-0.5 block font-mono">
                {inProgressCount}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-slate-400 font-semibold block uppercase tracking-wider">
                Đã hoàn thành
              </span>
              <span className="text-xl sm:text-2xl font-black text-white mt-0.5 block font-mono">
                {completedCount}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-4 bg-gradient-to-br from-rose-500/5 to-transparent">
            <div className="p-3 bg-rose-500/15 rounded-xl text-rose-400 shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-rose-300 font-semibold block uppercase tracking-wider">
                Streak học tập
              </span>
              <span className="text-xl sm:text-2xl font-black text-white mt-0.5 block font-mono">
                {MOCK_UI_ONLY.gamification.streakDays} ngày 🔥
              </span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-900/70 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4 bg-gradient-to-br from-amber-500/5 to-transparent">
            <div className="p-3 bg-amber-500/15 rounded-xl text-amber-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs text-amber-300 font-semibold block uppercase tracking-wider">
                Điểm tích lũy XP
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5 block font-mono">
                {MOCK_UI_ONLY.gamification.totalXp} XP
              </span>
            </div>
          </div>
        </div>

        {/* Hero Section: Tiếp Tục Học Nhanh & Lịch Live Sắp Tới */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Continue Learning Banner */}
          {recentCourse && (
            <div className="lg:col-span-2 rounded-3xl border border-rose-500/25 bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 p-6 sm:p-8 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <BookMarked className="w-3.5 h-3.5" /> Tiếp Tục Bài Học Gần Nhất
                  </span>
                  <span className="text-xs font-bold text-rose-400 font-mono">
                    Tiến độ: {recentCourse.progress_percent}%
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight mt-2">
                  {recentCourse.title}
                </h2>
                {recentCourse.last_lesson && (
                  <p className="text-slate-300 text-sm mt-2 flex items-center gap-2">
                    <span className="text-slate-400">Bài đang học:</span>
                    <span className="font-semibold text-rose-200">{recentCourse.last_lesson.title}</span>
                  </p>
                )}

                {/* Progress bar */}
                <div className="mt-5 w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-600 to-amber-400 transition-all duration-500"
                    style={{ width: `${recentCourse.progress_percent}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  {recentCourse.completed_lessons || 0} / {recentCourse.total_lessons || 0} bài hoàn thành
                </span>
                <Link
                  to={`/lms/courses/${recentCourse.course_id}/workspace`}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/30 transition active:scale-[0.98]"
                >
                  <Play className="w-4 h-4 fill-current" /> Vào Phòng Học Ngay
                </Link>
              </div>
            </div>
          )}

          {/* Upcoming Live Notice */}
          <div className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 p-6 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <CalendarDays className="w-3.5 h-3.5" /> Lớp Live Sắp Tới
                </span>
                <span className="text-xs font-bold text-amber-400 font-mono animate-pulse">
                  Trong {MOCK_UI_ONLY.upcomingLive.countdownMinutes}p
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-black text-white leading-snug">
                {MOCK_UI_ONLY.upcomingLive.title}
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Giảng viên: <span className="text-slate-200 font-bold">{MOCK_UI_ONLY.upcomingLive.teacher}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Thời gian: <span className="text-amber-300 font-mono font-bold">{MOCK_UI_ONLY.upcomingLive.startTime}</span>
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              <Link
                to="/lms/live-schedule"
                className="text-xs font-bold text-slate-400 hover:text-white transition"
              >
                Xem lịch tuần →
              </Link>
              <a
                href={MOCK_UI_ONLY.upcomingLive.meetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 shadow-md shadow-amber-400/20 transition active:scale-[0.98]"
              >
                🔴 Vào Lớp Meet
              </a>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-4 border-t border-white/10">
          {/* Category Tabs */}
          <div className="inline-flex p-1 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-x-auto max-w-full">
            <div className="flex items-center gap-1">
              {[
                { id: "ALL", label: "Tất Cả Khóa Học" },
                { id: "HSK", label: "HSK Tiếng Trung" },
                { id: "HSKK", label: "HSKK Khẩu Ngữ" },
                { id: "CSCA", label: "CSCA Tự Nhiên/Xã Hội" },
              ].map((tab) => {
                const active = selectedCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedCategory(tab.id)}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 select-none whitespace-nowrap ${
                      active
                        ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_4px_16px_-2px_rgba(244,63,94,0.45),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Tìm kiếm khóa học..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/15 text-slate-100 placeholder-slate-500 pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 text-xs font-medium transition"
            />
          </div>
        </div>

        {/* Course Grid & States */}
        {loading ? (
          <LoadingState type="cards" count={3} message="Đang tải danh sách khóa học của bạn..." />
        ) : error ? (
          <ErrorState
            title="Không thể tải khóa học"
            message={error}
            onRetry={loadMyCourses}
          />
        ) : filteredCourses.length === 0 ? (
          courses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Bạn chưa đăng ký khóa học nào"
              description="Khám phá ngay các khóa học HSK 1-6, HSKK và các môn thi CSCA để chuẩn bị sẵn sàng cho hành trình du học Trung Quốc."
              actionLabel="Khám Phá Danh Mục Khóa Học"
              actionTo="/lms/catalog"
            />
          ) : (
            <EmptyState
              icon={Search}
              title="Không tìm thấy khóa học phù hợp"
              description="Thử đổi từ khóa tìm kiếm hoặc chọn lại danh mục để xem các khóa học khác."
              actionLabel="Đặt lại bộ lọc"
              onAction={() => {
                setSelectedCategory("ALL");
                setSearchTerm("");
              }}
            />
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const isCompleted = course.progress_percent === 100;
              return (
                <div
                  key={course.course_id}
                  className="group bg-slate-900/70 border border-white/10 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-white/20 transition-all duration-300 flex flex-col backdrop-blur-sm"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video overflow-hidden bg-slate-950">
                    <img
                      src={
                        course.thumbnail_url ||
                        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80"
                      }
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black border backdrop-blur-md uppercase tracking-wider ${getCategoryBadgeColor(
                          course.category
                        )}`}
                      >
                        {course.category}
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-950/80 text-slate-300 border border-white/10 capitalize">
                        {course.level === "beginner"
                          ? "Sơ cấp"
                          : course.level === "intermediate"
                          ? "Trung cấp"
                          : "Cao cấp"}
                      </span>
                    </div>
                    {isCompleted && (
                      <div className="absolute top-3 right-3">
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950 shadow-md">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn Thành
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-rose-400 transition-colors line-clamp-2 leading-snug">
                        {course.title}
                      </h3>
                      <p className="text-slate-400 text-xs line-clamp-2 mt-1.5 leading-relaxed">
                        {course.description}
                      </p>
                    </div>

                    {/* Progress Bar & Stats */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">
                          {course.completed_lessons || 0} / {course.total_lessons || 0} bài học
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            isCompleted ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {course.progress_percent || 0}%
                        </span>
                      </div>

                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCompleted ? "bg-emerald-500" : "bg-rose-600"
                          }`}
                          style={{ width: `${course.progress_percent || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-t border-white/10 space-y-2.5">
                      {course.enrolled_at && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          Đăng ký: {formatDate(course.enrolled_at)}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                      <Link
                        id={`resume-course-btn-${course.course_id}`}
                        to={`/lms/courses/${course.course_id}/workspace`}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                          isCompleted
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10"
                            : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20"
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {isCompleted ? "Xem Lại Khóa Học" : "Tiếp Tục Học"}
                      </Link>

                      {isCompleted && (
                        <Link
                          id={`cert-course-btn-${course.course_id}`}
                          to="/lms/certificates"
                          className="flex items-center justify-center p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 transition"
                          title="Xem Chứng Chỉ"
                        >
                          <Award className="w-4 h-4" />
                        </Link>
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
