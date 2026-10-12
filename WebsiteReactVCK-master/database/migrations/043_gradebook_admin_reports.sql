-- Migration 043: Class Gradebook Reports for Admin Monitoring and Analytics

CREATE TABLE IF NOT EXISTS class_gradebook_reports (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  course_id BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  reported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  student_count INT NOT NULL DEFAULT 0,
  average_score NUMERIC(5,2),
  pass_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  pass_rate NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gradebook_reports_class ON class_gradebook_reports(class_id);
CREATE INDEX IF NOT EXISTS idx_gradebook_reports_created ON class_gradebook_reports(created_at DESC);
