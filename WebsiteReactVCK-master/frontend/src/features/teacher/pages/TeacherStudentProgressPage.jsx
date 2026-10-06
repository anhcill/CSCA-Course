/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, Download, Search, SlidersHorizontal, Users } from "lucide-react";
import { fetchAssessmentAccommodations, fetchClassStudentProgress, fetchTeacherDashboardStats, gradebookExportUrl, saveAssessmentAccommodation } from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";

const EMPTY_GRADEBOOK = {
  classInfo: null,
  sessions: [],
  students: [],
  attendance: [],
  activities: [],
  scores: [],
};

const formatSession = (session) => {
  if (!session?.startTime) return session?.title || "Buổi học";
  const date = new Date(session.startTime);
  return `${session.title || "Buổi học"} · ${date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
};

const formatCheckedAt = (value) => value
  ? new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : null;

const attendanceLabel = {
  present: { text: "Có mặt", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  absent: { text: "Vắng", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  excused: { text: "Có phép", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
};

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
      <p className="mt-3 text-xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

const datetimeLocalValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000));
  return local.toISOString().slice(0, 16);
};

function AccommodationModal({ student, activities, initialActivity, onClose, onSaved }) {
  const [activityId, setActivityId] = useState(initialActivity?.id || activities[0]?.id || "");
  const [dueAt, setDueAt] = useState("");
  const [extraTimeMinutes, setExtraTimeMinutes] = useState("");
  const [attemptLimitOverride, setAttemptLimitOverride] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const activity = activities.find((item) => item.id === activityId) || null;
  const [assessmentType, assessmentId] = String(activity?.id || "").split("-");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!assessmentType || !assessmentId) return;
      setLoading(true);
      try {
        const response = await fetchAssessmentAccommodations({ assessmentType, assessmentId });
        const current = (response?.data || []).find((item) => String(item.userId) === String(student.id) && item.status === "active");
        if (!cancelled) {
          setDueAt(datetimeLocalValue(current?.dueAt));
          setExtraTimeMinutes(current?.extraTimeMinutes ? String(current.extraTimeMinutes) : "");
          setAttemptLimitOverride(current?.attemptLimitOverride ? String(current.attemptLimitOverride) : "");
          setReason(current?.reason || "");
        }
      } catch {
        if (!cancelled) setReason("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [assessmentId, assessmentType, student.id]);

  const handleSave = async () => {
    if (!activity) return;
    if (!reason.trim() || reason.trim().length < 10) {
      window.alert("Hãy nhập lý do điều chỉnh ít nhất 10 ký tự.");
      return;
    }
    try {
      setSaving(true);
      await saveAssessmentAccommodation({
        assessmentType,
        assessmentId: Number(assessmentId),
        userId: Number(student.id),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        extraTimeMinutes: assessmentType === "quiz" && extraTimeMinutes ? Number(extraTimeMinutes) : 0,
        attemptLimitOverride: assessmentType === "quiz" && attemptLimitOverride ? Number(attemptLimitOverride) : null,
        reason: reason.trim(),
      });
      onSaved();
    } catch (error) {
      window.alert(error?.message || "Không thể lưu điều chỉnh riêng.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Điều chỉnh hỗ trợ riêng">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-sky-400">Hỗ trợ cá nhân</p><h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Điều chỉnh cho {student.name}</h2><p className="mt-1 text-xs text-slate-500">Mọi thay đổi đều có lý do và log kiểm tra.</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Đóng</button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Hoạt động<select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white">{activities.map((item) => <option key={item.id} value={item.id}>{item.type === "quiz" ? "Quiz" : "Bài tập"}: {item.title}</option>)}</select></label>
          {loading ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">Đang tải điều chỉnh hiện có...</p> : <>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Gia hạn riêng <span className="font-medium text-slate-400">(không bắt buộc)</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            {assessmentType === "quiz" && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Cộng thêm thời gian (phút)<input type="number" min="0" max="480" value={extraTimeMinutes} onChange={(event) => setExtraTimeMinutes(event.target.value)} placeholder="Ví dụ: 15" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label><label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Tổng số lượt làm riêng<input type="number" min="1" max="10" value={attemptLimitOverride} onChange={(event) => setAttemptLimitOverride(event.target.value)} placeholder="Ví dụ: 2" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label></div>}
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Lý do <span className="text-rose-500">*</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} placeholder="Ví dụ: Học viên có xác nhận cần thêm thời gian làm bài." className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          </>}
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Hủy</button><button type="button" disabled={loading || saving || !activity} onClick={handleSave} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu điều chỉnh"}</button></div>
      </div>
    </div>
  );
}

export default function TeacherStudentProgressPage() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("all");
  const [gradebook, setGradebook] = useState(EMPTY_GRADEBOOK);
  const [search, setSearch] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingGradebook, setLoadingGradebook] = useState(false);
  const [error, setError] = useState("");
  const [accommodationTarget, setAccommodationTarget] = useState(null);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setError("");
    try {
      const result = await fetchTeacherDashboardStats({ limit: 1 });
      const nextClasses = result?.data?.classes || [];
      setClasses(nextClasses);
      setClassId((current) => current || String(nextClasses[0]?.id || ""));
    } catch (loadError) {
      setError(loadError.message || "Không thể tải danh sách lớp phụ trách.");
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadGradebook = useCallback(async () => {
    if (!classId) {
      setGradebook(EMPTY_GRADEBOOK);
      return;
    }
    setLoadingGradebook(true);
    setError("");
    try {
      const result = await fetchClassStudentProgress(classId);
      setGradebook({ ...EMPTY_GRADEBOOK, ...(result?.data || {}) });
    } catch (loadError) {
      setGradebook(EMPTY_GRADEBOOK);
      setError(loadError.message || "Không thể tải sổ theo dõi lớp.");
    } finally {
      setLoadingGradebook(false);
    }
  }, [classId]);

  useEffect(() => { loadClasses(); }, [loadClasses]);
  useEffect(() => { loadGradebook(); }, [loadGradebook]);

  const attendanceByKey = useMemo(() => new Map(
    gradebook.attendance.map((record) => [`${record.userId}:${record.sessionId}`, record]),
  ), [gradebook.attendance]);
  const scoreByKey = useMemo(() => new Map(
    gradebook.scores.map((record) => [`${record.userId}:${record.activityId}`, record]),
  ), [gradebook.scores]);

  const scopedSessions = useMemo(
    () => selectedSessionId === "all" ? gradebook.sessions : gradebook.sessions.filter((session) => session.id === selectedSessionId),
    [gradebook.sessions, selectedSessionId],
  );
  const scopedActivities = useMemo(
    () => selectedSessionId === "all" ? gradebook.activities : gradebook.activities.filter((activity) => activity.sessionId === selectedSessionId),
    [gradebook.activities, selectedSessionId],
  );
  const visibleStudents = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return gradebook.students;
    return gradebook.students.filter((student) => [student.name, student.email].some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
  }, [gradebook.students, search]);

  const completedSessions = gradebook.sessions.filter((session) => new Date(session.endTime).getTime() <= Date.now()).length;
  const selectedClass = classes.find((item) => String(item.id) === classId);

  const getAttendanceSummary = (studentId) => {
    const records = scopedSessions.map((session) => attendanceByKey.get(`${studentId}:${session.id}`)).filter(Boolean);
    if (selectedSessionId !== "all") return records[0] || null;
    const present = records.filter((record) => record.status === "present").length;
    const recorded = records.length;
    return { present, recorded, rate: recorded ? Math.round((present / recorded) * 100) : null };
  };

  const getScoreSummary = (studentId) => {
    const rows = scopedActivities.map((activity) => ({ activity, record: scoreByKey.get(`${studentId}:${activity.id}`) }));
    const graded = rows.filter(({ record }) => Boolean(record)
      && record.score !== null
      && record.score !== undefined
      && (record.status === "graded" || record.type === "quiz"));
    const ratios = graded.map(({ activity, record }) => {
      const maxScore = record.maxScore ?? activity.maxScore;
      return maxScore > 0 ? (record.score / maxScore) * 100 : null;
    }).filter((value) => value !== null);
    return { rows, gradedCount: graded.length, average: ratios.length ? Math.round(ratios.reduce((sum, value) => sum + value, 0) / ratios.length) : null };
  };

  if (loadingClasses) return <Loading loading text="Đang tải sổ theo dõi học viên..." fullScreen={false} className="min-h-[60vh] py-16" />;
  if (error && !classId) return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể mở sổ theo dõi" message={error} onRetry={loadClasses} /></div>;
  if (!classes.length) return <div className="mx-auto max-w-3xl px-4 py-10"><EmptyState icon={Users} title="Chưa có lớp phụ trách" description="Khi được phân công lớp, điểm, quiz và chuyên cần của học viên sẽ xuất hiện ở đây." /></div>;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-sky-400">Sổ theo dõi giảng dạy</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Học viên, điểm & chuyên cần</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Theo dõi bài tự luận, quiz tự chấm và điểm danh theo từng buổi học của một lớp.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2"><label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Chọn lớp<select value={classId} onChange={(event) => { setClassId(event.target.value); setSelectedSessionId("all"); }} className="mt-1.5 block min-w-[16rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{classes.map((item) => <option key={item.id} value={item.id}>{item.title}{item.courseTitle ? ` · ${item.courseTitle}` : ""}</option>)}</select></label><a href={gradebookExportUrl({ classId, courseId: gradebook.classInfo?.courseId || selectedClass?.courseId, format: "xlsx" })} className="inline-flex h-[42px] items-center gap-2 rounded-xl bg-slate-950 px-3.5 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"><Download className="h-3.5 w-3.5" /> Xuất XLSX</a><a href={gradebookExportUrl({ classId, courseId: gradebook.classInfo?.courseId || selectedClass?.courseId, format: "csv" })} className="inline-flex h-[42px] items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">CSV</a></div>
          </div>
        </header>

        {error ? <ErrorState title="Không thể tải dữ liệu lớp" message={error} onRetry={loadGradebook} /> : loadingGradebook ? (
          <Loading loading text="Đang tổng hợp chuyên cần và điểm theo buổi..." fullScreen={false} className="py-16" />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={BookOpen} label="Khóa học" value={gradebook.classInfo?.courseTitle || selectedClass?.courseTitle || "Chưa gắn"} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400" />
              <StatCard icon={Users} label="Sĩ số đang học" value={gradebook.students.length} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400" />
              <StatCard icon={CalendarDays} label="Buổi đã diễn ra" value={`${completedSessions}/${gradebook.sessions.length}`} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400" />
              <StatCard icon={ClipboardCheck} label="Hoạt động có điểm" value={gradebook.activities.length} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400" />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-950 dark:text-white">Chi tiết theo buổi</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Quiz hiện kết quả ngay cho học viên và cũng được ghi lại ở đây để giáo viên theo dõi.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="sr-only" htmlFor="session-filter">Lọc theo buổi học</label>
                  <select id="session-filter" value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="all">Tất cả buổi học</option>
                    {gradebook.sessions.map((session) => <option key={session.id} value={session.id}>{formatSession(session)}</option>)}
                  </select>
                  <label className="relative block">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm học viên" className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                  </label>
                </div>
              </div>

              {visibleStudents.length === 0 ? <div className="mt-5"><EmptyState icon={Users} title="Không tìm thấy học viên" description="Thử đổi từ khóa tìm kiếm hoặc chọn lớp khác." /></div> : (
                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                      <tr><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Điểm danh vào lớp</th><th className="px-4 py-3">Điểm tổng quan</th><th className="px-4 py-3">Chi tiết bài / quiz</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visibleStudents.map((student) => {
                        const attendance = getAttendanceSummary(student.id);
                        const score = getScoreSummary(student.id);
                        const sessionAttendance = selectedSessionId !== "all" ? attendance : null;
                        return (
                          <tr key={student.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-black text-blue-700 dark:bg-blue-950 dark:text-sky-300">{student.avatar ? <img src={student.avatar} alt="" className="h-full w-full object-cover" /> : student.name.slice(0, 1).toUpperCase()}</span><div><p className="font-black text-slate-900 dark:text-white">{student.name}</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{student.email}</p>{scopedActivities.length > 0 && <button type="button" onClick={() => setAccommodationTarget({ student, activity: scopedActivities[0] })} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 dark:text-sky-400"><SlidersHorizontal className="h-3 w-3" /> Hỗ trợ riêng</button>}</div></div></td>
                            <td className="px-4 py-4">{selectedSessionId === "all" ? <><p className="font-black text-slate-900 dark:text-white">{attendance?.rate ?? "—"}{attendance?.rate !== null ? "%" : ""}</p><p className="mt-1 text-[11px] text-slate-500">Có mặt {attendance?.present || 0}/{attendance?.recorded || 0} buổi đã điểm danh</p></> : sessionAttendance ? <><span className={`inline-flex rounded-full px-2 py-1 font-bold ${attendanceLabel[sessionAttendance.status]?.cls || "bg-slate-100 text-slate-600"}`}>{attendanceLabel[sessionAttendance.status]?.text || sessionAttendance.status}</span><p className="mt-1 text-[11px] text-slate-500">Điểm danh lúc {formatCheckedAt(sessionAttendance.checkedAt)}</p></> : <span className="text-slate-400">Chưa điểm danh</span>}</td>
                            <td className="px-4 py-4"><p className="flex items-center gap-1.5 font-black text-slate-900 dark:text-white"><BarChart3 className="h-4 w-4 text-blue-600 dark:text-sky-400" /> {score.average === null ? "Chưa có điểm" : `${score.average}%`}</p><p className="mt-1 text-[11px] text-slate-500">Đã có điểm {score.gradedCount}/{score.rows.length} hoạt động</p></td>
                            <td className="px-4 py-4"><div className="max-w-sm space-y-1.5">{score.rows.length === 0 ? <span className="text-slate-400">Không có bài hoặc quiz trong phạm vi này</span> : score.rows.map(({ activity, record }) => { const maxScore = record?.maxScore ?? activity.maxScore; const hasScore = record?.score !== null && record?.score !== undefined; return <div key={activity.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-100/70 px-2.5 py-2 dark:bg-slate-950/70"><span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{activity.type === "quiz" ? "Quiz" : "Bài tập"}: {activity.title}</span><span className={`shrink-0 font-black ${hasScore ? "text-emerald-600 dark:text-emerald-400" : record ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>{hasScore ? `${record.score}${maxScore ? `/${maxScore}` : ""}` : record ? "Chờ chấm" : "Chưa nộp"}</span></div>; })}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Thời điểm điểm danh là dữ liệu đã được giáo viên chốt cho buổi học.</span><Link to={`/lms/teach/classes/${classId}`} className="font-bold text-blue-600 hover:text-blue-800 dark:text-sky-400">Mở không gian lớp →</Link></div>
            </section>
          </>
        )}
      </div>
      {accommodationTarget && <AccommodationModal student={accommodationTarget.student} activities={scopedActivities.length ? scopedActivities : gradebook.activities} initialActivity={accommodationTarget.activity} onClose={() => setAccommodationTarget(null)} onSaved={() => { setAccommodationTarget(null); loadGradebook(); }} />}
    </div>
  );
}
