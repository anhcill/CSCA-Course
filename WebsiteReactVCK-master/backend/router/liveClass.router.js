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
import { enqueueManagementCalendarDelivery } from "../services/managementCalendarDelivery.service.js";

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

const parseTime = (value) => {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    return null;
  }
  // PostgreSQL returns TIME as HH:mm:ss while the UI submits HH:mm. Store and
  // compare one canonical representation so an unchanged schedule is not
  // accidentally regenerated.
  return value.length === 5 ? `${value}:00` : value;
};

const DEFAULT_CALENDAR_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_SCHEDULE_HORIZON_DAYS = 180;

const parseDateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};

const dateOnlyInTimezoneAfterDays = (timezone, days) => {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    dateParts.filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, part.value]),
  );
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isValidTimezone = (value) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const normalizeScheduleDay = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  // The legacy client used 0 for Sunday. Keep it compatible while storing
  // the database convention: ISO day-of-week, Monday = 1 through Sunday = 7.
  if (parsed === 0) return 7;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : null;
};

const parseScheduleSeriesInput = (body = {}) => {
  const dayOfWeek = normalizeScheduleDay(body.dayOfWeek);
  const startTime = parseTime(body.startTime);
  const endTime = parseTime(body.endTime);
  const timezone = typeof body.timezone === "string" && body.timezone.trim()
    ? body.timezone.trim()
    : DEFAULT_CALENDAR_TIMEZONE;
  const timezoneIsValid = isValidTimezone(timezone);
  const dateDefaultTimezone = timezoneIsValid ? timezone : DEFAULT_CALENDAR_TIMEZONE;
  const startDateWasProvided = body.startDate !== undefined && body.startDate !== null && body.startDate !== "";
  const endDateWasProvided = body.endDate !== undefined && body.endDate !== null && body.endDate !== "";
  const parsedStartDate = parseDateOnly(body.startDate);
  const parsedEndDate = parseDateOnly(body.endDate);
  const startDate = parsedStartDate || dateOnlyInTimezoneAfterDays(dateDefaultTimezone, 0);
  const endDate = parsedEndDate || dateOnlyInTimezoneAfterDays(dateDefaultTimezone, DEFAULT_SCHEDULE_HORIZON_DAYS);
  const title = body.title === undefined || body.title === null || body.title === ""
    ? null
    : typeof body.title === "string" && body.title.trim().length <= 255
      ? body.title.trim()
      : undefined;

  const errors = [];
  if (!dayOfWeek) errors.push("dayOfWeek không hợp lệ");
  if (!startTime || !endTime || endTime <= startTime) errors.push("Khung giờ lịch định kỳ không hợp lệ");
  if ((startDateWasProvided && !parsedStartDate)
    || (endDateWasProvided && !parsedEndDate)
    || endDate < startDate) errors.push("Khoảng ngày lịch định kỳ không hợp lệ");
  if (!timezoneIsValid) errors.push("timezone không hợp lệ");
  if (title === undefined) errors.push("title không hợp lệ");

  return { errors, dayOfWeek, startTime, endTime, startDate, endDate, timezone, title };
};

const materializeScheduleSessions = async (client, schedule, liveClass) => {
  const result = await client.query(
    `WITH occurrences AS (
       SELECT occurrence::date AS session_date
       FROM generate_series(
         GREATEST($3::date, (CURRENT_TIMESTAMP AT TIME ZONE $8)::date),
         $4::date,
         INTERVAL '1 day'
       ) AS occurrence
       WHERE EXTRACT(ISODOW FROM occurrence)::int = $5
     )
     INSERT INTO class_sessions (
       live_class_id, schedule_id, title, start_time, end_time, status,
       original_start_at, original_end_at
     )
     SELECT
       $1,
       $2,
       COALESCE(NULLIF($9, ''), $10 || ' — Buổi học'),
       ((o.session_date + $6::time) AT TIME ZONE $8),
       ((o.session_date + $7::time) AT TIME ZONE $8),
       'scheduled',
       ((o.session_date + $6::time) AT TIME ZONE $8),
       ((o.session_date + $7::time) AT TIME ZONE $8)
     FROM occurrences o
     WHERE NOT EXISTS (
       SELECT 1
       FROM class_sessions existing
       WHERE existing.live_class_id = $1
         AND existing.status <> 'cancelled'
         AND existing.start_time = ((o.session_date + $6::time) AT TIME ZONE $8)
     )
     RETURNING id, live_class_id, schedule_id, title, start_time, end_time,
               status, original_start_at, original_end_at, created_at, updated_at`,
    [
      liveClass.id,
      schedule.id,
      schedule.start_date,
      schedule.end_date,
      schedule.day_of_week,
      schedule.start_time,
      schedule.end_time,
      schedule.timezone,
      schedule.title,
      liveClass.title,
    ],
  );
  return result.rows;
};

// InternalManagement owns identity, finance and the class roster. The LMS owns
// the teaching calendar, so it emits a durable projection event in the same
// transaction as every recurring-calendar mutation. An unmapped LMS-only
// class intentionally has no external event to send.
const enqueueManagementCalendarEvents = async (client, {
  liveClass,
  schedule,
  scheduleEventType,
  createdOrUpdatedSessions = [],
  cancelledSessions = [],
}) => {
  if (!liveClass.management_class_source_id) return [];
  const correlationId = `calendar:${liveClass.id}:${schedule.id}:v${schedule.version || 1}`;
  const events = [];
  events.push(await enqueueManagementCalendarDelivery(client, {
    managementClassId: liveClass.management_class_source_id,
    eventType: scheduleEventType,
    lmsSchedule: schedule,
    correlationId,
  }));
  for (const session of createdOrUpdatedSessions) {
    events.push(await enqueueManagementCalendarDelivery(client, {
      managementClassId: liveClass.management_class_source_id,
      eventType: "lms.session.upserted",
      lmsSession: session,
      correlationId,
    }));
  }
  for (const session of cancelledSessions) {
    events.push(await enqueueManagementCalendarDelivery(client, {
      managementClassId: liveClass.management_class_source_id,
      eventType: "lms.session.cancelled",
      lmsSession: session,
      correlationId,
    }));
  }
  return events.filter(Boolean);
};

const safeClass = (row) => {
  const { meet_url: _meetUrl, passcode: _passcode, ...data } = row;
  return data;
};

const safeSession = (row) => {
  const { meet_url: meetingUrl, passcode: _passcode, ...data } = row;
  return {
    ...data,
    // A generated recurring session belongs to the fixed timetable. A NULL
    // schedule_id marks a teacher/admin supplemental lesson.
    session_type: row.schedule_id ? "recurring" : "supplemental",
    // Do not expose a join URL in calendar/list APIs. The client must use the
    // verified access endpoint immediately before opening the provider page.
    has_meeting_link: Boolean(meetingUrl),
    provider: getMeetingProvider(meetingUrl),
  };
};

const getClassById = async (classId) => {
  const result = await query(
    `SELECT lc.id, lc.title, lc.course_id, lc.instructor_id, lc.description,
            lc.max_students, lc.status, lc.created_at, lc.updated_at,
            lc.management_class_source_id,
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
  if (user.role === "admin") return true;
  if (user.role === "creator") return canManageClass(liveClass, user);
  if (user.role !== "user" || liveClass.status !== "active") return false;

  const result = await query(
    `SELECT 1
     FROM class_enrollments ce
     LEFT JOIN courses c ON c.id = $3
     WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
       AND (
         COALESCE(c.is_management_managed, FALSE) = FALSE
         OR EXISTS (
           SELECT 1 FROM lms_access_grants g
           WHERE g.user_id = $2 AND g.course_id = c.id AND g.access_status = 'active'
             AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
         )
       )`,
    [liveClass.id, user.id, liveClass.course_id],
  );
  return result.rows.length > 0;
};

const canManageClass = async (liveClass, user) => {
  if (!liveClass || user.role === "user") return false;
  if (user.role === "admin" || String(liveClass.instructor_id) === String(user.id)) return true;
  const classId = liveClass.live_class_id || liveClass.id;
  const result = await query(
    `SELECT 1 FROM class_teachers
     WHERE live_class_id = $1 AND teacher_id = $2 AND status = 'active'`,
    [classId, user.id],
  );
  return result.rows.length > 0;
};

const requireCourseBoundClass = (res, liveClass) => {
  if (liveClass?.course_id) return null;
  return validationError(res, "Lịch học phải thuộc một lớp đã gắn với khóa học cố định");
};

const classListVisibility = (user) => {
  if (user.role === "admin") return { clause: "TRUE", params: [] };
  if (user.role === "creator") {
    return {
      clause: `(lc.instructor_id = $1 OR EXISTS (
        SELECT 1 FROM class_teachers ct
        WHERE ct.live_class_id = lc.id AND ct.teacher_id = $1 AND ct.status = 'active'
      ))`,
      params: [user.id],
    };
  }
  return {
    clause: `EXISTS (
      SELECT 1 FROM class_enrollments ce
      LEFT JOIN courses course_access ON course_access.id = lc.course_id
      WHERE ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
        AND (
          COALESCE(course_access.is_management_managed, FALSE) = FALSE
          OR EXISTS (
            SELECT 1 FROM lms_access_grants g
            WHERE g.user_id = $1 AND g.course_id = course_access.id AND g.access_status = 'active'
              AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
          )
        )
    )`,
    params: [user.id],
  };
};

const sessionVisibility = (user) => {
  if (user.role === "admin") return { clause: "TRUE", params: [] };
  if (user.role === "creator") {
    return {
      clause: `(lc.instructor_id = $1 OR EXISTS (
        SELECT 1 FROM class_teachers ct
        WHERE ct.live_class_id = lc.id AND ct.teacher_id = $1 AND ct.status = 'active'
      ))`,
      params: [user.id],
    };
  }
  return {
    clause: `EXISTS (
      SELECT 1 FROM class_enrollments ce
      LEFT JOIN courses course_access ON course_access.id = lc.course_id
      WHERE ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
        AND (
          COALESCE(course_access.is_management_managed, FALSE) = FALSE
          OR EXISTS (
            SELECT 1 FROM lms_access_grants g
            WHERE g.user_id = $1 AND g.course_id = course_access.id AND g.access_status = 'active'
              AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
          )
        )
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
  if (body.status !== undefined && !["scheduled", "live", "ended", "cancelled", "rescheduled"].includes(body.status)) {
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
    if (!(await canManageClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền sửa lớp này");

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
    const classId = req.query.classId === undefined ? null : parsePositiveId(req.query.classId);
    if (req.query.classId !== undefined && !classId) return validationError(res, "classId không hợp lệ");
    if (classId && !courseId) return validationError(res, "classId cần đi kèm courseId");
    const from = req.query.from === undefined ? null : parseDateTime(req.query.from);
    const to = req.query.to === undefined ? null : parseDateTime(req.query.to);
    if ((req.query.from !== undefined && !from) || (req.query.to !== undefined && !to)) {
      return validationError(res, "from/to phải là thời gian ISO hợp lệ");
    }
    if (from && to && (to <= from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000)) {
      return validationError(res, "Khoảng lịch phải lớn hơn 0 và không quá 366 ngày");
    }
    const visibility = sessionVisibility(req.user);
    const params = [...visibility.params];
    const courseScope = courseId ? `AND lc.course_id = $${params.length + 1}` : "";
    if (courseId) params.push(courseId);
    const classScope = classId ? `AND lc.id = $${params.length + 1}` : "";
    if (classId) params.push(classId);
    const fromScope = from ? `AND cs.start_time >= $${params.length + 1}` : "";
    if (from) params.push(from);
    const toScope = to ? `AND cs.start_time < $${params.length + 1}` : "";
    if (to) params.push(to);
    const result = await query(
      `SELECT cs.id, cs.live_class_id, cs.schedule_id, cs.title, cs.start_time, cs.end_time, cs.status,
              cs.original_start_at, cs.original_end_at, cs.change_reason, cs.changed_at,
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
         ${classScope}
         ${fromScope}
         ${toScope}
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

    res.set("Cache-Control", "no-store, private, max-age=0");
    return res.json({
      success: true,
      data: result.rows.map((session) => ({
        ...session,
        session_type: session.schedule_id ? "recurring" : "supplemental",
      })),
    });
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
    if (!(await canManageClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền xem danh sách lớp này");

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
    if (!(await canManageClass(liveClass, req.user))) {
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
    if (!(await canManageClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền quản lý lớp này");
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
      `SELECT id, live_class_id, title, day_of_week, start_time, end_time,
              timezone, start_date, end_date, status, version, created_at, updated_at
       FROM class_schedules WHERE live_class_id = $1 AND status = 'active'
       ORDER BY day_of_week ASC, start_time ASC, id ASC`,
      [classId],
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching class schedules:", error);
    return internalError(res, "Lỗi khi lấy lịch định kỳ");
  }
});

// A fixed recurring schedule defines the course timetable. Only administrators
// can create, edit or archive it; teachers can add one-off supplemental lessons.
router.post("/:classId/schedules", protectRoute, requireRole("admin"), requirePermission("lms.schedule.manage"), async (req, res) => {
  let client;
  try {
    const classId = parsePositiveId(req.params.classId);
    const scheduleInput = parseScheduleSeriesInput(req.body);
    if (!classId) return validationError(res, "classId không hợp lệ");
    if (scheduleInput.errors.length > 0) return validationError(res, scheduleInput.errors.join("; "));
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    const courseBindingError = requireCourseBoundClass(res, liveClass);
    if (courseBindingError) return courseBindingError;

    client = await getClient();
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO class_schedules (
         live_class_id, title, day_of_week, start_time, end_time,
         timezone, start_date, end_date, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id, live_class_id, title, day_of_week, start_time, end_time,
                 timezone, start_date, end_date, status, version, created_at, updated_at`,
      [
        classId,
        scheduleInput.title || `${liveClass.title} — Lịch học định kỳ`,
        scheduleInput.dayOfWeek,
        scheduleInput.startTime,
        scheduleInput.endTime,
        scheduleInput.timezone,
        scheduleInput.startDate,
        scheduleInput.endDate,
        req.user.id,
      ],
    );
    const schedule = result.rows[0];
    const materializedSessions = await materializeScheduleSessions(client, schedule, liveClass);
    await enqueueManagementCalendarEvents(client, {
      liveClass,
      schedule,
      scheduleEventType: "lms.schedule.upserted",
      createdOrUpdatedSessions: materializedSessions,
    });
    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      data: {
        ...schedule,
        materializedSessions: materializedSessions.map(safeSession),
      },
      message: `Đã tạo lịch cố định và ${materializedSessions.length} buổi học`,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error creating class schedule:", error);
    return internalError(res, "Lỗi khi tạo lịch định kỳ");
  } finally {
    client?.release();
  }
});

router.patch("/:classId/schedules/:scheduleId", protectRoute, requireRole("admin"), requirePermission("lms.schedule.manage"), async (req, res) => {
  let client;
  try {
    const classId = parsePositiveId(req.params.classId);
    const scheduleId = parsePositiveId(req.params.scheduleId);
    if (!classId || !scheduleId) return validationError(res, "classId hoặc scheduleId không hợp lệ");

    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    const courseBindingError = requireCourseBoundClass(res, liveClass);
    if (courseBindingError) return courseBindingError;

    const body = req.body || {};
    const expectedVersion = body.version === undefined ? null : Number(body.version);
    if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
      return validationError(res, "version không hợp lệ");
    }
    if (body.changeReason !== undefined && body.changeReason !== null
      && (typeof body.changeReason !== "string" || body.changeReason.trim().length > 2000)) {
      return validationError(res, "changeReason không hợp lệ");
    }

    client = await getClient();
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT id, live_class_id, title, day_of_week, start_time, end_time,
              timezone, start_date, end_date, status, version
       FROM class_schedules
       WHERE id = $1 AND live_class_id = $2 AND status = 'active'
       FOR UPDATE`,
      [scheduleId, classId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy lịch định kỳ");
    }
    if (expectedVersion !== null && expectedVersion !== current.version) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Lịch đã được người khác cập nhật. Vui lòng tải lại trước khi lưu.",
        errorCode: "SCHEDULE_VERSION_CONFLICT",
      });
    }

    const scheduleInput = parseScheduleSeriesInput({
      dayOfWeek: body.dayOfWeek === undefined ? current.day_of_week : body.dayOfWeek,
      startTime: body.startTime === undefined ? current.start_time : body.startTime,
      endTime: body.endTime === undefined ? current.end_time : body.endTime,
      timezone: body.timezone === undefined ? current.timezone : body.timezone,
      startDate: body.startDate === undefined ? current.start_date : body.startDate,
      endDate: body.endDate === undefined ? current.end_date : body.endDate,
      title: body.title === undefined ? current.title : body.title,
    });
    if (scheduleInput.errors.length > 0) {
      await client.query("ROLLBACK");
      return validationError(res, scheduleInput.errors.join("; "));
    }

    const nextTitle = scheduleInput.title || `${liveClass.title} — Lịch học định kỳ`;
    const patternChanged = Number(current.day_of_week) !== scheduleInput.dayOfWeek
      || current.start_time !== scheduleInput.startTime
      || current.end_time !== scheduleInput.endTime
      || current.timezone !== scheduleInput.timezone
      || String(current.start_date).slice(0, 10) !== scheduleInput.startDate
      || String(current.end_date).slice(0, 10) !== scheduleInput.endDate;
    const titleChanged = current.title !== nextTitle;
    const updateResult = await client.query(
      `UPDATE class_schedules
       SET title = $1, day_of_week = $2, start_time = $3, end_time = $4,
           timezone = $5, start_date = $6, end_date = $7, updated_by = $8,
           version = version + 1
       WHERE id = $9
       RETURNING id, live_class_id, title, day_of_week, start_time, end_time,
                 timezone, start_date, end_date, status, version, created_at, updated_at`,
      [
        nextTitle, scheduleInput.dayOfWeek, scheduleInput.startTime, scheduleInput.endTime,
        scheduleInput.timezone, scheduleInput.startDate, scheduleInput.endDate, req.user.id, scheduleId,
      ],
    );
    const schedule = updateResult.rows[0];
    const changeReason = body.changeReason?.trim() || "Điều chỉnh lịch học định kỳ";
    let cancelledSessions = [];
    let materializedSessions = [];
    let updatedTitleSessions = [];
    if (patternChanged) {
      const cancelledResult = await client.query(
        `UPDATE class_sessions cs
         SET status = 'cancelled', change_reason = $1, changed_by = $2,
             changed_at = NOW(), version = version + 1
         WHERE cs.schedule_id = $3
           AND cs.start_time >= NOW()
           AND cs.status = 'scheduled'
           AND NOT EXISTS (
             SELECT 1 FROM class_attendance ca WHERE ca.session_id = cs.id
           )
         RETURNING cs.id, cs.live_class_id, cs.schedule_id, cs.title, cs.start_time, cs.end_time,
                   cs.status, cs.meet_url, cs.change_reason, cs.version`,
        [changeReason, req.user.id, scheduleId],
      );
      cancelledSessions = cancelledResult.rows;
      materializedSessions = await materializeScheduleSessions(client, schedule, liveClass);
    } else if (titleChanged) {
      const titleUpdateResult = await client.query(
        `UPDATE class_sessions
         SET title = $1, version = version + 1
         WHERE schedule_id = $2 AND start_time >= NOW() AND status = 'scheduled'
         RETURNING id, live_class_id, schedule_id, title, start_time, end_time, status,
                   meet_url, change_reason, version`,
        [nextTitle, scheduleId],
      );
      updatedTitleSessions = titleUpdateResult.rows;
    }

    if (patternChanged || titleChanged) {
      await client.query(
        `INSERT INTO class_session_change_logs (
           schedule_id, scope, before_state, after_state, reason, actor_id
         )
         VALUES ($1, 'all_future', $2::jsonb, $3::jsonb, $4, $5)`,
        [
          scheduleId,
          JSON.stringify({
            title: current.title, dayOfWeek: current.day_of_week, startTime: current.start_time,
            endTime: current.end_time, timezone: current.timezone,
            startDate: current.start_date, endDate: current.end_date,
          }),
          JSON.stringify({
            title: schedule.title, dayOfWeek: schedule.day_of_week, startTime: schedule.start_time,
            endTime: schedule.end_time, timezone: schedule.timezone,
            startDate: schedule.start_date, endDate: schedule.end_date,
          }),
          changeReason,
          req.user.id,
        ],
      );
    }
    await enqueueManagementCalendarEvents(client, {
      liveClass,
      schedule,
      scheduleEventType: "lms.schedule.upserted",
      createdOrUpdatedSessions: [...materializedSessions, ...updatedTitleSessions],
      cancelledSessions,
    });
    await client.query("COMMIT");
    return res.json({
      success: true,
      data: {
        ...schedule,
        cancelledSessionCount: cancelledSessions.length,
        materializedSessionCount: materializedSessions.length,
      },
      message: patternChanged
        ? `Đã cập nhật lịch và tạo ${materializedSessions.length} buổi học thay thế`
        : "Đã cập nhật lịch định kỳ",
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating class schedule:", error);
    return internalError(res, "Lỗi khi cập nhật lịch định kỳ");
  } finally {
    client?.release();
  }
});

router.delete("/:classId/schedules/:scheduleId", protectRoute, requireRole("admin"), requirePermission("lms.schedule.manage"), async (req, res) => {
  let client;
  try {
    const classId = parsePositiveId(req.params.classId);
    const scheduleId = parsePositiveId(req.params.scheduleId);
    if (!classId || !scheduleId) return validationError(res, "classId hoặc scheduleId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    const courseBindingError = requireCourseBoundClass(res, liveClass);
    if (courseBindingError) return courseBindingError;
    const reason = req.body?.changeReason === undefined ? "Ngừng lịch học định kỳ" : req.body.changeReason;
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 2000) {
      return validationError(res, "changeReason không hợp lệ");
    }

    client = await getClient();
    await client.query("BEGIN");
    const archiveResult = await client.query(
      `UPDATE class_schedules
       SET status = 'archived', updated_by = $1, version = version + 1
       WHERE id = $2 AND live_class_id = $3 AND status = 'active'
       RETURNING id, live_class_id, title, day_of_week, start_time, end_time,
                 timezone, start_date, end_date, status, version`,
      [req.user.id, scheduleId, classId],
    );
    if (!archiveResult.rows[0]) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy lịch định kỳ");
    }
    const cancelledResult = await client.query(
      `UPDATE class_sessions cs
       SET status = 'cancelled', change_reason = $1, changed_by = $2,
           changed_at = NOW(), version = version + 1
       WHERE cs.schedule_id = $3 AND cs.start_time >= NOW() AND cs.status = 'scheduled'
       RETURNING cs.id, cs.live_class_id, cs.schedule_id, cs.title, cs.start_time, cs.end_time,
                 cs.status, cs.meet_url, cs.change_reason, cs.version`,
      [reason.trim(), req.user.id, scheduleId],
    );
    await client.query(
      `INSERT INTO class_session_change_logs (
         schedule_id, scope, before_state, after_state, reason, actor_id
       )
       VALUES ($1, 'all_future', $2::jsonb, $3::jsonb, $4, $5)`,
      [scheduleId, JSON.stringify({ status: "active" }), JSON.stringify({ status: "archived" }), reason.trim(), req.user.id],
    );
    await enqueueManagementCalendarEvents(client, {
      liveClass,
      schedule: archiveResult.rows[0],
      scheduleEventType: "lms.schedule.archived",
      cancelledSessions: cancelledResult.rows,
    });
    await client.query("COMMIT");
    return res.json({ success: true, data: { id: scheduleId, cancelledSessionCount: cancelledResult.rows.length } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error deleting class schedule:", error);
    return internalError(res, "Lỗi khi xóa lịch định kỳ");
  } finally {
    client?.release();
  }
});

// Specific session CRUD. Sessions created here have no schedule_id and are
// explicit supplemental lessons for an already course-bound class.
router.get("/:classId/sessions", protectRoute, async (req, res) => {
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!(await canViewClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền xem session của lớp này");
    const result = await query(
      `SELECT cs.id, cs.live_class_id, cs.schedule_id, cs.title, cs.start_time, cs.end_time, cs.status,
              cs.original_start_at, cs.original_end_at, cs.change_reason, cs.changed_at,
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
  let client;
  try {
    const classId = parsePositiveId(req.params.classId);
    if (!classId) return validationError(res, "classId không hợp lệ");
    const liveClass = await getClassById(classId);
    if (!liveClass) return notFound(res, "Không tìm thấy lớp học trực tuyến");
    if (!(await canManageClass(liveClass, req.user))) return forbidden(res, "Bạn không có quyền tạo session cho lớp này");
    const courseBindingError = requireCourseBoundClass(res, liveClass);
    if (courseBindingError) return courseBindingError;

    const { errors, startTime, endTime } = validateSessionInput(req.body || {});
    if (errors.length > 0) return validationError(res, errors.join("; "));
    client = await getClient();
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO class_sessions (
         live_class_id, title, meet_url, passcode, start_time, end_time, status,
         original_start_at, original_end_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $5, $6)
       RETURNING id, live_class_id, schedule_id, title, start_time, end_time, status,
                 original_start_at, original_end_at, change_reason, changed_at,
                 meet_url, version, created_at, updated_at`,
      [classId, req.body.title.trim(), req.body.meetUrl || null, req.body.passcode || null, startTime, endTime, req.body.status || "scheduled"],
    );
    const session = result.rows[0];
    await enqueueManagementCalendarDelivery(client, {
      managementClassId: liveClass.management_class_source_id,
      eventType: "lms.session.upserted",
      lmsSession: session,
      correlationId: `session:${session.id}:v${session.version || 1}`,
    });
    await client.query("COMMIT");
    if (new Date(session.start_time).getTime() <= Date.now() + 24 * 60 * 60 * 1000) {
      await notifyClassStudents(session, "upcoming");
    }
    return res.status(201).json({ success: true, data: safeSession(session), message: "Đã bổ sung buổi học cho khóa học" });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error creating class session:", error);
    return internalError(res, "Lỗi khi tạo buổi học");
  } finally {
    client?.release();
  }
});

// PATCH /api/live-classes/sessions/:sessionId/meeting-link
// A teaching link is operational session metadata, not a change to the fixed
// timetable. Teachers may set it for their own classes; only admins can still
// change a recurring schedule's date/time/pattern in the generic PATCH below.
router.patch("/sessions/:sessionId/meeting-link", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  let client;
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");

    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, "meetUrl")) {
      return validationError(res, "meetUrl là bắt buộc");
    }
    const meetingUrl = typeof body.meetUrl === "string" ? body.meetUrl.trim() : body.meetUrl;
    const meetingUrlError = validateMeetingUrl(meetingUrl);
    if (meetingUrlError) return validationError(res, meetingUrlError);
    if (body.passcode !== undefined && body.passcode !== null
      && (typeof body.passcode !== "string" || body.passcode.length > 50)) {
      return validationError(res, "passcode không hợp lệ");
    }

    client = await getClient();
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT cs.id, cs.live_class_id, cs.schedule_id, cs.title, cs.meet_url, cs.passcode,
              cs.start_time, cs.end_time, cs.status, cs.change_reason, cs.version,
              lc.instructor_id, lc.management_class_source_id, lc.course_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1
       FOR UPDATE OF cs`,
      [sessionId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy buổi học");
    }
    if (current.status === "cancelled") {
      await client.query("ROLLBACK");
      return validationError(res, "Không thể cấu hình phòng cho buổi học đã hủy");
    }
    if (!(await canManageClass(current, req.user))) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn không có quyền cấu hình phòng học này");
    }
    const courseBindingError = requireCourseBoundClass(res, current);
    if (courseBindingError) {
      await client.query("ROLLBACK");
      return courseBindingError;
    }

    const nextPasscode = body.passcode === undefined
      ? current.passcode
      : typeof body.passcode === "string" ? body.passcode.trim() || null : null;
    const result = await client.query(
      `UPDATE class_sessions
       SET meet_url = $1, passcode = $2, changed_by = $3, changed_at = NOW(), version = version + 1
       WHERE id = $4
       RETURNING id, live_class_id, schedule_id, title, start_time, end_time, status,
                 original_start_at, original_end_at, change_reason, changed_at,
                 meet_url, version, created_at, updated_at`,
      [meetingUrl || null, nextPasscode, req.user.id, sessionId],
    );
    const session = result.rows[0];
    await client.query(
      `INSERT INTO class_session_change_logs (
         session_id, schedule_id, scope, before_state, after_state, reason, actor_id
       )
       VALUES ($1, $2, 'single', $3::jsonb, $4::jsonb, $5, $6)`,
      [
        session.id,
        current.schedule_id,
        JSON.stringify({
          hasMeetingLink: Boolean(current.meet_url),
          provider: getMeetingProvider(current.meet_url),
        }),
        JSON.stringify({
          hasMeetingLink: Boolean(session.meet_url),
          provider: getMeetingProvider(session.meet_url),
        }),
        "Cập nhật link phòng học trực tuyến",
        req.user.id,
      ],
    );
    await enqueueManagementCalendarDelivery(client, {
      managementClassId: current.management_class_source_id,
      eventType: "lms.session.upserted",
      lmsSession: session,
      correlationId: `session:${session.id}:v${session.version || 1}`,
    });
    await client.query("COMMIT");

    if (current.meet_url !== session.meet_url || current.passcode !== nextPasscode) {
      await notifyClassStudents(session, "link-changed");
    }
    return res.json({ success: true, data: safeSession(session), message: "Đã cập nhật link phòng học" });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating session meeting link:", error);
    return internalError(res, "Lỗi khi cập nhật link phòng học");
  } finally {
    client?.release();
  }
});

router.patch("/sessions/:sessionId", protectRoute, requireTeacher, requirePermission("lms.schedule.manage"), async (req, res) => {
  let client;
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    client = await getClient();
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT cs.id, cs.live_class_id, cs.schedule_id, cs.title, cs.meet_url, cs.passcode,
              cs.start_time, cs.end_time, cs.status, cs.original_start_at, cs.original_end_at,
              cs.change_reason, cs.changed_by, cs.changed_at, cs.version, cs.created_at, cs.updated_at,
              lc.instructor_id, lc.management_class_source_id, lc.course_id
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       WHERE cs.id = $1`,
      [sessionId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy buổi học");
    }
    if (!(await canManageClass(current, req.user))) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn không có quyền sửa buổi học này");
    }
    const courseBindingError = requireCourseBoundClass(res, current);
    if (courseBindingError) {
      await client.query("ROLLBACK");
      return courseBindingError;
    }
    if (current.schedule_id && req.user.role !== "admin") {
      await client.query("ROLLBACK");
      return forbidden(res, "Lịch cố định chỉ do quản trị viên chỉnh sửa. Giáo viên chỉ được bổ sung buổi học riêng.");
    }

    const body = req.body || {};
    const merged = {
      title: body.title === undefined ? current.title : body.title,
      startTime: body.startTime === undefined ? new Date(current.start_time).toISOString() : body.startTime,
      endTime: body.endTime === undefined ? new Date(current.end_time).toISOString() : body.endTime,
      meetUrl: body.meetUrl === undefined ? current.meet_url : body.meetUrl,
      passcode: body.passcode === undefined ? current.passcode : body.passcode,
      status: body.status === undefined ? current.status : body.status,
    };
    const changeReason = body.changeReason === undefined ? current.change_reason : body.changeReason;
    if (changeReason !== null && changeReason !== undefined
      && (typeof changeReason !== "string" || changeReason.trim().length > 2000)) {
      await client.query("ROLLBACK");
      return validationError(res, "changeReason không hợp lệ");
    }
    const { errors, startTime, endTime } = validateSessionInput(merged);
    if (errors.length > 0) {
      await client.query("ROLLBACK");
      return validationError(res, errors.join("; "));
    }

    const scheduleChanged = startTime.getTime() !== new Date(current.start_time).getTime()
      || endTime.getTime() !== new Date(current.end_time).getTime();
    const nextStatus = body.status === undefined && scheduleChanged && current.status === "scheduled"
      ? "rescheduled"
      : merged.status;

    const result = await client.query(
      `UPDATE class_sessions
       SET title = $1, meet_url = $2, passcode = $3, start_time = $4, end_time = $5,
           status = $6, change_reason = $7, changed_by = $8,
           changed_at = CASE WHEN $9 THEN NOW() ELSE changed_at END,
           version = version + 1
       WHERE id = $10
       RETURNING id, live_class_id, schedule_id, title, start_time, end_time, status,
                 original_start_at, original_end_at, change_reason, changed_at,
                 meet_url, version, created_at, updated_at`,
      [
        merged.title.trim(), merged.meetUrl || null, merged.passcode || null,
        startTime, endTime, nextStatus, changeReason?.trim() || null, req.user.id,
        scheduleChanged, sessionId,
      ],
    );
    const session = result.rows[0];
    if (scheduleChanged) {
      await client.query(
        `INSERT INTO class_session_change_logs (
           session_id, schedule_id, scope, before_state, after_state, reason, actor_id
         )
         VALUES ($1, $2, 'single', $3::jsonb, $4::jsonb, $5, $6)`,
        [
          session.id,
          current.schedule_id,
          JSON.stringify({ startTime: current.start_time, endTime: current.end_time, status: current.status }),
          JSON.stringify({ startTime: session.start_time, endTime: session.end_time, status: session.status }),
          changeReason?.trim() || null,
          req.user.id,
        ],
      );
    }
    await enqueueManagementCalendarDelivery(client, {
      managementClassId: current.management_class_source_id,
      eventType: nextStatus === "cancelled" ? "lms.session.cancelled" : "lms.session.upserted",
      lmsSession: session,
      correlationId: `session:${session.id}:v${session.version || 1}`,
    });
    await client.query("COMMIT");
    if (current.meet_url !== session.meet_url) await notifyClassStudents(session, "link-changed");
    if (scheduleChanged) await notifyClassStudents(session, "rescheduled");
    return res.json({ success: true, data: safeSession(session), message: "Cập nhật buổi học thành công" });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating class session:", error);
    return internalError(res, "Lỗi khi cập nhật buổi học");
  } finally {
    client?.release();
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
              COALESCE(c.is_management_managed, false) AS course_is_management_managed,
              EXISTS (
                SELECT 1 FROM class_enrollments ce
                WHERE ce.live_class_id = cs.live_class_id
                  AND ce.user_id = $2 AND ce.status = 'active'
              ) AS is_enrolled,
              EXISTS (
                SELECT 1 FROM lms_access_grants g
                WHERE g.user_id = $2 AND g.course_id = lc.course_id AND g.access_status = 'active'
                  AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
              ) AS has_management_entitlement,
              EXISTS (
                SELECT 1 FROM class_teachers ct
                WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
              ) AS is_class_teacher
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
      || (req.user.role === "creator" && (String(session.instructor_id) === String(req.user.id) || session.is_class_teacher));
    const canAccess = isOwner || (req.user.role === "user" && session.is_enrolled && session.course_is_published
      && (!session.course_is_management_managed || session.has_management_entitlement));
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

// GET /api/live-classes/sessions/:sessionId/history — Get session change history
router.get("/sessions/:sessionId/history", protectRoute, async (req, res) => {
  try {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return validationError(res, "sessionId không hợp lệ");
    const sessionRes = await query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.status, cs.start_time, cs.end_time
       FROM class_sessions cs WHERE cs.id = $1`,
      [sessionId],
    );
    if (sessionRes.rows.length === 0) return notFound(res, "Không tìm thấy buổi học");
    const session = sessionRes.rows[0];

    const logsRes = await query(
      `SELECT cl.id, cl.session_id, cl.schedule_id, cl.scope,
              cl.before_state, cl.after_state, cl.reason, cl.created_at,
              u.id AS actor_id, u.full_name AS actor_name, u.role AS actor_role
       FROM class_session_change_logs cl
       LEFT JOIN users u ON u.id = cl.actor_id
       WHERE cl.session_id = $1 OR (cl.schedule_id IS NOT NULL AND cl.schedule_id = (SELECT schedule_id FROM class_sessions WHERE id = $1))
       ORDER BY cl.created_at DESC`,
      [sessionId],
    );

    return res.json({
      success: true,
      data: {
        session,
        history: logsRes.rows,
      },
    });
  } catch (error) {
    console.error("Error getting session history:", error);
    return internalError(res, "Lỗi khi lấy lịch sử thay đổi của buổi học");
  }
});

export default router;
