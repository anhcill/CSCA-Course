-- Migration 010: Live-class policy, attendance and notification idempotency
-- Safe to rerun. All timestamps remain TIMESTAMPTZ and are stored in UTC.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_classes_instructor_status
  ON live_classes (instructor_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_schedules_class_day_time
  ON class_schedules (live_class_id, day_of_week, start_time);

CREATE INDEX IF NOT EXISTS idx_class_sessions_class_start_status
  ON class_sessions (live_class_id, start_time, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_status_user
  ON class_enrollments (live_class_id, status, user_id);

CREATE INDEX IF NOT EXISTS idx_class_attendance_session_user
  ON class_attendance (session_id, user_id);
