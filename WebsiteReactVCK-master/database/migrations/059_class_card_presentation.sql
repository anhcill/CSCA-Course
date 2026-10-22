-- Presentation fields controlled by admins for learner-facing class cards.
ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS teacher_display_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(1000);

