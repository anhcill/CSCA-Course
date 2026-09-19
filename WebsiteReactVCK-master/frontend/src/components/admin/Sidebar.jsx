/* eslint-disable react/prop-types */
import { Link } from 'react-router-dom';
import {
  FiGrid,
  FiBook,
  FiUser,
  FiEdit,
  FiLayers,
  FiCheckSquare,
  FiLink,
  FiShield,
  FiActivity,
  FiFileText,
} from 'react-icons/fi';
import { useAuthContext } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { authUser } = useAuthContext();
  const { t } = useTranslation();

  const menuItems = [
    {
      title: 'Dashboard',
      icon: <FiGrid className="w-5 h-5" />,
      path: '/admin/dashboard',
    },
    {
      title: t('adminCourse') || 'Quản lý Khóa học',
      icon: <FiBook className="w-5 h-5" />,
      path: '/admin/courses',
    },
    {
      title: 'Quản lý Lớp & Moly',
      icon: <FiLink className="w-5 h-5" />,
      path: '/admin/classes',
    },
    {
      title: 'Soạn Giáo Trình R2',
      icon: <FiLayers className="w-5 h-5" />,
      path: '/lms/admin/curriculum',
    },
    {
      title: 'Portal Chấm Bài LMS',
      icon: <FiCheckSquare className="w-5 h-5" />,
      path: '/lms/admin/grading',
    },
    {
      title: 'Phân Quyền Ma Trận',
      icon: <FiShield className="w-5 h-5" />,
      path: '/admin/permissions',
    },
    {
      title: 'Đồng Bộ Outbox Moly',
      icon: <FiActivity className="w-5 h-5" />,
      path: '/admin/sync',
    },
    {
      title: 'Nhật Ký Kiểm Toán',
      icon: <FiFileText className="w-5 h-5" />,
      path: '/admin/audit-logs',
    },
    {
      title: t('adminPost') || 'Bài viết & Tin tức',
      icon: <FiEdit className="w-5 h-5" />,
      path: '/admin/posts',
    },
  ];

  if (authUser?.role === 'admin') {
    menuItems.push({
      title: t('adminUser') || 'Quản lý Người dùng',
      icon: <FiUser className="w-5 h-5" />,
      path: '/admin/users',
    });
  }


  return (
    <div
      className={`fixed left-0 top-16 h-full bg-white dark:bg-gray-900 shadow-lg transition-all duration-300 z-30
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-64`}
    >
      <div className="py-4">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="flex items-center space-x-3 px-4 py-3 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={toggleSidebar}
          >
            {item.icon}
            <span>{item.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;