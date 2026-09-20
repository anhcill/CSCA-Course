-- Migration 018: durable InternalManagement event inbox and LMS roster projection.
-- Safe to rerun. InternalManagement remains the source of truth for identity,
-- course/class membership and entitlement. This migration only adds the
-- information required to make the LMS projection auditable and retryable.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS management_staff_source_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_display_name VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_management_staff_source_id_ci
  ON users (LOWER(management_staff_source_id))
  WHERE management_staff_source_id IS NOT NULL;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS is_management_managed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS management_source_updated_at TIMESTAMPTZ;

-- Existing source-mapped courses must never fall back to self-enrollment or a
-- class roster as their entitlement. New worker-created courses set this flag
-- directly; this backfill protects manual mappings created before migration 018.
UPDATE courses
SET is_management_managed = TRUE
WHERE external_course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courses_management_projection
  ON courses (is_management_managed, management_source_updated_at DESC)
  WHERE is_management_managed = TRUE;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS management_source_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_classes_management_projection
  ON live_classes (management_source_updated_at DESC)
  WHERE management_class_source_id IS NOT NULL;

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS management_membership_source_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_membership_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_enrollments_management_membership_source_id_ci
  ON class_enrollments (LOWER(management_membership_source_id))
  WHERE management_membership_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_enrollments_management_sync
  ON class_enrollments (live_class_id, management_source_updated_at DESC)
  WHERE management_membership_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS class_teachers (
  id                           BIGSERIAL PRIMARY KEY,
  live_class_id                BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  teacher_id                   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  management_teacher_source_id VARCHAR(128),
  teaching_role                VARCHAR(20) NOT NULL DEFAULT 'co_teacher'
                               CHECK (teaching_role IN ('lead', 'co_teacher', 'assistant')),
  status                       VARCHAR(20) NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'revoked')),
  management_source_updated_at TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT class_teachers_class_teacher_unique UNIQUE (live_class_id, teacher_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_teachers_management_source_ci
  ON class_teachers (live_class_id, LOWER(management_teacher_source_id))
  WHERE management_teacher_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher_status
  ON class_teachers (teacher_id, status, live_class_id);

DROP TRIGGER IF EXISTS trg_class_teachers_updated_at ON class_teachers;
CREATE TRIGGER trg_class_teachers_updated_at
  BEFORE UPDATE ON class_teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS lms_sync_inbox (
  id                BIGSERIAL PRIMARY KEY,
  event_id          VARCHAR(128) NOT NULL UNIQUE,
  event_type        VARCHAR(100) NOT NULL,
  source            VARCHAR(100) NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  payload           JSONB NOT NULL,
  payload_hash      CHAR(64) NOT NULL,
  idempotency_key   VARCHAR(180) NOT NULL UNIQUE,
  correlation_id    VARCHAR(128) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'DEAD_LETTER')),
  last_error        TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_lms_sync_inbox_updated_at ON lms_sync_inbox;
CREATE TRIGGER trg_lms_sync_inbox_updated_at
  BEFORE UPDATE ON lms_sync_inbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lms_sync_inbox_status_received
  ON lms_sync_inbox (status, received_at DESC);

ALTER TABLE lms_sync_jobs
  ADD COLUMN IF NOT EXISTS inbox_id BIGINT REFERENCES lms_sync_inbox(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(160),
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_sync_jobs_inbox_id
  ON lms_sync_jobs (inbox_id)
  WHERE inbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lms_sync_jobs_claimable
  ON lms_sync_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'PROCESSING');
