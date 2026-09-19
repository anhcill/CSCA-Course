# LMS Ngày 9 — E2E, security và performance audit

## Đã thực hiện

- Thêm security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; production thêm HSTS.
- Tắt `X-Powered-By`, giới hạn CORS theo exact origin và hỗ trợ allow-list origin phân tách bằng dấu phẩy.
- Rate-limit theo IP + endpoint cho login, signup, OTP, password reset và Google OAuth; vượt ngưỡng trả `429 RATE_LIMITED` kèm `Retry-After`.
- Production startup fail-fast nếu thiếu `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, Google OAuth config, HTTPS origin/redirect hoặc bật debug code.
- JWT chỉ đặt trong HttpOnly cookie; login không còn trả token trong JSON. Tài khoản bị khóa bị từ chối ngay tại login và tiếp tục được kiểm tra ở middleware.
- Google OAuth callback cũng chặn tài khoản bị khóa trước khi phát hành JWT.
- OTP/reset code dùng `crypto.randomInt`; không log code trừ khi local operator chủ động bật `AUTH_DEBUG_CODES=true`. Password reset khóa token bằng transaction và thu hồi session cũ.
- Course catalog giới hạn 100 khóa; comments giới hạn 500; ratings giới hạn 200; input search/comment/rating/parent id được validate.
- Public comments/ratings chỉ đọc nội dung đã publish; creator chỉ được bình luận trên lesson thuộc khóa mình phụ trách; rating chỉ dành cho learner đã enrollment.
- Các flow Day 7–8 tiếp tục giữ ownership/role checks: video playback, class/session, assignment/grade, admin và certificate.

## E2E matrix cần chạy khi có database fixture

| Actor | Flow | Kết quả cần có |
|---|---|---|
| Guest | public catalog/detail/ratings/comments | chỉ thấy khóa và lesson published; LMS/private API trả 401 |
| Student | enroll → playback → heartbeat → quiz → submit → XP | access scoped theo enrollment; retry không nhân đôi XP |
| Student | schedule → session access → attendance → certificate | chỉ vào class đã tham gia; certificate không cấp sớm |
| Teacher | class → schedule/session → enrollment → attendance | chỉ quản lý class do mình phụ trách |
| Teacher | assignment → submission queue → grade → notification | chỉ chấm submission thuộc assignment được phân công |
| Admin | users/roles → course/curriculum/video → audit | admin-only; bảo vệ admin cuối cùng |

## Security acceptance

- SQL dùng parameter binding hoặc whitelist; không nối trực tiếp input người dùng vào giá trị SQL.
- IDOR checks được kiểm tra theo user/course/class/assignment/submission/asset/certificate.
- Role không lấy từ request body/query; middleware đọc role hiện tại từ database.
- Signed URL video/bài nộp có TTL giới hạn và asset phải qua server-side validation.
- OAuth callback kiểm tra state, PKCE verifier, nonce, ID token audience và email verified.
- Cookie production `Secure`, `HttpOnly`, `SameSite=Strict` cho JWT; OAuth flow dùng cookie `Lax` riêng, path giới hạn.
- Error response không trả stack trace, password hash, JWT, OAuth secret, R2 key ngoài contract cần thiết hoặc reset code.

## Kiểm tra đã chạy

- `node --check` pass cho backend files đã thay đổi.
- `npm run test:security` pass: 6/6 tests (role middleware + headers/CORS/rate-limit).
- Day 8 smoke fixture pass; fixture được dọn sạch sau test.
- Database xác nhận có `xp_events`, `certificates`, `notifications`; không còn user fixture `day8_*`.
- `npm audit --omit=dev` cho dependency backend: 0 vulnerability sau cập nhật patch-level.

## Known limitations sau audit

- Rate limiter hiện nằm trong memory của một process; khi chạy nhiều instance cần chuyển bucket sang Redis hoặc gateway rate limit.
- OTP/password reset chưa có email provider production; trước release phải nối provider và tắt debug code.
- E2E browser matrix cần chạy thêm trên CI/browser thật sau khi Gemini chốt UI; backend contract đã được khóa theo route hiện tại.
- `npm audit --prefix frontend --omit=dev` vẫn còn cảnh báo trong dependency/UI tree; không tự ý nâng version frontend trong lượt backend này vì phải giữ nguyên phần UI Gemini. Cần xử lý thành một task frontend riêng trước public release.
