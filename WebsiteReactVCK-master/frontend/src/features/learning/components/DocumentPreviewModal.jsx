import { useState } from "react";
import { Download, ExternalLink, Eye, FileText, Maximize2, Minimize2, ShieldCheck, X } from "lucide-react";

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
  const canDownload = Boolean(file.downloadUrl && file.allow_file_download !== false);

  const containerClasses = inline
    ? "w-full rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
    : "fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-5 backdrop-blur-md";
  const innerClasses = inline
    ? "flex flex-col w-full"
    : `flex flex-col w-full ${isFullscreen ? "h-full max-w-none rounded-none" : "max-w-5xl max-h-[92vh] rounded-3xl"} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all duration-200`;

  return (
    <div className={containerClasses}>
      <div className={innerClasses}>
        {/* Header Modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-xs font-extrabold text-slate-900 dark:text-white sm:text-sm">{file.fileName}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{formatFileSize(file.sizeBytes)}</span>
                {!canDownload && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    <Eye className="h-3 w-3" />
                    Chỉ xem trực tuyến
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Mở tab mới xem toàn trang được bảo vệ chống tải xuống */}
            {canView && (
              <button
                type="button"
                onClick={() => window.open(viewUrl, "_blank", "noopener,noreferrer")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">Mở tab mới</span>
              </button>
            )}

            {/* Chỉ hiển thị nút Tải về khi admin/giảng viên cho phép và có onDownload */}
            {canDownload && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-amber-600"
              >
                <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tải về</span>
              </button>
            )}

            {!inline && (
              <>
                <button
                  type="button"
                  onClick={() => setIsFullscreen((value) => !value)}
                  className="hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:inline-flex"
                  title="Toàn màn hình"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-red-950/40"
                  title="Đóng xem trước"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Khung nội dung xem tài liệu */}
        <div className={`flex min-h-[360px] flex-1 items-center justify-center overflow-hidden bg-slate-900 p-2 sm:p-4 ${isFullscreen ? "h-[calc(100vh-56px)]" : ""}`}>
          {canEmbed && kind === "pdf" && (
            <iframe
              src={viewUrl}
              title={file.fileName}
              allow="fullscreen"
              className={`w-full rounded-2xl border border-slate-200 bg-slate-900 shadow-inner dark:border-slate-800 ${
                isFullscreen ? "h-full" : "h-[65vh] sm:h-[75vh]"
              }`}
            />
          )}

          {canEmbed && kind === "image" && (
            <img
              src={viewUrl}
              alt={file.fileName}
              className={`max-w-full rounded-2xl object-contain shadow-md ${isFullscreen ? "max-h-full" : "max-h-[75vh]"}`}
            />
          )}

          {!canEmbed && (
            <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <FileText className="mx-auto h-10 w-10 text-slate-400" />
              <h3 className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">Không thể xem trực tiếp định dạng này</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {canDownload
                  ? "Hãy mở tài liệu trong tab mới hoặc tải về máy để xem."
                  : "Định dạng này hiện chỉ mở được trong môi trường hỗ trợ."}
              </p>
              {canView && canDownload && (
                <button
                  type="button"
                  onClick={() => window.open(viewUrl, "_blank", "noopener,noreferrer")}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-slate-800 dark:bg-amber-500 dark:text-slate-950"
                >
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
