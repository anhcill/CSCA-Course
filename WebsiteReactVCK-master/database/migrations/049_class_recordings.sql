-- Migration 049: Google Drive class recording catalogue
CREATE TABLE IF NOT EXISTS class_recordings (
  id                 BIGSERIAL PRIMARY KEY,
  live_class_id      BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  class_session_id   BIGINT REFERENCES class_sessions(id) ON DELETE SET NULL,
  title              VARCHAR(255) NOT NULL,
  description        TEXT,
  drive_url          VARCHAR(2000) NOT NULL,
  recorded_at        TIMESTAMPTZ,
  duration_minutes   INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  is_published       BOOLEAN NOT NULL DEFAULT FALSE,
  published_at       TIMESTAMPTZ,
  created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_recordings_class_published
  ON class_recordings (live_class_id, is_published, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_recordings_session
  ON class_recordings (class_session_id);

DROP TRIGGER IF EXISTS trg_class_recordings_updated_at ON class_recordings;
CREATE TRIGGER trg_class_recordings_updated_at
  BEFORE UPDATE ON class_recordings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
