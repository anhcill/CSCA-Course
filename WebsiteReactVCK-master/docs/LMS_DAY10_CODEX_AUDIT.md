# LMS Ngày 10 — Release, vận hành và bàn giao

## Release contract

- Backend dùng Express/PostgreSQL; frontend build bằng Vite vào `frontend/dist`.
- `npm run build` tạo production bundle; `npm start` chạy backend với `NODE_ENV=production` và phục vụ bundle.
- `backend/.env.example` là danh sách biến mẫu. Secret thật không nằm trong Git; `backend/.env` bị ignore.
- `run_sql.js` chạy schema + migration theo thứ tự và không chạy seed mặc định. Seed chỉ bật rõ ràng bằng `RUN_SEEDS=true` ở local/fixture.
- Migration 014 đã được áp dụng cho database hiện tại; trước release phải backup bằng `pg_dump`.

## Pre-release checklist

- [ ] Set `NODE_ENV=production`.
- [ ] `FRONTEND_URL` và `GOOGLE_REDIRECT_URI` là HTTPS, trỏ đúng domain production.
- [ ] `DATABASE_URL`, `JWT_SECRET`, Google OAuth và R2 secrets nằm trong secret manager/environment.
- [ ] `AUTH_DEBUG_CODES` không bật; `TRUST_PROXY` chỉ bật sau khi xác nhận reverse proxy.
- [ ] Backup database trước migration; lưu artifact và thời điểm backup.
- [ ] Chạy `node run_sql.js` và kiểm tra exit code; không dùng `RUN_SEEDS=true` trên production.
- [ ] Chạy `npm run test:security` và `npm run build`.
- [ ] Chạy `npm audit --omit=dev` và `npm audit --prefix frontend --omit=dev`; backend phải sạch, frontend xử lý các cảnh báo còn lại trước public release.
- [ ] Smoke `/api/auth/me`, public catalog, student LMS, teacher/admin route và certificate verify.
- [ ] Kiểm tra response/log không chứa JWT, password hash, OAuth/R2 secret, OTP/reset code.
- [ ] Xác nhận frontend Gemini vẫn giữ nguyên các màn hình đã nghiệm thu.

## Rollback runbook

1. Dừng traffic ghi dữ liệu hoặc đưa ứng dụng về maintenance.
2. Lưu log lỗi và trạng thái migration hiện tại.
3. Restore bản backup đã xác nhận bằng `pg_restore --clean --if-exists`.
4. Deploy artifact trước đó; không chạy seed.
5. Kiểm tra `/api/auth/me`, login/logout, student enrollment/playback, teacher grade và admin audit.
6. Mở traffic lại theo từng bước và theo dõi error rate/database connections.

Rollback migration mới cần được chuẩn bị riêng theo schema của từng release; không dùng lệnh phá hủy tùy ý trên production.

## Hướng dẫn vận hành nhanh

Chi tiết setup, local run, migration, backup/restore, role và video upload nằm trong [README.md](../README.md). Changelog release nằm trong [CHANGELOG.md](../CHANGELOG.md).

## Việc sau MVP

- Thay memory rate limiter bằng Redis/gateway khi scale nhiều instance.
- Nối email provider cho signup OTP/password reset và dùng code hash tại DB.
- Thêm CI browser E2E matrix trên Chrome/Edge/mobile viewport.
- Thêm metrics/tracing, alert PostgreSQL pool/R2 failures và job dọn notification/OTP hết hạn.
- Sinh PDF certificate và object storage policy riêng nếu product cần tải bản PDF thật.
- Xử lý dependency audit còn tồn tại trong frontend theo một change riêng, có regression UI đầy đủ.
