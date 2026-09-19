# LMS Ngày 3 — Codex audit

Ngày kiểm tra: 14/09/2026

## Phạm vi đã hoàn tất

- Classroom dùng API protected riêng và chỉ cho học viên đã đăng ký khóa học, chủ khóa học hoặc admin truy cập.
- Enrollment và progress không còn fallback dữ liệu giả khi database lỗi.
- Progress heartbeat dùng upsert/idempotent để refresh hoặc gửi lại request không tạo bản ghi trùng.
- Video playback nhận `lessonId`, kiểm tra quyền truy cập và trả signed URL private từ Cloudflare R2.
- Đã loại bỏ sample URL, fake HMAC URL, R2 secret mặc định và các mock course/lesson/attachment trong luồng LMS chính.
- Admin có API lấy cả khóa học draft và publish/draft khóa học bằng database thật.
- Catalog, ratings, course detail và curriculum admin dùng dữ liệu API thật trong các luồng đã chỉnh.

## Backend/API chính

- `GET /api/courses`: catalog public từ database, chỉ course published.
- `GET /api/courses/admin`: catalog cho teacher/admin, bao gồm draft.
- `GET /api/courses/admin/:courseId`: curriculum detail cho teacher/admin.
- `PATCH /api/courses/admin/:courseId/status`: publish hoặc chuyển draft.
- `GET /api/courses/:slug/classroom`: classroom protected theo enrollment/ownership.
- `GET /api/videos/playback-url?lessonId=...`: signed playback URL theo lesson và quyền truy cập.
- `GET /api/enrollments/my-courses`, `GET /api/enrollments/check/:courseId`: DB-only.

## R2 configuration

Video upload/playback hiện cố ý trả `503 R2_NOT_CONFIGURED` nếu thiếu cấu hình, không quay về demo URL. Cần khai báo các biến môi trường sau ở backend:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME` hoặc `R2_PRIVATE_BUCKET`
- Có thể cấu hình thêm `R2_S3_ENDPOINT`, `R2_UPLOAD_URL_TTL_SECONDS`, `R2_PLAYBACK_URL_TTL_SECONDS`.

Không ghi giá trị secret vào repository. Sau khi cấu hình, cần kiểm tra CORS bucket cho origin local và production để browser PUT upload được.

## Database

Migration `009_lms_performance_indexes.sql` đã được chạy thành công trên database hiện tại, xác nhận đủ 8 index LMS mới cho catalog, curriculum, enrollment, progress và video asset.

`run_sql.js` đã bỏ credential database hardcode và chỉ đọc `DATABASE_URL` từ backend environment.

## Kiểm thử đã chạy

- Node syntax check: pass cho course, enrollment, progress, video router/service và run_sql.
- `npm run test:auth`: 3/3 pass.
- ESLint các file LMS đã thay đổi: pass.
- Frontend production build: pass.
- Guest smoke test: catalog 200; classroom, playback và enrollment protected trả 401.
- Authenticated smoke test: admin catalog/detail 200; user không có quyền admin 403; user chưa enrollment bị chặn classroom; user upload bị chặn; thiếu R2 trả 503.
- Browser smoke test: route classroom hiển thị đúng màn hình `401 Yêu Cầu Đăng Nhập` khi chưa đăng nhập.

Full-repository lint vẫn còn các lỗi lịch sử ngoài phạm vi Ngày 3; lint mục tiêu trên các file thay đổi đã sạch.

## Việc cần làm khi nối môi trường thật

1. Khai báo R2 env ở backend và cấu hình CORS bucket.
2. Upload một video thật bằng tài khoản teacher/admin.
3. Confirm asset, publish lesson/course, enroll một học viên.
4. Kiểm tra signed playback, refresh progress và expired URL.
