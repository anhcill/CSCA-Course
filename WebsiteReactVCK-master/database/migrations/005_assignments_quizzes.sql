-- Migration 005: Assignments, Quizzes & Grading System for LMS HSK / HSKK / CSCA

-- 1. Assignments table (Homework, essay, speaking tasks)
CREATE TABLE IF NOT EXISTS assignments (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  course_id     BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  live_class_id BIGINT REFERENCES live_classes(id) ON DELETE CASCADE,
  instructor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  description   TEXT,
  max_score     NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  due_date      TIMESTAMPTZ,
  attachment_url VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Quizzes table (Multiple-choice exams)
CREATE TABLE IF NOT EXISTS quizzes (
  id               BIGSERIAL PRIMARY KEY,
  title            VARCHAR(255) NOT NULL,
  course_id        BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id        BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  duration_minutes INT NOT NULL DEFAULT 30,
  passing_score    NUMERIC(5,2) NOT NULL DEFAULT 60.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Quiz Questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id             BIGSERIAL PRIMARY KEY,
  quiz_id        BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  question_type  VARCHAR(50) NOT NULL DEFAULT 'single_choice', -- 'single_choice', 'multiple_choice', 'fill_blank'
  options_json   JSONB, -- e.g. [{"key":"A","text":"你好"},{"key":"B","text":"谢谢"}]
  correct_answer TEXT NOT NULL,
  explanation    TEXT,
  points         NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  sort_order     INT NOT NULL DEFAULT 1
);

-- 4. Assignment Submissions table (Learner homework submission)
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_text  TEXT,
  file_url      VARCHAR(500),
  audio_url     VARCHAR(500), -- HSKK speaking audio recording URL
  status        VARCHAR(50) NOT NULL DEFAULT 'submitted', -- 'submitted', 'graded', 'late'
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT    unique_user_assignment_submission UNIQUE (user_id, assignment_id)
);

-- 5. Submission Grades table (Instructor feedback & score)
CREATE TABLE IF NOT EXISTS submission_grades (
  id            BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  grader_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  score         NUMERIC(5,2) NOT NULL,
  feedback_text TEXT,
  graded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_assignments_updated_at ON assignments;
CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_quizzes_updated_at ON quizzes;
CREATE TRIGGER trg_quizzes_updated_at BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
