import express from "express";
import {
  signup,
  completeSignup,
  login,
  logout,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
  updateOwnProfile,
  updateStudentProfile,
  startGoogleLogin,
  handleGoogleCallback
} from "../controllers/user.controllers.js";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { createRateLimiter } from "../middleware/security.js";

const router = express.Router();
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
});
const sensitiveAuthRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

// Đăng ký và xác thực email
router.post("/signup", sensitiveAuthRateLimit, signup);
router.post("/complete-signup", sensitiveAuthRateLimit, completeSignup);

// Đăng nhập và đăng xuất
router.get("/google", authRateLimit, startGoogleLogin);
router.get("/google/callback", authRateLimit, handleGoogleCallback);
router.post("/login", authRateLimit, login);
router.post("/logout", logout);

// Password reset
router.post("/request-password-reset", sensitiveAuthRateLimit, requestPasswordReset);
router.post("/reset-password", sensitiveAuthRateLimit, resetPassword);

// Current user
router.get("/me", protectRoute, getCurrentUser);
router.patch("/me", protectRoute, updateOwnProfile);
router.patch("/me/student-profile", protectRoute, updateStudentProfile);

// Admin routes
router.get("/", protectRoute, requireAdmin, getAllUsers);
router.post("/admin/users/", protectRoute, requireAdmin, createUser);
router.put("/admin/users/:id", protectRoute, requireAdmin, updateUser);
router.delete("/admin/users/:id", protectRoute, requireAdmin, deleteUser);

export default router;
