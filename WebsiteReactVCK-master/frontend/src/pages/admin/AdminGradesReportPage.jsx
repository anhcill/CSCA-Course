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
  Award,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { fetchAdminGradebookSummary, adminGradebookExportUrl } from "../../features/api/lmsClient";

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
const percent = (val) =>
  val == null ? "—" : `${Number(val).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const dateTime = (val) =>
  val ? new Date(val).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";

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

function KpiCard({ icon: Icon, label, value, subtext, colorClass, bgClass }) {
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
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bgClass}`}>
          <Icon className={`h-4 w-4 ${colorClass}`} />
        </div>
      </div>
      {subtext && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
      )}
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
    <div className="min-w-0 space-y-5 pb-8">
      {/* Compact Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Báo cáo điểm học viên
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tổng hợp điểm trung bình và tỷ lệ đạt chuẩn từ bảng điểm các lớp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className={BTN_SECONDARY}
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
          <a href={exportUrlCsv} download className={BTN_SECONDARY}>
            <Download className="h-3.5 w-3.5" />
            <span>Xuất CSV</span>
          </a>
          <a href={exportUrlXlsx} download className={BTN_PRIMARY}>
            <Download className="h-3.5 w-3.5" />
            <span>Xuất Excel</span>
          </a>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <span>{error}</span>
          <button type="button" onClick={loadData} className="font-bold underline">
            Thử lại
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={BookOpen}
          label="Lớp đã báo cáo"
          value={number(data.kpis?.totalClasses)}
          subtext="Lớp đã gửi bảng điểm"
          bgClass="bg-blue-50 dark:bg-blue-950/60"
          colorClass="text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          icon={Users}
          label="Tổng học viên"
          value={number(data.kpis?.totalStudents)}
          subtext={`${number(data.kpis?.totalPassed)} đạt · ${number(data.kpis?.totalFailed)} chưa đạt`}
          bgClass="bg-indigo-50 dark:bg-indigo-950/60"
          colorClass="text-indigo-600 dark:text-indigo-400"
        />
        <KpiCard
          icon={Award}
          label="Điểm trung bình"
          value={data.kpis?.overallAverageScore != null ? `${data.kpis.overallAverageScore}/100` : "—"}
          subtext="Trung bình toàn hệ thống"
          bgClass="bg-amber-50 dark:bg-amber-950/60"
          colorClass="text-amber-600 dark:text-amber-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Tỷ lệ đạt chuẩn"
          value={percent(data.kpis?.overallPassRate)}
          subtext={`${number(data.kpis?.totalPassed)}/${number(data.kpis?.totalStudents)} học viên đạt`}
          bgClass="bg-emerald-50 dark:bg-emerald-950/60"
          colorClass="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Score Distribution Bar Chart */}
        <div className={`${CARD_CLASS} min-w-0 p-4 sm:p-5 lg:col-span-8`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Phổ điểm học viên
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Phân bổ số lượng học viên theo thang điểm 100
              </p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {number(data.kpis?.totalStudents)} học viên
            </span>
          </div>
          <div className="h-60 sm:h-68">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.charts?.distribution || []}
                margin={{ top: 8, right: 10, left: -20, bottom: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-10}
                  textAnchor="end"
                  height={38}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`${value} học viên`, "Số lượng"]}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: "bold" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(data.charts?.distribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill || "#2563eb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pass / Fail Pie Chart */}
        <div className={`${CARD_CLASS} min-w-0 p-4 sm:p-5 lg:col-span-4`}>
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Tỷ lệ Đạt / Chưa đạt
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Kết quả đánh giá chung các lớp
            </p>
          </div>
          <div className="flex h-60 flex-col items-center justify-center sm:h-68">
            {data.kpis?.totalStudents > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.charts?.passFail || []}
                    cx="50%"
                    cy="45%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(data.charts?.passFail || []).map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [
                      `${value} học viên (${Math.round(
                        (Number(value) / (data.kpis?.totalStudents || 1)) * 100
                      )}%)`,
                      "Số lượng",
                    ]}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                  />
                  <Legend verticalAlign="bottom" height={34} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-xs text-slate-400">Chưa có dữ liệu học viên</div>
            )}
          </div>
        </div>

        {/* Class Averages Comparison Bar Chart */}
        {data.charts?.classComparison?.length > 0 && (
          <div className={`${CARD_CLASS} min-w-0 p-4 sm:p-5 lg:col-span-12`}>
            <div className="mb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                So sánh điểm trung bình giữa các lớp
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Điểm trung bình và tỷ lệ đạt của từng lớp đã báo cáo
              </p>
            </div>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.charts?.classComparison || []}
                  margin={{ top: 8, right: 16, left: -12, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis
                    dataKey="className"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === "averageScore" ? `${value} /100` : `${value}%`,
                      name === "averageScore" ? "Điểm TB" : "Tỷ lệ đạt",
                    ]}
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                  />
                  <Legend verticalAlign="top" align="right" height={32} />
                  <Bar
                    dataKey="averageScore"
                    name="Điểm trung bình"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="passRate"
                    name="Tỷ lệ đạt (%)"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className={FILTER_BAR_CLASS}>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label
              htmlFor="filter-class"
              className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300"
            >
              Lớp học
            </label>
            <select
              id="filter-class"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Tất cả lớp ({data.availableClasses?.length || 0})</option>
              {(data.availableClasses || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} {c.courseTitle ? `(${c.courseTitle})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-status"
              className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300"
            >
              Mức tỷ lệ đạt
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="all">Tất cả tỷ lệ</option>
              <option value="high_pass">Đạt cao (&ge; 80%)</option>
              <option value="low_pass">Cần lưu ý (&lt; 60%)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="date-from"
              className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300"
            >
              Từ ngày
            </label>
            <input
              id="date-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label
              htmlFor="date-to"
              className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300"
            >
              Đến ngày
            </label>
            <input
              id="date-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label
              htmlFor="search-input"
              className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300"
            >
              Tìm kiếm
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="search-input"
                type="text"
                placeholder="Lớp, giáo viên, học viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${INPUT_CLASS} pl-8`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <section className={`${CARD_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Bảng điểm các lớp ({filteredReports.length})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Bản ghi điểm số gần nhất do giáo viên gửi lên hệ thống.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Lớp & Khóa học</th>
                <th className="px-3 py-2.5">Giáo viên</th>
                <th className="px-3 py-2.5">Thời gian</th>
                <th className="px-3 py-2.5 text-center">Sĩ số</th>
                <th className="px-3 py-2.5 text-center">Điểm TB</th>
                <th className="px-3 py-2.5 text-center">Đạt / Chưa đạt</th>
                <th className="px-3 py-2.5 text-center">Tỷ lệ đạt</th>
                <th className="px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/70 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Đang tải báo cáo điểm...
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    <p className="font-semibold">Chưa có báo cáo điểm phù hợp</p>
                    <p className="mt-1 text-[11px]">
                      Dữ liệu sẽ xuất hiện khi giáo viên cập nhật bảng điểm của lớp phụ trách.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => {
                  const passRateNum = Number(report.pass_rate || 0);
                  const avgScoreNum =
                    report.average_score != null ? Number(report.average_score) : null;
                  return (
                    <tr
                      key={report.id}
                      className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {report.class_title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {report.course_title || "Chưa gắn khóa"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {report.reported_by_name || "—"}
                        </p>
                        <p className="text-[11px] text-slate-400">{report.reported_by_email}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {dateTime(report.created_at)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-slate-800 dark:text-slate-200">
                        {report.student_count}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {avgScoreNum != null ? (
                          <span
                            className={`inline-block rounded-lg px-2 py-0.5 font-bold ${
                              avgScoreNum >= 80
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : avgScoreNum >= 50
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            }`}
                          >
                            {avgScoreNum}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {report.pass_count} đạt
                        </span>
                        <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                        <span className="font-semibold text-rose-500 dark:text-rose-400">
                          {report.fail_count} chưa
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
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
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectReport(report);
                              setModalSearch("");
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Chi tiết</span>
                          </button>
                          <a
                            href={adminGradebookExportUrl({
                              format: "xlsx",
                              classId: report.class_id,
                            })}
                            download
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                            title="Xuất bảng điểm lớp này"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Excel</span>
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
      </section>

      {/* Detailed Student Modal */}
      {inspectReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-4 backdrop-blur-xs">
          <div className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-black text-[#102f63] dark:text-white">
                    Bảng điểm lớp: {inspectReport.class_title}
                  </h3>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {inspectReport.student_count} học viên
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Giáo viên: {inspectReport.reported_by_name} · Cập nhật:{" "}
                  {dateTime(inspectReport.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectReport(null)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Search & Export */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên học viên, email..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className={`${INPUT_CLASS} pl-8`}
                />
              </div>

              <a
                href={adminGradebookExportUrl({
                  format: "xlsx",
                  classId: inspectReport.class_id,
                })}
                download
                className={BTN_PRIMARY}
              >
                <Download className="h-3.5 w-3.5" />
                <span>Xuất Excel lớp này</span>
              </a>
            </div>

            {/* Student Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Học viên</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5 text-center">Chuyên cần</th>
                    <th className="px-3 py-2.5 text-center">Tổng điểm (/100)</th>
                    <th className="px-4 py-2.5 text-center">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {modalFilteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Không tìm thấy học viên phù hợp.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredStudents.map((st) => (
                      <tr
                        key={st.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                          {st.name}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                          {st.email}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300">
                          {st.attendancePercent != null
                            ? `${Math.round(st.attendancePercent * 10) / 10}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-900 dark:text-white">
                          {st.total != null ? st.total : "Chưa có"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {st.passed === null ? (
                            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Chưa xác định
                            </span>
                          ) : st.passed ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              Đạt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              <XCircle className="h-3 w-3" />
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
            <div className="flex justify-end border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInspectReport(null)}
                className={BTN_SECONDARY}
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
