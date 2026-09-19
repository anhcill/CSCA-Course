-- Migration 004: Live Online Classes & Google Meet / Zoom Integration

-- 1. Live Classes table
CREATE TABLE IF NOT EXISTS live_classes (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  course_id     BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  instructor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  description   TEXT,
  max_students  INT NOT NULL DEFAULT 30,
  status        VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Class Weekly Schedules table (Weekly recurring timetable)
CREATE TABLE IF NOT EXISTS class_schedules (
  id            BIGSERIAL PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL, -- 1 = Mon, 2 = Tue, ..., 7 = Sun
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Class Sessions table (Specific live room sessions with Google Meet/Zoom link)
CREATE TABLE IF NOT EXISTS class_sessions (
  id            BIGSERIAL PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  meet_url      VARCHAR(500), -- Google Meet or Zoom link
  passcode      VARCHAR(50),
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'live', 'ended', 'cancelled'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Class Enrollments table (Learners enrolled in live classes)
CREATE TABLE IF NOT EXISTS class_enrollments (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  status        VARCHAR(50) NOT NULL DEFAULT 'active',
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT    unique_user_live_class UNIQUE (user_id, live_class_id)
);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_live_classes_updated_at ON live_classes;
CREATE TRIGGER trg_live_classes_updated_at BEFORE UPDATE ON live_classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_class_sessions_updated_at ON class_sessions;
CREATE TRIGGER trg_class_sessions_updated_at BEFORE UPDATE ON class_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
