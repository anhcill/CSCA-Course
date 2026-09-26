import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();
const adminOnly = [protectRoute, requireAdmin];

// Helper to detect overlaps between two sessions
const isOverlapping = (aStart, aEnd, bStart, bEnd) => {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && ae > bs;
};

// GET /api/admin/calendar — Overview of all class sessions with conflict detection
router.get("/", adminOnly, async (req, res) => {
  try {
    const { from, to, courseId, classId, teacherId, status } = req.query;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 86400000);
    const toDate = to ? new Date(to) : new Date(Date.now() + 35 * 86400000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
      return res.status(422).json({ success: false, message: "Khoảng thời gian lọc không hợp lệ" });
    }

    const values = [fromDate.toISOString(), toDate.toISOString()];
    const filters = ["cs.start_time >= $1", "cs.start_time <= $2"];

    if (courseId && /^\d+$/.test(courseId)) {
      values.push(Number(courseId));
      filters.push(`lc.course_id = $${values.length}`);
    }
    if (classId && /^\d+$/.test(classId)) {
      values.push(Number(classId));
      filters.push(`cs.live_class_id = $${values.length}`);
    }
    if (teacherId && /^\d+$/.test(teacherId)) {
      values.push(Number(teacherId));
      filters.push(`lc.instructor_id = $${values.length}`);
    }
    if (status && ["scheduled", "live", "completed", "cancelled", "rescheduled"].includes(status)) {
      // Session storage uses `ended`; the UI uses the learner-friendly `completed`.
      values.push(status === "completed" ? "ended" : status);
      filters.push(`cs.status = $${values.length}`);
    }

    const sessionsSql = `
      SELECT 
        cs.id, cs.live_class_id, cs.title,
        cs.start_time, cs.end_time, cs.meet_url AS meeting_url,
        CASE WHEN cs.status = 'ended' THEN 'completed' ELSE cs.status END AS status,
        cs.original_start_at, cs.original_end_at, cs.change_reason,
        cs.schedule_id, cs.version,
        lc.title AS live_class_title,
        c.id AS course_id, c.title AS course_title,
        u.id AS teacher_id, COALESCE(u.username, u.email) AS teacher_name, u.email AS teacher_email,
        (SELECT COUNT(*)::int FROM class_enrollments ce WHERE ce.live_class_id = cs.live_class_id AND ce.status = 'active') AS enrolled_count,
        (SELECT COUNT(*)::int
         FROM class_session_change_logs cl
         WHERE cl.session_id = cs.id
            OR (cs.schedule_id IS NOT NULL AND cl.schedule_id = cs.schedule_id)) AS change_log_count
      FROM class_sessions cs
      JOIN live_classes lc ON lc.id = cs.live_class_id
      LEFT JOIN courses c ON c.id = lc.course_id
      LEFT JOIN users u ON u.id = lc.instructor_id
      WHERE ${filters.join(" AND ")}
      ORDER BY cs.start_time ASC
    `;

    const sessionsRes = await query(sessionsSql, values);
    const sessions = sessionsRes.rows;

    // Run conflict detection on the fetched sessions
    const conflicts = [];
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const sA = sessions[i];
        const sB = sessions[j];
        if (sA.status === "cancelled" || sB.status === "cancelled") continue;

        if (isOverlapping(sA.start_time, sA.end_time, sB.start_time, sB.end_time)) {
          if (sA.teacher_id && sB.teacher_id && sA.teacher_id === sB.teacher_id) {
            conflicts.push({
              type: "teacher_conflict",
              message: `Giáo viên ${sA.teacher_name} bị trùng lịch dạy giữa lớp "${sA.live_class_title}" và "${sB.live_class_title}"`,
              sessionA: { id: sA.id, title: sA.title, classTitle: sA.live_class_title, start: sA.start_time, end: sA.end_time },
              sessionB: { id: sB.id, title: sB.title, classTitle: sB.live_class_title, start: sB.start_time, end: sB.end_time },
            });
          } else if (sA.live_class_id === sB.live_class_id) {
            conflicts.push({
              type: "class_overlap",
              message: `Lớp "${sA.live_class_title}" có 2 buổi học bị trùng thời gian (${sA.title} & ${sB.title})`,
              sessionA: { id: sA.id, title: sA.title, classTitle: sA.live_class_title, start: sA.start_time, end: sA.end_time },
              sessionB: { id: sB.id, title: sB.title, classTitle: sB.live_class_title, start: sB.start_time, end: sB.end_time },
            });
          }
        }
      }
    }

    // Filter dropdown metadata
    const classesRes = await query(`
      SELECT lc.id, lc.title, c.title AS course_title,
             COALESCE(u.username, u.email) AS teacher_name
      FROM live_classes lc
      LEFT JOIN courses c ON c.id = lc.course_id
      LEFT JOIN users u ON u.id = lc.instructor_id
      ORDER BY lc.title ASC
    `);

    const teachersRes = await query(`
      SELECT DISTINCT u.id, COALESCE(u.username, u.email) AS full_name, u.email
      FROM users u
      JOIN live_classes lc ON lc.instructor_id = u.id
      ORDER BY COALESCE(u.username, u.email) ASC
    `);

    const summary = {
      total: sessions.length,
      scheduled: sessions.filter((s) => s.status === "scheduled" || s.status === "live").length,
      rescheduled: sessions.filter((s) => s.status === "rescheduled" || Boolean(s.change_reason)).length,
      cancelled: sessions.filter((s) => s.status === "cancelled").length,
      completed: sessions.filter((s) => s.status === "completed").length,
      conflictCount: conflicts.length,
    };

    return res.json({
      success: true,
      data: {
        sessions,
        conflicts,
        classes: classesRes.rows,
        teachers: teachersRes.rows,
        summary,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/calendar:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy lịch tổng thể" });
  }
});

// GET /api/admin/calendar/sessions/:sessionId/history — Get audit history of session changes
router.get("/sessions/:sessionId/history", adminOnly, async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!sessionId) return res.status(422).json({ success: false, message: "sessionId không hợp lệ" });

    const logsRes = await query(`
      SELECT 
        cl.id, cl.session_id, cl.schedule_id, cl.scope,
        cl.before_state, cl.after_state, cl.reason, cl.created_at,
        u.id AS actor_id, COALESCE(u.username, u.email) AS actor_name,
        u.email AS actor_email, u.role AS actor_role
      FROM class_session_change_logs cl
      LEFT JOIN users u ON u.id = cl.actor_id
      WHERE cl.session_id = $1
         OR cl.schedule_id = (SELECT schedule_id FROM class_sessions WHERE id = $1)
      ORDER BY cl.created_at DESC
    `, [sessionId]);

    const sessionRes = await query(`
      SELECT cs.id, cs.title, cs.start_time, cs.end_time,
             CASE WHEN cs.status = 'ended' THEN 'completed' ELSE cs.status END AS status,
             lc.id AS live_class_id, lc.title AS live_class_title
      FROM class_sessions cs
      JOIN live_classes lc ON lc.id = cs.live_class_id
      WHERE cs.id = $1
    `, [sessionId]);

    return res.json({
      success: true,
      data: {
        session: sessionRes.rows[0] || null,
        history: logsRes.rows,
      },
    });
  } catch (error) {
    console.error("Error in GET session change history:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy lịch sử thay đổi" });
  }
});

export default router;
