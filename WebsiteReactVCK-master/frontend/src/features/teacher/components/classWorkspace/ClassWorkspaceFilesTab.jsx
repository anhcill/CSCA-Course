import { useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  FileText,
  Files,
  Library,
  Link2,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import FileUploadProgressBox from "../../../../components/common/FileUploadProgressBox.jsx";

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
  other: { label: "File", icon: Files, className: "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900/40" },
};

export default function ClassWorkspaceFilesTab({
  files = [],
  sessions = [],
  onUploadFile,
  onDeleteFile,
  onLoadReusableFiles,
  onReuseFile,
  isUploading = false,
}) {
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetSessionId, setTargetSessionId] = useState("");
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showReuseModal, setShowReuseModal] = useState(false);
  const [reusableFiles, setReusableFiles] = useState([]);
  const [reuseSearch, setReuseSearch] = useState("");
  const [reuseLoading, setReuseLoading] = useState(false);
  const [attachingFileId, setAttachingFileId] = useState(null);

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
    if (e && e.preventDefault) e.preventDefault();
    if (!fileToUpload) return;

    if (fileToUpload.size > 100 * 1024 * 1024) {
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Kích thước tệp vượt quá giới hạn",
        errorMessage: "Kích thước tài liệu không được vượt quá 100MB theo quy định.",
      });
      return;
    }

    setUploadProgress({
      status: "uploading",
      percent: 5,
      stage: "init",
      message: "Đang khởi tạo liên kết tải lên an toàn...",
      loaded: 0,
      total: fileToUpload.size,
      errorMessage: "",
    });

    try {
      await onUploadFile(fileToUpload, targetSessionId || undefined, (p) => {
        setUploadProgress((curr) => ({
          ...curr,
          status: p.stage === "done" ? "success" : "uploading",
          percent: p.percent,
          stage: p.stage,
          message: p.message,
          loaded: p.loaded ?? curr?.loaded ?? 0,
          total: p.total ?? fileToUpload.size,
        }));
      });

      setUploadProgress({
        status: "success",
        percent: 100,
        stage: "done",
        message: `Đã tải lên "${fileToUpload.name}" thành công!`,
        loaded: fileToUpload.size,
        total: fileToUpload.size,
      });

      setTimeout(() => {
        setShowUploadModal(false);
        setFileToUpload(null);
        setUploadProgress(null);
        setTargetSessionId("");
      }, 1200);
    } catch (err) {
      const errText = err?.message || "Tải lên tài liệu thất bại. Vui lòng thử lại.";
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Đã xảy ra lỗi khi tải lên tài liệu",
        errorMessage: errText,
        loaded: 0,
        total: fileToUpload.size,
      });
    }
  };

  const loadReusableFiles = async (search = reuseSearch) => {
    if (!onLoadReusableFiles) return;
    setReuseLoading(true);
    try {
      const result = await onLoadReusableFiles({
        sessionId: targetSessionId || undefined,
        search: search.trim() || undefined,
      });
      setReusableFiles(Array.isArray(result) ? result : []);
    } finally {
      setReuseLoading(false);
    }
  };

  const openReuseModal = async () => {
    setTargetSessionId("");
    setReuseSearch("");
    setReusableFiles([]);
    setShowReuseModal(true);
    setReuseLoading(true);
    try {
      const result = await onLoadReusableFiles({});
      setReusableFiles(Array.isArray(result) ? result : []);
    } finally {
      setReuseLoading(false);
    }
  };

  const handleAttachReusableFile = async (file) => {
    if (!onReuseFile) return;
    setAttachingFileId(file.id);
    try {
      const attached = await onReuseFile(file, targetSessionId);
      if (attached !== false) {
        setReusableFiles((current) => current.filter((item) => String(item.id) !== String(file.id)));
      }
    } finally {
      setAttachingFileId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Header & Upload trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4.5 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-teal-50/30 to-white dark:border-emerald-900/40 dark:bg-gradient-to-r dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-900 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/40">
            <Files className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              Tài liệu & Học liệu của lớp
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Slide bài giảng, đề thi và tài liệu học tập được sắp xếp theo từng buổi học ({files.length} tệp).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onLoadReusableFiles && onReuseFile && (
            <button
              type="button"
              onClick={openReuseModal}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
            >
              <Library className="h-4 w-4" />
              <span>Chọn từ kho</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm ring-1 ring-emerald-500/30 transition active:scale-95"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Tải file mới</span>
          </button>
        </div>
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
              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-2.5 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold text-slate-800 dark:text-white capitalize">
                    {dateKey === "common" ? "Tài liệu chung của lớp" : formatDateOnly(dateKey)}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
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
                      key={file.instanceId || file.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/40 shadow-2xs hover:border-emerald-400 hover:shadow-xs dark:hover:border-emerald-700/60 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${config.className}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={file.name || file.title}>
                            {file.name || file.title}
                          </p>
                          {file.sessionTitle && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {file.sessionTitle}
                            </p>
                          )}
                          {file.isReused && (
                            <p className="mt-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                              Dùng lại từ {file.sourceClassTitle || "kho tài liệu"}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {(file.downloadUrl || file.download_url) && (
                          <a
                            href={file.downloadUrl || file.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-600 transition"
                            title="Tải xuống"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        )}
                        {onDeleteFile && (
                          <button
                            type="button"
                            onClick={() => onDeleteFile(file)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title={file.placementId ? "Gỡ tài liệu khỏi vị trí này" : "Xóa file gốc"}
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

      {showReuseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <Library className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">Dùng lại tài liệu đã có</h4>
                  <p className="text-[11px] text-slate-500">File gốc chỉ lưu một lần, lớp này dùng chung liên kết.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowReuseModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Đóng kho tài liệu">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Gắn vào buổi học (tùy chọn)</label>
                <select
                  value={targetSessionId}
                  onChange={async (event) => {
                    setTargetSessionId(event.target.value);
                    setReuseSearch("");
                    setReuseLoading(true);
                    try {
                      const result = await onLoadReusableFiles({ sessionId: event.target.value || undefined });
                      setReusableFiles(Array.isArray(result) ? result : []);
                    } finally {
                      setReuseLoading(false);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Tài liệu chung của lớp</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDateOnly(session.start_time || session.startTime)} - {session.title}
                    </option>
                  ))}
                </select>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  loadReusableFiles();
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={reuseSearch}
                    onChange={(event) => setReuseSearch(event.target.value)}
                    placeholder="Tìm theo tên tài liệu..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">Tìm</button>
              </form>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {reuseLoading ? (
                <p className="py-10 text-center text-xs font-semibold text-slate-500">Đang tải kho tài liệu...</p>
              ) : reusableFiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <Library className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">Không còn tài liệu phù hợp</p>
                  <p className="mt-1 text-[11px] text-slate-400">Chỉ hiện tài liệu cùng khóa học mà bạn có quyền sử dụng.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reusableFiles.map((file) => {
                    const config = kindConfig[kindForFile(file)] || kindConfig.other;
                    const Icon = config.icon;
                    const attaching = String(attachingFileId || "") === String(file.id);
                    return (
                      <article key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${config.className}`}><Icon className="h-4 w-4" /></span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white" title={file.name}>{file.name}</p>
                            <p className="truncate text-[10px] text-slate-500">
                              {file.sourceClassTitle || file.courseTitle || "Kho tài liệu chung"}
                              {file.sourceSessionTitle ? ` · ${file.sourceSessionTitle}` : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(attachingFileId)}
                          onClick={() => handleAttachReusableFile(file)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Link2 className="h-3.5 w-3.5" /> {attaching ? "Đang gắn..." : "Dùng lại"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
                  onChange={(e) => {
                    setFileToUpload(e.target.files?.[0] || null);
                    setUploadProgress(null);
                  }}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700"
                />
              </div>

              {/* Ô thông báo tiến độ & cảnh báo lỗi chi tiết */}
              {uploadProgress && (
                <FileUploadProgressBox
                  file={fileToUpload}
                  progress={uploadProgress}
                  onRetry={handleUploadSubmit}
                  onCancel={() => {
                    setUploadProgress(null);
                    setFileToUpload(null);
                  }}
                />
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    if (isUploading) return;
                    setShowUploadModal(false);
                    setUploadProgress(null);
                    setFileToUpload(null);
                  }}
                  disabled={isUploading}
                  className="rounded-xl px-3 py-1.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {uploadProgress?.status === "success" ? "Đóng" : "Hủy"}
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !fileToUpload || uploadProgress?.status === "success"}
                  className="rounded-xl bg-emerald-600 px-4 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isUploading
                    ? "Đang tải..."
                    : uploadProgress?.status === "error"
                    ? "Thử tải lại"
                    : uploadProgress?.status === "success"
                    ? "Đã tải xong ✓"
                    : "Tải lên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
