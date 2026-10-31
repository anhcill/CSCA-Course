import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Binary,
  BookA,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  UserRound,
  Video,
  X,
} from "lucide-react";
import NotificationBell from "../../features/notifications/components/NotificationBell";
import { fetchUnreadNotificationsCount } from "../../features/api/lmsClient";
import { useAuthContext } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import useLogout from "../../hooks/useLogout";
import { getAvatarUrl, handleAvatarError } from "../../utils/avatar";
import { normalizeLmsWallpaper } from "../../utils/classWallpapers";

const STUDENT_NAV = [
  { label: "Trang chủ", path: "/lms/dashboard", icon: Home, end: true },
  { label: "Khóa học", path: "/lms/my-learning", icon: BookOpen, end: true },
  { label: "Lịch học", path: "/lms/calendar", icon: CalendarDays },
  { label: "Bài tập & Kiểm tra", path: "/lms/assignments", icon: FileCheck2 },
  { label: "Từ vựng", path: "/lms/vocabulary", icon: BookA },
  { label: "Công thức", path: "/lms/formulas", icon: Binary },
  { label: "Tài liệu", path: "/lms/files", icon: FolderOpen },
  { label: "Bản ghi buổi học", path: "/lms/recordings", icon: Video },
  { label: "Thông báo", path: "/lms/notifications", icon: Bell },
  { label: "Kết quả học tập", path: "/lms/analytics", icon: BarChart3 },
];

function Brand({ collapsed = false }) {
  return (
    <Link
      to="/lms/dashboard"
      className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}
      aria-label="CSCA LMS - Trang chủ"
      title={collapsed ? "CSCA LMS - 知 行 合 一" : undefined}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <BookOpen className="h-6 w-6" />
      </span>
      {!collapsed && (
        <span className="leading-none overflow-hidden">
          <span className="block text-lg font-black tracking-tight text-[#102f63] dark:text-white">CSCA LMS</span>
          <span className="mt-2 block font-['Ma_Shan_Zheng',cursive] text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">知 行 合 一</span>
        </span>
      )}
    </Link>
  );
}

function StudentNavItem({ item, onNavigate, unreadCount = 0, collapsed = false }) {
  const location = useLocation();
  const Icon = item.icon;

  const handleMouseEnter = () => {
    if (item.path === "/lms/vocabulary") {
      import("../../features/learning/pages/StudentVocabularyHubPage.jsx").catch(() => {});
    } else if (item.path === "/lms/formulas") {
      import("../../features/learning/pages/StudentFormulaHubPage.jsx").catch(() => {});
    } else if (item.path === "/lms/recordings") {
      import("../../features/learning/pages/StudentRecordingsPage.jsx").catch(() => {});
    }
  };

  const isCourseSection = item.path === "/lms/my-learning" && (
    location.pathname.startsWith("/lms/courses") || location.pathname.startsWith("/lms/learn")
  );

  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      onMouseEnter={handleMouseEnter}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => {
        const active = isActive || isCourseSection;
        return `group relative flex items-center rounded-xl text-sm font-semibold transition ${
          collapsed
            ? "justify-center px-0 py-3"
            : "gap-3 px-3 py-3"
        } ${
          active
            ? "bg-[#dff1ff] text-blue-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300"
            : "text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
        }`;
      }}
    >
      {({ isActive }) => {
        const active = isActive || isCourseSection;
        return (
          <>
            <div className="relative flex items-center justify-center">
              <Icon className={`h-5 w-5 shrink-0 ${active ? "text-blue-600 dark:text-sky-400" : "text-[#17365f] dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-sky-400"}`} />
              {collapsed && item.label === "Thông báo" && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-slate-900">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.label === "Thông báo" && unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </>
            )}
          </>
        );
      }}
    </NavLink>
  );
}

function Sidebar({ onNavigate, unreadCount = 0, collapsed = false, onToggleCollapse }) {
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden py-6 transition-[padding] duration-300 ${collapsed ? 'px-2' : 'px-4'}`}>
      <div className={`shrink-0 flex items-center ${collapsed ? 'flex-col gap-2 px-0' : 'justify-between px-2'}`}>
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
      <div className="my-5 h-px shrink-0 bg-slate-100 dark:bg-slate-800" />
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Điều hướng LMS học viên">
        {STUDENT_NAV.map((item) => (
          <StudentNavItem key={item.path} item={item} onNavigate={onNavigate} unreadCount={unreadCount} collapsed={collapsed} />
        ))}
      </nav>
      <div className="mt-4 shrink-0 border-t border-slate-200 dark:border-slate-800 pt-4">
        <NavLink
          to="/lms/settings"
          onClick={onNavigate}
          title={collapsed ? "Cài đặt" : undefined}
          className={({ isActive }) => `flex items-center rounded-xl text-sm font-semibold transition ${
            collapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-3"
          } ${
            isActive
              ? "bg-[#dff1ff] text-blue-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300"
              : "text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
          }`}
        >
          {({ isActive }) => (
            <>
              <Settings className={`h-5 w-5 shrink-0 ${isActive ? "text-blue-600 dark:text-sky-400" : "text-[#17365f] dark:text-slate-400"}`} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">Cài đặt</span>}
            </>
          )}
        </NavLink>
      </div>
    </div>
  );
}

export default function StudentLmsLayout({ children }) {
  const location = useLocation();
  const { authUser } = useAuthContext();
  const { logout } = useLogout();
  const { isDarkMode, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('csca_student_sidebar_collapsed');
      return saved === 'true';
    }
    return false;
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('csca_student_sidebar_collapsed', String(next));
      return next;
    });
  };
  const isDashboard = location.pathname === "/lms/dashboard";
  const isCalendar = location.pathname === "/lms/calendar" || location.pathname === "/lms/live-schedule";
  const isAssignments = location.pathname === "/lms/assignments" || location.pathname.startsWith("/lms/assignments");
  const isCourseList = location.pathname === "/lms/my-learning";
  const isVocabulary = location.pathname.startsWith("/lms/vocabulary");
  const isFormulas = location.pathname.startsWith("/lms/formulas");
  const isAnalytics = location.pathname === "/lms/analytics" || location.pathname.startsWith("/lms/analytics");
  const isNotifications = location.pathname === "/lms/notifications" || location.pathname.startsWith("/lms/notifications");
  const isSettings = location.pathname === "/lms/settings" || location.pathname.startsWith("/lms/settings");
  const isFiles = location.pathname.startsWith("/lms/files") || location.pathname.startsWith("/lms/materials");
  const isRecordings = location.pathname === "/lms/recordings" || location.pathname.startsWith("/lms/recordings");
  const isCourses = location.pathname.startsWith("/lms/courses") || location.pathname.startsWith("/lms/learn");
  const hasScenicBackground = isDashboard || isCalendar || isAssignments || isCourseList || isVocabulary || isFormulas || isAnalytics || isNotifications || isSettings || isFiles || isRecordings || isCourses;

  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const syncCount = async () => {
      try {
        const res = await fetchUnreadNotificationsCount();
        const countVal = res?.data?.unreadCount ?? res?.data?.count;
        if (isMounted && countVal !== undefined) {
          setUnreadNotifs(Number(countVal));
        }
      } catch {
        // fail silently
      }
    };
    syncCount();
    const handleSync = () => syncCount();
    window.addEventListener("csca:notifications-updated", handleSync);
    return () => {
      isMounted = false;
      window.removeEventListener("csca:notifications-updated", handleSync);
    };
  }, []);

  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    if (typeof window !== "undefined") {
      const savedWallpaper = localStorage.getItem("csca_lms_wallpaper");
      const wallpaper = normalizeLmsWallpaper(savedWallpaper);
      if (wallpaper !== savedWallpaper) localStorage.setItem("csca_lms_wallpaper", wallpaper);
      return wallpaper;
    }
    return "/student-campus-spring.webp";
  });

  useEffect(() => {
    const handleWallpaperChange = (event) => {
      const newWp = normalizeLmsWallpaper(event?.detail || localStorage.getItem("csca_lms_wallpaper"));
      localStorage.setItem("csca_lms_wallpaper", newWp);
      setCurrentWallpaper(newWp);
    };
    window.addEventListener("csca_wallpaper_changed", handleWallpaperChange);
    return () => window.removeEventListener("csca_wallpaper_changed", handleWallpaperChange);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => setProfileMenuOpen(false), [location.pathname]);
  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div
      className={`student-lms min-h-screen transition-colors duration-200 ${
        !isDarkMode
          ? (hasScenicBackground ? "student-lms--dashboard bg-[#dff1ff] text-slate-900" : "bg-[#f6f9fd] text-slate-900")
          : "bg-slate-950 text-slate-100"
      }`}
      style={hasScenicBackground && !isDarkMode ? {
        backgroundImage: `linear-gradient(to bottom, rgba(222,241,255,0.02) 0%, rgba(230,244,253,0.06) 50%, rgba(237,246,252,0.12) 100%), url('${currentWallpaper}')`,
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
      } : undefined}
    >
      <header className={`fixed right-0 top-0 z-40 h-16 transition-[left,colors] duration-300 ease-in-out ${
        isSidebarCollapsed ? 'left-0 lg:left-[98px]' : 'left-0 lg:left-[252px]'
      } ${
        !isDarkMode
          ? (hasScenicBackground ? "bg-transparent" : "border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-xl")
          : "border-b border-slate-800/80 bg-slate-900/95 shadow-sm backdrop-blur-xl text-white"
      }`}>
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-xl bg-white/85 dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-300 shadow-sm backdrop-blur lg:hidden"
              aria-label={mobileOpen ? "Đóng menu học viên" : "Mở menu học viên"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dark Mode Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`h-9 w-9 flex items-center justify-center rounded-xl transition ${
                !isDarkMode
                  ? (hasScenicBackground
                      ? "border border-white/85 bg-[#e4f4ff]/85 shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md text-[#17365f] hover:bg-white hover:text-blue-700"
                      : "bg-white/75 shadow-sm text-slate-600 hover:bg-white hover:text-blue-700 backdrop-blur")
                  : "border border-slate-700 bg-slate-800/90 text-amber-400 hover:bg-slate-700 shadow-sm"
              }`}
              title={isDarkMode ? "Giao diện sáng" : "Giao diện tối"}
              aria-label={isDarkMode ? "Giao diện sáng" : "Giao diện tối"}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <NotificationBell variant={hasScenicBackground && !isDarkMode ? "bare" : "default"} />

            <Link
              to="/lms/assignments"
              className={`hidden h-9 w-9 items-center justify-center rounded-xl transition sm:flex ${
                !isDarkMode
                  ? (hasScenicBackground
                      ? "border border-white/85 bg-[#e4f4ff]/85 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md hover:bg-white hover:text-blue-600"
                      : "bg-white/75 text-[#17365f] shadow-sm backdrop-blur hover:bg-white hover:text-blue-600")
                  : "border border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
              aria-label="Bài tập và kiểm tra"
            >
              <FileCheck2 className="h-4 w-4" />
            </Link>

            {authUser && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-label="Menu tài khoản"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className={`relative flex items-center gap-2.5 overflow-hidden rounded-xl px-2 py-1.5 transition ${
                    !isDarkMode
                      ? (hasScenicBackground
                          ? "border border-white/90 bg-[#d9efff]/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_7px_22px_rgba(24,75,118,0.18)] backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent hover:bg-[#e8f6ff]"
                          : "bg-white/85 shadow-[0_8px_28px_rgba(45,91,130,0.12)] backdrop-blur-md hover:bg-white")
                      : "border border-slate-700 bg-slate-800/90 text-white hover:bg-slate-700/90 shadow-sm"
                  }`}
                >
                  <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-8 w-8 rounded-full border-2 border-white dark:border-slate-700 object-cover shadow-sm" />
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-[130px] truncate text-xs font-bold text-[#102f63] dark:text-white">{authUser.fullName || authUser.username}</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">Học viên</span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-[#17365f] dark:text-slate-400 sm:block" />
                </button>
                {profileMenuOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-white/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl dark:text-slate-100">
                    <Link to="/lms/settings" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-white">
                      <Settings className="h-4 w-4" /> Cài đặt
                    </Link>
                    <Link to="/lms/settings" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-white">
                      <UserRound className="h-4 w-4" /> Hồ sơ cá nhân
                    </Link>
                    <button type="button" onClick={() => { setProfileMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                      <LogOut className="h-4 w-4" /> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className={`fixed bottom-4 left-4 top-4 z-50 hidden overflow-hidden rounded-3xl border border-white/80 dark:border-slate-800 bg-white/92 dark:bg-slate-900/95 shadow-[0_16px_50px_rgba(32,78,120,0.15)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-[width] duration-300 ease-in-out lg:flex lg:flex-col ${
        isSidebarCollapsed ? 'w-[74px]' : 'w-[220px]'
      }`}>
        <Sidebar
          unreadCount={unreadNotifs}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
      </aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu học viên" />
          <div className="fixed inset-y-3 left-3 z-50 w-[min(18rem,88vw)] overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-2xl lg:hidden">
            <Sidebar onNavigate={() => setMobileOpen(false)} unreadCount={unreadNotifs} collapsed={false} />
          </div>
        </>
      )}

      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ease-in-out ${
        isSidebarCollapsed ? 'lg:pl-[98px]' : 'lg:pl-[252px]'
      }`}>{children}</main>
    </div>
  );
}
