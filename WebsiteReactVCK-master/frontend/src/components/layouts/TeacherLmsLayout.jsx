/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Home,
  LogOut,
  Menu,
  Presentation,
  Settings,
  Users,
  X,
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
  { label: 'Teacher Hub (Tổng quan)', path: '/lms/teacher-hub', icon: Presentation },
  { label: 'Lịch dạy & Lớp Live', path: '/lms/teacher/schedule', icon: CalendarDays },
  { label: 'Điểm danh chuyên cần', path: '/lms/teacher/attendance', icon: Users },
  { label: 'Quản lý giáo trình & Video', path: '/lms/teacher/curriculum', icon: BookOpen },
  { label: 'Portal chấm bài nộp', path: '/lms/teacher/grading', icon: ClipboardCheck },
];

function TeacherNavItem({ item, active, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 select-none ${
        active
          ? 'text-emerald-700 dark:text-white bg-emerald-50 dark:bg-white/[0.08] shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] border border-emerald-200 dark:border-white/[0.08]'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
      }`}
    >
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
      )}
      <div
        className={`p-1.5 rounded-lg transition-colors ${
          active
            ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/30'
            : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 group-hover:bg-slate-100 dark:group-hover:bg-white/[0.04]'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </div>
      <span className="flex-1 font-medium">{item.label}</span>
      <ChevronRight
        className={`h-3.5 w-3.5 transition-all duration-200 ${
          active
            ? 'text-emerald-600 dark:text-emerald-400 opacity-100 translate-x-0'
            : 'text-slate-400 dark:text-slate-500 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0'
        }`}
      />
    </Link>
  );
}

function TeacherSidebarContent({ onNavigate }) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        {/* Compact Workspace Indicator */}
        <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-slate-700 dark:text-slate-300">
              Khu Vực Giảng Viên
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400/90 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            TEACHER
          </span>
        </div>

        {/* Menu Items */}
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-500/80">
          Nghiệp Vụ Giảng Dạy
        </p>
        <nav className="space-y-1" aria-label="Điều hướng LMS giảng viên">
          {TEACHER_NAV.map((item) => (
            <TeacherNavItem
              key={item.path}
              item={item}
              active={
                location.pathname === item.path ||
                (location.pathname.startsWith(item.path) && item.path !== '/lms/teacher-hub')
              }
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      {/* Footer links */}
      <div className="space-y-2 border-t border-slate-200 dark:border-white/10 pt-4">
        <Link
          to="/lms/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
        >
          <Users className="h-4 w-4" /> Sang giao diện học viên
        </Link>
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
        >
          <Home className="h-4 w-4" /> Về trang chủ công khai
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

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const closeMobile = () => setMobileOpen(false);

  // Quyền giảng viên
  const isAuthorizedTeacher = authUser?.role === 'creator' || authUser?.role === 'admin';

  if (!isAuthorizedTeacher) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex items-center justify-center">
        <div className="max-w-md w-full">
          <PermissionDeniedState
            title="Quyền Giảng Viên Yêu Cầu"
            message="Chỉ tài khoản có vai trò Giảng Viên (Creator) hoặc Quản Trị Viên (Admin) mới có quyền truy cập vào Teacher Hub và các công cụ giảng dạy."
            redirectPath="/lms/dashboard"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header */}
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-slate-200 dark:border-emerald-500/20 bg-white/95 dark:bg-slate-950/95 shadow-sm dark:shadow-xl dark:shadow-slate-950/30 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-xl p-2 text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden"
              aria-label={mobileOpen ? 'Đóng menu giáo viên' : 'Mở menu giáo viên'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Logo isTransparent />
            <div className="hidden h-8 w-px bg-slate-200 dark:bg-white/15 sm:block" />
            <div className="hidden sm:block">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                CSCA Giảng Viên
              </span>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trung tâm quản trị lớp học</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/lms/dashboard"
              className="hidden items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 transition hover:border-emerald-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white sm:flex"
            >
              <Users className="h-3.5 w-3.5" /> Chế độ học viên
            </Link>
            <NotificationBell />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl p-2 text-amber-500 dark:text-amber-300 transition hover:bg-slate-100 dark:hover:bg-white/10"
              title={isDarkMode ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
            >
              {isDarkMode ? '☀' : '☾'}
            </button>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith('vi') ? 'en' : 'vi')}
              className="rounded-xl px-2.5 py-1.5 text-xs font-bold border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition"
              title="Đổi ngôn ngữ / Switch language"
            >
              {i18n.language?.startsWith('vi') ? '🇻🇳 VI' : '🇬🇧 EN'}
            </button>

            {authUser && (
              <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full p-0.5 transition hover:opacity-85"
                  aria-label="Menu tài khoản"
                >
                  <img
                    src={getAvatarUrl(authUser)}
                    onError={handleAvatarError}
                    alt={authUser.username}
                    className="h-9 w-9 rounded-full border-2 border-emerald-500/50 object-cover"
                  />
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 w-56 translate-y-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-2 opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="border-b border-slate-100 dark:border-white/10 px-3 py-2">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {authUser.fullName || authUser.username}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">@{authUser.username}</p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      Giảng viên ({authUser.role})
                    </span>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5" /> Hồ sơ cá nhân
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Fixed Sidebar */}
      <aside className="fixed inset-y-16 left-0 z-40 hidden w-64 border-r border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 text-slate-800 dark:text-white lg:flex lg:flex-col">
        <TeacherSidebarContent onNavigate={closeMobile} />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-16 z-30 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm lg:hidden"
            onClick={closeMobile}
            aria-label="Đóng menu giáo viên"
          />
          <div className="fixed inset-y-16 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto border-r border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 text-slate-800 dark:text-white shadow-2xl lg:hidden">
            <TeacherSidebarContent onNavigate={closeMobile} />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main className="min-h-[calc(100vh-4rem)] pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2">
          <Breadcrumbs />
        </div>
        {children}
      </main>
    </div>
  );
}
