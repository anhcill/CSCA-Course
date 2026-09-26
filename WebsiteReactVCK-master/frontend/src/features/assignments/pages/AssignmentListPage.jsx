import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpenCheck, ClipboardList, FilePenLine, GraduationCap, Search } from "lucide-react";
import { fetchAssignments } from "../../api/lmsClient";
import { EmptyState, ErrorState, LoadingState } from "../../../components/common/StateView";

function itemType(item) {
  const value = String(item.type || item.assignment_type || "homework").toLowerCase();
  if (value.includes("quiz") || value.includes("trac_nghiem")) return "quiz";
  if (value.includes("speak") || value.includes("hskk") || value.includes("noi")) return "speaking";
  return "homework";
}

function itemStatus(item) {
  if (item.score !== undefined && item.score !== null) return "graded";
  if (item.status === "late") return "late";
  if (item.submitted_at || item.status === "submitted") return "submitted";
  return item.due_date && new Date(item.due_date) < new Date() ? "late" : "todo";
}

function deadlineText(value) {
  if (!value) return "Theo thời lượng bài";
  const distance = new Date(value).getTime() - Date.now();
  if (distance <= 0) return "Đã hết hạn";
  const days = Math.floor(distance / 86400000);
  const hours = Math.floor((distance % 86400000) / 3600000);
  return days ? `Còn ${days} ngày ${hours} giờ` : `Còn ${Math.max(1, hours)} giờ`;
}

const typeStyle = {
  quiz: { label: "Trắc nghiệm", icon: ClipboardList, className: "bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300" },
  speaking: { label: "Khẩu ngữ HSKK", icon: GraduationCap, className: "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300" },
  homework: { label: "Bài tập", icon: FilePenLine, className: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300" },
};

const statusStyle = {
  todo: { label: "Cần hoàn thành", className: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-amber-100 dark:ring-amber-900/40" },
  submitted: { label: "Đã nộp · chờ chấm", className: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 ring-blue-100 dark:ring-blue-900/40" },
  graded: { label: "Đã chấm điểm", className: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-emerald-100 dark:ring-emerald-900/40" },
  late: { label: "Quá hạn", className: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-rose-100 dark:ring-rose-900/40" },
};

export default function AssignmentListPage() {
  const { courseId, classId } = useParams();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await fetchAssignments({ courseId, classId });
      setAssignments(result?.success && Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      console.error("Unable to load assignments", error);
      setErrorMessage("Không thể tải danh sách bài tập. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }, [classId, courseId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const counts = useMemo(() => assignments.reduce((result, assignment) => {
    result[itemStatus(assignment)] += 1;
    return result;
  }, { todo: 0, submitted: 0, graded: 0, late: 0 }), [assignments]);

  const visibleAssignments = useMemo(() => assignments.filter((assignment) => {
    const matchesStatus = statusFilter === "all" || itemStatus(assignment) === statusFilter;
    const needle = search.trim().toLocaleLowerCase();
    const matchesSearch = !needle || [assignment.title, assignment.description, assignment.course_title].some((value) => String(value || "").toLocaleLowerCase().includes(needle));
    return matchesStatus && matchesSearch;
  }).sort((left, right) => new Date(left.due_date || 0) - new Date(right.due_date || 0)), [assignments, search, statusFilter]);

  const buildPath = (assignment) => {
    const isQuiz = itemType(assignment) === "quiz";
    if (courseId && classId) return isQuiz ? `/lms/courses/${courseId}/classes/${classId}/quizzes/${assignment.id}` : `/lms/courses/${courseId}/classes/${classId}/assignments/${assignment.id}/submit`;
    return isQuiz ? `/lms/quiz/${assignment.id}` : `/lms/assignment/${assignment.id}/submit`;
  };

  return (
    <div className="min-h-full bg-[#f6f9fd] dark:bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="mx-auto max-w-6xl space-y-6">

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm dark:shadow-none md:flex-row md:items-center md:justify-between">
          <div className="flex overflow-x-auto">
            {[
              ["all", "Tất cả", assignments.length],
              ["todo", "Cần làm", counts.todo],
              ["submitted", "Đã nộp", counts.submitted],
              ["graded", "Đã chấm", counts.graded],
              ["late", "Quá hạn", counts.late],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${
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
              const typeConfig = typeStyle[type];
              const status = itemStatus(assignment);
              const statusConfig = statusStyle[status];
              const Icon = typeConfig.icon;
              return (
                <article
                  key={assignment.id}
                  className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm dark:shadow-none transition hover:-translate-y-0.5 hover:shadow-md dark:hover:border-slate-700"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${typeConfig.className}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${typeConfig.className}`}>
                          {typeConfig.label}
                        </span>
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
                      <h2 className="mt-2 truncate text-base font-bold text-slate-900 dark:text-white">{assignment.title}</h2>
                      {assignment.description && (
                        <p className="mt-1 line-clamp-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{assignment.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>Hạn nộp: {assignment.due_date ? new Date(assignment.due_date).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "Không giới hạn"}</span>
                        <span className={status === "late" ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold text-amber-600 dark:text-amber-400"}>
                          {deadlineText(assignment.due_date)}
                        </span>
                      </div>
                    </div>
                    <Link
                      to={buildPath(assignment)}
                      className={`inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                        status === "graded"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : status === "submitted"
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                          : "bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-none hover:bg-blue-700"
                      }`}
                    >
                      {status === "graded" ? "Xem kết quả" : status === "submitted" ? "Xem bài đã nộp" : type === "quiz" ? "Làm bài thi" : "Mở bài tập"}
                    </Link>
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
