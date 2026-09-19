import requireRole from "./requireRole.js";

// Creator là giáo viên; admin có toàn quyền trên không gian LMS.
const requireTeacher = requireRole("creator", "admin");

export default requireTeacher;
