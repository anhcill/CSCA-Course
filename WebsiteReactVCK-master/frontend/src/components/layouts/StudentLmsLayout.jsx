/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  FolderOpen,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import NotificationBell from "../../features/notifications/components/NotificationBell";
import { useAuthContext } from "../../context/AuthContext";
import useLogout from "../../hooks/useLogout";
import { getAvatarUrl, handleAvatarError } from "../../utils/avatar";
import { useTheme } from "../../context/ThemeContext";
import { getLmsWorkspaceLink } from "../../utils/lmsNavigation";

const STUDENT_NAV = [
  { label: "Tổng quan", path: "/lms/dashboard", icon: BarChart3, end: true },
  { label: "Khóa học của tôi", path: "/lms/catalog", icon: BookOpen },
  { label: "Lớp trực tiếp", path: "/lms/live-schedule", icon: CalendarDays },
  { label: "Bài tập & thi", path: "/lms/assignments", icon: FileCheck2 },
  { label: "Tài nguyên", path: "/lms/files", icon: FolderOpen },
  { label: "Phân tích điểm", path: "/lms/analytics", icon: BarChart3 },
  { label: "Thông báo", path: "/lms/notifications", icon: Bell },
];

function Brand() {
  return (
    <Link to="/lms/dashboard" className="flex items-center gap-3" aria-label="CSCA LMS - Tổng quan">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <GraduationCap className="h-6 w-6" />
      </span>
      <span className="leading-none">
        <span className="block text-lg font-black tracking-tight text-slate-950 dark:text-white">CSCA LMS</span>
      </span>
    </Link>
  );
}

function StudentNavItem({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
        isActive 
          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" 
          : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
      }`}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600 dark:bg-sky-400" />}
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
            isActive 
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" 
              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 group-hover:text-blue-600 dark:group-hover:text-sky-400"
          }`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="flex-1">{item.label}</span>
          <ChevronRight className={`h-4 w-4 transition ${isActive ? "text-blue-500 dark:text-sky-400" : "text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100"}`} />
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }) {
  return (
    <div className="flex h-full flex-col px-4 py-6">
      <div className="px-2"><Brand /></div>
      <div className="my-7 h-px bg-slate-100 dark:bg-slate-800" />
      <p className="px-3 pb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Không gian học tập</p>
      <nav className="space-y-1" aria-label="Điều hướng LMS học viên">
        {STUDENT_NAV.map((item) => <StudentNavItem key={item.path} item={item} onNavigate={onNavigate} />)}
      </nav>
      <div className="mt-auto border-t border-slate-100 dark:border-slate-800 pt-4">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"><Home className="h-4 w-4" /></span>
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}

export default function StudentLmsLayout({ children }) {
  const location = useLocation();
  const { authUser } = useAuthContext();
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const workspaceLink = getLmsWorkspaceLink(authUser);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="student-lms min-h-screen bg-[#f6f9fd] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <header className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-[0_4px_20px_rgba(41,72,110,0.04)] dark:shadow-none backdrop-blur-xl lg:left-64">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-xl p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label={mobileOpen ? "Đóng menu học viên" : "Mở menu học viên"}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative hidden max-w-xl flex-1 items-center md:flex">
              <Search className="absolute left-4 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input aria-label="Tìm kiếm trong LMS" className="h-11 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 pl-11 pr-4 text-sm text-slate-700 dark:text-slate-200 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-300 dark:focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-500/10" placeholder="Tìm khóa học, bài học, tài liệu..." />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {workspaceLink && (
              <Link to={workspaceLink.to} className="hidden rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 transition hover:border-blue-200 dark:hover:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-white md:inline-flex">
                {workspaceLink.label}
              </Link>
            )}
            <button type="button" onClick={toggleTheme} className="rounded-xl p-2.5 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-sky-400" title={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} aria-label={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}>
              {isDarkMode ? <Sun className="h-[18px] w-[18px] text-amber-400" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <NotificationBell />
            <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-800 sm:block" />
            {authUser && (
              <div className="group relative">
                <button type="button" className="flex items-center gap-3 rounded-full p-1 transition hover:bg-slate-50 dark:hover:bg-slate-800/60" aria-label="Menu tài khoản">
                  <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-9 w-9 rounded-full border-2 border-blue-100 dark:border-blue-900/60 object-cover" />
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[150px] truncate text-sm font-bold text-slate-900 dark:text-white">{authUser.fullName || authUser.username}</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{authUser.role === "admin" ? "Quản trị · chế độ học viên" : authUser.role === "creator" ? "Giảng viên · chế độ học viên" : "Học viên"}</span>
                  </span>
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 w-56 translate-y-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 opacity-0 shadow-xl dark:shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <Link to="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-white">
                    <UserRound className="h-4 w-4" /> Hồ sơ cá nhân
                  </Link>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <LogOut className="h-4 w-4" /> Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 lg:flex lg:flex-col">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 top-[72px] z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu học viên" />
          <div className="fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pt-[72px] shadow-2xl lg:hidden">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      <main className="min-h-screen pt-[72px] lg:pl-64">{children}</main>
    </div>
  );
}
