import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpenCheck, ClipboardList, FilePenLine, GraduationCap, Search } from "lucide-react";
import { fetchAssignments } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";
import { parseQuizDescription } from "../../teacher/utils/quizAnswerKey";

function itemType(item) {
  const value = String(item.type || item.assignment_type || "homework").toLowerCase();
  if (value.includes("quiz") || value.includes("trac_nghiem")) return "quiz";
  if (value.includes("essay") || value.includes("writing") || value.includes("tu_luan")) return "essay";
  if (value.includes("speak") || value.includes("hskk") || value.includes("noi")) return "speaking";
  return "homework";
}

function quizScope(item) {
  return (item.activity_scope || item.activityScope) === "homework" ? "homework" : "session";
}

function isEssayQuiz(item) {
  if (itemType(item) !== "quiz") return false;
  const essayConfig = item.essayConfig || parseQuizDescription(item.description).essayConfig;
  return Boolean(essayConfig?.enabled);
}

function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function itemStatus(item) {
  const type = itemType(item);
  const submissionStatus = String(item.submission_status || "").toLowerCase();
  const submitted = Boolean(item.submitted_at) || submissionStatus === "submitted" || item.status === "submitted";

  if (item.can_resubmit) return "revision";
  if (item.score !== undefined && item.score !== null) return "graded";
  if (submitted) return item.status === "late" ? "submittedLate" : "submitted";
  if (type === "quiz" && submissionStatus === "in_progress") return "inProgress";

  const now = Date.now();
  if (type === "quiz") {
    const startsAt = timestamp(item.available_from || (quizScope(item) === "session" ? item.session_start : null));
    const endsAt = timestamp(item.available_until || (quizScope(item) === "session" ? item.session_end : item.due_date));
    if (startsAt && startsAt > now) return "upcoming";
    if (endsAt && endsAt <= now) return "overdue";
  }

  const dueAt = timestamp(item.due_date);
  return item.status === "late" || (dueAt && dueAt <= now) ? "overdue" : "todo";
}

function statusBucket(status) {
  if (["todo", "upcoming", "inProgress", "revision"].includes(status)) return "todo";
  if (["submitted", "submittedLate"].includes(status)) return "submitted";
  if (status === "overdue") return "late";
  return status;
}

function deadlineText(value) {
  const dueAt = timestamp(value);
  if (!dueAt) return "Không giới hạn thời gian";
  const distance = dueAt - Date.now();
  if (distance <= 0) return "Đã hết hạn";
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor((distance % 86400000) / 3600000);
  return days ? `Còn ${days} ngày ${hours} giờ` : `Còn ${Math.max(1, hours)} giờ`;
}

function formatDateTime(value) {
  const parsed = timestamp(value);
  return parsed
    ? new Date(parsed).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "Chưa xác định";
}

const typeStyle = {
  quiz: { icon: ClipboardList, className: "bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300" },
  essay: { label: "Bài tự luận", icon: FilePenLine, className: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300" },
  speaking: { label: "Khẩu ngữ HSKK", icon: GraduationCap, className: "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300" },
  homework: { label: "Bài tập về nhà", icon: FilePenLine, className: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300" },
};

const statusStyle = {
  todo: { label: "Cần hoàn thành", className: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-amber-100 dark:ring-amber-900/40" },
  upcoming: { label: "Chưa đến giờ mở", className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700" },
  inProgress: { label: "Đang làm dở", className: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-900/60" },
  revision: { label: "Cần sửa và nộp lại", className: "bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 ring-orange-200 dark:ring-orange-900/50" },
  submitted: { label: "Đã nộp · chờ chấm", className: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 ring-blue-100 dark:ring-blue-900/40" },
  submittedLate: { label: "Đã nộp muộn · chờ chấm", className: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 ring-blue-200 dark:ring-blue-900/50" },
  graded: { label: "Đã chấm điểm", className: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-emerald-100 dark:ring-emerald-900/40" },
  overdue: { label: "Quá hạn · chưa nộp", className: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-rose-100 dark:ring-rose-900/40" },
};

function actionFor(item, type, status) {
  if (status === "graded") {
    if (type === "quiz") return { label: "Xem lại bài thi", tone: "success" };
    if (type === "speaking") return { label: "Xem kết quả", tone: "success" };
    return { label: "Xem bài & nhận xét", tone: "success" };
  }
  if (status === "submitted" || status === "submittedLate") {
    return { label: type === "quiz" ? "Xem lại bài thi" : "Xem bài đã nộp", tone: "muted" };
  }
  if (status === "revision") return { label: "Sửa và nộp lại", tone: "warning" };
  if (status === "inProgress") return { label: "Tiếp tục làm bài", tone: "primary" };
  if (status === "upcoming") return { label: "Chưa đến giờ", tone: "disabled", disabled: true };
  if (status === "overdue" && type === "quiz") return { label: "Đã hết hạn", tone: "disabled", disabled: true };
  if (status === "overdue") return { label: "Nộp bài muộn", tone: "warning" };
  if (type === "quiz") return { label: quizScope(item) === "homework" ? "Làm quiz về nhà" : "Làm quiz tại lớp", tone: "primary" };
  if (type === "essay") return { label: "Làm bài tự luận", tone: "primary" };
  if (type === "speaking") return { label: "Mở bài tập", tone: "primary" };
  return { label: "Làm bài tập", tone: "primary" };
}

const actionStyle = {
  primary: "bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-none hover:bg-blue-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  warning: "bg-orange-600 text-white hover:bg-orange-700",
  muted: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700",
  disabled: "cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
};

export default function AssignmentListPage() {
  const { courseId, classId } = useParams();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("todo");
  const [search, setSearch] = useState("");

  const loadAssignments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage("");
    }
    try {
      const result = await fetchAssignments({ courseId, classId });
      setAssignments(result?.success && Array.isArray(result.data) ? result.data : []);
      setErrorMessage("");
    } catch (error) {
      console.error("Unable to load assignments", error);
      if (!silent) setErrorMessage("Không thể tải danh sách bài tập. Vui lòng thử lại sau.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [classId, courseId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const refresh = () => loadAssignments({ silent: true });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadAssignments]);

  const counts = useMemo(() => assignments.reduce((result, assignment) => {
    result[statusBucket(itemStatus(assignment))] += 1;
    return result;
  }, { todo: 0, submitted: 0, graded: 0, late: 0 }), [assignments]);

  const visibleAssignments = useMemo(() => assignments.filter((assignment) => {
    const matchesStatus = statusFilter === "all" || statusBucket(itemStatus(assignment)) === statusFilter;
    const needle = search.trim().toLocaleLowerCase();
    const matchesSearch = !needle || [assignment.title, assignment.description, assignment.course_title].some((value) => String(value || "").toLocaleLowerCase().includes(needle));
    return matchesStatus && matchesSearch;
  }).sort((left, right) => {
    const priority = (item) => item.session_start && new Date(item.session_start).getTime() >= Date.now() ? 0 : item.session_start ? 2 : 1;
    const priorityDelta = priority(left) - priority(right);
    if (priorityDelta) return priorityDelta;
    const leftTime = new Date(left.session_start || left.due_date || "9999-12-31").getTime();
    const rightTime = new Date(right.session_start || right.due_date || "9999-12-31").getTime();
    return leftTime - rightTime;
  }), [assignments, search, statusFilter]);

  const buildPath = (assignment) => {
    const isQuiz = itemType(assignment) === "quiz";
    if (courseId && classId) return isQuiz ? `/lms/courses/${courseId}/classes/${classId}/quizzes/${assignment.id}` : `/lms/courses/${courseId}/classes/${classId}/assignments/${assignment.id}/submit`;
    return isQuiz ? `/lms/quiz/${assignment.id}` : `/lms/assignment/${assignment.id}/submit`;
  };

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="mx-auto max-w-6xl space-y-6">

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm dark:shadow-none md:flex-row md:items-center md:justify-between">
          <div className="-mx-1 flex overflow-x-auto px-1 pb-1 md:mx-0 md:px-0 md:pb-0">
            {[
              ["todo", "Cần làm", counts.todo],
              ["submitted", "Đã nộp", counts.submitted],
              ["graded", "Đã chấm", counts.graded],
              ["late", "Quá hạn", counts.late],
              ["all", "Tất cả", assignments.length],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
                className={`min-h-10 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  statusFilter === value
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {label}{" "}
                <span
                  className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] ${
                    statusFilter === value ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
          <label className="relative block w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm bài tập hoặc khóa học..."
              aria-label="Tìm bài tập hoặc khóa học"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 py-2.5 pl-9 pr-3 text-xs text-slate-800 dark:text-slate-200 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-400 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800"
            />
          </label>
        </section>

        {loading ? (
          <LoadingState message="Đang tải bài tập..." count={3} />
        ) : errorMessage ? (
          <ErrorState title="Không tải được bài tập" message={errorMessage} onRetry={loadAssignments} />
        ) : visibleAssignments.length === 0 ? (
          <EmptyState icon={BookOpenCheck} title="Không có bài tập phù hợp" description="Các bài tập mới sẽ xuất hiện tại đây." />
        ) : (
          <section className="space-y-3">
            {visibleAssignments.map((assignment) => {
              const type = itemType(assignment);
              const displayDescription = type === "quiz"
                ? parseQuizDescription(assignment.description).text
                : assignment.description;
              const typeConfig = typeStyle[type];
              const status = itemStatus(assignment);
              const essayQuiz = isEssayQuiz(assignment);
              const statusConfig = status === "graded" && essayQuiz
                ? { ...statusStyle.graded, label: "Đã nộp · xem điểm & nhận xét" }
                : statusStyle[status];
              const Icon = typeConfig.icon;
              const isHomeworkQuiz = type === "quiz" && quizScope(assignment) === "homework";
              const typeLabel = type === "quiz" ? (isHomeworkQuiz ? "Quiz về nhà" : "Quiz tại lớp") : typeConfig.label;
              const action = actionFor(assignment, type, status);
              const submittedAt = assignment.submitted_at ? formatDateTime(assignment.submitted_at) : null;
              return (
                <article
                  key={assignment.id}
                  className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-none transition hover:-translate-y-0.5 hover:shadow-md dark:hover:border-slate-700 sm:p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${typeConfig.className}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${typeConfig.className}`}>
                            {typeLabel}
                          </span>
                          {essayQuiz && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              Có phần tự luận
                            </span>
                          )}
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusConfig.className}`}>
                            {statusConfig.label}
                            {status === "graded" ? ` · ${assignment.score}/${assignment.max_score || 10}` : ""}
                          </span>
                          {assignment.course_title && (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {assignment.course_title}
                            </span>
                          )}
                        </div>
                        <h2 className="mt-2 break-words text-base font-bold text-slate-900 dark:text-white">{assignment.title}</h2>
                        {displayDescription && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{displayDescription}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {type === "quiz" && !isHomeworkQuiz ? (
                            <>
                              <span className="font-semibold text-violet-700 dark:text-violet-300">
                                {status === "upcoming" ? "Mở lúc" : status === "overdue" ? "Đã kết thúc" : "Buổi học"}: {formatDateTime(
                                  status === "overdue"
                                    ? assignment.available_until || assignment.session_end
                                    : status === "upcoming"
                                      ? assignment.available_from || assignment.session_start
                                      : assignment.session_start
                                )}
                              </span>
                              {assignment.session_title && <span>Buổi: {assignment.session_title}</span>}
                              {assignment.class_title && <span>Lớp: {assignment.class_title}</span>}
                            </>
                          ) : (
                            <>
                              {type === "quiz" && status === "upcoming" && assignment.available_from && (
                                <span className="font-semibold text-violet-700 dark:text-violet-300">Mở lúc: {formatDateTime(assignment.available_from)}</span>
                              )}
                              <span>Hạn nộp: {assignment.due_date ? formatDateTime(assignment.due_date) : "Không giới hạn"}</span>
                              {!submittedAt && status !== "graded" && (
                                <span className={`font-semibold ${status === "overdue" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                                  {deadlineText(assignment.due_date)}
                                </span>
                              )}
                            </>
                          )}
                          {submittedAt && <span className="font-semibold text-blue-600 dark:text-sky-400">Đã nộp: {submittedAt}</span>}
                          {Number(assignment.max_score) > 0 && status !== "graded" && <span>Thang điểm: {assignment.max_score}</span>}
                        </div>
                      </div>
                    </div>
                    {action.disabled ? (
                      <span
                        aria-disabled="true"
                        className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-xs font-bold md:w-auto ${actionStyle[action.tone]}`}
                      >
                        {action.label}
                      </span>
                    ) : (
                      <Link
                        to={buildPath(assignment)}
                        className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-center text-xs font-bold transition md:w-auto ${actionStyle[action.tone]}`}
                      >
                        {action.label}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
