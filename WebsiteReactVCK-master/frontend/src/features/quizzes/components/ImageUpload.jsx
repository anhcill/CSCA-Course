import { useState, useCallback, useEffect, useId } from 'react';
import { FiX, FiImage, FiAlertCircle, FiClipboard, FiLink } from 'react-icons/fi';
import { uploadImageToR2 } from '../../api/lmsClient.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function ImageUpload({
  onImageUploaded,
  currentImage,
  label = 'Tải ảnh',
  compact = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState(currentImage);
  const [error, setError] = useState(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const inputId = useId();

  useEffect(() => {
    setPreview(currentImage);
  }, [currentImage]);

  const uploadImage = useCallback(
    async (file) => {
      if (uploading) return;

      if (!file || !file.type.startsWith('image/')) {
        setError('Vui lòng chọn hoặc dán một tệp ảnh hợp lệ');
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setError('Ảnh vượt quá dung lượng tối đa 5MB');
        return;
      }

      try {
        setUploading(true);
        setError(null);

        // Try LMS R2 upload first
        try {
          const res = await uploadImageToR2(file, { folder: 'quizzes' });
          const url = res?.publicUrl || res?.fileUrl || res?.data?.publicUrl;
          if (url) {
            setPreview(url);
            onImageUploaded(url);
            return;
          }
        } catch (uploadErr) {
          console.warn('R2 upload failed or not configured, using inline base64 data URL:', uploadErr);
        }

        // Fallback to Data URL for standalone / mock / dev preview
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          setPreview(dataUrl);
          onImageUploaded(dataUrl);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        const message = err?.message || 'Tải ảnh thất bại';
        setError(message);
        console.error('Upload error:', err);
      } finally {
        setUploading(false);
      }
    },
    [onImageUploaded, uploading]
  );

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        void uploadImage(e.dataTransfer.files[0]);
      }
    },
    [uploadImage]
  );

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      void uploadImage(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handlePaste = (e) => {
    const imageItem = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith('image/')
    );
    const file = imageItem?.getAsFile();
    if (!file) return;

    e.preventDefault();
    void uploadImage(file);
  };

  const removeImage = () => {
    setPreview(undefined);
    onImageUploaded('');
  };

  const handleApplyUrl = () => {
    if (customUrl.trim()) {
      setPreview(customUrl.trim());
      onImageUploaded(customUrl.trim());
      setShowUrlInput(false);
      setCustomUrl('');
    }
  };

  return (
    <div
      tabIndex={0}
      onPaste={handlePaste}
      className="space-y-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
    >
      {label && <label className="block text-xs font-semibold text-gray-700">{label}</label>}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <FiAlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto">
            <FiX size={14} />
          </button>
        </div>
      )}

      {preview ? (
        <div>
          <div className="relative group w-fit max-w-full">
            <img
              src={preview}
              alt="Preview"
              className={`${
                compact ? 'max-h-28 max-w-full' : 'max-w-xs'
              } rounded-lg border-2 border-gray-200 object-contain bg-white`}
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-90 hover:opacity-100 transition-opacity"
              title="Xóa ảnh"
            >
              <FiX size={14} />
            </button>
          </div>
          <button
            type="button"
            disabled={uploading}
            className="mt-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-gray-500 outline-none hover:bg-gray-50 disabled:opacity-60"
          >
            <FiClipboard size={12} />
            {uploading ? 'Đang tải ảnh...' : 'Bấm đây rồi nhấn Ctrl+V để thay ảnh từ clipboard'}
          </button>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg ${
            compact ? 'p-3' : 'p-5'
          } text-center transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            type="file"
            id={`file-upload-${inputId}`}
            className="hidden"
            accept="image/*"
            onChange={handleFileInput}
            disabled={uploading}
          />

          <label
            htmlFor={`file-upload-${inputId}`}
            className="cursor-pointer flex flex-col items-center space-y-1.5"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-xs text-gray-600">Đang tải ảnh...</p>
              </>
            ) : (
              <>
                <FiImage className="text-gray-400" size={compact ? 24 : 36} />
                <div className="text-xs text-gray-600">
                  <span className="font-semibold text-blue-600">Click để chọn</span>, kéo thả hoặc dán ảnh (Ctrl+V)
                </div>
                <p className="text-[11px] text-gray-400">PNG, JPG, GIF, WebP tối đa 5MB</p>
              </>
            )}
          </label>

          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 underline"
            >
              <FiLink size={11} /> Hoặc nhập link ảnh
            </button>
          </div>

          {showUrlInput && (
            <div className="mt-2 flex items-center gap-1.5 max-w-sm mx-auto">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-2.5 py-1 text-xs border rounded-lg outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleApplyUrl}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Dùng
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
