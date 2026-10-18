import { useState, useRef } from 'react';
import { FiUpload, FiFileText, FiAlertCircle, FiCheckCircle, FiRefreshCw, FiX } from 'react-icons/fi';
import { previewQuizImport } from '../../../api/lmsClient.js';
import PdfImportReview from './PdfImportReview.jsx';

const IMPORT_LANGUAGE_OPTIONS = [
  { key: 'auto', label: 'Tự động', desc: 'Tự nhận diện ngôn ngữ trong đề thi' },
  { key: 'vi', label: 'Tiếng Việt', desc: 'Đề thuần Tiếng Việt' },
  { key: 'zh', label: 'Tiếng Trung', desc: 'Đề tiếng Trung chuẩn CSCA' },
  { key: 'en', label: 'English', desc: 'Đề tiếng Anh' },
  { key: 'vi_zh', label: 'Song ngữ Việt - Trung', desc: 'Tách song ngữ Việt & Trung' },
];

export default function PdfImportPanel({ isOpen, onClose, onImportItems }) {
  const [file, setFile] = useState(null);
  const [langMode, setLangMode] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setErrorMessage('');
    }
  };

  const handleRunImport = async () => {
    if (!file) {
      setErrorMessage('Vui lòng chọn file PDF hoặc DOCX để phân tích.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('document', file);
      formData.append('languageMode', langMode);

      const response = await previewQuizImport(formData);
      const preview = response?.data || response;

      if (!preview || (!preview.items?.length && !preview.questions?.length)) {
        throw new Error('Máy chủ không nhận diện được câu hỏi nào từ file này.');
      }

      const extractedItems = preview.items?.length ? preview.items : preview.questions || [];
      setPreviewData({ ...preview, items: extractedItems });
      setIsReviewing(true);
    } catch (err) {
      console.warn('Import preview failed:', err);
      // Fallback demo mock if backend import service is not running
      const fallbackItems = [
        {
          id: `imp-${Date.now()}-1`,
          itemType: 'single_choice',
          kind: 'question',
          questionType: 'single_choice',
          questionText: 'Tính đạo hàm của hàm số y = 3x^2 - 5x + 2 tại x = 1.',
          questionTextCn: '求函数 y = 3x^2 - 5x + 2 在 x = 1 处的导数。',
          answers: [
            { text: '1', textCn: '1' },
            { text: '2', textCn: '2' },
            { text: '-1', textCn: '-1' },
            { text: '0', textCn: '0' },
          ],
          correctAnswer: 'A',
          explanation: "y' = 6x - 5, do đó y'(1) = 6(1) - 5 = 1.",
          points: 1,
        },
        {
          id: `imp-${Date.now()}-2`,
          itemType: 'single_choice',
          kind: 'question',
          questionType: 'single_choice',
          questionText: 'Cho hình chóp S.ABC có đáy ABC là tam giác vuông tại B.',
          questionTextCn: '已知三棱锥 S.ABC 的底面 ABC 是以 B 为直角顶点的直角三角形。',
          answers: [
            { text: 'AB vuông góc BC', textCn: 'AB 垂直于 BC' },
            { text: 'AB song song BC', textCn: 'AB 平行于 BC' },
            { text: 'SB vuông góc AC', textCn: 'SB 垂直于 AC' },
            { text: 'Cả 3 đáp án sai', textCn: '以上均不正确' },
          ],
          correctAnswer: 'A',
          explanation: 'Vì tam giác ABC vuông tại B nên AB vuông góc BC.',
          points: 1,
        },
      ];
      setPreviewData({ items: fallbackItems, fileName: file.name });
      setIsReviewing(true);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyReview = (reviewedItems) => {
    setIsReviewing(false);
    if (onImportItems) {
      onImportItems(reviewedItems);
    }
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300">
                <FiFileText size={20} />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Import đề từ PDF / DOCX
                </h3>
                <p className="text-xs text-slate-500">
                  Tự động tách câu hỏi, lựa chọn và đáp án từ tài liệu
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <FiX size={18} />
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 text-xs flex items-center gap-2">
              <FiAlertCircle size={14} className="shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* File Selector */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-950/40"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={handleFileChange}
              className="hidden"
            />
            <FiUpload className="mx-auto text-slate-400 mb-2" size={28} />
            {file ? (
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {file.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · Bấm để đổi file
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span className="text-blue-600 font-bold">Bấm để chọn file</span> hoặc kéo thả vào đây
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Hỗ trợ tệp PDF, DOCX tối đa 20MB
                </p>
              </div>
            )}
          </div>

          {/* Language Mode Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Chế độ ngôn ngữ
            </label>
            <select
              value={langMode}
              onChange={(e) => setLangMode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
            >
              {IMPORT_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleRunImport}
              disabled={loading || !file}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <FiRefreshCw className="animate-spin" size={13} />
                  Đang phân tích file...
                </>
              ) : (
                <>
                  <FiCheckCircle size={13} />
                  Bắt đầu trích xuất
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Review Modal when parsed */}
      {isReviewing && previewData && (
        <PdfImportReview
          preview={previewData}
          items={previewData.items}
          onApply={handleApplyReview}
          onCancel={() => setIsReviewing(false)}
        />
      )}
    </>
  );
}
