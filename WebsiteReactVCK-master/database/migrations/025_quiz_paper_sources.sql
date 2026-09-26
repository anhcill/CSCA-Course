-- Migration 025: optional PDF paper source for LMS quizzes.
-- The file is stored in the existing protected learning-file store, never as a public URL.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS paper_file_id BIGINT
  REFERENCES lms_learning_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_paper_file
  ON quizzes (paper_file_id)
  WHERE paper_file_id IS NOT NULL;
