import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Files,
  Link2,
  Play,
  Plus,
  UserCheck,
  Video,
} from "lucide-react";
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
import ClassAttendanceAndGradesTab from "../components/classWorkspace/ClassAttendanceAndGradesTab";

const formatDateTime = (value) => {
  if (!value) return "Chưa xác định";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TeacherClassDetailPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Active Tab state
  const rawTab = searchParams.get("tab") || "overview";
  const activeTab = ["overview", "curriculum", "attendance_grades", "attendance", "grades", "files", "schedules"].includes(rawTab)
    ? (rawTab === "attendance" || rawTab === "grades" ? "attendance_grades" : rawTab)
    : "overview";

  const targetSessionId = searchParams.get("sessionId") || "";
  const [sessionFilter, setSessionFilter] = useState("all"); // 'all' | 'upcoming' | 'completed'

  const handleTabChange = (tabId, extraParams = {}) => {
    const params = { tab: tabId, ...extraParams };
    setSearchParams(params);
  };

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
  const now = Date.now();
  const nextSession = sessions.find((item) => new Date(item.end_time || item.endTime).getTime() > now) || null;
  const atRiskStudents = students.filter((item) => item.riskLevel === "danger" || item.riskLevel === "warning");

  const filteredOverviewSessions = sessions.filter((s) => {
    const isPast = new Date(s.end_time || s.endTime || s.start_time).getTime() < now;
    if (sessionFilter === "upcoming") return !isPast;
    if (sessionFilter === "completed") return isPast;
    return true;
  });

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

  const tabsConfig = [
    { id: "overview", label: "Buổi học & Tổng quan", icon: CalendarDays, badge: sessions.length },
    { id: "curriculum", label: "Giáo trình & Chương", icon: BookOpen },
    { id: "attendance_grades", label: "Điểm danh & Điểm số", icon: UserCheck },
    { id: "files", label: "Tài liệu lớp", icon: Files, badge: files.length },
    { id: "schedules", label: "Thời khóa biểu", icon: Clock },
  ];

  return (
    <div className="min-h-full px-3 py-4 sm:px-6 lg:px-8 text-slate-900 transition-colors duration-200 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Top Back Navigation & Direct Links */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={isAdminView ? "/admin/classes" : "/lms/teach"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/85 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-[#17365f] dark:text-slate-200 shadow-2xs backdrop-blur-md transition hover:bg-white dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {isAdminView ? "Quay lại quản lý lớp" : "Quay lại trang Giảng dạy"}
            </Link>
            <span className="text-xs font-black text-slate-400 dark:text-slate-500">/</span>
            <span className="text-xs font-black text-[#102f63] dark:text-white truncate max-w-[240px] sm:max-w-md">
              {classInfo.title || "Chi tiết lớp học"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`${classBasePath}/curriculum`}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition"
              title="Xem trang giáo trình chi tiết"
            >
              <ExternalLink className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
              <span>Giáo trình đầy đủ</span>
            </Link>
          </div>
        </div>

        {/* ── Main Tab Navigation Bar ── */}
        <nav
          className="flex gap-1.5 overflow-x-auto rounded-3xl border border-white/85 bg-white/85 p-1.5 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90"
          aria-label="Phân hệ chức năng lớp học"
        >
          {tabsConfig.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? "bg-[#102f63] text-white shadow-md shadow-[#102f63]/25 ring-1 ring-[#102f63]/20 dark:bg-blue-600 dark:shadow-blue-500/25 dark:ring-blue-500/30"
                    : "text-[#244866] hover:bg-white/90 hover:text-[#102f63] dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ════════════════════════════════════════════════════════════
            TAB 1: BUỔI HỌC & TỔNG QUAN (OVERVIEW)
           ════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Hero Buổi tiếp theo */}
            <TeacherNextSessionHero
              classTitle={classInfo.title}
              nextSession={nextSession}
              onOpenSession={(session) => navigate(`${classBasePath}/sessions/${session.id}`)}
              onOpenAttendance={(session) => handleTabChange("attendance_grades", { sessionId: session.id })}
              onOpenSchedule={() => handleTabChange("schedules")}
              onCreateSession={() => setIsCreateSessionOpen(true)}
            />

            {/* Overview KPIs & Quick Actions */}
            <ClassWorkspaceOverviewTab
              stats={stats}
              atRiskStudents={atRiskStudents}
              onOpenCreateSession={() => setIsCreateSessionOpen(true)}
            />

            {/* ── Danh Sách Buổi Học Tinh Gọn Của Lớp ── */}
            <section className="rounded-3xl border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-5 shadow-xs backdrop-blur-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
                    <Video className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-[#102f63] dark:text-white">
                      Danh Sách Các Buổi Học ({sessions.length})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Bấm vào từng buổi học để mở không gian giảng dạy hoặc điểm danh nhanh.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Filter Pills */}
                  <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200/80 dark:border-slate-700/60">
                    {[
                      ["all", `Tất cả (${sessions.length})`],
                      ["upcoming", "Sắp diễn ra"],
                      ["completed", "Đã kết thúc"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSessionFilter(key)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                          sessionFilter === key
                            ? "bg-white dark:bg-blue-600 text-[#102f63] dark:text-white shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCreateSessionOpen(true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Thêm buổi
                  </button>
                </div>
              </div>

              {filteredOverviewSessions.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Không có buổi học nào phù hợp với bộ lọc đã chọn.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredOverviewSessions.map((s, idx) => {
                    const isLive = s.status === "LIVE" || s.status === "live";
                    const isPast = new Date(s.end_time || s.endTime || s.start_time).getTime() < now;
                    const hasMeetingLink = Boolean(s.has_meeting_link);

                    return (
                      <article
                        key={s.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all ${
                          isLive
                            ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20 shadow-xs"
                            : "border-slate-200/80 dark:border-slate-800/90 bg-white/80 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-black ${
                              isLive
                                ? "bg-emerald-600 text-white animate-pulse"
                                : isPast
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                : "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-300"
                            }`}
                          >
                            {idx + 1}
                          </span>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-xs sm:text-sm font-black text-[#102f63] dark:text-white truncate">
                                {s.title}
                              </h4>
                              {isLive && (
                                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                                  Đang diễn ra
                                </span>
                              )}
                              {s.course_section_title && (
                                <span className="rounded-lg bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                                  {s.course_section_title}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-sky-400">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDateTime(s.start_time || s.startTime)}
                              </span>
                              <span>·</span>
                              <span>
                                {hasMeetingLink
                                  ? `Phòng ${s.provider || "trực tuyến"} sẵn sàng`
                                  : "Chưa gán link phòng học"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Explicit 2 Action Buttons */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => navigate(`${classBasePath}/sessions/${s.id}`)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition active:scale-95"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" /> Vào buổi học
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTabChange("attendance_grades", { sessionId: s.id })}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                            title="Mở sổ điểm danh buổi này"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Điểm danh
                          </button>

                          {isAdminView && !s.meeting_managed_externally && (
                            <button
                              type="button"
                              onClick={() => setMeetingLinkSession(s)}
                              className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300 transition"
                              title="Gán link phòng học"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 2: GIÁO TRÌNH & CHƯƠNG (CURRICULUM)
           ════════════════════════════════════════════════════════════ */}
        {activeTab === "curriculum" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/90 dark:bg-slate-900/90 p-4 rounded-3xl border border-white/80 dark:border-slate-800 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-black text-[#102f63] dark:text-white">
                    Quản Lý Giáo Trình & Chương Học Của Lớp
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tạo chương cho lớp và gắn các buổi học tương ứng vào từng chương.
                  </p>
                </div>
              </div>

              <Link
                to={`${classBasePath}/curriculum`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Mở toàn trang giáo trình
              </Link>
            </div>

            <ClassChaptersManager
              classId={classId}
              sessions={sessions}
              onChanged={loadData}
            />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 3: ĐIỂM DANH & ĐIỂM SỐ (ATTENDANCE_GRADES)
           ════════════════════════════════════════════════════════════ */}
        {activeTab === "attendance_grades" && (
          <ClassAttendanceAndGradesTab
            classId={classId}
            sessions={sessions}
            initialSessionId={targetSessionId}
          />
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 4: TÀI LIỆU LỚP (FILES)
           ════════════════════════════════════════════════════════════ */}
        {activeTab === "files" && (
          <ClassWorkspaceFilesTab
            files={files}
            sessions={sessions}
            onUploadFile={handleUploadFile}
            onDeleteFile={handleDeleteFile}
            onLoadReusableFiles={handleLoadReusableFiles}
            onReuseFile={handleReuseFile}
            isUploading={isUploadingFile}
          />
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB 5: THỜI KHÓA BIỂU (SCHEDULES)
           ════════════════════════════════════════════════════════════ */}
        {activeTab === "schedules" && (
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
        )}
      </div>

      {isCreateSessionOpen && (
        <CreateScheduleModal
          classId={classId}
          canManageFixedSchedule={canManageFixedSchedule}
          onClose={() => setIsCreateSessionOpen(false)}
          onSuccess={loadData}
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
