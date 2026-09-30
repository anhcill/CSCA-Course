import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AdminNavbar from '../../components/admin/AdminNavbar';
import Sidebar from '../../components/admin/Sidebar';

const AdminLayout = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.localStorage.getItem('admin-sidebar-collapsed') === 'true');

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <AdminNavbar toggleSidebar={toggleSidebar} />
      
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
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
