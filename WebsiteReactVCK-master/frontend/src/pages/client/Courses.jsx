// --- START OF FILE Courses.jsx ---
import { useEffect, useState, useCallback, useMemo } from 'react';
import { HiOutlineStar, HiMiniStar, HiStar } from "react-icons/hi2";
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { GraduationCap, BookOpen, Sparkles, Trophy, ArrowRight } from 'lucide-react';
import useGetCourse from '../../hooks/useGetCourse';
import useGetProgress from '../../hooks/useGetProgress';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../../context/AuthContext';
import CourseRatingForm from '../../components/course/CourseRatingForm';
import Meta from '../../components/Meta.jsx';
import Loading from '../../components/Loading';

const CATEGORIES = [
  { id: 'ALL', label: 'Tất Cả Khóa Học', icon: BookOpen },
  { id: 'CSCA', label: 'Mục CSCA (Dự Bị & Đầu Vào)', icon: GraduationCap },
  { id: 'CHINESE', label: 'Mục Tiếng Trung (HSK & HSKK)', icon: Trophy },
];


const COURSES_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Trang chủ",
          "item": "https://www.molycourse.online/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Khóa học",
          "item": "https://www.molycourse.online/courses"
        }
      ]
    },
    {
      "@type": "ItemList",
      "name": "Danh sách khóa học Moly Course",
      "description": "Lộ trình ôn thi CSCA, chứng chỉ tiếng Trung HSK, HSKK chuẩn hóa",
      "itemListElement": [
        {
          "@type": "Course",
          "position": 1,
          "name": "Luyện Thi CSCA Dự Bị & Chuẩn Đầu Vào",
          "description": "Chuyên đề ôn luyện thi CSCA (Toán học & Khoa học), hệ thống ngân hàng đề thi thử bám sát đề thi thực tế.",
          "provider": {
            "@type": "Organization",
            "name": "Moly Course",
            "sameAs": "https://www.molycourse.online"
          }
        },
        {
          "@type": "Course",
          "position": 2,
          "name": "Tiếng Trung HSK 1–2 · Xây Nền Tảng",
          "description": "Phát âm Pinyin, chữ Hán và giao tiếp cơ bản dành cho người mới bắt đầu từ số 0.",
          "provider": {
            "@type": "Organization",
            "name": "Moly Course",
            "sameAs": "https://www.molycourse.online"
          }
        },
        {
          "@type": "Course",
          "position": 3,
          "name": "Tiếng Trung HSK 3–4 · Trung Cấp",
          "description": "Mở rộng từ vựng, ngữ pháp ứng dụng và phản xạ hội thoại theo tình huống thực tế.",
          "provider": {
            "@type": "Organization",
            "name": "Moly Course",
            "sameAs": "https://www.molycourse.online"
          }
        },
        {
          "@type": "Course",
          "position": 4,
          "name": "Luyện Thi Khẩu Ngữ HSKK Sơ - Trung - Cao Cấp",
          "description": "Khóa học luyện thi HSKK phát âm chuẩn, ngữ điệu tự nhiên và kỹ năng trả lời lưu loát.",
          "provider": {
            "@type": "Organization",
            "name": "Moly Course",
            "sameAs": "https://www.molycourse.online"
          }
        }
      ]
    }
  ]
};

const Courses = () => {
  const { t } = useTranslation();
  const { courses, loading, isDemo } = useGetCourse({ demoFallback: true });
  const { progress } = useGetProgress();
  const { isDarkMode } = useTheme();
  const { authUser } = useAuthContext();

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [ratingFormVisible, setRatingFormVisible] = useState(false);
  const [selectedCourseForRating, setSelectedCourseForRating] = useState(null);
  const [courseRatings, setCourseRatings] = useState({});

  const filterProgress = authUser ? progress?.filter((item) => {
    return item.userId === authUser?._id;
  }) : [];

  const openRatingForm = (course) => {
    const courseId = course._id || course.id;
    if (filterProgress?.find((item) => item.courseId === courseId)?.progressPercentage < 70 || filterProgress?.find((item) => item.courseId === courseId)?.progressPercentage === undefined) {
      return toast.error(t('needToCompleteCourse'));
    }
    setSelectedCourseForRating(course);
    setRatingFormVisible(true);
  };

  const closeRatingForm = () => {
    setRatingFormVisible(false);
    setSelectedCourseForRating(null);
  };

  const fetchCourseRating = useCallback(async (courseId) => {
    try {
      const response = await fetch(`/api/rating/course/${courseId}`);
      if (!response.ok) return;
      const data = await response.json();
      setCourseRatings(prevRatings => ({
        ...prevRatings,
        [courseId]: {
          averageRating: data.averageRating,
          totalRatings: data.totalRatings,
        },
      }));
    } catch (error) {
      console.error('Lỗi fetch đánh giá khóa học:', error);
    }
  }, []);

  useEffect(() => {
    if (courses && courses.length > 0) {
      courses.filter((course) => !course.isDemo).forEach(course => {
        fetchCourseRating(course._id || course.id);
      });
    }
  }, [courses, fetchCourseRating]);

  const handleRatingSubmit = useCallback(async () => {
    closeRatingForm();
    toast.success(t('ratingSubmitted'));
    if (selectedCourseForRating) {
      fetchCourseRating(selectedCourseForRating._id || selectedCourseForRating.id);
    }
  }, [fetchCourseRating, selectedCourseForRating, t]);

  // Phân loại khóa học thành các mục nhỏ: CSCA, Tiếng Trung (HSK/HSKK), Khác
  const { cscaCourses, chineseCourses, otherCourses } = useMemo(() => {
    const csca = [];
    const chinese = [];
    const other = [];

    (courses || []).forEach((c) => {
      const cat = (c.category || '').toUpperCase();
      const name = (c.nameCourse || c.title || c.name || '').toUpperCase();

      if (cat.includes('CSCA') || name.includes('CSCA')) {
        csca.push(c);
      } else if (cat.includes('HSK') || cat.includes('TIẾNG TRUNG') || name.includes('HSK') || name.includes('TIẾNG TRUNG') || name.includes('HÁN NGỮ')) {
        chinese.push(c);
      } else {
        other.push(c);
      }
    });

    return { cscaCourses: csca, chineseCourses: chinese, otherCourses: other };
  }, [courses]);

  // Render một thẻ khóa học đơn lẻ
  const renderCourseCard = (course) => {
    const courseId = course._id || course.id;
    const courseRatingData = courseRatings[courseId] || {};
    const averageRating = courseRatingData.averageRating || 0;
    const totalRatings = courseRatingData.totalRatings || 0;
    const name = course.nameCourse || course.title || course.name;
    const isCsca = (course.category || '').toUpperCase().includes('CSCA') || (name || '').toUpperCase().includes('CSCA');

    return (
      <div
        key={courseId}
        className={`group rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transform hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between border ${
          isDarkMode ? 'bg-gray-800/90 border-gray-700/80 hover:border-red-500/40' : 'bg-white border-gray-100 hover:border-red-300'
        }`}
      >
        <Link
          to={`/detail-course/${courseId}`}
          onClick={(event) => {
            if (!authUser && !course.isDemo) {
              event.preventDefault();
              toast.error(t('loginRequired') || 'Vui lòng đăng nhập để xem nội dung khóa học!');
            }
          }}
          className="block flex-1"
        >
          <div>
            <div className="relative pb-[56.25%] overflow-hidden bg-slate-900">
              <img
                src={course.imageCourse || course.thumbnail_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80'}
                alt={name}
                className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
              {/* Category Badge on image */}
              <div className="absolute top-3 left-3 flex gap-1.5">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-sm border ${
                  isCsca ? 'bg-indigo-600/80 text-white border-indigo-400/40' : 'bg-red-600/80 text-white border-red-400/40'
                }`}>
                  {isCsca ? 'Mục CSCA' : 'Mục Tiếng Trung'}
                </span>
                {course.isDemo && (
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/85 text-white border border-amber-300/40">
                    Xem trước
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-3">
              <h2 className={`font-bold text-base sm:text-lg line-clamp-2 leading-snug group-hover:text-red-500 transition-colors ${
                isDarkMode ? 'text-gray-100' : 'text-gray-900'
              }`}>
                {name}
              </h2>

              <p className={`text-xs font-semibold text-slate-500 dark:text-slate-400`}>
                {course.authorName || 'Moly Course'}
              </p>

              {course.description && (
                <p className={`line-clamp-2 min-h-[38px] text-xs leading-relaxed ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {course.description}
                </p>
              )}

              {(course.level || course.duration || course.lessonsCount) && (
                <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold pt-1">
                  {course.level && (
                    <span className="rounded-md bg-red-50 dark:bg-red-950/40 px-2.5 py-0.5 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/50">
                      {course.level}
                    </span>
                  )}
                  {course.duration && (
                    <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-900/50">
                      {course.duration}
                    </span>
                  )}
                  {course.lessonsCount && (
                    <span className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50">
                      {course.lessonsCount} bài học
                    </span>
                  )}
                </div>
              )}

              {authUser && (
                <div className="space-y-1.5 pt-2">
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-amber-500 transition-all duration-300"
                      style={{
                        width: `${filterProgress?.find((item) => item.courseId === courseId)?.progressPercentage || 0}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* Card Footer */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-gray-700/60' : 'border-gray-100'} flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-amber-500 font-semibold"
              onClick={() => {
                if (course.isDemo) {
                  toast('Đánh giá được tắt trong chế độ xem trước.');
                } else {
                  openRatingForm(course);
                }
              }}
            >
              <HiStar className="text-amber-400 text-base" />
              <span>{averageRating > 0 ? averageRating.toFixed(1) : '5.0'}</span>
              <span className="text-[11px] text-slate-400">({totalRatings})</span>
            </button>
          </div>

          <Link
            to={`/detail-course/${courseId}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm"
          >
            <span>Vào học</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100' : 'bg-gradient-to-br from-red-50/40 via-white to-amber-50/40 text-gray-900'}`}>
      <Meta
        title={t('coursesMetaTitle')}
        description={t('coursesMetaDescription')}
        keywords={t('coursesMetaKeywords')}
        url="https://www.molycourse.online/courses"
        structuredData={COURSES_STRUCTURED_DATA}
      />

      {loading ? (
        <Loading loading={true} text="Đang tải danh sách khóa học..." fullScreen={false} className="min-h-[60vh] py-16" />
      ) : (
        <div className="container mx-auto px-4 pb-20 pt-24 max-w-7xl space-y-10">
          {/* Header Banner */}
          <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-red-700 via-red-600 to-amber-500 px-6 py-10 text-white shadow-xl sm:px-10 relative">
            <div className="absolute right-0 top-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-md">
                  <Sparkles className="w-3.5 h-3.5" />
                  Moly Course • Lộ Trình Học Tập
                </span>
              </div>
              <h1 className="mt-3 max-w-3xl text-2xl sm:text-4xl font-black tracking-tight leading-tight">
                Kho Khóa Học & Nội Dung Học Tập
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/90 sm:text-base font-light">
                Chọn mục bạn cần học: Chuẩn bị thi CSCA Toán & Dự bị Đại học, hoặc Luyện thi Tiếng Trung chuẩn HSK 1–6 và HSKK.
              </p>
              {isDemo && (
                <div className="mt-5 inline-flex rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-xs font-bold backdrop-blur-sm">
                  Chế độ xem trước · Đang sử dụng dữ liệu khóa học mẫu
                </div>
              )}
            </div>
          </div>

          {/* Category Filter Pills / Tabs */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-1.5 rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 shadow-sm w-fit max-w-full">
            {CATEGORIES.map((tab) => {
              const Icon = tab.icon;
              const active = selectedCategory === tab.id;
              const count = tab.id === 'ALL'
                ? courses.length
                : tab.id === 'CSCA'
                ? cscaCourses.length
                : chineseCourses.length;

              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-red-600 to-amber-500 text-white shadow-md shadow-red-600/30'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    active ? 'bg-white/25 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Các mục khóa học */}
          <div className="space-y-14">
            {/* 1. MỤC CSCA */}
            {(selectedCategory === 'ALL' || selectedCategory === 'CSCA') && (
              <section className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">
                          Mục Khóa Học CSCA
                        </h2>
                        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {cscaCourses.length} khóa học
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Toán học, Vật lí, Hóa học và Dự bị Đại học chuyên sâu chuẩn kỳ thi CSCA.
                      </p>
                    </div>
                  </div>
                </div>

                {cscaCourses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {cscaCourses.map(renderCourseCard)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-6">Chưa có khóa học nào trong mục này.</p>
                )}
              </section>
            )}

            {/* 2. MỤC TIẾNG TRUNG (HSK & HSKK) */}
            {(selectedCategory === 'ALL' || selectedCategory === 'CHINESE') && (
              <section className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/25">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">
                          Mục Khóa Học Tiếng Trung
                        </h2>
                        <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                          {chineseCourses.length} khóa học
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Giáo trình từ HSK 1 đến HSK 6 và luyện phản xạ khẩu ngữ HSKK với giáo viên.
                      </p>
                    </div>
                  </div>
                </div>

                {chineseCourses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {chineseCourses.map(renderCourseCard)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-6">Chưa có khóa học nào trong mục này.</p>
                )}
              </section>
            )}

            {/* 3. MỤC KHÓA HỌC KHÁC (nếu có) */}
            {selectedCategory === 'ALL' && otherCourses.length > 0 && (
              <section className="space-y-5">
                <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-md shadow-amber-600/25">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white">
                      Khóa Học Mở Rộng
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Các khóa kỹ năng và tài liệu bổ trợ.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {otherCourses.map(renderCourseCard)}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {ratingFormVisible && selectedCourseForRating && (
        <CourseRatingForm
          courseName={selectedCourseForRating.nameCourse || selectedCourseForRating.title}
          instructorName="Moly Course"
          courseId={selectedCourseForRating._id || selectedCourseForRating.id}
          onClose={closeRatingForm}
          onSubmit={handleRatingSubmit}
        />
      )}
    </div>
  );
};

export default Courses;
// --- END OF FILE Courses.jsx ---
