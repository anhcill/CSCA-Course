import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  RefreshCw,
  Search,
  Users,
  BarChart3,
} from "lucide-react";
import { fetchAdminAttendanceReport } from "../../features/api/lmsClient";

const emptyReport = { summary: {}, classes: [] };
const number = (value) => Number(value || 0).toLocaleString("vi-VN");
const percent = (value) =>
  value == null ? "—" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const dateTime = (value) =>
  value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const CARD_CLASS =
  "rounded-2xl sm:rounded-3xl border border-white/85 bg-white/95 shadow-[0_6px_24px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none";
const FILTER_BAR_CLASS =
  "rounded-2xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function sessionLabel(session) {
  if (session.finalizedAt) return "Đã chốt";
  if (session.status === "cancelled") return "Đã hủy";
  if (session.pending) return "Chưa chốt";
  return "Chưa chốt";
}

function SummaryCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`${CARD_CLASS} min-w-0 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

export default function AttendanceReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [report, setReport] = useState(emptyReport);
  const [expandedClass, setExpandedClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAdminAttendanceReport(filters);
      if (!result?.success || !Array.isArray(result.data?.classes)) {
        throw new Error(result?.message || "Không thể tải báo cáo điểm danh.");
      }
      setReport(result.data);
    } catch (err) {
      setError(err?.message || "Không thể tải báo cáo điểm danh.");
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = (event) => {
    event.preventDefault();
    if (from && to && from > to) {
      setFilterError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setFilterError("");
    setExpandedClass(null);
    setFilters({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setFilterError("");
    setExpandedClass(null);
    setFilters({});
  };

  const classes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi-VN");
    if (!term) return report.classes;
    return report.classes.filter((item) =>
      [item.className, item.courseName, item.teacherName].some((value) =>
        String(value || "").toLocaleLowerCase("vi-VN").includes(term)
      )
    );
  }, [report.classes, search]);

  const exportCsv = () => {
    const rows = [
      [
        "Lớp",
        "Khóa học",
        "Giáo viên",
        "Tổng buổi",
        "Đã chốt",
        "Chưa chốt",
        "Có mặt",
        "Vắng",
        "Có phép",
        "Tỷ lệ có mặt",
      ],
      ...classes.map((item) => [
        item.className,
        item.courseName,
        item.teacherName,
        item.sessionCount,
        item.finalizedSessions,
        item.pendingSessions,
        item.present,
        item.absent,
        item.excused,
        item.rate == null ? "" : `${item.rate}%`,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bao-cao-diem-danh${filters.from ? `-tu-${filters.from}` : ""}${
      filters.to ? `-den-${filters.to}` : ""
    }.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const summary = report.summary || {};

  return (
    <div className="min-w-0 space-y-5 pb-8">
      {/* Compact Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Thống kê điểm danh
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Theo dõi tỷ lệ chuyên cần theo từng lớp và buổi học đã chốt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className={BTN_SECONDARY}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || !classes.length}
            className={BTN_SECONDARY}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất CSV</span>
          </button>
          <Link to="/admin/attendance-review" className={BTN_PRIMARY}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span>Duyệt sửa điểm danh</span>
          </Link>
        </div>
      </header>

      {/* Date Filter Bar */}
      <form onSubmit={applyFilters} className={FILTER_BAR_CLASS}>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="min-w-[140px] flex-1 sm:max-w-[200px]">
            <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Từ ngày
            </span>
            <input
              type="date"
              className={INPUT_CLASS}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="min-w-[140px] flex-1 sm:max-w-[200px]">
            <span className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Đến ngày
            </span>
            <input
              type="date"
              className={INPUT_CLASS}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className={BTN_PRIMARY}>
              Áp dụng
            </button>
            <button type="button" onClick={clearFilters} className={BTN_SECONDARY}>
              Xóa lọc
            </button>
          </div>
          <div className="relative min-w-[200px] flex-1 sm:ml-auto sm:max-w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Tìm lớp, khóa học hoặc giáo viên"
              className={`${INPUT_CLASS} pl-8`}
              placeholder="Tìm lớp, khóa học, giáo viên..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {filterError && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            {filterError}
          </p>
        )}
      </form>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <span>{error}</span>
          <button type="button" onClick={load} className="font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={BarChart3}
          label="Lớp trong báo cáo"
          value={number(summary.classCount)}
          detail={`${number(summary.sessionCount)} buổi đã bắt đầu`}
          tone="bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Buổi đã chốt"
          value={number(summary.finalizedSessions)}
          detail={`${number(summary.pendingSessions)} buổi chưa chốt`}
          tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
        />
        <SummaryCard
          icon={Users}
          label="Lượt điểm danh"
          value={number((summary.present || 0) + (summary.absent || 0) + (summary.excused || 0))}
          detail={`${number(summary.present)} có mặt · ${number(summary.absent)} vắng · ${number(summary.excused)} phép`}
          tone="bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Tỷ lệ có mặt"
          value={percent(summary.rate)}
          detail="Tính trên lượt điểm danh đã chốt"
          tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
        />
      </div>

      {/* Table Card */}
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Chuyên cần theo từng lớp
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {classes.length} lớp hiển thị · Chọn tên lớp để xem chi tiết từng buổi.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            Đang tải báo cáo điểm danh...
          </p>
        ) : !classes.length ? (
          <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Không có lớp nào phù hợp bộ lọc hiện tại.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Lớp & Giáo viên</th>
                  <th className="px-3 py-2.5 text-right">Tổng buổi</th>
                  <th className="px-3 py-2.5 text-right">Đã chốt</th>
                  <th className="px-3 py-2.5 text-right">Chưa chốt</th>
                  <th className="px-3 py-2.5 text-right">Có mặt</th>
                  <th className="px-3 py-2.5 text-right">Vắng</th>
                  <th className="px-3 py-2.5 text-right">Có phép</th>
                  <th className="px-3 py-2.5 text-right">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/70 dark:text-slate-200">
                {classes.map((item) => (
                  <ClassRows
                    key={item.classId}
                    item={item}
                    expanded={expandedClass === item.classId}
                    onToggle={() =>
                      setExpandedClass(expandedClass === item.classId ? null : item.classId)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ClassRows({ item, expanded, onToggle }) {
  const rateNum = item.rate != null ? Number(item.rate) : null;
  return (
    <>
      <tr className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td className="px-3 py-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex items-start gap-2 text-left font-bold text-[#102f63] hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-200"
          >
            {expanded ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {item.className}
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {item.courseName || "—"} · {item.teacherName || "Chưa phân công"}
              </span>
            </span>
          </button>
        </td>
        <td className="px-3 py-2.5 text-right font-medium">{number(item.sessionCount)}</td>
        <td className="px-3 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-400">
          {number(item.finalizedSessions)}
        </td>
        <td className="px-3 py-2.5 text-right font-medium text-amber-700 dark:text-amber-400">
          {number(item.pendingSessions)}
        </td>
        <td className="px-3 py-2.5 text-right">{number(item.present)}</td>
        <td className="px-3 py-2.5 text-right text-rose-600 dark:text-rose-400">
          {number(item.absent)}
        </td>
        <td className="px-3 py-2.5 text-right">{number(item.excused)}</td>
        <td className="px-3 py-2.5 text-right">
          <span
            className={`inline-block rounded-lg px-2 py-0.5 font-bold ${
              rateNum == null
                ? "text-slate-400"
                : rateNum >= 80
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                : rateNum >= 60
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
            }`}
          >
            {percent(item.rate)}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70 dark:bg-slate-950/40">
          <td colSpan={8} className="px-4 py-3">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Chi tiết các buổi học · {item.className}
              </h3>
              <Link
                to={`/admin/classes/${encodeURIComponent(item.classId)}/attendance`}
                className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                Mở bảng điểm danh lớp
              </Link>
            </div>
            {!item.sessions?.length ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lớp chưa có buổi học trong khoảng lọc.
              </p>
            ) : (
              <div className="space-y-1.5">
                {item.sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="grid gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[minmax(200px,1fr)_150px_1fr] sm:items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {session.title || "Buổi học"}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {dateTime(session.startTime)}
                      </p>
                    </div>
                    <span
                      className={
                        session.finalizedAt
                          ? "font-semibold text-emerald-700 dark:text-emerald-300"
                          : session.pending
                          ? "font-semibold text-amber-700 dark:text-amber-300"
                          : "text-slate-500 dark:text-slate-400"
                      }
                    >
                      {sessionLabel(session)}
                      {session.finalizedAt && !session.reviewedAt ? " · Chờ duyệt" : ""}
                    </span>
                    <div className="text-slate-600 dark:text-slate-300 sm:text-right">
                      {session.finalizedAt ? (
                        <>
                          {number(session.present)} có mặt · {number(session.absent)} vắng ·{" "}
                          {number(session.excused)} phép{" "}
                          <span className="font-bold text-slate-900 dark:text-white">
                            ({percent(session.rate)})
                          </span>
                        </>
                      ) : (
                        "Chưa có số liệu chốt"
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
