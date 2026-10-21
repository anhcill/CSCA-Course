import jwt from 'jsonwebtoken';
import { TRUSTED_DEVICE_COOKIE, resolveAuthenticatedSession } from '../services/trustedDevice.service.js';

const protectRoute = async (req, res, next) => {
  let token;

  if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Bạn cần đăng nhập để tiếp tục",
      errorCode: "UNAUTHENTICATED",
    });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const deviceToken = req.cookies?.[TRUSTED_DEVICE_COOKIE];
    if (!verified.sessionId || !verified.sessionToken || !deviceToken) {
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không còn hợp lệ",
        errorCode: "UNAUTHENTICATED",
      });
    }

    const authenticated = await resolveAuthenticatedSession({
      userId: verified.userId,
      sessionId: verified.sessionId,
      sessionToken: verified.sessionToken,
      deviceToken,
      ipAddress: req.ip,
    });

    if (!authenticated) {
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không còn hợp lệ",
        errorCode: "UNAUTHENTICATED",
      });
    }

    if (authenticated.user.is_locked) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        errorCode: "ACCOUNT_LOCKED",
      });
    }

    req.user = authenticated.user;
    req.authSession = authenticated.authSession;
    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không còn hợp lệ",
      errorCode: "UNAUTHENTICATED",
    });
  }
};

export default protectRoute;
