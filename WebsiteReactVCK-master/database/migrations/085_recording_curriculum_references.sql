-- Reuse the non-video curriculum of a live class in an independent Record
-- offering without cloning sessions, assessments, files, or theory rows.
CREATE TABLE IF NOT EXISTS recording_curriculum_references (
  id BIGSERIAL PRIMARY KEY,
  video_course_profile_id BIGINT NOT NULL
    REFERENCES video_course_profiles(id) ON DELETE CASCADE,
  destination_management_class_id VARCHAR(128) NOT NULL,
  source_live_class_id BIGINT NOT NULL
    REFERENCES live_classes(id) ON DELETE RESTRICT,
  source_management_class_id VARCHAR(128) NOT NULL,
  include_videos BOOLEAN NOT NULL DEFAULT FALSE CHECK (include_videos = FALSE),
  excluded_session_source_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(excluded_session_source_ids) = 'array'),
  source_updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (video_course_profile_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recording_curriculum_reference_destination
  ON recording_curriculum_references (LOWER(destination_management_class_id));

CREATE INDEX IF NOT EXISTS idx_recording_curriculum_reference_source
  ON recording_curriculum_references (source_live_class_id);

DROP TRIGGER IF EXISTS trg_recording_curriculum_references_updated_at
  ON recording_curriculum_references;
CREATE TRIGGER trg_recording_curriculum_references_updated_at
  BEFORE UPDATE ON recording_curriculum_references
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Optional learner-facing overrides are destination-owned. They do not mutate
-- the source live session and remain stable while source content is refreshed.
CREATE TABLE IF NOT EXISTS recording_curriculum_unit_overrides (
  id BIGSERIAL PRIMARY KEY,
  curriculum_reference_id BIGINT NOT NULL
    REFERENCES recording_curriculum_references(id) ON DELETE CASCADE,
  source_class_session_id BIGINT NOT NULL
    REFERENCES class_sessions(id) ON DELETE RESTRICT,
  title_override VARCHAR(255),
  summary_override TEXT,
  duration_seconds_override INTEGER
    CHECK (duration_seconds_override IS NULL OR duration_seconds_override >= 0),
  sort_order_override INTEGER CHECK (sort_order_override IS NULL OR sort_order_override >= 0),
  is_published_override BOOLEAN,
  is_public_preview_override BOOLEAN,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_reference_id, source_class_session_id)
);

CREATE INDEX IF NOT EXISTS idx_recording_curriculum_unit_overrides_session
  ON recording_curriculum_unit_overrides (source_class_session_id);

DROP TRIGGER IF EXISTS trg_recording_curriculum_unit_overrides_updated_at
  ON recording_curriculum_unit_overrides;
CREATE TRIGGER trg_recording_curriculum_unit_overrides_updated_at
  BEFORE UPDATE ON recording_curriculum_unit_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Videos attached here belong only to the destination Record offering. The
-- referenced live session videos are deliberately never read or copied.
CREATE TABLE IF NOT EXISTS recording_curriculum_unit_videos (
  id BIGSERIAL PRIMARY KEY,
  unit_override_id BIGINT NOT NULL
    REFERENCES recording_curriculum_unit_overrides(id) ON DELETE CASCADE,
  video_asset_id BIGINT NOT NULL REFERENCES video_assets(id) ON DELETE RESTRICT,
  title VARCHAR(255),
  video_type VARCHAR(30) NOT NULL DEFAULT 'primary'
    CHECK (video_type IN ('primary', 'supplemental')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_override_id, video_asset_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recording_curriculum_unit_primary_video
  ON recording_curriculum_unit_videos (unit_override_id)
  WHERE video_type = 'primary';

CREATE INDEX IF NOT EXISTS idx_recording_curriculum_unit_videos_order
  ON recording_curriculum_unit_videos (unit_override_id, is_published, sort_order, id);

DROP TRIGGER IF EXISTS trg_recording_curriculum_unit_videos_updated_at
  ON recording_curriculum_unit_videos;
CREATE TRIGGER trg_recording_curriculum_unit_videos_updated_at
  BEFORE UPDATE ON recording_curriculum_unit_videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
