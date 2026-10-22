-- Reuse one stored learning file in multiple classes or sessions without
-- duplicating the underlying R2 object.

CREATE TABLE IF NOT EXISTS lms_learning_file_placements (
  id                BIGSERIAL PRIMARY KEY,
  file_id           BIGINT NOT NULL REFERENCES lms_learning_files(id) ON DELETE CASCADE,
  live_class_id     BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  class_session_id  BIGINT,
  attached_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  visibility        VARCHAR(20) NOT NULL DEFAULT 'CLASS_ONLY'
                    CHECK (visibility IN ('CLASS_ONLY', 'COURSE')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lms_learning_file_placements_session_class_fk
    FOREIGN KEY (class_session_id, live_class_id)
    REFERENCES class_sessions(id, live_class_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_file_placement_class
  ON lms_learning_file_placements(file_id, live_class_id)
  WHERE class_session_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_file_placement_session
  ON lms_learning_file_placements(file_id, live_class_id, class_session_id)
  WHERE class_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_file_placements_target
  ON lms_learning_file_placements(live_class_id, class_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_file_placements_file
  ON lms_learning_file_placements(file_id, created_at DESC);
