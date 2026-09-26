-- Migration 027: resources belong to a concrete teaching session when authored
-- from that session workspace. Nullable columns preserve older class-wide data.

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS class_session_id BIGINT
  REFERENCES class_sessions(id) ON DELETE SET NULL;

ALTER TABLE lms_learning_files
  ADD COLUMN IF NOT EXISTS class_session_id BIGINT
  REFERENCES class_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_session_due
  ON assignments (class_session_id, due_date, created_at DESC)
  WHERE class_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lms_learning_files_session_ready
  ON lms_learning_files (class_session_id, status, created_at DESC)
  WHERE class_session_id IS NOT NULL;
