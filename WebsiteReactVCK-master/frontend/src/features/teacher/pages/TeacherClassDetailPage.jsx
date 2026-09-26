import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import {
  fetchClassDetails,
  fetchLiveClassSchedules,
  fetchLiveClassSessions,
} from "../../api/lmsClient";
import { subscribeToCalendarChanges } from "../../calendar/calendarSync";
import Loading from "../../../components/Loading.jsx";
import { ErrorState } from "../../../components/common/StateView";
import ClassWorkspaceOverviewTab from "../components/classWorkspace/ClassWorkspaceOverviewTab";
import ClassWorkspaceScheduleTab from "../components/classWorkspace/ClassWorkspaceScheduleTab";
import CreateScheduleModal from "../../calendar/components/CreateScheduleModal";
import TeacherNextSessionHero from "../components/classWorkspace/TeacherNextSessionHero";
import MeetingLinkModal from "../components/classWorkspace/MeetingLinkModal";

export default function TeacherClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { authUser } = useAuthContext();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [meetingLinkSession, setMeetingLinkSession] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [classResponse, sessionsResponse, schedulesResponse] = await Promise.all([
        fetchClassDetails(classId),
        fetchLiveClassSessions(classId),
        fetchLiveClassSchedules(classId),
      ]);
      if (!classResponse?.data) throw new Error("Không tìm thấy dữ liệu lớp học.");
      setClassData(classResponse.data);
      setSessions(Array.isArray(sessionsResponse?.data) ? sessionsResponse.data : []);
      setSchedules(Array.isArray(schedulesResponse?.data) ? schedulesResponse.data : []);
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

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link to="/lms/teach" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-sky-400">
          <ArrowLeft className="h-4 w-4" /> Quay lại trang Giảng dạy
        </Link>

        <TeacherNextSessionHero
          classTitle={classInfo.title}
          classId={classId}
          nextSession={nextSession}
          onOpenSession={(session) => navigate(`/lms/teach/classes/${classId}/sessions/${session.id}`)}
          onOpenAttendance={(session) => navigate(`/lms/teach/classes/${classId}/attendance?sessionId=${session.id}`)}
          onOpenSchedule={scrollToSchedule}
          onCreateSession={() => setIsCreateSessionOpen(true)}
        />

        <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm dark:border-blue-950/70 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><CalendarDays className="h-4 w-4" /></span>
            <div>
              <h2 className="font-black text-slate-900 dark:text-white">Lớp là tổng quan, buổi học là không gian làm việc</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Chọn một buổi trong lịch bên dưới để giao bài, tạo Quiz, tải tài liệu, điểm danh và xem kết quả. Mọi dữ liệu đó được gắn riêng với đúng buổi học.</p>
            </div>
          </div>
        </section>

        <ClassWorkspaceOverviewTab stats={stats} atRiskStudents={atRiskStudents} onOpenCreateSession={() => setIsCreateSessionOpen(true)} />

        <section id="class-session-schedule" className="scroll-mt-6">
          <ClassWorkspaceScheduleTab
            sessions={sessions}
            schedules={schedules}
            classId={classId}
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
