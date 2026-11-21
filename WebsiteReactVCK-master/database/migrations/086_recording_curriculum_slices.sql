-- Allow one source Live session to appear as multiple destination-owned Record
-- lessons without cloning the source vocabulary, formulas, files or videos.
ALTER TABLE recording_curriculum_unit_overrides
  ADD COLUMN IF NOT EXISTS slice_key VARCHAR(64) NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS content_filter JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(content_filter) = 'object');

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'recording_curriculum_unit_overrides'::regclass
    AND con.contype = 'u'
    AND (
      SELECT array_agg(att.attname ORDER BY att.attname)
      FROM unnest(con.conkey) AS key(attnum)
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = key.attnum
    ) = ARRAY['curriculum_reference_id', 'source_class_session_id']::name[]
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE recording_curriculum_unit_overrides DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recording_curriculum_unit_override_slice
  ON recording_curriculum_unit_overrides
    (curriculum_reference_id, source_class_session_id, slice_key);

-- Quizzes created specifically for a Record slice stay destination-owned and
-- never modify the source Live class quiz.
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS recording_curriculum_unit_override_id BIGINT
    REFERENCES recording_curriculum_unit_overrides(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_quizzes_recording_curriculum_override
  ON quizzes (recording_curriculum_unit_override_id)
  WHERE recording_curriculum_unit_override_id IS NOT NULL;
