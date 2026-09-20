import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAssignments } from "../../api/lmsClient";
import { LoadingState, EmptyState, ErrorState } from "../../../components/common/StateView";

/* ── SVG Icons ────────────────────────────────────────────────── */
const IconPen = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
const IconQuiz = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);
const IconMic = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);
const IconSearch = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
  </svg>
);

function getItemType(item) {
  const t = (item.type || "homework").toLowerCase();
  if (t.includes("quiz") || t.includes("trac_nghiem")) return "quiz";
  if (t.includes("speak") || t.includes("hskk") || t.includes("noi")) return "hskk";
  return "homework";
}

function getTypeConfig(item) {
  const type = getItemType(item);
  if (type === "quiz") return { icon: <IconQuiz />, label: "Trắc Nghiệm", cls: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
  if (type === "hskk") return { icon: <IconMic />, label: "HSKK Khẩu Ngữ", cls: "bg-violet-500/20 text-violet-400 border-violet-500/30" };
  return { icon: <IconPen />, label: "Bài Tập Tự Luận", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
}

function getItemStatus(item) {
  if (item.score !== undefined && item.score !== null) return "graded";
  if (item.status === "late") return "late";
  if (item.submitted_at || item.status === "submitted") return "submitted";
  const due = new Date(item.due_date);
  if (due < new Date()) return "late";
  return "todo";
}

function getStatusChip(item) {
  const status = getItemStatus(item);
  if (status === "graded") return { label: `Đã Chấm: ${item.score}đ`, cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
  if (status === "submitted") return { label: "Đã Nộp • Đang Chấm", cls: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
  if (status === "late") return { label: "Quá Hạn", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
  return { label: "Cần Làm", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
}

function timeRemaining(dueDate) {
  if (!dueDate) return "Theo thời lượng đề";
  const diff = new Date(dueDate) - new Date();
  if (diff <= 0) return "Hết hạn";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `Còn ${d} ngày ${h} giờ`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `Còn ${h} giờ ${m} phút`;
}

export default function AssignmentListPage() {
  const { courseId } = useParams();
  const assignmentPath = (assignmentId) => courseId
    ? `/lms/courses/${courseId}/workspace/assignments/${assignmentId}/submit`
    : `/lms/assignment/${assignmentId}/submit`;
  const quizPath = (quizId) => courseId
    ? `/lms/courses/${courseId}/workspace/quizzes/${quizId}`
    : `/lms/quiz/${quizId}`;
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Filter States: status tab & type filter
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | TODO | SUBMITTED | GRADED | LATE
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL | HOMEWORK | QUIZ | HSKK
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("deadline");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetchAssignments({ courseId });
      if (res.success && res.data) {
        setAssignments(res.data);
      } else {
        setAssignments([]);
      }
    } catch (err) {
      console.error("Error loading assignments:", err);
      setErrorMsg("Không thể tải danh sách bài tập. Vui lòng kiểm tra kết nối mạng!");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Statistics calculation across all items
  const stats = useMemo(() => {
    let todoCount = 0;
    let submittedCount = 0;
    let gradedCount = 0;
    let lateCount = 0;

    assignments.forEach((a) => {
      const st = getItemStatus(a);
      if (st === "todo") todoCount += 1;
      else if (st === "submitted") submittedCount += 1;
      else if (st === "graded") gradedCount += 1;
      else if (st === "late") lateCount += 1;
    });

    return {
      total: assignments.length,
      todo: todoCount,
      submitted: submittedCount,
      graded: gradedCount,
      late: lateCount,
    };
  }, [assignments]);

  // Filtered & Sorted list
  const list = useMemo(() => {
    let items = [...assignments];

    // Status filter
    if (statusFilter !== "ALL") {
      items = items.filter((a) => getItemStatus(a) === statusFilter.toLowerCase());
    }

    // Type filter
    if (typeFilter !== "ALL") {
      items = items.filter((a) => getItemType(a) === typeFilter.toLowerCase());
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      items = items.filter(
        (a) =>
          (a.title || "").toLowerCase().includes(q) ||
          (a.description || "").toLowerCase().includes(q) ||
          (a.course_title || "").toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === "deadline") {
      items.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    } else if (sortBy === "score") {
      items.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    } else if (sortBy === "newest") {
      items.sort((a, b) => new Date(b.created_at || b.due_date) - new Date(a.created_at || a.due_date));
    }

    return items;
  }, [assignments, statusFilter, typeFilter, search, sortBy]);

  const STATUS_TABS = [
    { id: "ALL",       label: "Tất Cả",           count: stats.total },
    { id: "TODO",      label: "Cần Làm",          count: stats.todo },
    { id: "SUBMITTED", label: "Đã Nộp (Chờ Chấm)", count: stats.submitted },
    { id: "GRADED",    label: "Đã Chấm Điểm",      count: stats.graded },
    { id: "LATE",      label: "Quá Hạn",          count: stats.late },
  ];

  const TYPE_FILTERS = [
    { id: "ALL",      label: "Tất Cả Định Dạng" },
    { id: "HOMEWORK", label: "Bài Tập Tự Luận" },
    { id: "QUIZ",     label: "Trắc Nghiệm Quiz" },
    { id: "HSKK",     label: "Khẩu Ngữ HSKK" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Compact Dashboard Header */}
      <div className="border-b border-white/[0.08] bg-slate-900/40 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-5">
        <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                LMS • Luyện Đề & Bài Tập
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {courseId ? "Bài Tập & Quiz Của Khóa Học" : "Bài Tập & Đề Thi Trắc Nghiệm"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Theo dõi hạn nộp, làm bài trắc nghiệm và nộp bài khẩu ngữ HSKK/tự luận CSCA.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="px-3.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-right">
              <span className="text-[10px] font-mono text-slate-400 block">Tỷ lệ hoàn thành</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {stats.total > 0 ? Math.round(((stats.submitted + stats.graded) / stats.total) * 100) : 0}% ({stats.submitted + stats.graded}/{stats.total})
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {/* Statistics Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Cần hoàn thành", value: stats.todo, color: "text-amber-400", bg: "from-amber-500/10 to-transparent border-amber-500/20" },
            { label: "Đã nộp chờ chấm", value: stats.submitted, color: "text-sky-400", bg: "from-sky-500/10 to-transparent border-sky-500/20" },
            { label: "Đã chấm điểm", value: stats.graded, color: "text-emerald-400", bg: "from-emerald-500/10 to-transparent border-emerald-500/20" },
            { label: "Quá hạn nộp", value: stats.late, color: "text-rose-400", bg: "from-rose-500/10 to-transparent border-rose-500/20" },
          ].map((s) => (
            <div key={s.label} className={`bg-gradient-to-br ${s.bg} bg-slate-900/60 border rounded-2xl p-3.5 text-center`}>
              <p className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Status Tabs Navigation - Linear Glass Segmented Pill */}
        <div className="inline-flex p-1 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.3)] overflow-x-auto max-w-full">
          <div className="flex items-center gap-1">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 select-none whitespace-nowrap ${
                    active
                      ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_4px_16px_-2px_rgba(244,63,94,0.45),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`}
                >
                  {tab.id === "LATE" && !active && tab.count > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md transition-colors ${
                      active
                        ? "bg-black/20 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Filter & Search Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
          {/* Type filters */}
          <div className="flex gap-2 flex-wrap">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTypeFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  typeFilter === f.id
                    ? "bg-slate-800 text-white border border-slate-700 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search & Sort */}
          <div className="flex gap-3 w-full md:w-auto items-center">
            <div className="relative flex-1 md:w-60">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <IconSearch />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên bài tập..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="deadline">Hạn chót gần nhất</option>
              <option value="score">Điểm số cao nhất</option>
              <option value="newest">Bài mới giao</option>
            </select>
          </div>
        </div>

        {/* Assignment List Content */}
        {loading ? (
          <LoadingState message="Đang nạp danh sách bài tập của bạn..." count={3} />
        ) : errorMsg ? (
          <ErrorState title="Lỗi Nạp Bài Tập" message={errorMsg} onRetry={loadData} />
        ) : list.length === 0 ? (
          <EmptyState
            title="Không Có Bài Tập Phù Hợp"
            message={
              statusFilter === "ALL" && typeFilter === "ALL"
                ? "Hiện tại bạn không có bài tập nào cần thực hiện."
                : "Không có bài tập nào phù hợp với bộ lọc bạn đang chọn."
            }
            actionLabel={statusFilter !== "ALL" || typeFilter !== "ALL" ? "Đặt Lại Bộ Lọc" : null}
            onAction={() => {
              setStatusFilter("ALL");
              setTypeFilter("ALL");
              setSearch("");
            }}
          />
        ) : (
          <div className="space-y-4">
            {list.map((item) => {
              const tc = getTypeConfig(item);
              const sc = getStatusChip(item);
              const remaining = timeRemaining(item.due_date);
              const itemType = getItemType(item);
              const itemStatus = getItemStatus(item);

              return (
                <div
                  key={item.id}
                  className="group bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 md:p-6 transition-all hover:shadow-xl space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Format Icon */}
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${tc.cls}`}>
                      {tc.icon}
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${tc.cls}`}>
                          {tc.label}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sc.cls}`}>
                          {sc.label}
                        </span>
                        {item.course_title && (
                          <span className="text-[11px] text-slate-400 font-medium truncate max-w-[200px]">
                            {item.course_title}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base md:text-lg font-bold text-white group-hover:text-rose-400 transition truncate">
                        {item.title}
                      </h3>

                      {item.description && (
                        <p className="text-xs text-slate-400 line-clamp-1 font-light">
                          {item.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                        <span>
                          Hạn nộp: <strong className="text-slate-300">{new Date(item.due_date).toLocaleDateString("vi-VN")}</strong>
                        </span>
                        <span className={remaining === "Hết hạn" ? "text-rose-400 font-bold" : "text-amber-400 font-medium"}>
                          {remaining}
                        </span>
                        {item.max_score && (
                          <span className="text-slate-500 font-mono">
                            Thang điểm: {item.max_score}đ
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Smart Contextual Action Button */}
                    <div className="shrink-0 flex items-center">
                      {itemType === "quiz" ? (
                        itemStatus === "graded" ? (
                          <Link
                            to={quizPath(item.id)}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-600/20"
                          >
                            Xem Kết Quả Quiz →
                          </Link>
                        ) : (
                          <Link
                            to={quizPath(item.id)}
                            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-sky-600/20"
                          >
                            Làm Trắc Nghiệm →
                          </Link>
                        )
                      ) : itemStatus === "graded" ? (
                        <Link
                          to={assignmentPath(item.id)}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                        >
                          <span>★ Xem Điểm & Nhận Xét</span>
                        </Link>
                      ) : itemStatus === "submitted" ? (
                        <Link
                          to={assignmentPath(item.id)}
                          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition border border-slate-700"
                        >
                          Xem Bài Đã Nộp →
                        </Link>
                      ) : itemStatus === "late" ? (
                        <Link
                          to={assignmentPath(item.id)}
                          className="px-5 py-2.5 bg-rose-600/80 hover:bg-rose-600 text-white font-bold rounded-xl text-xs transition"
                        >
                          Nộp Bài Trễ →
                        </Link>
                      ) : (
                        <Link
                          to={assignmentPath(item.id)}
                          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-rose-600/20"
                        >
                          Nộp Bài Ngay →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
