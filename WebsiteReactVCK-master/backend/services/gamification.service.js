import { query } from "../db/connect.js";

const isPositiveInt = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

/**
 * Award XP exactly once for one user/event pair.
 * The caller may pass a transaction client; when it does, the event and streak
 * update commit/rollback together with the business mutation.
 */
export const awardXp = async ({
  db = { query },
  userId,
  eventKey,
  eventType,
  xp,
  metadata = {},
}) => {
  if (!isPositiveInt(userId)) throw new Error("userId không hợp lệ");
  if (typeof eventKey !== "string" || !eventKey.trim() || eventKey.length > 180) throw new Error("eventKey không hợp lệ");
  if (typeof eventType !== "string" || !eventType.trim() || eventType.length > 50) throw new Error("eventType không hợp lệ");
  if (!isPositiveInt(xp)) throw new Error("xp không hợp lệ");

  const eventResult = await db.query(
    `INSERT INTO xp_events (user_id, event_key, event_type, xp, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (user_id, event_key) DO NOTHING
     RETURNING id`,
    [Number(userId), eventKey.trim(), eventType.trim(), Number(xp), JSON.stringify(metadata || {})],
  );

  if (!eventResult.rows[0]) {
    const existing = await db.query(
      `SELECT x.total_xp, x.current_streak_days
       FROM user_xp_streaks x WHERE x.user_id = $1`,
      [Number(userId)],
    );
    return {
      awarded: false,
      eventId: null,
      xp: 0,
      totalXp: Number(existing.rows[0]?.total_xp || 0),
      currentStreakDays: Number(existing.rows[0]?.current_streak_days || 0),
    };
  }

  await db.query(
    `INSERT INTO user_xp_streaks (user_id, total_xp, current_streak_days, last_active_date)
     VALUES ($1, 0, 0, (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
     ON CONFLICT (user_id) DO NOTHING`,
    [Number(userId)],
  );

  const streakResult = await db.query(
    `UPDATE user_xp_streaks
     SET total_xp = total_xp + $1,
         current_streak_days = CASE
           WHEN last_active_date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN current_streak_days
           WHEN last_active_date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1 THEN current_streak_days + 1
           ELSE 1
         END,
         last_active_date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING total_xp, current_streak_days`,
    [Number(xp), Number(userId)],
  );

  return {
    awarded: true,
    eventId: eventResult.rows[0].id,
    xp: Number(xp),
    totalXp: Number(streakResult.rows[0]?.total_xp || xp),
    currentStreakDays: Number(streakResult.rows[0]?.current_streak_days || 1),
  };
};

export const XP_VALUES = Object.freeze({
  lessonCompleted: 10,
  quizPassed: 20,
  quizSubmitted: 5,
  assignmentGraded: 15,
  assignmentReviewed: 5,
});
