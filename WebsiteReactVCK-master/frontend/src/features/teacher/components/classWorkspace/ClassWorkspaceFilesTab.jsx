/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Files,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateOnly = (dateString) => {
  if (!dateString) return "Chưa có ngày";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Chưa có ngày";
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

function kindForFile(file) {
  const val = (String(file.mimeType || file.mime_type || "") + " " + String(file.name || file.title || "")).toLowerCase();
  if (val.includes("pdf")) return "pdf";
  if (val.includes("word") || val.includes("doc")) return "doc";
  if (val.includes("sheet") || val.includes("excel") || val.includes("xls") || val.includes("csv")) return "sheet";
  if (val.includes("presentation") || val.includes("ppt")) return "slide";
  return "other";
}

const kindConfig = {
  pdf: { label: "PDF", icon: FileText, className: "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40" },
  doc: { label: "Word", icon: FileText, className: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 border-blue-200 dark:border-blue-900/40" },
  sheet: { label: "Excel", icon: FileSpreadsheet, className: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40" },
  slide: { label: "Slide", icon: FileText, className: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40" },
  other: { label: "File", icon: Files, className: "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
};

export default function ClassWorkspaceFilesTab({
  files = [],
  sessions = [],
  classId,
  onUploadFile,
  onDeleteFile,
  isUploading = false,
}) {
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetSessionId, setTargetSessionId] = useState("");
  const [fileToUpload, setFileToUpload] = useState(null);

  // Group files by session / date
  const groupedFiles = useMemo(() => {
    const filtered = selectedSessionId === "all"
      ? files
      : files.filter((f) => String(f.classSessionId || f.class_session_id || "") === String(selectedSessionId));

    const map = new Map();
    for (const f of filtered) {
      const key = f.sessionStartTime
        ? f.sessionStartTime.slice(0, 10)
        : (f.uploadedAt ? f.uploadedAt.slice(0, 10) : "common");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }

    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "common") return 1;
      if (b[0] === "common") return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [files, selectedSessionId]);

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!fileToUpload) return;
    try {
      await onUploadFile(fileToUpload, targetSessionId || undefined);
      setShowUploadModal(false);
      setFileToUpload(null);
      setTargetSessionId("");
    } catch {
      // toast already handled by caller
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Header & Upload trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Files className="h-4 w-4 text-blue-600 dark:text-sky-400" />
            Tài liệu & Học liệu của lớp
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Slide bài giảng, đề thi và tài liệu học tập được sắp xếp theo từng buổi học.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
        >
          <UploadCloud className="h-4 w-4" />
          <span>Tải lên tài liệu</span>
        </button>
      </div>

      {/* Filter by Session */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
          <span className="font-bold text-slate-500 whitespace-nowrap">Lọc theo buổi:</span>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="w-full sm:w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            <option value="all">Tất cả các buổi ({files.length} file)</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDateOnly(s.start_time || s.startTime)} - {s.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-xs">
          <FileText className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-white">Lớp chưa có tài liệu nào</p>
          <p className="mt-1 text-xs text-slate-500">Tải lên tài liệu để học viên có thể ôn tập và tải về máy theo từng ngày học.</p>
        </div>
      ) : (
        /* Timeline of Sessions */
        <div className="space-y-4">
          {groupedFiles.map(([dateKey, groupFiles]) => (
            <div
              key={dateKey}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs"
            >
              <div className="bg-slate-50/80 dark:bg-slate-800/40 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                  <span className="font-bold text-slate-800 dark:text-white capitalize">
                    {dateKey === "common" ? "Tài liệu chung của lớp" : formatDateOnly(dateKey)}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-semibold">
                  {groupFiles.length} file
                </span>
              </div>

              <div className="p-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupFiles.map((file) => {
                  const kind = kindForFile(file);
                  const config = kindConfig[kind];
                  const Icon = config.icon;
                  return (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 shadow-2xs hover:shadow-xs transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${config.className}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={file.name || file.title}>
                            {file.name || file.title}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatBytes(file.sizeBytes || file.size_bytes)} {file.sessionTitle ? `· ${file.sessionTitle}` : ""}
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                Tải lên tài liệu cho lớp
              </h4>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Gắn vào buổi học (tùy chọn):
                </label>
                <select
                  value={targetSessionId}
                  onChange={(e) => setTargetSessionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 font-semibold"
                >
                  <option value="">Tài liệu chung của lớp</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDateOnly(s.start_time || s.startTime)} - {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn file tải lên:
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                  className="rounded-xl px-3 py-1.5 font-bold text-slate-500 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !fileToUpload}
                  className="rounded-xl bg-blue-600 px-4 py-1.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUploading ? "Đang tải..." : "Tải lên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
