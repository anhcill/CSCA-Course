import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  CornerDownLeft,
  Globe,
  Home,
  LogOut,
  Moon,
  Presentation,
  Search,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import useLogout from '../../hooks/useLogout';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import NotificationBell from '../../features/notifications/components/NotificationBell';
import { ADMIN_NAV_GROUPS, getAdminRouteMeta } from './adminNavigation';

function AdminQuickJumpModal({ isOpen, onClose, isAdmin }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const flatItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [];
    for (const group of ADMIN_NAV_GROUPS) {
      for (const item of group.items) {
        if (item.adminOnly && !isAdmin) continue;
        if (
          !q
          || item.title.toLowerCase().includes(q)
          || (item.keywords || '').toLowerCase().includes(q)
          || group.label.toLowerCase().includes(q)
        ) {
          list.push({ ...item, group: group.label });
        }
      }
    }
    return list;
  }, [isAdmin, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => (flatItems.length ? (idx + 1) % flatItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => (flatItems.length ? (idx - 1 + flatItems.length) % flatItems.length : 0));
    } else if (e.key === 'Enter' && flatItems[activeIndex]) {
      e.preventDefault();
      navigate(flatItems[activeIndex].path);
      onClose();
    }
  };

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đi nhanh tới trang quản trị"
      onClick={onClose}
      className="fixed inset-0 z-[140] flex items-start justify-center bg-slate-950/60 px-3 pt-[12vh] backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 shrink-0 text-blue-600 dark:text-sky-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Đi nhanh tới mục quản trị... (vd: lương, lịch, người dùng)"
            className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng tìm nhanh"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-2 space-y-0.5">
          {flatItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Không có mục phù hợp</p>
          ) : (
            flatItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={item.path}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate font-bold">{item.title}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {item.group}
                    </span>
                    {isSelected && <CornerDownLeft className="h-3.5 w-3.5 opacity-80" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}

const AdminNavbar = ({ collapsed = false }) => {
  const { t, i18n } = useTranslation();
  const { isDarkMode, toggleTheme } = useTheme();
  const { authUser } = useAuthContext();
  const { logout } = useLogout();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const profileRef = useRef(null);

  const routeMeta = useMemo(() => getAdminRouteMeta(location.pathname), [location.pathname]);

  useEffect(() => {
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickJumpOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
    <>
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

        {/* Right: Quick Jump, Teacher Switcher, Theme, Notifications, Profile */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setQuickJumpOpen(true)}
            title="Đi nhanh (Ctrl+K)"
            className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              !isDarkMode
                ? 'border-white/85 bg-white/85 text-slate-500 shadow-2xs hover:bg-white hover:text-[#102f63]'
                : 'border-slate-700 bg-slate-800/90 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">Đi nhanh...</span>
            <kbd className="hidden md:inline rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Ctrl K
            </kbd>
          </button>

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

      <AdminQuickJumpModal
        isOpen={quickJumpOpen}
        onClose={() => setQuickJumpOpen(false)}
        isAdmin={authUser?.role === 'admin'}
      />
    </>
  );
};

export default AdminNavbar;
