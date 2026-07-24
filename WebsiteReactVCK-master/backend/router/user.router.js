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

const router = express.Router();

// Đăng ký và xác thực email
router.post("/signup", signup);
router.post("/complete-signup", completeSignup);

// Đăng nhập và đăng xuất
router.get("/google", startGoogleLogin);
router.get("/google/callback", handleGoogleCallback);
router.post("/login", login);
router.post("/logout", logout);

// Password reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

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
