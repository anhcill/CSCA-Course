ALTER TABLE video_course_profiles
  ADD COLUMN IF NOT EXISTS allow_file_download BOOLEAN NOT NULL DEFAULT FALSE;

