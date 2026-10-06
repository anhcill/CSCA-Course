import express from "express";
import { getClient } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { makeCsv, makeXlsx } from "../services/spreadsheetExport.service.js";

const router = express.Router();

const validationError = (res, message) => res.status(422).json({ success: false, message, errorCode: "VALIDATION_ERROR" });
const notFound = (res, message) => res.status(404).json({ success: false, message, errorCode: "NOT_FOUND" });
const forbidden = (res, message) => res.status(403).json({ success: false, message, errorCode: "FORBIDDEN" });
const internalError = (res, message) => res.status(500).json({ success: false, message, errorCode: "INTERNAL_ERROR" });

const parsePositiveId = (value) => /^\d+$/.test(String(value || "")) && Number(value) > 0 ? Number(value) : null;
const fileNamePart = (value) => String(value || "lop-hoc").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "lop-hoc";

const canManageClass = async (client, classId, userId, role) => {
  if (role === "admin") return true;
  const access = await client.query(
    `SELECT 1 FROM live_classes lc
     WHERE lc.id = $1 AND (lc.instructor_id = $2 OR EXISTS (
       SELECT 1 FROM class_teachers ct
       WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
     ))`,
    [classId, userId],
  );
  return access.rows.length > 0;
};

const attendanceText = (status) => ({ present: "Có mặt", absent: "Vắng", excused: "Có phép" }[status] || "Chưa điểm danh");

router.get("/gradebook/export", protectRoute, requireTeacher, requirePermission("lms.report.export"), async (req, res) => {
  const client = await getClient();
  try {
    const classId = parsePositiveId(req.query.classId);
    const courseId = req.query.courseId === undefined ? null : parsePositiveId(req.query.courseId);
    const format = String(req.query.format || "xlsx").toLowerCase();
    if (!classId || (req.query.courseId !== undefined && !courseId)) return validationError(res, "classId/courseId không hợp lệ");
    if (!["csv", "xlsx"].includes(format)) return validationError(res, "format chỉ có thể là csv hoặc xlsx");
    if (!(await canManageClass(client, classId, req.user.id, req.user.role))) return forbidden(res, "Bạn không có quyền xuất sổ điểm của lớp này");

    const classResult = await client.query(
      `SELECT lc.id, lc.title, lc.course_id, COALESCE(c.title, c.name) AS course_title
       FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id
       WHERE lc.id = $1`, [classId],
    );
    const classInfo = classResult.rows[0];
    if (!classInfo || (courseId && Number(classInfo.course_id) !== courseId)) return notFound(res, "Không tìm thấy lớp/khóa học phù hợp");

    const [studentsResult, activitiesResult, attendanceResult, assignmentScoresResult, quizScoresResult] = await Promise.all([
      client.query(`SELECT u.id, COALESCE(u.username, u.email) AS student_name, u.email
                    FROM class_enrollments ce JOIN users u ON u.id = ce.user_id
                    WHERE ce.live_class_id = $1 AND ce.status = 'active'
                    ORDER BY LOWER(COALESCE(u.username, u.email)), u.id`, [classId]),
      client.query(`SELECT CONCAT('assignment-', a.id) AS activity_id, a.title, 'assignment' AS activity_type, a.max_score
                    FROM assignments a WHERE a.live_class_id = $1
                    UNION ALL
                    SELECT CONCAT('quiz-', q.id), q.title, 'quiz',
                           (SELECT COALESCE(SUM(qq.points), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id)
                    FROM quizzes q WHERE q.live_class_id = $1
                    ORDER BY activity_type, title`, [classId]),
      client.query(`SELECT ca.user_id, ca.status
                    FROM class_attendance ca JOIN class_sessions cs ON cs.id = ca.session_id
                    WHERE cs.live_class_id = $1 AND cs.status <> 'cancelled'`, [classId]),
      client.query(`SELECT s.user_id, CONCAT('assignment-', a.id) AS activity_id, latest.score, a.max_score
                    FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
                    JOIN LATERAL (SELECT sg.score FROM submission_grades sg WHERE sg.submission_id = s.id ORDER BY sg.graded_at DESC, sg.id DESC LIMIT 1) latest ON true
                    WHERE a.live_class_id = $1`, [classId]),
      client.query(`SELECT latest.user_id, CONCAT('quiz-', latest.quiz_id) AS activity_id, latest.score, latest.max_score
                    FROM (
                      SELECT DISTINCT ON (qa.user_id, q.id) qa.user_id, q.id AS quiz_id, qa.score, qa.max_score, qa.attempt_number, qa.submitted_at, qa.id
                      FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
                      WHERE q.live_class_id = $1 AND qa.status = 'submitted'
                      ORDER BY qa.user_id, q.id, qa.attempt_number DESC, qa.submitted_at DESC, qa.id DESC
                    ) latest`, [classId]),
    ]);

    const activities = activitiesResult.rows.map((row) => ({ ...row, max_score: Number(row.max_score || 0) }));
    const scoresByKey = new Map([...assignmentScoresResult.rows, ...quizScoresResult.rows]
      .map((row) => [`${row.user_id}:${row.activity_id}`, row]));
    const attendanceByStudent = new Map();
    for (const row of attendanceResult.rows) {
      const current = attendanceByStudent.get(String(row.user_id)) || { recorded: 0, present: 0 };
      current.recorded += 1;
      if (row.status === "present") current.present += 1;
      attendanceByStudent.set(String(row.user_id), current);
    }
    const header = ["Khóa học", "Lớp", "Học viên", "Email", "Chuyên cần", ...activities.map((item) => `${item.activity_type === "quiz" ? "Quiz" : "Bài tập"}: ${item.title} (${item.max_score})`)];
    const rows = studentsResult.rows.map((student) => {
      const attendance = attendanceByStudent.get(String(student.id));
      const attendanceValue = attendance?.recorded ? `${Math.round((attendance.present / attendance.recorded) * 100)}% (${attendance.present}/${attendance.recorded})` : "Chưa điểm danh";
      return [classInfo.course_title || "", classInfo.title, student.student_name, student.email, attendanceValue, ...activities.map((activity) => {
        const score = scoresByKey.get(`${student.id}:${activity.activity_id}`);
        return score ? `${score.score}/${Number(score.max_score || activity.max_score)}` : "Chưa có điểm";
      })];
    });

    await client.query("BEGIN");
    const exportLog = await client.query(
      `INSERT INTO lms_report_exports (report_type, export_format, class_id, course_id, filters_json, row_count, exported_by)
       VALUES ('gradebook', $1, $2, $3, $4::jsonb, $5, $6) RETURNING id, created_at`,
      [format, classId, classInfo.course_id, JSON.stringify({ classId, courseId: classInfo.course_id, activityCount: activities.length }), rows.length, req.user.id],
    );
    await recordAuditEvent({ db: client, actorId: req.user.id, action: "gradebook.exported", entityType: "live_class", entityId: classId, afterState: { exportId: exportLog.rows[0].id, format, rowCount: rows.length }, metadata: { ip: req.ip, courseId: classInfo.course_id, activityCount: activities.length } });
    await client.query("COMMIT");

    const reportRows = [header, ...rows];
    const baseName = `so-diem-${fileNamePart(classInfo.title)}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.csv"`, "Cache-Control": "no-store" });
      return res.send(makeCsv(reportRows));
    }
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${baseName}.xlsx"`, "Cache-Control": "no-store" });
    return res.send(makeXlsx(reportRows, "So diem"));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error exporting gradebook:", error);
    return internalError(res, "Không thể xuất sổ điểm");
  } finally {
    client.release();
  }
});

export default router;
