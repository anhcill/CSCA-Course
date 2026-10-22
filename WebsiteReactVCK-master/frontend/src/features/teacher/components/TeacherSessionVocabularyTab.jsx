import { useState } from 'react';
import {
  Languages,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { speakChinese } from '../../learning/utils/speech';

export default function TeacherSessionVocabularyTab({
  session,
  vocabularies = [],
  onAddWord,
  onUpdateWord,
  onDeleteWord,
  onBatchImport,
  onSuggestVocabulary,
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingWordId, setEditingWordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [importText, setImportText] = useState('');
  const [aiTopic, setAiTopic] = useState(session?.title || '');
  const [aiCount, setAiCount] = useState(10);
  const [newWord, setNewWord] = useState({
    term: '',
    pinyin: '',
    sinoVietnamese: '',
    meaning: '',
    partOfSpeech: 'Danh từ',
    exampleSentence: '',
    exampleMeaning: '',
  });

  const resetWordForm = () => {
    setEditingWordId(null);
    setNewWord({
      term: '',
      pinyin: '',
      sinoVietnamese: '',
      meaning: '',
      partOfSpeech: 'Danh từ',
      exampleSentence: '',
      exampleMeaning: '',
    });
  };

  const openAddModal = () => {
    resetWordForm();
    setShowAddModal(true);
  };

  const openEditModal = (word) => {
    setEditingWordId(word.id);
    setNewWord({
      term: word.term || '',
      pinyin: word.pinyin || '',
      sinoVietnamese: word.sinoVietnamese || '',
      meaning: word.meaning || '',
      partOfSpeech: word.partOfSpeech || 'Danh từ',
      exampleSentence: word.exampleSentence || '',
      exampleMeaning: word.exampleMeaning || '',
    });
    setShowAddModal(true);
  };

  const handleSaveWord = async (e) => {
    e.preventDefault();
    if (!newWord.term.trim() || !newWord.meaning.trim()) {
      toast.error('Vui lòng nhập Từ vựng (Hán tự) và Nghĩa tiếng Việt!');
      return;
    }

    setSaving(true);
    try {
      if (editingWordId) {
        await onUpdateWord?.(editingWordId, newWord);
        toast.success('Đã cập nhật từ vựng thành công!');
      } else {
        await onAddWord?.(newWord);
        toast.success('Đã thêm từ vựng mới vào buổi học!');
      }
      resetWordForm();
      setShowAddModal(false);
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể lưu từ vựng.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (word) => {
    if (!window.confirm(`Xóa từ vựng "${word.term}" khỏi buổi học này?`)) return;
    try {
      await onDeleteWord?.(word.id);
      toast.success('Đã xóa từ vựng thành công.');
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể xóa từ vựng.');
    }
  };

  const parseImportText = () => {
    const trimmed = importText.trim();
    if (!trimmed) throw new Error('Hãy dán danh sách JSON, CSV hoặc TSV cần import.');
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('JSON phải là một mảng từ vựng.');
      return parsed;
    }

    return trimmed.split(/\r?\n/).filter(Boolean).map((line) => {
      const columns = line.includes('\t') ? line.split('\t') : line.split(',');
      const [term, pinyin, meaning, sinoVietnamese = '', partOfSpeech = '', exampleSentence = '', exampleMeaning = ''] = columns.map((value) => value.trim());
      return { term, pinyin, meaning, sinoVietnamese, partOfSpeech, exampleSentence, exampleMeaning };
    });
  };

  const handleBatchImport = async () => {
    setImporting(true);
    try {
      const words = parseImportText();
      const result = await onBatchImport?.(words);
      toast.success(`Đã import ${result?.importedCount || words.length} từ vựng thành công!`);
      setImportText('');
      setShowImportModal(false);
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể import danh sách từ vựng.');
    } finally {
      setImporting(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!aiTopic.trim()) {
      toast.error('Hãy nhập chủ đề để Moly gợi ý từ vựng.');
      return;
    }
    setSuggesting(true);
    try {
      const response = await onSuggestVocabulary?.({ topic: aiTopic.trim(), count: Number(aiCount) });
      const suggestions = response?.data?.vocabularies || [];
      if (!suggestions.length) throw new Error('Moly chưa tạo được danh sách phù hợp.');
      if (!window.confirm(`Moly đã gợi ý ${suggestions.length} từ. Thêm toàn bộ vào buổi học?`)) return;
      const result = await onBatchImport?.(suggestions);
      toast.success(`Đã thêm ${result?.importedCount || suggestions.length} từ do Moly gợi ý! 🌟`);
      setShowImportModal(false);
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể tạo gợi ý AI lúc này.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300 shadow-2xs">
              <Languages className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#102f63] dark:text-white">
              Quản Lý Từ Vựng & Thuật Ngữ Buổi Học
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tổng cộng <span className="font-bold text-blue-600 dark:text-sky-400 font-mono">{vocabularies.length} từ vựng</span>. Học viên sẽ luyện tập các từ này tại không gian học tập cá nhân.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white/90 px-4 py-2.5 text-xs font-bold text-blue-700 shadow-2xs backdrop-blur transition hover:bg-sky-50 dark:border-blue-900/60 dark:bg-slate-800 dark:text-sky-300"
          >
            <Upload className="h-4 w-4" /> Import / AI
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm từ vựng mới</span>
          </button>
        </div>
      </div>

      {/* Vocabulary List */}
      {vocabularies.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/80 bg-white/80 p-12 text-center backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60">
          <Languages className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Chưa có từ vựng nào trong buổi học này
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Bấm nút &quot;Thêm từ vựng mới&quot; hoặc &quot;Import / AI&quot; để bổ sung thuật ngữ chuyên ngành CSCA cho học viên ôn luyện.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {vocabularies.map((word) => (
            <div
              key={word.id}
              className="flex flex-col justify-between rounded-3xl border border-white/85 bg-white/92 p-4 shadow-[0_6px_25px_rgba(32,78,120,0.06)] backdrop-blur-xl transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/90"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300 border border-blue-200/60">
                    {word.partOfSpeech || 'Từ vựng'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => speakChinese(word.term)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 dark:hover:text-sky-400 transition"
                      title="Phát âm tiếng Trung"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                    {onUpdateWord && (
                      <button
                        type="button"
                        onClick={() => openEditModal(word)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition"
                        title="Sửa từ vựng"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {onDeleteWord && (
                      <button
                        type="button"
                        onClick={() => handleDelete(word)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                        title="Xóa từ vựng"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-black text-[#102f63] dark:text-white">
                    {word.term}
                  </h3>
                  <span className="text-xs font-bold text-blue-600 dark:text-sky-400 font-mono">
                    {word.pinyin}
                  </span>
                </div>

                {word.sinoVietnamese && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Âm Hán Việt: <span className="font-bold text-slate-700 dark:text-slate-200">{word.sinoVietnamese}</span>
                  </p>
                )}

                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {word.meaning}
                </p>

                {word.exampleSentence && (
                  <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                    <p className="font-semibold italic text-slate-800 dark:text-slate-200">{`"${word.exampleSentence}"`}</p>
                    {word.exampleMeaning && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{word.exampleMeaning}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Word Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-base font-black text-[#102f63] dark:text-white">
                  {editingWordId ? 'Chỉnh Sửa Từ Vựng' : 'Thêm Từ Vựng Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddModal(false); resetWordForm(); }}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWord} className="space-y-3.5 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Từ vựng / Chữ Hán *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 多面体"
                    value={newWord.term}
                    onChange={(e) => setNewWord({ ...newWord, term: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pinyin (Phiên âm)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: duō miàn tǐ"
                    value={newWord.pinyin}
                    onChange={(e) => setNewWord({ ...newWord, pinyin: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nghĩa tiếng Việt *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Khối đa diện"
                    value={newWord.meaning}
                    onChange={(e) => setNewWord({ ...newWord, meaning: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Âm Hán Việt
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Đa diện thể"
                    value={newWord.sinoVietnamese}
                    onChange={(e) => setNewWord({ ...newWord, sinoVietnamese: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Câu ví dụ (CSCA / Đề thi)
                </label>
                <input
                  type="text"
                  placeholder="VD: 正多面体的所有面都是全等正多边形。"
                  value={newWord.exampleSentence}
                  onChange={(e) => setNewWord({ ...newWord, exampleSentence: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Dịch nghĩa câu ví dụ
                </label>
                <input
                  type="text"
                  placeholder="VD: Tất cả các mặt của khối đa diện đều là các đa giác đều bằng nhau."
                  value={newWord.exampleMeaning}
                  onChange={(e) => setNewWord({ ...newWord, exampleMeaning: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetWordForm(); }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-bold text-white shadow-md shadow-blue-500/25"
                >
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {editingWordId ? 'Lưu thay đổi' : 'Lưu từ vựng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import / AI Suggest Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-3xl border border-white/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Import Nhanh & Gợi Ý Từ Vựng Với AI
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  AI tự động phân tích theo chủ đề bài học để tạo thuật ngữ và câu ví dụ chuẩn CSCA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-sky-300">
                <Sparkles className="h-3.5 w-3.5" /> Gợi ý từ vựng theo chủ đề:
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={aiTopic}
                  onChange={(event) => setAiTopic(event.target.value)}
                  placeholder="Ví dụ: Đạo hàm, Tích phân, Hình học không gian CSCA..."
                  className="h-10 flex-1 rounded-xl border border-sky-200 bg-white px-3 text-xs font-semibold outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-900 dark:text-white"
                />
                <select
                  value={aiCount}
                  onChange={(event) => setAiCount(event.target.value)}
                  className="h-10 rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs dark:bg-slate-900 dark:text-white"
                >
                  {[5, 10, 15, 20].map((count) => (
                    <option key={count} value={count}>{count} từ</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={suggesting}
                  onClick={handleAiSuggest}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {suggesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Tạo & Thêm
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Hoặc dán danh sách TSV, CSV hoặc JSON từ Excel:
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cột: Hán tự, Pinyin, Nghĩa tiếng Việt, Hán Việt, Từ loại, Câu ví dụ, Dịch câu.
              </p>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={6}
                placeholder={'多面体\tduō miàn tǐ\tKhối đa diện\tĐa diện thể\tDanh từ'}
                className="mt-2 w-full rounded-2xl border border-slate-200/90 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-500 shadow-2xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={importing || !importText.trim()}
                onClick={handleBatchImport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/25 disabled:opacity-60 hover:bg-emerald-700"
              >
                {importing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Import danh sách
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
