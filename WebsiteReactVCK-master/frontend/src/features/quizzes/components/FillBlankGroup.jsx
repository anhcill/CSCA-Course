import { useState } from 'react';
import { FiChevronDown, FiChevronUp, FiPlus, FiSave, FiTrash2 } from 'react-icons/fi';
import ImageUpload from './ImageUpload.jsx';
import MathInput from './MathInput.jsx';

function makeSubItem(startNum, index) {
  return {
    _localId: `fbi-${Date.now()}-${index}`,
    questionText: '',
    questionTextCn: '',
    points: 1,
    explanation: '',
    explanationCn: '',
    explanationImageUrl: '',
    correctAnswerKey: 'A',
    difficulty: 'medium',
    subQuestionNumber: startNum + index,
  };
}

function getDefaultLinkedOptions() {
  return [
    { key: 'A', text: '', textCn: '' },
    { key: 'B', text: '', textCn: '' },
    { key: 'C', text: '', textCn: '' },
    { key: 'D', text: '', textCn: '' },
    { key: 'E', text: '', textCn: '' },
    { key: 'F', text: '', textCn: '' },
  ];
}

function countBlanks(text = '') {
  return (text.match(/_{2,}|＿+/g) || []).length;
}

export default function FillBlankGroup({
  startNumber = 1,
  initialData,
  onSave,
  onDelete,
}) {
  const [group, setGroup] = useState(() => {
    if (!initialData) {
      return {
        _id: `fbg-${Date.now()}`,
        _localId: `fbg-${Date.now()}`,
        clozeMode: 'sentences',
        passageText: '',
        passageImageUrl: '',
        linkedOptions: getDefaultLinkedOptions(),
        subItems: [makeSubItem(startNumber, 0)],
      };
    }

    return {
      ...initialData,
      clozeMode: initialData.clozeMode || 'sentences',
      passageText: initialData.passageText || '',
      passageImageUrl: initialData.passageImageUrl || '',
      linkedOptions: initialData.linkedOptions?.length
        ? initialData.linkedOptions
        : getDefaultLinkedOptions(),
      subItems: (initialData.subItems || initialData.questions || []).length
        ? (initialData.subItems || initialData.questions).map((item, i) => ({
            _localId: item._localId || item.id || `fbi-${Date.now()}-${i}`,
            questionText: item.questionText || '',
            questionTextCn: item.questionTextCn || '',
            points: item.points || 1,
            explanation: item.explanation || '',
            explanationCn: item.explanationCn || '',
            explanationImageUrl: item.explanationImageUrl || '',
            correctAnswerKey: item.correctAnswerKey || item.correctAnswer || 'A',
            difficulty: item.difficulty || 'medium',
            subQuestionNumber: item.subQuestionNumber || startNumber + i,
          }))
        : [makeSubItem(startNumber, 0)],
    };
  });

  const [saving, setSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  const blankCount = countBlanks(group.passageText);

  const getItemLabel = (index) => `Câu ${startNumber + index}`;

  const setPassage = (key, value) => {
    setGroup(prev => ({ ...prev, [key]: value }));
  };

  const setLinkedOption = (index, field, value) => {
    setGroup(prev => ({
      ...prev,
      linkedOptions: prev.linkedOptions.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      ),
    }));
  };

  const setSubItem = (localId, key, value) => {
    setGroup(prev => ({
      ...prev,
      subItems: prev.subItems.map(item =>
        item._localId === localId ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addLinkedOption = () => {
    if (group.linkedOptions.length >= 12) return;
    const nextKey = String.fromCharCode(65 + group.linkedOptions.length);
    setGroup(prev => ({
      ...prev,
      linkedOptions: [...prev.linkedOptions, { key: nextKey, text: '', textCn: '' }],
    }));
  };

  const removeLinkedOption = (index) => {
    setGroup(prev => ({
      ...prev,
      linkedOptions: prev.linkedOptions.filter((_, i) => i !== index),
      subItems: prev.subItems.map(item => {
        const removedKey = prev.linkedOptions[index]?.key;
        const firstRemainingKey = prev.linkedOptions.find((_, i) => i !== index)?.key || 'A';
        return item.correctAnswerKey === removedKey
          ? { ...item, correctAnswerKey: firstRemainingKey }
          : item;
      }),
    }));
  };

  const addSubItem = () => {
    setGroup(prev => ({
      ...prev,
      subItems: [...prev.subItems, makeSubItem(startNumber, prev.subItems.length)],
    }));
  };

  const removeSubItem = (localId) => {
    setGroup(prev => ({
      ...prev,
      subItems: prev.subItems.length > 1
        ? prev.subItems.filter(item => item._localId !== localId)
        : prev.subItems,
    }));
  };

  const handleSave = () => {
    if (group.clozeMode === 'passage' && !group.passageText.trim()) {
      alert('Dạng đoạn văn cần có nội dung đoạn văn.');
      return;
    }

    if (group.clozeMode === 'sentences') {
      const missingSentence = group.subItems.some(
        item => !item.questionText.trim() && !item.questionTextCn.trim()
      );
      if (missingSentence) {
        alert('Dạng câu rời cần nhập nội dung cho từng câu.');
        return;
      }
    }

    const filledOpts = group.linkedOptions.filter(o => o.text?.trim() || o.textCn?.trim());
    if (filledOpts.length < 2) {
      alert('Cần ít nhất 2 từ chọn có nội dung.');
      return;
    }

    setSaving(true);
    if (onSave) {
      onSave({
        ...group,
        kind: 'fill_blank_group',
        questions: group.subItems.map((item, i) => ({
          ...item,
          id: item._localId,
          subQuestionNumber: startNumber + i,
          correctAnswer: item.correctAnswerKey,
        })),
      });
    }
    setTimeout(() => setSaving(false), 800);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md border border-emerald-200 dark:border-emerald-900/60 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5 flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-sm">
            Điền từ — {getItemLabel(0)}
            {group.subItems.length > 1 && ` → ${getItemLabel(group.subItems.length - 1)}`}
          </h3>
          <p className="text-white/80 text-xs">
            {group.clozeMode === 'passage' ? 'Đoạn văn' : 'Câu rời'} · {group.subItems.length} chỗ trống · Pool A-{String.fromCharCode(65 + Math.max(0, group.linkedOptions.length - 1))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-emerald-700 rounded-lg font-semibold text-xs hover:bg-emerald-50 disabled:opacity-60"
          >
            <FiSave size={14} />
            {saving ? 'Đang lưu...' : 'Lưu nhóm'}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center p-1.5 bg-red-500/20 text-white rounded-lg hover:bg-red-500/30"
              title="Xóa nhóm điền từ"
            >
              <FiTrash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Cloze Mode Toggle */}
        <div className="bg-slate-50 dark:bg-slate-800/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3">
          <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">
            Dạng điền từ
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'sentences', label: 'Câu rời rạc' },
              { val: 'passage', label: 'Đoạn văn liên hoàn' },
            ].map(m => (
              <button
                key={m.val}
                type="button"
                onClick={() => setGroup(prev => ({ ...prev, clozeMode: m.val }))}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  group.clozeMode === m.val
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Passage / Notes */}
        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-4 space-y-3">
          <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-300">
            {group.clozeMode === 'passage' ? '📝 Đoạn văn có chứa chỗ trống (dùng ___)' : '📌 Hướng dẫn / Ghi chú nhóm'}
          </label>
          <textarea
            value={group.passageText}
            onChange={e => setPassage('passageText', e.target.value)}
            rows={group.clozeMode === 'passage' ? 5 : 2}
            className="w-full px-3.5 py-2 border border-emerald-200 dark:border-emerald-800 rounded-lg bg-white dark:bg-slate-900 text-sm leading-relaxed text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-300"
            placeholder={
              group.clozeMode === 'passage'
                ? 'Nhập đoạn văn có chỗ trống: Biểu thức ___ có giá trị lớn hơn ___...'
                : 'VD: Chọn từ phù hợp điền vào các câu bên dưới:'
            }
          />
          {group.clozeMode === 'passage' && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Dùng ___ làm chỗ trống. Hiện có {blankCount} chỗ trống được phát hiện.
            </p>
          )}

          <ImageUpload
            label="Ảnh đính kèm nhóm (tùy chọn)"
            currentImage={group.passageImageUrl}
            onImageUploaded={url => setPassage('passageImageUrl', url)}
            compact
          />

          {/* Linked Options Pool A-F */}
          <div className="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-900/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Kho từ chọn (Pool A-{String.fromCharCode(65 + group.linkedOptions.length - 1)})
              </span>
              {group.linkedOptions.length < 12 && (
                <button
                  type="button"
                  onClick={addLinkedOption}
                  className="text-[11px] px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 rounded border border-emerald-300 hover:bg-emerald-200"
                >
                  + Thêm từ
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.linkedOptions.map((opt, i) => (
                <div
                  key={opt.key}
                  className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg p-2 border border-emerald-100 dark:border-emerald-900/50"
                >
                  <span className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {opt.key}
                  </span>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={e => setLinkedOption(i, 'text', e.target.value)}
                    className="flex-1 px-2 py-1 border dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    placeholder="Nghĩa / Tiếng Việt"
                  />
                  <input
                    type="text"
                    value={opt.textCn}
                    onChange={e => setLinkedOption(i, 'textCn', e.target.value)}
                    className="flex-1 px-2 py-1 border dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    placeholder="Từ / 中文"
                  />
                  {group.linkedOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLinkedOption(i)}
                      className="text-red-400 hover:text-red-600 p-0.5"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sub-items (Blanks) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-xs uppercase tracking-wide">
              Danh sách chỗ trống ({group.subItems.length})
            </h4>
            <button
              type="button"
              onClick={addSubItem}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 font-semibold"
            >
              <FiPlus size={12} />
              Thêm chỗ trống
            </button>
          </div>

          {group.subItems.map((item, index) => {
            const isExpanded = expandedItems[item._localId] ?? true;
            const currentAnswer = group.linkedOptions.find(o => o.key === item.correctAnswerKey);

            return (
              <div
                key={item._localId}
                className="border border-emerald-200 dark:border-emerald-900/60 rounded-xl overflow-hidden bg-emerald-50/20 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedItems(prev => ({ ...prev, [item._localId]: !prev[item._localId] }))
                  }
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-emerald-100/60 dark:bg-emerald-950/40 hover:bg-emerald-200/60 transition-colors text-left"
                >
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                    {getItemLabel(index)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 truncate max-w-xs">
                      Đáp án: {item.correctAnswerKey} — {currentAnswer?.text || currentAnswer?.textCn || 'chưa chọn'}
                    </span>
                    {isExpanded ? (
                      <FiChevronUp size={13} className="text-emerald-600" />
                    ) : (
                      <FiChevronDown size={13} className="text-emerald-600" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 space-y-3">
                    {group.clozeMode === 'sentences' && (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Nội dung câu có ô trống
                        </label>
                        <input
                          type="text"
                          value={item.questionText}
                          onChange={e => setSubItem(item._localId, 'questionText', e.target.value)}
                          className="w-full px-3 py-1.5 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          placeholder="VD: Nước đá ___ tan thành nước lỏng."
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Đáp án đúng
                        </label>
                        <select
                          value={item.correctAnswerKey}
                          onChange={e => setSubItem(item._localId, 'correctAnswerKey', e.target.value)}
                          className="w-full px-2 py-1 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        >
                          {group.linkedOptions.map(opt => (
                            <option key={opt.key} value={opt.key}>
                              {opt.key}. {opt.text || opt.textCn || '...'}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Điểm
                        </label>
                        <input
                          type="number"
                          value={item.points}
                          onChange={e =>
                            setSubItem(item._localId, 'points', Math.max(0.1, parseFloat(e.target.value) || 1))
                          }
                          min={0.1}
                          max={100}
                          step={0.1}
                          className="w-full px-2 py-1 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Độ khó
                        </label>
                        <select
                          value={item.difficulty}
                          onChange={e => setSubItem(item._localId, 'difficulty', e.target.value)}
                          className="w-full px-2 py-1 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        >
                          <option value="easy">Dễ</option>
                          <option value="medium">Trung bình</option>
                          <option value="hard">Khó</option>
                        </select>
                      </div>
                    </div>

                    {/* Explanation */}
                    <details className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
                      <summary className="cursor-pointer px-3 py-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
                        💡 Giải thích đáp án ô trống
                      </summary>
                      <div className="px-3 pb-3 pt-1 space-y-2">
                        <MathInput
                          value={item.explanation}
                          onChange={v => setSubItem(item._localId, 'explanation', v)}
                          placeholder="Lời giải chi tiết cho ô trống này..."
                        />
                      </div>
                    </details>

                    {group.subItems.length > 1 && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => removeSubItem(item._localId)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50"
                        >
                          <FiTrash2 size={11} />
                          Xóa ô trống này
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
