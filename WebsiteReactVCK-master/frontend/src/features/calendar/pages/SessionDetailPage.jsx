/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, Bell, BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock,
  FileText, Lock, Play, Trophy, Users, Video,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { isTeacherRole } from "../../../constants/roles";
import {
  checkInToSession, fetchAssignments, fetchClassAnnouncements, fetchLiveClassSessions,
  fetchMySessionCheckIn, fetchStudentFiles, getLiveSessionAccess,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";
import { classCalendarIcsUrl, googleCalendarEventUrl } from "../calendarLinks";

const tabs = [
  { id: "overview", label: "Tổng quan", icon: CalendarDays },
  { id: "content", label: "Nội dung", icon: BookOpen },
  { id: "tasks", label: "Bài tập & Quiz", icon: ClipboardList },
  { id: "materials", label: "Tài liệu", icon: FileText },
  { id: "announcements", label: "Thông báo", icon: Bell },
  { id: "results", label: "Kết quả", icon: Trophy },
];

const formatDateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", {
  weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "Chưa xác định";

const taskHref = (basePath, task) => task.type === "quiz"
  ? `${basePath}/quizzes/${task.id}`
  : `${basePath}/assignments/${task.id}/submit`;

export default function SessionDetailPage() {
  const { courseId, classId, sessionId } = useParams();
  const { authUser } = useAuthContext();
  const isTeacher = isTeacherRole(authUser?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : "overview";
  const [session, setSession] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkIn, setCheckIn] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchLiveClassSessions(classId);
      const found = res?.success && Array.isArray(res.data)
        ? res.data.find((item) => String(item.id) === String(sessionId))
        : null;
      if (!found) throw new Error("Không tìm thấy thông tin buổi học này.");
      setSession(found);
    } catch (requestError) {
      setSession(null);
      setError(requestError.message || "Lỗi khi tải thông tin buổi học.");
    } finally {
      setLoading(false);
    }
  }, [classId, sessionId]);

  const loadResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const [taskResponse, fileResponse, announcementResponse] = await Promise.all([
        fetchAssignments({ courseId, classId, sessionId }),
        fetchStudentFiles({ courseId, classId, sessionId }),
        fetchClassAnnouncements({ classId, sessionId }),
      ]);
      setTasks(taskResponse?.success && Array.isArray(taskResponse.data) ? taskResponse.data : []);
      setFiles(fileResponse?.success && Array.isArray(fileResponse.data) ? fileResponse.data : []);
      setAnnouncements(announcementResponse?.success && Array.isArray(announcementResponse.data) ? announcementResponse.data : []);
    } catch (requestError) {
      toast.error(requestError.message || "Không thể tải học liệu của buổi học.");
      setTasks([]);
      setFiles([]);
      setAnnouncements([]);
    } finally {
      setResourcesLoading(false);
    }
  }, [classId, courseId, sessionId]);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => { loadResources(); }, [loadResources]);
  useEffect(() => {
    if (isTeacher || !sessionId) return undefined;
    let active = true;
    fetchMySessionCheckIn(sessionId)
      .then((response) => { if (active) setCheckIn(response?.data || null); })
      .catch(() => { if (active) setCheckIn(null); });
    return () => { active = false; };
  }, [isTeacher, sessionId]);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const response = await checkInToSession(sessionId);
      setCheckIn((current) => ({ ...current, ...response.data, canCheckIn: false, reason: "Bạn đã được ghi nhận có mặt." }));
      toast.success(response.message || "Đã báo có mặt.");
    } catch (requestError) {
      toast.error(requestError.message || "Không thể báo có mặt.");
      const response = await fetchMySessionCheckIn(sessionId).catch(() => null);
      if (response?.data) setCheckIn(response.data);
    } finally { setCheckingIn(false); }
  };

  const handleJoin = async () => {
    if (!session) return;
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      openReservedMeeting(meetingWindow, result.data.meetUrl);
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (requestError) {
      closeReservedMeeting(meetingWindow);
      toast.error(requestError.message || "Không thể truy cập phòng học.");
    }
  };

  if (loading) return <Loading loading text="Đang mở không gian buổi học..." fullScreen={false} className="min-h-[50vh] py-16" />;
  if (error || !session) return <div className="py-12"><ErrorState title="Chưa thể mở buổi học" message={error} onRetry={loadSession} /></div>;

  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const now = Date.now();
  const start = new Date(session.start_time).getTime();
  const end = new Date(session.end_time).getTime();
  const isLive = session.status === "live" || (now >= start && now <= end);
  const isJoinable = isLive || (start - now <= 15 * 60 * 1000 && now <= end);
  const isEnded = now > end || session.status === "ended";
  const completeTasks = tasks.filter((task) => ["submitted", "graded"].includes(task.status));
  const tabClass = (isActive) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"}`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 transition-colors duration-200">
      <Link to={basePath} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400">
        <ArrowLeft className="h-4 w-4" /> Quay lại lớp và lịch học
      </Link>

      <section className="overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-4 py-3.5 text-white shadow-sm dark:border-blue-900/60 dark:shadow-none sm:px-6 sm:py-4">
        <div className="flex flex-col justify-between gap-3.5 lg:flex-row lg:items-center">
          <div className="min-w-0 space-y-1 sm:space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold backdrop-blur">
              <Video className="h-3 w-3" /> Không gian buổi học
            </span>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">{session.title}</h1>
            <p className="inline-flex items-center gap-1.5 text-xs text-blue-100 sm:text-sm">
              <Clock className="h-3.5 w-3.5 text-blue-200 shrink-0" /> {formatDateTime(session.start_time)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isJoinable ? (
              <button
                type="button"
                onClick={handleJoin}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50"
              >
                <Play className="h-3.5 w-3.5" /> Vào lớp học
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold">
                {isEnded ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {isEnded ? "Buổi học đã kết thúc" : "Phòng mở trước 15 phút"}
              </span>
            )}
            <a
              href={googleCalendarEventUrl({
                title: session.title,
                startTime: session.start_time,
                endTime: session.end_time,
                details: "Buổi học CSCA Academy",
              })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium transition hover:bg-white/20"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Thêm Google Calendar
            </a>
            <a
              href={classCalendarIcsUrl(classId)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium transition hover:bg-white/20"
            >
              <FileText className="h-3.5 w-3.5" /> Tải lịch .ics
            </a>
            {isTeacher && (
              <Link
                to={`/lms/teach/classes/${classId}/attendance?sessionId=${session.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium transition hover:bg-white/20"
              >
                <Users className="h-3.5 w-3.5" /> Điểm danh
              </Link>
            )}
          </div>
        </div>
      </section>

      {!isTeacher && checkIn && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className={`h-5 w-5 ${checkIn.status === "present" ? "text-emerald-500" : "text-slate-400"}`} />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Báo có mặt buổi học</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {checkIn.status === "present" ? "Đã ghi nhận có mặt" : checkIn.status === "absent" ? "Giáo viên ghi vắng mặt" : checkIn.status === "excused" ? "Giáo viên ghi có phép" : checkIn.reason || "Bạn chưa báo có mặt"}
              </p>
            </div>
          </div>
          {checkIn.canCheckIn && !checkIn.status && (
            <button type="button" disabled={checkingIn} onClick={handleCheckIn} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
              {checkingIn ? "Đang ghi nhận..." : "Tôi có mặt"}
            </button>
          )}
        </section>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none" aria-label="Chức năng của buổi học">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => setSearchParams(tab.id === "overview" ? {} : { tab: tab.id })} className={tabClass(activeTab === tab.id)}><Icon className="h-4 w-4" /> {tab.label}</button>;
        })}
      </nav>

      {resourcesLoading ? <Loading loading text="Đang đồng bộ học liệu của buổi..." fullScreen={false} className="min-h-40 py-10" /> : <>
        {activeTab === "overview" && <div className="grid gap-4 sm:grid-cols-4"><InfoCard label="Bài tập & Quiz" value={tasks.length} /><InfoCard label="Tài liệu" value={files.length} /><InfoCard label="Thông báo" value={announcements.length} /><InfoCard label="Đã hoàn thành" value={`${completeTasks.length}/${tasks.length}`} /></div>}
        {activeTab === "content" && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-base font-black text-slate-900 dark:text-white">Nội dung buổi học</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{session.description || "Giáo viên sẽ cập nhật nội dung, slide và bài tập trong đúng không gian buổi học này."}</p><button type="button" onClick={() => setSearchParams({ tab: "materials" })} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700"><BookOpen className="h-4 w-4" /> Xem tài liệu buổi học</button></section>}
        {activeTab === "tasks" && <SessionTaskList tasks={tasks} basePath={basePath} />}
        {activeTab === "materials" && <SessionFileList files={files} />}
        {activeTab === "announcements" && <SessionAnnouncementList announcements={announcements} />}
        {activeTab === "results" && <SessionResults tasks={completeTasks} basePath={basePath} />}
      </>}
    </div>
  );
}

function InfoCard({ label, value }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p><p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p></section>;
}

function SessionTaskList({ tasks, basePath }) {
  if (!tasks.length) return <EmptyState icon={ClipboardList} title="Chưa có bài tập hoặc Quiz" description="Bài tập và Quiz giáo viên giao cho buổi này sẽ xuất hiện tại đây." />;
  return <section className="space-y-3">{tasks.map((task) => { const isHomeworkQuiz = task.type === "quiz" && (task.activity_scope || task.activityScope) === "homework"; return <Link key={`${task.type}-${task.id}`} to={taskHref(basePath, task)} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-700"><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${task.type === "quiz" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300"}`}>{isHomeworkQuiz ? "QUIZ VỀ NHÀ" : task.type === "quiz" ? "QUIZ TRONG BUỔI" : "BÀI TẬP VỀ NHÀ"}</span><h2 className="mt-2 text-sm font-black text-slate-900 dark:text-white">{task.title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{task.type === "quiz" && !isHomeworkQuiz ? "Làm trực tuyến và chấm điểm tự động trong buổi học" : `Hạn nộp: ${task.due_date ? formatDateTime(task.due_date) : "Giáo viên sẽ thông báo"}`}</p></div><span className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white">{task.status === "graded" ? "Xem kết quả" : task.status === "submitted" ? "Đã nộp" : "Mở bài"}</span></Link>; })}</section>;
}

function SessionFileList({ files }) {
  if (!files.length) return <EmptyState icon={FileText} title="Chưa có tài liệu" description="Slide, đề mẫu và tài liệu của buổi này sẽ được hiển thị tại đây." />;
  return <section className="grid gap-3 sm:grid-cols-2">{files.map((file) => <a key={file.id} href={file.downloadUrl || file.download_url} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"><FileText className="h-5 w-5 text-blue-600 dark:text-sky-400" /><h2 className="mt-3 truncate text-sm font-black text-slate-900 dark:text-white">{file.name}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString("vi-VN") : "Tài liệu buổi học"}</p></a>)}</section>;
}

function SessionAnnouncementList({ announcements }) {
  if (!announcements.length) return <EmptyState icon={Bell} title="Chưa có thông báo" description="Thông báo của giáo viên về đúng buổi học này sẽ xuất hiện ở đây." />;
  return <section className="space-y-3">{announcements.map((announcement) => <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-sm font-black text-slate-900 dark:text-white">{announcement.title}</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950/60 dark:text-sky-300">{announcement.sentAt ? new Date(announcement.sentAt).toLocaleString("vi-VN") : "Đã gửi"}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{announcement.message}</p><div className="mt-4 flex flex-wrap gap-3">{announcement.linkUrl && <a href={announcement.linkUrl} className="text-xs font-black text-blue-600 dark:text-sky-400">Mở liên kết</a>}{announcement.attachmentUrl && <a href={announcement.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-600 dark:text-sky-400">Tải tài liệu đính kèm</a>}</div></article>)}</section>;
}

function SessionResults({ tasks, basePath }) {
  if (!tasks.length) return <EmptyState icon={Trophy} title="Chưa có kết quả" description="Kết quả của Quiz và bài tập sau khi nộp sẽ hiển thị tại đây." />;
  return <section className="space-y-3">{tasks.map((task) => <Link key={`${task.type}-${task.id}`} to={taskHref(basePath, task)} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div><h2 className="text-sm font-black text-slate-900 dark:text-white">{task.title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{task.status === "graded" ? "Đã chấm điểm" : "Đã nộp, đang chờ chấm"}</p></div><span className="text-sm font-black text-emerald-600 dark:text-emerald-300">{task.score !== null && task.score !== undefined ? `${task.score}/${task.max_score || 10}` : "—"}</span></Link>)}</section>;
}
