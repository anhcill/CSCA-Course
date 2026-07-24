const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Bạn không có quyền thực hiện thao tác này" });
  }

  next();
};

export default requireAdmin;
