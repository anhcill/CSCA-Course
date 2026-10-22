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

const parsePositiveId = (value) => {
  if (!/^\d+$/.test(String(value || ""))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") return false;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
};

const parsePagination = (req) => {
  const page = Number.parseInt(req.query.page || "1", 10);
  const limit = Number.parseInt(req.query.limit || "20", 10);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  return { page, limit, offset: (page - 1) * limit };
};

const DEFAULT_PREFERENCES = Object.freeze({
  courses: true,
  assignments: true,
  calendar: true,
  announcements: true,
  grades: true,
  system: true,
});

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES);

const enabledNotificationSql = (notificationAlias = "notifications") => `
  COALESCE(
    CASE
      WHEN COALESCE(${notificationAlias}.event_type, ${notificationAlias}.type, '') ~ '^(assignment|quiz|deadline)\\.'
        OR ${notificationAlias}.type = 'assignment' THEN np.assignments
      WHEN COALESCE(${notificationAlias}.event_type, ${notificationAlias}.type, '') ~ '^(session|schedule|exam|live_class)\\.'
        OR ${notificationAlias}.type = 'live_class' THEN np.calendar
      WHEN COALESCE(${notificationAlias}.event_type, ${notificationAlias}.type, '') ~ '^(grade|attendance|certificate)\\.'
        OR ${notificationAlias}.type IN ('grade', 'certificate') THEN np.grades
      WHEN COALESCE(${notificationAlias}.event_type, ${notificationAlias}.type, '') ~ '^(announcement|news|teacher)\\.'
        OR ${notificationAlias}.type IN ('announcement', 'news', 'teacher') THEN np.announcements
      WHEN COALESCE(${notificationAlias}.event_type, ${notificationAlias}.type, '') ~ '^(course|file|material)\\.'
        OR ${notificationAlias}.type IN ('course', 'file', 'material') THEN np.courses
      ELSE np.system
    END,
    TRUE
  ) = TRUE`;

// GET /unread-count - Fast endpoint for badge poll
router.get("/unread-count", protectRoute, async (req, res) => {
  try {
    const unreadResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       LEFT JOIN notification_preferences np ON np.user_id = notifications.user_id
       WHERE notifications.user_id = $1 AND notifications.is_read = false
         AND ${enabledNotificationSql()}`,
      [req.user.id],
    );
    return res.json({
      success: true,
      data: { unreadCount: Number(unreadResult.rows[0]?.count || 0) },
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    return internalError(res, "Lỗi khi lấy số thông báo chưa đọc");
  }
});

router.get("/preferences", protectRoute, async (req, res) => {
  try {
    const result = await query(
      `SELECT courses, assignments, calendar, announcements, grades, system
       FROM notification_preferences WHERE user_id = $1`,
      [req.user.id],
    );
    return res.json({ success: true, data: result.rows[0] || DEFAULT_PREFERENCES });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return internalError(res, "Lỗi khi lấy cài đặt thông báo");
  }
});

router.patch("/preferences", protectRoute, async (req, res) => {
  try {
    const provided = Object.fromEntries(
      PREFERENCE_KEYS
        .filter((key) => typeof req.body?.[key] === "boolean")
        .map((key) => [key, req.body[key]]),
    );
    if (Object.keys(provided).length === 0) {
      return validationError(res, "Không có tùy chọn thông báo hợp lệ");
    }
    const currentResult = await query(
      `SELECT courses, assignments, calendar, announcements, grades, system
       FROM notification_preferences WHERE user_id = $1`,
      [req.user.id],
    );
    const next = { ...DEFAULT_PREFERENCES, ...(currentResult.rows[0] || {}), ...provided };
    const result = await query(
      `INSERT INTO notification_preferences
        (user_id, courses, assignments, calendar, announcements, grades, system, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         courses = EXCLUDED.courses,
         assignments = EXCLUDED.assignments,
         calendar = EXCLUDED.calendar,
         announcements = EXCLUDED.announcements,
         grades = EXCLUDED.grades,
         system = EXCLUDED.system,
         updated_at = NOW()
       RETURNING courses, assignments, calendar, announcements, grades, system`,
      [
        req.user.id,
        next.courses,
        next.assignments,
        next.calendar,
        next.announcements,
        next.grades,
        next.system,
      ],
    );
    return res.json({ success: true, data: result.rows[0] || next });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return internalError(res, "Lỗi khi lưu cài đặt thông báo");
  }
});

// GET / - List user notifications with category & unread filters
router.get("/", protectRoute, async (req, res) => {
  try {
    const pagination = parsePagination(req);
    if (!pagination) return validationError(res, "page/limit không hợp lệ");

    const unreadOnly = parseBoolean(req.query.unreadOnly);
    const category = typeof req.query.category === "string" ? req.query.category.trim() : null;
    const type = typeof req.query.type === "string" && req.query.type.trim() ? req.query.type.trim().slice(0, 50) : null;

    const values = [req.user.id];
    const filters = ["notifications.user_id = $1", enabledNotificationSql()];
    if (unreadOnly) filters.push("is_read = false");

    if (category && category !== "all") {
      if (category === "session") {
        filters.push("(event_type LIKE 'session.%' OR type = 'live_class')");
      } else if (category === "assignment") {
        filters.push("(event_type LIKE 'assignment.%' OR event_type LIKE 'quiz.%' OR type = 'assignment')");
      } else if (category === "grade") {
        filters.push("(event_type = 'grade.published' OR event_type = 'attendance.updated' OR type = 'grade')");
      } else if (category === "system") {
        filters.push("(event_type = 'system' OR type = 'system')");
      }
    } else if (type) {
      values.push(type);
      filters.push(`(type = $${values.length} OR event_type = $${values.length})`);
    }

    values.push(pagination.limit, pagination.offset);
    const result = await query(
      `SELECT id, title, message, type, event_type, is_read, link_url, data, actor_id, read_at, created_at,
              COUNT(*) OVER()::int AS total_count
       FROM notifications
       LEFT JOIN notification_preferences np ON np.user_id = notifications.user_id
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    const unreadResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       LEFT JOIN notification_preferences np ON np.user_id = notifications.user_id
       WHERE notifications.user_id = $1 AND notifications.is_read = false
         AND ${enabledNotificationSql()}`,
      [req.user.id],
    );
    const total = Number(result.rows[0]?.total_count || 0);

    return res.json({
      success: true,
      data: {
        notifications: result.rows.map(({ total_count: _totalCount, ...notification }) => notification),
        unreadCount: Number(unreadResult.rows[0]?.count || 0),
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return internalError(res, "Lỗi khi lấy thông báo");
  }
});

// PATCH /:id/read - Mark one notification as read
router.patch("/:id/read", protectRoute, async (req, res) => {
  try {
    const notificationId = parsePositiveId(req.params.id);
    if (!notificationId) return validationError(res, "notification id không hợp lệ");
    const result = await query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read, read_at`,
      [notificationId, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo", errorCode: "NOT_FOUND" });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error marking notification read:", error);
    return internalError(res, "Lỗi khi cập nhật thông báo");
  }
});

router.patch("/:id/unread", protectRoute, async (req, res) => {
  try {
    const notificationId = parsePositiveId(req.params.id);
    if (!notificationId) return validationError(res, "notification id không hợp lệ");
    const result = await query(
      `UPDATE notifications
       SET is_read = false, read_at = NULL
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read, read_at`,
      [notificationId, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo", errorCode: "NOT_FOUND" });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error marking notification unread:", error);
    return internalError(res, "Lỗi khi cập nhật thông báo");
  }
});

router.delete("/:id", protectRoute, async (req, res) => {
  try {
    const notificationId = parsePositiveId(req.params.id);
    if (!notificationId) return validationError(res, "notification id không hợp lệ");
    const result = await query(
      "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
      [notificationId, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo", errorCode: "NOT_FOUND" });
    }
    return res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return internalError(res, "Lỗi khi xóa thông báo");
  }
});

// POST /read-all - Mark all notifications read for current user
router.post("/read-all", protectRoute, async (req, res) => {
  try {
    const result = await query(
      "UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false",
      [req.user.id],
    );
    return res.json({ success: true, data: { updatedCount: result.rowCount } });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return internalError(res, "Lỗi khi cập nhật thông báo");
  }
});

export default router;
