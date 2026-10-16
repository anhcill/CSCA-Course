import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ExternalLink, Film, Link2, Pencil, Plus, Save, Search, Trash2, Video, X } from "lucide-react";
import { createClassRecording, deleteClassRecording, fetchAdminRecordingCatalog, updateClassRecording } from "../../features/api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/StateView";

const emptyForm = { classId: "", sessionId: "", title: "", description: "", driveUrl: "", recordedAt: "", durationMinutes: "", isPublished: false };

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const displayDate = (value) => value ? new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Chưa đặt ngày";

export default function AdminRecordingsPage() {
  const [catalog, setCatalog] = useState({ recordings: [], classes: [], sessions: [] });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchAdminRecordingCatalog();
      setCatalog(response?.data || { recordings: [], classes: [], sessions: [] });
    } catch (loadError) {
      console.error("Unable to load recording catalog", loadError);
      setError(loadError?.message || "Không thể tải kho bản ghi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const sessionsForClass = useMemo(() => catalog.sessions.filter((item) => item.classId === form.classId), [catalog.sessions, form.classId]);
  const visibleRecordings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog.recordings.filter((item) => {
      if (classFilter !== "all" && item.classId !== classFilter) return false;
      if (!needle) return true;
      return [item.title, item.classTitle, item.courseTitle, item.sessionTitle].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [catalog.recordings, classFilter, search]);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };
  const selectSession = (sessionId) => {
    const session = catalog.sessions.find((item) => item.id === sessionId);
    setForm((current) => ({
      ...current,
      sessionId,
      title: current.title || session?.title || "",
      recordedAt: current.recordedAt || toLocalInput(session?.startTime),
    }));
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

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        sessionId: form.sessionId || null,
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><span className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"><Film className="h-4 w-4" /> Google Drive Record Hub</span><h1 className="mt-3 text-2xl font-black">Quản lý bản ghi buổi học</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Video nằm trên Google Drive; LMS quản lý lớp, buổi học, trạng thái xuất bản và quyền mở.</p></div>
          <div className="rounded-2xl border border-cyan-200 bg-white/80 px-4 py-3 text-xs text-slate-600 dark:border-cyan-900 dark:bg-slate-900/80 dark:text-slate-300"><b>Trước khi xuất bản:</b> đặt quyền chia sẻ Drive phù hợp với học viên. LMS kiểm tra quyền lớp, còn Google Drive kiểm tra quyền tệp.</div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={submit} className="h-fit space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-20">
          <div className="flex items-center justify-between"><div><h2 className="font-black">{editingId ? "Sửa bản ghi" : "Thêm bản ghi"}</h2><p className="text-xs text-slate-500">Gắn đúng lớp và đúng buổi trước khi lưu.</p></div>{editingId && <button type="button" onClick={resetForm} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Hủy chỉnh sửa"><X className="h-4 w-4" /></button>}</div>
          <label className="block text-xs font-bold">Lớp học *<select required value={form.classId} onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value, sessionId: "" }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"><option value="">Chọn lớp</option>{catalog.classes.map((item) => <option key={item.id} value={item.id}>{item.title}{item.courseTitle ? ` · ${item.courseTitle}` : ""}</option>)}</select></label>
          <label className="block text-xs font-bold">Buổi học<select value={form.sessionId} onChange={(event) => selectSession(event.target.value)} disabled={!form.classId} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"><option value="">Không gắn buổi cụ thể</option>{sessionsForClass.map((item) => <option key={item.id} value={item.id}>{displayDate(item.startTime)} · {item.title}</option>)}</select></label>
          <label className="block text-xs font-bold">Tiêu đề *<input required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ví dụ: Buổi 03 - Hàm số" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></label>
          <label className="block text-xs font-bold">Link Google Drive *<span className="relative mt-1.5 block"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required type="url" value={form.driveUrl} onChange={(event) => setForm((current) => ({ ...current, driveUrl: event.target.value }))} placeholder="https://drive.google.com/file/d/..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></span></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold">Ngày ghi hình<input type="datetime-local" value={form.recordedAt} onChange={(event) => setForm((current) => ({ ...current, recordedAt: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 outline-none dark:border-slate-700 dark:bg-slate-950" /></label><label className="block text-xs font-bold">Thời lượng (phút)<input type="number" min="1" max="1440" value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none dark:border-slate-700 dark:bg-slate-950" /></label></div>
          <label className="block text-xs font-bold">Mô tả<textarea rows="3" maxLength={3000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950" /></label>
          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-xs dark:border-slate-700"><span><b>Xuất bản cho học viên</b><span className="mt-0.5 block font-normal text-slate-500">Tắt để lưu nháp và kiểm tra link trước.</span></span><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} className="h-5 w-5 accent-cyan-600" /></label>
          <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50">{editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Thêm bản ghi"}</button>
        </form>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên bản ghi, lớp, buổi học..." className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950" /></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950"><option value="all">Tất cả lớp</option>{catalog.classes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
          {loading ? <LoadingState message="Đang tải kho bản ghi..." /> : error ? <ErrorState message={error} onRetry={loadCatalog} /> : visibleRecordings.length === 0 ? <EmptyState icon={Video} title="Chưa có bản ghi" description="Thêm link Google Drive đầu tiên cho một lớp học." /> : (
            <div className="space-y-3">{visibleRecordings.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.isPublished ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>{item.isPublished ? "ĐÃ XUẤT BẢN" : "BẢN NHÁP"}</span><span className="text-xs font-black text-cyan-700 dark:text-cyan-300">{item.classTitle}</span></div><h3 className="mt-2 truncate font-black">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.sessionTitle || "Không gắn buổi cụ thể"} · {displayDate(item.recordedAt)}{item.durationMinutes ? ` · ${item.durationMinutes} phút` : ""}</p></div><div className="flex shrink-0 gap-2"><a href={item.openUrl} target="_blank" rel="noopener noreferrer" title="Kiểm tra link Drive" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" /></a><button type="button" onClick={() => editRecording(item)} title="Sửa" className="rounded-xl border border-slate-200 p-2 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(item)} title="Xóa" className="rounded-xl border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button></div></div>{item.description && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">{item.description}</p>}</article>)}</div>
          )}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p>Luồng mở: học viên bấm bản ghi → LMS kiểm tra ghi danh và quyền học còn hiệu lực → chuyển hướng sang Google Drive. Video không đi qua Railway.</p></div>
        </section>
      </div>
    </div>
  );
}
