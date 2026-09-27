/**
 * A `user` role alone represents a public-site account.  Private LMS access
 * is issued by the Management system and stays valid only while its synced
 * account status is active.  Course/class checks still run afterwards.
 */
export const hasActiveStudentLmsAccess = (user) => Boolean(
  user
  && user.role === "user"
  && user.is_management_managed
  && user.lms_account_status === "active",
);

const requireActiveStudentLmsAccess = (req, res, next) => {
  if (hasActiveStudentLmsAccess(req.user)) return next();
  return res.status(403).json({
    success: false,
    message: "Quyền học LMS chưa được Management cấp hoặc đã hết hiệu lực",
    errorCode: "LMS_ACCESS_NOT_GRANTED",
  });
};

export default requireActiveStudentLmsAccess;
