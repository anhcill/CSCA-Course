import { Suspense, lazy, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";

const PdfCanvasViewer = lazy(() => import("./PdfCanvasViewer.jsx"));

const formatFileSize = (bytes) => {
  const num = Number(bytes || 0);
  if (!num) return "";
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

const toInlineContentUrl = (url) => {
  if (typeof url !== "string") return null;
  if (/\/api\/files\/\d+\/download(\?|$)/.test(url)) {
    return url.replace(/\/download(\?|$)/, "/content$1");
  }
  return url;
};

export default function DocumentPreviewModal({
  file,
  onClose,
  onDownload,
  onOpenFullscreen,
  inline = false,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (inline || !file) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [inline, file, onClose]);

  if (!file) return null;

  const resolvedName = file.fileName || file.name || "Tài liệu";
  const resolvedMime = file.mimeType || file.mime_type || "";
  const resolvedSize = Number(file.sizeBytes || file.size_bytes || 0);
  const kind = getFileKind(resolvedName, resolvedMime);
  const viewUrl = file.viewUrl || file.view_url || file.cdnUrl || null;
  const contentUrl = toInlineContentUrl(viewUrl);
  const canView = isSafeViewUrl(viewUrl);
  const canEmbed = canView && (kind === "pdf" || kind === "image");
  const canDownload = Boolean(
    (file.downloadUrl || file.download_url)
    && file.allow_file_download !== false
    && file.canDownload !== false,
  );

  const sizeLabel = formatFileSize(resolvedSize);

  const containerClasses = inline
    ? "w-full rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
    : "fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 sm:p-4 backdrop-blur-md";

  const innerClasses = inline
    ? "flex flex-col w-full"
    : `flex flex-col w-full overflow-hidden bg-white dark:bg-slate-900 sm:border sm:border-slate-200 sm:dark:border-slate-800 shadow-2xl transition-all duration-200 ${
        isFullscreen
          ? "h-[100dvh] max-w-none rounded-none"
          : "h-[100dvh] sm:h-[90vh] sm:max-w-5xl sm:rounded-3xl"
      }`;

  const modalNode = (
    <div
      className={containerClasses}
      role={inline ? undefined : "dialog"}
      aria-modal={inline ? undefined : "true"}
      aria-label={inline ? undefined : resolvedName}
      onClick={inline ? undefined : onClose}
    >
      <div
        className={innerClasses}
        onClick={inline ? undefined : (e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div
          className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2.5 sm:px-4 sm:py-3 dark:border-slate-800 dark:bg-slate-900/95"
          style={inline ? undefined : { paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                {resolvedName}
              </h4>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {sizeLabel && (
                  <span className="font-mono text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                    {sizeLabel}
                  </span>
                )}
                {!canDownload && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    <Eye className="h-3 w-3" />
                    Chỉ xem
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Desktop-only Open in New Tab (avoids iOS PWA SFSafariViewController cookie loss on mobile) */}
            {canView && (
              <button
                type="button"
                onClick={() => window.open(viewUrl, "_blank")}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Mở tab mới</span>
              </button>
            )}

            {canDownload && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-950 shadow-2xs transition hover:bg-amber-600"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tải về</span>
              </button>
            )}

            {!inline && (
              <>
                <button
                  type="button"
                  onClick={() => setIsFullscreen((value) => !value)}
                  className="hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 shadow-2xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:inline-flex"
                  title="Toàn màn hình"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-rose-950/40"
                  title="Đóng xem trước"
                  aria-label="Đóng xem trước"
                >
                  <X className="h-4 w-4" />
                  <span className="sm:hidden">Đóng</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Viewer Body */}
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 ${
            inline ? "h-[54vh] sm:h-[68vh]" : ""
          }`}
        >
          {canEmbed && kind === "pdf" && (
            <Suspense
              fallback={
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-slate-300">
                  <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
                  <span className="text-xs font-semibold">Đang khởi tạo trình đọc PDF...</span>
                </div>
              }
            >
              <PdfCanvasViewer
                src={contentUrl}
                fileName={resolvedName}
                knownSizeBytes={resolvedSize}
                protectViewOnly={!canDownload}
                inline={inline}
                onOpenFullscreen={onOpenFullscreen}
              />
            </Suspense>
          )}

          {canEmbed && kind === "image" && (
            <div className="flex h-full w-full items-center justify-center overflow-auto p-3 sm:p-5">
              <img
                src={contentUrl}
                alt={resolvedName}
                onContextMenu={!canDownload ? (e) => e.preventDefault() : undefined}
                className="max-h-full max-w-full rounded-xl object-contain shadow-lg"
              />
            </div>
          )}

          {!canEmbed && (
            <div className="flex h-full items-center justify-center p-4">
              <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <FileText className="mx-auto h-10 w-10 text-slate-400" />
                <h3 className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">
                  Định dạng này không xem trực tiếp được
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {canDownload
                    ? "Nhấn tải về máy để mở bằng Word, Excel hoặc PowerPoint."
                    : "Định dạng này hiện chưa hỗ trợ xem trực tiếp trên trình duyệt."}
                </p>
                {canDownload && onDownload && (
                  <button
                    type="button"
                    onClick={() => onDownload(file)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4" /> Tải tài liệu
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!inline && typeof document !== "undefined") {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}
