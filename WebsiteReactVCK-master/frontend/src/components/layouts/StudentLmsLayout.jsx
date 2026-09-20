/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Flame,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import Logo from '../Logo';
import NotificationBell from '../../features/notifications/components/NotificationBell';
import { useAuthContext } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import useLogout from '../../hooks/useLogout';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import Breadcrumbs from '../common/Breadcrumbs';
import { useTranslation } from 'react-i18next';

const STUDENT_NAV = [
  { label: 'Danh mục khóa học', path: '/lms/catalog', icon: BookOpen },
  { label: 'Lịch học tất cả khóa', path: '/lms/live-schedule', icon: CalendarDays },
  { label: 'Bài tập tất cả khóa', path: '/lms/assignments', icon: ClipboardCheck },
  { label: 'Bảng xếp hạng', path: '/lms/leaderboard', icon: Flame },
  { label: 'Chứng chỉ', path: '/lms/certificates', icon: Award },
];

function StudentNavItem({ item, active, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 select-none ${
        active
          ? 'text-white bg-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] border border-white/[0.08]'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
      }`}
    >
      {active && (
        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-rose-400 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
      )}
      <div
        className={`p-1.5 rounded-lg transition-colors ${
          active
            ? 'bg-rose-500/20 text-rose-400 shadow-sm shadow-rose-500/30'
            : 'text-slate-400 group-hover:text-slate-200 group-hover:bg-white/[0.04]'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </div>
      <span className="flex-1 font-medium">{item.label}</span>
      <ChevronRight
        className={`h-3.5 w-3.5 transition-all duration-200 ${
          active
            ? 'text-rose-400 opacity-100 translate-x-0'
            : 'text-slate-500 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0'
        }`}
      />
    </Link>
  );
}

function StudentSidebarContent({ onNavigate }) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        {/* Compact Workspace Indicator */}
        <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-slate-300">
              Khu Vực Học Viên
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rose-400/90 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
            CSCA
          </span>
        </div>

        {/* Menu Items */}
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Chương Trình Học
        </p>
        <nav className="space-y-1" aria-label="Điều hướng LMS học viên">
          {STUDENT_NAV.map((item) => (
            <StudentNavItem
              key={item.path}
              item={item}
              active={
                location.pathname === item.path ||
                location.pathname.startsWith(item.path)
              }
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      {/* Footer link to main site */}
      <div className="border-t border-white/10 pt-4">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <Home className="h-4 w-4" /> Về trang chủ công khai
        </Link>
      </div>
    </div>
  );
}

export default function StudentLmsLayout({ children }) {
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/10 bg-slate-950/95 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 lg:hidden"
              aria-label={mobileOpen ? 'Đóng menu học viên' : 'Mở menu học viên'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Logo isTransparent />
            <div className="hidden h-8 w-px bg-white/15 sm:block" />
            <div className="hidden sm:block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400">
                CSCA Học Viên
              </span>
              <p className="text-xs font-semibold text-slate-400">Không gian học tập cá nhân</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-rose-400/40 hover:bg-white/10 hover:text-white sm:flex"
            >
              <Home className="h-3.5 w-3.5" /> Trang chủ
            </Link>
            <NotificationBell />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl p-2 text-amber-300 transition hover:bg-white/10"
              title={isDarkMode ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
            >
              {isDarkMode ? '☀' : '☾'}
            </button>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith('vi') ? 'en' : 'vi')}
              className="rounded-xl px-2.5 py-1.5 text-xs font-bold border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition"
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
                    className="h-9 w-9 rounded-full border-2 border-rose-500/40 object-cover"
                  />
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 w-56 translate-y-1 rounded-2xl border border-white/10 bg-slate-900 p-2 opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="border-b border-white/10 px-3 py-2">
                    <p className="truncate text-sm font-bold text-white">
                      {authUser.fullName || authUser.username}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">@{authUser.username}</p>
                    <span className="mt-1 inline-block rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                      Học viên CSCA
                    </span>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5" /> Hồ sơ cá nhân
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-400 hover:bg-rose-500/10"
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
      <aside className="fixed inset-y-16 left-0 z-40 hidden w-64 border-r border-white/10 bg-slate-950 text-white lg:flex lg:flex-col">
        <StudentSidebarContent onNavigate={closeMobile} />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-16 z-30 bg-slate-950/80 backdrop-blur-sm lg:hidden"
            onClick={closeMobile}
            aria-label="Đóng menu học viên"
          />
          <div className="fixed inset-y-16 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto border-r border-white/10 bg-slate-950 text-white shadow-2xl lg:hidden">
            <StudentSidebarContent onNavigate={closeMobile} />
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
