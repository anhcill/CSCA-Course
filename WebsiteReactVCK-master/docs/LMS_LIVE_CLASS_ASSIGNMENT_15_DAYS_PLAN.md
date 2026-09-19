# Kế Hoạch Tác Chiến 15 Ngày: Nâng Cấp Hệ Thống LMS Lớp Học Trực Tuyến (Google Meet/Zoom) & Quản Lý Bài Tập

> **Dự án**: CSCA Course LMS
> **Mục tiêu**: Mở rộng website học video thành nền tảng LMS toàn diện, bao gồm: Lớp học trực tuyến Meet/Zoom, Quản lý lịch học, Giao bài tập trắc nghiệm & tự luận, Chấm điểm & Nhận xét, Điểm danh, Bảng xếp hạng và Chứng chỉ học tập.

---

## 📅 Tổng Quan Lộ Trình 15 Ngày

| Phase | Thời Gian | Trọng Tâm Nhiệm Vụ |
|---|---|---|
| **Phase 1** | Ngày 1 - 3 | Lớp Học Trực Tuyến (Lịch Học & Tích hợp Link Google Meet / Zoom) |
| **Phase 2** | Ngày 4 - 8 | Hệ Thống Giao Bài Tập, Làm Bài Trắc Nghiệm / Tự Luận & Chấm Điểm |
| **Phase 3** | Ngày 9 - 12 | Quản Lý Điểm Danh, Bảng Xếp Hạng Streak, Báo Cáo & Chứng Chỉ |
| **Phase 4** | Ngày 13 - 15 | Kiểm Thử End-to-End, Tối Ưu Mobile UX & Đóng Gói Bàn Giao |

---

## 🎯 Chi Tiết Công Việc Hàng Ngày

### 📍 PHASE 1: LỚP HỌC TRỰC TUYẾN & TÍCH HỢP MEET/ZOOM (NGÀY 1 - 3)

#### 📅 **Ngày 1: Thiết Kế Database PostgreSQL Lớp Học Live & Lịch Học**
- Tạo migration `004_live_classes.sql` bao gồm các bảng:
  - `live_classes`: Lưu thông tin lớp học trực tuyến (tên lớp, giáo viên phụ trách, mã lớp, sĩ số tối đa).
  - `class_schedules`: Lịch học cố định theo tuần (ví dụ: Thứ 2 - 4 - 6 từ 19:30 - 21:00).
  - `class_sessions`: Các buổi học cụ thể theo ngày, lưu liên kết phòng học Google Meet / Zoom (`meet_url`), mã bảo vệ, trạng thái buổi học (`scheduled`, `live`, `ended`, `cancelled`).
  - `class_enrollments`: Danh sách học viên thuộc lớp học.

#### 📅 **Ngày 2: Backend API Quản Lý Lớp Học & Link Meet/Zoom Bảo Mật**
- Xây dựng API cho Giáo viên / Admin:
  - `POST /api/live-classes`: Tạo lớp học trực tuyến mới.
  - `POST /api/live-classes/:classId/schedules`: Thiết lập lịch học lặp lại.
  - `PATCH /api/live-classes/sessions/:sessionId`: Cập nhật link phòng Google Meet/Zoom và mở lớp.
- Xây dựng API cho Học viên:
  - `GET /api/live-classes/my-schedule`: Lấy lịch học theo tuần/tháng của học viên.
  - `GET /api/live-classes/sessions/:sessionId/access`: Kiểm tra quyền và cấp nút "Vào Lớp Trực Tuyến" an toàn.

#### 📅 **Ngày 3: Giao Diện Lớp Học Trực Tuyến & Lịch Học Cá Nhân**
- Trang **Lịch Học Cá Nhân (Schedule Page)** dành cho Học viên:
  - Xem lịch học dạng Thời khóa biểu tuần/tháng.
  - Đồng hồ đếm ngược (Countdown Timer) trước buổi học 15 phút.
  - Nút **"Vào Lớp Ngay (Google Meet / Zoom)"** nổi bật khi buổi học bắt đầu.
- Trình điều khiển dành cho Giáo viên:
  - Danh sách buổi học hôm nay, nút bật phòng Meet/Zoom nhanh, xem danh sách học viên tham gia.

---

### 📍 PHASE 2: HỆ THỐNG GIAO BÀI TẬP, LÀM BÀI & CHẤM ĐIỂM (NGÀY 4 - 8)

#### 📅 **Ngày 4: Database Schema Bài Tập, Trắc Nghiệm & Bài Nộp**
- Tạo migration `005_assignments_quizzes.sql`:
  - `assignments`: Bài tập tự luận, bài nghe nói HSKK, file bài tập về nhà (hạn nộp deadline, điểm tối đa).
  - `quizzes`: Đề trắc nghiệm theo bài học/lớp học.
  - `quiz_questions`: Bank câu hỏi (chọn 1 đáp án, chọn nhiều đáp án, điền từ Pinyin/Hán tự).
  - `assignment_submissions`: Bài nộp của học viên (nội dung văn bản, file đính kèm, audio bài nói HSKK).
  - `submission_grades`: Điểm số và nhận xét chi tiết của giáo viên.

#### 📅 **Ngày 5: Backend API Giao Bài Tập & Ngân Hàng Câu Hỏi**
- API Admin/Giáo viên:
  - `POST /api/assignments`: Giao bài tập về nhà mới cho lớp học/bài học.
  - `POST /api/quizzes`: Tạo bài kiểm tra trắc nghiệm & câu hỏi.
  - `POST /api/submissions/:submissionId/grade`: Chấm điểm và gửi nhận xét.
- API Học viên:
  - `GET /api/assignments/pending`: Lấy danh sách bài tập cần nộp.
  - `POST /api/assignments/:assignmentId/submit`: Nộp bài tập về nhà.
  - `POST /api/quizzes/:quizId/submit`: Nộp bài trắc nghiệm & tự động chấm điểm.

#### 📅 **Ngày 6: Giao Diện Trình Làm Bài Trắc Nghiệm & Nộp Bài Tự Luận**
- **Giao diện Làm Bài Trắc Nghiệm (Quiz Player)**:
  - Thiết kế đồng hồ đếm ngược thời gian làm bài, chuyển câu hỏi nhanh.
  - Hiển thị ngay điểm số, đáp án đúng/sai và giải thích chi tiết sau khi nộp.
- **Giao diện Nộp Bài Tự Luận & Bài Nói HSKK**:
  - Khung soạn thảo văn bản nộp bài, upload file đính kèm (PDF/Word) hoặc ghi âm trực tiếp bài nói HSKK.

#### 📅 **Ngày 7: Giao Diện Chấm Bài & Phản Hồi Cho Giáo Viên**
- **Dashboard Chấm Bài Dành Cho Giáo Viên (Teacher Grading Portal)**:
  - Danh sách bài nộp chờ chấm theo từng lớp.
  - Trình đọc bài nộp: Xem file đính kèm, nghe file ghi âm nói HSKK.
  - Khung nhập điểm (thang điểm 10 hoặc 100) và viết nhận xét chi tiết/sửa lỗi câu chữ cho học viên.

#### 📅 **Ngày 8: Hệ Thống Thông Báo & Nhắc Nhở Deadline**
- Tích hợp hệ thống thông báo realtime (Toast + Bell Notifications):
  - Thông báo khi Giáo viên giao bài tập mới.
  - Cảnh báo nhắc nhở sắp hết hạn nộp bài (Deadline 24h & 2h).
  - Thông báo học viên khi bài tập đã được chấm kèm điểm số & nhận xét.
  - Cảnh báo sắp đến giờ vào học trực tuyến Google Meet/Zoom.

---

### 📍 PHASE 3: ĐIỂM DANH, BẢNG XẾP HẠNG STREAK & CHỨNG CHỈ (NGÀY 9 - 12)

#### 📅 **Ngày 9: Hệ Thống Điểm Danh & Thống Kê Tham Gia Lớp Học**
- Điểm danh học viên theo từng buổi học trực tuyến (Có mặt, Vắng mặt, Có phép).
- Thống kê tỷ lệ chuyên cần và tỷ lệ nộp bài tập về nhà của từng học viên.

#### 📅 **Ngày 10: Bảng Xếp Hạng Học Tập (Leaderboard) & Chuỗi Học Liên Tục (Streak)**
- Tích hợp hệ thống điểm thưởng XP khi: hoàn thành video bài giảng (+10 XP), nộp bài tập đúng hạn (+20 XP), đạt điểm tối đa bài trắc nghiệm (+50 XP).
- Tính chuỗi ngày học liên tục (Daily Streak) khuyến khích học viên duy trì thói quen học tập.
- Bảng xếp hạng Top học viên xuất sắc theo tuần / tháng của lớp và toàn trường.

#### 📅 **Ngày 11: Báo Cáo Học Tập & Chứng Chỉ Điện Tử (Digital Certificate)**
- Tự động tạo **Chứng chỉ hoàn thành khóa học (Digital Certificate)** dưới dạng PDF/Hình ảnh có mã xác thực QR khi học viên hoàn thành 100% tiến độ và bài tập.
- Xuất Báo cáo học tập cá nhân (Report Card) giúp học viên/phụ huynh theo dõi sự tiến bộ.

#### 📅 **Ngày 12: Trang Quản Trị Trung Tâm Dành Cho Giáo Viên (Teacher Hub)**
- Dashboard tổng quan cho Giáo viên:
  - Quản lý các lớp học đang phụ trách.
  - Lịch dạy trong tuần, lối tắt mở nhanh phòng Google Meet/Zoom.
  - Thống kê số lượng bài tập cần chấm gấp và học viên cần hỗ trợ.

---

### 📍 PHASE 4: KIỂM THỬ E2E, TỐI ƯU MOBILE & BÀN GIAO (NGÀY 13 - 15)

#### 📅 **Ngày 13: Kiểm Thử End-to-End Toàn Bộ Luồng LMS & Live Class**
- Test tích hợp toàn hệ thống: Giáo viên mở lớp Meet/Zoom ➔ Học viên bấm vào học ➔ Giáo viên giao bài ➔ Học viên nộp bài ➔ Giáo viên chấm điểm ➔ Hệ thống tính XP, hiển thị Bảng xếp hạng & cấp Chứng chỉ.

#### 📅 **Ngày 14: Tối Ưu Giao Diện Mobile & Trải Nghiệm Người Dùng (UI/UX Polish)**
- Tối ưu responsive 100% mượt mà trên smartphone và tablet.
- Tối ưu tốc độ tải trang, chuyển cảnh mượt và hiệu ứng chúc mừng khi nộp bài/đạt điểm cao.

#### 📅 **Ngày 15: Chạy Migration PostgreSQL Chính Thức & Bàn Giao**
- Chạy toàn bộ migration `004_live_classes.sql` và `005_assignments_quizzes.sql` lên PostgreSQL database.
- Cập nhật tài liệu hướng dẫn sử dụng dành cho Giáo viên, Học viên và Admin.
