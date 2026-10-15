/* eslint-disable react/prop-types */
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Files,
  Loader2,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

export const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

function getFileIcon(mime, name = "") {
  const val = (String(mime || "") + " " + String(name || "")).toLowerCase();
  if (val.includes("pdf")) return { icon: FileText, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50" };
  if (val.includes("word") || val.includes("doc")) return { icon: FileText, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50" };
  if (val.includes("sheet") || val.includes("excel") || val.includes("xls") || val.includes("csv")) return { icon: FileSpreadsheet, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50" };
  if (val.includes("presentation") || val.includes("powerpoint") || val.includes("ppt")) return { icon: FileText, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50" };
  return { icon: Files, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/50" };
}

/**
 * FileUploadProgressBox: Hiển thị tiến trình tải tài liệu chi tiết (tiến độ %, dung lượng MB, trạng thái các bước)
 * và ô thông báo lỗi chi tiết kèm nút thử lại khi có lỗi.
 */
export default function FileUploadProgressBox({
  file,
  progress = {},
  onRetry,
  onCancel,
  onRemove,
  onReplace,
  isDeleting = false,
  className = "",
}) {
  const {
    status = "idle", // 'idle' | 'uploading' | 'success' | 'error'
    percent = 0,
    loaded = 0,
    total = file?.size || 0,
    message = "Đang xử lý...",
    errorMessage = "",
    stage = "init", // 'init' | 'uploading' | 'confirming' | 'done' | 'error'
  } = progress;

  if (status === "idle" && !file) return null;

  const fileConfig = getFileIcon(file?.type, file?.name);
  const IconComponent = fileConfig.icon;
  const isError = status === "error";
  const isSuccess = status === "success";
  const isUploading = status === "uploading";

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 p-4 ${
        isError
          ? "border-rose-300 bg-rose-50/80 dark:border-rose-900/80 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100 shadow-sm"
          : isSuccess
          ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-900/80 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 shadow-sm"
          : "border-blue-200 bg-blue-50/50 dark:border-blue-900/60 dark:bg-blue-950/20 text-slate-800 dark:text-slate-100 shadow-xs"
      } ${className}`}
    >
      {/* Header: File info */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${fileConfig.bg}`}>
            <IconComponent className={`h-5 w-5 ${fileConfig.color}`} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate text-slate-900 dark:text-white" title={file?.name}>
              {file?.name || "Tài liệu tải lên"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {formatBytes(file?.size)}
              {isUploading && total > 0 && (
                <span className="font-semibold text-blue-600 dark:text-sky-400 ml-1.5">
                  ({formatBytes(loaded)} / {formatBytes(total)})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div>
          {isUploading && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-sky-300 px-2.5 py-1 text-[11px] font-bold">
              <Loader2 className="h-3 w-3 animate-spin" />
              {percent}%
            </span>
          )}
          {isSuccess && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-[11px] font-bold">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Thành công
            </span>
          )}
          {isError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 px-2.5 py-1 text-[11px] font-bold">
              <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              Có lỗi xảy ra
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar (when uploading or success) */}
      {(isUploading || isSuccess) && (
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              {isUploading && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
              {message}
            </span>
            <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
              {percent}%
            </span>
          </div>

          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isSuccess
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                  : "bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600"
              }`}
              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>

          {/* Stepper details */}
          <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] text-center text-slate-500 dark:text-slate-400">
            <div className={`transition ${stage === "init" ? "font-bold text-blue-600 dark:text-sky-400" : stage !== "init" && percent > 10 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              1. Khởi tạo liên kết
            </div>
            <div className={`transition ${stage === "uploading" ? "font-bold text-blue-600 dark:text-sky-400" : stage === "confirming" || stage === "done" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              2. Đang tải file lên
            </div>
            <div className={`transition ${stage === "confirming" ? "font-bold text-blue-600 dark:text-sky-400" : stage === "done" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              3. Lưu dữ liệu
            </div>
          </div>
        </div>
      )}

      {/* Success Actions Bar: Thay file khác / Xóa file */}
      {isSuccess && (onReplace || onRemove) && (
        <div className="mt-3.5 pt-3 border-t border-emerald-200/80 dark:border-emerald-900/60 flex flex-wrap items-center justify-end gap-2">
          {onReplace && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={onReplace}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span>Thay file khác</span>
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition disabled:opacity-50 shadow-2xs cursor-pointer"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />
                  <span>Đang xóa file...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  <span>Xóa file</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Error State Box */}
      {isError && (
        <div className="mt-3 rounded-xl border border-rose-300 dark:border-rose-900 bg-white dark:bg-slate-900 p-3.5 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h5 className="text-xs font-bold text-rose-700 dark:text-rose-300">
                Tải lên tài liệu thất bại
              </h5>
              <p className="text-[11px] text-rose-600 dark:text-rose-400/90 mt-0.5 leading-relaxed break-words">
                {errorMessage || message || "Xảy ra lỗi trong quá trình tải dữ liệu lên máy chủ lưu trữ."}
              </p>
            </div>
          </div>

          {/* Action buttons on error */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-100 dark:border-rose-950">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                <X className="h-3 w-3" /> Hủy / Chọn file khác
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition"
              >
                <RefreshCw className="h-3 w-3" /> Thử tải lại
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
