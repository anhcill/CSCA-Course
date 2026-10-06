import { aggregateQuizAttempts, calculateGradebookTotal, DEFAULT_GRADEBOOK_POLICY } from "./lmsWorkflowPolicy.service.js";

export const buildGradebook = async (db, classId, sessionId = null) => {
  const classInfo = (await db.query("SELECT lc.id, lc.title, lc.course_id, COALESCE(c.title, c.name) AS course_title FROM live_classes lc LEFT JOIN courses c ON c.id = lc.course_id WHERE lc.id = $1", [classId])).rows[0];
  const stored = (await db.query("SELECT policy FROM class_gradebook_policies WHERE class_id = $1", [classId])).rows[0];
  const policy = stored?.policy || DEFAULT_GRADEBOOK_POLICY;
  const students = (await db.query(`SELECT u.id, COALESCE(u.username, u.email) AS name, u.email FROM class_enrollments ce
    JOIN users u ON u.id = ce.user_id WHERE ce.live_class_id = $1 AND ce.status = 'active' ORDER BY LOWER(COALESCE(u.username,u.email)),u.id`, [classId])).rows;
  const sessions = (await db.query(`SELECT id FROM class_sessions WHERE live_class_id = $1 AND status <> 'cancelled'
    AND end_time <= NOW() AND ($2::bigint IS NULL OR id = $2)`, [classId, sessionId])).rows;
  const activities = (await db.query(
    `SELECT CONCAT('assignment-', id) AS id, title, 'assignment' AS type, max_score FROM assignments
      WHERE live_class_id = $1 AND ($2::bigint IS NULL OR class_session_id = $2)
     UNION ALL
     SELECT CONCAT('quiz-', q.id), q.title, 'quiz', (SELECT COALESCE(SUM(points),0) FROM quiz_questions WHERE quiz_id = q.id)
      FROM quizzes q WHERE q.live_class_id = $1 AND q.status = 'PUBLISHED' AND ($2::bigint IS NULL OR q.class_session_id = $2)
     ORDER BY type, title`, [classId, sessionId],
  )).rows;
  const assignments = (await db.query(
    `SELECT s.user_id, CONCAT('assignment-',a.id) AS activity_id, s.status, s.return_requested, g.score, a.max_score
     FROM assignments a JOIN assignment_submissions s ON s.assignment_id = a.id
     LEFT JOIN LATERAL (SELECT score FROM submission_grades WHERE submission_id=s.id AND submission_revision=s.revision ORDER BY graded_at DESC,id DESC LIMIT 1) g ON true
     WHERE a.live_class_id=$1 AND ($2::bigint IS NULL OR a.class_session_id=$2)`, [classId, sessionId],
  )).rows;
  const quizzes = (await db.query(
    `SELECT qa.*, CONCAT('quiz-', q.id) AS activity_id FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id
     WHERE q.live_class_id=$1 AND q.status='PUBLISHED' AND qa.status='submitted' AND ($2::bigint IS NULL OR q.class_session_id=$2)`, [classId, sessionId],
  )).rows;
  const attendance = (await db.query(
    `SELECT ca.* FROM class_attendance ca JOIN class_sessions cs ON cs.id=ca.session_id
     WHERE cs.live_class_id=$1 AND cs.status <> 'cancelled' AND cs.end_time<=NOW() AND ($2::bigint IS NULL OR cs.id=$2)`, [classId, sessionId],
  )).rows;
  const grades = new Map(assignments.map((r) => [`${r.user_id}:${r.activity_id}`, r]));
  const attempts = new Map();
  for (const row of quizzes) {
    const key = `${row.user_id}:${row.activity_id}`;
    attempts.set(key, [...(attempts.get(key) || []), row]);
  }
  const attendanceMap = new Map(attendance.map((r) => [`${r.user_id}:${r.session_id}`, r.status]));
  const rows = students.map((student) => {
    const categories = { assignment: [], quiz: [], attendance: [] };
    const cells = activities.map((activity) => {
      const key = `${student.id}:${activity.id}`;
      const grade = grades.get(key);
      const value = activity.type === "quiz" ? aggregateQuizAttempts(attempts.get(key) || [], policy.quizStrategy)
        : grade?.score !== null && grade?.score !== undefined && Number(grade.max_score) > 0 ? Number(grade.score) / Number(grade.max_score) * 100 : null;
      const state = grade?.return_requested ? "Chờ nộp lại" : value !== null ? "Đã chấm" : grade ? "Chờ chấm" : "Chưa nộp";
      categories[activity.type].push(value);
      return { activityId: activity.id, value: value === null ? null : Math.round(value * 100) / 100, state };
    });
    let present = 0, excused = 0, unrecorded = 0;
    for (const session of sessions) {
      const status = attendanceMap.get(`${student.id}:${session.id}`);
      if (status === "excused") { excused++; continue; }
      if (status === "present") present++;
      if (!status) unrecorded++;
      categories.attendance.push(status === "present" ? 100 : status === "absent" ? 0 : null);
    }
    const recorded = categories.attendance.filter((value) => value !== null);
    const attendancePercent = recorded.length ? present / recorded.length * 100 : null;
    return { ...student, cells, present, excused, unrecorded, attendancePercent, ...calculateGradebookTotal(categories, policy) };
  });
  return { classInfo, sessionId, policy, activities, rows, generatedAt: new Date().toISOString() };
};

export const gradebookTable = (book) => [
  ["Khóa học", "Lớp", "Học viên", "Email", "Chuyên cần (%)", "Buổi chưa điểm danh", ...book.activities.map((a) => `${a.title} (%)`), "Tổng điểm (%)", "Kết quả"],
  ...book.rows.map((row) => [book.classInfo.course_title || "", book.classInfo.title, row.name, row.email,
    row.attendancePercent === null ? "Chưa có điểm danh" : Math.round(row.attendancePercent * 100) / 100, row.unrecorded,
    ...row.cells.map((cell) => cell.value === null ? cell.state : cell.value),
    row.total ?? "Chưa có điểm", row.passed === null ? "Chưa xác định" : row.passed ? "Đạt" : "Chưa đạt"]),
];
