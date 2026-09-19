import { query } from "../db/connect.js";

// Permission checks complement route ownership checks. Admin remains a break-glass role;
// teacher/student access is controlled by the persisted LMS matrix.
const requirePermission = (permissionCode) => async (req, res, next) => {
  if (req.user?.role === "admin") return next();
  try {
    const result = await query(
      `SELECT 1
       FROM lms_permissions p
       JOIN lms_role_permissions rp ON rp.permission_id = p.id
       WHERE p.code = $1 AND rp.role = $2 AND rp.is_allowed = TRUE`,
      [permissionCode, req.user?.role],
    );
    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Vai trò của bạn chưa được cấp quyền cho thao tác này",
        errorCode: "PERMISSION_DENIED",
        permission: permissionCode,
      });
    }
    return next();
  } catch (error) {
    console.error("Permission check failed:", error);
    return res.status(503).json({ success: false, message: "Không thể xác thực quyền LMS", errorCode: "PERMISSION_SERVICE_UNAVAILABLE" });
  }
};

export default requirePermission;
