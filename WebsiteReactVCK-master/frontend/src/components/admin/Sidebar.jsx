/* eslint-disable react/prop-types */
import { Link, useLocation } from 'react-router-dom';
import {
  FiGrid,
  FiBook,
  FiCalendar,
  FiUser,
  FiEdit,
  FiLayers,
  FiCheckSquare,
  FiLink,
  FiShield,
  FiActivity,
  FiFileText,
  FiChevronRight,
} from 'react-icons/fi';
import { useAuthContext } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { authUser } = useAuthContext();
  const { t } = useTranslation();
  const location = useLocation();

  const handleLinkClick = () => {
    // Only collapse sidebar when clicking on mobile / tablet (< 1024px)
    if (window.innerWidth < 1024) {
      toggleSidebar();
    }
  };

  const isActive = (path) => {
    if (path === '/admin/dashboard') {
      return location.pathname === '/admin/dashboard' || location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  const menuSections = [
    {
      group: 'Tổng Quan & Vận Hành',
      items: [
        {
          title: 'Dashboard',
          icon: <FiGrid className="w-4 h-4 shrink-0" />,
          path: '/admin/dashboard',
        },
        {
          title: t('adminCourse') || 'Quản lý Khóa học',
          icon: <FiBook className="w-4 h-4 shrink-0" />,
          path: '/admin/courses',
        },
        {
          title: 'Quản lý Lớp & Moly',
          icon: <FiLink className="w-4 h-4 shrink-0" />,
          path: '/admin/classes',
        },
        {
          title: 'Lịch Toàn Trường',
          icon: <FiCalendar className="w-4 h-4 shrink-0" />,
          path: '/admin/calendar',
        },
      ],
    },
    {
      group: 'Học Liệu & Đào Tạo LMS',
      items: [
        {
          title: 'Soạn Giáo Trình R2',
          icon: <FiLayers className="w-4 h-4 shrink-0" />,
          path: '/lms/admin/curriculum',
        },
        {
          title: 'Portal Chấm Bài LMS',
          icon: <FiCheckSquare className="w-4 h-4 shrink-0" />,
          path: '/lms/admin/grading',
        },
        {
          title: t('adminPost') || 'Bài viết & Tin tức',
          icon: <FiEdit className="w-4 h-4 shrink-0" />,
          path: '/admin/posts',
        },
      ],
    },
    {
      group: 'Bảo Mật & Hệ Thống',
      items: [
        {
          title: 'Phân Quyền Ma Trận',
          icon: <FiShield className="w-4 h-4 shrink-0" />,
          path: '/admin/permissions',
        },
        {
          title: 'Đồng Bộ Outbox Moly',
          icon: <FiActivity className="w-4 h-4 shrink-0" />,
          path: '/admin/sync',
        },
        {
          title: 'Nhật Ký Kiểm Toán',
          icon: <FiFileText className="w-4 h-4 shrink-0" />,
          path: '/admin/audit-logs',
        },
        ...(authUser?.role === 'admin'
          ? [
              {
                title: t('adminUser') || 'Quản lý Người dùng',
                icon: <FiUser className="w-4 h-4 shrink-0" />,
                path: '/admin/users',
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 shadow-xl lg:shadow-none transition-transform duration-300 ease-in-out z-40 overflow-y-auto flex flex-col justify-between ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-3.5 space-y-5">
        {menuSections.map((sec, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 font-mono">
              {sec.group}
            </div>
            <div className="space-y-0.5 mt-1">
              {sec.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={handleLinkClick}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      active
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span className="truncate">{item.title}</span>
                    </div>
                    {active && <FiChevronRight className="w-3.5 h-3.5 text-blue-200" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer System Badge */}
      <div className="p-3.5 border-t border-gray-100 dark:border-slate-800 text-[11px] text-gray-400 dark:text-slate-500 flex items-center justify-between font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          CSCA Admin v2.4
        </span>
        <span className="text-[10px] text-gray-400 dark:text-slate-600 uppercase">PROD</span>
      </div>
    </aside>
  );
};

export default Sidebar;