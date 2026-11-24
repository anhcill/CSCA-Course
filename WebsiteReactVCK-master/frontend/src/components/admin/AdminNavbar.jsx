import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  Globe,
  Home,
  LogOut,
  Moon,
  Presentation,
  Shield,
  Sun,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import useLogout from '../../hooks/useLogout';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import NotificationBell from '../../features/notifications/components/NotificationBell';
import { getAdminRouteMeta } from './Sidebar';

const AdminNavbar = ({ collapsed = false }) => {
  const { t, i18n } = useTranslation();
  const { isDarkMode, toggleTheme } = useTheme();
  const { authUser } = useAuthContext();
  const { logout } = useLogout();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);

  const routeMeta = useMemo(() => getAdminRouteMeta(location.pathname), [location.pathname]);

  useEffect(() => {
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi');
    setShowProfileMenu(false);
  };

  return (
    <header
      className={`fixed right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 px-3 sm:px-6 transition-[left,background-color] duration-300 ease-in-out ${
        collapsed ? 'left-0 lg:left-[98px]' : 'left-0 lg:left-[268px]'
      } ${
        isDarkMode
          ? 'border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl'
          : 'border-b border-white/70 bg-[#e6f4fd]/85 backdrop-blur-xl'
      }`}
    >
      {/* Left: Brand Pill on Mobile + Current Page Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          to="/admin/dashboard"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-white/85 bg-white/90 px-2.5 py-1.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800/90 lg:hidden"
          aria-label="CSCA Admin"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
            <Shield className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-black tracking-tight text-[#102f63] dark:text-white">
            Admin
          </span>
        </Link>

        <div className="min-w-0">
          <div className="hidden items-center gap-1.5 text-[11px] font-semibold text-slate-400 sm:flex">
            <span>{routeMeta.group}</span>
            <span>/</span>
          </div>
          <p className="truncate text-sm font-black tracking-tight text-[#102f63] dark:text-white sm:text-base leading-tight">
            {routeMeta.title}
          </p>
        </div>
      </div>

      {/* Right: Teacher Switcher, Theme, Notifications, Profile */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Link
          to="/lms/teach"
          title="Chuyển sang không gian Giảng viên"
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          <Presentation className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Giảng viên</span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className={`rounded-xl border p-2 transition ${
            !isDarkMode
              ? 'border-white/85 bg-white/85 text-[#17365f] shadow-2xs hover:bg-white hover:text-blue-700'
              : 'border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700'
          }`}
          title={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'}
          aria-label={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'}
        >
          {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <NotificationBell variant="bare" />

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setShowProfileMenu((open) => !open)}
            aria-expanded={showProfileMenu}
            className="flex items-center gap-2 rounded-xl border border-white/85 bg-white/85 p-1 sm:px-2 sm:py-1.5 text-left shadow-2xs transition hover:bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:hover:bg-slate-800"
          >
            <img
              src={getAvatarUrl(authUser)}
              onError={handleAvatarError}
              alt={authUser?.username || 'Admin'}
              className="h-8 w-8 rounded-full border border-white object-cover dark:border-slate-700"
            />
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-[110px] truncate text-xs font-black text-[#102f63] dark:text-white">
                {authUser?.fullName || authUser?.username}
              </span>
              <span className="block text-[10px] font-semibold text-blue-600 dark:text-sky-400">
                Quản trị viên
              </span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white/98 p-1.5 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/98 z-50">
              <div className="border-b border-slate-100 px-3 py-2 mb-1 dark:border-slate-800">
                <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                  {authUser?.fullName || authUser?.username}
                </p>
                <p className="truncate font-mono text-[10px] text-slate-400">
                  {authUser?.email}
                </p>
              </div>

              <Link
                to="/profile"
                onClick={() => setShowProfileMenu(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <User className="h-4 w-4 text-slate-400" />
                <span>{t('profileLink') || 'Hồ sơ cá nhân'}</span>
              </Link>

              <Link
                to="/lms/teach"
                onClick={() => setShowProfileMenu(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <Presentation className="h-4 w-4" />
                <span>Chế độ Giảng viên</span>
              </Link>

              <button
                type="button"
                onClick={toggleLanguage}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-slate-400" />
                  Ngôn ngữ
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase dark:bg-slate-800">
                  {i18n.language || 'vi'}
                </span>
              </button>

              <Link
                to="/"
                onClick={() => setShowProfileMenu(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Home className="h-4 w-4 text-slate-400" />
                <span>{t('home') || 'Trang chủ'}</span>
              </Link>

              <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setShowProfileMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t('logout') || 'Đăng xuất'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AdminNavbar;
