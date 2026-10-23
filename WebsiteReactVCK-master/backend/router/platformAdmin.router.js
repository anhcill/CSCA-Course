import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { getClient, query } from "../db/connect.js";
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
const adminOnlyPermissionCodes = new Set([
  "lms.admin.view", "lms.class.manage", "lms.teacher.assign",
  "lms.sync.retry", "lms.permission.manage",
]);

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
  if (role === "user" && req.body[uiRole]) {
    return errorResponse(res, 409, "Các quyền trong ma trận này là thao tác quản trị/giảng dạy, không áp dụng cho học viên", "STUDENT_PERMISSION_NOT_APPLICABLE");
  }
  try {
    const permission = (await query("SELECT id, code, is_system FROM lms_permissions WHERE id = $1", [permissionId])).rows[0];
    if (!permission) return errorResponse(res, 404, "Không tìm thấy permission", "NOT_FOUND");
    if (role === "admin" && req.body[uiRole] === false) {
      return errorResponse(res, 409, "Quản trị viên luôn có toàn quyền LMS", "ADMIN_FULL_ACCESS");
    }
    if (role !== "admin" && adminOnlyPermissionCodes.has(permission.code) && req.body[uiRole]) {
      return errorResponse(res, 409, "Quyền này chỉ dành cho quản trị viên", "ADMIN_ONLY_PERMISSION");
    }
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
      `SELECT lc.id, lc.title, lc.status, lc.management_approval_status,
              lc.allow_file_download, lc.teacher_display_name, lc.cover_image_url,
              lc.management_class_source_id,
              COALESCE(lc.management_course_source_id, c.external_course_id) AS management_course_source_id,
              COALESCE(c.title, c.name) AS course_title,
              c.external_course_id, COALESCE(u.username, u.email) AS system_teacher_name,
              CASE WHEN u.role = 'creator' THEN u.id ELSE NULL END AS assigned_teacher_id,
              COUNT(DISTINCT ce.user_id) FILTER (WHERE ce.status = 'active' AND ce.is_internal_test = FALSE)::int AS student_count,
              COUNT(DISTINCT ce.user_id) FILTER (WHERE ce.status = 'active' AND ce.is_internal_test = FALSE AND EXISTS (
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
      teacherName: row.teacher_display_name || row.system_teacher_name || "Chưa phân công",
      systemTeacherName: row.system_teacher_name || null,
      teacherId: row.assigned_teacher_id === null ? null : String(row.assigned_teacher_id),
      coverImageUrl: row.cover_image_url || null,
      studentCount: Number(row.student_count || 0),
      entitlementCount: Number(row.entitlement_count || 0),
      mappingStatus: row.management_class_source_id && row.management_course_source_id ? "MAPPED" : "PENDING",
      approvalStatus: row.management_approval_status,
      allowFileDownload: row.allow_file_download !== false,
      active: row.status === "active" && Boolean(row.management_class_source_id && row.management_course_source_id),
    })) });
  } catch (error) {
    console.error("Error listing LMS class mappings:", error);
    return errorResponse(res, 500, "Không thể tải danh sách lớp học", "INTERNAL_ERROR");
  }
});

// PATCH /api/v1/admin/classes/:id/presentation — learner-facing teacher and cover.
router.patch("/classes/:id/presentation", ...adminOnly, async (req, res) => {
  const classId = parseId(req.params.id);
  const teacherName = typeof req.body?.teacherName === "string" ? req.body.teacherName.trim() : "";
  const coverImageUrl = typeof req.body?.coverImageUrl === "string" ? req.body.coverImageUrl.trim() : "";
  if (!classId || teacherName.length > 255 || coverImageUrl.length > 1000) {
    return errorResponse(res, 422, "Thông tin hiển thị lớp không hợp lệ", "VALIDATION_ERROR");
  }
  if (coverImageUrl && !/^https:\/\//i.test(coverImageUrl)) {
    return errorResponse(res, 422, "Ảnh nền lớp phải dùng liên kết HTTPS", "VALIDATION_ERROR");
  }
  try {
    const current = (await query(
      "SELECT id, title, teacher_display_name, cover_image_url FROM live_classes WHERE id = $1",
      [classId],
    )).rows[0];
    if (!current) return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    const updated = (await query(
      `UPDATE live_classes
       SET teacher_display_name = $1, cover_image_url = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, title, teacher_display_name, cover_image_url`,
      [teacherName || null, coverImageUrl || null, classId],
    )).rows[0];
    await recordAuditEvent({
      actorId: req.user.id,
      action: "class.presentation_updated",
      entityType: "live_class",
      entityId: classId,
      beforeState: current,
      afterState: updated,
      metadata: { ip: req.ip },
    });
    return res.json({
      success: true,
      data: {
        id: String(updated.id),
        teacherName: updated.teacher_display_name || "",
        coverImageUrl: updated.cover_image_url || "",
      },
      message: "Đã cập nhật thẻ lớp học",
    });
  } catch (error) {
    console.error("Error updating class presentation:", error);
    return errorResponse(res, 500, "Không thể cập nhật thẻ lớp học", "INTERNAL_ERROR");
  }
});

// PATCH /api/v1/admin/classes/:id/teacher — set or clear the class lead teacher.
router.patch("/classes/:id/teacher", ...adminOnly, async (req, res) => {
  const classId = parseId(req.params.id);
  const teacherId = req.body?.teacherId === null || req.body?.teacherId === ""
    ? null
    : parseId(req.body?.teacherId);
  if (!classId || (req.body?.teacherId !== null && req.body?.teacherId !== "" && !teacherId)) {
    return errorResponse(res, 422, "Thông tin phân công giáo viên không hợp lệ", "VALIDATION_ERROR");
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    const current = (await client.query(
      `SELECT lc.id, lc.instructor_id, lc.teacher_display_name,
              COALESCE(u.username, u.email) AS teacher_name
       FROM live_classes lc
       LEFT JOIN users u ON u.id = lc.instructor_id
       WHERE lc.id = $1 FOR UPDATE OF lc`,
      [classId],
    )).rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    }

    let teacher = null;
    if (teacherId) {
      teacher = (await client.query(
        `SELECT id, COALESCE(username, email) AS name
         FROM users
         WHERE id = $1 AND role = 'creator' AND is_locked = FALSE`,
        [teacherId],
      )).rows[0];
      if (!teacher) {
        await client.query("ROLLBACK");
        return errorResponse(res, 422, "Tài khoản giảng viên không tồn tại hoặc đã bị khóa", "VALIDATION_ERROR");
      }
    }

    await client.query(
      `UPDATE class_teachers
       SET status = 'revoked', updated_at = NOW()
       WHERE live_class_id = $1 AND (teaching_role = 'lead' OR teacher_id = $3)
         AND ($2::bigint IS NULL OR teacher_id <> $2)`,
      [classId, teacherId, current.instructor_id],
    );
    if (teacherId) {
      await client.query(
        `INSERT INTO class_teachers
           (live_class_id, teacher_id, teaching_role, status, can_manage_curriculum)
         VALUES ($1, $2, 'lead', 'active', TRUE)
         ON CONFLICT (live_class_id, teacher_id) DO UPDATE
         SET teaching_role = 'lead', status = 'active', can_manage_curriculum = TRUE,
             updated_at = NOW()`,
        [classId, teacherId],
      );
    }
    const updated = (await client.query(
      `UPDATE live_classes
       SET instructor_id = $2, teacher_display_name = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, instructor_id, teacher_display_name`,
      [classId, teacherId, teacher?.name || null],
    )).rows[0];
    await recordAuditEvent({
      db: client,
      actorId: req.user.id,
      action: teacherId ? "class.teacher_assigned" : "class.teacher_unassigned",
      entityType: "live_class",
      entityId: classId,
      beforeState: { teacherId: current.instructor_id, teacherName: current.teacher_display_name || current.teacher_name },
      afterState: { teacherId: updated.instructor_id, teacherName: updated.teacher_display_name },
      metadata: { ip: req.ip },
    });
    await client.query("COMMIT");
    return res.json({
      success: true,
      data: {
        id: String(classId),
        teacherId: updated.instructor_id === null ? null : String(updated.instructor_id),
        teacherName: updated.teacher_display_name || "",
      },
      message: teacherId ? "Đã phân công giáo viên phụ trách lớp" : "Đã gỡ giáo viên phụ trách lớp",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error assigning class teacher:", error);
    return errorResponse(res, 500, "Không thể cập nhật giáo viên phụ trách", "INTERNAL_ERROR");
  } finally {
    client.release();
  }
});

// PATCH /api/v1/admin/classes/:id/file-download-policy
router.patch("/classes/:id/file-download-policy", ...adminOnly, async (req, res) => {
  const classId = parseId(req.params.id);
  const allowFileDownload = req.body?.allowFileDownload;
  if (!classId || typeof allowFileDownload !== "boolean") {
    return errorResponse(res, 422, "Chính sách tải tài liệu không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const current = (await query(
      "SELECT id, title, allow_file_download FROM live_classes WHERE id = $1",
      [classId],
    )).rows[0];
    if (!current) return errorResponse(res, 404, "Không tìm thấy lớp học", "NOT_FOUND");
    const result = await query(
      `UPDATE live_classes
       SET allow_file_download = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, title, allow_file_download`,
      [allowFileDownload, classId],
    );
    await recordAuditEvent({
      actorId: req.user.id,
      action: "class.file_download_policy_updated",
      entityType: "live_class",
      entityId: classId,
      beforeState: { allowFileDownload: current.allow_file_download !== false },
      afterState: { allowFileDownload },
      metadata: { ip: req.ip },
    });
    return res.json({
      success: true,
      data: {
        id: String(result.rows[0].id),
        allowFileDownload: result.rows[0].allow_file_download !== false,
      },
      message: allowFileDownload ? "Đã cho phép học viên tải tài liệu" : "Đã chuyển tài liệu lớp sang chế độ chỉ xem",
    });
  } catch (error) {
    console.error("Error updating class file download policy:", error);
    return errorResponse(res, 500, "Không thể cập nhật chính sách tài liệu", "INTERNAL_ERROR");
  }
});

// Management can stage a new class and its calendar, but an administrator must
// approve the class before learners can access it.
router.post("/classes/:id/approval", ...adminOnly, async (req, res) => {
  const classId = parseId(req.params.id);
  const decision = req.body?.decision;
  if (!classId || !["approved", "rejected"].includes(decision)) {
    return errorResponse(res, 422, "Quyết định duyệt lớp không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const result = await query(
      `UPDATE live_classes
       SET management_approval_status = $1::varchar,
           status = CASE WHEN $1::varchar = 'approved' THEN COALESCE(management_requested_status, 'active') ELSE 'cancelled' END,
           management_approved_by = $2, management_approved_at = NOW()
       WHERE id = $3 AND management_class_source_id IS NOT NULL
         AND management_approval_status = 'pending'
       RETURNING id, title, status, management_approval_status`,
      [decision, req.user.id, classId],
    );
    if (!result.rows[0]) return errorResponse(res, 409, "Lớp không còn ở trạng thái chờ duyệt", "APPROVAL_CONFLICT");
    await recordAuditEvent({
      actorId: req.user.id, action: `class.${decision}`, entityType: "live_class",
      entityId: classId, afterState: result.rows[0], metadata: { ip: req.ip },
    });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error reviewing Management class:", error);
    return errorResponse(res, 500, "Không thể duyệt lớp", "INTERNAL_ERROR");
  }
});

router.get("/membership-approvals", ...adminOnly, async (req, res) => {
  try {
    const result = await query(
      `SELECT ce.id, ce.status, ce.management_membership_status,
              ce.management_membership_source_id, lc.id AS class_id, lc.title AS class_title,
              lc.management_approval_status AS class_approval_status,
              COALESCE(sp.full_name, u.username) AS student_name, u.email
       FROM class_enrollments ce
       JOIN live_classes lc ON lc.id = ce.live_class_id
       JOIN users u ON u.id = ce.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE ce.management_approval_status = 'pending'
         AND ce.management_membership_source_id IS NOT NULL
       ORDER BY ce.enrolled_at DESC, ce.id DESC LIMIT 300`,
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error listing membership approvals:", error);
    return errorResponse(res, 500, "Không thể tải danh sách ghi danh chờ duyệt", "INTERNAL_ERROR");
  }
});

router.post("/membership-approvals/:id", ...adminOnly, async (req, res) => {
  const membershipId = parseId(req.params.id);
  const decision = req.body?.decision;
  if (!membershipId || !["approved", "rejected"].includes(decision)) {
    return errorResponse(res, 422, "Quyết định duyệt học viên không hợp lệ", "VALIDATION_ERROR");
  }
  try {
    const result = await query(
      `UPDATE class_enrollments ce
       SET management_approval_status = $1::varchar,
           status = CASE WHEN $1::varchar = 'approved' THEN COALESCE(ce.management_membership_status, 'suspended') ELSE 'revoked' END,
           ended_at = CASE WHEN $1::varchar = 'approved' AND ce.management_membership_status = 'active'
             THEN NULL ELSE NOW() END,
           management_approved_by = $2, management_approved_at = NOW()
       WHERE ce.id = $3 AND ce.management_membership_source_id IS NOT NULL
         AND ce.management_approval_status = 'pending'
       RETURNING ce.id, ce.live_class_id, ce.user_id, ce.status, ce.management_approval_status`,
      [decision, req.user.id, membershipId],
    );
    if (!result.rows[0]) return errorResponse(res, 409, "Ghi danh không còn ở trạng thái chờ duyệt", "APPROVAL_CONFLICT");
    await recordAuditEvent({
      actorId: req.user.id, action: `class.membership.${decision}`,
      entityType: "class_enrollment", entityId: membershipId,
      afterState: result.rows[0], metadata: { ip: req.ip },
    });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error reviewing Management membership:", error);
    return errorResponse(res, 500, "Không thể duyệt ghi danh", "INTERNAL_ERROR");
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
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
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
    filters.push(`a.action = ANY($${params.length}::text[])`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(COALESCE(u.email, 'system_sync') ILIKE $${params.length}
      OR u.username ILIKE $${params.length}
      OR REPLACE(a.action, '.', '_') ILIKE $${params.length}
      OR (a.entity_type || CASE WHEN a.entity_id IS NOT NULL THEN ': ' || a.entity_id ELSE '' END) ILIKE $${params.length}
      OR COALESCE(a.metadata->>'details', a.metadata->>'reason', '') ILIKE $${params.length})`);
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
      query(`SELECT COUNT(*)::int AS total FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id ${where}`, params),
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
