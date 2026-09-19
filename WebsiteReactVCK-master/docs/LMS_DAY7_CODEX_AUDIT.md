# LMS Ngày 7 — Admin Console backend

## Đã hoàn thành

- Tạo policy riêng cho Admin Console tại `/api/admin`; mọi endpoint đều chạy qua `protectRoute` và `requireAdmin`. Creator không thể gọi nhầm API quản trị.
- Thêm `013_admin_console.sql`: cột `users.is_locked` và index cho truy vấn user/course/enrollment/progress/video.
- `protectRoute` kiểm tra `is_locked`, trả `403 ACCOUNT_LOCKED` và không cho tài khoản bị khóa tiếp tục sử dụng session.
- KPI `/api/admin/kpi-summary` lấy dữ liệu thật từ users, courses, enrollments, submissions, attendance, progress và audit log; không fallback số liệu demo.
- User management có search/filter role/status, sort whitelist, pagination server-side; create/update/delete/lock/unlock đều whitelist field và không trả password hash, token hoặc secret.
- Bảo vệ admin cuối cùng: không tự khóa, tự xóa hoặc hạ cấp quản trị viên cuối cùng; khóa user sẽ thu hồi `user_sessions`.
- Course management có list pagination/filter, create/update/publish/delete, curriculum detail, section/lesson CRUD và reorder.
- Xóa course bị từ chối nếu đã có enrollment hoặc lesson progress; xóa section bị từ chối khi còn lesson; xóa lesson bị từ chối khi đã có progress. Các tình huống trả `409` kèm số lượng để UI hiển thị cảnh báo.
- Video admin có presigned upload URL và bước confirm kiểm tra object tồn tại bằng signed `HEAD`, kích thước metadata phải khớp; chỉ asset `ready` mới được gắn vào lesson.
- Các mutation của admin ghi `audit_events` với actor, action, entity, before/after state an toàn và IP. State audit không chứa password hash/token.

## Kiểm tra

- Migration 013 đã áp dụng thành công trên Railway PostgreSQL.
- `node --check` pass cho admin router, video service, middleware và server.
- Guest gọi `/api/admin/kpi-summary`: `401 UNAUTHENTICATED`.
- Token của creator gọi `/api/admin/kpi-summary`: `403 FORBIDDEN`.
- Admin KPI/list/curriculum: `200`; dữ liệu trả về là aggregate và rows thật.
- Fixture tạm: tạo user `201`, khóa `200`, session của user bị thu hồi, token user khóa nhận `403 ACCOUNT_LOCKED`, mở khóa và xóa thành công. Fixture đã được xóa.
- Fixture tạm: course/section/lesson create thành công, update chỉ `isPublished` thành công, curriculum detail `200`.
- Course có enrollment bị xóa trả `409 COURSE_HAS_LEARNING_DATA`; sau khi dọn enrollment, course xóa thành công. Audit create/delete được ghi nhận.
- `npm run test:auth` tiếp tục pass.

## Phạm vi

- Ngày 7 này chỉ thay đổi backend, database migration và tài liệu; UI Gemini được giữ nguyên.
