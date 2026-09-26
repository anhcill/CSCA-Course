import express from "express";
import { query } from "../db/connect.js";
import protectRoute from "../middleware/protectRoute.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requireRole from "../middleware/requireRole.js";

const router = express.Router();

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

const internalError = (res, message) => res.status(500).json({
  success: false,
  message,
  errorCode: "INTERNAL_ERROR",
});

const parsePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeSlug = (value) => value
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 300);

const parseLearningUrl = (value) => {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string") return { error: "Link học không hợp lệ" };

  const candidate = value.trim();
  if (!candidate) return { value: null };
  if (candidate.length > 2_000) return { error: "Link học không được dài quá 2.000 ký tự" };

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return { error: "Link học phải là URL HTTPS hợp lệ" };
    }
    return { value: parsed.toString() };
  } catch {
    return { error: "Link học phải là URL HTTPS hợp lệ" };
  }
};

const COURSE_FIELDS = `
  c.id, c.name, COALESCE(c.title, c.name) AS title, c.slug, c.description,
  c.category, c.level, COALESCE(c.price, 0) AS price,
  COALESCE(c.is_free, true) AS is_free, c.is_published,
  COALESCE(c.thumbnail_url, c.image_url) AS thumbnail_url,
  c.total_lessons, c.ratings_count, c.ratings_avg, c.enrolled_count,
  c.author_id, c.created_at, c.updated_at,
  u.username AS instructor_name, u.avatar_url AS instructor_avatar_url`;

const checkCourseOwner = async (courseId, user) => {
  const result = await query("SELECT author_id FROM courses WHERE id = $1", [courseId]);
  if (result.rows.length === 0) return { status: 404 };
  if (user.role !== "admin" && String(result.rows[0].author_id) !== String(user.id)) return { status: 403 };
  return { status: 200 };
};

const checkEnrollment = async (courseId, userId) => {
  const result = await query(
    `SELECT 1
     FROM courses c
     WHERE c.id = $2
       AND (
         EXISTS (
           SELECT 1 FROM lms_access_grants g
           WHERE g.user_id = $1 AND g.course_id = c.id
             AND g.access_status = 'active' AND g.valid_from <= NOW()
             AND (g.valid_until IS NULL OR g.valid_until > NOW())
         )
         OR (
           COALESCE(c.is_management_managed, FALSE) = FALSE
           AND (
             EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = $1 AND e.course_id = c.id AND e.status = 'active')
             OR EXISTS (
               SELECT 1 FROM class_enrollments ce
               JOIN live_classes lc ON lc.id = ce.live_class_id
               WHERE ce.user_id = $1 AND lc.course_id = c.id
                 AND ce.status = 'active' AND lc.status = 'active'
             )
           )
         )
       )`,
      [userId, courseId],
  );
  return result.rows.length > 0;
};

// GET /api/courses - Public Catalog with filters
router.get("/", async (req, res) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const level = typeof req.query.level === "string" ? req.query.level.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search.length > 100) return validationError(res, "Từ khóa tìm kiếm quá dài");
    const sort = req.query.sort || "newest";
    const sortSql = {
      newest: "c.created_at DESC",
      popular: "c.enrolled_count DESC NULLS LAST, c.created_at DESC",
      rating: "c.ratings_avg DESC NULLS LAST, c.ratings_count DESC NULLS LAST, c.created_at DESC",
    }[sort] || "c.created_at DESC";
    let sql = `
      SELECT ${COURSE_FIELDS}
      FROM courses c
      LEFT JOIN users u ON u.id = c.author_id
      WHERE c.is_published = true`;
    const params = [];

    if (category && category !== "ALL") {
      params.push(category);
      sql += ` AND c.category = $${params.length}`;
    }
    if (level && level !== "ALL") {
      params.push(level);
      sql += ` AND c.level = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (COALESCE(c.title, c.name) ILIKE $${params.length} OR c.description ILIKE $${params.length})`;
    }

    sql += ` ORDER BY ${sortSql}, c.id DESC LIMIT 100`;
    const result = await query(sql, params);
    const publicCourses = result.rows.map(({ author_id: _authorId, ...course }) => course);

    return res.json({
      success: true,
      data: publicCourses,
    });
  } catch (error) {
    console.error("Error fetching courses catalog:", error);
    return internalError(res, "Lỗi khi lấy danh sách khóa học");
  }
});

// GET /api/courses/admin - Teacher/Admin catalog, including drafts
router.get("/admin", protectRoute, requireTeacher, async (req, res) => {
  try {
    const params = [];
    let ownerClause = "";
    if (req.user.role !== "admin") {
      params.push(req.user.id);
      ownerClause = ` AND (
        c.author_id = $${params.length}
        OR EXISTS (
          SELECT 1 FROM live_classes lc
          WHERE lc.course_id = c.id AND lc.instructor_id = $${params.length} AND lc.status = 'active'
        )
      )`;
    }

    const result = await query(
      `SELECT ${COURSE_FIELDS}
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE true${ownerClause}
       ORDER BY c.updated_at DESC, c.created_at DESC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching teacher course catalog:", error);
    return internalError(res, "Lỗi khi lấy danh sách khóa học quản trị");
  }
});

// GET /api/courses/admin/:courseId - Teacher/Admin curriculum detail, including drafts
router.get("/admin/:courseId", protectRoute, requireTeacher, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    const ownership = await checkCourseOwner(courseId, req.user);
    if (ownership.status === 404) return notFound(res, "Không tìm thấy khóa học");
    if (ownership.status === 403) return forbidden(res, "Bạn không có quyền xem curriculum này");

    const courseRes = await query(
      `SELECT ${COURSE_FIELDS}
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = $1`,
      [courseId],
    );
    if (courseRes.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");
    const [sectionsRes, lessonsRes] = await Promise.all([
      query(
        "SELECT id, course_id, title, sort_order FROM sections WHERE course_id = $1 ORDER BY sort_order ASC, id ASC",
        [courseId],
      ),
      query(
        `SELECT l.id, l.course_id, l.section_id, COALESCE(l.title, l.name) AS title, l.description,
                COALESCE(l.duration_seconds, l.video_duration_seconds, 0) AS duration_seconds,
                l.is_preview, l.is_published, l.sort_order, l.learning_url, (va.id IS NOT NULL) AS has_video
         FROM lessons l
         LEFT JOIN video_assets va ON va.id = l.video_asset_id AND va.status = 'ready'
         WHERE l.course_id = $1 ORDER BY l.sort_order ASC, l.id ASC`,
        [courseId],
      ),
    ]);

    return res.json({
      success: true,
      data: {
        course: { ...courseRes.rows[0], author_id: undefined },
        sections: sectionsRes.rows,
        lessons: lessonsRes.rows,
      },
    });
  } catch (error) {
    console.error("Error fetching curriculum detail:", error);
    return internalError(res, "Lỗi khi lấy curriculum khóa học");
  }
});

// GET /api/courses/lessons/:lessonId/comments - Published lessons only, bounded payload.
router.get("/lessons/:lessonId/comments", async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!parsePositiveId(lessonId)) return validationError(res, "lessonId không hợp lệ");

    const result = await query(
      `SELECT c.id, c.user_id, c.course_id, c.lesson_id, c.parent_id, c.content, c.is_edited, c.created_at, c.updated_at,
              u.username, u.avatar_url, u.avatar_url AS profile_pic
       FROM comments c
       JOIN users u ON c.user_id = u.id
       JOIN lessons l ON l.id = c.lesson_id AND l.is_published = true
       JOIN courses co ON co.id = l.course_id AND co.is_published = true
       WHERE c.lesson_id = $1
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT 500`,
      [lessonId]
    );

    const rows = result.rows;
    const commentMap = {};
    const rootComments = [];

    // Map all comments and add empty replies array
    rows.forEach(row => {
      commentMap[row.id] = { ...row, replies: [] };
    });

    // Nest replies under parent comments
    rows.forEach(row => {
      const comment = commentMap[row.id];
      if (row.parent_id) {
        const parent = commentMap[row.parent_id];
        if (parent) {
          parent.replies.push(comment);
        } else {
          rootComments.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    return res.json({
      success: true,
      data: rootComments
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách bình luận" });
  }
});

// POST /api/courses/lessons/:lessonId/comments - Create comment (requires auth)
router.post("/lessons/:lessonId/comments", protectRoute, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;
    const { content, parentId } = req.body;
    const parsedLessonId = parsePositiveId(lessonId);
    const parsedParentId = parentId === undefined || parentId === null || parentId === ""
      ? null
      : parsePositiveId(parentId);

    if (!parsedLessonId || typeof content !== "string" || !content.trim()) {
      return validationError(res, "Nội dung bình luận không được trống");
    }
    if (content.length > 5000 || (parentId !== undefined && parentId !== null && parentId !== "" && !parsedParentId)) {
      return validationError(res, "Nội dung bình luận quá dài");
    }

    // Find course_id from lessonId
    const lessonRes = await query(
      `SELECT l.course_id, l.is_published, c.is_published AS course_is_published, c.author_id
       FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1`,
      [parsedLessonId],
    );
    if (lessonRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bài học" });
    }
    const lesson = lessonRes.rows[0];
    const courseId = lesson.course_id;
    if (req.user.role === "user" && (!lesson.is_published || !lesson.course_is_published)) {
      return notFound(res, "Không tìm thấy bài học");
    }

    if (req.user.role === "user" && !(await checkEnrollment(courseId, userId))) {
      return forbidden(res, "Bạn chưa đăng ký khóa học này");
    }
    if (req.user.role === "creator" && String(lesson.author_id) !== String(req.user.id)) {
      return forbidden(res, "Bạn không có quyền bình luận trong bài học này");
    }

    if (parsedParentId) {
      const parentRes = await query(
        `SELECT id FROM comments
         WHERE id = $1 AND lesson_id = $2 AND course_id = $3`,
        [parsedParentId, parsedLessonId, courseId],
      );
      if (parentRes.rows.length === 0) {
        return notFound(res, "Không tìm thấy bình luận cha trong bài học này");
      }
    }

    const insertRes = await query(
      `INSERT INTO comments (user_id, course_id, lesson_id, parent_id, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, courseId, parsedLessonId, parsedParentId, content.trim()]
    );

    const newCommentId = insertRes.rows[0].id;
    const populatedRes = await query(
      `SELECT c.*, u.username, u.avatar_url, u.avatar_url AS profile_pic
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [newCommentId]
    );

    const newComment = { ...populatedRes.rows[0], replies: [] };

    return res.status(201).json({
      success: true,
      data: newComment
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi gửi bình luận" });
  }
});

// GET /api/courses/:courseId/ratings - Ratings for published courses only.
router.get("/:courseId/ratings", async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!parsePositiveId(courseId)) return validationError(res, "courseId không hợp lệ");

    const result = await query(
      `SELECT r.id, r.user_id, r.rating AS score, r.review_text AS review, r.created_at, r.updated_at,
              u.username, u.avatar_url, u.avatar_url AS profile_pic
       FROM ratings r
       JOIN users u ON r.user_id = u.id
       JOIN courses c ON c.id = r.course_id AND c.is_published = true
       WHERE r.course_id = $1
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 200`,
      [courseId]
    );

    const ratings = result.rows;
    const count = ratings.length;
    let sum = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    ratings.forEach(r => {
      const score = r.score;
      sum += score;
      if (distribution[score] !== undefined) {
        distribution[score]++;
      }
    });

    const avgScore = count > 0 ? Number((sum / count).toFixed(2)) : 0;

    return res.json({
      success: true,
      data: {
        summary: {
          avgScore,
          count,
          distribution
        },
        ratings
      }
    });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách đánh giá" });
  }
});

// POST /api/courses/:courseId/ratings - Learner rating (requires enrollment, upsert).
router.post("/:courseId/ratings", protectRoute, requireRole("user"), async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    const { score, review } = req.body;
    if (!parsePositiveId(courseId)) return validationError(res, "courseId không hợp lệ");
    if (review !== undefined && (typeof review !== "string" || review.length > 5000)) {
      return validationError(res, "Nội dung đánh giá không hợp lệ");
    }

    const numericScore = Number(score);
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
      return validationError(res, "Điểm đánh giá phải là số nguyên từ 1 đến 5");
    }
    const courseResult = await query("SELECT id FROM courses WHERE id = $1", [courseId]);
    if (courseResult.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");
    if (req.user.role === "user" && !(await checkEnrollment(courseId, userId))) {
      return forbidden(res, "Bạn cần đăng ký khóa học trước khi đánh giá");
    }

    const result = await query(
      `INSERT INTO ratings (user_id, course_id, rating, review_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, course_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         review_text = EXCLUDED.review_text,
         updated_at = NOW()
       RETURNING id, user_id, course_id, rating AS score, review_text AS review, created_at, updated_at`,
      [userId, courseId, numericScore, review?.trim() || ""]
    );

    return res.json({
      success: true,
      data: result.rows[0],
      message: "Gửi đánh giá thành công"
    });
  } catch (error) {
    console.error("Error submitting rating:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi gửi đánh giá" });
  }
});

// GET /api/courses/:courseId/workspace - One course-scoped LMS workspace.
// The LMS never grants access here on its own: enrollment/access-grant/class
// membership must already have been provisioned by InternalManagement.
router.get("/:courseId/workspace", protectRoute, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");
    const selectedClassId = req.query.classId === undefined ? null : parsePositiveId(req.query.classId);
    if (req.query.classId !== undefined && !selectedClassId) {
      return validationError(res, "classId không hợp lệ");
    }

    const courseResult = await query(
      `SELECT ${COURSE_FIELDS}
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = $1`,
      [courseId],
    );
    const course = courseResult.rows[0];
    if (!course) return notFound(res, "Không tìm thấy khóa học");

    const isAdmin = req.user.role === "admin";
    const isTeacherOwner = req.user.role === "creator" && String(course.author_id) === String(req.user.id);
    const isLearner = req.user.role === "user";
    const isAssignedTeacher = !isLearner && !isAdmin && req.user.role === "creator" && selectedClassId
      ? (await query(
        `SELECT 1 FROM class_teachers ct
         JOIN live_classes lc ON lc.id = ct.live_class_id
         WHERE ct.teacher_id = $1 AND ct.status = 'active' AND lc.id = $2 AND lc.course_id = $3`,
        [req.user.id, selectedClassId, courseId],
      )).rows.length > 0
      : false;
    if (isLearner && (!course.is_published || !(await checkEnrollment(courseId, req.user.id)))) {
      return forbidden(res, "Bạn chưa được cấp quyền học khóa này");
    }
    if (!isLearner && !isAdmin && !isTeacherOwner && !isAssignedTeacher) {
      return forbidden(res, "Bạn không có quyền xem workspace khóa học này");
    }

    let selectedClass = null;
    if (selectedClassId) {
      const selectedClassParams = [selectedClassId, courseId];
      let selectedClassVisibility = "TRUE";
      if (isLearner) {
        selectedClassParams.push(req.user.id);
        selectedClassVisibility = `EXISTS (
          SELECT 1 FROM class_enrollments ce
          WHERE ce.live_class_id = lc.id AND ce.user_id = $3 AND ce.status = 'active'
        )`;
      } else if (!isAdmin) {
        selectedClassParams.push(req.user.id);
        selectedClassVisibility = `(lc.instructor_id = $3 OR EXISTS (
          SELECT 1 FROM class_teachers ct
          WHERE ct.live_class_id = lc.id AND ct.teacher_id = $3 AND ct.status = 'active'
        ))`;
      }
      const selectedClassResult = await query(
        `SELECT lc.id, lc.title, lc.description, lc.instructor_id, lc.max_students,
                COALESCE(u.username, u.email) AS instructor_name
         FROM live_classes lc
         LEFT JOIN users u ON u.id = lc.instructor_id
         WHERE lc.id = $1 AND lc.course_id = $2 AND lc.status = 'active'
           AND ${selectedClassVisibility}`,
        selectedClassParams,
      );
      selectedClass = selectedClassResult.rows[0] || null;
      if (!selectedClass) return forbidden(res, "Bạn không có quyền vào lớp học này");
    }

    const scopedClassParams = [courseId];
    let scopedClassVisibility = "TRUE";
    if (isLearner) {
      scopedClassParams.push(req.user.id);
      scopedClassVisibility = `EXISTS (
        SELECT 1 FROM class_enrollments ce
        WHERE ce.live_class_id = lc.id AND ce.user_id = $2 AND ce.status = 'active'
      )`;
    } else if (!isAdmin) {
      scopedClassParams.push(req.user.id);
      scopedClassVisibility = `(lc.instructor_id = $2 OR EXISTS (
        SELECT 1 FROM class_teachers ct
        WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active'
      ))`;
    }
    const selectedClassScope = selectedClassId ? ` AND lc.id = $${scopedClassParams.length + 1}` : "";
    if (selectedClassId) scopedClassParams.push(selectedClassId);

    const assignmentParams = [courseId, req.user.id];
    let assignmentVisibility = "TRUE";
    if (isLearner) {
      assignmentVisibility = `(
        a.live_class_id IS NULL OR EXISTS (
          SELECT 1 FROM class_enrollments ce
          WHERE ce.live_class_id = a.live_class_id AND ce.user_id = $2 AND ce.status = 'active'
        )
      )`;
    } else if (!isAdmin) {
      assignmentVisibility = "a.instructor_id = $2";
    }
    const assignmentClassScope = selectedClassId ? ` AND (a.live_class_id IS NULL OR a.live_class_id = $${assignmentParams.length + 1})` : "";
    if (selectedClassId) assignmentParams.push(selectedClassId);

    let quizVisibility = "TRUE";
    if (isLearner) {
      quizVisibility = `q.status = 'PUBLISHED' AND (
        q.live_class_id IS NULL OR (quiz_lc.status = 'active' AND EXISTS (
          SELECT 1 FROM class_enrollments quiz_ce
          WHERE quiz_ce.live_class_id = q.live_class_id AND quiz_ce.user_id = $2 AND quiz_ce.status = 'active'
        ))
      )`;
    } else if (!isAdmin) {
      quizVisibility = "(q.instructor_id = $2 OR course_for_quiz.author_id = $2)";
    }
    const quizClassScope = selectedClassId ? ` AND (q.live_class_id IS NULL OR q.live_class_id = $${assignmentParams.length})` : "";

    const fileParams = [courseId];
    let fileVisibility = "TRUE";
    if (isLearner) {
      fileParams.push(req.user.id);
      fileVisibility = `(
        f.live_class_id IS NULL OR EXISTS (
          SELECT 1 FROM class_enrollments ce
          WHERE ce.live_class_id = f.live_class_id AND ce.user_id = $2 AND ce.status = 'active'
        )
      )`;
    }
    const fileClassScope = selectedClassId ? ` AND (f.live_class_id IS NULL OR f.live_class_id = $${fileParams.length + 1})` : "";
    if (selectedClassId) fileParams.push(selectedClassId);

    const [sectionsResult, progressResult, classesResult, sessionsResult, assignmentsResult, quizRowsResult, quizCountResult, filesResult] = await Promise.all([
      query(
        `SELECT s.id, s.title, s.sort_order,
                COUNT(l.id)::int AS lesson_count,
                COALESCE(SUM(COALESCE(l.duration_seconds, l.video_duration_seconds, 0)), 0)::int AS duration_seconds
         FROM sections s
         LEFT JOIN lessons l ON l.section_id = s.id AND l.is_published = true
         WHERE s.course_id = $1
         GROUP BY s.id
         ORDER BY s.sort_order ASC, s.id ASC`,
        [courseId],
      ),
      query(
        `SELECT COUNT(l.id)::int AS total_lessons,
                COUNT(lp.id) FILTER (WHERE lp.is_completed = true)::int AS completed_lessons
         FROM lessons l
         LEFT JOIN lesson_progress lp
           ON lp.lesson_id = l.id AND lp.course_id = l.course_id AND lp.user_id = $2
         WHERE l.course_id = $1 AND l.is_published = true`,
        [courseId, req.user.id],
      ),
      query(
        `SELECT lc.id, lc.title, lc.description, lc.instructor_id, lc.max_students,
                COALESCE(u.username, u.email) AS instructor_name,
                COUNT(ce.id) FILTER (WHERE ce.status = 'active')::int AS enrolled_count
         FROM live_classes lc
         LEFT JOIN users u ON u.id = lc.instructor_id
         LEFT JOIN class_enrollments ce ON ce.live_class_id = lc.id
         WHERE lc.course_id = $1 AND lc.status = 'active' AND ${scopedClassVisibility}${selectedClassScope}
         GROUP BY lc.id, u.username, u.email
         ORDER BY lc.created_at DESC, lc.id DESC`,
        scopedClassParams,
      ),
      query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
                lc.title AS class_title,
                CASE WHEN LOWER(cs.meet_url) LIKE '%zoom.us%' THEN 'Zoom'
                     WHEN cs.meet_url IS NOT NULL THEN 'Google Meet' ELSE NULL END AS provider
         FROM class_sessions cs
         JOIN live_classes lc ON lc.id = cs.live_class_id
         WHERE lc.course_id = $1 AND lc.status = 'active' AND cs.status <> 'cancelled'
           AND cs.end_time >= NOW() - INTERVAL '2 hours'
           AND ${scopedClassVisibility}${selectedClassScope}
         ORDER BY cs.start_time ASC
         LIMIT 8`,
        scopedClassParams,
      ),
      query(
        `SELECT a.id, a.title, a.assignment_type AS type, a.course_id, a.live_class_id, a.class_session_id,
                a.description, a.max_score, a.due_date, a.created_at,
                lc.title AS class_title, assignment_session.title AS session_title,
                assignment_session.start_time AS session_start, assignment_session.end_time AS session_end,
                s.id AS submission_id, s.status AS submission_status, s.submitted_at,
                grade.score, grade.feedback_text, grade.graded_at,
                CASE WHEN grade.score IS NOT NULL THEN 'graded'
                     WHEN s.id IS NOT NULL THEN s.status
                     WHEN a.due_date IS NOT NULL AND a.due_date < NOW() THEN 'late'
                     ELSE 'todo' END AS status
         FROM assignments a
         LEFT JOIN live_classes lc ON lc.id = a.live_class_id
         LEFT JOIN class_sessions assignment_session ON assignment_session.id = a.class_session_id
         LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $2
         LEFT JOIN LATERAL (
           SELECT score, feedback_text, graded_at
           FROM submission_grades
           WHERE submission_id = s.id
           ORDER BY graded_at DESC, id DESC
           LIMIT 1
         ) grade ON TRUE
         WHERE COALESCE(a.course_id, lc.course_id) = $1 AND ${assignmentVisibility}${assignmentClassScope}
         ORDER BY COALESCE(a.due_date, '9999-12-31'::timestamptz), a.created_at DESC
         LIMIT 8`,
        assignmentParams,
      ),
      query(
        `SELECT q.id, q.title, 'quiz' AS type, q.course_id, q.live_class_id, q.class_session_id, q.activity_scope,
                q.description, (SELECT COALESCE(SUM(qq.points), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS max_score,
                q.due_date, q.created_at,
                quiz_lc.title AS class_title, quiz_session.title AS session_title,
                quiz_session.start_time AS session_start, quiz_session.end_time AS session_end,
                qa.id AS submission_id, qa.status AS submission_status, qa.submitted_at,
                qa.score, NULL::text AS feedback_text, qa.submitted_at AS graded_at,
                CASE WHEN qa.status = 'submitted' THEN 'graded'
                     WHEN q.activity_scope = 'homework' AND q.due_date IS NOT NULL AND q.due_date < NOW() THEN 'late'
                     ELSE 'todo' END AS status
         FROM quizzes q
         JOIN courses course_for_quiz ON course_for_quiz.id = q.course_id
         LEFT JOIN live_classes quiz_lc ON quiz_lc.id = q.live_class_id
         LEFT JOIN class_sessions quiz_session ON quiz_session.id = q.class_session_id
         LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = $2
         WHERE q.course_id = $1 AND ${quizVisibility}${quizClassScope}
         ORDER BY CASE WHEN q.activity_scope = 'homework' THEN 0 WHEN quiz_session.start_time >= NOW() THEN 1 WHEN quiz_session.start_time IS NULL THEN 2 ELSE 3 END,
                  COALESCE(q.due_date, quiz_session.start_time) ASC NULLS LAST, q.created_at DESC
         LIMIT 8`,
        assignmentParams,
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM quizzes q
         LEFT JOIN lessons l ON l.id = q.lesson_id
         WHERE COALESCE(q.course_id, l.course_id) = $1
           AND COALESCE(q.status, 'PUBLISHED') = 'PUBLISHED'`,
        [courseId],
      ),
      query(
        `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at,
                f.visibility, COALESCE(u.username, u.email, 'Giáo viên') AS uploaded_by
         FROM lms_learning_files f
         LEFT JOIN live_classes lc ON lc.id = f.live_class_id
         LEFT JOIN users u ON u.id = f.uploaded_by
         WHERE f.status = 'ready' AND COALESCE(f.course_id, lc.course_id) = $1
           AND ${fileVisibility}${fileClassScope}
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT 8`,
        fileParams,
      ),
    ]);

    const progress = progressResult.rows[0] || { total_lessons: 0, completed_lessons: 0 };
    const taskRows = [...assignmentsResult.rows, ...quizRowsResult.rows]
      .sort((left, right) => {
        const priority = (row) => row.session_start && new Date(row.session_start).getTime() >= Date.now() ? 0 : row.session_start ? 2 : 1;
        const priorityDelta = priority(left) - priority(right);
        if (priorityDelta) return priorityDelta;
        const leftTime = left.session_start ? new Date(left.session_start).getTime() : new Date(left.due_date || "9999-12-31").getTime();
        const rightTime = right.session_start ? new Date(right.session_start).getTime() : new Date(right.due_date || "9999-12-31").getTime();
        return leftTime - rightTime;
      })
      .slice(0, 8);
    const totalLessons = Number(progress.total_lessons) || 0;
    const completedLessons = Number(progress.completed_lessons) || 0;
    return res.json({
      success: true,
      data: {
        course: { ...course, author_id: undefined },
        progress: {
          totalLessons,
          completedLessons,
          percent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
        },
        sections: sectionsResult.rows,
        selectedClass,
        classes: classesResult.rows,
        upcomingSessions: sessionsResult.rows,
        assignments: taskRows,
        quizCount: Number(quizCountResult.rows[0]?.count) || 0,
        files: filesResult.rows.map((file) => ({
          id: String(file.id),
          name: file.original_name,
          mimeType: file.mime_type,
          sizeBytes: Number(file.size_bytes),
          uploadedAt: file.created_at,
          uploadedBy: file.uploaded_by,
          visibility: file.visibility,
          downloadUrl: `/api/files/${file.id}/download`,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching course workspace:", error);
    return internalError(res, "Không thể mở workspace khóa học");
  }
});

// GET /api/courses/:slug/classroom - Protected course content for enrolled learners
router.get("/:slug/classroom", protectRoute, async (req, res) => {
  try {
    const { slug } = req.params;
    const courseRes = await query(
      `SELECT ${COURSE_FIELDS}
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE (c.slug = $1 OR c.id::text = $1)`,
      [slug],
    );
    if (courseRes.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");

    const course = courseRes.rows[0];
    let isEnrolled = false;
    if (req.user.role === "user") {
      if (!course.is_published) return notFound(res, "Không tìm thấy khóa học");
      isEnrolled = await checkEnrollment(course.id, req.user.id);
      if (!isEnrolled) return forbidden(res, "Bạn cần đăng ký khóa học trước khi vào phòng học");
    } else if (req.user.role === "creator" && String(course.author_id) !== String(req.user.id)) {
      return forbidden(res, "Bạn chỉ được xem phòng học của khóa học do mình phụ trách");
    }

    const [sectionsRes, lessonsRes] = await Promise.all([
      query(
        `SELECT id, course_id, title, sort_order
         FROM sections WHERE course_id = $1 ORDER BY sort_order ASC, id ASC`,
        [course.id],
      ),
      query(
        `SELECT l.id, l.course_id, l.section_id, COALESCE(l.title, l.name) AS title, l.description,
                COALESCE(l.duration_seconds, l.video_duration_seconds, 0) AS duration_seconds,
                l.is_preview, l.sort_order, l.learning_url, (va.id IS NOT NULL) AS has_video
         FROM lessons l
         LEFT JOIN video_assets va ON va.id = l.video_asset_id AND va.status = 'ready'
         WHERE l.course_id = $1 AND l.is_published = true
         ORDER BY l.sort_order ASC, l.id ASC`,
        [course.id],
      ),
    ]);

    return res.json({
      success: true,
      data: {
        course: { ...course, author_id: undefined },
        sections: sectionsRes.rows,
        lessons: lessonsRes.rows,
        isEnrolled,
        access: { canLearn: true },
      },
    });
  } catch (error) {
    console.error("Error fetching protected classroom:", error);
    return internalError(res, "Lỗi khi mở phòng học");
  }
});

// GET /api/courses/:slug - Course Detail Landing Page
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const courseRes = await query(
      `SELECT ${COURSE_FIELDS}
       FROM courses c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE (c.slug = $1 OR c.id::text = $1) AND c.is_published = true`,
      [slug],
    );
    if (courseRes.rows.length === 0) return notFound(res, "Không tìm thấy khóa học");

    const course = courseRes.rows[0];
    const [sectionsRes, lessonsRes] = await Promise.all([
      query(
        "SELECT id, course_id, title, sort_order FROM sections WHERE course_id = $1 ORDER BY sort_order ASC, id ASC",
        [course.id],
      ),
      query(
        `SELECT id, course_id, section_id, COALESCE(title, name) AS title, description,
                COALESCE(duration_seconds, video_duration_seconds, 0) AS duration_seconds,
                is_preview, sort_order
         FROM lessons WHERE course_id = $1 AND is_published = true
         ORDER BY sort_order ASC, id ASC`,
        [course.id],
      ),
    ]);

    return res.json({
      success: true,
      data: {
        course: { ...course, author_id: undefined },
        sections: sectionsRes.rows,
        lessons: lessonsRes.rows,
      },
    });
  } catch (error) {
    console.error("Error fetching course detail:", error);
    return internalError(res, "Lỗi khi lấy chi tiết khóa học");
  }
});

// PATCH /api/courses/admin/:courseId/status - Publish or unpublish a course
router.patch("/admin/:courseId/status", protectRoute, requireTeacher, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    if (!courseId) return validationError(res, "courseId không hợp lệ");

    const { isPublished, status } = req.body;
    const nextStatus = typeof isPublished === "boolean"
      ? isPublished
      : status === "published"
        ? true
        : status === "draft"
          ? false
          : null;
    if (nextStatus === null) return validationError(res, "Trạng thái khóa học không hợp lệ");

    const ownership = await checkCourseOwner(courseId, req.user);
    if (ownership.status === 404) return notFound(res, "Không tìm thấy khóa học");
    if (ownership.status === 403) return forbidden(res, "Bạn không có quyền thay đổi khóa học này");

    const result = await query(
      "UPDATE courses SET is_published = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [nextStatus, courseId],
    );
    return res.json({
      success: true,
      data: result.rows[0],
      message: nextStatus ? "Đã công khai khóa học" : "Đã chuyển khóa học về bản nháp",
    });
  } catch (error) {
    console.error("Error updating course status:", error);
    return internalError(res, "Lỗi khi cập nhật trạng thái khóa học");
  }
});

// Admin: Create Course
router.post("/admin", protectRoute, requireTeacher, async (req, res) => {
  try {
    const { title, slug, description, category, level, price, isFree, thumbnailUrl } = req.body;
    if (typeof title !== "string" || !title.trim() || typeof slug !== "string" || !slug.trim()) {
      return validationError(res, "Thiếu title hoặc slug");
    }
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug || normalizedSlug.length < 3) return validationError(res, "Slug phải có ít nhất 3 ký tự hợp lệ");
    if (title.trim().length > 255) return validationError(res, "Tiêu đề không được dài quá 255 ký tự");
    if (typeof description === "string" && description.length > 10000) return validationError(res, "Mô tả không được dài quá 10.000 ký tự");
    if (category !== undefined && !["HSK", "HSKK", "CSCA"].includes(category)) return validationError(res, "category không hợp lệ");
    if (level !== undefined && !["beginner", "intermediate", "advanced"].includes(level)) return validationError(res, "level không hợp lệ");
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) return validationError(res, "price không hợp lệ");
    const isPublished = req.body.isPublished === true || req.body.status === "published";

    const result = await query(
      `INSERT INTO courses (name, title, slug, description, author_id, category, level, price, is_free, thumbnail_url, is_published)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [title.trim(), normalizedSlug, description || "", req.user.id, category || "HSK", level || "beginner", price || 0, isFree ?? true, thumbnailUrl || "", isPublished],
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Tạo khóa học mới thành công",
    });
  } catch (error) {
    console.error("Error creating course:", error);
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Slug khóa học đã tồn tại", errorCode: "CONFLICT" });
    return res.status(500).json({ success: false, message: "Lỗi khi tạo khóa học", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: Create Section
router.post("/admin/:courseId/sections", protectRoute, requireTeacher, async (req, res) => {
  try {
    const courseId = parsePositiveId(req.params.courseId);
    const { title, sortOrder } = req.body;
    if (!courseId || typeof title !== "string" || !title.trim()) {
      return validationError(res, "Thiếu tiêu đề chương");
    }
    if (title.trim().length > 255) return validationError(res, "Tiêu đề chương không được dài quá 255 ký tự");
    const ownership = await checkCourseOwner(courseId, req.user);
    if (ownership.status === 404) return notFound(res, "Không tìm thấy khóa học");
    if (ownership.status === 403) return forbidden(res, "Bạn không có quyền sửa khóa học này");
    if (sortOrder !== undefined && (!Number.isInteger(Number(sortOrder)) || Number(sortOrder) < 0)) {
      return validationError(res, "sortOrder không hợp lệ");
    }

    const result = await query(
      `INSERT INTO sections (course_id, title, sort_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [courseId, title.trim(), sortOrder === undefined ? 1 : Number(sortOrder)],
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Tạo chương học thành công",
    });
  } catch (error) {
    console.error("Error creating section:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi tạo chương học", errorCode: "INTERNAL_ERROR" });
  }
});

// Admin: Create Lesson
router.post("/admin/sections/:sectionId/lessons", protectRoute, requireTeacher, async (req, res) => {
  try {
    const sectionId = parsePositiveId(req.params.sectionId);
    const { courseId, title, videoAssetId, durationSeconds, isPreview, sortOrder, learningUrl } = req.body;
    const parsedCourseId = parsePositiveId(courseId);
    if (!sectionId || !parsedCourseId || typeof title !== "string" || !title.trim()) {
      return validationError(res, "Thiếu tiêu đề hoặc courseId");
    }
    if (title.trim().length > 255) return validationError(res, "Tiêu đề bài học không được dài quá 255 ký tự");

    const ownership = await checkCourseOwner(parsedCourseId, req.user);
    if (ownership.status === 404) return notFound(res, "Không tìm thấy khóa học");
    if (ownership.status === 403) return forbidden(res, "Bạn không có quyền sửa khóa học này");

    const sectionResult = await query(
      "SELECT id FROM sections WHERE id = $1 AND course_id = $2",
      [sectionId, parsedCourseId],
    );
    if (sectionResult.rows.length === 0) return notFound(res, "Không tìm thấy chương học trong khóa học này");

    const parsedVideoAssetId = videoAssetId === undefined || videoAssetId === null || videoAssetId === ""
      ? null
      : parsePositiveId(videoAssetId);
    if (videoAssetId !== undefined && videoAssetId !== null && videoAssetId !== "" && !parsedVideoAssetId) {
      return validationError(res, "videoAssetId không hợp lệ");
    }
    if (parsedVideoAssetId) {
      const videoResult = await query("SELECT id FROM video_assets WHERE id = $1 AND status = 'ready'", [parsedVideoAssetId]);
      if (videoResult.rows.length === 0) return notFound(res, "Không tìm thấy video đã sẵn sàng");
    }
    const parsedDuration = durationSeconds === undefined ? 0 : Number(durationSeconds);
    const parsedSortOrder = sortOrder === undefined ? 0 : Number(sortOrder);
    if (!Number.isInteger(parsedDuration) || parsedDuration < 0 || parsedDuration > 86400) return validationError(res, "durationSeconds không hợp lệ");
    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) return validationError(res, "sortOrder không hợp lệ");
    if (isPreview !== undefined && typeof isPreview !== "boolean") return validationError(res, "isPreview không hợp lệ");
    const parsedLearningUrl = parseLearningUrl(learningUrl);
    if (parsedLearningUrl.error) return validationError(res, parsedLearningUrl.error);
    if (!parsedLearningUrl.value) return validationError(res, "Link học là bắt buộc khi tạo bài học");

    const result = await query(
      `INSERT INTO lessons (section_id, course_id, name, title, video_asset_id, duration_seconds, is_preview, sort_order, learning_url, is_published)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, true)
       RETURNING *`,
      [sectionId, parsedCourseId, title.trim(), parsedVideoAssetId, parsedDuration, Boolean(isPreview), parsedSortOrder, parsedLearningUrl.value],
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Tạo bài học thành công",
    });
  } catch (error) {
    console.error("Error creating lesson:", error);
    return res.status(500).json({ success: false, message: "Lỗi khi tạo bài học", errorCode: "INTERNAL_ERROR" });
  }
});

// Teacher/Admin: replace or clear the learning link for an existing lesson.
router.patch("/admin/lessons/:lessonId/learning-link", protectRoute, requireTeacher, async (req, res) => {
  try {
    const lessonId = parsePositiveId(req.params.lessonId);
    if (!lessonId) return validationError(res, "lessonId không hợp lệ");

    const lessonResult = await query("SELECT id, course_id FROM lessons WHERE id = $1", [lessonId]);
    if (lessonResult.rows.length === 0) return notFound(res, "Không tìm thấy bài học");

    const ownership = await checkCourseOwner(lessonResult.rows[0].course_id, req.user);
    if (ownership.status === 403) return forbidden(res, "Bạn không có quyền sửa khóa học này");
    if (ownership.status === 404) return notFound(res, "Không tìm thấy khóa học");

    if (!Object.prototype.hasOwnProperty.call(req.body, "learningUrl")) {
      return validationError(res, "Thiếu learningUrl");
    }
    const parsedLearningUrl = parseLearningUrl(req.body.learningUrl);
    if (parsedLearningUrl.error) return validationError(res, parsedLearningUrl.error);

    const result = await query(
      "UPDATE lessons SET learning_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [parsedLearningUrl.value, lessonId],
    );
    return res.json({
      success: true,
      data: result.rows[0],
      message: parsedLearningUrl.value ? "Đã cập nhật link học" : "Đã gỡ link học",
    });
  } catch (error) {
    console.error("Error updating lesson learning link:", error);
    return internalError(res, "Không thể cập nhật link học");
  }
});

export default router;
