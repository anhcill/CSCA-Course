ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS video_course_profile_id BIGINT
    REFERENCES video_course_profiles(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS uq_quiz_attempt_number;
DROP INDEX IF EXISTS uq_quiz_active_attempt;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempt_number_scope
  ON quiz_attempts (quiz_id, user_id, COALESCE(video_course_profile_id, 0), attempt_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_active_attempt_scope
  ON quiz_attempts (quiz_id, user_id, COALESCE(video_course_profile_id, 0))
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_video_course_profile
  ON quiz_attempts (video_course_profile_id, quiz_id, user_id, attempt_number DESC)
  WHERE video_course_profile_id IS NOT NULL;

ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS video_course_profile_id BIGINT
    REFERENCES video_course_profiles(id) ON DELETE SET NULL;

ALTER TABLE assignment_submissions
  DROP CONSTRAINT IF EXISTS unique_user_assignment_submission;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_submission_scope
  ON assignment_submissions
    (assignment_id, user_id, COALESCE(video_course_profile_id, 0));

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_video_course_profile
  ON assignment_submissions (video_course_profile_id, assignment_id, user_id)
  WHERE video_course_profile_id IS NOT NULL;
