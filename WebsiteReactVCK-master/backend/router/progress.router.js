import express from "express";
import { getClient, query, pool } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import { awardXp, XP_VALUES } from "../services/gamification.service.js";

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

const parsePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const ensureLessonAccess = async (lessonId, courseId, user) => {
  const lessonResult = await query(
    `SELECT l.id, l.course_id, l.is_published, c.is_published AS course_is_published, c.author_id
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE l.id = $1 AND l.course_id = $2`,
    [lessonId, courseId],
  );
  if (lessonResult.rows.length === 0) return { status: 404 };

  const lesson = lessonResult.rows[0];
  if (user.role === "creator" && String(lesson.author_id) !== String(user.id)) return { status: 403 };

  if (user.role === "user") {
    if (!lesson.is_published || !lesson.course_is_published) return { status: 404 };
    const enrollmentResult = await query(
      `SELECT 1 FROM enrollments
       WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
      [user.id, courseId],
    );
    if (enrollmentResult.rows.length === 0) return { status: 403 };
  }

  return { status: 200 };
};

// GET /api/progress/course/:courseId - Get full progress for a course
router.get("/course/:courseId", protectRoute, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    if (!parsePositiveId(courseId)) return validationError(res, "courseId không hợp lệ");

    const courseResult = await query("SELECT id FROM courses WHERE id = $1", [courseId]);
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy khóa học", errorCode: "NOT_FOUND" });
    }
    if (req.user.role === "user") {
      const enrollmentResult = await query(
        `SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
        [userId, courseId],
      );
      if (enrollmentResult.rows.length === 0) {
        return res.status(403).json({ success: false, message: "Bạn chưa đăng ký khóa học này", errorCode: "FORBIDDEN" });
      }
    }

    const result = await query(
      `SELECT * FROM lesson_progress WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId],
    );
    const progressRows = result.rows;

    // Calculate overall percentage
    const completedCount = progressRows.filter(p => p.is_completed).length;
    
    return res.json({
      success: true,
      data: {
        completedCount,
        progressList: progressRows
      }
    });
  } catch (error) {
    console.error("Error fetching lesson progress:", error);
    return internalError(res, "Lỗi khi lấy tiến độ học");
  }
});

// POST /api/progress/heartbeat - Update lesson position & completion
router.post("/heartbeat", protectRoute, async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId, courseId, lastPositionSeconds, isCompleted } = req.body;

    const parsedLessonId = parsePositiveId(lessonId);
    const parsedCourseId = parsePositiveId(courseId);
    if (!parsedLessonId || !parsedCourseId) {
      return validationError(res, "Thiếu lessonId hoặc courseId");
    }
    if (lastPositionSeconds !== undefined && (!Number.isFinite(Number(lastPositionSeconds)) || Number(lastPositionSeconds) < 0)) {
      return validationError(res, "lastPositionSeconds không hợp lệ");
    }
    if (isCompleted !== undefined && typeof isCompleted !== "boolean") {
      return validationError(res, "isCompleted không hợp lệ");
    }

    const access = await ensureLessonAccess(parsedLessonId, parsedCourseId, req.user);
    if (access.status === 404) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài học", errorCode: "NOT_FOUND" });
    }
    if (access.status === 403) {
      return res.status(403).json({ success: false, message: "Bạn chưa đăng ký khóa học này", errorCode: "FORBIDDEN" });
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        "SELECT is_completed FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2 FOR UPDATE",
        [userId, parsedLessonId],
      );
      const wasCompleted = Boolean(existingResult.rows[0]?.is_completed);
      const result = await client.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, course_id, last_position_seconds, is_completed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         last_position_seconds = EXCLUDED.last_position_seconds,
         is_completed = CASE WHEN lesson_progress.is_completed = true THEN true ELSE EXCLUDED.is_completed END,
       updated_at = NOW()
       RETURNING *`,
      [userId, parsedLessonId, parsedCourseId, Math.floor(Number(lastPositionSeconds || 0)), Boolean(isCompleted)],
      );
      let gamification = { awarded: false, xp: 0 };
      if (Boolean(isCompleted) && !wasCompleted) {
        gamification = await awardXp({
          db: client,
          userId,
          eventKey: `lesson:${parsedLessonId}:completed`,
          eventType: "lesson_completed",
          xp: XP_VALUES.lessonCompleted,
          metadata: { courseId: parsedCourseId, lessonId: parsedLessonId },
        });
      }
      await client.query("COMMIT");

      return res.json({
        success: true,
        data: { ...result.rows[0], gamification },
      });
    } catch (transactionError) {
      await client.query("ROLLBACK").catch(() => {});
      throw transactionError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    return internalError(res, "Lỗi khi cập nhật tiến độ học");
  }
});

// GET /api/progress/notes/:lessonId - Fetch notes for a lesson
router.get("/notes/:lessonId", protectRoute, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;

    const lessonResult = await query("SELECT course_id FROM lessons WHERE id = $1", [lessonId]);
    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài học", errorCode: "NOT_FOUND" });
    }
    const access = await ensureLessonAccess(lessonId, lessonResult.rows[0].course_id, req.user);
    if (access.status === 403) {
      return res.status(403).json({ success: false, message: "Bạn chưa đăng ký khóa học này", errorCode: "FORBIDDEN" });
    }

    const result = await pool.query(
      `SELECT id, user_id, lesson_id, course_id, content, timestamp_s, created_at, updated_at
       FROM notes
       WHERE user_id = $1 AND lesson_id = $2
       ORDER BY timestamp_s ASC, created_at DESC`,
      [userId, lessonId]
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách ghi chú" });
  }
});

// POST /api/progress/notes - Create a note
router.post("/notes", protectRoute, async (req, res) => {
  try {
    const userId = req.user.id;
    const { lessonId, content, timestampSeconds } = req.body;

    if (!lessonId || typeof content !== "string" || !content.trim()) {
      return validationError(res, "Thiếu thông tin lessonId hoặc content");
    }
    if (content.length > 10000) {
      return validationError(res, "Nội dung ghi chú quá dài");
    }

    // Get courseId from lessonId
    const lessonResult = await pool.query(
      "SELECT course_id FROM lessons WHERE id = $1",
      [lessonId]
    );

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài học", errorCode: "NOT_FOUND" });
    }

    const courseId = lessonResult.rows[0].course_id;
    const access = await ensureLessonAccess(lessonId, courseId, req.user);
    if (access.status === 403) {
      return res.status(403).json({ success: false, message: "Bạn chưa đăng ký khóa học này", errorCode: "FORBIDDEN" });
    }
    const ts = timestampSeconds !== undefined ? Math.floor(Number(timestampSeconds)) : 0;
    if (!Number.isFinite(ts) || ts < 0) return validationError(res, "timestampSeconds không hợp lệ");

    const result = await pool.query(
      `INSERT INTO notes (user_id, lesson_id, course_id, content, timestamp_s)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, lessonId, courseId, content, ts]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error creating note:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi tạo ghi chú" });
  }
});

// DELETE /api/progress/notes/:noteId - Delete a note
router.delete("/notes/:noteId", protectRoute, async (req, res) => {
  try {
    const userId = req.user.id;
    const { noteId } = req.params;

    const checkRes = await pool.query(
      "SELECT user_id FROM notes WHERE id = $1",
      [noteId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy ghi chú" });
    }

    if (String(checkRes.rows[0].user_id) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa ghi chú này" });
    }

    await pool.query(
      "DELETE FROM notes WHERE id = $1 AND user_id = $2",
      [noteId, userId]
    );

    return res.json({
      success: true,
      message: "Xóa ghi chú thành công"
    });
  } catch (error) {
    console.error("Error deleting note:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi xóa ghi chú" });
  }
});

export default router;
