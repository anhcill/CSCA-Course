import crypto from "crypto";
import { getClient } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

const EVENT_TYPES = new Set([
  "teacher.upserted",
  "course.upserted",
  "class.upserted",
  "class.teacher.assigned",
  "student.provisioned",
  "class.membership.changed",
  "entitlement.changed",
  "payment.refunded",
]);

const ACCOUNT_STATUSES = new Set(["pending_payment", "active", "suspended", "revoked"]);
const CLASS_STATUSES = new Set(["active", "completed", "cancelled"]);
const MEMBERSHIP_STATUSES = new Set(["active", "suspended", "revoked"]);
const COURSE_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const TEACHING_ROLES = new Set(["lead", "co_teacher", "assistant"]);

export class SyncValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyncValidationError";
  }
}

export class SyncDependencyError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyncDependencyError";
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value, maxLength, field) => {
  if (typeof value !== "string") throw new SyncValidationError(`${field} phải là chuỗi`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new SyncValidationError(`${field} không hợp lệ`);
  return normalized;
};

const optionalText = (value, maxLength, field) => {
  if (value === undefined || value === null || value === "") return null;
  return text(value, maxLength, field);
};

// Descriptions supplied by the management integration are shown to learners.
// Strip operational/test labels instead of persisting them into learner-facing data.
const learnerSafeDescription = (value) => {
  const description = optionalText(value, 5000, "description") || "";
  return /\b(?:internal\s*management|management|lms\s*-?\s*pilot|pilot)\b/i.test(description)
    ? ""
    : description;
};

const email = (value, field = "email") => {
  const normalized = text(value, 255, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new SyncValidationError(`${field} không hợp lệ`);
  return normalized;
};

const date = (value, field) => {
  if (typeof value !== "string") throw new SyncValidationError(`${field} phải là ISO date`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new SyncValidationError(`${field} không hợp lệ`);
  return parsed;
};

const enumValue = (value, values, fallback, field) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = text(value, 40, field).toLowerCase().replace(/[\s-]/g, "_");
  if (!values.has(normalized)) throw new SyncValidationError(`${field} không hợp lệ`);
  return normalized;
};

const sourceDate = (payload, fallback) => date(payload.sourceUpdatedAt || fallback.toISOString(), "sourceUpdatedAt");
const sourceId = (value, field) => text(value, 128, field);
const sameOrNewer = (stored, incoming) => !stored || new Date(stored).getTime() <= incoming.getTime();
const lower = (value) => String(value).toLowerCase();

const hash = (rawBody) => crypto.createHash("sha256").update(rawBody).digest("hex");
const safeSlug = (prefix, value) => {
  const body = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220) || "source";
  const suffix = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
  return `${prefix}-${body}-${suffix}`.slice(0, 300);
};

const createManagedUsername = async (client, prefix, externalId) => {
  const compact = String(externalId).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(-34) || crypto.randomBytes(8).toString("hex");
  const base = `${prefix}-${compact}`.slice(0, 50);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${crypto.randomBytes(3).toString("hex")}`;
    const candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
    const result = await client.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!result.rows[0]) return candidate;
  }
  throw new Error("Không thể tạo username LMS duy nhất");
};

const parseCourseSourceIds = (value) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new SyncValidationError("courseSourceIds không hợp lệ");
  }
  const ids = value.map((item) => sourceId(item, "courseSourceId"));
  if (new Set(ids.map(lower)).size !== ids.length) throw new SyncValidationError("courseSourceIds bị trùng");
  return ids;
};

export const parseManagementEvent = (body) => {
  if (!isPlainObject(body)) throw new SyncValidationError("Event phải là JSON object");
  const eventId = text(body.eventId, 128, "eventId");
  const eventType = text(body.eventType, 100, "eventType").toLowerCase();
  if (!EVENT_TYPES.has(eventType)) throw new SyncValidationError("eventType chưa được LMS hỗ trợ");
  const occurredAt = date(body.occurredAt, "occurredAt");
  const source = text(body.source, 100, "source").toLowerCase();
  if (source !== "internal-management") throw new SyncValidationError("source không hợp lệ");
  if (!isPlainObject(body.payload)) throw new SyncValidationError("payload phải là JSON object");
  return { eventId, eventType, occurredAt, source, payload: body.payload };
};

export const enqueueManagementEvent = async ({ event, rawBody, idempotencyKey, correlationId }) => {
  const payloadHash = hash(rawBody);
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT i.id, i.event_id, i.idempotency_key, i.payload_hash, i.status, j.id AS job_id
       FROM lms_sync_inbox i
       LEFT JOIN lms_sync_jobs j ON j.inbox_id = i.id
       WHERE i.event_id = $1 OR i.idempotency_key = $2
       FOR UPDATE OF i`,
      [event.eventId, idempotencyKey],
    );
    const row = existing.rows[0];
    if (row) {
      if (row.event_id !== event.eventId || row.idempotency_key !== idempotencyKey || row.payload_hash !== payloadHash) {
        await client.query("ROLLBACK");
        return { conflict: true };
      }
      await client.query("COMMIT");
      return { duplicate: true, inboxId: Number(row.id), jobId: row.job_id ? Number(row.job_id) : null, status: row.status };
    }

    const inbox = await client.query(
      `INSERT INTO lms_sync_inbox
         (event_id, event_type, source, occurred_at, payload, payload_hash, idempotency_key, correlation_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING id, status`,
      [event.eventId, event.eventType, event.source, event.occurredAt, JSON.stringify(event.payload), payloadHash, idempotencyKey, correlationId],
    );
    const job = await client.query(
      `INSERT INTO lms_sync_jobs
         (inbox_id, event_type, entity_type, entity_id, status, payload, idempotency_key, correlation_id, next_attempt_at)
       VALUES ($1, $2, 'management_event', $3, 'PENDING', $4::jsonb, $5, $6, NOW())
       RETURNING id, status`,
      [inbox.rows[0].id, event.eventType, event.eventId, JSON.stringify({ eventId: event.eventId }), `management-event:${event.eventId}`, correlationId],
    );
    await client.query("COMMIT");
    return { duplicate: false, inboxId: Number(inbox.rows[0].id), jobId: Number(job.rows[0].id), status: job.rows[0].status };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const findTeacher = async (client, teacherSourceId) => {
  const result = await client.query(
    `SELECT id, role, management_staff_source_id
     FROM users WHERE LOWER(management_staff_source_id) = LOWER($1) FOR UPDATE`,
    [teacherSourceId],
  );
  const teacher = result.rows[0];
  if (!teacher) throw new SyncDependencyError(`Chưa có giáo viên Management ${teacherSourceId}`);
  if (teacher.role !== "creator" && teacher.role !== "admin") throw new SyncDependencyError(`Giáo viên ${teacherSourceId} chưa có role dạy học`);
  return teacher;
};

const findCourse = async (client, courseSourceId) => {
  const result = await client.query(
    `SELECT id, external_course_id, management_source_updated_at
     FROM courses WHERE LOWER(external_course_id) = LOWER($1) FOR UPDATE`,
    [courseSourceId],
  );
  const course = result.rows[0];
  if (!course) throw new SyncDependencyError(`Chưa có mapping khóa Management ${courseSourceId}`);
  return course;
};

const findClass = async (client, classSourceId) => {
  const result = await client.query(
    `SELECT id, instructor_id, management_source_updated_at
     FROM live_classes WHERE LOWER(management_class_source_id) = LOWER($1) FOR UPDATE`,
    [classSourceId],
  );
  const liveClass = result.rows[0];
  if (!liveClass) throw new SyncDependencyError(`Chưa có mapping lớp Management ${classSourceId}`);
  return liveClass;
};

const parseTeacher = (payload, occurredAt) => ({
  teacherSourceId: sourceId(payload.teacherSourceId || payload.externalTeacherId, "teacherSourceId"),
  fullName: text(payload.fullName, 160, "fullName"),
  email: email(payload.email),
  status: enumValue(payload.accountStatus, ACCOUNT_STATUSES, "active", "accountStatus"),
  sourceUpdatedAt: sourceDate(payload, occurredAt),
});

const syncTeacher = async (client, event) => {
  const input = parseTeacher(event.payload, event.occurredAt);
  const bySource = await client.query(
    `SELECT id, role, management_source_updated_at
     FROM users WHERE LOWER(management_staff_source_id) = LOWER($1) FOR UPDATE`,
    [input.teacherSourceId],
  );
  let user = bySource.rows[0];
  if (!user) {
    const byEmail = await client.query(
      `SELECT id, role, management_staff_source_id, management_source_updated_at
       FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE`,
      [input.email],
    );
    user = byEmail.rows[0] || null;
    if (user?.management_staff_source_id && lower(user.management_staff_source_id) !== lower(input.teacherSourceId)) {
      throw new SyncValidationError("Email đã liên kết với giáo viên Management khác");
    }
  }

  if (user && !sameOrNewer(user.management_source_updated_at, input.sourceUpdatedAt)) {
    return { action: "teacher.stale_ignored", entityType: "user", entityId: Number(user.id), data: { teacherSourceId: input.teacherSourceId } };
  }

  const locked = input.status !== "active";
  if (user) {
    const updated = await client.query(
      `UPDATE users
       SET email = $1, management_staff_source_id = $2, management_display_name = $3,
           is_management_managed = TRUE, lms_account_status = $4,
           management_source_updated_at = $5, is_locked = $6,
           role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'creator' END
       WHERE id = $7
       RETURNING id, role, management_staff_source_id, management_display_name, lms_account_status`,
      [input.email, input.teacherSourceId, input.fullName, input.status, input.sourceUpdatedAt, locked, user.id],
    );
    return { action: "teacher.synced", entityType: "user", entityId: Number(user.id), data: updated.rows[0] };
  }

  const username = await createManagedUsername(client, "teacher", input.teacherSourceId);
  const created = await client.query(
    `INSERT INTO users
       (username, email, password_hash, role, email_verified, is_locked,
        management_staff_source_id, management_display_name, is_management_managed,
        lms_account_status, management_source_updated_at, lms_provisioned_at)
     VALUES ($1, $2, NULL, 'creator', FALSE, $3, $4, $5, TRUE, $6, $7, NOW())
     RETURNING id, role, management_staff_source_id, management_display_name, lms_account_status`,
    [username, input.email, locked, input.teacherSourceId, input.fullName, input.status, input.sourceUpdatedAt],
  );
  return { action: "teacher.synced", entityType: "user", entityId: Number(created.rows[0].id), data: created.rows[0] };
};

const parseCourse = (payload, occurredAt) => ({
  courseSourceId: sourceId(payload.courseSourceId, "courseSourceId"),
  title: text(payload.title, 255, "title"),
  description: learnerSafeDescription(payload.description),
  category: optionalText(payload.category, 50, "category") || "CSCA",
  level: enumValue(payload.level, COURSE_LEVELS, "beginner", "level"),
  teacherSourceId: sourceId(payload.teacherSourceId || payload.ownerTeacherSourceId, "teacherSourceId"),
  isPublished: payload.isPublished === true,
  sourceUpdatedAt: sourceDate(payload, occurredAt),
});

const syncCourse = async (client, event) => {
  const input = parseCourse(event.payload, event.occurredAt);
  const teacher = await findTeacher(client, input.teacherSourceId);
  const existing = await client.query(
    `SELECT id, management_source_updated_at
     FROM courses WHERE LOWER(external_course_id) = LOWER($1) FOR UPDATE`,
    [input.courseSourceId],
  );
  const course = existing.rows[0];
  if (course && !sameOrNewer(course.management_source_updated_at, input.sourceUpdatedAt)) {
    return { action: "course.stale_ignored", entityType: "course", entityId: Number(course.id), data: { courseSourceId: input.courseSourceId } };
  }

  if (course) {
    const updated = await client.query(
      `UPDATE courses
       SET name = $1, title = $1, description = $2, category = $3, level = $4,
           author_id = $5, is_published = $6, is_free = FALSE,
           is_management_managed = TRUE, management_source_updated_at = $7
       WHERE id = $8
       RETURNING id, external_course_id, title, is_published`,
      [input.title, input.description, input.category, input.level, teacher.id, input.isPublished, input.sourceUpdatedAt, course.id],
    );
    return { action: "course.synced", entityType: "course", entityId: Number(course.id), data: updated.rows[0] };
  }

  const created = await client.query(
    `INSERT INTO courses
     (name, title, slug, description, category, level, author_id, is_published,
        is_free, external_course_id, is_management_managed, management_source_updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, FALSE, $8, TRUE, $9)
     RETURNING id, external_course_id, title, is_published`,
    [input.title, safeSlug("moly", input.courseSourceId), input.description, input.category,
      input.level, teacher.id, input.isPublished, input.courseSourceId, input.sourceUpdatedAt],
  );
  return { action: "course.synced", entityType: "course", entityId: Number(created.rows[0].id), data: created.rows[0] };
};

const parseClass = (payload, occurredAt) => ({
  classSourceId: sourceId(payload.classSourceId, "classSourceId"),
  courseSourceId: sourceId(payload.courseSourceId, "courseSourceId"),
  title: text(payload.title, 255, "title"),
  description: learnerSafeDescription(payload.description),
  maxStudents: payload.maxStudents === undefined ? 30 : Number(payload.maxStudents),
  status: enumValue(payload.status, CLASS_STATUSES, "active", "status"),
  leadTeacherSourceId: optionalText(payload.leadTeacherSourceId || payload.teacherSourceId, 128, "leadTeacherSourceId"),
  sourceUpdatedAt: sourceDate(payload, occurredAt),
});

const setClassTeacher = async (client, { liveClassId, teacher, teacherSourceId, teachingRole, status, sourceUpdatedAt }) => {
  const result = await client.query(
    `INSERT INTO class_teachers
       (live_class_id, teacher_id, management_teacher_source_id, teaching_role, status, management_source_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (live_class_id, teacher_id) DO UPDATE SET
       management_teacher_source_id = EXCLUDED.management_teacher_source_id,
       teaching_role = EXCLUDED.teaching_role, status = EXCLUDED.status,
       management_source_updated_at = EXCLUDED.management_source_updated_at
     WHERE class_teachers.management_source_updated_at IS NULL
        OR class_teachers.management_source_updated_at <= EXCLUDED.management_source_updated_at
     RETURNING id, live_class_id, teacher_id, teaching_role, status`,
    [liveClassId, teacher.id, teacherSourceId, teachingRole, status, sourceUpdatedAt],
  );
  const mapping = result.rows[0];
  if (!mapping) return null;

  if (status === "active" && teachingRole === "lead") {
    await client.query("UPDATE live_classes SET instructor_id = $1 WHERE id = $2", [teacher.id, liveClassId]);
  } else {
    const current = await client.query("SELECT instructor_id FROM live_classes WHERE id = $1 FOR UPDATE", [liveClassId]);
    if (String(current.rows[0]?.instructor_id || "") === String(teacher.id)) {
      const replacement = await client.query(
        `SELECT teacher_id FROM class_teachers
         WHERE live_class_id = $1 AND status = 'active' AND teaching_role = 'lead'
         ORDER BY id ASC LIMIT 1`,
        [liveClassId],
      );
      await client.query("UPDATE live_classes SET instructor_id = $1 WHERE id = $2", [replacement.rows[0]?.teacher_id || null, liveClassId]);
    }
  }
  return mapping;
};

const syncClass = async (client, event) => {
  const input = parseClass(event.payload, event.occurredAt);
  const course = await findCourse(client, input.courseSourceId);
  if (!Number.isInteger(input.maxStudents) || input.maxStudents < 1 || input.maxStudents > 1000) {
    throw new SyncValidationError("maxStudents phải từ 1 đến 1000");
  }
  const leadTeacher = input.leadTeacherSourceId ? await findTeacher(client, input.leadTeacherSourceId) : null;
  const existing = await client.query(
    `SELECT id, management_source_updated_at
     FROM live_classes WHERE LOWER(management_class_source_id) = LOWER($1) FOR UPDATE`,
    [input.classSourceId],
  );
  const liveClass = existing.rows[0];
  if (liveClass && !sameOrNewer(liveClass.management_source_updated_at, input.sourceUpdatedAt)) {
    return { action: "class.stale_ignored", entityType: "live_class", entityId: Number(liveClass.id), data: { classSourceId: input.classSourceId } };
  }

  let row;
  if (liveClass) {
    const updated = await client.query(
      `UPDATE live_classes
       SET title = $1, course_id = $2, instructor_id = COALESCE($3, instructor_id),
           description = $4, max_students = $5, status = $6,
           management_course_source_id = $7, management_source_updated_at = $8
       WHERE id = $9
       RETURNING id, title, course_id, management_class_source_id, management_course_source_id, status`,
      [input.title, course.id, leadTeacher?.id || null, input.description, input.maxStudents,
        input.status, input.courseSourceId, input.sourceUpdatedAt, liveClass.id],
    );
    row = updated.rows[0];
  } else {
    const created = await client.query(
      `INSERT INTO live_classes
         (title, course_id, instructor_id, description, max_students, status,
          management_class_source_id, management_course_source_id, management_source_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, course_id, management_class_source_id, management_course_source_id, status`,
      [input.title, course.id, leadTeacher?.id || null, input.description, input.maxStudents,
        input.status, input.classSourceId, input.courseSourceId, input.sourceUpdatedAt],
    );
    row = created.rows[0];
  }
  if (leadTeacher) {
    await setClassTeacher(client, {
      liveClassId: row.id, teacher: leadTeacher, teacherSourceId: input.leadTeacherSourceId,
      teachingRole: "lead", status: "active", sourceUpdatedAt: input.sourceUpdatedAt,
    });
  }
  return { action: "class.synced", entityType: "live_class", entityId: Number(row.id), data: row };
};

const syncClassTeacher = async (client, event) => {
  const payload = event.payload;
  const input = {
    classSourceId: sourceId(payload.classSourceId, "classSourceId"),
    teacherSourceId: sourceId(payload.teacherSourceId || payload.externalTeacherId, "teacherSourceId"),
    teachingRole: enumValue(payload.teachingRole, TEACHING_ROLES, "co_teacher", "teachingRole"),
    status: enumValue(payload.status, new Set(["active", "revoked"]), "active", "status"),
    sourceUpdatedAt: sourceDate(payload, event.occurredAt),
  };
  const liveClass = await findClass(client, input.classSourceId);
  const teacher = await findTeacher(client, input.teacherSourceId);
  const row = await setClassTeacher(client, {
    liveClassId: liveClass.id, teacher, teacherSourceId: input.teacherSourceId,
    teachingRole: input.teachingRole, status: input.status, sourceUpdatedAt: input.sourceUpdatedAt,
  });
  return { action: "class.teacher.synced", entityType: "live_class", entityId: Number(liveClass.id), data: row || { staleIgnored: true } };
};

const parseStudent = (payload, occurredAt) => ({
  studentSourceId: sourceId(payload.studentSourceId || payload.externalStudentId, "studentSourceId"),
  fullName: text(payload.fullName, 120, "fullName"),
  email: email(payload.email),
  phone: optionalText(payload.phone, 50, "phone"),
  accountStatus: enumValue(payload.accountStatus, ACCOUNT_STATUSES, "pending_payment", "accountStatus"),
  sourceUpdatedAt: sourceDate(payload, occurredAt),
});

const syncStudent = async (client, event) => {
  const input = parseStudent(event.payload, event.occurredAt);
  const bySource = await client.query(
    `SELECT id, management_source_updated_at
     FROM users WHERE LOWER(external_student_id) = LOWER($1) FOR UPDATE`,
    [input.studentSourceId],
  );
  let user = bySource.rows[0];
  if (!user) {
    const byEmail = await client.query(
      `SELECT id, external_student_id, management_source_updated_at
       FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE`,
      [input.email],
    );
    user = byEmail.rows[0] || null;
    if (user?.external_student_id && lower(user.external_student_id) !== lower(input.studentSourceId)) {
      throw new SyncValidationError("Email đã liên kết với học viên Management khác");
    }
  }
  if (user && !sameOrNewer(user.management_source_updated_at, input.sourceUpdatedAt)) {
    return { action: "student.stale_ignored", entityType: "user", entityId: Number(user.id), data: { studentSourceId: input.studentSourceId } };
  }
  const locked = input.accountStatus !== "active";
  let row;
  if (user) {
    const updated = await client.query(
      `UPDATE users
       SET email = $1, external_student_id = $2, management_phone = $3,
           is_management_managed = TRUE, lms_account_status = $4,
           management_source_updated_at = $5, lms_provisioned_at = COALESCE(lms_provisioned_at, NOW()),
           is_locked = $6
       WHERE id = $7
       RETURNING id, external_student_id, lms_account_status`,
      [input.email, input.studentSourceId, input.phone, input.accountStatus, input.sourceUpdatedAt, locked, user.id],
    );
    row = updated.rows[0];
  } else {
    const username = await createManagedUsername(client, "student", input.studentSourceId);
    const created = await client.query(
      `INSERT INTO users
         (username, email, password_hash, email_verified, is_locked, external_student_id,
          management_phone, is_management_managed, lms_account_status,
          management_source_updated_at, lms_provisioned_at)
       VALUES ($1, $2, NULL, FALSE, $3, $4, $5, TRUE, $6, $7, NOW())
       RETURNING id, external_student_id, lms_account_status`,
      [username, input.email, locked, input.studentSourceId, input.phone, input.accountStatus, input.sourceUpdatedAt],
    );
    row = created.rows[0];
  }
  await client.query(
    `INSERT INTO student_profiles (user_id, full_name)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = NOW()`,
    [row.id, input.fullName],
  );
  return { action: "student.synced", entityType: "user", entityId: Number(row.id), data: row };
};

const parseMembership = (payload, occurredAt) => ({
  membershipSourceId: sourceId(payload.membershipSourceId || payload.classMembershipSourceId, "membershipSourceId"),
  classSourceId: sourceId(payload.classSourceId, "classSourceId"),
  studentSourceId: sourceId(payload.studentSourceId || payload.externalStudentId, "studentSourceId"),
  status: enumValue(payload.status, MEMBERSHIP_STATUSES, "active", "status"),
  sourceUpdatedAt: sourceDate(payload, occurredAt),
});

const syncMembership = async (client, event) => {
  const input = parseMembership(event.payload, event.occurredAt);
  const liveClass = await findClass(client, input.classSourceId);
  const studentResult = await client.query(
    `SELECT id FROM users WHERE LOWER(external_student_id) = LOWER($1) FOR UPDATE`,
    [input.studentSourceId],
  );
  const student = studentResult.rows[0];
  if (!student) throw new SyncDependencyError(`Chưa có học viên Management ${input.studentSourceId}`);
  const existing = await client.query(
    `SELECT id, management_source_updated_at
     FROM class_enrollments
     WHERE LOWER(management_membership_source_id) = LOWER($1)
        OR (live_class_id = $2 AND user_id = $3)
     ORDER BY id ASC LIMIT 1 FOR UPDATE`,
    [input.membershipSourceId, liveClass.id, student.id],
  );
  const membership = existing.rows[0];
  if (membership && !sameOrNewer(membership.management_source_updated_at, input.sourceUpdatedAt)) {
    return { action: "class.membership.stale_ignored", entityType: "class_enrollment", entityId: Number(membership.id), data: { membershipSourceId: input.membershipSourceId } };
  }
  const endedAt = input.status === "active" ? null : input.sourceUpdatedAt;
  let row;
  if (membership) {
    const updated = await client.query(
      `UPDATE class_enrollments
       SET user_id = $1, live_class_id = $2, status = $3,
           management_membership_source_id = $4, management_membership_status = $3,
           management_source_updated_at = $5, ended_at = $6
       WHERE id = $7
       RETURNING id, user_id, live_class_id, status, management_membership_source_id`,
      [student.id, liveClass.id, input.status, input.membershipSourceId, input.sourceUpdatedAt, endedAt, membership.id],
    );
    row = updated.rows[0];
  } else {
    const created = await client.query(
      `INSERT INTO class_enrollments
         (user_id, live_class_id, status, management_membership_source_id,
          management_membership_status, management_source_updated_at, ended_at)
       VALUES ($1, $2, $3, $4, $3, $5, $6)
       RETURNING id, user_id, live_class_id, status, management_membership_source_id`,
      [student.id, liveClass.id, input.status, input.membershipSourceId, input.sourceUpdatedAt, endedAt],
    );
    row = created.rows[0];
  }
  return { action: "class.membership.synced", entityType: "class_enrollment", entityId: Number(row.id), data: row };
};

const parseEntitlement = (payload, occurredAt, forceRevoked = false) => {
  const accessStatus = forceRevoked ? "revoked" : enumValue(payload.accessStatus, MEMBERSHIP_STATUSES, null, "accessStatus");
  if (!accessStatus) throw new SyncValidationError("accessStatus không hợp lệ");
  const validFrom = date(payload.validFrom || occurredAt.toISOString(), "validFrom");
  const validUntil = payload.validUntil === undefined || payload.validUntil === null ? null : date(payload.validUntil, "validUntil");
  if (validUntil && validUntil <= validFrom) throw new SyncValidationError("validUntil phải sau validFrom");
  return {
    studentSourceId: sourceId(payload.studentSourceId || payload.externalStudentId, "studentSourceId"),
    courseSourceIds: parseCourseSourceIds(payload.courseSourceIds),
    accessStatus,
    reason: optionalText(payload.reason, 500, "reason") || (forceRevoked ? "payment_refunded" : "management_entitlement"),
    sourcePaymentId: optionalText(payload.sourcePaymentId || payload.paymentSourceId, 128, "sourcePaymentId"),
    validFrom,
    validUntil,
    sourceUpdatedAt: sourceDate(payload, occurredAt),
  };
};

const effectiveEnrollmentStatus = (accessStatus, validUntil) => {
  if (accessStatus === "active" && (!validUntil || validUntil.getTime() > Date.now())) return "active";
  if (accessStatus === "suspended") return "suspended";
  return "revoked";
};

const deriveAccountStatus = async (client, userId, fallback) => {
  const result = await client.query(
    "SELECT access_status, valid_until FROM lms_access_grants WHERE user_id = $1",
    [userId],
  );
  if (result.rows.some((grant) => effectiveEnrollmentStatus(grant.access_status, grant.valid_until ? new Date(grant.valid_until) : null) === "active")) return "active";
  if (result.rows.some((grant) => grant.access_status === "suspended")) return "suspended";
  return result.rows.length > 0 ? "revoked" : fallback || "pending_payment";
};

const syncEntitlement = async (client, event, forceRevoked = false) => {
  const input = parseEntitlement(event.payload, event.occurredAt, forceRevoked);
  const userResult = await client.query(
    `SELECT id, lms_account_status, is_management_managed
     FROM users WHERE LOWER(external_student_id) = LOWER($1) FOR UPDATE`,
    [input.studentSourceId],
  );
  const user = userResult.rows[0];
  if (!user) throw new SyncDependencyError(`Học viên ${input.studentSourceId} chưa được provision`);

  const courseResult = await client.query(
    `SELECT id, external_course_id
     FROM courses WHERE LOWER(external_course_id) = ANY($1::text[]) FOR UPDATE`,
    [input.courseSourceIds.map(lower)],
  );
  const bySourceId = new Map(courseResult.rows.map((course) => [lower(course.external_course_id), course]));
  const missing = input.courseSourceIds.filter((id) => !bySourceId.has(lower(id)));
  if (missing.length > 0) throw new SyncDependencyError(`Thiếu mapping khóa: ${missing.join(", ")}`);

  const grants = [];
  for (const courseSourceId of input.courseSourceIds) {
    const course = bySourceId.get(lower(courseSourceId));
    const existing = await client.query(
      `SELECT id, source_updated_at FROM lms_access_grants
       WHERE user_id = $1 AND course_id = $2 FOR UPDATE`,
      [user.id, course.id],
    );
    const grant = existing.rows[0];
    if (grant && !sameOrNewer(grant.source_updated_at, input.sourceUpdatedAt)) {
      grants.push({ courseSourceId, lmsCourseId: Number(course.id), staleIgnored: true });
      continue;
    }
    const revokedAt = ["revoked", "suspended"].includes(input.accessStatus)
      ? input.sourceUpdatedAt
      : null;

    const saved = await client.query(
      `INSERT INTO lms_access_grants
         (user_id, course_id, access_status, source_payment_id, reason, valid_from,
          valid_until, source_updated_at, revoked_at, correlation_id)
       VALUES ($1::bigint, $2::bigint, $3::varchar, $4::varchar, $5::varchar,
               $6::timestamptz, $7::timestamptz, $8::timestamptz,
               $9::timestamptz, $10::varchar)
       ON CONFLICT (user_id, course_id) DO UPDATE SET
         access_status = EXCLUDED.access_status, source_payment_id = EXCLUDED.source_payment_id,
         reason = EXCLUDED.reason, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
         source_updated_at = EXCLUDED.source_updated_at, revoked_at = EXCLUDED.revoked_at,
         correlation_id = EXCLUDED.correlation_id
       RETURNING id, access_status, valid_until`,
      [user.id, course.id, input.accessStatus, input.sourcePaymentId, input.reason,
        input.validFrom, input.validUntil, input.sourceUpdatedAt, revokedAt, event.correlationId],
    );
    const enrollmentStatus = effectiveEnrollmentStatus(saved.rows[0].access_status, saved.rows[0].valid_until ? new Date(saved.rows[0].valid_until) : null);
    await client.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, course_id) DO UPDATE SET status = EXCLUDED.status`,
      [user.id, course.id, enrollmentStatus],
    );
    grants.push({ courseSourceId, lmsCourseId: Number(course.id), accessStatus: saved.rows[0].access_status, enrollmentStatus });
  }
  const accountStatus = await deriveAccountStatus(client, user.id, user.lms_account_status);
  await client.query(
    `UPDATE users
     SET lms_account_status = $1,
         is_locked = CASE WHEN is_management_managed THEN $2 ELSE is_locked END
     WHERE id = $3`,
    [accountStatus, accountStatus !== "active", user.id],
  );
  return { action: forceRevoked ? "payment.refunded" : "entitlement.synced", entityType: "user", entityId: Number(user.id), data: { accountStatus, grants } };
};

const applyManagementEvent = async (client, event) => {
  switch (event.eventType) {
    case "teacher.upserted": return syncTeacher(client, event);
    case "course.upserted": return syncCourse(client, event);
    case "class.upserted": return syncClass(client, event);
    case "class.teacher.assigned": return syncClassTeacher(client, event);
    case "student.provisioned": return syncStudent(client, event);
    case "class.membership.changed": return syncMembership(client, event);
    case "entitlement.changed": return syncEntitlement(client, event);
    case "payment.refunded": return syncEntitlement(client, event, true);
    default: throw new SyncValidationError("eventType chưa được LMS hỗ trợ");
  }
};

const lockSeconds = () => {
  const configured = Number.parseInt(process.env.LMS_SYNC_JOB_LOCK_SECONDS || "900", 10);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 60), 3600) : 900;
};

const retryDelaySeconds = (retryCount) => Math.min(900, 10 * (2 ** Math.max(0, retryCount - 1)));
const publicError = (error) => String(error?.message || "Đồng bộ Management thất bại").slice(0, 2000);

const claimNextJob = async (client, workerId) => {
  await client.query("BEGIN");
  try {
    await client.query(
      `UPDATE lms_sync_jobs
       SET status = 'DEAD_LETTER', processed_at = NOW(), locked_at = NULL, locked_by = NULL,
           last_error = COALESCE(last_error, 'Đã vượt quá số lần retry')
       WHERE inbox_id IS NOT NULL AND status IN ('PENDING', 'PROCESSING')
         AND retry_count >= max_retries`,
    );
    await client.query(
      `UPDATE lms_sync_inbox i
       SET status = 'DEAD_LETTER', processed_at = NOW(), last_error = j.last_error
       FROM lms_sync_jobs j
       WHERE j.inbox_id = i.id AND j.status = 'DEAD_LETTER' AND i.status <> 'DEAD_LETTER'`,
    );
    const claimed = await client.query(
      `WITH candidate AS (
         SELECT j.id
         FROM lms_sync_jobs j
         WHERE j.inbox_id IS NOT NULL
           AND j.retry_count < j.max_retries
           AND (
             (j.status = 'PENDING' AND COALESCE(j.next_attempt_at, NOW()) <= NOW())
             OR (j.status = 'PROCESSING' AND j.locked_at <= NOW() - ($1 * INTERVAL '1 second'))
           )
         ORDER BY j.created_at ASC, j.id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE lms_sync_jobs j
       SET status = 'PROCESSING', retry_count = j.retry_count + 1,
           locked_at = NOW(), locked_by = $2, last_attempt_at = NOW(), updated_at = NOW()
       FROM candidate c, lms_sync_inbox i
       WHERE j.id = c.id AND i.id = j.inbox_id
       RETURNING j.id, j.inbox_id, j.retry_count, j.max_retries, j.correlation_id,
                 j.event_type, i.event_id, i.event_type AS inbox_event_type, i.source,
                 i.occurred_at, i.payload, i.correlation_id AS inbox_correlation_id`,
      [lockSeconds(), workerId],
    );
    if (claimed.rows[0]) {
      await client.query("UPDATE lms_sync_inbox SET status = 'PROCESSING' WHERE id = $1", [claimed.rows[0].inbox_id]);
    }
    await client.query("COMMIT");
    return claimed.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
};

const markJobFailure = async (client, job, error) => {
  const retryable = !(error instanceof SyncValidationError);
  const isDeadLetter = !retryable || Number(job.retry_count) >= Number(job.max_retries);
  const status = isDeadLetter ? "DEAD_LETTER" : "PENDING";
  const nextDelay = isDeadLetter ? null : retryDelaySeconds(Number(job.retry_count));
  const message = publicError(error);
  await client.query("BEGIN");
  try {
    await client.query(
      `UPDATE lms_sync_jobs
       SET status = $1, last_error = $2, locked_at = NULL, locked_by = NULL,
           next_attempt_at = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + ($3 * INTERVAL '1 second') END,
           processed_at = CASE WHEN $1 = 'DEAD_LETTER' THEN NOW() ELSE NULL END
       WHERE id = $4`,
      [status, message, nextDelay, job.id],
    );
    await client.query(
      `UPDATE lms_sync_inbox
       SET status = $1, last_error = $2, processed_at = CASE WHEN $1 = 'DEAD_LETTER' THEN NOW() ELSE NULL END
       WHERE id = $3`,
      [status, message, job.inbox_id],
    );
    await recordAuditEvent({
      db: client,
      actorId: null,
      action: isDeadLetter ? "sync.job.dead_letter" : "sync.job.retry_scheduled",
      entityType: "lms_sync_job",
      entityId: Number(job.id),
      afterState: { status, retryCount: Number(job.retry_count), maxRetries: Number(job.max_retries) },
      metadata: { eventId: job.event_id, correlationId: job.inbox_correlation_id, error: message },
    });
    await client.query("COMMIT");
    return { status, retryAfterSeconds: nextDelay, error: message };
  } catch (markError) {
    await client.query("ROLLBACK").catch(() => {});
    throw markError;
  }
};

export const processNextManagementSyncJob = async ({ workerId }) => {
  const client = await getClient();
  try {
    const job = await claimNextJob(client, workerId);
    if (!job) return null;
    const event = {
      eventId: job.event_id,
      eventType: job.inbox_event_type,
      source: job.source,
      occurredAt: new Date(job.occurred_at),
      payload: job.payload,
      correlationId: job.inbox_correlation_id,
    };
    try {
      await client.query("BEGIN");
      const outcome = await applyManagementEvent(client, event);
      await client.query(
        `UPDATE lms_sync_jobs
         SET status = 'SUCCESS', last_error = NULL, locked_at = NULL, locked_by = NULL,
             processed_at = NOW(), next_attempt_at = NULL
         WHERE id = $1`,
        [job.id],
      );
      await client.query(
        `UPDATE lms_sync_inbox
         SET status = 'SUCCESS', last_error = NULL, processed_at = NOW()
         WHERE id = $1`,
        [job.inbox_id],
      );
      await recordAuditEvent({
        db: client,
        actorId: null,
        action: outcome.action,
        entityType: outcome.entityType,
        entityId: outcome.entityId,
        afterState: outcome.data,
        metadata: { eventId: event.eventId, correlationId: event.correlationId, source: event.source },
      });
      await client.query("COMMIT");
      return { id: Number(job.id), status: "SUCCESS", eventType: event.eventType, outcome };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      const failure = await markJobFailure(client, job, error);
      return { id: Number(job.id), eventType: event.eventType, ...failure };
    }
  } finally {
    client.release();
  }
};

export const processAvailableManagementSyncJobs = async ({ workerId, limit = 10 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 100);
  const results = [];
  for (let index = 0; index < safeLimit; index += 1) {
    const result = await processNextManagementSyncJob({ workerId });
    if (!result) break;
    results.push(result);
  }
  return results;
};
