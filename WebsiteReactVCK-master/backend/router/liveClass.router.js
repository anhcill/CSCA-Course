import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import {
  getMeetingProvider,
  notifyClassStudents,
  notifyUpcomingSessions,
  validateMeetingUrl,
} from "../services/liveClass.service.js";

const router = express.Router();

const validationError = (res, message) => res.status(422).json({
  success: false,
  message,
  errorCode: "VALIDATION_ERROR",
});

const notFound = (res, message) => res.status(404).json({
  success: false,
  message,
  errorCode: "NOT_FOUND",
});

const forbidden = (res, message) => res.status(403).json({
  success: false,
  message,
  errorCode: "FORBIDDEN",
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

const parseDateTime = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
};

const parseTime = (value) => (
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
    ? value
    : null
);

const safeClass = (row) => {
  const { meet_url: _meetUrl, passcode: _passcode, ...data } = row;
  return data;
};

const safeSession = (row) => {
  const { meet_url: meetingUrl, passcode: _passcode, ...data } = row;
  return {
    ...data,
    provider: getMeetingProvider(meetingUrl),
  };
};

const getClassById = async (classId) => {
  const result = await query(
    `SELECT lc.id, lc.title, lc.course_id, lc.instructor_id, lc.description,
            lc.max_students, lc.status, lc.created_at, lc.updated_at,
            COALESCE(c.title, c.name) AS course_title,
            COALESCE(c.is_published, true) AS course_is_published
     FROM live_classes lc
     LEFT JOIN courses c ON c.id = lc.course_id
     WHERE lc.id = $1`,
    [classId],
  );
  return result.rows[0] || null;
};

const canViewClass = async (liveClass, user) => {
  if (!liveClass) return false;
  if (user.role === "admin" || String(liveClass.instructor_id) === String(user.id)) return true;
  if (user.role !== "user" || liveClass.status !== "active") return false;

  const result = await query(
    `SELECT 1
     FROM class_enrollments
     WHERE live_class_id = $1 AND user_id = $2 AND status = 'active'`,
    [liveClass.id, user.id],
  );
  return result.rows.length > 0;
};

const canManageClass = (liveClass, user) => (
  Boolean(liveClass)
  && (user.role === "admin" || String(liveClass.instructor_id) === String(user.id))
);

const classListVisibility = (user) => {
  if (user.role === "admin") return { clause: "TRUE", params: [] };
  if (user.role === "creator") return { clause: "lc.instructor_id = $1", params: [user.id] };
  return {
    clause: `EXISTS (
      SELECT 1 FROM class_enrollments ce
      WHERE ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
    )`,
    params: [user.id],
  };
};

const sessionVisibility = (user) => {
  if (user.role === "admin") return { clause: "TRUE", params: [] };
  if (user.role === "creator") return { clause: "lc.instructor_id = $1", params: [user.id] };
  return {
    clause: `EXISTS (
      SELECT 1 FROM class_enrollments ce
      WHERE ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
    )`,
    params: [user.id],
  };
};

const validateSessionInput = (body, { partial = false } = {}) => {
  const errors = [];
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 255) {
      errors.push("title không hợp lệ");
    }
  }

  let startTime;
  let endTime;
  if (!partial || body.startTime !== undefined) {
    startTime = parseDateTime(body.startTime);
    if (!startTime) errors.push("startTime phải là thời gian ISO hợp lệ");
  }
  if (!partial || body.endTime !== undefined) {
    endTime = parseDateTime(body.endTime);
    if (!endTime) errors.push("endTime phải là thời gian ISO hợp lệ");
  }
  if (startTime && endTime && endTime <= startTime) errors.push("endTime phải sau startTime");

  const meetingUrlError = validateMeetingUrl(body.meetUrl);
  if (meetingUrlError) errors.push(meetingUrlError);
  if (body.passcode !== undefined && body.passcode !== null && (typeof body.passcode !== "string" || body.passcode.length > 50)) {
    errors.push("passcode không hợp lệ");
  }
  if (body.status !== undefined && !["scheduled", "live", "ended", "cancelled"].includes(body.status)) {
    errors.push("status không hợp lệ");
  }

  return { errors, startTime, endTime };
};

// GET /api/live-classes — only classes visible to the current role.
router.get("/", protectRoute, async (req, res) => {
  try {
    const visibility = classListVisibility(req.user);
    const result = await query(
      `SELECT lc.id, lc.title, lc.course_id, lc.instructor_id, lc.description,
              lc.max_students, lc.status, lc.created_at, lc.updated_at,
              COALESCE(c.title, c.name) AS course_title,
              COUNT(ce.id) FILTER (WHERE ce.status = 'active')::int AS enrolled_count
       FROM live_classes lc
       LEFT JOIN courses c ON c.id = lc.course_id
       LEFT JOIN class_enrollments ce ON ce.live_class_id = lc.id
       WHERE lc.status = 'active'
         AND (lc.course_id IS NULL OR COALESCE(c.is_published, false) = true)
         AND ${visibility.clause}
       GROUP BY lc.id, c.title, c.name
       ORDER BY lc.created_at DESC`,
      visibility.params,
    );

    return res.json({ success: true, data: result.rows.map(safeClass) });
  } catch (error) {
    console.error("Error fetching live classes:", error);
    return internalError(res, "Lỗi khi lấy danh sách lớp học trực tuyến");
  }
});

// POST /api/live-classes — create a class container owned by the teacher/admin.
router.post("/", protectRoute, requireTeacher, requirePermission("lms.class.manage"), async (req, res) => {
  try {
    const { title, courseId, description, maxStudents } = req.body;
    const parsedCourseId = courseId === undefined || courseId === null || courseId === ""
      ? null
      : parsePositiveId(courseId);
    if (courseId !== undefined && courseId !== null && courseId !== "" && !parsedCourseId) {
      return validationError(res, "courseId không hợp lệ");
    }
    if (typeof title !== "string" || !title.trim() || title.trim().length > 255) {
      return validationError(res, "title không hợp lệ");
    }

    const parsedMaxStudents = maxStudents === undefined ? 30 : Number(maxStudents);
    if (!Number.isInteger(parsedMaxStudents) || parsedMaxStudents < 1 || parsedMaxStudents > 1000) {
      return validationError(res, "maxStudents phải là số nguyên từ 1 đến 1000");
    }
    if (description !== undefined && (typeof description !== "string" || description.length > 5000)) {
      return validationError(res, "description không hợp lệ");
    }

    if (parsedCourseId) {
      const courseResult = await query(
        "SELECT author_id FROM courses WHERE id = $1",
        [parsedCourseId],
      );
      if (courseResult.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");
      if (req.user.role !== "admin" && String(courseResult.rows[0].author_id) !== String(req.user.id)) {
        return forbidden(res, "Bạn không có quyền mở lớp cho khóa học này");
      }
    }

    const result = await query(
      `INSERT INTO live_classes (title, course_id, instructor_id, description, max_students)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, course_id, instructor_id, description, max_students, status, created_at, updated_at`,
      [title.trim(), parsedCourseId, req.user.id, description?.trim() || "", parsedMaxStudents],
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Tạo lớp học trực tuyến thành công",
    });
  } catch (error) {
    console.error("Error creating live class:", error);
    return internalError(res, "Lỗi khi tạo lớp học trực tuyến");
  }
});

// PATCH /api/live-classes/:classId — owner/admin may close or rename a class.
router.patch("/:classId", protectRoute, requireTeacher, requirePermission("lms.class.manage"), async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền sửa lớp này");

    const body = req.body || {};
    const title = body.title === undefined ? liveClass.title : body.title;
    const description = body.description === undefined ? liveClass.description : body.description;
    const maxStudents = body.maxStudents === undefined ? liveClass.max_students : Number(body.maxStudents);
    const status = body.status === undefined ? liveClass.status : body.status;
    if (typeof title !== "string" || !title.trim() || title.trim().length > 255) return validationError(res, "title không hợp lệ");
    if (typeof description !== "string" || description.length > 5000) return validationError(res, "description không hợp lệ");
    if (!Number.isInteger(maxStudents) || maxStudents < 1 || maxStudents > 1000) return validationError(res, "maxStudents không hợp lệ");
    if (!["active", "completed", "cancelled"].includes(status)) return validationError(res, "status không hợp lệ");

    const result = await query(
      `UPDATE live_classes
       SET title = $1, description = $2, max_students = $3, status = $4
       WHERE id = $5
       RETURNING id, title, course_id, instructor_id, description, max_students, status, created_at, updated_at`,
      [title.trim(), description, maxStudents, status, classId],
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error updating live class:", error);
    return internalError(res, "Lỗi khi cập nhật lớp học trực tuyến");
  }
});

// GET /api/live-classes/my-schedule — no meeting URL or passcode is returned here.
router.get("/my-schedule", protectRoute, async (req, res) => {
  try {
    const courseId = req.query.courseId === undefined ? null : parsePositiveId(req.query.courseId);
    if (req.query.courseId !== undefined && !courseId) return validationError(res, "courseId không hợp lệ");
    const visibility = sessionVisibility(req.user);
    const params = [...visibility.params];
    const courseScope = courseId ? `AND lc.course_id = $${params.length + 1}` : "";
    if (courseId) params.push(courseId);
    const result = await query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
              lc.title AS class_title, lc.course_id, lc.instructor_id, lc.max_students,
              COALESCE(c.title, c.name) AS course_title,
              COUNT(ce2.id) FILTER (WHERE ce2.status = 'active')::int AS enrolled_count,
              CASE WHEN LOWER(cs.meet_url) LIKE '%zoom.us%' THEN 'Zoom'
                   WHEN cs.meet_url IS NOT NULL THEN 'Google Meet'
                   ELSE NULL END AS provider
       FROM class_sessions cs
       JOIN live_classes lc ON cs.live_class_id = lc.id
       LEFT JOIN courses c ON c.id = lc.course_id
       LEFT JOIN class_enrollments ce2 ON ce2.live_class_id = lc.id
       WHERE lc.status = 'active'
         AND cs.status <> 'cancelled'
         AND (lc.course_id IS NULL OR COALESCE(c.is_published, false) = true)
         AND ${visibility.clause}
         ${courseScope}
       GROUP BY cs.id, lc.id, c.title, c.name
       ORDER BY cs.start_time ASC`,
      params,
    );

    const now = Date.now();
    const upcoming = result.rows.filter((session) => {
      const start = new Date(session.start_time).getTime();
      return start >= now && start <= now + 24 * 60 * 60 * 1000;
    });
    if (upcoming.length > 0) await notifyUpcomingSessions(upcoming);

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching my live schedule:", error);
    return internalError(res, "Lỗi khi lấy lịch học trực tuyến");
  }
});

// POST /api/live-classes/:classId/join — a student may join only a published course class.
router.post("/:classId/join", protectRoute, requireRole("user"), async (req, res) => {
  const classId = parsePositiveId(req.params.classId);
  if (!classId) return validationError(res, "classId không hợp lệ");

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const classResult = await client.query(
      `SELECT id, course_id, max_students, status
       FROM live_classes WHERE id = $1 FOR UPDATE`,
      [classId],
    );
    const liveClass = classResult.rows[0];
    if (!liveClass || liveClass.status !== "active") {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy lớp học trực tuyến đang hoạt động");
    }
    if (!liveClass.course_id) {
      await client.query("ROLLBACK");
      return forbidden(res, "Lớp này chỉ nhận học viên do giáo viên hoặc admin thêm vào");
    }

    const courseResult = await client.query(
      "SELECT is_published FROM courses WHERE id = $1",
      [liveClass.course_id],
    );
    if (!courseResult.rows[0]?.is_published) {
      await client.query("ROLLBACK");
      return forbidden(res, "Khóa học chưa được mở");
    }

    const existing = await client.query(
      `SELECT id, status FROM class_enrollments
       WHERE live_class_id = $1 AND user_id = $2
       FOR UPDATE`,
      [classId, req.user.id],
    );
    if (existing.rows[0]?.status === "active") {
      await client.query("COMMIT");
      return res.json({ success: true, data: { classId, isEnrolled: true } });
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM class_enrollments
       WHERE live_class_id = $1 AND status = 'active'`,
      [classId],
    );
    if (countResult.rows[0].count >= liveClass.max_students) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Lớp học đã đủ số lượng", errorCode: "CAPACITY_REACHED" });
    }

    if (existing.rows[0]) {
      await client.query(
        "UPDATE class_enrollments SET status = 'active', enrolled_at = NOW() WHERE id = $1",
        [existing.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO class_enrollments (user_id, live_class_id, status)
         VALUES ($1, $2, 'active')`,
        [req.user.id, classId],
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: { classId, isEnrolled: true } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error joining live class:", error);
    return internalError(res, "Lỗi khi tham gia lớp học trực tuyến");
  } finally {
    client.release();
  }
});

// GET /api/live-classes/:classId/enrollments — teacher/admin roster.
router.get("/:classId/enrollments", protectRoute, requireTeacher, async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền xem danh sách lớp này");

    const result = await query(
      `SELECT u.id, u.username, u.email, u.avatar_url,
              ce.status AS enrollment_status, ce.enrolled_at,
              COUNT(DISTINCT cs.id) FILTER (WHERE cs.status <> 'cancelled')::int AS total_sessions,
              COUNT(DISTINCT ca.session_id) FILTER (WHERE ca.status = 'present')::int AS present_sessions
       FROM class_enrollments ce
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN class_sessions cs ON cs.live_class_id = ce.live_class_id
       LEFT JOIN class_attendance ca ON ca.user_id = ce.user_id AND ca.session_id = cs.id
       WHERE ce.live_class_id = $1 AND ce.status = 'active'
       GROUP BY u.id, ce.status, ce.enrolled_at
       ORDER BY LOWER(COALESCE(u.username, u.email)) ASC`,
      [classId],
    );

    return res.json({ success: true, data: result.rows.map((row) => ({
      ...row,
      attendance_rate: Number(row.total_sessions) > 0
        ? Math.round((Number(row.present_sessions) / Number(row.total_sessions)) * 100)
        : 0,
    })) });
  } catch (error) {
    console.error("Error fetching live class roster:", error);
    return internalError(res, "Lỗi khi lấy danh sách học viên");
  }
});

// POST /api/live-classes/:classId/enrollments — teacher/admin can add a student.
router.post("/:classId/enrollments", protectRoute, requireTeacher, requirePermission("lms.class.manage"), async (req, res) => {
  const classId = parsePositiveId(req.params.classId);
  const userId = parsePositiveId(req.body?.userId);
  if (!classId || !userId) return validationError(res, "classId hoặc userId không hợp lệ");

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const classResult = await client.query(
      "SELECT id, instructor_id, max_students, status FROM live_classes WHERE id = $1 FOR UPDATE",
      [classId],
    );
    const liveClass = classResult.rows[0];
    if (!liveClass) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy lớp học trực tuyến");
    }
    if (!canManageClass(liveClass, req.user)) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn không có quyền quản lý lớp này");
    }
    if (liveClass.status !== "active") {
      await client.query("ROLLBACK");
      return validationError(res, "Không thể thêm học viên vào lớp đã đóng");
    }

    const userResult = await client.query("SELECT id, role FROM users WHERE id = $1", [userId]);
    if (!userResult.rows[0]) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy học viên");
    }
    if (userResult.rows[0].role !== "user") {
      await client.query("ROLLBACK");
      return validationError(res, "Chỉ tài khoản học viên mới được thêm vào lớp");
    }

    const existing = await client.query(
      "SELECT id, status FROM class_enrollments WHERE user_id = $1 AND live_class_id = $2 FOR UPDATE",
      [userId, classId],
    );
    if (existing.rows[0]?.status === "active") {
      await client.query("COMMIT");
      return res.json({ success: true, data: { userId, classId, isEnrolled: true } });
    }

    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM class_enrollments WHERE live_class_id = $1 AND status = 'active'",
      [classId],
    );
    if (countResult.rows[0].count >= liveClass.max_students) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Lớp học đã đủ số lượng", errorCode: "CAPACITY_REACHED" });
    }

    if (existing.rows[0]) {
      await client.query("UPDATE class_enrollments SET status = 'active', enrolled_at = NOW() WHERE id = $1", [existing.rows[0].id]);
    } else {
      await client.query(
        `INSERT INTO class_enrollments (user_id, live_class_id, status)
         VALUES ($1, $2, 'active')`,
        [userId, classId],
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: { userId, classId, isEnrolled: true } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error enrolling student in live class:", error);
    return internalError(res, "Lỗi khi thêm học viên vào lớp");
  } finally {
    client.release();
  }
});

router.delete("/:classId/enrollments/:userId", protectRoute, requireTeacher, requirePermission("lms.class.manage"), async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    const userId = parsePositiveId(req.params.userId);
    if (!classId || !userId) return validationError(res, "classId hoặc userId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền quản lý lớp này");
    await query(
      `UPDATE class_enrollments SET status = 'removed'
       WHERE live_class_id = $1 AND user_id = $2 AND status = 'active'`,
      [classId, userId],
    );
    return res.json({ success: true, data: { classId, userId, isEnrolled: false } });
  } catch (error) {
    console.error("Error removing live class enrollment:", error);
    return internalError(res, "Lỗi khi xóa học viên khỏi lớp");
  }
});

// Weekly recurring schedule CRUD. Times are stored as TIME; session timestamps are UTC TIMESTAMPTZ.
router.get("/:classId/schedules", protectRoute, async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!(await canViewClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền xem lịch lớp này");
    const result = await query(
      `SELECT id, live_class_id, day_of_week, start_time, end_time, created_at
       FROM class_schedules WHERE live_class_id = $1
       ORDER BY day_of_week ASC, start_time ASC, id ASC`,
      [classId],
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching class schedules:", error);
    return internalError(res, "Lỗi khi lấy lịch định kỳ");
  }
});

router.post("/:classId/schedules", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    const dayOfWeek = Number(req.body?.dayOfWeek);
    const startTime = parseTime(req.body?.startTime);
    const endTime = parseTime(req.body?.endTime);
    if (!classId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7 || !startTime || !endTime || endTime <= startTime) {
      return validationError(res, "Lịch định kỳ không hợp lệ");
    }
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền sửa lịch lớp này");
    const result = await query(
      `INSERT INTO class_schedules (live_class_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING id, live_class_id, day_of_week, start_time, end_time, created_at`,
      [classId, dayOfWeek, startTime, endTime],
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error creating class schedule:", error);
    return internalError(res, "Lỗi khi tạo lịch định kỳ");
  }
});

router.patch("/:classId/schedules/:scheduleId", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    const scheduleId = parsePositiveId(req.params.scheduleId);
    const dayOfWeek = Number(req.body?.dayOfWeek);
    const startTime = parseTime(req.body?.startTime);
    const endTime = parseTime(req.body?.endTime);
    if (!classId || !scheduleId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7 || !startTime || !endTime || endTime <= startTime) {
      return validationError(res, "Lịch định kỳ không hợp lệ");
    }
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền sửa lịch lớp này");
    const result = await query(
      `UPDATE class_schedules
       SET day_of_week = $1, start_time = $2, end_time = $3
       WHERE id = $4 AND live_class_id = $5
       RETURNING id, live_class_id, day_of_week, start_time, end_time, created_at`,
      [dayOfWeek, startTime, endTime, scheduleId, classId],
    );
    if (!result.rows[0]) return notFound(res, "Không tìm thấy lịch định kỳ");
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error updating class schedule:", error);
    return internalError(res, "Lỗi khi cập nhật lịch định kỳ");
  }
});

router.delete("/:classId/schedules/:scheduleId", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    const scheduleId = parsePositiveId(req.params.scheduleId);
    if (!classId || !scheduleId) return validationError(res, "classId hoặc scheduleId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền xóa lịch lớp này");
    const result = await query("DELETE FROM class_schedules WHERE id = $1 AND live_class_id = $2 RETURNING id", [scheduleId, classId]);
    if (!result.rows[0]) return notFound(res, "Không tìm thấy lịch định kỳ");
    return res.json({ success: true, data: { id: scheduleId } });
  } catch (error) {
    console.error("Error deleting class schedule:", error);
    return internalError(res, "Lỗi khi xóa lịch định kỳ");
  }
});

// Specific session CRUD.
router.get("/:classId/sessions", protectRoute, async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!(await canViewClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền xem session của lớp này");
    const result = await query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
              cs.meet_url, cs.created_at, cs.updated_at
       FROM class_sessions cs
       WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'
       ORDER BY cs.start_time ASC`,
      [classId],
    );
    return res.json({ success: true, data: result.rows.map(safeSession) });
  } catch (error) {
    console.error("Error fetching class sessions:", error);
    return internalError(res, "Lỗi khi lấy các buổi học");
  }
});

router.post("/:classId/sessions", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!canManageClass(liveClass, req.user)) return forbidden(res, "Bạn không có quyền tạo session cho lớp này");

    const { errors, startTime, endTime } = validateSessionInput(req.body || {});
    if (errors.length > 0) return validationError(res, errors.join("; "));
    const result = await query(
      `INSERT INTO class_sessions (live_class_id, title, meet_url, passcode, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, live_class_id, title, start_time, end_time, status, meet_url, created_at, updated_at`,
      [classId, req.body.title.trim(), req.body.meetUrl || null, req.body.passcode || null, startTime, endTime, req.body.status || "scheduled"],
    );
    const session = result.rows[0];
    if (new Date(session.start_time).getTime() <= Date.now() + 24 * 60 * 60 * 1000) {
      await notifyClassStudents(session, "upcoming");
    }
    return res.status(201).json({ success: true, data: safeSession(session), message: "Tạo buổi học thành công" });
  } catch (error) {
    console.error("Error creating class session:", error);
    return internalError(res, "Lỗi khi tạo buổi học");
  }
});

router.patch("/sessions/:sessionId", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    const currentResult = await query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.meet_url, cs.passcode,
              cs.start_time, cs.end_time, cs.status, cs.created_at, cs.updated_at,
              lc.instructor_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1`,
      [sessionId],
    );
    const current = currentResult.rows[0];
    if (!current) return notFound(res, "Không tìm thấy buổi học");
    if (!canManageClass(current, req.user)) return forbidden(res, "Bạn không có quyền sửa buổi học này");

    const body = req.body || {};
    const merged = {
      title: body.title === undefined ? current.title : body.title,
      startTime: body.startTime === undefined ? new Date(current.start_time).toISOString() : body.startTime,
      endTime: body.endTime === undefined ? new Date(current.end_time).toISOString() : body.endTime,
      meetUrl: body.meetUrl === undefined ? current.meet_url : body.meetUrl,
      passcode: body.passcode === undefined ? current.passcode : body.passcode,
      status: body.status === undefined ? current.status : body.status,
    };
    const { errors, startTime, endTime } = validateSessionInput(merged);
    if (errors.length > 0) return validationError(res, errors.join("; "));

    const result = await query(
      `UPDATE class_sessions
       SET title = $1, meet_url = $2, passcode = $3, start_time = $4, end_time = $5, status = $6
       WHERE id = $7
       RETURNING id, live_class_id, title, start_time, end_time, status, meet_url, created_at, updated_at`,
      [merged.title.trim(), merged.meetUrl || null, merged.passcode || null, startTime, endTime, merged.status, sessionId],
    );
    const session = result.rows[0];
    if (current.meet_url !== session.meet_url) await notifyClassStudents(session, "link-changed");
    return res.json({ success: true, data: safeSession(session), message: "Cập nhật buổi học thành công" });
  } catch (error) {
    console.error("Error updating class session:", error);
    return internalError(res, "Lỗi khi cập nhật buổi học");
  }
});

// GET /api/live-classes/sessions/:sessionId/access — verified access only.
router.get("/sessions/:sessionId/access", protectRoute, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    const result = await query(
      `SELECT cs.id, cs.live_class_id, cs.meet_url, cs.status, cs.start_time, cs.end_time,
              lc.status AS class_status, lc.instructor_id,
              COALESCE(c.is_published, true) AS course_is_published,
              EXISTS (
                SELECT 1 FROM class_enrollments ce
                WHERE ce.live_class_id = cs.live_class_id
                  AND ce.user_id = $2 AND ce.status = 'active'
              ) AS is_enrolled
       FROM class_sessions cs
       JOIN live_classes lc ON cs.live_class_id = lc.id
       LEFT JOIN courses c ON c.id = lc.course_id
       WHERE cs.id = $1`,
      [sessionId, req.user.id],
    );
    const session = result.rows[0];
    if (!session || session.class_status !== "active" || session.status === "cancelled") {
      return notFound(res, "Không tìm thấy buổi học");
    }

    const isOwner = req.user.role === "admin"
      || (req.user.role === "creator" && String(session.instructor_id) === String(req.user.id));
    const canAccess = isOwner || (req.user.role === "user" && session.is_enrolled && session.course_is_published);
    if (!canAccess) return forbidden(res, "Bạn không có quyền vào buổi học này");
    if (!session.meet_url) return notFound(res, "Buổi học chưa có link tham gia");

    const now = Date.now();
    if (!isOwner && session.status === "ended") {
      return res.status(410).json({ success: false, message: "Buổi học đã kết thúc", errorCode: "SESSION_ENDED" });
    }
    if (!isOwner && now > new Date(session.end_time).getTime()) {
      return res.status(410).json({ success: false, message: "Buổi học đã kết thúc", errorCode: "SESSION_ENDED" });
    }
    if (!isOwner && session.status === "scheduled" && now < new Date(session.start_time).getTime() - 15 * 60 * 1000) {
      return res.status(403).json({ success: false, message: "Phòng học chỉ mở trước giờ bắt đầu 15 phút", errorCode: "MEETING_NOT_OPEN" });
    }

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        meetUrl: session.meet_url,
        provider: getMeetingProvider(session.meet_url),
        status: session.status,
        startTime: session.start_time,
        endTime: session.end_time,
      },
    });
  } catch (error) {
    console.error("Error getting session access:", error);
    return internalError(res, "Lỗi khi lấy link vào lớp học trực tuyến");
  }
});

export default router;
