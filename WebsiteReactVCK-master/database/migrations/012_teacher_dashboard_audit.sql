-- Migration 012: teacher dashboard aggregation and auditable LMS mutations.
-- Safe to rerun. Timestamps are stored as timestamptz in UTC.

CREATE TABLE IF NOT EXISTS audit_events (
  id            BIGSERIAL PRIMARY KEY,
  actor_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(80) NOT NULL,
  entity_type   VARCHAR(80) NOT NULL,
  entity_id     BIGINT,
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity_created
  ON audit_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created
  ON audit_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user_status
  ON assignment_submissions (user_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_class_due_instructor
  ON assignments (live_class_id, due_date, instructor_id);

CREATE INDEX IF NOT EXISTS idx_class_attendance_user_status_session
  ON class_attendance (user_id, status, session_id);
