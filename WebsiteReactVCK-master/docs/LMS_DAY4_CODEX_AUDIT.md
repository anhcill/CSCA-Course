# LMS Ngày 4 — Codex audit

Ngày kiểm tra: 14/09/2026

## Kết quả

Ngày 4 đã được nối từ UI Gemini vào backend thật cho live class, session, lịch định kỳ, roster và điểm danh.

- Teacher/admin tạo session trong database, không còn tạo dữ liệu chỉ ở state frontend.
- Student chỉ thấy session thuộc live class mình đã enrollment; teacher chỉ thấy lớp mình phụ trách; admin thấy toàn hệ thống.
- Endpoint danh sách và roster không trả `meet_url` hoặc `passcode`.
- Link Meet/Zoom chỉ trả qua endpoint access sau khi kiểm tra role, ownership/enrollment, trạng thái lớp và thời điểm mở phòng.
- Student chỉ được vào phòng trong 15 phút trước giờ bắt đầu hoặc khi session đang live.
- Điểm danh dùng transaction, kiểm tra toàn bộ học viên thuộc lớp và upsert idempotent theo `(session_id, user_id)`.
- Roster và tỉ lệ chuyên cần lấy từ `class_enrollments`, `class_attendance`, `class_sessions`; không còn roster giả.
- Session sắp tới tạo notification có `dedupe_key`; đổi link tạo notification cho học viên active mà không tạo trùng khi retry.
- Timestamps của session dùng `TIMESTAMPTZ`; frontend gửi ISO timestamp và hiển thị theo timezone trình duyệt/Việt Nam.

## API đã khóa

- `GET /api/live-classes`
- `POST /api/live-classes`
- `GET /api/live-classes/my-schedule`
- `POST /api/live-classes/:classId/join`
- `GET/POST /api/live-classes/:classId/enrollments`
- `GET/POST/PATCH/DELETE /api/live-classes/:classId/schedules`
- `GET/POST /api/live-classes/:classId/sessions`
- `PATCH /api/live-classes/sessions/:sessionId`
- `GET /api/live-classes/sessions/:sessionId/access`
- `GET /api/attendance/session/:sessionId`
- `POST /api/attendance/check`

## Database

Migration `010_live_class_policies.sql` đã chạy thành công, xác nhận 6 index mới cho live class, schedule, session, enrollment, attendance và notification dedupe.

## Kiểm thử

- Node syntax check pass cho live class router, attendance router, notification router, service và migration runner.
- ESLint pass cho API client, live schedule, teacher schedule và teacher attendance.
- Frontend production build pass: 3421 modules transformed.
- Guest requests tới schedule/access/attendance trả 401.
- Enrolled student nhận access 200 nhưng response không có passcode.
- Student ngoài lớp nhận 403 khi lấy access/roster.
- Teacher/admin roster 200 và chỉ hiển thị học viên active thuộc lớp.
- Gửi cùng attendance hai lần chỉ giữ 1 bản ghi.
- Đổi link session trả 200 và tạo 1 notification deduplicated.

## Việc cần làm khi triển khai thật

1. Tạo live class gắn với course hoặc thêm học viên qua endpoint enrollment.
2. Nhập link HTTPS Google Meet/Zoom thật; backend không chấp nhận host khác.
3. Cấu hình notification worker/scheduler nếu muốn gửi nhắc trước session mà không cần người dùng mở trang lịch.
4. Kiểm tra timezone cố định của sản phẩm nếu cần hỗ trợ nhiều múi giờ; DB vẫn lưu UTC.
