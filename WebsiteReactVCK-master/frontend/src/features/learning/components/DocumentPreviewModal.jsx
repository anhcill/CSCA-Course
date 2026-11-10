import { useState } from "react";
import { Download, ExternalLink, FileText, Maximize2, Minimize2, X } from "lucide-react";

const formatFileSize = (bytes) => {
  const num = Number(bytes || 0);
  if (!num) return "Không rõ dung lượng";
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
};

const getFileKind = (fileName = "", mimeType = "") => {
  const ext = String(fileName).split(".").pop()?.toLowerCase() || "";
  const mime = String(mimeType).toLowerCase();
  if (ext === "pdf" || mime.includes("pdf")) return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || mime.startsWith("image/")) return "image";
  return "document";
};

const isSafeViewUrl = (value) => (
  typeof value === "string"
  && (value.startsWith("/api/") || value.startsWith("https://") || value.startsWith("http://"))
);

export default function DocumentPreviewModal({ file, onClose, onDownload, inline = false }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  if (!file) return null;

  const kind = getFileKind(file.fileName, file.mimeType);
  const viewUrl = file.viewUrl || file.cdnUrl || null;
  const canView = isSafeViewUrl(viewUrl);
  const canEmbed = canView && (kind === "pdf" || kind === "image");
  const containerClasses = inline
    ? "w-full rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
    : "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-6 backdrop-blur-sm";
  const innerClasses = inline
    ? "flex flex-col w-full"
    : `flex flex-col w-full ${isFullscreen ? "h-full max-w-none rounded-none" : "max-w-5xl max-h-[90vh] rounded-3xl"} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden`;

  return (
    <div className={containerClasses}>
      <div className={innerClasses}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-xs font-extrabold text-slate-900 dark:text-white sm:text-sm">{file.fileName}</h4>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{formatFileSize(file.sizeBytes)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {canView && (
              <button type="button" onClick={() => window.open(viewUrl, "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">Mở tab mới</span>
              </button>
            )}
            {onDownload && (
              <button type="button" onClick={() => onDownload(file)} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-600">
                <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tải về</span>
              </button>
            )}
            {!inline && (
              <>
                <button type="button" onClick={() => setIsFullscreen((value) => !value)} className="hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:inline-flex" title="Toàn màn hình">
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800" title="Đóng xem trước">
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-[360px] flex-1 items-center justify-center overflow-hidden bg-slate-100 p-3 dark:bg-slate-950/90 sm:p-5">
          {canEmbed && kind === "pdf" && <iframe src={viewUrl} title={file.fileName} className="h-[520px] w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-800" />}
          {canEmbed && kind === "image" && <img src={viewUrl} alt={file.fileName} className="max-h-[70vh] max-w-full rounded-2xl object-contain" />}
          {!canEmbed && (
            <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <FileText className="mx-auto h-10 w-10 text-slate-400" />
              <h3 className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">Không thể xem trực tiếp định dạng này</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Hãy mở tài liệu trong tab mới. Nút tải chỉ xuất hiện khi chính sách của lớp cho phép tải xuống.</p>
              {canView && (
                <button type="button" onClick={() => window.open(viewUrl, "_blank", "noopener,noreferrer")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-amber-500 dark:text-slate-950">
                  <ExternalLink className="h-4 w-4" /> Mở tài liệu
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
