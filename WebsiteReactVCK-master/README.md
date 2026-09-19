# CSCA Course / LMS

Ứng dụng gồm website công khai và LMS riêng cho học viên, giáo viên và admin. Backend Express dùng PostgreSQL; frontend React/Vite chạy độc lập khi phát triển và được build vào `frontend/dist` khi release.

## Chạy local

Yêu cầu Node.js 20+ và PostgreSQL/Railway PostgreSQL.

```powershell
npm install
npm install --prefix frontend
Copy-Item backend/.env.example backend/.env
```

Điền `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` và các biến Google OAuth/R2 cần dùng trong `backend/.env`. Không commit file `.env`.

```powershell
# Terminal 1: API tại http://localhost:7000
npm run serve

# Terminal 2: Vite tại http://localhost:5173
npm run dev --prefix frontend
```

## Database và migration

Migration chạy theo thứ tự trong `run_sql.js` và được thiết kế để chạy lại an toàn. Luôn backup trước khi chạy trên database có dữ liệu:

```powershell
pg_dump --dbname="$env:DATABASE_URL" --format=custom --file="backup-before-lms.dump"
node run_sql.js
```

`run_sql.js` không chạy seed mặc định. Chỉ dùng seed ở database local/fixture:

```powershell
$env:RUN_SEEDS = "true"
node run_sql.js
Remove-Item Env:RUN_SEEDS
```

Khôi phục khi cần:

```powershell
pg_restore --clean --if-exists --dbname="$env:DATABASE_URL" "backup-before-lms.dump"
```

## Quyền và flow chính

- `user`: đăng ký khóa, học video, heartbeat tiến độ, quiz, nộp bài, xem điểm, live class, notification, leaderboard và certificate.
- `creator`: quản lý lớp/khóa/bài tập thuộc quyền sở hữu, điểm danh và chấm bài được phân công.
- `admin`: quản trị user/role, khóa học, curriculum, video, audit và dữ liệu toàn hệ thống.

Video dùng presigned URL Cloudflare R2. Flow là `POST /api/videos/upload-url` → client upload đúng `fileKey`/header → `POST /api/videos/confirm`; chỉ asset đã confirm mới được gắn vào lesson.

## Kiểm thử và release build

```powershell
npm run test:security
npm run build
npm start
```

Smoke test LMS dùng fixture tạm cần chạy với database test/được phép ghi và phải dọn fixture sau test. Các checklist release nằm tại [docs/LMS_DAY9_CODEX_AUDIT.md](docs/LMS_DAY9_CODEX_AUDIT.md) và [docs/LMS_DAY10_CODEX_AUDIT.md](docs/LMS_DAY10_CODEX_AUDIT.md).

## Production checklist ngắn

- `NODE_ENV=production`, toàn bộ `FRONTEND_URL` và `GOOGLE_REDIRECT_URI` dùng HTTPS. Google OAuth có thể để tắt bằng cách bỏ trống toàn bộ bốn biến Google; để bật account activation, phải cấu hình đủ cả bốn biến cùng lúc.
- `JWT_SECRET` dài tối thiểu 32 ký tự và Google/R2 secrets chỉ nằm trong secret manager/environment.
- `AUTH_DEBUG_CODES=false`; mã OTP/reset không được ghi log.
- `TRUST_PROXY=true` chỉ khi reverse proxy đã được cấu hình đúng.
- Chạy backup, migration, health/smoke test và lưu changelog trước khi mở traffic.
- Nếu release lỗi: dừng traffic ghi dữ liệu, restore backup theo runbook, kiểm tra `/api/auth/me` và flow student/teacher/admin rồi mới mở lại.
