-- Migration 044: Support multiple submission assets (up to 10 photos/files) per assignment submission
ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS file_asset_ids BIGINT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_file_asset_ids
  ON assignment_submissions USING GIN (file_asset_ids);
