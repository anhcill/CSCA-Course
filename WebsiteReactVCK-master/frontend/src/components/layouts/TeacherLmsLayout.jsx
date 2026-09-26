/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen, CalendarDays, ChevronRight, ClipboardCheck,
  Home, LogOut, Menu, Presentation, Settings, Users, X,
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
  { label: 'Lịch dạy', path: '/lms/teach/calendar', icon: CalendarDays },
  { label: 'Điểm danh', path: '/lms/teach/attendance', icon: Users },
  { label: 'Giáo trình', path: '/lms/teacher/curriculum', icon: BookOpen },
  { label: 'Chấm bài', path: '/lms/teacher/grading', icon: ClipboardCheck },
];

function TeacherNavItem({ item, active, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition select-none ${
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
      <span className="flex-1 truncate">{item.label}</span>
      <ChevronRight className={`h-3.5 w-3.5 transition ${active ? 'text-emerald-600 opacity-100' : 'opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0'}`} />
    </Link>
  );
}

function TeacherSidebarContent({ onNavigate }) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wide text-slate-700 dark:text-slate-300">Giảng viên</span>
          </div>
          <span className="text-[9px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">TEACHER</span>
        </div>

        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Giảng dạy</p>
        <nav className="space-y-1" aria-label="Điều hướng LMS giảng viên">
          {TEACHER_NAV.map((item) => (
            <TeacherNavItem
              key={item.path}
              item={item}
              active={location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== '/lms/teach')}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
        <Link to="/lms/my-learning" onClick={onNavigate} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition">
          <Users className="h-4 w-4" /> Giao diện học viên
        </Link>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition">
          <Home className="h-4 w-4" /> Trang chủ
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

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  const closeMobile = () => setMobileOpen(false);

  const isAuthorizedTeacher = authUser?.role === 'creator' || authUser?.role === 'admin';
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
        <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileOpen((o) => !o)} className="rounded-xl p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Logo isTransparent />
            <div className="hidden h-8 w-px bg-slate-200 dark:bg-slate-800 sm:block" />
            <div className="hidden sm:block">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Giảng viên
              </span>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cổng giảng dạy</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/lms/my-learning" className="hidden items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition sm:flex">
              <Users className="h-3.5 w-3.5" /> Chế độ học viên
            </Link>
            <NotificationBell />
            <button type="button" onClick={toggleTheme} className="rounded-xl p-2 text-amber-500 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition" title={isDarkMode ? 'Sáng' : 'Tối'}>
              {isDarkMode ? '☀' : '☾'}
            </button>
            <button type="button" onClick={() => i18n.changeLanguage(i18n.language?.startsWith('vi') ? 'en' : 'vi')} className="rounded-xl px-2.5 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              {i18n.language?.startsWith('vi') ? '🇻🇳 VI' : '🇬🇧 EN'}
            </button>

            {authUser && (
              <div className="group relative">
                <button type="button" className="flex items-center gap-2 rounded-full p-0.5 transition hover:opacity-85">
                  <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-9 w-9 rounded-full border-2 border-emerald-500/50 object-cover" />
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 w-56 translate-y-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{authUser.fullName || authUser.username}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">@{authUser.username}</p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold">Giảng viên</span>
                  </div>
                  <Link to="/profile" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <Settings className="h-3.5 w-3.5" /> Hồ sơ cá nhân
                  </Link>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition">
                    <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-16 left-0 z-40 hidden w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-white lg:flex lg:flex-col">
        <TeacherSidebarContent onNavigate={closeMobile} />
      </aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 top-16 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={closeMobile} />
          <div className="fixed inset-y-16 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl lg:hidden">
            <TeacherSidebarContent onNavigate={closeMobile} />
          </div>
        </>
      )}

      <main className="min-h-[calc(100vh-4rem)] pt-16 lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2"><Breadcrumbs /></div>
        {children}
      </main>
    </div>
  );
}
