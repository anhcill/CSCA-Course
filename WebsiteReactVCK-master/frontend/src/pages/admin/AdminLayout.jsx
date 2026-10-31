import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AdminNavbar from '../../components/admin/AdminNavbar';
import Sidebar from '../../components/admin/Sidebar';

const AdminLayout = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = window.localStorage.getItem('admin-sidebar-collapsed');
    return saved !== null ? saved === 'true' : true; // Mặc định thu gọn
  });

  const toggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setIsMobileSidebarOpen((open) => !open);
      return;
    }
    setIsSidebarCollapsed((collapsed) => !collapsed);
  };

  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);

  useEffect(() => {
    window.localStorage.setItem('admin-sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(186,224,252,0.85),transparent_36%),linear-gradient(180deg,#edf8ff_0%,#f7fbff_45%,#edf6fc_100%)] text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:bg-none dark:text-slate-100">
      <AdminNavbar toggleSidebar={toggleSidebar} collapsed={isSidebarCollapsed} />
      
      {/* Mobile backdrop overlay when sidebar is open */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-30 lg:hidden transition-opacity"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Admin Sidebar */}
      <Sidebar mobileOpen={isMobileSidebarOpen} collapsed={isSidebarCollapsed} closeMobileSidebar={closeMobileSidebar} />

      {/* Main Content Area - dynamically adjusts padding when sidebar opens/collapses on desktop */}
      <main
        className={`pt-16 min-h-screen transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
