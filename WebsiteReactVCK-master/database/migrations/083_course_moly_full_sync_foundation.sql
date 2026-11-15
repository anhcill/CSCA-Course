-- Migration 083: CSCA-Course <-> Moly Studio Full Sync v2 Foundation (Day 1).
-- Strictly additive & idempotent. Preserves all v1 integration tables/flows,
-- InternalManagement isolation, and learning/assessment history (ON DELETE RESTRICT).

-- 1. Additive monotonic sync_revision & tombstone metadata on canonical Course aggregates
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS sync_revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sync_deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'courses'::regclass
      AND conname = 'chk_courses_sync_revision_positive'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT chk_courses_sync_revision_positive CHECK (sync_revision >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_sync_revision_id
  ON courses (sync_revision ASC, id ASC);

ALTER TABLE video_course_profiles
  ADD COLUMN IF NOT EXISTS sync_revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'video_course_profiles'::regclass
      AND conname = 'chk_video_course_profiles_sync_revision_positive'
  ) THEN
    ALTER TABLE video_course_profiles
      ADD CONSTRAINT chk_video_course_profiles_sync_revision_positive CHECK (sync_revision >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_course_profiles_sync_revision_id
  ON video_course_profiles (sync_revision ASC, id ASC);

ALTER TABLE video_course_unit_notes
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(180),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'video_course_unit_notes'::regclass
      AND conname = 'chk_video_course_unit_notes_revision_positive'
  ) THEN
    ALTER TABLE video_course_unit_notes
      ADD CONSTRAINT chk_video_course_unit_notes_revision_positive CHECK (revision >= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_video_course_unit_notes_user_idempotency
  ON video_course_unit_notes (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE video_watch_progress
  ADD COLUMN IF NOT EXISTS last_heartbeat_seq BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delegated_session_id BIGINT,
  ADD COLUMN IF NOT EXISTS sync_revision BIGINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'video_watch_progress'::regclass
      AND conname = 'chk_video_watch_progress_heartbeat_seq'
  ) THEN
    ALTER TABLE video_watch_progress
      ADD CONSTRAINT chk_video_watch_progress_heartbeat_seq
      CHECK (last_heartbeat_seq >= 0 AND sync_revision >= 1);
  END IF;
END $$;

ALTER TABLE trusted_login_devices
  ADD COLUMN IF NOT EXISTS device_source VARCHAR(32) NOT NULL DEFAULT 'csca_course';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'trusted_login_devices'::regclass
      AND conname = 'chk_trusted_login_devices_device_source'
  ) THEN
    ALTER TABLE trusted_login_devices
      ADD CONSTRAINT chk_trusted_login_devices_device_source
      CHECK (device_source IN ('csca_course', 'moly_delegated', 'sso_bound'));
  END IF;
END $$;

-- 2. Course -> Moly transactional outbound outbox (v2.0)
CREATE TABLE IF NOT EXISTS course_integration_outbox (
  id                 BIGSERIAL PRIMARY KEY,
  source_system      VARCHAR(50) NOT NULL DEFAULT 'csca-course'
                     CHECK (source_system = 'csca-course'),
  target_system      VARCHAR(50) NOT NULL DEFAULT 'moly'
                     CHECK (target_system IN ('moly')),
  schema_version     VARCHAR(16) NOT NULL DEFAULT '2.0'
                     CHECK (schema_version = '2.0'),
  event_id           VARCHAR(180) NOT NULL UNIQUE
                     CHECK (length(btrim(event_id)) > 0 AND event_id = btrim(event_id)),
  idempotency_key    VARCHAR(200) NOT NULL UNIQUE
                     CHECK (length(btrim(idempotency_key)) > 0 AND idempotency_key = btrim(idempotency_key)),
  correlation_id     VARCHAR(128),
  event_type         VARCHAR(100) NOT NULL CHECK (length(btrim(event_type)) > 0),
  aggregate_type     VARCHAR(80) NOT NULL CHECK (length(btrim(aggregate_type)) > 0),
  aggregate_id       VARCHAR(128) NOT NULL CHECK (length(btrim(aggregate_id)) > 0),
  aggregate_revision BIGINT NOT NULL CHECK (aggregate_revision >= 1),
  deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at         TIMESTAMPTZ,
  source_updated_at  TIMESTAMPTZ NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload            JSONB NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'cancelled')),
  attempt_count      INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts       INTEGER NOT NULL DEFAULT 10 CHECK (max_attempts > 0),
  next_retry_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until       TIMESTAMPTZ,
  locked_by          VARCHAR(100),
  sent_at            TIMESTAMPTZ,
  last_error_code    VARCHAR(80),
  last_error_message TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_course_outbox_deleted_timestamp CHECK (deleted = FALSE OR deleted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_course_integration_outbox_worker_claim
  ON course_integration_outbox (target_system, status, next_retry_at, locked_until, id)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_course_integration_outbox_aggregate_rev
  ON course_integration_outbox (aggregate_type, aggregate_id, aggregate_revision DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_course_integration_outbox_expired_lease
  ON course_integration_outbox (locked_until, id)
  WHERE status = 'processing';

DROP TRIGGER IF EXISTS trg_course_integration_outbox_updated_at ON course_integration_outbox;
CREATE TRIGGER trg_course_integration_outbox_updated_at
  BEFORE UPDATE ON course_integration_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Export & stream high-water checkpoint registry
CREATE TABLE IF NOT EXISTS course_sync_checkpoints (
  stream_name              VARCHAR(100) PRIMARY KEY
                           CHECK (length(btrim(stream_name)) > 0 AND stream_name = btrim(stream_name)),
  consumer_system          VARCHAR(50) NOT NULL DEFAULT 'moly'
                           CHECK (consumer_system IN ('moly')),
  last_cursor              VARCHAR(255),
  after_entity_id          BIGINT NOT NULL DEFAULT 0 CHECK (after_entity_id >= 0),
  high_water_revision      BIGINT NOT NULL DEFAULT 0 CHECK (high_water_revision >= 0),
  snapshot_anchor_revision BIGINT CHECK (snapshot_anchor_revision IS NULL OR snapshot_anchor_revision >= 0),
  high_water_updated_at    TIMESTAMPTZ,
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_course_sync_checkpoints_updated_at ON course_sync_checkpoints;
CREATE TRIGGER trg_course_sync_checkpoints_updated_at
  BEFORE UPDATE ON course_sync_checkpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Cross-app physical browser <-> Course Record slot binding
-- Prevents a single physical browser (using both Moly & Course) from consuming two slots,
-- and strictly requires server-minted HttpOnly device token hashes (never client x-device-id).
CREATE TABLE IF NOT EXISTS moly_device_bindings (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  external_user_id       VARCHAR(128) NOT NULL
                         CHECK (length(btrim(external_user_id)) > 0 AND external_user_id = btrim(external_user_id)),
  moly_device_token_hash CHAR(64) NOT NULL
                         CHECK (moly_device_token_hash ~ '^[0-9a-f]{64}$'),
  trusted_device_id      BIGINT NOT NULL REFERENCES trusted_login_devices(id) ON DELETE RESTRICT,
  binding_source         VARCHAR(32) NOT NULL
                         CHECK (binding_source IN ('sso_browser_tx', 'delegated_proof', 'admin_rebind')),
  status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'revoked')),
  first_bound_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at             TIMESTAMPTZ,
  revoked_reason         VARCHAR(255),
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_moly_device_bindings_revoked CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moly_device_bindings_user_moly_active
  ON moly_device_bindings (user_id, moly_device_token_hash)
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_moly_device_bindings_trusted_device_active
  ON moly_device_bindings (trusted_device_id)
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_moly_device_bindings_user_lookup
  ON moly_device_bindings (user_id, status, last_seen_at DESC);

CREATE OR REPLACE FUNCTION guard_moly_device_binding_owner()
RETURNS TRIGGER AS $$
DECLARE
  slot_user_id BIGINT;
  slot_revoked_at TIMESTAMPTZ;
BEGIN
  SELECT user_id, revoked_at INTO slot_user_id, slot_revoked_at
  FROM trusted_login_devices
  WHERE id = NEW.trusted_device_id;

  IF slot_user_id IS NULL THEN
    RAISE EXCEPTION 'DEVICE_BINDING_MISSING_SLOT: trusted_login_devices id % not found', NEW.trusted_device_id
      USING ERRCODE = 'P0001';
  END IF;

  IF slot_user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'DEVICE_BINDING_OWNER_MISMATCH: slot owner (%) does not match binding user (%)',
      slot_user_id, NEW.user_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'active' AND NEW.revoked_at IS NULL AND slot_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'DEVICE_BINDING_REVOKED_SLOT: cannot bind active slot to revoked trusted device %',
      NEW.trusted_device_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_moly_device_bindings_owner ON moly_device_bindings;
CREATE TRIGGER trg_moly_device_bindings_owner
  BEFORE INSERT OR UPDATE ON moly_device_bindings
  FOR EACH ROW EXECUTE FUNCTION guard_moly_device_binding_owner();

DROP TRIGGER IF EXISTS trg_moly_device_bindings_updated_at ON moly_device_bindings;
CREATE TRIGGER trg_moly_device_bindings_updated_at
  BEFORE UPDATE ON moly_device_bindings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Delegated learning sessions (short-lived, least-privilege, nonce-protected)
CREATE TABLE IF NOT EXISTS delegated_learning_sessions (
  id                      BIGSERIAL PRIMARY KEY,
  jti                     VARCHAR(128) NOT NULL UNIQUE
                          CHECK (length(btrim(jti)) > 0 AND jti = btrim(jti)),
  session_token_hash      CHAR(64) NOT NULL UNIQUE
                          CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
  nonce_hash              CHAR(64) NOT NULL UNIQUE
                          CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  user_id                 BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  external_user_id        VARCHAR(128) NOT NULL
                          CHECK (length(btrim(external_user_id)) > 0 AND external_user_id = btrim(external_user_id)),
  course_id               BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  video_course_profile_id BIGINT NOT NULL REFERENCES video_course_profiles(id) ON DELETE RESTRICT,
  trusted_device_id       BIGINT REFERENCES trusted_login_devices(id) ON DELETE RESTRICT,
  device_binding_id       BIGINT REFERENCES moly_device_bindings(id) ON DELETE RESTRICT,
  audience                VARCHAR(80) NOT NULL DEFAULT 'csca-course:delegated-learning'
                          CHECK (audience = 'csca-course:delegated-learning'),
  scopes                  TEXT[] NOT NULL
                          CHECK (
                            cardinality(scopes) > 0
                            AND array_position(scopes, NULL) IS NULL
                            AND scopes <@ ARRAY[
                              'workspace:read', 'video:play', 'progress:write',
                              'file:view', 'file:download',
                              'quiz:attempt', 'assignment:submit',
                              'notes:rw', 'qa:rw'
                            ]::TEXT[]
                          ),
  correlation_id          VARCHAR(128),
  issued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ NOT NULL,
  last_used_at            TIMESTAMPTZ,
  revoked_at              TIMESTAMPTZ,
  revoked_reason          VARCHAR(255),
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_delegated_learning_sessions_ttl
    CHECK (expires_at > issued_at AND expires_at <= issued_at + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_delegated_learning_sessions_user_profile_active
  ON delegated_learning_sessions (user_id, video_course_profile_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_delegated_learning_sessions_device_binding
  ON delegated_learning_sessions (device_binding_id)
  WHERE device_binding_id IS NOT NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION guard_delegated_learning_session_scope()
RETURNS TRIGGER AS $$
DECLARE
  profile_course_id BIGINT;
BEGIN
  SELECT course_id INTO profile_course_id
  FROM video_course_profiles
  WHERE id = NEW.video_course_profile_id;

  IF profile_course_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_SCOPE_MISSING: video_course_profiles id % not found', NEW.video_course_profile_id
      USING ERRCODE = 'P0001';
  END IF;

  IF profile_course_id <> NEW.course_id THEN
    RAISE EXCEPTION 'PROFILE_SCOPE_MISMATCH: profile % belongs to course %, not %',
      NEW.video_course_profile_id, profile_course_id, NEW.course_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delegated_learning_session_scope ON delegated_learning_sessions;
CREATE TRIGGER trg_delegated_learning_session_scope
  BEFORE INSERT OR UPDATE ON delegated_learning_sessions
  FOR EACH ROW EXECUTE FUNCTION guard_delegated_learning_session_scope();

DROP TRIGGER IF EXISTS trg_delegated_learning_sessions_updated_at ON delegated_learning_sessions;
CREATE TRIGGER trg_delegated_learning_sessions_updated_at
  BEFORE UPDATE ON delegated_learning_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
