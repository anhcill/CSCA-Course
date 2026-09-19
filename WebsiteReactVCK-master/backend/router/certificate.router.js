import crypto from "crypto";
import express from "express";
import { getClient, query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";

const router = express.Router();
const ISSUER = "Hệ Thống Đào Tạo Tiếng Trung CSCA MoliStudio";

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

const conflict = (res, message, details) => res.status(409).json({
  success: false,
  message,
  errorCode: "CERTIFICATE_NOT_ELIGIBLE",
  ...(details ? { data: details } : {}),
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

const certificateFields = (row, req) => ({
  id: row.id,
  certificate_code: row.certificate_code,
  course_id: row.course_id,
  course_title: row.course_title,
  student_name: row.student_name,
  issue_date: row.issue_date,
  pdf_url: row.pdf_url || null,
  certificateCode: row.certificate_code,
  studentName: row.student_name,
  courseTitle: row.course_title,
  issueDate: row.issue_date,
  issuer: ISSUER,
  verifyUrl: `${req.protocol}://${req.get("host")}/verify/${encodeURIComponent(row.certificate_code)}`,
});

const getCertificate = async (certificateId, db = { query }) => {
  const result = await db.query(
    `SELECT cert.id, cert.certificate_code, cert.course_id, cert.issue_date, cert.pdf_url,
            COALESCE(c.title, c.name) AS course_title,
            COALESCE(sp.full_name, u.username) AS student_name
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     JOIN users u ON u.id = cert.user_id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE cert.id = $1`,
    [certificateId],
  );
  return result.rows[0] || null;
};

const getEligibility = async (courseId, userId, db = { query }) => {
  // Keep these sequential because a transaction client serializes queries;
  // parallel Promise.all calls on one pg client trigger a pg@9 deprecation.
  const lessonsResult = await db.query(
    `SELECT COUNT(*) FILTER (WHERE l.is_published)::int AS lessons_total,
            COUNT(*) FILTER (WHERE l.is_published AND lp.is_completed)::int AS lessons_completed
     FROM lessons l
     LEFT JOIN lesson_progress lp
       ON lp.lesson_id = l.id AND lp.user_id = $2
     WHERE l.course_id = $1`,
    [courseId, userId],
  );
  const quizzesResult = await db.query(
    `WITH course_quizzes AS (
      SELECT q.id, q.passing_score
      FROM quizzes q
      LEFT JOIN lessons l ON l.id = q.lesson_id
      WHERE COALESCE(q.course_id, l.course_id) = $1
    )
    SELECT COUNT(*)::int AS quizzes_total,
           COUNT(*) FILTER (
             WHERE qa.status = 'submitted'
               AND COALESCE(qa.max_score, 0) > 0
               AND (qa.score / qa.max_score * 100) >= cq.passing_score
           )::int AS quizzes_passed
    FROM course_quizzes cq
    LEFT JOIN quiz_attempts qa
      ON qa.quiz_id = cq.id AND qa.user_id = $2`,
    [courseId, userId],
  );
  const assignmentsResult = await db.query(
    `SELECT COUNT(DISTINCT a.id)::int AS assignments_total,
            COUNT(DISTINCT a.id) FILTER (WHERE sg.submission_id IS NOT NULL)::int AS assignments_graded
     FROM assignments a
     LEFT JOIN assignment_submissions s
       ON s.assignment_id = a.id AND s.user_id = $2
     LEFT JOIN LATERAL (
       SELECT sg.submission_id
       FROM submission_grades sg
       WHERE sg.submission_id = s.id
       ORDER BY sg.graded_at DESC, sg.id DESC
       LIMIT 1
     ) sg ON true
     WHERE a.course_id = $1`,
    [courseId, userId],
  );

  const lessons = lessonsResult.rows[0] || {};
  const quizzes = quizzesResult.rows[0] || {};
  const assignments = assignmentsResult.rows[0] || {};
  return {
    lessonsTotal: Number(lessons.lessons_total || 0),
    lessonsCompleted: Number(lessons.lessons_completed || 0),
    quizzesTotal: Number(quizzes.quizzes_total || 0),
    quizzesPassed: Number(quizzes.quizzes_passed || 0),
    assignmentsTotal: Number(assignments.assignments_total || 0),
    assignmentsGraded: Number(assignments.assignments_graded || 0),
  };
};

const isEligible = (eligibility) => (
  eligibility.lessonsTotal > 0
  && eligibility.lessonsCompleted >= eligibility.lessonsTotal
  && eligibility.quizzesPassed >= eligibility.quizzesTotal
  && eligibility.assignmentsGraded >= eligibility.assignmentsTotal
);

const buildCertificateCode = (course, userId) => {
  const courseKey = String(course.slug || course.id)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
    .toUpperCase() || `COURSE-${course.id}`;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const entropy = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CERT-${courseKey}-${stamp}-${String(userId)}-${entropy}`.slice(0, 100);
};

// GET /api/certificates/my-certificates — only certificates owned by the session user.
router.get("/my-certificates", protectRoute, async (req, res) => {
  try {
    const result = await query(
      `SELECT cert.id, cert.certificate_code, cert.course_id, cert.issue_date, cert.pdf_url,
              COALESCE(c.title, c.name) AS course_title,
              COALESCE(sp.full_name, u.username) AS student_name
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       JOIN users u ON u.id = cert.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE cert.user_id = $1
       ORDER BY cert.issue_date DESC, cert.id DESC`,
      [req.user.id],
    );
    return res.json({
      success: true,
      data: result.rows.map((row) => certificateFields(row, req)),
    });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    return internalError(res, "Lỗi khi lấy chứng chỉ");
  }
});

// GET /api/certificates/eligibility/:courseId — private preflight for a learner.
router.get("/eligibility/:courseId", protectRoute, requireRole("user"), async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    const courseResult = await query("SELECT id FROM courses WHERE id = $1", [courseId]);
    if (!courseResult.rows[0]) return notFound(res, "Không tìm thấy khóa học");
    const enrollment = await query(
      "SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'",
      [req.user.id, courseId],
    );
    if (!enrollment.rows[0]) return forbidden(res, "Bạn chưa đăng ký khóa học này");
    const eligibility = await getEligibility(courseId, req.user.id);
    return res.json({ success: true, data: { eligible: isEligible(eligibility), ...eligibility } });
  } catch (error) {
    console.error("Error checking certificate eligibility:", error);
    return internalError(res, "Lỗi khi kiểm tra điều kiện cấp chứng chỉ");
  }
});

// POST /api/certificates/:courseId/claim — issue exactly one certificate per learner/course.
router.post("/:courseId/claim", protectRoute, requireRole("user"), async (req, res) => {
  const client = await getClient();
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    await client.query("BEGIN");

    const courseResult = await client.query(
      "SELECT id, slug, title, name FROM courses WHERE id = $1 FOR SHARE",
      [courseId],
    );
    const course = courseResult.rows[0];
    if (!course) {
      await client.query("ROLLBACK");
      return notFound(res, "Không tìm thấy khóa học");
    }
    const enrollment = await client.query(
      "SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'",
      [req.user.id, courseId],
    );
    if (!enrollment.rows[0]) {
      await client.query("ROLLBACK");
      return forbidden(res, "Bạn chưa đăng ký khóa học này");
    }

    const eligibility = await getEligibility(courseId, req.user.id, client);
    if (!isEligible(eligibility)) {
      await client.query("ROLLBACK");
      return conflict(res, "Bạn chưa đủ điều kiện nhận chứng chỉ", eligibility);
    }

    const certificateCode = buildCertificateCode(course, req.user.id);
    const insertResult = await client.query(
      `INSERT INTO certificates (certificate_code, user_id, course_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, course_id) DO NOTHING
       RETURNING id`,
      [certificateCode, req.user.id, courseId],
    );
    const certificateId = insertResult.rows[0]?.id;
    const certificate = certificateId
      ? await getCertificate(certificateId, client)
      : (await client.query(
        `SELECT cert.id, cert.certificate_code, cert.course_id, cert.issue_date, cert.pdf_url,
                COALESCE(c.title, c.name) AS course_title,
                COALESCE(sp.full_name, u.username) AS student_name
         FROM certificates cert
         JOIN courses c ON c.id = cert.course_id
         JOIN users u ON u.id = cert.user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE cert.user_id = $1 AND cert.course_id = $2`,
        [req.user.id, courseId],
      )).rows[0];
    if (!certificate) throw new Error("Không thể tạo chứng chỉ");

    if (certificateId) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, type, link_url, dedupe_key)
         VALUES ($1, $2, $3, 'certificate', $4, $5)
         ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [req.user.id, "Bạn đã nhận chứng chỉ", `Chứng chỉ khóa “${course.title || course.name}” đã được cấp.`, "/lms/certificates", `certificate:${certificate.id}`],
      );
    }
    await client.query("COMMIT");
    return res.status(certificateId ? 201 : 200).json({
      success: true,
      data: { ...certificateFields(certificate, req), alreadyIssued: !certificateId },
      message: certificateId ? "Cấp chứng chỉ thành công" : "Chứng chỉ đã được cấp trước đó",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error claiming certificate:", error);
    if (error.code === "23505") return conflict(res, "Chứng chỉ đã tồn tại cho khóa học này");
    return internalError(res, "Lỗi khi cấp chứng chỉ");
  } finally {
    client.release();
  }
});

// GET /api/certificates/verify/:code — public and intentionally minimal.
router.get("/verify/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{6,100}$/.test(code)) return notFound(res, "Mã chứng chỉ không hợp lệ");
    const result = await query(
      `SELECT cert.id, cert.certificate_code, cert.course_id, cert.issue_date, cert.pdf_url,
              COALESCE(c.title, c.name) AS course_title,
              COALESCE(sp.full_name, u.username) AS student_name
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       JOIN users u ON u.id = cert.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE UPPER(cert.certificate_code) = $1`,
      [code],
    );
    if (!result.rows[0]) return notFound(res, "Không tìm thấy chứng chỉ");
    const certificate = certificateFields(result.rows[0], req);
    return res.json({
      success: true,
      data: {
        certificateCode: certificate.certificateCode,
        studentName: certificate.studentName,
        courseTitle: certificate.courseTitle,
        issueDate: certificate.issueDate,
        issuer: certificate.issuer,
        verifyUrl: certificate.verifyUrl,
        valid: true,
      },
    });
  } catch (error) {
    console.error("Error verifying certificate:", error);
    return internalError(res, "Lỗi khi tra cứu chứng chỉ");
  }
});

export default router;
