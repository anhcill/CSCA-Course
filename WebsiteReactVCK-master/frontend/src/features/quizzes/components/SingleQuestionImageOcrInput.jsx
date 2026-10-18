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
      className="mt-3 rounded-lg border border-dashed border-amber-300 bg-white p-3 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <FiImage size={17} />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Dán ảnh vào khung này, ô OCR bên dưới, hoặc chọn ảnh
            </p>
            <p className="text-xs text-amber-700">
              Ảnh 1 câu hỏi, tối đa 5MB. OCR xong sẽ tự đưa text vào ô dưới.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/70 p-2">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Ảnh OCR"
              className="h-14 w-20 rounded border border-amber-100 bg-white object-contain"
            />
          )}
          <div className="min-w-0 text-xs text-amber-800">
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
