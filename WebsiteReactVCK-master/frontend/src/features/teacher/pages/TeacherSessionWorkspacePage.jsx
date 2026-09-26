/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock,
  FileText, GraduationCap, Play, Trophy, UploadCloud, Users, Video,
} from "lucide-react";
import {
  deleteClassFile, fetchClassDetails, fetchClassFiles, fetchLiveClassSessions,
  getLiveSessionAccess, uploadClassFile,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import CreateAssignmentModal from "../components/CreateAssignmentModal";
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

const tabs = [
  { id: "overview", label: "Tổng quan", icon: CalendarDays },
  { id: "students", label: "Học viên", icon: Users },
  { id: "content", label: "Nội dung", icon: BookOpen },
  { id: "tasks", label: "Bài tập & Quiz", icon: ClipboardList },
  { id: "files", label: "Tài liệu", icon: FileText },
  { id: "results", label: "Bảng điểm", icon: Trophy },
];

const formatDateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}) : "Chưa xác định";

export default function TeacherSessionWorkspacePage() {
  const { classId, sessionId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabs.some((tab) => tab.id === searchParams.get("tab")) ? searchParams.get("tab") : "overview";
  const [classData, setClassData] = useState(null);
  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCreateHomeworkOpen, setIsCreateHomeworkOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [detailResponse, sessionsResponse, filesResponse] = await Promise.all([
        fetchClassDetails(classId),
        fetchLiveClassSessions(classId),
        fetchClassFiles(classId, { sessionId }),
      ]);
      const foundSession = sessionsResponse?.success && Array.isArray(sessionsResponse.data)
        ? sessionsResponse.data.find((item) => String(item.id) === String(sessionId))
        : null;
      if (!detailResponse?.data || !foundSession) throw new Error("Không tìm thấy không gian buổi học.");
      setClassData(detailResponse.data);
      setSession(foundSession);
      setFiles(Array.isArray(filesResponse?.data) ? filesResponse.data : []);
    } catch (requestError) {
      setClassData(null);
      setSession(null);
      setError(requestError.message || "Không thể tải không gian buổi học.");
    } finally {
      setLoading(false);
    }
  }, [classId, sessionId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleJoin = async () => {
    if (!session) return;
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) throw new Error(result?.message || "Phòng dạy chưa sẵn sàng");
      openReservedMeeting(meetingWindow, result.data.meetUrl);
      toast.success(`Đang mở phòng dạy ${result.data.provider || "trực tuyến"}...`);
    } catch (requestError) {
      closeReservedMeeting(meetingWindow);
      toast.error(requestError.message || "Không thể mở phòng dạy.");
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      await uploadClassFile(classId, file, { sessionId });
      toast.success(`Đã thêm ${file.name} vào buổi học.`);
      await loadData();
    } catch (requestError) {
      toast.error(requestError.message || "Không thể tải tài liệu.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm("Xóa tài liệu khỏi buổi học này?")) return;
    try {
      await deleteClassFile(fileId);
      setFiles((current) => current.filter((file) => String(file.id) !== String(fileId)));
      toast.success("Đã xóa tài liệu.");
    } catch (requestError) {
      toast.error(requestError.message || "Không thể xóa tài liệu.");
    }
  };

  const tasks = useMemo(() => (classData?.assignments || []).filter((task) => String(task.sessionId || task.class_session_id || "") === String(sessionId)), [classData?.assignments, sessionId]);
  const students = classData?.students || [];

  if (loading) return <Loading loading text="Đang mở không gian buổi dạy..." fullScreen={false} className="min-h-[55vh] py-16" />;
  if (error || !session || !classData) return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể mở buổi dạy" message={error} onRetry={loadData} /></div>;

  const classInfo = classData.classInfo || {};
  const now = Date.now();
  const canJoin = now <= new Date(session.end_time).getTime() || session.status === "live";
  const tabClass = (isActive) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <Link to={`/lms/teach/classes/${classId}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400"><ArrowLeft className="h-4 w-4" /> Quay lại lớp và lịch dạy</Link>
        <section className="overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white shadow-lg dark:border-blue-900/60 dark:shadow-none sm:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-black"><Video className="h-3.5 w-3.5" /> Không gian buổi dạy</span><h1 className="mt-3 text-2xl font-black sm:text-3xl">{session.title}</h1><p className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-100"><Clock className="h-4 w-4" /> {formatDateTime(session.start_time)}</p><p className="mt-1 text-xs text-blue-100">Lớp: {classInfo.title || `Lớp #${classId}`}</p></div><div className="flex flex-wrap gap-2.5">{canJoin && <button type="button" onClick={handleJoin} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-50"><Play className="h-4 w-4" /> Vào phòng dạy</button>}<button type="button" onClick={() => navigate(`/lms/teach/classes/${classId}/attendance?sessionId=${sessionId}`)} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-bold transition hover:bg-white/20"><CheckCircle2 className="h-4 w-4" /> Điểm danh</button></div></div></section>
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none" aria-label="Chức năng của buổi dạy">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setSearchParams(tab.id === "overview" ? {} : { tab: tab.id })} className={tabClass(activeTab === tab.id)}><Icon className="h-4 w-4" /> {tab.label}</button>; })}</nav>
        {activeTab === "overview" && <div className="grid gap-4 sm:grid-cols-4"><Stat label="Học viên" value={students.length} /><Stat label="Bài tập & Quiz" value={tasks.length} /><Stat label="Tài liệu" value={files.length} /><Stat label="Cần chấm" value={tasks.reduce((sum, task) => sum + Number(task.pendingGradingCount || 0), 0)} /></div>}
        {activeTab === "students" && <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800"><div><h2 className="font-black">Học viên của buổi học</h2><p className="mt-1 text-xs text-slate-500">Điểm danh và theo dõi chuyên cần theo đúng buổi này.</p></div><button type="button" onClick={() => navigate(`/lms/teach/classes/${classId}/attendance?sessionId=${sessionId}`)} className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white">Mở điểm danh</button></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{students.map((student) => <div key={student.id} className="flex items-center justify-between p-4 text-sm"><span className="font-bold">{student.name || student.email}</span><span className="text-xs text-slate-500">{student.email}</span></div>)}</div></section>}
        {activeTab === "content" && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-base font-black">Nội dung buổi dạy</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{session.description || "Chuẩn bị nội dung, slide và hoạt động học tập cho buổi này tại đây."}</p><Link to={`/lms/courses/${classInfo.course_id || classInfo.courseId}/classes/${classId}/learn`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white"><BookOpen className="h-4 w-4" /> Xem giáo trình khóa học</Link></section>}
        {activeTab === "tasks" && <TeacherSessionTasks tasks={tasks} classId={classId} sessionId={sessionId} onCreateHomework={() => setIsCreateHomeworkOpen(true)} onCreateSessionQuiz={() => navigate(`/lms/teacher/quizzes?classId=${classId}&sessionId=${sessionId}&scope=session&new=1`)} onOpenGrading={(assignmentId) => navigate(`/lms/teacher/grading?classId=${classId}&sessionId=${sessionId}&assignmentId=${assignmentId}`)} />}
        {activeTab === "files" && <TeacherSessionFiles files={files} isUploading={isUploading} onUpload={handleUpload} onDelete={handleDeleteFile} />}
        {activeTab === "results" && <TeacherSessionResults tasks={tasks} />}
      </div>
      {isCreateHomeworkOpen && <CreateAssignmentModal isOpen classId={classId} sessionId={sessionId} sessionTitle={session.title} homeworkOnly onClose={() => setIsCreateHomeworkOpen(false)} onCreated={loadData} />}
    </div>
  );
}

function Stat({ label, value }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-2xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-slate-500">{label}</p></section>; }

function TeacherSessionTasks({ tasks, onCreateHomework, onCreateSessionQuiz, onOpenGrading }) {
  const inSessionQuizzes = tasks.filter((task) => task.type === "quiz" && task.activityScope !== "homework");
  const homeworks = tasks.filter((task) => task.type !== "quiz" || task.activityScope === "homework");
  return <section className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 dark:border-violet-900/60 dark:bg-violet-950/20"><span className="rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-black text-white">TRONG BUỔI HỌC</span><h2 className="mt-3 font-black">Quiz trắc nghiệm tại lớp</h2><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Học viên làm ngay trong không gian buổi học. Hệ thống chấm tự động.</p><button type="button" onClick={onCreateSessionQuiz} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white transition hover:bg-violet-500">Tạo Quiz buổi học</button></article>
      <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20"><span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white">BÀI TẬP VỀ NHÀ</span><h2 className="mt-3 font-black">Giao file tự luận hoặc Quiz về nhà</h2><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Có hạn nộp; bài file đi vào Cổng chấm tổng, Quiz được chấm tự động.</p><button type="button" onClick={onCreateHomework} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-500">Giao bài tập về nhà</button></article>
    </div>
    <TaskGroup title="Quiz làm trong buổi" tasks={inSessionQuizzes} empty="Chưa có Quiz cho buổi học này." />
    <TaskGroup title="Bài tập về nhà của buổi" tasks={homeworks} empty="Chưa giao bài tập về nhà." onOpenGrading={onOpenGrading} />
  </section>;
}

function TaskGroup({ title, tasks, empty, onOpenGrading }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center justify-between"><h2 className="font-black">{title}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tasks.length}</span></div>{tasks.length ? <div className="space-y-2.5">{tasks.map((task) => <article key={`${task.type}-${task.id}`} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:items-center"><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${task.type === "quiz" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"}`}>{task.type === "quiz" ? "QUIZ TỰ CHẤM" : "NỘP FILE / TỰ LUẬN"}</span><h3 className="mt-2 text-sm font-black">{task.title}</h3><p className="mt-1 text-xs text-slate-500">Đã nộp: {task.submittedCount || 0}/{task.totalCount || 0}{task.pendingGradingCount ? ` · Cần chấm: ${task.pendingGradingCount}` : ""}</p></div>{task.type === "quiz" ? <span className="text-xs font-bold text-violet-700 dark:text-violet-300">Chấm tự động</span> : <button type="button" onClick={() => onOpenGrading?.(task.id)} className="rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">Mở Cổng chấm</button>}</article>)}</div> : <p className="py-5 text-center text-xs text-slate-500">{empty}</p>}</section>; }

function TeacherSessionFiles({ files, isUploading, onUpload, onDelete }) { return <section className="space-y-4"><div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div><h2 className="font-black">Tài liệu của buổi</h2><p className="mt-1 text-xs text-slate-500">Tài liệu tải lên chỉ hiện trong buổi học này.</p></div><label className={`cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white ${isUploading ? "pointer-events-none opacity-50" : ""}`}><UploadCloud className="mr-1 inline h-4 w-4" />{isUploading ? "Đang tải..." : "Tải tài liệu"}<input type="file" className="hidden" disabled={isUploading} onChange={onUpload} /></label></div>{files.length ? <div className="grid gap-3 sm:grid-cols-2">{files.map((file) => <article key={file.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="min-w-0"><h3 className="truncate text-sm font-black">{file.name}</h3><a href={file.downloadUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-blue-600">Mở / tải xuống</a></div><button type="button" onClick={() => onDelete(file.id)} className="text-xs font-bold text-rose-600">Xóa</button></article>)}</div> : <EmptyState icon={FileText} title="Chưa có tài liệu" description="Tải slide hoặc đề bài để học viên xem trong buổi này." />}</section>; }

function TeacherSessionResults({ tasks }) { return tasks.length ? <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr><th className="p-4">Nhiệm vụ</th><th className="p-4 text-center">Đã nộp</th><th className="p-4 text-center">Điểm TB</th></tr></thead><tbody>{tasks.map((task) => <tr key={`${task.type}-${task.id}`} className="border-t border-slate-100 dark:border-slate-800"><td className="p-4 font-bold">{task.title}</td><td className="p-4 text-center">{task.submittedCount || 0}/{task.totalCount || 0}</td><td className="p-4 text-center font-black text-blue-600">{task.avgScore ?? "—"}</td></tr>)}</tbody></table></section> : <EmptyState icon={GraduationCap} title="Chưa có kết quả" description="Kết quả của các nhiệm vụ trong buổi học sẽ tổng hợp tại đây." />; }
