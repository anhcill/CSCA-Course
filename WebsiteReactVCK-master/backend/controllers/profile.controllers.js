import { query } from "../db/connect.js";

export const getProfileDashboard = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.course_id, p.progress_pct, p.completed_lessons, p.last_lesson_id,
              p.started_at, p.updated_at, c.name AS course_name, c.slug AS course_slug,
              c.image_url AS course_image_url, c.total_lessons,
              l.name AS last_lesson_name
       FROM progress p
       JOIN courses c ON c.id = p.course_id
       LEFT JOIN lessons l ON l.id = p.last_lesson_id
       WHERE p.user_id = $1
       ORDER BY (p.progress_pct = 100), p.updated_at DESC`,
      [req.user.id]
    );

    const learningProgress = rows.map((row) => ({
      courseId: row.course_id,
      courseName: row.course_name,
      courseSlug: row.course_slug,
      courseImageUrl: row.course_image_url,
      progressPct: Number(row.progress_pct) || 0,
      completedLessons: row.completed_lessons?.length || 0,
      totalLessons: row.total_lessons || 0,
      lastLessonId: row.last_lesson_id,
      lastLessonName: row.last_lesson_name,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
    }));

    const coursesCompleted = rows.filter((row) => Number(row.progress_pct) === 100).length;
    const lessonsCompleted = rows.reduce(
      (total, row) => total + (row.completed_lessons?.length || 0),
      0
    );
    const averageProgressPct = rows.length
      ? Math.round(rows.reduce((total, row) => total + (Number(row.progress_pct) || 0), 0) / rows.length)
      : 0;

    const certificates = rows
      .filter((row) => Number(row.progress_pct) === 100)
      .map((row) => ({
        courseId: row.course_id,
        courseName: row.course_name,
        courseSlug: row.course_slug,
        completedAt: row.updated_at,
      }));

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          coursesStarted: rows.length,
          coursesCompleted,
          lessonsCompleted,
          averageProgressPct,
        },
        learningProgress,
        certificates,
      },
    });
  } catch (error) {
    console.error("Get profile dashboard error:", error);
    return res.status(500).json({ success: false, message: "Không thể tải dữ liệu học tập" });
  }
};
