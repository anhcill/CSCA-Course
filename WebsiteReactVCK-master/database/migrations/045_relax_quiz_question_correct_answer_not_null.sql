-- Migration 045: Relax NOT NULL constraint on quiz_questions.correct_answer for essay/open-ended questions
ALTER TABLE quiz_questions ALTER COLUMN correct_answer DROP NOT NULL;
