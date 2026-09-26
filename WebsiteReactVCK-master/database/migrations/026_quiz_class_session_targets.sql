-- Migration 026: every newly authored LMS quiz is attached to one class session.
-- Nullable columns preserve legacy quizzes; the application requires both values
-- for all new quizzes and verifies that the selected session belongs to the class.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS live_class_id BIGINT
  REFERENCES live_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_session_id BIGINT
  REFERENCES class_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_class_session
  ON quizzes (live_class_id, class_session_id);

CREATE INDEX IF NOT EXISTS idx_quizzes_session_start_lookup
  ON quizzes (class_session_id)
  WHERE class_session_id IS NOT NULL;
