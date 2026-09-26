-- Migration 020: make a weekly class schedule an operational calendar series.
-- Existing class_schedules remain the source for the weekly pattern. This
-- migration adds a bounded term/timezone and lets every real class session
-- retain its source schedule and any later reschedule audit information.

ALTER TABLE class_schedules
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE NOT NULL DEFAULT (CURRENT_DATE + 180),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE class_schedules cs
SET title = COALESCE(NULLIF(cs.title, ''), CONCAT(lc.title, ' — Lịch học định kỳ')),
    timezone = COALESCE(NULLIF(cs.timezone, ''), 'Asia/Ho_Chi_Minh'),
    start_date = COALESCE(cs.start_date, CURRENT_DATE),
    end_date = COALESCE(cs.end_date, CURRENT_DATE + 180)
FROM live_classes lc
WHERE lc.id = cs.live_class_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_schedules_date_range_check'
  ) THEN
    ALTER TABLE class_schedules
      ADD CONSTRAINT class_schedules_date_range_check CHECK (end_date >= start_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_schedules_status_check'
  ) THEN
    ALTER TABLE class_schedules
      ADD CONSTRAINT class_schedules_status_check CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_class_schedules_updated_at ON class_schedules;
CREATE TRIGGER trg_class_schedules_updated_at
  BEFORE UPDATE ON class_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS schedule_id BIGINT REFERENCES class_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE class_sessions
SET original_start_at = COALESCE(original_start_at, start_time),
    original_end_at = COALESCE(original_end_at, end_time)
WHERE original_start_at IS NULL OR original_end_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_class_schedules_term
  ON class_schedules (live_class_id, start_date, end_date, day_of_week);
CREATE INDEX IF NOT EXISTS idx_class_sessions_schedule_start
  ON class_sessions (schedule_id, start_time)
  WHERE schedule_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS class_session_change_logs (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT REFERENCES class_sessions(id) ON DELETE SET NULL,
  schedule_id   BIGINT REFERENCES class_schedules(id) ON DELETE SET NULL,
  scope         VARCHAR(30) NOT NULL CHECK (scope IN ('single', 'this_and_following', 'all_future')),
  before_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state   JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason        TEXT,
  actor_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_session_change_logs_session_created
  ON class_session_change_logs (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_session_change_logs_schedule_created
  ON class_session_change_logs (schedule_id, created_at DESC);
