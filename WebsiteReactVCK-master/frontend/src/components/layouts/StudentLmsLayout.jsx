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
        <span className="block text-lg font-black tracking-tight text-slate-950">CSCA LMS</span>
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">Học · Tăng trưởng · Bứt phá</span>
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
      className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600" />}
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${isActive ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="flex-1">{item.label}</span>
          <ChevronRight className={`h-4 w-4 transition ${isActive ? "text-blue-500" : "text-slate-300 opacity-0 group-hover:opacity-100"}`} />
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }) {
  return (
    <div className="flex h-full flex-col px-4 py-6">
      <div className="px-2"><Brand /></div>
      <div className="my-7 h-px bg-slate-100" />
      <p className="px-3 pb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Không gian học tập</p>
      <nav className="space-y-1" aria-label="Điều hướng LMS học viên">
        {STUDENT_NAV.map((item) => <StudentNavItem key={item.path} item={item} onNavigate={onNavigate} />)}
      </nav>
      <div className="mt-auto border-t border-slate-100 pt-4">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100"><Home className="h-4 w-4" /></span>
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
    <div className="student-lms min-h-screen bg-[#f6f9fd] text-slate-900 transition-colors duration-200">
      <header className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/80 bg-white/95 shadow-[0_4px_20px_rgba(41,72,110,0.04)] backdrop-blur-xl lg:left-64">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label={mobileOpen ? "Đóng menu học viên" : "Mở menu học viên"}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="relative hidden max-w-xl flex-1 items-center md:flex">
              <Search className="absolute left-4 h-4 w-4 text-slate-400" />
              <input aria-label="Tìm kiếm trong LMS" className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10" placeholder="Tìm khóa học, bài học, tài liệu..." />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {workspaceLink && <Link to={workspaceLink.to} className="hidden rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 md:inline-flex">{workspaceLink.label}</Link>}
            <button type="button" onClick={toggleTheme} className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-blue-700" title={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} aria-label={isDarkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}>
              {isDarkMode ? <Sun className="h-[18px] w-[18px] text-amber-500" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <NotificationBell />
            <div className="hidden h-7 w-px bg-slate-200 sm:block" />
            {authUser && (
              <div className="group relative">
                <button type="button" className="flex items-center gap-3 rounded-full p-1 transition hover:bg-slate-50" aria-label="Menu tài khoản">
                  <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-9 w-9 rounded-full border-2 border-blue-100 object-cover" />
                  <span className="hidden text-left sm:block"><span className="block max-w-[150px] truncate text-sm font-bold text-slate-900">{authUser.fullName || authUser.username}</span><span className="block text-[11px] text-slate-500">{authUser.role === "admin" ? "Quản trị · chế độ học viên" : authUser.role === "creator" ? "Giảng viên · chế độ học viên" : "Học viên"}</span></span>
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 w-56 translate-y-1 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <Link to="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-700"><UserRound className="h-4 w-4" /> Hồ sơ cá nhân</Link>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50"><LogOut className="h-4 w-4" /> Đăng xuất</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-slate-200/80 bg-white lg:flex lg:flex-col"><Sidebar /></aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 top-[72px] z-30 bg-slate-950/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu học viên" />
          <div className="fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto border-r border-slate-200 bg-white pt-[72px] shadow-2xl lg:hidden"><Sidebar onNavigate={() => setMobileOpen(false)} /></div>
        </>
      )}

      <main className="min-h-screen pt-[72px] lg:pl-64">{children}</main>
    </div>
  );
}
