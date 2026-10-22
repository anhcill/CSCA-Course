import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { query, getClient } from "../db/connect.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { formatVietnamSessionDate } from "../services/vocabulary.service.js";
import {
  FormulaValidationError,
  formulaSubjectLabel,
  normalizeFormulaPayload,
  parseFormulaId,
  serializeFormula,
} from "../services/formula.service.js";

const errorResponse = (res, status, message, errorCode) => res.status(status).json({
  success: false,
  message,
  errorCode,
});

const sessionDto = (row) => ({
  sessionId: String(row.session_id),
  classId: String(row.class_id),
  classTitle: row.class_title,
  courseId: row.course_id === null ? null : String(row.course_id),
  courseTitle: row.course_title || null,
  date: row.start_time,
  formattedDate: formatVietnamSessionDate(row.start_time),
  chapter: row.chapter_title || row.chapter_name || "Nội dung buổi học",
  sessionTitle: row.session_title,
  instructor: row.instructor_name || null,
});

const accessError = (res, access) => {
  if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy buổi học", "NOT_FOUND");
  return errorResponse(res, 403, "Bạn không có quyền truy cập công thức của buổi học này", "FORBIDDEN");
};

const parseListOptions = (requestQuery) => {
  const subject = String(requestQuery.subject || "").trim().toUpperCase();
  if (subject && !["MATH", "PHYSICS", "CHEMISTRY"].includes(subject)) {
    throw new FormulaValidationError("subject phải là MATH, PHYSICS hoặc CHEMISTRY");
  }
  const search = String(requestQuery.search || "").trim();
  if (search.length > 200) throw new FormulaValidationError("Từ khóa tìm kiếm quá dài");
  const page = Math.max(1, Number.parseInt(requestQuery.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(requestQuery.limit, 10) || 30));
  return { subject, search, page, limit, offset: (page - 1) * limit };
};

const formulaInsertValues = (formula, { sessionId = null, classId = null, userId }) => [
  sessionId,
  classId,
  formula.subject,
  formula.chapterName,
  formula.nameVi,
  formula.nameZh,
  formula.pinyin,
  formula.latex,
  formula.description,
  JSON.stringify(formula.variables || []),
  formula.conditions,
  formula.exampleProblem,
  formula.exampleSolution,
  formula.orderIndex,
  userId,
];

const insertFormula = async (db, formula, context) => (await db.query(
  `INSERT INTO session_formulas
     (session_id, class_id, subject, chapter_name, name_vi, name_zh, pinyin,
      latex_expression, description, variables_explanation, conditions,
      example_problem, example_solution, order_index, created_by, updated_by)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$15)
   RETURNING *`,
  formulaInsertValues(formula, context),
)).rows[0];

export const createFormulaRouter = ({
  dbQuery = query,
  dbGetClient = getClient,
  authenticate = protectRoute,
  learnerOnly = requireRole("user"),
  formulaRoles = requireRole("user", "creator", "admin"),
  teacherOnly = requireTeacher,
  adminOnly = requireRole("admin"),
  managePermission = requirePermission("lms.formula.manage"),
  audit = recordAuditEvent,
} = {}) => {
  const router = express.Router();

  const getSessionAccess = async (sessionId, user, db = { query: dbQuery }) => {
    const result = await db.query(
      `SELECT cs.id AS session_id, cs.live_class_id AS class_id, cs.title AS session_title,
              cs.start_time, cs.end_time, cs.status AS session_status,
              lc.title AS class_title, lc.course_id, lc.instructor_id, lc.status AS class_status,
              COALESCE(c.title, c.name) AS course_title,
              cc.title AS chapter_title, instructor.username AS instructor_name
       FROM class_sessions cs
       JOIN live_classes lc ON lc.id = cs.live_class_id
       LEFT JOIN courses c ON c.id = lc.course_id
       LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
       LEFT JOIN users instructor ON instructor.id = lc.instructor_id
       WHERE cs.id = $1 AND cs.status <> 'cancelled' AND lc.status <> 'cancelled'`,
      [sessionId],
    );
    const session = result.rows[0];
    if (!session) return { error: "not_found" };
    if (user.role === "admin") return { session, canManage: true };

    if (user.role === "creator") {
      const assignment = await db.query(
        `SELECT 1
         FROM live_classes lc
         WHERE lc.id = $1 AND (
           EXISTS (SELECT 1 FROM class_teachers ct
                   WHERE ct.live_class_id = lc.id AND ct.teacher_id = $2 AND ct.status = 'active')
           OR (lc.instructor_id = $2 AND NOT EXISTS (
             SELECT 1 FROM class_teachers former
             WHERE former.live_class_id = lc.id AND former.teacher_id = $2
           ))
         )`,
        [session.class_id, user.id],
      );
      return assignment.rows[0] ? { session, canManage: true } : { error: "forbidden" };
    }

    if (user.role !== "user") return { error: "forbidden" };
    const enrollment = await db.query(
      `SELECT 1
       FROM class_enrollments ce
       WHERE ce.live_class_id = $1 AND ce.user_id = $2 AND ce.status = 'active'
         AND ($3::bigint IS NULL OR EXISTS (
           SELECT 1 FROM lms_access_grants grant_row
           WHERE grant_row.user_id = $2 AND grant_row.course_id = $3
             AND grant_row.access_status = 'active'
             AND grant_row.valid_from <= NOW()
             AND (grant_row.valid_until IS NULL OR grant_row.valid_until > NOW())
         ))`,
      [session.class_id, user.id, session.course_id],
    );
    return enrollment.rows[0] ? { session, canManage: false } : { error: "forbidden" };
  };

  const loadSessionFormulas = async (sessionId, userId, db = { query: dbQuery }) => (await db.query(
    `SELECT sf.*, (bookmark.id IS NOT NULL) AS is_starred, bookmark.personal_note
     FROM session_formulas sf
     LEFT JOIN student_formula_bookmarks bookmark
       ON bookmark.formula_id = sf.id AND bookmark.user_id = $2::bigint
     WHERE sf.session_id = $1
     ORDER BY sf.order_index, sf.id`,
    [sessionId, userId || null],
  )).rows;

  router.get("/lms/formulas/sessions", authenticate, formulaRoles, async (req, res) => {
    try {
      const { subject, search } = parseListOptions(req.query);
      const courseId = req.query.courseId ? parseFormulaId(req.query.courseId) : null;
      const classId = req.query.classId ? parseFormulaId(req.query.classId) : null;
      if (req.query.courseId && !courseId) throw new FormulaValidationError("courseId không hợp lệ");
      if (req.query.classId && !classId) throw new FormulaValidationError("classId không hợp lệ");

      const values = [req.user.id];
      const filters = [
        "cs.status <> 'cancelled'",
        "lc.status <> 'cancelled'",
      ];
      if (req.user.role === "admin") {
        // Full visibility for LMS platform admins
      } else if (req.user.role === "creator") {
        filters.push(`(lc.instructor_id = $1 OR EXISTS (
          SELECT 1 FROM class_teachers ct
          WHERE ct.live_class_id = lc.id AND ct.teacher_id = $1 AND ct.status = 'active'
        ) OR EXISTS (
          SELECT 1 FROM class_enrollments ce
          WHERE ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
        ))`);
      } else {
        filters.push(`EXISTS (
          SELECT 1 FROM class_enrollments ce
          WHERE ce.live_class_id = lc.id AND ce.user_id = $1 AND ce.status = 'active'
        )`);
      }
      if (subject) {
        values.push(subject);
        filters.push(`sf.subject = $${values.length}`);
      }
      if (courseId) {
        values.push(courseId);
        filters.push(`lc.course_id = $${values.length}`);
      }
      if (classId) {
        values.push(classId);
        filters.push(`lc.id = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        filters.push(`(sf.name_vi ILIKE $${values.length} OR sf.name_zh ILIKE $${values.length}
          OR sf.pinyin ILIKE $${values.length} OR sf.latex_expression ILIKE $${values.length}
          OR sf.description ILIKE $${values.length})`);
      }

      const result = await dbQuery(
        `SELECT cs.id AS session_id, cs.live_class_id AS class_id, cs.title AS session_title,
                cs.start_time, lc.title AS class_title, lc.course_id,
                COALESCE(c.title, c.name) AS course_title, cc.title AS chapter_title,
                instructor.username AS instructor_name, sf.*,
                (bookmark.id IS NOT NULL) AS is_starred, bookmark.personal_note
         FROM class_sessions cs
         JOIN live_classes lc ON lc.id = cs.live_class_id
         JOIN session_formulas sf ON sf.session_id = cs.id
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
         LEFT JOIN users instructor ON instructor.id = lc.instructor_id
         LEFT JOIN student_formula_bookmarks bookmark
           ON bookmark.formula_id = sf.id AND bookmark.user_id = $1
         WHERE ${filters.join(" AND ")}
         ORDER BY cs.start_time DESC, cs.id DESC, sf.order_index, sf.id`,
        values,
      );

      const sessions = new Map();
      for (const row of result.rows) {
        const key = String(row.session_id);
        if (!sessions.has(key)) sessions.set(key, { ...sessionDto(row), formulas: [] });
        sessions.get(key).formulas.push(serializeFormula(row));
      }
      const data = [...sessions.values()].map((session) => ({
        ...session,
        formulaCount: session.formulas.length,
        starredCount: session.formulas.filter((formula) => formula.isStarred).length,
        subjects: [...new Set(session.formulas.map((formula) => formula.subject))],
        subject: session.formulas[0]?.subject || null,
        subjectLabel: session.formulas[0]?.subjectLabel || null,
      }));
      return res.json({
        success: true,
        data: {
          summary: {
            totalSessions: data.length,
            totalFormulas: data.reduce((sum, session) => sum + session.formulaCount, 0),
            totalStarred: data.reduce((sum, session) => sum + session.starredCount, 0),
          },
          sessions: data,
        },
      });
    } catch (error) {
      if (error instanceof FormulaValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      console.error("Error listing formula sessions:", error);
      return errorResponse(res, 500, "Không thể tải sổ tay công thức", "INTERNAL_ERROR");
    }
  });

  router.get("/lms/sessions/:sessionId/formulas", authenticate, formulaRoles, async (req, res) => {
    const sessionId = parseFormulaId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    try {
      const access = await getSessionAccess(sessionId, req.user);
      if (access.error) return accessError(res, access);
      const rows = await loadSessionFormulas(sessionId, req.user.role === "user" ? req.user.id : null);
      return res.json({
        success: true,
        data: { session: sessionDto(access.session), formulas: rows.map(serializeFormula) },
      });
    } catch (error) {
      console.error("Error loading session formulas:", error);
      return errorResponse(res, 500, "Không thể tải công thức của buổi học", "INTERNAL_ERROR");
    }
  });

  router.post("/lms/formulas/:formulaId/toggle-star", authenticate, formulaRoles, async (req, res) => {
    const formulaId = parseFormulaId(req.params.formulaId);
    if (!formulaId) return errorResponse(res, 422, "formulaId không hợp lệ", "VALIDATION_ERROR");
    const personalNote = req.body?.personalNote === undefined ? null : String(req.body.personalNote || "").trim();
    if (personalNote && personalNote.length > 5000) {
      return errorResponse(res, 422, "Ghi chú cá nhân vượt quá 5000 ký tự", "VALIDATION_ERROR");
    }
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const formula = (await client.query(
        "SELECT id, session_id FROM session_formulas WHERE id = $1 FOR UPDATE",
        [formulaId],
      )).rows[0];
      if (!formula || !formula.session_id) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Không tìm thấy công thức trong buổi học", "NOT_FOUND");
      }
      const access = await getSessionAccess(Number(formula.session_id), req.user, client);
      if (access.error) {
        await client.query("ROLLBACK");
        return accessError(res, access);
      }
      const existing = (await client.query(
        "SELECT id FROM student_formula_bookmarks WHERE user_id = $1 AND formula_id = $2",
        [req.user.id, formulaId],
      )).rows[0];
      let isStarred;
      if (existing) {
        await client.query("DELETE FROM student_formula_bookmarks WHERE id = $1", [existing.id]);
        isStarred = false;
      } else {
        await client.query(
          "INSERT INTO student_formula_bookmarks(user_id, formula_id, personal_note) VALUES ($1,$2,$3)",
          [req.user.id, formulaId, personalNote || null],
        );
        isStarred = true;
      }
      await client.query("COMMIT");
      return res.json({ success: true, data: { formulaId: String(formulaId), isStarred, personalNote: isStarred ? personalNote || "" : "" } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error toggling formula bookmark:", error);
      return errorResponse(res, 500, "Không thể cập nhật sổ tay công thức", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.post("/lms/sessions/:sessionId/formulas", authenticate, teacherOnly, managePermission, async (req, res) => {
    const sessionId = parseFormulaId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const access = await getSessionAccess(sessionId, req.user, client);
      if (access.error || !access.canManage) {
        await client.query("ROLLBACK");
        return accessError(res, access.error ? access : { error: "forbidden" });
      }
      const formula = normalizeFormulaPayload(req.body, {
        defaultChapterName: access.session.chapter_title || access.session.session_title || "Nội dung buổi học",
      });
      const created = await insertFormula(client, formula, {
        sessionId,
        classId: access.session.class_id,
        userId: req.user.id,
      });
      await audit({
        db: client,
        actorId: req.user.id,
        action: "formula.created",
        entityType: "session_formula",
        entityId: created.id,
        afterState: created,
        metadata: { sessionId, classId: access.session.class_id },
      });
      await client.query("COMMIT");
      return res.status(201).json({ success: true, data: serializeFormula(created) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof FormulaValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      console.error("Error creating session formula:", error);
      return errorResponse(res, 500, "Không thể thêm công thức", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.put("/lms/formulas/:formulaId", authenticate, teacherOnly, managePermission, async (req, res) => {
    const formulaId = parseFormulaId(req.params.formulaId);
    if (!formulaId) return errorResponse(res, 422, "formulaId không hợp lệ", "VALIDATION_ERROR");
    let payload;
    try {
      payload = normalizeFormulaPayload(req.body, { partial: true });
    } catch (error) {
      if (error instanceof FormulaValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      throw error;
    }
    const fieldMap = {
      subject: "subject",
      chapterName: "chapter_name",
      nameVi: "name_vi",
      nameZh: "name_zh",
      pinyin: "pinyin",
      latex: "latex_expression",
      description: "description",
      variables: "variables_explanation",
      conditions: "conditions",
      exampleProblem: "example_problem",
      exampleSolution: "example_solution",
      orderIndex: "order_index",
    };
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const existing = (await client.query("SELECT * FROM session_formulas WHERE id = $1 FOR UPDATE", [formulaId])).rows[0];
      if (!existing) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Không tìm thấy công thức", "NOT_FOUND");
      }
      if (req.user.role !== "admin") {
        if (!existing.session_id) {
          await client.query("ROLLBACK");
          return errorResponse(res, 403, "Bạn không có quyền sửa công thức hệ thống", "FORBIDDEN");
        }
        const access = await getSessionAccess(Number(existing.session_id), req.user, client);
        if (access.error || !access.canManage) {
          await client.query("ROLLBACK");
          return accessError(res, access.error ? access : { error: "forbidden" });
        }
      }
      const entries = Object.entries(payload);
      const values = entries.map(([key, value]) => key === "variables" ? JSON.stringify(value) : value);
      values.push(req.user.id, formulaId);
      const assignments = entries.map(([key], index) => (
        key === "variables"
          ? `${fieldMap[key]} = $${index + 1}::jsonb`
          : `${fieldMap[key]} = $${index + 1}`
      ));
      assignments.push(`updated_by = $${entries.length + 1}`);
      const updated = (await client.query(
        `UPDATE session_formulas SET ${assignments.join(", ")} WHERE id = $${entries.length + 2} RETURNING *`,
        values,
      )).rows[0];
      await audit({
        db: client,
        actorId: req.user.id,
        action: "formula.updated",
        entityType: "session_formula",
        entityId: formulaId,
        beforeState: existing,
        afterState: updated,
        metadata: { sessionId: existing.session_id },
      });
      await client.query("COMMIT");
      return res.json({ success: true, data: serializeFormula(updated) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error updating session formula:", error);
      return errorResponse(res, 500, "Không thể cập nhật công thức", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.delete("/lms/formulas/:formulaId", authenticate, teacherOnly, managePermission, async (req, res) => {
    const formulaId = parseFormulaId(req.params.formulaId);
    if (!formulaId) return errorResponse(res, 422, "formulaId không hợp lệ", "VALIDATION_ERROR");
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const existing = (await client.query("SELECT * FROM session_formulas WHERE id = $1 FOR UPDATE", [formulaId])).rows[0];
      if (!existing) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Không tìm thấy công thức", "NOT_FOUND");
      }
      if (req.user.role !== "admin") {
        if (!existing.session_id) {
          await client.query("ROLLBACK");
          return errorResponse(res, 403, "Bạn không có quyền xóa công thức hệ thống", "FORBIDDEN");
        }
        const access = await getSessionAccess(Number(existing.session_id), req.user, client);
        if (access.error || !access.canManage) {
          await client.query("ROLLBACK");
          return accessError(res, access.error ? access : { error: "forbidden" });
        }
      }
      await client.query("DELETE FROM session_formulas WHERE id = $1", [formulaId]);
      await audit({
        db: client,
        actorId: req.user.id,
        action: "formula.deleted",
        entityType: "session_formula",
        entityId: formulaId,
        beforeState: existing,
        metadata: { sessionId: existing.session_id },
      });
      await client.query("COMMIT");
      return res.json({ success: true, data: { id: String(formulaId), deleted: true } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error deleting session formula:", error);
      return errorResponse(res, 500, "Không thể xóa công thức", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  const listFormulaLibrary = async (req, res, { admin = false } = {}) => {
    try {
      const { subject, search, page, limit, offset } = parseListOptions(req.query);
      const values = [];
      const filters = [];
      if (!admin) {
        values.push(req.user.id);
        filters.push(`sf.created_by = $${values.length}`);
      }
      if (subject) {
        values.push(subject);
        filters.push(`sf.subject = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        filters.push(`(sf.name_vi ILIKE $${values.length} OR sf.name_zh ILIKE $${values.length}
          OR sf.pinyin ILIKE $${values.length} OR sf.latex_expression ILIKE $${values.length}
          OR sf.chapter_name ILIKE $${values.length})`);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const countResult = await dbQuery(`SELECT COUNT(*)::int AS total FROM session_formulas sf ${where}`, values);
      const listValues = [...values, limit, offset];
      const rows = await dbQuery(
        `SELECT sf.*, cs.title AS session_title, cs.start_time,
                lc.title AS class_title, lc.course_id, COALESCE(c.title, c.name) AS course_title,
                creator.username AS creator_name,
                COUNT(*) OVER (PARTITION BY lower(sf.name_vi), sf.latex_expression)::int AS occurrence_count
         FROM session_formulas sf
         LEFT JOIN class_sessions cs ON cs.id = sf.session_id
         LEFT JOIN live_classes lc ON lc.id = sf.class_id
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN users creator ON creator.id = sf.created_by
         ${where}
         ORDER BY sf.updated_at DESC, sf.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        listValues,
      );
      const formulas = rows.rows.map((row) => ({
        ...serializeFormula(row),
        sessionTitle: row.session_title || null,
        sessionDate: row.start_time || null,
        classTitle: row.class_title || null,
        courseId: row.course_id === null || row.course_id === undefined ? null : String(row.course_id),
        courseTitle: row.course_title || null,
        creatorName: row.creator_name || null,
      }));
      const total = Number(countResult.rows[0]?.total || 0);
      return res.json({
        success: true,
        data: {
          formulas,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
          subjectCounts: formulas.reduce((counts, formula) => ({
            ...counts,
            [formula.subject]: (counts[formula.subject] || 0) + 1,
          }), {}),
        },
      });
    } catch (error) {
      if (error instanceof FormulaValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      console.error("Error listing formula library:", error);
      return errorResponse(res, 500, "Không thể tải kho công thức", "INTERNAL_ERROR");
    }
  };

  router.get("/lms/teach/formulas", authenticate, teacherOnly, managePermission, (req, res) => (
    listFormulaLibrary(req, res)
  ));

  router.get("/lms/formulas/presets", authenticate, teacherOnly, managePermission, async (req, res) => {
    try {
      const { subject, search, limit } = parseListOptions(req.query);
      const values = [req.user.id];
      const filters = ["(sf.session_id IS NULL OR sf.created_by = $1)"];
      if (subject) {
        values.push(subject);
        filters.push(`sf.subject = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        filters.push(`(sf.name_vi ILIKE $${values.length} OR sf.name_zh ILIKE $${values.length}
          OR sf.pinyin ILIKE $${values.length} OR sf.latex_expression ILIKE $${values.length}
          OR sf.chapter_name ILIKE $${values.length})`);
      }
      values.push(limit);
      const rows = await dbQuery(
        `SELECT sf.*, creator.username AS creator_name,
                COUNT(*) OVER (PARTITION BY lower(sf.name_vi), sf.latex_expression)::int AS occurrence_count
         FROM session_formulas sf
         LEFT JOIN users creator ON creator.id = sf.created_by
         WHERE ${filters.join(" AND ")}
         ORDER BY (sf.session_id IS NULL) DESC, sf.updated_at DESC, sf.id DESC
         LIMIT $${values.length}`,
        values,
      );
      return res.json({
        success: true,
        data: {
          formulas: rows.rows.map((row) => ({
            ...serializeFormula(row),
            creatorName: row.creator_name || null,
            isSystemPreset: row.session_id === null,
          })),
        },
      });
    } catch (error) {
      if (error instanceof FormulaValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      console.error("Error listing formula presets:", error);
      return errorResponse(res, 500, "Không thể tải kho công thức mẫu", "INTERNAL_ERROR");
    }
  });

  router.get("/admin/formulas", authenticate, adminOnly, (req, res) => (
    listFormulaLibrary(req, res, { admin: true })
  ));

  router.post("/admin/formulas/batch-import", authenticate, adminOnly, async (req, res) => {
    const rawItems = Array.isArray(req.body) ? req.body : req.body?.formulas;
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 500) {
      return errorResponse(res, 422, "Danh sách import phải có từ 1 đến 500 công thức", "VALIDATION_ERROR");
    }
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const sessionCache = new Map();
      const created = [];
      for (let index = 0; index < rawItems.length; index += 1) {
        const raw = rawItems[index];
        const rawSessionId = raw?.sessionId ?? raw?.session_id;
        const sessionId = rawSessionId === undefined || rawSessionId === null || rawSessionId === ""
          ? null
          : parseFormulaId(rawSessionId);
        if (rawSessionId !== undefined && rawSessionId !== null && rawSessionId !== "" && !sessionId) {
          throw new FormulaValidationError(`Dòng ${index + 1}: sessionId không hợp lệ`);
        }
        let session = null;
        if (sessionId) {
          if (!sessionCache.has(sessionId)) {
            const access = await getSessionAccess(sessionId, req.user, client);
            if (access.error) throw new FormulaValidationError(`Dòng ${index + 1}: Không tìm thấy buổi học`);
            sessionCache.set(sessionId, access.session);
          }
          session = sessionCache.get(sessionId);
        }
        let formula;
        try {
          formula = normalizeFormulaPayload(raw, {
            defaultChapterName: session?.chapter_title || session?.session_title || "Kho công thức chuẩn",
          });
        } catch (error) {
          if (error instanceof FormulaValidationError) {
            throw new FormulaValidationError(`Dòng ${index + 1}: ${error.message}`);
          }
          throw error;
        }
        const inserted = await insertFormula(client, formula, {
          sessionId,
          classId: session?.class_id || null,
          userId: req.user.id,
        });
        created.push(inserted);
      }
      await audit({
        db: client,
        actorId: req.user.id,
        action: "formula.batch_imported",
        entityType: "session_formula",
        entityId: created[0]?.id || null,
        afterState: { count: created.length, formulaIds: created.map((item) => item.id) },
      });
      await client.query("COMMIT");
      return res.status(201).json({
        success: true,
        data: { importedCount: created.length, formulas: created.map(serializeFormula) },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof FormulaValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      console.error("Error importing formulas:", error);
      return errorResponse(res, 500, "Không thể import danh sách công thức", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.get("/lms/formulas/meta", authenticate, formulaRoles, (_req, res) => res.json({
    success: true,
    data: {
      subjects: ["MATH", "PHYSICS", "CHEMISTRY"].map((value) => ({ value, label: formulaSubjectLabel(value) })),
    },
  }));

  return router;
};

export default createFormulaRouter();
