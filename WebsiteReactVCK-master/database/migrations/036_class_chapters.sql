-- A class chapter is the syllabus unit shown before its teaching sessions.
-- Legacy and Management-generated sessions use one visible holding chapter per
-- class until an administrator assigns more specific chapters.
CREATE TABLE IF NOT EXISTS class_chapters (
  id BIGSERIAL PRIMARY KEY,
  live_class_id BIGINT NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 1 CHECK (position >= 0),
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_teacher_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, live_class_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_chapters_one_default
  ON class_chapters (live_class_id) WHERE is_system_default;
CREATE INDEX IF NOT EXISTS idx_class_chapters_order
  ON class_chapters (live_class_id, position, id);
CREATE INDEX IF NOT EXISTS idx_class_chapters_teacher
  ON class_chapters (assigned_teacher_id, live_class_id)
  WHERE assigned_teacher_id IS NOT NULL;

ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS chapter_id BIGINT;

INSERT INTO class_chapters (live_class_id, title, position, is_system_default)
SELECT DISTINCT cs.live_class_id, 'Các buổi học hiện có', 0, TRUE
FROM class_sessions cs
WHERE cs.chapter_id IS NULL
ON CONFLICT (live_class_id) WHERE is_system_default DO NOTHING;

UPDATE class_sessions cs
SET chapter_id = cc.id
FROM class_chapters cc
WHERE cs.live_class_id = cc.live_class_id
  AND cc.is_system_default
  AND cs.chapter_id IS NULL;

-- Inbound Management calendar events and recurring-series materialization can
-- create sessions outside the authoring API. Keep those sessions visible too.
CREATE OR REPLACE FUNCTION ensure_class_session_chapter()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.chapter_id IS NULL THEN
    INSERT INTO class_chapters (live_class_id, title, position, is_system_default)
    VALUES (NEW.live_class_id, 'Các buổi học hiện có', 0, TRUE)
    ON CONFLICT (live_class_id) WHERE is_system_default DO NOTHING;
    SELECT id INTO NEW.chapter_id FROM class_chapters
    WHERE live_class_id = NEW.live_class_id AND is_system_default;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_class_session_chapter ON class_sessions;
CREATE TRIGGER trg_class_session_chapter
  BEFORE INSERT OR UPDATE OF chapter_id, live_class_id ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION ensure_class_session_chapter();

ALTER TABLE class_sessions
  ADD CONSTRAINT fk_class_session_chapter_same_class
  FOREIGN KEY (chapter_id, live_class_id)
  REFERENCES class_chapters (id, live_class_id);
ALTER TABLE class_sessions ALTER COLUMN chapter_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_sessions_chapter_start
  ON class_sessions (chapter_id, start_time, id);
