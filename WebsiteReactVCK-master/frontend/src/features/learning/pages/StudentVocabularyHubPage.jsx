import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookA, Calendar, ChevronDown, GraduationCap, Play,
  Search, Sparkles, Star, Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  fetchVocabularySessions,
  submitVocabularyPractice,
  toggleVocabularyStar,
} from '../../api/lmsClient';
import { speakChinese } from '../utils/speech';
import VocabularyPracticeModal from '../components/VocabularyPracticeModal';

export default function StudentVocabularyHubPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'NEED_REVIEW' | 'COMPLETED'
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [activePracticeSession, setActivePracticeSession] = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchVocabularySessions();
      setSessions(Array.isArray(response?.data?.sessions) ? response.data.sessions : []);
    } catch (requestError) {
      setSessions([]);
      setError(requestError.message || 'Không thể tải danh sách từ vựng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Overall Statistics Calculation
  const stats = useMemo(() => {
    let totalWords = 0;
    let masteredCount = 0;
    let learningCount = 0;
    let starredCount = 0;

    sessions.forEach((s) => {
      s.vocabularies.forEach((w) => {
        totalWords += 1;
        if (w.status === 'mastered') masteredCount += 1;
        else if (w.status === 'learning') learningCount += 1;
        if (w.isStarred) starredCount += 1;
      });
    });

    const masteryRate = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

    return { totalWords, masteredCount, learningCount, starredCount, masteryRate };
  }, [sessions]);

  // Distinct courses for filter
  const courses = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      if (!map.has(s.courseId)) {
        map.set(s.courseId, s.courseTitle);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [sessions]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Course filter
      if (selectedCourse !== 'ALL' && s.courseId !== selectedCourse) return false;

      // Status filter
      const total = s.vocabularies.length;
      const mastered = s.vocabularies.filter((w) => w.status === 'mastered').length;
      const isCompleted = total > 0 && mastered === total;

      if (statusFilter === 'COMPLETED' && !isCompleted) return false;
      if (statusFilter === 'NEED_REVIEW' && isCompleted) return false;

      // Search query (term, pinyin, meaning, chapter, sessionTitle)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesSession = (
          s.chapter.toLowerCase().includes(query) ||
          s.sessionTitle.toLowerCase().includes(query) ||
          s.formattedDate.toLowerCase().includes(query)
        );
        const matchesWords = s.vocabularies.some((w) => (
          w.term.toLowerCase().includes(query) ||
          w.pinyin.toLowerCase().includes(query) ||
          w.meaning.toLowerCase().includes(query) ||
          (w.sinoVietnamese && w.sinoVietnamese.toLowerCase().includes(query))
        ));
        return matchesSession || matchesWords;
      }

      return true;
    });
  }, [sessions, selectedCourse, statusFilter, searchQuery]);

  const handleToggleStar = async (sessionId, wordId) => {
    try {
      const response = await toggleVocabularyStar(wordId);
      const isStarred = Boolean(response?.data?.isStarred);
      setSessions((current) => current.map((session) => (
        String(session.sessionId) === String(sessionId)
          ? {
              ...session,
              vocabularies: session.vocabularies.map((word) => (
                String(word.id) === String(wordId) ? { ...word, isStarred } : word
              )),
            }
          : session
      )));
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể cập nhật từ đã đánh dấu.');
    }
  };

  const handlePracticeComplete = async (results) => {
    if (!activePracticeSession) return;
    try {
      const response = await submitVocabularyPractice(activePracticeSession.sessionId, results);
      const xpAwarded = Number(response?.data?.gamification?.xp || 0);
      if (xpAwarded > 0) toast.success(`Đã lưu tiến độ và nhận +${xpAwarded} XP!`);
      await loadSessions();
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể lưu kết quả luyện tập.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Góc học từ vựng chuyên ngành CSCA & Tiếng Trung</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Từ Vựng Theo Buổi Học
            </h1>
            <p className="text-sm text-blue-100 leading-relaxed">
              Theo dõi và rèn luyện thuật ngữ theo từng ngày học và chương học. Luyện tập với Flashcard 3D và Trắc nghiệm phản xạ cùng Bé Cú Moly!
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 shrink-0">
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">Tổng từ</p>
              <p className="text-2xl font-black mt-0.5">{stats.totalWords}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">Đã thuộc</p>
              <p className="text-2xl font-black text-emerald-300 mt-0.5">{stats.masteredCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">Đang học</p>
              <p className="text-2xl font-black text-amber-300 mt-0.5">{stats.learningCount}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-center">
              <p className="text-[11px] font-semibold text-purple-200 uppercase tracking-wider">Thành thạo</p>
              <p className="text-2xl font-black text-white mt-0.5">{stats.masteryRate}%</p>
            </div>
          </div>
        </div>

        {/* Decorative background shapes */}
        <div className="pointer-events-none absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -top-12 -left-12 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 sm:p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo từ vựng, pinyin, nghĩa, tên chương, ngày học..."
            className="w-full h-10 pl-10 pr-4 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Course filter select */}
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">Tất cả khóa học</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>

          {/* Status filter buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('NEED_REVIEW')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'NEED_REVIEW'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Cần luyện tập
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'COMPLETED'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Đã thuộc
            </button>
          </div>
        </div>
      </div>

      {/* Session Cards List */}
      <div className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 p-12 text-center text-sm font-semibold text-slate-500">
            Đang tải từ vựng theo buổi học...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-8 text-center">
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{error}</p>
            <button type="button" onClick={loadSessions} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white">
              Thử tải lại
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white/40 dark:bg-slate-900/40">
            <BookA className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Không tìm thấy buổi học nào</h3>
            <p className="text-xs text-slate-500 mt-1">Hãy thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái.</p>
          </div>
        ) : (
          filteredSessions.map((s) => {
            const totalWords = s.vocabularies.length;
            const masteredWords = s.vocabularies.filter((w) => w.status === 'mastered').length;
            const percent = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;
            const isExpanded = expandedSessionId === s.sessionId;

            return (
              <div
                key={s.sessionId}
                className="overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition hover:shadow-md"
              >
                {/* Main Session Card Header */}
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Date and Class Badge */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                        <Calendar className="h-3.5 w-3.5" />
                        {s.formattedDate}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <GraduationCap className="h-3.5 w-3.5" />
                        {s.classTitle}
                      </span>
                    </div>

                    {/* Chapter & Session Title */}
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-blue-600 dark:text-sky-400">
                        {s.chapter}
                      </p>
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                        {s.sessionTitle}
                      </h2>
                    </div>

                    {/* Vocabulary Stats Bar */}
                    <div className="flex items-center gap-4 pt-1">
                      <div className="flex-1 max-w-xs">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          <span>Tiến độ ghi nhớ:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{masteredWords}/{totalWords} từ ({percent}%)</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              percent === 100
                                ? 'bg-emerald-500'
                                : percent >= 50
                                ? 'bg-blue-600'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2.5 shrink-0 pt-2 lg:pt-0">
                    <button
                      type="button"
                      onClick={() => setExpandedSessionId(isExpanded ? null : s.sessionId)}
                      className="flex items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    >
                      <span>{isExpanded ? 'Thu gọn' : `Xem ${totalWords} từ vựng`}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActivePracticeSession(s)}
                      className="group flex items-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition active:scale-95"
                    >
                      <Play className="h-4 w-4 fill-current transition group-hover:scale-110" />
                      <span>Luyện tập ngay</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Vocabulary Table / List */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 p-4 sm:p-6"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {s.vocabularies.map((word) => (
                          <div
                            key={word.id}
                            className="relative flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-4 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-600/70"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300">
                                  {word.partOfSpeech || 'Từ vựng'}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStar(s.sessionId, word.id)}
                                    className={`p-1 rounded-md transition ${
                                      word.isStarred
                                        ? 'text-amber-500 fill-current'
                                        : 'text-slate-300 hover:text-amber-500 dark:text-slate-600'
                                    }`}
                                    title="Đánh dấu từ quan trọng"
                                  >
                                    <Star className={`h-4 w-4 ${word.isStarred ? 'fill-current' : ''}`} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => speakChinese(word.term)}
                                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 transition"
                                    title="Phát âm tiếng Trung"
                                  >
                                    <Volume2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-baseline gap-2">
                                <h4 className="text-xl font-black text-slate-900 dark:text-white">
                                  {word.term}
                                </h4>
                                <span className="text-xs font-bold text-blue-600 dark:text-sky-400">
                                  {word.pinyin}
                                </span>
                              </div>

                              {word.sinoVietnamese && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Hán Việt: <span className="font-semibold text-slate-700 dark:text-slate-300">{word.sinoVietnamese}</span>
                                </p>
                              )}

                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {word.meaning}
                              </p>

                              {word.exampleSentence && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-slate-100 dark:border-slate-700/50">
                                  {`"${word.exampleSentence}"`}
                                </p>
                              )}
                            </div>

                            <div className="mt-3 pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/50 text-[10px] font-bold">
                              <span className={`px-2 py-0.5 rounded-full ${
                                word.status === 'mastered'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : word.status === 'learning'
                                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                              }`}>
                                {word.status === 'mastered' ? 'Đã thuộc' : word.status === 'learning' ? 'Đang học' : 'Từ mới'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Interactive Practice Modal */}
      <VocabularyPracticeModal
        isOpen={Boolean(activePracticeSession)}
        onClose={() => setActivePracticeSession(null)}
        session={activePracticeSession}
        onComplete={handlePracticeComplete}
      />
    </div>
  );
}
