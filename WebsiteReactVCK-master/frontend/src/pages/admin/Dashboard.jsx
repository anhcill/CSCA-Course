import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  GraduationCap,
  MessageSquare,
  RefreshCw,
  Shield,
  TrendingUp,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { fetchAdminDashboardKpi } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";
import { ErrorState } from "../../components/common/StateView";

const EMPTY_ADMIN_KPIS = {
  activeLearnersCount: 0,
  totalEnrollmentsCount: 0,
  pendingGradingCount: 0,
  completionRate: "0%",
  avgAttendanceRate: "0%",
  totalRevenueVnd: "0 đ",
  monthlyGrowthPct: "0.0%",
  recentActivities: [],
  monthlyEnrollmentStats: [],
  users: { total: 0, activeLearners: 0, creators: 0, admins: 0, locked: 0 },
  courses: { total: 0, published: 0, drafts: 0 },
  entitlements: { active: 0, suspended: 0, inactive: 0 },
  syncJobs: { deadLetter: 0 },
};

const QUICK_WORKSPACES = [
  {
    label: "Lớp học",
    hint: "Duyệt & ánh xạ lớp",
    to: "/admin/classes",
    icon: BookOpen,
    tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-sky-400",
  },
  {
    label: "Lịch dạy",
    hint: "Điều phối buổi học",
    to: "/admin/calendar",
    icon: CalendarDays,
    tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
  },
  {
    label: "Lương & Công",
    hint: "Chấm công Face ID",
    to: "/admin/salaries",
    icon: Wallet,
    tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  },
  {
    label: "Chấm bài & Quiz",
    hint: "Bài tập & ngân hàng đề",
    to: "/admin/assignments/review",
    icon: ClipboardCheck,
    tone: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400",
  },
  {
    label: "Người dùng",
    hint: "Học viên & giảng viên",
    to: "/admin/users",
    icon: Users,
    tone: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400",
  },
  {
    label: "Hỗ trợ HV",
    hint: "Phản hồi yêu cầu",
    to: "/admin/support",
    icon: MessageSquare,
    tone: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400",
  },
];

export default function Dashboard() {
  const [kpiData, setKpiData] = useState(EMPTY_ADMIN_KPIS);
  const [loadingKpi, setLoadingKpi] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpiError, setKpiError] = useState("");

  const loadKpis = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoadingKpi(true);
    }
    setKpiError("");
    try {
      const res = await fetchAdminDashboardKpi();
      if (!res?.success || !res.data) {
        throw new Error(res?.message || "Không thể tải dữ liệu quản trị");
      }
      setKpiData({ ...EMPTY_ADMIN_KPIS, ...res.data });
    } catch (error) {
      setKpiError(error?.message || "Không thể tải dữ liệu quản trị");
    } finally {
      setLoadingKpi(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  const chartMax = useMemo(
    () =>
      Math.max(
        1,
        ...kpiData.monthlyEnrollmentStats.flatMap((item) => [
          Number(item.enrollments) || 0,
          Number(item.users) || 0,
        ]),
      ),
    [kpiData.monthlyEnrollmentStats],
  );

  const kpiCards = useMemo(
    () => [
      {
        id: "users",
        label: "Người dùng",
        value: kpiData.users.total,
        sub: `${kpiData.activeLearnersCount} học viên đang học`,
        icon: Users,
        accent: "from-blue-600 to-indigo-600",
        to: "/admin/users",
      },
      {
        id: "courses",
        label: "Khóa học",
        value: kpiData.courses.total,
        sub: `${kpiData.courses.published} công khai · ${kpiData.courses.drafts} nháp`,
        icon: GraduationCap,
        accent: "from-emerald-600 to-teal-600",
        to: "/admin/curriculum",
      },
      {
        id: "enrollments",
        label: "Lượt ghi danh",
        value: kpiData.totalEnrollmentsCount,
        sub: `Hoàn thành ${kpiData.completionRate}`,
        badge: kpiData.monthlyGrowthPct,
        icon: CheckCircle2,
        accent: "from-violet-600 to-purple-600",
        to: "/admin/classes",
      },
      {
        id: "attendance",
        label: "Chuyên cần Live",
        value: kpiData.avgAttendanceRate,
        sub: `${kpiData.pendingGradingCount} bài chờ chấm`,
        icon: Video,
        accent: "from-amber-500 to-orange-600",
        to: "/admin/attendance-report",
      },
    ],
    [kpiData],
  );

  const handleExportKpi = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        "Chỉ số KPI,Giá trị,Ghi chú",
        `Tổng người dùng,${kpiData.users.total},Tài khoản hệ thống`,
        `Khóa học xuất bản,${kpiData.courses.published},Đang hoạt động`,
        `Lượt ghi danh,${kpiData.totalEnrollmentsCount},Tổng ghi danh`,
        `Chuyên cần lớp Live,${kpiData.avgAttendanceRate},Tỷ lệ có mặt`,
        `Bài tập chờ chấm,${kpiData.pendingGradingCount},Cần chấm`,
      ].join("\n");

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `csca_kpi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Đã xuất báo cáo KPI (.csv)");
  };

  if (loadingKpi) {
    return (
      <Loading
        loading={true}
        text="Đang tải tổng quan quản trị..."
        fullScreen={false}
        className="min-h-[55vh] py-16"
      />
    );
  }

  if (kpiError) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorState
          title="Chưa thể tải tổng quan quản trị"
          message={kpiError}
          onRetry={() => loadKpis()}
        />
      </div>
    );
  }

  const dlqCount = Number(kpiData.syncJobs?.deadLetter) || 0;
  const recentItems = (kpiData.recentActivities || []).slice(0, 6);

  return (
    <div className="min-w-0 space-y-5">
      {/* Compact Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
            Tổng quan trung tâm
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Theo dõi nhanh số liệu vận hành và truy cập trực tiếp các khu vực chính.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={refreshing}
            onClick={() => loadKpis({ silent: true })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
          <button
            type="button"
            onClick={handleExportKpi}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* 4 Clean KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link
              key={kpi.id}
              to={kpi.to}
              className="group flex flex-col justify-between rounded-2xl border border-white/85 bg-white/95 p-3.5 sm:p-4 shadow-[0_6px_24px_rgba(20,60,100,0.06)] transition hover:-translate-y-0.5 hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none dark:hover:border-sky-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {kpi.label}
                  </p>
                  <p className="mt-1 font-mono text-xl sm:text-2xl font-black tracking-tight text-[#102f63] dark:text-white">
                    {kpi.value}
                  </p>
                </div>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.accent} text-white shadow-sm transition group-hover:scale-105`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
                <span className="truncate text-slate-500 dark:text-slate-400">{kpi.sub}</span>
                {kpi.badge && (
                  <span className="shrink-0 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {kpi.badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Workspaces — 6 Zero-Duplicate Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {QUICK_WORKSPACES.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-center gap-2.5 rounded-2xl border border-white/85 bg-white/95 p-3 shadow-[0_4px_18px_rgba(20,60,100,0.05)] transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none dark:hover:border-sky-800"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold text-[#102f63] group-hover:text-blue-600 dark:text-white dark:group-hover:text-sky-400">
                  {item.label}
                </span>
                <span className="block truncate text-[10px] text-slate-400">
                  {item.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {/* Compact 1-Row System & Sync Health Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/85 bg-white/95 px-4 py-3 text-xs shadow-[0_4px_18px_rgba(20,60,100,0.05)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 font-bold text-[#102f63] dark:text-white">
            <span className={`h-2 w-2 rounded-full ${dlqCount > 0 ? "bg-rose-500 animate-pulse" : "bg-emerald-500"}`} />
            Hệ thống
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            Quyền học hoạt động:{" "}
            <strong className="font-mono text-emerald-600 dark:text-emerald-400">
              {kpiData.entitlements.active}
            </strong>
          </span>
          {kpiData.entitlements.suspended > 0 && (
            <span className="text-slate-500 dark:text-slate-400">
              Tạm dừng:{" "}
              <strong className="font-mono text-amber-600 dark:text-amber-400">
                {kpiData.entitlements.suspended}
              </strong>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
            {dlqCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
            Lỗi đồng bộ:{" "}
            <strong className={`font-mono ${dlqCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}>
              {dlqCount}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/sync"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className="h-3 w-3" /> Đồng bộ
          </Link>
          <Link
            to="/admin/permissions"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Shield className="h-3 w-3" /> Phân quyền
          </Link>
        </div>
      </div>

      {/* Main Split: Growth Chart (7 cols) + Recent Activities (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Growth Chart */}
        <section className="lg:col-span-7 flex flex-col justify-between rounded-3xl border border-white/85 bg-white/95 p-4 sm:p-5 shadow-[0_8px_28px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <h2 className="flex items-center gap-2 text-sm font-black text-[#102f63] dark:text-white">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-sky-400" />
              Tăng trưởng 7 tháng gần nhất
            </h2>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Ghi danh
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Học viên mới
              </span>
            </div>
          </div>

          <div className="flex h-52 items-end justify-between gap-2 sm:gap-4 pt-4 px-1">
            {kpiData.monthlyEnrollmentStats.length === 0 ? (
              <p className="w-full self-center text-center text-xs text-slate-400">
                Chưa có dữ liệu thống kê theo tháng.
              </p>
            ) : (
              kpiData.monthlyEnrollmentStats.map((item) => {
                const enrollCount = Number(item.enrollments) || 0;
                const userCount = Number(item.users) || 0;
                const enrollPct = Math.max(enrollCount > 0 ? 8 : 3, Math.round((enrollCount / chartMax) * 100));
                const userPct = Math.max(userCount > 0 ? 8 : 3, Math.round((userCount / chartMax) * 100));

                return (
                  <div key={item.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <div className="flex h-40 w-full items-end justify-center gap-1">
                      <div
                        className="relative flex w-1/2 max-w-[18px] items-start justify-center rounded-t-md bg-blue-500 transition-all hover:bg-blue-400"
                        style={{ height: `${enrollPct}%` }}
                        title={`${item.month}: ${enrollCount} ghi danh`}
                      >
                        {enrollCount > 0 && (
                          <span className="absolute -top-4 font-mono text-[9px] font-bold text-slate-500 dark:text-slate-400">
                            {enrollCount}
                          </span>
                        )}
                      </div>
                      <div
                        className="relative flex w-1/2 max-w-[18px] items-start justify-center rounded-t-md bg-violet-500 transition-all hover:bg-violet-400"
                        style={{ height: `${userPct}%` }}
                        title={`${item.month}: ${userCount} học viên mới`}
                      >
                        {userCount > 0 && (
                          <span className="absolute -top-4 font-mono text-[9px] font-bold text-slate-400 dark:text-slate-500">
                            {userCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {item.month}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5 text-xs dark:bg-slate-800/60">
            <span className="text-slate-500 dark:text-slate-400">Doanh thu ghi nhận</span>
            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
              {kpiData.totalRevenueVnd}
            </span>
          </div>
        </section>

        {/* Recent Activity Feed */}
        <section className="lg:col-span-5 flex flex-col rounded-3xl border border-white/85 bg-white/95 p-4 sm:p-5 shadow-[0_8px_28px_rgba(20,60,100,0.06)] dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h2 className="flex items-center gap-2 text-sm font-black text-[#102f63] dark:text-white">
              <Clock className="h-4 w-4 text-violet-500" />
              Hoạt động gần đây
            </h2>
            <Link
              to="/admin/audit-logs"
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 hover:underline dark:text-sky-400"
            >
              Xem tất cả <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-2 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
            {recentItems.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                Chưa có hoạt động nào gần đây.
              </p>
            ) : (
              recentItems.map((act) => (
                <div key={act.id} className="flex items-start justify-between gap-2.5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="text-slate-700 dark:text-slate-200 leading-snug break-words">
                      <strong className="font-bold text-slate-900 dark:text-white">{act.actor}</strong>{" "}
                      {act.action}{" "}
                      <span className="font-semibold text-blue-600 dark:text-sky-400">{act.target}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">{act.time}</p>
                  </div>
                  {act.type && (
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {act.type}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
