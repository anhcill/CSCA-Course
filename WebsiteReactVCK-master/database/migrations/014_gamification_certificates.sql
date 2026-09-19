-- Migration 014: idempotent XP events for LMS gamification.
-- Streak dates are calculated in the Asia/Ho_Chi_Minh timezone by the service.

CREATE TABLE IF NOT EXISTS xp_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key   VARCHAR(180) NOT NULL,
  event_type  VARCHAR(50) NOT NULL,
  xp          INT NOT NULL CHECK (xp > 0),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_xp_event UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_created
  ON xp_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_events_type_created
  ON xp_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_xp_streaks_total_streak
  ON user_xp_streaks (total_xp DESC, current_streak_days DESC, user_id ASC);
