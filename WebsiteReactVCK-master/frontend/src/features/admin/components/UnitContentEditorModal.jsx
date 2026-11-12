import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  FiAlertCircle,
  FiBookOpen,
  FiCheck,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFileText,
  FiFolder,
  FiLayers,
  FiMaximize2,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrash2,
  FiUploadCloud,
  FiVolume2,
  FiX,
  FiZap,
} from "react-icons/fi";
import {
  attachAdminLearningUnitFile,
  batchCreateAdminLearningUnitVocabulary,
  createAdminLearningUnitAssignment,
  createAdminLearningUnitFormula,
  createAdminLearningUnitQuiz,
  createAdminLearningUnitVocabulary,
  deleteAdminLearningUnitAssignment,
  deleteAdminLearningUnitFormula,
  deleteAdminLearningUnitQuiz,
  deleteAdminLearningUnitVocabulary,
  detachAdminLearningUnitFile,
  fetchAdminLearningUnitContent,
  fetchAdminLearningUnitReusableFiles,
  sampleAdminLearningUnitQuiz,
  saveAdminLearningUnitTheory,
  updateAdminLearningUnitFormula,
  updateAdminLearningUnitVocabulary,
  uploadAdminLearningUnitFile,
} from "../../api/lmsClient";
import { speakChinese } from "../../learning/utils/speech";

const MATH_PRESETS = [
  {
    subject: "MATH",
    nameVi: "Nghiệm phương trình bậc 2",
    nameZh: "一元二次方程求根公式",
    latexExpression: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    description: "Công thức nghiệm chuẩn khi delta >= 0",
    variablesStr: "a: Hệ số bậc 2, b: Hệ số bậc 1, c: Hằng số tự do",
  },
  {
    subject: "MATH",
    nameVi: "Đạo hàm hàm luỹ thừa",
    nameZh: "幂函数导数公式",
    latexExpression: "(x^n)' = n \\cdot x^{n-1}",
    description: "Đạo hàm cơ bản của x^n với mọi n thực",
    variablesStr: "x: Biến số, n: Số mũ",
  },
  {
    subject: "MATH",
    nameVi: "Tích phân hàm luỹ thừa",
    nameZh: "幂函数不定积分",
    latexExpression: "\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C",
    description: "Nguyên hàm cơ bản (n khác -1)",
    variablesStr: "x: Biến lấy tích phân, C: Hằng số tích phân",
  },
  {
    subject: "PHYSICS",
    nameVi: "Định luật II Newton",
    nameZh: "牛顿第二定律",
    latexExpression: "\\vec{F} = m \\cdot \\vec{a}",
    description: "Gia tốc tỉ lệ thuận với lực tác dụng",
    variablesStr: "F: Hợp lực (N), m: Khối lượng (kg), a: Gia tốc (m/s^2)",
  },
  {
    subject: "PHYSICS",
    nameVi: "Vận tốc biến đổi đều",
    nameZh: "匀变速直线运动速度公式",
    latexExpression: "v = v_0 + a \\cdot t",
    description: "Vận tốc tại thời điểm t trong chuyển động biến đổi đều",
    variablesStr: "v: Vận tốc tức thời, v_0: Vận tốc đầu, a: Gia tốc, t: Thời gian",
  },
  {
    subject: "PHYSICS",
    nameVi: "Động năng",
    nameZh: "动能公式",
    latexExpression: "W_d = \\frac{1}{2} m \\cdot v^2",
    description: "Năng lượng chuyển động của vật",
    variablesStr: "W_d: Động năng (J), m: Khối lượng (kg), v: Vận tốc (m/s)",
  },
  {
    subject: "CHEMISTRY",
    nameVi: "Phương trình trạng thái khí lý tưởng",
    nameZh: "理想气体状态方程",
    latexExpression: "P \\cdot V = n \\cdot R \\cdot T",
    description: "Mối quan hệ áp suất, thể tích và nhiệt độ",
    variablesStr: "P: Áp suất, V: Thể tích, n: Số mol, R: Hằng số khí, T: Nhiệt độ tuyệt đối (K)",
  },
];

const PRESET_SYMBOLS = [
  { label: "Phân số", code: "\\frac{a}{b}" },
  { label: "Căn √", code: "\\sqrt{x}" },
  { label: "Mũ x²", code: "x^{2}" },
  { label: "Chỉ số x₀", code: "x_{0}" },
  { label: "Tổng ∑", code: "\\sum_{i=1}^{n}" },
  { label: "Tích phân ∫", code: "\\int_{a}^{b}" },
  { label: "Vector →", code: "\\vec{F}" },
  { label: "Số π", code: "\\pi" },
  { label: "Delta Δ", code: "\\Delta" },
  { label: "±", code: "\\pm" },
  { label: "· (nhân)", code: "\\cdot" },
  { label: "Ngoặc ( )", code: "\\left( x \\right)" },
];

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileTypeBadge = (filename, mime = "") => {
  const ext = (filename || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  if (ext.endsWith(".pdf") || m.includes("pdf")) {
    return { label: "PDF", bg: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800" };
  }
  if (ext.endsWith(".ppt") || ext.endsWith(".pptx") || m.includes("presentation") || m.includes("powerpoint")) {
    return { label: "Slide", bg: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800" };
  }
  if (ext.endsWith(".doc") || ext.endsWith(".docx") || m.includes("word")) {
    return { label: "Word", bg: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800" };
  }
  if (ext.endsWith(".xls") || ext.endsWith(".xlsx") || m.includes("sheet") || m.includes("excel")) {
    return { label: "Excel", bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" };
  }
  if (ext.endsWith(".png") || ext.endsWith(".jpg") || ext.endsWith(".jpeg") || m.includes("image")) {
    return { label: "Ảnh", bg: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800" };
  }
  return { label: "Tài liệu", bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700" };
};

export default function UnitContentEditorModal({
  isOpen,
  onClose,
  unit,
  onContentUpdated,
}) {
  const [activeTab, setActiveTab] = useState("theory"); // theory | files | exercises | vocabulary | formulas
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState({
    theory: null,
    files: [],
    assignments: [],
    quizzes: [],
    vocabulary: [],
    formulas: [],
  });

  // Theory Form State
  const [theoryTitle, setTheoryTitle] = useState("");
  const [theorySummary, setTheorySummary] = useState("");
  const [theoryHtml, setTheoryHtml] = useState("");
  const [theoryTakeaways, setTheoryTakeaways] = useState("");
  const [theoryTranscript, setTheoryTranscript] = useState("");
  const [savingTheory, setSavingTheory] = useState(false);
  const [showTheoryPreview, setShowTheoryPreview] = useState(false);

  // Files State
  const fileInputRef = useRef(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showReuseFilesModal, setShowReuseFilesModal] = useState(false);
  const [reusableFiles, setReusableFiles] = useState([]);
  const [loadingReusable, setLoadingReusable] = useState(false);
  const [reusableSearch, setReusableSearch] = useState("");
  const [attachingFileId, setAttachingFileId] = useState(null);
  const [deletingFileId, setDeletingFileId] = useState(null);

  // Assignments / Quizzes State
  const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    title: "",
    assignmentType: "homework",
    maxScore: 10,
    dueDate: "",
    description: "",
    attachmentUrl: "",
  });
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [showAddQuizModal, setShowAddQuizModal] = useState(false);
  const [quizForm, setQuizForm] = useState({
    title: "",
    description: "",
    durationMinutes: 30,
    passingScore: 60,
    questions: [
      {
        questionText: "",
        options: ["", "", "", ""],
        correctAnswer: "A",
        explanation: "",
        points: 1,
      },
    ],
  });
  const [savingQuiz, setSavingQuiz] = useState(false);

  const [showSampleBankModal, setShowSampleBankModal] = useState(false);
  const [sampleBankForm, setSampleBankForm] = useState({
    title: "",
    count: 10,
    durationMinutes: 20,
    passingScore: 60,
  });
  const [samplingBank, setSamplingBank] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState(null);

  // Vocabulary State
  const [showAddWordModal, setShowAddWordModal] = useState(false);
  const [editingWordId, setEditingWordId] = useState(null);
  const [wordForm, setWordForm] = useState({
    topic: "Nội dung chung",
    term: "",
    pinyin: "",
    sinoVietnamese: "",
    meaning: "",
    partOfSpeech: "Danh từ",
    exampleSentence: "",
    exampleMeaning: "",
  });
  const [savingWord, setSavingWord] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [savingBatch, setSavingBatch] = useState(false);
  const [deletingWordId, setDeletingWordId] = useState(null);

  // Formula State
  const [showAddFormulaModal, setShowAddFormulaModal] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState(null);
  const [formulaForm, setFormulaForm] = useState({
    subject: "MATH",
    chapterName: "Trọng tâm",
    nameVi: "",
    nameZh: "",
    pinyin: "",
    latexExpression: "F = m \\cdot a",
    description: "",
    variablesStr: "",
  });
  const [savingFormula, setSavingFormula] = useState(false);
  const [deletingFormulaId, setDeletingFormulaId] = useState(null);

  const loadUnitContent = useCallback(async () => {
    if (!unit?.id) return;
    try {
      setLoading(true);
      const res = await fetchAdminLearningUnitContent(unit.id, unit.unitType);
      const data = res?.data || {};
      setContent({
        theory: data.theory || null,
        files: data.files || [],
        assignments: data.assignments || [],
        quizzes: data.quizzes || [],
        vocabulary: data.vocabulary || [],
        formulas: data.formulas || [],
      });

      // Populate theory fields
      const th = data.theory;
      setTheoryTitle(th?.title || unit.title || "");
      setTheorySummary(th?.summary || "");
      setTheoryHtml(th?.contentHtml || "");
      setTheoryTakeaways(Array.isArray(th?.keyTakeaways) ? th.keyTakeaways.join("\n") : "");
      setTheoryTranscript(th?.transcript || "");
    } catch (error) {
      toast.error(error?.message || "Không thể tải chi tiết bài học");
    } finally {
      setLoading(false);
    }
  }, [unit?.id, unit?.unitType, unit?.title]);

  useEffect(() => {
    if (isOpen && unit?.id) {
      loadUnitContent();
    }
  }, [isOpen, unit?.id, loadUnitContent]);

  // --------------------------------------------------------------------------
  // Tab 1: Theory Handlers
  // --------------------------------------------------------------------------
  const handleSaveTheory = async (e) => {
    e.preventDefault();
    if (!unit?.id) return;
    try {
      setSavingTheory(true);
      await saveAdminLearningUnitTheory(unit.id, {
        unitType: unit.unitType,
        title: theoryTitle.trim() || unit.title,
        summary: theorySummary.trim(),
        contentHtml: theoryHtml,
        keyTakeaways: theoryTakeaways
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        transcript: theoryTranscript.trim(),
      });
      toast.success("Đã lưu lý thuyết & kiến thức trọng tâm thành công!");
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Lỗi khi lưu lý thuyết bài học");
    } finally {
      setSavingTheory(false);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 2: Files & Slide Handlers
  // --------------------------------------------------------------------------
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !unit?.id) return;

    try {
      setUploadingFile(true);
      await uploadAdminLearningUnitFile(unit.id, file, {
        unitType: unit.unitType,
        onProgress: (prog) => setUploadProgress(prog),
      });
      toast.success(`Đã đăng tải tệp "${file.name}" vào bài học thành công!`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(null);
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể tải tài liệu lên");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleOpenReuseFiles = async () => {
    setShowReuseFilesModal(true);
    setLoadingReusable(true);
    try {
      const res = await fetchAdminLearningUnitReusableFiles(unit.id, unit.unitType);
      setReusableFiles(res?.data || []);
    } catch (error) {
      toast.error(error?.message || "Không thể tải kho tài liệu có sẵn");
    } finally {
      setLoadingReusable(false);
    }
  };

  const handleAttachReusableFile = async (fileId) => {
    try {
      setAttachingFileId(fileId);
      await attachAdminLearningUnitFile(unit.id, {
        fileId: Number(fileId),
        unitType: unit.unitType,
      });
      toast.success("Đã đính kèm tài liệu vào bài học!");
      setShowReuseFilesModal(false);
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể đính kèm tài liệu");
    } finally {
      setAttachingFileId(null);
    }
  };

  const handleDetachFile = async (fileId, fileName) => {
    if (!window.confirm(`Bạn có chắc muốn gỡ tệp "${fileName}" khỏi bài học này?`)) return;
    try {
      setDeletingFileId(fileId);
      await detachAdminLearningUnitFile(unit.id, fileId, unit.unitType);
      toast.success("Đã gỡ tài liệu khỏi bài học");
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể gỡ tài liệu");
    } finally {
      setDeletingFileId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 3: Assignments & Quizzes Handlers
  // --------------------------------------------------------------------------
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!assignmentForm.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề bài tập");
      return;
    }
    try {
      setSavingAssignment(true);
      await createAdminLearningUnitAssignment(unit.id, {
        unitType: unit.unitType,
        ...assignmentForm,
      });
      toast.success("Đã tạo bài tập mới thành công!");
      setShowAddAssignmentModal(false);
      setAssignmentForm({
        title: "",
        assignmentType: "homework",
        maxScore: 10,
        dueDate: "",
        description: "",
        attachmentUrl: "",
      });
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Lỗi khi tạo bài tập");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId, title) => {
    if (!window.confirm(`Bạn có chắc muốn xóa bài tập "${title}"?`)) return;
    try {
      setDeletingItemId(assignmentId);
      await deleteAdminLearningUnitAssignment(unit.id, assignmentId, unit.unitType);
      toast.success("Đã xóa bài tập thành công");
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể xóa bài tập");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleAddQuestionToQuiz = () => {
    setQuizForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          questionText: "",
          options: ["", "", "", ""],
          correctAnswer: "A",
          explanation: "",
          points: 1,
        },
      ],
    }));
  };

  const handleRemoveQuestionFromQuiz = (index) => {
    if (quizForm.questions.length <= 1) return;
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, idx) => idx !== index),
    }));
  };

  const handleQuestionChange = (index, field, value) => {
    setQuizForm((prev) => {
      const nextQ = [...prev.questions];
      nextQ[index] = { ...nextQ[index], [field]: value };
      return { ...prev, questions: nextQ };
    });
  };

  const handleOptionChange = (qIndex, optIndex, value) => {
    setQuizForm((prev) => {
      const nextQ = [...prev.questions];
      const nextOptions = [...nextQ[qIndex].options];
      nextOptions[optIndex] = value;
      nextQ[qIndex] = { ...nextQ[qIndex], options: nextOptions };
      return { ...prev, questions: nextQ };
    });
  };

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    if (!quizForm.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề đề trắc nghiệm");
      return;
    }
    const validQuestions = quizForm.questions.filter((q) => q.questionText.trim());
    if (validQuestions.length === 0) {
      toast.error("Vui lòng nhập ít nhất 1 câu hỏi có nội dung");
      return;
    }
    try {
      setSavingQuiz(true);
      await createAdminLearningUnitQuiz(unit.id, {
        unitType: unit.unitType,
        title: quizForm.title.trim(),
        description: quizForm.description.trim(),
        durationMinutes: Number(quizForm.durationMinutes || 30),
        passingScore: Number(quizForm.passingScore || 60),
        status: "PUBLISHED",
        questions: validQuestions,
      });
      toast.success("Đã tạo đề trắc nghiệm (Quiz) thành công!");
      setShowAddQuizModal(false);
      setQuizForm({
        title: "",
        description: "",
        durationMinutes: 30,
        passingScore: 60,
        questions: [
          {
            questionText: "",
            options: ["", "", "", ""],
            correctAnswer: "A",
            explanation: "",
            points: 1,
          },
        ],
      });
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Lỗi khi tạo đề trắc nghiệm");
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleDeleteQuiz = async (quizId, title) => {
    if (!window.confirm(`Bạn có chắc muốn xóa đề trắc nghiệm "${title}"?`)) return;
    try {
      setDeletingItemId(quizId);
      await deleteAdminLearningUnitQuiz(unit.id, quizId, unit.unitType);
      toast.success("Đã xóa đề trắc nghiệm");
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể xóa bài trắc nghiệm");
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleSampleQuizFromBank = async (e) => {
    e.preventDefault();
    try {
      setSamplingBank(true);
      const res = await sampleAdminLearningUnitQuiz(unit.id, {
        unitType: unit.unitType,
        title: sampleBankForm.title.trim() || `Trắc nghiệm luyện tập: ${unit.title}`,
        count: Number(sampleBankForm.count || 10),
        durationMinutes: Number(sampleBankForm.durationMinutes || 20),
        passingScore: Number(sampleBankForm.passingScore || 60),
      });
      toast.success(res?.message || "Đã tạo đề trắc nghiệm từ ngân hàng câu hỏi!");
      setShowSampleBankModal(false);
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể tạo quiz từ ngân hàng câu hỏi");
    } finally {
      setSamplingBank(false);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 4: Vocabulary Handlers
  // --------------------------------------------------------------------------
  const openAddWordModal = () => {
    setEditingWordId(null);
    setWordForm({
      topic: "Nội dung chung",
      term: "",
      pinyin: "",
      sinoVietnamese: "",
      meaning: "",
      partOfSpeech: "Danh từ",
      exampleSentence: "",
      exampleMeaning: "",
    });
    setShowAddWordModal(true);
  };

  const openEditWordModal = (item) => {
    setEditingWordId(item.id);
    setWordForm({
      topic: item.topic || "Nội dung chung",
      term: item.term || "",
      pinyin: item.pinyin || "",
      sinoVietnamese: item.sinoVietnamese || "",
      meaning: item.meaning || "",
      partOfSpeech: item.partOfSpeech || "Danh từ",
      exampleSentence: item.exampleSentence || "",
      exampleMeaning: item.exampleMeaning || "",
    });
    setShowAddWordModal(true);
  };

  const handleSaveWord = async (e) => {
    e.preventDefault();
    if (!wordForm.term.trim() || !wordForm.meaning.trim()) {
      toast.error("Vui lòng nhập Hán tự và Nghĩa tiếng Việt");
      return;
    }
    try {
      setSavingWord(true);
      if (editingWordId) {
        await updateAdminLearningUnitVocabulary(unit.id, editingWordId, wordForm);
        toast.success("Đã cập nhật từ vựng!");
      } else {
        await createAdminLearningUnitVocabulary(unit.id, {
          unitType: unit.unitType,
          ...wordForm,
        });
        toast.success("Đã thêm từ vựng vào bài học!");
      }
      setShowAddWordModal(false);
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu từ vựng");
    } finally {
      setSavingWord(false);
    }
  };

  const handleDeleteWord = async (vocabId, term) => {
    if (!window.confirm(`Bạn có chắc muốn xóa từ vựng "${term}"?`)) return;
    try {
      setDeletingWordId(vocabId);
      await deleteAdminLearningUnitVocabulary(unit.id, vocabId);
      toast.success("Đã xóa từ vựng");
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể xóa từ vựng");
    } finally {
      setDeletingWordId(null);
    }
  };

  const handleBatchImportVocabulary = async (e) => {
    e.preventDefault();
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Vui lòng nhập ít nhất một dòng từ vựng");
      return;
    }

    const items = lines.map((line, idx) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        term: parts[0] || "",
        pinyin: parts[1] || "",
        meaning: parts[2] || "",
        exampleSentence: parts[3] || "",
        orderIndex: idx,
      };
    }).filter((it) => it.term && it.meaning);

    if (items.length === 0) {
      toast.error("Không tìm thấy dòng từ vựng hợp lệ (yêu cầu định dạng: Hán tự | Pinyin | Nghĩa | Ví dụ)");
      return;
    }

    try {
      setSavingBatch(true);
      const res = await batchCreateAdminLearningUnitVocabulary(unit.id, {
        unitType: unit.unitType,
        items,
      });
      toast.success(res?.message || `Đã nhập thành công ${items.length} từ vựng!`);
      setBatchText("");
      setShowBatchModal(false);
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Lỗi khi nhập hàng loạt từ vựng");
    } finally {
      setSavingBatch(false);
    }
  };

  // --------------------------------------------------------------------------
  // Tab 5: Formula Handlers
  // --------------------------------------------------------------------------
  const openAddFormulaModal = (preset = null) => {
    setEditingFormulaId(null);
    if (preset) {
      setFormulaForm({
        subject: preset.subject || "MATH",
        chapterName: "Trọng tâm",
        nameVi: preset.nameVi || "",
        nameZh: preset.nameZh || "",
        pinyin: preset.pinyin || "",
        latexExpression: preset.latexExpression || "",
        description: preset.description || "",
        variablesStr: preset.variablesStr || "",
      });
    } else {
      setFormulaForm({
        subject: "MATH",
        chapterName: "Trọng tâm",
        nameVi: "",
        nameZh: "",
        pinyin: "",
        latexExpression: "F = m \\cdot a",
        description: "",
        variablesStr: "",
      });
    }
    setShowAddFormulaModal(true);
  };

  const openEditFormulaModal = (item) => {
    setEditingFormulaId(item.id);
    const varList = Array.isArray(item.variablesExplanation)
      ? item.variablesExplanation.map((v) => `${v.symbol}: ${v.meaning}`).join(", ")
      : "";
    setFormulaForm({
      subject: item.subject || "MATH",
      chapterName: item.chapterName || "Trọng tâm",
      nameVi: item.nameVi || "",
      nameZh: item.nameZh || "",
      pinyin: item.pinyin || "",
      latexExpression: item.latexExpression || "",
      description: item.description || "",
      variablesStr: varList,
    });
    setShowAddFormulaModal(true);
  };

  const handleInsertSymbol = (code) => {
    setFormulaForm((prev) => ({
      ...prev,
      latexExpression: `${prev.latexExpression} ${code}`.trim(),
    }));
  };

  const handleSaveFormula = async (e) => {
    e.preventDefault();
    if (!formulaForm.nameVi.trim() || !formulaForm.latexExpression.trim()) {
      toast.error("Vui lòng nhập Tên công thức và biểu thức LaTeX");
      return;
    }

    const variablesExplanation = formulaForm.variablesStr
      ? formulaForm.variablesStr
          .split(",")
          .map((item) => {
            const [symbol, meaning] = item.split(":").map((s) => s.trim());
            return symbol ? { symbol, meaning: meaning || "" } : null;
          })
          .filter(Boolean)
      : [];

    try {
      setSavingFormula(true);
      if (editingFormulaId) {
        await updateAdminLearningUnitFormula(unit.id, editingFormulaId, {
          ...formulaForm,
          variablesExplanation,
        });
        toast.success("Đã cập nhật công thức!");
      } else {
        await createAdminLearningUnitFormula(unit.id, {
          unitType: unit.unitType,
          ...formulaForm,
          variablesExplanation,
        });
        toast.success("Đã thêm công thức vào bài học!");
      }
      setShowAddFormulaModal(false);
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể lưu công thức");
    } finally {
      setSavingFormula(false);
    }
  };

  const handleDeleteFormula = async (formulaId, nameVi) => {
    if (!window.confirm(`Bạn có chắc muốn xóa công thức "${nameVi}"?`)) return;
    try {
      setDeletingFormulaId(formulaId);
      await deleteAdminLearningUnitFormula(unit.id, formulaId);
      toast.success("Đã xóa công thức");
      await loadUnitContent();
      onContentUpdated?.();
    } catch (error) {
      toast.error(error?.message || "Không thể xóa công thức");
    } finally {
      setDeletingFormulaId(null);
    }
  };

  const renderFormulaKaTeX = (latex) => {
    if (!latex) return null;
    try {
      return (
        <span
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(latex, { displayMode: true, throwOnError: false }),
          }}
        />
      );
    } catch {
      return <span className="font-mono text-xs text-rose-500">{latex}</span>;
    }
  };

  const filteredReusableFiles = useMemo(() => {
    if (!reusableSearch.trim()) return reusableFiles;
    const q = reusableSearch.toLowerCase();
    return reusableFiles.filter((f) => (f.fileName || "").toLowerCase().includes(q));
  }, [reusableFiles, reusableSearch]);

  if (!isOpen || !unit) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex h-[94vh] w-full max-w-5xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className={`rounded-lg px-2.5 py-0.5 text-[11px] font-bold ${
                unit.unitType === "class_session"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                  : "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
              }`}>
                {unit.unitType === "class_session" ? "Lớp Record Kế Thừa" : "Khóa Video Độc Lập"}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate max-w-xl">
                Biên soạn học liệu: {unit.title}
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Quản lý đầy đủ Lý thuyết, Tài liệu & Slide, Bài tập & Quiz, Từ vựng và Công thức cho bài học này.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadUnitContent}
              disabled={loading}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title="Làm mới nội dung"
            >
              <FiRefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800"
              title="Đóng cửa sổ"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 5-Tab Bar */}
        <div className="flex overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-6 py-2 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex gap-2">
            {[
              { id: "theory", label: "Lý thuyết & Tóm tắt", icon: FiBookOpen, badge: content.theory ? "Đã có" : null },
              { id: "files", label: "Tài liệu & Slide", icon: FiFileText, badge: content.files.length || null },
              { id: "exercises", label: "Bài tập & Quiz", icon: FiLayers, badge: content.assignments.length + content.quizzes.length || null },
              { id: "vocabulary", label: "Từ vựng", icon: FiBookOpen, badge: content.vocabulary.length || null },
              { id: "formulas", label: "Công thức", icon: FiZap, badge: content.formulas.length || null },
            ].map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition whitespace-nowrap ${
                  activeTab === id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
                {badge && (
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                    activeTab === id ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
              <FiRefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-xs">Đang tải toàn bộ tài liệu và nội dung bài học...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: THEORY & SUMMARY */}
              {activeTab === "theory" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Biên soạn Lý thuyết & Tóm tắt cốt lõi
                      </h3>
                      <p className="text-xs text-slate-500">
                        Nội dung hiển thị ngay trong tab Lý thuyết của học viên để củng cố bài giảng video.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTheoryPreview((p) => !p)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <FiEye className="h-3.5 w-3.5" />
                      <span>{showTheoryPreview ? "Quay lại chỉnh sửa" : "Xem trước giao diện học viên"}</span>
                    </button>
                  </div>

                  {showTheoryPreview ? (
                    /* Theory Preview */
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-800/40">
                      <div className="border-b border-slate-200 pb-2 dark:border-slate-700">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          Xem trước giao diện học viên
                        </span>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                          {theoryTitle || unit.title}
                        </h4>
                      </div>

                      {theorySummary && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                          <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-sky-300 mb-1">
                            💡 Tóm tắt cốt lõi
                          </div>
                          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                            {theorySummary}
                          </p>
                        </div>
                      )}

                      {theoryTakeaways && (
                        <div className="space-y-2">
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Kiến thức trọng tâm (Key Takeaways)
                          </h5>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {theoryTakeaways.split("\n").filter(Boolean).map((t, idx) => (
                              <div key={idx} className="flex items-start gap-2 rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 text-xs font-bold">✓</span>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl bg-white p-5 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: theoryHtml || "<p className='text-slate-400 italic'>Chưa có nội dung văn bản chi tiết.</p>",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Theory Edit Form */
                    <form onSubmit={handleSaveTheory} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Tiêu đề phần Lý thuyết
                        </label>
                        <input
                          type="text"
                          value={theoryTitle}
                          onChange={(e) => setTheoryTitle(e.target.value)}
                          placeholder="VD: Tổng quan và Phát âm chuẩn Pinyin..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Tóm tắt cốt lõi (Summary Box - Nổi bật trên đầu bài học)
                        </label>
                        <textarea
                          rows={2}
                          value={theorySummary}
                          onChange={(e) => setTheorySummary(e.target.value)}
                          placeholder="Tóm tắt ngắn gọn 2-3 câu giúp học viên nắm nhanh mục tiêu bài giảng..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Kiến thức trọng tâm (Mỗi dòng 1 ý chính có dấu tích xanh)
                        </label>
                        <textarea
                          rows={3}
                          value={theoryTakeaways}
                          onChange={(e) => setTheoryTakeaways(e.target.value)}
                          placeholder="Phân biệt thanh mẫu b, p, m, f&#10;Quy tắc biến điệu thanh ba&#10;Áp dụng công thức vào bài tập ví dụ"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Nội dung chi tiết (Hỗ trợ HTML / Văn bản định dạng)
                        </label>
                        <textarea
                          rows={6}
                          value={theoryHtml}
                          onChange={(e) => setTheoryHtml(e.target.value)}
                          placeholder="<p>Bài học này hướng dẫn các bạn cách...</p><h3>1. Khái niệm cơ bản</h3><p>...</p>"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Transcript phụ đề bài giảng (Tùy chọn)
                        </label>
                        <textarea
                          rows={2}
                          value={theoryTranscript}
                          onChange={(e) => setTheoryTranscript(e.target.value)}
                          placeholder="Lời thoại hoặc phụ đề chi tiết của video..."
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={savingTheory}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:opacity-50"
                        >
                          <FiSave className="h-4 w-4" />
                          <span>{savingTheory ? "Đang lưu..." : "Lưu Lý Thuyết Bài Học"}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 2: FILES & SLIDE */}
              {activeTab === "files" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Tài liệu, Giáo trình & Slide bài giảng
                      </h3>
                      <p className="text-xs text-slate-500">
                        Đăng tải tài liệu (PDF, Slide PowerPoint, Word, Excel). Học viên có thể xem trực tiếp hoặc tải về.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingFile}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                      >
                        <FiUploadCloud className="h-4 w-4" />
                        <span>Tải tệp mới lên</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenReuseFiles}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <FiFolder className="h-4 w-4 text-amber-500" />
                        <span>Chọn từ kho tài liệu</span>
                      </button>
                    </div>
                  </div>

                  {/* Upload Progress Bar */}
                  {uploadProgress && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900/60 dark:bg-blue-950/40">
                      <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1.5">
                        <span>{uploadProgress.message}</span>
                        <span className="font-mono">{uploadProgress.percent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200/60 dark:bg-blue-900">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${uploadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Files List */}
                  {content.files.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-xs text-slate-500 dark:border-slate-800">
                      Chưa có tài liệu hay slide nào được gắn vào bài học này. Bấm <strong>Tải tệp mới lên</strong> hoặc <strong>Chọn từ kho tài liệu</strong>.
                    </div>
                  ) : (
                    <div className="grid gap-2.5">
                      {content.files.map((file) => {
                        const badge = getFileTypeBadge(file.fileName, file.mimeType);
                        return (
                          <div
                            key={file.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`rounded-xl border px-2.5 py-1 text-xs font-black uppercase font-mono ${badge.bg}`}>
                                {badge.label}
                              </span>
                              <div>
                                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white break-all">
                                  {file.fileName}
                                </h4>
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  <span>{formatBytes(file.fileSizeBytes)}</span>
                                  {file.createdAt && (
                                    <span>• {new Date(file.createdAt).toLocaleDateString("vi-VN")}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <a
                                href={file.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <FiDownload className="h-3.5 w-3.5 text-blue-600" />
                                <span>Tải về</span>
                              </a>
                              <button
                                type="button"
                                disabled={deletingFileId === file.id}
                                onClick={() => handleDetachFile(file.id, file.fileName)}
                                className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40"
                                title="Gỡ khỏi bài học"
                              >
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: EXERCISES & QUIZZES */}
              {activeTab === "exercises" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Bài tập Tự Luận & Đề Trắc Nghiệm (Quizzes)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tạo bài tập về nhà hoặc đề thi trắc nghiệm để đánh giá kiến thức bài học của học viên.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddAssignmentModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <FiPlus className="h-4 w-4" />
                        <span>Bài tập tự luận</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowAddQuizModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-500"
                      >
                        <FiEdit2 className="h-4 w-4" />
                        <span>Soạn Đề Trắc Nghiệm</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSampleBankForm({
                            title: `Quiz trắc nghiệm: ${unit.title}`,
                            count: 10,
                            durationMinutes: 20,
                            passingScore: 60,
                          });
                          setShowSampleBankModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        title="Tự động bốc câu hỏi từ ngân hàng câu hỏi"
                      >
                        <FiZap className="h-4 w-4 text-amber-500" />
                        <span>Ngân hàng câu hỏi</span>
                      </button>
                    </div>
                  </div>

                  {content.assignments.length === 0 && content.quizzes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-xs text-slate-500 dark:border-slate-800">
                      Chưa có bài tập hay đề trắc nghiệm nào cho bài học này. Bấm vào các nút phía trên để tạo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Quizzes */}
                      {content.quizzes.map((quiz) => (
                        <div
                          key={`quiz-${quiz.id}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-purple-200/80 bg-purple-50/40 p-4 dark:border-purple-900/40 dark:bg-purple-950/20"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-lg bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                                Trắc Nghiệm (Quiz)
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                {quiz.title}
                              </h4>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span>Số câu hỏi: {quiz.questionsCount || 0} câu</span>
                              <span>• Thời gian: {quiz.durationMinutes} phút</span>
                              <span>• Điểm đạt: {quiz.passingScore}%</span>
                              <span>• Trạng thái: {quiz.status === "PUBLISHED" ? "Đã phát hành" : "Bản nháp"}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={deletingItemId === quiz.id}
                            onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}
                            className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 self-end sm:self-auto"
                            title="Xóa đề trắc nghiệm"
                          >
                            <FiTrash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      {/* Assignments */}
                      {content.assignments.map((assign) => (
                        <div
                          key={`assign-${assign.id}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                                {assign.assignmentType === "essay" ? "Tự Luận" : "Bài Tập Về Nhà"}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                {assign.title}
                              </h4>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span>Thang điểm: {assign.maxScore} điểm</span>
                              {assign.dueDate && (
                                <span>• Hạn nộp: {new Date(assign.dueDate).toLocaleString("vi-VN")}</span>
                              )}
                              {assign.attachmentUrl && (
                                <a
                                  href={assign.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  • File đề đính kèm
                                </a>
                              )}
                            </div>
                            {assign.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                {assign.description}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={deletingItemId === assign.id}
                            onClick={() => handleDeleteAssignment(assign.id, assign.title)}
                            className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 self-end sm:self-auto"
                            title="Xóa bài tập"
                          >
                            <FiTrash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: VOCABULARY */}
              {activeTab === "vocabulary" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Từ vựng trọng tâm bài học ({content.vocabulary.length} từ)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Danh sách từ mới, Pinyin, Hán Việt và câu ví dụ. Tích hợp loa phát âm chuẩn tiếng Trung.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={openAddWordModal}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <FiPlus className="h-4 w-4" />
                        <span>Thêm từ mới</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowBatchModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <FiLayers className="h-4 w-4 text-purple-600" />
                        <span>Nhập hàng loạt (Batch)</span>
                      </button>
                    </div>
                  </div>

                  {content.vocabulary.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-xs text-slate-500 dark:border-slate-800">
                      Chưa có từ vựng nào cho bài học này. Bấm <strong>Thêm từ mới</strong> hoặc <strong>Nhập hàng loạt</strong>.
                    </div>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {content.vocabulary.map((vocab) => (
                        <div
                          key={vocab.id}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-sans">
                                {vocab.term}
                              </span>
                              <button
                                type="button"
                                onClick={() => speakChinese(vocab.term)}
                                className="rounded-lg p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                title="Nghe phát âm"
                              >
                                <FiVolume2 className="h-4 w-4" />
                              </button>
                              {vocab.pinyin && (
                                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  [{vocab.pinyin}]
                                </span>
                              )}
                              {vocab.sinoVietnamese && (
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {vocab.sinoVietnamese}
                                </span>
                              )}
                            </div>

                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {vocab.meaning}
                            </p>

                            {vocab.exampleSentence && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                                VD: {vocab.exampleSentence}
                                {vocab.exampleMeaning && ` (${vocab.exampleMeaning})`}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditWordModal(vocab)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                              title="Sửa"
                            >
                              <FiEdit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingWordId === vocab.id}
                              onClick={() => handleDeleteWord(vocab.id, vocab.term)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                              title="Xóa"
                            >
                              <FiTrash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: FORMULAS */}
              {activeTab === "formulas" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Công thức Toán học, Vật lý & Hóa học ({content.formulas.length} công thức)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Hiển thị biểu thức LaTeX chuẩn KaTeX kèm giải thích các đại lượng cho học viên tra cứu.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openAddFormulaModal()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <FiPlus className="h-4 w-4" />
                        <span>Thêm công thức</span>
                      </button>
                    </div>
                  </div>

                  {/* Preset quick picker */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Công thức CSCA mẫu thường dùng (Bấm để thêm nhanh vào bài học):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {MATH_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => openAddFormulaModal(preset)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 transition"
                        >
                          + {preset.nameVi}
                        </button>
                      ))}
                    </div>
                  </div>

                  {content.formulas.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-xs text-slate-500 dark:border-slate-800">
                      Chưa có công thức nào cho bài học này. Bấm <strong>Thêm công thức</strong> hoặc chọn từ danh sách công thức mẫu phía trên.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {content.formulas.map((form) => (
                        <div
                          key={form.id}
                          className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                form.subject === "PHYSICS"
                                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                  : form.subject === "CHEMISTRY"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              }`}>
                                {form.subject}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditFormulaModal(form)}
                                  className="rounded-lg p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  title="Sửa"
                                >
                                  <FiEdit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingFormulaId === form.id}
                                  onClick={() => handleDeleteFormula(form.id, form.nameVi)}
                                  className="rounded-lg p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="Xóa"
                                >
                                  <FiTrash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                {form.nameVi}
                                {form.nameZh && <span className="ml-2 font-normal text-slate-400">({form.nameZh})</span>}
                              </h4>
                            </div>

                            {/* Rendered formula */}
                            <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60 overflow-x-auto">
                              {renderFormulaKaTeX(form.latexExpression)}
                            </div>

                            {form.description && (
                              <p className="text-xs text-slate-500 italic">
                                {form.description}
                              </p>
                            )}

                            {Array.isArray(form.variablesExplanation) && form.variablesExplanation.length > 0 && (
                              <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                  Giải thích đại lượng:
                                </div>
                                <div className="flex flex-wrap gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                  {form.variablesExplanation.map((v, i) => (
                                    <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                                      <strong>{v.symbol}</strong>: {v.meaning}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-400">
            Mọi thay đổi được lưu tự động và đồng bộ tức thì sang tài khoản học viên.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Sub-Modal: Chọn từ kho tài liệu */}
      {showReuseFilesModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Chọn tài liệu từ kho lưu trữ
              </h3>
              <button
                type="button"
                onClick={() => setShowReuseFilesModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tài liệu theo tên..."
                  value={reusableSearch}
                  onChange={(e) => setReusableSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {loadingReusable ? (
                  <div className="py-8 text-center text-xs text-slate-400">Đang tìm kiếm tài liệu...</div>
                ) : filteredReusableFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Không tìm thấy tài liệu phù hợp trong kho lưu trữ của khóa học.
                  </div>
                ) : (
                  filteredReusableFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="truncate pr-3">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {file.fileName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {formatBytes(file.fileSizeBytes)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={attachingFileId === file.id}
                        onClick={() => handleAttachReusableFile(file.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 shrink-0"
                      >
                        <FiPlus className="h-3.5 w-3.5" />
                        <span>{attachingFileId === file.id ? "Đang gắn..." : "Gắn vào bài"}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Tạo Bài tập tự luận */}
      {showAddAssignmentModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tạo Bài tập tự luận mới
              </h3>
              <button
                type="button"
                onClick={() => setShowAddAssignmentModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tiêu đề bài tập *
                </label>
                <input
                  type="text"
                  required
                  value={assignmentForm.title}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                  placeholder="VD: Bài tập về nhà buổi 1 - Viết đoạn văn HSK 4..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Loại bài tập
                  </label>
                  <select
                    value={assignmentForm.assignmentType}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, assignmentType: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="homework">Bài tập về nhà (Homework)</option>
                    <option value="essay">Bài luận / Tự luận (Essay)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Thang điểm tối đa
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={assignmentForm.maxScore}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, maxScore: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Hạn nộp bài (Tùy chọn)
                </label>
                <input
                  type="datetime-local"
                  value={assignmentForm.dueDate}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Mô tả / Đề bài chi tiết
                </label>
                <textarea
                  rows={4}
                  value={assignmentForm.description}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                  placeholder="Yêu cầu học viên viết 1 đoạn văn khoảng 80 chữ dùng các từ sau..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Link tệp đề bài đính kèm (URL HTTPS - Tùy chọn)
                </label>
                <input
                  type="url"
                  value={assignmentForm.attachmentUrl}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, attachmentUrl: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAssignmentModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingAssignment}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingAssignment ? "Đang tạo..." : "Tạo bài tập"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal: Soạn Đề trắc nghiệm (Quiz) */}
      {showAddQuizModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[92vh] flex flex-col w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 p-6 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Soạn đề kiểm tra trắc nghiệm (Quiz)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddQuizModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuiz} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tiêu đề đề thi / Quiz *
                </label>
                <input
                  type="text"
                  required
                  value={quizForm.title}
                  onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                  placeholder="VD: Trắc nghiệm kiểm tra phát âm & từ vựng..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Thời gian làm bài (Phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={quizForm.durationMinutes}
                    onChange={(e) => setQuizForm({ ...quizForm, durationMinutes: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Điểm đạt (%)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={quizForm.passingScore}
                    onChange={(e) => setQuizForm({ ...quizForm, passingScore: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Questions Builder */}
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Danh sách câu hỏi ({quizForm.questions.length} câu)
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddQuestionToQuiz}
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-200 dark:bg-purple-950/60 dark:text-purple-300"
                  >
                    <FiPlus className="h-3.5 w-3.5" />
                    <span>Thêm câu hỏi</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {quizForm.questions.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                          Câu #{qIdx + 1}
                        </span>
                        {quizForm.questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestionFromQuiz(qIdx)}
                            className="text-xs text-rose-500 hover:underline"
                          >
                            Xóa câu
                          </button>
                        )}
                      </div>

                      <div>
                        <input
                          type="text"
                          required
                          value={q.questionText}
                          onChange={(e) => handleQuestionChange(qIdx, "questionText", e.target.value)}
                          placeholder={`Nội dung câu hỏi ${qIdx + 1}...`}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>

                      {/* 4 Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {["A", "B", "C", "D"].map((key, optIdx) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-400 w-4">{key}.</span>
                            <input
                              type="text"
                              value={q.options[optIdx] || ""}
                              onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                              placeholder={`Phương án ${key}`}
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <span>Đáp án đúng:</span>
                          <select
                            value={q.correctAnswer}
                            onChange={(e) => handleQuestionChange(qIdx, "correctAnswer", e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          >
                            <option value="A">Đáp án A</option>
                            <option value="B">Đáp án B</option>
                            <option value="C">Đáp án C</option>
                            <option value="D">Đáp án D</option>
                          </select>
                        </div>

                        <div className="flex-1 min-w-[200px]">
                          <input
                            type="text"
                            value={q.explanation || ""}
                            onChange={(e) => handleQuestionChange(qIdx, "explanation", e.target.value)}
                            placeholder="Giải thích chi tiết vì sao đáp án đúng..."
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddQuizModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingQuiz}
                  className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {savingQuiz ? "Đang lưu..." : "Lưu đề trắc nghiệm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal: Sinh Quiz từ Ngân hàng câu hỏi */}
      {showSampleBankModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tạo Quiz từ Ngân hàng câu hỏi
              </h3>
              <button
                type="button"
                onClick={() => setShowSampleBankModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSampleQuizFromBank} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tiêu đề đề thi
                </label>
                <input
                  type="text"
                  required
                  value={sampleBankForm.title}
                  onChange={(e) => setSampleBankForm({ ...sampleBankForm, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Số lượng câu hỏi ngẫu nhiên
                </label>
                <select
                  value={sampleBankForm.count}
                  onChange={(e) => setSampleBankForm({ ...sampleBankForm, count: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value={5}>5 câu</option>
                  <option value={10}>10 câu (Khuyên dùng)</option>
                  <option value={15}>15 câu</option>
                  <option value={20}>20 câu</option>
                  <option value={30}>30 câu</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Thời gian (phút)
                  </label>
                  <input
                    type="number"
                    value={sampleBankForm.durationMinutes}
                    onChange={(e) => setSampleBankForm({ ...sampleBankForm, durationMinutes: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Điểm đạt (%)
                  </label>
                  <input
                    type="number"
                    value={sampleBankForm.passingScore}
                    onChange={(e) => setSampleBankForm({ ...sampleBankForm, passingScore: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSampleBankModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={samplingBank}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {samplingBank ? "Đang tạo..." : "Khởi tạo đề thi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal: Thêm / Sửa Từ vựng */}
      {showAddWordModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingWordId ? "Chỉnh sửa từ vựng" : "Thêm từ vựng mới"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddWordModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWord} className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Hán tự *
                  </label>
                  <input
                    type="text"
                    required
                    value={wordForm.term}
                    onChange={(e) => setWordForm({ ...wordForm, term: e.target.value })}
                    placeholder="你好"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Pinyin
                  </label>
                  <input
                    type="text"
                    value={wordForm.pinyin}
                    onChange={(e) => setWordForm({ ...wordForm, pinyin: e.target.value })}
                    placeholder="nǐ hǎo"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Hán Việt
                  </label>
                  <input
                    type="text"
                    value={wordForm.sinoVietnamese}
                    onChange={(e) => setWordForm({ ...wordForm, sinoVietnamese: e.target.value })}
                    placeholder="Nhĩ hảo"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nghĩa tiếng Việt *
                  </label>
                  <input
                    type="text"
                    required
                    value={wordForm.meaning}
                    onChange={(e) => setWordForm({ ...wordForm, meaning: e.target.value })}
                    placeholder="Chào bạn, xin chào"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Từ loại
                  </label>
                  <input
                    type="text"
                    value={wordForm.partOfSpeech}
                    onChange={(e) => setWordForm({ ...wordForm, partOfSpeech: e.target.value })}
                    placeholder="Đại từ, Động từ..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Câu ví dụ tiếng Trung
                </label>
                <input
                  type="text"
                  value={wordForm.exampleSentence}
                  onChange={(e) => setWordForm({ ...wordForm, exampleSentence: e.target.value })}
                  placeholder="你好！很高兴认识你。"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Dịch nghĩa câu ví dụ
                </label>
                <input
                  type="text"
                  value={wordForm.exampleMeaning}
                  onChange={(e) => setWordForm({ ...wordForm, exampleMeaning: e.target.value })}
                  placeholder="Xin chào! Rất vui được quen biết bạn."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddWordModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingWord}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingWord ? "Đang lưu..." : editingWordId ? "Cập nhật" : "Thêm vào bài"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal: Nhập hàng loạt Từ vựng (Batch) */}
      {showBatchModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Nhập hàng loạt từ vựng (Batch Import)
              </h3>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBatchImportVocabulary} className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-100 p-3 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <p className="font-bold mb-1">Định dạng mỗi dòng một từ:</p>
                <code className="text-blue-600 dark:text-blue-400">
                  Hán tự | Pinyin | Nghĩa tiếng Việt | Câu ví dụ
                </code>
                <p className="mt-1 italic">Ví dụ:</p>
                <pre className="text-[10px] text-slate-500 mt-0.5">
                  你好 | nǐ hǎo | Xin chào | 你好！很高兴认识你。{"\n"}
                  谢谢 | xièxie | Cảm ơn | 谢谢你的帮助。{"\n"}
                  再见 | zàijiàn | Tạm biệt | 明天再见！
                </pre>
              </div>

              <div>
                <textarea
                  rows={8}
                  required
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder="Dán danh sách từ vựng theo cú pháp phân tách bằng dấu gạch đứng | vào đây..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {savingBatch ? "Đang nhập..." : "Nhập danh sách từ vựng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal: Thêm / Sửa Công thức */}
      {showAddFormulaModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingFormulaId ? "Chỉnh sửa công thức" : "Thêm công thức mới"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddFormulaModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFormula} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Phân môn
                  </label>
                  <select
                    value={formulaForm.subject}
                    onChange={(e) => setFormulaForm({ ...formulaForm, subject: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="MATH">Toán học (MATH)</option>
                    <option value="PHYSICS">Vật lý (PHYSICS)</option>
                    <option value="CHEMISTRY">Hóa học (CHEMISTRY)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tên tiếng Việt *
                  </label>
                  <input
                    type="text"
                    required
                    value={formulaForm.nameVi}
                    onChange={(e) => setFormulaForm({ ...formulaForm, nameVi: e.target.value })}
                    placeholder="VD: Định luật II Newton"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tên tiếng Trung (Thuật ngữ CSCA)
                </label>
                <input
                  type="text"
                  value={formulaForm.nameZh}
                  onChange={(e) => setFormulaForm({ ...formulaForm, nameZh: e.target.value })}
                  placeholder="牛顿第二定律"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Ký hiệu nhanh */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Chèn nhanh ký hiệu Toán học:
                </label>
                <div className="flex flex-wrap gap-1">
                  {PRESET_SYMBOLS.map((sym, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleInsertSymbol(sym.code)}
                      className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                    >
                      {sym.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Biểu thức LaTeX *
                </label>
                <input
                  type="text"
                  required
                  value={formulaForm.latexExpression}
                  onChange={(e) => setFormulaForm({ ...formulaForm, latexExpression: e.target.value })}
                  placeholder="F = m \cdot a"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* KaTeX Live Preview */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  KaTeX Live Preview:
                </span>
                {renderFormulaKaTeX(formulaForm.latexExpression)}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Giải thích đại lượng (VD: F: Lực tác dụng, m: Khối lượng, a: Gia tốc)
                </label>
                <input
                  type="text"
                  value={formulaForm.variablesStr}
                  onChange={(e) => setFormulaForm({ ...formulaForm, variablesStr: e.target.value })}
                  placeholder="F: Lực (N), m: Khối lượng (kg), a: Gia tốc (m/s²)"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddFormulaModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingFormula}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingFormula ? "Đang lưu..." : editingFormulaId ? "Cập nhật" : "Lưu công thức"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
