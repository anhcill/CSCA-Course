import { useState } from 'react';
import { FiTrash2, FiSave, FiPlus, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import ImageUpload from './ImageUpload.jsx';
import MathInput from './MathInput.jsx';

const ANSWER_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function makeSubQuestion(startNum, index) {
  return {
    _localId: `sq-${Date.now()}-${index}`,
    questionText: '',
    questionTextCn: '',
    imageUrl: '',
    points: 1,
    explanation: '',
    explanationCn: '',
    explanationImageUrl: '',
    answers: [
      { text: '', textCn: '', imageUrl: '' },
      { text: '', textCn: '', imageUrl: '' },
      { text: '', textCn: '', imageUrl: '' },
      { text: '', textCn: '', imageUrl: '' },
    ],
    correctAnswer: 'A',
    difficulty: 'medium',
    subQuestionNumber: startNum + index,
  };
}

export default function ReadingPassageGroup({
  startNumber = 1,
  initialData,
  onSave,
  onDelete,
}) {
  const [group, setGroup] = useState(() => {
    if (initialData) {
      return {
        ...initialData,
        passageText: initialData.passageText || '',
        passageImageUrl: initialData.passageImageUrl || '',
        subQuestions: (initialData.subQuestions || initialData.questions || []).map((sq, i) => ({
          _localId: sq._localId || sq.id || `sq-${Date.now()}-${i}`,
          questionText: sq.questionText || '',
          questionTextCn: sq.questionTextCn || '',
          imageUrl: sq.imageUrl || '',
          points: sq.points || 1,
          explanation: sq.explanation || '',
          explanationCn: sq.explanationCn || '',
          explanationImageUrl: sq.explanationImageUrl || '',
          answers: (sq.answers || sq.options || []).map((opt) => ({
            text: opt.text || '',
            textCn: opt.textCn || '',
            imageUrl: opt.imageUrl || '',
          })),
          correctAnswer: sq.correctAnswer || 'A',
          difficulty: sq.difficulty || 'medium',
          subQuestionNumber: sq.subQuestionNumber || startNumber + i,
        })),
      };
    }
    return {
      _id: `rg-${Date.now()}`,
      _localId: `rg-${Date.now()}`,
      passageText: '',
      passageImageUrl: '',
      subQuestions: [makeSubQuestion(startNumber, 0)],
    };
  });

  const [saving, setSaving] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState({});

  const toggleSub = (id) =>
    setExpandedSubs(prev => ({ ...prev, [id]: !prev[id] }));

  const setPassage = (key, value) =>
    setGroup(prev => ({ ...prev, [key]: value }));

  const setSubQuestion = (localId, key, value) =>
    setGroup(prev => ({
      ...prev,
      subQuestions: prev.subQuestions.map(sq =>
        sq._localId === localId ? { ...sq, [key]: value } : sq
      ),
    }));

  const updateSubAnswer = (localId, index, key, value) =>
    setGroup(prev => ({
      ...prev,
      subQuestions: prev.subQuestions.map(sq => {
        if (sq._localId !== localId) return sq;
        const answers = sq.answers.map((a, i) =>
          i === index ? { ...a, [key]: value } : a
        );
        return { ...sq, answers };
      }),
    }));

  const addSubQuestion = () =>
    setGroup(prev => ({
      ...prev,
      subQuestions: [
        ...prev.subQuestions,
        makeSubQuestion(startNumber, prev.subQuestions.length),
      ],
    }));

  const removeSubQuestion = (localId) =>
    setGroup(prev => ({
      ...prev,
      subQuestions: prev.subQuestions.filter(sq => sq._localId !== localId),
    }));

  const handleSave = () => {
    if (!group.passageText.trim()) {
      alert('Vui lòng nhập đoạn văn đọc hiểu');
      return;
    }

    const hasContent = group.subQuestions.some(
      sq => sq.questionText.trim() || sq.questionTextCn.trim()
    );
    if (!hasContent) {
      alert('Vui lòng nhập ít nhất một câu hỏi trong đoạn đọc hiểu');
      return;
    }

    setSaving(true);
    if (onSave) {
      onSave({
        ...group,
        kind: 'reading_group',
        questions: group.subQuestions.map((sq, i) => ({
          ...sq,
          id: sq._localId,
          subQuestionNumber: startNumber + i,
          options: sq.answers.map((ans, idx) => ({
            key: ANSWER_KEYS[idx] || String.fromCharCode(65 + idx),
            text: ans.text,
            textCn: ans.textCn,
            imageUrl: ans.imageUrl,
          })),
        })),
      });
    }
    setTimeout(() => setSaving(false), 800);
  };

  const getQuestionLabel = (index) => `Câu ${startNumber + index}`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md border border-purple-200 dark:border-purple-900/60 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">📖</span>
          <div>
            <h3 className="text-white font-bold text-sm">
              Đoạn đọc hiểu — {getQuestionLabel(0)}
              {group.subQuestions.length > 1 && ` → ${getQuestionLabel(group.subQuestions.length - 1)}`}
            </h3>
            <p className="text-white/80 text-xs">
              {group.subQuestions.length} câu hỏi con · Đoạn văn dùng chung cho tất cả câu con
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-purple-700 rounded-lg font-semibold text-xs hover:bg-purple-50 disabled:opacity-60"
          >
            <FiSave size={14} />
            {saving ? 'Đang lưu...' : 'Lưu đoạn văn'}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center p-1.5 bg-red-500/20 text-white rounded-lg hover:bg-red-500/30"
              title="Xóa nhóm đọc hiểu"
            >
              <FiTrash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Passage text */}
        <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-xl p-4 space-y-3">
          <label className="block text-xs font-bold text-purple-900 dark:text-purple-300">
            📝 Đoạn văn đọc hiểu (hỗ trợ Markdown & LaTeX)
          </label>
          <textarea
            value={group.passageText}
            onChange={e => setPassage('passageText', e.target.value)}
            rows={5}
            className="w-full px-3.5 py-2 border border-purple-200 dark:border-purple-800 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 leading-relaxed outline-none focus:ring-2 focus:ring-purple-300"
            placeholder="Dán nội dung đoạn văn đọc hiểu (Tiếng Việt hoặc Tiếng Trung)..."
          />
          <ImageUpload
            label="Ảnh đính kèm đoạn văn (tùy chọn)"
            currentImage={group.passageImageUrl}
            onImageUploaded={url => setPassage('passageImageUrl', url)}
            compact
          />
        </div>

        {/* Sub-questions list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-xs uppercase tracking-wide">
              Danh sách câu hỏi con ({group.subQuestions.length})
            </h4>
            <button
              type="button"
              onClick={addSubQuestion}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-200 font-semibold"
            >
              <FiPlus size={12} />
              Thêm câu con
            </button>
          </div>

          {group.subQuestions.map((sq, index) => {
            const isExpanded = expandedSubs[sq._localId] ?? true;
            const isCorrect = (key) => sq.correctAnswer === key;

            return (
              <div
                key={sq._localId}
                className="border border-purple-200 dark:border-purple-900/60 rounded-xl overflow-hidden bg-purple-50/20 dark:bg-slate-900"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleSub(sq._localId)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-100/60 dark:bg-purple-950/40 hover:bg-purple-200/60 transition-colors text-left"
                >
                  <span className="font-bold text-purple-900 dark:text-purple-200 text-xs">
                    {getQuestionLabel(index)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-700 dark:text-purple-300 truncate max-w-xs">
                      {sq.questionText || sq.questionTextCn || '— chưa nhập câu hỏi'}
                    </span>
                    {isExpanded ? (
                      <FiChevronUp size={13} className="text-purple-600 flex-shrink-0" />
                    ) : (
                      <FiChevronDown size={13} className="text-purple-600 flex-shrink-0" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        Câu hỏi (Tiếng Việt)
                      </label>
                      <textarea
                        value={sq.questionText}
                        onChange={e => setSubQuestion(sq._localId, 'questionText', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white dark:bg-slate-900 dark:border-slate-700 text-gray-900 dark:text-gray-100"
                        placeholder="Nhập câu hỏi con..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        问题 (中文 - Tùy chọn)
                      </label>
                      <textarea
                        value={sq.questionTextCn}
                        onChange={e => setSubQuestion(sq._localId, 'questionTextCn', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white dark:bg-slate-900 dark:border-slate-700 text-gray-900 dark:text-gray-100"
                        placeholder="输入中文问题..."
                      />
                    </div>

                    {/* Choices */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Các lựa chọn
                        </span>
                        {sq.answers.length < 8 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSubQuestion(sq._localId, 'answers', [
                                ...sq.answers,
                                { text: '', textCn: '', imageUrl: '' },
                              ])
                            }
                            className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100"
                          >
                            + Thêm
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {sq.answers.map((ans, i) => {
                          const key = ANSWER_KEYS[i] || String.fromCharCode(65 + i);
                          return (
                            <div
                              key={key}
                              className={`rounded-lg p-2 border ${
                                isCorrect(key)
                                  ? 'border-green-400 bg-green-50/70 dark:bg-green-950/30'
                                  : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <input
                                  type="radio"
                                  name={`correct-${sq._localId}`}
                                  checked={isCorrect(key)}
                                  onChange={() => setSubQuestion(sq._localId, 'correctAnswer', key)}
                                  className="w-3.5 h-3.5 text-blue-600"
                                />
                                <span className={`text-xs font-bold ${isCorrect(key) ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>
                                  {key}. {isCorrect(key) && <span className="text-green-600 text-xs ml-1">✓ Đúng</span>}
                                </span>
                                {sq.answers.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSubQuestion(
                                        sq._localId,
                                        'answers',
                                        sq.answers.filter((_, j) => j !== i)
                                      )
                                    }
                                    className="ml-auto text-gray-400 hover:text-red-500"
                                  >
                                    <FiTrash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <input
                                type="text"
                                value={ans.text}
                                onChange={e => updateSubAnswer(sq._localId, i, 'text', e.target.value)}
                                className="w-full px-2.5 py-1 border dark:border-slate-700 rounded text-xs mb-1 bg-white dark:bg-slate-950"
                                placeholder={`Lựa chọn ${key}...`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Meta: points & difficulty */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Điểm</label>
                        <input
                          type="number"
                          value={sq.points}
                          onChange={e =>
                            setSubQuestion(sq._localId, 'points', Math.max(0.1, parseFloat(e.target.value) || 1))
                          }
                          min={0.1}
                          max={100}
                          step={0.1}
                          className="w-full px-2 py-1 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Độ khó</label>
                        <select
                          value={sq.difficulty}
                          onChange={e => setSubQuestion(sq._localId, 'difficulty', e.target.value)}
                          className="w-full px-2 py-1 border dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-950"
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
                        💡 Giải thích câu con
                      </summary>
                      <div className="px-3 pb-3 pt-1 space-y-2">
                        <MathInput
                          value={sq.explanation}
                          onChange={v => setSubQuestion(sq._localId, 'explanation', v)}
                          placeholder="Lời giải chi tiết câu hỏi này..."
                        />
                      </div>
                    </details>

                    {/* Delete Sub-question */}
                    {group.subQuestions.length > 1 && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => removeSubQuestion(sq._localId)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50"
                        >
                          <FiTrash2 size={11} />
                          Xóa câu con này
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
