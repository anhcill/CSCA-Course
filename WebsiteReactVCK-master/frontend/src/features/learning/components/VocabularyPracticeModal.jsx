import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Lottie } from 'lottie-react';
import {
  X, Volume2, RotateCcw, Check, Sparkles, Trophy,
  Eye, EyeOff, Layers, HelpCircle,
  Flame, Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import { speakChinese } from '../utils/speech';

const FIREWORK_COLORS = ['#f59e0b', '#38bdf8', '#34d399', '#fb7185', '#a78bfa', '#facc15'];
const FIREWORK_PARTICLES = Array.from({ length: 28 }, (_, index) => {
  const angle = (index % 14) * ((Math.PI * 2) / 14);
  const distance = 54 + (index % 4) * 13;

  return {
    color: FIREWORK_COLORS[index % FIREWORK_COLORS.length],
    delay: (index % 7) * 0.05 + (index >= 14 ? 0.45 : 0),
    left: index < 14 ? '24%' : '76%',
    top: index < 14 ? '38%' : '28%',
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
});

function CelebrationFireworks({ reduceMotion }) {
  if (reduceMotion) {
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Sparkles className="absolute left-[12%] top-[24%] h-7 w-7 text-amber-400" />
        <Sparkles className="absolute right-[12%] top-[18%] h-8 w-8 text-sky-400" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {FIREWORK_PARTICLES.map((particle, index) => (
        <motion.span
          key={`${particle.left}-${index}`}
          className="absolute h-2 w-2 rounded-full shadow-sm"
          style={{
            backgroundColor: particle.color,
            left: particle.left,
            top: particle.top,
          }}
          initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1.2, 1, 0.3],
            x: [0, particle.x * 0.35, particle.x],
            y: [0, particle.y * 0.35, particle.y + 24],
          }}
          transition={{
            duration: 1.25,
            delay: particle.delay,
            ease: 'easeOut',
            repeat: 1,
            repeatDelay: 0.35,
          }}
        />
      ))}
    </div>
  );
}

export default function VocabularyPracticeModal({
  isOpen,
  onClose,
  session,
  onComplete,
}) {
  const reduceMotion = useReducedMotion();
  const autoSpokenWordIds = useRef(new Set());
  const [mode, setMode] = useState('flashcard'); // 'flashcard' | 'quiz'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPinyin, setShowPinyin] = useState(true);
  const [masteredIds, setMasteredIds] = useState([]);
  const [learningIds, setLearningIds] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [streak, setStreak] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState(null);
  const [quizAnswerChecked, setQuizAnswerChecked] = useState(false);

  // Vocabulary list for practice
  const words = useMemo(() => session?.vocabularies || [], [session]);
  const currentWord = words[currentIndex];

  // Reset state when session opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowPinyin(true);
      setMasteredIds([]);
      setLearningIds([]);
      setIsFinished(false);
      setStreak(0);
      setSelectedQuizOption(null);
      setQuizAnswerChecked(false);
      autoSpokenWordIds.current.clear();
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (!isOpen || isFinished || !currentWord) return undefined;

    const wordKey = String(currentWord.id ?? `${currentIndex}-${currentWord.term}`);
    if (autoSpokenWordIds.current.has(wordKey)) return undefined;

    const timerId = window.setTimeout(() => {
      if (autoSpokenWordIds.current.has(wordKey)) return;
      autoSpokenWordIds.current.add(wordKey);
      speakChinese(currentWord.term);
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [currentIndex, currentWord, isFinished, isOpen]);

  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [isOpen]);

  const handleNextWord = useCallback((isMastered) => {
    const wordId = currentWord.id;
    if (isMastered) {
      setMasteredIds((prev) => [...prev.filter((id) => id !== wordId), wordId]);
      setLearningIds((prev) => prev.filter((id) => id !== wordId));
      setStreak((s) => s + 1);
    } else {
      setLearningIds((prev) => [...prev.filter((id) => id !== wordId), wordId]);
      setMasteredIds((prev) => prev.filter((id) => id !== wordId));
      setStreak(0);
    }

    if (currentIndex + 1 < words.length) {
      setIsFlipped(false);
      setSelectedQuizOption(null);
      setQuizAnswerChecked(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsFinished(true);
      if (onComplete) {
        onComplete({
          masteredIds: isMastered ? [...masteredIds, wordId] : masteredIds,
          learningIds: !isMastered ? [...learningIds, wordId] : learningIds,
        });
      }
    }
  }, [currentIndex, currentWord, learningIds, masteredIds, onComplete, words.length]);

  const handleMark = useCallback((isMastered) => {
    handleNextWord(isMastered);
  }, [handleNextWord]);

  useEffect(() => {
    if (!isOpen || isFinished) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.code === 'Space') {
        event.preventDefault();
        setIsFlipped((previous) => !previous);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleMark(false);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleMark(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMark, isFinished, isOpen, onClose]);

  // Quiz 4 options generation
  const quizOptions = useMemo(() => {
    if (!currentWord || mode !== 'quiz') return [];
    const wrongOptions = words
      .filter((w) => w.id !== currentWord.id)
      .map((w) => w.meaning);
    // Shuffle wrong options
    const shuffledWrong = [...wrongOptions].sort(() => Math.random() - 0.5).slice(0, 3);
    const all = [...shuffledWrong, currentWord.meaning].sort(() => Math.random() - 0.5);
    return all;
  }, [currentWord, words, mode]);

  const handleSelectQuiz = (option) => {
    if (quizAnswerChecked) return;
    setSelectedQuizOption(option);
    setQuizAnswerChecked(true);

    const isCorrect = option === currentWord.meaning;
    if (isCorrect) {
      toast.success('Chính xác!', { duration: 1000 });
    } else {
      toast.error(`Chưa đúng! Đáp án là: ${currentWord.meaning}`, { duration: 2500 });
    }

    setTimeout(() => {
      handleNextWord(isCorrect);
    }, 1200);
  };

  const scorePercent = Math.round((masteredIds.length / words.length) * 100);

  if (!isOpen || !session || words.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
                {session.chapter}
              </p>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[280px] sm:max-w-md">
                {session.sessionTitle}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isFinished && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setMode('flashcard'); setIsFlipped(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                    mode === 'flashcard'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" /> Lật thẻ
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('quiz'); setIsFlipped(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                    mode === 'quiz'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <HelpCircle className="h-3.5 w-3.5" /> Trắc nghiệm
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar & Streak */}
        {!isFinished && (
          <div className="px-5 pt-3 pb-1 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-400">
              <span>Tiến độ:</span>
              <span className="text-blue-600 dark:text-sky-400 font-bold">
                {currentIndex + 1} / {words.length}
              </span>
            </div>
            {streak > 1 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-black animate-pulse">
                <Flame className="h-3.5 w-3.5 fill-current" /> Combo {streak}x
              </span>
            )}
          </div>
        )}
        {!isFinished && (
          <div className="mx-5 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 rounded-full"
              style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
            />
          </div>
        )}

        {/* Modal Main Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <AnimatePresence mode="wait">
            {!isFinished ? (
              mode === 'flashcard' ? (
                /* === FLASHCARD 3D MODE === */
                <motion.div
                  key={`fc-${currentIndex}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex flex-col items-center"
                >
                  <div
                    onClick={() => setIsFlipped((prev) => !prev)}
                    className="group relative w-full min-h-[300px] sm:min-h-[340px] cursor-pointer rounded-3xl border-2 border-slate-200/90 dark:border-slate-800 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-800/40 dark:to-slate-900/90 p-6 sm:p-8 flex flex-col justify-between shadow-xl transition-all hover:border-blue-300 dark:hover:border-blue-700/60 select-none"
                    style={{ perspective: 1000 }}
                  >
                    {/* Top card actions */}
                    <div className="flex items-center justify-between w-full">
                      <span className="px-3 py-1 rounded-lg text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                        {currentWord.partOfSpeech || 'Từ vựng'}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowPinyin((prev) => !prev);
                          }}
                          className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                          title="Ẩn/Hiện Pinyin"
                        >
                          {showPinyin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span className="text-[10px]">{showPinyin ? 'Ẩn Pinyin' : 'Hiện Pinyin'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakChinese(currentWord.term);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/30 hover:bg-blue-700 transition"
                          title="Nghe phát âm chuẩn"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Center Word Content */}
                    <div className="flex flex-1 items-center justify-center py-4 text-center">
                      {!isFlipped ? (
                        /* Front side */
                        <div className="space-y-3">
                          <h1 className="text-5xl sm:text-6xl font-black text-slate-900 dark:text-white tracking-wider font-sans">
                            {currentWord.term}
                          </h1>
                          {showPinyin && (
                            <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-sky-400">
                              {currentWord.pinyin}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 dark:text-slate-500 pt-2 flex items-center justify-center gap-1.5">
                            <span>Chạm để lật thẻ xem nghĩa (hoặc ấn Phím Cách)</span>
                          </p>
                        </div>
                      ) : (
                        /* Back side */
                        <div className="w-full space-y-4 text-center">
                          <div className="flex min-h-28 flex-col items-center justify-center">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Nghĩa tiếng Việt & Hán Việt
                            </p>
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                              {currentWord.meaning}
                            </h2>
                            {currentWord.sinoVietnamese && (
                              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                Âm Hán Việt: <span className="text-blue-600 dark:text-sky-300 font-bold">{currentWord.sinoVietnamese}</span>
                              </p>
                            )}
                          </div>

                          {currentWord.exampleSentence && (
                            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 p-4 space-y-1.5 text-left">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">
                                  Ví dụ thực tế (CSCA / Đề thi)
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    speakChinese(currentWord.exampleSentence);
                                  }}
                                  className="text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 transition"
                                  title="Nghe câu ví dụ"
                                >
                                  <Volume2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                                {currentWord.exampleSentence}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {currentWord.exampleMeaning}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom hint */}
                    <div className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                      {isFlipped ? 'Ấn tiếp để quay lại mặt trước' : 'Mẹo: Dùng phím mũi tên ← (Chưa thuộc) và → (Đã thuộc)'}
                    </div>
                  </div>

                  {/* Action buttons (Chưa nhớ / Đã nhớ) */}
                  <div className="mt-5 grid grid-cols-2 gap-3.5 w-full">
                    <button
                      type="button"
                      onClick={() => handleMark(false)}
                      className="group flex items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 px-5 py-3.5 text-sm font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition shadow-sm"
                    >
                      <RotateCcw className="h-4 w-4 transition group-hover:-rotate-45" />
                      <span>Chưa thuộc (←)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMark(true)}
                      className="group flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition"
                    >
                      <Check className="h-4 w-4 transition group-hover:scale-125" />
                      <span>Đã thuộc (→)</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* === QUIZ MODE === */
                <motion.div
                  key={`quiz-${currentIndex}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 p-6 text-center space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Chọn nghĩa tiếng Việt chính xác
                    </span>
                    <div className="flex items-center justify-center gap-3">
                      <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white">
                        {currentWord.term}
                      </h1>
                      <button
                        type="button"
                        onClick={() => speakChinese(currentWord.term)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-700 transition"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-base font-bold text-blue-600 dark:text-sky-400">
                      {currentWord.pinyin}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quizOptions.map((option, idx) => {
                      const isSelected = selectedQuizOption === option;
                      const isCorrect = option === currentWord.meaning;
                      let btnStyle = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-slate-750';

                      if (quizAnswerChecked) {
                        if (isCorrect) {
                          btnStyle = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/30';
                        } else if (isSelected) {
                          btnStyle = 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/30';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={quizAnswerChecked}
                          onClick={() => handleSelectQuiz(option)}
                          className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left font-bold transition shadow-sm ${btnStyle}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 text-xs font-black">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-sm truncate">{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )
            ) : (
              /* === CELEBRATION / COMPLETION SCREEN WITH OWL PET === */
              <motion.div
                key="celebration"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative text-center py-4 flex flex-col items-center"
              >
                <CelebrationFireworks reduceMotion={reduceMotion} />

                {/* Lottie Owl Animation */}
                <div className="relative z-10 w-44 h-44 sm:w-52 sm:h-52 my-1">
                  <Lottie
                    src="/owl.json"
                    autoplay
                    loop
                    style={{ width: '100%', height: '100%' }}
                  />
                  <div className="absolute -top-1 -right-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 animate-bounce">
                    <Trophy className="h-5 w-5" />
                  </div>
                </div>

                {/* Score & Praise */}
                <div className="relative z-10 space-y-1.5 mt-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                    <Award className="h-3.5 w-3.5" /> Hoàn thành buổi luyện tập!
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {scorePercent >= 90 ? 'Xuất sắc! Quá đỉnh!' : scorePercent >= 60 ? 'Làm tốt lắm!' : 'Cố lên nào bạn ơi!'}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                    {scorePercent >= 90
                      ? 'Bé Cú Moly rất tự hào về bạn! Bạn đã nắm vững hầu hết từ vựng của buổi học này.'
                      : scorePercent >= 60
                      ? 'Bạn đã nhớ được đa số các từ trọng tâm. Ôn lại các từ chưa thuộc để đạt 100% nhé!'
                      : 'Từ vựng chuyên ngành CSCA hơi thử thách một chút. Cùng Cú luyện lại một lần nữa nha!'}
                  </p>
                </div>

                {/* Stat badges */}
                <div className="relative z-10 grid grid-cols-3 gap-3 w-full max-w-md my-6">
                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng từ</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{words.length}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-center">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Đã thuộc</p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{masteredIds.length}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-200/80 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30 p-3 text-center">
                    <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Cần ôn lại</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">{learningIds.length}</p>
                  </div>
                </div>

                {/* Bottom actions */}
                <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
                  {learningIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentIndex(0);
                        setIsFlipped(false);
                        setIsFinished(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-blue-600 text-blue-600 dark:text-blue-300 py-3 text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-950/50 transition"
                    >
                      <RotateCcw className="h-4 w-4" /> Luyện lại
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition"
                  >
                    <Check className="h-4 w-4" /> Hoàn thành
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
