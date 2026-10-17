-- Keep chapter ownership and visible lesson names aligned with their class.
UPDATE class_chapters cc
SET assigned_teacher_id = lc.instructor_id,
    updated_at = NOW()
FROM live_classes lc
WHERE cc.live_class_id = lc.id
  AND cc.assigned_teacher_id IS NULL
  AND lc.instructor_id IS NOT NULL;

-- A named curriculum chapter is the source of truth for its lesson titles.
-- The system holding chapter is excluded because it can contain unrelated lessons.
UPDATE class_sessions cs
SET title = cc.title,
    version = version + 1,
    updated_at = NOW()
FROM class_chapters cc
WHERE cs.chapter_id = cc.id
  AND cs.live_class_id = cc.live_class_id
  AND cc.is_system_default = FALSE
  AND cs.title IS DISTINCT FROM cc.title;

-- Sessions arriving from InternalManagement still receive a visible holding
-- chapter, now owned by the class's primary teacher by default.
CREATE OR REPLACE FUNCTION ensure_class_session_chapter()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.chapter_id IS NULL THEN
    INSERT INTO class_chapters (
      live_class_id, title, position, is_system_default, assigned_teacher_id
    )
    SELECT NEW.live_class_id, 'Các buổi học hiện có', 0, TRUE, lc.instructor_id
    FROM live_classes lc
    WHERE lc.id = NEW.live_class_id
    ON CONFLICT (live_class_id) WHERE is_system_default DO UPDATE
      SET assigned_teacher_id = COALESCE(class_chapters.assigned_teacher_id, EXCLUDED.assigned_teacher_id),
          updated_at = CASE
            WHEN class_chapters.assigned_teacher_id IS NULL AND EXCLUDED.assigned_teacher_id IS NOT NULL
              THEN NOW()
            ELSE class_chapters.updated_at
          END;
    SELECT id INTO NEW.chapter_id
    FROM class_chapters
    WHERE live_class_id = NEW.live_class_id AND is_system_default;
  END IF;
  RETURN NEW;
END $$;
