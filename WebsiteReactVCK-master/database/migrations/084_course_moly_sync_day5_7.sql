-- Migration 084: CSCA-Course <-> Moly Studio Full Sync v2 (Days 5, 6, 7)
-- Strictly additive & idempotent migration for:
--   Day 5: Soft-delete & sync revision columns on lms_learning_files and lms_learning_file_placements
--   Day 6: Idempotency & sync revision columns on quiz_attempts and assignment_submissions
--   Day 7: Notes updated_at trigger, bookmarks table, unit Q&A threads & messages tables, bookmarks:rw delegated scope

-- ============================================================================
-- Day 5: Learning files & placements sync metadata
-- ============================================================================
ALTER TABLE lms_learning_files
  ADD COLUMN IF NOT EXISTS sync_revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lms_learning_files_active_course
  ON lms_learning_files (course_id, id)
  WHERE deleted_at IS NULL AND status = 'ready';

ALTER TABLE lms_learning_file_placements
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lms_learning_file_placements_active_session
  ON lms_learning_file_placements (class_session_id, sort_order, id)
  WHERE class_session_id IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_lms_learning_file_placements_updated_at ON lms_learning_file_placements;
CREATE TRIGGER trg_lms_learning_file_placements_updated_at
  BEFORE UPDATE ON lms_learning_file_placements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Day 6: Quiz attempts & assignment submissions idempotency + sync revision
-- ============================================================================
ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS sync_revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_user_idempotency
  ON quiz_attempts (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS sync_revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_submissions_user_idempotency
  ON assignment_submissions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- Day 7: Notes trigger, Bookmarks, Unit Q&A threads & messages, delegated scopes
-- ============================================================================
DROP TRIGGER IF EXISTS trg_video_course_unit_notes_updated_at ON video_course_unit_notes;
CREATE TRIGGER trg_video_course_unit_notes_updated_at
  BEFORE UPDATE ON video_course_unit_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS video_course_unit_bookmarks (
  id                      BIGSERIAL PRIMARY KEY,
  user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id               BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  video_course_profile_id BIGINT REFERENCES video_course_profiles(id) ON DELETE SET NULL,
  class_session_id        BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
  lesson_id               BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  video_asset_id          BIGINT,
  timestamp_seconds       INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_seconds >= 0),
  label                   VARCHAR(255) NOT NULL DEFAULT '',
  revision                BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  idempotency_key         VARCHAR(180),
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_video_course_unit_bookmarks_target
    CHECK (
      (class_session_id IS NOT NULL AND lesson_id IS NULL) OR
      (class_session_id IS NULL AND lesson_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_video_course_unit_bookmarks_user_idempotency
  ON video_course_unit_bookmarks (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_course_unit_bookmarks_user_session
  ON video_course_unit_bookmarks (user_id, class_session_id, timestamp_seconds ASC)
  WHERE class_session_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_course_unit_bookmarks_user_lesson
  ON video_course_unit_bookmarks (user_id, lesson_id, timestamp_seconds ASC)
  WHERE lesson_id IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_video_course_unit_bookmarks_updated_at ON video_course_unit_bookmarks;
CREATE TRIGGER trg_video_course_unit_bookmarks_updated_at
  BEFORE UPDATE ON video_course_unit_bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS learning_unit_qa_threads (
  id                      BIGSERIAL PRIMARY KEY,
  course_id               BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  video_course_profile_id BIGINT REFERENCES video_course_profiles(id) ON DELETE SET NULL,
  class_session_id        BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
  lesson_id               BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  author_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role             VARCHAR(32) NOT NULL DEFAULT 'user',
  title                   VARCHAR(255) NOT NULL,
  status                  VARCHAR(24) NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'answered', 'resolved')),
  is_pinned               BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_by_student_at TIMESTAMPTZ,
  last_message_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision                BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  idempotency_key         VARCHAR(180),
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_learning_unit_qa_threads_target
    CHECK (
      (class_session_id IS NOT NULL AND lesson_id IS NULL) OR
      (class_session_id IS NULL AND lesson_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_unit_qa_threads_author_idempotency
  ON learning_unit_qa_threads (author_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_unit_qa_threads_session
  ON learning_unit_qa_threads (class_session_id, is_pinned DESC, last_message_at DESC, id DESC)
  WHERE class_session_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learning_unit_qa_threads_lesson
  ON learning_unit_qa_threads (lesson_id, is_pinned DESC, last_message_at DESC, id DESC)
  WHERE lesson_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learning_unit_qa_threads_course_author
  ON learning_unit_qa_threads (course_id, author_id, last_message_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_learning_unit_qa_threads_updated_at ON learning_unit_qa_threads;
CREATE TRIGGER trg_learning_unit_qa_threads_updated_at
  BEFORE UPDATE ON learning_unit_qa_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS learning_unit_qa_messages (
  id                      BIGSERIAL PRIMARY KEY,
  thread_id               BIGINT NOT NULL REFERENCES learning_unit_qa_threads(id) ON DELETE CASCADE,
  author_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_kind             VARCHAR(24) NOT NULL DEFAULT 'student'
                          CHECK (author_kind IN ('student', 'teacher', 'admin')),
  body                    TEXT NOT NULL,
  attachments_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision                BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  idempotency_key         VARCHAR(180),
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_unit_qa_messages_author_idempotency
  ON learning_unit_qa_messages (author_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_unit_qa_messages_thread
  ON learning_unit_qa_messages (thread_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_learning_unit_qa_messages_updated_at ON learning_unit_qa_messages;
CREATE TRIGGER trg_learning_unit_qa_messages_updated_at
  BEFORE UPDATE ON learning_unit_qa_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Expand delegated_learning_sessions scopes check safely to include bookmarks:rw
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'delegated_learning_sessions'::regclass
      AND contype = 'c'
      AND (
        conname = 'chk_delegated_learning_sessions_scopes'
        OR pg_get_constraintdef(oid) ILIKE '%scopes%'
      )
  LOOP
    EXECUTE format('ALTER TABLE delegated_learning_sessions DROP CONSTRAINT IF EXISTS %I', constraint_row.conname);
  END LOOP;

  ALTER TABLE delegated_learning_sessions
    ADD CONSTRAINT chk_delegated_learning_sessions_scopes
    CHECK (
      cardinality(scopes) > 0
      AND array_position(scopes, NULL) IS NULL
      AND scopes <@ ARRAY[
        'workspace:read', 'video:play', 'progress:write',
        'file:view', 'file:download',
        'quiz:attempt', 'assignment:submit',
        'notes:rw', 'bookmarks:rw', 'qa:rw'
      ]::TEXT[]
    );
END $$;
