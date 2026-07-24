-- Student study-abroad planning profile (self-reported, non-sensitive data)
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id                   BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name                 VARCHAR(120),
  current_education_level   VARCHAR(30),
  current_school            VARCHAR(160),
  target_program            VARCHAR(30),
  intended_intake_year      SMALLINT,
  intended_intake_term      VARCHAR(10),
  target_major              VARCHAR(120),
  target_city               VARCHAR(100),
  hsk_level                 SMALLINT,
  hskk_level                VARCHAR(20),
  study_goal                VARCHAR(500),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_student_education_level CHECK (
    current_education_level IS NULL OR current_education_level IN
      ('high_school', 'vocational', 'undergraduate', 'graduate', 'other')
  ),
  CONSTRAINT chk_student_target_program CHECK (
    target_program IS NULL OR target_program IN
      ('language', 'bachelor', 'master', 'doctorate', 'other')
  ),
  CONSTRAINT chk_student_intake_year CHECK (
    intended_intake_year IS NULL OR intended_intake_year BETWEEN 2026 AND 2040
  ),
  CONSTRAINT chk_student_intake_term CHECK (
    intended_intake_term IS NULL OR intended_intake_term IN ('spring', 'fall')
  ),
  CONSTRAINT chk_student_hsk_level CHECK (
    hsk_level IS NULL OR hsk_level BETWEEN 1 AND 9
  ),
  CONSTRAINT chk_student_hskk_level CHECK (
    hskk_level IS NULL OR hskk_level IN ('beginner', 'intermediate', 'advanced')
  )
);

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at ON student_profiles;
CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
