import jwt from 'jsonwebtoken';
import { query } from '../db/connect.js';

const protectRoute = async (req, res, next) => {
  let token;

  if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      `SELECT id, username, email, role, avatar_url, gender,
              is_vip, vip_expires_at, email_verified, created_at
       FROM users WHERE id = $1`,
      [verified.userId]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = rows[0];
    next();

  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export default protectRoute;
