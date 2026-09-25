// --- START OF FILE Courses.jsx ---
import { useEffect, useState, useCallback } from 'react';
import { HiOutlineStar, HiMiniStar, HiStar } from "react-icons/hi2"; // Import HiStar for filled star
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import useGetCourse from '../../hooks/useGetCourse';
import useGetProgress from '../../hooks/useGetProgress';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../../context/AuthContext';
import CourseRatingForm from '../../components/course/CourseRatingForm';
import Meta from '../../components/Meta.jsx';
import Loading from '../../components/Loading';

const Courses = () => {
  const { t } = useTranslation();
  const { courses, loading, isDemo } = useGetCourse({ demoFallback: true });
  const { progress } = useGetProgress();
  const { isDarkMode } = useTheme();
  const { authUser } = useAuthContext();
  const { users } = useGetUsers();

  const [ratingFormVisible, setRatingFormVisible] = useState(false);
  const [selectedCourseForRating, setSelectedCourseForRating] = useState(null);
  const [courseRatings, setCourseRatings] = useState({});


  const filterProgress = authUser ? progress?.filter((item) => {
    return item.userId === authUser?._id;
  }) : [];



  const openRatingForm = (course) => {
    if (filterProgress?.find((item) => item.courseId === course._id)?.progressPercentage < 70 || filterProgress?.find((item) => item.courseId === course._id)?.progressPercentage === undefined) {
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
      if (!response.ok) {
        console.error('Lỗi fetch đánh giá khóa học:', response.status);
        return;
      }
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

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100' : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-gray-900'}`}>
      <Meta
        title={t('coursesMetaTitle')} // Sử dụng translation cho title
        description={t('coursesMetaDescription')} // Sử dụng translation cho description
        keywords={t('coursesMetaKeywords')} // Sử dụng translation cho keywords
      />
      {loading ? (
        <Loading loading={true} text="Đang tải danh sách khóa học..." fullScreen={false} className="min-h-[60vh] py-16" />
      ) : (
        <div className="container mx-auto px-4 pb-16 pt-24">
          <div className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-r from-red-700 via-red-600 to-amber-500 px-6 py-10 text-white shadow-xl sm:px-10">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-100">课程 · Lộ trình học tập</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black sm:text-4xl">Chọn khóa học phù hợp với mục tiêu của bạn</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">Từ nền tảng tiếng Trung, luyện thi HSK–HSKK đến dự bị CSCA cho hành trình du học Trung Quốc.</p>
            {isDemo && (
              <div className="mt-6 inline-flex rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-bold backdrop-blur-sm">
                Chế độ xem trước · Đang sử dụng dữ liệu khóa học mẫu
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.isArray(courses) && courses.map((course) => {
              const courseRatingData = courseRatings[course._id || course.id] || {};
              const averageRating = courseRatingData.averageRating || 0;
              const totalRatings = courseRatingData.totalRatings || 0;

              // console.log("Tien do cua use hien tai ", filterProgress?.find((item) => item.courseId === course._id));


              return (
                <div
                  key={course._id || course.id}
                  className={`group rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 ${isDarkMode ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:bg-gray-50'
                    }`}
                >
                  <Link
                    to={authUser && !course.isDemo ? `/detail-course/${course._id}` : '#'}
                    onClick={(event) => {
                      if (course.isDemo) {
                        event.preventDefault();
                        toast('Đây là khóa học mẫu để xem trước giao diện.');
                      } else if (!authUser) {
                        event.preventDefault();
                        toast.error(t('loginRequired'));
                      }
                    }}
                    className="block"
                  >
                    {/* Thêm DIV BỌC TOÀN BỘ NỘI DUNG TRONG LINK */}
                    <div>
                      <div className="relative pb-[56.25%] overflow-hidden">
                        <img
                          src={course.imageCourse}
                          alt={course.nameCourse}
                          className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                      </div>
                      <div className="p-5 space-y-4">
                        <h2 className={`font-bold text-lg line-clamp-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          {course.nameCourse}
                        </h2>
                        <p className={`text-sm font-semibold text-end ${isDarkMode ? 'text-white' : 'text-black'}`}>
                          {course.authorName || users?.find((user) => user._id === course.author)?.username || 'CSCA Academy'}
                        </p>
                        {course.description && (
                          <p className={`line-clamp-2 min-h-10 text-sm leading-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {course.description}
                          </p>
                        )}
                        {(course.level || course.duration) && (
                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            {course.level && <span className="rounded-full bg-red-50 px-3 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-300">{course.level}</span>}
                            {course.duration && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{course.duration}</span>}
                            {course.lessonsCount && <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{course.lessonsCount} bài</span>}
                          </div>
                        )}
                        {
                          authUser && (
                            <div className="space-y-3">
                              <div className={`h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                                  style={{
                                    width: `${filterProgress?.find((item) => item.courseId === course._id)?.progressPercentage || 0}%`
                                  }}
                                />
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                    {/* KẾT THÚC DIV BỌC */}
                  </Link>
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-center">
                      {/* hiển thị tiến độ */}
                      {authUser ? (
                        <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t('progress')} {filterProgress?.find((item) => item.courseId === course._id)?.progressPercentage || 0}%
                        </span>
                      ) : (
                        <span></span>
                      )}
                      <button
                        type="button"
                        className={`relative star-button rounded-full flex items-center justify-center
                        bg-gradient-to-r from-blue-500 to-purple-600
                        overflow-hidden transition-all duration-300 ease-in-out
                        shadow-md shadow-blue-500/50 hover:shadow-lg hover:shadow-purple-500/70
                        hover:scale-105
                        before:absolute before:top-0 before:left-[-100%] before:w-full before:h-full
                        before:bg-white/20 before:skew-x-[-30deg] before:transition-all before:duration-500
                        hover:before:left-[100%] p-2`}
                        onClick={() => {
                          if (course.isDemo) {
                            toast('Đánh giá được tắt trong chế độ xem trước.');
                          } else {
                            openRatingForm(course);
                          }
                        }}
                      >
                        {averageRating > 0 ? (
                          <>
                            {[...Array(Math.floor(averageRating))].map((_, index) => (
                              <HiStar key={index} className="text-yellow-400 text-xl" />
                            ))}
                            {averageRating % 1 !== 0 && (
                              <HiMiniStar className="text-yellow-400 text-xl opacity-50" />
                            )}
                            {[...Array(5 - Math.round(averageRating))].map((_, index) => (
                              <HiOutlineStar key={index} className="text-yellow-400 text-xl" />
                            ))}
                          </>
                        ) : (
                          <>
                            {[...Array(5)].map((_, index) => (
                              <HiOutlineStar key={index} className="text-yellow-400 text-xl" />
                            ))}
                          </>
                        )}
                        <span className={`ml-2 text-sm font-semibold text-yellow-400`}>
                          {averageRating > 0 ? averageRating.toFixed(1) : '0.0'} {/* Display 0.0 if no rating yet */}
                        </span>
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className={`text-end text-sm ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} transition-colors duration-200`}>
                        {t('complainRanking')}
                      </p>
                      <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        ({totalRatings} {t('ratingsCount', { count: totalRatings })})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {ratingFormVisible && selectedCourseForRating && (
        <CourseRatingForm
          courseName={selectedCourseForRating.nameCourse}
          instructorName="Hỏi dân IT"
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
