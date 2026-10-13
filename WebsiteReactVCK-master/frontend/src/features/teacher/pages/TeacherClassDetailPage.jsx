import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Files } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import {
  deleteClassFile,
  fetchClassDetails,
  fetchClassFiles,
  fetchLiveClassSchedules,
  fetchLiveClassSessions,
  uploadClassFile,
} from "../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";
import ClassWorkspaceOverviewTab from "../components/classWorkspace/ClassWorkspaceOverviewTab";
import ClassWorkspaceScheduleTab from "../components/classWorkspace/ClassWorkspaceScheduleTab";
import ClassWorkspaceFilesTab from "../components/classWorkspace/ClassWorkspaceFilesTab";
import CreateScheduleModal from "../../calendar/components/CreateScheduleModal";
import TeacherNextSessionHero from "../components/classWorkspace/TeacherNextSessionHero";
import MeetingLinkModal from "../components/classWorkspace/MeetingLinkModal";
import ClassChaptersManager from "../components/classWorkspace/ClassChaptersManager";

export default function TeacherClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith("/admin/classes/");
  const classBasePath = isAdminView ? `/admin/classes/${classId}` : `/lms/teach/classes/${classId}`;
  const { authUser } = useAuthContext();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [files, setFiles] = useState([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [meetingLinkSession, setMeetingLinkSession] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [classResponse, sessionsResponse, schedulesResponse, filesResponse] = await Promise.all([
        fetchClassDetails(classId),
        fetchLiveClassSessions(classId),
        fetchLiveClassSchedules(classId),
        fetchClassFiles(classId).catch(() => ({ data: [] })),
      ]);
      if (!classResponse?.data) throw new Error("Không tìm thấy dữ liệu lớp học.");
      setClassData(classResponse.data);
      setSessions(Array.isArray(sessionsResponse?.data) ? sessionsResponse.data : []);
      setSchedules(Array.isArray(schedulesResponse?.data) ? schedulesResponse.data : []);
      setFiles(Array.isArray(filesResponse?.data) ? filesResponse.data : []);
    } catch (requestError) {
      setClassData(null);
      setError(requestError.message || "Không thể tải chi tiết lớp học.");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const unsubscribe = subscribeToCalendarChanges(loadData);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadData();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadData]);

  if (loading) return <Loading loading text="Đang mở lớp và lịch dạy..." fullScreen={false} className="min-h-[60vh] py-16" />;
  if (error || !classData) return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể mở lớp học" message={error} onRetry={loadData} /></div>;

  const { classInfo = {}, stats = {}, students = [] } = classData;
  const canManageFixedSchedule = authUser?.role === "admin";
  const nextSession = sessions.find((item) => new Date(item.end_time || item.endTime).getTime() > Date.now()) || sessions[0] || null;
  const atRiskStudents = students.filter((item) => item.riskLevel === "danger" || item.riskLevel === "warning");
  const scrollToSchedule = () => document.getElementById("class-session-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleUploadFile = async (file, sessionId, onProgress) => {
    setIsUploadingFile(true);
    try {
      await uploadClassFile(classId, file, { sessionId, onProgress });
      toast.success(`Đã tải lên "${file.name}" cho lớp.`);
      await loadData();
    } catch (err) {
      toast.error(err.message || "Tải lên tài liệu thất bại.");
      throw err;
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm("Xóa tài liệu này khỏi lớp?")) return;
    try {
      await deleteClassFile(fileId);
      toast.success("Đã xóa tài liệu.");
      setFiles((current) => current.filter((f) => String(f.id) !== String(fileId)));
    } catch (err) {
      toast.error(err.message || "Không thể xóa tài liệu.");
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={isAdminView ? "/admin/classes" : "/lms/teach"} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400">
            <ArrowLeft className="h-4 w-4" /> {isAdminView ? "Quay lại quản lý lớp" : "Quay lại trang Giảng dạy"}
          </Link>
          <Link to={`${classBasePath}/curriculum`} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/70 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-blue-950/30">
            <BookOpen className="h-3.5 w-3.5" /> Giáo trình lớp
          </Link>
          <a href="#class-workspace-files" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/70 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-blue-950/30">
            <Files className="h-3.5 w-3.5" /> Tài liệu của lớp ({files.length})
          </a>
          {isAdminView && <a href="#class-chapters-manager" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/70 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-blue-950/30">
            <BookOpen className="h-3.5 w-3.5" /> Chương & buổi học
          </a>}
        </div>

        <TeacherNextSessionHero
          classTitle={classInfo.title}
          classId={classId}
          nextSession={nextSession}
          onOpenSession={(session) => navigate(`${classBasePath}/sessions/${session.id}`)}
          onOpenAttendance={(session) => navigate(`${classBasePath}/attendance?sessionId=${session.id}`)}
          onOpenSchedule={scrollToSchedule}
          onCreateSession={() => setIsCreateSessionOpen(true)}
        />

        <ClassWorkspaceOverviewTab stats={stats} atRiskStudents={atRiskStudents} onOpenCreateSession={() => setIsCreateSessionOpen(true)} />

        {isAdminView && authUser?.role === "admin" && <section id="class-chapters-manager" className="scroll-mt-20">
          <ClassChaptersManager classId={classId} sessions={sessions} onChanged={loadData} />
        </section>}

        <section id="class-workspace-files" className="scroll-mt-6">
          <ClassWorkspaceFilesTab
            files={files}
            sessions={sessions}
            classId={classId}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
            isUploading={isUploadingFile}
          />
        </section>

        <section id="class-session-schedule" className="scroll-mt-6">
          <ClassWorkspaceScheduleTab
            sessions={sessions}
            schedules={schedules}
            classId={classId}
            classBasePath={classBasePath}
            onOpenCreateSession={() => setIsCreateSessionOpen(true)}
            onRefreshSchedules={loadData}
            onConfigureMeeting={setMeetingLinkSession}
            canManageFixedSchedule={canManageFixedSchedule}
          />
        </section>
      </div>

      {isCreateSessionOpen && <CreateScheduleModal classId={classId} canManageFixedSchedule={canManageFixedSchedule} onClose={() => setIsCreateSessionOpen(false)} onSuccess={loadData} />}
      {meetingLinkSession && <MeetingLinkModal session={meetingLinkSession} onClose={() => setMeetingLinkSession(null)} onSaved={async () => { setMeetingLinkSession(null); await loadData(); }} />}
    </div>
  );
}
