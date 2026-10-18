import { useRef, useState } from 'react';
import { FiFile, FiImage, FiPaperclip, FiTrash2, FiUploadCloud } from 'react-icons/fi';
import { confirmSubmissionAsset, requestSubmissionUploadUrl } from '../../api/lmsClient.js';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const normalizeValue = (value) => ({
  text: typeof value?.text === 'string' ? value.text : '',
  notes: typeof value?.notes === 'string' ? value.notes : '',
  attachments: Array.isArray(value?.attachments) ? value.attachments : [],
});

const resolveMimeType = (file) => {
  if (file.type) return file.type;
  const name = String(file.name || '').toLowerCase();
  if (/\.jpe?g$/.test(name)) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
};

const formatFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageAttachment = (attachment) => (
  String(attachment?.mimeType || '').startsWith('image/')
  || /\.(?:jpe?g|png|webp|gif)$/i.test(String(attachment?.name || ''))
);

export default function EssayAnswerInput({ questionId, value, onChange }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [error, setError] = useState('');
  const answer = normalizeValue(value);

  const updateAnswer = (patch) => onChange({ ...answer, ...patch });

  const uploadFiles = async (fileList) => {
    if (uploading) return;
    const availableSlots = MAX_FILES - answer.attachments.length;
    const files = Array.from(fileList || []).slice(0, Math.max(0, availableSlots));
    if (files.length === 0) {
      setError(availableSlots <= 0 ? `Mỗi câu được đính kèm tối đa ${MAX_FILES} tệp.` : 'Chưa chọn tệp để tải lên.');
      return;
    }

    setUploading(true);
    setError('');
    const uploaded = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file.size > MAX_FILE_BYTES) throw new Error(`Tệp "${file.name}" vượt quá 25MB.`);
        const mimeType = resolveMimeType(file);
        setUploadMessage(`Đang tải ${index + 1}/${files.length}: ${file.name}`);
        const targetResponse = await requestSubmissionUploadUrl({
          filename: file.name,
          mimeType,
          sizeBytes: file.size,
          assetKind: 'file',
        });
        const target = targetResponse?.data || targetResponse;
        const uploadResponse = await fetch(target.uploadUrl, {
          method: 'PUT',
          headers: target.headers || { 'Content-Type': mimeType },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error(`Không thể tải "${file.name}" lên kho lưu trữ.`);
        const confirmResponse = await confirmSubmissionAsset({
          assetId: target.assetId,
          mimeType,
          sizeBytes: file.size,
        });
        const confirmed = confirmResponse?.data || confirmResponse;
        const assetId = confirmed?.id || target.assetId;
        uploaded.push({
          assetId,
          id: `asset-${assetId}`,
          name: file.name,
          size: file.size,
          mimeType,
          url: `/api/assignments/submission-assets/${assetId}/access`,
          uploadedAt: new Date().toISOString(),
        });
      }
      updateAnswer({ attachments: [...answer.attachments, ...uploaded] });
    } catch (uploadError) {
      if (uploaded.length > 0) updateAnswer({ attachments: [...answer.attachments, ...uploaded] });
      setError(uploadError?.message || 'Không thể tải tệp lên. Vui lòng thử lại.');
    } finally {
      setUploading(false);
      setUploadMessage('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAttachment = (assetId) => {
    updateAnswer({
      attachments: answer.attachments.filter((attachment) => String(attachment.assetId) !== String(assetId)),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor={`essay-answer-${questionId}`} className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Bài làm tự luận
          </label>
          <span className="text-[11px] text-slate-400">Tự động lưu khi nhập</span>
        </div>
        <textarea
          id={`essay-answer-${questionId}`}
          value={answer.text}
          onChange={(event) => updateAnswer({ text: event.target.value })}
          rows={9}
          className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-950"
          placeholder="Nhập bài làm tại đây. Bạn có thể dùng công thức LaTeX và đính kèm ảnh chụp bài viết tay ở bên dưới..."
        />
      </div>

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
            : 'border-slate-300 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/50'
        }`}
      >
        <FiUploadCloud className="mx-auto mb-2 text-blue-600" size={28} />
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Kéo-thả ảnh hoặc tệp bài làm vào đây
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Tối đa {MAX_FILES} tệp cho mỗi câu, mỗi tệp không quá 25MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.zip"
          onChange={(event) => void uploadFiles(event.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || answer.attachments.length >= MAX_FILES}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiPaperclip size={14} />
          {uploading ? 'Đang tải lên...' : 'Chọn ảnh hoặc tệp'}
        </button>
        {uploadMessage && <p className="mt-2 truncate text-xs font-medium text-blue-600">{uploadMessage}</p>}
        {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {answer.attachments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200">Tệp đã đính kèm</span>
            <span className="text-slate-400">{answer.attachments.length}/{MAX_FILES}</span>
          </div>
          {answer.attachments.map((attachment) => (
            <div
              key={attachment.assetId}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                {isImageAttachment(attachment) ? <FiImage size={17} /> : <FiFile size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={attachment.url || `/api/assignments/submission-assets/${attachment.assetId}/access`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs font-bold text-slate-800 hover:text-blue-600 dark:text-slate-100"
                >
                  {attachment.name || `Tệp ${attachment.assetId}`}
                </a>
                <span className="text-[11px] text-slate-400">{formatFileSize(attachment.size)}</span>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.assetId)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                title="Gỡ tệp khỏi câu trả lời"
              >
                <FiTrash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
