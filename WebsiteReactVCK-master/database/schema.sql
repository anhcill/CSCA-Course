-- ============================================================
-- CSCA COURSE DATABASE SCHEMA
-- Website Khóa Học Luyện Thi HSK/HSKK
-- Database: csca_course_db (Railway PostgreSQL)
-- ============================================================

-- ============================================================
-- ENUM TYPES (15)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role        AS ENUM ('user', 'creator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gender_type      AS ENUM ('male', 'female', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oauth_provider   AS ENUM ('local', 'google');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE course_level     AS ENUM ('beginner', 'intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE video_storage    AS ENUM ('r2', 'external', 'youtube_legacy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE video_resolution AS ENUM ('360p', '480p', '720p', '1080p', '1440p', '2160p');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_provider AS ENUM ('momo', 'vnpay', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE txn_status       AS ENUM ('pending', 'success', 'failed', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coupon_type      AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE word_type        AS ENUM ('noun','verb','adjective','adverb','pronoun',
                                        'conjunction','preposition','particle',
                                        'measure_word','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exam_type        AS ENUM ('listening', 'reading', 'writing', 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_type    AS ENUM ('single_choice', 'multiple_choice', 'fill_blank',
                                        'true_false', 'essay', 'matching');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE schedule_level   AS ENUM ('beginner', 'intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vip_tier         AS ENUM ('basic', 'standard', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE otp_purpose      AS ENUM ('signup', 'password_reset', 'email_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SHARED TRIGGER FUNCTION: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE 1: hsk_levels (reference table, no FK deps)
-- ============================================================
CREATE TABLE IF NOT EXISTS hsk_levels (
  id          SMALLSERIAL  PRIMARY KEY,
  code        VARCHAR(20)  UNIQUE NOT NULL,
  label_vi    VARCHAR(100) NOT NULL,
  label_en    VARCHAR(100) NOT NULL,
  vocab_count INT,
  exam_type   VARCHAR(10)  NOT NULL DEFAULT 'HSK',
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL      PRIMARY KEY,
  username        VARCHAR(50)    UNIQUE NOT NULL,
  email           VARCHAR(255)   UNIQUE NOT NULL,
  password_hash   TEXT,
  gender          gender_type    DEFAULT 'other',
  avatar_url      TEXT,
  role            user_role      NOT NULL DEFAULT 'user',
  google_id       VARCHAR(255)   UNIQUE,
  oauth_provider  oauth_provider NOT NULL DEFAULT 'local',
  email_verified  BOOLEAN        NOT NULL DEFAULT FALSE,
  is_vip          BOOLEAN        NOT NULL DEFAULT FALSE,
  vip_expires_at  TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id  ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_vip_active ON users(vip_expires_at) WHERE is_vip = TRUE;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 3: user_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT         NOT NULL UNIQUE,
  device_info TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================================
-- TABLE 4: user_otps
-- ============================================================
CREATE TABLE IF NOT EXISTS user_otps (
  id          BIGSERIAL    PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  code        VARCHAR(10)  NOT NULL,
  purpose     otp_purpose  NOT NULL,
  used        BOOLEAN      NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON user_otps(email, purpose);
CREATE INDEX IF NOT EXISTS idx_otps_expires       ON user_otps(expires_at);

-- ============================================================
-- TABLE 5: password_resets
-- ============================================================
CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGSERIAL    PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  reset_code  VARCHAR(64)  NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_email ON password_resets(email);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_code  ON password_resets(reset_code);

-- ============================================================
-- STUDENT STUDY-ABROAD PROFILE (one-to-one with users)
-- ============================================================
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
  CONSTRAINT chk_student_hsk_level CHECK (hsk_level IS NULL OR hsk_level BETWEEN 1 AND 9),
  CONSTRAINT chk_student_hskk_level CHECK (
    hskk_level IS NULL OR hskk_level IN ('beginner', 'intermediate', 'advanced')
  )
);

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at ON student_profiles;
CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 6: vip_packages
-- ============================================================
CREATE TABLE IF NOT EXISTS vip_packages (
  id             BIGSERIAL    PRIMARY KEY,
  tier           vip_tier     NOT NULL,
  name           VARCHAR(100) NOT NULL,
  description    TEXT,
  duration_days  INT          NOT NULL CHECK (duration_days > 0),
  price_vnd      BIGINT       NOT NULL CHECK (price_vnd >= 0),
  features       JSONB        NOT NULL DEFAULT '[]',
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order     SMALLINT     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_packages_active ON vip_packages(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_vip_packages_updated_at ON vip_packages;
CREATE TRIGGER trg_vip_packages_updated_at
  BEFORE UPDATE ON vip_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 7: coupons
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id               BIGSERIAL     PRIMARY KEY,
  code             VARCHAR(50)   UNIQUE NOT NULL,
  type             coupon_type   NOT NULL,
  value            NUMERIC(10,2) NOT NULL CHECK (value > 0),
  max_uses         INT           NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses_count       INT           NOT NULL DEFAULT 0,
  min_order_vnd    BIGINT        NOT NULL DEFAULT 0,
  applicable_tiers vip_tier[],
  starts_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by       BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code   ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON coupons;
CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 8: user_vip_entitlements
-- ============================================================
CREATE TABLE IF NOT EXISTS user_vip_entitlements (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  package_id      BIGINT       NOT NULL REFERENCES vip_packages(id) ON DELETE RESTRICT,
  transaction_id  BIGINT,
  starts_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ  NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  granted_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_ent_user_active ON user_vip_entitlements(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vip_ent_expires     ON user_vip_entitlements(expires_at) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_vip_entitlements_updated_at ON user_vip_entitlements;
CREATE TRIGGER trg_vip_entitlements_updated_at
  BEFORE UPDATE ON user_vip_entitlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- VIP sync trigger: keep users.is_vip in sync
CREATE OR REPLACE FUNCTION sync_user_vip_status()
RETURNS TRIGGER AS $$
DECLARE v_uid BIGINT := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  UPDATE users SET
    is_vip = EXISTS (
      SELECT 1 FROM user_vip_entitlements
      WHERE user_id = v_uid AND is_active = TRUE AND expires_at > NOW()),
    vip_expires_at = (
      SELECT MAX(expires_at) FROM user_vip_entitlements
      WHERE user_id = v_uid AND is_active = TRUE AND expires_at > NOW())
  WHERE id = v_uid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_vip ON user_vip_entitlements;
CREATE TRIGGER trg_sync_user_vip
  AFTER INSERT OR UPDATE ON user_vip_entitlements
  FOR EACH ROW EXECUTE FUNCTION sync_user_vip_status();

-- ============================================================
-- TABLE 9: transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                  BIGSERIAL        PRIMARY KEY,
  user_id             BIGINT           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  package_id          BIGINT           REFERENCES vip_packages(id) ON DELETE RESTRICT,
  coupon_id           BIGINT           REFERENCES coupons(id) ON DELETE SET NULL,
  provider            payment_provider NOT NULL,
  provider_txn_id     VARCHAR(255),
  provider_order_id   VARCHAR(255)     UNIQUE,
  amount_vnd          BIGINT           NOT NULL CHECK (amount_vnd >= 0),
  discount_vnd        BIGINT           NOT NULL DEFAULT 0 CHECK (discount_vnd >= 0),
  final_amount_vnd    BIGINT           NOT NULL CHECK (final_amount_vnd >= 0),
  currency            CHAR(3)          NOT NULL DEFAULT 'VND',
  status              txn_status       NOT NULL DEFAULT 'pending',
  provider_response   JSONB,
  paid_at             TIMESTAMPTZ,
  expired_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txn_user_id        ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_status         ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_provider_order ON transactions(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_txn_provider_txn   ON transactions(provider_txn_id) WHERE provider_txn_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 10: coupon_usages
-- ============================================================
CREATE TABLE IF NOT EXISTS coupon_usages (
  id              BIGSERIAL   PRIMARY KEY,
  coupon_id       BIGINT      NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transaction_id  BIGINT      NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  discount_vnd    BIGINT      NOT NULL,
  used_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_user   ON coupon_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages(coupon_id);

-- ============================================================
-- TABLE 11: courses
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id              BIGSERIAL     PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL,
  slug            VARCHAR(300)  UNIQUE NOT NULL,
  description     TEXT,
  image_url       TEXT,
  author_id       BIGINT        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  level           course_level  NOT NULL DEFAULT 'beginner',
  hsk_level_id    SMALLINT      REFERENCES hsk_levels(id) ON DELETE SET NULL,
  is_published    BOOLEAN       NOT NULL DEFAULT FALSE,
  is_premium      BOOLEAN       NOT NULL DEFAULT FALSE,
  required_tier   vip_tier,
  price_vnd       BIGINT        NOT NULL DEFAULT 0,
  total_lessons   INT           NOT NULL DEFAULT 0,
  ratings_count   INT           NOT NULL DEFAULT 0,
  ratings_avg     NUMERIC(3,2)  NOT NULL DEFAULT 0.00,
  enrolled_count  INT           NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_author    ON courses(author_id);
CREATE INDEX IF NOT EXISTS idx_courses_published ON courses(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_courses_premium   ON courses(is_premium) WHERE is_premium = TRUE;
CREATE INDEX IF NOT EXISTS idx_courses_hsk_level ON courses(hsk_level_id);
CREATE INDEX IF NOT EXISTS idx_courses_slug      ON courses(slug);

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 12: lessons
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id                      BIGSERIAL      PRIMARY KEY,
  course_id               BIGINT         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name                    VARCHAR(255)   NOT NULL,
  description             TEXT,
  sort_order              SMALLINT       NOT NULL DEFAULT 0,
  is_published            BOOLEAN        NOT NULL DEFAULT FALSE,
  is_free_preview         BOOLEAN        NOT NULL DEFAULT FALSE,
  video_storage_type      video_storage  DEFAULT 'r2',
  video_r2_key            TEXT,
  video_hls_manifest_url  TEXT,
  video_duration_seconds  INT            CHECK (video_duration_seconds >= 0),
  video_thumbnail_url     TEXT,
  video_url_legacy        TEXT,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_order ON lessons(course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lessons_published    ON lessons(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_lessons_free_preview ON lessons(is_free_preview) WHERE is_free_preview = TRUE;

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON lessons;
CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Lesson counter trigger: keep courses.total_lessons in sync
CREATE OR REPLACE FUNCTION update_course_lesson_count()
RETURNS TRIGGER AS $$
DECLARE v_cid BIGINT := COALESCE(NEW.course_id, OLD.course_id);
BEGIN
  UPDATE courses
  SET total_lessons = (
    SELECT COUNT(*) FROM lessons
    WHERE course_id = v_cid AND is_published = TRUE
  ) WHERE id = v_cid;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_course_lesson_count ON lessons;
CREATE TRIGGER trg_update_course_lesson_count
  AFTER INSERT OR UPDATE OF is_published OR DELETE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_course_lesson_count();

-- ============================================================
-- TABLE 13: video_variants (HLS per-resolution)
-- ============================================================
CREATE TABLE IF NOT EXISTS video_variants (
  id               BIGSERIAL        PRIMARY KEY,
  lesson_id        BIGINT           NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  resolution       video_resolution NOT NULL,
  r2_key           TEXT             NOT NULL,
  bitrate_kbps     INT              CHECK (bitrate_kbps > 0),
  file_size_bytes  BIGINT           CHECK (file_size_bytes >= 0),
  is_ready         BOOLEAN          NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, resolution)
);

CREATE INDEX IF NOT EXISTS idx_video_variants_lesson ON video_variants(lesson_id);
CREATE INDEX IF NOT EXISTS idx_video_variants_ready  ON video_variants(is_ready) WHERE is_ready = TRUE;

DROP TRIGGER IF EXISTS trg_video_variants_updated_at ON video_variants;
CREATE TRIGGER trg_video_variants_updated_at
  BEFORE UPDATE ON video_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 14: exercises
-- ============================================================
CREATE TABLE IF NOT EXISTS exercises (
  id              BIGSERIAL   PRIMARY KEY,
  lesson_id       BIGINT      NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question        TEXT        NOT NULL,
  options         JSONB       NOT NULL,
  correct_answer  SMALLINT    NOT NULL CHECK (correct_answer BETWEEN 0 AND 3),
  explanation     TEXT,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercises_lesson ON exercises(lesson_id, sort_order);

DROP TRIGGER IF EXISTS trg_exercises_updated_at ON exercises;
CREATE TRIGGER trg_exercises_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 15: tests (end-of-course quiz results)
-- ============================================================
CREATE TABLE IF NOT EXISTS tests (
  id          BIGSERIAL     PRIMARY KEY,
  user_id     BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   BIGINT        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score       NUMERIC(4,1)  NOT NULL CHECK (score BETWEEN 0 AND 10),
  is_pass     BOOLEAN       NOT NULL GENERATED ALWAYS AS (score >= 5) STORED,
  answers     JSONB,
  taken_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tests_user   ON tests(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_course ON tests(course_id);
CREATE INDEX IF NOT EXISTS idx_tests_pass   ON tests(is_pass) WHERE is_pass = TRUE;

-- ============================================================
-- TABLE 16: progress
-- ============================================================
CREATE TABLE IF NOT EXISTS progress (
  id                 BIGSERIAL   PRIMARY KEY,
  user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id          BIGINT      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  completed_lessons  BIGINT[]    NOT NULL DEFAULT '{}',
  progress_pct       SMALLINT    NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  last_lesson_id     BIGINT      REFERENCES lessons(id) ON DELETE SET NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user   ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_course ON progress(course_id);

DROP TRIGGER IF EXISTS trg_progress_updated_at ON progress;
CREATE TRIGGER trg_progress_updated_at
  BEFORE UPDATE ON progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 17: ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS ratings (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    BIGINT      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_course ON ratings(course_id);

DROP TRIGGER IF EXISTS trg_ratings_updated_at ON ratings;
CREATE TRIGGER trg_ratings_updated_at
  BEFORE UPDATE ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Ratings aggregate trigger: keep courses.ratings_count & ratings_avg in sync
CREATE OR REPLACE FUNCTION update_course_ratings()
RETURNS TRIGGER AS $$
DECLARE v_cid BIGINT := COALESCE(NEW.course_id, OLD.course_id);
BEGIN
  UPDATE courses SET
    ratings_count = (SELECT COUNT(*) FROM ratings WHERE course_id = v_cid),
    ratings_avg   = (SELECT COALESCE(AVG(rating::NUMERIC), 0) FROM ratings WHERE course_id = v_cid)
  WHERE id = v_cid;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_course_ratings ON ratings;
CREATE TRIGGER trg_update_course_ratings
  AFTER INSERT OR UPDATE OR DELETE ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_course_ratings();

-- ============================================================
-- TABLE 18: comments (threaded)
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   BIGINT      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   BIGINT      REFERENCES lessons(id) ON DELETE CASCADE,
  parent_id   BIGINT      REFERENCES comments(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  is_edited   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_lesson ON comments(lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_course ON comments(course_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_user   ON comments(user_id);

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 19: notes (private user notes on lessons)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id           BIGSERIAL   PRIMARY KEY,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    BIGINT      NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id    BIGINT      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  timestamp_s  INT         CHECK (timestamp_s >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_lesson ON notes(user_id, lesson_id);

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 20: schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id              BIGSERIAL       PRIMARY KEY,
  user_id         BIGINT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       BIGINT          NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  level           schedule_level  NOT NULL DEFAULT 'beginner',
  start_date      DATE            NOT NULL,
  end_date        DATE            NOT NULL,
  total_days      SMALLINT        NOT NULL CHECK (total_days > 0),
  schedule_items  JSONB           NOT NULL DEFAULT '[]',
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_schedule_dates CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_user   ON schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_course ON schedules(course_id);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(user_id) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_schedules_updated_at ON schedules;
CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 21: posts (community blog)
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id              BIGSERIAL    PRIMARY KEY,
  author_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title           VARCHAR(500) NOT NULL,
  slug            VARCHAR(550) UNIQUE NOT NULL,
  content         TEXT         NOT NULL,
  image_url       TEXT,
  is_approved     BOOLEAN      NOT NULL DEFAULT FALSE,
  views_count     INT          NOT NULL DEFAULT 0,
  comments_count  INT          NOT NULL DEFAULT 0,
  likes_count     INT          NOT NULL DEFAULT 0,
  tags            TEXT[]       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_author   ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_approved ON posts(is_approved) WHERE is_approved = TRUE;
CREATE INDEX IF NOT EXISTS idx_posts_slug     ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_tags     ON posts USING gin(tags);

DROP TRIGGER IF EXISTS trg_posts_updated_at ON posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 22: vocabulary (HSK word bank)
-- ============================================================
CREATE TABLE IF NOT EXISTS vocabulary (
  id                  BIGSERIAL    PRIMARY KEY,
  hsk_level_id        SMALLINT     NOT NULL REFERENCES hsk_levels(id) ON DELETE RESTRICT,
  word                VARCHAR(50)  NOT NULL,
  pinyin              VARCHAR(100) NOT NULL,
  meaning_vi          TEXT         NOT NULL,
  meaning_en          TEXT,
  word_type           word_type    NOT NULL DEFAULT 'noun',
  example_sentence    TEXT,
  example_pinyin      TEXT,
  example_meaning_vi  TEXT,
  example_meaning_en  TEXT,
  audio_url           TEXT,
  stroke_order_url    TEXT,
  tags                TEXT[]       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocab_hsk_level ON vocabulary(hsk_level_id);
CREATE INDEX IF NOT EXISTS idx_vocab_word      ON vocabulary(word);
CREATE INDEX IF NOT EXISTS idx_vocab_pinyin    ON vocabulary(pinyin);
CREATE INDEX IF NOT EXISTS idx_vocab_type      ON vocabulary(word_type);
CREATE INDEX IF NOT EXISTS idx_vocab_tags      ON vocabulary USING gin(tags);

DROP TRIGGER IF EXISTS trg_vocabulary_updated_at ON vocabulary;
CREATE TRIGGER trg_vocabulary_updated_at
  BEFORE UPDATE ON vocabulary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 23: user_vocabulary_progress (SM-2 spaced repetition)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_vocabulary_progress (
  id              BIGSERIAL     PRIMARY KEY,
  user_id         BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id   BIGINT        NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  mastery_level   SMALLINT      NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  review_count    INT           NOT NULL DEFAULT 0,
  correct_count   INT           NOT NULL DEFAULT 0,
  last_reviewed   TIMESTAMPTZ,
  next_review     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  ease_factor     NUMERIC(4,2)  NOT NULL DEFAULT 2.50,
  interval_days   INT           NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, vocabulary_id)
);

CREATE INDEX IF NOT EXISTS idx_uvp_user_due ON user_vocabulary_progress(user_id, next_review)
  WHERE mastery_level < 5;
CREATE INDEX IF NOT EXISTS idx_uvp_mastery  ON user_vocabulary_progress(user_id, mastery_level);

DROP TRIGGER IF EXISTS trg_uvp_updated_at ON user_vocabulary_progress;
CREATE TRIGGER trg_uvp_updated_at
  BEFORE UPDATE ON user_vocabulary_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 24: exams (mock HSK exams)
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
  id                BIGSERIAL    PRIMARY KEY,
  hsk_level_id      SMALLINT     NOT NULL REFERENCES hsk_levels(id) ON DELETE RESTRICT,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  exam_type         exam_type    NOT NULL,
  duration_minutes  SMALLINT     NOT NULL CHECK (duration_minutes > 0),
  total_questions   SMALLINT     NOT NULL CHECK (total_questions > 0),
  total_points      SMALLINT     NOT NULL CHECK (total_points > 0),
  pass_score        SMALLINT     NOT NULL CHECK (pass_score >= 0),
  instructions      TEXT,
  is_published      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_premium        BOOLEAN      NOT NULL DEFAULT FALSE,
  attempt_count     INT          NOT NULL DEFAULT 0,
  sort_order        SMALLINT     NOT NULL DEFAULT 0,
  created_by        BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_hsk_level ON exams(hsk_level_id);
CREATE INDEX IF NOT EXISTS idx_exams_published ON exams(is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_exams_premium   ON exams(is_premium) WHERE is_premium = TRUE;
CREATE INDEX IF NOT EXISTS idx_exams_type      ON exams(exam_type);

DROP TRIGGER IF EXISTS trg_exams_updated_at ON exams;
CREATE TRIGGER trg_exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 25: exam_questions
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_questions (
  id               BIGSERIAL      PRIMARY KEY,
  exam_id          BIGINT         NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_number  SMALLINT       NOT NULL,
  section          VARCHAR(50),
  question_text    TEXT           NOT NULL,
  question_type    question_type  NOT NULL DEFAULT 'single_choice',
  options          JSONB,
  correct_answer   JSONB          NOT NULL,
  explanation      TEXT,
  points           SMALLINT       NOT NULL DEFAULT 1 CHECK (points > 0),
  audio_url        TEXT,
  image_url        TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, question_number)
);

CREATE INDEX IF NOT EXISTS idx_eq_exam_order ON exam_questions(exam_id, question_number);

DROP TRIGGER IF EXISTS trg_exam_questions_updated_at ON exam_questions;
CREATE TRIGGER trg_exam_questions_updated_at
  BEFORE UPDATE ON exam_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TABLE 26: user_exam_attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS user_exam_attempts (
  id              BIGSERIAL     PRIMARY KEY,
  user_id         BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id         BIGINT        NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  score           NUMERIC(6,2)  NOT NULL DEFAULT 0,
  total_correct   SMALLINT      NOT NULL DEFAULT 0,
  total_wrong     SMALLINT      NOT NULL DEFAULT 0,
  total_skipped   SMALLINT      NOT NULL DEFAULT 0,
  is_pass         BOOLEAN       NOT NULL DEFAULT FALSE,
  answers         JSONB         NOT NULL DEFAULT '{}',
  time_taken_s    INT           CHECK (time_taken_s >= 0),
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uea_user_exam ON user_exam_attempts(user_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_uea_exam      ON user_exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_uea_completed ON user_exam_attempts(completed_at) WHERE completed_at IS NOT NULL;

-- Exam attempt counter trigger
CREATE OR REPLACE FUNCTION increment_exam_attempt_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND (OLD.completed_at IS NULL OR TG_OP = 'INSERT') THEN
    UPDATE exams SET attempt_count = attempt_count + 1 WHERE id = NEW.exam_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uea_increment_exam_count ON user_exam_attempts;
CREATE TRIGGER trg_uea_increment_exam_count
  AFTER INSERT OR UPDATE ON user_exam_attempts
  FOR EACH ROW EXECUTE FUNCTION increment_exam_attempt_count();

-- ============================================================
-- END OF SCHEMA
-- ============================================================
