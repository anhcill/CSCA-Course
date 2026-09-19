-- Migration 009: access-path indexes for LMS catalog, classroom and progress
-- Safe to rerun: every index is created idempotently.

CREATE INDEX IF NOT EXISTS idx_courses_published_created
  ON courses (is_published, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sections_course_order
  ON sections (course_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_lessons_course_published_order
  ON lessons (course_id, is_published, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_lessons_section_published_order
  ON lessons (section_id, is_published, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_status_course
  ON enrollments (user_id, status, course_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_course_status_user
  ON enrollments (course_id, status, user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_course_updated
  ON lesson_progress (user_id, course_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_assets_status_key
  ON video_assets (status, r2_key);
