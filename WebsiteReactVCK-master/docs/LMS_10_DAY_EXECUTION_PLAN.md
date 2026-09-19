# CSCA LMS — Kế Hoạch Xây Dựng Chuẩn Trong 10 Ngày

> **Dự án:** CSCA Academy / CSCA Course  
> **Mục tiêu:** Hoàn thiện một LMS thật dùng được cho học viên online, giáo viên và admin; website công khai vẫn hoạt động độc lập.  
> **Cách phối hợp:** Mỗi ngày Gemini làm UI/UX trước. Sau đó Codex review UI, khóa contract, làm backend, tích hợp dữ liệu thật, sửa frontend logic và chạy QA.

---

## 1. Kết quả cần đạt sau 10 ngày

### Website chính

Website chính dành cho khách và người dùng thông thường, không bị biến thành màn hình quản trị LMS:

- Trang chủ, giới thiệu, bài viết, chính sách.
- Danh mục khóa học công khai tại `/courses`.
- Bảng xếp hạng công khai tại `/rank` nếu muốn mở cho cộng đồng.
- Đăng nhập/đăng ký, hồ sơ cá nhân và các CTA dẫn vào LMS.
- Người học online vẫn nhìn thấy website chính như người dùng bình thường; chỉ có thêm nút **Vào LMS học viên**.

### LMS học viên

Khu vực `/lms/*` là không gian học online riêng, có layout và điều hướng riêng:

- Dashboard tiến độ học tập.
- Khóa học đã đăng ký, chương/bài học, video và lưu tiến độ.
- Lịch học Live Google Meet/Zoom.
- Bài tập, quiz, nộp bài, kết quả và nhận xét.
- Điểm danh, streak, XP, bảng xếp hạng theo lớp/toàn hệ thống.
- Thông báo, chứng chỉ và tra cứu chứng chỉ.

### LMS giáo viên

Giáo viên chỉ thấy lớp và học viên mình phụ trách:

- Dashboard lớp học và lịch dạy.
- Tạo/quản lý buổi Live, điểm danh.
- Giao bài tập/quiz cho lớp.
- Xem bài nộp, nghe audio HSKK, chấm điểm và nhận xét.
- Theo dõi tiến độ, điểm số và học viên cần hỗ trợ.

### Admin

Admin quản lý toàn hệ thống:

- Người dùng, vai trò và trạng thái tài khoản.
- Khóa học, section, lesson, video và nội dung.
- Lớp học, giáo viên, học viên và enrollment.
- Bài tập, quiz, ngân hàng câu hỏi, chấm điểm.
- Thông báo, leaderboard, chứng chỉ và cấu hình hệ thống.
- Audit log cho các thao tác quản trị quan trọng.

---

## 2. Nguyên tắc phối hợp Gemini → Codex

### Thứ tự cố định mỗi ngày

1. **Gemini — UI/UX trước**
   - Thiết kế wireframe hoặc component.
   - Làm trạng thái loading, empty, error, success và mobile.
   - Không tự sửa database, middleware, secret, migration hoặc business rule.
   - Dùng mock data có ghi rõ `MOCK_UI_ONLY`.

2. **Codex — backend và tích hợp sau**
   - Review UI theo role và responsive.
   - Chốt route/API/schema trước khi nối dữ liệu.
   - Kiểm tra quyền truy cập và chống sửa ID trên URL.
   - Thay mock bằng API thật, xử lý loading/error/retry.
   - Chạy test, build và ghi lại lỗi còn lại.

3. **Cuối ngày — nghiệm thu**
   - Chạy smoke test theo role.
   - Chụp hoặc ghi lại kết quả UI.
   - Chốt danh sách việc tồn của ngày hôm sau.

### Phân vùng file để tránh đè code

| Người | Phạm vi chính | Không tự ý sửa |
|---|---|---|
| Gemini | `frontend/src/features/**/pages`, components UI, styles, mock UI | `backend/**`, `database/**`, `.env`, auth middleware |
| Codex | `backend/**`, `database/**`, API client, route guard, integration, QA | Giữ nguyên ý đồ UI đã được nghiệm thu |
| Cả hai | `App.jsx`, `Navbar.jsx`, `components/layouts/*LmsLayout.jsx` | Chỉ sửa sau khi ghi rõ contract và tránh làm mất thay đổi của người kia |

### Quy tắc dữ liệu

- Không để dữ liệu demo/fallback giả làm dữ liệu thật trong production.
- API luôn trả một format thống nhất: `{ success, data, message, errorCode }`.
- Không gửi `password_hash`, `google_id`, secret, token hoặc dữ liệu nội bộ ra frontend.
- Tất cả endpoint thay đổi dữ liệu phải kiểm tra role và ownership ở backend; UI không phải lớp bảo mật.
- Dùng transaction cho enrollment, nộp bài, chấm điểm, cấp XP và cấp chứng chỉ.

---

## 3. Role và ma trận quyền bắt buộc

| Tính năng | Guest | Student | Teacher | Admin |
|---|---:|---:|---:|---:|
| Xem website chính | Có | Có | Có | Có |
| Xem danh mục khóa học công khai | Có | Có | Có | Có |
| Vào LMS | Không | Có | Có | Có |
| Xem khóa học đã enrollment | Không | Của mình | Lớp được giao | Tất cả |
| Lưu tiến độ/video/ghi chú | Không | Của mình | Không | Không |
| Xem lịch Live | Không | Lớp của mình | Lớp mình dạy | Tất cả |
| Giao bài/quiz | Không | Không | Lớp mình dạy | Tất cả |
| Nộp bài/làm quiz | Không | Của mình | Không | Không |
| Chấm bài | Không | Không | Bài thuộc lớp mình | Tất cả |
| Điểm danh | Không | Xem của mình | Lớp mình dạy | Tất cả |
| Leaderboard công khai | Có thể | Có | Có | Có |
| Leaderboard nội bộ LMS | Không | Theo quyền | Lớp mình dạy | Tất cả |
| Quản lý user/role | Không | Không | Không | Có |
| Quản lý nội dung khóa học | Không | Không | Theo phân quyền | Có |

> Việc cần sửa sớm trong code hiện tại: middleware `requireAdmin` đang chỉ cho `admin`, trong khi các tính năng Teacher Hub/grading/curriculum cần policy riêng cho `creator` và kiểm tra ownership.

---

## 4. Kiến trúc route mục tiêu

### Website chính

```text
/
/courses
/rank
/post
/about
/policy-and-legal
/profile
```

### LMS học viên

```text
/lms
/lms/my-learning
/lms/catalog
/lms/courses/:slug
/lms/learn/:courseId
/lms/live-schedule
/lms/assignments
/lms/assignment/:id/submit
/lms/quiz/:quizId
/lms/leaderboard
/lms/certificates
```

### LMS giáo viên

```text
/lms/teacher-hub
/lms/teacher/classes
/lms/teacher/classes/:classId
/lms/teacher/schedule
/lms/teacher/assignments
/lms/teacher/grading
/lms/teacher/attendance
```

Các route cũ như `/lms/admin/grading` và `/lms/admin/curriculum` có thể giữ alias trong giai đoạn chuyển đổi, nhưng UI mới nên gọi đúng theo role là Teacher/Admin để tránh gây nhầm.

### Admin

```text
/admin
/admin/users
/admin/courses
/admin/courses/:courseId/lessons
/admin/lessons/:lessonId/exercises
/admin/classes
/admin/assignments
/admin/certificates
/admin/audit-log
```

---

## 5. Kế hoạch chi tiết 10 ngày

## Ngày 1 — Chốt kiến trúc, design system và contract

### Gemini làm trước — UI/UX

- Chốt sitemap cho Website chính, Student LMS, Teacher LMS và Admin.
- Thiết kế 3 shell riêng:
  - `PublicLayout`: website chính.
  - `StudentLmsLayout`: sidebar/header học viên.
  - `TeacherLmsLayout` và `AdminLayout`: điều hướng theo role.
- Chốt design tokens: màu, typography, spacing, radius, button, table, card, badge.
- Thiết kế đủ 6 trạng thái cho một màn hình: loading, empty, error, success, permission denied, mobile.
- Dựng wireframe cho dashboard của Student/Teacher/Admin.

### Codex làm sau

- Audit toàn bộ route, component, migration 003–008 và API hiện có.
- Khóa route boundary: public không dùng LMS Navbar; LMS không dùng Footer/Navbar public.
- Viết role matrix và API response contract.
- Tạo `LmsRouteGuard`/role guard dùng chung; không tin role từ localStorage nếu backend chưa xác thực.
- Kiểm tra CORS, cookie, JWT, Google OAuth callback, `NODE_ENV` và `.env`.
- Lập danh sách API hiện có, API thiếu, API đang trả mock/fallback.
- Chốt migration strategy: không tạo bảng trùng; migration mới phải idempotent.

### Nghiệm thu ngày 1

- Guest vào `/` và `/courses` thấy website bình thường.
- Student vào `/lms` thấy đúng shell Student.
- Teacher/Admin không bị đưa nhầm vào menu Student.
- Mọi màn hình mới đều có quy tắc đặt tên route/API rõ ràng.

---

## Ngày 2 — Authentication, RBAC và layout theo role

### Gemini làm trước — UI/UX

- Hoàn thiện header/sidebar responsive cho Student, Teacher, Admin.
- Thiết kế màn hình `Unauthorized`, `Forbidden`, session hết hạn và login lại.
- Thêm user menu, notification bell, theme, language và breadcrumbs.
- Dựng navigation theo role, không hiển thị link mà user không có quyền.

### Codex làm sau

- Tạo middleware `requireAuth`, `requireRole(...roles)`, `requireOwnership`.
- Kiểm tra mọi route backend hiện có không bị IDOR:
  - Student không xem dữ liệu student khác.
  - Teacher không chấm bài ngoài lớp của mình.
  - Creator không sửa user/admin setting.
  - Admin mới được quản lý toàn hệ thống.
- Đồng bộ `/api/auth/me` với `AuthContext` và route guard.
- Chuẩn hóa status code: `401` chưa đăng nhập, `403` thiếu quyền, `404` không tồn tại, `422` dữ liệu sai.
- Thêm test cho guest/student/teacher/admin ở từng nhóm API.

### Nghiệm thu ngày 2

- Gõ trực tiếp URL nhạy cảm vẫn bị backend chặn.
- Ẩn link trên UI chỉ là UX; kiểm tra bằng request thật vẫn đúng quyền.
- Logout xóa session và không thể dùng lại trang LMS riêng.

---

## Ngày 3 — Course catalog, curriculum, classroom và progress

### Gemini làm trước — UI/UX

- Student: danh mục, filter/search, chi tiết khóa học, enrollment CTA.
- Student: classroom với video, lesson list, progress bar, notes/comments.
- Teacher/Admin: course editor, section/lesson editor, trạng thái publish/draft.
- Hiển thị skeleton, video lỗi, lesson bị khóa, khóa học hết quyền truy cập.

### Codex làm sau

- Audit và hoàn thiện API courses/sections/lessons/enrollment/progress.
- Kiểm tra `lesson_progress` unique theo user/lesson và heartbeat idempotent.
- Signed playback URL không lộ R2 secret và không cho truy cập video ngoài enrollment.
- Chuẩn hóa slug/course ID; chống query thiếu index.
- Xóa fallback demo khỏi luồng production hoặc tách thành fixture test.
- Nối `lmsClient.js` với API thật, xử lý `401/403/404/500`.

### Nghiệm thu ngày 3

- Student chỉ thấy khóa đã được phép học.
- Refresh classroom không mất progress.
- Video không phát nếu chưa enrollment hoặc link đã hết hạn.
- Admin publish khóa học thì catalog cập nhật đúng.

---

## Ngày 4 — Live class, lịch học và điểm danh

### Gemini làm trước — UI/UX

- Student: calendar/list view, countdown, trạng thái sắp học/đang live/đã kết thúc.
- Student: nút vào Google Meet/Zoom chỉ nổi bật khi đủ điều kiện.
- Teacher: lịch dạy, tạo session, mở phòng, danh sách học viên.
- Teacher: attendance table với present/absent/excused, bulk action và ghi chú.

### Codex làm sau

- Hoàn thiện policy cho `live_classes`, `class_schedules`, `class_sessions`, `class_enrollments`.
- Link Meet/Zoom chỉ trả về cho user đủ quyền; không trả passcode cho người ngoài lớp.
- Chuẩn hóa timezone về UTC trong DB, hiển thị Asia/Ho_Chi_Minh ở frontend.
- Attendance upsert idempotent theo `(session_id, user_id)`.
- Chặn teacher sửa session không thuộc mình; admin có quyền toàn hệ thống.
- Tạo notification khi session sắp bắt đầu và khi link thay đổi.

### Nghiệm thu ngày 4

- Một session hiển thị đúng giờ ở cả desktop/mobile.
- Student lớp A không thấy session lớp B.
- Điểm danh refresh không tạo bản ghi trùng.
- Link phòng không lộ qua response cho user ngoài lớp.

---

## Ngày 5 — Assignment, quiz, submission và chống nộp trùng

### Gemini làm trước — UI/UX

- Student: assignment list theo trạng thái `todo/submitted/graded/late`.
- Quiz player: timer, điều hướng câu hỏi, autosave UI, confirm trước khi nộp.
- Submission: text, file, audio HSKK, preview, progress upload và lỗi upload.
- Result page: điểm, đáp án, giải thích, feedback giáo viên.

### Codex làm sau

- Audit `assignments`, `quizzes`, `quiz_questions`, `assignment_submissions`, `submission_grades`.
- Thêm/kiểm tra ownership theo course/live class/enrollment.
- Quiz submit phải idempotent, khóa attempt sau khi nộp và không gửi `correct_answer` trước thời điểm cho phép.
- Validate file type/size, filename, content length; không tin URL do client gửi.
- Chấm tự luận phải lưu lịch sử grader, thời gian, điểm và feedback trong transaction.
- Xử lý deadline theo server time, phân biệt late và submitted.

### Nghiệm thu ngày 5

- Student không thể nộp cùng một assignment hai lần ngoài policy.
- Student không nhìn thấy đáp án đúng trước khi nộp.
- Teacher chỉ chấm bài thuộc lớp mình.
- Quiz refresh hoặc mất mạng không làm mất trạng thái ngoài policy đã chốt.

---

## Ngày 6 — Teacher Hub và quản lý học viên

### Gemini làm trước — UI/UX

- Dashboard giáo viên: lớp đang dạy, session hôm nay, bài chờ chấm, cảnh báo học viên.
- Class detail: roster, progress, attendance, assignment status.
- Grading workspace: split view bài nộp/feedback, keyboard-friendly score input.
- Bộ lọc theo lớp, trạng thái, deadline và mức độ cần hỗ trợ.

### Codex làm sau

- Tạo các API aggregation có filter/pagination, tránh frontend gọi quá nhiều endpoint.
- Teacher chỉ đọc được lớp mình phụ trách.
- Grade endpoint kiểm tra score range theo `max_score` và chống grade sai assignment.
- Ghi audit event cho tạo bài, sửa deadline, chấm/sửa điểm.
- Thêm API progress summary theo course/class/student và index các truy vấn dashboard.

### Nghiệm thu ngày 6

- Teacher mới đăng nhập thấy dashboard rỗng đúng cách, không thấy dữ liệu demo.
- Chấm điểm cập nhật kết quả student và notification trong cùng flow.
- Teacher đổi URL `classId/submissionId` không vượt được ownership.

---

## Ngày 7 — Admin Console và quản trị nội dung

### Gemini làm trước — UI/UX

- Admin dashboard: KPI users, courses, enrollments, submissions, attendance.
- User management: search, filter role/status, detail, khóa/mở tài khoản.
- Course/curriculum management: draft/publish, reorder section/lesson, video upload state.
- Bảng dữ liệu có pagination, confirm dialog, undo/error feedback.

### Codex làm sau

- Tách rõ admin policy khỏi teacher policy.
- Bổ sung pagination/sort/filter server-side cho users/courses/assignments.
- Chống mass assignment: chỉ nhận field được whitelist.
- Upload video dùng presigned URL, kiểm tra size/mime/status trước khi confirm.
- Thêm audit log tối thiểu: actor, action, entity, entity_id, before/after, IP/time nếu policy cho phép.
- Không cho admin API trả secret/password/token.

### Nghiệm thu ngày 7

- Admin CRUD không làm hỏng enrollment/progress hiện có.
- Xóa course/lesson xử lý foreign key đúng policy và có cảnh báo.
- Mọi thao tác nguy hiểm có confirm và log.

---

## Ngày 8 — Notification, XP/streak, leaderboard và certificate

### Gemini làm trước — UI/UX

- Notification center: unread/read/read all, deep link đến màn hình liên quan.
- Student progress celebration: XP, streak, badge, completion state.
- Leaderboard public và leaderboard LMS có context khác nhau, không trộn dữ liệu/UI.
- Certificate page: certificate card, QR/verification, download/print state.

### Codex làm sau

- XP event phải idempotent; một event không cộng điểm hai lần khi retry.
- Chốt công thức XP/streak, timezone và ngày hoạt động.
- Leaderboard query có scope: public, class, course, period; pagination và tie-breaker ổn định.
- Notification tạo đúng recipient, không lộ nội dung assignment của người khác.
- Cấp certificate chỉ khi đủ eligibility: progress, passing score, assignment policy.
- Endpoint verify certificate công khai chỉ trả thông tin cần thiết, không trả dữ liệu cá nhân dư thừa.

### Nghiệm thu ngày 8

- Nộp quiz/hoàn thành lesson/regrade không tạo XP trùng.
- Student thấy đúng leaderboard scope.
- Certificate không cấp sớm và mã verify hoạt động.

---

## Ngày 9 — E2E, security, performance và mobile polish

### Gemini làm trước — UI/UX

- Rà soát toàn bộ loading/empty/error/permission states.
- Test mobile 320px, 375px, tablet và desktop.
- Sửa overflow table, modal, quiz timer, video player, sidebar.
- Accessibility: focus visible, keyboard navigation, label, contrast, reduced motion.
- Thống nhất copy tiếng Việt/English và trạng thái toast.

### Codex làm sau

- Chạy E2E matrix:

  ```text
  Guest → public pages → bị chặn LMS
  Student → enrollment → học video → progress → quiz → submit → XP
  Student → xem live → attendance của mình → certificate
  Teacher → tạo session → giao bài → chấm → xem progress lớp
  Admin → user/course/class/content/audit
  ```

- Security audit: IDOR, role escalation, CORS, cookie, JWT expiry, OAuth callback, file upload, SQL injection, XSS từ feedback/comment.
- Performance audit: N+1 query, missing index, payload quá lớn, duplicate requests.
- Kiểm tra migration trên database sạch và database có dữ liệu cũ.
- Tạo regression checklist cho những route Website chính đã có.

### Nghiệm thu ngày 9

- Không có lỗi P0/P1.
- Không có API nhạy cảm nào bỏ qua auth/role/ownership.
- Mobile không có màn hình chính bị vỡ layout.
- Build production và smoke test pass.

---

## Ngày 10 — Release, tài liệu và bàn giao

### Gemini làm trước — UI/UX

- Final visual QA trên các màn hình chính của 3 role.
- Hoàn thiện empty state cho tài khoản mới.
- Chụp màn hình hướng dẫn Student/Teacher/Admin.
- Chốt copy, icon, spacing, responsive và accessibility.
- Ghi danh sách known UI limitations nếu còn.

### Codex làm sau

- Chạy migration theo thứ tự và kiểm tra backup/rollback.
- Kiểm tra `.env.example`, Google OAuth redirect production, CORS production, cookie secure.
- Chạy `npm run build`, API smoke test và E2E smoke test sau build.
- Kiểm tra không còn secret trong git, bundle hoặc log.
- Viết README vận hành:
  - Cách chạy backend/frontend.
  - Cách chạy migration.
  - Cách tạo user/role.
  - Cách upload video.
  - Cách tạo lớp/giao bài/chấm bài.
  - Cách backup/rollback.
- Tag release và ghi changelog.

### Nghiệm thu ngày 10

- Student, Teacher, Admin đều có một flow hoàn chỉnh từ login đến tác vụ chính.
- Website chính và LMS không bị trộn navigation/layout.
- Có tài liệu vận hành và checklist khôi phục khi lỗi.
- Có danh sách việc sau MVP, không đưa tính năng chưa ổn định vào production.

---

## 6. API contract tối thiểu cần khóa

### Authentication

```text
GET  /api/auth/me
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/google
GET  /api/auth/google/callback
```

### Student LMS

```text
GET  /api/courses
GET  /api/courses/:slug
GET  /api/enrollments/my-courses
POST /api/enrollments
GET  /api/progress/course/:courseId
POST /api/progress/heartbeat
GET  /api/live-classes/my-schedule
GET  /api/live-classes/sessions/:sessionId/access
GET  /api/assignments
POST /api/assignments/:id/submit
GET  /api/assignments/quizzes/:quizId
POST /api/assignments/quizzes/:quizId/submit
GET  /api/notifications
GET  /api/attendance/leaderboard
GET  /api/certificates/my-certificates
GET  /api/certificates/verify/:code
```

### Teacher/Admin

```text
POST/PATCH /api/live-classes/**
POST/PATCH /api/assignments/**
POST        /api/assignments/submissions/:id/grade
POST        /api/attendance/check
POST        /api/courses/admin/**
POST        /api/videos/upload-url
POST        /api/videos/confirm
GET/PATCH   /api/admin/users/**
GET         /api/admin/reports/**
GET         /api/admin/audit-log
```

Mỗi endpoint phải ghi rõ trong tài liệu:

- Auth bắt buộc hay không.
- Role được phép.
- Ownership rule.
- Request body và validation.
- Response thành công.
- Các `errorCode` có thể xảy ra.
- Có cần transaction/idempotency hay không.

---

## 7. Checklist kiểm thử bắt buộc

### Functional

- Login local và Google OAuth.
- Logout, session hết hạn và login lại.
- Public navigation không đưa khách vào LMS.
- Student enrollment, học video, progress, note, comment.
- Student schedule, vào phòng Live, quiz, nộp bài, xem điểm.
- Teacher tạo lớp, lịch, bài tập, điểm danh, chấm bài.
- Admin quản lý user, role, course, lesson, video, certificate.

### Authorization

- Guest gọi API Student nhận `401`.
- Student gọi API Teacher/Admin nhận `403`.
- Teacher truy cập dữ liệu lớp khác nhận `403` hoặc `404` theo policy.
- Sửa ID trên URL không đọc/sửa được dữ liệu người khác.

### Reliability

- Double click submit không tạo bản ghi/XP trùng.
- Refresh trong lúc quiz/upload có trạng thái rõ ràng.
- Database mất kết nối hiển thị error state, không crash toàn app.
- Migration chạy lại không lỗi.

### UI/UX

- 320px, 375px, 768px, 1280px.
- Keyboard navigation và focus visible.
- Không có text tràn, table phá layout hoặc modal vượt viewport.
- Dark/light mode không mất contrast.

---

## 8. Definition of Done cho từng ngày

Một ngày chỉ được đánh dấu hoàn thành khi đủ 5 điều kiện:

1. UI Gemini có đủ loading/empty/error/success/mobile.
2. API/schema/policy của Codex được ghi rõ và review.
3. Frontend đã nối dữ liệu thật, không chỉ chạy mock.
4. Role test tối thiểu cho Guest/Student/Teacher/Admin đã chạy.
5. Build hoặc smoke test liên quan đã pass; lỗi còn lại được ghi thành issue cụ thể.

### Mẫu báo cáo cuối ngày

```text
Ngày: __
Gemini đã hoàn thành: __
Codex đã tích hợp: __
API/schema đã khóa: __
Test đã chạy: __
Lỗi còn lại: __
Blocker: __
Việc ưu tiên ngày mai: __
```

---

## 9. Thứ tự ưu tiên nếu thiếu thời gian

Nếu 10 ngày bị thiếu nguồn lực, giữ nguyên thứ tự:

1. Auth/RBAC/ownership.
2. Course/classroom/progress.
3. Live class/attendance.
4. Assignment/quiz/grading.
5. Teacher Hub.
6. Admin Console.
7. Notifications/XP/certificate.
8. Visual polish nâng cao.

Không đánh đổi security và dữ liệu thật để lấy animation hoặc dashboard đẹp. MVP được coi là đạt khi một Student, một Teacher và một Admin chạy được flow chính end-to-end với quyền đúng và dữ liệu không bị lẫn.

---

## 10. Prompt giao Gemini — Ngày 1

Bạn có thể copy nguyên khối dưới đây cho Gemini:

```text
Bạn là UI/UX lead của dự án CSCA Academy LMS.

Mục tiêu Ngày 1: thiết kế nền tảng UI và cấu trúc trải nghiệm cho 4 khu vực:
1. Website công khai.
2. Student LMS.
3. Teacher LMS.
4. Admin Console.

Yêu cầu bắt buộc:
- Website công khai và LMS phải là hai không gian khác nhau, không dùng chung navigation gây rối.
- Student đã đăng nhập vẫn thấy website công khai bình thường và có thêm nút “Vào LMS học viên”.
- Student LMS có: Tổng quan, Danh mục khóa học, Lịch Live, Bài tập & Quiz, Bảng xếp hạng, Chứng chỉ.
- Teacher LMS có: lớp phụ trách, lịch dạy, giao bài, điểm danh, chấm bài, tiến độ học viên.
- Admin có: users/roles, courses/curriculum, classes/enrollments, assignments/quizzes, reports/audit.
- Thiết kế desktop, tablet và mobile tối thiểu 320px.
- Mỗi màn hình phải có loading, empty, error, success và permission-denied state.
- Giữ tone CSCA Academy: giáo dục, rõ ràng, hiện đại, dễ dùng; không lạm dụng animation.

Đầu ra cần bàn giao:
- Sitemap và route map.
- Wireframe hoặc mockup cho 3 dashboard.
- Navigation map theo từng role.
- Design tokens: màu, font, spacing, radius, shadow, button, form, table, badge, modal.
- Danh sách component dùng chung và component riêng theo role.
- Nếu sửa code, chỉ sửa frontend UI; không sửa backend, database, migration, auth middleware hoặc .env.
- Mock data phải đánh dấu rõ MOCK_UI_ONLY.

Cuối báo cáo hãy ghi:
- File đã sửa.
- Màn hình đã hoàn thành.
- API data cần backend cung cấp.
- Những điểm cần Codex review/tích hợp.
- Screenshot hoặc cách mở màn hình để kiểm tra.
```

### Prompt ngắn dùng cho các ngày tiếp theo

```text
Hôm nay làm UI trước theo LMS_10_DAY_EXECUTION_PLAN.md.
Chỉ làm phạm vi UI/UX của Ngày __ cho role __.
Không sửa backend/database/.env/auth policy.
Phải có responsive + loading/empty/error/success/forbidden state.
Dùng MOCK_UI_ONLY nếu API chưa sẵn sàng.
Cuối ngày bàn giao file đã sửa, route, API contract cần có và screenshot kiểm tra.
Sau khi bạn bàn giao, Codex sẽ review, làm backend, nối API thật và chạy QA.
```
