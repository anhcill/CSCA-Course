-- Seed Data for LMS HSK, HSKK & CSCA Video Courses Platform
-- Database: csca_course_db

-- Ensure a default author exists
INSERT INTO users (id, username, email, password_hash, role)
VALUES (1, 'admin_lms', 'admin@cscacourse.vn', '$2a$10$abcdefghijklmnopqrstuv', 'admin')
ON CONFLICT (id) DO NOTHING;

-- 1. Insert Courses
INSERT INTO courses (id, name, title, slug, description, category, level, price, is_free, is_published, thumbnail_url, image_url, author_id)
VALUES
(101, 'Luyện Thi HSK 1 Cho Người Mới Bắt Đầu', 'Luyện Thi HSK 1 Cho Người Mới Bắt Đầu', 'hsk-1-chuan-chua-tung-xuat-hien', 'Khóa học thiết kế chuẩn hóa 150 từ vựng và các mẫu câu giao tiếp HSK 1 căn bản nhất cho học sinh chuẩn bị du học.', 'HSK', 'beginner', 0.00, true, true, 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80', 1),
(102, 'Luyện Thi HSK 3 Bứt Phá Điểm Số', 'Luyện Thi HSK 3 Bứt Phá Điểm Số', 'hsk-3-trung-cap-but-pha', 'Chinh phục 600 từ vựng HSK 3, thành thạo kỹ năng nghe - đọc - viết và bí quyết giải đề thi đạt điểm tối đa.', 'HSK', 'intermediate', 0.00, true, true, 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop&q=80', 1),
(103, 'Luyện Thi HSK 5 Chuyên Sâu Du Học Trung Quốc', 'Luyện Thi HSK 5 Chuyên Sâu Du Học Trung Quốc', 'hsk-5-cao-cap-du-hoc', 'Luyện 2500 từ vựng HSK 5 cao cấp, viết đoạn văn ngắn và kỹ năng nghe hiểu tốc độ thực tế của người bản xứ.', 'HSK', 'advanced', 0.00, true, true, 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80', 1),
(104, 'Khóa Luyện Nói HSKK Trung Cấp Phản Xạ Nhanh', 'Khóa Luyện Nói HSKK Trung Cấp Phản Xạ Nhanh', 'hskk-trung-cap-luyen-noi', 'Rèn luyện phản xạ phát âm chuẩn Bắc Kinh, vượt qua bài thi nói HSKK Trung cấp với điểm số ấn tượng.', 'HSKK', 'intermediate', 0.00, true, true, 'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=800&auto=format&fit=crop&q=80', 1),
(105, 'Luyện Thi CSCA Toán Học (数学) Kỳ Thi Đầu Vào', 'Luyện Thi CSCA Toán Học (数学) Kỳ Thi Đầu Vào', 'csca-toan-hoc-du-hoc', 'Toàn bộ kiến thức Toán học bằng tiếng Trung chuyên ngành thi đầu vào đại học Trung Quốc CSCA.', 'CSCA', 'advanced', 0.00, true, true, 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&auto=format&fit=crop&q=80', 1),
(106, 'CSCA Tiếng Trung Ban Tự Nhiên (汉语自然)', 'CSCA Tiếng Trung Ban Tự Nhiên (汉语自然)', 'csca-tieng-trung-tu-nhien', 'Tổng hợp từ vựng và ngữ pháp khoa học tự nhiên phục vụ kỳ thi đánh giá năng lực CSCA.', 'CSCA', 'intermediate', 0.00, true, true, 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=80', 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  thumbnail_url = EXCLUDED.thumbnail_url;

SELECT setval('courses_id_seq', (SELECT MAX(id) FROM courses));

-- 2. Insert Sections
INSERT INTO sections (id, course_id, title, sort_order)
VALUES
(201, 101, 'Chương 1: Phát Âm Pinyin & Chào Hỏi Cơ Bản', 1),
(202, 101, 'Chương 2: Gia Đình & Đời Sống Hàng Ngày', 2),
(203, 102, 'Chương 1: Từ Vựng & Cấu Trúc HSK 3 Cốt Lõi', 1),
(204, 105, 'Chương 1: Đại Số & Hàm Số Chuyên Ngành CSCA', 1)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

SELECT setval('sections_id_seq', (SELECT MAX(id) FROM sections));

-- 3. Insert Lessons
INSERT INTO lessons (id, section_id, course_id, name, title, duration_seconds, is_preview, sort_order)
VALUES
(301, 201, 101, 'Bài 1: Giới thiệu hệ thống phiên âm Pinyin & Thanh điệu', 'Bài 1: Giới thiệu hệ thống phiên âm Pinyin & Thanh điệu', 600, true, 1),
(302, 201, 101, 'Bài 2: Từ vựng đại từ xưng hô & chào hỏi hàng ngày', 'Bài 2: Từ vựng đại từ xưng hô & chào hỏi hàng ngày', 900, false, 2),
(303, 202, 101, 'Bài 3: Giới thiệu bản thân và gia đình', 'Bài 3: Giới thiệu bản thân và gia đình', 750, false, 3),
(304, 203, 102, 'Bài 1: Phân biệt các phó từ chỉ thời gian trong HSK 3', 'Bài 1: Phân biệt các phó từ chỉ thời gian trong HSK 3', 850, true, 1),
(305, 204, 105, 'Bài 1: Thuật ngữ Toán học tiếng Trung chuyên ngành CSCA', 'Bài 1: Thuật ngữ Toán học tiếng Trung chuyên ngành CSCA', 1200, true, 1)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

SELECT setval('lessons_id_seq', (SELECT MAX(id) FROM lessons));
