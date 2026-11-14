-- Migration 080: Offering-scoped external entitlement & Record membership bridge.
-- Strictly additive & idempotent. Preserves InternalManagement isolation in
-- users.is_management_managed / lms_access_grants while allowing external
-- integrations (such as Moly Studio) to scope entitlements and Record
-- memberships to a specific local_course_id / video_course_profile_id.

ALTER TABLE external_entitlements
  ADD COLUMN IF NOT EXISTS local_video_course_profile_id BIGINT REFERENCES video_course_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS local_live_class_id BIGINT REFERENCES live_classes(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_external_entitlements_user_course_profile
  ON external_entitlements (user_id, local_course_id, local_video_course_profile_id, status, valid_until);

CREATE INDEX IF NOT EXISTS idx_external_entitlements_profile_active
  ON external_entitlements (local_video_course_profile_id, status, valid_until)
  WHERE local_video_course_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION guard_external_entitlement_binding()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(NEW.source_system, NEW.external_grant_id, NEW.external_user_id,
         NEW.external_course_id, NEW.user_id, NEW.local_course_id,
         NEW.local_video_course_profile_id, NEW.local_live_class_id)
     IS DISTINCT FROM
     ROW(OLD.source_system, OLD.external_grant_id, OLD.external_user_id,
         OLD.external_course_id, OLD.user_id, OLD.local_course_id,
         OLD.local_video_course_profile_id, OLD.local_live_class_id) THEN
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

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS video_course_profile_id BIGINT REFERENCES video_course_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS external_entitlement_id BIGINT REFERENCES external_entitlements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS enrollment_source VARCHAR(30) NOT NULL DEFAULT 'local';

ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS chk_class_enrollments_enrollment_source;
ALTER TABLE class_enrollments
  ADD CONSTRAINT chk_class_enrollments_enrollment_source
  CHECK (enrollment_source IN ('local', 'internal-management', 'moly', 'csca-course'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_enrollments_user_profile_external
  ON class_enrollments (user_id, video_course_profile_id, enrollment_source)
  WHERE video_course_profile_id IS NOT NULL AND live_class_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_enrollments_user_course_external
  ON class_enrollments (user_id, course_id, enrollment_source)
  WHERE video_course_profile_id IS NULL
    AND live_class_id IS NULL
    AND management_class_alias_id IS NULL
    AND enrollment_source <> 'local';

CREATE INDEX IF NOT EXISTS idx_class_enrollments_external_lookup
  ON class_enrollments (user_id, enrollment_source, status, video_course_profile_id, course_id)
  WHERE enrollment_source <> 'local';
