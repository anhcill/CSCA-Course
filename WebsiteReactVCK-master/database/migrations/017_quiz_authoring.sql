-- Migration 017: teacher quiz authoring metadata.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS instructor_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_status_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));

CREATE INDEX IF NOT EXISTS idx_quizzes_instructor_status
  ON quizzes (instructor_id, status, created_at DESC);
