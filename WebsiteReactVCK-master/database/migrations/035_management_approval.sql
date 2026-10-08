-- Existing production classes and enrollments remain approved. New Management
-- projections enter an admin queue before learners can access them.
ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS management_approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS management_requested_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS management_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE class_enrollments
  ADD COLUMN IF NOT EXISTS management_approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS management_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_classes_management_approval
  ON live_classes (management_approval_status, created_at DESC)
  WHERE management_class_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_enrollments_management_approval
  ON class_enrollments (management_approval_status, enrolled_at DESC)
  WHERE management_membership_source_id IS NOT NULL;
