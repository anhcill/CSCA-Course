import { Download, FileText, Trash2, UploadCloud } from "lucide-react";

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ClassWorkspaceFilesTab({
  files = [],
  classId,
  onUploadFile,
  onDeleteFile,
  isUploading = false
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Tài liệu & Học liệu của lớp</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tải lên slide, tài liệu ôn tập và đề thi đính kèm cho lớp.</p>
        </div>
        <label className={`cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
          <UploadCloud className="h-4 w-4" />
          <span>{isUploading ? "Đang tải lên..." : "Tải lên tài liệu"}</span>
          <input
            type="file"
            onChange={onUploadFile}
            className="hidden"
            disabled={isUploading}
          />
        </label>
      </div>

      {files.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <FileText className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Lớp chưa có tài liệu nào</p>
          <p className="mt-1 text-xs text-slate-500">Tải lên tài liệu để học viên có thể ôn tập và tải về máy.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {file.name || file.title}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatBytes(file.sizeBytes || file.size_bytes)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {(file.downloadUrl || file.download_url) && (
                  <a
                    href={file.downloadUrl || file.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Tải xuống"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {onDeleteFile && (
                  <button
                    type="button"
                    onClick={() => onDeleteFile(file.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Xóa tài liệu"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
