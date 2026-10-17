import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, FolderOpen, PlaySquare, Search, School, Video } from "lucide-react";
import { fetchStudentRecordings } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

const dateValue = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const formatDateTime = (value) => {
  if (!dateValue(value)) return "Chưa cập nhật ngày ghi hình";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const dateKey = (value) => {
  if (!dateValue(value)) return "undated";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const dateHeading = (value) => {
  if (value === "undated") return "Chưa cập nhật ngày";
  return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  });
};

export default function StudentRecordingsPage() {
  const [data, setData] = useState({ classes: [], recordings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("all");

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchStudentRecordings();
      const payload = response?.data;
      if (Array.isArray(payload)) {
        const classMap = new Map();
        payload.forEach((item) => classMap.set(item.classId, {
          id: item.classId, title: item.classTitle, courseTitle: item.courseTitle,
        }));
        setData({ classes: [...classMap.values()], recordings: payload });
      } else {
        setData({ classes: payload?.classes || [], recordings: payload?.recordings || [] });
      }
    } catch (loadError) {
      console.error("Unable to load class recordings", loadError);
      setError(loadError?.message || "Không thể tải bản ghi buổi học.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  const classes = useMemo(() => [...data.classes].sort((a, b) =>
    dateValue(b.latestRecordingAt) - dateValue(a.latestRecordingAt)
      || String(a.title).localeCompare(String(b.title), "vi")), [data.classes]);

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return classes.flatMap((classItem) => {
      if (classId !== "all" && classItem.id !== classId) return [];
      const items = data.recordings
        .filter((item) => item.classId === classItem.id)
        .filter((item) => !needle || [item.title, item.description, item.classTitle, item.courseTitle, formatDateTime(item.recordedAt)]
          .some((value) => String(value || "").toLowerCase().includes(needle)))
        .sort((a, b) => dateValue(b.recordedAt) - dateValue(a.recordedAt));
      const classMatches = !needle || [classItem.title, classItem.courseTitle]
        .some((value) => String(value || "").toLowerCase().includes(needle));
      if (!classMatches && items.length === 0) return [];
      const days = new Map();
      items.forEach((item) => {
        const key = dateKey(item.recordedAt);
        if (!days.has(key)) days.set(key, []);
        days.get(key).push(item);
      });
      return [{
        ...classItem,
        classDriveUrl: classItem.folderOpenUrl || items.find((item) => item.hasDirectUrl)?.openUrl || null,
        items,
        days: [...days.entries()],
      }];
    });
  }, [classId, classes, data.recordings, search]);

  return (
    <div className="min-h-full bg-[#f6f9fd] px-4 py-5 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Video className="h-4 w-4" /> Thư viện xem lại</span>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Bản ghi buổi học</h1>
              <p className="mt-1 text-sm text-slate-500">Mỗi lớp có một thư mục Drive chung, bản ghi được xếp theo ngày mới nhất.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_220px]">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm bản ghi hoặc lớp..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900" /></label>
              <select value={classId} onChange={(event) => setClassId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900"><option value="all">Tất cả lớp ({classes.length})</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
            </div>
          </div>
        </section>

        {loading ? <LoadingState message="Đang tải bản ghi các lớp..." /> : error ? <ErrorState message={error} onRetry={loadRecordings} /> : groups.length === 0 ? (
          <EmptyState icon={PlaySquare} title="Chưa có bản ghi phù hợp" description="Chưa có thư mục hoặc bản ghi được xuất bản cho lớp này." />
        ) : groups.map((group) => (
          <section key={group.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 text-white"><School className="h-5 w-5" /></span><div><h2 className="font-black">{group.title}</h2><p className="text-xs text-slate-500">{group.courseTitle || "Khóa học"} · {group.items.length} bản ghi</p></div></div>
              {group.classDriveUrl && <a href={group.classDriveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-black text-white hover:bg-sky-700"><FolderOpen className="h-4 w-4" /> Mở Drive của lớp <ExternalLink className="h-3.5 w-3.5" /></a>}
            </header>
            {group.days.length === 0 ? <div className="p-5 text-sm text-slate-500">Các video của lớp được lưu trong thư mục Drive phía trên.</div> : (
              <div className="space-y-5 p-4 sm:p-5">{group.days.map(([day, items]) => <div key={day}><h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4 text-sky-600" /> {dateHeading(day)}</h3><div className="grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.id} className="flex flex-col rounded-2xl border border-slate-200 p-4 transition hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:hover:border-sky-800"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white"><PlaySquare className="h-5 w-5" /></span><div className="min-w-0"><h4 className="font-black text-slate-950 dark:text-white">{item.title}</h4><p className="mt-1 text-xs text-slate-500">{formatDateTime(item.recordedAt)}{item.durationMinutes ? ` · ${item.durationMinutes} phút` : ""}</p></div></div>{item.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>}</article>)}</div></div>)}</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
