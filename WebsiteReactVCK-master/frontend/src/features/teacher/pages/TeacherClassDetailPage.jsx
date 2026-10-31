import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Files } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import {
  attachTeacherFile,
  deleteClassFile,
  detachTeacherFile,
  fetchClassDetails,
  fetchClassChapters,
  fetchClassFiles,
  fetchLiveClassSchedules,
  fetchLiveClassSessions,
  fetchReusableTeacherFiles,
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
  const [canManageCurriculum, setCanManageCurriculum] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [classResponse, sessionsResponse, schedulesResponse, filesResponse, chaptersResponse] = await Promise.all([
        fetchClassDetails(classId),
        fetchLiveClassSessions(classId),
        fetchLiveClassSchedules(classId),
        fetchClassFiles(classId).catch(() => ({ data: [] })),
        fetchClassChapters(classId).catch(() => ({ canManageCurriculum: false })),
      ]);
      if (!classResponse?.data) throw new Error("Không tìm thấy dữ liệu lớp học.");
      setClassData(classResponse.data);
      setSessions(Array.isArray(sessionsResponse?.data) ? sessionsResponse.data : []);
      setSchedules(Array.isArray(schedulesResponse?.data) ? schedulesResponse.data : []);
      setFiles(Array.isArray(filesResponse?.data) ? filesResponse.data : []);
      setCanManageCurriculum(Boolean(chaptersResponse?.canManageCurriculum));
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
  const nextSession = sessions.find((item) => new Date(item.end_time || item.endTime).getTime() > Date.now()) || null;
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

  const handleDeleteFile = async (file) => {
    const actionLabel = file.placementId ? "gỡ tài liệu khỏi vị trí này" : "xóa file gốc";
    if (!window.confirm(`Bạn có chắc muốn ${actionLabel}?`)) return;
    try {
      if (file.placementId) await detachTeacherFile(file.placementId);
      else await deleteClassFile(file.id);
      toast.success(file.placementId ? "Đã gỡ liên kết tài liệu." : "Đã xóa tài liệu.");
      setFiles((current) => current.filter((item) => item.instanceId !== file.instanceId));
    } catch (err) {
      toast.error(err.message || "Không thể xóa tài liệu.");
    }
  };

  const handleLoadReusableFiles = async ({ sessionId, search } = {}) => {
    try {
      const response = await fetchReusableTeacherFiles({ classId, sessionId, search });
      return Array.isArray(response?.data) ? response.data : [];
    } catch (err) {
      toast.error(err.message || "Không thể tải kho tài liệu dùng lại.");
      return [];
    }
  };

  const handleReuseFile = async (file, sessionId) => {
    try {
      await attachTeacherFile(file.id, { classId, sessionId: sessionId || undefined });
      toast.success(`Đã dùng lại "${file.name}" mà không tải file trùng.`);
      await loadData();
      return true;
    } catch (err) {
      toast.error(err.message || "Không thể dùng lại tài liệu này.");
      return false;
    }
  };

  return (
    <div className="min-h-full px-3 py-4 sm:px-6 lg:px-8 text-slate-900 transition-colors duration-200 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={isAdminView ? "/admin/classes" : "/lms/teach"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/85 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {isAdminView ? "Quay lại quản lý lớp" : "Quay lại trang Giảng dạy"}
          </Link>
          <Link
            to={`${classBasePath}/curriculum`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/85 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
          >
            <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Giáo trình lớp
          </Link>
          <a
            href="#class-workspace-files"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/85 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
          >
            <Files className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Tài liệu của lớp ({files.length})
          </a>
          {canManageCurriculum && (
            <a
              href="#class-chapters-manager"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/85 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Chương & buổi học
            </a>
          )}
        </div>

        <TeacherNextSessionHero
          classTitle={classInfo.title}
          nextSession={nextSession}
          onOpenSession={(session) => navigate(`${classBasePath}/sessions/${session.id}`)}
          onOpenAttendance={(session) => navigate(`${classBasePath}/attendance?sessionId=${session.id}`)}
          onOpenSchedule={scrollToSchedule}
          onCreateSession={() => setIsCreateSessionOpen(true)}
        />

        <ClassWorkspaceOverviewTab stats={stats} atRiskStudents={atRiskStudents} onOpenCreateSession={() => setIsCreateSessionOpen(true)} />

        {canManageCurriculum && <section id="class-chapters-manager" className="scroll-mt-20">
          <ClassChaptersManager classId={classId} sessions={sessions} onChanged={loadData} />
        </section>}

        <section id="class-workspace-files" className="scroll-mt-6">
          <ClassWorkspaceFilesTab
            files={files}
            sessions={sessions}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
            onLoadReusableFiles={handleLoadReusableFiles}
            onReuseFile={handleReuseFile}
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
