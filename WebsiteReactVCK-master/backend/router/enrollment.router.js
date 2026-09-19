import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

const validationError = (res, message) => res.status(422).json({
  success: false,
  message,
  errorCode: "VALIDATION_ERROR",
});

const internalError = (res, message) => res.status(500).json({
  success: false,
  message,
  errorCode: "INTERNAL_ERROR",
});

// GET /api/enrollments/check/:courseId - Check if user is enrolled in a course
router.get("/check/:courseId", protectRoute, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    if (!/^\d+$/.test(String(courseId)) || Number(courseId) < 1) return validationError(res, "courseId không hợp lệ");

    const result = await query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
      [userId, courseId],
    );
    const isEnrolled = result.rows.length > 0;

    return res.json({
      success: true,
      data: { isEnrolled }
    });
  } catch (error) {
    console.error("Error checking enrollment status:", error);
    return internalError(res, "Lỗi khi kiểm tra đăng ký khóa học");
  }
});

// POST /api/enrollments - Enroll in a free course
router.post("/", protectRoute, async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    if (!/^\d+$/.test(String(courseId || "")) || Number(courseId) < 1) return validationError(res, "courseId không hợp lệ");

    const courseResult = await query(
      "SELECT id, is_published, COALESCE(is_free, true) AS is_free, external_course_id FROM courses WHERE id = $1",
      [courseId],
    );
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy khóa học", errorCode: "NOT_FOUND" });
    }
    if (!courseResult.rows[0].is_published) {
      return res.status(403).json({ success: false, message: "Khóa học chưa được mở đăng ký", errorCode: "FORBIDDEN" });
    }
    if (!courseResult.rows[0].is_free || courseResult.rows[0].external_course_id) {
      return res.status(403).json({
        success: false,
        message: "Khóa học này cần được cấp quyền từ hệ thống quản lý",
        errorCode: "MANAGEMENT_ACCESS_REQUIRED",
      });
    }

    const enrollmentRes = await query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active'
       RETURNING *`,
      [userId, courseId],
    );
    return res.status(201).json({
      success: true,
      data: enrollmentRes.rows[0],
      message: "Đăng ký khóa học thành công",
    });
  } catch (error) {
    console.error("Error enrolling in course:", error);
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Bạn đã đăng ký khóa học này", errorCode: "CONFLICT" });
    return internalError(res, "Lỗi khi đăng ký khóa học");
  }
});

// GET /api/enrollments/my - Get user's enrolled courses
router.get("/my", protectRoute, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await query(
      `SELECT e.id as enrollment_id, e.enrolled_at, c.*
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.user_id = $1 AND e.status = 'active'
       ORDER BY e.enrolled_at DESC`,
      [userId],
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching user enrollments:", error);
    return internalError(res, "Lỗi khi lấy danh sách khóa học đã đăng ký");
  }
});

// GET /api/enrollments/my-courses - Get detailed user enrolled courses with progress
router.get("/my-courses", protectRoute, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await query(
        `SELECT
          e.id AS enrollment_id,
          e.enrolled_at,
          c.id AS course_id,
          COALESCE(c.title, c.name) AS title,
          c.slug,
          COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
          c.category,
          c.level,
          c.description,
          COALESCE(
            (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.is_published = true),
            0
          ) AS total_lessons,
          COALESCE(
            (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = $1 AND lp.course_id = c.id AND lp.is_completed = true),
            0
          ) AS completed_lessons,
          (
            SELECT json_build_object(
              'lesson_id', lp.lesson_id,
              'title', l.title,
              'last_position_seconds', lp.last_position_seconds,
              'updated_at', lp.updated_at
            )
            FROM lesson_progress lp
            JOIN lessons l ON lp.lesson_id = l.id
            WHERE lp.user_id = $1 AND lp.course_id = c.id
            ORDER BY lp.updated_at DESC
            LIMIT 1
          ) AS last_lesson
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.user_id = $1 AND e.status = 'active'
        ORDER BY e.enrolled_at DESC`,
        [userId]
      );

    const courses = result.rows.map(row => {
        const total = parseInt(row.total_lessons) || 0;
        const completed = parseInt(row.completed_lessons) || 0;
        const progress_percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
          ...row,
          total_lessons: total,
          completed_lessons: completed,
          progress_percent
        };
      });

    return res.json({
      success: true,
      data: courses
    });
  } catch (error) {
    console.error("Error fetching detailed user enrollments:", error);
    return internalError(res, "Lỗi khi lấy tiến độ học tập chi tiết");
  }
});

export default router;
