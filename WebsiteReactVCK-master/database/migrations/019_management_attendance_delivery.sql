-- Migration 019: durable LMS -> InternalManagement attendance delivery.
-- The teacher's submit action persists an immutable attendance snapshot here
-- and sends it immediately. The worker retries automatically if Management is
-- briefly unavailable, so there is no manual "sync" step in the teacher UI.

CREATE TABLE IF NOT EXISTS lms_management_attendance_outbox (
  id                BIGSERIAL PRIMARY KEY,
  event_id          UUID NOT NULL UNIQUE,
  event_type        VARCHAR(100) NOT NULL,
  payload           JSONB NOT NULL,
  payload_hash      CHAR(64) NOT NULL,
  correlation_id    VARCHAR(128) NOT NULL,
  idempotency_key   VARCHAR(180) NOT NULL UNIQUE,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'DEAD_LETTER')),
  retry_count       INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries       INTEGER NOT NULL DEFAULT 12 CHECK (max_retries > 0),
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at   TIMESTAMPTZ,
  locked_at         TIMESTAMPTZ,
  locked_by         VARCHAR(160),
  last_error        TEXT,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_lms_management_attendance_outbox_updated_at
  ON lms_management_attendance_outbox;
CREATE TRIGGER trg_lms_management_attendance_outbox_updated_at
  BEFORE UPDATE ON lms_management_attendance_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lms_management_attendance_outbox_claimable
  ON lms_management_attendance_outbox (status, next_attempt_at, id)
  WHERE status IN ('PENDING', 'PROCESSING');
