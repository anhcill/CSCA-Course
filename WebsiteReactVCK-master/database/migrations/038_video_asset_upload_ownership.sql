-- Bind new video upload intents to the teacher who requested the signed URL.
-- Existing assets have no trustworthy owner and remain admin-managed.
ALTER TABLE video_assets
  ADD COLUMN IF NOT EXISTS uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_video_assets_uploader_status
  ON video_assets (uploaded_by, status, created_at DESC);
