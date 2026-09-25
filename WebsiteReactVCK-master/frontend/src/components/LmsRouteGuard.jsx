/* eslint-disable react/prop-types */
import { useAuthContext } from '../context/AuthContext';
import { LoadingState } from './common/StateView';
import Loading from './Loading';
import Unauthorized from '../pages/client/Unauthorized';
import Forbidden from '../pages/client/Forbidden';

const ROLE_ALIASES = {
  student: ['student', 'user'],
  user: ['student', 'user'],
  creator: ['creator', 'teacher'],
  admin: ['admin'],
};

/**
 * LmsRouteGuard: Bọc bảo vệ route LMS theo Authentication và RBAC Role.
 * 
 * - Chưa đăng nhập -> Hiển thị màn hình Unauthorized (401).
 * - Sai quyền hạn -> Hiển thị màn hình Forbidden (403).
 * - Đủ điều kiện -> Render children bình thường.
 */
export default function LmsRouteGuard({
  children,
  allowedRoles = ['student', 'user', 'creator', 'admin'],
  requireAuth = true,
}) {
  const { authUser, loading } = useAuthContext();

  if (loading) {
    return <Loading loading text="Đang kiểm tra quyền hạn tài khoản..." />;
  }

  if (requireAuth && !authUser) {
    return <Unauthorized />;
  }

  if (authUser && allowedRoles && allowedRoles.length > 0) {
    const hasPermission = allowedRoles.some((allowed) => {
      if (authUser.role === allowed) return true;
      const aliases = ROLE_ALIASES[allowed] || [allowed];
      return aliases.includes(authUser.role);
    });

    if (!hasPermission) {
      return <Forbidden />;
    }
  }

  // Management-created student accounts are admitted to the private LMS only
  // after an active entitlement is synchronized. Teachers and admins retain
  // their role-based access and unmanaged accounts keep free-course access.
  if (authUser?.role === 'user'
    && authUser.isManagementManaged
    && authUser.lmsAccountStatus !== 'active') {
    return <Forbidden />;
  }

  return children;
}
