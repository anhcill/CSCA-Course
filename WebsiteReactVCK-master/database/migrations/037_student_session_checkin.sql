-- Student check-ins can arrive before the teacher finalizes the full roster.
-- Existing attendance sheets were final under the original write-once policy.
CREATE TABLE IF NOT EXISTS class_attendance_sheets (
  session_id BIGINT PRIMARY KEY REFERENCES class_sessions(id) ON DELETE CASCADE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO class_attendance_sheets (session_id, finalized_at)
SELECT session_id, MIN(checked_at)
FROM class_attendance
GROUP BY session_id
ON CONFLICT (session_id) DO NOTHING;

ALTER TABLE class_attendance
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'teacher';

