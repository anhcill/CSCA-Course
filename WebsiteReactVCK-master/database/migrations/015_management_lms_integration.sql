-- Migration 015: InternalManagement -> CSCA Course LMS integration.
-- Management remains the source of truth for student identity, payment and
-- entitlement. This database stores only the LMS projection and audit trail.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS external_student_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_party_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS management_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS management_class_source_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS is_management_managed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lms_account_status VARCHAR(30) NOT NULL DEFAULT 'unmanaged',
  ADD COLUMN IF NOT EXISTS lms_last_payment_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS management_source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lms_provisioned_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_lms_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_lms_account_status_check
  CHECK (lms_account_status IN ('unmanaged', 'pending_payment', 'active', 'suspended', 'revoked'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_student_id
  ON users (external_student_id)
  WHERE external_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_management_account_status
  ON users (is_management_managed, lms_account_status)
  WHERE is_management_managed = TRUE;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS external_course_id VARCHAR(128);

-- Source IDs from Management are GUID-style identifiers and are case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_external_course_id_ci
  ON courses (LOWER(external_course_id))
  WHERE external_course_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lms_access_grants (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id           BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  access_status       VARCHAR(20) NOT NULL
                      CHECK (access_status IN ('active', 'suspended', 'revoked', 'expired')),
  source_payment_id   VARCHAR(128),
  reason              VARCHAR(500),
  valid_from          TIMESTAMPTZ NOT NULL,
  valid_until         TIMESTAMPTZ,
  source_updated_at   TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  correlation_id      VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lms_access_grants_user_course_unique UNIQUE (user_id, course_id),
  CONSTRAINT lms_access_grants_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from)
);

DROP TRIGGER IF EXISTS trg_lms_access_grants_updated_at ON lms_access_grants;
CREATE TRIGGER trg_lms_access_grants_updated_at
  BEFORE UPDATE ON lms_access_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_lms_access_grants_user_status
  ON lms_access_grants (user_id, access_status, valid_until);

CREATE INDEX IF NOT EXISTS idx_lms_access_grants_course_status
  ON lms_access_grants (course_id, access_status);

-- Every signed command gets one durable result. Retried outbox requests return
-- the original response and cannot change entitlement state a second time.
CREATE TABLE IF NOT EXISTS management_integration_requests (
  id                BIGSERIAL PRIMARY KEY,
  idempotency_key   VARCHAR(180) NOT NULL UNIQUE,
  endpoint          VARCHAR(160) NOT NULL,
  request_hash      CHAR(64) NOT NULL,
  correlation_id    VARCHAR(128),
  response_status   SMALLINT,
  response_body     JSONB,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT management_integration_requests_response_check
    CHECK ((completed_at IS NULL AND response_status IS NULL AND response_body IS NULL)
      OR (completed_at IS NOT NULL AND response_status IS NOT NULL AND response_body IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_management_integration_requests_created_at
  ON management_integration_requests (created_at);
