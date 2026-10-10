// A report includes due, non-cancelled sessions. Student check-ins remain
// provisional until a teacher finalizes the sheet for that session.
const REPORT_SQL = `
  SELECT lc.id AS class_id, lc.title AS class_name,
         course.name AS course_name,
         COALESCE(
           (SELECT teacher.username
              FROM class_teachers ct
              JOIN users teacher ON teacher.id = ct.teacher_id
             WHERE ct.live_class_id = lc.id AND ct.status = 'active'
             ORDER BY CASE ct.teaching_role WHEN 'lead' THEN 0 WHEN 'co_teacher' THEN 1 ELSE 2 END,
                      ct.id
             LIMIT 1),
           instructor.username
         ) AS teacher_name,
         cs.id AS session_id, cs.title AS session_title, cs.start_time,
         cs.status AS session_status, sheet.finalized_at, sheet.reviewed_at,
         COALESCE(counts.present, 0)::int AS present,
         COALESCE(counts.absent, 0)::int AS absent,
         COALESCE(counts.excused, 0)::int AS excused
    FROM live_classes lc
    LEFT JOIN courses course ON course.id = lc.course_id
    LEFT JOIN users instructor ON instructor.id = lc.instructor_id
    LEFT JOIN class_sessions cs ON cs.live_class_id = lc.id
      AND cs.status <> 'cancelled'
      AND cs.start_time <= NOW()
      AND ($1::date IS NULL OR (cs.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $1::date)
      AND ($2::date IS NULL OR (cs.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $2::date)
    LEFT JOIN class_attendance_sheets sheet ON sheet.session_id = cs.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE ca.status = 'present')::int AS present,
             COUNT(*) FILTER (WHERE ca.status = 'absent')::int AS absent,
             COUNT(*) FILTER (WHERE ca.status = 'excused')::int AS excused
        FROM class_attendance ca
       WHERE ca.session_id = sheet.session_id
    ) counts ON true
   ORDER BY lc.title, lc.id, cs.start_time DESC, cs.id DESC`;

const emptyCounts = () => ({
  sessionCount: 0, finalizedSessions: 0, pendingSessions: 0,
  present: 0, absent: 0, excused: 0,
});

const rateFor = ({ present, absent, excused }) => {
  const total = present + absent + excused;
  return total ? Math.round((present / total) * 1000) / 10 : null;
};

const addSession = (counts, session) => {
  counts.sessionCount += 1;
  counts.finalizedSessions += session.finalizedAt ? 1 : 0;
  counts.pendingSessions += session.pending ? 1 : 0;
  counts.present += session.present;
  counts.absent += session.absent;
  counts.excused += session.excused;
};

export const parseReportDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
};

export const getAttendanceReport = async (db, { from = null, to = null } = {}) => {
  const result = await db.query(REPORT_SQL, [from, to]);
  const classes = [];
  const byId = new Map();
  const summary = { classCount: 0, ...emptyCounts(), rate: null };

  for (const row of result.rows) {
    const key = String(row.class_id);
    let group = byId.get(key);
    if (!group) {
      group = {
        classId: row.class_id, className: row.class_name,
        courseName: row.course_name || null, teacherName: row.teacher_name || null,
        ...emptyCounts(), rate: null, sessions: [],
      };
      byId.set(key, group);
      classes.push(group);
    }
    if (row.session_id === null) continue;

    const finalizedAt = row.finalized_at || null;
    const session = {
      sessionId: row.session_id, title: row.session_title,
      startTime: row.start_time, status: row.session_status,
      finalizedAt, reviewedAt: row.reviewed_at || null,
      pending: !finalizedAt,
      present: finalizedAt ? Number(row.present) : 0,
      absent: finalizedAt ? Number(row.absent) : 0,
      excused: finalizedAt ? Number(row.excused) : 0,
    };
    session.rate = rateFor(session);
    group.sessions.push(session);
    addSession(group, session);
    addSession(summary, session);
  }
  for (const group of classes) group.rate = rateFor(group);
  summary.classCount = classes.length;
  summary.rate = rateFor(summary);
  return { summary, classes };
};
