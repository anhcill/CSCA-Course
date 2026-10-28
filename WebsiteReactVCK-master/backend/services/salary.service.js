import { query as defaultQuery } from "../db/connect.js";
import { recordAuditEvent } from "./audit.service.js";

/**
 * Calculates duration in hours between two timestamps, with safe rounding, explicit override support, and fallbacks.
 */
export const calculateSessionDurationHours = (startTime, endTime, explicitDuration) => {
  if (explicitDuration !== undefined && explicitDuration !== null) {
    const explicitNum = Number(explicitDuration);
    if (Number.isFinite(explicitNum) && explicitNum > 0) {
      return Number(Math.max(0.25, Math.min(12, explicitNum)).toFixed(2));
    }
  }
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
 * Retrieves the full salary detail for a specific teacher, including breakdown by class, session, and settlement.
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
    let sessionsResult;
    try {
      sessionsResult = await db.query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
                cs.duration_hours
         FROM class_sessions cs
         WHERE cs.live_class_id = ANY($1::bigint[])
           AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [classIds],
      );
    } catch {
      sessionsResult = await db.query(
        `SELECT cs.id, cs.live_class_id, cs.title, cs.start_time, cs.end_time, cs.status,
                NULL::numeric(4,2) AS duration_hours
         FROM class_sessions cs
         WHERE cs.live_class_id = ANY($1::bigint[])
           AND cs.status <> 'cancelled'
         ORDER BY cs.start_time ASC, cs.id ASC`,
        [classIds],
      );
    }

    for (const session of sessionsResult.rows) {
      if (!sessionsByClass[session.live_class_id]) {
        sessionsByClass[session.live_class_id] = [];
      }
      sessionsByClass[session.live_class_id].push(session);
    }
  }

  // Get settlement record if any
  let settlement = null;
  try {
    const settlementResult = await db.query(
      `SELECT bonus_amount, deduction_amount, payment_status, notes, paid_at, settled_by, updated_at
       FROM teacher_salary_settlements
       WHERE teacher_id = $1 AND period = 'all'`,
      [teacherId],
    );
    settlement = settlementResult.rows[0] || null;
  } catch {
    // Graceful fallback if table doesn't exist in specific test sandbox
    settlement = null;
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
      const durationHours = calculateSessionDurationHours(session.start_time, session.end_time, session.duration_hours);
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
        isCustomDuration: session.duration_hours !== null && session.duration_hours !== undefined,
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
      teacherClassRateOverride: cls.teacher_class_rate_override ? Number(cls.teacher_class_rate_override) : null,
      classRateOverride: cls.class_rate_override ? Number(cls.class_rate_override) : null,
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

  const bonusAmount = Number(settlement?.bonus_amount || 0);
  const deductionAmount = Number(settlement?.deduction_amount || 0);
  const netAccruedSalary = Math.max(0, Math.round(totalAccruedSalary + bonusAmount - deductionAmount));
  const paymentStatus = settlement?.payment_status || "pending";
  const notes = settlement?.notes || "";
  const paidAt = settlement?.paid_at || null;

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
    settlement: {
      bonusAmount,
      deductionAmount,
      netAccruedSalary,
      paymentStatus,
      notes,
      paidAt,
      settledBy: settlement?.settled_by || null,
      updatedAt: settlement?.updated_at || null,
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
      bonusAmount,
      deductionAmount,
      netAccruedSalary,
      paymentStatus,
      projectedSalary: Math.round(totalProjectedSalary),
      progressPct: overallProgressPct,
      formulaNote: "Thực nhận = (Số buổi đã dạy × Số giờ/buổi × Mức lương theo giờ) + Thưởng - Khấu trừ",
    },
    classes,
  };
};

/**
 * Retrieves high-level salary summary for all teachers (for Admin Payroll Console).
 */
export const getAllTeachersSalaryOverview = async (
  db = { query: defaultQuery },
  { search = "", rateStatus = "all", paymentStatus = "all" } = {},
) => {
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

  if (paymentStatus && ["pending", "processing", "paid", "hold"].includes(paymentStatus)) {
    params.push(paymentStatus);
    filters.push(`COALESCE(tss.payment_status, 'pending') = $${params.length}`);
  }

  const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

  // Check if teacher_salary_settlements table exists, fallback gracefully if not
  let hasSettlementTable = true;
  try {
    const regRes = await db.query("SELECT to_regclass('public.teacher_salary_settlements') AS tbl");
    hasSettlementTable = Boolean(regRes.rows[0]?.tbl);
  } catch {
    hasSettlementTable = false;
  }

  const settlementJoin = hasSettlementTable
    ? "LEFT JOIN teacher_salary_settlements tss ON tss.teacher_id = u.id AND tss.period = 'all'"
    : "LEFT JOIN (SELECT NULL::bigint AS teacher_id, 0::numeric AS bonus_amount, 0::numeric AS deduction_amount, 'pending'::text AS payment_status, NULL::text AS notes, NULL::timestamptz AS paid_at) tss ON false";

  const sql = `
    SELECT u.id, u.username, u.email, u.avatar_url, u.role,
           COALESCE(u.hourly_rate, 0)::numeric(12,2) AS hourly_rate,
           COALESCE(sp.full_name, u.username) AS full_name,
           u.created_at,
           COALESCE(stats.classes_count, 0)::int AS classes_count,
           COALESCE(stats.total_sessions, 0)::int AS total_sessions,
           COALESCE(stats.completed_sessions, 0)::int AS completed_sessions,
           COALESCE(stats.completed_hours, 0)::numeric(10,2) AS completed_hours,
           COALESCE(stats.total_hours, 0)::numeric(10,2) AS total_hours,
           COALESCE(tss.bonus_amount, 0)::numeric(12,2) AS bonus_amount,
           COALESCE(tss.deduction_amount, 0)::numeric(12,2) AS deduction_amount,
           COALESCE(tss.payment_status, 'pending') AS payment_status,
           tss.notes AS payment_notes,
           tss.paid_at
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    ${settlementJoin}
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
  let totalNetSalary = 0;
  let totalProjectedSalary = 0;
  let totalCompletedHours = 0;
  let totalCompletedSessions = 0;
  let paidCount = 0;
  let pendingCount = 0;

  const teachers = result.rows.map((row) => {
    const rate = Number(row.hourly_rate || 0);
    const compHours = Number(row.completed_hours || 0);
    const totHours = Number(row.total_hours || 0);
    const compSessions = Number(row.completed_sessions || 0);
    const totSessions = Number(row.total_sessions || 0);
    const bonus = Number(row.bonus_amount || 0);
    const deduction = Number(row.deduction_amount || 0);
    const pStatus = row.payment_status || "pending";

    const accruedSalary = Math.round(compHours * rate);
    const netAccruedSalary = Math.max(0, Math.round(accruedSalary + bonus - deduction));
    const projectedSalary = Math.round(totHours * rate);
    const progressPct = totSessions > 0 ? Math.round((compSessions / totSessions) * 100) : 0;

    if (rate > 0) assignedHourlyRateCount += 1;
    if (pStatus === "paid") paidCount += 1;
    else pendingCount += 1;

    totalAccruedSalary += accruedSalary;
    totalNetSalary += netAccruedSalary;
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
      bonusAmount: bonus,
      deductionAmount: deduction,
      netAccruedSalary,
      paymentStatus: pStatus,
      paymentNotes: row.payment_notes || "",
      paidAt: row.paid_at || null,
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
      totalNetSalary: Math.round(totalNetSalary),
      totalProjectedSalary: Math.round(totalProjectedSalary),
      totalCompletedHours: Number(totalCompletedHours.toFixed(1)),
      totalCompletedSessions,
      paidCount,
      pendingCount,
    },
    teachers,
  };
};

/**
 * Read-only payroll projection for InternalManagement. The LMS remains the
 * source of session facts and configured hourly rates; Management can use the
 * returned source IDs to reconcile costs without entering salaries manually.
 */
export const getManagementPayrollReport = async (
  {
    from = null,
    to = null,
    courseSourceId = null,
    classSourceId = null,
    teacherSourceId = null,
    includeProjected = true,
  } = {},
  db = { query: defaultQuery },
) => {
  const params = [];
  const filters = ["cs.status <> 'cancelled'"];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (from) filters.push(`cs.start_time >= ${addParam(from)}::timestamptz`);
  if (to) filters.push(`cs.start_time < ${addParam(to)}::timestamptz`);
  if (courseSourceId) filters.push(`LOWER(COALESCE(lc.management_course_source_id, c.external_course_id)) = LOWER(${addParam(courseSourceId)})`);
  if (classSourceId) filters.push(`LOWER(COALESCE(lc.management_class_source_id, 'LIVE-' || lc.id::text)) = LOWER(${addParam(classSourceId)})`);
  if (teacherSourceId) filters.push(`LOWER(COALESCE(u.management_staff_source_id, ta.management_teacher_source_id)) = LOWER(${addParam(teacherSourceId)})`);

  const result = await db.query(`
    WITH teacher_assignments AS (
      SELECT ct.live_class_id, ct.teacher_id, ct.teaching_role,
             ct.hourly_rate_override AS teacher_class_rate_override,
             ct.management_teacher_source_id
      FROM class_teachers ct
      WHERE ct.status = 'active' AND ct.teaching_role IN ('lead', 'co_teacher')
      UNION ALL
      SELECT lc.id, lc.instructor_id, 'lead', NULL, NULL
      FROM live_classes lc
      WHERE lc.instructor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM class_teachers existing
          WHERE existing.live_class_id = lc.id AND existing.teacher_id = lc.instructor_id
        )
    )
    SELECT
      u.id AS teacher_id,
      u.management_staff_source_id,
      ta.management_teacher_source_id,
      COALESCE(sp.full_name, u.management_display_name, u.username) AS teacher_name,
      u.username AS teacher_username,
      u.hourly_rate AS teacher_hourly_rate,
      ta.teaching_role,
      lc.id AS class_id,
      lc.management_class_source_id,
      COALESCE(lc.management_class_source_id, 'LIVE-' || lc.id::text) AS class_source_id,
      lc.management_source_updated_at AS class_source_updated_at,
      lc.title AS class_title,
      COALESCE(lc.management_course_source_id, c.external_course_id) AS course_source_id,
      lc.management_course_source_id,
      c.external_course_id,
      c.title AS course_title,
      c.name AS course_name,
      c.management_source_updated_at AS course_source_updated_at,
      lc.hourly_rate_override AS class_rate_override,
      ta.teacher_class_rate_override,
      cs.id AS session_id,
      cs.management_session_source_id,
      COALESCE(cs.management_session_source_id, 'SESSION-' || cs.id::text) AS session_source_id,
      cs.title AS session_title,
      cs.start_time,
      cs.end_time,
      cs.status,
      cs.duration_hours,
      cs.management_source_updated_at AS session_source_updated_at,
      u.updated_at AS teacher_updated_at,
      COALESCE(tss.bonus_amount, 0) AS bonus_amount,
      COALESCE(tss.deduction_amount, 0) AS deduction_amount,
      COALESCE(tss.payment_status, 'pending') AS payment_status,
      tss.paid_at,
      tss.updated_at AS settlement_updated_at
    FROM teacher_assignments ta
    JOIN users u ON u.id = ta.teacher_id
    JOIN live_classes lc ON lc.id = ta.live_class_id AND lc.status <> 'cancelled'
    LEFT JOIN courses c ON c.id = lc.course_id
    JOIN class_sessions cs ON cs.live_class_id = lc.id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN teacher_salary_settlements tss ON tss.teacher_id = u.id AND tss.period = 'all'
    WHERE ${filters.join(" AND ")}
    ORDER BY u.id, lc.id, cs.start_time, cs.id
  `, params);

  const items = result.rows.map((row) => {
    const effectiveHourlyRate = Number(row.teacher_class_rate_override ?? row.class_rate_override ?? row.teacher_hourly_rate ?? 0);
    const durationHours = calculateSessionDurationHours(row.start_time, row.end_time, row.duration_hours);
    const isCompleted = isSessionCompleted(row);
    const amount = Math.round(durationHours * effectiveHourlyRate);
    const sourceUpdatedCandidates = [
      row.teacher_updated_at,
      row.class_source_updated_at,
      row.course_source_updated_at,
      row.session_source_updated_at,
      row.settlement_updated_at,
    ].filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
    const sourceUpdatedAt = sourceUpdatedCandidates.length
      ? new Date(Math.max(...sourceUpdatedCandidates)).toISOString()
      : null;

    return {
      teacherSourceId: row.management_staff_source_id || null,
      teacherAssignmentSourceId: row.management_teacher_source_id || null,
      teacherLmsId: row.teacher_id,
      teacherName: row.teacher_name,
      teacherUsername: row.teacher_username,
      courseSourceId: row.course_source_id || null,
      courseTitle: row.course_title || row.course_name || null,
      classSourceId: row.class_source_id,
      classLmsId: row.class_id,
      classTitle: row.class_title,
      teachingRole: row.teaching_role || "lead",
      sessionSourceId: row.session_source_id,
      sessionLmsId: row.session_id,
      sessionTitle: row.session_title,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      isCompleted,
      durationHours,
      effectiveHourlyRate,
      accruedAmount: isCompleted ? amount : 0,
      projectedAmount: includeProjected ? amount : null,
      bonusAmount: Number(row.bonus_amount || 0),
      deductionAmount: Number(row.deduction_amount || 0),
      paymentStatus: row.payment_status || "pending",
      paidAt: row.paid_at || null,
      sourceUpdatedAt,
      sourceMappingComplete: Boolean(
        row.management_staff_source_id
        && (row.management_course_source_id || row.external_course_id)
        && row.management_class_source_id
        && row.management_session_source_id,
      ),
      sourceIdFallbacks: {
        teacher: !row.management_staff_source_id,
        course: !(row.management_course_source_id || row.external_course_id),
        class: !row.management_class_source_id,
        session: !row.management_session_source_id,
      },
    };
  });

  const teachers = new Map();
  const classes = new Map();
  for (const item of items) {
    const key = item.teacherSourceId || `lms:${item.teacherLmsId}`;
    if (!teachers.has(key)) {
      teachers.set(key, {
        teacherSourceId: item.teacherSourceId,
        teacherLmsId: item.teacherLmsId,
        accruedAmount: 0,
        projectedAmount: 0,
        bonusAmount: item.bonusAmount,
        deductionAmount: item.deductionAmount,
        paymentStatus: item.paymentStatus,
        paidAt: item.paidAt,
      });
    }
    const summary = teachers.get(key);
    summary.accruedAmount += item.accruedAmount;
    if (item.projectedAmount !== null) summary.projectedAmount += item.projectedAmount;

    const classKey = `${key}:${item.classSourceId || `lms:${item.classLmsId}`}`;
    if (!classes.has(classKey)) {
      classes.set(classKey, {
        teacherSourceId: item.teacherSourceId,
        teacherLmsId: item.teacherLmsId,
        teacherName: item.teacherName,
        courseSourceId: item.courseSourceId,
        courseTitle: item.courseTitle,
        classSourceId: item.classSourceId,
        classLmsId: item.classLmsId,
        classTitle: item.classTitle,
        sessionCount: 0,
        completedSessionCount: 0,
        totalHours: 0,
        completedHours: 0,
        accruedAmount: 0,
        projectedAmount: 0,
        settlementAdjustmentApplied: false,
      });
    }
    const classSummary = classes.get(classKey);
    classSummary.sessionCount += 1;
    classSummary.completedSessionCount += item.isCompleted ? 1 : 0;
    classSummary.totalHours += item.durationHours;
    classSummary.completedHours += item.isCompleted ? item.durationHours : 0;
    classSummary.accruedAmount += item.accruedAmount;
    if (item.projectedAmount !== null) classSummary.projectedAmount += item.projectedAmount;
  }

  const teacherSummaries = [...teachers.values()].map((teacher) => ({
    ...teacher,
    netAccruedAmount: Math.max(0, teacher.accruedAmount + teacher.bonusAmount - teacher.deductionAmount),
  }));
  const classSummaries = [...classes.values()].map((summary) => ({
    ...summary,
    totalHours: Number(summary.totalHours.toFixed(2)),
    completedHours: Number(summary.completedHours.toFixed(2)),
    costAmount: summary.accruedAmount,
    projectedCostAmount: summary.projectedAmount,
  }));
  const accruedAmount = items.reduce((sum, item) => sum + item.accruedAmount, 0);
  const projectedAmount = items.reduce((sum, item) => sum + (item.projectedAmount || 0), 0);
  const bonusAmount = teacherSummaries.reduce((sum, teacher) => sum + teacher.bonusAmount, 0);
  const deductionAmount = teacherSummaries.reduce((sum, teacher) => sum + teacher.deductionAmount, 0);

  return {
    sourceSystem: "CSCA_COURSE",
    calculatedAt: new Date().toISOString(),
    period: { from, to, settlementPeriod: "all" },
    includeProjected: Boolean(includeProjected),
    items,
    classSummaries,
    totals: {
      itemCount: items.length,
      teacherCount: teachers.size,
      classCount: classes.size,
      accruedAmount,
      projectedAmount,
      teachingAccruedAmount: accruedAmount,
      teachingProjectedAmount: projectedAmount,
      classCostAmount: accruedAmount,
      projectedClassCostAmount: projectedAmount,
      bonusAmount,
      deductionAmount,
      settlementAdjustmentScope: "teacher",
      netAccruedAmountScope: "teacher",
      netAccruedAmount: teacherSummaries.reduce((sum, teacher) => sum + teacher.netAccruedAmount, 0),
    },
    teacherSummaries,
  };
};

/**
 * Updates a teacher's base hourly rate and writes an audit event.
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

/**
 * Updates a teacher's class-specific override hourly rate.
 */
export const updateTeacherClassHourlyRate = async ({
  teacherId,
  classId,
  hourlyRateOverride,
  actorId,
  db = { query: defaultQuery },
}) => {
  const tId = Number(teacherId);
  const cId = Number(classId);
  if (!Number.isFinite(tId) || !Number.isFinite(cId)) {
    throw new Error("INVALID_PARAMETERS");
  }

  let rate = null;
  if (hourlyRateOverride !== null && hourlyRateOverride !== undefined && hourlyRateOverride !== "") {
    rate = Number(hourlyRateOverride);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error("INVALID_HOURLY_RATE");
    }
  }

  const existingMapping = await db.query(
    "SELECT id, hourly_rate_override FROM class_teachers WHERE live_class_id = $1 AND teacher_id = $2",
    [cId, tId],
  );

  let beforeRate = null;
  let after = null;

  if (existingMapping.rows.length > 0) {
    beforeRate = existingMapping.rows[0].hourly_rate_override;
    const upd = await db.query(
      `UPDATE class_teachers
       SET hourly_rate_override = $1
       WHERE live_class_id = $2 AND teacher_id = $3
       RETURNING id, live_class_id, teacher_id, hourly_rate_override`,
      [rate, cId, tId],
    );
    after = upd.rows[0];
  } else {
    const classCheck = await db.query("SELECT id, instructor_id, hourly_rate_override FROM live_classes WHERE id = $1", [cId]);
    if (!classCheck.rows.length) throw new Error("CLASS_NOT_FOUND");
    beforeRate = classCheck.rows[0].hourly_rate_override;

    const ins = await db.query(
      `INSERT INTO class_teachers (live_class_id, teacher_id, teaching_role, status, hourly_rate_override)
       VALUES ($1, $2, 'lead', 'active', $3)
       ON CONFLICT (live_class_id, teacher_id) DO UPDATE
       SET hourly_rate_override = EXCLUDED.hourly_rate_override
       RETURNING id, live_class_id, teacher_id, hourly_rate_override`,
      [cId, tId, rate],
    );
    after = ins.rows[0];
  }

  await recordAuditEvent({
    db,
    actorId,
    action: "teacher.class_hourly_rate_updated",
    entityType: "class_teacher",
    entityId: cId,
    beforeState: { hourlyRateOverride: beforeRate },
    afterState: { hourlyRateOverride: rate },
    metadata: { teacherId: tId, classId: cId },
  }).catch(() => {});

  return after;
};

/**
 * Updates a session's duration or completion status for accurate payroll.
 */
export const updateSessionSalaryParameters = async ({
  sessionId,
  durationHours,
  status,
  actorId,
  db = { query: defaultQuery },
}) => {
  const sId = Number(sessionId);
  if (!Number.isFinite(sId)) throw new Error("INVALID_SESSION_ID");

  const sessResult = await db.query(
    "SELECT id, live_class_id, title, duration_hours, status, start_time, end_time FROM class_sessions WHERE id = $1",
    [sId],
  );
  const before = sessResult.rows[0];
  if (!before) throw new Error("SESSION_NOT_FOUND");

  const updates = [];
  const params = [sId];

  if (durationHours !== undefined && durationHours !== null && durationHours !== "") {
    const numH = Number(durationHours);
    if (!Number.isFinite(numH) || numH <= 0 || numH > 16) {
      throw new Error("INVALID_DURATION_HOURS");
    }
    params.push(Number(numH.toFixed(2)));
    updates.push(`duration_hours = $${params.length}`);
  }

  if (status !== undefined && status !== null && status !== "") {
    const validStatuses = ["scheduled", "live", "ended", "cancelled"];
    if (!validStatuses.includes(status)) {
      throw new Error("INVALID_STATUS");
    }
    params.push(status);
    updates.push(`status = $${params.length}`);
  }

  if (updates.length === 0) return before;

  updates.push("updated_at = NOW()");

  const updateResult = await db.query(
    `UPDATE class_sessions
     SET ${updates.join(", ")}
     WHERE id = $1
     RETURNING id, live_class_id, title, duration_hours, status, start_time, end_time`,
    params,
  );

  const after = updateResult.rows[0];

  await recordAuditEvent({
    db,
    actorId,
    action: "teacher.session_salary_updated",
    entityType: "class_session",
    entityId: sId,
    beforeState: { durationHours: before.duration_hours, status: before.status },
    afterState: { durationHours: after.duration_hours, status: after.status },
    metadata: { sessionId: sId, classId: after.live_class_id },
  }).catch(() => {});

  return after;
};

/**
 * Updates or upserts a teacher's settlement adjustments, notes, and payment status.
 */
export const updateTeacherSalarySettlement = async ({
  teacherId,
  period = "all",
  bonusAmount = 0,
  deductionAmount = 0,
  paymentStatus = "pending",
  notes = "",
  paidAt = null,
  actorId,
  db = { query: defaultQuery },
}) => {
  const tId = Number(teacherId);
  if (!Number.isFinite(tId)) throw new Error("INVALID_TEACHER_ID");

  const validStatuses = ["pending", "processing", "paid", "hold"];
  const finalStatus = validStatuses.includes(paymentStatus) ? paymentStatus : "pending";

  const numBonus = Math.max(0, Number(bonusAmount) || 0);
  const numDeduction = Math.max(0, Number(deductionAmount) || 0);

  const finalPaidAt = finalStatus === "paid"
    ? (paidAt ? new Date(paidAt) : new Date())
    : null;

  const result = await db.query(
    `INSERT INTO teacher_salary_settlements (
       teacher_id, period, bonus_amount, deduction_amount,
       payment_status, notes, paid_at, settled_by, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (teacher_id, period) DO UPDATE SET
       bonus_amount = EXCLUDED.bonus_amount,
       deduction_amount = EXCLUDED.deduction_amount,
       payment_status = EXCLUDED.payment_status,
       notes = EXCLUDED.notes,
       paid_at = EXCLUDED.paid_at,
       settled_by = EXCLUDED.settled_by,
       updated_at = NOW()
     RETURNING *`,
    [tId, period, numBonus, numDeduction, finalStatus, notes || "", finalPaidAt, actorId || null],
  );

  await recordAuditEvent({
    db,
    actorId,
    action: "teacher.salary_settlement_updated",
    entityType: "salary_settlement",
    entityId: tId,
    beforeState: null,
    afterState: result.rows[0],
    metadata: { teacherId: tId, period, paymentStatus: finalStatus },
  }).catch(() => {});

  return result.rows[0];
};
