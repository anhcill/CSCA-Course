-- Migration 072: Bunny Stream Video Courses, Dual Modes (MIRROR & INDEPENDENT),
-- Video Assets Expansion, Watch Progress, Theory and Content Placements.

-- 1. Extend video_assets with Bunny Stream provider and playback lifecycle fields
ALTER TABLE video_assets
  ALTER COLUMN r2_key DROP NOT NULL;

ALTER TABLE video_assets
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'r2_legacy',
  ADD COLUMN IF NOT EXISTS provider_library_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS provider_video_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS playback_status VARCHAR(50) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS storage_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS available_resolutions TEXT,
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS processing_error TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_assets_provider_check'
  ) THEN
    ALTER TABLE video_assets
      ADD CONSTRAINT video_assets_provider_check
      CHECK (provider IN ('r2_legacy', 'bunny_stream'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_assets_playback_status_check'
  ) THEN
    ALTER TABLE video_assets
      ADD CONSTRAINT video_assets_playback_status_check
      CHECK (playback_status IN ('created', 'uploading', 'processing', 'ready', 'failed', 'deleted'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_video_assets_provider_video
  ON video_assets (provider, provider_library_id, provider_video_id)
  WHERE provider_video_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_assets_bunny_status
  ON video_assets (provider, playback_status, created_at DESC)
  WHERE deleted_at IS NULL;

-- 2. Video course profiles (MIRROR vs INDEPENDENT)
CREATE TABLE IF NOT EXISTS video_course_profiles (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  management_class_id VARCHAR(128),
  mode VARCHAR(30) NOT NULL DEFAULT 'MIRROR'
    CHECK (mode IN ('MIRROR', 'INDEPENDENT')),
  source_live_class_id BIGINT REFERENCES live_classes(id) ON DELETE SET NULL,
  enforce_trusted_devices BOOLEAN NOT NULL DEFAULT TRUE,
  device_limit INTEGER NOT NULL DEFAULT 2 CHECK (device_limit > 0 AND device_limit <= 10),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'draft', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_video_course_mode_source
    CHECK (
      (mode = 'MIRROR' AND source_live_class_id IS NOT NULL) OR
      (mode = 'INDEPENDENT' AND source_live_class_id IS NULL)
    )
);

DROP INDEX IF EXISTS uq_video_course_profiles_course;

-- A course may have multiple paid Record offerings. The Management class is
-- the commercial entitlement boundary; legacy/manual profiles without one
-- remain limited to one profile per course.
CREATE UNIQUE INDEX IF NOT EXISTS uq_video_course_profiles_management_class
  ON video_course_profiles (LOWER(management_class_id))
  WHERE management_class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_video_course_profiles_legacy_course
  ON video_course_profiles (course_id)
  WHERE management_class_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_course_profiles_mgmt_class
  ON video_course_profiles (management_class_id)
  WHERE management_class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_course_profiles_source_class
  ON video_course_profiles (source_live_class_id)
  WHERE source_live_class_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_video_course_profiles_updated_at ON video_course_profiles;
CREATE TRIGGER trg_video_course_profiles_updated_at
  BEFORE UPDATE ON video_course_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Class session & lesson videos (attaching Bunny videos to source live class sessions or independent lessons)
CREATE TABLE IF NOT EXISTS class_session_videos (
  id BIGSERIAL PRIMARY KEY,
  class_session_id BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  video_asset_id BIGINT NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  title VARCHAR(255),
  video_type VARCHAR(30) NOT NULL DEFAULT 'primary'
    CHECK (video_type IN ('primary', 'supplemental')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_class_session_videos_target
    CHECK (
      (class_session_id IS NOT NULL AND lesson_id IS NULL) OR
      (class_session_id IS NULL AND lesson_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_class_session_videos_session_order
  ON class_session_videos (class_session_id, is_published, sort_order, id)
  WHERE class_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_session_videos_lesson_order
  ON class_session_videos (lesson_id, is_published, sort_order, id)
  WHERE lesson_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_session_videos_asset
  ON class_session_videos (video_asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_session_videos_primary_session
  ON class_session_videos (class_session_id)
  WHERE class_session_id IS NOT NULL AND video_type = 'primary';

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_session_videos_primary_lesson
  ON class_session_videos (lesson_id)
  WHERE lesson_id IS NOT NULL AND video_type = 'primary';

DROP TRIGGER IF EXISTS trg_class_session_videos_updated_at ON class_session_videos;
CREATE TRIGGER trg_class_session_videos_updated_at
  BEFORE UPDATE ON class_session_videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Video Watch Progress
CREATE TABLE IF NOT EXISTS video_watch_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_asset_id BIGINT NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  live_class_id BIGINT REFERENCES live_classes(id) ON DELETE CASCADE,
  class_session_id BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  last_position_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  watched_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_video_watch_progress_target
    CHECK (
      (class_session_id IS NOT NULL AND lesson_id IS NULL) OR
      (class_session_id IS NULL AND lesson_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_video_watch_progress_user_video
  ON video_watch_progress (user_id, video_asset_id);

CREATE INDEX IF NOT EXISTS idx_video_watch_progress_user_session
  ON video_watch_progress (user_id, class_session_id)
  WHERE class_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_watch_progress_user_lesson
  ON video_watch_progress (user_id, lesson_id)
  WHERE lesson_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_video_watch_progress_updated_at ON video_watch_progress;
CREATE TRIGGER trg_video_watch_progress_updated_at
  BEFORE UPDATE ON video_watch_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Webhook Events idempotency log
CREATE TABLE IF NOT EXISTS video_provider_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL DEFAULT 'bunny_stream',
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_provider_webhook_status
  ON video_provider_webhook_events (provider, status, created_at DESC);

-- 6. Learning unit theory (rich text, summary, key takeaways, transcript)
CREATE TABLE IF NOT EXISTS learning_unit_theory (
  id BIGSERIAL PRIMARY KEY,
  class_session_id BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  title VARCHAR(255),
  content_html TEXT,
  summary TEXT,
  key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript TEXT,
  timestamps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_learning_unit_theory_target
    CHECK (
      (class_session_id IS NOT NULL AND lesson_id IS NULL) OR
      (class_session_id IS NULL AND lesson_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_unit_theory_session
  ON learning_unit_theory (class_session_id)
  WHERE class_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_unit_theory_lesson
  ON learning_unit_theory (lesson_id)
  WHERE lesson_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_learning_unit_theory_updated_at ON learning_unit_theory;
CREATE TRIGGER trg_learning_unit_theory_updated_at
  BEFORE UPDATE ON learning_unit_theory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Lesson learning file placements (independent lessons)
CREATE TABLE IF NOT EXISTS lesson_learning_file_placements (
  id BIGSERIAL PRIMARY KEY,
  file_id BIGINT NOT NULL REFERENCES lms_learning_files(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  attached_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_learning_file_placement
  ON lesson_learning_file_placements (file_id, lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_learning_file_lesson
  ON lesson_learning_file_placements (lesson_id, sort_order, created_at DESC);

-- 8. Learner personal timestamped notes per unit
CREATE TABLE IF NOT EXISTS video_course_unit_notes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  class_session_id BIGINT REFERENCES class_sessions(id) ON DELETE CASCADE,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_seconds >= 0),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_video_course_unit_notes_target
    CHECK (
      (class_session_id IS NOT NULL AND lesson_id IS NULL) OR
      (class_session_id IS NULL AND lesson_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_video_course_unit_notes_user_session
  ON video_course_unit_notes (user_id, class_session_id, timestamp_seconds ASC)
  WHERE class_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_course_unit_notes_user_lesson
  ON video_course_unit_notes (user_id, lesson_id, timestamp_seconds ASC)
  WHERE lesson_id IS NOT NULL;

-- 9. Extend session vocabularies to support independent lessons
ALTER TABLE session_vocabularies
  ADD COLUMN IF NOT EXISTS lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE;

ALTER TABLE session_vocabularies
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN class_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_vocabulary_target'
  ) THEN
    ALTER TABLE session_vocabularies
      ADD CONSTRAINT chk_session_vocabulary_target
      CHECK (
        (session_id IS NOT NULL AND class_id IS NOT NULL AND lesson_id IS NULL) OR
        (session_id IS NULL AND class_id IS NULL AND lesson_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_vocabularies_lesson
  ON session_vocabularies (lesson_id, order_index, id)
  WHERE lesson_id IS NOT NULL;

-- 10. Extend session formulas to support independent lessons
ALTER TABLE session_formulas
  ADD COLUMN IF NOT EXISTS lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_formula_attachment'
  ) THEN
    ALTER TABLE session_formulas DROP CONSTRAINT chk_session_formula_attachment;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_formula_target'
  ) THEN
    ALTER TABLE session_formulas
      ADD CONSTRAINT chk_session_formula_target
      CHECK (
        (session_id IS NOT NULL AND class_id IS NOT NULL AND lesson_id IS NULL) OR
        (session_id IS NULL AND class_id IS NULL AND lesson_id IS NOT NULL) OR
        (session_id IS NULL AND class_id IS NULL AND lesson_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_formulas_lesson
  ON session_formulas (lesson_id, order_index, id)
  WHERE lesson_id IS NOT NULL;

-- 11. Extend assignments to support independent lessons
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS lesson_id BIGINT REFERENCES lessons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_assignments_lesson
  ON assignments (lesson_id)
  WHERE lesson_id IS NOT NULL;

-- 12. Extend management_class_learning_aliases and class_enrollments for INDEPENDENT recording classes
ALTER TABLE management_class_learning_aliases
  ALTER COLUMN source_class_source_id DROP NOT NULL,
  ALTER COLUMN live_class_id DROP NOT NULL;

ALTER TABLE management_class_learning_aliases
  ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recording_content_mode VARCHAR(30) NOT NULL DEFAULT 'MIRROR';

UPDATE management_class_learning_aliases alias
SET course_id = lc.course_id,
    recording_content_mode = 'MIRROR'
FROM live_classes lc
WHERE alias.live_class_id = lc.id
  AND alias.course_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_management_alias_recording_mode'
  ) THEN
    ALTER TABLE management_class_learning_aliases
      ADD CONSTRAINT chk_management_alias_recording_mode
      CHECK (
        (recording_content_mode = 'MIRROR' AND source_class_source_id IS NOT NULL AND live_class_id IS NOT NULL) OR
        (recording_content_mode = 'INDEPENDENT' AND source_class_source_id IS NULL AND live_class_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_management_class_learning_alias_course
  ON management_class_learning_aliases (course_id, status)
  WHERE course_id IS NOT NULL;

ALTER TABLE class_enrollments
  ALTER COLUMN live_class_id DROP NOT NULL;

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE;

UPDATE class_enrollments enrollment
SET course_id = lc.course_id
FROM live_classes lc
WHERE enrollment.live_class_id = lc.id
  AND enrollment.course_id IS NULL;

UPDATE class_enrollments enrollment
SET course_id = alias.course_id
FROM management_class_learning_aliases alias
WHERE enrollment.management_class_alias_id = alias.id
  AND enrollment.course_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_enrollments_user_alias_independent
  ON class_enrollments (user_id, management_class_alias_id)
  WHERE live_class_id IS NULL AND management_class_alias_id IS NOT NULL;

