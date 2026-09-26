-- Migration 024: replace direct lesson video playback with a managed study link.
-- The link is only returned by the protected classroom endpoint to users allowed
-- to open the course. Existing lessons remain valid and simply start with NULL.

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS learning_url VARCHAR(2000);
