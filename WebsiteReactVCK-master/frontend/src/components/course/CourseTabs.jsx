import React, { useState, useEffect } from 'react';
import { marked } from "marked";
import { useTheme } from '../../context/ThemeContext';
import NoteLesson from './NoteLesson.jsx';
import Comments from './Comments.jsx';
import { useTranslation } from 'react-i18next';
import { 
  FileText, 
  Download, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  FolderDown, 
  BookOpen, 
  Award, 
  RotateCcw,
  Sparkles,
  Headphones,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import useGetExercises from '../../hooks/useGetExercise.js';

// Dữ liệu tài liệu mẫu phong phú cho từng bài học/khóa học
const DEFAULT_MATERIALS = [
  {
    id: 'mat-1',
    title: 'Slide bài giảng & Lý thuyết trọng tâm',
    type: 'PDF',
    size: '8.4 MB',
    date: '2026-09-15',
    category: 'slide',
    description: 'Tổng hợp toàn bộ kiến thức ngữ pháp, ngữ âm và mẫu câu đã học trong bài.',
    url: '#',
  },
  {
    id: 'mat-2',
    title: 'Sổ tay từ vựng HSK / CSCA & Chữ Hán chuẩn',
    type: 'PDF',
    size: '3.6 MB',
    date: '2026-09-18',
    category: 'vocab',
    description: 'Bảng từ vựng kèm Pinyin, nghĩa tiếng Việt, thứ tự nét viết và câu ví dụ thực tế.',
    url: '#',
  },
  {
    id: 'mat-3',
    title: 'File Audio luyện nghe phát âm chuẩn bản xứ',
    type: 'MP3',
    size: '18.2 MB',
    date: '2026-09-20',
    category: 'audio',
    description: 'Bản thu âm chất lượng cao các đoạn hội thoại và từ vựng của bài học.',
    url: '#',
  },
  {
    id: 'mat-4',
    title: 'Bộ đề thi thử & Phiếu bài tập tự luyện có đáp án',
    type: 'PDF',
    size: '5.1 MB',
    date: '2026-09-22',
    category: 'test',
    description: 'Hệ thống câu hỏi trắc nghiệm và tự luận kèm lời giải chi tiết từng câu.',
    url: '#',
  },
];

// Bộ bài tập mẫu tương tác nếu API chưa có bài tập
const DEFAULT_QUIZ_QUESTIONS = [
  {
    id: 1,
    question: 'Chọn phiên âm Pinyin đúng cho từ: "你好" (Xin chào)',
    options: [
      { key: 0, text: 'A. nǐ hǎo' },
      { key: 1, text: 'B. nǐ hāo' },
      { key: 2, text: 'C. ní hǎo' },
      { key: 3, text: 'D. nǐ hào' },
    ],
    correctAnswer: 0,
    explanation: '"你好" có phiên âm Pinyin là "nǐ hǎo". Khi hai thanh 3 đi liền nhau, chữ đầu tiên đọc biến âm thành thanh 2 "ní hǎo", nhưng chữ viết pinyin vẫn giữ nguyên "nǐ hǎo".',
  },
  {
    id: 2,
    question: 'Từ nào sau đây mang nghĩa là "Cảm ơn" trong tiếng Trung?',
    options: [
      { key: 0, text: 'A. 对不起 (duìbuqǐ)' },
      { key: 1, text: 'B. 谢谢 (xièxie)' },
      { key: 2, text: 'C. 再见 (zàijiàn)' },
      { key: 3, text: 'D. 没关系 (méi guānxi)' },
    ],
    correctAnswer: 1,
    explanation: '"谢谢 (xièxie)" có nghĩa là "Cảm ơn". "对不起" là xin lỗi, "再见" là tạm biệt, "没关系" là không có gì/không sao.',
  },
  {
    id: 3,
    question: 'Điền từ thích hợp vào chỗ trống: "我是_____。(Tôi là học sinh.)"',
    options: [
      { key: 0, text: 'A. 老师 (lǎoshī)' },
      { key: 1, text: 'B. 医生 (yīshēng)' },
      { key: 2, text: 'C. 学生 (xuésheng)' },
      { key: 3, text: 'D. 朋友 (péngyou)' },
    ],
    correctAnswer: 2,
    explanation: '"学生 (xuésheng)" có nghĩa là học sinh/sinh viên. Câu hoàn chỉnh: 我是学生 (Tôi là học sinh).',
  },
  {
    id: 4,
    question: 'Trật tự câu nào sau đây là ĐÚNG ngữ pháp tiếng Trung?',
    options: [
      { key: 0, text: 'A. 我去北京明天。' },
      { key: 1, text: 'B. 明天我去北京。' },
      { key: 2, text: 'C. 我北京去明天。' },
      { key: 3, text: 'D. 去我明天北京。' },
    ],
    correctAnswer: 1,
    explanation: 'Trong tiếng Trung, trạng từ chỉ thời gian (明天) đứng trước chủ ngữ hoặc ngay sau chủ ngữ, trước động từ vị ngữ: "明天我去北京" hoặc "我明天去北京".',
  },
];

const CourseTabs = ({ selectedLesson, course, courseId, userData, activeTab, setActiveTab }) => {
  const { isDarkMode } = useTheme();
  const { t } = useTranslation();

  // Bài tập state
  const { exercises: apiExercises, loading: loadingExercises } = useGetExercises(selectedLesson?._id);
  const [userAnswers, setUserAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [selectedMaterialFilter, setSelectedMaterialFilter] = useState('all');

  // Reset câu trả lời khi đổi bài học
  useEffect(() => {
    setUserAnswers({});
    setShowResults(false);
  }, [selectedLesson?._id]);

  // Chuẩn hóa danh sách câu hỏi (dùng từ API nếu có, không thì dùng câu hỏi mẫu)
  const currentQuestions = (apiExercises && apiExercises.length > 0)
    ? apiExercises.map((item, idx) => ({
        id: item._id || idx,
        question: item.question,
        options: Array.isArray(item.options) ? item.options.map((opt, i) => ({ key: i, text: typeof opt === 'string' ? opt : opt.text })) : [],
        correctAnswer: item.correct_answer ?? item.correctAnswer ?? 0,
        explanation: item.explanation || 'Đáp án chính xác theo giáo trình chuẩn.',
      }))
    : DEFAULT_QUIZ_QUESTIONS;

  const handleSelectOption = (questionId, optionKey) => {
    if (showResults) return; // Không cho sửa khi đã xem kết quả
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionKey,
    }));
  };

  const handleCheckAnswers = () => {
    if (Object.keys(userAnswers).length === 0) {
      toast.error('Vui lòng chọn ít nhất một đáp án trước khi kiểm tra!');
      return;
    }
    setShowResults(true);
    const correctCount = currentQuestions.filter(q => userAnswers[q.id] === q.correctAnswer).length;
    if (correctCount === currentQuestions.length) {
      toast.success(`Xuất sắc! Bạn trả lời đúng ${correctCount}/${currentQuestions.length} câu (+10 XP) 🎉`);
    } else {
      toast(`Bạn đúng ${correctCount}/${currentQuestions.length} câu. Hãy xem giải thích bên dưới để ôn tập!`, { icon: '📝' });
    }
  };

  const handleResetQuiz = () => {
    setUserAnswers({});
    setShowResults(false);
    toast('Đã làm mới bài tập. Chúc bạn làm bài tốt!', { icon: '🔄' });
  };

  const handleDownloadFile = (material) => {
    toast.success(`Đang tải xuống: ${material.title}`);
  };

  const filteredMaterials = selectedMaterialFilter === 'all'
    ? DEFAULT_MATERIALS
    : DEFAULT_MATERIALS.filter(m => m.category === selectedMaterialFilter);

  return (
    <div className="w-full">
      {/* ─── THANH ĐIỀU HƯỚNG TABS ─── */}
      <div className={`flex overflow-x-auto scrollbar-hidden border-b ${isDarkMode ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-white'} px-4 sm:px-6`}>
        {/* Tab 1: Giới thiệu */}
        <button
          onClick={() => setActiveTab('introduce')}
          className={`py-3.5 px-4 relative font-bold text-xs sm:text-sm border-none outline-none transition-colors whitespace-nowrap ${
            activeTab === 'introduce'
              ? 'text-red-600 dark:text-amber-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          {t('courseTab1') || 'Giới thiệu'}
          {activeTab === 'introduce' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-red-600 dark:bg-amber-400 rounded-full" />
          )}
        </button>

        {/* Tab 2: Tổng quan */}
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3.5 px-4 relative font-bold text-xs sm:text-sm border-none outline-none transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'text-red-600 dark:text-amber-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          {t('courseTab2') || 'Tổng quan'}
          {activeTab === 'overview' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-red-600 dark:bg-amber-400 rounded-full" />
          )}
        </button>

        {/* Tab 3: TÀI LIỆU KHÓA HỌC (NEW) */}
        <button
          onClick={() => setActiveTab('materials')}
          className={`py-3.5 px-4 relative font-bold text-xs sm:text-sm border-none outline-none transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'materials'
              ? 'text-red-600 dark:text-amber-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <FolderDown className="w-4 h-4" />
          <span>Danh Mục Tài Liệu</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300">
            {DEFAULT_MATERIALS.length}
          </span>
          {activeTab === 'materials' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-red-600 dark:bg-amber-400 rounded-full" />
          )}
        </button>

        {/* Tab 4: BÀI TẬP & CÂU HỎI (NEW) */}
        <button
          onClick={() => setActiveTab('exercises')}
          className={`py-3.5 px-4 relative font-bold text-xs sm:text-sm border-none outline-none transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'exercises'
              ? 'text-red-600 dark:text-amber-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Bài Tập & Câu Hỏi</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
            {currentQuestions.length}
          </span>
          {activeTab === 'exercises' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-red-600 dark:bg-amber-400 rounded-full" />
          )}
        </button>

        {/* Tab 5: Bình luận */}
        <button
          onClick={() => setActiveTab('comments')}
          className={`py-3.5 px-4 relative font-bold text-xs sm:text-sm border-none outline-none transition-colors whitespace-nowrap ${
            activeTab === 'comments'
              ? 'text-red-600 dark:text-amber-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          {t('courseTab3') || 'Bình luận'}
          {activeTab === 'comments' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-red-600 dark:bg-amber-400 rounded-full" />
          )}
        </button>

        {/* Tab 6: Ghi chú */}
        <button
          onClick={() => setActiveTab('notes')}
          className={`py-3.5 px-4 relative font-bold text-xs sm:text-sm border-none outline-none transition-colors whitespace-nowrap ${
            activeTab === 'notes'
              ? 'text-red-600 dark:text-amber-400'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          {t('courseTab4') || 'Ghi chú'}
          {activeTab === 'notes' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-red-600 dark:bg-amber-400 rounded-full" />
          )}
        </button>
      </div>

      {/* ─── NỘI DUNG TỪNG TAB ─── */}
      <div className="p-4 sm:p-6">
        {/* 1. GIỚI THIỆU */}
        {activeTab === 'introduce' && (
          <div className="max-w-4xl mx-auto space-y-4">
            {selectedLesson ? (
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {selectedLesson.nameLesson || selectedLesson.title}
                </h3>
                <div
                  className="text-sm sm:text-base dark:text-gray-300 text-gray-700 leading-relaxed text-justify space-y-2"
                  dangerouslySetInnerHTML={{
                    __html: marked.parse(selectedLesson.description || 'Chưa có mô tả chi tiết cho bài học này.'),
                  }}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">Vui lòng chọn bài học từ danh sách bên phải.</p>
            )}
          </div>
        )}

        {/* 2. TỔNG QUAN */}
        {activeTab === 'overview' && (
          <div className="max-w-4xl mx-auto space-y-4">
            {course && (
              <div>
                <h1 className="text-2xl sm:text-3xl font-black mb-3 dark:text-gray-100 text-gray-900">
                  {course.nameCourse || course.title}
                </h1>
                <div
                  className="text-sm sm:text-base dark:text-gray-300 text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: course.description || 'Khóa học chuẩn bị kiến thức toàn diện cho học viên.' }}
                />
              </div>
            )}
          </div>
        )}

        {/* 3. DANH MỤC TÀI LIỆU (NEW) */}
        {activeTab === 'materials' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <FolderDown className="w-5 h-5 text-red-600 dark:text-amber-400" />
                  <span>Danh Mục Tài Liệu Học Tập Đi Kèm</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Tài liệu học tập, slide giáo trình và file luyện nghe của khóa học.
                </p>
              </div>

              {/* Filter tabs for materials */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/80 w-fit text-xs font-semibold">
                <button
                  onClick={() => setSelectedMaterialFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition ${selectedMaterialFilter === 'all' ? 'bg-white dark:bg-gray-700 shadow-sm text-red-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setSelectedMaterialFilter('slide')}
                  className={`px-3 py-1.5 rounded-lg transition ${selectedMaterialFilter === 'slide' ? 'bg-white dark:bg-gray-700 shadow-sm text-red-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Slide
                </button>
                <button
                  onClick={() => setSelectedMaterialFilter('vocab')}
                  className={`px-3 py-1.5 rounded-lg transition ${selectedMaterialFilter === 'vocab' ? 'bg-white dark:bg-gray-700 shadow-sm text-red-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Từ vựng
                </button>
                <button
                  onClick={() => setSelectedMaterialFilter('audio')}
                  className={`px-3 py-1.5 rounded-lg transition ${selectedMaterialFilter === 'audio' ? 'bg-white dark:bg-gray-700 shadow-sm text-red-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  Audio
                </button>
              </div>
            </div>

            {/* List of files */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMaterials.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                      item.type === 'PDF'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                    }`}>
                      {item.type}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-2 font-mono">
                        <span>{item.size}</span>
                        <span>•</span>
                        <span>Cập nhật: {item.date}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                    <button
                      onClick={() => handleDownloadFile(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải về</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. BÀI TẬP & CÂU HỎI (NEW) */}
        {activeTab === 'exercises' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <span>Bài Tập & Câu Hỏi Củng Cố Kiến Thức</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Làm bài trắc nghiệm nhanh để ghi nhớ từ vựng và ngữ pháp sau video.
                </p>
              </div>

              {showResults && (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-bold text-xs">
                    Điểm: {currentQuestions.filter(q => userAnswers[q.id] === q.correctAnswer).length} / {currentQuestions.length}
                  </span>
                  <button
                    onClick={handleResetQuiz}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-200 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Làm lại</span>
                  </button>
                </div>
              )}
            </div>

            {loadingExercises ? (
              <p className="text-sm text-gray-400 py-6 text-center">Đang tải câu hỏi bài tập...</p>
            ) : (
              <div className="space-y-6">
                {currentQuestions.map((q, qIndex) => {
                  const selectedOption = userAnswers[q.id];
                  const isAnswered = selectedOption !== undefined;
                  const isCorrect = isAnswered && selectedOption === q.correctAnswer;

                  return (
                    <div
                      key={q.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        showResults
                          ? isCorrect
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                            : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
                          : 'bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h4 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-relaxed">
                          <span className="text-red-600 dark:text-amber-400 mr-2">Câu {qIndex + 1}:</span>
                          {q.question}
                        </h4>
                        {showResults && (
                          <div className="shrink-0">
                            {isCorrect ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Đúng
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-xs font-bold">
                                <XCircle className="w-3.5 h-3.5" /> Sai
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                        {q.options.map((opt) => {
                          const isOptionSelected = selectedOption === opt.key;
                          const isOptionCorrect = opt.key === q.correctAnswer;

                          let optionStyle = 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50';
                          if (showResults) {
                            if (isOptionCorrect) {
                              optionStyle = 'bg-emerald-100/80 dark:bg-emerald-900/50 border-emerald-400 text-emerald-900 dark:text-emerald-200 font-bold';
                            } else if (isOptionSelected && !isCorrect) {
                              optionStyle = 'bg-rose-100/80 dark:bg-rose-900/50 border-rose-400 text-rose-900 dark:text-rose-200';
                            }
                          } else if (isOptionSelected) {
                            optionStyle = 'bg-red-50 dark:bg-red-950/60 border-red-500 text-red-700 dark:text-amber-300 font-bold';
                          }

                          return (
                            <button
                              key={opt.key}
                              disabled={showResults}
                              onClick={() => handleSelectOption(q.id, opt.key)}
                              className={`p-3 rounded-xl border text-left text-xs sm:text-sm transition-all flex items-center justify-between ${optionStyle}`}
                            >
                              <span>{opt.text}</span>
                              {isOptionSelected && !showResults && (
                                <Check className="w-4 h-4 text-red-600 dark:text-amber-400" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation */}
                      {showResults && q.explanation && (
                        <div className="mt-4 p-3.5 rounded-xl bg-white/80 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-800 text-xs leading-relaxed">
                          <p className="font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                            <span>Giải thích chi tiết:</span>
                          </p>
                          <p className="text-gray-600 dark:text-gray-400">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Bottom Action Button */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t dark:border-gray-800">
                  {!showResults ? (
                    <button
                      onClick={handleCheckAnswers}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-700 hover:to-amber-600 text-white font-bold text-sm transition shadow-md shadow-red-600/30 flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Kiểm Tra Đáp Án & Nộp Bài</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleResetQuiz}
                      className="px-6 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm transition shadow-md flex items-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Làm Lại Bài Tập</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. BÌNH LUẬN */}
        {activeTab === 'comments' && (
          <div className="max-w-4xl mx-auto">
            <Comments courseId={courseId} lessonId={selectedLesson?._id} />
          </div>
        )}

        {/* 6. GHI CHÚ */}
        {activeTab === 'notes' && (
          <div className="max-w-4xl mx-auto">
            {selectedLesson && userData ? (
              <NoteLesson courseId={courseId} lessonId={selectedLesson._id} userData={userData} />
            ) : (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                {!selectedLesson
                  ? 'Vui lòng chọn một bài học để thêm ghi chú'
                  : !userData
                    ? 'Vui lòng đăng nhập để sử dụng tính năng ghi chú'
                    : 'Đang tải...'
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseTabs;