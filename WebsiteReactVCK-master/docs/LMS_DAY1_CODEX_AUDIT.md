# LMS Day 1 — Codex Audit & Integration

Ngày hoàn thành: 2026-09-13  
Phạm vi: nối UI Day 1 của Gemini với route boundary, role policy và API contract hiện có.

## Đã hoàn thành

- Website công khai giữ `Navbar` và `Footer` riêng.
- `/lms/*` dùng shell riêng của Gemini:
  - `StudentLmsLayout` cho học viên.
  - `TeacherLmsLayout` cho route giảng viên.
- Thêm route giáo viên chuẩn:
  - `/lms/teacher-hub`
  - `/lms/teacher/schedule`
  - `/lms/teacher/curriculum`
  - `/lms/teacher/grading`
- Giữ alias `/lms/admin/curriculum` và `/lms/admin/grading` để chuyển đổi không làm hỏng link cũ.
- `/admin/*` chỉ nhận role `admin`; role `creator` dùng Teacher LMS.
- Route guard chờ `/api/auth/me` hoàn tất trước khi xét quyền, không cấp quyền từ snapshot localStorage đang cũ.
- Chuẩn hóa lỗi auth/role tối thiểu:
  - `401 UNAUTHENTICATED`: chưa đăng nhập hoặc session hết hạn.
  - `403 FORBIDDEN`: đã đăng nhập nhưng thiếu role.
- Backend có `requireRole`, `requireTeacher` và `requireAdmin` dùng chung.
- Các nghiệp vụ giáo viên đã chuyển sang policy `creator | admin`: tạo course/section/lesson, upload video, tạo live class, tạo assignment, chấm bài và điểm danh.
- `GET /api/assignments` yêu cầu đăng nhập và chỉ nối submission/điểm của chính học viên hiện tại.
- Bổ sung `GET /api/assignments/:assignmentId/submissions` cho grading queue; giáo viên chỉ query assignment do mình tạo, admin query toàn hệ thống.
- `lmsClient.js` dùng `credentials: include`, encode path params và ném `LmsApiError` cho HTTP error để UI xử lý loading/error đúng contract.

## Role contract

| Role backend | Ý nghĩa | Không gian chính |
|---|---|---|
| `user` | Học viên | Student LMS |
| `creator` | Giáo viên | Teacher LMS |
| `admin` | Quản trị toàn hệ thống | Admin + Teacher LMS |

UI chỉ là lớp hiển thị. Backend middleware mới là lớp quyết định quyền.

## API contract tối thiểu

API thành công dùng `{ success: true, data, message? }`. API lỗi dùng `{ success: false, message, errorCode? }`.

Các API LMS còn fallback mock ở một số router/page để phục vụ giai đoạn dựng UI. Những fallback này phải được tách thành fixture hoặc loại bỏ trước release production; không coi mock là dữ liệu nghiệp vụ thật.

## Cấu hình đã kiểm tra

- Frontend dev server: `http://localhost:5173`.
- Backend: `http://localhost:7000`.
- Vite proxy `/api` → backend port `7000`.
- CORS dùng `FRONTEND_URL` và bật credentials.
- Google OAuth callback đang trỏ về `/api/auth/google/callback` trên port `7000`.
- Secret không được ghi vào tài liệu hoặc commit.

## Việc chuyển sang Day 2

- Thêm ownership middleware/query cho course, class, session, submission và video playback.
- Chặn IDOR khi đổi `courseId`, `classId`, `assignmentId`, `submissionId` trên URL/body.
- Chuẩn hóa `/api/auth/me` DTO và xử lý session hết hạn ở mọi màn hình.
- Thêm test backend cho guest/student/teacher/admin.
- Xóa fallback demo khỏi production path sau khi API thật đủ dữ liệu.
