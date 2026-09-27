/* eslint-disable react/prop-types */
import { useAuthContext } from '../context/AuthContext';
import Loading from './Loading';
import Unauthorized from '../pages/client/Unauthorized';
import Forbidden from '../pages/client/Forbidden';
import { hasStudentLmsAccess } from '../utils/lmsAccess';

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

  // A learner LMS account is an entitlement issued by Management, not a
  // consequence of signing up or buying a public recorded course.
  if (authUser?.role === 'user' && !hasStudentLmsAccess(authUser)) {
    return <Forbidden />;
  }

  return children;
}
