import { useState } from 'react';
import {
  FiCheckCircle,
  FiPlus,
  FiTrash2,
  FiAlertCircle,
  FiX,
  FiLayers,
  FiFileText,
} from 'react-icons/fi';
import MathInput from '../MathInput.jsx';
import {
  IMPORT_ANSWER_KEYS,
  createEmptyImportedQuestion,
  createEmptyImportedReadingGroup,
  createEmptyImportedFillBlankGroup,
  validateImportedItems,
  getImportItemsQuestionCount,
} from './pdfImportUtils.js';

export default function PdfImportReview({
  preview,
  items: initialItems = [],
  onApply,
  onCancel,
}) {
  const [items, setItems] = useState(() => (initialItems.length ? initialItems : preview?.items || []));
  const [validationError, setValidationError] = useState('');

  const totalQuestions = getImportItemsQuestionCount(items);

  const handleUpdateItem = (index, updates) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddQuestion = () => {
    setItems((prev) => [...prev, createEmptyImportedQuestion()]);
  };

  const handleAddReadingGroup = () => {
    setItems((prev) => [...prev, createEmptyImportedReadingGroup()]);
  };

  const handleAddFillBlankGroup = () => {
    setItems((prev) => [...prev, createEmptyImportedFillBlankGroup()]);
  };

  const handleApply = () => {
    const error = validateImportedItems(items);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError('');
    if (onApply) {
      onApply(items);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 sm:p-6 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white/20">
                PDF / DOCX Import
              </span>
              <span className="text-xs text-white/80">
                {items.length} mục · {totalQuestions} câu hỏi
              </span>
            </div>
            <h2 className="text-base font-bold mt-0.5">
              Xem lại & Chỉnh sửa câu hỏi trước khi đưa vào đề
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Validation Warning */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 text-xs flex items-center gap-2">
            <FiAlertCircle size={14} className="shrink-0 text-red-600" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Sub-header Controls */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAddQuestion}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100 flex items-center gap-1 border border-blue-200 dark:border-blue-800"
            >
              <FiPlus size={12} /> + Câu đơn
            </button>
            <button
              type="button"
              onClick={handleAddReadingGroup}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 hover:bg-purple-100 flex items-center gap-1 border border-purple-200 dark:border-purple-800"
            >
              <FiLayers size={12} /> + Đọc hiểu
            </button>
            <button
              type="button"
              onClick={handleAddFillBlankGroup}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1 border border-emerald-200 dark:border-emerald-800"
            >
              <FiFileText size={12} /> + Điền từ
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
            >
              <FiCheckCircle size={14} />
              Áp dụng vào đề thi ({items.length})
            </button>
          </div>
        </div>

        {/* Items List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.map((item, index) => {
            const kind = item.itemType || item.kind || 'single_choice';
            const importMeta = item.ocrMetadata || {};
            const confidence = Number.isFinite(Number(importMeta.confidence)) ? Math.round(Number(importMeta.confidence) * 100) : null;
            const sourceImageUrl = importMeta.sourceImageUrl || importMeta.source?.imageUrl || '';
            return (
              <div
                key={item.id || index}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      {kind === 'reading_group'
                        ? 'Nhóm đọc hiểu'
                        : kind === 'fill_blank_group'
                        ? 'Nhóm điền từ'
                        : 'Câu hỏi trắc nghiệm'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(confidence !== null || importMeta.sourcePage) && (
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                        importMeta.reviewRequired || (confidence !== null && confidence < 80)
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}>
                        {confidence !== null ? `Tin cậy ${confidence}%` : 'Cần đối chiếu'}
                        {importMeta.sourcePage ? ` · Trang ${importMeta.sourcePage}` : ''}
                      </span>
                    )}
                    {sourceImageUrl && (
                      <a href={sourceImageUrl} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-sky-600 hover:underline">
                        Xem ảnh gốc
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Xóa câu hỏi này"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Single Choice Question Review */}
                {kind === 'single_choice' && (
                  <div className="space-y-3">
                    <MathInput
                      label="Nội dung câu hỏi"
                      value={item.questionText || ''}
                      onChange={(val) => handleUpdateItem(index, { questionText: val })}
                      cnLabel="Tiếng Trung"
                      cnValue={item.questionTextCn || ''}
                      onCnChange={(val) => handleUpdateItem(index, { questionTextCn: val })}
                      placeholder="Nội dung câu hỏi..."
                    />

                    {/* Choices */}
                    <div className="space-y-2 pt-2">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Các lựa chọn:
                      </label>
                      {(item.answers || item.options || []).map((ans, optIdx) => {
                        const key = IMPORT_ANSWER_KEYS[optIdx] || String.fromCharCode(65 + optIdx);
                        const isCorrect = item.correctAnswer === key;
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-2 p-2 rounded-lg border ${
                              isCorrect
                                ? 'border-green-400 bg-green-50/50 dark:bg-green-950/20'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`correct-import-${index}`}
                              checked={isCorrect}
                              onChange={() => handleUpdateItem(index, { correctAnswer: key })}
                              className="w-4 h-4 text-blue-600"
                              title="Chọn làm đáp án đúng"
                            />
                            <span className="w-5 font-bold text-xs text-slate-500">{key}.</span>
                            <input
                              type="text"
                              value={ans.text || ''}
                              onChange={(e) => {
                                const newAnswers = [...(item.answers || item.options || [])];
                                newAnswers[optIdx] = { ...newAnswers[optIdx], text: e.target.value };
                                handleUpdateItem(index, { answers: newAnswers, options: newAnswers });
                              }}
                              className="flex-1 px-2.5 py-1 text-xs border rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                              placeholder={`Lựa chọn ${key}...`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <MathInput
                      label="Lời giải chi tiết"
                      value={item.explanation || ''}
                      onChange={(val) => handleUpdateItem(index, { explanation: val })}
                      placeholder="Lời giải / Giải thích..."
                    />
                  </div>
                )}

                {/* Reading Group Review */}
                {kind === 'reading_group' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-purple-700 dark:text-purple-300">
                      Đoạn văn đọc hiểu:
                    </label>
                    <textarea
                      value={item.passageText || ''}
                      onChange={(e) => handleUpdateItem(index, { passageText: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 text-xs border rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <div className="text-xs text-slate-500">
                      Chứa {(item.subQuestions || item.questions || []).length} câu hỏi con.
                    </div>
                  </div>
                )}

                {/* Fill Blank Group Review */}
                {kind === 'fill_blank_group' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      Đoạn văn điền từ:
                    </label>
                    <textarea
                      value={item.passageText || ''}
                      onChange={(e) => handleUpdateItem(index, { passageText: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 text-xs border rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <div className="text-xs text-slate-500">
                      Pool từ chọn: {(item.linkedOptions || []).map((o) => `${o.key}: ${o.text}`).join(', ')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs">
              Không có câu hỏi nào trong bản xem trước.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
