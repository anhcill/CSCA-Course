-- Migration 013: Admin console policy, account lock and list indexes.
-- Safe to rerun. Admin mutations are audited by /api/admin.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_admin_list
  ON users (role, is_locked, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courses_admin_list
  ON courses (is_published, category, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_admin_course_status
  ON enrollments (course_id, status, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_admin_course
  ON lesson_progress (course_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_assets_admin_status
  ON video_assets (status, created_at DESC);
