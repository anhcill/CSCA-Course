# RULE - DỰ ÁN CSCA COURSE (WebsiteReactVCK)

> **Ghi nhớ: Phải xưng "mk" là "đại ca" trong mọi câu trả lời.**

---

## 1. Tổng quan dự án

- **Tên**: CSCA Course - Website Khóa Học Luyện Thi Học Bổng Trung Quốc
- **Nội dung khóa học**: HSK (汉语水平考试), HSKK (汉语水平口语考试), CSCA (kì thi đầu vào Trung Quốc)
- **Mục tiêu**: Cung cấp nền tảng học tiếng Trung, luyện thi HSK/HSKK/CSCA cho học sinh Việt Nam chuẩn bị du học Trung Quốc

---

## 2. Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | **PostgreSQL** (database riêng: `csca_course_db`) |
| Auth | JWT |
| Ngôn ngữ | i18next (đa ngôn ngữ) |

---

## 3. Quy tắc Database

### QUAN TRỌNG - TÁCH BIỆT DATABASE

- **CSCA MoliStudio** (`csca_db`) → Đã lên production, **TUYỆT ĐỐI KHÔNG ĐỤNG VÀO**
- **CSCA Course** (`csca_course_db`) → Database riêng cho dự án này, thoải mái sửa

### Cấu trúc database `csca_course_db` cần có:

| Bảng | Mô tả |
|---|---|
| `users` | Người dùng (student, creator, admin) |
| `courses` | Khóa học (HSK1-6, HSKK sơ/trung/cao, CSCA Toán/Lý/Hóa/Trung) |
| `lessons` | Bài học trong khóa học (video bài giảng) |
| `exercises` | Bài tập trắc nghiệm theo bài học |
| `tests` | Bài kiểm tra tổng hợp theo khóa học |
| `progress` | Tiến trình học của user |
| `ratings` | Đánh giá khóa học (1-5 sao) |
| `comments` | Bình luận trong bài học |
| `notes` | Ghi chú cá nhân trong bài học |
| `schedules` | Lịch học cá nhân |
| `posts` | Bài viết / tin tức |

---

## 4. Các cấp độ khóa học HSK/HSKK

### HSK (Nghe - Đọc - Viết)
- HSK 1 (Sơ cấp 1) - 150 từ vựng
- HSK 2 (Sơ cấp 2) - 300 từ vựng
- HSK 3 (Trung cấp 1) - 600 từ vựng
- HSK 4 (Trung cấp 2) - 1200 từ vựng
- HSK 5 (Cao cấp 1) - 2500 từ vựng
- HSK 6 (Cao cấp 2) - 5000+ từ vựng

### HSKK (Nói)
- HSKK Sơ cấp
- HSKK Trung cấp
- HSKK Cao cấp

### CSCA - Kì thi đầu vào Trung Quốc
- Toán (数学)
- Vật Lí (物理)
- Hóa Học (化学)
- Tiếng Trung ban Tự Nhiên (汉语自然)
- Tiếng Trung ban Xã Hội (汉语社会)

---

## 5. Quy tắc code

- Backend: chuyển từ MongoDB/Mongoose sang **PostgreSQL** (dùng `pg` hoặc ORM phù hợp)
- Giữ nguyên cấu trúc frontend, chỉ đổi backend + database
- API endpoints giữ prefix `/api/`
- Code tiếng Anh, comment có thể tiếng Việt
- Không commit file `.env` lên git
- **Không tự ý chạy app/server, dev server, preview hoặc build. Chỉ được thực hiện các lệnh này khi đại ca yêu cầu rõ ràng.** Vẫn được phép đọc, tìm kiếm, chỉnh sửa, review và kiểm tra lỗi tĩnh bằng diagnostics, lint hoặc typecheck.

---

## 6. Liên quan đến dự án khác

- **CSCA-MOLI.STUDIO** (`/e/CSCA-MOLI.STUDIO/`): Dự án luyện đề thi, ĐÃ PRODUCTION → không sửa
- **CSCA-MOLY.MOBILE** (`/e/CSCA-MOLY.MOBILE/`): App Flutter mobile → client riêng, dùng API của MoliStudio
- **CSCA Course** (dự án này): Website khóa học HSK/HSKK → database + backend riêng hoàn toàn

---

## 7. TODO - Lớp học trực tuyến (làm sau)

- Giai đoạn hiện tại **không tự phát triển hệ thống gọi video** và chưa tích hợp LiveKit/Jitsi.
- Sử dụng dịch vụ có sẵn, ưu tiên **Google Meet**; có thể hỗ trợ thêm Zoom về sau.
- Mỗi lớp học sẽ có trường lưu liên kết phòng học trực tuyến.
- Trang "Nơi học tập" dự kiến hiển thị lịch học, giáo viên, trạng thái buổi học và nút **Vào lớp trực tuyến** để mở liên kết Meet/Zoom.
- Giáo viên tạo phòng và gắn liên kết vào lớp; học viên chỉ cần nhấn nút để tham gia.
- Phần tích hợp này là công việc để làm sau, **chưa triển khai ở thời điểm hiện tại**.

---
