-- MOLI-style quiz authoring groups and rich question content.
-- This migration is additive so legacy quizzes remain readable.

CREATE TABLE IF NOT EXISTS quiz_question_groups (
  id                BIGSERIAL PRIMARY KEY,
  quiz_id           BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  group_type        VARCHAR(30) NOT NULL
                    CHECK (group_type IN ('reading_passage', 'fill_blank_pool')),
  passage_text      TEXT NOT NULL DEFAULT '',
  passage_text_cn   TEXT,
  passage_text_en   TEXT,
  passage_image_url TEXT,
  linked_options    JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(linked_options) = 'array'),
  cloze_mode        VARCHAR(20)
                    CHECK (cloze_mode IS NULL OR cloze_mode IN ('sentences', 'passage')),
  sort_order        INTEGER NOT NULL CHECK (sort_order > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_question_groups_quiz_order
  ON quiz_question_groups (quiz_id, sort_order, id);

DROP TRIGGER IF EXISTS trg_quiz_question_groups_updated_at ON quiz_question_groups;
CREATE TRIGGER trg_quiz_question_groups_updated_at
  BEFORE UPDATE ON quiz_question_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS group_id BIGINT
    REFERENCES quiz_question_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS item_order INTEGER,
  ADD COLUMN IF NOT EXISTS question_text_cn TEXT,
  ADD COLUMN IF NOT EXISTS question_text_en TEXT,
  ADD COLUMN IF NOT EXISTS explanation_cn TEXT,
  ADD COLUMN IF NOT EXISTS explanation_en TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS explanation_image_url TEXT,
  ADD COLUMN IF NOT EXISTS sub_question_number INTEGER,
  ADD COLUMN IF NOT EXISTS ocr_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE quiz_questions
  DROP CONSTRAINT IF EXISTS quiz_questions_item_order_check;
ALTER TABLE quiz_questions
  ADD CONSTRAINT quiz_questions_item_order_check
  CHECK (item_order IS NULL OR item_order > 0);

ALTER TABLE quiz_questions
  DROP CONSTRAINT IF EXISTS quiz_questions_sub_question_number_check;
ALTER TABLE quiz_questions
  ADD CONSTRAINT quiz_questions_sub_question_number_check
  CHECK (sub_question_number IS NULL OR sub_question_number > 0);

ALTER TABLE quiz_questions
  DROP CONSTRAINT IF EXISTS quiz_questions_ocr_metadata_check;
ALTER TABLE quiz_questions
  ADD CONSTRAINT quiz_questions_ocr_metadata_check
  CHECK (jsonb_typeof(ocr_metadata) = 'object');

ALTER TABLE quiz_questions
  DROP CONSTRAINT IF EXISTS quiz_questions_type_v2_check;
ALTER TABLE quiz_questions
  ADD CONSTRAINT quiz_questions_type_v2_check
  CHECK (question_type IN (
    'single_choice',
    'multiple_choice',
    'true_false',
    'reading_item',
    'fill_blank_item',
    'essay',
    'translation'
  )) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_group_order
  ON quiz_questions (group_id, sort_order, id)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_group_order
  ON quiz_questions (quiz_id, group_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_item_order
  ON quiz_questions (quiz_id, item_order, sort_order, id);
