-- ============================================================
-- CSCA COURSE - SEED DATA
-- ============================================================

-- ============================================================
-- 1. HSK LEVELS + CSCA SUBJECTS (14 rows)
-- ============================================================
INSERT INTO hsk_levels (code, label_vi, label_en, vocab_count, exam_type, sort_order) VALUES
  -- HSK (6 cấp)
  ('HSK1',              'HSK Cấp 1 (Sơ cấp)',                    'HSK Level 1',              150,  'HSK',  1),
  ('HSK2',              'HSK Cấp 2 (Sơ cấp)',                    'HSK Level 2',              300,  'HSK',  2),
  ('HSK3',              'HSK Cấp 3 (Trung cấp)',                 'HSK Level 3',              600,  'HSK',  3),
  ('HSK4',              'HSK Cấp 4 (Trung cấp)',                 'HSK Level 4',             1200,  'HSK',  4),
  ('HSK5',              'HSK Cấp 5 (Cao cấp)',                   'HSK Level 5',             2500,  'HSK',  5),
  ('HSK6',              'HSK Cấp 6 (Cao cấp)',                   'HSK Level 6',             5000,  'HSK',  6),
  -- HSKK (3 cấp)
  ('HSKK_BEGINNER',     'HSKK Sơ cấp',                           'HSKK Beginner',           NULL,  'HSKK', 7),
  ('HSKK_INTERMEDIATE', 'HSKK Trung cấp',                        'HSKK Intermediate',       NULL,  'HSKK', 8),
  ('HSKK_ADVANCED',     'HSKK Cao cấp',                          'HSKK Advanced',           NULL,  'HSKK', 9),
  -- CSCA - Kì thi đầu vào Trung Quốc (5 môn)
  ('CSCA_MATH',         'CSCA Toán (数学)',                       'CSCA Mathematics',         NULL,  'CSCA', 10),
  ('CSCA_PHYSICS',      'CSCA Vật Lí (物理)',                     'CSCA Physics',             NULL,  'CSCA', 11),
  ('CSCA_CHEMISTRY',    'CSCA Hóa Học (化学)',                    'CSCA Chemistry',           NULL,  'CSCA', 12),
  ('CSCA_CHINESE_SCI',  'CSCA Tiếng Trung Tự Nhiên (汉语自然)',  'CSCA Chinese (Science)',    NULL,  'CSCA', 13),
  ('CSCA_CHINESE_SOC',  'CSCA Tiếng Trung Xã Hội (汉语社会)',    'CSCA Chinese (Social)',     NULL,  'CSCA', 14)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. VIP PACKAGES (3 rows)
-- ============================================================
INSERT INTO vip_packages (tier, name, description, duration_days, price_vnd, features, is_active, sort_order) VALUES
  ('basic',    'VIP Basic',    'Truy cập khóa học cơ bản, HSK 1-3, từ vựng',
   30,  99000,  '["Khóa học HSK 1-3", "Từ vựng HSK 1-3", "Đề thi thử cơ bản", "Hỗ trợ email"]'::jsonb, TRUE, 1),

  ('standard', 'VIP Standard', 'Truy cập toàn bộ khóa học, đề thi, lịch sử ôn tập',
   90,  249000, '["Tất cả khóa học HSK 1-6", "Tất cả đề thi thử", "HSKK luyện nói", "Lịch sử ôn tập", "Hỗ trợ ưu tiên"]'::jsonb, TRUE, 2),

  ('premium',  'VIP Premium',  'Trọn bộ tính năng, hỗ trợ 1-1, tải offline',
   365, 799000, '["Tất cả tính năng Standard", "Hỗ trợ 1-1 với giáo viên", "Tải video offline", "Chứng chỉ hoàn thành", "Ưu tiên tính năng mới"]'::jsonb, TRUE, 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. DEFAULT ADMIN USER
-- password: Admin@123 (bcrypt hash, PHẢI ĐỔI trước khi lên production!)
-- ============================================================
INSERT INTO users (username, email, password_hash, role, email_verified, avatar_url) VALUES
  ('admin', 'admin@csca.vn',
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
   'admin', TRUE,
   'https://ui-avatars.com/api/?name=Admin&background=4f46e5&color=fff')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 4. SAMPLE HSK1 VOCABULARY (20 words)
-- ============================================================
INSERT INTO vocabulary (hsk_level_id, word, pinyin, meaning_vi, meaning_en, word_type, example_sentence, example_pinyin, example_meaning_vi) VALUES
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '爱',     'ài',        'yêu',               'love',           'verb',         '我爱你。',           'Wǒ ài nǐ.',         'Tôi yêu bạn.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '八',     'bā',        'tám',               'eight',          'noun',         '八个人。',           'Bā gè rén.',         'Tám người.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '爸爸',   'bàba',      'bố, cha',           'father',         'noun',         '爸爸很好。',         'Bàba hěn hǎo.',      'Bố rất tốt.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '杯子',   'bēizi',     'cái cốc',           'cup',            'noun',         '这是杯子。',         'Zhè shì bēizi.',     'Đây là cái cốc.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '北京',   'Běijīng',   'Bắc Kinh',          'Beijing',        'noun',         '我在北京。',         'Wǒ zài Běijīng.',    'Tôi ở Bắc Kinh.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '本',     'běn',       'quyển (lượng từ)',   'measure word',   'measure_word', '一本书。',           'Yī běn shū.',        'Một quyển sách.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '不客气', 'bú kèqi',   'không có gì',       'you are welcome','other',        '不客气！',           'Bú kèqi!',           'Không có gì!'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '菜',     'cài',       'rau, thức ăn',      'vegetable/dish', 'noun',         '这个菜很好吃。',     'Zhège cài hěn hǎochī.','Món này rất ngon.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '茶',     'chá',       'trà',               'tea',            'noun',         '喝茶。',             'Hē chá.',            'Uống trà.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '吃',     'chī',       'ăn',                'eat',            'verb',         '吃饭。',             'Chī fàn.',           'Ăn cơm.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '出租车', 'chūzūchē',  'xe taxi',           'taxi',           'noun',         '坐出租车。',         'Zuò chūzūchē.',      'Đi taxi.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '大',     'dà',        'lớn, to',           'big',            'adjective',    '很大。',             'Hěn dà.',            'Rất lớn.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '的',     'de',        'của (trợ từ)',      'particle',       'particle',     '我的书。',           'Wǒ de shū.',         'Sách của tôi.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '点',     'diǎn',      'điểm, giờ',         'point/o''clock', 'noun',         '三点了。',           'Sān diǎn le.',       'Ba giờ rồi.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '电脑',   'diànnǎo',   'máy tính',          'computer',       'noun',         '用电脑。',           'Yòng diànnǎo.',      'Dùng máy tính.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '电视',   'diànshì',   'tivi',              'television',     'noun',         '看电视。',           'Kàn diànshì.',       'Xem tivi.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '电影',   'diànyǐng',  'phim',              'movie',          'noun',         '看电影。',           'Kàn diànyǐng.',      'Xem phim.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '东西',   'dōngxi',    'đồ vật',            'thing',          'noun',         '买东西。',           'Mǎi dōngxi.',        'Mua đồ.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '都',     'dōu',       'đều, cả',           'all/both',       'adverb',       '我们都去。',         'Wǒmen dōu qù.',      'Chúng tôi đều đi.'),
  ((SELECT id FROM hsk_levels WHERE code='HSK1'), '读',     'dú',        'đọc',               'read',           'verb',         '读书。',             'Dú shū.',            'Đọc sách.')
ON CONFLICT DO NOTHING;

-- ============================================================
-- END OF SEED DATA
-- ============================================================
