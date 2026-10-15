-- Add the protected solution PDF referenced by quiz authoring and review APIs.
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS solution_file_id BIGINT
  REFERENCES lms_learning_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_solution_file
  ON quizzes (solution_file_id)
  WHERE solution_file_id IS NOT NULL;
