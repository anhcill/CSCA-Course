/**
 * Authorize access to a resource that belongs to the current user.
 *
 * `loadOwnerId` should return the resource owner's id, or null when the
 * resource does not exist. Administrators may bypass ownership checks when
 * their role is included in `allowRoles`.
 */
const requireOwnership = ({ loadOwnerId, resourceName = "tài nguyên", allowRoles = ["admin"] }) => (
  async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để tiếp tục",
        errorCode: "UNAUTHENTICATED",
      });
    }

    if (allowRoles.includes(req.user.role)) return next();

    try {
      const ownerId = await loadOwnerId(req);

      if (ownerId === null || ownerId === undefined) {
        return res.status(404).json({
          success: false,
          message: `Không tìm thấy ${resourceName}`,
          errorCode: "NOT_FOUND",
        });
      }

      if (String(ownerId) !== String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: `Bạn không có quyền truy cập ${resourceName} này`,
          errorCode: "FORBIDDEN",
        });
      }

      return next();
    } catch (error) {
      console.error(`Ownership check failed for ${resourceName}:`, error);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi kiểm tra quyền truy cập",
        errorCode: "INTERNAL_ERROR",
      });
    }
  }
);

export default requireOwnership;
