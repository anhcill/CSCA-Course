-- Migration 052: one Google Drive recording folder per live class
CREATE TABLE IF NOT EXISTS class_recording_folders (
  live_class_id  BIGINT PRIMARY KEY REFERENCES live_classes(id) ON DELETE CASCADE,
  drive_url      VARCHAR(2000) NOT NULL,
  is_published   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_class_recording_folders_updated_at ON class_recording_folders;
CREATE TRIGGER trg_class_recording_folders_updated_at
  BEFORE UPDATE ON class_recording_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- A recording may use the class folder without having a separate file URL.
ALTER TABLE class_recordings ALTER COLUMN drive_url DROP NOT NULL;
