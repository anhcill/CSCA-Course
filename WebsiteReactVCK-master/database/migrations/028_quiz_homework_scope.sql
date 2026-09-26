-- Migration 028: distinguish an in-session quiz from a take-home quiz.
-- Existing quizzes keep the safe default of being an activity for their session.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS activity_scope VARCHAR(20) NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_quizzes_session_scope_due
  ON quizzes (class_session_id, activity_scope, due_date, created_at DESC)
  WHERE class_session_id IS NOT NULL;
