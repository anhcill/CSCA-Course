-- Migration 067: remove imported chapter headings accidentally appended to
-- detailed solutions for the trigonometry quiz.

UPDATE quiz_questions AS qq
SET explanation = regexp_replace(
  qq.explanation,
  E'\\n\\s*---\\s*\\n\\s*##[^\\n]*(\\n\\s*\\*[^\\n]*\\*\\s*)?$',
  '',
  'g'
)
FROM quizzes AS q
WHERE q.id = qq.quiz_id
  AND q.title = 'Bài tập Chương IV - Hàm số lượng giác'
  AND qq.explanation ~ E'\\n\\s*---\\s*\\n\\s*##';
