import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarDays,
  ExternalLink,
  FolderOpen,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
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

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      {/* Compact Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Kho bản ghi buổi học
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Gắn video theo lớp và buổi học bằng đường dẫn riêng hoặc thư mục Google Drive chung của lớp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadCatalog}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Đang tải..." : "Làm mới"}</span>
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Form Card */}
        <form
          onSubmit={submit}
          className="h-fit space-y-3.5 rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 p-4 sm:p-5 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none xl:sticky xl:top-20"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {editingId ? "Cập nhật bản ghi" : "Thêm video theo ngày"}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Chọn lớp, buổi học và liên kết video tương ứng.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                aria-label="Hủy chỉnh sửa"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Lớp học *
            <select
              required
              value={form.classId}
              onChange={(event) => selectClass(event.target.value)}
              className={inputClass}
            >
              <option value="">Chọn lớp</option>
              {catalog.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.courseTitle ? ` · ${item.courseTitle}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Buổi học
            <select
              disabled={!form.classId}
              value={form.sessionId}
              onChange={(event) => selectSession(event.target.value)}
              className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <option value="">Không gắn buổi cụ thể</option>
              {availableSessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {displayDate(item.startTime)} · {item.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
              Chọn buổi để tự điền tiêu đề và ngày nếu đang trống.
            </span>
          </label>

          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Tiêu đề video *
            <input
              required
              maxLength={255}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ví dụ: Dãy số và số phức"
              className={inputClass}
            />
          </label>

          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Liên kết video Google Drive
            <span className="relative mt-1.5 block">
              <Link2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={form.driveUrl}
                onChange={(event) => setForm((current) => ({ ...current, driveUrl: event.target.value }))}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </span>
            <span className="mt-1 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
              Ưu tiên liên kết riêng; để trống sẽ dùng thư mục chung của lớp.
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Ngày ghi hình *
              <input
                required
                type="datetime-local"
                value={form.recordedAt}
                onChange={(event) => setForm((current) => ({ ...current, recordedAt: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Thời lượng (phút)
              <input
                type="number"
                min="1"
                max="1440"
                value={form.durationMinutes}
                onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Mô tả
            <textarea
              rows="3"
              maxLength={3000}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className={`${inputClass} resize-none`}
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
            <span className="min-w-0">
              <b className="text-slate-800 dark:text-slate-100">Hiển thị cho học viên</b>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {form.driveUrl.trim()
                  ? "Học viên mở liên kết video riêng."
                  : selectedClass?.folderPublished
                    ? "Học viên mở thư mục Drive chung của lớp."
                    : "Cần liên kết riêng hoặc thư mục lớp đã xuất bản."}
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))}
              className="h-4 w-4 shrink-0 accent-blue-600"
            />
          </label>

          <button
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {editingId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            <span>{saving ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Thêm video"}</span>
          </button>
        </form>

        {/* Recording Groups */}
        <section className="min-w-0 space-y-4">
          {/* Inset Filter Bar */}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90 sm:flex-row">
            <label className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm video, buổi học, lớp hoặc ngày..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              />
            </label>
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 sm:w-56"
            >
              <option value="all">Tất cả lớp</option>
              {catalog.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingState message="Đang tải kho bản ghi..." />
          ) : error ? (
            <ErrorState message={error} onRetry={loadCatalog} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={Video}
              title="Chưa có lớp phù hợp"
              description="Không tìm thấy lớp hoặc video khớp bộ lọc."
            />
          ) : (
            groups.map((group) => {
              const draft = folderDrafts[group.id] || { driveUrl: "", isPublished: false };
              return (
                <article
                  key={group.id}
                  className="overflow-hidden rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none"
                >
                  <header className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">
                          {group.title}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {group.courseTitle || "Khóa học"} · {group.items.length} video
                        </p>
                      </div>
                      {group.folderOpenUrl && (
                        <a
                          href={group.folderOpenUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline dark:text-sky-400 shrink-0"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span>Mở thư mục hiện tại</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <label className="relative min-w-0">
                        <Link2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="url"
                          value={draft.driveUrl}
                          onChange={(event) =>
                            setFolderDrafts((current) => ({
                              ...current,
                              [group.id]: { ...draft, driveUrl: event.target.value },
                            }))
                          }
                          placeholder="Liên kết thư mục Google Drive chung của lớp"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <label className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={draft.isPublished}
                          onChange={(event) =>
                            setFolderDrafts((current) => ({
                              ...current,
                              [group.id]: { ...draft, isPublished: event.target.checked },
                            }))
                          }
                          className="h-4 w-4 accent-blue-600"
                        />
                        <span>Cho học viên mở</span>
                      </label>
                      <button
                        type="button"
                        disabled={savingFolderId === group.id}
                        onClick={() => saveFolder(group)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{savingFolderId === group.id ? "Đang lưu..." : "Lưu thư mục"}</span>
                      </button>
                    </div>
                  </header>

                  {group.days.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      Chưa có video theo ngày. Thư mục chung vẫn có thể mở độc lập.
                    </p>
                  ) : (
                    <div className="space-y-4 p-4">
                      {group.days.map(([day, items]) => (
                        <div key={day}>
                          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
                            <span>{dayLabel(day)}</span>
                          </h3>
                          <div className="space-y-2">
                            {items.map((item) => {
                              const canOpen = item.hasDirectUrl || Boolean(group.folderOpenUrl);
                              return (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            item.isPublished
                                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                          }`}
                                        >
                                          {item.isPublished ? "Đang hiển thị" : "Bản nháp"}
                                        </span>
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                            item.sessionId
                                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          {item.sessionTitle || "Chưa gắn buổi học"}
                                        </span>
                                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                          {item.hasDirectUrl ? "Liên kết riêng" : "Thư mục chung"}
                                        </span>
                                      </div>
                                      <h4 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                                        {item.title}
                                      </h4>
                                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {displayDate(item.recordedAt)}
                                        {item.durationMinutes ? ` · ${item.durationMinutes} phút` : ""}
                                      </p>
                                    </div>

                                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                      {item.sessionId && (
                                        <Link
                                          to={`/admin/classes/${item.classId}/sessions/${item.sessionId}`}
                                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                                        >
                                          <CalendarDays className="h-3.5 w-3.5" />
                                          <span>Mở buổi</span>
                                        </Link>
                                      )}
                                      {canOpen && (
                                        <a
                                          href={item.openUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 transition"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          <span>Mở video</span>
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => editRecording(item)}
                                        title="Sửa"
                                        className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => remove(item)}
                                        title="Xóa"
                                        className="rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 transition"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  {item.description && (
                                    <p className="mt-2.5 border-t border-slate-200/70 pt-2.5 text-xs text-slate-600 dark:border-slate-700/70 dark:text-slate-300">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
