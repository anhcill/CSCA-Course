import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  FiFolder,
  FiFileText,
  FiSearch,
  FiDownload,
  FiCheckCircle,
  FiBookOpen,
  FiUser,
  FiClock,
  FiFilter,
} from "react-icons/fi";
import { fetchStudentFiles } from "../../api/lmsClient";
import { EmptyState, LoadingState } from "../../../components/common/StateView";

export default function StudentFilesPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("ALL");

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStudentFiles();
      if (res?.data) {
        setFiles(res.data);
      }
    } catch (err) {
      console.error("Error loading student files:", err);
      toast.error("Không thể tải danh sách tài liệu!");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDownload = (file) => {
    if (!file.downloadUrl) {
      toast.error("Tài liệu chưa có đường dẫn tải xuống");
      return;
    }
    window.open(file.downloadUrl, "_blank", "noopener,noreferrer");
  };

  const getFileIconColor = (mimeType) => {
    if (mimeType.includes("pdf")) return "text-rose-500 bg-rose-500/10";
    if (mimeType.includes("word") || mimeType.includes("document")) return "text-blue-500 bg-blue-500/10";
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "text-emerald-500 bg-emerald-500/10";
    return "text-purple-500 bg-purple-500/10";
  };

  const filteredFiles = files.filter((file) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      file.name.toLowerCase().includes(term) ||
      file.courseTitle.toLowerCase().includes(term) ||
      file.teacherName.toLowerCase().includes(term);

    let matchesType = true;
    if (selectedType === "PDF") matchesType = file.mimeType.includes("pdf");
    else if (selectedType === "DOC") matchesType = file.mimeType.includes("word") || file.mimeType.includes("document");
    else if (selectedType === "SHEET") matchesType = file.mimeType.includes("sheet") || file.mimeType.includes("excel");

    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8 pb-20 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-2">
              <FiFolder className="w-3.5 h-3.5" />
              <span>Cloudflare R2 Learning Repository</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Tài Liệu Học Tập Của Tôi
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Truy cập và tải về toàn bộ giáo trình, bài tập mẫu và bảng từ vựng từ các lớp học đã ghi danh.
            </p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/70 border border-white/10 p-4 rounded-2xl">
          {/* Type Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              ["ALL", "Tất cả tài liệu"],
              ["PDF", "Giáo trình PDF"],
              ["DOC", "Tài liệu Word"],
              ["SHEET", "Bảng Excel"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setSelectedType(val)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedType === val
                    ? "bg-sky-600 text-white shadow-sm"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên file, khóa học, giáo viên..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white outline-none focus:border-sky-500 transition"
            />
          </div>
        </div>

        {/* File Cards Grid */}
        {loading ? (
          <LoadingState message="Đang tải danh sách tài liệu học tập..." count={3} />
        ) : filteredFiles.length === 0 ? (
          <EmptyState
            icon={FiFolder}
            title="Không tìm thấy tài liệu phù hợp"
            description="Bạn chưa có tài liệu nào trong danh mục này hoặc không có kết quả tìm kiếm trùng khớp."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.map((file) => (
              <article
                key={file.id}
                className="bg-slate-900/80 border border-white/10 hover:border-sky-500/40 rounded-2xl p-5 space-y-4 transition flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-slate-300 text-[10px] font-mono">
                      {file.courseTitle}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-2xl ${getFileIconColor(file.mimeType)} shrink-0`}>
                      <FiFileText className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white line-clamp-2 group-hover:text-sky-400 transition">
                        {file.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                        <FiUser className="w-3.5 h-3.5 text-slate-500" />
                        <span>{file.teacherName}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    {new Date(file.uploadedAt).toLocaleDateString("vi-VN")}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDownload(file)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-md shadow-sky-600/20"
                  >
                    <FiDownload className="w-3.5 h-3.5" />
                    <span>Tải về</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
