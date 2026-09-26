import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  Users
} from "lucide-react";
import {
  deleteClassFile,
  fetchClassDetails,
  fetchClassFiles,
  fetchLiveClassSessions,
  uploadClassFile
} from "../../api/lmsClient";
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
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Files & Sessions State
  const [files, setFiles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Modals
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [gradingModalSubmission, setGradingModalSubmission] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resClass, resFiles, resSessions] = await Promise.all([
        fetchClassDetails(classId),
        fetchClassFiles(classId),
        fetchLiveClassSessions(classId),
      ]);

      if (!resClass?.data) throw new Error("Không tìm thấy dữ liệu lớp học");
      setClassData(resClass.data);
      setFiles(Array.isArray(resFiles?.data) ? resFiles.data : []);
      setSessions(Array.isArray(resSessions?.data) ? resSessions.data : []);
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

        {/* Header lớp học */}
        <header className="overflow-hidden rounded-3xl border border-blue-100 dark:border-slate-800 bg-gradient-to-r from-[#eaf4ff] via-white to-[#f3f8ff] dark:from-slate-900 dark:via-slate-900/95 dark:to-blue-950/30 p-6 shadow-sm sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-sky-300 shadow-sm ring-1 ring-blue-100 dark:ring-slate-700">
            <Users className="h-3.5 w-3.5" /> Không gian lớp giảng dạy
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {classInfo.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {classInfo.description || "Quản lý học viên, lịch học, giáo trình, bài tập và điểm số của lớp."}
          </p>
        </header>

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
            classInfo={classInfo}
            stats={stats}
            nextSession={nextSession}
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
            classId={classId}
            onOpenCreateSession={() => setIsCreateSessionOpen(true)}
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
    </div>
  );
}
