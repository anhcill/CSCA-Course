-- Migration 031: server-enforced quiz attempts and transparent homework rubrics.
-- Existing quizzes/attempts keep their current behaviour: one attempt and an
-- immediate review. New quizzes are given an explicit availability window by
-- the authoring API.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS attempt_limit SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_policy VARCHAR(30) NOT NULL DEFAULT 'after_submit';

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_attempt_limit_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_attempt_limit_check
  CHECK (attempt_limit BETWEEN 1 AND 5);

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_review_policy_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_review_policy_check
  CHECK (review_policy IN ('after_submit', 'after_close', 'never'));

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_availability_window_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_availability_window_check
  CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from);

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS question_snapshot JSONB;

ALTER TABLE quiz_attempts DROP CONSTRAINT IF EXISTS unique_user_quiz_attempt;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempt_number
  ON quiz_attempts (quiz_id, user_id, attempt_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_active_attempt
  ON quiz_attempts (quiz_id, user_id)
  WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz_latest
  ON quiz_attempts (user_id, quiz_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS assignment_rubrics (
  assignment_id BIGINT PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
  criteria_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE submission_grades
  ADD COLUMN IF NOT EXISTS rubric_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS grading_note TEXT;

DROP TRIGGER IF EXISTS trg_assignment_rubrics_updated_at ON assignment_rubrics;
CREATE TRIGGER trg_assignment_rubrics_updated_at
  BEFORE UPDATE ON assignment_rubrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
