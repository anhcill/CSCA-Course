import { Link } from "react-router-dom";
import { Download, Eye, FileSpreadsheet, FileText, Files } from "lucide-react";

const kindForFile = (mime, name = "") => {
  const val = (String(mime || "") + " " + String(name || "")).toLowerCase();
  if (val.includes("pdf")) return "pdf";
  if (val.includes("word") || val.includes("doc")) return "doc";
  if (val.includes("sheet") || val.includes("excel") || val.includes("xls") || val.includes("csv")) return "sheet";
  if (val.includes("presentation") || val.includes("powerpoint") || val.includes("ppt")) return "slide";
  if (val.includes("image") || val.includes("png") || val.includes("jpg") || val.includes("jpeg")) return "image";
  return "other";
};

const kindBadge = {
  pdf: { label: "PDF", icon: FileText, className: "bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-900/60", pill: "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300" },
  doc: { label: "Word", icon: FileText, className: "bg-blue-50 text-blue-600 border-blue-200/80 dark:bg-blue-950/60 dark:text-sky-400 dark:border-blue-900/60", pill: "bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-sky-300" },
  sheet: { label: "Excel", icon: FileSpreadsheet, className: "bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/60", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300" },
  slide: { label: "Slide", icon: FileText, className: "bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900/60", pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300" },
  image: { label: "Ảnh", icon: Files, className: "bg-purple-50 text-purple-600 border-purple-200/80 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-900/60", pill: "bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300" },
  other: { label: "Tài liệu", icon: Files, className: "bg-cyan-50 text-cyan-600 border-cyan-200/80 dark:bg-cyan-950/60 dark:text-cyan-400 dark:border-cyan-900/60", pill: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300" },
};

export default function ClassMaterialsNoticesCard({
  files = [],
  classNotice,
  classTitle,
  basePath,
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
          {files.slice(0, 3).map((file) => {
            const kind = kindForFile(file.mimeType || file.mime_type, file.name);
            const cfg = kindBadge[kind] || kindBadge.other;
            const Icon = cfg.icon;
            const downloadUrl = file.downloadUrl || file.download_url;
            const viewUrl = file.viewUrl || file.view_url || downloadUrl;
            const canDownload = file.canDownload !== false && Boolean(downloadUrl);

            return (
              <a
                key={file.instanceId || file.id}
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-3.5 transition-all duration-200 hover:border-blue-400 dark:hover:border-sky-500/60 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105 ${cfg.className}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 transition-colors">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                      <span className={`px-1 rounded font-bold uppercase ${cfg.pill}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-900 text-slate-400 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-600 transition shadow-2xs">
                  {canDownload ? <Download className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
