-- Stable Management identities keep inbound recurring calendars idempotent.
ALTER TABLE class_schedules
  ADD COLUMN IF NOT EXISTS management_schedule_source_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_meeting_url VARCHAR(1000);

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_schedules_management_source
  ON class_schedules (LOWER(management_schedule_source_id))
  WHERE management_schedule_source_id IS NOT NULL;

ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS management_session_source_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_source_updated_at TIMESTAMPTZ;

ALTER TABLE class_sessions ALTER COLUMN meet_url TYPE VARCHAR(1000);

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_sessions_management_source
  ON class_sessions (LOWER(management_session_source_id))
  WHERE management_session_source_id IS NOT NULL;
