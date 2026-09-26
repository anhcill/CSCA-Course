/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiClipboard,
  FiFileText,
  FiMinus,
  FiPlus,
  FiSend,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { EmptyState } from "../../../components/common/StateView";
import Loading from "../../../components/Loading.jsx";
import {
  createTeacherQuiz,
  deleteTeacherQuiz,
  fetchAdminCourses,
  fetchTeacherQuizzes,
  uploadCourseQuizPaper,
} from "../../api/lmsClient";
import {
  optionIndexForQuizKey,
  parseQuizAnswerKey,
  QUIZ_OPTION_KEYS,
} from "../utils/quizAnswerKey";

const createBlankQuestion = () => ({
  id: `question-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  questionText: "",
  options: ["", "", "", ""],
  correctAnswer: 0,
  explanation: "",
  points: 1,
});

const createPaperQuestion = (index) => ({
  ...createBlankQuestion(),
  questionText: `Câu ${index + 1} — xem nội dung trong file đề PDF.`,
  options: ["A", "B", "C", "D"],
});

const optionKeyAt = (index) => QUIZ_OPTION_KEYS[index] || String(index + 1);

const normalizeQuestionForSubmit = (question) => {
  const options = question.options
    .map((text, originalIndex) => ({ text: String(text || "").trim(), originalIndex }))
    .filter((option) => option.text);
  const correctAnswer = options.findIndex((option) => option.originalIndex === question.correctAnswer);
  return {
    questionText: question.questionText.trim(),
    type: "single",
    options: options.map((option) => option.text),
    correctAnswer,
    explanation: question.explanation.trim(),
    points: Number(question.points) || 1,
  };
};

function AnswerKeySheet({ questions, onChooseAnswer, onScrollToQuestion }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[355px] items-center gap-y-2 text-center text-xs font-bold text-slate-700 dark:text-slate-200"
        style={{ gridTemplateColumns: "62px repeat(6, minmax(34px, 1fr))" }}
      >
        <span />
        {QUIZ_OPTION_KEYS.map((key) => <span key={key}>{key}</span>)}
        {questions.map((question, index) => (
          <div className="contents" key={question.id}>
            <button
              type="button"
              onClick={() => onScrollToQuestion(index)}
              className="rounded-lg py-2 text-left font-black text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              title={`Đi tới câu ${index + 1}`}
            >
              Câu {index + 1}
            </button>
            {QUIZ_OPTION_KEYS.map((key) => {
              const optionIndex = optionIndexForQuizKey(key);
              const exists = optionIndex < question.options.length;
              const active = question.correctAnswer === optionIndex;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!exists}
                  onClick={() => onChooseAnswer(index, optionIndex)}
                  aria-label={`Câu ${index + 1}, đáp án đúng ${key}`}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-20 ${
                    active
                      ? "border-violet-600 bg-violet-600 text-white shadow-sm shadow-violet-600/30"
                      : "border-slate-300 bg-white text-transparent hover:border-violet-500 dark:border-slate-600 dark:bg-slate-950"
                  }`}
                >
                  {active && <FiCheck className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeacherQuizPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPaper, setUploadingPaper] = useState(false);

  const [quizTitle, setQuizTitle] = useState("");
  const [quizDesc, setQuizDesc] = useState("");
  const [courseId, setCourseId] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [passScore, setPassScore] = useState(60);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [questions, setQuestions] = useState([createBlankQuestion()]);
  const [answerKeyPaste, setAnswerKeyPaste] = useState("");
  const [paperFile, setPaperFile] = useState(null);

  const parsedAnswerKey = useMemo(() => parseQuizAnswerKey(answerKeyPaste), [answerKeyPaste]);
  const matchedAnswerCount = useMemo(
    () => parsedAnswerKey.entries.filter(({ questionNumber }) => questionNumber <= questions.length).length,
    [parsedAnswerKey, questions.length],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [quizResponse, courseResponse] = await Promise.all([fetchTeacherQuizzes(), fetchAdminCourses()]);
      setQuizzes(quizResponse?.data || []);
      setCourses(courseResponse?.data || []);
    } catch (error) {
      toast.error(error?.message || "Không thể tải dữ liệu đề kiểm tra");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetBuilder = () => {
    setQuizTitle("");
    setQuizDesc("");
    setCourseId("");
    setTimeLimit(30);
    setPassScore(60);
    setShuffleQuestions(true);
    setQuestions([createBlankQuestion()]);
    setAnswerKeyPaste("");
    setPaperFile(null);
  };

  const closeBuilder = () => {
    if (saving) return;
    setIsBuilderOpen(false);
    resetBuilder();
  };

  const updateQuestion = (index, patch) => {
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )));
  };

  const updateOption = (questionIndex, optionIndex, value) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      return {
        ...question,
        options: question.options.map((option, currentOptionIndex) => (
          currentOptionIndex === optionIndex ? value : option
        )),
      };
    }));
  };

  const addOption = (questionIndex) => {
    setQuestions((current) => current.map((question, index) => (
      index === questionIndex && question.options.length < QUIZ_OPTION_KEYS.length
        ? { ...question, options: [...question.options, ""] }
        : question
    )));
  };

  const removeOption = (questionIndex, optionIndex) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex || question.options.length <= 2) return question;
      const nextOptions = question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex);
      return {
        ...question,
        options: nextOptions,
        correctAnswer: Math.min(question.correctAnswer, nextOptions.length - 1),
      };
    }));
  };

  const applyPastedAnswerKey = () => {
    if (!parsedAnswerKey.entries.length) {
      toast.error("Chưa nhận diện được đáp án. Ví dụ hợp lệ: 1 A, 2. B, Câu 3: C.");
      return;
    }
    let applied = 0;
    const largestQuestionNumber = Math.max(...parsedAnswerKey.entries.map((entry) => entry.questionNumber));
    setQuestions((current) => {
      const hasOnlyBlankStarter = current.length === 1
        && !current[0].questionText.trim()
        && current[0].options.every((option) => !option.trim());
      let workingQuestions = current;
      if (paperFile && hasOnlyBlankStarter) {
        workingQuestions = Array.from({ length: largestQuestionNumber }, (_, index) => createPaperQuestion(index));
      } else if (paperFile && largestQuestionNumber > current.length) {
        workingQuestions = [...current, ...Array.from({ length: largestQuestionNumber - current.length }, (_, index) => createPaperQuestion(current.length + index))];
      }
      return workingQuestions.map((question, index) => {
      const answerKey = parsedAnswerKey.answerByQuestion.get(index + 1);
      if (!answerKey) return question;
      const answerIndex = optionIndexForQuizKey(answerKey);
      if (answerIndex < 0) return question;
      const nextOptions = [...question.options];
      while (nextOptions.length <= answerIndex) nextOptions.push("");
      applied += 1;
      return { ...question, options: nextOptions, correctAnswer: answerIndex };
      });
    });
    toast.success(`Đã gán ${applied} đáp án từ danh sách dán.${paperFile ? " Bảng câu PDF đã được tạo." : ""}`);
  };

  const handlePaperSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!courseId) {
      toast.error("Hãy chọn khóa học trước khi tải đề PDF.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Chỉ chấp nhận file PDF làm đề quiz.");
      return;
    }
    try {
      setUploadingPaper(true);
      const response = await uploadCourseQuizPaper(courseId, file);
      if (!response?.success || !response?.data?.id) throw new Error(response?.message || "Không thể xác nhận file PDF");
      setPaperFile({ id: response.data.id, name: response.data.name || file.name });
      toast.success("Đã tải đề PDF. Dán bảng đáp án để tạo quiz.");
    } catch (error) {
      toast.error(error?.message || "Không thể tải đề PDF");
    } finally {
      setUploadingPaper(false);
    }
  };

  const scrollToQuestion = (index) => {
    document.getElementById(`quiz-editor-question-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const validateQuestions = () => {
    for (let index = 0; index < questions.length; index += 1) {
      const normalized = normalizeQuestionForSubmit(questions[index]);
      if (!normalized.questionText) return `Câu ${index + 1} chưa có nội dung.`;
      if (normalized.options.length < 2) return `Câu ${index + 1} cần tối thiểu 2 phương án trả lời.`;
      if (normalized.correctAnswer < 0) return `Câu ${index + 1} chưa có đáp án đúng hợp lệ.`;
      if (!Number.isFinite(normalized.points) || normalized.points <= 0 || normalized.points > 100) return `Điểm của câu ${index + 1} không hợp lệ.`;
    }
    return "";
  };

  const handleSaveQuiz = async (status) => {
    if (uploadingPaper) {
      toast.error("Đợi file PDF tải xong trước khi lưu đề.");
      return;
    }
    if (!courseId) {
      toast.error("Hãy chọn khóa học nhận quiz này.");
      return;
    }
    if (!quizTitle.trim()) {
      toast.error("Hãy nhập tiêu đề đề kiểm tra.");
      return;
    }
    const questionError = validateQuestions();
    if (questionError) {
      toast.error(questionError);
      return;
    }
    try {
      setSaving(true);
      const response = await createTeacherQuiz({
        title: quizTitle.trim(),
        description: quizDesc.trim(),
        courseId: Number(courseId),
        durationMinutes: Number(timeLimit),
        passingScore: Number(passScore),
        shuffleQuestions,
        paperFileId: paperFile?.id || undefined,
        status,
        questions: questions.map(normalizeQuestionForSubmit),
      });
      await loadData();
      toast.success(status === "PUBLISHED"
        ? `Đã xuất bản “${response?.data?.title || quizTitle.trim()}”. Học viên của khóa học đã thấy quiz.`
        : "Đã lưu nháp đề kiểm tra.");
      setIsBuilderOpen(false);
      resetBuilder();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu đề kiểm tra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 pb-20 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">
              <FiClipboard className="h-3.5 w-3.5" /> Quiz LMS
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Đề trắc nghiệm cho học viên</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Soạn đề, dán bảng đáp án và xuất bản trực tiếp theo từng khóa học — không dùng chủ đề luyện tập.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsBuilderOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500"
          >
            <FiPlus className="h-4 w-4" /> Tạo quiz mới
          </button>
        </header>

        {loading ? (
          <Loading loading text="Đang tải danh sách quiz..." fullScreen={false} className="min-h-[40vh] py-16" />
        ) : quizzes.length === 0 ? (
          <EmptyState
            title="Chưa có quiz nào"
            description="Tạo đề đầu tiên, chọn khóa học và xuất bản để học viên làm bài trong LMS."
            actionLabel="Tạo quiz"
            onAction={() => setIsBuilderOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => (
              <article key={quiz.id} className="flex flex-col justify-between space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-violet-400/60 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${quiz.status === "PUBLISHED" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                      {quiz.status === "PUBLISHED" ? "ĐANG CÔNG BỐ" : "BẢN NHÁP"}
                    </span>
                    <span className="text-[11px] text-slate-500">{new Date(quiz.createdAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                  <h2 className="line-clamp-2 text-base font-black text-slate-950 dark:text-white">{quiz.title}</h2>
                  <p className="truncate text-xs font-semibold text-violet-700 dark:text-violet-300">{quiz.courseTitle}</p>
                  {quiz.hasPaper && <span className="inline-flex rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-700 dark:text-blue-300">📄 Có đề PDF</span>}
                </div>
                <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950"><span className="block text-[10px] font-bold uppercase text-slate-500">Câu</span><span className="mt-0.5 block font-mono text-sm font-black">{quiz.questionCount}</span></div>
                    <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950"><span className="block text-[10px] font-bold uppercase text-slate-500">Phút</span><span className="mt-0.5 block font-mono text-sm font-black">{quiz.timeLimitMinutes}</span></div>
                    <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950"><span className="block text-[10px] font-bold uppercase text-slate-500">Lượt nộp</span><span className="mt-0.5 block font-mono text-sm font-black text-violet-600 dark:text-violet-300">{quiz.attemptsCount}</span></div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500">{quiz.avgScore === null ? "Chưa có kết quả" : `Điểm TB: ${quiz.avgScore}%`}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Xóa quiz “${quiz.title}”? Toàn bộ lượt làm bài liên quan cũng sẽ bị xóa.`)) return;
                        try {
                          await deleteTeacherQuiz(quiz.id);
                          setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
                          toast.success("Đã xóa quiz.");
                        } catch (error) {
                          toast.error(error?.message || "Không thể xóa quiz");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    >
                      <FiTrash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {isBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><FiFileText className="h-5 w-5" /></span>
                <div className="min-w-0"><h2 className="truncate text-base font-black text-slate-950 dark:text-white">Soạn đề quiz LMS</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Nội dung đề bên trái, bảng đáp án bên phải. Không có bước chọn chủ đề.</p></div>
              </div>
              <button type="button" disabled={saving} onClick={closeBuilder} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Đóng"><FiX className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
                <section className="space-y-5">
                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 md:grid-cols-2">
                    <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">Tên đề <b className="text-rose-500">*</b></span><input value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} maxLength={255} placeholder="Ví dụ: Quiz buổi 3 — Hàm số ngược" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">Khóa học nhận quiz <b className="text-rose-500">*</b></span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setPaperFile(null); }} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="">Chọn khóa học...</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.name}</option>)}</select><span className="mt-1.5 block text-[11px] text-slate-500">Học viên đang có quyền vào khóa học này sẽ thấy quiz sau khi xuất bản.</span></label>
                    <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">File đề PDF <span className="font-medium text-slate-400">(tùy chọn)</span></span><div className="flex flex-col gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/70 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-violet-800 dark:bg-violet-950/20"><div className="min-w-0"><p className="truncate text-xs font-bold text-violet-950 dark:text-violet-100">{paperFile ? `📄 ${paperFile.name}` : "Tải đề PDF để học viên đọc đề ở cột bên trái."}</p><p className="mt-0.5 text-[11px] text-violet-700 dark:text-violet-300">Khi có PDF, dán đáp án 1 A, 2 B… sẽ tự tạo bảng làm bài theo số câu trong đề.</p></div><input type="file" accept="application/pdf,.pdf" disabled={!courseId || uploadingPaper} onChange={handlePaperSelect} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white hover:file:bg-violet-500 disabled:opacity-50 sm:w-auto" /></div></label>
                    <label><span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">Thời gian (phút)</span><input type="number" min="1" max="240" value={timeLimit} onChange={(event) => setTimeLimit(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label><span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">Điểm đạt (%)</span><input type="number" min="0" max="100" value={passScore} onChange={(event) => setPassScore(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-black text-slate-700 dark:text-slate-200">Hướng dẫn cho học viên <span className="font-medium text-slate-400">(không bắt buộc)</span></span><textarea value={quizDesc} onChange={(event) => setQuizDesc(event.target.value)} rows={2} maxLength={4000} placeholder="Ví dụ: Đọc kỹ từng câu, mỗi câu chỉ chọn một đáp án." className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300"><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" /> Trộn thứ tự câu hỏi cho mỗi học viên</label>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-black text-slate-950 dark:text-white">Nội dung đề ({questions.length} câu)</h3><p className="mt-0.5 text-xs text-slate-500">Nhập câu hỏi và các phương án. Bảng bên phải dùng để chọn/gán đáp án đúng nhanh.</p></div>
                    <button type="button" onClick={() => setQuestions((current) => [...current, createBlankQuestion()])} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white transition hover:bg-violet-500"><FiPlus className="h-3.5 w-3.5" /> Thêm câu</button>
                  </div>

                  <div className="space-y-4">
                    {questions.map((question, questionIndex) => (
                      <article id={`quiz-editor-question-${questionIndex}`} key={question.id} className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between gap-3"><span className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-black text-white">Câu {questionIndex + 1}</span><div className="flex items-center gap-2"><label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">Điểm <input type="number" min="0.25" max="100" step="0.25" value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: event.target.value })} className="w-16 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-center outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950" /></label><button type="button" disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-950/30" title="Xóa câu"><FiTrash2 className="h-4 w-4" /></button></div></div>
                        <textarea value={question.questionText} onChange={(event) => updateQuestion(questionIndex, { questionText: event.target.value })} rows={2} maxLength={6000} placeholder={`Nhập nội dung Câu ${questionIndex + 1}...`} className="w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {question.options.map((option, optionIndex) => {
                            const key = optionKeyAt(optionIndex);
                            const active = question.correctAnswer === optionIndex;
                            return <div key={key} className={`flex items-center gap-2 rounded-xl border p-2 transition ${active ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50"}`}><button type="button" onClick={() => updateQuestion(questionIndex, { correctAnswer: optionIndex })} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black ${active ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 text-slate-500 dark:border-slate-600"}`} aria-label={`Chọn đáp án ${key} là đáp án đúng`}>{key}</button><input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} maxLength={2000} placeholder={`Đáp án ${key}`} className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400 dark:text-white" />{question.options.length > 2 && <button type="button" onClick={() => removeOption(questionIndex, optionIndex)} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50" title={`Bỏ phương án ${key}`}><FiMinus className="h-3.5 w-3.5" /></button>}</div>;
                          })}
                        </div>
                        {question.options.length < QUIZ_OPTION_KEYS.length && <button type="button" onClick={() => addOption(questionIndex)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"><FiPlus className="h-3.5 w-3.5" /> Thêm phương án</button>}
                        <input value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} maxLength={4000} placeholder="Giải thích đáp án sau khi nộp (không bắt buộc)" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs italic outline-none transition focus:border-violet-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" />
                      </article>
                    ))}
                  </div>
                </section>

                <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                  <section className="rounded-2xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/25">
                    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><FiClipboard className="h-4 w-4" /></span><div><h3 className="text-sm font-black text-violet-950 dark:text-violet-100">Dán danh sách đáp án</h3><p className="mt-0.5 text-xs leading-5 text-violet-800 dark:text-violet-200">Chấp nhận <b>1 A</b>, <b>2. b</b>, <b>Câu 3: C</b> hoặc <b>4-D</b>. Hệ thống tự nhận dạng chữ hoa/thường.</p></div></div>
                    <textarea value={answerKeyPaste} onChange={(event) => setAnswerKeyPaste(event.target.value)} rows={7} placeholder={"1 A\n2 B\n3 C\n4 D"} className="mt-3 w-full rounded-xl border border-violet-200 bg-white p-3 font-mono text-xs leading-5 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 dark:border-violet-800 dark:bg-slate-950 dark:text-white" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-bold text-violet-800 dark:text-violet-200">Nhận diện: {matchedAnswerCount}/{questions.length} câu</span><button type="button" onClick={applyPastedAnswerKey} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 font-black text-white transition hover:bg-violet-500"><FiCheck className="h-3.5 w-3.5" /> Gán đáp án</button></div>
                    {parsedAnswerKey.duplicateQuestionNumbers.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"><FiAlertCircle className="mt-0.5 shrink-0" /> Câu {parsedAnswerKey.duplicateQuestionNumbers.join(", ")} lặp lại; hệ thống sẽ lấy đáp án xuất hiện sau cùng.</p>}
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-slate-950 dark:text-white">Bảng đáp án</h3><p className="mt-0.5 text-xs text-slate-500">Nhấn vào ô tròn để đổi đáp án từng câu.</p></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">{questions.length} câu</span></div>
                    <AnswerKeySheet questions={questions} onChooseAnswer={(questionIndex, answerIndex) => updateQuestion(questionIndex, { correctAnswer: answerIndex })} onScrollToQuestion={scrollToQuestion} />
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center gap-2 font-black text-slate-800 dark:text-slate-200"><FiCheckCircle className="text-emerald-500" /> Cách tính điểm an toàn</div><ul className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-400"><li>• Quiz chỉ hiển thị cho học viên thuộc khóa học đã chọn.</li><li>• Đáp án đúng không được gửi xuống trình duyệt trước khi nộp bài.</li><li>• Sau khi nộp, điểm được chấm ở máy chủ và lượt nộp được khóa.</li></ul></section>
                </aside>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-6"><span className="text-xs text-slate-500">Kiểm tra nội dung và đáp án trước khi xuất bản.</span><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => handleSaveQuiz("DRAFT")} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Lưu nháp</button><button type="button" disabled={saving} onClick={() => handleSaveQuiz("PUBLISHED")} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-sm shadow-violet-600/25 transition hover:bg-violet-500 disabled:opacity-50"><FiSend className="h-3.5 w-3.5" />{saving ? "Đang lưu..." : "Xuất bản cho học viên"}</button></div></footer>
          </div>
        </div>
      )}
    </div>
  );
}
