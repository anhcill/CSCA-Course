-- Allow admins to expose selected video-course units as marketing previews.
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS is_public_preview BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS is_public_preview BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_class_sessions_public_preview
  ON class_sessions (live_class_id, start_time, id)
  WHERE is_public_preview = TRUE AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_lessons_public_preview
  ON lessons (course_id, sort_order, id)
  WHERE is_public_preview = TRUE;
