import { FolderOpen, ExternalLink, School } from "lucide-react";

export default function RecordingDriveFoldersWidget({ classes = [] }) {
  const classesWithDrive = classes.filter((c) => Boolean(c.folderOpenUrl || c.folderUrl || c.classDriveUrl));

  const formatClassTitle = (title) => {
    if (!title) return "Lớp học";
    const str = String(title).trim();
    if (/^\d+$/.test(str)) return `Lớp ${str}`;
    return str;
  };

  return (
    <section className="rounded-2xl border border-white/85 bg-white/92 dark:border-slate-800 dark:bg-slate-900/90 p-4 sm:p-5 shadow-[0_8px_30px_rgba(32,78,120,0.08)] backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3.5">
        <FolderOpen className="h-4 w-4 text-[#102f63] dark:text-blue-400" />
        <h2 className="text-sm font-black text-[#102f63] dark:text-white tracking-tight">
          Drive lớp học
        </h2>
      </div>

      {classesWithDrive.length === 0 ? (
        <p className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Chưa có liên kết Drive lưu trữ được công bố.
        </p>
      ) : (
        <div className="space-y-2">
          {classesWithDrive.map((c) => {
            const driveUrl = c.classDriveUrl || c.folderOpenUrl || c.folderUrl;
            return (
              <a
                key={c.id}
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/90 dark:bg-slate-800/80 p-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition hover:border-blue-200 dark:hover:border-slate-700 hover:bg-blue-50/70 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-400"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition">
                    <School className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                      {formatClassTitle(c.title)}
                    </p>
                    <p className="truncate text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                      {c.courseTitle || "Khóa học"}
                    </p>
                  </div>
                </div>

                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
