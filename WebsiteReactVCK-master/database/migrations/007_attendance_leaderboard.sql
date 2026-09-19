-- Migration 007: Attendance Tracking & XP Leaderboard / Streak System

-- 1. Class Attendance table (Roll call for live sessions)
CREATE TABLE IF NOT EXISTS class_attendance (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(50) NOT NULL DEFAULT 'present', -- 'present', 'absent', 'excused'
  note          VARCHAR(255),
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT    unique_user_session_attendance UNIQUE (user_id, session_id)
);

-- 2. User XP Streaks table (Gamification & Leaderboard)
CREATE TABLE IF NOT EXISTS user_xp_streaks (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  total_xp             INT NOT NULL DEFAULT 0,
  current_streak_days  INT NOT NULL DEFAULT 0,
  last_active_date     DATE DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_xp_leaderboard ON user_xp_streaks(total_xp DESC);
