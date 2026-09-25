import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiUsers,
  FiBook,
  FiCheckCircle,
  FiVideo,
  FiTrendingUp,
  FiCalendar,
  FiDownload,
  FiPlus,
  FiArrowUpRight,
  FiClock,
  FiLayers
} from "react-icons/fi";
import useGetAllCourses from "../../hooks/useGetAllCourse";
import useGetUsers from "../../hooks/useGetUsers";
import { fetchAdminDashboardKpi } from "../../features/api/lmsClient";
import Loading from "../../components/Loading.jsx";

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
};

export default function Dashboard() {
  const { courses, loading: loadingCourses } = useGetAllCourses();
  const { users, loading: loadingUsers } = useGetUsers();

  const [kpiData, setKpiData] = useState(EMPTY_ADMIN_KPIS);
  const [loadingKpi, setLoadingKpi] = useState(true);

  const loadKpis = useCallback(async () => {
    setLoadingKpi(true);
    try {
      const res = await fetchAdminDashboardKpi();
      if (res && res.success && res.data) {
        setKpiData({ ...EMPTY_ADMIN_KPIS, ...res.data });
      }
    } catch (error) {
      toast.error(error?.message || "Không thể tải KPI quản trị");
      setKpiData(EMPTY_ADMIN_KPIS);
    } finally {
      setLoadingKpi(false);
    }
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  // Combined stats
  const totalCourses = courses?.length || 0;
  const totalUsers = users?.length || 0;

  const kpiCards = useMemo(
    () => [
      {
        id: "users",
        title: "Tổng Học Viên & Người Dùng",
        value: totalUsers,
        subtext: `${kpiData.activeLearnersCount} học viên đang học`,
        growth: kpiData.monthlyGrowthPct,
        icon: FiUsers,
        color: "from-blue-600 to-indigo-600",
        link: "/admin/users",
      },
      {
        id: "courses",
        title: "Khóa Học & Giáo Trình",
        value: totalCourses,
        subtext: "CSCA, HSK 3-5 & Live Class",
        growth: "+3 khóa mới",
        icon: FiBook,
        color: "from-emerald-600 to-teal-600",
        link: "/admin/courses",
      },
      {
        id: "enrollments",
        title: "Lượt Ghi Danh Khóa Học",
        value: kpiData.totalEnrollmentsCount,
        subtext: `Tỷ lệ hoàn thành: ${kpiData.completionRate}`,
        growth: "+24% tháng này",
        icon: FiCheckCircle,
        color: "from-purple-600 to-pink-600",
        link: "/admin/courses",
      },
      {
        id: "attendance",
        title: "Chuyên Cần Lớp Live Meet",
        value: kpiData.avgAttendanceRate,
        subtext: `${kpiData.pendingGradingCount} bài tập chờ chấm`,
        growth: "Đạt chuẩn xuất sắc",
        icon: FiVideo,
        color: "from-amber-600 to-orange-600",
        link: "/lms/live-schedule",
      },
    ],
    [totalUsers, totalCourses, kpiData]
  );

  // Export CSV simulation
  const handleExportKpi = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        "Chỉ số KPI,Giá trị,Ghi chú",
        `Tổng người dùng,${totalUsers},Tài khoản hệ thống`,
        `Khóa học xuất bản,${totalCourses},Khóa học đang hoạt động`,
        `Lượt ghi danh,${kpiData.totalEnrollmentsCount},Học viên đã enroll`,
        `Chuyên cần lớp Live,${kpiData.avgAttendanceRate},Tỷ lệ có mặt trung bình`,
        `Bài tập chờ chấm,${kpiData.pendingGradingCount},Cần phản hồi trong 48h`,
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `csca_lms_kpi_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Xuất báo cáo KPI hệ thống CSCA LMS thành công! 📊");
  };

  const isLoading = loadingCourses || loadingUsers || loadingKpi;

  if (isLoading) {
    return <Loading loading={true} text="Đang đồng bộ dữ liệu KPI hệ thống..." fullScreen={false} className="min-h-[60vh] py-16" />;
  }

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>Executive Admin Console — CSCA Academy</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Tổng Quan Hệ Thống Quản Trị
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Theo dõi thời gian thực các chỉ số KPI học tập, người dùng, lớp trực tuyến và tiến độ giáo trình.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/admin/courses"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/25"
          >
            <FiPlus className="w-4 h-4" />
            <span>Thêm Khóa Học</span>
          </Link>

          <Link
            to="/lms/admin/curriculum"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-xs transition border border-gray-200 dark:border-gray-700"
          >
            <FiLayers className="w-4 h-4 text-emerald-500" />
            <span>Quản Lý Giáo Trình R2</span>
          </Link>

          <button
            type="button"
            onClick={handleExportKpi}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-xs transition border border-gray-200 dark:border-gray-700"
          >
            <FiDownload className="w-4 h-4 text-sky-500" />
            <span>Xuất Báo Cáo KPI</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link
              key={kpi.id}
              to={kpi.link}
              className="group bg-white dark:bg-gray-800/90 rounded-3xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl hover:border-blue-500/40 transition-all duration-200 relative overflow-hidden flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {kpi.title}
                  </span>
                  <p className="text-3xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                    {isLoading ? "..." : kpi.value}
                  </p>
                </div>

                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${kpi.color} flex items-center justify-center text-white shadow-lg shrink-0 group-hover:scale-110 transition`}
                >
                  <Icon className="w-6 h-6" />
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                  {kpi.subtext}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono flex items-center gap-0.5 shrink-0">
                  <FiTrendingUp className="w-3 h-3" />
                  {kpi.growth}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* SECTION 1.5: MOLYBRIDGE & ENTITLEMENT HEALTH */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-7 border border-indigo-900/40 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span>Cầu Nối Quản Trị Trung Tâm MolyInternal</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Trạng Thái Quyền Học (Entitlements) & Hàng Đợi Đồng Bộ
            </h2>
            <p className="text-xs text-indigo-200/80 max-w-2xl leading-relaxed">
              Dữ liệu học viên, lớp học và quyền truy cập được đồng bộ tự động theo thời gian thực qua cơ chế Idempotent Outbox Queue.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/admin/sync"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30"
            >
              <FiClock className="w-4 h-4" />
              <span>Kiểm Tra Outbox</span>
            </Link>
            <Link
              to="/admin/permissions"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/10"
            >
              <span>Ma Trận Quyền</span>
            </Link>
            <Link
              to="/admin/classes"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/10"
            >
              <span>Ánh Xạ Lớp</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-indigo-900/60">
          <div className="bg-slate-900/60 rounded-2xl p-4 border border-indigo-500/20">
            <span className="text-[10px] uppercase font-bold text-indigo-300">Quyền Đang Hoạt Động</span>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">342</div>
            <span className="text-[11px] text-indigo-200/60">Active Entitlements</span>
          </div>

          <div className="bg-slate-900/60 rounded-2xl p-4 border border-indigo-500/20">
            <span className="text-[10px] uppercase font-bold text-indigo-300">Chờ Kích Hoạt / Xác Nhận</span>
            <div className="text-2xl font-black font-mono text-amber-400 mt-1">12</div>
            <span className="text-[11px] text-indigo-200/60">Pending Payment/Approval</span>
          </div>

          <div className="bg-slate-900/60 rounded-2xl p-4 border border-indigo-500/20">
            <span className="text-[10px] uppercase font-bold text-indigo-300">Đã Thu Hồi / Hết Hạn</span>
            <div className="text-2xl font-black font-mono text-rose-400 mt-1">3</div>
            <span className="text-[11px] text-indigo-200/60">Revoked / Expired</span>
          </div>

          <div className="bg-slate-900/60 rounded-2xl p-4 border border-indigo-500/20">
            <span className="text-[10px] uppercase font-bold text-indigo-300">Dead-Letter Queue (DLQ)</span>
            <div className="text-2xl font-black font-mono text-rose-500 mt-1">1</div>
            <span className="text-[11px] text-indigo-200/60">Cần retry thủ công</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: ENROLLMENT TREND & SYSTEM HEALTH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Cols: Growth Chart Visual */}
        <div className="lg:col-span-8 bg-white dark:bg-gray-800/90 rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/80 pb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FiTrendingUp className="w-5 h-5 text-blue-500" />
                <span>Tăng Trưởng Ghi Danh & Học Viên Mới (2026)</span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Xu hướng người học ghi danh các khóa CSCA Du học Trung Quốc và luyện thi HSK 4-5.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <span className="w-3 h-3 rounded-full bg-blue-500" /> Lượt ghi danh
              </span>
              <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                <span className="w-3 h-3 rounded-full bg-purple-500" /> Học viên mới
              </span>
            </div>
          </div>

          {/* Lightweight Responsive SVG Bar Chart */}
          <div className="h-64 flex items-end justify-between gap-3 sm:gap-6 pt-6 px-2">
            {kpiData.monthlyEnrollmentStats.map((item) => {
              const maxVal = 240;
              const enrollHeight = Math.round((item.enrollments / maxVal) * 100);
              const userHeight = Math.round((item.users / maxVal) * 100);

              return (
                <div key={item.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-48">
                    {/* Bar 1: Enrollments */}
                    <div
                      className="w-1/2 max-w-[20px] bg-blue-500 hover:bg-blue-400 rounded-t-lg transition-all duration-300 relative group-hover:scale-y-105 origin-bottom"
                      style={{ height: `${enrollHeight}%` }}
                      title={`${item.month}: ${item.enrollments} lượt ghi danh`}
                    />
                    {/* Bar 2: Users */}
                    <div
                      className="w-1/2 max-w-[20px] bg-purple-500 hover:bg-purple-400 rounded-t-lg transition-all duration-300 relative group-hover:scale-y-105 origin-bottom"
                      style={{ height: `${userHeight}%` }}
                      title={`${item.month}: ${item.users} học viên mới`}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-gray-500 dark:text-gray-400">
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/60 rounded-2xl p-4 flex flex-wrap items-center justify-between text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-800">
            <span>
              💡 <strong>Nhận định:</strong> Tốc độ ghi danh đạt đỉnh trong các kỳ thi thử CSCA tháng 7 và tháng 9.
            </span>
            <span className="font-mono text-emerald-500 font-bold">
              Tỷ lệ duy trì (Retention): 86.4%
            </span>
          </div>
        </div>

        {/* Right 4 Cols: Quick Actions & Operations */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-gray-800/90 rounded-3xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Nghiệp Vụ Quản Trị Nhanh
            </h3>

            <div className="space-y-2.5">
              <Link
                to="/admin/courses"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/70 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-gray-100 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <FiBook className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-blue-500">
                      Quản Trị Khóa Học
                    </p>
                    <p className="text-[10px] text-gray-500">Thêm, sửa & xuất bản khóa</p>
                  </div>
                </div>
                <FiArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition" />
              </Link>

              <Link
                to="/lms/admin/curriculum"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-gray-100 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-800 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <FiLayers className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-emerald-500">
                      Soạn Giáo Trình & Video R2
                    </p>
                    <p className="text-[10px] text-gray-500">Tải video, sắp xếp chương học</p>
                  </div>
                </div>
                <FiArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-500 transition" />
              </Link>

              <Link
                to="/admin/users"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/70 hover:bg-purple-50 dark:hover:bg-purple-950/30 border border-gray-100 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-800 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <FiUsers className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-purple-500">
                      Quản Lý Người Dùng
                    </p>
                    <p className="text-[10px] text-gray-500">Phân quyền, khóa/mở tài khoản</p>
                  </div>
                </div>
                <FiArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition" />
              </Link>

              <Link
                to="/lms/live-schedule"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/70 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-gray-100 dark:border-gray-800 hover:border-amber-300 dark:hover:border-amber-800 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <FiCalendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-amber-500">
                      Lịch Lớp Học Trực Tuyến
                    </p>
                    <p className="text-[10px] text-gray-500">Thời khóa biểu Meet/Zoom</p>
                  </div>
                </div>
                <FiArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: RECENT ACTIVITIES & AUDIT STREAM */}
      <div className="bg-white dark:bg-gray-800/90 rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700/80 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FiClock className="w-5 h-5 text-purple-500" />
              <span>Nhật Ký Hoạt Động Hệ Thống Gần Nhất (Audit Stream)</span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Ghi nhận các sự kiện nộp bài, chấm điểm, ghi danh và tạo khóa học mới theo thời gian thực.
            </p>
          </div>

          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
            ● Hệ thống hoạt động bình thường
          </span>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {kpiData.recentActivities.map((act) => (
            <div key={act.id} className="py-3.5 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                  {act.avatar ? (
                    <img src={act.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <FiLayers className="w-4 h-4 text-gray-500" />
                  )}
                </div>

                <div>
                  <p className="text-gray-900 dark:text-white font-medium">
                    <strong className="font-bold">{act.actor}</strong> {act.action}:{" "}
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{act.target}</span>
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{act.time}</p>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {act.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
