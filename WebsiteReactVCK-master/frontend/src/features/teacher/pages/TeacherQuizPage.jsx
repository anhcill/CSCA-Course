import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiHelpCircle,
  FiPlus,
  FiClock,
  FiAward,
  FiCheckCircle,
  FiTrash2,
  FiEdit,
  FiEye,
  FiX,
  FiShuffle,
  FiSend,
} from "react-icons/fi";
import { EmptyState, LoadingState } from "../../../components/common/StateView";
import { createTeacherQuiz, deleteTeacherQuiz, fetchTeacherQuizzes } from "../../api/lmsClient";

export default function TeacherQuizPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Builder form state
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDesc, setQuizDesc] = useState("");
  const [timeLimit, setTimeLimit] = useState(15);
  const [passScore, setPassScore] = useState(60);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [questions, setQuestions] = useState([
    {
      id: "q_1",
      questionText: "Chọn từ thích hợp điền vào chỗ trống: 他____看书____听音乐。",
      type: "single", // single | multiple | boolean
      options: ["一边...一边...", "不但...而且...", "虽然...但是...", "因为...所以..."],
      correctAnswer: 0,
      explanation: "Cấu trúc '一边...一边...' diễn tả hai hành động diễn ra song song cùng lúc.",
    },
    {
      id: "q_2",
      questionText: "Đúng hay sai: Chữ Hán '明天' có nghĩa là 'Hôm qua'?",
      type: "boolean",
      options: ["Đúng", "Sai"],
      correctAnswer: 1,
      explanation: "'明天' có nghĩa là 'Ngày mai'. 'Hôm qua' trong tiếng Trung là '昨天'.",
    },
  ]);

  const handleAddQuestion = () => {
    const newQ = {
      id: `q_${Date.now()}`,
      questionText: "",
      type: "single",
      options: ["", "", "", ""],
      correctAnswer: 0,
      explanation: "",
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const handleRemoveQuestion = (idx) => {
    if (questions.length <= 1) {
      toast.error("Đề thi cần tối thiểu 1 câu hỏi!");
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchTeacherQuizzes();
      setQuizzes(response?.data || []);
    } catch (error) {
      toast.error(error?.message || "Không thể tải danh sách đề kiểm tra");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const handleSaveQuiz = async (status = "PUBLISHED") => {
    if (!quizTitle.trim()) {
      toast.error("Vui lòng nhập tiêu đề đề thi!");
      return;
    }

    try {
      const response = await createTeacherQuiz({
        title: quizTitle.trim(),
        description: quizDesc.trim(),
        durationMinutes: Number(timeLimit),
        passingScore: Number(passScore),
        shuffleQuestions,
        status,
        questions,
      });
      await loadQuizzes();
      toast.success(`Đã lưu đề thi [${response?.data?.title || quizTitle.trim()}] thành công! 🎉`);
      setIsBuilderOpen(false);
      setQuizTitle("");
      setQuizDesc("");
    } catch (error) {
      toast.error(error?.message || "Không thể lưu đề kiểm tra");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8 pb-20 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
              <FiHelpCircle className="w-3.5 h-3.5" />
              <span>LMS Interactive Quiz Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Quản Lý & Soạn Đề Kiểm Tra Trắc Nghiệm
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Xây dựng ngân hàng câu hỏi, cấu hình thời gian làm bài và hệ thống tự động chấm điểm tức thì.
            </p>
          </div>

          <button
            onClick={() => setIsBuilderOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-lg shadow-amber-600/25"
          >
            <FiPlus className="w-4 h-4" />
            <span>Tạo Đề Kiểm Tra Mới</span>
          </button>
        </div>

        {/* Quizzes List Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {quizzes.map((quiz) => (
            <article
              key={quiz.id}
              className="bg-slate-900/80 border border-white/10 hover:border-amber-500/40 rounded-3xl p-6 space-y-5 transition flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                      quiz.status === "PUBLISHED"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {quiz.status}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(quiz.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition line-clamp-2">
                  {quiz.title}
                </h3>
                <p className="text-xs text-slate-400 font-mono">{quiz.courseTitle}</p>
              </div>

              <div className="space-y-3 pt-3 border-t border-white/5">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-950 rounded-xl p-2.5">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Câu hỏi</span>
                    <span className="font-mono text-white font-bold text-sm mt-0.5 block">{quiz.questionCount}</span>
                  </div>
                  <div className="bg-slate-950 rounded-xl p-2.5">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Thời gian</span>
                    <span className="font-mono text-white font-bold text-sm mt-0.5 block">{quiz.timeLimitMinutes}p</span>
                  </div>
                  <div className="bg-slate-950 rounded-xl p-2.5">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Lượt nộp</span>
                    <span className="font-mono text-amber-400 font-bold text-sm mt-0.5 block">{quiz.attemptsCount}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toast.success(`Đang mở xem trước đề thi: ${quiz.title}`)}
                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <FiEye className="w-3.5 h-3.5" />
                    <span>Xem đề thi</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteTeacherQuiz(quiz.id);
                        setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
                        toast.success("Đã xóa đề kiểm tra!");
                      } catch (error) {
                        toast.error(error?.message || "Không thể xóa đề kiểm tra");
                      }
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition"
                    title="Xóa đề thi"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Quiz Builder Drawer / Modal */}
      {isBuilderOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500">
                  <FiHelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    Soạn Thảo Đề Thi Trắc Nghiệm Mới
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Hỗ trợ câu hỏi một đáp án, nhiều đáp án và đúng/sai tự chấm.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBuilderOpen(false)}
                className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-white transition"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* General Settings */}
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Tiêu đề đề thi <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="Ví dụ: Đề Kiểm Tra Giữa Kỳ HSK 4 — Phần Đọc & Ngữ Pháp"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-amber-500 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Thời gian làm bài (Phút):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white font-mono outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    Điểm đạt (Passing score %):
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={passScore}
                    onChange={(e) => setPassScore(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs text-gray-900 dark:text-white font-mono outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="shuffle"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="shuffle" className="font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                    Trộn ngẫu nhiên câu hỏi
                  </label>
                </div>
              </div>
            </div>

            {/* Questions Builder List */}
            <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  Danh Sách Câu Hỏi ({questions.length})
                </h4>
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold transition"
                >
                  <FiPlus className="w-3.5 h-3.5" />
                  <span>Thêm câu hỏi</span>
                </button>
              </div>

              {questions.map((q, qIndex) => (
                <div
                  key={q.id}
                  className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3 text-xs relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-500">Câu hỏi #{qIndex + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIndex)}
                      className="p-1 rounded-lg text-gray-400 hover:text-rose-500 transition"
                      title="Xóa câu hỏi này"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={q.questionText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuestions((prev) =>
                        prev.map((item, i) => (i === qIndex ? { ...item, questionText: val } : item))
                      );
                    }}
                    placeholder="Nhập nội dung câu hỏi..."
                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-amber-500 transition"
                  />

                  {/* Options */}
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">
                      Các phương án trả lời (chọn nút tròn để đánh dấu đáp án đúng):
                    </span>
                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct_${q.id}`}
                          checked={q.correctAnswer === optIndex}
                          onChange={() => {
                            setQuestions((prev) =>
                              prev.map((item, i) => (i === qIndex ? { ...item, correctAnswer: optIndex } : item))
                            );
                          }}
                          className="w-4 h-4 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuestions((prev) =>
                              prev.map((item, i) =>
                                i === qIndex
                                  ? {
                                      ...item,
                                      options: item.options.map((o, oi) => (oi === optIndex ? val : o)),
                                    }
                                  : item
                              )
                            );
                          }}
                          placeholder={`Đáp án ${String.fromCharCode(65 + optIndex)}`}
                          className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-white outline-none focus:border-amber-500 transition"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Explanation */}
                  <div>
                    <input
                      type="text"
                      value={q.explanation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setQuestions((prev) =>
                          prev.map((item, i) => (i === qIndex ? { ...item, explanation: val } : item))
                        );
                      }}
                      placeholder="Giải thích chi tiết đáp án đúng (tùy chọn)..."
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 italic outline-none focus:border-amber-500 transition"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setIsBuilderOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => handleSaveQuiz("PUBLISHED")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition"
              >
                <FiSend className="w-4 h-4" />
                <span>Xuất Bản Đề Thi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
