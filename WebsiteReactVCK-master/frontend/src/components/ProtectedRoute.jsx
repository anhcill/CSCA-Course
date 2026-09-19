/* eslint-disable react/prop-types */
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import Loading from './Loading';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { authUser, loading } = useAuthContext();

  if (loading) {
    return <Loading loading text="Đang xác thực tài khoản..." />;
  }

  if (!authUser) {
    return <Navigate to="/" replace state={{ authRequired: true }} />;
  }

  if (allowedRoles && !allowedRoles.includes(authUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
