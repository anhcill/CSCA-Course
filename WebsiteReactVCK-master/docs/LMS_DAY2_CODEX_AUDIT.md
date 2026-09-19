# LMS Day 2 — Codex Audit

Ngày thực hiện: 13/09/2026

## Đã hoàn tất

- Nối SessionExpiredModal vào AuthContext và App, xử lý 401 từ cả Axios và fetch LMS.
- Nút login trên màn 401 mở đúng modal đăng nhập tại trang chủ.
- Chuẩn hóa 401, 403, 404, 422 cho các luồng LMS đã chạm tới.
- Thêm requireOwnership dùng chung và test middleware requireRole.
- Assignment:
  - học viên chỉ thấy bài tập thuộc khóa/lớp đã đăng ký;
  - chỉ giáo viên phụ trách bài tập mới xem hàng chờ/chấm bài;
  - kiểm tra tồn tại bài tập, enrollment, hạn nộp, giới hạn điểm và dữ liệu đầu vào.
- Live class:
  - học viên chỉ thấy lớp đã enroll;
  - giáo viên chỉ thấy lớp mình phụ trách;
  - lịch được scope theo role;
  - link Meet/Zoom chỉ trả sau khi kiểm tra quyền vào session, không trả passcode.
- Progress/notes:
  - kiểm tra lesson thuộc course;
  - học viên phải có enrollment trước khi ghi progress hoặc note.
- Course:
  - comment/rating của học viên yêu cầu enrollment;
  - parent comment phải cùng lesson/course;
  - giáo viên chỉ sửa course mình sở hữu khi tạo section/lesson.
- Attendance:
  - chỉ giáo viên phụ trách session hoặc admin được điểm danh;
  - chỉ học viên thuộc lớp mới có thể xuất hiện trong danh sách điểm danh.
- Video playback:
  - asset phải tồn tại và ready;
  - học viên chỉ xem video được gắn vào lesson của course mình đã enroll.
- Admin user:
  - role/gender được whitelist;
  - không thể hạ cấp admin cuối cùng.

## Kiểm chứng

- npm run test:auth: 3/3 pass.
- ESLint frontend cho các file Day 2: pass.
- node --check: pass cho các file backend đã sửa.
- npm run build: pass.
- Guest API: auth/me, assignments, live classes trả 401; leaderboard trả 200; Google OAuth trả 302.
- User fixture: /api/auth/ và grading queue trả 403; /api/live-classes trả 200.
- Admin fixture: admin users, grading queue và live classes trả 200.
- Browser: direct /lms/my-learning hiển thị màn 401; CTA mở modal login.

## Ghi chú

Database hiện có fixture role user và admin, chưa có user role creator, nên chưa thể chạy smoke test riêng cho giáo viên. Khi thêm một tài khoản creator, có thể chạy lại cùng bộ kiểm tra role để xác nhận ownership theo instructor trong môi trường dữ liệu thật.
