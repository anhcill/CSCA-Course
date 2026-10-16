/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Save, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAdminSessionCurriculum,
  updateAdminSessionCurriculum,
  updateClassTeacherCurriculumPermission,
} from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

const formatSessionTime = (value) => {
  if (!value) return "Chưa có ngày";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có ngày";
  return date.toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function CourseSessionCurriculumPanel({ courseId, sections = [], lessons = [] }) {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingSessionId, setSavingSessionId] = useState("");
  const [savingTeacherId, setSavingTeacherId] = useState("");

  const loadData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchAdminSessionCurriculum(courseId);
      const nextClasses = Array.isArray(response?.data?.classes) ? response.data.classes : [];
      setClasses(nextClasses);
      setSelectedClassId((current) => (
        nextClasses.some((item) => String(item.id) === String(current))
          ? current
          : String(nextClasses[0]?.id || "")
      ));
      const nextDrafts = {};
      for (const liveClass of nextClasses) {
        for (const session of liveClass.sessions || []) {
          nextDrafts[String(session.id)] = {
            sectionId: session.course_section_id ? String(session.course_section_id) : "",
            lessonId: session.lesson_id ? String(session.lesson_id) : "",
          };
        }
      }
      setDrafts(nextDrafts);
    } catch (requestError) {
      setError(requestError.message || "Không thể tải danh sách buổi học.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedClass = classes.find((item) => String(item.id) === String(selectedClassId)) || null;
  const lessonsBySection = useMemo(() => {
    const grouped = new Map();
    for (const lesson of lessons) {
      const key = String(lesson.section_id || lesson.sectionId || "");
      grouped.set(key, [...(grouped.get(key) || []), lesson]);
    }
    return grouped;
  }, [lessons]);

  const changeSection = (sessionId, sectionId) => {
    setDrafts((current) => ({
      ...current,
      [String(sessionId)]: { sectionId, lessonId: "" },
    }));
  };

  const saveSession = async (session) => {
    const draft = drafts[String(session.id)] || { sectionId: "", lessonId: "" };
    setSavingSessionId(String(session.id));
    try {
      await updateAdminSessionCurriculum({
        sessionId: session.id,
        sectionId: draft.sectionId,
        lessonId: draft.lessonId,
      });
      toast.success("Đã gán chương trình cho buổi học.");
      await loadData();
    } catch (requestError) {
      toast.error(requestError.message || "Không thể lưu nội dung buổi học.");
    } finally {
      setSavingSessionId("");
    }
  };

  const toggleTeacherPermission = async (teacher, allowed) => {
    setSavingTeacherId(String(teacher.id));
    try {
      await updateClassTeacherCurriculumPermission({
        classId: selectedClass.id,
        teacherId: teacher.id,
        allowed,
      });
      setClasses((current) => current.map((liveClass) => (
        String(liveClass.id) !== String(selectedClass.id) ? liveClass : {
          ...liveClass,
          teachers: (liveClass.teachers || []).map((item) => (
            String(item.id) === String(teacher.id)
              ? { ...item, can_manage_curriculum: allowed }
              : item
          )),
        }
      )));
      toast.success(allowed ? "Đã cấp quyền quản lý chương." : "Đã thu hồi quyền quản lý chương.");
    } catch (requestError) {
      toast.error(requestError.message || "Không thể cập nhật quyền giáo viên.");
    } finally {
      setSavingTeacherId("");
    }
  };

  return (
    <section className="rounded-3xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/10 md:p-6">
      <div className="flex flex-col gap-4 border-b border-blue-100 pb-4 dark:border-blue-900/50 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-700 dark:text-sky-300">
            <CalendarDays className="h-5 w-5" />
            <h3 className="text-base font-black">Chương trình theo từng buổi học</h3>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Chọn lớp, sau đó gán chương hoặc bài học cho đúng ngày học.</p>
        </div>
        {classes.length > 0 && (
          <label className="min-w-64 text-xs font-bold text-slate-700 dark:text-slate-300">
            Lớp của khóa học
            <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm dark:border-blue-900 dark:bg-slate-900">
              {classes.map((liveClass) => <option key={liveClass.id} value={liveClass.id}>{liveClass.title}</option>)}
            </select>
          </label>
        )}
      </div>

      {loading ? <div className="pt-5"><LoadingState message="Đang tải các lớp và buổi học..." count={3} /></div>
        : error ? <div className="pt-5"><ErrorState title="Chưa tải được buổi học" message={error} onRetry={loadData} /></div>
          : !selectedClass ? <div className="pt-5"><EmptyState icon={CalendarDays} title="Khóa học chưa có lớp" description="Khi khóa học được gắn với một lớp, các buổi sẽ xuất hiện tại đây." /></div>
            : (
              <div className="mt-5 space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Quyền quản lý chương của giáo viên</h4>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Giáo viên chỉ được chỉnh sửa chương của lớp này khi admin bật quyền.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(selectedClass.teachers || []).map((teacher) => (
                      <label key={teacher.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">{teacher.name || teacher.email}</span>
                          <span className="block truncate text-[11px] text-slate-500">{teacher.email}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(teacher.can_manage_curriculum)}
                          disabled={savingTeacherId === String(teacher.id)}
                          onChange={(event) => toggleTeacherPermission(teacher, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                      </label>
                    ))}
                    {!(selectedClass.teachers || []).length && <p className="text-xs text-slate-500">Lớp chưa có giáo viên phụ trách.</p>}
                  </div>
                </div>

                <div className="space-y-3">
                  {(selectedClass.sessions || []).map((session) => {
                    const draft = drafts[String(session.id)] || { sectionId: "", lessonId: "" };
                    const availableLessons = lessonsBySection.get(String(draft.sectionId)) || [];
                    return (
                      <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-end">
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{session.title}</p>
                            <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-sky-300">{formatSessionTime(session.start_time)}</p>
                          </div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Chương
                            <select value={draft.sectionId} onChange={(event) => changeSection(session.id, event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">
                              <option value="">Chưa gán chương</option>
                              {sections.map((section, index) => <option key={section.id} value={section.id}>Chương {index + 1}: {section.title}</option>)}
                            </select>
                          </label>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Bài học
                            <select value={draft.lessonId} disabled={!draft.sectionId} onChange={(event) => setDrafts((current) => ({ ...current, [String(session.id)]: { ...draft, lessonId: event.target.value } }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800">
                              <option value="">Chỉ gán chương</option>
                              {availableLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title || lesson.name}</option>)}
                            </select>
                          </label>
                          <button type="button" onClick={() => saveSession(session)} disabled={savingSessionId === String(session.id)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                            <Save className="h-3.5 w-3.5" /> {savingSessionId === String(session.id) ? "Đang lưu" : "Lưu"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {!(selectedClass.sessions || []).length && <EmptyState icon={BookOpen} title="Lớp chưa có buổi học" description="Các buổi đã lên lịch sẽ xuất hiện tại đây để gán chương và bài học." />}
                </div>
              </div>
            )}
    </section>
  );
}
