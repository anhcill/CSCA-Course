
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BookOpen, Plus } from "lucide-react";
import { assignClassSessionChapter, createClassChapter, fetchClassChapters, updateClassChapter } from "../../../api/lmsClient";

const fieldClass = "mt-1.5 w-full rounded-2xl border border-slate-200/80 bg-white/95 px-3.5 py-2.5 text-xs text-slate-900 shadow-2xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const emptyForm = { title: "", description: "", objectives: "", teacherId: "" };
const dateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";

export default function ClassChaptersManager({ classId, sessions = [], onChanged }) {
  const [chapters, setChapters] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [savingSessionId, setSavingSessionId] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState(null);

  const loadChapters = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchClassChapters(classId);
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error(response?.message || "Không tải được các chương của lớp.");
      }
      setChapters(response.data);
      setTeachers(Array.isArray(response.teachers) ? response.teachers : []);
      setCanManage(Boolean(response.canManageCurriculum));
    } catch (requestError) {
      setError(requestError?.message || "Không tải được các chương của lớp.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { loadChapters(); }, [loadChapters]);
  useEffect(() => {
    setAssignments(Object.fromEntries(sessions.map((session) => [String(session.id), String(session.chapter_id || "")])));
  }, [sessions]);

  const countsByChapter = useMemo(() => {
    const counts = new Map();
    for (const session of sessions) {
      const key = String(session.chapter_id || "");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [sessions]);

  const toggleSession = (sessionId) => {
    setSelectedSessionIds((current) => current.includes(sessionId)
      ? current.filter((id) => id !== sessionId) : [...current, sessionId]);
  };

  const createChapter = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("Nhập tên chương học.");
    const wasEditing = Boolean(editingChapterId);
    const selectedSessionCount = selectedSessionIds.length;
    setCreating(true);
    try {
      const result = editingChapterId
        ? await updateClassChapter({
          classId,
          chapterId: editingChapterId,
          title: form.title.trim(),
          description: form.description.trim(),
          objectives: form.objectives.trim(),
          ...(teachers.length ? { teacherId: form.teacherId ? Number(form.teacherId) : null } : {}),
        })
        : await createClassChapter({
          classId,
          title: form.title.trim(),
          description: form.description.trim(),
          objectives: form.objectives.trim(),
          ...(form.teacherId ? { teacherId: Number(form.teacherId) } : {}),
        });
      if (!result?.success || !result.data?.id) throw new Error(result?.message || "Không thể tạo chương.");

      const failed = [];
      for (const sessionId of selectedSessionIds) {
        const session = sessions.find((item) => String(item.id) === sessionId);
        if (!session) continue;
        try {
          await assignClassSessionChapter({
            sessionId,
            chapterId: result.data.id,
            expectedVersion: session.version,
          });
        } catch {
          failed.push(session.title || `Buổi #${sessionId}`);
        }
      }
      setForm(emptyForm);
      setEditingChapterId(null);
      setSelectedSessionIds([]);
      setShowForm(false);
      await loadChapters();
      await onChanged?.();
      if (failed.length) toast.error(`Đã tạo chương, nhưng chưa gắn được ${failed.length} buổi. Hãy chọn chương cho các buổi đó bên dưới.`);
      else toast.success(wasEditing ? "Đã cập nhật chương học." : selectedSessionCount ? "Đã tạo chương và gắn buổi học." : "Đã tạo chương học.");
    } catch (requestError) {
      toast.error(requestError?.message || "Không thể tạo chương.");
    } finally {
      setCreating(false);
    }
  };

  const assignChapter = async (session) => {
    const sessionId = String(session.id);
    const chapterId = assignments[sessionId];
    if (!chapterId || chapterId === String(session.chapter_id || "")) return;
    setSavingSessionId(sessionId);
    try {
      await assignClassSessionChapter({ sessionId, chapterId: Number(chapterId), expectedVersion: session.version });
      toast.success("Đã gắn chương cho buổi học.");
      await loadChapters();
      await onChanged?.();
    } catch (requestError) {
      toast.error(requestError?.message || "Không thể gắn chương cho buổi học.");
    } finally {
      setSavingSessionId(null);
    }
  };

  return (
    <section className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-[#102f63] dark:text-white">
            <BookOpen className="h-4 w-4 text-blue-600" />
            Chương & buổi học
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tạo chương cho lớp và gắn những buổi học thuộc chương đó.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => { setShowForm((value) => !value); setEditingChapterId(null); setForm(emptyForm); }}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700"
          >
            <Plus className="h-4 w-4" /> {showForm ? "Đóng form" : "Tạo chương"}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error} <button type="button" onClick={loadChapters} className="ml-2 font-bold underline">Tải lại</button>
        </div>
      )}

      {canManage && showForm && (
        <form onSubmit={createChapter} className="mt-4 space-y-3.5 rounded-2xl border border-sky-200/80 bg-white/85 p-5 shadow-2xs backdrop-blur-md dark:border-sky-900/70 dark:bg-slate-900/80">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Tên chương *
              <input required maxLength={255} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className={fieldClass} placeholder="Ví dụ: Chương 1 - Tổng quan" />
            </label>
            {teachers.length > 0 && (
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Giáo viên phụ trách
                <select value={form.teacherId} onChange={(event) => setForm((value) => ({ ...value, teacherId: event.target.value }))} className={fieldClass}>
                  <option value="">{editingChapterId ? "Chưa phân công" : "Giáo viên chính của lớp"}</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name || teacher.email}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Mô tả
            <input maxLength={10000} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className={fieldClass} placeholder="Nội dung chính của chương (tùy chọn)" />
          </label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Mục tiêu học tập
            <textarea maxLength={5000} rows={2} value={form.objectives} onChange={(event) => setForm((value) => ({ ...value, objectives: event.target.value }))} className={fieldClass} placeholder="Mục tiêu của chương (tùy chọn)" />
          </label>
          {sessions.length > 0 && (
            <fieldset className="rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 dark:border-slate-700 dark:bg-slate-900">
              <legend className="px-1 text-xs font-bold text-slate-700 dark:text-slate-300">Gắn buổi học có sẵn (tùy chọn)</legend>
              <div className="max-h-36 space-y-2 overflow-y-auto">
                {sessions.map((session) => (
                  <label key={session.id} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input type="checkbox" checked={selectedSessionIds.includes(String(session.id))} onChange={() => toggleSession(String(session.id))} className="mt-0.5" />
                    <span>{session.title} <span className="text-slate-500">· {dateTime(session.start_time)}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button type="submit" disabled={creating || loading || Boolean(error)} className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 disabled:opacity-50">
            {creating ? "Đang lưu..." : editingChapterId ? "Cập nhật chương" : "Lưu chương"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="mt-4 text-xs text-slate-500">Đang tải các chương...</p>
      ) : !error && (
        <>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((chapter) => (
              <div key={chapter.id} className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-2xs backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-sm font-bold text-[#102f63] dark:text-white">{chapter.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{countsByChapter.get(String(chapter.id)) || 0} buổi · {chapter.assigned_teacher_name || "Chưa phân công giáo viên"}</p>
                {canManage && !chapter.is_system_default && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingChapterId(chapter.id);
                      setSelectedSessionIds([]);
                      setForm({
                        title: chapter.title || "",
                        description: chapter.description || "",
                        objectives: chapter.objectives || "",
                        teacherId: chapter.assigned_teacher_id ? String(chapter.assigned_teacher_id) : "",
                      });
                      setShowForm(true);
                    }}
                    className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                  >
                    Chỉnh sửa
                  </button>
                )}
              </div>
            ))}
            {!chapters.length && <p className="text-xs text-slate-500">Lớp chưa có chương. Chọn “Tạo chương” để bắt đầu.</p>}
          </div>
          {canManage && sessions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-black text-[#102f63] dark:text-white">Gắn chương cho từng buổi</h3>
              <div className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-white/80 bg-white/85 shadow-2xs backdrop-blur-md dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-800/60">
                {sessions.map((session) => {
                  const sessionId = String(session.id);
                  return (
                    <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{session.title}</p>
                        <p className="text-[11px] text-slate-500">{dateTime(session.start_time)}</p>
                      </div>
                      <div className="flex min-w-48 flex-1 items-center gap-2 sm:max-w-sm">
                        <select
                          aria-label={`Chương của ${session.title}`}
                          value={assignments[sessionId] ?? String(session.chapter_id || "")}
                          onChange={(event) => setAssignments((value) => ({ ...value, [sessionId]: event.target.value }))}
                          className={fieldClass + " mt-0 flex-1"}
                        >
                          <option value="">Chưa gắn chương</option>
                          {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => assignChapter(session)}
                          disabled={savingSessionId === sessionId || !assignments[sessionId] || assignments[sessionId] === String(session.chapter_id || "")}
                          className="rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-2xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Lưu
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
