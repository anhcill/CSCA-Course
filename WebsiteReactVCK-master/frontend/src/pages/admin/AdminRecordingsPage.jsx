import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarDays,
  ExternalLink,
  Film,
  FolderOpen,
  Link2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  createClassRecording,
  deleteClassRecording,
  fetchAdminRecordingCatalog,
  updateClassRecording,
  updateClassRecordingFolder,
} from "../../features/api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/StateView";

const emptyForm = {
  classId: "",
  sessionId: "",
  title: "",
  description: "",
  driveUrl: "",
  recordedAt: "",
  durationMinutes: "",
  isPublished: false,
};

const dateValue = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const toLocalInput = (value) => {
  if (!dateValue(value)) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const displayDate = (value) => dateValue(value)
  ? new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  : "Chưa đặt ngày";

const dateKey = (value) => {
  if (!dateValue(value)) return "undated";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const dayLabel = (key) => key === "undated" ? "Chưa cập nhật ngày" : new Date(`${key}T00:00:00`).toLocaleDateString("vi-VN", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default function AdminRecordingsPage() {
  const [catalog, setCatalog] = useState({ recordings: [], classes: [], sessions: [] });
  const [folderDrafts, setFolderDrafts] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFolderId, setSavingFolderId] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchAdminRecordingCatalog();
      const nextCatalog = response?.data || { recordings: [], classes: [], sessions: [] };
      setCatalog(nextCatalog);
      setFolderDrafts(Object.fromEntries((nextCatalog.classes || []).map((item) => [item.id, {
        driveUrl: item.folderUrl || "",
        isPublished: Boolean(item.folderPublished),
      }])));
    } catch (loadError) {
      console.error("Unable to load recording catalog", loadError);
      setError(loadError?.message || "Không thể tải kho bản ghi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const availableSessions = useMemo(() => catalog.sessions
    .filter((item) => item.classId === form.classId)
    .sort((a, b) => dateValue(b.startTime) - dateValue(a.startTime)), [catalog.sessions, form.classId]);

  const selectedClass = useMemo(
    () => catalog.classes.find((item) => item.id === form.classId) || null,
    [catalog.classes, form.classId],
  );

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...catalog.classes]
      .filter((item) => classFilter === "all" || item.id === classFilter)
      .map((classItem) => {
        const allItems = catalog.recordings
          .filter((item) => item.classId === classItem.id)
          .sort((a, b) => dateValue(b.recordedAt) - dateValue(a.recordedAt));
        const items = allItems.filter((item) => !needle
          || [item.title, item.description, item.classTitle, item.courseTitle, item.sessionTitle, displayDate(item.recordedAt)]
            .some((value) => String(value || "").toLowerCase().includes(needle)));
        const classMatches = !needle || [classItem.title, classItem.courseTitle]
          .some((value) => String(value || "").toLowerCase().includes(needle));
        if (!classMatches && items.length === 0) return null;
        const days = new Map();
        items.forEach((item) => {
          const key = dateKey(item.recordedAt);
          if (!days.has(key)) days.set(key, []);
          days.get(key).push(item);
        });
        return { ...classItem, items, days: [...days.entries()] };
      })
      .filter(Boolean)
      .sort((a, b) => dateValue(b.latestRecordingAt) - dateValue(a.latestRecordingAt)
        || String(a.title).localeCompare(String(b.title), "vi"));
  }, [catalog.classes, catalog.recordings, classFilter, search]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const editRecording = (item) => {
    setEditingId(item.id);
    setForm({
      classId: item.classId,
      sessionId: item.sessionId || "",
      title: item.title,
      description: item.description || "",
      driveUrl: item.driveUrl || "",
      recordedAt: toLocalInput(item.recordedAt),
      durationMinutes: item.durationMinutes || "",
      isPublished: item.isPublished,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectClass = (classId) => {
    setForm((current) => ({ ...current, classId, sessionId: "" }));
  };

  const selectSession = (sessionId) => {
    const session = catalog.sessions.find((item) => item.id === sessionId);
    setForm((current) => ({
      ...current,
      sessionId,
      title: session && !current.title.trim() ? session.title : current.title,
      recordedAt: session && !current.recordedAt ? toLocalInput(session.startTime) : current.recordedAt,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        sessionId: form.sessionId || null,
        driveUrl: form.driveUrl.trim(),
        recordedAt: form.recordedAt ? new Date(form.recordedAt).toISOString() : null,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
      };
      if (editingId) await updateClassRecording(editingId, payload);
      else await createClassRecording(payload);
      toast.success(editingId ? "Đã cập nhật bản ghi" : "Đã thêm bản ghi");
      resetForm();
      await loadCatalog();
    } catch (saveError) {
      toast.error(saveError?.message || "Không thể lưu bản ghi");
    } finally {
      setSaving(false);
    }
  };

  const saveFolder = async (classItem) => {
    const draft = folderDrafts[classItem.id] || { driveUrl: "", isPublished: false };
    setSavingFolderId(classItem.id);
    try {
      await updateClassRecordingFolder(classItem.id, draft);
      toast.success(draft.driveUrl.trim() ? "Đã lưu thư mục Drive của lớp" : "Đã xóa thư mục Drive của lớp");
      await loadCatalog();
    } catch (saveError) {
      toast.error(saveError?.message || "Không thể lưu thư mục Drive");
    } finally {
      setSavingFolderId(null);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa bản ghi “${item.title}”? Video trên Google Drive sẽ không bị xóa.`)) return;
    try {
      await deleteClassRecording(item.id);
      toast.success("Đã xóa bản ghi khỏi LMS");
      if (editingId === item.id) resetForm();
      await loadCatalog();
    } catch (deleteError) {
      toast.error(deleteError?.message || "Không thể xóa bản ghi");
    }
  };

  return (
    <div className="space-y-5 pb-12 text-slate-900 dark:text-slate-100">
      <section className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-5 shadow-sm dark:border-cyan-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 sm:p-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"><Film className="h-4 w-4" /> Google Drive Record Hub</span>
        <h1 className="mt-3 text-2xl font-black">Quản lý bản ghi buổi học</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Gắn từng video với đúng lớp và buổi học. Mỗi video có thể dùng link Drive riêng hoặc dùng thư mục Drive chung của lớp.</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <form onSubmit={submit} className="h-fit space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-20">
          <div className="flex items-center justify-between">
            <div><h2 className="font-black">{editingId ? "Sửa video" : "Thêm video theo ngày"}</h2><p className="text-xs text-slate-500">Chọn lớp, buổi học và link bản ghi tương ứng.</p></div>
            {editingId && <button type="button" onClick={resetForm} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Hủy chỉnh sửa"><X className="h-4 w-4" /></button>}
          </div>

          <label className="block text-xs font-bold">Lớp học *<select required value={form.classId} onChange={(event) => selectClass(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"><option value="">Chọn lớp</option>{catalog.classes.map((item) => <option key={item.id} value={item.id}>{item.title}{item.courseTitle ? ` · ${item.courseTitle}` : ""}</option>)}</select></label>

          <label className="block text-xs font-bold">Buổi học<select disabled={!form.classId} value={form.sessionId} onChange={(event) => selectSession(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-800"><option value="">Không gắn buổi cụ thể</option>{availableSessions.map((item) => <option key={item.id} value={item.id}>{displayDate(item.startTime)} · {item.title}</option>)}</select><span className="mt-1 block font-normal text-slate-500">Khi chọn buổi, tiêu đề và ngày sẽ được điền nếu đang để trống.</span></label>

          <label className="block text-xs font-bold">Tiêu đề video *<input required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ví dụ: Dãy số và số phức" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></label>

          <label className="block text-xs font-bold">Link video Google Drive<span className="relative mt-1.5 block"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="url" value={form.driveUrl} onChange={(event) => setForm((current) => ({ ...current, driveUrl: event.target.value }))} placeholder="https://drive.google.com/file/d/..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></span><span className="mt-1 block font-normal text-slate-500">Link riêng được ưu tiên. Để trống để dùng thư mục chung đã xuất bản của lớp.</span></label>

          <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold">Ngày ghi hình *<input required type="datetime-local" value={form.recordedAt} onChange={(event) => setForm((current) => ({ ...current, recordedAt: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 outline-none dark:border-slate-700 dark:bg-slate-950" /></label><label className="block text-xs font-bold">Thời lượng (phút)<input type="number" min="1" max="1440" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none dark:border-slate-700 dark:bg-slate-950" /></label></div>

          <label className="block text-xs font-bold">Mô tả<textarea rows="3" maxLength={3000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></label>

          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-xs dark:border-slate-700"><span><b>Hiện cho học viên</b><span className="mt-0.5 block font-normal text-slate-500">{form.driveUrl.trim() ? "Học viên mở link video riêng." : selectedClass?.folderPublished ? "Học viên mở thư mục Drive chung của lớp." : "Cần link video riêng hoặc thư mục lớp đã xuất bản."}</span></span><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} className="h-5 w-5 accent-cyan-600" /></label>

          <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50">{editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Thêm video"}</button>
        </form>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm video, buổi học, lớp hoặc ngày..." className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950" /></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950"><option value="all">Tất cả lớp</option>{catalog.classes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>

          {loading ? <LoadingState message="Đang tải kho bản ghi..." /> : error ? <ErrorState message={error} onRetry={loadCatalog} /> : groups.length === 0 ? <EmptyState icon={Video} title="Chưa có lớp phù hợp" description="Không tìm thấy lớp hoặc video khớp bộ lọc." /> : groups.map((group) => {
            const draft = folderDrafts[group.id] || { driveUrl: "", isPublished: false };
            return (
              <article key={group.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <header className="space-y-3 border-b border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">{group.title}</h2><p className="text-xs text-slate-500">{group.courseTitle || "Khóa học"} · {group.items.length} video</p></div>{group.folderOpenUrl && <a href={group.folderOpenUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-black text-cyan-700 dark:text-cyan-300"><FolderOpen className="h-4 w-4" /> Mở thư mục hiện tại <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]"><label className="relative"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="url" value={draft.driveUrl} onChange={(event) => setFolderDrafts((current) => ({ ...current, [group.id]: { ...draft, driveUrl: event.target.value } }))} placeholder="Link thư mục Google Drive chung của lớp" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></label><label className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold dark:border-slate-700"><input type="checkbox" checked={draft.isPublished} onChange={(event) => setFolderDrafts((current) => ({ ...current, [group.id]: { ...draft, isPublished: event.target.checked } }))} className="h-4 w-4 accent-cyan-600" /> Cho học viên mở</label><button type="button" disabled={savingFolderId === group.id} onClick={() => saveFolder(group)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-black text-white hover:bg-cyan-700 disabled:opacity-50"><Save className="h-4 w-4" /> {savingFolderId === group.id ? "Đang lưu..." : "Lưu thư mục"}</button></div>
                </header>

                {group.days.length === 0 ? <p className="p-4 text-sm text-slate-500">Chưa có video theo ngày. Thư mục chung vẫn có thể mở độc lập.</p> : <div className="space-y-5 p-4">{group.days.map(([day, items]) => <div key={day}><h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarDays className="h-4 w-4 text-cyan-600" /> {dayLabel(day)}</h3><div className="space-y-2">{items.map((item) => {
                  const canOpen = item.hasDirectUrl || Boolean(group.folderOpenUrl);
                  return <div key={item.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.isPublished ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>{item.isPublished ? "ĐÃ HIỆN" : "BẢN NHÁP"}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.sessionId ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{item.sessionTitle || "Chưa gắn buổi học"}</span><span className="text-[10px] font-bold text-slate-500">{item.hasDirectUrl ? "Link video riêng" : "Thư mục chung của lớp"}</span></div><h4 className="mt-2 font-black">{item.title}</h4><p className="mt-1 text-xs text-slate-500">{displayDate(item.recordedAt)}{item.durationMinutes ? ` · ${item.durationMinutes} phút` : ""}</p></div><div className="flex shrink-0 flex-wrap gap-2">{item.sessionId && <Link to={`/admin/classes/${item.classId}/sessions/${item.sessionId}`} className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950"><CalendarDays className="h-4 w-4" /> Mở buổi</Link>}{canOpen && <a href={item.openUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-bold text-cyan-700 hover:bg-cyan-50 dark:border-cyan-900 dark:text-cyan-300 dark:hover:bg-cyan-950"><ExternalLink className="h-4 w-4" /> Mở video</a>}<button type="button" onClick={() => editRecording(item)} title="Sửa" className="rounded-xl border border-slate-200 p-2 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} title="Xóa" className="rounded-xl border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button></div></div>{item.description && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">{item.description}</p>}</div>;
                })}</div></div>)}</div>}
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
