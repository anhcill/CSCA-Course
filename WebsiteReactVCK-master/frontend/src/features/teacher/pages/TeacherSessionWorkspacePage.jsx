import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, Bell, BookOpen, Binary, CalendarDays, CheckCircle2, ClipboardList, Clock,
  Download, FileSpreadsheet, FileText, Files, FolderOpen, GraduationCap, Languages, Library, Link2, Play, Search, Trash2, Trophy, UploadCloud, Users, Video, X,
} from "lucide-react";
import {
  attachTeacherFile, batchImportSessionVocabulary, createClassAnnouncement, createSessionVocabulary, deleteClassFile,
  detachTeacherFile,
  deleteSessionVocabulary, fetchClassAnnouncements, fetchClassDetails, fetchClassFiles,
  fetchLiveClassSessions, fetchReusableTeacherFiles, fetchSessionFormulas, fetchSessionVocabulary, getLiveSessionAccess, suggestSessionVocabulary,
  updateSessionVocabulary, uploadClassFile, createSessionFormulaApi, deleteFormulaApi,
} from "../../api/lmsClient";
import Loading from "../../../components/Loading.jsx";
import { EmptyState, ErrorState } from "../../../components/common/StateView";
import CreateAssignmentModal from "../components/CreateAssignmentModal";
import FileUploadProgressBox from "../../../components/common/FileUploadProgressBox.jsx";
import { closeReservedMeeting, getMeetingWindowState, openReservedMeeting, reserveMeetingWindow } from "../../liveClass/utils/meetingLaunch";
import { classCalendarIcsUrl, googleCalendarEventUrl } from "../../calendar/calendarLinks";
import TeacherSessionVocabularyTab from "../components/TeacherSessionVocabularyTab";
import TeacherSessionFormulaTab from "../components/TeacherSessionFormulaTab";

const tabs = [
  { id: "overview", label: "Tổng quan", icon: CalendarDays },
  { id: "students", label: "Học viên", icon: Users },
  { id: "content", label: "Nội dung", icon: BookOpen },
  { id: "vocabulary", label: "Từ vựng", icon: Languages },
  { id: "formulas", label: "Công thức", icon: Binary },
  { id: "tasks", label: "Bài tập & Quiz", icon: ClipboardList },
  { id: "files", label: "Tài liệu", icon: FileText },
  { id: "announcements", label: "Thông báo", icon: Bell },
  { id: "results", label: "Bảng điểm", icon: Trophy },
];

const formatDateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", {
  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
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
  pdf: { label: "PDF", icon: FileText, badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50" },
  doc: { label: "Word", icon: FileText, badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-sky-400 dark:border-blue-900/50" },
  sheet: { label: "Excel", icon: FileSpreadsheet, badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50" },
  slide: { label: "Slide", icon: FileText, badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50" },
  image: { label: "Ảnh", icon: Files, badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50" },
  other: { label: "Tài liệu", icon: Files, badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900/50" },
};

export default function TeacherSessionWorkspacePage() {
  const { classId, sessionId } = useParams();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith("/admin/classes/");
  const classBasePath = isAdminView
    ? `/admin/classes/${classId}` : `/lms/teach/classes/${classId}`;
  const assessmentBasePath = isAdminView ? "/admin" : "/lms/teacher";
  const gradingPath = isAdminView ? "/admin/assignments/review" : "/lms/teacher/assignments/review";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabs.some((tab) => tab.id === searchParams.get("tab")) ? searchParams.get("tab") : "overview";
  const [classData, setClassData] = useState(null);
  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCreateHomeworkOpen, setIsCreateHomeworkOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [isReuseOpen, setIsReuseOpen] = useState(false);
  const [reusableFiles, setReusableFiles] = useState([]);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [reuseSearch, setReuseSearch] = useState("");
  const [attachingFileId, setAttachingFileId] = useState(null);
  const [currentVocabSession, setCurrentVocabSession] = useState(null);
  const [currentFormulaSession, setCurrentFormulaSession] = useState(null);

  const sessionVocabs = currentVocabSession?.vocabularies || [];
  const sessionFormulas = currentFormulaSession?.formulas || [];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [detailResponse, sessionsResponse] = await Promise.all([
        fetchClassDetails(classId),
        fetchLiveClassSessions(classId),
      ]);
      const foundSession = sessionsResponse?.success && Array.isArray(sessionsResponse.data)
        ? sessionsResponse.data.find((item) => String(item.id) === String(sessionId))
        : null;
      if (!detailResponse?.data || !foundSession) throw new Error("Không tìm thấy không gian buổi học.");

      const [filesResult, announcementsResult, vocabularyResult, formulaResult] = await Promise.allSettled([
        fetchClassFiles(classId, { sessionId }),
        fetchClassAnnouncements({ classId, sessionId }),
        fetchSessionVocabulary(sessionId),
        fetchSessionFormulas(sessionId),
      ]);
      const filesResponse = filesResult.status === "fulfilled" ? filesResult.value : null;
      const announcementsResponse = announcementsResult.status === "fulfilled" ? announcementsResult.value : null;
      const vocabularyResponse = vocabularyResult.status === "fulfilled" ? vocabularyResult.value : null;
      const formulaResponse = formulaResult.status === "fulfilled" ? formulaResult.value : null;

      setClassData(detailResponse.data);
      setSession(foundSession);
      setFiles(Array.isArray(filesResponse?.data) ? filesResponse.data : []);
      setAnnouncements(Array.isArray(announcementsResponse?.data) ? announcementsResponse.data : []);
      setCurrentVocabSession(vocabularyResponse?.data?.session ? {
        ...vocabularyResponse.data.session,
        vocabularies: vocabularyResponse.data.vocabularies || [],
      } : null);
      setCurrentFormulaSession(formulaResponse?.data?.session ? {
        ...formulaResponse.data.session,
        formulas: formulaResponse.data.formulas || [],
      } : null);
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
      openReservedMeeting(meetingWindow, result.data.meetUrl, {
        sessionId: session.id,
        provider: result.data.provider,
        navigate,
      });
      toast.success(`Đang mở phòng dạy ${result.data.provider || "trực tuyến"}...`);
    } catch (requestError) {
      closeReservedMeeting(meetingWindow);
      toast.error(requestError.message || "Không thể mở phòng dạy.");
    }
  };

  const executeUploadFile = async (file) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setUploadFile(file);
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Kích thước tệp vượt quá giới hạn",
        errorMessage: "Kích thước tài liệu không được vượt quá 100MB theo quy định.",
      });
      return;
    }

    setUploadFile(file);
    setIsUploading(true);
    setUploadProgress({
      status: "uploading",
      percent: 5,
      stage: "init",
      message: "Đang khởi tạo liên kết tải lên an toàn...",
      loaded: 0,
      total: file.size,
      errorMessage: "",
    });

    try {
      await uploadClassFile(classId, file, {
        sessionId,
        onProgress: (p) => {
          setUploadProgress((curr) => ({
            ...curr,
            status: p.stage === "done" ? "success" : "uploading",
            percent: p.percent,
            stage: p.stage,
            message: p.message,
            loaded: p.loaded ?? curr?.loaded ?? 0,
            total: p.total ?? file.size,
          }));
        },
      });

      setUploadProgress({
        status: "success",
        percent: 100,
        stage: "done",
        message: `Đã thêm "${file.name}" vào buổi học thành công!`,
        loaded: file.size,
        total: file.size,
      });
      toast.success(`Đã thêm "${file.name}" vào buổi học.`);
      await loadData();

      setTimeout(() => {
        setUploadProgress(null);
        setUploadFile(null);
      }, 1500);
    } catch (requestError) {
      const errText = requestError.message || "Không thể tải tài liệu. Vui lòng thử lại.";
      setUploadProgress({
        status: "error",
        percent: 0,
        stage: "error",
        message: "Đã xảy ra lỗi khi tải tài liệu",
        errorMessage: errText,
        loaded: 0,
        total: file.size,
      });
      toast.error(errText);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) executeUploadFile(file);
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm("Xóa tài liệu khỏi buổi học này?")) return;
    try {
      if (file.placementId) await detachTeacherFile(file.placementId);
      else await deleteClassFile(file.id);
      setFiles((current) => current.filter((item) => item.instanceId !== file.instanceId));
      toast.success(file.placementId ? "Đã gỡ tài liệu khỏi buổi học." : "Đã xóa tài liệu.");
    } catch (requestError) {
      toast.error(requestError.message || "Không thể xóa tài liệu.");
    }
  };

  const loadReusableFiles = useCallback(async (search = "") => {
    setReuseLoading(true);
    try {
      const response = await fetchReusableTeacherFiles({ classId, sessionId, search });
      setReusableFiles(Array.isArray(response?.data) ? response.data : []);
    } catch (requestError) {
      setReusableFiles([]);
      toast.error(requestError.message || "Không thể tải kho tài liệu dùng lại.");
    } finally {
      setReuseLoading(false);
    }
  }, [classId, sessionId]);

  const openReuseLibrary = async () => {
    setReuseSearch("");
    setIsReuseOpen(true);
    await loadReusableFiles();
  };

  const handleAttachReusableFile = async (file) => {
    setAttachingFileId(file.id);
    try {
      await attachTeacherFile(file.id, { classId, sessionId });
      toast.success(`Đã dùng lại "${file.name}" trong buổi học này.`);
      await Promise.all([loadData(), loadReusableFiles(reuseSearch)]);
    } catch (requestError) {
      toast.error(requestError.message || "Không thể dùng lại tài liệu này.");
    } finally {
      setAttachingFileId(null);
    }
  };

  const handleCreateAnnouncement = async (values) => {
    try {
      await createClassAnnouncement({ classId, sessionId, ...values });
      toast.success(values.scheduledAt ? "Đã lên lịch gửi thông báo." : "Đã gửi thông báo cho học viên.");
      await loadData();
    } catch (requestError) {
      toast.error(requestError.message || "Không thể gửi thông báo.");
      throw requestError;
    }
  };

  const tasks = useMemo(() => (classData?.assignments || []).filter((task) => String(task.sessionId || task.class_session_id || "") === String(sessionId)), [classData?.assignments, sessionId]);
  const students = classData?.students || [];

  if (loading) return <Loading loading text="Đang mở không gian buổi dạy..." fullScreen={false} className="min-h-[55vh] py-16" />;
  if (error || !session || !classData) return <div className="mx-auto max-w-xl py-12"><ErrorState title="Chưa thể mở buổi dạy" message={error} onRetry={loadData} /></div>;

  const classInfo = classData.classInfo || {};
  const meetingWindow = getMeetingWindowState(session);
  const canJoin = isAdminView || meetingWindow.isOpen;
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 transition-colors duration-200">
      <Link
        to={classBasePath}
        className="inline-flex items-center gap-2 rounded-xl border border-white/85 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-[#17365f] shadow-2xs backdrop-blur-md transition hover:bg-white hover:text-blue-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Quay lại lớp và lịch dạy
      </Link>

      {/* Hero Banner: Oriental Scholar Glassmorphic Theme (Matching SessionDetailPage) */}
      <section className="relative overflow-hidden rounded-3xl border border-white/85 bg-white/90 p-5 sm:p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-md transition">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/40 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200/80 px-3 py-1 text-xs font-bold text-sky-700 shadow-2xs">
                <Video className="h-3.5 w-3.5 text-sky-600" /> Không gian buổi dạy
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-bold text-emerald-700 shadow-2xs">
                Lớp: {classInfo.title || "Lớp học"}
              </span>
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
            {canJoin ? (
              <button
                type="button"
                onClick={handleJoin}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:brightness-105 active:scale-95 animate-pulse"
              >
                <Play className="h-4 w-4 fill-current" /> {isAdminView ? "Mở link phòng học" : "Vào phòng dạy"}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#487291] shadow-2xs">
                {meetingWindow.isClosed ? "Phòng đã đóng sau giờ học" : "Phòng mở trước giờ dạy 15 phút"}
              </span>
            )}

            <a
              href={googleCalendarEventUrl({ title: session.title, startTime: session.start_time, endTime: session.end_time, details: "Buổi dạy CSCA Academy" })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#17365f] shadow-2xs transition hover:bg-white hover:text-blue-700"
            >
              <CalendarDays className="h-3.5 w-3.5 text-blue-600" /> Google Calendar
            </a>
            <a
              href={classCalendarIcsUrl(classId)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#17365f] shadow-2xs transition hover:bg-white hover:text-blue-700"
            >
              <FileText className="h-3.5 w-3.5 text-blue-600" /> Tải .ics
            </a>
            <button
              type="button"
              onClick={() => navigate(`${classBasePath}/attendance?sessionId=${sessionId}`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/90 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#17365f] shadow-2xs transition hover:bg-white hover:text-blue-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Điểm danh
            </button>
          </div>
        </div>
      </section>

      {/* Frosted sub-navigation tabs (Matching SessionDetailPage) */}
      <nav className="flex gap-1.5 overflow-x-auto rounded-2xl border border-white/85 bg-white/80 p-1.5 shadow-2xs backdrop-blur-md" aria-label="Chức năng của buổi dạy">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = tab.id === "vocabulary" ? sessionVocabs.length
            : tab.id === "formulas" ? sessionFormulas.length
            : tab.id === "tasks" ? tasks.length
            : tab.id === "files" ? files.length
            : tab.id === "students" ? students.length
            : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSearchParams(tab.id === "overview" ? {} : { tab: tab.id })}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-[#102f63] text-white shadow-md shadow-[#102f63]/25 ring-1 ring-[#102f63]/20"
                  : "text-[#244866] hover:bg-white/90 hover:text-[#102f63]"
              }`}
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

      <div className="space-y-4">
        {activeTab === "overview" && (
          <TeacherOverviewTab
            session={session}
            tasks={tasks}
            files={files}
            announcements={announcements}
            classId={classId}
            sessionId={sessionId}
            classBasePath={classBasePath}
            gradingPath={gradingPath}
            setSearchParams={setSearchParams}
            navigate={navigate}
            setIsCreateHomeworkOpen={setIsCreateHomeworkOpen}
          />
        )}
        {activeTab === "students" && (
          <section className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-base font-black text-[#102f63] dark:text-white flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  Học Viên Ghi Danh Của Buổi Học ({students.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Điểm danh và theo dõi chuyên cần theo đúng buổi học này.</p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`${classBasePath}/attendance?sessionId=${sessionId}`)}
                className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700"
              >
                Mở sổ điểm danh
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/85 p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <span className="text-xs font-bold text-[#102f63] dark:text-white">{student.name || student.email}</span>
                  <span className="text-[11px] font-mono text-slate-400">{student.email}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {activeTab === "content" && (
          <section className="rounded-3xl border border-white/80 bg-white/92 p-6 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300 shadow-2xs">
                <BookOpen className="h-4 w-4" />
              </span>
              <h2 className="text-base font-black text-[#102f63] dark:text-white">Nội Dung Giảng Dạy Buổi Này</h2>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {session.description || "Chuẩn bị nội dung, slide và hoạt động học tập cho buổi này tại đây."}
            </p>
            <div className="pt-2">
              <Link
                to={`${classBasePath}/curriculum`}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
              >
                <BookOpen className="h-4 w-4" /> Xem chi tiết giáo trình khóa học
              </Link>
            </div>
          </section>
        )}
        {activeTab === "vocabulary" && (
          <TeacherSessionVocabularyTab
            session={session}
            vocabularies={sessionVocabs}
            onAddWord={async (word) => {
              const response = await createSessionVocabulary(sessionId, word);
              setCurrentVocabSession((current) => ({
                ...(current || {}),
                vocabularies: [response.data, ...(current?.vocabularies || [])],
              }));
              return response.data;
            }}
            onUpdateWord={async (wordId, word) => {
              const response = await updateSessionVocabulary(wordId, word);
              setCurrentVocabSession((current) => current ? {
                ...current,
                vocabularies: current.vocabularies.map((item) => (
                  String(item.id) === String(wordId) ? response.data : item
                )),
              } : current);
              return response.data;
            }}
            onDeleteWord={async (wordId) => {
              await deleteSessionVocabulary(wordId);
              setCurrentVocabSession((current) => current ? {
                ...current,
                vocabularies: current.vocabularies.filter((word) => String(word.id) !== String(wordId)),
              } : current);
            }}
            onBatchImport={async (words) => {
              const response = await batchImportSessionVocabulary(sessionId, words);
              setCurrentVocabSession((current) => ({
                ...(current || {}),
                vocabularies: [...(response.data?.vocabularies || []), ...(current?.vocabularies || [])],
              }));
              return response.data;
            }}
            onSuggestVocabulary={(options) => suggestSessionVocabulary(sessionId, options)}
          />
        )}
        {activeTab === "formulas" && (
          <TeacherSessionFormulaTab
            session={session}
            formulas={sessionFormulas}
            onAddFormula={async (formula) => {
              const response = await createSessionFormulaApi(sessionId, formula);
              setCurrentFormulaSession((current) => ({
                ...(current || { sessionId: String(sessionId) }),
                formulas: [response.data, ...(current?.formulas || [])],
              }));
              return response.data;
            }}
            onDeleteFormula={async (formulaId) => {
              try {
                await deleteFormulaApi(formulaId);
                setCurrentFormulaSession((current) => current ? {
                  ...current,
                  formulas: current.formulas.filter((formula) => String(formula.id) !== String(formulaId)),
                } : current);
                toast.success("Đã xóa công thức.");
              } catch (requestError) {
                toast.error(requestError.message || "Không thể xóa công thức.");
              }
            }}
          />
        )}
        {activeTab === "tasks" && <TeacherSessionTasks tasks={tasks} classId={classId} sessionId={sessionId} onCreateHomework={() => setIsCreateHomeworkOpen(true)} onCreateSessionQuiz={() => navigate(`${assessmentBasePath}/quizzes?classId=${classId}&sessionId=${sessionId}&scope=session&new=1`)} onOpenGrading={(assignmentId) => navigate(`${gradingPath}?classId=${classId}&sessionId=${sessionId}&assignmentId=${assignmentId}`)} />}
        {activeTab === "files" && (
          <TeacherSessionFiles
            files={files}
            isUploading={isUploading}
            onUpload={handleUpload}
            onReuse={openReuseLibrary}
            onDelete={handleDeleteFile}
            uploadFile={uploadFile}
            uploadProgress={uploadProgress}
            onRetryUpload={() => executeUploadFile(uploadFile)}
            onCancelUpload={() => {
              setUploadProgress(null);
              setUploadFile(null);
            }}
          />
        )}
        {activeTab === "announcements" && <TeacherSessionAnnouncements announcements={announcements} onCreate={handleCreateAnnouncement} />}
        {activeTab === "results" && <TeacherSessionResults tasks={tasks} />}
        {isCreateHomeworkOpen && <CreateAssignmentModal isOpen classId={classId} sessionId={sessionId} sessionTitle={session.title} homeworkOnly onClose={() => setIsCreateHomeworkOpen(false)} onCreated={loadData} />}
        {isReuseOpen && (
          <ReusableFileModal
            files={reusableFiles}
            loading={reuseLoading}
            search={reuseSearch}
            attachingFileId={attachingFileId}
            onSearchChange={setReuseSearch}
            onSearch={() => loadReusableFiles(reuseSearch)}
            onAttach={handleAttachReusableFile}
            onClose={() => setIsReuseOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function TeacherOverviewTab({
  session,
  tasks,
  files,
  announcements,
  classId,
  sessionId,
  gradingPath,
  setSearchParams,
  navigate,
  setIsCreateHomeworkOpen,
}) {
  return (
    <div className="space-y-4">
      {/* 2. Main content grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column (2 cols): Tasks + Content */}
        <div className="space-y-4 lg:col-span-2">
          {/* Card: Bài tập & Quiz của buổi */}
          <div className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-black text-[#102f63] dark:text-white">Bài tập & Quiz của buổi</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Theo dõi nộp bài và chấm điểm của học viên</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateHomeworkOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700"
                >
                  + Giao bài tập
                </button>
                <button
                  type="button"
                  onClick={() => setSearchParams({ tab: "tasks" })}
                  className="text-xs font-bold text-blue-600 hover:underline dark:text-sky-400"
                >
                  Tất cả ({tasks.length}) →
                </button>
              </div>
            </div>

            {tasks.length === 0 ? (
              <p className="py-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                Chưa có bài tập hoặc quiz nào cho buổi học này. Bấm &quot;+ Giao bài tập&quot; để tạo bài mới.
              </p>
            ) : (
              <div className="mt-3.5 space-y-2.5">
                {tasks.slice(0, 4).map((task) => (
                  <article
                    key={`${task.type}-${task.id}`}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-white/80 bg-white/85 p-3.5 shadow-2xs backdrop-blur-md transition hover:bg-white dark:border-slate-800 dark:bg-slate-800/60 dark:hover:bg-slate-800/90 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          task.type === "quiz"
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                        }`}>
                          {task.type === "quiz" ? "QUIZ" : "BÀI TẬP"}
                        </span>
                        <h3 className="truncate text-xs font-bold text-[#102f63] dark:text-white">{task.title}</h3>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Đã nộp: {task.submittedCount || 0}/{task.totalCount || 0}
                        {Number(task.pendingGradingCount) > 0 && (
                          <span className="ml-2 font-bold text-rose-600 dark:text-rose-400">
                            · Cần chấm: {task.pendingGradingCount}
                          </span>
                        )}
                      </p>
                    </div>

                    {task.type === "quiz" ? (
                      <span className="shrink-0 text-xs font-bold text-violet-600 dark:text-violet-400">Tự động chấm</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(`${gradingPath}?classId=${classId}&sessionId=${sessionId}&assignmentId=${task.id}`)}
                        className="shrink-0 rounded-xl border border-emerald-300/80 bg-emerald-50/60 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
                      >
                        Chấm bài
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Card: Nội dung buổi học */}
          <div className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-600 dark:text-sky-400" />
                <h2 className="text-sm font-black text-[#102f63] dark:text-white">Nội dung buổi dạy</h2>
              </div>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "content" })}
                className="text-xs font-bold text-blue-600 hover:underline dark:text-sky-400"
              >
                Chỉnh sửa →
              </button>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {session.description || "Chưa có ghi chú nội dung cho buổi học này. Giáo viên có thể thêm mô tả và tài liệu bài giảng."}
            </p>
          </div>
        </div>

        {/* Right column (1 col): Announcements + Files */}
        <div className="space-y-4">
          {/* Card: Thông báo */}
          <div className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
              <h2 className="text-sm font-black text-[#102f63] dark:text-white">Thông báo ({announcements.length})</h2>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "announcements" })}
                className="text-xs font-bold text-blue-600 hover:underline dark:text-sky-400"
              >
                Gửi mới →
              </button>
            </div>
            {announcements.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">Chưa có thông báo nào trong buổi này.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {announcements.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-xs font-bold text-[#102f63] dark:text-white">{item.title}</h3>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {item.status === "scheduled" ? "Hẹn giờ" : item.created_at ? new Date(item.created_at).toLocaleDateString("vi-VN") : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card: Tài liệu */}
          <div className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
              <h2 className="text-sm font-black text-[#102f63] dark:text-white">Tài liệu học tập ({files.length})</h2>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: "files" })}
                className="text-xs font-bold text-blue-600 hover:underline dark:text-sky-400"
              >
                Tải lên →
              </button>
            </div>
            {files.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">Chưa có tài liệu nào được đính kèm.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {files.slice(0, 3).map((file) => {
                  const k = kindForFile(file.mimeType || file.mime_type, file.name);
                  const cfg = kindConfig[k] || kindConfig.other;
                  const Icon = cfg.icon;
                  return (
                    <div key={file.instanceId || file.id} className="flex items-center justify-between gap-2 rounded-2xl border border-white/80 bg-white/85 p-2.5 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/60">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold ${cfg.badge}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#102f63] dark:text-white">{file.name}</p>
                          <p className="text-[10px] text-slate-400">{formatBytes(file.size_bytes)}</p>
                        </div>
                      </div>
                      {(file.downloadUrl || file.viewUrl || file.file_url) && (
                        <a
                          href={file.downloadUrl || file.viewUrl || file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          title="Tải về"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeacherSessionTasks({ tasks, onCreateHomework, onCreateSessionQuiz, onOpenGrading }) {
  const inSessionQuizzes = tasks.filter((task) => task.type === "quiz" && task.activityScope !== "homework");
  const homeworks = tasks.filter((task) => task.type !== "quiz" || task.activityScope === "homework");
  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-purple-50/40 to-white/95 p-5 shadow-[0_12px_35px_rgba(109,40,217,0.06)] backdrop-blur-xl dark:border-violet-900/60 dark:bg-violet-950/20 sm:p-6">
          <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-black text-white shadow-2xs">TRONG BUỔI HỌC</span>
          <h2 className="mt-3 text-base font-black text-[#102f63] dark:text-white">Quiz trắc nghiệm tại lớp</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Học viên làm ngay trong không gian buổi học. Hệ thống chấm tự động.</p>
          <button type="button" onClick={onCreateSessionQuiz} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-500/20 transition hover:bg-violet-500">Tạo Quiz buổi học</button>
        </article>
        <article className="rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white/95 p-5 shadow-[0_12px_35px_rgba(5,150,105,0.06)] backdrop-blur-xl dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:p-6">
          <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white shadow-2xs">BÀI TẬP VỀ NHÀ</span>
          <h2 className="mt-3 text-base font-black text-[#102f63] dark:text-white">Giao file tự luận hoặc Quiz về nhà</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Có hạn nộp; bài file đi vào Cổng chấm tổng, Quiz được chấm tự động.</p>
          <button type="button" onClick={onCreateHomework} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-500">Giao bài tập về nhà</button>
        </article>
      </div>
      <TaskGroup title="Quiz làm trong buổi" tasks={inSessionQuizzes} empty="Chưa có Quiz cho buổi học này." />
      <TaskGroup title="Bài tập về nhà của buổi" tasks={homeworks} empty="Chưa giao bài tập về nhà." onOpenGrading={onOpenGrading} />
    </section>
  );
}

function TaskGroup({ title, tasks, empty, onOpenGrading }) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <h2 className="text-base font-black text-[#102f63] dark:text-white">{title}</h2>
        <span className="rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{tasks.length}</span>
      </div>
      {tasks.length ? (
        <div className="space-y-2.5">
          {tasks.map((task) => (
            <article key={`${task.type}-${task.id}`} className="flex flex-col justify-between gap-3 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/60 sm:flex-row sm:items-center">
              <div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${task.type === "quiz" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"}`}>
                  {task.type === "quiz" ? "QUIZ TỰ CHẤM" : "NỘP FILE / TỰ LUẬN"}
                </span>
                <h3 className="mt-2 text-sm font-black text-[#102f63] dark:text-white">{task.title}</h3>
                <p className="mt-1 text-xs text-slate-500">Đã nộp: {task.submittedCount || 0}/{task.totalCount || 0}{task.pendingGradingCount ? ` · Cần chấm: ${task.pendingGradingCount}` : ""}</p>
              </div>
              {task.type === "quiz" ? (
                <span className="text-xs font-bold text-violet-700 dark:text-violet-300">Chấm tự động</span>
              ) : (
                <button type="button" onClick={() => onOpenGrading?.(task.id)} className="rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-2xs transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">
                  Mở Cổng chấm
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="py-5 text-center text-xs text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function TeacherSessionFiles({
  files,
  isUploading,
  onUpload,
  onReuse,
  onDelete,
  uploadFile,
  uploadProgress,
  onRetryUpload,
  onCancelUpload,
}) {
  return (
    <section className="space-y-4">
      {/* Header banner with frosted glass */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800/50 shadow-2xs">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-[#102f63] dark:text-white">
              Tài liệu học tập của buổi
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Tài liệu tải lên sẽ hiển thị ngay cho học viên trong buổi học này ({files.length} tệp).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReuse}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-600 hover:text-white"
          >
            <Library className="h-4 w-4" />
            Chọn từ kho
          </button>
          <label className={`inline-flex shrink-0 items-center justify-center gap-2 cursor-pointer rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition active:scale-95 ${isUploading ? "pointer-events-none opacity-50" : ""}`}>
            <UploadCloud className="h-4 w-4" />
            <span>{isUploading ? "Đang tải lên..." : "Tải tài liệu mới"}</span>
            <input type="file" className="hidden" disabled={isUploading} onChange={onUpload} />
          </label>
        </div>
      </div>

      {/* Ô thông báo tiến độ & cảnh báo lỗi chi tiết */}
      {uploadProgress && (
        <FileUploadProgressBox
          file={uploadFile}
          progress={uploadProgress}
          onRetry={onRetryUpload}
          onCancel={onCancelUpload}
        />
      )}

      {files.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map((file) => {
            const kind = kindForFile(file.mimeType || file.mime_type, file.name);
            const kindInfo = kindConfig[kind] || kindConfig.other;
            const IconComponent = kindInfo.icon;
            const downloadUrl = file.downloadUrl || file.download_url;

            return (
              <article
                key={file.instanceId || file.id}
                className="group relative flex flex-col justify-between gap-3 rounded-2xl border border-white/80 bg-white/88 p-4.5 shadow-2xs backdrop-blur-md transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700/60"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${kindInfo.badge}`}>
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3
                      className="truncate text-sm font-bold text-[#102f63] dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition"
                      title={file.name}
                    >
                      {file.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-300">
                        {kindInfo.label}
                      </span>
                      {(file.sizeBytes || file.size_bytes) && (
                        <span>{formatBytes(file.sizeBytes || file.size_bytes)}</span>
                      )}
                      {file.uploadedAt && (
                        <span>• {new Date(file.uploadedAt).toLocaleDateString("vi-VN")}</span>
                      )}
                      {file.isReused && (
                        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          Dùng lại từ kho
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  {downloadUrl ? (
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-600 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Mở / Tải file</span>
                    </a>
                  ) : <span />}

                  <button
                    type="button"
                    onClick={() => onDelete(file)}
                    className="inline-flex items-center gap-1 rounded-xl p-1.5 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition"
                    title="Xóa tài liệu khỏi buổi học"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-[11px]">{file.placementId ? "Gỡ" : "Xóa"}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="Chưa có tài liệu cho buổi học này"
          description="Tải lên slide bài giảng, đề thi hoặc tài liệu đính kèm để học viên xem trong buổi này."
        />
      )}
    </section>
  );
}

function ReusableFileModal({
  files,
  loading,
  search,
  attachingFileId,
  onSearchChange,
  onSearch,
  onAttach,
  onClose,
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f63]/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/90 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Library className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-[#102f63]">Chọn tài liệu đã có</h2>
              <p className="mt-0.5 text-xs text-slate-500">File chỉ được lưu một lần; buổi học này dùng chung liên kết an toàn.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng kho tài liệu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
          className="flex gap-2 border-b border-slate-100 p-4"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tìm theo tên tài liệu..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <button type="submit" className="rounded-xl bg-[#102f63] px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700">
            Tìm kiếm
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-xs font-semibold text-slate-500">Đang tải kho tài liệu...</p>
          ) : files.length === 0 ? (
            <div className="py-10 text-center">
              <Library className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">Không còn tài liệu phù hợp để gắn</p>
              <p className="mt-1 text-xs text-slate-400">Kho chỉ hiển thị tài liệu cùng khóa học mà bạn có quyền sử dụng.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {files.map((file) => {
                const kind = kindForFile(file.mimeType, file.name);
                const config = kindConfig[kind] || kindConfig.other;
                const Icon = config.icon;
                const attaching = String(attachingFileId || "") === String(file.id);
                return (
                  <article key={file.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3.5 transition hover:border-blue-300 hover:bg-blue-50/30">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${config.badge}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#102f63]" title={file.name}>{file.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {file.sourceClassTitle || file.courseTitle || "Kho tài liệu chung"}
                          {file.sourceSessionTitle ? ` · ${file.sourceSessionTitle}` : ""}
                          {file.reuseCount ? ` · đã dùng lại ${file.reuseCount} lần` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(attachingFileId)}
                      onClick={() => onAttach(file)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {attaching ? "Đang gắn..." : "Dùng tài liệu"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeacherSessionResults({ tasks }) {
  return tasks.length ? (
    <section className="overflow-x-auto rounded-3xl border border-white/80 bg-white/92 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
      <table className="w-full text-left text-xs">
        <thead className="bg-sky-50/50 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
          <tr>
            <th className="p-4 font-black">Nhiệm vụ</th>
            <th className="p-4 text-center font-black">Đã nộp</th>
            <th className="p-4 text-center font-black">Điểm TB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {tasks.map((task) => (
            <tr key={`${task.type}-${task.id}`} className="hover:bg-white/60 transition">
              <td className="p-4 font-bold text-[#102f63] dark:text-white">{task.title}</td>
              <td className="p-4 text-center">{task.submittedCount || 0}/{task.totalCount || 0}</td>
              <td className="p-4 text-center font-black text-blue-600">{task.avgScore ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ) : (
    <EmptyState icon={GraduationCap} title="Chưa có kết quả" description="Kết quả của các nhiệm vụ trong buổi học sẽ tổng hợp tại đây." />
  );
}

function TeacherSessionAnnouncements({ announcements, onCreate }) {
  const [form, setForm] = useState({ title: "", message: "", linkUrl: "", attachmentUrl: "", scheduledAt: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return toast.error("Nhập tiêu đề và nội dung thông báo.");
    setSaving(true);
    try {
      await onCreate({ ...form, title: form.title.trim(), message: form.message.trim(), scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined });
      setForm({ title: "", message: "", linkUrl: "", attachmentUrl: "", scheduledAt: "" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-5">
      <form onSubmit={submit} className="rounded-3xl border border-white/80 bg-white/92 p-5 shadow-[0_12px_35px_rgba(49,91,125,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-300 shadow-2xs">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-[#102f63] dark:text-white">Gửi thông báo cho buổi học</h2>
            <p className="mt-0.5 text-xs text-slate-500">Gửi ngay hoặc hẹn giờ; có thể đính kèm liên kết/tài liệu đã tải lên.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder="Tiêu đề thông báo" />
          <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} className="rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
        </div>
        <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className="mt-3 min-h-28 w-full rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder="Nội dung học viên sẽ nhận" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={form.linkUrl} onChange={(event) => setForm({ ...form, linkUrl: event.target.value })} className="rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder="Liên kết cần mở (không bắt buộc)" />
          <input value={form.attachmentUrl} onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })} className="rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder="Liên kết tài liệu đính kèm (không bắt buộc)" />
        </div>
        <button disabled={saving} className="mt-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50">
          {saving ? "Đang lưu..." : form.scheduledAt ? "Lên lịch gửi" : "Gửi ngay"}
        </button>
      </form>
      <div className="space-y-3">
        {announcements.length ? (
          announcements.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/80 bg-white/85 p-5 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900">
              <div className="flex justify-between gap-3">
                <h3 className="text-sm font-black text-[#102f63] dark:text-white">{item.title}</h3>
                <span className="text-[10px] font-bold text-slate-500">{item.status === "scheduled" ? `Hẹn ${new Date(item.scheduledAt).toLocaleString("vi-VN")}` : item.status === "sent" ? "Đã gửi" : item.status}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{item.message}</p>
            </article>
          ))
        ) : (
          <EmptyState icon={Bell} title="Chưa có thông báo" description="Thông báo gửi cho buổi này sẽ được lưu tại đây." />
        )}
      </div>
    </section>
  );
}
