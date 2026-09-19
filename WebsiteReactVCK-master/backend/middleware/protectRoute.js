import jwt from 'jsonwebtoken';
import { query } from '../db/connect.js';

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
    const { rows } = await query(
      `SELECT id, username, email, role, avatar_url, gender,
              is_vip, vip_expires_at, email_verified, is_locked, created_at
       FROM users WHERE id = $1`,
      [verified.userId]
    );

    if (!rows[0]) {
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không còn hợp lệ",
        errorCode: "UNAUTHENTICATED",
      });
    }

    if (rows[0].is_locked) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        errorCode: "ACCOUNT_LOCKED",
      });
    }

    req.user = rows[0];
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
