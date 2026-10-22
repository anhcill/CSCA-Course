/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  FileQuestion,
  FilePlus2,
  FolderOpen,
  GraduationCap,
  Home,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Palette,
  Presentation,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import NotificationBell from '../../features/notifications/components/NotificationBell';
import { useAuthContext } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import useLogout from '../../hooks/useLogout';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { PermissionDeniedState } from '../common/StateView';
import { CSCA_WALLPAPERS } from '../../utils/classWallpapers';

const TEACHER_NAV = [
  { label: 'Tổng quan', path: '/lms/teach', icon: Presentation, end: true },
  { label: 'Lịch dạy', path: '/lms/teach/calendar', icon: CalendarDays },
  { label: 'Điểm danh', path: '/lms/teach/attendance', icon: Users },
  { label: 'Điểm & chuyên cần', path: '/lms/teach/student-progress', icon: BarChart3 },
  { label: 'Giáo trình lớp', path: '/lms/teach/classes', icon: BookOpen },
  { label: 'Bảng lương', path: '/lms/teach/salary', icon: Wallet },
  { label: 'Tài liệu học tập', path: '/lms/teach/files', icon: FolderOpen },
  { label: 'Đăng đề & Quiz', path: '/lms/teacher/quizzes', icon: FileQuestion, end: true },
  { label: 'Ngân hàng câu hỏi', path: '/lms/teach/question-bank', icon: Library },
  { label: 'Hỗ trợ học viên', path: '/lms/teach/support', icon: MessageSquare },
];

function Brand() {
  return (
    <Link to="/lms/teach" className="flex items-center gap-3" aria-label="CSCA Giảng Viên - Bàn làm việc">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <BookOpen className="h-6 w-6" />
      </span>
      <span className="leading-none">
        <span className="block text-lg font-black tracking-tight text-[#102f63] dark:text-white">CSCA LMS</span>
        <span className="mt-2 block font-['Ma_Shan_Zheng',cursive] text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">学 贵 得 师</span>
      </span>
    </Link>
  );
}

function TeacherNavItem({ item, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
        isActive
          ? 'bg-[#dff1ff] text-blue-700 dark:bg-sky-950/60 dark:text-sky-300 shadow-sm'
          : 'text-[#17365f] dark:text-slate-300 hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800/60'
      }`}
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4.5 w-4.5 shrink-0 transition ${isActive ? 'text-blue-600 dark:text-sky-400' : 'text-[#17365f] dark:text-slate-400 group-hover:text-blue-600'}`} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function TeacherSidebarContent({ onNavigate, isAdmin = false }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-5">
      {/* Brand Header */}
      <div className="shrink-0 px-1">
        <Brand />
      </div>

      {/* Role Pill */}
      <div className="mt-3 mb-2 flex shrink-0 items-center justify-between rounded-xl border border-sky-100 bg-[#eef7fd] dark:border-slate-800 dark:bg-slate-800/80 px-3 py-1.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
          <span className="text-[11px] font-black tracking-wide text-[#102f63] dark:text-slate-200">
            {isAdmin ? 'Quản trị viên' : 'Giảng viên'}
          </span>
        </div>
        <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-blue-700 dark:text-sky-400">
          {isAdmin ? 'ADMIN' : 'TEACHER'}
        </span>
      </div>

      <div className="my-2 h-px shrink-0 bg-slate-100 dark:bg-slate-800" />

      {/* Navigation List */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Điều hướng LMS giảng viên">
        {TEACHER_NAV.map((item) => (
          <TeacherNavItem key={item.path} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="mt-3 shrink-0 space-y-1 border-t border-slate-200 dark:border-slate-800 pt-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-[#17365f] dark:text-slate-400 transition hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <Home className="h-4 w-4" />
          <span>Trang chủ CSCA</span>
        </Link>
        <NavLink
          to="/lms/teach/settings"
          onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
            isActive
              ? 'bg-[#dff1ff] text-blue-700 dark:bg-sky-950/60 dark:text-sky-300 shadow-sm'
              : 'text-[#17365f] dark:text-slate-400 hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-white'
          }`}
        >
          {({ isActive }) => (
            <>
              <Settings className={`h-4 w-4 shrink-0 transition ${isActive ? 'text-blue-600 dark:text-sky-400' : 'text-[#17365f] dark:text-slate-400 group-hover:text-blue-600'}`} />
              <span className="min-w-0 flex-1 truncate">Cài đặt giảng viên</span>
            </>
          )}
        </NavLink>
      </div>
    </div>
  );
}

export default function TeacherLmsLayout({ children }) {
  const location = useLocation();
  const { authUser } = useAuthContext();
  const { isDarkMode } = useTheme();
  const { logout } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // Synchronize wallpaper with student aesthetic
  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('csca_lms_wallpaper') || '/student-campus-spring.webp';
    }
    return '/student-campus-spring.webp';
  });

  useEffect(() => {
    const handleWallpaperChange = (event) => {
      const newWp = event?.detail || localStorage.getItem('csca_lms_wallpaper') || '/student-campus-spring.webp';
      setCurrentWallpaper(newWp);
    };
    window.addEventListener('csca_wallpaper_changed', handleWallpaperChange);
    return () => window.removeEventListener('csca_wallpaper_changed', handleWallpaperChange);
  }, []);

  const cycleWallpaper = () => {
    const currentIndex = CSCA_WALLPAPERS.findIndex((w) => w.url === currentWallpaper || w.cloudinaryUrl === currentWallpaper);
    const nextIndex = (currentIndex + 1) % CSCA_WALLPAPERS.length;
    const nextWp = CSCA_WALLPAPERS[nextIndex].cloudinaryUrl || CSCA_WALLPAPERS[nextIndex].url;
    setCurrentWallpaper(nextWp);
    localStorage.setItem('csca_lms_wallpaper', nextWp);
    window.dispatchEvent(new CustomEvent('csca_wallpaper_changed', { detail: nextWp }));
  };

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { setProfileMenuOpen(false); }, [location.pathname]);
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
    <div
      className={`teacher-lms min-h-screen text-slate-900 transition-colors ${
        !isDarkMode ? 'teacher-lms--dashboard bg-[#dff1ff]' : 'bg-slate-950 text-slate-100'
      }`}
      style={!isDarkMode ? {
        backgroundImage: `linear-gradient(to bottom, rgba(222,241,255,0.02) 0%, rgba(230,244,253,0.06) 50%, rgba(237,246,252,0.12) 100%), url('${currentWallpaper}')`,
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      } : undefined}
    >
      <button
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        className="fixed left-3 top-3 z-50 rounded-xl bg-white/90 p-2.5 text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/90 dark:text-slate-300 lg:hidden"
        aria-label={mobileOpen ? 'Đóng menu giảng viên' : 'Mở menu giảng viên'}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Floating Sidebar Card - Exactly matching Student LMS */}
      <aside className="fixed bottom-4 left-4 top-4 z-50 hidden w-[230px] overflow-hidden rounded-3xl border border-white/80 bg-white/92 dark:bg-slate-900/90 dark:border-slate-800 shadow-[0_16px_50px_rgba(32,78,120,0.15)] backdrop-blur-xl lg:flex lg:flex-col">
        <TeacherSidebarContent onNavigate={closeMobile} isAdmin={isAdmin} />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden"
            onClick={closeMobile}
            aria-label="Đóng menu giảng viên"
          />
          <div className="fixed inset-y-3 left-3 z-50 w-[min(18rem,88vw)] overflow-hidden rounded-3xl bg-white/95 dark:bg-slate-900/95 shadow-2xl lg:hidden">
            <TeacherSidebarContent onNavigate={closeMobile} isAdmin={isAdmin} />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main className="min-h-screen lg:pl-[260px]">
        {children}
      </main>
    </div>
  );
}
