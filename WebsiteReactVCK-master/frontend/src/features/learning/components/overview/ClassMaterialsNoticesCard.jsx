import { Link } from "react-router-dom";
import { Download, FileText } from "lucide-react";

const formatFileSize = (bytes) => {
  const value = Number(bytes) || 0;
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ClassMaterialsNoticesCard({
  files = [],
  classNotice,
  classTitle,
  basePath
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Tài liệu & Thông báo lớp</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tài liệu được chia sẻ riêng cho học viên lớp {classTitle || ""}.</p>
        </div>
        <Link to={`${basePath}/materials`} className="text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline">
          Xem kho tài liệu
        </Link>
      </div>

      {classNotice && (
        <div className="mt-4 rounded-xl border border-blue-100 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-800/30 p-3.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-white">Thông báo lớp: </strong>
          {classNotice}
        </div>
      )}

      {files.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Chưa có tài liệu được tải lên cho lớp này.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.slice(0, 3).map((file) => (
            <a
              key={file.id}
              href={file.downloadUrl || file.download_url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 p-3 transition hover:border-blue-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400">
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    {formatFileSize(file.sizeBytes || file.size_bytes)}
                  </p>
                </div>
              </div>
              <Download className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-sky-400" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
