# LMS Ngày 6 — Teacher Hub và quản lý học viên

## Đã hoàn thành

- Thêm `GET /api/teacher/dashboard-stats` với một payload tổng hợp cho Teacher Hub: lớp phụ trách, session hôm nay, sĩ số, chuyên cần, tiến độ, cảnh báo học viên và hàng chờ chấm.
- Dashboard hỗ trợ filter server-side theo `classId` và trạng thái bài nộp, phân trang hàng chờ chấm, đồng thời có empty state thật cho giáo viên mới.
- Thêm `GET /api/teacher/classes/:classId/detail` trả roster, tiến độ từng học viên, chuyên cần, điểm tổng hợp và tình trạng assignment.
- Teacher chỉ truy cập được lớp có `live_classes.instructor_id` là chính mình; admin được xem toàn bộ. URL đổi `classId` ngoài ownership trả `403`.
- Thay toàn bộ fallback demo trong `TeacherHubPage.jsx` và `TeacherClassDetailPage.jsx` bằng dữ liệu API; không còn hiển thị số liệu giả khi database rỗng.
- Thêm migration `012_teacher_dashboard_audit.sql` với bảng `audit_events` và index cho dashboard/submission queries.
- Thêm audit event cho tạo assignment, sửa deadline/cập nhật assignment và chấm điểm. Grade vẫn kiểm tra `score <= max_score`, ghi lịch sử điểm, đổi trạng thái submission và tạo notification trong cùng transaction.

## Kiểm tra

- `node --check` pass cho teacher router, assignment router, audit service và server.
- `npm run test:auth` pass.
- `npm run build --prefix frontend` pass; chỉ còn cảnh báo Browserslist cũ và bundle lớn từ dependency hiện hữu.
- Guest gọi `/api/teacher/dashboard-stats`: `401 UNAUTHENTICATED`.
- Admin mới/không có lớp: `200`, tất cả aggregate bằng `0`, không có dữ liệu demo.
- Fixture tạm: teacher dashboard `200`, class detail `200`, pending/session aggregate đúng; teacher truy cập lớp khác `403 FORBIDDEN`. Fixture đã được xóa sau test.
- Fixture grade/deadline: PATCH deadline `200` với audit `assignment.deadline_updated`; grade `200`, submission thành `graded`, tạo grade notification và audit `submission.graded`. Fixture đã được xóa.
