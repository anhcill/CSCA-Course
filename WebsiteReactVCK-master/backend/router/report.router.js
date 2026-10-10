import express from "express";
import { getClient } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import requireActiveStudentLmsAccess from "../middleware/requireActiveStudentLmsAccess.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { makeCsv, makeXlsx } from "../services/spreadsheetExport.service.js";
import { buildGradebook, gradebookTable } from "../services/gradebook.service.js";
import { normalizeGradebookPolicy } from "../services/lmsWorkflowPolicy.service.js";
import { assertGradebookOpen, assertManagedClass, positiveId, requiredReason, workflowError, notifyWorkflow } from "../services/lmsWorkflow.service.js";

const router = express.Router();
const gradebookCapabilities = async (db, classId, user) => {
  if (user.role === "admin") return { canManagePolicy: true, canFinalize: true, canReopen: true };
  const permissions = await db.query(`SELECT p.code FROM lms_permissions p
    JOIN lms_role_permissions rp ON rp.permission_id=p.id
    WHERE rp.role=$1 AND rp.is_allowed=TRUE AND p.code=ANY($2::text[])`,
    [user.role, ["lms.gradebook.policy.manage", "lms.gradebook.finalize", "lms.gradebook.reopen"]]);
  const allowed = new Set(permissions.rows.map((row) => row.code));
  const lead = (await db.query(`SELECT 1 FROM live_classes lc WHERE lc.id=$1 AND
    (EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id=lc.id
      AND ct.teacher_id=$2 AND ct.status='active' AND ct.teaching_role='lead') OR
     lc.instructor_id=$2 AND NOT EXISTS (SELECT 1 FROM class_teachers ct
       WHERE ct.live_class_id=lc.id AND ct.teacher_id=$2))`,
    [classId, user.id])).rows.length > 0;
  return {
    canManagePolicy: lead && allowed.has("lms.gradebook.policy.manage"),
    canFinalize: lead && allowed.has("lms.gradebook.finalize"),
    canReopen: allowed.has("lms.gradebook.reopen"),
  };
};
const requireGradebookCapability = (capability) => async (req, res, db, classId) => {
  const capabilities = await gradebookCapabilities(db, classId, req.user);
  if (!capabilities[capability]) throw workflowError("Bạn không có quyền thực hiện thao tác sổ điểm này.", 403);
};
router.get("/gradebook/my-result", protectRoute, requireActiveStudentLmsAccess, async (req, res) => {
  const db = await getClient();
  try {
    const classId = positiveId(req.query.classId);
    const access = await db.query(`SELECT 1 FROM class_enrollments ce JOIN live_classes lc ON lc.id=ce.live_class_id
      JOIN lms_access_grants g ON g.course_id=lc.course_id AND g.user_id=ce.user_id
      WHERE ce.live_class_id=$1 AND ce.user_id=$2 AND ce.status='active' AND g.access_status='active'
        AND g.valid_from<=NOW() AND (g.valid_until IS NULL OR g.valid_until>NOW())`, [classId,req.user.id]);
    if (!access.rows.length) throw workflowError("Bạn không có quyền xem kết quả lớp này.",403);
    const final = (await db.query("SELECT snapshot,finalized_at FROM gradebook_finalizations WHERE class_id=$1 AND reopened_at IS NULL",[classId])).rows[0];
    const own = final?.snapshot.rows.find((row)=>String(row.id)===String(req.user.id));
    res.json({success:true,data:own ? {total:own.total,passed:own.passed,policy:final.snapshot.policy,finalizedAt:final.finalized_at} : null});
  } catch(error) {res.status(error.status||500).json({success:false,message:error.status?error.message:"Không thể tải điểm tổng kết."});}
  finally {db.release();}
});
router.use(protectRoute, requireTeacher);
const handler = (callback) => async (req, res) => {
  const db = await getClient();
  try {
    const classId = positiveId(req.query.classId || req.body.classId);
    await assertManagedClass(db, classId, req.user);
    await db.query("BEGIN");
    await callback(req, res, db, classId);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("Gradebook:", error);
    if (!res.headersSent) res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể xử lý sổ điểm." });
  } finally { db.release(); }
};
const getScopedBook = async (req, db, classId) => {
  const sessionId = req.query.sessionId && req.query.sessionId !== "all" ? positiveId(req.query.sessionId) : null;
  if (sessionId && !(await db.query("SELECT 1 FROM class_sessions WHERE id = $1 AND live_class_id = $2", [sessionId, classId])).rows.length) throw workflowError("Buổi học không thuộc lớp.", 404);
  const final = (await db.query("SELECT * FROM gradebook_finalizations WHERE class_id = $1 AND reopened_at IS NULL", [classId])).rows[0];
  const book = final && !sessionId ? final.snapshot : await buildGradebook(db, classId, sessionId);
  if (req.query.courseId && Number(req.query.courseId) !== Number(book.classInfo.course_id)) throw workflowError("Khóa học không khớp lớp.", 422);
  return { book, final };
};
router.get("/gradebook", handler(async (req, res, db, classId) => {
  const { book, final } = await getScopedBook(req, db, classId);
  const capabilities = await gradebookCapabilities(db, classId, req.user);
  const history = await db.query(`SELECT f.id, f.finalized_at, f.reopened_at, f.reopen_reason, u.username AS finalized_by_name
    FROM gradebook_finalizations f LEFT JOIN users u ON u.id=f.finalized_by WHERE class_id=$1 ORDER BY f.id DESC LIMIT 20`, [classId]);
  await db.query("COMMIT");
  res.json({ success: true, data: { ...book, finalization: final ? { id: final.id, finalizedAt: final.finalized_at } : null, history: history.rows, capabilities } });
}));
router.put("/gradebook/policy", handler(async (req, res, db, classId) => {
  await requireGradebookCapability("canManagePolicy")(req, res, db, classId);
  let policy;
  try { policy = normalizeGradebookPolicy(req.body.policy); } catch (error) { throw workflowError(error.message); }
  await assertGradebookOpen(db, classId);
  const before = (await db.query("SELECT policy FROM class_gradebook_policies WHERE class_id=$1", [classId])).rows[0]?.policy;
  await db.query(`INSERT INTO class_gradebook_policies(class_id, policy, updated_by) VALUES ($1,$2::jsonb,$3)
    ON CONFLICT(class_id) DO UPDATE SET policy=EXCLUDED.policy,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [classId, JSON.stringify(policy), req.user.id]);
  await recordAuditEvent({ db, actorId: req.user.id, action: "gradebook.policy_updated", entityType: "live_class", entityId: classId, beforeState: before, afterState: policy });
  await db.query("COMMIT"); res.json({ success: true });
}));
router.post("/gradebook/finalize", handler(async (req, res, db, classId) => {
  await requireGradebookCapability("canFinalize")(req, res, db, classId);
  await assertGradebookOpen(db, classId);
  const pending = await db.query(`SELECT 1 FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id
    WHERE a.live_class_id=$1 AND (s.status <> 'graded' OR s.return_requested)
    UNION ALL SELECT 1 FROM attendance_amendment_requests r JOIN class_sessions cs ON cs.id=r.session_id
    WHERE cs.live_class_id=$1 AND r.status='pending'
    UNION ALL SELECT 1 FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id
    WHERE q.live_class_id=$1 AND qa.status='in_progress' LIMIT 1`, [classId]);
  if (pending.rows.length) throw workflowError("Còn bài chờ chấm, bài cần nộp lại hoặc phiếu điểm danh chờ duyệt.", 409);
  const snapshot = await buildGradebook(db, classId);
  if (!snapshot.rows.length) throw workflowError("Lớp chưa có học viên.");
  const row = (await db.query("INSERT INTO gradebook_finalizations(class_id,snapshot,finalized_by) VALUES ($1,$2::jsonb,$3) RETURNING id", [classId, JSON.stringify(snapshot), req.user.id])).rows[0];
  await recordAuditEvent({ db, actorId: req.user.id, action: "gradebook.finalized", entityType: "live_class", entityId: classId, afterState: { finalizationId: row.id, students: snapshot.rows.length, policy: snapshot.policy } });
  for (const student of snapshot.rows) await notifyWorkflow(db,{userId:student.id,title:"Lớp đã có điểm tổng kết",message:`Điểm tổng kết: ${student.total ?? "chưa xác định"}/100.`,
    link:`/lms/courses/${snapshot.classInfo.course_id}/classes/${classId}/results`,key:`gradebook-finalized:${row.id}:${student.id}`,actorId:req.user.id});
  await db.query("COMMIT"); res.json({ success: true });
}));
router.post("/gradebook/reopen", handler(async (req, res, db, classId) => {
  await requireGradebookCapability("canReopen")(req, res, db, classId);
  const reason = requiredReason(req.body.reason);
  await db.query("SELECT id FROM live_classes WHERE id=$1 FOR UPDATE", [classId]);
  const rows = await db.query("UPDATE gradebook_finalizations SET reopened_by=$2,reopened_at=NOW(),reopen_reason=$3 WHERE class_id=$1 AND reopened_at IS NULL RETURNING id", [classId, req.user.id, reason]);
  if (!rows.rows.length) throw workflowError("Sổ điểm chưa được chốt.", 409);
  await recordAuditEvent({ db, actorId: req.user.id, action: "gradebook.reopened", entityType: "live_class", entityId: classId, afterState: { reason, finalizationId: rows.rows[0].id } });
  await db.query("COMMIT"); res.json({ success: true });
}));
router.get("/gradebook/export", requirePermission("lms.report.export"), handler(async (req, res, db, classId) => {
  const format = req.query.format || "xlsx";
  if (!["csv","xlsx"].includes(format)) throw workflowError("Định dạng phải là CSV hoặc XLSX.");
  const { book, final } = await getScopedBook(req, db, classId);
  const filters = { classId, courseId: book.classInfo.course_id, sessionId: book.sessionId, finalizationId: book.sessionId ? null : final?.id || null };
  const file = format === "csv" ? makeCsv(gradebookTable(book)) : makeXlsx(gradebookTable(book), "So diem");
  const log = await db.query(`INSERT INTO lms_report_exports(report_type,export_format,class_id,course_id,filters_json,row_count,exported_by)
    VALUES ('gradebook',$1,$2,$3,$4::jsonb,$5,$6) RETURNING id`, [format, classId, book.classInfo.course_id, JSON.stringify(filters), book.rows.length, req.user.id]);
  await recordAuditEvent({ db, actorId: req.user.id, action: "gradebook.exported", entityType: "live_class", entityId: classId, afterState: { exportId: log.rows[0].id, format, rowCount: book.rows.length }, metadata: filters });
  await db.query("COMMIT");
  res.set({ "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="so-diem-${classId}${book.sessionId ? "-buoi-" + book.sessionId : ""}.${format}"`, "Cache-Control": "no-store" });
  res.send(file);
}));
export default router;
