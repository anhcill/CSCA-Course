/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
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
  Compass,
  LogOut,
  Menu,
  Moon,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
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
  { label: "Khóa học của tôi", path: "/lms/my-learning", icon: BookOpen, end: true },
  { label: "Lịch học", path: "/lms/calendar", icon: CalendarDays },
  { label: "Bài tập & hạn nộp", path: "/lms/assignments", icon: FileCheck2 },
  { label: "Tài liệu các lớp", path: "/lms/files", icon: FolderOpen },
  { label: "Điểm tổng quan", path: "/lms/analytics", icon: BarChart3 },
  { label: "Thông báo", path: "/lms/notifications", icon: Bell },
];

function Brand({ collapsed = false }) {
  return (
    <Link to="/lms/my-learning" title={collapsed ? "CSCA LMS" : undefined} className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`} aria-label="CSCA LMS - Khóa học của tôi">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <GraduationCap className="h-5 w-5" />
      </span>
      <span className={collapsed ? 'sr-only' : 'leading-none'}>
        <span className="block text-lg font-black tracking-tight text-slate-950 dark:text-white">CSCA LMS</span>
      </span>
    </Link>
  );
}

function StudentNavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => `group relative flex items-center rounded-2xl py-2 text-xs sm:text-sm font-semibold transition ${
        collapsed ? "justify-center px-2" : "gap-3 px-3"
      } ${
        isActive 
          ? "bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40" 
          : "text-slate-600 dark:text-slate-400 hover:bg-blue-50/70 dark:hover:bg-slate-800/90 hover:text-blue-800 dark:hover:text-sky-200 focus-visible:bg-blue-50/70 dark:focus-visible:bg-slate-800/90"
      }`}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-blue-600 dark:bg-blue-400" />}
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
            isActive 
              ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25" 
              : "bg-blue-50/70 dark:bg-slate-800/80 text-blue-600 dark:text-sky-400 group-hover:scale-105"
          }`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className={collapsed ? "sr-only" : "flex-1 truncate"}>{item.label}</span>
          {!collapsed && <ChevronRight className={`h-3.5 w-3.5 transition ${isActive ? "text-blue-500 opacity-100" : "opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0"}`} />}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ collapsed = false, onNavigate }) {
  return (
    <div className={`flex h-full flex-col py-6 ${collapsed ? 'px-2.5' : 'px-4'}`}>
      <div className={collapsed ? '' : 'px-2'}><Brand collapsed={collapsed} /></div>
      <div className="my-6 h-px bg-slate-100 dark:bg-slate-800" />
      <p className={collapsed ? 'sr-only' : 'px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500'}>Tổng quan học tập</p>
      <nav className="space-y-1" aria-label="Điều hướng LMS học viên">
        {STUDENT_NAV.map((item) => <StudentNavItem key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
      </nav>
      <div className="mt-auto border-t border-slate-100 dark:border-slate-800 pt-3">
        <Link to="/courses" onClick={onNavigate} title={collapsed ? 'Khám phá thêm' : undefined} className={`flex items-center rounded-2xl py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'}`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><Compass className="h-3.5 w-3.5" /></span>
          <span className={collapsed ? 'sr-only' : ''}>Khám phá thêm</span>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('student-lms-sidebar-collapsed') === 'true');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const workspaceLink = getLmsWorkspaceLink(authUser);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => setProfileMenuOpen(false), [location.pathname]);
  useEffect(() => { window.localStorage.setItem('student-lms-sidebar-collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="student-lms min-h-screen bg-[#f6f9fd] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <header className={`fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/80 bg-white/95 shadow-[0_4px_20px_rgba(41,72,110,0.04)] backdrop-blur-xl transition-[left] duration-200 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none ${sidebarCollapsed ? 'lg:left-20' : 'lg:left-64'}`}>
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen((open) => !open)} className="rounded-xl p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label={mobileOpen ? "Đóng menu học viên" : "Mở menu học viên"}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} className="hidden rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-400 lg:inline-flex" title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'} aria-label={sidebarCollapsed ? 'Mở rộng menu học viên' : 'Thu gọn menu học viên'}>
              {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
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
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-label="Menu tài khoản"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-3 rounded-full p-1 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-9 w-9 rounded-full border-2 border-blue-100 dark:border-blue-900/60 object-cover" />
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[150px] truncate text-sm font-bold text-slate-900 dark:text-white">{authUser.fullName || authUser.username}</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{authUser.role === "admin" ? "Quản trị · chế độ học viên" : authUser.role === "creator" ? "Giảng viên · chế độ học viên" : "Học viên"}</span>
                  </span>
                </button>
                {profileMenuOpen && <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl dark:shadow-2xl">
                  <Link to="/profile" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-white">
                    <UserRound className="h-4 w-4" /> Hồ sơ cá nhân
                  </Link>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <LogOut className="h-4 w-4" /> Đăng xuất
                  </button>
                </div>}
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className={`fixed inset-y-0 left-0 z-50 hidden border-r border-slate-200/80 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 lg:flex lg:flex-col ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <Sidebar collapsed={sidebarCollapsed} />
      </aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 top-[72px] z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu học viên" />
          <div className="fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pt-[72px] shadow-2xl lg:hidden">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      <main className={`min-h-screen pt-[72px] transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>{children}</main>
    </div>
  );
}
