import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  fetchLiveClassRoster,
  fetchSubmissions,
  fetchTeacherQuizReport,
} from "../../api/lmsClient";

const formatDateTime = (value) => {
  if (!value) return "Chưa xác định";
  return new Date(value).toLocaleString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AssignmentSubmissionsModal({
  event,
  onClose,
  isTeacher = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [studentsData, setStudentsData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState("all"); // "all" | "submitted" | "unsubmitted" | "needs_grading" | "graded"

  const isQuiz = event?.eventType === "QUIZ_DUE";
  const isAdminView = location.pathname.startsWith("/admin/");
  const quizReportPath = isAdminView ? "/admin/quizzes" : "/lms/teacher/quizzes";
  const gradingPath = isAdminView ? "/admin/assignments/review" : "/lms/teacher/assignments/review";
  const dueDateObj = event?.due_date ? new Date(event.due_date) : null;
  const isOverdue = dueDateObj ? dueDateObj.getTime() < Date.now() : false;

  useEffect(() => {
    if (!event?.id) return;
    let isCancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        if (!isTeacher) {
          // Đối với học viên, không cần load roster của cả lớp
          setLoading(false);
          return;
        }

        if (isQuiz) {
          // Lấy báo cáo quiz từ API quiz report của giáo viên
          const reportRes = await fetchTeacherQuizReport(event.id);
          if (isCancelled) return;
          if (reportRes?.success && reportRes.data) {
            const rawStudents = Array.isArray(reportRes.data.students)
              ? reportRes.data.students
              : [];
            const mapped = rawStudents.map((s) => {
              const isSubmitted = s.status === "submitted";
              const isGraded = isSubmitted && (!s.hasEssay || Boolean(s.essayGrade));
              return {
                id: s.userId,
                name: s.fullName || s.username || "Học viên",
                username: s.username,
                email: s.email,
                avatar: s.avatarUrl,
                hasSubmitted: isSubmitted,
                status: isGraded ? "graded" : isSubmitted ? "submitted" : "unsubmitted",
                score: s.score,
                maxScore: s.maxScore || event.max_score || 10,
                submittedAt: s.submittedAt,
                attemptNumber: s.attemptNumber,
                attemptId: s.attemptId,
              };
            });
            setStudentsData(mapped);
          }
        } else {
          // Bài tập thông thường (homework / writing / essay)
          const [submissionsRes, rosterRes] = await Promise.all([
            fetchSubmissions(event.id, { classId: event.live_class_id }).catch(() => ({ data: [] })),
            event.live_class_id
              ? fetchLiveClassRoster(event.live_class_id).catch(() => ({ data: [] }))
              : Promise.resolve({ data: [] }),
          ]);

          if (isCancelled) return;

          const submissions = Array.isArray(submissionsRes?.data) ? submissionsRes.data : [];
          const roster = Array.isArray(rosterRes?.data) ? rosterRes.data : [];

          if (roster.length > 0) {
            // Ghép danh sách lớp với danh sách nộp bài
            const submissionByUser = new Map();
            submissions.forEach((sub) => {
              submissionByUser.set(String(sub.userId), sub);
            });

            const merged = roster.map((member) => {
              const sub = submissionByUser.get(String(member.id));
              const hasSubmitted = Boolean(sub && ["submitted", "late", "graded"].includes(sub.status));
              const isGraded = Boolean(sub && (sub.score !== null && sub.score !== undefined || sub.status === "graded"));
              return {
                id: member.id,
                name: member.username || member.email,
                username: member.username,
                email: member.email,
                avatar: member.avatar_url,
                hasSubmitted,
                status: isGraded ? "graded" : hasSubmitted ? "submitted" : "unsubmitted",
                score: sub?.score ?? null,
                maxScore: sub?.maxScore || event.max_score || 10,
                submittedAt: sub?.submittedAt || null,
                submissionId: sub?.id,
                fileAssets: sub?.fileAssets || (sub?.fileName ? [{ fileName: sub.fileName, fileUrl: sub.fileUrl }] : []),
              };
            });
            setStudentsData(merged);
          } else {
            // Nếu không có danh sách live class, dùng trực tiếp submissions
            const mapped = submissions.map((sub) => {
              const isGraded = sub.score !== null && sub.score !== undefined || sub.status === "graded";
              return {
                id: sub.userId,
                name: sub.studentName || "Học viên",
                username: sub.studentName,
                email: sub.studentEmail,
                avatar: sub.studentAvatar,
                hasSubmitted: true,
                status: isGraded ? "graded" : "submitted",
                score: sub.score,
                maxScore: sub.maxScore || event.max_score || 10,
                submittedAt: sub.submittedAt,
                submissionId: sub.id,
                fileAssets: sub.fileAssets || (sub.fileName ? [{ fileName: sub.fileName, fileUrl: sub.fileUrl }] : []),
              };
            });
            setStudentsData(mapped);
          }
        }
      } catch (err) {
        console.error("Error loading submissions modal data:", err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [event, isTeacher, isQuiz]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = studentsData.length;
    const submitted = studentsData.filter((s) => s.hasSubmitted).length;
    const graded = studentsData.filter((s) => s.status === "graded").length;
    const needsGrading = submitted - graded;
    const unsubmitted = total - submitted;
    const submissionRate = total > 0 ? Math.round((submitted / total) * 100) : 0;
    return {
      total: total || event.total_students || 0,
      submitted: total ? submitted : (event.submitted_count || 0),
      graded: total ? graded : (event.graded_count || 0),
      needsGrading: total ? needsGrading : Math.max(0, (event.submitted_count || 0) - (event.graded_count || 0)),
      unsubmitted: total ? unsubmitted : Math.max(0, (event.total_students || 0) - (event.submitted_count || 0)),
      submissionRate: total ? submissionRate : ((event.total_students > 0) ? Math.round((event.submitted_count / event.total_students) * 100) : 0),
    };
  }, [studentsData, event]);

  // Lọc danh sách học viên hiển thị
  const filteredStudents = useMemo(() => {
    let list = [...studentsData];

    if (filterTab === "submitted") {
      list = list.filter((s) => s.hasSubmitted);
    } else if (filterTab === "unsubmitted") {
      list = list.filter((s) => !s.hasSubmitted);
    } else if (filterTab === "needs_grading") {
      list = list.filter((s) => s.hasSubmitted && s.status !== "graded");
    } else if (filterTab === "graded") {
      list = list.filter((s) => s.status === "graded");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s.username || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [studentsData, filterTab, searchQuery]);

  const handleOpenGrading = (student) => {
    onClose();
    if (isQuiz) {
      navigate(`${quizReportPath}?reportQuizId=${encodeURIComponent(event.id)}`);
    } else {
      const query = new URLSearchParams();
      if (event.id) query.set("assignmentId", event.id);
      if (event.live_class_id) query.set("classId", event.live_class_id);
      if (student?.submissionId) query.set("submissionId", student.submissionId);
      navigate(`${gradingPath}?${query.toString()}`);
    }
  };

  const handleOpenGeneralGrading = () => {
    onClose();
    if (isQuiz) {
      navigate(`${quizReportPath}?reportQuizId=${encodeURIComponent(event.id)}`);
    } else {
      const query = new URLSearchParams();
      if (event.id) query.set("assignmentId", event.id);
      if (event.live_class_id) query.set("classId", event.live_class_id);
      navigate(`${gradingPath}?${query.toString()}`);
    }
  };

  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-title"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/80 bg-white/95 dark:border-slate-800 dark:bg-slate-900 shadow-2xl backdrop-blur-md transition-all flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 p-5 sm:p-6 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="min-w-0 pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isQuiz
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-sky-300"
                }`}
              >
                {isQuiz ? <Sparkles className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {isQuiz ? "Bài kiểm tra / Quiz" : "Bài tập nộp"}
              </span>

              {event.class_title && (
                <span className="rounded-full bg-slate-200/80 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {event.class_title}
                </span>
              )}

              {isOverdue ? (
                <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 text-xs font-bold">
                  Đã hết hạn nộp
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-bold">
                  Đang nhận bài nộp
                </span>
              )}
            </div>

            <h2 id="assignment-title" className="mt-2 text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
              {event.title}
            </h2>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
                Hạn nộp: {formatDateTime(event.due_date)}
              </span>
              <span>Thang điểm tối đa: <strong className="text-slate-800 dark:text-slate-200">{event.max_score || 10}đ</strong></span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nội dung chính Modal */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Chế độ dành cho Giảng viên */}
          {isTeacher ? (
            <>
              {/* Thẻ KPI tiến độ nộp bài của cả lớp */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3.5">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Tổng học viên</span>
                    <Users className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {stats.total}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">Học viên trong lớp</p>
                </div>

                <div className="rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3.5">
                  <div className="flex items-center justify-between text-blue-600 dark:text-sky-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Đã nộp bài</span>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p className="mt-1 text-xl sm:text-2xl font-black text-blue-700 dark:text-sky-300">
                    {stats.submitted}
                    <span className="text-xs font-semibold text-blue-500 ml-1">({stats.submissionRate}%)</span>
                  </p>
                  <p className="text-[10px] text-blue-600/80 font-medium">Đã gửi bài làm</p>
                </div>

                <div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Cần chấm</span>
                    <Award className="h-4 w-4" />
                  </div>
                  <p className="mt-1 text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300">
                    {stats.needsGrading}
                  </p>
                  <p className="text-[10px] text-amber-600/80 font-medium">Đang đợi giảng viên chấm</p>
                </div>

                <div className="rounded-2xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 p-3.5">
                  <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Chưa nộp</span>
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <p className="mt-1 text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-300">
                    {stats.unsubmitted}
                  </p>
                  <p className="text-[10px] text-rose-600/80 font-medium">Chưa có bài gửi</p>
                </div>
              </div>

              {/* Thanh điều khiển: Tabs bộ lọc + Ô tìm kiếm học viên */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                {/* Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 p-1 [scrollbar-width:none]">
                  {[
                    { id: "all", label: `Tất cả (${stats.total})` },
                    { id: "submitted", label: `Đã nộp (${stats.submitted})` },
                    { id: "needs_grading", label: `Cần chấm (${stats.needsGrading})` },
                    { id: "unsubmitted", label: `Chưa nộp (${stats.unsubmitted})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilterTab(tab.id)}
                      className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                        filterTab === tab.id
                          ? "bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-white"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative min-w-[200px] sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên học viên, email..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Danh sách học viên */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span>Học viên ({filteredStudents.length})</span>
                  <span>Trạng thái bài nộp</span>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
                    Đang tải danh sách bài nộp của học viên...
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Không tìm thấy học viên phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[38vh] overflow-y-auto [scrollbar-width:thin]">
                    {filteredStudents.map((st) => {
                      const isGraded = st.status === "graded";
                      const isSub = st.hasSubmitted;
                      return (
                        <div
                          key={st.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition"
                        >
                          {/* Thông tin học viên */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-sky-300 font-bold text-xs uppercase overflow-hidden border border-blue-200/50">
                              {st.avatar ? (
                                <img src={st.avatar} alt={st.name} className="h-full w-full object-cover" />
                              ) : (
                                (st.name || "U").slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {st.name}
                              </h4>
                              <p className="text-[11px] text-slate-400 truncate">
                                {st.email || st.username}
                              </p>
                            </div>
                          </div>

                          {/* Chi tiết nộp bài và Nút hành động */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <div className="text-left sm:text-right">
                              {isGraded ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                  <FileCheck className="h-3 w-3" />
                                  Đã chấm: {st.score}/{st.maxScore}đ
                                </span>
                              ) : isSub ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-sky-300">
                                  <Clock className="h-3 w-3" />
                                  Đã nộp (Chờ chấm)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  Chưa nộp bài
                                </span>
                              )}

                              {st.submittedAt && (
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  Lúc {formatShortDate(st.submittedAt)}
                                </p>
                              )}
                            </div>

                            {/* Nút Chấm bài */}
                            {isSub ? (
                              <button
                                type="button"
                                onClick={() => handleOpenGrading(st)}
                                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                              >
                                {isGraded ? "Sửa điểm" : "Chấm bài"}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-300 dark:text-slate-600 font-semibold px-2">
                                —
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Chế độ dành cho Học viên */
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Thông tin nhiệm vụ học tập
                </h4>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                  {event.description || "Hãy hoàn thành bài tập / bài kiểm tra trước thời hạn để đạt kết quả tốt nhất."}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Trạng thái bài của bạn</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {event.status === "graded"
                      ? "Bài làm của bạn đã được giảng viên chấm điểm."
                      : event.status === "submitted"
                        ? "Bạn đã gửi bài thành công và đang chờ giảng viên chấm."
                        : isOverdue
                          ? "Đã quá hạn nộp bài. Hãy liên hệ giảng viên nếu cần hỗ trợ."
                          : "Bạn chưa hoàn tất nộp bài."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(isQuiz ? `/lms/quizzes/${event.id}` : `/lms/assignment/${event.id}/submit`);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                >
                  {isQuiz ? "Mở bài Quiz" : "Mở bài tập"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 p-4 sm:p-5 bg-slate-50/60 dark:bg-slate-800/30 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            Đóng
          </button>

          {isTeacher && (
            <button
              type="button"
              onClick={handleOpenGeneralGrading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <span>{isQuiz ? "Xem toàn bộ bài nộp đề thi" : "Mở phòng chấm bài của lớp"}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
