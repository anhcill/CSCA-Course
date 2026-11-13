-- Course-specific Record access revocation. This intentionally leaves shared
-- Live memberships and LMS entitlements untouched.
CREATE TABLE IF NOT EXISTS video_course_access_revocations (
  id BIGSERIAL PRIMARY KEY,
  video_course_profile_id BIGINT NOT NULL
    REFERENCES video_course_profiles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(500),
  revoked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_video_course_access_revocation UNIQUE (video_course_profile_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_video_course_access_revocations_user
  ON video_course_access_revocations (user_id, video_course_profile_id);

DROP TRIGGER IF EXISTS trg_video_course_access_revocations_updated_at
  ON video_course_access_revocations;
CREATE TRIGGER trg_video_course_access_revocations_updated_at
  BEFORE UPDATE ON video_course_access_revocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
