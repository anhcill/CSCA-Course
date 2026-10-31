import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  FolderOpen,
  Home,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  Settings,
  Sun,
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
import { CSCA_WALLPAPERS, normalizeLmsWallpaper } from '../../utils/classWallpapers';
import { fetchMyLmsPermissions } from '../../features/api/lmsClient';

const TEACHER_NAV = [
  { label: 'Tổng quan', path: '/lms/teach', icon: Presentation, end: true, permission: 'lms.student.view' },
  { label: 'Lịch dạy', path: '/lms/teach/calendar', icon: CalendarDays, permission: 'lms.schedule.manage' },
  { label: 'Điểm danh', path: '/lms/teach/attendance', icon: Users, permission: 'lms.attendance.manage' },
  { label: 'Điểm & chuyên cần', path: '/lms/teach/student-progress', icon: BarChart3, permission: 'lms.student.view' },
  { label: 'Giáo trình lớp', path: '/lms/teach/classes', icon: BookOpen, permission: 'lms.course.manage' },
  { label: 'Bảng lương', path: '/lms/teach/salary', icon: Wallet },
  { label: 'Tài liệu học tập', path: '/lms/teach/files', icon: FolderOpen, permission: 'lms.file.manage' },
  { label: 'Đăng đề & Quiz', path: '/lms/teacher/quizzes', icon: FileQuestion, end: true, permission: 'lms.quiz.manage' },
  { label: 'Ngân hàng câu hỏi', path: '/lms/teach/question-bank', icon: Library, permission: 'lms.quiz.manage' },
  { label: 'Hỗ trợ học viên', path: '/lms/teach/support', icon: MessageSquare, permission: 'lms.support.manage' },
];

const getTeacherRouteAccess = (pathname) => {
  if (pathname.startsWith('/lms/teacher/assignments/review')) {
    return { label: 'chấm bài tập', permission: 'lms.assignment.grade' };
  }
  if (pathname.startsWith('/lms/teacher/quizzes') || pathname.startsWith('/lms/teach/quizzes')) {
    return { label: 'đăng đề và Quiz', permission: 'lms.quiz.manage' };
  }
  if (pathname.startsWith('/lms/teach/attendance-review')) {
    return { label: 'duyệt sửa điểm danh', permission: 'lms.attendance.amend.review' };
  }
  if (
    pathname.startsWith('/lms/teacher/attendance')
    || /^\/lms\/teach\/classes\/[^/]+\/attendance(?:\/|$)/.test(pathname)
    || /^\/lms\/teacher\/classes\/[^/]+\/attendance(?:\/|$)/.test(pathname)
  ) {
    return { label: 'điểm danh', permission: 'lms.attendance.manage' };
  }
  return null;
};

function Brand({ collapsed = false }) {
  return (
    <Link
      to="/lms/teach"
      className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}
      aria-label="CSCA Giảng Viên - Bàn làm việc"
      title={collapsed ? "CSCA LMS - 学 贵 得 师" : undefined}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <BookOpen className="h-6 w-6" />
      </span>
      {!collapsed && (
        <span className="leading-none overflow-hidden">
          <span className="block text-lg font-black tracking-tight text-[#102f63] dark:text-white">CSCA LMS</span>
          <span className="mt-2 block font-['Ma_Shan_Zheng',cursive] text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">学 贵 得 师</span>
        </span>
      )}
    </Link>
  );
}

function TeacherNavItem({ item, onNavigate, collapsed = false }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => `group relative flex items-center rounded-xl text-sm font-semibold transition ${
        collapsed
          ? 'justify-center px-0 py-2.5'
          : 'gap-3 px-3 py-2.5'
      } ${
        isActive
          ? 'bg-[#dff1ff] text-blue-700 dark:bg-sky-950/60 dark:text-sky-300 shadow-sm'
          : 'text-[#17365f] dark:text-slate-300 hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800/60'
      }`}
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4.5 w-4.5 shrink-0 transition ${isActive ? 'text-blue-600 dark:text-sky-400' : 'text-[#17365f] dark:text-slate-400 group-hover:text-blue-600'}`} />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

function TeacherSidebarContent({ onNavigate, isAdmin = false, permissions = new Set(), collapsed = false, onToggleCollapse }) {
  const navigation = TEACHER_NAV.filter((item) => isAdmin || !item.permission || permissions.has(item.permission));
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden transition-[padding] duration-300 ${collapsed ? 'px-2 py-4' : 'px-4 py-5'}`}>
      {/* Brand Header */}
      <div className={`shrink-0 flex items-center ${collapsed ? 'flex-col gap-2 px-0' : 'justify-between px-1'}`}>
        <Brand collapsed={collapsed} />
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-[#eef7fd] text-[#102f63] hover:bg-blue-100 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Role Pill */}
      {collapsed ? (
        <div
          className="mt-2 mb-2 flex shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-[#eef7fd] dark:border-slate-800 dark:bg-slate-800/80 py-1.5 px-1 shadow-2xs"
          title={isAdmin ? "Quản trị viên (ADMIN)" : "Giảng viên (TEACHER)"}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
        </div>
      ) : (
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
      )}

      <div className="my-2 h-px shrink-0 bg-slate-100 dark:bg-slate-800" />

      {/* Navigation List */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Điều hướng LMS giảng viên">
        {navigation.map((item) => (
          <TeacherNavItem key={item.path} item={item} onNavigate={onNavigate} collapsed={collapsed} />
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="mt-3 shrink-0 space-y-1 border-t border-slate-200 dark:border-slate-800 pt-3">
        <Link
          to="/"
          onClick={onNavigate}
          title={collapsed ? "Trang chủ CSCA" : undefined}
          className={`flex items-center rounded-xl text-xs font-semibold text-[#17365f] dark:text-slate-400 transition hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-white ${
            collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Trang chủ CSCA</span>}
        </Link>
        <NavLink
          to="/lms/teach/settings"
          onClick={onNavigate}
          title={collapsed ? "Cài đặt giảng viên" : undefined}
          className={({ isActive }) => `flex items-center rounded-xl text-xs font-semibold transition ${
            collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
          } ${
            isActive
              ? 'bg-[#dff1ff] text-blue-700 dark:bg-sky-950/60 dark:text-sky-300 shadow-sm'
              : 'text-[#17365f] dark:text-slate-400 hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-white'
          }`}
        >
          {({ isActive }) => (
            <>
              <Settings className={`h-4 w-4 shrink-0 transition ${isActive ? 'text-blue-600 dark:text-sky-400' : 'text-[#17365f] dark:text-slate-400 group-hover:text-blue-600'}`} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">Cài đặt giảng viên</span>}
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
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [permissions, setPermissions] = useState(new Set());
  const [permissionsReady, setPermissionsReady] = useState(authUser?.role === 'admin');
  const profileMenuRef = useRef(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('csca_teacher_sidebar_collapsed');
      return saved === 'true';
    }
    return false;
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('csca_teacher_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Synchronize wallpaper with student aesthetic
  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedWallpaper = localStorage.getItem('csca_lms_wallpaper');
      const wallpaper = normalizeLmsWallpaper(savedWallpaper);
      if (wallpaper !== savedWallpaper) localStorage.setItem('csca_lms_wallpaper', wallpaper);
      return wallpaper;
    }
    return '/student-campus-spring.webp';
  });

  useEffect(() => {
    const handleWallpaperChange = (event) => {
      const newWp = normalizeLmsWallpaper(event?.detail || localStorage.getItem('csca_lms_wallpaper'));
      localStorage.setItem('csca_lms_wallpaper', newWp);
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
  const currentNavItem = [...TEACHER_NAV]
    .sort((left, right) => right.path.length - left.path.length)
    .find((item) => item.end ? location.pathname === item.path : location.pathname.startsWith(item.path));
  const currentAccessItem = getTeacherRouteAccess(location.pathname) || currentNavItem;
  const deniedByMatrix = !isAdmin && permissionsReady && currentAccessItem?.permission && !permissions.has(currentAccessItem.permission);
  useEffect(() => {
    let active = true;
    if (isAdmin) {
      setPermissionsReady(true);
      return () => { active = false; };
    }
    setPermissionsReady(false);
    fetchMyLmsPermissions()
      .then((response) => {
        if (!active) return;
        setPermissions(new Set(Array.isArray(response?.data) ? response.data : []));
        setPermissionsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setPermissions(new Set());
        setPermissionsReady(true);
      });
    return () => { active = false; };
  }, [isAdmin]);
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
      <aside className={`fixed bottom-4 left-4 top-4 z-50 hidden overflow-hidden rounded-3xl border border-white/80 bg-white/92 dark:bg-slate-900/90 dark:border-slate-800 shadow-[0_16px_50px_rgba(32,78,120,0.15)] backdrop-blur-xl transition-[width] duration-300 ease-in-out lg:flex lg:flex-col ${
        isSidebarCollapsed ? 'w-[74px]' : 'w-[230px]'
      }`}>
        <TeacherSidebarContent
          onNavigate={closeMobile}
          isAdmin={isAdmin}
          permissions={permissions}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
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
            <TeacherSidebarContent onNavigate={closeMobile} isAdmin={isAdmin} permissions={permissions} collapsed={false} />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ease-in-out ${
        isSidebarCollapsed ? 'lg:pl-[98px]' : 'lg:pl-[260px]'
      }`}>
        <header className={`teacher-lms-header fixed right-0 top-0 z-30 flex h-16 items-center justify-between gap-2 bg-transparent px-4 sm:px-6 transition-[left] duration-300 ease-in-out ${
          isSidebarCollapsed ? 'left-0 lg:left-[98px]' : 'left-0 lg:left-[260px]'
        }`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className={`hidden lg:flex items-center justify-center h-9 w-9 rounded-xl border transition ${
                !isDarkMode
                  ? "border-white/85 bg-[#e4f4ff]/85 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md hover:bg-white hover:text-blue-700"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
              title={isSidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
              aria-label={isSidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
            </button>
            {!permissionsReady && (
              <span className="hidden text-xs font-semibold text-slate-500 sm:inline">Đang đồng bộ quyền truy cập...</span>
            )}
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className={`rounded-xl border p-2 transition ${
              !isDarkMode
                ? "border-white/85 bg-[#e4f4ff]/85 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md hover:bg-white hover:text-blue-700"
                : "border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700 shadow-sm"
            }`}
            title={isDarkMode ? "Giao diện sáng" : "Giao diện tối"}
            aria-label={isDarkMode ? "Giao diện sáng" : "Giao diện tối"}
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={cycleWallpaper}
            className="teacher-wallpaper-button rounded-xl border border-white/85 bg-[#e4f4ff]/85 p-2 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md transition hover:bg-white hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            title="Đổi ảnh nền"
            aria-label="Đổi ảnh nền"
          >
            <Palette className="h-4 w-4" />
          </button>
          <NotificationBell variant="bare" />
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              className="teacher-profile-trigger relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/90 bg-[#d9efff]/85 px-2 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_7px_22px_rgba(24,75,118,0.18)] backdrop-blur-xl transition before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/10 before:to-transparent hover:bg-[#e8f6ff] dark:hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-900/85"
              aria-expanded={profileMenuOpen}
            >
              <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt="" className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm" />
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-xs font-black text-[#102f63] dark:text-white">{authUser?.fullName || authUser?.username}</span>
                <span className="block text-[10px] text-slate-500 dark:text-sky-400">{isAdmin ? 'Quản trị viên' : 'Giảng viên'}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-[#17365f]" />
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[#c4def0] bg-[#eef8ff]/95 p-2 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
                {isAdmin && <Link to="/admin/dashboard" className="block rounded-xl px-3 py-2 text-xs font-bold text-[#17365f] hover:bg-white/80 dark:text-slate-200 dark:hover:bg-slate-800">Bảng điều khiển Admin</Link>}
                <Link to="/profile" className="block rounded-xl px-3 py-2 text-xs font-bold text-[#17365f] hover:bg-white/80 dark:text-slate-200 dark:hover:bg-slate-800">Hồ sơ cá nhân</Link>
                <button type="button" onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
                  <LogOut className="h-4 w-4" /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
        {!permissionsReady ? (
          <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-10 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Đang đồng bộ quyền truy cập...
          </div>
        ) : deniedByMatrix ? (
          <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center px-5 py-10">
            <PermissionDeniedState
              title="Chức năng chưa được cấp quyền"
              message={`Vai trò Giảng viên hiện chưa có quyền ${currentAccessItem.label.toLowerCase()}. Quản trị viên có thể bật quyền trong ma trận phân quyền LMS.`}
              redirectPath="/lms/teach"
            />
          </div>
        ) : children}
      </main>
    </div>
  );
}
