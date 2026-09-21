import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, FileText, Files, FolderOpen, Search, UserRound } from "lucide-react";
import { fetchStudentFiles } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

const mimeType = (file) => String(file.mimeType || file.mime_type || "").toLowerCase();
const fileSize = (value) => value ? `${(Number(value) / (1024 * 1024)).toFixed(Number(value) >= 10 * 1024 * 1024 ? 0 : 1)} MB` : "—";
function kindForFile(file) {
  const value = mimeType(file);
  if (value.includes("pdf")) return "pdf";
  if (value.includes("word") || value.includes("document")) return "doc";
  if (value.includes("sheet") || value.includes("excel")) return "sheet";
  return "other";
}
const fileConfig = {
  pdf: { icon: FileText, className: "bg-rose-50 text-rose-600" },
  doc: { icon: FileText, className: "bg-blue-50 text-blue-600" },
  sheet: { icon: FileSpreadsheet, className: "bg-emerald-50 text-emerald-600" },
  other: { icon: Files, className: "bg-violet-50 text-violet-600" },
};

export default function StudentFilesPage() {
  const { courseId, classId } = useParams();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");

  const loadFiles = useCallback(async () => {
    setLoading(true); setErrorMessage("");
    try {
      const result = await fetchStudentFiles({ courseId, classId });
      setFiles(Array.isArray(result?.data) ? result.data : []);
    } catch (error) {
      console.error("Unable to load student files", error);
      setErrorMessage("Không thể tải tài liệu học tập. Vui lòng thử lại sau.");
    } finally { setLoading(false); }
  }, [classId, courseId]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  const visibleFiles = useMemo(() => files.filter((file) => {
    const matchesKind = selectedKind === "all" || kindForFile(file) === selectedKind;
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery = !needle || [file.name, file.courseTitle, file.course_title, file.teacherName, file.teacher_name].some((value) => String(value || "").toLocaleLowerCase().includes(needle));
    return matchesKind && matchesQuery;
  }), [files, query, selectedKind]);
  const download = (file) => {
    const url = file.downloadUrl || file.download_url;
    if (!url) return toast.error("Tài liệu này chưa có đường dẫn tải xuống.");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-blue-100 bg-gradient-to-r from-[#edf6ff] via-white to-[#f5f9ff] p-6 shadow-sm sm:p-8"><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-blue-100"><FolderOpen className="h-3.5 w-3.5" /> Kho tài liệu học tập</span><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{classId ? "Tài liệu của lớp" : courseId ? "Tài liệu của khóa học" : "Tài liệu học tập của tôi"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Tập hợp giáo trình, bài mẫu và tài liệu được giáo viên chia sẻ cho các lớp bạn đã ghi danh.</p></section>
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex overflow-x-auto">{[["all", "Tất cả"], ["pdf", "PDF"], ["doc", "Word"], ["sheet", "Excel"]].map(([kind, label]) => <button key={kind} type="button" onClick={() => setSelectedKind(kind)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition ${selectedKind === kind ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{label}</button>)}</div><label className="relative block w-full md:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tài liệu, khóa học, giáo viên..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white" /></label></section>
        {loading ? <LoadingState message="Đang tải tài liệu..." count={3} /> : errorMessage ? <ErrorState title="Không tải được tài liệu" message={errorMessage} onRetry={loadFiles} /> : visibleFiles.length === 0 ? <EmptyState icon={FolderOpen} title="Chưa có tài liệu phù hợp" description="Tài liệu giáo viên chia sẻ sẽ xuất hiện tại đây." /> : <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleFiles.map((file) => {
          const config = fileConfig[kindForFile(file)]; const Icon = config.icon;
          return <article key={file.id} className="flex min-h-56 flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${config.className}`}><Icon className="h-5 w-5" /></div><span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">{fileSize(file.sizeBytes || file.size_bytes)}</span></div><div className="mt-4 flex-1"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{file.courseTitle || file.course_title || "Tài liệu chung"}</span><h2 className="mt-3 line-clamp-2 text-sm font-bold leading-5 text-slate-900">{file.name}</h2><p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5" /> {file.teacherName || file.teacher_name || "Giảng viên"}</p></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-[11px] text-slate-400">{file.uploadedAt || file.uploaded_at ? new Date(file.uploadedAt || file.uploaded_at).toLocaleDateString("vi-VN") : ""}</span><button type="button" onClick={() => download(file)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700"><Download className="h-3.5 w-3.5" /> Tải về</button></div></article>;
        })}</section>}
      </div>
    </div>
  );
}
