const activeSessionStatuses = ["scheduled", "rescheduled", "live"];

export const normalizeSessionKind = (value) => {
  const normalized = String(value || "regular").trim().toLowerCase();
  return ["regular", "makeup", "supplemental", "curriculum_insert"].includes(normalized)
    ? normalized
    : null;
};

const findNextFreeSlot = async (client, lastSession) => {
  const durationMs = Math.max(15 * 60 * 1000,
    new Date(lastSession.end_time).getTime() - new Date(lastSession.start_time).getTime());
  const scheduledSlot = await client.query(
    `SELECT s.id AS schedule_id,
            ((candidate.session_date + s.start_time) AT TIME ZONE s.timezone) AS starts_at,
            ((candidate.session_date + s.end_time) AT TIME ZONE s.timezone) AS ends_at
     FROM class_schedules s
     CROSS JOIN LATERAL (
       SELECT occurrence::date AS session_date
       FROM generate_series(
         GREATEST(s.start_date, ($2::timestamptz AT TIME ZONE s.timezone)::date),
         GREATEST(s.start_date, ($2::timestamptz AT TIME ZONE s.timezone)::date) + 365,
         INTERVAL '1 day'
       ) occurrence
       WHERE EXTRACT(ISODOW FROM occurrence)::int = s.day_of_week
     ) candidate
     WHERE s.live_class_id = $1 AND s.status = 'active'
       AND ((candidate.session_date + s.start_time) AT TIME ZONE s.timezone) > $2
       AND NOT EXISTS (
         SELECT 1 FROM class_sessions conflict
         WHERE conflict.live_class_id = s.live_class_id AND conflict.status <> 'cancelled'
           AND conflict.start_time < ((candidate.session_date + s.end_time) AT TIME ZONE s.timezone)
           AND conflict.end_time > ((candidate.session_date + s.start_time) AT TIME ZONE s.timezone)
       )
     ORDER BY starts_at, s.id
     LIMIT 1`,
    [lastSession.live_class_id, lastSession.end_time],
  );
  if (scheduledSlot.rows[0]) {
    return {
      start: scheduledSlot.rows[0].starts_at,
      end: scheduledSlot.rows[0].ends_at,
      scheduleId: scheduledSlot.rows[0].schedule_id,
    };
  }

  let start = new Date(lastSession.start_time);
  for (let week = 1; week <= 52; week += 1) {
    const candidateStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const candidateEnd = new Date(candidateStart.getTime() + durationMs);
    const conflict = await client.query(
      `SELECT 1 FROM class_sessions
       WHERE live_class_id = $1 AND status <> 'cancelled'
         AND start_time < $3 AND end_time > $2
       LIMIT 1`,
      [lastSession.live_class_id, candidateStart, candidateEnd],
    );
    if (!conflict.rows.length) return { start: candidateStart, end: candidateEnd, scheduleId: lastSession.schedule_id };
  }
  throw new Error("Không tìm được lịch trống để kéo dài khóa học trong 52 tuần.");
};

const moveSessionContent = async (client, source, destination) => {
  await client.query(
    `UPDATE class_sessions
     SET chapter_id = $1, course_section_id = $2, lesson_id = $3, title = $4,
         version = version + 1, updated_at = NOW()
     WHERE id = $5`,
    [source.chapter_id, source.course_section_id, source.lesson_id, source.title, destination.id],
  );

  await client.query("SET CONSTRAINTS fk_student_vocabulary_progress_word_session DEFERRED");
  await client.query(
    `UPDATE student_vocabulary_progress p
     SET session_id = $2, updated_at = NOW()
     WHERE p.session_id = $1
       AND EXISTS (SELECT 1 FROM session_vocabularies v WHERE v.id = p.vocabulary_id AND v.session_id = $1)`,
    [source.id, destination.id],
  );
  await client.query(
    "UPDATE session_vocabularies SET session_id = $2, updated_at = NOW() WHERE session_id = $1",
    [source.id, destination.id],
  );
  await client.query(
    "UPDATE session_formulas SET session_id = $2, updated_at = NOW() WHERE session_id = $1",
    [source.id, destination.id],
  );
  await client.query(
    "UPDATE lms_learning_files SET class_session_id = $2, updated_at = NOW() WHERE class_session_id = $1",
    [source.id, destination.id],
  );
  await client.query(
    `DELETE FROM lms_learning_file_placements source
     USING lms_learning_file_placements destination
     WHERE source.class_session_id = $1 AND destination.class_session_id = $2
       AND source.file_id = destination.file_id AND source.live_class_id = destination.live_class_id`,
    [source.id, destination.id],
  );
  await client.query(
    "UPDATE lms_learning_file_placements SET class_session_id = $2 WHERE class_session_id = $1",
    [source.id, destination.id],
  );
};

export const shiftCancelledSessionCurriculum = async (client, {
  sessionId,
  operationKey,
  actorId = null,
  extendCourse = true,
}) => {
  if (!operationKey || String(operationKey).length > 160) throw new Error("operationKey không hợp lệ.");
  if (!extendCourse) throw new Error("Dồn toàn bộ giáo trình cần bật kéo dài khóa học.");

  const targetResult = await client.query(
    `SELECT cs.* FROM class_sessions cs WHERE cs.id = $1 FOR UPDATE`,
    [sessionId],
  );
  const target = targetResult.rows[0];
  if (!target) throw new Error("Không tìm thấy buổi học cần hủy.");
  if (target.status !== "cancelled") throw new Error("Chỉ có thể dồn giáo trình sau khi buổi học đã được hủy.");
  if ((target.session_kind || "regular") !== "regular") {
    throw new Error("Chỉ buổi học thường mới được dồn chuỗi giáo trình.");
  }

  const existingOperation = await client.query(
    "SELECT result FROM session_curriculum_operations WHERE operation_key = $1 FOR UPDATE",
    [operationKey],
  );
  if (existingOperation.rows[0]) return { ...existingOperation.rows[0].result, idempotent: true };

  await client.query(
    `INSERT INTO session_curriculum_operations
       (operation_key, live_class_id, cancelled_session_id, operation_type)
     VALUES ($1, $2, $3, 'cancel_shift_forward')`,
    [operationKey, target.live_class_id, target.id],
  );
  const sessionsResult = await client.query(
    `SELECT cs.* FROM class_sessions cs
     WHERE cs.live_class_id = $1 AND cs.start_time >= $2
       AND (cs.status = ANY($3::varchar[]) OR cs.id = $4)
       AND COALESCE(cs.session_kind, 'regular') = 'regular'
     ORDER BY cs.start_time, cs.id FOR UPDATE`,
    [target.live_class_id, target.start_time, activeSessionStatuses, target.id],
  );
  const sessions = sessionsResult.rows;
  const targetIndex = sessions.findIndex((row) => Number(row.id) === Number(target.id));
  if (targetIndex < 0) throw new Error("Buổi học không còn nằm trong tiến độ có thể dồn.");

  const last = sessions[sessions.length - 1];
  const nextSlot = await findNextFreeSlot(client, last);
  const extensionResult = await client.query(
    `INSERT INTO class_sessions
       (live_class_id, schedule_id, chapter_id, course_section_id, lesson_id, title,
        start_time, end_time, status, original_start_at, original_end_at,
        session_kind, is_payable, changed_by, changed_at, change_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$7,$8,'regular',TRUE,$9,NOW(),$10)
     RETURNING *`,
    [last.live_class_id, nextSlot.scheduleId, last.chapter_id, last.course_section_id, last.lesson_id,
      last.title, nextSlot.start, nextSlot.end, actorId, `Kéo dài khóa học do hủy buổi ${target.id}`],
  );
  const extension = extensionResult.rows[0];
  const chain = [...sessions, extension];
  for (let index = chain.length - 1; index > targetIndex; index -= 1) {
    await moveSessionContent(client, chain[index - 1], chain[index]);
  }
  // chapter_id is intentionally retained for audit/default-chapter constraints.
  // Detailed curriculum and all movable resources now belong to the next session.
  await client.query(
    `UPDATE class_sessions
     SET course_section_id = NULL, lesson_id = NULL, updated_at = NOW()
     WHERE id = $1`,
    [target.id],
  );

  const result = {
    cancelledSessionId: Number(target.id),
    extensionSessionId: Number(extension.id),
    shiftedSessionIds: chain.slice(targetIndex + 1).map((row) => Number(row.id)),
  };
  await client.query(
    `UPDATE session_curriculum_operations
     SET extension_session_id = $1, result = $2::jsonb, completed_at = NOW()
     WHERE operation_key = $3`,
    [extension.id, JSON.stringify(result), operationKey],
  );
  return result;
};
