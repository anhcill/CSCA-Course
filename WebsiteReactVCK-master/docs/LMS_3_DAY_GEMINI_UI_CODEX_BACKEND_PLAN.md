# Kế hoạch 3 ngày nâng cấp LMS

## Mục tiêu

Trong 3 ngày, hoàn thiện một vertical slice có thể chạy được từ quản lý trung tâm đến LMS:

```text
MolyInternal
  -> khóa học / lớp / giáo viên / học sinh / trạng thái thanh toán
  -> LMS Admin
  -> Giáo viên giao bài, file, lịch học, điểm danh
  -> Học sinh nhận bài, nộp bài, làm quiz
  -> Giáo viên chấm điểm
  -> LMS thông báo và đồng bộ trạng thái về hệ thống trung tâm
```

MolyInternal vẫn là nguồn dữ liệu chính cho khóa học, lớp, giáo viên, học sinh và quyền học. LMS quản lý hoạt động dạy-học và nội dung học tập.

## Phân công

### Gemini — UI/frontend

- Xây giao diện Admin LMS.
- Xây giao diện giáo viên.
- Hoàn thiện giao diện học sinh.
- Dùng mock data hoặc API contract đã thống nhất.
- Không tự thay đổi schema, permission, entitlement hoặc logic cấp quyền.
- Không đưa secret thật vào prompt, source code frontend hoặc file mock.

### Codex — backend/integration

- API, database, permission và entitlement.
- Đồng bộ khóa học, lớp học, giáo viên, học sinh với MolyInternal.
- Assignment, submission, grading, attendance, schedule, quiz.
- Notification, retry, dead-letter và audit log.
- Cloudinary/R2 upload service.
- Test, migration, deploy và kiểm tra production.

## Quy tắc kiến trúc bắt buộc

1. Mọi dữ liệu LMS phải có `managementCourseId`, `managementClassId`, `managementStudentId` hoặc `managementTeacherId` khi có liên quan.
2. Không dùng tên hoặc email làm khóa liên kết duy nhất.
3. Học sinh chỉ truy cập khi có membership và entitlement hợp lệ.
4. Giáo viên chỉ thao tác trong khóa/lớp được phân công.
5. Frontend chỉ hiển thị nút theo quyền; backend luôn kiểm tra quyền lại.
6. Admin LMS không được tự ý biến trạng thái chưa thanh toán thành đã được học.
7. File private phải dùng signed URL, không lưu secret ở frontend.
8. Các lệnh đồng bộ phải có idempotency key, correlation ID và retry an toàn.
9. Không tạo học sinh, khóa học hoặc thanh toán giả trên production.

## Ngày 1 — Contract, Admin và nền tảng backend

### Backend — Codex

#### 1. Chốt model dữ liệu

Kiểm tra và hoàn thiện các nhóm dữ liệu:

- `ManagedApplication`.
- `ApplicationMembership`.
- `ApplicationRoleAssignment`.
- `ApplicationCourseMap`.
- `ApplicationClassMap`.
- `ApplicationEntitlement`.
- `Course` và `Class` của LMS.
- `Assignment`.
- `AssignmentSubmission`.
- `LearningFile`.
- `ScheduleSession`.
- `AttendanceRecord`.
- `Quiz`, `QuizQuestion`, `QuizAttempt`.
- `Notification`.
- `IntegrationOutbox` và `IntegrationDeadLetter`.

#### 2. API Admin

Hoàn thiện các API:

```text
GET    /api/v1/application-orchestration/overview
GET    /api/v1/application-orchestration/applications
GET    /api/v1/application-orchestration/applications/{id}/memberships
GET    /api/v1/application-orchestration/applications/{id}/course-maps
GET    /api/v1/application-orchestration/applications/{id}/class-maps
GET    /api/v1/application-orchestration/applications/{id}/entitlements
GET    /api/v1/application-orchestration/delivery-queue
POST   /api/v1/application-orchestration/delivery-queue/{id}/retry
```

Thêm API LMS Admin cho:

```text
GET/POST/PATCH  /api/v1/admin/courses
GET/POST/PATCH  /api/v1/admin/classes
GET/POST/PATCH  /api/v1/admin/teachers
GET/POST/PATCH  /api/v1/admin/assignments
GET             /api/v1/admin/sync/status
GET             /api/v1/admin/audit-logs
```

#### 3. Permission matrix

Chuẩn hóa các permission:

```text
lms.admin.view
lms.course.manage
lms.class.manage
lms.teacher.assign
lms.student.view
lms.assignment.manage
lms.assignment.grade
lms.attendance.manage
lms.schedule.manage
lms.quiz.manage
lms.file.manage
lms.notification.send
lms.report.export
lms.sync.retry
lms.permission.manage
```

Scope hỗ trợ:

```text
Application
Course
Class
OwnData
```

#### 4. API contract cho Gemini

Mỗi API phải trả thống nhất:

```json
{
  "succeeded": true,
  "message": "...",
  "data": {},
  "errors": []
}
```

Trạng thái UI phải có đủ:

- Loading.
- Empty.
- Error.
- Forbidden `403`.
- Unauthorized `401`.
- Retry.
- Success toast.

### UI — Gemini

Chuẩn bị layout và route:

```text
/admin
/admin/courses
/admin/classes
/admin/users
/admin/permissions
/admin/sync
/teacher
/teacher/classes
/teacher/assignments
/teacher/attendance
/teacher/schedule
/student
/student/assignments
/student/files
/student/schedule
/student/notifications
```

Admin dashboard tối thiểu phải có:

- Tổng số khóa học, lớp, giáo viên, học sinh.
- Entitlement đang active/pending/revoked.
- Đồng bộ pending/failed/dead-letter.
- Nút retry.
- Danh sách hoạt động gần đây.

### Kết quả cuối ngày 1

- Backend compile được.
- API contract cố định.
- Admin layout hoàn chỉnh.
- Permission matrix được thống nhất.
- Gemini có mock data đúng shape API.

## Ngày 2 — Teacher workspace và student learning flow

### Backend — Codex

#### 1. Assignment

API:

```text
GET    /api/v1/teacher/classes/{classId}/assignments
POST   /api/v1/teacher/classes/{classId}/assignments
PATCH  /api/v1/teacher/assignments/{id}
DELETE /api/v1/teacher/assignments/{id}
GET    /api/v1/student/assignments
GET    /api/v1/student/assignments/{id}
POST   /api/v1/student/assignments/{id}/submit
POST   /api/v1/student/submissions/{id}/resubmit
POST   /api/v1/teacher/submissions/{id}/grade
```

Assignment phải hỗ trợ:

- Hạn nộp.
- Điểm tối đa.
- File đính kèm.
- Cho phép nộp lại.
- Trạng thái draft/published/closed.
- Điểm và nhận xét.
- Lịch sử chấm.

#### 2. Lịch học và điểm danh

```text
GET/POST/PATCH /api/v1/teacher/classes/{classId}/schedule
GET            /api/v1/student/schedule
POST           /api/v1/teacher/sessions/{sessionId}/attendance
GET            /api/v1/student/attendance
```

Chỉ giáo viên được phân công hoặc Admin mới được sửa lịch/điểm danh.

#### 3. File và tài liệu

```text
POST /api/v1/files/upload-url
POST /api/v1/files/complete
GET  /api/v1/files/{id}/download-url
DELETE /api/v1/files/{id}
```

Metadata file cần lưu:

- Owner.
- Course/class/assignment liên quan.
- Storage provider.
- Object key/public ID.
- MIME type.
- Kích thước.
- Checksum.
- Visibility.
- CreatedBy.

#### 4. Cloudinary và R2

Cloudinary dùng cho avatar, thumbnail, ảnh và video preview. R2 dùng cho PDF, file bài tập, file học sinh nộp và file private.

Các biến môi trường production cần chuẩn hóa:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_URL
```

Không commit giá trị thật. Sau khi thêm key phải kiểm tra upload/download bằng signed URL.

### UI — Gemini

#### Teacher

- Trang danh sách lớp.
- Trang chi tiết lớp.
- Tab học sinh.
- Tab bài tập.
- Tab tài liệu.
- Tab lịch học.
- Tab điểm danh.
- Modal giao bài.
- Modal chấm bài.
- Upload file kéo-thả.
- Bảng điểm và nhận xét.

#### Student

- Danh sách bài tập.
- Chi tiết bài tập.
- Upload bài nộp.
- Trạng thái chưa làm/đã nộp/đã chấm/quá hạn.
- Lịch học.
- Tài liệu lớp.
- Điểm và feedback.

### Kết quả cuối ngày 2

- Giáo viên tạo được bài tập.
- Học sinh xem và nộp bài.
- Giáo viên chấm được bài.
- Lịch học và điểm danh hoạt động.
- Upload file hoạt động qua Cloudinary/R2.
- Permission ngăn truy cập sai lớp.

## Ngày 3 — Quiz, thông báo, đồng bộ và production QA

### Backend — Codex

#### 1. Quiz

```text
GET/POST/PATCH /api/v1/teacher/quizzes
POST           /api/v1/teacher/quizzes/{id}/publish
GET            /api/v1/student/quizzes
POST           /api/v1/student/quizzes/{id}/attempts
POST           /api/v1/teacher/quiz-attempts/{id}/grade
```

MVP quiz gồm:

- Một đáp án.
- Nhiều đáp án.
- Đúng/sai.
- Giới hạn thời gian.
- Trộn câu hỏi.
- Tự chấm điểm.
- Lưu attempt và kết quả.

#### 2. Notification center

```text
GET    /api/v1/notifications
POST   /api/v1/notifications/{id}/read
POST   /api/v1/notifications/read-all
POST   /api/v1/admin/notifications/broadcast
```

Event cần phát:

- Được thêm vào khóa/lớp.
- Có bài tập mới.
- Có bài nộp mới.
- Bài đã được chấm.
- Lịch học sắp tới.
- Đổi lịch.
- Điểm danh.
- Entitlement được cấp hoặc thu hồi.
- Đồng bộ thất bại.

#### 3. Đồng bộ về MolyInternal

Các dữ liệu LMS ghi ngược về hệ thống trung tâm:

- Tóm tắt điểm.
- Điểm danh.
- Trạng thái hoàn thành bài.
- Tiến độ khóa học.
- Kết quả quiz.
- Lỗi đồng bộ.

Mọi lệnh đồng bộ phải ghi vào outbox và có:

- Idempotency key.
- Retry count.
- Next attempt time.
- Last error.
- Dead-letter sau số lần retry tối đa.

### UI — Gemini

- Trang quiz cho giáo viên.
- Trang làm quiz cho học sinh.
- Notification center.
- Admin sync monitor.
- Dead-letter list.
- Retry button.
- Permission management page.
- Audit log page.
- Empty/error/loading states.
- Responsive mobile.

### Kết quả cuối ngày 3

- Luồng Admin → Teacher → Student chạy được.
- Giáo viên giao bài/file/lịch học.
- Học sinh nộp bài và làm quiz.
- Giáo viên chấm điểm.
- Thông báo hoạt động.
- Đồng bộ có retry/dead-letter.
- Permission được kiểm tra ở backend.
- Production health check pass.

## Definition of Done

Một hạng mục chỉ được xem là hoàn thành khi:

- Có database migration.
- Có API backend.
- Có permission policy.
- Có UI tương ứng.
- Có loading/empty/error state.
- Có audit log cho thao tác quan trọng.
- Có test happy path và forbidden path.
- Không lộ secret.
- Không tạo dữ liệu giả production.
- Đã kiểm tra deploy và health endpoint.

## Checklist bàn giao giữa Gemini và Codex

### Gemini bàn giao

- Danh sách route/page.
- Danh sách component dùng chung.
- API field đã dùng.
- Mock data đã dùng.
- Các trạng thái UI còn thiếu.
- Screenshot hoặc video các flow chính.

### Codex bàn giao

- API base URL.
- API contract.
- Permission code.
- Enum status.
- Cách upload file.
- Cách xử lý `401`, `403`, `409`, `422`.
- Migration status.
- Deployment status.

## Dữ liệu thật cần có sau 3 ngày

Để bật đồng bộ và cấp quyền thật, cần cung cấp:

1. Ba khóa học thật cần map.
2. Các lớp thuộc từng khóa.
3. Email Google của giáo viên.
4. Danh sách học sinh và email.
5. Trạng thái thanh toán tương ứng.
6. External course/class ID của LMS nếu khóa đã tồn tại trên LMS.

Nếu chưa có external ID LMS, Admin sẽ tạo mapping ở trạng thái `Pending`; chỉ khi xác nhận đúng khóa/lớp mới chuyển sang `Success` và bật cấp quyền học.
