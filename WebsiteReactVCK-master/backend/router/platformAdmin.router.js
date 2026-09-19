import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { query } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";

const router = express.Router();
const adminOnly = [protectRoute, requireAdmin];

const errorResponse = (res, status, message, errorCode) => res.status(status).json({
  success: false, message, errorCode,
});

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const permissionRows = (rows) => rows.map((row) => ({
  id: String(row.id),
  code: row.code,
  name: row.name,
  scope: row.scope,
  admin: Boolean(row.admin),
  teacher: Boolean(row.teacher),
  student: Boolean(row.student),
  isSystem: Boolean(row.is_system),
}));

// GET /api/v1/admin/permissions
router.get("/permissions", ...adminOnly, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.code, p.name, p.scope, p.is_system,
              COALESCE(BOOL_OR(rp.is_allowed) FILTER (WHERE rp.role = 'admin'), FALSE) AS admin,
              COALESCE(BOOL_OR(rp.is_allowed) FILTER (WHERE rp.role = 'creator'), FALSE) AS teacher,
              COALESCE(BOOL_OR(rp.is_allowed) FILTER (WHERE rp.role = 'user'), FALSE) AS student
       FROM lms_permissions p
       LEFT JOIN lms_role_permissions rp ON rp.permission_id = p.id
       GROUP BY p.id
       ORDER BY p.id`,
    );
    return res.json({ success: true, data: permissionRows(result.rows) });
  } catch (error) {
    console.error("Error listing LMS permissions:", error);
    return errorResponse(res, 500, "Không thể tải ma trận phân quyền", "INTERNAL_ERROR");
  }
});

// PATCH /api/v1/admin/permissions/:id — body contains one of admin/teacher/student.
router.patch("/permissions/:id", ...adminOnly, async (req, res) => {
  const permissionId = parseId(req.params.id);
  if (!permissionId) return errorResponse(res, 422, "permissionId không hợp lệ", "VALIDATION_ERROR");
  const roleMap = { admin: "admin", teacher: "creator", student: "user" };
  const keys = Object.keys(req.body || {}).filter((key) => Object.hasOwn(roleMap, key));
  if (keys.length !== 1 || typeof req.body[keys[0]] !== "boolean") {
    return errorResponse(res, 422, "Body phải chứa đúng một quyền admin/teacher/student kiểu boolean", "VALIDATION_ERROR");
  }
  const uiRole = keys[0];
  const role = roleMap[uiRole];
  try {
    const permission = (await query("SELECT id, code, is_system FROM lms_permissions WHERE id = $1", [permissionId])).rows[0];
    if (!permission) return errorResponse(res, 404, "Không tìm thấy permission", "NOT_FOUND");
    if (permission.is_system && role === "admin") {
      return errorResponse(res, 409, "Không thể tắt quyền hệ thống của Admin", "SYSTEM_PERMISSION_LOCKED");
    }
    const result = await query(
      `INSERT INTO lms_role_permissions (permission_id, role, is_allowed, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (permission_id, role) DO UPDATE
         SET is_allowed = EXCLUDED.is_allowed, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING permission_id, role, is_allowed`,
      [permissionId, role, req.body[uiRole], req.user.id],
    );
    await recordAuditEvent({
      actorId: req.user.id,
      action: "permission.updated",
      entityType: "lms_permission",
      entityId: permissionId,
      afterState: { code: permission.code, role, isAllowed: req.body[uiRole] },
      metadata: { ip: req.ip },
    });
    return res.json({
      success: true,
      data: { id: String(permissionId), role: uiRole, allowed: result.rows[0].is_allowed },
    });
  } catch (error) {
    console.error("Error updating LMS permission:", error);
    return errorResponse(res, 500, "Không thể cập nhật quyền", "INTERNAL_ERROR");
  }
});

// GET /api/v1/admin/classes — source-of-truth class/course mapping view.
router.get("/classes", ...adminOnly, async (req, res) => {
  try {
    const result = await query(
      `SELECT lc.id, lc.title, lc.status, lc.management_class_source_id,
              COALESCE(lc.management_course_source_id, c.external_course_id) AS management_course_source_id,
              COALESCE(c.title, c.name) AS course_title,
              c.external_course_id, u.username AS teacher_name,
              COUNT(DISTINCT ce.user_id) FILTER (WHERE ce.status = 'active')::int AS student_count,
              COUNT(DISTINCT ce.user_id) FILTER (WHERE ce.status = 'active' AND EXISTS (
                SELECT 1 FROM lms_access_grants g
                WHERE g.user_id = ce.user_id AND g.course_id = c.id AND g.access_status = 'active'
                  AND (g.valid_until IS NULL OR g.valid_until > NOW())
              ))::int AS entitlement_count
       FROM live_classes lc
       LEFT JOIN courses c ON c.id = lc.course_id
       LEFT JOIN users u ON u.id = lc.instructor_id
       LEFT JOIN class_enrollments ce ON ce.live_class_id = lc.id
       GROUP BY lc.id, c.id, u.id
       ORDER BY lc.created_at DESC, lc.id DESC`,
    );
    return res.json({ success: true, data: result.rows.map((row) => ({
      id: String(row.id),
      code: `LIVE-${row.id}`,
      name: row.title,
      title: row.title,
      courseTitle: row.course_title || null,
      managementClassId: row.management_class_source_id || "MOLY_CLS_Pending",
      managementCourseId: row.management_course_source_id || "MOLY_CRS_Pending",
      teacherName: row.teacher_name || "Chưa phân công",
      studentCount: Number(row.student_count || 0),
      entitlementCount: Number(row.entitlement_count || 0),
      mappingStatus: row.management_class_source_id && row.management_course_source_id ? "MAPPED" : "PENDING",
      active: row.status === "active" && Boolean(row.management_class_source_id && row.management_course_source_id),
    })) });
  } catch (error) {
    console.error("Error listing LMS class mappings:", error);
    return errorResponse(res, 500, "Không thể tải danh sách lớp học", "INTERNAL_ERROR");
  }
});

// PATCH /api/v1/admin/classes/:id/mapping — persists the bridge mapping.
router.patch("/classes/:id/mapping", ...adminOnly, async (req, res) => {
  const classId = parseId(req.params.id);
  const managementClassId = typeof req.body?.managementClassId === "string" ? req.body.managementClassId.trim() : "";
  const managementCourseId = typeof req.body?.managementCourseId === "string" ? req.body.managementCourseId.trim() : "";
  if (!classId || !managementClassId || !managementCourseId || managementClassId.length > 128 || managementCourseId.length > 128) {
    return errorResponse(res, 422, "Mapping ID không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const current = (await query(
      `SELECT lc.id, lc.management_class_source_id, lc.management_course_source_id,
              lc.course_id, c.external_course_id
       FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id WHERE lc.id = $1`,
      [classId],
    )).rows[0];
    if (!current) return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    const result = await query(
      `UPDATE live_classes SET management_class_source_id = $1, management_course_source_id = $2
       WHERE id = $3 RETURNING id, management_class_source_id, management_course_source_id`,
      [managementClassId, managementCourseId, classId],
    );
    if (current.course_id) {
      await query("UPDATE courses SET external_course_id = $1 WHERE id = $2", [managementCourseId, current.course_id]);
    }
    await recordAuditEvent({
      actorId: req.user.id,
      action: "class.mapping_updated",
      entityType: "live_class",
      entityId: classId,
      beforeState: current,
      afterState: result.rows[0],
      metadata: { ip: req.ip, managementClassId, managementCourseId },
    });
    return res.json({ success: true, data: result.rows[0], message: "Đã lưu mapping lớp học" });
  } catch (error) {
    if (error.code === "23505") return errorResponse(res, 409, "Management Class ID đã được dùng", "CONFLICT");
    console.error("Error updating class mapping:", error);
    return errorResponse(res, 500, "Không thể lưu mapping lớp học", "INTERNAL_ERROR");
  }
});

// GET /api/v1/admin/audit-logs
router.get("/audit-logs", ...adminOnly, async (req, res) => {
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 10000);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const action = typeof req.query.action === "string" ? req.query.action.trim().toUpperCase() : "ALL";
  const offset = (page - 1) * limit;
  const params = [];
  const filters = [];
  if (action && action !== "ALL") {
    const actionMap = {
      ENTITLEMENT_GRANT: ["access_grant.updated", "entitlement.granted"],
      GRADE_SUBMISSION: ["submission.graded"],
      MOLY_BRIDGE_SYNC: ["sync.job_retried", "sync.job.failed", "sync.job.completed"],
    };
    const mappedActions = actionMap[action] || [action.toLowerCase().replaceAll("_", ".")];
    params.push(mappedActions);
    filters.push(`a.action = ANY($1::text[])`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;
  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.before_state, a.after_state, a.created_at,
                u.email, u.username, u.role,
                COALESCE(a.metadata->>'status', 'SUCCESS') AS audit_status
         FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
         ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
        [...params, limit, offset],
      ),
      query(`SELECT COUNT(*)::int AS total FROM audit_events a ${where}`, params),
    ]);
    return res.json({ success: true, data: {
      logs: rows.rows.map((row) => ({
        id: String(row.id),
        actor: row.email || row.username || "system_sync",
        role: String(row.role || "SYSTEM").toUpperCase(),
        action: String(row.action).replaceAll(".", "_").toUpperCase(),
        target: `${row.entity_type}${row.entity_id ? `: ${row.entity_id}` : ""}`,
        ipAddress: row.metadata?.ip || "—",
        timestamp: row.created_at,
        status: String(row.audit_status).toUpperCase() === "FAILED" ? "FAILED" : "SUCCESS",
        details: row.metadata?.details || row.metadata?.reason || null,
        beforeState: row.before_state || null,
        afterState: row.after_state || null,
      })),
      total: Number(total.rows[0]?.total || 0),
      page,
      limit,
    } });
  } catch (error) {
    console.error("Error listing audit logs:", error);
    return errorResponse(res, 500, "Không thể tải nhật ký kiểm toán", "INTERNAL_ERROR");
  }
});

export default router;
