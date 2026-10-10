/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiBarChart2, FiChevronDown, FiChevronRight, FiDownload, FiRefreshCw } from "react-icons/fi";
import { fetchAdminAttendanceReport } from "../../features/api/lmsClient";
import { button, input, panel, secondary } from "../../features/teacher/components/workflowStyles";

const emptyReport = { summary: {}, classes: [] };
const number = (value) => Number(value || 0).toLocaleString("vi-VN");
const percent = (value) => value == null ? "—" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const dateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function sessionLabel(session) {
  if (session.finalizedAt) return "Đã chốt";
  if (session.status === "cancelled") return "Đã hủy";
  if (session.pending) return "Chưa chốt";
  return "Chưa chốt";
}

function SummaryCard({ label, value, detail }) {
  return <div className={panel + " min-w-0"}>
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
  </div>;
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

  useEffect(() => { load(); }, [load]);

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
    return report.classes.filter((item) => [item.className, item.courseName, item.teacherName]
      .some((value) => String(value || "").toLocaleLowerCase("vi-VN").includes(term)));
  }, [report.classes, search]);

  const exportCsv = () => {
    const rows = [
      ["Lớp", "Khóa học", "Giáo viên", "Tổng buổi", "Đã chốt", "Chưa chốt", "Có mặt", "Vắng", "Có phép", "Tỷ lệ có mặt"],
      ...classes.map((item) => [item.className, item.courseName, item.teacherName, item.sessionCount,
        item.finalizedSessions, item.pendingSessions, item.present, item.absent, item.excused,
        item.rate == null ? "" : `${item.rate}%`]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bao-cao-diem-danh${filters.from ? `-tu-${filters.from}` : ""}${filters.to ? `-den-${filters.to}` : ""}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const summary = report.summary || {};
  return <div className="mx-auto max-w-7xl space-y-6 pb-12 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"><FiBarChart2 /> Báo cáo đào tạo</div>
        <h1 className="text-2xl font-bold sm:text-3xl">Thống kê điểm danh các lớp</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chỉ tính các buổi đã bắt đầu, không gồm buổi đã hủy. Số lượt có mặt, vắng và có phép lấy từ điểm danh giáo viên đã chốt; admin kiểm tra sau.</p>
      </div>
      <Link to="/admin/attendance-review" className={secondary}>Kiểm tra bản chốt</Link>
    </header>

    <form onSubmit={applyFilters} className={panel + " flex flex-wrap items-end gap-3"}>
      <label className="min-w-40 flex-1 text-sm font-medium">Từ ngày<input type="date" className={input + " mt-1"} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="min-w-40 flex-1 text-sm font-medium">Đến ngày<input type="date" className={input + " mt-1"} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" className={button}>Áp dụng</button>
      <button type="button" className={secondary} onClick={clearFilters}>Xóa lọc</button>
      {filterError && <p role="alert" className="w-full text-sm text-red-600">{filterError}</p>}
    </form>

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error} <button type="button" onClick={load} className="ml-2 font-semibold underline">Thử lại</button></div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Lớp trong báo cáo" value={number(summary.classCount)} detail={`${number(summary.sessionCount)} buổi đã bắt đầu trong khoảng lọc`} />
      <SummaryCard label="Buổi đã chốt" value={number(summary.finalizedSessions)} detail={`${number(summary.pendingSessions)} buổi đã bắt đầu, chưa chốt`} />
      <SummaryCard label="Lượt điểm danh" value={number((summary.present || 0) + (summary.absent || 0) + (summary.excused || 0))} detail={`${number(summary.present)} có mặt · ${number(summary.absent)} vắng · ${number(summary.excused)} có phép`} />
      <SummaryCard label="Tỷ lệ có mặt" value={percent(summary.rate)} detail="Có mặt / tổng lượt điểm danh đã chốt" />
    </div>

    <section className={panel + " space-y-4"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-bold">Theo từng lớp</h2><p className="mt-1 text-xs text-slate-500">{classes.length} lớp hiển thị · Mở một lớp để xem từng buổi.</p></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input aria-label="Tìm lớp, khóa học hoặc giáo viên" className={input + " min-w-52 flex-1"} placeholder="Tìm lớp, khóa học, giáo viên" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" aria-label="Tải lại báo cáo" title="Tải lại" className={secondary} onClick={load} disabled={loading}><FiRefreshCw /></button>
          <button type="button" className={secondary + " inline-flex items-center gap-2"} onClick={exportCsv} disabled={loading || !classes.length}><FiDownload /> Xuất CSV</button>
        </div>
      </div>
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Đang tải báo cáo điểm danh...</p> : !classes.length ?
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-800">Không có lớp nào trong bộ lọc này.</p> :
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>
              <th className="px-3 py-3">Lớp / giáo viên</th><th className="px-3 py-3 text-right">Buổi</th><th className="px-3 py-3 text-right">Đã chốt</th><th className="px-3 py-3 text-right">Chưa chốt</th><th className="px-3 py-3 text-right">Có mặt</th><th className="px-3 py-3 text-right">Vắng</th><th className="px-3 py-3 text-right">Có phép</th><th className="px-3 py-3 text-right">Tỷ lệ</th>
            </tr></thead>
            <tbody>{classes.map((item) => <ClassRows key={item.classId} item={item} expanded={expandedClass === item.classId} onToggle={() => setExpandedClass(expandedClass === item.classId ? null : item.classId)} />)}</tbody>
          </table>
        </div>}
    </section>
  </div>;
}

function ClassRows({ item, expanded, onToggle }) {
  return <>
    <tr className="border-t border-slate-200 dark:border-slate-700">
      <td className="px-3 py-3"><button type="button" aria-expanded={expanded} onClick={onToggle} className="flex items-start gap-2 text-left font-semibold text-blue-700 hover:underline dark:text-blue-300">{expanded ? <FiChevronDown className="mt-0.5 shrink-0" /> : <FiChevronRight className="mt-0.5 shrink-0" />}<span>{item.className}<span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{item.courseName || "—"} · {item.teacherName || "Chưa phân công"}</span></span></button></td>
      <td className="px-3 py-3 text-right">{number(item.sessionCount)}</td><td className="px-3 py-3 text-right">{number(item.finalizedSessions)}</td><td className="px-3 py-3 text-right">{number(item.pendingSessions)}</td><td className="px-3 py-3 text-right">{number(item.present)}</td><td className="px-3 py-3 text-right">{number(item.absent)}</td><td className="px-3 py-3 text-right">{number(item.excused)}</td><td className="px-3 py-3 text-right font-semibold">{percent(item.rate)}</td>
    </tr>
    {expanded && <tr className="border-t border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40"><td colSpan={8} className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">Các buổi của {item.className}</h3><Link to={`/admin/classes/${encodeURIComponent(item.classId)}/attendance`} className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">Mở điểm danh lớp</Link></div>
      {!item.sessions?.length ? <p className="text-sm text-slate-500">Lớp chưa có buổi học trong khoảng lọc.</p> : <div className="space-y-2">{item.sessions.map((session) => <div key={session.sessionId} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-[minmax(220px,1fr)_120px_1fr] sm:items-center">
        <div><p className="font-semibold text-sm">{session.title || "Buổi học"}</p><p className="text-slate-500">{dateTime(session.startTime)}</p></div>
        <span className={session.finalizedAt ? "font-semibold text-emerald-700 dark:text-emerald-300" : session.pending ? "font-semibold text-amber-700 dark:text-amber-300" : "text-slate-500"}>{sessionLabel(session)}{session.finalizedAt && !session.reviewedAt ? " · Chờ kiểm tra" : ""}</span>
        <div className="sm:text-right">{session.finalizedAt ? <>{number(session.present)} có mặt · {number(session.absent)} vắng · {number(session.excused)} có phép <span className="font-bold">({percent(session.rate)})</span></> : "Chưa có số liệu chốt"}</div>
      </div>)}</div>}
    </td></tr>}
  </>;
}
