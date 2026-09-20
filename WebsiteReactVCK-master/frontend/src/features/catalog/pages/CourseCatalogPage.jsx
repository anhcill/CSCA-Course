/* eslint-disable react/prop-types */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchCoursesCatalog } from "../../api/lmsClient";
import { 
  BookOpen, 
  Trophy, 
  Mic, 
  GraduationCap, 
  Search, 
  Clock, 
  Users, 
  CheckCircle2, 
  ArrowRight,
  Flame,
  Sparkles
} from "lucide-react";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";

const CATEGORIES = [
  { id: "ALL", label: "Tất Cả", icon: BookOpen },
  { id: "HSK", label: "HSK (1 - 6)", icon: Trophy },
  { id: "HSKK", label: "HSKK Khẩu Ngữ", icon: Mic },
  { id: "CSCA", label: "CSCA Đầu Vào", icon: GraduationCap },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Mới Nhất" },
  { value: "popular", label: "Phổ Biến Nhất" },
  { value: "rating", label: "Đánh Giá Cao" },
];

const StarRating = ({ rating = 0, count = 0 }) => {
  const stars = Math.round(rating * 2) / 2;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <span
            key={s}
            className={`text-xs ${s <= stars ? "text-amber-400" : s - 0.5 <= stars ? "text-amber-400" : "text-slate-600"}`}
          >
            ★
          </span>
        ))}
      </div>
      <span className="text-xs text-slate-400 font-medium">
        {rating > 0 ? rating.toFixed(1) : "--"} ({count})
      </span>
    </div>
  );
};

const CourseBadge = ({ type }) => {
  const badges = {
    hot: { text: "HOT", cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    new: { text: "MỚI", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    pro: { text: "CHUYÊN SÂU", cls: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
    featured: { text: "NỔI BẬT", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  };
  const b = badges[type];
  if (!b) return null;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${b.cls}`}>
      {b.text}
    </span>
  );
};

const getCategoryBadgeColor = (category) => {
  switch (category) {
    case "HSK": return "bg-red-500/15 text-red-400 border-red-500/25";
    case "HSKK": return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    case "CSCA": return "bg-indigo-500/15 text-indigo-400 border-indigo-500/25";
    default: return "bg-blue-500/15 text-blue-400 border-blue-500/25";
  }
};

const CourseCard = ({ course, featured = false }) => {
  const isFree = course.is_free || Number(course.price) === 0;
  const badgeFlags = [];
  if (course.is_hot) badgeFlags.push("hot");
  if (course.is_new) badgeFlags.push("new");
  if (course.is_featured && !featured) badgeFlags.push("featured");
  if (!isFree) badgeFlags.push("pro");

  return (
    <Link
      to={`/lms/courses/${course.slug}`}
      className={`group bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:border-rose-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col backdrop-blur-sm ${featured ? "md:flex-row md:col-span-2" : ""}`}
    >
      {/* Thumbnail */}
      <div className={`relative overflow-hidden bg-slate-950 ${featured ? "md:w-1/2 aspect-video md:aspect-auto" : "aspect-video"}`}>
        <img
          src={course.thumbnail_url || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80"}
          alt={course.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border backdrop-blur-md ${getCategoryBadgeColor(course.category)}`}>
            {course.category}
          </span>
          {badgeFlags.slice(0, 2).map((f) => (
            <CourseBadge key={f} type={f} />
          ))}
        </div>

        {/* Duration */}
        {course.total_duration_seconds > 0 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[10px] text-white font-mono flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            {Math.floor(course.total_duration_seconds / 3600)}h {Math.floor((course.total_duration_seconds % 3600) / 60)}m
          </div>
        )}
      </div>

      {/* Body */}
      <div className={`p-5 flex-1 flex flex-col justify-between ${featured ? "md:p-8" : ""}`}>
        <div>
          <h3 className={`font-bold text-white mb-2 group-hover:text-rose-400 transition-colors line-clamp-2 leading-snug ${featured ? "text-xl sm:text-2xl" : "text-base"}`}>
            {course.title}
          </h3>
          <p className={`text-slate-400 text-xs line-clamp-2 mb-4 leading-relaxed ${featured ? "line-clamp-3 text-sm" : ""}`}>
            {course.description}
          </p>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400 mb-4">
            {course.instructor_name && (
              <span className="flex items-center gap-1 text-slate-300 font-medium">
                {course.instructor_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              {course.total_lessons || 0} bài học
            </span>
            <span className="flex items-center gap-1 capitalize">
              {course.level === "beginner"
                ? "Sơ cấp"
                : course.level === "intermediate"
                ? "Trung cấp"
                : "Cao cấp"}
            </span>
            {course.enrolled_count > 0 && (
              <span className="flex items-center gap-1 font-mono text-emerald-400">
                <Users className="w-3.5 h-3.5" />
                {course.enrolled_count} học viên
              </span>
            )}
          </div>

          <StarRating rating={Number(course.ratings_avg) || 0} count={Number(course.ratings_count) || 0} />
        </div>

        {/* Footer */}
        <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between">
          <div>
            {isFree ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                Miễn Phí
              </span>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-base sm:text-lg font-black text-rose-400 font-mono">
                  {Number(course.price).toLocaleString("vi-VN")} ₫
                </span>
                {course.compare_at_price && Number(course.compare_at_price) > Number(course.price) && (
                  <span className="text-xs text-slate-500 line-through font-mono">
                    {Number(course.compare_at_price).toLocaleString("vi-VN")} ₫
                  </span>
                )}
              </div>
            )}
          </div>

          <span className="px-4 py-2 rounded-xl bg-rose-600 group-hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5">
            Xem Chi Tiết <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default function CourseCatalogPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedLevel, setSelectedLevel] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(12);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCoursesCatalog({
        category: selectedCategory,
        level: selectedLevel,
        search: searchTerm,
        sort: sortBy,
      });
      if (res && res.success) {
        setCourses(res.data || []);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error("Error loading courses:", err);
      setError("Không thể tải danh sách khóa học. Vui lòng kiểm tra kết nối mạng và thử lại.");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedLevel, searchTerm, sortBy]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadCatalog();
  };

  // Split courses into sections
  const { featuredCourses, proCourses, freeCourses } = useMemo(() => {
    const featured = courses.filter((c) => c.is_featured);
    const pro = courses.filter((c) => !c.is_free && Number(c.price) > 0 && !c.is_featured);
    const free = courses.filter((c) => c.is_free || Number(c.price) === 0);
    return { featuredCourses: featured, proCourses: pro, freeCourses: free };
  }, [courses]);

  const allVisible = courses.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 transition-colors">
      {/* Compact Catalog Header */}
      <div className="border-b border-white/[0.08] bg-slate-900/40 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-5">
        <div className="container mx-auto max-w-7xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Sparkles className="w-3 h-3" />
                LMS • Danh Mục Khóa Học
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Danh Mục Khóa Học Video HSK & CSCA
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 max-w-2xl">
              Giáo trình video bài bản HSK 1-6, HSKK khẩu ngữ và các môn thi CSCA săn học bổng du học Trung Quốc.
            </p>
          </div>

          {/* Search Form Compact */}
          <form onSubmit={handleSearchSubmit} className="flex items-center bg-slate-900/90 rounded-xl p-1 border border-white/10 shadow-lg w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 ml-2.5 mr-1.5 shrink-0" />
            <input
              id="catalog-search-input"
              type="text"
              placeholder="Tìm kiếm HSK, CSCA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent px-2 py-1.5 text-white placeholder-slate-500 focus:outline-none text-xs"
            />
            <button
              id="catalog-search-btn"
              type="submit"
              className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg font-semibold transition text-xs shadow-sm"
            >
              Tìm
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 max-w-7xl space-y-8">
        {/* Filters Row */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* Category Tabs - Linear Glass Segmented Pill */}
          <div className="inline-flex p-1 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-x-auto max-w-full">
            <div className="flex items-center gap-1">
              {CATEGORIES.map((tab) => {
                const Icon = tab.icon;
                const active = selectedCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`cat-tab-${tab.id.toLowerCase()}`}
                    onClick={() => { setSelectedCategory(tab.id); setVisibleCount(12); }}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 select-none whitespace-nowrap ${
                      active
                        ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_4px_16px_-2px_rgba(244,63,94,0.45),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort & Level Selectors */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-900 border border-white/10 text-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-rose-500 transition"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <select
              id="catalog-level-select"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="bg-slate-900 border border-white/10 text-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-rose-500 transition"
            >
              <option value="ALL">Tất cả trình độ</option>
              <option value="beginner">Sơ cấp</option>
              <option value="intermediate">Trung cấp</option>
              <option value="advanced">Cao cấp</option>
            </select>
          </div>
        </div>

        {/* Content States */}
        {loading ? (
          <LoadingState type="cards" count={6} message="Đang tải danh mục khóa học..." />
        ) : error ? (
          <ErrorState title="Lỗi tải danh mục" message={error} onRetry={loadCatalog} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Chưa Tìm Thấy Khóa Học Phù Hợp"
            description="Hãy thử đổi từ khóa tìm kiếm hoặc chọn lại danh mục để xem các khóa học khác."
            actionLabel="Đặt Lại Bộ Lọc"
            onAction={() => {
              setSelectedCategory("ALL");
              setSelectedLevel("ALL");
              setSearchTerm("");
            }}
          />
        ) : (
          <div className="space-y-12">
            {/* Featured Section */}
            {featuredCourses.length > 0 && selectedCategory === "ALL" && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg sm:text-xl font-bold text-white">Khóa Học Nổi Bật</h2>
                  <span className="px-2 py-0.5 bg-amber-500/15 text-amber-300 text-xs font-bold rounded-full border border-amber-500/25">
                    {featuredCourses.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {featuredCourses.slice(0, 2).map((c) => (
                    <CourseCard key={c.id} course={c} featured />
                  ))}
                </div>
              </section>
            )}

            {/* Pro Courses Section */}
            {proCourses.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg sm:text-xl font-bold text-white">Khóa Học Chuyên Sâu</h2>
                  <span className="px-2 py-0.5 bg-violet-500/15 text-violet-300 text-xs font-bold rounded-full border border-violet-500/25">
                    {proCourses.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {proCourses.map((c) => <CourseCard key={c.id} course={c} />)}
                </div>
              </section>
            )}

            {/* Free Courses Section */}
            {freeCourses.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg sm:text-xl font-bold text-white">Khóa Học Miễn Phí</h2>
                  <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 text-xs font-bold rounded-full border border-emerald-500/25">
                    {freeCourses.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {freeCourses.map((c) => <CourseCard key={c.id} course={c} />)}
                </div>
              </section>
            )}

            {/* Filtered Courses List (When non-ALL category is active) */}
            {selectedCategory !== "ALL" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {allVisible.map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
            )}

            {/* Load More Button */}
            {selectedCategory !== "ALL" && visibleCount < courses.length && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setVisibleCount((v) => v + 12)}
                  className="px-6 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition shadow-sm"
                >
                  Xem Thêm ({courses.length - visibleCount} khóa học)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
