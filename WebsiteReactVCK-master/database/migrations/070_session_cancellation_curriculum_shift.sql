-- Atomic cancellation and curriculum-shift metadata for concrete class sessions.
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS session_kind VARCHAR(30) NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS replacement_for_session_id BIGINT REFERENCES class_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_payable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE class_sessions DROP CONSTRAINT IF EXISTS chk_class_sessions_session_kind;
ALTER TABLE class_sessions ADD CONSTRAINT chk_class_sessions_session_kind
  CHECK (session_kind IN ('regular', 'makeup', 'supplemental', 'curriculum_insert'));

CREATE INDEX IF NOT EXISTS idx_class_sessions_replacement
  ON class_sessions(replacement_for_session_id)
  WHERE replacement_for_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sessions_active_replacement
  ON class_sessions(replacement_for_session_id)
  WHERE replacement_for_session_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS session_curriculum_operations (
  id BIGSERIAL PRIMARY KEY,
  operation_key VARCHAR(160) NOT NULL UNIQUE,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  cancelled_session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  extension_session_id BIGINT REFERENCES class_sessions(id) ON DELETE SET NULL,
  operation_type VARCHAR(40) NOT NULL DEFAULT 'cancel_shift_forward',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Moving a vocabulary row and its learner progress is one atomic operation.
-- Deferral keeps the composite reference valid at COMMIT while preserving IDs,
-- practice counts and starred state.
ALTER TABLE student_vocabulary_progress
  DROP CONSTRAINT IF EXISTS fk_student_vocabulary_progress_word_session;
ALTER TABLE student_vocabulary_progress
  ADD CONSTRAINT fk_student_vocabulary_progress_word_session
  FOREIGN KEY (vocabulary_id, session_id)
  REFERENCES session_vocabularies(id, session_id)
  ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
