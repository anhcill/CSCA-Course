import { useRef } from 'react';
import { FiImage, FiUpload } from 'react-icons/fi';
import { getClipboardImage } from '../ocr/useSingleQuestionImageOcr.js';

export default function SingleQuestionImageOcrInput({
  fileName,
  loading,
  previewUrl,
  onImageFile,
}) {
  const inputRef = useRef(null);

  const handlePaste = (event) => {
    const file = getClipboardImage(event);
    if (!file) return;

    event.preventDefault();
    void onImageFile(file);
  };

  return (
    <div
      tabIndex={0}
      onPaste={handlePaste}
      className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-3 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950/70 dark:focus:border-sky-500 dark:focus:ring-sky-950"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <FiImage size={17} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Dán ảnh vào khung này, ô OCR bên dưới, hoặc chọn ảnh
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ảnh 1 câu hỏi, tối đa 5MB. OCR xong sẽ tự đưa text vào ô dưới.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70"
        >
          <FiUpload size={15} />
          {loading ? 'Đang OCR ảnh...' : 'Chọn ảnh'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onImageFile(file);
          event.target.value = '';
        }}
      />

      {(previewUrl || fileName) && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Ảnh OCR"
              className="h-14 w-20 rounded border border-slate-200 bg-white object-contain dark:border-slate-700"
            />
          )}
          <div className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
            <p className="truncate font-semibold">{fileName}</p>
            <p>
              {loading
                ? 'Đang đọc chữ và công thức...'
                : 'Đã lấy text OCR, kiểm tra rồi tách vào form.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
