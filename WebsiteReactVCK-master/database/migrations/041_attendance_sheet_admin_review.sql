-- Teacher finalization remains effective immediately; administrators review the
-- finalized sheet afterwards without reopening the attendance records.
ALTER TABLE class_attendance_sheets
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_sheets_pending_review
  ON class_attendance_sheets (finalized_at DESC, session_id)
  WHERE reviewed_at IS NULL;
