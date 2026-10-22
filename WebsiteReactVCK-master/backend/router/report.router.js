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

router.get("/student-analytics", protectRoute, requireActiveStudentLmsAccess, async (req, res) => {
  const db = await getClient();
  try {
    const userId = req.user.id;

    // 1. Get real course enrollments
    const coursesRes = await db.query(
      `WITH accessible_courses AS (
         SELECT DISTINCT g.course_id
         FROM lms_access_grants g
         WHERE g.user_id = $1 AND g.access_status = 'active'
           AND g.valid_from <= NOW() AND (g.valid_until IS NULL OR g.valid_until > NOW())
       ), course_progress AS (
         SELECT ac.course_id,
                CASE WHEN lesson_totals.total_count > 0
                  THEN lesson_totals.total_count ELSE session_totals.total_count END AS total_count,
                CASE WHEN lesson_totals.total_count > 0
                  THEN lesson_totals.completed_count ELSE session_totals.completed_count END AS completed_count
         FROM accessible_courses ac
         CROSS JOIN LATERAL (
           SELECT COUNT(l.id)::int AS total_count,
                  COUNT(lp.id) FILTER (WHERE lp.is_completed = TRUE)::int AS completed_count
           FROM lessons l
           LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.course_id = l.course_id AND lp.user_id = $1
           WHERE l.course_id = ac.course_id AND l.is_published = TRUE
         ) lesson_totals
         CROSS JOIN LATERAL (
           SELECT COUNT(cs.id)::int AS total_count,
                  COUNT(cs.id) FILTER (WHERE cs.status = 'ended' OR cs.end_time <= NOW())::int AS completed_count
           FROM class_sessions cs
           JOIN live_classes lc ON lc.id = cs.live_class_id
           JOIN class_enrollments ce ON ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
           WHERE lc.course_id = ac.course_id AND lc.status = 'active' AND cs.status <> 'cancelled'
         ) session_totals
       )
       SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE total_count > 0 AND completed_count >= total_count)::int AS completed_count,
              COALESCE(ROUND(AVG(CASE WHEN total_count > 0 THEN completed_count * 100.0 / total_count ELSE 0 END)), 0)::int AS progress_pct
       FROM course_progress`,
      [userId]
    );
    const activeCoursesCount = coursesRes.rows[0]?.count || 0;
    const completedCoursesCount = coursesRes.rows[0]?.completed_count || 0;
    const learningProgressPct = coursesRes.rows[0]?.progress_pct || 0;

    // 2. Query assignments & submissions (lấy bài nộp có điểm mới nhất)
    const assignmentRows = (await db.query(
      `SELECT a.id, a.title, 'TỰ LUẬN' AS type, a.max_score, COALESCE(c.title, c.name, 'Khóa học') AS course_title,
              s.id AS submission_id, sg.score, s.submitted_at, s.status AS submission_status,
              sess.title AS session_title
       FROM assignments a
       LEFT JOIN courses c ON c.id = a.course_id
       LEFT JOIN class_sessions sess ON sess.id = a.class_session_id
       JOIN LATERAL (
         SELECT s.id, s.submitted_at, s.status
         FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.user_id = $1
         ORDER BY s.submitted_at DESC
         LIMIT 1
       ) s ON true
       JOIN LATERAL (
         SELECT score FROM submission_grades
         WHERE submission_id = s.id ORDER BY graded_at DESC, id DESC LIMIT 1
       ) sg ON true
       WHERE sg.score IS NOT NULL`,
      [userId]
    )).rows;

    // 3. Query quizzes & attempts (lấy lượt thi điểm cao nhất hoặc mới nhất của mỗi quiz, tránh trùng lặp)
    const quizRows = (await db.query(
      `SELECT q.id, q.title, 'TRẮC NGHIỆM' AS type,
              (SELECT COALESCE(SUM(points), 0) FROM quiz_questions WHERE quiz_id = q.id) AS max_score,
              COALESCE(c.title, c.name, 'Khóa học') AS course_title,
              qa.id AS submission_id, qa.score, qa.submitted_at, qa.status AS submission_status,
              sess.title AS session_title
       FROM quizzes q
       LEFT JOIN courses c ON c.id = q.course_id
       LEFT JOIN class_sessions sess ON sess.id = q.class_session_id
       JOIN LATERAL (
         SELECT qa.id, qa.score, qa.submitted_at, qa.status
         FROM quiz_attempts qa
         WHERE qa.quiz_id = q.id AND qa.user_id = $1 AND qa.status = 'submitted'
         ORDER BY qa.score DESC, qa.submitted_at DESC
         LIMIT 1
       ) qa ON true`,
      [userId]
    )).rows;

    const allAssessments = [...assignmentRows, ...quizRows];

    // If student has real submissions in DB, calculate from real DB items
    let detailedList = [];
    if (allAssessments.length > 0) {
      detailedList = allAssessments.map((item, idx) => {
        const score = Number(item.score || 0);
        const maxScore = Number(item.max_score || 10) || 10;
        const pct = Math.round((score / maxScore) * 100);
        const score10 = Math.round((score / maxScore) * 100) / 10;
        return {
          id: `${item.type === "TRẮC NGHIỆM" ? "quiz" : "assignment"}-${item.id || idx}`,
          title: item.title,
          type: item.type || "TRẮC NGHIỆM",
          courseTitle: item.course_title || "Khóa học",
          sessionTitle: item.session_title || "Chưa gắn buổi học",
          score,
          maxScore,
          percentage: pct,
          score10,
          submittedAt: item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("vi-VN") : "—",
          rawDate: item.submitted_at || null,
          status: pct < 50 ? "weak" : pct < 70 ? "average" : pct < 85 ? "good" : "excellent",
          statusLabel: pct < 50 ? "Cần luyện tập (< 50%)" : pct < 70 ? "Trung bình (50% - 69%)" : pct < 85 ? "Khá (70% - 84%)" : "Giỏi / Xuất sắc (≥ 85%)",
          suggestion: pct < 70 ? "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức." : "Làm tốt lắm, tiếp tục phát huy ở các chuyên đề nâng cao tiếp theo.",
        };
      });
    } else {
      /* Historical demo data intentionally disabled. Empty analytics must reflect the database.
      // Authentic CSCA production dataset exactly as requested by user
      detailedList = [
        {
          id: "btvn-toan-2",
          title: "BTVN TOÁN CSCA - BUỔI 2 (HÀM SỐ)",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "01 — Buổi học",
          score: 0,
          maxScore: 24,
          percentage: 0,
          score10: 0,
          submittedAt: "20/10/2026",
          rawDate: "2026-10-20T10:00:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "quix-1",
          title: "quix",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "01 — Buổi học",
          score: 0,
          maxScore: 45,
          percentage: 0,
          score10: 0,
          submittedAt: "16/10/2026",
          rawDate: "2026-10-16T15:30:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "btvn-1",
          title: "bài tập về nhà",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "01 — Buổi học",
          score: 0,
          maxScore: 43,
          percentage: 0,
          score10: 0,
          submittedAt: "15/10/2026",
          rawDate: "2026-10-15T18:00:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "de-thi-moi",
          title: "Đề thi mới",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "luyện tập phản xạ",
          score: 0,
          maxScore: 2,
          percentage: 0,
          score10: 0,
          submittedAt: "19/10/2026",
          rawDate: "2026-10-19T09:00:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "btvn-tap-hop",
          title: "BTVN TOÁN CSCA (TẬP HỢP+BĐT)",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "luyện tập phản xạ",
          score: 0,
          maxScore: 22,
          percentage: 0,
          score10: 0,
          submittedAt: "19/10/2026",
          rawDate: "2026-10-19T14:00:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "gggg",
          title: "gggg",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "luyện tập phản xạ",
          score: 1,
          maxScore: 20,
          percentage: 5,
          score10: 0.5,
          submittedAt: "18/10/2026",
          rawDate: "2026-10-18T16:20:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "kt-1",
          title: "bài tập kiểm tra",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "01 — Buổi học",
          score: 1,
          maxScore: 4,
          percentage: 25,
          score10: 2.5,
          submittedAt: "13/10/2026",
          rawDate: "2026-10-13T11:00:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
        {
          id: "btvn-nga",
          title: "bai tao ve nga",
          type: "TRẮC NGHIỆM",
          courseTitle: "Khóa học csca tháng 10",
          sessionTitle: "luyện tập phản xạ",
          score: 3,
          maxScore: 10,
          percentage: 30,
          score10: 3.0,
          submittedAt: "16/10/2026",
          rawDate: "2026-10-16T20:00:00Z",
          status: "weak",
          statusLabel: "Cần luyện tập (< 50%)",
          suggestion: "Xem lại tài liệu buổi học và làm lại bài để nâng cao điểm số và bù lấp lỗ hổng kiến thức.",
        },
      ];
    }

      */
    }

    // Calculations
    const totalEarned = detailedList.reduce((acc, cur) => acc + cur.score, 0);
    const totalMax = detailedList.reduce((acc, cur) => acc + cur.maxScore, 0);
    const overallPct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
    const score10Scale = totalMax > 0 ? (totalEarned / totalMax * 10).toFixed(1) : "0.0";
    const gradedCount = detailedList.length;
    const reviewPriorityCount = detailedList.filter((i) => i.percentage < 70).length;

    // Distribution
    const under50 = detailedList.filter((i) => i.percentage < 50).length;
    const from50to69 = detailedList.filter((i) => i.percentage >= 50 && i.percentage < 70).length;
    const from70to84 = detailedList.filter((i) => i.percentage >= 70 && i.percentage < 85).length;
    const above85 = detailedList.filter((i) => i.percentage >= 85).length;

    const distribution = [
      { range: "< 50%", count: under50, percent: gradedCount ? Math.round((under50 / gradedCount) * 100) : 0, fill: "#ef4444", label: "Cần luyện tập" },
      { range: "50% - 69%", count: from50to69, percent: gradedCount ? Math.round((from50to69 / gradedCount) * 100) : 0, fill: "#f59e0b", label: "Trung bình" },
      { range: "70% - 84%", count: from70to84, percent: gradedCount ? Math.round((from70to84 / gradedCount) * 100) : 0, fill: "#3b82f6", label: "Khá" },
      { range: "≥ 85%", count: above85, percent: gradedCount ? Math.round((above85 / gradedCount) * 100) : 0, fill: "#10b981", label: "Giỏi / Xuất sắc" },
    ];

    // Trend over time (sorted by date)
    const sortedForTrend = [...detailedList].sort((a, b) => new Date(a.rawDate || 0) - new Date(b.rawDate || 0));
    const trend = sortedForTrend.map((item) => ({
      name: item.title.length > 14 ? item.title.slice(0, 14) + "..." : item.title,
      fullName: item.title,
      score: item.percentage,
      date: item.submittedAt,
    }));

    // Weak items (< 70%)
    const weakItems = detailedList.filter((i) => i.percentage < 70);

    return res.json({
      success: true,
      data: {
        summary: {
          overallScorePct: overallPct,
          score10Scale,
          totalEarnedScore: totalEarned,
          totalMaxScore: totalMax,
          gradedCount,
          reviewPriorityCount,
          progressPct: learningProgressPct,
          completedCoursesCount,
          totalCoursesCount: activeCoursesCount,
          tierLabel: gradedCount === 0
            ? "Chưa có dữ liệu"
            : overallPct >= 85
              ? "Xuất sắc"
              : overallPct >= 70
                ? "Khá"
                : overallPct >= 50
                  ? "Trung bình"
                  : "Cần cải thiện & Luyện tập thêm",
        },
        distribution,
        trend,
        weakItems,
        detailedSubmissions: detailedList,
      },
    });
  } catch (error) {
    console.error("Student analytics error:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy dữ liệu kết quả học tập" });
  } finally {
    db.release();
  }
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
router.get("/gradebook", requirePermission("lms.student.view"), handler(async (req, res, db, classId) => {
  const { book, final } = await getScopedBook(req, db, classId);
  const capabilities = await gradebookCapabilities(db, classId, req.user);
  const history = await db.query(`SELECT f.id, f.finalized_at, f.reopened_at, f.reopen_reason, u.username AS finalized_by_name
    FROM gradebook_finalizations f LEFT JOIN users u ON u.id=f.finalized_by WHERE class_id=$1 ORDER BY f.id DESC LIMIT 20`, [classId]);
  const lastReport = (await db.query(`SELECT cgr.id, cgr.created_at, cgr.updated_at, cgr.student_count, cgr.average_score, cgr.pass_rate,
      COALESCE(u.username, u.email) AS reported_by_name
    FROM class_gradebook_reports cgr
    LEFT JOIN users u ON u.id = cgr.reported_by
    WHERE cgr.class_id = $1 ORDER BY cgr.id DESC LIMIT 1`, [classId])).rows[0] || null;
  await db.query("COMMIT");
  res.json({ success: true, data: { ...book, finalization: final ? { id: final.id, finalizedAt: final.finalized_at } : null, history: history.rows, capabilities, lastReport } });
}));
router.post("/gradebook/report-to-admin", requirePermission("lms.student.view"), handler(async (req, res, db, classId) => {
  const snapshot = await buildGradebook(db, classId);
  const studentCount = snapshot.rows.length;
  const validScores = snapshot.rows.map((r) => r.total).filter((t) => t !== null && t !== undefined).map(Number);
  const averageScore = validScores.length ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100 : null;
  const passCount = snapshot.rows.filter((r) => r.passed === true).length;
  const failCount = snapshot.rows.filter((r) => r.passed === false).length;
  const passRate = studentCount > 0 ? Math.round((passCount / studentCount) * 10000) / 100 : 0;
  const notes = req.body.notes ? String(req.body.notes).slice(0, 1000) : null;

  const result = await db.query(
    `INSERT INTO class_gradebook_reports (
      class_id, course_id, reported_by, snapshot,
      student_count, average_score, pass_count, fail_count, pass_rate, notes, updated_at
    ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING id, created_at, updated_at`,
    [classId, snapshot.classInfo?.course_id || null, req.user.id, JSON.stringify(snapshot), studentCount, averageScore, passCount, failCount, passRate, notes]
  );
  const reportRow = result.rows[0];

  await recordAuditEvent({
    db,
    actorId: req.user.id,
    action: "gradebook.reported_to_admin",
    entityType: "live_class",
    entityId: classId,
    afterState: { reportId: reportRow.id, studentCount, averageScore, passCount, failCount, passRate },
  });

  const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND id <> $1", [req.user.id]);
  const classTitle = snapshot.classInfo?.title || `Lớp #${classId}`;
  for (const admin of admins.rows) {
    await notifyWorkflow(db, {
      userId: admin.id,
      title: "Báo cáo điểm số lớp học mới",
      message: `${classTitle}: Giáo viên đã cập nhật bảng điểm ${studentCount} học viên (Điểm TB: ${averageScore ?? "—"}, Đạt: ${passCount}/${studentCount}).`,
      link: "/admin/grades-report",
      key: `gradebook-reported:${classId}:${reportRow.id}:${admin.id}`,
      actorId: req.user.id,
    });
  }

  await db.query("COMMIT");
  res.json({
    success: true,
    message: "Đã cập nhật điểm và gửi báo cáo về Admin thành công!",
    data: {
      ...snapshot,
      lastReport: {
        id: reportRow.id,
        created_at: reportRow.created_at,
        updated_at: reportRow.updated_at,
        student_count: studentCount,
        average_score: averageScore,
        pass_rate: passRate,
        reported_by_name: req.user.username || req.user.email,
      },
    },
  });
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
    JOIN live_classes pending_class ON pending_class.id=$1
    WHERE (a.live_class_id=$1 OR (a.live_class_id IS NULL AND a.course_id=pending_class.course_id))
      AND EXISTS (SELECT 1 FROM class_enrollments pending_enrollment
        WHERE pending_enrollment.live_class_id=$1 AND pending_enrollment.user_id=s.user_id
          AND pending_enrollment.status='active')
      AND (s.status <> 'graded' OR s.return_requested)
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
