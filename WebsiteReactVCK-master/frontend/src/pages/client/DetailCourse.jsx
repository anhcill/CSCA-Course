import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
} from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import useGetLesson from "../../hooks/useGetLesson.js";
import WatchCard from "../../components/course/WacthCard.jsx";
import { FaBars, FaTimes } from "react-icons/fa";
import useGetProgress from "../../hooks/useGetProgress.js";
import { useTheme } from "../../context/ThemeContext";
import CourseTabs from "../../components/course/CourseTabs.jsx";
import CourseSidebar from "../../components/course/CourseSidebar.jsx";
import ChatbotWidget from "../../components/course/ChatbotWidget.jsx";
import { AuthContext } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import Meta from "../../components/Meta.jsx";
import Loading from "../../components/Loading";
import demoCourses from "../../data/demoCourses";

const DetailCourse = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const { lessons } = useGetLesson();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const { progress, refetch } = useGetProgress();
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState("introduce");
  const [videoDurations, setVideoDurations] = useState({});
  const [openLessons, setOpenLessons] = useState(true);
  const [openTests, setOpenTests] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { authUser } = useContext(AuthContext);

  const toggleLessons = () => {
    setOpenLessons(!openLessons);
  };

  const toggleTests = () => {
    setOpenTests(!openTests);
  };

  // Hàm lấy video ID từ URL YouTube
  const getYoutubeVideoId = (url) => {
    if (!url) return null;
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Xử lý khi video sẵn sàng
  const handleVideoReady = (event, lessonId) => {
    try {
      const duration = event.target.getDuration();
      setVideoDurations((prev) => ({
        ...prev,
        [lessonId]: duration,
      }));
    } catch (e) {
      console.warn("Could not get video duration:", e);
    }
  };

  const handleLessonComplete = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const filterProgress = useMemo(() => {
    return progress?.filter((item) => item.userId === authUser?._id);
  }, [progress, authUser?._id]);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await axios.get(`/api/course/${id}`);
        if (response.data && response.data.data) {
          setCourse(response.data.data);
          setError(null);
          return;
        }
      } catch (err) {
        // Fallback for demo courses or missing API course
        console.info("Course API fallback to local demo course:", err.message);
      }

      const demo = (demoCourses || []).find((c) => c._id === id || c.id === id);
      if (demo) {
        setCourse(demo);
        setError(null);
      } else {
        // Fallback generic object
        setCourse({
          _id: id,
          nameCourse: id.toUpperCase().includes('CSCA') ? 'Khóa Học CSCA Chuẩn Hóa' : 'Khóa Học Tiếng Trung HSK & HSKK',
          authorName: 'Moly Course',
          description: 'Chương trình học tập bài bản, tích hợp video bài giảng, danh mục tài liệu và bài tập thực hành.',
        });
      }
      setLoading(false);
    };

    fetchCourse();
  }, [id]);

  // Lọc các bài học của khóa học hiện tại (kèm fallback để luôn có video & bài học)
  const filteredLessons = useMemo(() => {
    const apiLessons = lessons?.filter((lesson) => lesson.courseId === id) || [];
    if (apiLessons.length > 0) return apiLessons;

    const isCsca = (id || '').toLowerCase().includes('csca') || (course?.nameCourse || '').toUpperCase().includes('CSCA');

    if (isCsca) {
      return [
        {
          _id: `${id}-lesson-1`,
          courseId: id,
          nameLesson: 'Bài 1: Cấu trúc đề thi & Tư duy Toán học CSCA',
          videoUrl: 'https://www.youtube.com/watch?v=7xCGqnVfxl8',
          timeVideo: '18:30',
          description: 'Phân tích ma trận đề thi CSCA, các dạng bài Toán học và phương pháp tư duy logic trọng tâm.',
        },
        {
          _id: `${id}-lesson-2`,
          courseId: id,
          nameLesson: 'Bài 2: Chuyên đề Đại số & Phương trình chuẩn hóa',
          videoUrl: 'https://www.youtube.com/watch?v=k5lqKjQ-3l4',
          timeVideo: '22:15',
          description: 'Hệ thống công thức hàm số bậc nhất, bậc hai, lượng giác và kỹ thuật giải nhanh bằng máy tính.',
        },
        {
          _id: `${id}-lesson-3`,
          courseId: id,
          nameLesson: 'Bài 3: Chuyên đề Hình học không gian & Véc-tơ Oxyz',
          videoUrl: 'https://www.youtube.com/watch?v=2e9bNqCgUvQ',
          timeVideo: '25:40',
          description: 'Phương pháp dựng hình, tính khoảng cách, góc và áp dụng hệ tọa độ Oxyz trong đề thi.',
        },
        {
          _id: `${id}-lesson-4`,
          courseId: id,
          nameLesson: 'Bài 4: Luyện đề thực chiến CSCA & Chữa chi tiết',
          videoUrl: 'https://www.youtube.com/watch?v=7xCGqnVfxl8',
          timeVideo: '30:00',
          description: 'Chữa chi tiết 50 câu trắc nghiệm chuẩn form CSCA và chiến thuật phân bổ thời gian phòng thi.',
        },
      ];
    }

    return [
      {
        _id: `${id}-lesson-1`,
        courseId: id,
        nameLesson: 'Bài 1: Ngữ âm căn bản & 4 thanh điệu Pinyin',
        videoUrl: 'https://www.youtube.com/watch?v=7xCGqnVfxl8',
        timeVideo: '14:20',
        description: 'Luyện phát âm chuẩn thanh mẫu, vận mẫu, quy tắc biến âm và thực hành giao tiếp cơ bản.',
      },
      {
        _id: `${id}-lesson-2`,
        courseId: id,
        nameLesson: 'Bài 2: Từ vựng cốt lõi & Mẫu câu giao tiếp hàng ngày',
        videoUrl: 'https://www.youtube.com/watch?v=k5lqKjQ-3l4',
        timeVideo: '18:45',
        description: 'Học từ vựng theo chủ đề gia đình, sở thích, trường học và cấu trúc ngữ pháp thông dụng.',
      },
      {
        _id: `${id}-lesson-3`,
        courseId: id,
        nameLesson: 'Bài 3: Ngữ pháp trọng tâm & Chiến thuật làm bài',
        videoUrl: 'https://www.youtube.com/watch?v=2e9bNqCgUvQ',
        timeVideo: '21:10',
        description: 'Phân tích trật tự từ trong câu, câu chữ 把, 被 và cách nhận diện bẫy đề thi HSK.',
      },
      {
        _id: `${id}-lesson-4`,
        courseId: id,
        nameLesson: 'Bài 4: Luyện nghe - đọc hiểu & Chữa đề thi mẫu',
        videoUrl: 'https://www.youtube.com/watch?v=7xCGqnVfxl8',
        timeVideo: '26:50',
        description: 'Kỹ năng nghe bắt từ khóa, đọc lướt tìm ý chính và mẹo làm phần viết điểm cao.',
      },
    ];
  }, [lessons, id, course]);

  // Tìm bài học hiện tại dựa trên progress hoặc mặc định bài đầu tiên
  useEffect(() => {
    if (filteredLessons.length > 0) {
      if (progress && authUser) {
        const userProgress = progress.find(
          (p) => p.userId === authUser._id && p.courseId === id
        );

        if (userProgress && userProgress.completedLessons?.length > 0) {
          const lastCompletedLessonId =
            userProgress.completedLessons[
              userProgress.completedLessons.length - 1
            ];

          const lastCompletedIndex = filteredLessons.findIndex(
            (lesson) => lesson._id === lastCompletedLessonId
          );

          if (
            lastCompletedIndex !== -1 &&
            lastCompletedIndex < filteredLessons.length - 1
          ) {
            setSelectedLesson(filteredLessons[lastCompletedIndex + 1]);
            return;
          } else if (lastCompletedIndex !== -1) {
            setSelectedLesson(filteredLessons[lastCompletedIndex]);
            return;
          }
        }
      }

      if (!selectedLesson) {
        setSelectedLesson(filteredLessons[0]);
      }
    }
  }, [filteredLessons, progress, authUser, id, selectedLesson]);

  if (error) {
    return toast.error(error);
  }

  const handleLessonSelect = (lesson) => {
    setSelectedLesson(lesson);
  };

  return (
    <div
      className={`${
        isDarkMode
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100"
          : "bg-gradient-to-br from-red-50/30 via-white to-amber-50/30 text-gray-900"
      }`}
    >
      <Meta
        title={t("courseDetailMetaTitle") || "Chi Tiết Khóa Học - Moly Course"}
        description={t("courseDetailMetaDescription")}
        keywords={t("courseDetailMetaKeywords")}
      />
      {loading ? (
        <Loading loading={true} text="Đang tải thông tin bài học..." fullScreen={false} className="min-h-[60vh] py-16" />
      ) : (
        <div className="pt-2">
          <div className="relative">
            {/* Mobile Menu Button */}
            <button
              className="fixed right-4 bottom-4 z-50 lg:hidden bg-red-600 text-white p-3.5 rounded-full shadow-2xl hover:bg-red-700 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              title="Danh mục bài học"
            >
              {isMobileMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
            </button>

            <div className="flex flex-col lg:flex-row">
              {/* Vùng bên trái hiển thị video bài học + Tabs (Tài liệu & Bài tập) */}
              <div
                className={`lg:w-9/12 flex flex-col h-[calc(100vh-80px)] overflow-y-scroll scrollbar ${
                  isChatbotOpen ? "hidden lg:flex" : ""
                }`}
              >
                {selectedLesson ? (
                  <WatchCard
                    lesson={selectedLesson}
                    onLessonComplete={handleLessonComplete}
                    handleLessonSelect={handleLessonSelect}
                  />
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    Chọn một bài học từ danh sách bên phải để xem video
                  </div>
                )}

                {/* Tabs bên dưới video: Giới thiệu, Tổng quan, TÀI LIỆU, BÀI TẬP, Bình luận, Ghi chú */}
                <CourseTabs
                  selectedLesson={selectedLesson}
                  course={course}
                  courseId={id}
                  userData={authUser}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                />
              </div>

              {/* Sidebar bên phải: Danh sách video, Tài liệu & Bài test */}
              <CourseSidebar
                filteredLessons={filteredLessons}
                selectedLesson={selectedLesson}
                handleLessonSelect={handleLessonSelect}
                filterProgress={filterProgress}
                videoDurations={videoDurations}
                getYoutubeVideoId={getYoutubeVideoId}
                handleVideoReady={handleVideoReady}
                isMobileMenuOpen={isMobileMenuOpen}
                setIsMobileMenuOpen={setIsMobileMenuOpen}
                openLessons={openLessons}
                setOpenLessons={setOpenLessons}
                openTests={openTests}
                setOpenTests={setOpenTests}
                toggleLessons={toggleLessons}
                toggleTests={toggleTests}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />

              {/* Chatbot Widget */}
              <ChatbotWidget
                isMobileMenuOpen={isMobileMenuOpen}
                isChatbotOpen={isChatbotOpen}
                setIsChatbotOpen={setIsChatbotOpen}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetailCourse;
