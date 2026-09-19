-- Migration 003: LMS Core tables & columns for HSK/HSKK/CSCA Video Course Platform

-- 1. Video Assets table (Cloudflare R2 metadata)
CREATE TABLE IF NOT EXISTS video_assets (
  id               BIGSERIAL PRIMARY KEY,
  title            VARCHAR(255),
  r2_key           VARCHAR(500) UNIQUE NOT NULL,
  mime_type        VARCHAR(100) NOT NULL DEFAULT 'video/mp4',
  size_bytes       BIGINT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  status           VARCHAR(50) NOT NULL DEFAULT 'ready',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Alter/Add LMS core columns to courses table if exists
ALTER TABLE courses ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'HSK';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT true;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);

-- Sync name -> title if title is NULL
UPDATE courses SET title = name WHERE title IS NULL AND name IS NOT NULL;

-- 3. Sections table (Course Chapters)
CREATE TABLE IF NOT EXISTS sections (
  id         BIGSERIAL PRIMARY KEY,
  course_id  BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Alter/Add LMS core columns to lessons table if exists
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_asset_id BIGINT REFERENCES video_assets(id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;

-- Sync name -> title if title is NULL
UPDATE lessons SET title = name WHERE title IS NULL AND name IS NOT NULL;

-- 5. Enrollments table
CREATE TABLE IF NOT EXISTS enrollments (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status      VARCHAR(50) NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT  unique_user_course_enrollment UNIQUE (user_id, course_id)
);

-- 6. Lesson Progress table
CREATE TABLE IF NOT EXISTS lesson_progress (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id             BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id             BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  last_position_seconds INT NOT NULL DEFAULT 0,
  is_completed          BOOLEAN NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT            unique_user_lesson_progress UNIQUE (user_id, lesson_id)
);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_video_assets_updated_at ON video_assets;
CREATE TRIGGER trg_video_assets_updated_at BEFORE UPDATE ON video_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sections_updated_at ON sections;
CREATE TRIGGER trg_sections_updated_at BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER trg_lesson_progress_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
