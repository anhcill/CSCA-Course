import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiClock,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiAlertCircle,
  FiAlertTriangle,
  FiAward,
  FiFlag,
  FiMaximize,
  FiMinimize,
  FiSave,
  FiCheck,
  FiEye,
  FiEyeOff,
  FiGrid,
  FiX,
  FiBookOpen,
  FiDownload,
  FiInfo,
} from 'react-icons/fi';
import RichMathText from '../../../components/common/RichMathText.jsx';
import { EmptyState, ErrorState, PermissionDeniedState } from '../../../components/common/StateView.jsx';
import EssayAnswerInput from '../components/EssayAnswerInput.jsx';
import { MOCK_STUDENT_QUIZ_PLAYER_DATA } from '../constants/mockQuizData.js';
import {
  fetchStudentQuizStart,
  saveQuizAttemptAnswer,
  submitQuizAttempt,
} from '../../api/lmsClient.js';

const MANUAL_GRADE_TYPES = new Set(['essay', 'translation']);

const isEssayQuestion = (question) => MANUAL_GRADE_TYPES.has(
  question?.questionType || question?.question_type || question?.type
);

const essayAnswerFor = (answers, questionId) => {
  const direct = answers?.[questionId];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return {
      text: typeof direct.text === 'string' ? direct.text : '',
      notes: typeof direct.notes === 'string' ? direct.notes : '',
      attachments: Array.isArray(direct.attachments) ? direct.attachments : [],
    };
  }
  const scoped = answers?._essay?.byQuestion?.[questionId];
  if (scoped && typeof scoped === 'object') {
    return {
      text: typeof scoped.text === 'string' ? scoped.text : '',
      notes: typeof scoped.notes === 'string' ? scoped.notes : '',
      attachments: Array.isArray(scoped.attachments) ? scoped.attachments : [],
    };
  }
  return { text: typeof direct === 'string' ? direct : '', notes: '', attachments: [] };
};

const hasAnswerContent = (question, answers) => {
  if (isEssayQuestion(question)) {
    const essay = essayAnswerFor(answers, question.id);
    return Boolean(essay.text.trim() || essay.notes.trim() || essay.attachments.length > 0);
  }
  const answer = answers?.[question.id];
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
};

export default function QuizPlayerPage() {
  const { courseId, classId, quizId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  // Core quiz and attempt states
  const [quiz, setQuiz] = useState(MOCK_STUDENT_QUIZ_PLAYER_DATA);
  const [attemptId, setAttemptId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [activeSubIndex, setActiveSubIndex] = useState(0);

  // Timer & Autosave
  const [timeLeft, setTimeLeft] = useState(3600);
  const [autosaveStatus, setAutosaveStatus] = useState('saved'); // 'saved' | 'saving' | 'local' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tabViolations, setTabViolations] = useState(0);
  const [showViolationBanner, setShowViolationBanner] = useState(false);
  const [showBilingual, setShowBilingual] = useState(true);

  // Palette filter
  const [paletteFilter, setPaletteFilter] = useState('all'); // 'all' | 'unanswered' | 'flagged'

  const autosaveTimeoutRef = useRef(null);

  // Flattened questions list for index-based palette and count
  const flattenedQuestions = useMemo(() => {
    const list = [];
    (quiz.items || []).forEach((item, itemIdx) => {
      if (item.kind === 'reading_group') {
        (item.questions || item.subQuestions || []).forEach((sq, subIdx) => {
          list.push({
            id: sq.id || sq._localId || `rq-${itemIdx}-${subIdx}`,
            itemIdx,
            subIdx,
            kind: 'reading_sub',
            parentItem: item,
            question: sq,
            number: list.length + 1,
          });
        });
      } else if (item.kind === 'fill_blank_group') {
        (item.questions || item.subItems || []).forEach((subItem, subIdx) => {
          list.push({
            id: subItem.id || subItem._localId || `fb-${itemIdx}-${subIdx}`,
            itemIdx,
            subIdx,
            kind: 'fill_blank_sub',
            parentItem: item,
            question: subItem,
            number: list.length + 1,
          });
        });
      } else {
        list.push({
          id: item.id || `q-${itemIdx}`,
          itemIdx,
          subIdx: 0,
          kind: 'single_choice',
          parentItem: item,
          question: item,
          number: list.length + 1,
        });
      }
    });
    return list;
  }, [quiz.items]);

  // Load quiz data on mount
  const loadQuiz = useCallback(() => {
    let isMounted = true;
    setLoading(true);
    setLoadError(null);

    fetchStudentQuizStart(quizId)
      .then((res) => {
        if (!isMounted) return;
        const data = res?.data || res;
        if (data && (data.quiz || data.title)) {
          const loadedQuiz = data.quiz || data;
          if (!loadedQuiz.items || loadedQuiz.items.length === 0) {
            setLoadError({
              type: 'empty',
              title: 'Đề thi chưa có câu hỏi',
              message: 'Nội dung đề thi này đang được cập nhật. Vui lòng quay lại sau.',
            });
            return;
          }
          setQuiz(loadedQuiz);

          const attempt = data.attempt || {};
          const loadedAttemptId = attempt.id || `local-${quizId}`;
          setAttemptId(loadedAttemptId);

          // Restore answers from server + localStorage backup
          const localCache = localStorage.getItem(`csca_quiz_answers_${quizId}_${loadedAttemptId}`);
          let mergedAnswers = attempt.answers || {};
          if (localCache) {
            try {
              const parsed = JSON.parse(localCache);
              mergedAnswers = { ...mergedAnswers, ...parsed };
            } catch {
              // ignore
            }
          }
          // If result has review items, ensure student answers are merged into state
          if (data.result?.review && Array.isArray(data.result.review)) {
            data.result.review.forEach((r) => {
              if (r.studentAnswer !== undefined && r.studentAnswer !== null) {
                mergedAnswers[String(r.questionId)] = r.studentAnswer;
              }
            });
          }
          setAnswers(mergedAnswers);

          // If attempt is already submitted OR result payload is present, display the result screen!
          const isOverdueUnsubmitted = Boolean(
            data.isOverdueUnsubmitted ||
            data.result?.isOverdueUnsubmitted ||
            data.quiz?.isOverdueUnsubmitted ||
            attempt.status === 'closed_unsubmitted'
          );

          const isAttemptSubmitted = Boolean(
            data.result ||
            attempt.status === 'submitted' ||
            isOverdueUnsubmitted ||
            (attempt.remainingSeconds !== undefined && attempt.remainingSeconds <= 0 && attempt.submittedAt)
          );

          if (isAttemptSubmitted) {
            const rawScore = Number(data.result?.score ?? attempt.score ?? 0);
            const rawMaxScore = Number(data.result?.maxScore ?? attempt.max_score ?? loadedQuiz.maxScore ?? 10);
            const passed = isOverdueUnsubmitted
              ? false
              : (data.result?.passed ?? (attempt.passed ?? (rawScore >= (loadedQuiz.passingScore || 6))));
            setIsSubmitted(true);
            setSubmitResult(data.result || {
              attemptId: loadedAttemptId,
              score: rawScore,
              maxScore: rawMaxScore,
              percentage: data.result?.percentage ?? (rawMaxScore > 0 ? Math.round((rawScore / rawMaxScore) * 100) : 0),
              passed,
              passingScore: loadedQuiz.passingScore || 6,
              reviewPolicy: loadedQuiz.reviewPolicy || 'after_submit',
              reviewAvailable: true,
              review: data.result?.review || [],
              solutionUrl: data.result?.solutionUrl || loadedQuiz.solutionUrl || null,
              paperUrl: loadedQuiz.paperUrl || null,
              isOverdueUnsubmitted,
              alreadySubmitted: true,
            });
            return;
          }

          // Set countdown for active/in-progress attempt
          if (attempt.remainingSeconds !== undefined && attempt.remainingSeconds !== null) {
            if (attempt.remainingSeconds <= 0) {
              setLoadError({
                type: 'expired',
                title: 'Bài thi đã hết thời gian làm bài',
                message: 'Lượt thi của bạn đã kết thúc. Bạn không thể tiếp tục làm bài.',
              });
              return;
            }
            setTimeLeft(Math.max(0, attempt.remainingSeconds));
          } else if (loadedQuiz.durationMinutes) {
            setTimeLeft(loadedQuiz.durationMinutes * 60);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const status = err?.response?.status || err?.status;
        const code = err?.response?.data?.errorCode || err?.errorCode || err?.code;
        const msg = err?.response?.data?.message || err?.message || '';
        const opensAt = err?.response?.data?.opensAt || err?.details?.opensAt || null;

        if (status === 403 || code === 'FORBIDDEN' || msg.includes('permission') || msg.includes('enroll')) {
          setLoadError({
            type: 'permission',
            title: 'Truy cập bài thi bị từ chối',
            message: 'Bạn chưa ghi danh vào lớp học này hoặc không có quyền tham gia làm đề thi này.',
          });
        } else if (code === 'QUIZ_NOT_OPEN' || msg.includes('chưa mở') || msg.includes('chưa đến giờ')) {
          setLoadError({
            type: 'not_open',
            title: 'Chưa đến giờ làm bài thi nha! ⏰',
            message: msg || (opensAt ? `Bài kiểm tra chưa đến giờ mở đâu nè! ⏰ Bài thi sẽ bắt đầu lúc ${new Date(opensAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Bạn chuẩn bị ôn bài xíu rồi quay lại nhé! ✨` : 'Bài kiểm tra chưa đến giờ mở đâu nè! ⏰ Bạn vui lòng quay lại sau nha! ✨'),
          });
        } else if (status === 410 || code === 'EXPIRED' || code === 'QUIZ_CLOSED' || msg.includes('expired') || msg.includes('đã đóng') || msg.includes('hết hạn')) {
          setLoadError({
            type: 'expired',
            title: 'Bài kiểm tra đã đóng 🔒',
            message: msg || 'Thời hạn mở đề thi đã kết thúc. Vui lòng liên hệ giảng viên nếu bạn cần làm bù nhé!',
          });
        } else if (status === 404 || code === 'NOT_FOUND') {
          setLoadError({
            type: 'not_found',
            title: 'Không tìm thấy bài kiểm tra',
            message: 'Đề thi không tồn tại hoặc đã bị gỡ khỏi hệ thống.',
          });
        } else {
          // If demo / preview or offline preview
          if (quizId === 'demo' || quizId === 'preview' || (typeof window !== 'undefined' && !window.location.host.includes('.'))) {
            console.warn('API start quiz failed or not connected, using fallback practice data:', err);
            setQuiz(MOCK_STUDENT_QUIZ_PLAYER_DATA);
            setAttemptId(`local-preview-${quizId}`);
            setAnswers(MOCK_STUDENT_QUIZ_PLAYER_DATA.savedAnswers || {});
            setTimeLeft(MOCK_STUDENT_QUIZ_PLAYER_DATA.serverRemainingSeconds || 3600);
          } else {
            setLoadError({
              type: 'error',
              title: 'Lỗi tải bài kiểm tra',
              message: msg || 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
            });
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [quizId]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleAutoSubmitRef = useRef(null);
  const handleSelectAnswerRef = useRef(null);

  // Timer Countdown
  useEffect(() => {
    if (timeLeft <= 0 || isSubmitted) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmitRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, isSubmitted]);

  // Anti-cheating: Visibility and tab switch tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmitted) {
        setTabViolations((prev) => {
          const updated = prev + 1;
          setShowViolationBanner(true);
          return updated;
        });
      }
    };

    const handleBeforeUnload = (e) => {
      if (!isSubmitted) {
        e.preventDefault();
        e.returnValue = 'Bạn có bài thi đang diễn ra, rời khỏi có thể mất bài làm.';
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isSubmitted]);

  // Fullscreen toggle helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  // Autosave answer change
  const triggerAutosave = useCallback(
    (questionId, value) => {
      // 1. Immediately save to localStorage
      try {
        const cacheKey = `csca_quiz_answers_${quizId}_${attemptId || 'active'}`;
        const currentAnswers = { ...answers, [questionId]: value };
        localStorage.setItem(cacheKey, JSON.stringify(currentAnswers));
        setAutosaveStatus('local');
      } catch {
        // ignore
      }

      // 2. Debounced API sync
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = setTimeout(async () => {
        if (!attemptId) return;
        try {
          setAutosaveStatus('saving');
          await saveQuizAttemptAnswer(attemptId, {
            questionId,
            answer: value,
            clientTimestamp: new Date().toISOString(),
          });
          setAutosaveStatus('saved');
          setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } catch (err) {
          console.warn('Autosave to server failed, retained locally in browser:', err);
          setAutosaveStatus('local');
        }
      }, 600);
    },
    [answers, attemptId, quizId]
  );

  const handleSelectAnswer = (questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
    triggerAutosave(questionId, value);
  };

  const handleToggleFlag = (questionId) => {
    setFlagged((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const formatTimer = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Submission handler
  const handleAutoSubmit = () => {
    alert('Hết thời gian làm bài! Hệ thống đang tự động nộp bài làm của bạn.');
    executeSubmit();
  };

  const executeSubmit = async () => {
    setSubmitting(true);
    setShowSubmitModal(false);

    try {
      let result;
      if (attemptId && !attemptId.startsWith('local-')) {
        const res = await submitQuizAttempt(attemptId, {
          answers,
          clientTimestamp: new Date().toISOString(),
        });
        result = res?.data || res;
      }

      if (!result) {
        // Fallback simulated evaluation for preview
        let correctCount = 0;
        const objectiveQuestions = flattenedQuestions.filter((fq) => !isEssayQuestion(fq.question));
        objectiveQuestions.forEach((fq) => {
          const ans = answers[fq.id];
          const correct = fq.question.correctAnswer || fq.question.correctAnswerKey;
          if (ans && correct && ans === correct) {
            correctCount += 1;
          }
        });
        const score = Math.round((correctCount / Math.max(1, objectiveQuestions.length)) * 100) / 10;
        result = {
          attemptId: attemptId || 1,
          score,
          maxScore: 10,
          passingScore: quiz.passingScore || 60,
          passed: score >= ((quiz.passingScore || 60) / 10),
          reviewPolicy: quiz.reviewPolicy || 'after_submit',
          answers,
        };
      }

      setSubmitResult(result);
      setIsSubmitted(true);
    } catch (err) {
      console.error('Submit quiz failed:', err);
      alert('Không thể kết nối máy chủ nộp bài. Dữ liệu đã được lưu an toàn trong máy bạn.');
    } finally {
      setSubmitting(false);
    }
  };

  // Statistics
  const answeredCount = useMemo(() => {
    return flattenedQuestions.filter((q) => hasAnswerContent(q.question, answers)).length;
  }, [flattenedQuestions, answers]);

  const flaggedCount = useMemo(() => {
    return Object.values(flagged).filter(Boolean).length;
  }, [flagged]);

  const unansweredCount = flattenedQuestions.length - answeredCount;

  const currentItem = quiz.items?.[currentItemIndex];

  // Jump to specific item and sub-index from palette
  const handleJumpToQuestion = (target) => {
    setCurrentItemIndex(target.itemIdx);
    setActiveSubIndex(target.subIdx);
  };

  useEffect(() => {
    handleAutoSubmitRef.current = handleAutoSubmit;
    handleSelectAnswerRef.current = handleSelectAnswer;
  });

  // Keyboard navigation A, B, C, D
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isSubmitted || showSubmitModal) return;
      if (['input', 'textarea'].includes(e.target.tagName.toLowerCase())) return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key) && currentItem?.kind === 'question') {
        const optionExists = currentItem.options?.some((o) => o.key === key);
        if (optionExists) {
          handleSelectAnswerRef.current?.(currentItem.id, key);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentItem, isSubmitted, showSubmitModal]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[1000] flex h-dvh items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Đang tải dữ liệu bài thi...
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    const backPath = (courseId && classId)
      ? `/lms/courses/${courseId}/classes/${classId}/assignments`
      : '/lms/assignments';

    return (
      <div className="fixed inset-0 z-[1000] flex h-dvh items-center justify-center overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
        <div className="max-w-lg w-full">
          {loadError.type === 'expired' ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-rose-100 dark:border-rose-900/60 p-8 shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-3xl shadow-xs">
                📖
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {loadError.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  {loadError.message}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(backPath)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors"
                >
                  Quay lại danh sách bài tập
                </button>
                <button
                  type="button"
                  onClick={loadQuiz}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <FiBookOpen className="text-sm" /> Xem đề & Tra cứu đáp án
                </button>
              </div>
            </div>
          ) : loadError.type === 'not_open' ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-sky-100 dark:border-sky-900/60 p-8 shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-3xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto text-3xl shadow-xs">
                ⏰
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {loadError.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  {loadError.message}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(backPath)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors"
                >
                  Quay lại danh sách bài tập
                </button>
                <button
                  type="button"
                  onClick={loadQuiz}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition-colors shadow-sm"
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : loadError.type === 'permission' ? (
            <PermissionDeniedState
              title={loadError.title}
              message={loadError.message}
              redirectPath={backPath}
            />
          ) : loadError.type === 'not_found' || loadError.type === 'empty' ? (
            <EmptyState
              title={loadError.title}
              description={loadError.message}
              actionLabel="Về danh sách bài thi"
              actionTo={backPath}
            />
          ) : (
            <ErrorState
              title={loadError.title}
              message={loadError.message}
              onRetry={loadQuiz}
            />
          )}
        </div>
      </div>
    );
  }

  // POST-SUBMIT COMPLETION SCREEN
  if (isSubmitted && submitResult) {
    const isOverdue = Boolean(submitResult.isOverdueUnsubmitted);
    const isPassed = isOverdue ? false : (submitResult.passed ?? (submitResult.score >= (submitResult.passingScore || 6)));
    const showAnswers = Boolean(
      isOverdue ||
      (submitResult.reviewAvailable ?? (submitResult.review && submitResult.review.length > 0) ?? (quiz.reviewPolicy === 'after_submit'))
    );
    const hasEssayQuestions = flattenedQuestions.some((fq) => isEssayQuestion(fq.question));
    const paperUrl = submitResult.paperUrl || quiz.paperUrl || null;
    const solutionUrl = submitResult.solutionUrl || quiz.solutionUrl || null;

    return (
      <div className="fixed inset-0 z-[1000] h-dvh overflow-y-auto bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Result Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-xl text-center space-y-5">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl font-bold ${
                isOverdue
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                  : isPassed
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {isOverdue ? <FiBookOpen className="text-3xl" /> : isPassed ? '✓' : '!'}
            </div>

            <div>
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}
              >
                {isOverdue ? 'Chế độ Ôn tập & Tra cứu đề thi (Quá hạn nộp bài)' : 'Kết quả bài thi'}
              </span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {quiz.title}
              </h1>
            </div>

            <div className="flex items-center justify-center gap-8 py-4 border-y border-slate-100 dark:border-slate-800 max-w-md mx-auto">
              <div>
                <span className="text-xs text-slate-400">Tổng điểm</span>
                <p
                  className={`text-3xl font-black ${
                    isOverdue
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {submitResult.score}{' '}
                  <span className="text-sm font-medium text-slate-400">
                    / {submitResult.maxScore || 10} {isOverdue ? '(Chưa nộp)' : ''}
                  </span>
                </p>
              </div>
              <div className="w-px h-10 bg-slate-200 dark:bg-slate-800"></div>
              <div>
                <span className="text-xs text-slate-400">Trạng thái</span>
                <p
                  className={`text-lg font-bold ${
                    isOverdue
                      ? 'text-rose-600 dark:text-rose-400'
                      : isPassed
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {isOverdue ? 'QUÁ HẠN NỘP BÀI' : isPassed ? 'ĐẠT YÊU CẦU' : 'CHƯA ĐẠT'}
                </p>
              </div>
            </div>

            {isOverdue && (
              <div className="p-4 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-left text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-300">
                  <FiInfo className="shrink-0 text-base" />
                  <span>Thông tin tra cứu đề & Đáp án chính thức</span>
                </div>
                <p className="text-rose-700 dark:text-rose-400 leading-relaxed text-[11px]">
                  Bài kiểm tra này đã kết thúc thời gian mở làm bài trực tuyến và chưa ghi nhận lượt nộp của bạn. Hệ thống đã mở toàn bộ đề thi, lời giải chi tiết và đáp án chuẩn để bạn tự do tra cứu, đối chiếu và ôn tập củng cố kiến thức bất kỳ lúc nào.
                </p>
              </div>
            )}

            {/* Quick Action: Download Paper or Solution if available */}
            {(paperUrl || solutionUrl) && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {paperUrl && (
                  <a
                    href={paperUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition shadow-2xs"
                  >
                    <FiDownload className="text-sm" /> Tải đề bài gốc (PDF/Tệp đính kèm)
                  </a>
                )}
                {solutionUrl && (
                  <a
                    href={solutionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition shadow-2xs"
                  >
                    <FiDownload className="text-sm" /> Tải file Lời giải & Đáp án chính thức
                  </a>
                )}
              </div>
            )}

            {/* Teacher Essay Evaluation Card */}
            {submitResult.essayGrade && (
              <div className="text-left bg-gradient-to-br from-indigo-50/90 via-purple-50/60 to-white dark:from-indigo-950/50 dark:via-purple-950/30 dark:to-slate-900 border border-indigo-200 dark:border-indigo-900/60 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 dark:border-indigo-900/50 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                      ✍️
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                        Kết quả & Đánh giá Tự luận của Giáo viên
                      </h3>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                        {submitResult.essayGrade.graderName ? `Giáo viên chấm: ${submitResult.essayGrade.graderName}` : 'Giáo viên bộ môn'}
                        {submitResult.essayGrade.gradedAt && (
                          <span className="ml-2 font-normal text-slate-500">
                            • Chấm lúc: {new Date(submitResult.essayGrade.gradedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {typeof submitResult.essayGrade.score === 'number' && (
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Điểm tự luận</span>
                      <span className="px-3.5 py-1 rounded-xl text-sm font-black bg-indigo-600 text-white shadow-xs inline-block">
                        {submitResult.essayGrade.score} đ
                      </span>
                    </div>
                  )}
                </div>

                {submitResult.essayGrade.feedback && (
                  <div className="text-xs text-indigo-950 dark:text-indigo-200 space-y-1.5">
                    <span className="font-bold text-[10px] uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                      💬 Nhận xét tổng quát toàn bài thi:
                    </span>
                    <div className="p-4 bg-white/95 dark:bg-slate-900/95 rounded-2xl border border-indigo-100 dark:border-indigo-900 text-slate-800 dark:text-slate-100 font-medium leading-relaxed shadow-2xs">
                      <RichMathText value={submitResult.essayGrade.feedback} />
                    </div>
                  </div>
                )}

                {Array.isArray(submitResult.essayGrade.attachments) && submitResult.essayGrade.attachments.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                      📎 Tệp / Ảnh sửa bài giáo viên gửi kèm ({submitResult.essayGrade.attachments.length}):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {submitResult.essayGrade.attachments.map((att, aIdx) => {
                        const url = att.url || `/api/assignments/submission-assets/${att.assetId}/access`;
                        const isImg = (att.name || '').match(/\.(jpe?g|png|webp|gif)$/i) || att.assetKind === 'image' || url.match(/\.(jpe?g|png|webp|gif)/i);
                        return (
                          <a
                            key={att.assetId || aIdx}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center gap-3 p-2.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 hover:border-indigo-400 hover:shadow-md transition shadow-2xs"
                          >
                            {isImg ? (
                              <img
                                src={url}
                                alt={att.name || 'Ảnh sửa bài'}
                                className="w-12 h-12 rounded-xl object-cover border border-slate-100 dark:border-slate-800 shrink-0 group-hover:scale-105 transition-transform"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center text-xl shrink-0">
                                📄
                              </div>
                            )}
                            <div className="min-w-0 flex-1 text-left">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 transition-colors">
                                {att.name || `Tệp đính kèm ${aIdx + 1}`}
                              </p>
                              <p className="text-[10px] text-indigo-500 font-medium">Bấm để mở / tải về ↗</p>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!submitResult.essayGrade && hasEssayQuestions && !isOverdue && (
              <div className="text-left bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 text-xs">
                  <span>⏳ Phần thi tự luận đang chờ Giáo viên chấm điểm</span>
                </div>
                <p className="text-amber-700 dark:text-amber-400 text-[11px] leading-relaxed">
                  Điểm số hiển thị phía trên là điểm phần câu hỏi trắc nghiệm khách quan. Sau khi giáo viên hoàn tất chấm bài tự luận, nhận xét chi tiết và tệp sửa bài sẽ được cập nhật đầy đủ tại đây!
                </p>
              </div>
            )}

            {quiz.reviewPolicy === 'after_close' && !showAnswers && (
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                🔒 Đáp án chi tiết và giải thích sẽ được hiển thị sau khi đề thi kết thúc hạn nộp.
              </p>
            )}

            {quiz.reviewPolicy === 'never' && (
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                🔒 Đề thi được thiết lập bảo mật: không hiển thị đáp án và lời giải chi tiết.
              </p>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => (courseId && classId ? navigate(`/lms/courses/${courseId}/classes/${classId}/assignments`) : navigate('/lms/assignments'))}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-sm"
              >
                Quay lại danh sách bài tập
              </button>
            </div>
          </div>

          {/* Detailed Question Review (if reviewPolicy allows) */}
          {showAnswers && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                {isOverdue ? (
                  <>
                    <FiBookOpen className="text-rose-500" />
                    Tra cứu Đề thi, Đáp án & Lời giải chi tiết
                  </>
                ) : (
                  <>
                    <FiCheckCircle className="text-emerald-500" />
                    Đối chiếu đáp án & Lời giải chi tiết
                  </>
                )}
              </h2>

              <div className="space-y-6">
                {flattenedQuestions.map((q, idx) => {
                  const reviewItem = Array.isArray(submitResult.review)
                    ? submitResult.review.find((r) =>
                        String(r.questionId) === String(q.id) ||
                        String(r.questionId) === String(q.question?.id) ||
                        Number(r.position) === (idx + 1)
                      )
                    : null;
                  const studentAns = answers[q.id] ?? answers[q.question?.id] ?? reviewItem?.studentAnswer;
                  const manualGrade = isEssayQuestion(q.question);
                  const essayAnswer = manualGrade ? essayAnswerFor(answers, q.id) : null;
                  const correctAns = reviewItem?.correctAnswer || q.question.correctAnswer || q.question.correctAnswerKey;
                  const isCorrect = isOverdue
                    ? null
                    : manualGrade
                    ? null
                    : (reviewItem && reviewItem.isCorrect !== undefined ? reviewItem.isCorrect : Boolean(studentAns && correctAns && studentAns === correctAns));
                  const explanation = reviewItem?.explanation || q.question.explanation;

                  // Resolve student essay content & attachments from all available sources
                  const essayText = (typeof studentAns === 'object' && studentAns?.text)
                    ? studentAns.text
                    : (essayAnswer?.text || (typeof studentAns === 'string' ? studentAns : ''));

                  const essayAttachments = [
                    ...(essayAnswer?.attachments || []),
                    ...(Array.isArray(studentAns?.attachments) ? studentAns.attachments : []),
                    ...(Array.isArray(submitResult?.essay?.byQuestion?.[q.id]?.attachments) ? submitResult.essay.byQuestion[q.id].attachments : []),
                  ].filter((att, aIdx, self) => self.findIndex((t) => (t.assetId || t.id) === (att.assetId || att.id)) === aIdx);

                  const isEssayGraded = manualGrade && (
                    reviewItem?.isGraded ||
                    reviewItem?.earnedPoints !== undefined ||
                    Boolean(submitResult?.essayGrade?.gradesByQuestion?.[String(q.id)]) ||
                    Boolean(submitResult?.essayGrade?.score !== undefined)
                  );
                  const earnedEssayPoints = reviewItem?.earnedPoints ?? submitResult?.essayGrade?.gradesByQuestion?.[String(q.id)]?.score ?? 0;
                  const essayFeedback = reviewItem?.essayFeedback || submitResult?.essayGrade?.gradesByQuestion?.[String(q.id)]?.feedback || null;
                  const teacherCorrectionAttachments = reviewItem?.teacherAttachments || submitResult?.essayGrade?.gradesByQuestion?.[String(q.id)]?.attachments || [];

                  return (
                    <div
                      key={q.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        isOverdue
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40'
                          : manualGrade
                          ? isEssayGraded
                            ? 'border-indigo-200 dark:border-indigo-950/60 bg-indigo-50/15 dark:bg-indigo-950/10'
                            : 'border-amber-200 dark:border-amber-950/60 bg-amber-50/20 dark:bg-amber-950/10'
                          : isCorrect
                          ? 'border-emerald-200 dark:border-emerald-950/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                          : 'border-red-200 dark:border-red-950/60 bg-red-50/20 dark:bg-red-950/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-xs text-slate-500">
                          Câu {idx + 1}
                        </span>
                        {isOverdue ? (
                          manualGrade ? (
                            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              [Tự luận] Chưa nộp bài ({q.points || 1} đ)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Đáp án chuẩn: {correctAns || '—'} (+{q.points || 1} đ)
                            </span>
                          )
                        ) : manualGrade ? (
                          isEssayGraded ? (
                            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                              Đã chấm: {earnedEssayPoints}/{q.points || reviewItem?.points || 1} đ
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Chờ giáo viên chấm
                            </span>
                          )
                        ) : isCorrect ? (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            ✓ Đúng (+{reviewItem?.earnedPoints ?? q.points ?? 1} đ)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            ✕ Sai (0 đ)
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-4 leading-relaxed">
                        <RichMathText value={q.question.questionText} />
                      </div>

                      {manualGrade && isOverdue && (
                        <div className="mb-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <FiInfo className="text-base text-slate-500 shrink-0" />
                          <span>Câu hỏi tự luận: Chưa ghi nhận bài làm trực tuyến của bạn. Bạn hãy đối chiếu hướng dẫn giải chi tiết bên dưới nhé.</span>
                        </div>
                      )}

                      {manualGrade && !isOverdue && (
                        <div className="mb-4 space-y-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white/70 dark:bg-slate-950/40 p-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                              Bài làm đã nộp của bạn
                            </span>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                              {essayText || 'Không có nội dung văn bản.'}
                            </p>
                          </div>
                          {essayAttachments.length > 0 && (
                            <div className="space-y-2 pt-1 border-t border-amber-100 dark:border-amber-900/40">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Ảnh / Tệp bài làm bạn đã đính kèm ({essayAttachments.length}):
                              </span>
                              <div className="flex flex-wrap gap-2.5">
                                {essayAttachments.map((attachment) => {
                                  const url = attachment.url || `/api/assignments/submission-assets/${attachment.assetId}/access`;
                                  const isImg = (attachment.name || '').match(/\.(jpe?g|png|webp|gif)$/i) || attachment.assetKind === 'image' || url.match(/\.(jpe?g|png|webp|gif)/i);
                                  return (
                                    <a
                                      key={attachment.assetId || attachment.id}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="group relative flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-xs font-semibold text-blue-600 hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-xs"
                                    >
                                      {isImg ? (
                                        <img
                                          src={url}
                                          alt={attachment.name || 'Ảnh bài làm'}
                                          className="w-12 h-12 object-cover rounded-lg border border-slate-100 dark:border-slate-800"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <span className="w-12 h-12 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 text-lg">📄</span>
                                      )}
                                      <div className="pr-2 text-left">
                                        <p className="max-w-[150px] truncate font-medium text-slate-700 dark:text-slate-200">{attachment.name || `Tệp ${attachment.assetId}`}</p>
                                        <p className="text-[10px] text-blue-500 group-hover:underline">Xem / Tải ảnh</p>
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display teacher feedback & correction files if graded */}
                      {manualGrade && !isOverdue && isEssayGraded && (
                        <div className="space-y-3 mb-4">
                          {essayFeedback && (
                            <div className="p-4 rounded-2xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 text-xs text-purple-950 dark:text-purple-200 space-y-1.5 shadow-xs">
                              <span className="font-bold uppercase tracking-wider text-[10px] text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                                ✍️ Lời nhận xét & Chữa câu này của giáo viên:
                              </span>
                              <div className="text-sm text-purple-900 dark:text-purple-100 font-normal">
                                <RichMathText value={essayFeedback} />
                              </div>
                            </div>
                          )}

                          {Array.isArray(teacherCorrectionAttachments) && teacherCorrectionAttachments.length > 0 && (
                            <div className="p-3.5 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 space-y-2">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                📎 Tệp / Ảnh sửa bài của giáo viên ({teacherCorrectionAttachments.length}):
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {teacherCorrectionAttachments.map((att, aIdx) => {
                                  const url = att.url || `/api/assignments/submission-assets/${att.assetId}/access`;
                                  const isImg = (att.name || '').match(/\.(jpe?g|png|webp|gif)$/i) || att.assetKind === 'image' || url.match(/\.(jpe?g|png|webp|gif)/i);
                                  return (
                                    <a
                                      key={att.assetId || aIdx}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="group relative flex items-center gap-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 p-2 text-xs font-semibold text-purple-700 hover:border-purple-400 dark:hover:border-purple-500 transition-all shadow-xs"
                                    >
                                      {isImg ? (
                                        <img
                                          src={url}
                                          alt={att.name || 'Ảnh sửa bài'}
                                          className="w-12 h-12 object-cover rounded-lg border border-purple-100 dark:border-purple-900"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <span className="w-12 h-12 flex items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 text-lg">📄</span>
                                      )}
                                      <div className="pr-2 text-left min-w-0 flex-1">
                                        <p className="truncate font-medium text-slate-700 dark:text-slate-200">{att.name || `Tệp sửa bài ${aIdx + 1}`}</p>
                                        <p className="text-[10px] text-purple-500 group-hover:underline">Mở / Tải tệp</p>
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display options */}
                      {!manualGrade && (q.question.options || q.question.answers) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                          {(q.question.options || q.question.answers).map((opt) => {
                            const isChosen = studentAns === opt.key;
                            const isActualCorrect = correctAns === opt.key;
                            return (
                              <div
                                key={opt.key}
                                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                                  isActualCorrect
                                    ? 'border-emerald-500 bg-emerald-100/60 dark:bg-emerald-950/60 font-bold text-emerald-900 dark:text-emerald-200'
                                    : !isOverdue && isChosen
                                    ? 'border-red-400 bg-red-100/60 dark:bg-red-950/60 text-red-900 dark:text-red-200 line-through'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <span className={`font-bold ${isActualCorrect ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                                  {isActualCorrect ? '✓ ' : ''}{opt.key}.
                                </span>
                                <RichMathText value={opt.text} />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Explanation */}
                      {explanation && (
                        <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                          <span className="font-bold uppercase tracking-wide text-[10px] text-blue-700 dark:text-blue-300">
                            💡 {manualGrade ? 'Hướng dẫn giải / Đáp án mẫu:' : 'Lời giải chi tiết:'}
                          </span>
                          <div>
                            <RichMathText value={explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] flex h-dvh flex-col overflow-hidden bg-slate-100 select-none dark:bg-slate-950">
      {/* Sticky Header with Timer & Autosave Status */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2 sm:py-2.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 uppercase shrink-0">
              {quiz.activityScope === 'session'
                ? 'Bài trên lớp'
                : quiz.activityScope === 'homework'
                ? 'Bài tập về nhà'
                : 'Bài kiểm tra'}
            </span>
            <h1 className="text-xs sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate max-w-[110px] xs:max-w-[160px] sm:max-w-xs md:max-w-md">
              {quiz.title}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Autosave status indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              {autosaveStatus === 'saving' ? (
                <span className="flex items-center gap-1 text-blue-600">
                  <FiSave className="animate-spin" size={12} /> Đang lưu...
                </span>
              ) : autosaveStatus === 'saved' ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <FiCheck size={12} /> {lastSavedTime ? `Đã lưu lúc ${lastSavedTime}` : 'Đã lưu'}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600">
                  <FiSave size={12} /> Đã lưu máy
                </span>
              )}
            </div>

            {/* Countdown Timer */}
            <div
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border font-mono font-bold text-xs sm:text-sm shadow-sm transition-colors ${
                timeLeft <= 300
                  ? 'bg-red-500 text-white border-red-600 animate-pulse'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              }`}
            >
              <FiClock size={14} />
              <span>{formatTimer(timeLeft)}</span>
            </div>

            {/* Mobile Palette Toggle */}
            <button
              type="button"
              onClick={() => setShowMobilePalette(!showMobilePalette)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1"
              title="Bảng câu hỏi"
            >
              <FiGrid size={14} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:block p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Toàn màn hình"
            >
              {isFullscreen ? <FiMinimize size={14} /> : <FiMaximize size={14} />}
            </button>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              disabled={submitting}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
            >
              Nộp bài
            </button>
          </div>
        </div>
      </header>

      {/* Cheating / Tab Switching Warning Banner */}
      {showViolationBanner && (
        <div className="bg-amber-500 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FiAlertCircle size={15} />
              Cảnh báo gian lận: Bạn vừa chuyển tab hoặc rời màn hình làm bài ({tabViolations} lần). Vui lòng tập trung làm bài!
            </span>
            <button
              type="button"
              onClick={() => setShowViolationBanner(false)}
              className="text-white hover:opacity-80 font-bold ml-4"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Main Examination Layout */}
      <main className="min-h-0 flex-1 max-w-7xl w-full mx-auto overflow-y-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left / Center: Question Paper Workspace */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-sm min-h-[460px] flex flex-col justify-between">
          {currentItem ? (
            <div className="space-y-4 flex-1">
              {/* Question Item Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold text-xs uppercase tracking-wide">
                    {currentItem.kind === 'reading_group'
                      ? 'Nhóm Đọc hiểu'
                      : currentItem.kind === 'fill_blank_group'
                      ? 'Nhóm Điền từ'
                      : `Câu hỏi #${currentItemIndex + 1}`}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    (Mục {currentItemIndex + 1} / {quiz.items.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Bilingual toggle if Chinese text exists */}
                  {(currentItem.questionTextCn || currentItem.passageText) && (
                    <button
                      type="button"
                      onClick={() => setShowBilingual(!showBilingual)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    >
                      {showBilingual ? <FiEyeOff size={11} /> : <FiEye size={11} />}
                      {showBilingual ? 'Ẩn tiếng Trung' : 'Hiện tiếng Trung'}
                    </button>
                  )}

                  {/* Flag button */}
                  {currentItem.kind === 'question' && (
                    <button
                      type="button"
                      onClick={() => handleToggleFlag(currentItem.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        flagged[currentItem.id]
                          ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <FiFlag size={12} className={flagged[currentItem.id] ? 'fill-current' : ''} />
                      {flagged[currentItem.id] ? 'Đã đánh dấu' : 'Đánh dấu'}
                    </button>
                  )}
                </div>
              </div>

              {/* 1. SINGLE CHOICE QUESTION VIEW */}
              {currentItem.kind === 'question' && (
                <div className="space-y-4">
                  {/* Statement */}
                  <div className="text-sm sm:text-base text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
                    <RichMathText value={currentItem.questionText} />
                  </div>

                  {showBilingual && currentItem.questionTextCn && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                      <span className="font-bold text-slate-400 mr-2">中文:</span>
                      <RichMathText value={currentItem.questionTextCn} />
                    </div>
                  )}

                  {/* Optional Image */}
                  {currentItem.imageUrl && (
                    <div className="max-w-md mx-auto my-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white">
                      <img src={currentItem.imageUrl} alt="Hình minh họa" className="max-h-64 mx-auto object-contain" />
                    </div>
                  )}

                  {/* Answer workspace */}
                  {isEssayQuestion(currentItem) ? (
                    <EssayAnswerInput
                      questionId={currentItem.id}
                      value={essayAnswerFor(answers, currentItem.id)}
                      onChange={(value) => handleSelectAnswer(currentItem.id, value)}
                    />
                  ) : (
                  <div className="grid grid-cols-1 gap-2 pt-1 md:grid-cols-2">
                    {(currentItem.options || currentItem.answers || []).map((opt) => {
                      const isSelected = answers[currentItem.id] === opt.key;
                      return (
                        <div
                          key={opt.key}
                          onClick={() => handleSelectAnswer(currentItem.id, opt.key)}
                          className={`min-h-14 p-2.5 sm:p-3 rounded-xl border text-xs sm:text-sm cursor-pointer transition-all flex items-start gap-2.5 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30 font-medium shadow-sm'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {opt.key}
                          </span>
                          <div className="min-w-0 flex-1">
                            <RichMathText value={opt.text} />
                            {showBilingual && opt.textCn && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                <RichMathText value={opt.textCn} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}

              {/* 2. READING PASSAGE GROUP VIEW */}
              {currentItem.kind === 'reading_group' && (
                <div className="space-y-6">
                  {/* Shared Passage */}
                  <div className="p-5 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 space-y-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                      📖 Đoạn văn đọc hiểu
                    </span>
                    <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed max-h-72 overflow-y-auto pr-2">
                      <RichMathText value={currentItem.passageText} />
                    </div>
                    {currentItem.passageImageUrl && (
                      <img
                        src={currentItem.passageImageUrl}
                        alt="Hình đoạn văn"
                        className="max-h-56 rounded-lg mx-auto border"
                      />
                    )}
                  </div>

                  {/* Sub-questions List */}
                  <div className="space-y-6 divide-y divide-slate-100 dark:divide-slate-800">
                    {(currentItem.questions || currentItem.subQuestions || []).map((subQ, subIdx) => {
                      const subId = subQ.id || subQ._localId || `rq-${currentItemIndex}-${subIdx}`;
                      return (
                        <div key={subId} className="pt-4 first:pt-0 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-blue-600">
                              Câu {subIdx + 1}:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleFlag(subId)}
                              className={`p-1 rounded text-xs ${
                                flagged[subId] ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title="Đánh dấu"
                            >
                              <FiFlag size={12} className={flagged[subId] ? 'fill-current' : ''} />
                            </button>
                          </div>

                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed">
                            <RichMathText value={subQ.questionText} />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(subQ.options || subQ.answers || []).map((opt) => {
                              const isSelected = answers[subId] === opt.key;
                              return (
                                <div
                                  key={opt.key}
                                  onClick={() => handleSelectAnswer(subId, opt.key)}
                                  className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center gap-2.5 transition-colors ${
                                    isSelected
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-bold ring-1 ring-blue-500'
                                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[11px]">
                                    {opt.key}
                                  </span>
                                  <div className="flex-1">
                                    <RichMathText value={opt.text} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. FILL BLANK GROUP VIEW */}
              {currentItem.kind === 'fill_blank_group' && (
                <div className="space-y-6">
                  {/* Shared Cloze Passage / Notes */}
                  <div className="p-5 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      📝 Đoạn văn điền từ
                    </span>
                    <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      <RichMathText value={currentItem.passageText} />
                    </div>

                    {/* Word pool A-F */}
                    <div className="pt-2 border-t border-emerald-100 dark:border-emerald-900/50">
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block mb-2">
                        Kho từ chọn:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(currentItem.linkedOptions || []).map((opt) => (
                          <div
                            key={opt.key}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 shadow-sm"
                          >
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                              {opt.key}
                            </span>
                            <span>{opt.text || opt.textCn}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Blanks inputs */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Chọn đáp án cho từng chỗ trống:
                    </span>
                    {(currentItem.questions || currentItem.subItems || []).map((subItem, idx) => {
                      const subId = subItem.id || subItem._localId || `fb-${currentItemIndex}-${idx}`;
                      return (
                        <div
                          key={subId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40"
                        >
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] flex items-center justify-center font-bold">
                              #{idx + 1}
                            </span>
                            <span className="max-w-md truncate">
                              {subItem.questionText || `Chỗ trống [${idx + 1}]`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={answers[subId] || ''}
                              onChange={(e) => handleSelectAnswer(subId, e.target.value)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-slate-100"
                            >
                              <option value="">-- Chọn từ --</option>
                              {(currentItem.linkedOptions || []).map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                  {opt.key}. {opt.text || opt.textCn}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-400">Không tìm thấy nội dung câu hỏi.</div>
          )}

          {/* Bottom Pagination Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={currentItemIndex === 0}
              onClick={() => {
                setCurrentItemIndex((prev) => Math.max(0, prev - 1));
                setActiveSubIndex(0);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <FiChevronLeft size={14} /> Mục trước
            </button>

            <button
              type="button"
              disabled={currentItemIndex === quiz.items.length - 1}
              onClick={() => {
                setCurrentItemIndex((prev) => Math.min(quiz.items.length - 1, prev + 1));
                setActiveSubIndex(0);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shadow-sm"
            >
              Mục tiếp <FiChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Right Sidebar: Palette Grid */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Bảng câu hỏi ({flattenedQuestions.length})
            </h3>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {answeredCount}/{flattenedQuestions.length} đã làm
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((answeredCount / Math.max(1, flattenedQuestions.length)) * 100)}%`,
              }}
            ></div>
          </div>

          {/* Filters */}
          <div className="flex gap-1 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-semibold">
            {[
              { key: 'all', label: `Tất cả (${flattenedQuestions.length})` },
              { key: 'unanswered', label: `Chưa làm (${unansweredCount})` },
              { key: 'flagged', label: `Đã cắm cờ (${flaggedCount})` },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setPaletteFilter(f.key)}
                className={`flex-1 py-1 rounded-lg transition-colors ${
                  paletteFilter === f.key
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Question Grid */}
          <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
            {flattenedQuestions
              .filter((q) => {
                if (paletteFilter === 'unanswered') return !hasAnswerContent(q.question, answers);
                if (paletteFilter === 'flagged') return Boolean(flagged[q.id]);
                return true;
              })
              .map((q) => {
                const hasAnswer = hasAnswerContent(q.question, answers);
                const isFlagged = Boolean(flagged[q.id]);
                const isCurrent =
                  currentItemIndex === q.itemIdx &&
                  (q.kind === 'single_choice' || activeSubIndex === q.subIdx);

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleJumpToQuestion(q)}
                    className={`h-10 rounded-xl font-bold text-xs relative flex items-center justify-center transition-all ${
                      isCurrent
                        ? 'ring-2 ring-blue-500 bg-blue-600 text-white shadow-sm'
                        : hasAnswer
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {q.number}
                    {isFlagged && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500"></span>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Palette Legend */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-blue-600"></span> Đang làm
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-500"></span> Đã chọn đáp án
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-slate-100 dark:bg-slate-800"></span> Chưa trả lời
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-amber-500"></span> Đã cắm cờ
            </div>
          </div>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto text-2xl">
              <FiCheckCircle size={28} />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Xác nhận nộp bài thi
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Sau khi nộp, bạn sẽ không thể thay đổi đáp án đã chọn.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Số câu đã hoàn thành:</span>
                <span className="font-bold text-emerald-600">{answeredCount} / {flattenedQuestions.length}</span>
              </div>
              {unansweredCount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Số câu chưa trả lời:</span>
                  <span className="font-bold">{unansweredCount}</span>
                </div>
              )}
              {flaggedCount > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Số câu đã cắm cờ xem lại:</span>
                  <span className="font-bold text-amber-600">{flaggedCount}</span>
                </div>
              )}
            </div>

            {(() => {
              const essayQuestions = flattenedQuestions.filter((q) => isEssayQuestion(q.question));
              const missingEssay = essayQuestions.filter((q) => {
                const essay = essayAnswerFor(answers, q.id);
                return (essay.attachments?.length || 0) === 0 && !essay.text?.trim() && !essay.notes?.trim();
              });
              if (missingEssay.length === 0) return null;
              return (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl text-left text-xs space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                    <FiAlertTriangle className="shrink-0 text-base text-amber-600" />
                    <span>Lưu ý quan trọng: Chưa nộp ảnh tự luận!</span>
                  </div>
                  <p className="text-amber-700 dark:text-amber-400 leading-relaxed text-[11px]">
                    Bạn có <strong>{missingEssay.length} câu tự luận</strong> (Câu {missingEssay.map((q) => q.number).join(', ')}) chưa đính kèm ảnh bài làm hoặc nội dung tự luận. Sau khi nộp bài, bạn sẽ <strong>không thể bổ sung ảnh hoặc sửa bài làm</strong> được nữa!
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50"
              >
                Tiếp tục làm bài
              </button>
              <button
                type="button"
                onClick={executeSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                {submitting ? 'Đang nộp...' : 'Xác nhận nộp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Palette Modal Drawer */}
      {showMobilePalette && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-sm lg:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FiGrid className="text-blue-600" /> Bảng câu hỏi ({flattenedQuestions.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-1 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-semibold">
              {[
                { key: 'all', label: `Tất cả (${flattenedQuestions.length})` },
                { key: 'unanswered', label: `Chưa làm (${unansweredCount})` },
                { key: 'flagged', label: `Cắm cờ (${flaggedCount})` },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setPaletteFilter(f.key)}
                  className={`flex-1 py-1 rounded-lg transition-colors ${
                    paletteFilter === f.key
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Question Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
              {flattenedQuestions
                .filter((q) => {
                  if (paletteFilter === 'unanswered') return !hasAnswerContent(q.question, answers);
                  if (paletteFilter === 'flagged') return Boolean(flagged[q.id]);
                  return true;
                })
                .map((q) => {
                  const hasAnswer = hasAnswerContent(q.question, answers);
                  const isFlagged = Boolean(flagged[q.id]);
                  const isCurrent =
                    currentItemIndex === q.itemIdx &&
                    (q.kind === 'single_choice' || activeSubIndex === q.subIdx);

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        handleJumpToQuestion(q);
                        setShowMobilePalette(false);
                      }}
                      className={`h-10 rounded-xl font-bold text-xs relative flex items-center justify-center transition-all ${
                        isCurrent
                          ? 'ring-2 ring-blue-500 bg-blue-600 text-white shadow-sm'
                          : hasAnswer
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {q.number}
                      {isFlagged && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500"></span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
