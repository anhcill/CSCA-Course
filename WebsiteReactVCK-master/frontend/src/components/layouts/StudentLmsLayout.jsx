import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
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
  Library,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings,
  Sun,
  Video,
  X,
} from "lucide-react";
import NotificationBell from "../../features/notifications/components/NotificationBell";
import { useAuthContext } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import useLogout from "../../hooks/useLogout";
import { getAvatarUrl, handleAvatarError } from "../../utils/avatar";
import { CSCA_WALLPAPERS, normalizeLmsWallpaper } from "../../utils/classWallpapers";

const STUDENT_NAV = [
  { label: "Tổng quan", path: "/lms/dashboard", icon: Home, end: true },
  { label: "Lớp học của tôi", path: "/lms/my-learning", icon: BookOpen, end: true },
  { label: "Lịch học", path: "/lms/calendar", icon: CalendarDays },
  { label: "Bài tập & Quiz", path: "/lms/assignments", icon: FileCheck2 },
  {
    label: "Kho ôn tập & Học liệu",
    path: "/lms/files",
    icon: Library,
    children: [
      { label: "Từ vựng", path: "/lms/vocabulary", icon: BookA },
      { label: "Công thức", path: "/lms/formulas", icon: Binary },
      { label: "Tài liệu lớp", path: "/lms/files", icon: FolderOpen },
      { label: "Bản ghi buổi học", path: "/lms/recordings", icon: Video },
    ],
  },
  { label: "Kết quả học tập", path: "/lms/analytics", icon: BarChart3 },
];

const MOBILE_BOTTOM_NAV = [
  {
    id: "dashboard",
    label: "Tổng quan",
    path: "/lms/dashboard",
    icon: Home,
    isActive: (pathname) => pathname === "/lms/dashboard",
  },
  {
    id: "learning",
    label: "Lớp học",
    path: "/lms/my-learning",
    icon: BookOpen,
    isActive: (pathname) => pathname === "/lms/my-learning" || pathname.startsWith("/lms/courses") || pathname.startsWith("/lms/learn"),
  },
  {
    id: "calendar",
    label: "Lịch học",
    path: "/lms/calendar",
    icon: CalendarDays,
    isActive: (pathname) => pathname === "/lms/calendar" || pathname === "/lms/live-schedule",
  },
  {
    id: "assignments",
    label: "Bài tập",
    path: "/lms/assignments",
    icon: FileCheck2,
    isActive: (pathname) => pathname.startsWith("/lms/assignments") || pathname.startsWith("/lms/assignment/") || pathname.startsWith("/lms/quiz"),
  },
];

function Brand({ collapsed = false }) {
  return (
    <Link
      to="/lms/dashboard"
      className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}
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

function preloadLearningRoute(path) {
  if (path === "/lms/vocabulary") {
    import("../../features/learning/pages/StudentVocabularyHubPage.jsx").catch(() => {});
  } else if (path === "/lms/formulas") {
    import("../../features/learning/pages/StudentFormulaHubPage.jsx").catch(() => {});
  } else if (path === "/lms/recordings") {
    import("../../features/learning/pages/StudentRecordingsPage.jsx").catch(() => {});
  }
}

function StudentNavItem({ item, onNavigate, collapsed = false }) {
  const location = useLocation();
  const Icon = item.icon;
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  const isCourseSection = item.path === "/lms/my-learning" && (
    location.pathname.startsWith("/lms/courses") || location.pathname.startsWith("/lms/learn")
  );
  const isCalendarSection = item.path === "/lms/calendar" && location.pathname === "/lms/live-schedule";
  const isAssignmentSection = item.path === "/lms/assignments" && (
    location.pathname.startsWith("/lms/assignment/") || location.pathname.startsWith("/lms/quiz")
  );
  const isChildMatch = hasChildren && item.children.some((sub) => (
    location.pathname === sub.path
    || location.pathname.startsWith(`${sub.path}/`)
    || (sub.path === "/lms/files" && location.pathname.startsWith("/lms/materials"))
  ));

  const [isOpen, setIsOpen] = useState(isChildMatch);

  useEffect(() => {
    if (isChildMatch) setIsOpen(true);
  }, [isChildMatch]);

  if (!hasChildren) {
    return (
      <NavLink
        to={item.path}
        end={item.end}
        onClick={onNavigate}
        onMouseEnter={() => preloadLearningRoute(item.path)}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) => {
          const active = isActive || isCourseSection || isCalendarSection || isAssignmentSection;
          return `group relative flex items-center rounded-xl text-sm font-semibold transition ${
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
          } ${
            active
              ? "bg-[#dff1ff] text-blue-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300"
              : "text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
          }`;
        }}
      >
        {({ isActive }) => {
          const active = isActive || isCourseSection || isCalendarSection || isAssignmentSection;
          return (
            <>
              <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? "text-blue-600 dark:text-sky-400" : "text-[#17365f] dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-sky-400"}`} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
            </>
          );
        }}
      </NavLink>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative flex items-center">
        {collapsed ? (
          <Link
            to={item.path}
            onClick={onNavigate}
            title={item.label}
            className={`group relative flex flex-1 items-center justify-center rounded-xl px-0 py-2.5 text-sm font-semibold transition ${
              isChildMatch
                ? "bg-[#dff1ff] text-blue-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300"
                : "text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/70"
            }`}
          >
            <Icon className={`h-4.5 w-4.5 shrink-0 ${isChildMatch ? "text-blue-600 dark:text-sky-400" : "text-[#17365f] dark:text-slate-400 group-hover:text-blue-600"}`} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            className={`group relative flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 pr-8 text-left text-sm font-semibold transition ${
              isChildMatch
                ? "bg-[#dff1ff] text-blue-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300"
                : "text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
            }`}
          >
            <Icon className={`h-4.5 w-4.5 shrink-0 ${isChildMatch ? "text-blue-600 dark:text-sky-400" : "text-[#17365f] dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-sky-400"}`} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <ChevronDown className={`absolute right-2.5 h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {!collapsed && isOpen && (
        <div className="ml-3 pl-3 border-l-2 border-sky-200/80 dark:border-slate-800 space-y-1 py-1">
          {item.children.map((sub) => {
            const SubIcon = sub.icon;
            const isSubActive =
              location.pathname === sub.path
              || location.pathname.startsWith(`${sub.path}/`)
              || (sub.path === "/lms/files" && location.pathname.startsWith("/lms/materials"));
            return (
              <Link
                key={sub.path}
                to={sub.path}
                onClick={onNavigate}
                onMouseEnter={() => preloadLearningRoute(sub.path)}
                className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  isSubActive
                    ? "bg-blue-100/90 text-blue-800 dark:bg-sky-950/80 dark:text-sky-200 font-bold shadow-2xs"
                    : "text-[#244866] dark:text-slate-400 hover:bg-blue-50/70 hover:text-blue-700 dark:hover:bg-slate-800/60 dark:hover:text-slate-200 font-medium"
                }`}
              >
                <SubIcon className={`h-3.5 w-3.5 shrink-0 transition ${isSubActive ? "text-blue-600 dark:text-sky-400" : "text-slate-400 group-hover:text-blue-600"}`} />
                <span className="truncate">{sub.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate, collapsed = false, onToggleCollapse, showMyCourses = false }) {
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden transition-[padding] duration-300 ${collapsed ? "px-2 py-4" : "px-4 py-5"}`}>
      <div className={`shrink-0 flex items-center ${collapsed ? "flex-col gap-2 px-0" : "justify-between px-1"}`}>
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
          title="Không gian Học viên CSCA"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      ) : (
        <div className="mt-3 mb-2 flex shrink-0 items-center justify-between rounded-xl border border-sky-100 bg-[#eef7fd] dark:border-slate-800 dark:bg-slate-800/80 px-3 py-1.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-black tracking-wide text-[#102f63] dark:text-slate-200">
              Không gian Học viên
            </span>
          </div>
          <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase text-emerald-700 dark:text-emerald-400">
            STUDENT
          </span>
        </div>
      )}

      <div className="my-2 h-px shrink-0 bg-slate-100 dark:bg-slate-800" />
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Điều hướng LMS học viên">
        {STUDENT_NAV.filter((item) => item.path !== "/lms/my-learning" || showMyCourses).map((item) => (
          <StudentNavItem key={item.path + item.label} item={item} onNavigate={onNavigate} collapsed={collapsed} />
        ))}
      </nav>
      <div className="mt-3 shrink-0 border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1">
        <Link
          to="/courses"
          onClick={onNavigate}
          title={collapsed ? "Khóa học & Record" : undefined}
          className={`flex items-center rounded-xl text-xs font-bold transition ${
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
          } text-purple-700 hover:bg-purple-50/80 dark:text-purple-300 dark:hover:bg-purple-950/40`}
        >
          <Video className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">Khóa học Record</span>}
        </Link>
        <Link
          to="/"
          onClick={onNavigate}
          title={collapsed ? "Trang chủ CSCA" : undefined}
          className={`flex items-center rounded-xl text-xs font-semibold text-[#17365f] dark:text-slate-400 transition hover:bg-blue-50/80 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-white ${
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">Trang chủ CSCA</span>}
        </Link>
        <NavLink
          to="/lms/settings"
          onClick={onNavigate}
          title={collapsed ? "Cài đặt học viên" : undefined}
          className={({ isActive }) => `flex items-center rounded-xl text-xs font-semibold transition ${
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
          } ${
            isActive
              ? "bg-[#dff1ff] text-blue-700 shadow-sm dark:bg-sky-950/60 dark:text-sky-300"
              : "text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          }`}
        >
          {({ isActive }) => (
            <>
              <Settings className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-600 dark:text-sky-400" : "text-[#17365f] dark:text-slate-400"}`} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">Cài đặt học viên</span>}
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

  const cycleWallpaper = () => {
    const currentIndex = CSCA_WALLPAPERS.findIndex((w) => w.url === currentWallpaper || w.cloudinaryUrl === currentWallpaper);
    const nextIndex = (currentIndex + 1) % CSCA_WALLPAPERS.length;
    const nextWp = CSCA_WALLPAPERS[nextIndex].cloudinaryUrl || CSCA_WALLPAPERS[nextIndex].url;
    setCurrentWallpaper(nextWp);
    localStorage.setItem("csca_lms_wallpaper", nextWp);
    window.dispatchEvent(new CustomEvent("csca_wallpaper_changed", { detail: nextWp }));
  };

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
      className={`student-lms min-h-screen overflow-x-clip transition-colors duration-200 ${
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
        isSidebarCollapsed ? "left-0 lg:left-[98px]" : "left-0 lg:left-[252px]"
      } ${
        !isDarkMode
          ? (hasScenicBackground ? "bg-transparent" : "border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-xl")
          : "border-b border-slate-800/80 bg-slate-900/95 shadow-sm backdrop-blur-xl text-white"
      }`}>
        <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/lms/dashboard"
              className="flex items-center gap-2 rounded-xl border border-white/85 bg-white/85 px-2.5 py-1.5 shadow-sm backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-800/90"
              aria-label="CSCA LMS - Tổng quan"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                <BookOpen className="h-4 w-4" />
              </span>
              <span className="text-xs font-black tracking-tight text-[#102f63] dark:text-white">CSCA LMS</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
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

            <button
              type="button"
              onClick={cycleWallpaper}
              className={`hidden sm:flex h-9 w-9 items-center justify-center rounded-xl transition ${
                !isDarkMode
                  ? "border border-white/85 bg-[#e4f4ff]/85 text-[#17365f] shadow-[0_5px_18px_rgba(32,91,135,0.18)] backdrop-blur-md hover:bg-white hover:text-blue-700"
                  : "border border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white shadow-sm"
              }`}
              title="Đổi ảnh nền"
              aria-label="Đổi ảnh nền"
            >
              <Palette className="h-4 w-4" />
            </button>

            <NotificationBell variant={hasScenicBackground && !isDarkMode ? "bare" : "default"} />

            {authUser && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  aria-label="Menu tài khoản"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className={`relative flex items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 transition ${
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
                    <Link to="/lms/settings" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-white">
                      <Settings className="h-4 w-4" /> Cài đặt & Hồ sơ
                    </Link>
                    <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
                    <Link to="/courses" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-slate-800">
                      <Video className="h-4 w-4" /> Khóa học & Record
                    </Link>
                    <Link to="/" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-blue-700 dark:text-sky-300 hover:bg-blue-50 dark:hover:bg-slate-800">
                      <Home className="h-4 w-4" /> Trang chủ CSCA
                    </Link>
                    <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
                    <button type="button" onClick={() => { setProfileMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40">
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
        isSidebarCollapsed ? "w-[74px]" : "w-[228px]"
      }`}>
        <Sidebar
          collapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          showMyCourses={authUser?.hasActiveLiveEnrollment === true}
        />
      </aside>

      {mobileOpen && (
        <>
          <button type="button" className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu học viên" />
          <div className="fixed inset-y-3 left-3 z-[60] w-[min(18rem,88vw)] overflow-hidden rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-white/80 dark:border-slate-800 shadow-2xl lg:hidden">
            <Sidebar
              onNavigate={() => setMobileOpen(false)}
              collapsed={false}
              showMyCourses={authUser?.hasActiveLiveEnrollment === true}
            />
          </div>
        </>
      )}

      <main className={`min-h-screen min-w-0 pt-16 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0 transition-[padding] duration-300 ease-in-out ${
        isSidebarCollapsed ? "lg:pl-[98px]" : "lg:pl-[256px]"
      }`}>{children}</main>

      {/* Mobile PWA Bottom Navigation Bar (< lg) */}
      <nav
        aria-label="Điều hướng nhanh học viên"
        className="student-mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-sky-200/80 bg-[#e6f4fd]/95 px-2 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(20,60,100,0.1)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_-8px_28px_rgba(0,0,0,0.5)] lg:hidden"
      >
        <div className={`mx-auto grid max-w-md gap-1 ${authUser?.hasActiveLiveEnrollment === true ? "grid-cols-5" : "grid-cols-4"}`}>
          {MOBILE_BOTTOM_NAV.filter((item) => item.id !== "learning" || authUser?.hasActiveLiveEnrollment === true).map((item) => {
            const Icon = item.icon;
            const active = !mobileOpen && item.isActive(location.pathname);
            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold transition ${
                  active
                    ? "bg-blue-600/12 text-blue-700 dark:bg-sky-500/20 dark:text-sky-300 font-black"
                    : "text-[#17365f]/80 hover:text-blue-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? "text-blue-600 dark:text-sky-400" : ""}`} />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold transition ${
              mobileOpen
                ? "bg-blue-600/12 text-blue-700 dark:bg-sky-500/20 dark:text-sky-300 font-black"
                : "text-[#17365f]/80 hover:text-blue-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {mobileOpen ? <X className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-sky-400" /> : <Menu className="h-4.5 w-4.5 shrink-0" />}
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
