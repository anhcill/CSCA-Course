import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, Bell, Binary, CalendarDays, CheckCircle2, ClipboardList, Clock,
  Download, Eye, FileSpreadsheet, FileText, Files, FolderOpen, Languages, Lock, Play, Trophy, Users, Video, Search,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { isTeacherRole } from "../../../constants/roles";
import {
  checkInToSession, fetchAssignments, fetchClassAnnouncements, fetchLiveClassSessions,
  fetchMySessionCheckIn, fetchSessionFormulas, fetchSessionVocabulary, fetchStudentFiles, getLiveSessionAccess,
  submitVocabularyPractice, toggleFormulaStarApi, toggleVocabularyStar,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import { closeReservedMeeting, getMeetingWindowState, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";
import { classCalendarIcsUrl, googleCalendarEventUrl } from "../calendarLinks";
import SessionVocabularyTab from "../../learning/components/SessionVocabularyTab";
import SessionFormulaTab from "../../learning/components/SessionFormulaTab";
import VocabularyPracticeModal from "../../learning/components/VocabularyPracticeModal";

const tabs = [
  { id: "overview", label: "Tổng quan", icon: CalendarDays },
  { id: "vocabulary", label: "Từ vựng", icon: Languages },
  { id: "formulas", label: "Công thức", icon: Binary },
  { id: "tasks", label: "Bài tập & Quiz", icon: ClipboardList },
  { id: "materials", label: "Tài liệu", icon: FileText },
  { id: "announcements", label: "Thông báo", icon: Bell },
  { id: "results", label: "Kết quả", icon: Trophy },
];

const formatDateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", {
  weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "Chưa xác định";

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const kindForFile = (mime, name = "") => {
  const val = (String(mime || "") + " " + String(name || "")).toLowerCase();
  if (val.includes("pdf")) return "pdf";
  if (val.includes("word") || val.includes("doc")) return "doc";
  if (val.includes("sheet") || val.includes("excel") || val.includes("xls") || val.includes("csv")) return "sheet";
  if (val.includes("presentation") || val.includes("powerpoint") || val.includes("ppt")) return "slide";
  if (val.includes("image") || val.includes("png") || val.includes("jpg") || val.includes("jpeg")) return "image";
  return "other";
};

const kindConfig = {
  pdf: {
    label: "PDF",
    icon: FileText,
    badge: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-900/60",
    pill: "bg-rose-100/90 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300",
    glow: "hover:border-rose-400 dark:hover:border-rose-600/70",
  },
  doc: {
    label: "Word",
    icon: FileText,
    badge: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:text-sky-400 dark:border-blue-900/60",
    pill: "bg-blue-100/90 text-blue-700 dark:bg-blue-950/80 dark:text-sky-300",
    glow: "hover:border-blue-400 dark:hover:border-blue-600/70",
  },
  sheet: {
    label: "Excel",
    icon: FileSpreadsheet,
    badge: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/60",
    pill: "bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300",
    glow: "hover:border-emerald-400 dark:hover:border-emerald-600/70",
  },
  slide: {
    label: "Slide",
    icon: FileText,
    badge: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900/60",
    pill: "bg-amber-100/90 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300",
    glow: "hover:border-amber-400 dark:hover:border-amber-600/70",
  },
  image: {
    label: "Ảnh",
    icon: Files,
    badge: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-900/60",
    pill: "bg-purple-100/90 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300",
    glow: "hover:border-purple-400 dark:hover:border-purple-600/70",
  },
  other: {
    label: "Tài liệu",
    icon: Files,
    badge: "bg-cyan-50 text-cyan-600 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-400 dark:border-cyan-900/60",
    pill: "bg-cyan-100/90 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300",
    glow: "hover:border-cyan-400 dark:hover:border-cyan-600/70",
  },
};

const taskHref = (basePath, task) => task.type === "quiz"
  ? `${basePath}/quizzes/${task.id}`
  : `${basePath}/assignments/${task.id}/submit`;

export default function SessionDetailPage() {
  const { courseId, classId, sessionId } = useParams();
  const navigate = useNavigate();
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
  const [currentVocabSession, setCurrentVocabSession] = useState(null);
  const [showVocabPractice, setShowVocabPractice] = useState(false);
  const [currentFormulaSession, setCurrentFormulaSession] = useState(null);
  const sessionFormulas = currentFormulaSession?.formulas || [];

  const sessionVocabs = currentVocabSession?.vocabularies || [];

  const loadVocabulary = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetchSessionVocabulary(sessionId);
      const data = response?.data;
      setCurrentVocabSession(data?.session ? { ...data.session, vocabularies: data.vocabularies || [] } : null);
    } catch (requestError) {
      setCurrentVocabSession(null);
      if (!silent) toast.error(requestError.message || "Không thể tải từ vựng của buổi học.");
    }
  }, [sessionId]);

  const loadFormulas = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetchSessionFormulas(sessionId);
      const data = response?.data;
      setCurrentFormulaSession(data?.session ? { ...data.session, formulas: data.formulas || [] } : null);
    } catch (requestError) {
      setCurrentFormulaSession(null);
      if (!silent) toast.error(requestError.message || "Không thể tải công thức của buổi học.");
    }
  }, [sessionId]);

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
  useEffect(() => { loadVocabulary({ silent: true }); }, [loadVocabulary]);
  useEffect(() => { loadFormulas({ silent: true }); }, [loadFormulas]);
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
      openReservedMeeting(meetingWindow, result.data.meetUrl, {
        sessionId: session.id,
        provider: result.data.provider,
        navigate,
      });
      toast.success(`Đang mở phòng học ${result.data.provider || "trực tuyến"}...`);
    } catch (requestError) {
      closeReservedMeeting(meetingWindow);
      toast.error(requestError.message || "Không thể truy cập phòng học.");
    }
  };

  if (loading) return <Loading loading text="Đang mở không gian buổi học..." fullScreen={false} className="min-h-[50vh] py-16" />;
  if (error || !session) return <div className="py-12"><ErrorState title="Chưa thể mở buổi học" message={error} onRetry={loadSession} /></div>;

  const basePath = `/lms/courses/${courseId}/classes/${classId}`;
  const meetingWindow = getMeetingWindowState(session);
  const isJoinable = meetingWindow.isOpen;
  const isEnded = meetingWindow.isClosed;
  const completeTasks = tasks.filter((task) => ["submitted", "graded"].includes(task.status));
  const tabClass = (isActive) =>
    `inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 ${
      isActive
        ? "bg-[#102f63] text-white shadow-md shadow-[#102f63]/25 ring-1 ring-[#102f63]/20"
        : "text-[#244866] hover:bg-white/90 hover:text-[#102f63]"
    }`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 transition-colors duration-200">
      <Link
        to={basePath}
        className="inline-flex items-center gap-2 rounded-xl border border-white/85 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-[#17365f] shadow-2xs backdrop-blur-md transition hover:bg-white hover:text-blue-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Quay lại lớp và lịch học
      </Link>

      {/* Hero Banner: Oriental Scholar Glassmorphic Theme */}
      <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md transition">
        {/* Background ambient subtle decorative glows */}
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/40 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200/80 px-3 py-1 text-xs font-bold text-sky-700 shadow-2xs">
                <Video className="h-3.5 w-3.5 text-sky-600" /> Không gian buổi học
              </span>
              {session.provider && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-bold text-emerald-700 shadow-2xs">
                  {session.provider}
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63]">
              {session.title}
            </h1>

            <p className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#244866]">
              <Clock className="h-4 w-4 text-sky-600 shrink-0" />
              {formatDateTime(session.start_time)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isJoinable ? (
              <button
                type="button"
                onClick={handleJoin}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:brightness-105 active:scale-95 animate-pulse"
              >
                <Play className="h-4 w-4 fill-current" /> Vào lớp học
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#487291] shadow-2xs">
                {isEnded ? <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" /> : <Lock className="h-3.5 w-3.5 text-amber-500" />}
                {isEnded ? "Phòng đã đóng sau giờ học" : "Phòng mở trước 15 phút"}
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#17365f] shadow-2xs transition hover:bg-white hover:text-blue-700"
            >
              <CalendarDays className="h-3.5 w-3.5 text-blue-600" /> Thêm Google Calendar
            </a>
            <a
              href={classCalendarIcsUrl(classId)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#17365f] shadow-2xs transition hover:bg-white hover:text-blue-700"
            >
              <FileText className="h-3.5 w-3.5 text-blue-600" /> Tải lịch .ics
            </a>
            {isTeacher && (
              <Link
                to={`/lms/teach/classes/${classId}/attendance?sessionId=${session.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#17365f] shadow-2xs transition hover:bg-white hover:text-blue-700"
              >
                <Users className="h-3.5 w-3.5 text-blue-600" /> Điểm danh
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Check-in attendance bar */}
      {!isTeacher && checkIn && String(checkIn.status || checkIn.attendance_status || "").toLowerCase() !== "present" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/70 via-white to-amber-50/40 p-3.5 sm:px-5 shadow-2xs backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${checkIn.status === "present" ? "text-emerald-500" : "text-amber-500"}`} />
            <div>
              <span className="text-xs font-bold text-[#102f63]">Báo có mặt buổi học: </span>
              <span className="text-xs text-[#244866]">
                {checkIn.status === "absent" ? "Giáo viên ghi vắng mặt" : checkIn.status === "excused" ? "Giáo viên ghi có phép" : checkIn.reason || "Bạn chưa báo có mặt"}
              </span>
            </div>
          </div>
          {checkIn.canCheckIn && !checkIn.status && (
            <button
              type="button"
              disabled={checkingIn}
              onClick={handleCheckIn}
              className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:scale-95 disabled:opacity-60 transition"
            >
              {checkingIn ? "Đang ghi nhận..." : "Tôi có mặt"}
            </button>
          )}
        </div>
      )}

      {/* Frosted glass sub-navigation tabs */}
      <nav className="flex gap-1.5 overflow-x-auto rounded-2xl border border-white/85 bg-white/80 p-1.5 shadow-2xs backdrop-blur-md" aria-label="Chức năng của buổi học">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = tab.id === "vocabulary" ? sessionVocabs.length
            : tab.id === "formulas" ? sessionFormulas.length
            : tab.id === "tasks" ? tasks.length
            : tab.id === "materials" ? files.length
            : tab.id === "announcements" ? announcements.length
            : tab.id === "results" ? completeTasks.length
            : null;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSearchParams(tab.id === "overview" ? {} : { tab: tab.id })}
              className={tabClass(activeTab === tab.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {count !== null && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-[#487291]"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {resourcesLoading ? <Loading loading text="Đang đồng bộ học liệu của buổi..." fullScreen={false} className="min-h-40 py-10" /> : <>
        {activeTab === "overview" && (
          <StudentOverviewTab
            tasks={tasks}
            completeTasks={completeTasks}
            files={files}
            announcements={announcements}
            basePath={basePath}
            setSearchParams={setSearchParams}
          />
        )}
        {activeTab === "vocabulary" && (
          <SessionVocabularyTab
            session={session}
            vocabularies={sessionVocabs}
            onStartPractice={() => setShowVocabPractice(true)}
            onToggleStar={isTeacher ? null : async (wordId) => {
              try {
                const response = await toggleVocabularyStar(wordId);
                const isStarred = Boolean(response?.data?.isStarred);
                setCurrentVocabSession((current) => current ? {
                  ...current,
                  vocabularies: current.vocabularies.map((word) => (
                    String(word.id) === String(wordId) ? { ...word, isStarred } : word
                  )),
                } : current);
              } catch (requestError) {
                toast.error(requestError.message || "Không thể cập nhật từ đã đánh dấu.");
              }
            }}
          />
        )}
        {activeTab === "formulas" && (
          <SessionFormulaTab
            session={session}
            formulas={sessionFormulas}
            onToggleStar={isTeacher ? null : async (formulaId) => {
              try {
                const response = await toggleFormulaStarApi(formulaId);
                const isStarred = Boolean(response?.data?.isStarred);
                setCurrentFormulaSession((current) => current ? {
                  ...current,
                  formulas: current.formulas.map((formula) => (
                    String(formula.id) === String(formulaId) ? { ...formula, isStarred } : formula
                  )),
                } : current);
              } catch (requestError) {
                toast.error(requestError.message || "Không thể cập nhật công thức đã lưu.");
              }
            }}
          />
        )}
        {activeTab === "tasks" && <SessionTaskList tasks={tasks} basePath={basePath} />}
        {activeTab === "materials" && <SessionFileList files={files} />}
        {activeTab === "announcements" && <SessionAnnouncementList announcements={announcements} />}
        {activeTab === "results" && <SessionResults tasks={completeTasks} basePath={basePath} />}
      </>}

      <VocabularyPracticeModal
        isOpen={showVocabPractice}
        onClose={() => setShowVocabPractice(false)}
        session={currentVocabSession}
        onComplete={async (results) => {
          if (!currentVocabSession || isTeacher) return;
          try {
            await submitVocabularyPractice(currentVocabSession.sessionId, results);
            await loadVocabulary({ silent: true });
          } catch (requestError) {
            toast.error(requestError.message || "Không thể lưu kết quả luyện tập.");
          }
        }}
      />
    </div>
  );
}

function StudentOverviewTab({
  tasks,
  completeTasks,
  files,
  announcements,
  basePath,
  setSearchParams,
}) {
  const isAllComplete = completeTasks.length === tasks.length && tasks.length > 0;
  const progressPct = tasks.length > 0 ? Math.round((completeTasks.length / tasks.length) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Main content grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column (2 cols): Progress + Tasks */}
        <div className="space-y-5 lg:col-span-2">
          {/* Progress Banner */}
          <div className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-sky-700">Tiến độ bài học</span>
                <h2 className="mt-0.5 text-base font-extrabold text-[#102f63]">
                  {isAllComplete
                    ? "🎉 Xuất sắc! Bạn đã hoàn thành tất cả nhiệm vụ buổi này!"
                    : tasks.length === 0
                    ? "Buổi học hiện chưa có bài tập hoặc quiz nào"
                    : `Bạn còn ${tasks.length - completeTasks.length} nhiệm vụ cần hoàn thành`}
                </h2>
              </div>
              <span className="text-2xl font-black text-[#102f63]">{progressPct}%</span>
            </div>
            <div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#17365f] via-[#102f63] to-sky-600 transition-all duration-500 shadow-2xs"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Tasks List Card */}
          <div className="rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between border-b border-sky-100/70 pb-3">
              <div>
                <h2 className="text-base font-black text-[#102f63]">Bài tập & Quiz cần làm</h2>
                <p className="text-xs text-[#487291]">Các hoạt động học tập được giao trong buổi này</p>
              </div>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "tasks" })}
                className="text-xs font-bold text-sky-700 hover:text-blue-800 transition"
              >
                Xem tất cả ({tasks.length}) →
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="py-6 text-center text-xs font-medium text-[#487291]">
                Chưa có bài tập hoặc quiz nào trong buổi này.
              </p>
            ) : (
              <div className="mt-3.5 space-y-2.5">
                {tasks.slice(0, 4).map((task) => {
                  const isHomeworkQuiz = task.type === "quiz" && (task.activity_scope || task.activityScope) === "homework";
                  const submittedLate = task.status === "late" && Boolean(task.submission_id || task.submitted_at);
                  const isDone = task.status === "graded" || task.status === "submitted" || submittedLate;
                  return (
                    <Link
                      key={`${task.type}-${task.id}`}
                      to={taskHref(basePath, task)}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-sky-100/70 bg-white/70 p-4 transition-all hover:border-sky-300 hover:bg-white hover:shadow-md sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            task.type === "quiz"
                              ? isHomeworkQuiz
                                ? "bg-amber-50 text-amber-700 border border-amber-200/80"
                                : "bg-violet-50 text-violet-700 border border-violet-200/80"
                              : "bg-sky-50 text-sky-700 border border-sky-200/80"
                          }`}>
                            {isHomeworkQuiz ? "QUIZ VỀ NHÀ" : task.type === "quiz" ? "QUIZ BUỔI HỌC" : "BÀI TẬP"}
                          </span>
                          <h3 className="truncate text-xs sm:text-sm font-bold text-[#102f63]">{task.title}</h3>
                        </div>
                        <p className="mt-1 text-[11px] text-[#487291]">
                          {task.due_date ? `Hạn nộp: ${formatDateTime(task.due_date)}` : "Chưa có hạn nộp cụ thể"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                        isDone
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-2xs"
                          : "bg-[#102f63] text-white hover:bg-blue-800 shadow-xs"
                      }`}>
                        {task.status === "graded"
                          ? "Đã có điểm"
                          : submittedLate
                            ? "Đã nộp trễ"
                            : task.status === "submitted"
                              ? "Đã nộp"
                              : task.status === "late"
                                ? "Quá hạn"
                                : "Làm bài"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column (1 col): Materials + Announcements */}
        <div className="space-y-5">
          {/* Card: Tài liệu */}
          <div className="rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between border-b border-sky-100/70 pb-3">
              <h2 className="text-sm font-black text-[#102f63]">Tài liệu học tập ({files.length})</h2>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "materials" })}
                className="text-xs font-bold text-sky-700 hover:text-blue-800 transition"
              >
                Xem tất cả →
              </button>
            </div>
            {files.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#487291]">Chưa có tài liệu nào cho buổi học này.</p>
            ) : (
              <div className="mt-3.5 space-y-2">
                {files.slice(0, 3).map((file) => {
                  const k = kindForFile(file.mimeType || file.mime_type, file.name);
                  const cfg = kindConfig[k] || kindConfig.other;
                  const Icon = cfg.icon;
                  return (
                    <div key={file.instanceId || file.id} className="flex items-center justify-between gap-2 rounded-xl border border-sky-100/70 bg-white/70 p-2.5 transition hover:bg-white">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold ${cfg.badge}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#102f63]">{file.name}</p>
                          <p className="text-[10px] text-[#487291]">{formatBytes(file.sizeBytes ?? file.size_bytes)}</p>
                        </div>
                      </div>
                      {(file.viewUrl || file.downloadUrl || file.file_url) && (
                        <a
                          href={file.downloadUrl || file.viewUrl || file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          download={Boolean(file.downloadUrl)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-blue-700 transition"
                          title="Tải về"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card: Thông báo */}
          <div className="rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between border-b border-sky-100/70 pb-3">
              <h2 className="text-sm font-black text-[#102f63]">Thông báo ({announcements.length})</h2>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "announcements" })}
                className="text-xs font-bold text-sky-700 hover:text-blue-800 transition"
              >
                Xem tất cả →
              </button>
            </div>
            {announcements.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#487291]">Chưa có thông báo nào trong buổi này.</p>
            ) : (
              <div className="mt-3.5 space-y-2.5">
                {announcements.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl border border-sky-100/70 bg-white/70 p-3 transition hover:bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-xs font-bold text-[#102f63]">{item.title}</h3>
                      <span className="shrink-0 text-[10px] text-[#487291]">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString("vi-VN") : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[#244866]">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

function SessionTaskList({ tasks, basePath }) {
  if (!tasks.length) return <EmptyState icon={ClipboardList} title="Chưa có bài tập hoặc Quiz" description="Bài tập và Quiz giáo viên giao cho buổi này sẽ xuất hiện tại đây." />;
  return (
    <section className="space-y-3">
      {tasks.map((task) => {
        const isHomeworkQuiz = task.type === "quiz" && (task.activity_scope || task.activityScope) === "homework";
        return (
          <Link
            key={`${task.type}-${task.id}`}
            to={taskHref(basePath, task)}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md transition hover:shadow-lg hover:border-sky-300"
          >
            <div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                task.type === "quiz"
                  ? isHomeworkQuiz
                    ? "bg-amber-50 text-amber-700 border border-amber-200/80"
                    : "bg-violet-50 text-violet-700 border border-violet-200/80"
                  : "bg-sky-50 text-sky-700 border border-sky-200/80"
              }`}>
                {isHomeworkQuiz ? "QUIZ VỀ NHÀ" : task.type === "quiz" ? "QUIZ TRONG BUỔI" : "BÀI TẬP VỀ NHÀ"}
              </span>
              <h2 className="mt-2 text-sm sm:text-base font-black text-[#102f63]">{task.title}</h2>
              <p className="mt-1 text-xs text-[#487291]">
                {task.type === "quiz" && !isHomeworkQuiz ? "Làm trực tuyến và chấm điểm tự động trong buổi học" : `Hạn nộp: ${task.due_date ? formatDateTime(task.due_date) : "Giáo viên sẽ thông báo"}`}
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-[#102f63] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800 transition">
              {task.status === "graded" ? "Xem kết quả" : task.status === "submitted" ? "Đã nộp" : "Mở bài"}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

function SessionFileList({ files }) {
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");

  const filteredFiles = files.filter((file) => {
    if (selectedKind !== "all") {
      const k = kindForFile(file.mimeType || file.mime_type, file.name);
      if (k !== selectedKind) return false;
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const n = (file.name || "").toLowerCase();
      const s = (file.sessionTitle || "").toLowerCase();
      if (!n.includes(q) && !s.includes(q)) return false;
    }
    return true;
  });

  if (!files.length) {
    return (
      <EmptyState
        icon={FileText}
        title="Chưa có tài liệu cho buổi học này"
        description="Slide bài giảng, đề ôn tập và tài liệu học tập của buổi học sẽ hiển thị tại đây khi giáo viên tải lên."
      />
    );
  }

  return (
    <section className="space-y-4">
      {/* Header banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#17365f] to-[#102f63] text-white shadow-md shadow-blue-950/20">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-[#102f63]">
                Tài liệu & Học liệu đính kèm
              </h2>
              <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-black text-sky-700 ring-1 ring-sky-200">
                {files.length} tệp
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#487291]">
              Bấm vào tên tài liệu để mở xem; nút tải chỉ hiện khi lớp cho phép.
            </p>
          </div>
        </div>

        {/* Filters if files >= 3 */}
        {files.length >= 3 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm tài liệu..."
                className="w-full rounded-xl border border-sky-100 bg-white/90 py-1.5 pl-8 pr-3 text-xs text-[#102f63] outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter pills if >= 3 files */}
      {files.length >= 3 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            ["all", "Tất cả"],
            ["pdf", "PDF"],
            ["doc", "Word"],
            ["sheet", "Excel"],
            ["slide", "Slide"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedKind(k)}
              className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                selectedKind === k
                  ? "bg-[#102f63] text-white shadow-xs"
                  : "bg-white/80 text-[#244866] hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Grid of File Cards */}
      {filteredFiles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sky-200 bg-white/60 p-8 text-center text-xs text-[#487291]">
          Không tìm thấy tài liệu phù hợp với tìm kiếm.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredFiles.map((file) => {
            const kind = kindForFile(file.mimeType || file.mime_type, file.name);
            const kindInfo = kindConfig[kind] || kindConfig.other;
            const IconComponent = kindInfo.icon;
            const downloadUrl = file.downloadUrl || file.download_url;
            const viewUrl = file.viewUrl || file.view_url || downloadUrl;
            const canDownload = file.canDownload !== false && Boolean(downloadUrl);

            return (
              <div
                key={file.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_8px_24px_rgba(49,91,125,0.06)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start gap-3.5">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-xs transition-transform duration-200 group-hover:scale-105 ${kindInfo.badge}`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${kindInfo.pill}`}>
                        {kindInfo.label}
                      </span>
                      {(file.sizeBytes || file.size_bytes) ? (
                        <span className="font-semibold text-[#487291]">
                          {formatBytes(file.sizeBytes || file.size_bytes)}
                        </span>
                      ) : null}
                      {file.uploadedAt && (
                        <span className="text-[#487291]">
                          • {new Date(file.uploadedAt).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-[#102f63] line-clamp-2 leading-snug group-hover:text-blue-700 transition-colors" title={file.name}>
                      {viewUrl ? (
                        <a href={viewUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          {file.name}
                        </a>
                      ) : (
                        file.name
                      )}
                    </h3>

                    <p className="text-[11px] text-[#487291]">
                      {file.uploadedBy ? `Đăng bởi: ${file.uploadedBy}` : (file.sessionTitle || "Tài liệu học tập")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-sky-100/70 pt-3">
                  <span className="text-[11px] text-[#487291] font-medium truncate max-w-[150px] sm:max-w-[200px]">
                    {file.sessionTitle || "Buổi học này"}
                  </span>

                  <div className="flex items-center gap-2">
                    {canDownload ? (
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#102f63] text-white hover:bg-blue-800 px-3.5 py-1.5 text-xs font-bold shadow-xs transition active:scale-95"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Tải tài liệu</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-700">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Chỉ xem</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SessionAnnouncementList({ announcements }) {
  if (!announcements.length) return <EmptyState icon={Bell} title="Chưa có thông báo" description="Thông báo của giáo viên về đúng buổi học này sẽ xuất hiện ở đây." />;
  return (
    <section className="space-y-3">
      {announcements.map((announcement) => (
        <article key={announcement.id} className="rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-black text-[#102f63]">{announcement.title}</h2>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700">
              {announcement.sentAt ? new Date(announcement.sentAt).toLocaleString("vi-VN") : "Đã gửi"}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#244866]">{announcement.message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {announcement.linkUrl && <a href={announcement.linkUrl} className="text-xs font-black text-sky-700 hover:underline">Mở liên kết</a>}
            {announcement.attachmentUrl && <a href={announcement.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-sky-700 hover:underline">Tải tài liệu đính kèm</a>}
          </div>
        </article>
      ))}
    </section>
  );
}

function SessionResults({ tasks, basePath }) {
  if (!tasks.length) return <EmptyState icon={Trophy} title="Chưa có kết quả" description="Kết quả của Quiz và bài tập sau khi nộp sẽ hiển thị tại đây." />;
  return (
    <section className="space-y-3">
      {tasks.map((task) => (
        <Link
          key={`${task.type}-${task.id}`}
          to={taskHref(basePath, task)}
          className="flex items-center justify-between rounded-3xl border border-white/85 bg-white/90 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md transition hover:shadow-lg"
        >
          <div>
            <h2 className="text-sm font-black text-[#102f63]">{task.title}</h2>
            <p className="mt-1 text-xs text-[#487291]">
              {task.status === "graded" ? "Đã chấm điểm" : "Đã nộp, đang chờ chấm"}
            </p>
          </div>
          <span className="text-base font-black text-emerald-600">
            {task.score !== null && task.score !== undefined ? `${task.score}/${task.max_score || 10}` : "—"}
          </span>
        </Link>
      ))}
    </section>
  );
}
