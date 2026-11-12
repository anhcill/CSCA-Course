import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import Loading from './Loading';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { authUser, loading } = useAuthContext();
  const location = useLocation();

  if (loading) {
    return <Loading loading text="Đang xác thực tài khoản..." />;
  }

  if (!authUser) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/" replace state={{ openAuthModal: 'login', returnTo }} />;
  }

  if (allowedRoles && !allowedRoles.includes(authUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
