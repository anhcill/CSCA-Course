import { useState } from 'react';
import {
  Languages, LoaderCircle, Pencil, Plus, Sparkles, Trash2, Upload, Volume2,
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
        toast.success('Đã cập nhật từ vựng!');
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
    if (!window.confirm(`Xóa từ "${word.term}" khỏi buổi học?`)) return;
    try {
      await onDeleteWord?.(word.id);
      toast.success('Đã xóa từ vựng.');
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
      toast.success(`Đã import ${result?.importedCount || words.length} từ vựng.`);
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
      toast.success(`Đã thêm ${result?.importedCount || suggestions.length} từ do Moly gợi ý.`);
      setShowImportModal(false);
    } catch (requestError) {
      toast.error(requestError.message || 'Không thể tạo gợi ý AI lúc này.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
              <Languages className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Quản lý Từ vựng & Thuật ngữ buổi học
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tổng cộng <span className="font-bold text-blue-600 dark:text-sky-400">{vocabularies.length} từ vựng</span>. Học viên sẽ luyện tập các từ này tại không gian học tập cá nhân.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowImportModal(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 dark:border-blue-800 px-4 py-3 text-xs font-bold text-blue-700 dark:text-sky-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition">
            <Upload className="h-4 w-4" /> Import / AI
          </button>
          <button type="button" onClick={openAddModal} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition shrink-0">
            <Plus className="h-4 w-4" />
            <span>Thêm từ vựng mới</span>
          </button>
        </div>
      </div>

      {/* Vocabulary List */}
      {vocabularies.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white/40 dark:bg-slate-900/40">
          <Languages className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Chưa có từ vựng nào cho buổi học này
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Hãy bấm nút &quot;Thêm từ vựng mới&quot; ở trên để đăng tải thuật ngữ và câu ví dụ cho học viên ôn tập.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {vocabularies.map((word) => (
            <div
              key={word.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300">
                    {word.partOfSpeech || 'Từ vựng'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => speakChinese(word.term)}
                      className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 transition"
                      title="Phát âm"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                    {onUpdateWord && (
                      <button type="button" onClick={() => openEditModal(word)} className="p-1 rounded-md text-slate-400 hover:text-blue-600 transition" title="Sửa từ">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {onDeleteWord && (
                      <button
                        type="button"
                        onClick={() => handleDelete(word)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 transition"
                        title="Xóa từ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
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
            </div>
          ))}
        </div>
      )}

      {/* Add Word Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{editingWordId ? 'Sửa Từ Vựng' : 'Thêm Từ Vựng Mới'}</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddModal(false); resetWordForm(); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWord} className="space-y-4 pt-4">
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
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
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetWordForm(); }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-bold text-white shadow-md shadow-blue-600/30"
                >
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {editingWordId ? 'Lưu thay đổi' : 'Lưu từ vựng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Import nhanh & Gợi ý với Moly AI</h3>
                <p className="mt-1 text-xs text-slate-500">AI dùng Gemini Flash ở backend; API key không được gửi xuống trình duyệt.</p>
              </div>
              <button type="button" onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">✕</button>
            </div>

            <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-4">
              <div className="flex items-center gap-2 font-bold text-blue-800 dark:text-sky-300"><Sparkles className="h-4 w-4" /> Moly gợi ý theo chủ đề</div>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input value={aiTopic} onChange={(event) => setAiTopic(event.target.value)} placeholder="Ví dụ: Đạo hàm và tiếp tuyến CSCA" className="h-10 flex-1 rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 text-sm outline-none focus:border-blue-500" />
                <select value={aiCount} onChange={(event) => setAiCount(event.target.value)} className="h-10 rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 px-3 text-sm">
                  {[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count} từ</option>)}
                </select>
                <button type="button" disabled={suggesting} onClick={handleAiSuggest} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white disabled:opacity-60">
                  {suggesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Tạo và thêm
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dán JSON, CSV hoặc dữ liệu từ Excel</label>
              <p className="mt-1 text-[11px] text-slate-500">Mỗi dòng: Hán tự, pinyin, nghĩa, Hán Việt, từ loại, câu ví dụ, dịch câu ví dụ. Có thể dán trực tiếp các ô từ Excel.</p>
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={8} placeholder={'多面体\tduō miàn tǐ\tKhối đa diện\tĐa diện thể\tDanh từ'} className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 font-mono text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500" />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button type="button" onClick={() => setShowImportModal(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold">Hủy</button>
              <button type="button" disabled={importing || !importText.trim()} onClick={handleBatchImport} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60">
                {importing && <LoaderCircle className="h-4 w-4 animate-spin" />} Import danh sách
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
