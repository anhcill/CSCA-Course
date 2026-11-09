-- Recording-only learners share the source live class content without joining
-- live meetings or attendance. InternalManagement recording classes are aliases
-- of an approved source class rather than duplicated LMS classes.

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS learning_mode VARCHAR(20) NOT NULL DEFAULT 'live';

ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_learning_mode_check;
ALTER TABLE class_enrollments
  ADD CONSTRAINT class_enrollments_learning_mode_check
  CHECK (learning_mode IN ('live', 'recording'));

CREATE INDEX IF NOT EXISTS idx_class_enrollments_learning_mode
  ON class_enrollments (live_class_id, learning_mode, user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS management_class_learning_aliases (
  id BIGSERIAL PRIMARY KEY,
  alias_class_source_id VARCHAR(128) NOT NULL,
  source_class_source_id VARCHAR(128) NOT NULL,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  learning_mode VARCHAR(20) NOT NULL DEFAULT 'recording'
    CHECK (learning_mode = 'recording'),
  title VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  management_source_updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_management_class_learning_alias_source_ci
  ON management_class_learning_aliases (LOWER(alias_class_source_id));
CREATE INDEX IF NOT EXISTS idx_management_class_learning_alias_live_class
  ON management_class_learning_aliases (live_class_id, status);

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS management_class_alias_id BIGINT
    REFERENCES management_class_learning_aliases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_enrollments_management_class_alias
  ON class_enrollments (management_class_alias_id, user_id)
  WHERE management_class_alias_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_management_class_learning_alias_updated_at
  ON management_class_learning_aliases;
CREATE TRIGGER trg_management_class_learning_alias_updated_at
  BEFORE UPDATE ON management_class_learning_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
