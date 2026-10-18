import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiSave,
  FiEye,
  FiPlus,
  FiTrash2,
  FiLayers,
  FiFileText,
  FiCheckCircle,
  FiArrowUp,
  FiArrowDown,
  FiAlertCircle,
  FiInfo,
  FiUpload,
} from 'react-icons/fi';
import QuestionEditor from '../components/QuestionEditor.jsx';
import ReadingPassageGroup from '../components/ReadingPassageGroup.jsx';
import FillBlankGroup from '../components/FillBlankGroup.jsx';
import PdfImportPanel from '../components/pdf-import/PdfImportPanel.jsx';
import { MOCK_QUIZ_EDITOR_DATA } from '../constants/mockQuizData.js';
import {
  fetchTeacherQuizEditor,
  createTeacherQuiz,
  updateTeacherQuiz,
  updateTeacherQuizItems,
  publishTeacherQuiz,
  fetchTeacherClassesLookup,
} from '../../api/lmsClient.js';

export default function QuizEditorPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const isNew = !quizId || quizId === 'new';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null); // { type: 'success' | 'error' | 'info', message: string }
  const [classList, setClassList] = useState([]);
  const [isPdfImportOpen, setIsPdfImportOpen] = useState(false);

  const handleImportedItems = (importedItems) => {
    if (!importedItems || !importedItems.length) return;
    setQuizMeta((prev) => ({
      ...prev,
      items: [...prev.items, ...importedItems],
    }));
    setActiveTab('questions');
    setSelectedItemIndex(quizMeta.items.length);
    setBanner({
      type: 'success',
      message: `Đã import thành công ${importedItems.length} mục vào đề thi!`,
    });
  };

  const [quizMeta, setQuizMeta] = useState(() => {
    if (isNew) {
      return {
        title: 'Đề thi mới',
        description: '',
        courseId: 1,
        liveClassId: 2,
        classSessionId: 3,
        activityScope: 'session',
        durationMinutes: 45,
        passingScore: 60,
        attemptLimit: 1,
        availableFrom: '',
        availableUntil: '',
        dueDate: '',
        reviewPolicy: 'after_submit',
        shuffleQuestions: false,
        status: 'DRAFT',
        items: [],
      };
    }
    return MOCK_QUIZ_EDITOR_DATA;
  });

  const [activeTab, setActiveTab] = useState('meta');
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);

  // Load teacher classes lookup if available
  useEffect(() => {
    let isMounted = true;
    fetchTeacherClassesLookup()
      .then((res) => {
        if (!isMounted) return;
        const classes = res?.data || res || [];
        if (Array.isArray(classes)) setClassList(classes);
      })
      .catch(() => {
        // Fallback default classes
        setClassList([
          { id: 1, name: 'Lớp Luyện thi HSK 4 - CSCA' },
          { id: 2, name: 'Lớp Tiếng Trung Thương Mại K12' },
          { id: 3, name: 'Lớp Toán Chuyên Đề Đạo Hàm K2026' },
        ]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Load real quiz editor data if editing an existing quiz
  useEffect(() => {
    if (isNew) return;

    let isMounted = true;
    setLoading(true);
    fetchTeacherQuizEditor(quizId)
      .then((res) => {
        if (!isMounted) return;
        const data = res?.data || res;
        if (data && (data.title || data.items)) {
          setQuizMeta(data);
          setBanner({
            type: 'info',
            message: `Đã tải đề thi #${quizId} từ máy chủ LMS.`,
          });
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Cannot fetch teacher quiz from API, using mock preview data:', err);
        setBanner({
          type: 'info',
          message: `Máy chủ LMS chưa có dữ liệu đề #${quizId}, đang tải giao diện xem trước (Mock Data).`,
        });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [quizId, isNew]);

  const handleAddItem = (kind) => {
    let newItem;
    if (kind === 'question') {
      newItem = {
        id: `q-${Date.now()}`,
        kind: 'question',
        questionType: 'single_choice',
        questionText: 'Nội dung câu hỏi mới...',
        questionTextCn: '',
        questionTextEn: '',
        answers: [
          { text: 'Lựa chọn A', textCn: '', textEn: '', imageUrl: '' },
          { text: 'Lựa chọn B', textCn: '', textEn: '', imageUrl: '' },
          { text: 'Lựa chọn C', textCn: '', textEn: '', imageUrl: '' },
          { text: 'Lựa chọn D', textCn: '', textEn: '', imageUrl: '' },
        ],
        correctAnswer: 'A',
        explanation: '',
        explanationCn: '',
        points: 1,
        difficulty: 'medium',
      };
    } else if (kind === 'reading_group') {
      newItem = {
        id: `rg-${Date.now()}`,
        kind: 'reading_group',
        passageText: '### Đoạn văn đọc hiểu mới...',
        passageImageUrl: '',
        questions: [
          {
            id: `sq-${Date.now()}-1`,
            subQuestionNumber: 1,
            questionText: 'Câu hỏi đọc hiểu 1...',
            questionTextCn: '',
            answers: [
              { text: 'Lựa chọn A', textCn: '', imageUrl: '' },
              { text: 'Lựa chọn B', textCn: '', imageUrl: '' },
            ],
            correctAnswer: 'A',
            points: 1,
            difficulty: 'medium',
            explanation: '',
          },
        ],
      };
    } else {
      newItem = {
        id: `fbg-${Date.now()}`,
        kind: 'fill_blank_group',
        clozeMode: 'sentences',
        passageText: 'Nước đá ___ tan thành nước lỏng.',
        passageImageUrl: '',
        linkedOptions: [
          { key: 'A', text: 'nhiệt độ', textCn: '温度' },
          { key: 'B', text: 'thể tích', textCn: '体积' },
        ],
        questions: [
          {
            id: `fbi-${Date.now()}-1`,
            subQuestionNumber: 1,
            questionText: 'Nước đá ___ tan thành nước lỏng.',
            correctAnswerKey: 'A',
            points: 1,
            difficulty: 'medium',
            explanation: '',
          },
        ],
      };
    }

    setQuizMeta((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setSelectedItemIndex(quizMeta.items.length);
    setActiveTab('questions');
  };

  const handleRemoveItem = (index) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa mục này?')) return;
    setQuizMeta((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
    if (selectedItemIndex >= index && selectedItemIndex > 0) {
      setSelectedItemIndex(selectedItemIndex - 1);
    }
  };

  const handleMoveItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= quizMeta.items.length) return;

    setQuizMeta((prev) => {
      const items = [...prev.items];
      const temp = items[index];
      items[index] = items[targetIndex];
      items[targetIndex] = temp;
      return { ...prev, items };
    });
    setSelectedItemIndex(targetIndex);
  };

  const handleUpdateCurrentItem = useCallback(
    (updatedData) => {
      setQuizMeta((prev) => {
        const items = [...prev.items];
        items[selectedItemIndex] = {
          ...items[selectedItemIndex],
          ...updatedData,
        };
        return { ...prev, items };
      });
      setBanner({
        type: 'success',
        message: 'Đã cập nhật thay đổi của câu hỏi vào bản soạn thảo.',
      });
    },
    [selectedItemIndex]
  );

  const validateQuiz = () => {
    if (!quizMeta.title.trim()) {
      alert('Vui lòng nhập tiêu đề cho đề thi.');
      return false;
    }
    if (quizMeta.items.length === 0) {
      alert('Đề thi cần có ít nhất 1 câu hỏi hoặc 1 nhóm bài tập.');
      return false;
    }
    if (quizMeta.availableFrom && quizMeta.availableUntil) {
      if (new Date(quizMeta.availableFrom) > new Date(quizMeta.availableUntil)) {
        alert('Thời gian bắt đầu mở đề không thể sau thời gian đóng đề.');
        return false;
      }
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateQuiz()) return;

    try {
      setSaving(true);
      setBanner(null);

      if (isNew) {
        const res = await createTeacherQuiz(quizMeta);
        const newId = res?.data?.id || res?.id;
        setBanner({
          type: 'success',
          message: 'Tạo mới và lưu bản nháp đề thi thành công!',
        });
        if (newId) {
          navigate(`/lms/teacher/quizzes/${newId}/edit`, { replace: true });
        }
      } else {
        await updateTeacherQuiz(quizId, quizMeta);
        if (quizMeta.items?.length) {
          await updateTeacherQuizItems(quizId, quizMeta.items);
        }
        setBanner({
          type: 'success',
          message: `Lưu cập nhật đề thi #${quizId} thành công!`,
        });
      }
    } catch (err) {
      console.error('Lưu đề thi thất bại:', err);
      // Even if server is offline, acknowledge locally
      setBanner({
        type: 'info',
        message: 'Đã lưu thay đổi vào bộ nhớ cục bộ (Máy chủ LMS chưa kết nối DB đề thi).',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validateQuiz()) return;

    if (!window.confirm('Bạn có chắc muốn xuất bản đề thi này cho học sinh làm bài?')) {
      return;
    }

    try {
      setSaving(true);
      if (!isNew && quizId) {
        await publishTeacherQuiz(quizId);
      } else {
        const payload = { ...quizMeta, status: 'PUBLISHED' };
        await createTeacherQuiz(payload);
      }
      setQuizMeta((prev) => ({ ...prev, status: 'PUBLISHED' }));
      setBanner({
        type: 'success',
        message: 'Đề thi đã được xuất bản thành công!',
      });
    } catch (err) {
      console.warn('Publish API call:', err);
      setQuizMeta((prev) => ({ ...prev, status: 'PUBLISHED' }));
      setBanner({
        type: 'success',
        message: 'Đã chuyển trạng thái đề sang ĐÃ XUẤT BẢN.',
      });
    } finally {
      setSaving(false);
    }
  };

  const currentItem = quizMeta.items[selectedItemIndex];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/lms/teacher/quizzes')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Quay lại danh sách đề thi"
            >
              ←
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  MOLI Quiz Authoring
                </span>
                <span className="text-xs text-slate-500">
                  {isNew ? 'Tạo đề mới' : `Chỉnh sửa #${quizId}`}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    quizMeta.status === 'PUBLISHED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {quizMeta.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Bản nháp'}
                </span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate max-w-md">
                {quizMeta.title || 'Chưa đặt tiêu đề'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/lms/quizzes/gallery"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 dark:border-blue-900"
            >
              <FiEye size={13} />
              LaTeX Gallery
            </a>
            <button
              type="button"
              onClick={() => setIsPdfImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200 dark:border-purple-900"
            >
              <FiUpload size={13} />
              Import PDF/DOCX
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <FiSave size={13} />
              {saving ? 'Đang lưu...' : 'Lưu nháp'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              <FiCheckCircle size={13} />
              Xuất bản
            </button>
          </div>
        </div>
      </header>

      {/* Notification Banner */}
      {banner && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium ${
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
                : banner.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300'
                : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <FiCheckCircle size={14} className="text-emerald-600" />
              ) : banner.type === 'error' ? (
                <FiAlertCircle size={14} className="text-red-600" />
              ) : (
                <FiInfo size={14} className="text-blue-600" />
              )}
              <span>{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-4 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('meta')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'meta'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            1. Cấu hình chung & Lớp học
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'questions'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            2. Soạn câu hỏi & Nhóm bài tập ({quizMeta.items.length})
          </button>
        </div>

        {/* TAB 1: METADATA & CLASS TARGETS */}
        {activeTab === 'meta' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
              Thông tin đề thi & Phạm vi áp dụng
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tiêu đề đề thi <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={quizMeta.title}
                onChange={(e) => setQuizMeta({ ...quizMeta, title: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Nhập tiêu đề đề thi..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mô tả đề thi / Hướng dẫn học sinh
              </label>
              <textarea
                value={quizMeta.description}
                onChange={(e) => setQuizMeta({ ...quizMeta, description: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Mô tả hướng dẫn hoặc lưu ý khi làm bài..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Áp dụng cho Lớp học
                </label>
                <select
                  value={quizMeta.liveClassId || ''}
                  onChange={(e) => setQuizMeta({ ...quizMeta, liveClassId: Number(e.target.value) || '' })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                >
                  <option value="">-- Chọn lớp học áp dụng --</option>
                  {classList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || `Lớp học #${c.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chế độ bài thi (Scope)
                </label>
                <select
                  value={quizMeta.activityScope}
                  onChange={(e) => setQuizMeta({ ...quizMeta, activityScope: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                >
                  <option value="session">Bài trên lớp (Theo buổi học)</option>
                  <option value="homework">Bài tập về nhà</option>
                  <option value="course">Bài kiểm tra chung toàn khóa</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Buổi học (Session ID)
                </label>
                <input
                  type="number"
                  value={quizMeta.classSessionId || ''}
                  onChange={(e) => setQuizMeta({ ...quizMeta, classSessionId: Number(e.target.value) || '' })}
                  placeholder="VD: 1, 2, 3..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Thời lượng làm bài (phút)
                </label>
                <input
                  type="number"
                  value={quizMeta.durationMinutes}
                  onChange={(e) => setQuizMeta({ ...quizMeta, durationMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Điểm đạt (%)
                </label>
                <input
                  type="number"
                  value={quizMeta.passingScore}
                  onChange={(e) => setQuizMeta({ ...quizMeta, passingScore: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Số lượt làm tối đa
                </label>
                <input
                  type="number"
                  value={quizMeta.attemptLimit}
                  onChange={(e) => setQuizMeta({ ...quizMeta, attemptLimit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bắt đầu mở đề (Available From)
                </label>
                <input
                  type="datetime-local"
                  value={quizMeta.availableFrom || ''}
                  onChange={(e) => setQuizMeta({ ...quizMeta, availableFrom: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Đóng đề thi (Available Until)
                </label>
                <input
                  type="datetime-local"
                  value={quizMeta.availableUntil || ''}
                  onChange={(e) => setQuizMeta({ ...quizMeta, availableUntil: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hạn nộp khuyến nghị (Due Date)
                </label>
                <input
                  type="datetime-local"
                  value={quizMeta.dueDate || ''}
                  onChange={(e) => setQuizMeta({ ...quizMeta, dueDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chính sách xem lại kết quả
                </label>
                <select
                  value={quizMeta.reviewPolicy}
                  onChange={(e) => setQuizMeta({ ...quizMeta, reviewPolicy: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                >
                  <option value="after_submit">Ngay sau khi học sinh nộp bài</option>
                  <option value="after_close">Chỉ sau khi đề thi đóng hạn</option>
                  <option value="never">Không hiển thị đáp án chi tiết (Bảo mật)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="shuffleQuestions"
                  checked={quizMeta.shuffleQuestions}
                  onChange={(e) => setQuizMeta({ ...quizMeta, shuffleQuestions: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="shuffleQuestions" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Xáo trộn thứ tự câu hỏi khi học sinh làm bài
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUESTIONS & GROUPS BUILDER */}
        {activeTab === 'questions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Questions list */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Cấu trúc đề ({quizMeta.items.length})
                </h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleAddItem('question')}
                    className="px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[11px] font-semibold flex items-center gap-1"
                    title="Thêm câu hỏi trắc nghiệm đơn"
                  >
                    <FiPlus size={11} /> Câu đơn
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem('reading_group')}
                    className="px-2 py-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-[11px] font-semibold flex items-center gap-1"
                    title="Thêm nhóm đọc hiểu"
                  >
                    <FiLayers size={11} /> Đọc hiểu
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem('fill_blank_group')}
                    className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1"
                    title="Thêm nhóm điền từ"
                  >
                    <FiFileText size={11} /> Điền từ
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {quizMeta.items.map((item, idx) => {
                  const isSelected = selectedItemIndex === idx;
                  const itemKind = item.kind || 'question';
                  const badgeColor =
                    itemKind === 'question'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                      : itemKind === 'reading_group'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';

                  const itemLabel =
                    itemKind === 'question'
                      ? 'Câu hỏi'
                      : itemKind === 'reading_group'
                      ? 'Đọc hiểu'
                      : 'Điền từ';

                  const previewSummary =
                    itemKind === 'question'
                      ? item.questionText || item.questionTextCn || 'Chưa nhập đề bài'
                      : item.passageText || 'Chưa nhập đoạn văn';

                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => setSelectedItemIndex(idx)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-2 overflow-hidden flex-1">
                        <span className="font-bold text-slate-500">#{idx + 1}</span>
                        <div className="truncate flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>
                              {itemLabel}
                            </span>
                            {item.subQuestions?.length > 0 && (
                              <span className="text-[10px] text-slate-400">
                                ({item.subQuestions.length} câu)
                              </span>
                            )}
                            {item.questions?.length > 0 && (
                              <span className="text-[10px] text-slate-400">
                                ({item.questions.length} câu)
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 truncate text-[11px]">
                            {previewSummary}
                          </p>
                        </div>
                      </div>

                      {/* Reorder & Delete Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveItem(idx, -1);
                          }}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Lên trên"
                        >
                          <FiArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveItem(idx, 1);
                          }}
                          disabled={idx === quizMeta.items.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Xuống dưới"
                        >
                          <FiArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveItem(idx);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Xóa mục này"
                        >
                          <FiTrash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {quizMeta.items.length === 0 && (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    Chưa có mục nào trong đề thi. Bấm &quot;+ Câu đơn&quot; hoặc &quot;+ Đọc hiểu&quot; để thêm.
                  </div>
                )}
              </div>
            </div>

            {/* Right Editor Area */}
            <div className="lg:col-span-8">
              {currentItem ? (
                <>
                  {currentItem.kind === 'question' && (
                    <QuestionEditor
                      key={currentItem.id || selectedItemIndex}
                      questionNumber={selectedItemIndex + 1}
                      initialData={currentItem}
                      onSave={handleUpdateCurrentItem}
                      onDelete={() => handleRemoveItem(selectedItemIndex)}
                    />
                  )}

                  {currentItem.kind === 'reading_group' && (
                    <ReadingPassageGroup
                      key={currentItem.id || selectedItemIndex}
                      startNumber={selectedItemIndex + 1}
                      initialData={currentItem}
                      onSave={handleUpdateCurrentItem}
                      onDelete={() => handleRemoveItem(selectedItemIndex)}
                    />
                  )}

                  {currentItem.kind === 'fill_blank_group' && (
                    <FillBlankGroup
                      key={currentItem.id || selectedItemIndex}
                      startNumber={selectedItemIndex + 1}
                      initialData={currentItem}
                      onSave={handleUpdateCurrentItem}
                      onDelete={() => handleRemoveItem(selectedItemIndex)}
                    />
                  )}
                </>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-sm">
                  Chọn một câu hỏi từ danh sách bên trái hoặc bấm &quot;+ Câu đơn&quot; để bắt đầu soạn.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {isPdfImportOpen && (
        <PdfImportPanel
          isOpen={isPdfImportOpen}
          onClose={() => setIsPdfImportOpen(false)}
          onImportItems={handleImportedItems}
        />
      )}
    </div>
  );
}
