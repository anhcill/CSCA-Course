import { useState, useEffect } from 'react'; // Import useEffect
import { Navigate } from 'react-router-dom';
import AuthModal from './auth/AuthModal';
import { useAuthContext } from '../context/AuthContext'; // Import useAuthContext
import Loading from './Loading';

const ProtectedRoute = ({ children }) => { // KHÔNG CẦN NHẬN AUTHUSER TRỰC TIẾP TỪ PROP NỮA
  const { authUser, loading } = useAuthContext(); // LẤY AUTHUSER VÀ LOADING TỪ CONTEXT
  const [showAuthModal, setShowAuthModal] = useState(false); // Move useState for AuthModal here

  // Thêm useEffect để theo dõi trạng thái loading và authUser
  useEffect(() => {
    if (!loading && !authUser) {
      setShowAuthModal(true); // Chỉ set showAuthModal khi loading xong và authUser vẫn null
    } else {
      setShowAuthModal(false); // Đảm bảo AuthModal đóng khi đã xác thực hoặc đang loading
    }
  }, [loading, authUser]); // Theo dõi loading và authUser

  if (loading) {
    return <Loading loading text="Đang xác thực tài khoản..." />;
  }

  if (authUser) {
    // console.log("ProtectedRoute - Loading xong, User đã được xác thực, render children."); // <---- LOG KHI USER ĐƯỢC XÁC THỰC
    return children;
  }

  // KHÔNG REDIRECT TRỰC TIẾP VỀ TRANG CHỦ NỮA Ở ĐÂY
  // Việc hiển thị AuthModal và Navigate đã được xử lý trong useEffect

  return null; // Không render gì cả, hoặc có thể render placeholder
};

export default ProtectedRoute;