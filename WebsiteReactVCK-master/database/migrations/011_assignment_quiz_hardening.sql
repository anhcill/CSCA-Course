-- Migration 011: Assignment upload security, immutable submissions and quiz attempts.
-- Safe to rerun. Uploaded objects are addressed by server-owned asset IDs, never
-- by arbitrary URLs supplied by a browser.

CREATE TABLE IF NOT EXISTS submission_assets (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id     BIGINT REFERENCES assignments(id) ON DELETE SET NULL,
  asset_kind        VARCHAR(20) NOT NULL CHECK (asset_kind IN ('file', 'audio')),
  original_filename VARCHAR(255) NOT NULL,
  storage_key       VARCHAR(500) NOT NULL UNIQUE,
  mime_type         VARCHAR(100) NOT NULL,
  size_bytes        BIGINT NOT NULL CHECK (size_bytes > 0),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'ready', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS file_asset_id BIGINT REFERENCES submission_assets(id) ON DELETE SET NULL;

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS audio_asset_id BIGINT REFERENCES submission_assets(id) ON DELETE SET NULL;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) NOT NULL DEFAULT 'homework';

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_assignment_type_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_assignment_type_check
  CHECK (assignment_type IN ('homework', 'hskk', 'quiz'));

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            BIGSERIAL PRIMARY KEY,
  quiz_id       BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  score         NUMERIC(8,2),
  max_score     NUMERIC(8,2),
  status        VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress', 'submitted')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_quiz_attempt UNIQUE (user_id, quiz_id)
);

DROP TRIGGER IF EXISTS trg_submission_assets_updated_at ON submission_assets;
CREATE TRIGGER trg_submission_assets_updated_at
  BEFORE UPDATE ON submission_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_quiz_attempts_updated_at ON quiz_attempts;
CREATE TRIGGER trg_quiz_attempts_updated_at
  BEFORE UPDATE ON quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_assignments_scope_due
  ON assignments (course_id, live_class_id, due_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_assets_owner_status
  ON submission_assets (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_status
  ON assignment_submissions (assignment_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_order
  ON quiz_questions (quiz_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_status
  ON quiz_attempts (quiz_id, status, submitted_at DESC);
