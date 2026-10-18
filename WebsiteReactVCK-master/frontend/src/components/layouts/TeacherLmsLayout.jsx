/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, FileQuestion,
  FilePlus2, FolderOpen, GraduationCap, Home, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Presentation, Settings, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import Logo from '../Logo';
import NotificationBell from '../../features/notifications/components/NotificationBell';
import { useAuthContext } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import useLogout from '../../hooks/useLogout';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { PermissionDeniedState } from '../common/StateView';
import Breadcrumbs from '../common/Breadcrumbs';
import { useTranslation } from 'react-i18next';

const TEACHER_NAV = [
  { label: 'Tổng quan', path: '/lms/teach', icon: Presentation },
  { label: 'Bảng lương', path: '/lms/teach/salary', icon: Wallet },
  { label: 'Lịch dạy', path: '/lms/teach/calendar', icon: CalendarDays },
  { label: 'Điểm danh', path: '/lms/teach/attendance', icon: Users },
  { label: 'Điểm & chuyên cần', path: '/lms/teach/student-progress', icon: BarChart3 },
  { label: 'Giáo trình lớp', path: '/lms/teach/classes', icon: BookOpen },
  { label: 'Tài liệu học tập', path: '/lms/teach/files', icon: FolderOpen },
  { label: 'Đăng đề & Quiz', path: '/lms/teacher/quizzes', icon: FileQuestion, end: true },
  { label: 'Tạo đề mới', path: '/lms/teacher/quizzes/new', icon: FilePlus2 },
  { label: 'Chấm bài', path: '/lms/teacher/grading', icon: ClipboardCheck },
  { label: 'Ngân hàng câu hỏi', path: '/lms/teach/question-bank', icon: FileQuestion },
  { label: 'Hỗ trợ học viên', path: '/lms/teach/support', icon: Users },
];

function TeacherNavItem({ item, active, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-xl py-2 text-xs sm:text-sm font-semibold transition select-none ${
        collapsed ? 'justify-center px-2' : 'gap-3 px-3'
      } ${
        active
          ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
      }`}
    >
      {active && <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-500" />}
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
          active
            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 group-hover:scale-105'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </div>
      <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>{item.label}</span>
      {!collapsed && <ChevronRight className={`h-3.5 w-3.5 transition ${active ? 'text-emerald-600 opacity-100' : 'opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0'}`} />}
    </Link>
  );
}

function TeacherSidebarContent({ collapsed = false, onNavigate, isAdmin = false }) {
  const location = useLocation();
  const roleLabel = isAdmin ? 'Quản trị viên' : 'Giảng viên';
  const roleCode = isAdmin ? 'ADMIN' : 'TEACHER';

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${collapsed ? 'p-2.5' : 'p-4'}`}>
      <div title={collapsed ? roleLabel : undefined} className={`mb-4 flex shrink-0 rounded-xl border border-slate-200 bg-slate-100 py-2 dark:border-slate-800 dark:bg-slate-900 ${collapsed ? 'justify-center px-2' : 'items-center justify-between px-3'}`}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className={collapsed ? 'sr-only' : 'text-[11px] font-bold tracking-wide text-slate-700 dark:text-slate-300'}>{roleLabel}</span>
          </div>
          {!collapsed && <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400">{roleCode}</span>}
      </div>

      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
        <p className={collapsed ? 'sr-only' : 'px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500'}>Giảng dạy</p>
        <nav className="space-y-1" aria-label="Điều hướng LMS giảng viên">
          {TEACHER_NAV.map((item) => (
            <TeacherNavItem
              key={item.path}
              item={item}
              active={location.pathname === item.path || (!item.end && location.pathname.startsWith(`${item.path}/`))}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      <div className="mt-3 shrink-0 space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
        <Link to="/" onClick={onNavigate} title={collapsed ? 'Trang chủ' : undefined} className={`flex items-center rounded-xl py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${collapsed ? 'justify-center px-2' : 'gap-2 px-3'}`}>
          <Home className="h-4 w-4" /> <span className={collapsed ? 'sr-only' : ''}>Trang chủ</span>
        </Link>
      </div>
    </div>
  );
}

export default function TeacherLmsLayout({ children }) {
  const location = useLocation();
  const { authUser } = useAuthContext();
  const { isDarkMode, toggleTheme } = useTheme();
  const { i18n } = useTranslation();
  const { logout } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = window.localStorage.getItem('teacher-lms-sidebar-collapsed');
    return saved !== null ? saved === 'true' : true; // Mặc định thu gọn
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { setProfileMenuOpen(false); }, [location.pathname]);
  useEffect(() => { window.localStorage.setItem('teacher-lms-sidebar-collapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);
  const closeMobile = () => setMobileOpen(false);

  const isAuthorizedTeacher = authUser?.role === 'creator' || authUser?.role === 'admin';
  const isAdmin = authUser?.role === 'admin';
  if (!isAuthorizedTeacher) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex items-center justify-center">
        <div className="max-w-md w-full">
          <PermissionDeniedState title="Quyền Giảng Viên Yêu Cầu" message="Chỉ tài khoản có vai trò Giảng Viên hoặc Quản Trị Viên mới có quyền truy cập." redirectPath="/lms/my-learning" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-slate-200 dark:border-emerald-500/20 bg-white/95 dark:bg-slate-950/95 shadow-sm backdrop-blur-xl">
        <div className="flex h-full items-center justify-between">
          {/* Khối bên trái: Khớp chiều rộng với Sidebar bên dưới để tạo đường viền dọc liền mạch, không có khấc */}
          <div className={`flex h-full items-center px-3 transition-[width] duration-200 lg:border-r border-slate-200/80 dark:border-slate-800 ${sidebarCollapsed ? 'lg:w-20 lg:justify-center' : 'lg:w-64'}`}>
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="rounded-xl p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden transition"
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {sidebarCollapsed ? (
              <Link to="/lms/teach" aria-label="Moly Course" className="hidden lg:flex items-center justify-center group">
                <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg shadow-red-950/20 transition duration-300 group-hover:-rotate-3 group-hover:scale-105">
                  <span className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-amber-300/50 blur-sm" />
                  <GraduationCap className="relative h-5 w-5" aria-hidden="true" />
                </span>
              </Link>
            ) : (
              <div className="hidden lg:flex items-center gap-2 truncate">
                <Logo isTransparent={false} />
              </div>
            )}
          </div>

          <div className="flex flex-1 h-full items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              {/* Nút thu nhỏ/mở rộng sidebar đặt trực tiếp trong Navbar với UI cao cấp */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((c) => !c)}
                className="group relative hidden lg:inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500/50 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 shadow-xs hover:shadow-sm active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shrink-0"
                title={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
                aria-label={sidebarCollapsed ? "Mở rộng menu giảng viên" : "Thu gọn menu giảng viên"}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5 transition-transform duration-200 group-hover:scale-105" />
                ) : (
                  <PanelLeftClose className="h-5 w-5 transition-transform duration-200 group-hover:scale-105" />
                )}
              </button>

              <div className="hidden sm:flex items-center gap-2 pl-0.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> {isAdmin ? 'Quản trị viên' : 'Giảng viên'}
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cổng giảng dạy</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
            <NotificationBell />
            <button type="button" onClick={toggleTheme} className="rounded-xl p-2 text-amber-500 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title={isDarkMode ? 'Sáng' : 'Tối'}>
              {isDarkMode ? '☀' : '☾'}
            </button>
            <button type="button" onClick={() => i18n.changeLanguage(i18n.language?.startsWith('vi') ? 'en' : 'vi')} className="rounded-xl px-2.5 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              {i18n.language?.startsWith('vi') ? '🇻🇳 VI' : '🇬🇧 EN'}
            </button>

            {authUser && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-full p-0.5 transition hover:opacity-85"
                >
                  <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-9 w-9 rounded-full border-2 border-emerald-500/50 object-cover" />
                </button>
                {profileMenuOpen && <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-2xl">
                  <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{authUser.fullName || authUser.username}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">@{authUser.username}</p>
                    {isAdmin ? (
                      <Link
                        to="/admin/dashboard"
                        onClick={() => setProfileMenuOpen(false)}
                        className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-700 transition hover:bg-blue-500/25 dark:text-blue-300"
                        title="Chuyển sang trang quản trị"
                      >
                        <ShieldCheck className="h-3 w-3" /> Quản trị viên · Mở trang quản trị
                      </Link>
                    ) : (
                      <span className="mt-1 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Giảng viên</span>
                    )}
                  </div>
                  {isAdmin && (
                    <Link to="/admin/dashboard" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
                      <ShieldCheck className="h-3.5 w-3.5" /> Chuyển sang trang quản trị
                    </Link>
                  )}
                  <Link to="/profile" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <Settings className="h-3.5 w-3.5" /> Hồ sơ cá nhân
                  </Link>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition">
                    <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                  </button>
                </div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

      <aside className={`fixed inset-y-16 left-0 z-40 hidden border-r border-slate-200 bg-white text-slate-800 transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-950 dark:text-white lg:flex lg:flex-col ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <TeacherSidebarContent collapsed={sidebarCollapsed} onNavigate={closeMobile} isAdmin={isAdmin} />
      </aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 top-16 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={closeMobile} />
          <div className="fixed inset-y-16 left-0 z-40 w-[min(18rem,88vw)] overflow-hidden border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl lg:hidden">
            <TeacherSidebarContent onNavigate={closeMobile} isAdmin={isAdmin} />
          </div>
        </>
      )}

      <main className={`min-h-[calc(100vh-4rem)] pt-16 transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2"><Breadcrumbs /></div>
        {children}
      </main>
    </div>
  );
}
