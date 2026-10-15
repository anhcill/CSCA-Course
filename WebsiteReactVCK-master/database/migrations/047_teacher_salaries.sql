-- Migration 047: Teacher hourly salary rate and payroll tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS hourly_rate_override NUMERIC(12, 2);

ALTER TABLE class_teachers
  ADD COLUMN IF NOT EXISTS hourly_rate_override NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_users_hourly_rate
  ON users (hourly_rate)
  WHERE hourly_rate > 0;

-- Backfill reasonable default hourly rate (250,000 VND / hour) for existing creators
UPDATE users
SET hourly_rate = 250000
WHERE role = 'creator' AND (hourly_rate IS NULL OR hourly_rate = 0);

UPDATE users
SET hourly_rate = 300000
WHERE role = 'admin' AND (hourly_rate IS NULL OR hourly_rate = 0);
