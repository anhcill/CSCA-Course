import express from "express";
import { getClient } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { assertManagedClass, positiveId, requiredReason, workflowError, notifyWorkflow } from "../services/lmsWorkflow.service.js";
import { recordAuditEvent } from "../services/audit.service.js";

const router = express.Router();
router.use(protectRoute, requireTeacher, requirePermission("lms.support.manage"));
const handle = (callback) => async (req, res) => {
  const db = await getClient();
  try {
    const classId = positiveId(req.query.classId || req.body.classId);
    await assertManagedClass(db, classId, req.user);
    await db.query("BEGIN");
    await callback(req, res, db, classId);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("Student support:", error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể xử lý hồ sơ hỗ trợ." });
  } finally { db.release(); }
};
router.get("/", handle(async (req, res, db, classId) => {
  const students = await db.query("SELECT u.id,u.username AS name,u.email FROM class_enrollments ce JOIN users u ON u.id=ce.user_id WHERE ce.live_class_id=$1 AND ce.status='active' ORDER BY u.username", [classId]);
  const owners = await db.query(`SELECT DISTINCT u.id,u.username AS name FROM users u WHERE u.role='admin' OR
    u.id=(SELECT instructor_id FROM live_classes WHERE id=$1) OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.live_class_id=$1 AND ct.teacher_id=u.id AND ct.status='active')`, [classId]);
  const cases = await db.query(`SELECT s.*,u.username AS student_name,o.username AS owner_name FROM student_support_cases s
    JOIN users u ON u.id=s.user_id JOIN users o ON o.id=s.owner_id WHERE s.class_id=$1 ORDER BY s.status='resolved',s.follow_up_at NULLS LAST,s.updated_at DESC`, [classId]);
  await db.query("COMMIT"); res.json({ success: true, data: { students: students.rows, owners: owners.rows, cases: cases.rows } });
}));
const saveCase = handle(async (req, res, db, classId) => {
  const userId = positiveId(req.body.userId), ownerId = positiveId(req.body.ownerId);
  const note = requiredReason(req.body.note);
  const status = req.body.status || "open";
  if (!["open","contacted","scheduled","resolved"].includes(status)) throw workflowError("Trạng thái không hợp lệ.");
  const outcome = typeof req.body.outcome === "string" ? req.body.outcome.trim().slice(0, 2000) : "";
  if (status === "resolved" && outcome.length < 10) throw workflowError("Cần ghi kết quả hỗ trợ ít nhất 10 ký tự.");
  const followUpAt = req.body.followUpAt ? new Date(req.body.followUpAt) : null;
  if ((followUpAt && !Number.isFinite(followUpAt.getTime())) || (status === "scheduled" && !followUpAt)) throw workflowError("Cần thời gian hẹn hợp lệ.");
  if (!(await db.query("SELECT 1 FROM class_enrollments WHERE live_class_id=$1 AND user_id=$2 AND status='active'", [classId,userId])).rows.length) throw workflowError("Học viên không thuộc lớp.");
  const owner = (await db.query("SELECT id,role FROM users WHERE id=$1", [ownerId])).rows[0];
  if (!owner || !["admin","creator"].includes(owner.role)) throw workflowError("Người phụ trách phải là giáo viên hoặc quản trị viên.");
  await assertManagedClass(db,classId,owner);
  let before = null, saved;
  if (req.params.id) {
    const id = positiveId(req.params.id);
    before = (await db.query("SELECT * FROM student_support_cases WHERE id=$1 AND class_id=$2 FOR UPDATE",[id,classId])).rows[0];
    if (!before) throw workflowError("Không tìm thấy hồ sơ.",404);
    if (String(before.user_id) !== String(userId)) throw workflowError("Không thể đổi học viên của hồ sơ.");
    saved = (await db.query(`UPDATE student_support_cases SET owner_id=$2,status=$3,follow_up_at=$4,note=$5,outcome=$6,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id,ownerId,status,followUpAt?.toISOString() || null,note,outcome])).rows[0];
  } else {
    saved = (await db.query(`INSERT INTO student_support_cases(class_id,user_id,owner_id,status,follow_up_at,note,outcome,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[classId,userId,ownerId,status,followUpAt?.toISOString() || null,note,outcome,req.user.id])).rows[0];
  }
  await recordAuditEvent({db,actorId:req.user.id,action:"student_support.updated",entityType:"student_support_case",entityId:saved.id,beforeState:before,afterState:saved});
  if (!before || String(before.owner_id) !== String(ownerId)) await notifyWorkflow(db,{userId:ownerId,title:"Bạn được giao hỗ trợ học viên",message:note,link:`/lms/teach/support?classId=${classId}`,key:`support:${saved.id}:${new Date(saved.updated_at).toISOString()}`,actorId:req.user.id});
  await db.query("COMMIT"); res.json({success:true,data:saved});
});
router.post("/", saveCase);
router.put("/:id", saveCase);
export default router;
