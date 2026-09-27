import { hasActiveStudentLmsAccess } from "./requireActiveStudentLmsAccess.js";

const requireRole = (...allowedRoles) => {
  const roles = allowedRoles.flat().filter(Boolean);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để tiếp tục",
        errorCode: "UNAUTHENTICATED",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện thao tác này",
        errorCode: "FORBIDDEN",
      });
    }

    // The `user` role belongs to public-site accounts as well. Any route that
    // explicitly requires a learner role is private LMS functionality and
    // therefore also requires the active Management entitlement.
    if (req.user.role === "user" && roles.includes("user") && !hasActiveStudentLmsAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực",
        errorCode: "LMS_ACCESS_NOT_GRANTED",
      });
    }

    return next();
  };
};

export default requireRole;
