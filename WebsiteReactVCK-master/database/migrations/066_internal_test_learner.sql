-- Migration 066: Hidden internal learner used for end-to-end LMS verification.
-- Internal test learners receive access without creating payment records and
-- are excluded from teacher/public roster statistics by application queries.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_internal_test_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS is_internal_test BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_internal_test_account
  ON users (id)
  WHERE is_internal_test_account = TRUE;

CREATE INDEX IF NOT EXISTS idx_class_enrollments_visible_active
  ON class_enrollments (live_class_id, user_id)
  WHERE status = 'active' AND is_internal_test = FALSE;

UPDATE users
SET is_internal_test_account = TRUE,
    is_management_managed = TRUE,
    lms_account_status = 'active',
    updated_at = NOW()
WHERE LOWER(username) = 'khlyp06' AND role = 'user';

CREATE OR REPLACE FUNCTION sync_internal_test_learner(p_user_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO lms_access_grants (
    user_id, course_id, access_status, reason, valid_from, valid_until,
    source_updated_at, revoked_at, correlation_id
  )
  SELECT p_user_id, c.id, 'active', 'INTERNAL_TEST_ACCOUNT', NOW(), NULL,
         NOW(), NULL, 'internal-test-account'
  FROM courses c
  ON CONFLICT (user_id, course_id) DO UPDATE SET
    access_status = 'active',
    reason = 'INTERNAL_TEST_ACCOUNT',
    valid_from = LEAST(lms_access_grants.valid_from, EXCLUDED.valid_from),
    valid_until = NULL,
    source_updated_at = NOW(),
    revoked_at = NULL,
    correlation_id = 'internal-test-account';

  INSERT INTO enrollments (user_id, course_id, status)
  SELECT p_user_id, c.id, 'active'
  FROM courses c
  ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active';

  INSERT INTO class_enrollments (user_id, live_class_id, status, is_internal_test)
  SELECT p_user_id, lc.id, 'active', TRUE
  FROM live_classes lc
  ON CONFLICT (user_id, live_class_id) DO UPDATE SET
    status = 'active',
    is_internal_test = TRUE,
    ended_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_internal_test_learners_for_new_class()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO class_enrollments (user_id, live_class_id, status, is_internal_test)
  SELECT u.id, NEW.id, 'active', TRUE
  FROM users u
  WHERE u.is_internal_test_account = TRUE AND u.role = 'user' AND u.is_locked = FALSE
  ON CONFLICT (user_id, live_class_id) DO UPDATE SET
    status = 'active',
    is_internal_test = TRUE,
    ended_at = NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_internal_test_learners_for_new_course()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO lms_access_grants (
    user_id, course_id, access_status, reason, valid_from, valid_until,
    source_updated_at, revoked_at, correlation_id
  )
  SELECT u.id, NEW.id, 'active', 'INTERNAL_TEST_ACCOUNT', NOW(), NULL,
         NOW(), NULL, 'internal-test-account'
  FROM users u
  WHERE u.is_internal_test_account = TRUE AND u.role = 'user' AND u.is_locked = FALSE
  ON CONFLICT (user_id, course_id) DO UPDATE SET
    access_status = 'active',
    reason = 'INTERNAL_TEST_ACCOUNT',
    valid_until = NULL,
    source_updated_at = NOW(),
    revoked_at = NULL,
    correlation_id = 'internal-test-account';

  INSERT INTO enrollments (user_id, course_id, status)
  SELECT u.id, NEW.id, 'active'
  FROM users u
  WHERE u.is_internal_test_account = TRUE AND u.role = 'user' AND u.is_locked = FALSE
  ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_new_internal_test_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_internal_test_account = TRUE
       AND NEW.role = 'user'
       AND NEW.is_locked = FALSE THEN
      PERFORM sync_internal_test_learner(NEW.id);
    END IF;
  ELSIF NEW.is_internal_test_account = TRUE
     AND NEW.role = 'user'
     AND NEW.is_locked = FALSE
     AND OLD.is_internal_test_account IS DISTINCT FROM TRUE THEN
    PERFORM sync_internal_test_learner(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_classes_internal_test_enrollment ON live_classes;
CREATE TRIGGER trg_live_classes_internal_test_enrollment
  AFTER INSERT ON live_classes
  FOR EACH ROW EXECUTE FUNCTION sync_internal_test_learners_for_new_class();

DROP TRIGGER IF EXISTS trg_courses_internal_test_access ON courses;
CREATE TRIGGER trg_courses_internal_test_access
  AFTER INSERT ON courses
  FOR EACH ROW EXECUTE FUNCTION sync_internal_test_learners_for_new_course();

DROP TRIGGER IF EXISTS trg_users_internal_test_sync ON users;
CREATE TRIGGER trg_users_internal_test_sync
  AFTER INSERT OR UPDATE OF is_internal_test_account ON users
  FOR EACH ROW EXECUTE FUNCTION sync_new_internal_test_learner();

DO $$
DECLARE
  internal_user RECORD;
BEGIN
  FOR internal_user IN
    SELECT id FROM users WHERE is_internal_test_account = TRUE AND role = 'user'
  LOOP
    PERFORM sync_internal_test_learner(internal_user.id);
  END LOOP;
END;
$$;
