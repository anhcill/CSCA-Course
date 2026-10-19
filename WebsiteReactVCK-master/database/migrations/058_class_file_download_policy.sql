-- Classes can expose learning files for inline viewing without allowing the
-- learner-facing download action. Existing trial classes start in view-only mode.
ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS allow_file_download BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE live_classes
SET allow_file_download = FALSE
WHERE LOWER(title) LIKE '%học thử%'
   OR LOWER(title) LIKE '%trial%';
