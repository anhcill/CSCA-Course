/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  FiAward,
  FiBook,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiDownload,
  FiEye,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiTrendingUp,
  FiUsers,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { fetchAdminGradebookSummary, adminGradebookExportUrl } from "../../features/api/lmsClient";
import { panel, input, secondary, button } from "../../features/teacher/components/workflowStyles";

const emptyData = {
  kpis: {
    totalClasses: 0,
    totalStudents: 0,
    totalPassed: 0,
    totalFailed: 0,
    overallPassRate: 0,
    overallAverageScore: null,
  },
  charts: {
    distribution: [],
    passFail: [],
    classComparison: [],
  },
  reports: [],
  availableClasses: [],
};

const number = (val) => Number(val || 0).toLocaleString("vi-VN");
const percent = (val) => (val == null ? "—" : `${Number(val).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);
const dateTime = (val) =>
  val ? new Date(val).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";

function KpiCard({ icon: Icon, label, value, subtext, colorClass, bgClass }) {
  return (
    <div className={`${panel} flex flex-col justify-between p-5 transition hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bgClass}`}>
          <Icon className={`h-5 w-5 ${colorClass}`} />
        </div>
      </div>
      {subtext && <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{subtext}</p>}
    </div>
  );
}

export default function AdminGradesReportPage() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [inspectReport, setInspectReport] = useState(null);
  const [modalSearch, setModalSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminGradebookSummary({
        classId: selectedClassId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      if (!res?.success) throw new Error(res?.message || "Không thể tải dữ liệu báo cáo điểm.");
      setData(res.data || emptyData);
    } catch (err) {
      setError(err?.message || "Lỗi tải báo cáo điểm học viên.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, from, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data.reports || []).filter((r) => {
      const matchesSearch =
        !term ||
        (r.class_title && r.class_title.toLowerCase().includes(term)) ||
        (r.course_title && r.course_title.toLowerCase().includes(term)) ||
        (r.reported_by_name && r.reported_by_name.toLowerCase().includes(term)) ||
        (Array.isArray(r.snapshot?.rows) &&
          r.snapshot.rows.some(
            (s) =>
              (s.name && s.name.toLowerCase().includes(term)) ||
              (s.email && s.email.toLowerCase().includes(term))
          ));

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "high_pass"
          ? Number(r.pass_rate) >= 80
          : statusFilter === "low_pass"
          ? Number(r.pass_rate) < 60
          : true;

      return matchesSearch && matchesStatus;
    });
  }, [data.reports, search, statusFilter]);

  const modalFilteredStudents = useMemo(() => {
    if (!inspectReport || !Array.isArray(inspectReport.snapshot?.rows)) return [];
    const term = modalSearch.trim().toLowerCase();
    return inspectReport.snapshot.rows.filter(
      (s) =>
        !term ||
        (s.name && s.name.toLowerCase().includes(term)) ||
        (s.email && s.email.toLowerCase().includes(term))
    );
  }, [inspectReport, modalSearch]);

  const exportUrlXlsx = adminGradebookExportUrl({
    format: "xlsx",
    classId: selectedClassId || null,
    from: from || null,
    to: to || null,
  });

  const exportUrlCsv = adminGradebookExportUrl({
    format: "csv",
    classId: selectedClassId || null,
    from: from || null,
    to: to || null,
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FiAward className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Báo cáo & Thống kê điểm học viên
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tổng hợp điểm số và tỷ lệ đạt/chưa đạt được giáo viên báo cáo từ các lớp học
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className={`${secondary} inline-flex items-center gap-1.5 px-3 py-2 text-xs`}
            title="Tải lại dữ liệu mới nhất"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          <a
            href={exportUrlCsv}
            download
            className={`${secondary} inline-flex items-center gap-1.5 px-3 py-2 text-xs`}
          >
            <FiDownload className="h-3.5 w-3.5" />
            Xuất CSV
          </a>
          <a
            href={exportUrlXlsx}
            download
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <FiDownload className="h-3.5 w-3.5" />
            Xuất Excel (.xlsx)
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Đã xảy ra lỗi:</p>
          <p>{error}</p>
          <button onClick={loadData} className="mt-2 text-xs font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={FiBook}
          label="Lớp đã báo cáo"
          value={number(data.kpis?.totalClasses)}
          subtext="Lớp đã có báo cáo điểm số"
          bgClass="bg-blue-50 dark:bg-blue-950/60"
          colorClass="text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          icon={FiUsers}
          label="Tổng học viên"
          value={number(data.kpis?.totalStudents)}
          subtext={`${number(data.kpis?.totalPassed)} đạt · ${number(data.kpis?.totalFailed)} chưa đạt`}
          bgClass="bg-purple-50 dark:bg-purple-950/60"
          colorClass="text-purple-600 dark:text-purple-400"
        />
        <KpiCard
          icon={FiAward}
          label="Điểm TB hệ thống"
          value={data.kpis?.overallAverageScore != null ? `${data.kpis.overallAverageScore} /100` : "—"}
          subtext="Điểm trung bình các học viên"
          bgClass="bg-amber-50 dark:bg-amber-950/60"
          colorClass="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={FiTrendingUp}
          label="Tỷ lệ đạt chuẩn"
          value={percent(data.kpis?.overallPassRate)}
          subtext={`${number(data.kpis?.totalPassed)} / ${number(data.kpis?.totalStudents)} học viên đạt`}
          bgClass="bg-emerald-50 dark:bg-emerald-950/60"
          colorClass="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Score Distribution Bar Chart */}
        <div className={`${panel} lg:col-span-8`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Phổ điểm học viên (Toàn hệ thống)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Số lượng học viên phân theo các thang điểm /100
              </p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {number(data.kpis?.totalStudents)} học viên
            </span>
          </div>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts?.distribution || []} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={40} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`${value} học viên`, "Số lượng"]}
                  contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "0.75rem", color: "#f8fafc" }}
                  labelStyle={{ fontWeight: "bold" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(data.charts?.distribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill || "#3b82f6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pass / Fail Pie Chart */}
        <div className={`${panel} lg:col-span-4`}>
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Tỷ lệ Đạt / Chưa đạt
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kết quả tốt nghiệp/đạt chuẩn môn học
            </p>
          </div>
          <div className="h-64 sm:h-72 flex flex-col items-center justify-center">
            {data.kpis?.totalStudents > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.charts?.passFail || []}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(data.charts?.passFail || []).map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value} học viên (${Math.round((Number(value) / (data.kpis?.totalStudents || 1)) * 100)}%)`, "Số lượng"]}
                    contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "0.75rem", color: "#f8fafc" }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-xs text-slate-400">Chưa có dữ liệu học viên</div>
            )}
          </div>
        </div>

        {/* Class Averages Comparison Bar Chart */}
        {data.charts?.classComparison?.length > 0 && (
          <div className={`${panel} lg:col-span-12`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  So sánh điểm trung bình giữa các lớp
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Điểm trung bình và tỷ lệ đạt của từng lớp học đã báo cáo
                </p>
              </div>
            </div>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts?.classComparison || []} margin={{ top: 10, right: 20, left: -10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="className" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === "averageScore" ? `${value} /100` : `${value}%`,
                      name === "averageScore" ? "Điểm TB" : "Tỷ lệ đạt",
                    ]}
                    contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", borderRadius: "0.75rem", color: "#f8fafc" }}
                  />
                  <Legend verticalAlign="top" align="right" height={36} />
                  <Bar dataKey="averageScore" name="Điểm trung bình" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="passRate" name="Tỷ lệ đạt (%)" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className={`${panel} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="filter-class" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Lọc theo lớp
              </label>
              <select
                id="filter-class"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className={`${input} mt-1 text-xs`}
              >
                <option value="">Tất cả các lớp ({data.availableClasses?.length || 0})</option>
                {(data.availableClasses || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.courseTitle ? `(${c.courseTitle})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-status" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Tỷ lệ đạt
              </label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${input} mt-1 text-xs`}
              >
                <option value="all">Tất cả tỷ lệ</option>
                <option value="high_pass">Tỷ lệ đạt cao (&gt;= 80%)</option>
                <option value="low_pass">Cần lưu ý (&lt; 60%)</option>
              </select>
            </div>

            <div>
              <label htmlFor="date-from" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Từ ngày
              </label>
              <input
                id="date-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={`${input} mt-1 text-xs`}
              />
            </div>

            <div>
              <label htmlFor="date-to" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Đến ngày
              </label>
              <input
                id="date-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${input} mt-1 text-xs`}
              />
            </div>
          </div>

          <div className="w-full sm:w-64">
            <label htmlFor="search-input" className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Tìm kiếm
            </label>
            <div className="relative mt-1">
              <FiSearch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                id="search-input"
                type="text"
                placeholder="Tìm lớp, giáo viên, học viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${input} pl-9 text-xs`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className={`${panel} overflow-hidden p-0`}>
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Danh sách báo cáo điểm các lớp ({filteredReports.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bản ghi điểm số gần nhất được giáo viên cập nhật và báo cáo về hệ thống
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3.5">Lớp & Khóa học</th>
                <th className="px-4 py-3.5">Giáo viên báo cáo</th>
                <th className="px-4 py-3.5">Thời gian</th>
                <th className="px-4 py-3.5 text-center">Sĩ số</th>
                <th className="px-4 py-3.5 text-center">Điểm TB</th>
                <th className="px-4 py-3.5 text-center">Đạt / Chưa đạt</th>
                <th className="px-4 py-3.5 text-center">Tỷ lệ đạt</th>
                <th className="px-5 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    <p className="font-semibold">Chưa có báo cáo điểm nào phù hợp</p>
                    <p className="text-xs mt-1">
                      Khi giáo viên bấm "Cập nhật điểm" trên lớp phụ trách, dữ liệu sẽ tự động xuất hiện tại đây.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => {
                  const passRateNum = Number(report.pass_rate || 0);
                  const avgScoreNum = report.average_score != null ? Number(report.average_score) : null;
                  return (
                    <tr
                      key={report.id}
                      className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900 dark:text-white">{report.class_title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {report.course_title || "Chưa gắn khóa"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {report.reported_by_name || "—"}
                        </p>
                        <p className="text-[11px] text-slate-400">{report.reported_by_email}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-400">
                        {dateTime(report.created_at)}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-slate-800 dark:text-slate-200">
                        {report.student_count}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {avgScoreNum != null ? (
                          <span
                            className={`inline-block rounded-lg px-2 py-0.5 font-bold ${
                              avgScoreNum >= 80
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : avgScoreNum >= 50
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                                : "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                            }`}
                          >
                            {avgScoreNum}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-medium text-emerald-600">{report.pass_count} đạt</span>
                        {" / "}
                        <span className="font-medium text-rose-500">{report.fail_count} chưa</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`font-black ${
                            passRateNum >= 80
                              ? "text-emerald-600 dark:text-emerald-400"
                              : passRateNum >= 50
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {percent(report.pass_rate)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setInspectReport(report);
                              setModalSearch("");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <FiEye className="h-3 w-3" />
                            Chi tiết
                          </button>
                          <a
                            href={adminGradebookExportUrl({ format: "xlsx", classId: report.class_id })}
                            download
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                            title="Xuất bảng điểm lớp này"
                          >
                            <FiDownload className="h-3 w-3" />
                            XLSX
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Student Modal */}
      {inspectReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Bảng điểm chi tiết: {inspectReport.class_title}
                  </h3>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    {inspectReport.student_count} học viên
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Giáo viên: {inspectReport.reported_by_name} · Báo cáo lúc: {dateTime(inspectReport.created_at)}
                </p>
              </div>
              <button
                onClick={() => setInspectReport(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Actions & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/60 dark:bg-slate-950/40">
              <div className="relative w-full sm:w-72">
                <FiSearch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên học viên, email..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className={`${input} pl-9 text-xs`}
                />
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={adminGradebookExportUrl({ format: "xlsx", classId: inspectReport.class_id })}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                >
                  <FiDownload className="h-3.5 w-3.5" />
                  Xuất XLSX lớp này
                </a>
              </div>
            </div>

            {/* Student Table */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400 sticky top-0">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3">Học viên</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-center">Chuyên cần</th>
                    <th className="px-4 py-3 text-center">Tổng điểm (/100)</th>
                    <th className="px-4 py-3 text-center">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {modalFilteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Không tìm thấy học viên phù hợp
                      </td>
                    </tr>
                  ) : (
                    modalFilteredStudents.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {st.name}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {st.email}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                          {st.attendancePercent != null ? `${Math.round(st.attendancePercent * 10) / 10}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                          {st.total != null ? st.total : "Chưa có"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {st.passed === null ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Chưa xác định
                            </span>
                          ) : st.passed ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <FiCheckCircle className="h-3 w-3" />
                              Đạt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              <FiXCircle className="h-3 w-3" />
                              Chưa đạt
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 p-4 text-right dark:border-slate-800">
              <button
                onClick={() => setInspectReport(null)}
                className={`${secondary} px-4 py-2 text-xs`}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
