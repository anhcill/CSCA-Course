import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthContext } from "../../../context/AuthContext";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Users
} from "lucide-react";
import {
  deleteClassFile,
  fetchClassDetails,
  fetchClassFiles,
  fetchLiveClassSessions,
  fetchLiveClassSchedules,
  getLiveSessionAccess,
  uploadClassFile
} from "../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";

import ClassWorkspaceOverviewTab from "../components/classWorkspace/ClassWorkspaceOverviewTab";
import ClassWorkspaceRosterTab from "../components/classWorkspace/ClassWorkspaceRosterTab";
import ClassWorkspaceScheduleTab from "../components/classWorkspace/ClassWorkspaceScheduleTab";
import ClassWorkspaceCurriculumTab from "../components/classWorkspace/ClassWorkspaceCurriculumTab";
import ClassWorkspaceAssignmentsTab from "../components/classWorkspace/ClassWorkspaceAssignmentsTab";
import ClassWorkspaceFilesTab from "../components/classWorkspace/ClassWorkspaceFilesTab";
import ClassWorkspaceGradesTab from "../components/classWorkspace/ClassWorkspaceGradesTab";

import CreateAssignmentModal from "../components/CreateAssignmentModal";
import TeacherGradingModal from "../components/TeacherGradingModal";
import CreateScheduleModal from "../../calendar/components/CreateScheduleModal";
import SessionDetailModal from "../../calendar/components/SessionDetailModal";
import TeacherNextSessionHero from "../components/classWorkspace/TeacherNextSessionHero";
import MeetingLinkModal from "../components/classWorkspace/MeetingLinkModal";
import { closeReservedMeeting, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";

const TABS = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "roster", label: "Học viên", icon: Users },
  { id: "schedule", label: "Lịch & Buổi học", icon: CalendarDays },
  { id: "curriculum", label: "Nội dung", icon: BookOpen },
  { id: "assignments", label: "Bài tập & Quiz", icon: FileText },
  { id: "files", label: "Tài liệu", icon: FileText },
  { id: "grades", label: "Bảng điểm", icon: Award },
];

export default function TeacherClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Files & Sessions State
  const [files, setFiles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Modals
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [gradingModalSubmission, setGradingModalSubmission] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [meetingLinkSession, setMeetingLinkSession] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resClass, resFiles, resSessions, resSchedules] = await Promise.all([
        fetchClassDetails(classId),
        fetchClassFiles(classId),
        fetchLiveClassSessions(classId),
        fetchLiveClassSchedules(classId),
      ]);

      if (!resClass?.data) throw new Error("Không tìm thấy dữ liệu lớp học");
      setClassData(resClass.data);
      setFiles(Array.isArray(resFiles?.data) ? resFiles.data : []);
      setSessions(Array.isArray(resSessions?.data) ? resSessions.data : []);
      setSchedules(Array.isArray(resSchedules?.data) ? resSchedules.data : []);
    } catch (err) {
      setClassData(null);
      setError(err.message || "Không thể tải chi tiết lớp học");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Upload file
  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    try {
      const res = await uploadClassFile({ classId, file });
      if (!res?.success) throw new Error(res?.message || "Không thể tải lên tài liệu");
      toast.success("Tải lên tài liệu thành công!");
      const filesRes = await fetchClassFiles(classId);
      if (filesRes?.data) setFiles(filesRes.data);
    } catch (err) {
      toast.error(err.message || "Lỗi khi tải file lên.");
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
  };

  // Delete file
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa tài liệu này?")) return;
    try {
      const res = await deleteClassFile({ classId, fileId });
      if (!res?.success) throw new Error(res?.message || "Không thể xóa tài liệu");
      toast.success("Đã xóa tài liệu.");
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      toast.error(err.message || "Lỗi khi xóa file.");
    }
  };

  const handleJoinSession = async (session) => {
    const meetingWindow = reserveMeetingWindow();
    try {
      const result = await getLiveSessionAccess(session.id);
      if (!result?.success || !result?.data?.meetUrl) throw new Error(result?.message || "Phòng học chưa sẵn sàng");
      openReservedMeeting(meetingWindow, result.data.meetUrl);
      toast.success(`Đang mở phòng dạy ${result.data.provider || "trực tuyến"}...`);
    } catch (requestError) {
      closeReservedMeeting(meetingWindow);
      toast.error(requestError.message || "Không thể mở phòng dạy.");
    }
  };

  if (loading) {
    return <Loading loading={true} text="Đang mở không gian lớp học..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  if (error || !classData) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState title="Chưa thể mở lớp học" message={error} onRetry={loadData} />
      </div>
    );
  }

  const { classInfo = {}, stats = {}, students = [], assignments = [], sections = [] } = classData;
  const canManageFixedSchedule = authUser?.role === "admin";
  const nextSession = sessions.find((s) => new Date(s.end_time || s.endTime).getTime() > Date.now()) || sessions[0] || null;
  const atRiskStudents = students.filter((s) => s.riskLevel === "danger" || s.riskLevel === "warning");

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb quay về trang Teacher Home */}
        <Link
          to="/lms/teach"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại trang Giảng dạy
        </Link>

        <TeacherNextSessionHero
          classTitle={classInfo.title}
          classId={classId}
          nextSession={nextSession}
          onOpenSession={setSelectedSession}
          onOpenAttendance={(session) => navigate(`/lms/teach/classes/${classId}/attendance?sessionId=${session.id}`)}
          onOpenSchedule={() => setActiveTab("schedule")}
          onCreateSession={() => setIsCreateSessionOpen(true)}
        />

        {/* Thanh chuyển tab chuẩn Section 3.3.B */}
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-sm" aria-label="Các tab không gian lớp">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </nav>

        {/* Nội dung tab */}
        {activeTab === "overview" && (
          <ClassWorkspaceOverviewTab
            stats={stats}
            atRiskStudents={atRiskStudents}
            classId={classId}
            onTabChange={setActiveTab}
            onOpenCreateAssignment={() => setIsCreateAssignmentOpen(true)}
            onOpenCreateSession={() => setIsCreateSessionOpen(true)}
          />
        )}

        {activeTab === "roster" && (
          <ClassWorkspaceRosterTab students={students} />
        )}

        {activeTab === "schedule" && (
          <ClassWorkspaceScheduleTab
            sessions={sessions}
            schedules={schedules}
            classId={classId}
            onOpenCreateSession={() => setIsCreateSessionOpen(true)}
            onRefreshSchedules={loadData}
            onJoinSession={handleJoinSession}
            onConfigureMeeting={setMeetingLinkSession}
            canManageFixedSchedule={canManageFixedSchedule}
          />
        )}

        {activeTab === "curriculum" && (
          <ClassWorkspaceCurriculumTab
            courseId={classInfo.course_id || classInfo.courseId}
            classId={classId}
            sections={sections}
          />
        )}

        {activeTab === "assignments" && (
          <ClassWorkspaceAssignmentsTab
            assignments={assignments}
            classId={classId}
            onOpenCreateAssignment={() => setIsCreateAssignmentOpen(true)}
            onOpenGradingModal={setGradingModalSubmission}
          />
        )}

        {activeTab === "files" && (
          <ClassWorkspaceFilesTab
            files={files}
            classId={classId}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
            isUploading={isUploadingFile}
          />
        )}

        {activeTab === "grades" && (
          <ClassWorkspaceGradesTab
            assignments={assignments}
            classId={classId}
            onOpenGradingModal={setGradingModalSubmission}
          />
        )}
      </div>

      {/* Modals */}
      {isCreateAssignmentOpen && (
        <CreateAssignmentModal
          isOpen={isCreateAssignmentOpen}
          classId={classId}
          onClose={() => setIsCreateAssignmentOpen(false)}
          onCreated={loadData}
        />
      )}

      {isCreateSessionOpen && (
        <CreateScheduleModal
          classId={classId}
          canManageFixedSchedule={canManageFixedSchedule}
          onClose={() => setIsCreateSessionOpen(false)}
          onSuccess={loadData}
        />
      )}

      {gradingModalSubmission && (
        <TeacherGradingModal
          submission={gradingModalSubmission}
          onClose={() => setGradingModalSubmission(null)}
          onGraded={loadData}
        />
      )}

      {selectedSession && (
        <SessionDetailModal
          session={{ ...selectedSession, uiState: "upcoming", live_class_id: selectedSession.live_class_id || classId }}
          onClose={() => setSelectedSession(null)}
          onJoin={handleJoinSession}
          isTeacher={true}
          basePath=""
        />
      )}

      {meetingLinkSession && (
        <MeetingLinkModal
          session={meetingLinkSession}
          onClose={() => setMeetingLinkSession(null)}
          onSaved={async () => {
            setMeetingLinkSession(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}
