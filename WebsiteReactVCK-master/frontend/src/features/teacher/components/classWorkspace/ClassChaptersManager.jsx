/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BookOpen, Plus } from "lucide-react";
import { createClassChapter, fetchClassChapters, updateLiveSession } from "../../../api/lmsClient";

const fieldClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
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
    setCreating(true);
    try {
      const result = await createClassChapter({
        classId,
        title: form.title.trim(),
        description: form.description.trim(),
        objectives: form.objectives.trim(),
        teacherId: form.teacherId ? Number(form.teacherId) : null,
      });
      if (!result?.success || !result.data?.id) throw new Error(result?.message || "Không thể tạo chương.");

      const failed = [];
      for (const sessionId of selectedSessionIds) {
        const session = sessions.find((item) => String(item.id) === sessionId);
        if (!session) continue;
        try {
          await updateLiveSession({
            sessionId,
            chapterId: result.data.id,
            expectedVersion: session.version,
          });
        } catch {
          failed.push(session.title || `Buổi #${sessionId}`);
        }
      }
      setForm(emptyForm);
      setSelectedSessionIds([]);
      setShowForm(false);
      await loadChapters();
      await onChanged?.();
      if (failed.length) toast.error(`Đã tạo chương, nhưng chưa gắn được ${failed.length} buổi. Hãy chọn chương cho các buổi đó bên dưới.`);
      else toast.success(selectedSessionIds.length ? "Đã tạo chương và gắn buổi học." : "Đã tạo chương học.");
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
      await updateLiveSession({ sessionId, chapterId: Number(chapterId), expectedVersion: session.version });
      toast.success("Đã gắn chương cho buổi học.");
      await loadChapters();
      await onChanged?.();
    } catch (requestError) {
      toast.error(requestError?.message || "Không thể gắn chương cho buổi học.");
    } finally {
      setSavingSessionId(null);
    }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white"><BookOpen className="h-4 w-4 text-blue-600" /> Chương & buổi học</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tạo chương cho lớp và gắn những buổi học thuộc chương đó.</p>
      </div>
      <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700">
        <Plus className="h-4 w-4" /> {showForm ? "Đóng form" : "Tạo chương"}
      </button>
    </div>

    {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error} <button type="button" onClick={loadChapters} className="ml-2 font-bold underline">Tải lại</button></div>}

    {showForm && <form onSubmit={createChapter} className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/70 dark:bg-blue-950/20">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tên chương *<input required maxLength={255} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className={fieldClass} placeholder="Ví dụ: Chương 1 - Tổng quan" /></label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Giáo viên phụ trách<select value={form.teacherId} onChange={(event) => setForm((value) => ({ ...value, teacherId: event.target.value }))} className={fieldClass}><option value="">Chưa phân công</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name || teacher.email}</option>)}</select></label>
      </div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Mô tả<input maxLength={10000} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className={fieldClass} placeholder="Nội dung chính của chương (tùy chọn)" /></label>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Mục tiêu học tập<textarea maxLength={5000} rows={2} value={form.objectives} onChange={(event) => setForm((value) => ({ ...value, objectives: event.target.value }))} className={fieldClass} placeholder="Mục tiêu của chương (tùy chọn)" /></label>
      {sessions.length > 0 && <fieldset className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <legend className="px-1 text-xs font-bold text-slate-700 dark:text-slate-300">Gắn buổi học có sẵn (tùy chọn)</legend>
        <div className="max-h-36 space-y-2 overflow-y-auto">{sessions.map((session) => <label key={session.id} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selectedSessionIds.includes(String(session.id))} onChange={() => toggleSession(String(session.id))} className="mt-0.5" /><span>{session.title} <span className="text-slate-500">· {dateTime(session.start_time)}</span></span></label>)}</div>
      </fieldset>}
      <button type="submit" disabled={creating || loading || Boolean(error)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{creating ? "Đang tạo..." : "Lưu chương"}</button>
    </form>}

    {loading ? <p className="mt-4 text-xs text-slate-500">Đang tải các chương...</p> : !error && <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {chapters.map((chapter) => <div key={chapter.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{chapter.title}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{countsByChapter.get(String(chapter.id)) || 0} buổi · {chapter.assigned_teacher_name || "Chưa phân công giáo viên"}</p>
        </div>)}
        {!chapters.length && <p className="text-xs text-slate-500">Lớp chưa có chương. Chọn “Tạo chương” để bắt đầu.</p>}
      </div>
      {sessions.length > 0 && <div className="mt-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gắn chương cho từng buổi</h3>
        <div className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">{sessions.map((session) => {
          const sessionId = String(session.id);
          return <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="text-xs font-bold text-slate-800 dark:text-slate-200">{session.title}</p><p className="text-[11px] text-slate-500">{dateTime(session.start_time)}</p></div>
            <div className="flex min-w-48 flex-1 items-center gap-2 sm:max-w-sm">
              <select aria-label={`Chương của ${session.title}`} value={assignments[sessionId] ?? String(session.chapter_id || "")} onChange={(event) => setAssignments((value) => ({ ...value, [sessionId]: event.target.value }))} className={fieldClass + " mt-0 flex-1"}>
                <option value="">Chưa gắn chương</option>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
              <button type="button" onClick={() => assignChapter(session)} disabled={savingSessionId === sessionId || !assignments[sessionId] || assignments[sessionId] === String(session.chapter_id || "")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Lưu</button>
            </div>
          </div>;
        })}</div>
      </div>}
    </>}
  </section>;
}
