/* eslint-disable react/prop-types */
import { Link, useLocation } from 'react-router-dom';
import {
  FiGrid,
  FiBook,
  FiCalendar,
  FiUser,
  FiCheckSquare,
  FiLink,
  FiShield,
  FiActivity,
  FiFileText,
  FiList,
  FiChevronRight,
} from 'react-icons/fi';
import { useAuthContext } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

const Sidebar = ({ mobileOpen, collapsed, closeMobileSidebar }) => {
  const { authUser } = useAuthContext();
  const { t } = useTranslation();
  const location = useLocation();

  const handleLinkClick = () => {
    // Only collapse sidebar when clicking on mobile / tablet (< 1024px)
    if (window.innerWidth < 1024) {
      closeMobileSidebar();
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
      group: 'Tổng quan',
      items: [
        {
          title: 'Bảng điều khiển',
          icon: <FiGrid className="w-4 h-4 shrink-0" />,
          path: '/admin/dashboard',
        },
        {
          title: t('adminCourse') || 'Khóa học & giáo trình',
          icon: <FiBook className="w-4 h-4 shrink-0" />,
          path: '/admin/curriculum',
        },
        {
          title: 'Lớp học',
          icon: <FiLink className="w-4 h-4 shrink-0" />,
          path: '/admin/classes',
        },
        {
          title: 'Lịch học',
          icon: <FiCalendar className="w-4 h-4 shrink-0" />,
          path: '/admin/calendar',
        },
      ],
    },
    {
      group: 'Đào tạo',
      items: [
        { title: 'Duyệt sửa điểm danh', icon: <FiCheckSquare className="w-4 h-4 shrink-0" />, path: '/admin/attendance-review' },
        { title: 'Sổ điểm & tổng kết', icon: <FiFileText className="w-4 h-4 shrink-0" />, path: '/admin/student-progress' },
        { title: 'Hỗ trợ học viên', icon: <FiUser className="w-4 h-4 shrink-0" />, path: '/admin/support' },
        { title: 'Ngân hàng câu hỏi', icon: <FiList className="w-4 h-4 shrink-0" />, path: '/admin/question-bank' },
        {
          title: 'Chấm bài',
          icon: <FiCheckSquare className="w-4 h-4 shrink-0" />,
          path: '/admin/grading',
        },
        {
          title: 'Quiz học viên',
          icon: <FiList className="w-4 h-4 shrink-0" />,
          path: '/admin/quizzes',
        },
      ],
    },
    {
      group: 'Hệ thống',
      items: [
        {
          title: 'Phân quyền',
          icon: <FiShield className="w-4 h-4 shrink-0" />,
          path: '/admin/permissions',
        },
        {
          title: 'Đồng bộ dữ liệu',
          icon: <FiActivity className="w-4 h-4 shrink-0" />,
          path: '/admin/sync',
        },
        {
          title: 'Nhật ký hệ thống',
          icon: <FiFileText className="w-4 h-4 shrink-0" />,
          path: '/admin/audit-logs',
        },
        ...(authUser?.role === 'admin'
          ? [
              {
                title: t('adminUser') || 'Người dùng',
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
      className={`fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-64 flex-col justify-between overflow-y-auto border-r border-gray-200 bg-white shadow-xl transition-[transform,width] duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 lg:shadow-none ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } ${
        collapsed ? 'lg:w-20' : 'lg:w-64'
      }`}
    >
      <div className={`space-y-5 p-3.5 ${collapsed ? 'lg:px-2.5' : ''}`}>
        {menuSections.map((sec, idx) => (
          <div key={idx} className="space-y-1">
            <div className={`px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 font-mono ${collapsed ? 'lg:sr-only' : ''}`}>
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
                    title={collapsed ? item.title : undefined}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${collapsed ? 'lg:justify-center lg:px-2' : ''} ${
                      active
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`}
                      >
                        {item.icon}
                      </div>
                      <span className={`truncate ${collapsed ? 'lg:sr-only' : ''}`}>{item.title}</span>
                    </div>
                    {active && <FiChevronRight className={`w-3.5 h-3.5 text-blue-200 ${collapsed ? 'lg:hidden' : ''}`} />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer System Badge */}
      <div className={`flex items-center justify-between border-t border-gray-100 p-3.5 text-[11px] font-mono text-gray-400 dark:border-slate-800 dark:text-slate-500 ${collapsed ? 'lg:justify-center lg:px-2.5' : ''}`}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className={collapsed ? 'lg:sr-only' : ''}>CSCA Admin</span>
        </span>
        <span className={`text-[10px] text-gray-400 dark:text-slate-600 uppercase ${collapsed ? 'lg:hidden' : ''}`}>PROD</span>
      </div>
    </aside>
  );
};

export default Sidebar;
