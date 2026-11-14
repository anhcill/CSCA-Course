/**
 * A `user` role alone represents a public-site account.  Private LMS access
 * is issued by Management or an active verified external integration (e.g. Moly)
 * without polluting `is_management_managed`. Course/class checks still run afterwards.
 */
export const hasActiveStudentLmsAccess = (user) => Boolean(
  user
  && user.role === "user"
  && (
    user.is_internal_test_account
    || Boolean(user.has_external_lms_access)
    || (
      user.is_management_managed
      && user.lms_account_status === "active"
    )
  ),
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
