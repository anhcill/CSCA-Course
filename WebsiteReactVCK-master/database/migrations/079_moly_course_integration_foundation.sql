-- Migration 079: Moly Studio <-> CSCA-Course bidirectional integration foundation.
-- Strictly additive & idempotent. Never mutates or drops existing tables/columns
-- (including InternalManagement external_student_id / external_course_id / lms_access_grants).

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = current_schema()
      AND p.proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION prevent_stale_external_sync_regression()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source_updated_at < OLD.source_updated_at THEN
    RAISE EXCEPTION 'STALE_SOURCE_UPDATED_AT: incoming source_updated_at (%) is older than stored (%)',
      NEW.source_updated_at, OLD.source_updated_at
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. external_identities: canonical cross-system identity mapping (never email as canonical key)
CREATE TABLE IF NOT EXISTS external_identities (
  id                BIGSERIAL PRIMARY KEY,
  source_system     VARCHAR(50) NOT NULL
                    CHECK (source_system IN ('moly', 'csca-course', 'internal-management')),
  external_user_id  VARCHAR(128) NOT NULL
                    CHECK (length(btrim(external_user_id)) > 0 AND external_user_id = btrim(external_user_id)),
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked', 'expired', 'suspended')),
  email_snapshot    VARCHAR(255),
  link_method       VARCHAR(30) NOT NULL DEFAULT 'manual'
                    CHECK (link_method IN ('provisioned', 'auto_safe_link', 'manual', 'sso', 'backfill')),
  source_updated_at TIMESTAMPTZ NOT NULL,
  last_synced_at    TIMESTAMPTZ,
  correlation_id    VARCHAR(128),
  linked_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_identities_source_external_user UNIQUE (source_system, external_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_identities_user_source_non_revoked
  ON external_identities (user_id, source_system)
  WHERE status IN ('active', 'suspended');

CREATE INDEX IF NOT EXISTS idx_external_identities_user_lookup
  ON external_identities (user_id, source_system, status);

CREATE INDEX IF NOT EXISTS idx_external_identities_source_updated
  ON external_identities (source_system, source_updated_at DESC);

DROP TRIGGER IF EXISTS trg_external_identities_updated_at ON external_identities;
CREATE TRIGGER trg_external_identities_updated_at
  BEFORE UPDATE ON external_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_external_identities_prevent_stale ON external_identities;
CREATE TRIGGER trg_external_identities_prevent_stale
  BEFORE UPDATE ON external_identities
  FOR EACH ROW EXECUTE FUNCTION prevent_stale_external_sync_regression();

-- 2. external_course_mappings: strictly manual course mapping (no title/slug auto-matching)
CREATE TABLE IF NOT EXISTS external_course_mappings (
  id                              BIGSERIAL PRIMARY KEY,
  source_system                   VARCHAR(50) NOT NULL
                                  CHECK (source_system IN ('moly', 'csca-course', 'internal-management')),
  external_course_id              VARCHAR(128) NOT NULL
                                  CHECK (length(btrim(external_course_id)) > 0 AND external_course_id = btrim(external_course_id)),
  external_course_code            VARCHAR(128),
  external_course_title           VARCHAR(255),
  local_course_id                 BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  local_video_course_profile_id   BIGINT REFERENCES video_course_profiles(id) ON DELETE RESTRICT,
  local_live_class_id             BIGINT REFERENCES live_classes(id) ON DELETE RESTRICT,
  status                          VARCHAR(20) NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'inactive', 'archived')),
  mapping_source                  VARCHAR(30) NOT NULL DEFAULT 'manual'
                                  CHECK (mapping_source IN ('manual', 'admin_manual')),
  source_updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                           TEXT,
  created_by                      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by                      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  metadata                        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_course_mappings_source_external_course UNIQUE (source_system, external_course_id)
);

CREATE INDEX IF NOT EXISTS idx_external_course_mappings_local_course
  ON external_course_mappings (local_course_id, source_system, status);

CREATE INDEX IF NOT EXISTS idx_external_course_mappings_source_status
  ON external_course_mappings (source_system, status, external_course_id);

DROP TRIGGER IF EXISTS trg_external_course_mappings_updated_at ON external_course_mappings;
CREATE TRIGGER trg_external_course_mappings_updated_at
  BEFORE UPDATE ON external_course_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. external_entitlements: durable entitlement ledger keyed by (source_system, external_grant_id)
CREATE TABLE IF NOT EXISTS external_entitlements (
  id                        BIGSERIAL PRIMARY KEY,
  source_system             VARCHAR(50) NOT NULL
                            CHECK (source_system IN ('moly', 'csca-course', 'internal-management')),
  external_grant_id         VARCHAR(128) NOT NULL
                            CHECK (length(btrim(external_grant_id)) > 0 AND external_grant_id = btrim(external_grant_id)),
  external_user_id          VARCHAR(128) NOT NULL
                            CHECK (length(btrim(external_user_id)) > 0 AND external_user_id = btrim(external_user_id)),
  external_course_id        VARCHAR(128) NOT NULL
                            CHECK (length(btrim(external_course_id)) > 0 AND external_course_id = btrim(external_course_id)),
  user_id                   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  local_course_id           BIGINT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  course_mapping_id         BIGINT REFERENCES external_course_mappings(id) ON DELETE RESTRICT,
  external_identity_id      BIGINT REFERENCES external_identities(id) ON DELETE RESTRICT,
  local_lms_access_grant_id BIGINT REFERENCES lms_access_grants(id) ON DELETE RESTRICT,
  status                    VARCHAR(20) NOT NULL
                            CHECK (status IN ('active', 'revoked', 'expired', 'suspended')),
  valid_from                TIMESTAMPTZ NOT NULL,
  valid_until               TIMESTAMPTZ,
  revoked_at                TIMESTAMPTZ,
  revoke_reason             VARCHAR(500),
  source_updated_at         TIMESTAMPTZ NOT NULL,
  last_event_id             VARCHAR(128),
  correlation_id            VARCHAR(128),
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_external_entitlements_source_external_grant UNIQUE (source_system, external_grant_id),
  CONSTRAINT chk_external_entitlements_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT chk_external_entitlements_revoked_at CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_external_entitlements_user_lookup
  ON external_entitlements (user_id, status, valid_until);

CREATE INDEX IF NOT EXISTS idx_external_entitlements_course_lookup
  ON external_entitlements (local_course_id, status);

CREATE INDEX IF NOT EXISTS idx_external_entitlements_source_user_course
  ON external_entitlements (source_system, external_user_id, external_course_id);

DROP TRIGGER IF EXISTS trg_external_entitlements_updated_at ON external_entitlements;
CREATE TRIGGER trg_external_entitlements_updated_at
  BEFORE UPDATE ON external_entitlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_external_entitlements_prevent_stale ON external_entitlements;
CREATE TRIGGER trg_external_entitlements_prevent_stale
  BEFORE UPDATE ON external_entitlements
  FOR EACH ROW EXECUTE FUNCTION prevent_stale_external_sync_regression();

-- 4. integration_inbox: durable idempotent receiver queue with worker claim & stale tracking
CREATE TABLE IF NOT EXISTS integration_inbox (
  id                 BIGSERIAL PRIMARY KEY,
  source_system      VARCHAR(50) NOT NULL
                     CHECK (source_system IN ('moly', 'csca-course', 'internal-management')),
  event_id           VARCHAR(128) NOT NULL
                     CHECK (length(btrim(event_id)) > 0 AND event_id = btrim(event_id)),
  idempotency_key    VARCHAR(180) NOT NULL
                     CHECK (length(btrim(idempotency_key)) > 0 AND idempotency_key = btrim(idempotency_key)),
  correlation_id     VARCHAR(128),
  event_type         VARCHAR(100) NOT NULL CHECK (length(btrim(event_type)) > 0),
  payload_hash       CHAR(64) NOT NULL CHECK (length(btrim(payload_hash)) = 64),
  payload            JSONB NOT NULL,
  headers_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at  TIMESTAMPTZ NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter', 'stale', 'ignored')),
  attempt_count      INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts       INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_retry_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until       TIMESTAMPTZ,
  locked_by          VARCHAR(100),
  processed_at       TIMESTAMPTZ,
  last_error_code    VARCHAR(80),
  last_error_message TEXT,
  response_status    SMALLINT,
  response_body      JSONB,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_integration_inbox_source_event UNIQUE (source_system, event_id),
  CONSTRAINT uq_integration_inbox_source_idempotency UNIQUE (source_system, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_inbox_worker_claim
  ON integration_inbox (status, next_retry_at, locked_until, id)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_integration_inbox_pending
  ON integration_inbox (status, created_at, id)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_integration_inbox_correlation
  ON integration_inbox (correlation_id)
  WHERE correlation_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_integration_inbox_updated_at ON integration_inbox;
CREATE TRIGGER trg_integration_inbox_updated_at
  BEFORE UPDATE ON integration_inbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. integration_outbox: durable sender queue with retry & dead-letter support
CREATE TABLE IF NOT EXISTS integration_outbox (
  id                 BIGSERIAL PRIMARY KEY,
  source_system      VARCHAR(50) NOT NULL
                     CHECK (source_system IN ('moly', 'csca-course', 'internal-management')),
  target_system      VARCHAR(50) NOT NULL
                     CHECK (target_system IN ('moly', 'csca-course', 'internal-management')),
  event_id           VARCHAR(128) NOT NULL UNIQUE
                     CHECK (length(btrim(event_id)) > 0 AND event_id = btrim(event_id)),
  idempotency_key    VARCHAR(180) NOT NULL UNIQUE
                     CHECK (length(btrim(idempotency_key)) > 0 AND idempotency_key = btrim(idempotency_key)),
  correlation_id     VARCHAR(128),
  event_type         VARCHAR(100) NOT NULL CHECK (length(btrim(event_type)) > 0),
  aggregate_type     VARCHAR(80) NOT NULL CHECK (length(btrim(aggregate_type)) > 0),
  aggregate_id       VARCHAR(128) NOT NULL CHECK (length(btrim(aggregate_id)) > 0),
  payload            JSONB NOT NULL,
  source_updated_at  TIMESTAMPTZ NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'cancelled')),
  attempt_count      INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts       INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  next_retry_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until       TIMESTAMPTZ,
  locked_by          VARCHAR(100),
  sent_at            TIMESTAMPTZ,
  last_error_code    VARCHAR(80),
  last_error_message TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_worker_claim
  ON integration_outbox (target_system, status, next_retry_at, locked_until, id)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending
  ON integration_outbox (status, next_retry_at, created_at, id)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_integration_outbox_aggregate
  ON integration_outbox (aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_correlation
  ON integration_outbox (correlation_id)
  WHERE correlation_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_integration_outbox_updated_at ON integration_outbox;
CREATE TRIGGER trg_integration_outbox_updated_at
  BEFORE UPDATE ON integration_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. integration_conflicts: manual review queue for identity/course/entitlement collisions
CREATE TABLE IF NOT EXISTS integration_conflicts (
  id                  BIGSERIAL PRIMARY KEY,
  source_system       VARCHAR(50) NOT NULL
                      CHECK (source_system IN ('moly', 'csca-course', 'internal-management')),
  conflict_type       VARCHAR(60) NOT NULL
                      CHECK (conflict_type IN (
                        'IDENTITY_EMAIL_COLLISION',
                        'PRIVILEGED_ROLE_COLLISION',
                        'IDENTITY_ALREADY_LINKED',
                        'COURSE_MAPPING_MISSING',
                        'ENTITLEMENT_CONFLICT',
                        'STALE_EVENT_CONFLICT',
                        'UNRESOLVED_IDENTITY',
                        'MANUAL_REVIEW_REQUIRED'
                      )),
  status              VARCHAR(20) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed', 'ignored')),
  external_user_id    VARCHAR(128),
  external_course_id  VARCHAR(128),
  external_grant_id   VARCHAR(128),
  inbox_id            BIGINT REFERENCES integration_inbox(id) ON DELETE RESTRICT,
  candidate_user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  existing_user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  local_course_id     BIGINT REFERENCES courses(id) ON DELETE RESTRICT,
  email_hint          VARCHAR(255),
  correlation_id      VARCHAR(128),
  source_updated_at   TIMESTAMPTZ,
  reason              TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_note     TEXT,
  resolved_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_conflicts_status
  ON integration_conflicts (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_integration_conflicts_external_user
  ON integration_conflicts (source_system, external_user_id)
  WHERE external_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_conflicts_candidate_user
  ON integration_conflicts (candidate_user_id)
  WHERE candidate_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_conflicts_correlation
  ON integration_conflicts (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- A grant's subject and destination are immutable, including for direct SQL writers.
CREATE OR REPLACE FUNCTION guard_external_entitlement_binding()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(NEW.source_system, NEW.external_grant_id, NEW.external_user_id,
         NEW.external_course_id, NEW.user_id, NEW.local_course_id)
     IS DISTINCT FROM
     ROW(OLD.source_system, OLD.external_grant_id, OLD.external_user_id,
         OLD.external_course_id, OLD.user_id, OLD.local_course_id) THEN
    RAISE EXCEPTION 'ENTITLEMENT_CONFLICT: grant subject and destination are immutable'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.source_updated_at = OLD.source_updated_at AND
     ROW(NEW.status, NEW.valid_from, NEW.valid_until, NEW.revoked_at, NEW.revoke_reason)
     IS DISTINCT FROM
     ROW(OLD.status, OLD.valid_from, OLD.valid_until, OLD.revoked_at, OLD.revoke_reason) THEN
    RAISE EXCEPTION 'STALE_SOURCE_UPDATED_AT: changing rights requires a strictly newer timestamp'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_entitlements_binding ON external_entitlements;
CREATE TRIGGER trg_external_entitlements_binding
  BEFORE UPDATE ON external_entitlements
  FOR EACH ROW EXECUTE FUNCTION guard_external_entitlement_binding();

-- Recover leases left in processing after a worker exits.
CREATE INDEX IF NOT EXISTS idx_integration_inbox_expired_lease
  ON integration_inbox (locked_until, id) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_integration_outbox_expired_lease
  ON integration_outbox (locked_until, id) WHERE status = 'processing';

DROP TRIGGER IF EXISTS trg_integration_conflicts_updated_at ON integration_conflicts;
CREATE TRIGGER trg_integration_conflicts_updated_at
  BEFORE UPDATE ON integration_conflicts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
