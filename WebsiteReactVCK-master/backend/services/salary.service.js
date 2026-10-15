import { query as defaultQuery } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

/**
 * Calculates duration in hours between two timestamps, with safe rounding and fallbacks.
 */
export const calculateSessionDurationHours = (startTime, endTime) => {
  if (!startTime || !endTime) return 2.0;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 2.0;
  const hours = (end - start) / (1000 * 60 * 60);
  return Number(Math.max(0.25, Math.min(12, hours)).toFixed(2));
};

/**
 * Determines whether a session counts as completed/taught.
 */
export const isSessionCompleted = (session) => {
  if (!session || session.status === "cancelled") return false;
  if (session.status === "ended") return true;
  if (session.end_time) {
    const end = new Date(session.end_time).getTime();
    if (!Number.isNaN(end) && end <= Date.now()) return true;
  }
  return false;
};

/**
 * Retrieves the full salary detail for a specific teacher, including breakdown by class and session.
 */
export const getTeacherSalaryDetail = async (teacherId, db = { query: defaultQuery }) => {
  const userResult = await db.query(
    `SELECT u.id, u.username, u.email, u.avatar_url, u.role,
            COALESCE(u.hourly_rate, 0)::numeric(12,2) AS hourly_rate,
            COALESCE(sp.full_name, u.username) AS full_name
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1`,
    [teacherId],
  );

  const teacher = userResult.rows[0];
  if (!teacher) return null;

  const teacherHourlyRate = Number(teacher.hourly_rate || 0);

  // Get active classes taught by this teacher
  const classesResult = await db.query(
    `SELECT lc.id, lc.title, lc.course_id,
            lc.hourly_rate_override AS class_rate_override,
            COALESCE(c.title, c.name) AS course_title,
            ct.hourly_rate_override AS teacher_class_rate_override,
            ct.teaching_role
     FROM live_classes lc
     LEFT JOIN courses c ON c.id = lc.course_id
     LEFT JOIN class_teachers ct ON ct.live_class_id = lc.id AND ct.teacher_id = $1
       AND ct.status = 'active' AND ct.teaching_role IN ('lead', 'co_teacher')
     WHERE lc.status <> 'cancelled'
       AND ((lc.instructor_id = $1 AND NOT EXISTS (
         SELECT 1 FROM class_teachers mapping
         WHERE mapping.live_class_id = lc.id AND mapping.teacher_id = $1
       )) OR ct.id IS NOT NULL)
     ORDER BY lc.created_at DESC`,
    [teacherId],
  );

  const classRows = classesResult.rows;
  const classIds = classRows.map((c) => c.id);

  let sessionsByClass = {};
  if (classIds.length > 0) {
    const sessionsResult = await db.query(
      `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status
       FROM class_sessions cs
       WHERE cs.live_class_id = ANY($1::bigint[])
         AND cs.status <> 'cancelled'
       ORDER BY cs.start_time ASC, cs.id ASC`,
      [classIds],
    );

    for (const session of sessionsResult.rows) {
      if (!sessionsByClass[session.live_class_id]) {
        sessionsByClass[session.live_class_id] = [];
      }
      sessionsByClass[session.live_class_id].push(session);
    }
  }

  let totalScheduledSessions = 0;
  let totalCompletedSessions = 0;
  let totalCompletedHours = 0;
  let totalProjectedHours = 0;
  let totalAccruedSalary = 0;
  let totalProjectedSalary = 0;

  const classes = classRows.map((cls) => {
    // Effective rate: check teacher-class override, then class override, then teacher default
    const effectiveRate = Number(
      cls.teacher_class_rate_override ?? cls.class_rate_override ?? teacherHourlyRate,
    );

    const rawSessions = sessionsByClass[cls.id] || [];
    let classCompletedSessions = 0;
    let classCompletedHours = 0;
    let classTotalHours = 0;
    let classAccruedSalary = 0;
    let classProjectedSalary = 0;

    const sessions = rawSessions.map((session, index) => {
      const durationHours = calculateSessionDurationHours(session.start_time, session.end_time);
      const completed = isSessionCompleted(session);
      const isLive = session.status === "live";

      const sessionSalary = completed ? Math.round(durationHours * effectiveRate) : 0;
      const projectedSalary = Math.round(durationHours * effectiveRate);

      if (completed) {
        classCompletedSessions += 1;
        classCompletedHours += durationHours;
        classAccruedSalary += sessionSalary;
      }

      classTotalHours += durationHours;
      classProjectedSalary += projectedSalary;

      return {
        id: session.id,
        sessionNumber: index + 1,
        title: session.title,
        startTime: session.start_time,
        endTime: session.end_time,
        status: session.status,
        durationHours,
        isCompleted: completed,
        isLive,
        earnedAmount: sessionSalary,
        projectedAmount: projectedSalary,
      };
    });

    const totalSessions = sessions.length;
    const remainingSessions = Math.max(0, totalSessions - classCompletedSessions);
    const progressPct = totalSessions > 0 ? Math.round((classCompletedSessions / totalSessions) * 100) : 0;
    const avgDurationHours = totalSessions > 0 ? Number((classTotalHours / totalSessions).toFixed(1)) : 2.0;

    totalScheduledSessions += totalSessions;
    totalCompletedSessions += classCompletedSessions;
    totalCompletedHours += classCompletedHours;
    totalProjectedHours += classTotalHours;
    totalAccruedSalary += classAccruedSalary;
    totalProjectedSalary += classProjectedSalary;

    return {
      classId: cls.id,
      code: `LIVE-${cls.id}`,
      title: cls.title,
      courseTitle: cls.course_title || "Khóa học trực tuyến",
      teachingRole: cls.teaching_role || "lead",
      effectiveHourlyRate: effectiveRate,
      hasCustomRate: effectiveRate !== teacherHourlyRate,
      totalSessions,
      completedSessions: classCompletedSessions,
      remainingSessions,
      avgDurationHours,
      completedHours: Number(classCompletedHours.toFixed(1)),
      totalHours: Number(classTotalHours.toFixed(1)),
      accruedSalary: classAccruedSalary,
      projectedSalary: classProjectedSalary,
      progressPct,
      sessions,
    };
  });

  const totalRemainingSessions = Math.max(0, totalScheduledSessions - totalCompletedSessions);
  const overallProgressPct = totalScheduledSessions > 0
    ? Math.round((totalCompletedSessions / totalScheduledSessions) * 100)
    : 0;

  return {
    teacher: {
      id: teacher.id,
      username: teacher.username,
      fullName: teacher.full_name,
      email: teacher.email,
      avatarUrl: teacher.avatar_url,
      role: teacher.role,
      hourlyRate: teacherHourlyRate,
    },
    summary: {
      hourlyRate: teacherHourlyRate,
      totalClasses: classes.length,
      totalSessions: totalScheduledSessions,
      completedSessions: totalCompletedSessions,
      remainingSessions: totalRemainingSessions,
      completedHours: Number(totalCompletedHours.toFixed(1)),
      totalHours: Number(totalProjectedHours.toFixed(1)),
      accruedSalary: Math.round(totalAccruedSalary),
      projectedSalary: Math.round(totalProjectedSalary),
      progressPct: overallProgressPct,
      formulaNote: "Lương tạm tính = Số buổi đã dạy × Số giờ/buổi × Mức lương theo giờ",
    },
    classes,
  };
};

/**
 * Retrieves high-level salary summary for all teachers (for Admin Payroll Console).
 */
export const getAllTeachersSalaryOverview = async (db = { query: defaultQuery }, { search = "", rateStatus = "all" } = {}) => {
  const params = [];
  const filters = [];

  if (search && typeof search === "string" && search.trim()) {
    params.push(`%${search.trim()}%`);
    filters.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length} OR COALESCE(sp.full_name, '') ILIKE $${params.length})`);
  }

  if (rateStatus === "assigned") {
    filters.push("u.hourly_rate > 0");
  } else if (rateStatus === "unassigned") {
    filters.push("(u.hourly_rate IS NULL OR u.hourly_rate = 0)");
  }

  const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

  const sql = `
    SELECT u.id, u.username, u.email, u.avatar_url, u.role,
           COALESCE(u.hourly_rate, 0)::numeric(12,2) AS hourly_rate,
           COALESCE(sp.full_name, u.username) AS full_name,
           u.created_at,
           COALESCE(stats.classes_count, 0)::int AS classes_count,
           COALESCE(stats.total_sessions, 0)::int AS total_sessions,
           COALESCE(stats.completed_sessions, 0)::int AS completed_sessions,
           COALESCE(stats.completed_hours, 0)::numeric(10,2) AS completed_hours,
           COALESCE(stats.total_hours, 0)::numeric(10,2) AS total_hours
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT lc.id)::int AS classes_count,
             COUNT(cs.id) FILTER (WHERE cs.status <> 'cancelled')::int AS total_sessions,
             COUNT(cs.id) FILTER (WHERE cs.status = 'ended' OR (cs.status <> 'cancelled' AND cs.end_time <= NOW()))::int AS completed_sessions,
             COALESCE(SUM(ROUND((EXTRACT(EPOCH FROM (cs.end_time - cs.start_time)) / 3600.0)::numeric, 2))
               FILTER (WHERE cs.status = 'ended' OR (cs.status <> 'cancelled' AND cs.end_time <= NOW())), 0)::numeric(10,2) AS completed_hours,
             COALESCE(SUM(ROUND((EXTRACT(EPOCH FROM (cs.end_time - cs.start_time)) / 3600.0)::numeric, 2))
               FILTER (WHERE cs.status <> 'cancelled'), 0)::numeric(10,2) AS total_hours
      FROM live_classes lc
      LEFT JOIN class_sessions cs ON cs.live_class_id = lc.id
      WHERE (lc.instructor_id = u.id AND NOT EXISTS (
        SELECT 1 FROM class_teachers mapping
        WHERE mapping.live_class_id = lc.id AND mapping.teacher_id = u.id
      )) OR EXISTS (
        SELECT 1 FROM class_teachers ct
        WHERE ct.live_class_id = lc.id AND ct.teacher_id = u.id
          AND ct.status = 'active' AND ct.teaching_role IN ('lead', 'co_teacher')
      )
    ) stats ON true
    WHERE (u.role IN ('creator', 'admin')
       OR EXISTS (SELECT 1 FROM live_classes lc2 WHERE lc2.instructor_id = u.id)
       OR EXISTS (SELECT 1 FROM class_teachers ct2
                  WHERE ct2.teacher_id = u.id AND ct2.status = 'active'
                    AND ct2.teaching_role IN ('lead', 'co_teacher')))
       ${whereClause}
    ORDER BY stats.completed_sessions DESC, u.created_at DESC
  `;

  const result = await db.query(sql, params);

  let totalTeachersCount = result.rows.length;
  let assignedHourlyRateCount = 0;
  let totalAccruedSalary = 0;
  let totalProjectedSalary = 0;
  let totalCompletedHours = 0;
  let totalCompletedSessions = 0;

  const teachers = result.rows.map((row) => {
    const rate = Number(row.hourly_rate || 0);
    const compHours = Number(row.completed_hours || 0);
    const totHours = Number(row.total_hours || 0);
    const compSessions = Number(row.completed_sessions || 0);
    const totSessions = Number(row.total_sessions || 0);

    const accruedSalary = Math.round(compHours * rate);
    const projectedSalary = Math.round(totHours * rate);
    const progressPct = totSessions > 0 ? Math.round((compSessions / totSessions) * 100) : 0;

    if (rate > 0) assignedHourlyRateCount += 1;
    totalAccruedSalary += accruedSalary;
    totalProjectedSalary += projectedSalary;
    totalCompletedHours += compHours;
    totalCompletedSessions += compSessions;

    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      role: row.role,
      hourlyRate: rate,
      hasHourlyRate: rate > 0,
      classesCount: Number(row.classes_count || 0),
      totalSessions: totSessions,
      completedSessions: compSessions,
      remainingSessions: Math.max(0, totSessions - compSessions),
      completedHours: compHours,
      totalHours: totHours,
      accruedSalary,
      projectedSalary,
      progressPct,
    };
  });

  return {
    kpis: {
      totalTeachersCount,
      assignedHourlyRateCount,
      unassignedHourlyRateCount: totalTeachersCount - assignedHourlyRateCount,
      totalAccruedSalary: Math.round(totalAccruedSalary),
      totalProjectedSalary: Math.round(totalProjectedSalary),
      totalCompletedHours: Number(totalCompletedHours.toFixed(1)),
      totalCompletedSessions,
    },
    teachers,
  };
};

/**
 * Updates a teacher's hourly rate and writes an audit event.
 */
export const updateTeacherHourlyRate = async ({
  teacherId,
  hourlyRate,
  actorId,
  db = { query: defaultQuery },
}) => {
  const numericRate = Number(hourlyRate);
  if (!Number.isFinite(numericRate) || numericRate < 0) {
    throw new Error("INVALID_HOURLY_RATE");
  }

  const beforeResult = await db.query(
    "SELECT id, username, email, hourly_rate FROM users WHERE id = $1",
    [teacherId],
  );
  const before = beforeResult.rows[0];
  if (!before) throw new Error("TEACHER_NOT_FOUND");

  const updateResult = await db.query(
    `UPDATE users
     SET hourly_rate = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, username, email, role, hourly_rate`,
    [numericRate, teacherId],
  );

  const after = updateResult.rows[0];

  await recordAuditEvent({
    db,
    actorId,
    action: "teacher.hourly_rate_updated",
    entityType: "user",
    entityId: teacherId,
    beforeState: { hourlyRate: Number(before.hourly_rate || 0) },
    afterState: { hourlyRate: numericRate },
    metadata: { username: after.username },
  });

  return after;
};
