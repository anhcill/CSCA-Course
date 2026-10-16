import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, ExternalLink, PlaySquare, Search, School, Video } from "lucide-react";
import { fetchStudentRecordings } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

const formatDate = (value) => {
  if (!value) return "Chưa cập nhật ngày ghi hình";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật ngày ghi hình";
  return date.toLocaleString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function StudentRecordingsPage() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("all");

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchStudentRecordings();
      setRecordings(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError) {
      console.error("Unable to load class recordings", loadError);
      setError(loadError?.message || "Không thể tải bản ghi buổi học.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  const classes = useMemo(() => {
    const map = new Map();
    recordings.forEach((item) => map.set(item.classId, { id: item.classId, title: item.classTitle, courseTitle: item.courseTitle }));
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "vi"));
  }, [recordings]);

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = recordings.filter((item) => {
      if (classId !== "all" && item.classId !== classId) return false;
      if (!needle) return true;
      return [item.title, item.classTitle, item.courseTitle, item.sessionTitle, item.description]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
    const map = new Map();
    filtered.forEach((item) => {
      if (!map.has(item.classId)) map.set(item.classId, { classId: item.classId, classTitle: item.classTitle, courseTitle: item.courseTitle, items: [] });
      map.get(item.classId).items.push(item);
    });
    return [...map.values()];
  }, [classId, recordings, search]);

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 py-5 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-5 shadow-sm dark:border-sky-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Video className="h-4 w-4" /> Thư viện xem lại</span>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Bản ghi buổi học</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Bản ghi được xếp riêng theo từng lớp. Khi mở, hệ thống kiểm tra quyền lớp rồi chuyển sang Google Drive trong tab mới.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_220px]">
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên buổi hoặc lớp..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <select value={classId} onChange={(event) => setClassId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900">
                <option value="all">Tất cả lớp ({classes.length})</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </div>
          </div>
        </section>

        {loading ? <LoadingState message="Đang tải bản ghi các lớp..." /> : error ? <ErrorState message={error} onRetry={loadRecordings} /> : groups.length === 0 ? (
          <EmptyState icon={PlaySquare} title="Chưa có bản ghi phù hợp" description="Admin chưa xuất bản bản ghi cho lớp này hoặc không có kết quả khớp bộ lọc." />
        ) : groups.map((group) => (
          <section key={group.classId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <header className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 text-white"><School className="h-5 w-5" /></span><div><h2 className="font-black">{group.classTitle}</h2><p className="text-xs text-slate-500">{group.courseTitle || "Khóa học"}</p></div></div>
              <span className="w-fit rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700 dark:bg-sky-950 dark:text-sky-300">{group.items.length} bản ghi</span>
            </header>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {group.items.map((item) => (
                <article key={item.id} className="flex flex-col rounded-2xl border border-slate-200 p-4 transition hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:hover:border-sky-800">
                  <div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white"><PlaySquare className="h-5 w-5" /></span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">ĐÃ XUẤT BẢN</span></div>
                  <h3 className="mt-3 font-black text-slate-950 dark:text-white">{item.title}</h3>
                  {item.sessionTitle && <p className="mt-1 text-xs font-bold text-sky-700 dark:text-sky-300">{item.sessionTitle}</p>}
                  {item.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>}
                  <div className="mt-3 space-y-1.5 text-xs text-slate-500"><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(item.recordedAt)}</p>{item.durationMinutes && <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> {item.durationMinutes} phút</p>}</div>
                  <a href={item.openUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-sky-700">Mở trên Google Drive <ExternalLink className="h-4 w-4" /></a>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
