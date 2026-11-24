import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  Menu,
  Wallet,
  X,
} from 'lucide-react';
import AdminNavbar from '../../components/admin/AdminNavbar';
import Sidebar from '../../components/admin/Sidebar';

const MOBILE_ADMIN_TABS = [
  {
    id: 'dashboard',
    label: 'Tổng quan',
    path: '/admin/dashboard',
    icon: LayoutDashboard,
    isActive: (p) => p === '/admin' || p === '/admin/dashboard',
  },
  {
    id: 'classes',
    label: 'Lớp học',
    path: '/admin/classes',
    icon: BookOpen,
    isActive: (p) => p.startsWith('/admin/classes'),
  },
  {
    id: 'calendar',
    label: 'Lịch học',
    path: '/admin/calendar',
    icon: CalendarDays,
    isActive: (p) => p.startsWith('/admin/calendar'),
  },
  {
    id: 'salaries',
    label: 'Lương',
    path: '/admin/salaries',
    icon: Wallet,
    isActive: (p) => p.startsWith('/admin/salaries'),
  },
];

const AdminLayout = () => {
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = window.localStorage.getItem('csca_admin_sidebar_collapsed');
    return saved === 'true';
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((collapsed) => !collapsed);
  };

  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);

  useEffect(() => {
    window.localStorage.setItem('csca_admin_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top_right,rgba(186,224,252,0.75),transparent_38%),linear-gradient(180deg,#eaf6ff_0%,#f4faff_50%,#eaf5fd_100%)] text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:bg-none dark:text-slate-100">
      <AdminNavbar collapsed={isSidebarCollapsed} />

      {/* Mobile backdrop overlay when drawer is open */}
      {isMobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs lg:hidden"
          onClick={closeMobileSidebar}
          aria-label="Đóng menu quản trị"
        />
      )}

      {/* Floating Sidebar (Desktop) & Drawer (Mobile) */}
      <Sidebar
        mobileOpen={isMobileSidebarOpen}
        collapsed={isSidebarCollapsed}
        closeMobileSidebar={closeMobileSidebar}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* Main Content Area */}
      <main
        className={`min-h-screen min-w-0 pt-16 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6 transition-[padding] duration-300 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-[98px]' : 'lg:pl-[268px]'
        }`}
      >
        <div className="mx-auto w-full min-w-0 max-w-7xl px-3.5 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile PWA Bottom Navigation Bar (< lg) */}
      <nav
        aria-label="Điều hướng nhanh quản trị"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-200/80 bg-[#e6f4fd]/95 px-2 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))] shadow-[0_-8px_28px_rgba(20,60,100,0.1)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_-8px_28px_rgba(0,0,0,0.5)] lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {MOBILE_ADMIN_TABS.map((item) => {
            const Icon = item.icon;
            const active = !isMobileSidebarOpen && item.isActive(location.pathname);
            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={closeMobileSidebar}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold transition ${
                  active
                    ? 'bg-blue-600/12 text-blue-700 dark:bg-sky-500/20 dark:text-sky-300 font-black'
                    : 'text-[#17365f]/80 hover:text-blue-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? 'text-blue-600 dark:text-sky-400' : ''}`} />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen((open) => !open)}
            aria-expanded={isMobileSidebarOpen}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold transition ${
              isMobileSidebarOpen
                ? 'bg-blue-600/12 text-blue-700 dark:bg-sky-500/20 dark:text-sky-300 font-black'
                : 'text-[#17365f]/80 hover:text-blue-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {isMobileSidebarOpen ? (
              <X className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-sky-400" />
            ) : (
              <Menu className="h-4.5 w-4.5 shrink-0" />
            )}
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default AdminLayout;
