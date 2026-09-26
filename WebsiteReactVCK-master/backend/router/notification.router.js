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

// GET /unread-count - Fast endpoint for badge poll
router.get("/unread-count", protectRoute, async (req, res) => {
  try {
    const unreadResult = await query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false",
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

// GET / - List user notifications with category & unread filters
router.get("/", protectRoute, async (req, res) => {
  try {
    const pagination = parsePagination(req);
    if (!pagination) return validationError(res, "page/limit không hợp lệ");

    const unreadOnly = parseBoolean(req.query.unreadOnly);
    const category = typeof req.query.category === "string" ? req.query.category.trim() : null;
    const type = typeof req.query.type === "string" && req.query.type.trim() ? req.query.type.trim().slice(0, 50) : null;

    const values = [req.user.id];
    const filters = ["user_id = $1"];
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
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    const unreadResult = await query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false",
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
