-- Vocabulary attached to real class sessions, with per-student practice state.

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sessions_id_live_class
  ON class_sessions (id, live_class_id);

CREATE TABLE IF NOT EXISTS session_vocabularies (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  term VARCHAR(100) NOT NULL CHECK (length(btrim(term)) > 0),
  pinyin VARCHAR(100),
  sino_vietnamese VARCHAR(100),
  meaning TEXT NOT NULL CHECK (length(btrim(meaning)) > 0),
  part_of_speech VARCHAR(50),
  example_sentence TEXT,
  example_meaning TEXT,
  audio_url VARCHAR(500),
  order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_session_vocabulary_session_class
    FOREIGN KEY (session_id, class_id)
    REFERENCES class_sessions (id, live_class_id) ON DELETE CASCADE,
  CONSTRAINT uq_session_vocabulary_id_session UNIQUE (id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_vocabularies_session_order
  ON session_vocabularies (session_id, order_index, id);
CREATE INDEX IF NOT EXISTS idx_session_vocabularies_class
  ON session_vocabularies (class_id, session_id);

DROP TRIGGER IF EXISTS trg_session_vocabularies_updated_at ON session_vocabularies;
CREATE TRIGGER trg_session_vocabularies_updated_at
  BEFORE UPDATE ON session_vocabularies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS student_vocabulary_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id BIGINT NOT NULL,
  session_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'learning', 'mastered')),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  incorrect_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
  is_starred BOOLEAN NOT NULL DEFAULT FALSE,
  last_practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_student_vocabulary_progress_word_session
    FOREIGN KEY (vocabulary_id, session_id)
    REFERENCES session_vocabularies (id, session_id) ON DELETE CASCADE,
  CONSTRAINT uq_student_vocabulary_progress_user_word UNIQUE (user_id, vocabulary_id)
);

CREATE INDEX IF NOT EXISTS idx_student_vocabulary_progress_user_session
  ON student_vocabulary_progress (user_id, session_id, status);
CREATE INDEX IF NOT EXISTS idx_student_vocabulary_progress_starred
  ON student_vocabulary_progress (user_id, is_starred)
  WHERE is_starred = TRUE;
CREATE INDEX IF NOT EXISTS idx_student_vocabulary_progress_last_practiced
  ON student_vocabulary_progress (user_id, last_practiced_at DESC);

DROP TRIGGER IF EXISTS trg_student_vocabulary_progress_updated_at ON student_vocabulary_progress;
CREATE TRIGGER trg_student_vocabulary_progress_updated_at
  BEFORE UPDATE ON student_vocabulary_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO lms_permissions (code, name, scope, is_system) VALUES
  ('lms.vocabulary.manage', 'Quản lý từ vựng theo buổi học', 'Class', FALSE)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope;

INSERT INTO lms_role_permissions (permission_id, role, is_allowed)
SELECT p.id, roles.role, roles.role IN ('admin', 'creator')
FROM lms_permissions p
CROSS JOIN (VALUES ('admin'), ('creator'), ('user')) AS roles(role)
WHERE p.code = 'lms.vocabulary.manage'
ON CONFLICT (permission_id, role) DO UPDATE
SET is_allowed = EXCLUDED.is_allowed, updated_at = NOW();
