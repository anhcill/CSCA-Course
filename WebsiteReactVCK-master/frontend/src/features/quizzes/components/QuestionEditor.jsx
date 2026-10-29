import { useState, useEffect } from 'react';
import { FiEye, FiEyeOff, FiTrash2, FiSave, FiX } from 'react-icons/fi';
import ImageUpload from './ImageUpload.jsx';
import MathInput from './MathInput.jsx';
import SingleQuestionOcrPaste from './SingleQuestionOcrPaste.jsx';
import RichMathText from '../../../components/common/RichMathText.jsx';
import { normalizeRichMathText } from '../math/normalizeMath.js';
import {
  isPlainTextMathValue,
  markPlainTextMathValue,
  preservePlainTextMathMode,
  stripPlainTextMathMarker,
} from '../math/plainTextMathMode.js';

const DEFAULT_ANSWERS = (count = 4) =>
  Array.from({ length: count }, () => ({ text: '', textCn: '', textEn: '', imageUrl: '' }));

const DEFAULT_LINKED_OPTIONS = [
  { key: 'A', text: '', textCn: '', textEn: '' },
  { key: 'B', text: '', textCn: '', textEn: '' },
  { key: 'C', text: '', textCn: '', textEn: '' },
  { key: 'D', text: '', textCn: '', textEn: '' },
  { key: 'E', text: '', textCn: '', textEn: '' },
  { key: 'F', text: '', textCn: '', textEn: '' },
];

function getDefaults(initial) {
  return {
    questionType: initial?.questionType || 'single_choice',
    questionText: initial?.questionText || '',
    questionTextCn: initial?.questionTextCn || '',
    questionTextEn: initial?.questionTextEn || '',
    imageUrl: initial?.imageUrl || '',
    passageText: initial?.passageText || '',
    passageImageUrl: initial?.passageImageUrl || '',
    points: initial?.points || 1,
    explanation: initial?.explanation || '',
    explanationCn: initial?.explanationCn || '',
    explanationEn: initial?.explanationEn || '',
    explanationImageUrl: initial?.explanationImageUrl || '',
    answers: initial?.answers?.length ? initial.answers : (initial?.options?.length ? initial.options : DEFAULT_ANSWERS()),
    correctAnswer: initial?.correctAnswer || 'A',
    linkedOptions: initial?.linkedOptions?.length ? initial.linkedOptions : DEFAULT_LINKED_OPTIONS,
    correctAnswerKey: initial?.correctAnswerKey || 'A',
    subQuestionNumber: initial?.subQuestionNumber || 0,
    difficulty: initial?.difficulty || 'medium',
  };
}

const QUESTION_TYPE_LABELS = {
  single_choice:   { label: '🔘 Trắc nghiệm A-B-C-D', desc: 'Câu hỏi chọn 1 đáp án đúng' },
  essay:           { label: '✍️ Tự luận', desc: 'Học viên nhập bài và có thể đính kèm ảnh hoặc tệp' },
  fill_blank_pool: { label: '📝 Điền từ (Pool A-F)',  desc: 'Bắt đầu nhóm điền từ, có pool từ chọn' },
  reading_passage: { label: '📖 Đọc hiểu (đoạn văn)', desc: 'Bắt đầu đoạn văn đọc hiểu' },
};

const ANSWER_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const ADMIN_TEXTAREA_CLASS =
  'w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const ADMIN_INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const ADMIN_SELECT_CLASS =
  'w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function QuestionEditor({
  questionNumber = 1,
  initialData,
  initialQuestionType,
  onSave,
  onDelete,
  onCancel,
  savedQuestionId,
}) {
  const [form, setForm] = useState(() => getDefaults(initialData));
  const [saving, setSaving] = useState(false);
  const [showMathPreviews, setShowMathPreviews] = useState(true);
  const [previewDrafts, setPreviewDrafts] = useState({});

  useEffect(() => {
    setForm(getDefaults(initialData));
  }, [initialData]);

  useEffect(() => {
    if (initialQuestionType && !savedQuestionId && !initialData) {
      setForm(prev => ({ ...prev, questionType: initialQuestionType }));
    }
  }, [initialQuestionType, savedQuestionId, initialData]);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const setMathText = (key, value) =>
    setForm(prev => ({ ...prev, [key]: preservePlainTextMathMode(prev[key], value) }));

  const renderMathPreview = (value, onChange, title = 'Xem trước:', draftKey = title) => {
    const isPlainText = isPlainTextMathValue(value);
    const editableValue = stripPlainTextMathMarker(value);
    if (!editableValue) return null;

    if (!showMathPreviews) {
      return (
        <button
          type="button"
          onClick={() => setShowMathPreviews(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50"
        >
          <FiEye size={12} />
          Hiện xem trước
        </button>
      );
    }

    if (isPlainText) {
      return (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-800">Đang dùng text thường, không render LaTeX</span>
            <button
              type="button"
              onClick={() => onChange(editableValue)}
              className="rounded border border-blue-200 bg-white px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              Dùng LaTeX lại
            </button>
          </div>
        </div>
      );
    }

    const normalized = normalizeRichMathText(editableValue);
    const canApplyNormalized = Boolean(normalized && normalized !== editableValue);
    const draftValue = previewDrafts[draftKey] ?? editableValue;
    const editorRows = Math.min(5, Math.max(2, draftValue.split('\n').length));

    const applyDraftValue = () => {
      onChange(draftValue);
      setPreviewDrafts(prev => ({ ...prev, [draftKey]: draftValue }));
      setShowMathPreviews(false);
    };

    const applyPlainTextValue = () => {
      onChange(markPlainTextMathValue(draftValue));
      setPreviewDrafts(prev => ({ ...prev, [draftKey]: draftValue }));
      setShowMathPreviews(false);
    };

    return (
      <div className="mt-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {canApplyNormalized && (
              <button
                type="button"
                onClick={() => onChange(normalized)}
                className="rounded border border-blue-200 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50"
              >
                Dùng bản chuẩn hóa
              </button>
            )}
            <button
              type="button"
              onClick={applyDraftValue}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Dùng ô dưới
            </button>
            <button
              type="button"
              onClick={applyPlainTextValue}
              className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Text thường
            </button>
            <button
              type="button"
              onClick={() => setShowMathPreviews(false)}
              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50"
            >
              <FiEyeOff size={11} />
              Ẩn
            </button>
          </div>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
          <RichMathText value={normalized || editableValue} className="admin-question-preview-math text-gray-900 dark:text-gray-100 text-sm" />
        </div>
        <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-gray-400">
          Mã nguồn LaTeX · sửa nhanh
        </label>
        <textarea
          value={draftValue}
          onChange={event => setPreviewDrafts(prev => ({ ...prev, [draftKey]: event.target.value }))}
          rows={editorRows}
          className="mt-1 w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-xs leading-5 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
        />
      </div>
    );
  };

  const applySingleQuestionOcr = (parsed) => {
    setForm(prev => ({
      ...prev,
      questionType: 'single_choice',
      questionText: parsed.questionText || '',
      questionTextCn: parsed.questionTextCn || '',
      questionTextEn: '',
      imageUrl: parsed.imageUrl || '',
      answers: parsed.answers?.length
        ? parsed.answers.map(answer => ({
            text: answer.text || '',
            textCn: answer.textCn || '',
            textEn: '',
            imageUrl: answer.imageUrl || '',
          }))
        : prev.answers,
      correctAnswer: parsed.correctAnswer || prev.correctAnswer,
      correctAnswerKey: parsed.correctAnswer || prev.correctAnswerKey,
      explanation: parsed.explanation || '',
      explanationCn: parsed.explanationCn || '',
      explanationEn: '',
    }));
  };

  const clearSingleQuestionOcr = () => {
    setForm(prev => ({
      ...prev,
      questionType: 'single_choice',
      questionText: '',
      questionTextCn: '',
      questionTextEn: '',
      imageUrl: '',
      answers: DEFAULT_ANSWERS(),
      correctAnswer: 'A',
      correctAnswerKey: 'A',
      explanation: '',
      explanationCn: '',
      explanationEn: '',
      explanationImageUrl: '',
    }));
  };

  const handleSave = () => {
    if (!form.questionText.trim() && !form.questionTextCn.trim() && !form.questionTextEn.trim()) {
      alert('Vui lòng nhập nội dung câu hỏi (Tiếng Việt, Tiếng Trung hoặc English)');
      return;
    }

    if (form.questionType === 'single_choice' && !form.correctAnswer) {
      alert('Vui lòng chọn đáp án đúng');
      return;
    }

    if (
      form.questionType === 'single_choice' &&
      form.answers.every(a => !a.text?.trim() && !a.textCn?.trim() && !a.textEn?.trim())
    ) {
      alert('Vui lòng nhập ít nhất 2 đáp án');
      return;
    }

    if (form.questionType === 'fill_blank_pool') {
      const filledOpts = form.linkedOptions.filter(o => o.text?.trim() || o.textCn?.trim() || o.textEn?.trim());
      if (filledOpts.length < 2) {
        alert('Điền từ cần ít nhất 2 lựa chọn có nội dung');
        return;
      }
    }

    setSaving(true);
    if (onSave) {
      const isEssay = form.questionType === 'essay';
      onSave({
        ...form,
        // Map answers back to options for schema compatibility
        options: isEssay
          ? []
          : form.answers.map((ans, idx) => ({
              key: ANSWER_KEYS[idx] || String.fromCharCode(65 + idx),
              text: ans.text,
              textCn: ans.textCn,
              textEn: ans.textEn,
              imageUrl: ans.imageUrl,
            })),
        correctAnswer: isEssay ? null : form.correctAnswer,
      });
    }
    setTimeout(() => setSaving(false), 800);
  };

  const qtype = QUESTION_TYPE_LABELS[form.questionType] || QUESTION_TYPE_LABELS.single_choice;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md border border-gray-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-xs">
            {questionNumber}
          </span>
          <div>
            <h3 className="text-white font-bold text-sm">
              {savedQuestionId ? `Sửa Câu ${questionNumber}` : `Câu hỏi ${questionNumber}`}
            </h3>
            <p className="text-white/80 text-xs">{qtype.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedQuestionId && (
            <span className="px-2 py-0.5 bg-yellow-400/30 text-yellow-100 rounded text-xs font-semibold">
              Đã lưu
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg font-semibold text-xs hover:bg-white/30"
            >
              <FiX size={14} />
              Hủy
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-blue-700 rounded-lg font-semibold text-xs hover:bg-blue-50 disabled:opacity-60"
          >
            <FiSave size={14} />
            {saving ? 'Đang lưu...' : savedQuestionId ? 'Cập nhật' : 'Lưu câu'}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center p-1.5 bg-red-500/20 text-white rounded-lg hover:bg-red-500/30"
              title="Xóa câu hỏi"
            >
              <FiTrash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Loại câu hỏi
          </label>
          <select
            value={form.questionType}
            onChange={event => set('questionType', event.target.value)}
            className={ADMIN_SELECT_CLASS}
          >
            <option value="single_choice">Trắc nghiệm - chọn một đáp án</option>
            <option value="essay">Tự luận - nhập bài, tải ảnh hoặc tệp</option>
          </select>
          {form.questionType === 'essay' && (
            <p className="mt-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
              Câu này sẽ chờ giáo viên chấm tay. Học viên có thể gõ bài làm và kéo-thả nhiều ảnh/tệp.
            </p>
          )}
        </div>

        {/* 1. OCR Paste Tool */}
        {form.questionType === 'single_choice' && (
          <SingleQuestionOcrPaste
            onApply={applySingleQuestionOcr}
            onClear={clearSingleQuestionOcr}
          />
        )}

        {/* 2. Nội dung câu hỏi */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Câu hỏi (Tiếng Việt)
            </label>
            <textarea
              value={stripPlainTextMathMarker(form.questionText)}
              onChange={e => setMathText('questionText', e.target.value)}
              rows={2}
              className={ADMIN_TEXTAREA_CLASS}
              placeholder="Nhập câu hỏi (hỗ trợ công thức LaTeX: \(...\) hoặc $$...$$)..."
            />
            {renderMathPreview(form.questionText, value => set('questionText', value), undefined, 'questionText')}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              问题 (中文 - Tùy chọn)
            </label>
            <textarea
              value={stripPlainTextMathMarker(form.questionTextCn)}
              onChange={e => setMathText('questionTextCn', e.target.value)}
              rows={2}
              className={ADMIN_TEXTAREA_CLASS}
              placeholder="输入中文问题..."
            />
            {renderMathPreview(form.questionTextCn, value => set('questionTextCn', value), undefined, 'questionTextCn')}
          </div>

          <ImageUpload
            label="Hình ảnh minh họa câu hỏi (tùy chọn)"
            currentImage={form.imageUrl}
            onImageUploaded={url => set('imageUrl', url)}
            compact
          />
        </div>

        {/* 3. Lựa chọn đáp án A-B-C-D */}
        {form.questionType === 'single_choice' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-xs uppercase tracking-wide">
                Các lựa chọn đáp án
              </h4>
              {form.answers.length < 8 && (
                <button
                  type="button"
                  onClick={() => set('answers', [...form.answers, { text: '', textCn: '', textEn: '', imageUrl: '' }])}
                  className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                >
                  + Thêm lựa chọn
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {form.answers.map((ans, i) => {
                const key = ANSWER_KEYS[i] || String.fromCharCode(65 + i);
                const isCorrect = form.correctAnswer === key;
                return (
                  <div
                    key={key}
                    className={`rounded-lg p-3 border transition-colors ${
                      isCorrect
                        ? 'border-green-400 bg-green-50/70 dark:bg-green-950/30'
                        : 'border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="radio"
                        name={`correctAnswer-${questionNumber}`}
                        checked={isCorrect}
                        onChange={() => set('correctAnswer', key)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className={`font-bold text-xs ${isCorrect ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>
                        {key}. {isCorrect && <span className="text-green-600 dark:text-green-400 text-xs ml-1">✓ Đáp án đúng</span>}
                      </span>
                      {form.answers.length > 2 && (
                        <button
                          type="button"
                          onClick={() => set('answers', form.answers.filter((_, j) => j !== i))}
                          className="ml-auto text-gray-400 hover:text-red-500"
                          title="Xóa lựa chọn này"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={stripPlainTextMathMarker(ans.text)}
                        onChange={e => {
                          const a = [...form.answers];
                          a[i] = { ...a[i], text: preservePlainTextMathMode(ans.text, e.target.value) };
                          set('answers', a);
                        }}
                        className={ADMIN_INPUT_CLASS}
                        placeholder={`Lựa chọn ${key} (Tiếng Việt hoặc công thức LaTeX)...`}
                      />
                      <input
                        type="text"
                        value={stripPlainTextMathMarker(ans.textCn)}
                        onChange={e => {
                          const a = [...form.answers];
                          a[i] = { ...a[i], textCn: preservePlainTextMathMode(ans.textCn, e.target.value) };
                          set('answers', a);
                        }}
                        className={ADMIN_INPUT_CLASS}
                        placeholder={`选项${key} (中文 - Tùy chọn)...`}
                      />
                    </div>

                    {ans.text && renderMathPreview(ans.text, value => {
                      const a = [...form.answers];
                      a[i] = { ...a[i], text: value };
                      set('answers', a);
                    }, `Xem trước ${key}:`, `answer-${i}-text`)}

                    <div className="mt-2">
                      <ImageUpload
                        label={`Ảnh đáp án ${key} (tùy chọn)`}
                        currentImage={ans.imageUrl}
                        onImageUploaded={url => {
                          const answers = [...form.answers];
                          answers[i] = { ...answers[i], imageUrl: url };
                          set('answers', answers);
                        }}
                        compact
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Metadata: Điểm, Độ khó, Đáp án đúng */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 bg-gray-50 dark:bg-slate-800/40 p-3 rounded-lg border border-gray-200 dark:border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Điểm số
            </label>
            <input
              type="number"
              value={form.points}
              onChange={e => set('points', Math.max(0.1, parseFloat(e.target.value) || 1))}
              min={0.1}
              max={100}
              step={0.1}
              className={ADMIN_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Độ khó
            </label>
            <select
              value={form.difficulty}
              onChange={e => set('difficulty', e.target.value)}
              className={ADMIN_SELECT_CLASS}
            >
              <option value="easy">Dễ</option>
              <option value="medium">Trung bình</option>
              <option value="hard">Khó</option>
            </select>
          </div>
          {form.questionType === 'single_choice' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Đáp án đúng
              </label>
              <select
                value={form.correctAnswer}
                onChange={e => set('correctAnswer', e.target.value)}
                className={ADMIN_SELECT_CLASS}
              >
                {ANSWER_KEYS.slice(0, Math.max(2, form.answers.length)).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 5. Giải thích & Lời giải */}
        <details className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm">
          <summary className="cursor-pointer rounded-xl px-4 py-2.5 text-xs font-bold text-blue-900 dark:text-blue-300 transition-colors hover:bg-blue-100/50">
            💡 Lời giải chi tiết & Giải thích đáp án (tùy chọn)
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-3">
            <MathInput
              label="Giải thích (Tiếng Việt)"
              value={form.explanation}
              onChange={v => set('explanation', v)}
              placeholder="VD: Ta có f'(x) = 2x, do đó \(f'(1) = 2\) → đáp án B"
              cnLabel="Giải thích (中文)"
              cnValue={form.explanationCn}
              onCnChange={v => set('explanationCn', v)}
              cnPlaceholder="解释正确答案..."
            />
            <ImageUpload
              label="Ảnh minh họa lời giải (tùy chọn)"
              currentImage={form.explanationImageUrl}
              onImageUploaded={url => set('explanationImageUrl', url)}
              compact
            />
          </div>
        </details>
      </div>
    </div>
  );
}
