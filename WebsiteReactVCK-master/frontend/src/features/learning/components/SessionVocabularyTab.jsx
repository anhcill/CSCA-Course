import { useMemo } from 'react';
import {
  Languages, Play, Star, Volume2
} from 'lucide-react';
import { speakChinese } from '../utils/speech';

export default function SessionVocabularyTab({
  vocabularies = [],
  onStartPractice,
  onToggleStar,
}) {
  const masteredCount = useMemo(
    () => vocabularies.filter((w) => w.status === 'mastered').length,
    [vocabularies]
  );
  const percent = vocabularies.length > 0 ? Math.round((masteredCount / vocabularies.length) * 100) : 0;

  if (vocabularies.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center bg-white/60 dark:bg-slate-900/60">
        <Languages className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          Chưa có từ vựng cho buổi học này
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Giáo viên sẽ cập nhật các thuật ngữ tiếng Trung và từ vựng CSCA trọng tâm của bài học tại đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Overview Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-blue-200/90 dark:border-blue-900/40 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 p-5 sm:p-6 shadow-sm">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <Languages className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Từ vựng & Thuật ngữ buổi học
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Tổng cộng <span className="font-bold text-blue-600 dark:text-sky-400">{vocabularies.length} từ</span>. Bạn đã thuộc <span className="font-bold text-emerald-600 dark:text-emerald-400">{masteredCount}/{vocabularies.length} từ ({percent}%)</span>.
          </p>

          {/* Progress bar */}
          <div className="h-2 w-full max-w-md bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onStartPractice}
          className="group flex items-center justify-center gap-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 px-6 py-3.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition active:scale-95 shrink-0"
        >
          <Play className="h-4 w-4 fill-current transition group-hover:scale-110" />
          <span>Luyện tập từ vựng buổi này</span>
        </button>
      </div>

      {/* Vocabulary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {vocabularies.map((word) => (
          <div
            key={word.id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-700/60"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300">
                  {word.partOfSpeech || 'Từ vựng'}
                </span>
                <div className="flex items-center gap-1">
                  {onToggleStar && (
                    <button
                      type="button"
                      onClick={() => onToggleStar(word.id)}
                      className={`p-1 rounded-md transition ${
                        word.isStarred
                          ? 'text-amber-500 fill-current'
                          : 'text-slate-300 hover:text-amber-500 dark:text-slate-600'
                      }`}
                      title="Đánh dấu quan trọng"
                    >
                      <Star className={`h-4 w-4 ${word.isStarred ? 'fill-current' : ''}`} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => speakChinese(word.term)}
                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 transition"
                    title="Phát âm"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {word.term}
                </h3>
                <span className="text-xs font-bold text-blue-600 dark:text-sky-400">
                  {word.pinyin}
                </span>
              </div>

              {word.sinoVietnamese && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Hán Việt: <span className="font-semibold text-slate-700 dark:text-slate-200">{word.sinoVietnamese}</span>
                </p>
              )}

              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {word.meaning}
              </p>

              {word.exampleSentence && (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="font-medium italic">{`"${word.exampleSentence}"`}</p>
                  {word.exampleMeaning && (
                    <p className="text-[10px] text-slate-400">{word.exampleMeaning}</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold">
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
    </div>
  );
}
