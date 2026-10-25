import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireRole from "../middleware/requireRole.js";
import requireTeacher from "../middleware/requireTeacher.js";
import requirePermission from "../middleware/requirePermission.js";
import { query, getClient } from "../db/connect.js";
import { awardXp, XP_VALUES } from "../services/gamification.service.js";
import { recordAuditEvent } from "../services/audit.service.js";
import { askMoliPet } from "../services/moliPet.service.js";
import {
  VocabularyValidationError,
  formatVietnamSessionDate,
  normalizeVocabularyIdList,
  normalizeVocabularyPayload,
  parsePositiveId,
  serializeVocabulary,
  vietnamDateKey,
} from "../services/vocabulary.service.js";

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
  chapter: row.chapter_title || "Nội dung buổi học",
  sessionTitle: row.session_title,
  instructor: row.instructor_name || null,
});

const accessError = (res, access) => {
  if (access.error === "not_found") return errorResponse(res, 404, "Không tìm thấy buổi học", "NOT_FOUND");
  return errorResponse(res, 403, "Bạn không có quyền truy cập từ vựng của buổi học này", "FORBIDDEN");
};

const LATEX_COMMANDS = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "pi", "rho",
  "sigma", "tau", "phi", "chi", "psi", "omega", "frac", "sqrt", "sin", "cos", "tan",
  "cot", "sec", "csc", "log", "ln", "lim", "sum", "prod", "int", "left", "right",
  "cdot", "times", "div", "pm", "mp", "le", "leq", "ge", "geq", "neq", "infty",
  "partial", "vec", "overline", "underline", "begin", "end", "mathrm", "mathbf", "text",
]);

const repairJsonStringEscapes = (source) => {
  let repaired = "";
  let inString = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (!inString) {
      repaired += character;
      if (character === '"') inString = true;
      continue;
    }

    if (character === '"') {
      repaired += character;
      inString = false;
      continue;
    }

    if (character === "\\") {
      const remaining = source.slice(index + 1);
      const command = remaining.match(/^([A-Za-z]+)/)?.[1];
      if (command && LATEX_COMMANDS.has(command)) {
        repaired += "\\\\";
        continue;
      }

      const next = source[index + 1];
      if ('"\\/bfnrt'.includes(next)) {
        repaired += character + next;
        index += 1;
        continue;
      }
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(source.slice(index + 2, index + 6))) {
        repaired += source.slice(index, index + 6);
        index += 5;
        continue;
      }

      repaired += "\\\\";
      continue;
    }

    if (character === "\n") repaired += "\\n";
    else if (character === "\r") repaired += "\\r";
    else if (character === "\t") repaired += "\\t";
    else if (character.charCodeAt(0) < 0x20) repaired += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else repaired += character;
  }

  return repaired;
};

const readVocabularyArray = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  return [parsed.vocabularies, parsed.items, parsed.data].find(Array.isArray) || null;
};

export const extractJsonArray = (value) => {
  const text = String(value || "").trim();
  const fencedCandidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  const arrayCandidate = firstBracket >= 0 && lastBracket > firstBracket
    ? text.slice(firstBracket, lastBracket + 1)
    : "";
  const candidates = [...new Set([...fencedCandidates, text, arrayCandidate].filter(Boolean))];
  let lastError = new Error("AI response does not contain a JSON array");

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(repairJsonStringEscapes(candidate));
      const array = readVocabularyArray(parsed);
      if (array) return array;
      lastError = new Error("AI response is not an array");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const createVocabularyRouter = ({
  dbQuery = query,
  dbGetClient = getClient,
  authenticate = protectRoute,
  learnerOnly = requireRole("user"),
  vocabularyRoles = requireRole("user", "creator", "admin"),
  teacherOnly = requireTeacher,
  managePermission = requirePermission("lms.vocabulary.manage"),
  award = awardXp,
  audit = recordAuditEvent,
  askAi = askMoliPet,
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

  const loadVocabularyRows = async (sessionId, userId, db = { query: dbQuery }) => (await db.query(
    `SELECT sv.*, progress.status AS progress_status, progress.correct_count,
            progress.incorrect_count, progress.is_starred, progress.last_practiced_at
     FROM session_vocabularies sv
     LEFT JOIN student_vocabulary_progress progress
       ON progress.vocabulary_id = sv.id AND progress.user_id = $2::bigint
     WHERE sv.session_id = $1
     ORDER BY sv.order_index, sv.id`,
    [sessionId, userId || null],
  )).rows;

  router.get("/vocabulary/sessions", authenticate, vocabularyRoles, async (req, res) => {
    try {
      const courseId = req.query.courseId ? parsePositiveId(req.query.courseId) : null;
      const classId = req.query.classId ? parsePositiveId(req.query.classId) : null;
      const status = String(req.query.status || "all").toLowerCase();
      if (req.query.courseId && !courseId) return errorResponse(res, 422, "courseId không hợp lệ", "VALIDATION_ERROR");
      if (req.query.classId && !classId) return errorResponse(res, 422, "classId không hợp lệ", "VALIDATION_ERROR");
      if (!["all", "new", "learning", "completed"].includes(status)) {
        return errorResponse(res, 422, "status không hợp lệ", "VALIDATION_ERROR");
      }

      const values = [req.user.id];
      const filters = [
        "cs.status <> 'cancelled'",
        "lc.status <> 'cancelled'",
      ];
      if (req.user.role === "admin") {
        // Full visibility for LMS platform admins
      } else if (req.user.role === "creator") {
        filters.push(`((lc.instructor_id = $1 AND NOT EXISTS (
          SELECT 1 FROM class_teachers former
          WHERE former.live_class_id = lc.id AND former.teacher_id = $1
        )) OR EXISTS (
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
      if (courseId) {
        values.push(courseId);
        filters.push(`lc.course_id = $${values.length}`);
      }
      if (classId) {
        values.push(classId);
        filters.push(`lc.id = $${values.length}`);
      }

      const sessionResult = await dbQuery(
        `SELECT cs.id AS session_id, cs.live_class_id AS class_id, cs.title AS session_title,
                cs.start_time, lc.title AS class_title, lc.course_id,
                COALESCE(c.title, c.name) AS course_title, cc.title AS chapter_title,
                instructor.username AS instructor_name,
                COUNT(sv.id)::int AS total_words,
                COUNT(sv.id) FILTER (WHERE progress.status = 'mastered')::int AS mastered_words,
                COUNT(sv.id) FILTER (WHERE progress.status = 'learning')::int AS learning_words,
                COUNT(sv.id) FILTER (WHERE progress.is_starred = TRUE)::int AS starred_words
         FROM class_sessions cs
         JOIN live_classes lc ON lc.id = cs.live_class_id
         JOIN session_vocabularies sv ON sv.session_id = cs.id
         LEFT JOIN courses c ON c.id = lc.course_id
         LEFT JOIN class_chapters cc ON cc.id = cs.chapter_id
         LEFT JOIN users instructor ON instructor.id = lc.instructor_id
         LEFT JOIN student_vocabulary_progress progress
           ON progress.vocabulary_id = sv.id AND progress.user_id = $1
         WHERE ${filters.join(" AND ")}
         GROUP BY cs.id, cs.live_class_id, cs.title, cs.start_time, lc.title, lc.course_id,
                  c.title, c.name, cc.title, instructor.username
         ORDER BY cs.start_time DESC, cs.id DESC`,
        values,
      );

      let rows = sessionResult.rows.map((row) => ({
        ...row,
        total_words: Number(row.total_words || 0),
        mastered_words: Number(row.mastered_words || 0),
        learning_words: Number(row.learning_words || 0),
        starred_words: Number(row.starred_words || 0),
      }));
      if (status === "new") rows = rows.filter((row) => row.mastered_words === 0 && row.learning_words === 0);
      if (status === "completed") rows = rows.filter((row) => row.total_words > 0 && row.mastered_words === row.total_words);
      if (status === "learning") rows = rows.filter((row) => row.mastered_words + row.learning_words > 0 && row.mastered_words < row.total_words);

      const sessionIds = rows.map((row) => Number(row.session_id));
      const wordsBySession = new Map();
      if (sessionIds.length > 0) {
        const words = await dbQuery(
          `SELECT sv.*, progress.status AS progress_status, progress.correct_count,
                  progress.incorrect_count, progress.is_starred, progress.last_practiced_at
           FROM session_vocabularies sv
           LEFT JOIN student_vocabulary_progress progress
             ON progress.vocabulary_id = sv.id AND progress.user_id = $1
           WHERE sv.session_id = ANY($2::bigint[])
           ORDER BY sv.session_id, sv.order_index, sv.id`,
          [req.user.id, sessionIds],
        );
        for (const word of words.rows) {
          const key = String(word.session_id);
          if (!wordsBySession.has(key)) wordsBySession.set(key, []);
          wordsBySession.get(key).push(serializeVocabulary(word));
        }
      }

      const streakResult = await dbQuery(
        "SELECT total_xp, current_streak_days FROM user_xp_streaks WHERE user_id = $1",
        [req.user.id],
      );
      const sessions = rows.map((row) => {
        const totalWords = row.total_words;
        const masteredWords = row.mastered_words;
        return {
          ...sessionDto(row),
          totalWords,
          masteredWords,
          learningWords: row.learning_words,
          newWords: Math.max(0, totalWords - masteredWords - row.learning_words),
          starredWords: row.starred_words,
          progressPercent: totalWords ? Math.round((masteredWords / totalWords) * 100) : 0,
          status: masteredWords === totalWords ? "completed" : (masteredWords + row.learning_words > 0 ? "learning" : "new"),
          vocabularies: wordsBySession.get(String(row.session_id)) || [],
        };
      });
      const xp = streakResult.rows[0] || {};
      return res.json({
        success: true,
        data: {
          summary: {
            totalMastered: rows.reduce((sum, row) => sum + row.mastered_words, 0),
            reviewToday: rows.reduce((sum, row) => sum + row.learning_words, 0),
            currentStreakDays: Number(xp.current_streak_days || 0),
            totalXp: Number(xp.total_xp || 0),
          },
          sessions,
        },
      });
    } catch (error) {
      console.error("Error listing vocabulary sessions:", error);
      return errorResponse(res, 500, "Không thể tải danh sách buổi học từ vựng", "INTERNAL_ERROR");
    }
  });

  router.get("/sessions/:sessionId/vocabulary", authenticate, vocabularyRoles, async (req, res) => {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    try {
      const access = await getSessionAccess(sessionId, req.user);
      if (access.error) return accessError(res, access);
      const words = await loadVocabularyRows(sessionId, req.user.role === "user" ? req.user.id : null);
      return res.json({
        success: true,
        data: { session: sessionDto(access.session), vocabularies: words.map(serializeVocabulary) },
      });
    } catch (error) {
      console.error("Error loading session vocabulary:", error);
      return errorResponse(res, 500, "Không thể tải từ vựng của buổi học", "INTERNAL_ERROR");
    }
  });

  router.post("/sessions/:sessionId/vocabulary/submit", authenticate, vocabularyRoles, async (req, res) => {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    let masteredIds;
    let learningIds;
    try {
      masteredIds = normalizeVocabularyIdList(req.body?.masteredIds, "masteredIds");
      learningIds = normalizeVocabularyIdList(req.body?.learningIds, "learningIds");
      if (masteredIds.length + learningIds.length === 0) throw new VocabularyValidationError("Kết quả luyện tập đang trống");
      const masteredSet = new Set(masteredIds);
      if (learningIds.some((id) => masteredSet.has(id))) throw new VocabularyValidationError("Một từ không thể vừa thuộc vừa chưa thuộc");
    } catch (error) {
      if (error instanceof VocabularyValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      throw error;
    }

    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const access = await getSessionAccess(sessionId, req.user, client);
      if (access.error) {
        await client.query("ROLLBACK");
        return accessError(res, access);
      }
      const requestedIds = [...masteredIds, ...learningIds];
      const allowed = await client.query(
        "SELECT id FROM session_vocabularies WHERE session_id = $1 AND id = ANY($2::bigint[])",
        [sessionId, requestedIds],
      );
      if (allowed.rows.length !== requestedIds.length) {
        await client.query("ROLLBACK");
        return errorResponse(res, 422, "Kết quả chứa từ không thuộc buổi học này", "VALIDATION_ERROR");
      }

      if (masteredIds.length > 0) {
        await client.query(
          `INSERT INTO student_vocabulary_progress
             (user_id, vocabulary_id, session_id, status, correct_count, last_practiced_at)
           SELECT $1, word_id, $2, 'mastered', 1, NOW() FROM UNNEST($3::bigint[]) AS word_id
           ON CONFLICT (user_id, vocabulary_id) DO UPDATE SET
             status = 'mastered', correct_count = student_vocabulary_progress.correct_count + 1,
             last_practiced_at = NOW(), updated_at = NOW()`,
          [req.user.id, sessionId, masteredIds],
        );
      }
      if (learningIds.length > 0) {
        await client.query(
          `INSERT INTO student_vocabulary_progress
             (user_id, vocabulary_id, session_id, status, incorrect_count, last_practiced_at)
           SELECT $1, word_id, $2, 'learning', 1, NOW() FROM UNNEST($3::bigint[]) AS word_id
           ON CONFLICT (user_id, vocabulary_id) DO UPDATE SET
             status = 'learning', incorrect_count = student_vocabulary_progress.incorrect_count + 1,
             last_practiced_at = NOW(), updated_at = NOW()`,
          [req.user.id, sessionId, learningIds],
        );
      }

      const gamification = await award({
        db: client,
        userId: req.user.id,
        eventKey: `vocabulary:${sessionId}:practice:${vietnamDateKey()}`,
        eventType: "vocabulary_practice",
        xp: XP_VALUES.vocabularyPractice,
        metadata: { sessionId, masteredCount: masteredIds.length, learningCount: learningIds.length },
      });
      const stats = await client.query(
        `SELECT COUNT(sv.id)::int AS total_words,
                COUNT(sv.id) FILTER (WHERE progress.status = 'mastered')::int AS mastered_words,
                COUNT(sv.id) FILTER (WHERE progress.status = 'learning')::int AS learning_words
         FROM session_vocabularies sv
         LEFT JOIN student_vocabulary_progress progress
           ON progress.vocabulary_id = sv.id AND progress.user_id = $2
         WHERE sv.session_id = $1`,
        [sessionId, req.user.id],
      );
      await client.query("COMMIT");
      const summary = stats.rows[0];
      const totalWords = Number(summary.total_words || 0);
      const masteredWords = Number(summary.mastered_words || 0);
      return res.json({
        success: true,
        data: {
          sessionId: String(sessionId),
          totalWords,
          masteredWords,
          learningWords: Number(summary.learning_words || 0),
          progressPercent: totalWords ? Math.round((masteredWords / totalWords) * 100) : 0,
          gamification,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error submitting vocabulary practice:", error);
      return errorResponse(res, 500, "Không thể lưu kết quả luyện tập", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.post("/vocabulary/:vocabId/toggle-star", authenticate, vocabularyRoles, async (req, res) => {
    const vocabId = parsePositiveId(req.params.vocabId);
    if (!vocabId) return errorResponse(res, 422, "vocabId không hợp lệ", "VALIDATION_ERROR");
    try {
      const wordResult = await dbQuery("SELECT id, session_id FROM session_vocabularies WHERE id = $1", [vocabId]);
      const word = wordResult.rows[0];
      if (!word) return errorResponse(res, 404, "Không tìm thấy từ vựng", "NOT_FOUND");
      const access = await getSessionAccess(Number(word.session_id), req.user);
      if (access.error) return accessError(res, access);
      const result = await dbQuery(
        `INSERT INTO student_vocabulary_progress (user_id, vocabulary_id, session_id, is_starred)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (user_id, vocabulary_id) DO UPDATE SET
           is_starred = NOT student_vocabulary_progress.is_starred, updated_at = NOW()
         RETURNING is_starred`,
        [req.user.id, vocabId, word.session_id],
      );
      return res.json({ success: true, data: { vocabularyId: String(vocabId), isStarred: result.rows[0].is_starred } });
    } catch (error) {
      console.error("Error toggling vocabulary star:", error);
      return errorResponse(res, 500, "Không thể cập nhật từ đã đánh dấu", "INTERNAL_ERROR");
    }
  });

  router.post("/sessions/:sessionId/vocabulary", authenticate, teacherOnly, managePermission, async (req, res) => {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    let payload;
    try {
      payload = normalizeVocabularyPayload(req.body);
    } catch (error) {
      if (error instanceof VocabularyValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      throw error;
    }
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const access = await getSessionAccess(sessionId, req.user, client);
      if (access.error || !access.canManage) {
        await client.query("ROLLBACK");
        return accessError(res, access.error ? access : { error: "forbidden" });
      }
      const inserted = await client.query(
        `INSERT INTO session_vocabularies
           (session_id, class_id, topic, term, pinyin, sino_vietnamese, meaning, part_of_speech,
            example_sentence, example_meaning, audio_url, order_index, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
         RETURNING *`,
        [sessionId, access.session.class_id, payload.topic || "Nội dung chung", payload.term, payload.pinyin, payload.sinoVietnamese,
          payload.meaning, payload.partOfSpeech, payload.exampleSentence, payload.exampleMeaning,
          payload.audioUrl, payload.orderIndex, req.user.id],
      );
      await audit({
        db: client, actorId: req.user.id, action: "vocabulary.created",
        entityType: "session_vocabulary", entityId: inserted.rows[0].id,
        afterState: inserted.rows[0], metadata: { sessionId, classId: access.session.class_id },
      });
      await client.query("COMMIT");
      return res.status(201).json({ success: true, data: serializeVocabulary(inserted.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error creating session vocabulary:", error);
      return errorResponse(res, 500, "Không thể thêm từ vựng", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.put("/vocabulary/:vocabId", authenticate, teacherOnly, managePermission, async (req, res) => {
    const vocabId = parsePositiveId(req.params.vocabId);
    if (!vocabId) return errorResponse(res, 422, "vocabId không hợp lệ", "VALIDATION_ERROR");
    let payload;
    try {
      payload = normalizeVocabularyPayload(req.body, { partial: true });
    } catch (error) {
      if (error instanceof VocabularyValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      throw error;
    }

    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT * FROM session_vocabularies WHERE id = $1 FOR UPDATE", [vocabId]);
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Không tìm thấy từ vựng", "NOT_FOUND");
      }
      const access = await getSessionAccess(Number(existing.rows[0].session_id), req.user, client);
      if (access.error || !access.canManage) {
        await client.query("ROLLBACK");
        return accessError(res, access.error ? access : { error: "forbidden" });
      }
      const columnMap = {
        topic: "topic", term: "term", pinyin: "pinyin", sinoVietnamese: "sino_vietnamese", meaning: "meaning",
        partOfSpeech: "part_of_speech", exampleSentence: "example_sentence",
        exampleMeaning: "example_meaning", audioUrl: "audio_url", orderIndex: "order_index",
      };
      const values = [];
      const assignments = Object.entries(payload).map(([field, value]) => {
        values.push(value);
        return `${columnMap[field]} = $${values.length}`;
      });
      values.push(req.user.id, vocabId);
      const updated = await client.query(
        `UPDATE session_vocabularies SET ${assignments.join(", ")}, updated_by = $${values.length - 1}, updated_at = NOW()
         WHERE id = $${values.length} RETURNING *`,
        values,
      );
      await audit({
        db: client, actorId: req.user.id, action: "vocabulary.updated",
        entityType: "session_vocabulary", entityId: vocabId,
        beforeState: existing.rows[0], afterState: updated.rows[0],
        metadata: { sessionId: existing.rows[0].session_id, classId: existing.rows[0].class_id },
      });
      await client.query("COMMIT");
      return res.json({ success: true, data: serializeVocabulary(updated.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error updating session vocabulary:", error);
      return errorResponse(res, 500, "Không thể cập nhật từ vựng", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.delete("/vocabulary/:vocabId", authenticate, teacherOnly, managePermission, async (req, res) => {
    const vocabId = parsePositiveId(req.params.vocabId);
    if (!vocabId) return errorResponse(res, 422, "vocabId không hợp lệ", "VALIDATION_ERROR");
    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT * FROM session_vocabularies WHERE id = $1 FOR UPDATE", [vocabId]);
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Không tìm thấy từ vựng", "NOT_FOUND");
      }
      const access = await getSessionAccess(Number(existing.rows[0].session_id), req.user, client);
      if (access.error || !access.canManage) {
        await client.query("ROLLBACK");
        return accessError(res, access.error ? access : { error: "forbidden" });
      }
      await client.query("DELETE FROM session_vocabularies WHERE id = $1", [vocabId]);
      await audit({
        db: client, actorId: req.user.id, action: "vocabulary.deleted",
        entityType: "session_vocabulary", entityId: vocabId,
        beforeState: existing.rows[0], metadata: { sessionId: existing.rows[0].session_id },
      });
      await client.query("COMMIT");
      return res.json({ success: true, data: { id: String(vocabId), deleted: true } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error deleting session vocabulary:", error);
      return errorResponse(res, 500, "Không thể xóa từ vựng", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  router.post("/sessions/:sessionId/vocabulary/ai-suggest", authenticate, teacherOnly, managePermission, async (req, res) => {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    const topic = String(req.body?.topic || "").trim();
    const count = Number(req.body?.count || 10);
    if (!topic || topic.length > 300) return errorResponse(res, 422, "Chủ đề phải có từ 1 đến 300 ký tự", "VALIDATION_ERROR");
    if (!Number.isInteger(count) || count < 1 || count > 30) {
      return errorResponse(res, 422, "Số lượng gợi ý phải từ 1 đến 30", "VALIDATION_ERROR");
    }

    try {
      const access = await getSessionAccess(sessionId, req.user);
      if (access.error || !access.canManage) return accessError(res, access.error ? access : { error: "forbidden" });
      const prompt = `Tạo đúng ${count} từ vựng tiếng Trung phục vụ buổi học "${access.session.session_title}".
Chủ đề giáo viên yêu cầu: ${topic}.
Chỉ trả về một JSON array hợp lệ, không markdown, không giải thích. Mỗi phần tử có đúng các trường:
{"term":"chữ Hán","pinyin":"pinyin có dấu","sinoVietnamese":"âm Hán Việt","meaning":"nghĩa tiếng Việt","partOfSpeech":"từ loại","exampleSentence":"câu ví dụ tiếng Trung","exampleMeaning":"dịch câu ví dụ tiếng Việt"}.
Không dùng Markdown, LaTeX hoặc ký tự backslash trong bất kỳ giá trị nào; công thức toán phải viết dạng văn bản thường như sin(x), cos(x).
Ưu tiên thuật ngữ đúng ngữ cảnh CSCA/HSK, không lặp từ và không bịa công thức.`;
      const aiResult = await askAi(prompt, {
        pageType: "teacher-vocabulary",
        subject: topic,
        routeHint: `Buổi học: ${access.session.session_title}`,
      });
      if (!aiResult?.success) {
        return errorResponse(res, 503, aiResult?.answer || "Moly AI tạm thời chưa sẵn sàng", "AI_UNAVAILABLE");
      }

      const vocabularies = [];
      for (const item of extractJsonArray(aiResult.answer).slice(0, count)) {
        try {
          vocabularies.push(normalizeVocabularyPayload({
            ...item,
            topic: item?.topic || topic,
            orderIndex: vocabularies.length,
          }));
        } catch (error) {
          if (!(error instanceof VocabularyValidationError)) throw error;
          console.warn("Skipping invalid AI vocabulary item:", error.message);
        }
      }
      if (vocabularies.length === 0) throw new Error("AI returned an empty list");
      return res.json({ success: true, data: { vocabularies, model: aiResult.model || null } });
    } catch (error) {
      console.error("Error suggesting session vocabulary:", error);
      return errorResponse(res, 502, "Không thể đọc danh sách từ vựng do Moly AI tạo", "AI_INVALID_RESPONSE");
    }
  });

  router.post("/sessions/:sessionId/vocabulary/batch-import", authenticate, teacherOnly, managePermission, async (req, res) => {
    const sessionId = parsePositiveId(req.params.sessionId);
    if (!sessionId) return errorResponse(res, 422, "sessionId không hợp lệ", "VALIDATION_ERROR");
    const rawItems = Array.isArray(req.body) ? req.body : req.body?.vocabularies;
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 200) {
      return errorResponse(res, 422, "Danh sách import phải có từ 1 đến 200 từ", "VALIDATION_ERROR");
    }
    let items;
    try {
      items = rawItems.map((item, index) => {
        try {
          return normalizeVocabularyPayload(item);
        } catch (error) {
          if (error instanceof VocabularyValidationError) {
            throw new VocabularyValidationError(`Dòng ${index + 1}: ${error.message}`);
          }
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof VocabularyValidationError) return errorResponse(res, 422, error.message, "VALIDATION_ERROR");
      throw error;
    }

    const client = await dbGetClient();
    try {
      await client.query("BEGIN");
      const access = await getSessionAccess(sessionId, req.user, client);
      if (access.error || !access.canManage) {
        await client.query("ROLLBACK");
        return accessError(res, access.error ? access : { error: "forbidden" });
      }
      const created = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const inserted = await client.query(
          `INSERT INTO session_vocabularies
             (session_id, class_id, topic, term, pinyin, sino_vietnamese, meaning, part_of_speech,
              example_sentence, example_meaning, audio_url, order_index, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
          [sessionId, access.session.class_id, item.topic || "Nội dung chung", item.term, item.pinyin, item.sinoVietnamese,
            item.meaning, item.partOfSpeech, item.exampleSentence, item.exampleMeaning,
            item.audioUrl, item.orderIndex ?? index, req.user.id],
        );
        created.push(inserted.rows[0]);
      }
      await audit({
        db: client, actorId: req.user.id, action: "vocabulary.batch_imported",
        entityType: "class_session", entityId: sessionId,
        afterState: { count: created.length, vocabularyIds: created.map((item) => item.id) },
        metadata: { classId: access.session.class_id },
      });
      await client.query("COMMIT");
      return res.status(201).json({
        success: true,
        data: { importedCount: created.length, vocabularies: created.map(serializeVocabulary) },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error importing session vocabulary:", error);
      return errorResponse(res, 500, "Không thể import danh sách từ vựng", "INTERNAL_ERROR");
    } finally {
      client.release();
    }
  });

  return router;
};

export default createVocabularyRouter();
