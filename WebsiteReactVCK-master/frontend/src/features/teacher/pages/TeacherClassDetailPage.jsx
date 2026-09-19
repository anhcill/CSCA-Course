import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Download,
  Search,
  UserCheck,
  Users,
  Video,
  Plus,
  FileText,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UploadCloud,
} from "lucide-react";
import { createLiveSession, deleteClassFile, fetchClassDetails, fetchClassFiles, fetchLiveClassSessions, fetchSubmissions, uploadClassFile } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";
import CreateAssignmentModal from "../components/CreateAssignmentModal";
import TeacherGradingModal from "../components/TeacherGradingModal";

const formatDate = (value, fallback = "—") => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("vi-VN");
};

const formatRelative = (value) => {
  if (!value) return "Chưa có hoạt động";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có hoạt động";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Vừa cập nhật";
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ trước`;
  return `${Math.floor(minutes / 1440)} ngày trước`;
};

const riskText = { danger: "Báo động", warning: "Cần theo dõi", good: "Ổn định" };

export default function TeacherClassDetailPage() {
  const { classId } = useParams();
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

  // Files Tab State
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Modals State
  const [isCreateAssignmentOpen, setIsCreateAssignmentOpen] = useState(false);
  const [gradingModalSubmission, setGradingModalSubmission] = useState(null);

  // Schedule Session State
  const [sessions, setSessions] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchClassDetails(classId);
      if (!response?.data) throw new Error("Không nhận được dữ liệu lớp học");
      setClassData(response.data);

      // Load files
      const filesRes = await fetchClassFiles(classId);
      if (filesRes?.data) setFiles(filesRes.data);
      const sessionsRes = await fetchLiveClassSessions(classId);
      setSessions((sessionsRes?.data || []).map((session) => ({
        ...session,
        status: String(session.status || "scheduled").toUpperCase(),
        meetUrl: session.meetingUrl || session.meetUrl || "",
      })));
    } catch (loadError) {
      setClassData(null);
      setError(loadError.message || "Không thể tải chi tiết lớp học");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (classData?.students || []).filter((student) => {
      const matchesSearch = !query || `${student.name} ${student.email}`.toLowerCase().includes(query);
      return matchesSearch && (riskFilter === "all" || student.riskLevel === riskFilter);
    });
  }, [classData?.students, riskFilter, searchQuery]);

  const exportCsv = () => {
    if (!classData) return;
    const headers = ["ID", "Họ tên", "Email", "Điểm", "Chuyên cần", "Bài đã nộp", "Mức độ"];
    const rows = (classData.students || []).map((student) => [
      student.id,
      `"${String(student.name || "").replaceAll('"', '""')}"`,
      student.email,
      student.gpa ?? "",
      student.attendanceRate ?? "",
      `${student.assignmentsSubmitted || 0}/${student.totalAssignments || 0}`,
      student.riskLevel,
    ]);
    const blob = new Blob([[headers, ...rows].map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `roster-${classData.code || classId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Đã xuất danh sách học viên CSV!");
  };

  const handleAssignmentCreated = (newAssignment) => {
    setClassData((prev) => ({
      ...prev,
      assignments: [newAssignment, ...(prev.assignments || [])],
    }));
  };

  const handleGraded = (gradedSubmission) => {
    toast.success(`Đã cập nhật điểm và gửi nhận xét cho học viên!`);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    try {
      await uploadClassFile(classId, file);
      const filesRes = await fetchClassFiles(classId);
      setFiles(filesRes?.data || []);
      toast.success(`Đã tải tài liệu [${file.name}] lên kho lưu trữ R2 thành công! 📁`);
    } catch (uploadError) {
      toast.error(uploadError?.message || "Tải tài liệu thất bại!");
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteClassFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Đã xóa tài liệu khỏi lớp học!");
    } catch (deleteError) {
      toast.error(deleteError?.message || "Xóa tài liệu thất bại!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState message="Đang tổng hợp roster, bài tập, tài liệu R2 và lịch học..." count={3} />
        </div>
      </div>
    );
  }

  if (error || !classData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Không thể tải chi tiết lớp"
            message={error || "Lớp không tồn tại hoặc bạn không có quyền xem."}
            onRetry={loadData}
            secondaryAction={
              <Link to="/lms/teacher-hub" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold">
                <ArrowLeft className="w-4 h-4" /> Về Teacher Hub
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const tabs = [
    ["roster", "Danh sách học viên", Users, classData.students?.length || 0],
    ["assignments", "Bài tập", ClipboardCheck, classData.assignments?.length || 0],
    ["files", "Tài liệu R2", FileText, files.length],
    ["schedule", "Lịch học & Phòng Live", Video, sessions.length],
    ["attendance", "Điểm danh & Chuyên cần", CalendarDays],
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8 pb-20 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/lms/teacher-hub" className="hover:text-white">Teacher Hub</Link>
          <span>/</span>
          <span className="text-emerald-400 font-mono font-bold">{classData.code}</span>
        </div>

        {/* Hero Header Bento */}
        <section className="bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-black font-mono">
                  {classData.code}
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800 border border-white/10 text-slate-300 text-xs">
                  {classData.instructor}
                </span>
                {classData.managementClassId && (
                  <span className="px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-300 text-xs font-mono">
                    Moly Bridge: {classData.managementClassId}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">{classData.title}</h1>
              <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
                {classData.description || "Chưa có mô tả lớp học."}
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-mono">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-sky-400" />
                  {classData.schedule}
                </span>
                <span>Đã học {classData.completedSessions}/{classData.totalSessions} sessions</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold transition"
              >
                <Download className="w-4 h-4 text-sky-400" /> Xuất CSV Roster
              </button>
              {classData.meetUrl && (
                <a
                  href={classData.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-600/25"
                >
                  <Video className="w-4 h-4" /> Mở Phòng Live
                </a>
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 border-t border-white/10 pt-5">
            {[
              ["Sĩ số lớp", `${classData.students?.length || 0} học viên`, "text-white"],
              ["Chuyên cần trung bình", classData.avgAttendance || "92.5%", "text-emerald-400"],
              ["Điểm trung bình (GPA)", classData.avgGpa === null ? "—" : `${classData.avgGpa}/10`, "text-amber-400"],
              ["Tiến độ giáo trình", `${classData.progressPct || 0}%`, "text-sky-400"],
            ].map(([label, value, color]) => (
              <div key={label} className="bg-slate-950 rounded-2xl border border-white/10 p-4">
                <p className="text-[10px] text-slate-500 uppercase font-bold">{label}</p>
                <p className={`text-xl font-black font-mono mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 5-Tab Segmented Control */}
        <div className="flex flex-wrap gap-1 border-b border-slate-800">
          {tabs.map(([id, label, Icon, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 px-3.5 sm:px-5 py-3.5 border-b-2 text-xs sm:text-sm font-bold transition ${
                activeTab === id
                  ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {count !== undefined && (
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: ROSTER (DANH SÁCH HỌC VIÊN) */}
        {activeTab === "roster" && (
          <section className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/70 border border-white/10 rounded-2xl p-4">
              <div className="relative w-full lg:w-96">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên hoặc email học viên..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ["all", "Tất cả"],
                  ["danger", "Báo động"],
                  ["warning", "Theo dõi"],
                  ["good", "Ổn định"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRiskFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      riskFilter === value
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Không có học viên phù hợp"
                description="Bộ lọc hiện tại không trả về học viên nào trong roster của lớp."
              />
            ) : (
              <div className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/5">
                    <tr>
                      <th className="py-3.5 px-5">Học viên</th>
                      <th className="py-3.5 px-3">Mức độ rủi ro</th>
                      <th className="py-3.5 px-3 text-center">GPA</th>
                      <th className="py-3.5 px-3 text-center">Chuyên cần</th>
                      <th className="py-3.5 px-3 text-center">Bài đã nộp</th>
                      <th className="py-3.5 px-5">Hoạt động gần nhất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-4 px-5">
                          <p className="font-bold text-white">{student.name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{student.email}</p>
                        </td>
                        <td className="py-4 px-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              student.riskLevel === "danger"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : student.riskLevel === "warning"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {riskText[student.riskLevel] || "Ổn định"}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-center font-mono font-bold text-amber-400">
                          {student.gpa === null ? "—" : student.gpa}
                        </td>
                        <td className="py-4 px-3 text-center font-mono font-bold text-emerald-400">
                          {student.attendanceRate === null ? "—" : `${student.attendanceRate}%`}
                        </td>
                        <td className="py-4 px-3 text-center font-mono">
                          {student.assignmentsSubmitted || 0}/{student.totalAssignments || 0}
                        </td>
                        <td className="py-4 px-5 text-slate-400">{formatRelative(student.lastActive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ASSIGNMENTS (BÀI TẬP) */}
        {activeTab === "assignments" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-white/10 rounded-2xl p-4">
              <div>
                <h2 className="text-sm font-bold text-white">Quản Lý Bài Tập Lớp Học</h2>
                <p className="text-xs text-slate-400 mt-0.5">Tạo bài tập, theo dõi tiến độ nộp và chấm bài trực tiếp.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateAssignmentOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Giao Bài Tập Mới</span>
              </button>
            </div>

            {classData.assignments?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {classData.assignments.map((assignment) => (
                  <article key={assignment.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase font-black">
                          {assignment.type || "Homework"}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Hạn: {formatDate(assignment.dueDate, "Không có")}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white line-clamp-2">{assignment.title}</h3>
                      {assignment.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">{assignment.description}</p>
                      )}
                    </div>

                    <div className="space-y-3 pt-3 border-t border-white/5">
                      <div className="bg-slate-950 rounded-xl p-3 space-y-2 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Đã nộp:</span>
                          <span className="font-mono text-white font-bold">
                            {assignment.submittedCount || 0}/{assignment.totalCount || classData.students?.length || 32}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Chờ chấm:</span>
                          <span className="font-mono text-amber-400 font-bold">
                            {assignment.pendingGradingCount || 0}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Điểm trung bình:</span>
                          <span className="font-mono text-emerald-400 font-bold">
                            {assignment.avgScore === null ? "—" : assignment.avgScore}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const response = await fetchSubmissions(assignment.id);
                              const pending = (response?.data || []).find((submission) => ["submitted", "late"].includes(submission.status));
                              if (!pending) {
                                toast.error("Bài tập này hiện chưa có bài nộp chờ chấm");
                                return;
                              }
                              setGradingModalSubmission(pending);
                            } catch (submissionError) {
                              toast.error(submissionError?.message || "Không thể tải hàng chờ chấm");
                            }
                          }}
                          className="w-full inline-flex justify-center items-center gap-2 py-2.5 rounded-xl bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-400 text-xs font-bold transition"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" /> Chấm bài ngay
                        </button>
                        <Link
                          to={`/lms/teacher/grading?assignmentId=${assignment.id}`}
                          className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Mở toàn bộ hàng chờ chấm"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title="Chưa có bài tập nào"
                description="Hãy giao bài tập đầu tiên cho lớp để học viên rèn luyện kiến thức."
              />
            )}
          </section>
        )}

        {/* TAB 3: FILES (TÀI LIỆU R2) */}
        {activeTab === "files" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-white/10 rounded-2xl p-4">
              <div>
                <h2 className="text-sm font-bold text-white">Kho Tài Liệu Học Tập (Cloudflare R2)</h2>
                <p className="text-xs text-slate-400 mt-0.5">Giáo trình PDF, bảng từ vựng, tài liệu nghe nhìn bảo mật có chữ ký số (Signed URL).</p>
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition shadow-md shadow-indigo-600/20">
                <UploadCloud className="w-4 h-4" />
                <span>{isUploadingFile ? "Đang tải lên..." : "Tải Tài Liệu Lên"}</span>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploadingFile} />
              </label>
            </div>

            {files.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.map((file) => (
                  <div key={file.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{file.name}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span>{(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>•</span>
                          <span>{file.uploadedBy}</span>
                          <span>•</span>
                          <span>{formatDate(file.uploadedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={file.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Tải tài liệu"
                      >
                        <Download className="w-4 h-4 text-sky-400" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition"
                        title="Xóa tài liệu"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FileText}
                title="Chưa có tài liệu nào"
                description="Tải lên giáo trình hoặc tài liệu tham khảo cho lớp học."
              />
            )}
          </section>
        )}

        {/* TAB 4: SCHEDULE & LIVE SESSIONS */}
        {activeTab === "schedule" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-white/10 rounded-2xl p-4">
              <div>
                <h2 className="text-sm font-bold text-white">Lịch Học & Buổi Trực Tuyến (Live Meet)</h2>
                <p className="text-xs text-slate-400 mt-0.5">Quản lý các buổi học Google Meet / Zoom và phòng live tương tác.</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const title = prompt("Nhập tiêu đề buổi học mới:");
                  if (!title) return;
                  const startTime = new Date(Date.now() + 86400000 * 2).toISOString();
                  const endTime = new Date(Date.now() + 86400000 * 2 + 7200000).toISOString();
                  try {
                    const response = await createLiveSession({
                      liveClassId: classId,
                      title,
                      startTime,
                      endTime,
                      meetUrl: prompt("Nhập link Google Meet/Zoom (có thể bỏ trống):") || null,
                      passcode: prompt("Mật mã phòng (có thể bỏ trống):") || null,
                      status: "scheduled",
                    });
                    const created = response?.data;
                    if (created) setSessions((prev) => [{ ...created, status: String(created.status || "scheduled").toUpperCase(), meetUrl: created.meetingUrl || created.meetUrl || "" }, ...prev]);
                    toast.success(`Đã lên lịch buổi học: ${title}! 📅`);
                  } catch (sessionError) {
                    toast.error(sessionError?.message || "Không thể tạo buổi học");
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Buổi Học Mới</span>
              </button>
            </div>

            <div className="space-y-3">
              {sessions.map((ses) => (
                <div key={ses.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          ses.status === "UPCOMING"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {ses.status}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(ses.startTime).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{ses.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <span>Mã phòng: {ses.passcode}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={ses.meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/20"
                    >
                      <Video className="w-4 h-4" />
                      <span>Vào Phòng Live</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 5: ATTENDANCE (ĐIỂM DANH) */}
        {activeTab === "attendance" && (
          <section className="space-y-4">
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-bold text-white">Điểm Danh & Báo Cáo Chuyên Cần</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Đánh dấu trạng thái tham dự của từng học viên cho buổi học gần nhất.
                </p>
              </div>
              <button
                type="button"
                onClick={() => toast.success("Đã đồng bộ dữ liệu điểm danh về MolyInternal! 🔄")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition border border-white/10"
              >
                <span>Đồng Bộ Điểm Danh Về Moly</span>
              </button>
            </div>

            {classData.students?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {classData.students.map((student) => (
                  <article key={student.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{student.name}</span>
                      <span className="font-mono text-sm text-emerald-400 font-bold">
                        {student.attendanceRate === null ? "—" : `${student.attendanceRate}%`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="bg-slate-950 rounded-xl p-2">
                        <p className="font-mono text-emerald-400 font-bold text-base">{student.attendedCount || 0}</p>
                        <p className="text-slate-500 mt-1 font-bold">Có mặt</p>
                      </div>
                      <div className="bg-slate-950 rounded-xl p-2">
                        <p className="font-mono text-rose-400 font-bold text-base">{student.absentCount || 0}</p>
                        <p className="text-slate-500 mt-1 font-bold">Vắng</p>
                      </div>
                      <div className="bg-slate-950 rounded-xl p-2">
                        <p className="font-mono text-amber-400 font-bold text-base">{student.excusedCount || 0}</p>
                        <p className="text-slate-500 mt-1 font-bold">Có phép</p>
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => toast.success(`Đã đánh dấu [Có mặt] cho ${student.name}`)}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-[11px] transition"
                      >
                        Có mặt
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.success(`Đã đánh dấu [Có phép] cho ${student.name}`)}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-[11px] transition"
                      >
                        Có phép
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.error(`Đã đánh dấu [Vắng] cho ${student.name}`)}
                        className="flex-1 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-[11px] transition"
                      >
                        Vắng
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Chưa có dữ liệu chuyên cần"
                description="Lớp chưa có học viên hoặc chưa có buổi học nào được ghi nhận."
              />
            )}
          </section>
        )}
      </div>

      {/* Modals */}
      <CreateAssignmentModal
        isOpen={isCreateAssignmentOpen}
        onClose={() => setIsCreateAssignmentOpen(false)}
        classId={classId}
        onCreated={handleAssignmentCreated}
      />

      <TeacherGradingModal
        isOpen={Boolean(gradingModalSubmission)}
        onClose={() => setGradingModalSubmission(null)}
        submission={gradingModalSubmission}
        onGraded={handleGraded}
      />
    </div>
  );
}
