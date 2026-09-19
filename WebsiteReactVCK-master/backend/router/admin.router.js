import express from "express";
import bcrypt from "bcryptjs";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { recordAuditEvent } from "../services/audit.service.js";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  generateUploadPresignedUrl,
  generateVideoHeadSignedUrl,
} from "../services/video.service.js";

const router = express.Router();
const adminOnly = [protectRoute, requireAdmin];
const VALID_ROLES = new Set(["user", "creator", "admin"]);
const VALID_GENDERS = new Set(["male", "female", "other"]);
const VALID_CATEGORIES = new Set(["HSK", "HSKK", "CSCA"]);
const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);

const sendError = (res, status, message, errorCode, details = undefined) => res.status(status).json({
  success: false,
  message,
  errorCode,
  ...(details ? { details } : {}),
});

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePage = (value, fallback, max = 100) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const parseLimit = (value, fallback = 20) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
};

const normalizeText = (value, maxLength, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw new Error("REQUIRED");
    return null;
  }
  if (typeof value !== "string") throw new Error("INVALID_TEXT");
  const normalized = value.trim();
  if (required && !normalized) throw new Error("REQUIRED");
  if (normalized.length > maxLength) throw new Error("INVALID_TEXT");
  return normalized;
};

const normalizeSlug = (value) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 300);

const safeUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  role: row.role,
  gender: row.gender,
  avatarUrl: row.avatar_url || null,
  fullName: row.full_name || row.username,
  isLocked: Boolean(row.is_locked),
  isVip: Boolean(row.is_vip),
  emailVerified: Boolean(row.email_verified),
  authProvider: row.oauth_provider || "local",
  hasPassword: Boolean(row.has_password ?? row.password_hash),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const auditUserState = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  role: row.role,
  gender: row.gender,
  avatarUrl: row.avatar_url || null,
  isLocked: Boolean(row.is_locked),
});

const auditCourseState = (row) => ({
  id: row.id,
  title: row.title || row.name,
  slug: row.slug,
  category: row.category,
  level: row.level,
  isPublished: Boolean(row.is_published),
  price: row.price,
  thumbnailUrl: row.thumbnail_url || row.image_url || null,
});

const courseSelect = `
  SELECT c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug, c.description,
         c.category, c.level, COALESCE(c.price, 0) AS price,
         COALESCE(c.is_free, true) AS is_free, c.is_published,
         COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
         c.total_lessons, c.ratings_count, c.ratings_avg, c.enrolled_count,
         c.author_id, c.created_at, c.updated_at,
         u.username AS instructor_name, u.avatar_url AS instructor_avatar_url,
         (SELECT COUNT(*)::int FROM sections s WHERE s.course_id = c.id) AS section_count,
         (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS active_enrollments,
         (SELECT COUNT(*)::int FROM lesson_progress lp WHERE lp.course_id = c.id) AS progress_count`;

const getCourse = async (courseId, db = { query }) => {
  const result = await db.query(`${courseSelect} FROM courses c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1`, [courseId]);
  return result.rows[0] || null;
};

const getUser = async (userId, db = { query }) => {
  const result = await db.query(
    `SELECT u.id, u.username, u.email, u.role, u.gender, u.avatar_url, u.is_locked,
            u.is_vip, u.email_verified, u.oauth_provider, u.password_hash,
            u.created_at, u.updated_at, sp.full_name
     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  return result.rows[0] || null;
};

const ensureAnotherAdmin = async (userId, db = { query }) => {
  const result = await db.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND id <> $1", [userId]);
  return Number(result.rows[0]?.count || 0) > 0;
};

const handleDbError = (res, error, fallback) => {
  if (error?.code === "23505") return sendError(res, 409, "Dữ liệu đã tồn tại", "CONFLICT");
  console.error(fallback, error);
  return sendError(res, 500, fallback, "INTERNAL_ERROR");
};

// GET /api/admin/kpi-summary — all values are calculated from current LMS data.
router.get("/kpi-summary", ...adminOnly, async (req, res) => {
  try {
    const [users, courses, enrollments, pending, attendance, completion, revenue, monthly, activities] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE role = 'user' AND NOT is_locked)::int AS active_learners,
                    COUNT(*) FILTER (WHERE role = 'creator')::int AS creators,
                    COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
                    COUNT(*) FILTER (WHERE is_locked)::int AS locked
             FROM users`),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE is_published)::int AS published,
                    COUNT(*) FILTER (WHERE NOT is_published)::int AS drafts
             FROM courses`),
      query("SELECT COUNT(*)::int AS count FROM enrollments WHERE status = 'active'"),
      query("SELECT COUNT(*)::int AS count FROM assignment_submissions WHERE status IN ('submitted', 'late')"),
      query(`SELECT COALESCE(AVG(CASE WHEN status IN ('present', 'excused') THEN 100 ELSE 0 END), 0)::numeric(5,1) AS rate
             FROM class_attendance`),
      query("SELECT COALESCE(AVG(progress_pct), 0)::numeric(5,1) AS rate FROM progress"),
      query("SELECT COALESCE(SUM(final_amount_vnd) FILTER (WHERE status = 'success'), 0)::bigint AS total FROM transactions"),
      query(`WITH months AS (
               SELECT date_trunc('month', CURRENT_DATE) - (n * INTERVAL '1 month') AS month_start
               FROM generate_series(6, 0, -1) AS n
             )
             SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                    (SELECT COUNT(*)::int FROM enrollments e WHERE date_trunc('month', e.enrolled_at) = m.month_start) AS enrollments,
                    (SELECT COUNT(*)::int FROM users u WHERE date_trunc('month', u.created_at) = m.month_start) AS users
             FROM months m ORDER BY m.month_start`),
      query(`SELECT ae.id, ae.action, ae.entity_type, ae.entity_id, ae.created_at,
                    u.username AS actor, u.avatar_url AS avatar
             FROM audit_events ae LEFT JOIN users u ON u.id = ae.actor_id
             ORDER BY ae.created_at DESC LIMIT 8`),
    ]);

    const userStats = users.rows[0] || {};
    const courseStats = courses.rows[0] || {};
    const monthlyEnrollmentStats = monthly.rows.map((row) => ({
      month: row.month,
      enrollments: Number(row.enrollments || 0),
      users: Number(row.users || 0),
    }));
    const currentMonth = monthlyEnrollmentStats.at(-1)?.enrollments || 0;
    const previousMonth = monthlyEnrollmentStats.at(-2)?.enrollments || 0;
    const growth = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;
    const recentAuditEvents = activities.rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actor: row.actor || "Hệ thống",
      avatar: row.avatar || null,
      createdAt: row.created_at,
    }));
    const legacyActivities = recentAuditEvents.map((item) => ({
      id: item.id,
      actor: item.actor,
      avatar: item.avatar,
      action: item.action,
      target: `${item.entityType} #${item.entityId || "—"}`,
      time: item.createdAt,
      type: item.entityType,
    }));
    return res.json({
      success: true,
      data: {
        users: {
          total: Number(userStats.total || 0),
          activeLearners: Number(userStats.active_learners || 0),
          creators: Number(userStats.creators || 0),
          admins: Number(userStats.admins || 0),
          locked: Number(userStats.locked || 0),
        },
        courses: {
          total: Number(courseStats.total || 0),
          published: Number(courseStats.published || 0),
          drafts: Number(courseStats.drafts || 0),
        },
        activeEnrollments: Number(enrollments.rows[0]?.count || 0),
        pendingSubmissions: Number(pending.rows[0]?.count || 0),
        attendanceRate: Number(attendance.rows[0]?.rate || 0),
        completionRate: `${Number(completion.rows[0]?.rate || 0)}%`,
        completionRateValue: Number(completion.rows[0]?.rate || 0),
        monthlyEnrollmentStats,
        recentActivities: legacyActivities,
        recentAuditEvents,
        // Compatibility aliases for the restored Gemini dashboard. Values remain database-derived.
        activeLearnersCount: Number(userStats.active_learners || 0),
        totalEnrollmentsCount: Number(enrollments.rows[0]?.count || 0),
        pendingGradingCount: Number(pending.rows[0]?.count || 0),
        avgAttendanceRate: `${Number(attendance.rows[0]?.rate || 0)}%`,
        totalRevenueVnd: `${Number(revenue.rows[0]?.total || 0).toLocaleString("vi-VN")} đ`,
        monthlyGrowthPct: `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`,
      },
    });
  } catch (error) {
    return handleDbError(res, error, "Không thể tải KPI quản trị");
  }
});

// GET /api/admin/users — server-side search, filter, sort and pagination.
router.get("/users", ...adminOnly, async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit);
    const params = [];
    const filters = [];
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length} OR COALESCE(sp.full_name, '') ILIKE $${params.length})`);
    }
    if (VALID_ROLES.has(req.query.role)) {
      params.push(req.query.role);
      filters.push(`u.role = $${params.length}`);
    }
    if (["active", "locked"].includes(req.query.status)) {
      params.push(req.query.status === "locked");
      filters.push(`u.is_locked = $${params.length}`);
    }
    const sortSql = {
      newest: "u.created_at DESC, u.id DESC",
      username: "u.username ASC, u.id ASC",
      email: "u.email ASC, u.id ASC",
    }[req.query.sort] || "u.created_at DESC, u.id DESC";
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await query(
      `SELECT u.id, u.username, u.email, u.role, u.gender, u.avatar_url,
              u.is_locked, u.is_vip, u.email_verified, u.oauth_provider,
              (u.password_hash IS NOT NULL) AS has_password,
              u.created_at, u.updated_at, COALESCE(sp.full_name, u.username) AS full_name,
              COUNT(*) OVER()::int AS total_count
       FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY ${sortSql} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = Number(result.rows[0]?.total_count || 0);
    return res.json({
      success: true,
      data: result.rows.map(({ total_count: _total, ...row }) => safeUser(row)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return handleDbError(res, error, "Không thể tải danh sách người dùng");
  }
});

// POST /api/admin/users — explicit allow-list; password hash never leaves the server.
router.post("/users", ...adminOnly, async (req, res) => {
  try {
    const username = normalizeText(req.body.username, 50, { required: true });
    const email = normalizeText(req.body.email, 255, { required: true }).toLowerCase();
    const password = normalizeText(req.body.password, 200, { required: true });
    if (password.length < 6) return sendError(res, 422, "Mật khẩu phải có ít nhất 6 ký tự", "VALIDATION_ERROR");
    const role = req.body.role || "user";
    const gender = req.body.gender || "other";
    if (!VALID_ROLES.has(role)) return sendError(res, 422, "Vai trò không hợp lệ", "VALIDATION_ERROR");
    if (!VALID_GENDERS.has(gender)) return sendError(res, 422, "Giới tính không hợp lệ", "VALIDATION_ERROR");
    const avatarUrl = req.body.avatarUrl === undefined ? null : normalizeText(req.body.avatarUrl, 1000);
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (username, email, password_hash, gender, avatar_url, role, email_verified, is_locked)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, FALSE)
       RETURNING id, username, email, role, gender, avatar_url, is_locked, is_vip, email_verified, oauth_provider, password_hash, created_at, updated_at`,
      [username, email, hash, gender, avatarUrl, role],
    );
    await recordAuditEvent({ actorId: req.user.id, action: "user.created", entityType: "user", entityId: result.rows[0].id, afterState: auditUserState(result.rows[0]), metadata: { ip: req.ip } });
    return res.status(201).json({ success: true, data: safeUser(result.rows[0]), message: "Tạo tài khoản thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT"].includes(error.message)) return sendError(res, 422, "Thông tin tài khoản không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể tạo tài khoản");
  }
});

// Compatibility endpoint for the restored Gemini AdminUser screen.
// It keeps the legacy /lock URL while applying the same admin policy and audit trail.
router.patch("/users/:id/lock", ...adminOnly, async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId || typeof req.body.isLocked !== "boolean") return sendError(res, 422, "Thông tin khóa tài khoản không hợp lệ", "VALIDATION_ERROR");
  if (userId === Number(req.user.id) && req.body.isLocked) return sendError(res, 422, "Không thể tự khóa tài khoản quản trị", "SELF_LOCK_FORBIDDEN");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const before = await getUser(userId, client);
    if (!before) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy người dùng", "NOT_FOUND"); }
    const result = await client.query(
      `UPDATE users SET is_locked = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, email, role, gender, avatar_url, is_locked, is_vip, email_verified, oauth_provider, password_hash, created_at, updated_at`,
      [req.body.isLocked, userId],
    );
    if (req.body.isLocked) await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    await recordAuditEvent({ db: client, actorId: req.user.id, action: req.body.isLocked ? "user.locked" : "user.unlocked", entityType: "user", entityId: userId, beforeState: auditUserState(before), afterState: auditUserState(result.rows[0]), metadata: { ip: req.ip } });
    await client.query("COMMIT");
    return res.json({ success: true, data: safeUser(result.rows[0]), message: req.body.isLocked ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return handleDbError(res, error, "Không thể đổi trạng thái tài khoản");
  } finally { client.release(); }
});

// PATCH /api/admin/users/:id — only fields in this allow-list are mutable.
router.patch("/users/:id", ...adminOnly, async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return sendError(res, 422, "userId không hợp lệ", "VALIDATION_ERROR");
  if (userId === Number(req.user.id) && req.body.isLocked === true) return sendError(res, 422, "Không thể tự khóa tài khoản quản trị", "SELF_LOCK_FORBIDDEN");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const before = await getUser(userId, client);
    if (!before) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy người dùng", "NOT_FOUND"); }
    const nextRole = req.body.role === undefined ? before.role : req.body.role;
    if (!VALID_ROLES.has(nextRole)) { await client.query("ROLLBACK"); return sendError(res, 422, "Vai trò không hợp lệ", "VALIDATION_ERROR"); }
    if (before.role === "admin" && nextRole !== "admin" && !(await ensureAnotherAdmin(userId, client))) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "Không thể hạ cấp quản trị viên cuối cùng", "LAST_ADMIN_PROTECTED");
    }
    const fields = [];
    const values = [];
    const add = (sql, value) => { values.push(value); fields.push(`${sql} = $${values.length}`); };
    if (req.body.username !== undefined) add("username", normalizeText(req.body.username, 50, { required: true }));
    if (req.body.email !== undefined) add("email", normalizeText(req.body.email, 255, { required: true }).toLowerCase());
    if (req.body.gender !== undefined) {
      if (!VALID_GENDERS.has(req.body.gender)) { await client.query("ROLLBACK"); return sendError(res, 422, "Giới tính không hợp lệ", "VALIDATION_ERROR"); }
      add("gender", req.body.gender);
    }
    if (req.body.avatarUrl !== undefined) add("avatar_url", normalizeText(req.body.avatarUrl, 1000));
    if (req.body.role !== undefined) add("role", nextRole);
    if (req.body.isLocked !== undefined) {
      if (typeof req.body.isLocked !== "boolean") { await client.query("ROLLBACK"); return sendError(res, 422, "isLocked không hợp lệ", "VALIDATION_ERROR"); }
      add("is_locked", req.body.isLocked);
    }
    if (req.body.newPassword !== undefined) {
      const newPassword = normalizeText(req.body.newPassword, 200, { required: true });
      if (newPassword.length < 6) { await client.query("ROLLBACK"); return sendError(res, 422, "Mật khẩu phải có ít nhất 6 ký tự", "VALIDATION_ERROR"); }
      add("password_hash", await bcrypt.hash(newPassword, 12));
    }
    let after = before;
    if (fields.length) {
      values.push(userId);
      const result = await client.query(
        `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length}
         RETURNING id, username, email, role, gender, avatar_url, is_locked, is_vip, email_verified, oauth_provider, password_hash, created_at, updated_at`,
        values,
      );
      after = result.rows[0];
      if (req.body.isLocked === true) await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: before.is_locked !== after.is_locked ? (after.is_locked ? "user.locked" : "user.unlocked") : "user.updated", entityType: "user", entityId: userId, beforeState: auditUserState(before), afterState: auditUserState(after), metadata: { ip: req.ip } });
    await client.query("COMMIT");
    return res.json({ success: true, data: safeUser(after), message: "Cập nhật người dùng thành công" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (["REQUIRED", "INVALID_TEXT"].includes(error.message)) return sendError(res, 422, "Thông tin cập nhật không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể cập nhật người dùng");
  } finally {
    client.release();
  }
});

router.delete("/users/:id", ...adminOnly, async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return sendError(res, 422, "userId không hợp lệ", "VALIDATION_ERROR");
  if (userId === Number(req.user.id)) return sendError(res, 422, "Không thể tự xóa tài khoản đang đăng nhập", "SELF_DELETE_FORBIDDEN");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const before = await getUser(userId, client);
    if (!before) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy người dùng", "NOT_FOUND"); }
    if (before.role === "admin" && !(await ensureAnotherAdmin(userId, client))) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "Không thể xóa quản trị viên cuối cùng", "LAST_ADMIN_PROTECTED");
    }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "user.deleted", entityType: "user", entityId: userId, beforeState: auditUserState(before), metadata: { ip: req.ip } });
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("COMMIT");
    return res.json({ success: true, data: { id: userId }, message: "Đã xóa tài khoản" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return handleDbError(res, error, "Không thể xóa tài khoản");
  } finally {
    client.release();
  }
});

// GET /api/admin/courses — safe course rows with counts for the console.
router.get("/courses", ...adminOnly, async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1);
    const limit = parseLimit(req.query.limit);
    const params = [];
    const filters = [];
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) { params.push(`%${search}%`); filters.push(`(COALESCE(c.title, c.name) ILIKE $${params.length} OR c.slug ILIKE $${params.length})`); }
    if (VALID_CATEGORIES.has(req.query.category)) { params.push(req.query.category); filters.push(`c.category = $${params.length}`); }
    if (["published", "draft"].includes(req.query.status)) { params.push(req.query.status === "published"); filters.push(`c.is_published = $${params.length}`); }
    const sortSql = {
      newest: "c.updated_at DESC, c.id DESC",
      title: "COALESCE(c.title, c.name) ASC, c.id ASC",
      enrollments: "active_enrollments DESC, c.id DESC",
    }[req.query.sort] || "c.updated_at DESC, c.id DESC";
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await query(
      `${courseSelect}, COUNT(*) OVER()::int AS total_count
       FROM courses c LEFT JOIN users u ON u.id = c.author_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY ${sortSql} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = Number(result.rows[0]?.total_count || 0);
    return res.json({ success: true, data: result.rows.map(({ total_count: _total, ...course }) => course), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    return handleDbError(res, error, "Không thể tải danh sách khóa học");
  }
});

const validateCourseInput = (body, { partial = false } = {}) => {
  const output = {};
  if (!partial) {
    output.title = normalizeText(body.title, 255, { required: true });
    output.slug = normalizeSlug(normalizeText(body.slug || body.title, 300, { required: true }));
  } else {
    if (body.title !== undefined) output.title = normalizeText(body.title, 255, { required: true });
    if (body.slug !== undefined) output.slug = normalizeSlug(normalizeText(body.slug, 300, { required: true }));
  }
  if (output.slug !== undefined && output.slug.length < 3) throw new Error("INVALID_SLUG");
  if (!partial || body.description !== undefined) output.description = body.description === null ? "" : normalizeText(body.description, 10000) || "";
  if (!partial || body.category !== undefined) output.category = body.category || "HSK";
  if (!partial || body.level !== undefined) output.level = body.level || "beginner";
  if ((output.category !== undefined && !VALID_CATEGORIES.has(output.category))
      || (output.level !== undefined && !VALID_LEVELS.has(output.level))) throw new Error("INVALID_ENUM");
  if (!partial || body.price !== undefined) {
    const price = Number(body.price ?? 0);
    if (!Number.isFinite(price) || price < 0) throw new Error("INVALID_PRICE");
    output.price = price;
  }
  if (!partial || body.isFree !== undefined) {
    if (body.isFree !== undefined && typeof body.isFree !== "boolean") throw new Error("INVALID_BOOLEAN");
    output.is_free = body.isFree ?? true;
  }
  if (!partial || body.thumbnailUrl !== undefined) output.thumbnail_url = normalizeText(body.thumbnailUrl, 1000);
  if (body.isPublished !== undefined || body.status !== undefined) {
    output.is_published = typeof body.isPublished === "boolean" ? body.isPublished : body.status === "published";
  }
  return output;
};

router.get("/courses/:id/curriculum", ...adminOnly, async (req, res) => {
  const courseId = parseId(req.params.id);
  if (!courseId) return sendError(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
  try {
    const course = await getCourse(courseId);
    if (!course) return sendError(res, 404, "Không tìm thấy khóa học", "NOT_FOUND");
    const [sections, lessons] = await Promise.all([
      query("SELECT id, course_id, title, sort_order, created_at, updated_at FROM sections WHERE course_id = $1 ORDER BY sort_order, id", [courseId]),
      query(`SELECT l.id, l.course_id, l.section_id, COALESCE(l.title, l.name) AS title, l.description,
                    COALESCE(l.duration_seconds, l.video_duration_seconds, 0) AS duration_seconds,
                    l.is_preview, l.is_published, l.sort_order, l.video_asset_id,
                    (va.id IS NOT NULL AND va.status = 'ready') AS has_video
             FROM lessons l LEFT JOIN video_assets va ON va.id = l.video_asset_id
             WHERE l.course_id = $1 ORDER BY l.sort_order, l.id`, [courseId]),
    ]);
    return res.json({ success: true, data: { course, sections: sections.rows, lessons: lessons.rows } });
  } catch (error) {
    return handleDbError(res, error, "Không thể tải giáo trình khóa học");
  }
});

router.post("/courses", ...adminOnly, async (req, res) => {
  try {
    const input = validateCourseInput(req.body);
    const result = await query(
      `INSERT INTO courses (name, title, slug, description, author_id, category, level, price, is_free, thumbnail_url, is_published)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, title, slug, description, category, level, price, is_free, thumbnail_url, is_published, author_id, created_at, updated_at`,
      [input.title, input.slug, input.description, req.user.id, input.category, input.level, input.price, input.is_free, input.thumbnail_url, input.is_published ?? false],
    );
    await recordAuditEvent({ actorId: req.user.id, action: "course.created", entityType: "course", entityId: result.rows[0].id, afterState: auditCourseState(result.rows[0]), metadata: { ip: req.ip } });
    return res.status(201).json({ success: true, data: result.rows[0], message: "Tạo khóa học thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT", "INVALID_SLUG", "INVALID_ENUM", "INVALID_PRICE", "INVALID_BOOLEAN"].includes(error.message)) return sendError(res, 422, "Thông tin khóa học không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể tạo khóa học");
  }
});

router.patch("/courses/:id", ...adminOnly, async (req, res) => {
  const courseId = parseId(req.params.id);
  if (!courseId) return sendError(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
  try {
    const before = await getCourse(courseId);
    if (!before) return sendError(res, 404, "Không tìm thấy khóa học", "NOT_FOUND");
    const input = validateCourseInput(req.body, { partial: true });
    const mapping = { title: "title", slug: "slug", description: "description", category: "category", level: "level", price: "price", is_free: "is_free", thumbnail_url: "thumbnail_url", is_published: "is_published" };
    const fields = [];
    const values = [];
    Object.entries(input).forEach(([key, value]) => { values.push(value); fields.push(`${mapping[key]} = $${values.length}`); });
    if (!fields.length) return sendError(res, 422, "Không có trường được phép cập nhật", "VALIDATION_ERROR");
    if (input.title !== undefined) { values.push(input.title); fields.push(`name = $${values.length}`); }
    values.push(courseId);
    const result = await query(`UPDATE courses SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    const after = result.rows[0];
    const action = before.is_published !== after.is_published ? "course.published_status_changed" : "course.updated";
    await recordAuditEvent({ actorId: req.user.id, action, entityType: "course", entityId: courseId, beforeState: auditCourseState(before), afterState: auditCourseState(after), metadata: { ip: req.ip } });
    return res.json({ success: true, data: after, message: "Cập nhật khóa học thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT", "INVALID_SLUG", "INVALID_ENUM", "INVALID_PRICE", "INVALID_BOOLEAN"].includes(error.message)) return sendError(res, 422, "Thông tin khóa học không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể cập nhật khóa học");
  }
});

router.delete("/courses/:id", ...adminOnly, async (req, res) => {
  const courseId = parseId(req.params.id);
  if (!courseId) return sendError(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const course = await getCourse(courseId, client);
    if (!course) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy khóa học", "NOT_FOUND"); }
    const counts = await client.query(`SELECT
      (SELECT COUNT(*)::int FROM enrollments WHERE course_id = $1) AS enrollments,
      (SELECT COUNT(*)::int FROM lesson_progress WHERE course_id = $1) AS progress`, [courseId]);
    const details = { enrollmentsCount: Number(counts.rows[0].enrollments || 0), progressCount: Number(counts.rows[0].progress || 0) };
    if (details.enrollmentsCount > 0 || details.progressCount > 0) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "Không thể xóa khóa học đã có dữ liệu học tập; hãy chuyển về bản nháp", "COURSE_HAS_LEARNING_DATA", details);
    }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "course.deleted", entityType: "course", entityId: courseId, beforeState: auditCourseState(course), metadata: { ...details, ip: req.ip } });
    await client.query("DELETE FROM courses WHERE id = $1", [courseId]);
    await client.query("COMMIT");
    return res.json({ success: true, data: { id: courseId }, message: "Đã xóa khóa học" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return handleDbError(res, error, "Không thể xóa khóa học");
  } finally { client.release(); }
});

const getSection = async (sectionId, db = { query }) => {
  const result = await db.query("SELECT id, course_id, title, sort_order FROM sections WHERE id = $1", [sectionId]);
  return result.rows[0] || null;
};

router.post("/courses/:id/sections", ...adminOnly, async (req, res) => {
  const courseId = parseId(req.params.id);
  if (!courseId) return sendError(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
  try {
    if (!await getCourse(courseId)) return sendError(res, 404, "Không tìm thấy khóa học", "NOT_FOUND");
    const title = normalizeText(req.body.title, 255, { required: true });
    const sortOrder = req.body.sortOrder === undefined ? 0 : Number(req.body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return sendError(res, 422, "sortOrder không hợp lệ", "VALIDATION_ERROR");
    const result = await query("INSERT INTO sections (course_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *", [courseId, title, sortOrder]);
    await recordAuditEvent({ actorId: req.user.id, action: "section.created", entityType: "section", entityId: result.rows[0].id, afterState: result.rows[0], metadata: { courseId, ip: req.ip } });
    return res.status(201).json({ success: true, data: result.rows[0], message: "Tạo chương học thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT"].includes(error.message)) return sendError(res, 422, "Tiêu đề chương không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể tạo chương học");
  }
});

router.patch("/sections/:id", ...adminOnly, async (req, res) => {
  const sectionId = parseId(req.params.id);
  if (!sectionId) return sendError(res, 422, "sectionId không hợp lệ", "VALIDATION_ERROR");
  try {
    const before = await getSection(sectionId);
    if (!before) return sendError(res, 404, "Không tìm thấy chương học", "NOT_FOUND");
    const fields = [];
    const values = [];
    if (req.body.title !== undefined) { values.push(normalizeText(req.body.title, 255, { required: true })); fields.push(`title = $${values.length}`); }
    if (req.body.sortOrder !== undefined) { const order = Number(req.body.sortOrder); if (!Number.isInteger(order) || order < 0) return sendError(res, 422, "sortOrder không hợp lệ", "VALIDATION_ERROR"); values.push(order); fields.push(`sort_order = $${values.length}`); }
    if (!fields.length) return sendError(res, 422, "Không có trường được phép cập nhật", "VALIDATION_ERROR");
    values.push(sectionId);
    const result = await query(`UPDATE sections SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user.id, action: "section.updated", entityType: "section", entityId: sectionId, beforeState: before, afterState: result.rows[0], metadata: { courseId: before.course_id, ip: req.ip } });
    return res.json({ success: true, data: result.rows[0], message: "Cập nhật chương học thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT"].includes(error.message)) return sendError(res, 422, "Thông tin chương học không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể cập nhật chương học");
  }
});

router.delete("/sections/:id", ...adminOnly, async (req, res) => {
  const sectionId = parseId(req.params.id);
  if (!sectionId) return sendError(res, 422, "sectionId không hợp lệ", "VALIDATION_ERROR");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const section = await getSection(sectionId, client);
    if (!section) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy chương học", "NOT_FOUND"); }
    const count = await client.query("SELECT COUNT(*)::int AS count FROM lessons WHERE section_id = $1", [sectionId]);
    if (Number(count.rows[0].count) > 0) { await client.query("ROLLBACK"); return sendError(res, 409, "Không thể xóa chương đang có bài học", "SECTION_HAS_LESSONS", { lessonsCount: Number(count.rows[0].count) }); }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "section.deleted", entityType: "section", entityId: sectionId, beforeState: section, metadata: { courseId: section.course_id, ip: req.ip } });
    await client.query("DELETE FROM sections WHERE id = $1", [sectionId]);
    await client.query("COMMIT");
    return res.json({ success: true, data: { id: sectionId }, message: "Đã xóa chương học" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return handleDbError(res, error, "Không thể xóa chương học");
  } finally { client.release(); }
});

const lessonFields = `l.id, l.course_id, l.section_id, COALESCE(l.title, l.name) AS title, l.description,
  COALESCE(l.duration_seconds, l.video_duration_seconds, 0) AS duration_seconds,
  l.is_preview, l.is_published, l.sort_order, l.video_asset_id`;

const getLesson = async (lessonId, db = { query }) => {
  const result = await db.query(`SELECT ${lessonFields} FROM lessons l WHERE l.id = $1`, [lessonId]);
  return result.rows[0] || null;
};

const validateLessonPayload = (body, { partial = false } = {}) => {
  const output = {};
  if (!partial || body.title !== undefined) output.title = normalizeText(body.title, 255, { required: true });
  if (!partial || body.description !== undefined) output.description = normalizeText(body.description, 10000) || "";
  if (!partial || body.durationSeconds !== undefined) { const duration = Number(body.durationSeconds ?? 0); if (!Number.isInteger(duration) || duration < 0 || duration > 86400) throw new Error("INVALID_DURATION"); output.duration_seconds = duration; }
  if (!partial || body.sortOrder !== undefined) { const order = Number(body.sortOrder ?? 0); if (!Number.isInteger(order) || order < 0) throw new Error("INVALID_SORT"); output.sort_order = order; }
  if (!partial || body.isPreview !== undefined) { if (body.isPreview !== undefined && typeof body.isPreview !== "boolean") throw new Error("INVALID_BOOLEAN"); output.is_preview = body.isPreview ?? false; }
  if (body.isPublished !== undefined) { if (typeof body.isPublished !== "boolean") throw new Error("INVALID_BOOLEAN"); output.is_published = body.isPublished; }
  if (body.videoAssetId !== undefined) { const assetId = body.videoAssetId === null || body.videoAssetId === "" ? null : parseId(body.videoAssetId); if (body.videoAssetId && !assetId) throw new Error("INVALID_VIDEO"); output.video_asset_id = assetId; }
  return output;
};

router.post("/sections/:id/lessons", ...adminOnly, async (req, res) => {
  const sectionId = parseId(req.params.id);
  if (!sectionId) return sendError(res, 422, "sectionId không hợp lệ", "VALIDATION_ERROR");
  try {
    const section = await getSection(sectionId);
    if (!section) return sendError(res, 404, "Không tìm thấy chương học", "NOT_FOUND");
    const input = validateLessonPayload(req.body);
    if (input.video_asset_id) {
      const asset = await query("SELECT id FROM video_assets WHERE id = $1 AND status = 'ready'", [input.video_asset_id]);
      if (!asset.rows[0]) return sendError(res, 422, "Video chưa sẵn sàng", "VIDEO_NOT_READY");
    }
    const result = await query(
      `INSERT INTO lessons (section_id, course_id, name, title, description, video_asset_id, duration_seconds, is_preview, sort_order, is_published)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [sectionId, section.course_id, input.title, input.description, input.video_asset_id ?? null, input.duration_seconds, input.is_preview, input.sort_order, input.is_published ?? false],
    );
    await recordAuditEvent({ actorId: req.user.id, action: "lesson.created", entityType: "lesson", entityId: result.rows[0].id, afterState: result.rows[0], metadata: { courseId: section.course_id, sectionId, ip: req.ip } });
    return res.status(201).json({ success: true, data: result.rows[0], message: "Tạo bài học thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT", "INVALID_DURATION", "INVALID_SORT", "INVALID_BOOLEAN", "INVALID_VIDEO"].includes(error.message)) return sendError(res, 422, "Thông tin bài học không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể tạo bài học");
  }
});

router.patch("/lessons/:id", ...adminOnly, async (req, res) => {
  const lessonId = parseId(req.params.id);
  if (!lessonId) return sendError(res, 422, "lessonId không hợp lệ", "VALIDATION_ERROR");
  try {
    const before = await getLesson(lessonId);
    if (!before) return sendError(res, 404, "Không tìm thấy bài học", "NOT_FOUND");
    const input = validateLessonPayload(req.body, { partial: true });
    if (input.video_asset_id) {
      const asset = await query("SELECT id FROM video_assets WHERE id = $1 AND status = 'ready'", [input.video_asset_id]);
      if (!asset.rows[0]) return sendError(res, 422, "Video chưa sẵn sàng", "VIDEO_NOT_READY");
    }
    const mapping = { title: "title", description: "description", duration_seconds: "duration_seconds", sort_order: "sort_order", is_preview: "is_preview", is_published: "is_published", video_asset_id: "video_asset_id" };
    const fields = [];
    const values = [];
    Object.entries(input).forEach(([key, value]) => { values.push(value); fields.push(`${mapping[key]} = $${values.length}`); });
    if (input.title !== undefined) { values.push(input.title); fields.push(`name = $${values.length}`); }
    if (!fields.length) return sendError(res, 422, "Không có trường được phép cập nhật", "VALIDATION_ERROR");
    values.push(lessonId);
    const result = await query(`UPDATE lessons SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    await recordAuditEvent({ actorId: req.user.id, action: "lesson.updated", entityType: "lesson", entityId: lessonId, beforeState: before, afterState: result.rows[0], metadata: { courseId: before.course_id, ip: req.ip } });
    return res.json({ success: true, data: result.rows[0], message: "Cập nhật bài học thành công" });
  } catch (error) {
    if (["REQUIRED", "INVALID_TEXT", "INVALID_DURATION", "INVALID_SORT", "INVALID_BOOLEAN", "INVALID_VIDEO"].includes(error.message)) return sendError(res, 422, "Thông tin bài học không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể cập nhật bài học");
  }
});

router.delete("/lessons/:id", ...adminOnly, async (req, res) => {
  const lessonId = parseId(req.params.id);
  if (!lessonId) return sendError(res, 422, "lessonId không hợp lệ", "VALIDATION_ERROR");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const lesson = await getLesson(lessonId, client);
    if (!lesson) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy bài học", "NOT_FOUND"); }
    const progress = await client.query("SELECT COUNT(*)::int AS count FROM lesson_progress WHERE lesson_id = $1", [lessonId]);
    if (Number(progress.rows[0].count) > 0) { await client.query("ROLLBACK"); return sendError(res, 409, "Không thể xóa bài học đã có tiến độ học", "LESSON_HAS_PROGRESS", { progressCount: Number(progress.rows[0].count) }); }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "lesson.deleted", entityType: "lesson", entityId: lessonId, beforeState: lesson, metadata: { courseId: lesson.course_id, ip: req.ip } });
    await client.query("DELETE FROM lessons WHERE id = $1", [lessonId]);
    await client.query("COMMIT");
    return res.json({ success: true, data: { id: lessonId }, message: "Đã xóa bài học" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return handleDbError(res, error, "Không thể xóa bài học");
  } finally { client.release(); }
});

router.patch("/courses/:id/reorder", ...adminOnly, async (req, res) => {
  const courseId = parseId(req.params.id);
  if (!courseId || !Array.isArray(req.body.sections) || !Array.isArray(req.body.lessons)) return sendError(res, 422, "Payload sắp xếp không hợp lệ", "VALIDATION_ERROR");
  const client = await getClient();
  try {
    await client.query("BEGIN");
    if (!await getCourse(courseId, client)) { await client.query("ROLLBACK"); return sendError(res, 404, "Không tìm thấy khóa học", "NOT_FOUND"); }
    for (const item of req.body.sections) {
      const id = parseId(item.id); const order = Number(item.sortOrder);
      if (!id || !Number.isInteger(order) || order < 0) { await client.query("ROLLBACK"); return sendError(res, 422, "section reorder không hợp lệ", "VALIDATION_ERROR"); }
      const updated = await client.query("UPDATE sections SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND course_id = $3 RETURNING id", [order, id, courseId]);
      if (!updated.rows[0]) { await client.query("ROLLBACK"); return sendError(res, 422, "section không thuộc khóa học", "VALIDATION_ERROR"); }
    }
    for (const item of req.body.lessons) {
      const id = parseId(item.id); const order = Number(item.sortOrder);
      if (!id || !Number.isInteger(order) || order < 0) { await client.query("ROLLBACK"); return sendError(res, 422, "lesson reorder không hợp lệ", "VALIDATION_ERROR"); }
      const updated = await client.query("UPDATE lessons SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND course_id = $3 RETURNING id", [order, id, courseId]);
      if (!updated.rows[0]) { await client.query("ROLLBACK"); return sendError(res, 422, "lesson không thuộc khóa học", "VALIDATION_ERROR"); }
    }
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "curriculum.reordered", entityType: "course", entityId: courseId, afterState: { sections: req.body.sections, lessons: req.body.lessons }, metadata: { ip: req.ip } });
    await client.query("COMMIT");
    return res.json({ success: true, data: { courseId }, message: "Đã cập nhật thứ tự giáo trình" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return handleDbError(res, error, "Không thể sắp xếp giáo trình");
  } finally { client.release(); }
});

const isValidR2Key = (value) => typeof value === "string" && value.length <= 500 && value.startsWith("videos/") && !value.includes("..") && !/[\\\s]/.test(value);
const isValidVideoSize = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= MAX_VIDEO_SIZE_BYTES;

// Admin-only upload endpoints keep the admin console policy separate from creator curriculum APIs.
router.post("/videos/upload-url", ...adminOnly, async (req, res) => {
  try {
    const { filename, mimeType, sizeBytes } = req.body;
    if (typeof filename !== "string" || !filename.trim() || !ALLOWED_VIDEO_MIME_TYPES.has(mimeType) || !isValidVideoSize(sizeBytes)) return sendError(res, 422, "Thông tin video không hợp lệ", "VALIDATION_ERROR");
    const data = await generateUploadPresignedUrl({ filename, mimeType, sizeBytes });
    return res.json({ success: true, data });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return sendError(res, 503, "Kho video Cloudflare R2 chưa được cấu hình", "SERVICE_UNAVAILABLE");
    return handleDbError(res, error, "Không thể tạo link upload video");
  }
});

router.post("/videos/confirm", ...adminOnly, async (req, res) => {
  try {
    const { title, r2Key, mimeType, sizeBytes, durationSeconds } = req.body;
    if (!isValidR2Key(r2Key) || !ALLOWED_VIDEO_MIME_TYPES.has(mimeType) || !isValidVideoSize(sizeBytes) || !Number.isSafeInteger(Number(durationSeconds)) || Number(durationSeconds) < 0 || Number(durationSeconds) > 86400) return sendError(res, 422, "Metadata video không hợp lệ", "VALIDATION_ERROR");
    const normalizedTitle = title === undefined ? "Video Bài Giảng" : normalizeText(title, 255, { required: true });
    const { headUrl } = await generateVideoHeadSignedUrl({ r2Key });
    const headResponse = await fetch(headUrl, { method: "HEAD" });
    if (!headResponse.ok) return sendError(res, 409, "Không tìm thấy object video trên R2; hãy upload xong rồi xác nhận lại", "VIDEO_OBJECT_NOT_FOUND");
    const contentLength = headResponse.headers.get("content-length");
    if (contentLength && Number(contentLength) !== Number(sizeBytes)) return sendError(res, 409, "Kích thước video thực tế không khớp metadata", "VIDEO_SIZE_MISMATCH");
    const result = await query(
      `INSERT INTO video_assets (title, r2_key, mime_type, size_bytes, duration_seconds, status)
       VALUES ($1, $2, $3, $4, $5, 'ready')
       ON CONFLICT (r2_key) DO UPDATE SET title = EXCLUDED.title, mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes, duration_seconds = EXCLUDED.duration_seconds, status = 'ready', updated_at = NOW()
       RETURNING id, title, r2_key, mime_type, size_bytes, duration_seconds, status, created_at, updated_at`,
      [normalizedTitle, r2Key, mimeType, Number(sizeBytes), Number(durationSeconds)],
    );
    await recordAuditEvent({ actorId: req.user.id, action: "video.confirmed", entityType: "video_asset", entityId: result.rows[0].id, afterState: { id: result.rows[0].id, r2Key, mimeType, sizeBytes: Number(sizeBytes), durationSeconds: Number(durationSeconds), status: "ready" }, metadata: { ip: req.ip } });
    return res.json({ success: true, data: result.rows[0], message: "Xác nhận video thành công" });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") return sendError(res, 503, "Kho video Cloudflare R2 chưa được cấu hình", "SERVICE_UNAVAILABLE");
    if (["REQUIRED", "INVALID_TEXT"].includes(error.message)) return sendError(res, 422, "Tiêu đề video không hợp lệ", "VALIDATION_ERROR");
    return handleDbError(res, error, "Không thể xác nhận video");
  }
});

export default router;
