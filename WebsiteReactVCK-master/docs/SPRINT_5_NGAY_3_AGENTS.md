# Kế hoạch tác chiến 5 ngày cho 3 Agent

## Dự án LMS HSK · HSKK · CSCA

Tài liệu này dùng để giao việc cho đúng **3 agent thực thi trong 5 ngày**.

Đây là file kế hoạch triển khai, chưa phải yêu cầu bắt đầu sửa code. Khi bắt đầu sprint, mỗi agent phải đọc:

1. `CLAUDE.md`
2. `docs/LMS_HSK_HSKK_CSCA_IMPLEMENTATION_PLAN.md`
3. File kế hoạch này

---

# 1. Mục tiêu sau 5 ngày

Sau ngày thứ 5 phải có một MVP chạy end-to-end với luồng:

```text
Guest xem danh mục khóa học
  -> Guest xem landing khóa học công khai
  -> User đăng nhập
  -> User đăng ký khóa miễn phí
  -> User vào phòng học
  -> User xem video private trên Cloudflare R2
  -> User xem curriculum theo chương
  -> User chuyển bài trước/sau
  -> Hệ thống lưu vị trí xem và tiến độ
  -> Admin tạo khóa/chương/bài
  -> Admin upload video và gắn video vào bài học
```

## Bắt buộc hoàn thành

- PostgreSQL migration cho taxonomy, course sections, enrollments, progress và video assets.
- API public catalog và course landing.
- API enrollment và learning access.
- API lesson progress.
- Cloudflare R2 upload và playback URL.
- Catalog UI bám mẫu.
- Landing khóa học bám mẫu.
- Phòng học bám mẫu.
- Admin curriculum tối thiểu.
- Admin upload video tối thiểu.
- Một bộ seed đủ để demo HSK, HSKK và CSCA.
- Có test/checklist chứng minh luồng hoạt động.

## Không nằm trong sprint 5 ngày

- Thanh toán MoMo/VNPay thật.
- HLS adaptive bitrate.
- Encode video tự động trên server.
- Ghi âm/chấm nói HSKK.
- AI chatbot.
- Live class/Google Meet.
- Comments dạng thread hoàn chỉnh.
- Certificate verification.
- Dashboard analytics nâng cao.
- Sửa toàn bộ 367 lỗi lint của code di sản.
- Refactor toàn bộ website cũ.

---

# 2. Phân công cố định

## Agent 1 — Backend Core + PostgreSQL

Tên nhiệm vụ gợi ý:

```text
agent_backend_core
```

Chịu trách nhiệm:

- Database migration.
- Taxonomy HSK/HSKK/CSCA.
- Course catalog API.
- Course landing API.
- Curriculum API.
- Enrollment.
- Learning access.
- Lesson progress.
- Admin CRUD course/section/lesson.
- Seed data.
- Contract API và DTO.

Không chịu trách nhiệm:

- UI React.
- Upload bytes lên R2.
- Video player.
- CSS.

## Agent 2 — Frontend Learner + Admin Curriculum UI

Tên nhiệm vụ gợi ý:

```text
agent_frontend_lms
```

Chịu trách nhiệm:

- Route frontend mới.
- Course catalog.
- Course card.
- Course landing.
- Curriculum accordion.
- Enrollment CTA.
- My Learning.
- Learning room.
- Lesson sidebar.
- Progress UI.
- Admin course/curriculum UI tối thiểu.
- Responsive và empty/loading/error states.

Không chịu trách nhiệm:

- SQL migration.
- Query PostgreSQL.
- R2 signing.
- Secret/config Cloudflare.

## Agent 3 — R2 Video + Integration QA

Tên nhiệm vụ gợi ý:

```text
agent_video_r2_qa
```

Chịu trách nhiệm:

- R2 service.
- Video asset/upload session API.
- Single PUT presigned upload.
- Multipart upload nếu còn thời gian.
- Playback signed URL.
- Admin media uploader.
- Player quality/resume integration.
- R2 CORS/config documentation.
- Integration test và regression checklist.
- Kiểm tra bảo mật access video.

Không chịu trách nhiệm:

- Thiết kế catalog.
- CRUD course tổng quát.
- Taxonomy.
- Auth flow.

---

# 3. Quy tắc ownership để không giẫm code

## Agent 1 sở hữu

```text
database/migrations/003_lms_core.sql
database/migrations/004_lms_progress.sql
database/seed_lms_mvp.sql

backend/modules/catalog/**
backend/modules/courses/**
backend/modules/curriculum/**
backend/modules/enrollments/**
backend/modules/learning/**
backend/modules/progress/**
backend/middleware/requireCourseAccess.js
backend/utils/apiResponse.js
backend/utils/courseDto.js
```

## Agent 2 sở hữu

```text
frontend/src/features/courses/**
frontend/src/features/learning/**
frontend/src/features/admin-curriculum/**
frontend/src/pages/client/CourseCatalogPage.jsx
frontend/src/pages/client/CourseLandingPage.jsx
frontend/src/pages/client/MyLearningPage.jsx
frontend/src/pages/client/LearningLessonPage.jsx
frontend/src/pages/admin/AdminCourseEditorPage.jsx
frontend/src/pages/admin/AdminCurriculumPage.jsx
```

## Agent 3 sở hữu

```text
database/migrations/005_video_assets.sql

backend/config/r2.js
backend/modules/media/**
backend/modules/playback/**
backend/services/r2.service.js

frontend/src/features/media/**
frontend/src/features/video-player/**
frontend/src/pages/admin/AdminMediaPage.jsx

docs/R2_SETUP.md
docs/MVP_TEST_REPORT.md
```

## File dùng chung

Các file sau chỉ một agent được chỉnh tại một thời điểm:

```text
backend/server.js
backend/.env.example
package.json
package-lock.json
frontend/src/App.jsx
frontend/vite.config.js
frontend/package.json
frontend/package-lock.json
```

Quyền chỉnh file dùng chung:

- `backend/server.js`: Agent 1 sở hữu; Agent 3 gửi danh sách router cần mount.
- `backend/.env.example`: Agent 3 sở hữu.
- root `package.json`: Agent 3 sở hữu khi thêm AWS SDK.
- `frontend/src/App.jsx`: Agent 2 sở hữu.
- frontend package files: Agent 2 sở hữu; Agent 3 không thêm thư viện player mới nếu ReactPlayer hiện tại đủ dùng.

Agent không được tự sửa file dùng chung ngoài ownership.

---

# 4. Chuẩn API chung phải khóa ngay đầu Ngày 1

## Response thành công

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

## Response lỗi

```json
{
  "success": false,
  "code": "COURSE_ACCESS_DENIED",
  "message": "Bạn chưa có quyền truy cập khóa học này"
}
```

## Quy tắc field

- API dùng `camelCase`.
- PostgreSQL dùng `snake_case`.
- Luồng mới chỉ dùng `id`, không dùng `_id`.
- Không gửi `userId` từ frontend cho enrollment/progress/note.
- Backend lấy user từ JWT cookie.
- Date trả ISO 8601.
- Duration lưu bằng giây.
- Giá lưu bằng số nguyên VND.

## Endpoint MVP phải ổn định từ cuối Ngày 1

```text
GET    /api/courses
GET    /api/courses/:slug
GET    /api/courses/:slug/curriculum

POST   /api/courses/:courseId/enroll
GET    /api/me/enrollments

GET    /api/learning/courses/:courseId
GET    /api/learning/lessons/:lessonId
PUT    /api/learning/lessons/:lessonId/progress
POST   /api/learning/lessons/:lessonId/complete

POST   /api/admin/courses
PATCH  /api/admin/courses/:courseId
POST   /api/admin/courses/:courseId/sections
PATCH  /api/admin/sections/:sectionId
POST   /api/admin/sections/:sectionId/lessons
PATCH  /api/admin/lessons/:lessonId

POST   /api/admin/media/uploads
POST   /api/admin/media/uploads/:sessionId/complete
DELETE /api/admin/media/uploads/:sessionId
GET    /api/learning/lessons/:lessonId/playback
```

---

# 5. Lịch làm việc tổng thể

| Ngày | Agent 1 — Backend | Agent 2 — Frontend | Agent 3 — Video/QA |
|---|---|---|---|
| 1 | Migration + contract + catalog skeleton | Route + component skeleton + mock contract | R2 config + video schema + upload design |
| 2 | Catalog/landing/curriculum API | Catalog + landing | Presigned upload + uploader |
| 3 | Enrollment + learning + progress API | Enrollment + learning room | Playback signed URL + player |
| 4 | Admin CRUD + seed + hardening | Admin curriculum + responsive | R2 integration + security + integration test |
| 5 | Fix backend + docs + migration verify | Fix UI + end-to-end polish | Full QA + release report |

---

# 6. Ngày 1 — Khóa kiến trúc và dựng nền

## Mục tiêu cuối ngày

- Có schema migration bản đầu.
- Có API contract cố định.
- Frontend có route và component skeleton.
- Có R2 configuration skeleton.
- Ba agent có thể làm song song từ Ngày 2 mà không chờ nhau.

---

## Agent 1 — Sáng Ngày 1

### Nhiệm vụ 1: Audit schema hiện tại

Đọc:

```text
database/schema.sql
database/seed.sql
backend/server.js
backend/db/connect.js
backend/middleware/protectRoute.js
```

Xác định:

- Bảng/cột giữ lại.
- Bảng/cột deprecated.
- Quan hệ cần migration.
- Dữ liệu cũ có thể migrate hay chỉ dùng dev.

### Nhiệm vụ 2: Viết migration LMS core

Tạo:

```text
database/migrations/003_lms_core.sql
```

Migration phải có:

- `learning_tracks`
- `learning_targets`
- `course_targets`
- `course_sections`
- Bổ sung cột MVP cho `courses`
- Bổ sung cột MVP cho `lessons`
- Index cần thiết.
- Constraint sort order.
- Constraint access type/status.

### Nhiệm vụ 3: Viết migration progress

Tạo:

```text
database/migrations/004_lms_progress.sql
```

Bao gồm:

- `enrollments`
- `lesson_progress`
- Unique constraint.
- Status constraint.
- Index theo user/course/lesson.

### Đầu ra buổi sáng

- Hai migration có thể đọc và review.
- Ghi chú forward migration.
- Không drop dữ liệu cũ một cách phá hủy.

---

## Agent 1 — Chiều Ngày 1

### Nhiệm vụ 4: Khóa API contract

Tạo DTO mẫu cho:

- Course list item.
- Course detail.
- Curriculum section.
- Learning lesson.
- Progress.

Tạo:

```text
backend/utils/apiResponse.js
backend/utils/courseDto.js
```

### Nhiệm vụ 5: Dựng module skeleton

Tạo module:

```text
backend/modules/catalog/
backend/modules/courses/
backend/modules/curriculum/
backend/modules/enrollments/
backend/modules/learning/
backend/modules/progress/
```

Mỗi module tối thiểu có:

```text
router.js
controller.js
service.js
repository.js
```

### Nhiệm vụ 6: Mount router skeleton

Agent 1 chỉnh `backend/server.js`.

Router chưa hoàn thành có thể trả `501`, nhưng path phải ổn định.

### Checklist Agent 1 cuối Ngày 1

- [ ] Migration không chứa syntax MongoDB.
- [ ] Không dùng `_id`.
- [ ] API response thống nhất.
- [ ] Router skeleton mount đúng.
- [ ] Gửi JSON contract mẫu cho Agent 2 và Agent 3.

---

## Agent 2 — Sáng Ngày 1

### Nhiệm vụ 1: Tạo feature structure

Tạo:

```text
frontend/src/features/courses/
frontend/src/features/learning/
frontend/src/features/admin-curriculum/
frontend/src/shared/api/
frontend/src/shared/ui/
```

Không tiếp tục nhét logic mới vào:

```text
pages/client/Courses.jsx
pages/client/DetailCourse.jsx
components/course/WacthCard.jsx
```

Các file cũ được giữ để tham khảo, route mới dùng component mới.

### Nhiệm vụ 2: Tạo API client tối thiểu

Tạo wrapper:

```text
frontend/src/shared/api/httpClient.js
frontend/src/features/courses/courseApi.js
frontend/src/features/learning/learningApi.js
```

Yêu cầu:

- Axios gửi cookie.
- Chuẩn hóa error.
- Không phụ thuộc `_id`.

### Nhiệm vụ 3: Dựng route page skeleton

Tạo:

- `CourseCatalogPage`
- `CourseLandingPage`
- `MyLearningPage`
- `LearningLessonPage`
- `AdminCourseEditorPage`
- `AdminCurriculumPage`

### Đầu ra buổi sáng

- Route/page skeleton compile được về mặt cấu trúc.
- Chưa cần hoàn thiện UI.

---

## Agent 2 — Chiều Ngày 1

### Nhiệm vụ 4: Tạo component contract

Tạo component:

```text
CourseCard
CourseGrid
CourseFilters
CourseHero
CourseOutcomeList
CoursePurchaseCard
CurriculumAccordion
CurriculumSection
LessonRow
LearningHeader
LearningSidebar
LearningPlayerShell
LearningFooterNav
```

### Nhiệm vụ 5: Mock data bám đúng DTO

Chỉ tạo một mock tạm:

```text
frontend/src/features/courses/courseContractMock.js
```

Mock phải dùng DTO do Agent 1 công bố.

Không dùng `demoCourses.js` cũ làm chuẩn.

### Nhiệm vụ 6: Sửa route trong `App.jsx`

Thêm route mới nhưng chưa xóa route cũ:

```text
/courses
/courses/:slug
/learning
/learning/:courseSlug/lessons/:lessonId
/admin/courses/new
/admin/courses/:courseId/edit
/admin/courses/:courseId/curriculum
```

### Checklist Agent 2 cuối Ngày 1

- [ ] Page skeleton không dùng `_id`.
- [ ] Route landing là public.
- [ ] Route learning có protect.
- [ ] Component không gọi API trực tiếp nếu có thể tách hook.
- [ ] Mock đúng contract Agent 1.

---

## Agent 3 — Sáng Ngày 1

### Nhiệm vụ 1: Audit video schema

Đọc:

```text
database/schema.sql
frontend/src/components/course/WacthCard.jsx
backend/.env.example
package.json
```

Xác định:

- Cột video cũ nào dùng được.
- Cột nào deprecated.
- Luồng upload hiện chưa tồn tại.

### Nhiệm vụ 2: Tạo migration video

Tạo:

```text
database/migrations/005_video_assets.sql
```

Bao gồm:

- `video_assets`
- `video_variants`
- `video_upload_sessions`
- Status constraint.
- Resolution/delivery type.
- Index.
- Soft-delete field nếu cần.

### Nhiệm vụ 3: Viết file setup R2

Tạo:

```text
docs/R2_SETUP.md
```

Phải ghi:

- Hai bucket public/private.
- CORS.
- API token scope.
- Lifecycle multipart.
- Environment variables.
- Không bật `r2.dev` cho private bucket.

---

## Agent 3 — Chiều Ngày 1

### Nhiệm vụ 4: Cấu hình package và env

Thêm:

```text
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

Chỉnh:

```text
backend/.env.example
package.json
package-lock.json
```

### Nhiệm vụ 5: Dựng R2 service skeleton

Tạo:

```text
backend/config/r2.js
backend/services/r2.service.js
backend/modules/media/
backend/modules/playback/
```

Các hàm skeleton:

- `createUploadUrl`
- `headObject`
- `deleteObject`
- `createPlaybackUrl`
- `createMultipartUpload`
- `uploadPartUrl`
- `completeMultipartUpload`
- `abortMultipartUpload`

### Nhiệm vụ 6: Công bố media contract

Gửi cho Agent 1 và Agent 2 JSON mẫu:

```json
{
  "assetId": 10,
  "sessionId": 20,
  "mode": "single",
  "uploadUrl": "https://...",
  "objectKey": "private/...",
  "expiresAt": "..."
}
```

### Checklist Agent 3 cuối Ngày 1

- [ ] Secret chỉ ở backend env.
- [ ] Private bucket không có public base URL.
- [ ] Object key do server sinh.
- [ ] Migration liên kết được lesson/video asset.
- [ ] Media contract gửi cho hai agent còn lại.

---

## Checkpoint chung cuối Ngày 1

Thời lượng tối đa: 30 phút.

Phải chốt:

1. Tên endpoint.
2. DTO fields.
3. Course access type.
4. Course/lesson status.
5. Migration order:

```text
003_lms_core.sql
004_lms_progress.sql
005_video_assets.sql
```

6. Route frontend.
7. File ownership.

Không đổi contract tùy ý sau checkpoint. Nếu buộc đổi, phải ghi vào changelog chung.

---

# 7. Ngày 2 — Catalog, landing và upload video

## Mục tiêu cuối ngày

- Guest lấy được danh sách khóa học thật từ PostgreSQL.
- Guest mở landing và curriculum.
- UI catalog/landing hiển thị bằng API thật.
- Admin tạo được upload URL và upload file nhỏ lên R2.

---

## Agent 1 — Sáng Ngày 2

### Nhiệm vụ 1: Catalog repository

Implement:

```text
GET /api/courses
```

Hỗ trợ:

- `track`
- `target`
- `accessType`
- `sort`
- `page`
- `limit`

Query phải trả sẵn:

- Track/target.
- Rating aggregate.
- Enrollment count.
- Lesson count.
- Duration.
- Author.

Không tạo N+1 query.

### Nhiệm vụ 2: Course detail

Implement:

```text
GET /api/courses/:slug
```

Trả:

- Thông tin landing.
- Outcomes.
- Requirements.
- Instructor.
- Aggregate.
- User enrollment state nếu có cookie hợp lệ.

Guest vẫn gọi được.

---

## Agent 1 — Chiều Ngày 2

### Nhiệm vụ 3: Curriculum API

Implement:

```text
GET /api/courses/:slug/curriculum
```

Yêu cầu:

- Section sort đúng.
- Lesson sort đúng.
- Trả preview/locked metadata.
- Không trả private R2 key.
- Không trả signed playback URL.

### Nhiệm vụ 4: Seed MVP

Tạo:

```text
database/seed_lms_mvp.sql
```

Seed tối thiểu:

- Track HSK, HSKK, CSCA.
- HSK 1.
- HSKK Sơ cấp.
- CSCA Toán.
- 3 khóa học.
- Mỗi khóa 2 section.
- Mỗi section 2–3 lesson.
- Một khóa free.
- Một khóa VIP/Pro.
- Một khóa contact.

### Checklist Agent 1 cuối Ngày 2

- [ ] Catalog có pagination.
- [ ] Landing public.
- [ ] Curriculum không lộ video key.
- [ ] Query không N+1.
- [ ] Seed chạy lặp có kiểm soát.

---

## Agent 2 — Sáng Ngày 2

### Nhiệm vụ 1: Hoàn thiện catalog UI

Thiết kế bám ảnh mẫu:

- Header section.
- Tabs HSK/HSKK/CSCA.
- Section Pro.
- Section Free.
- Grid 4 cột desktop.
- 2 cột tablet.
- 1 cột mobile.

Course card có:

- Cover.
- Badge.
- Tên.
- Giá.
- Rating.
- Số học viên.
- Instructor.
- Duration.
- Lesson count.

### Nhiệm vụ 2: Loading/error/empty

Phải có:

- Skeleton card.
- Retry.
- Empty filter.
- Không fallback sang demo khi API lỗi.

---

## Agent 2 — Chiều Ngày 2

### Nhiệm vụ 3: Landing UI

Hoàn thiện:

- Breadcrumb.
- Title/subtitle.
- Rating/enrolled count.
- Outcomes.
- Requirements.
- Curriculum accordion.
- Description expandable.
- Related placeholder nếu backend chưa có.
- Sticky purchase/enrollment card.

### Nhiệm vụ 4: Kết nối API thật

Loại mock khỏi default flow.

Mock chỉ giữ cho story/manual development nếu cần.

### Checklist Agent 2 cuối Ngày 2

- [ ] Guest mở landing không bị login modal.
- [ ] Curriculum accordion dùng keyboard được.
- [ ] Sticky card không che nội dung mobile.
- [ ] Card hiển thị đúng free/paid/contact.
- [ ] Không dùng `dangerouslySetInnerHTML` với dữ liệu chưa sanitize.

---

## Agent 3 — Sáng Ngày 2

### Nhiệm vụ 1: Implement upload init

Implement:

```text
POST /api/admin/media/uploads
```

Input:

```json
{
  "courseId": 1,
  "lessonId": 10,
  "fileName": "lesson.mp4",
  "contentType": "video/mp4",
  "sizeBytes": 73400320,
  "resolution": "720p"
}
```

Backend phải:

- Kiểm tra admin/creator.
- Kiểm tra ownership.
- Whitelist MIME.
- Kiểm tra size.
- Tạo asset/session.
- Sinh object key.
- Trả single PUT presigned URL nếu dưới threshold.

### Nhiệm vụ 2: Implement complete

Implement:

```text
POST /api/admin/media/uploads/:sessionId/complete
```

Backend:

- HEAD object.
- So khớp size/content type.
- Tạo/update video variant.
- Chuyển asset `ready`.

---

## Agent 3 — Chiều Ngày 2

### Nhiệm vụ 3: Admin upload UI

Tạo:

- File picker.
- Kiểm tra MIME/size trước upload.
- Progress bar.
- Cancel request.
- Retry.
- Success state.
- Asset metadata.

### Nhiệm vụ 4: Gắn asset vào lesson

Thống nhất với Agent 1:

- Endpoint patch lesson nhận `videoAssetId`.
- Hoặc endpoint media attach riêng.

Agent 3 không tự sửa module curriculum của Agent 1.

### Checklist Agent 3 cuối Ngày 2

- [ ] File không đi qua Express.
- [ ] Browser PUT trực tiếp R2.
- [ ] Upload URL hết hạn.
- [ ] Backend HEAD xác nhận object.
- [ ] Upload sai MIME bị từ chối.
- [ ] UI báo lỗi rõ ràng.

---

## Checkpoint chung cuối Ngày 2

Demo bắt buộc:

1. Catalog đọc PostgreSQL.
2. Landing public.
3. Curriculum hiển thị.
4. Admin upload một MP4 nhỏ lên R2.

Blocker phải ghi rõ:

- Ai đang giữ blocker.
- File/API nào bị ảnh hưởng.
- Deadline giải quyết sáng Ngày 3.

---

# 8. Ngày 3 — Enrollment, phòng học và playback

## Mục tiêu cuối ngày

- User đăng ký khóa free.
- User vào learning room.
- Backend kiểm tra access.
- Player lấy signed URL và phát video.
- Tiến độ bắt đầu được lưu.

---

## Agent 1 — Sáng Ngày 3

### Nhiệm vụ 1: Enrollment API

Implement:

```text
POST /api/courses/:courseId/enroll
GET  /api/me/enrollments
```

Quy tắc:

- Course free: tạo enrollment.
- Course paid/VIP/contact: không tự tạo nếu không entitlement.
- Idempotent: gọi lại không tạo duplicate.
- Course unpublished: từ chối.

### Nhiệm vụ 2: Access middleware

Tạo:

```text
backend/middleware/requireCourseAccess.js
```

Cho phép:

- Admin.
- Creator sở hữu course.
- User có enrollment active.
- Lesson preview nếu endpoint cho phép.

---

## Agent 1 — Chiều Ngày 3

### Nhiệm vụ 3: Learning APIs

Implement:

```text
GET /api/learning/courses/:courseId
GET /api/learning/lessons/:lessonId
```

Trả:

- Course.
- Curriculum.
- Current lesson.
- Previous lesson.
- Next lesson.
- User progress.
- Locked state.

### Nhiệm vụ 4: Progress APIs

Implement:

```text
PUT  /api/learning/lessons/:lessonId/progress
POST /api/learning/lessons/:lessonId/complete
```

Quy tắc:

- Throttle do frontend, nhưng backend vẫn idempotent.
- Không tin `completionPct` tuyệt đối từ client.
- `maxPositionSeconds` chỉ tăng.
- Complete không được duplicate.
- Course progress tính từ required published lessons.

### Checklist Agent 1 cuối Ngày 3

- [ ] Enrollment unique.
- [ ] User không quyền nhận 403.
- [ ] Preview không tạo enrollment.
- [ ] Progress update không giảm max position.
- [ ] Complete idempotent.

---

## Agent 2 — Sáng Ngày 3

### Nhiệm vụ 1: Enrollment CTA

Card landing xử lý:

- Guest: mở login.
- Free chưa enroll: `Đăng ký học`.
- Đã enroll: `Tiếp tục học`.
- Paid/VIP: `Nâng cấp` hoặc thông báo MVP.
- Contact: `Liên hệ tư vấn`.

### Nhiệm vụ 2: My Learning

Tạo `/learning`:

- Danh sách enrollment.
- Course progress.
- Last lesson.
- CTA tiếp tục.
- Empty state.

---

## Agent 2 — Chiều Ngày 3

### Nhiệm vụ 3: Learning room

Layout:

- Header tối.
- Tên khóa.
- Progress.
- Player shell.
- Sidebar section/lesson.
- Current lesson state.
- Locked/completed indicator.
- Prev/next footer.

### Nhiệm vụ 4: Progress client

Implement:

- Resume timestamp.
- Update mỗi 20–30 giây.
- Update khi pause.
- Update khi chuyển lesson.
- Best-effort update khi page hide.
- Mark complete khi đạt rule MVP.

Không request mỗi giây.

### Checklist Agent 2 cuối Ngày 3

- [ ] Refresh giữ đúng lesson.
- [ ] Sidebar scroll độc lập desktop.
- [ ] Mobile dùng drawer.
- [ ] Prev/next disabled đúng.
- [ ] Không render URL/video key trong curriculum.

---

## Agent 3 — Sáng Ngày 3

### Nhiệm vụ 1: Playback API

Implement:

```text
GET /api/learning/lessons/:lessonId/playback
```

Agent 3 dùng access service/middleware của Agent 1.

Trả:

```json
{
  "success": true,
  "data": {
    "assetId": 100,
    "expiresAt": "2026-07-17T12:00:00.000Z",
    "variants": [
      {
        "resolution": "720p",
        "url": "https://signed...",
        "isDefault": true
      }
    ]
  }
}
```

### Nhiệm vụ 2: Security

- Không trả `r2Key`.
- Không log signed URL.
- URL TTL 2–4 giờ.
- 403 nếu không enrollment.
- Preview phải được xác định từ database.

---

## Agent 3 — Chiều Ngày 3

### Nhiệm vụ 3: Video player integration

Tạo feature player:

- Loading.
- Error.
- Native controls.
- Resume.
- Seek.
- Quality selector nếu có 480p/720p.
- Giữ timestamp khi đổi quality.
- Gọi refresh URL nếu hết hạn.

### Nhiệm vụ 4: Playback diagnostics

Kiểm tra:

- CORS.
- Range request.
- Seek.
- Chrome/Edge.
- Slow network.
- Expired URL.

### Checklist Agent 3 cuối Ngày 3

- [ ] Video phát trực tiếp từ R2.
- [ ] Express không stream bytes.
- [ ] Seek hoạt động.
- [ ] Resume hoạt động.
- [ ] User không quyền không lấy được URL.

---

## Checkpoint chung cuối Ngày 3

Demo end-to-end bắt buộc:

```text
Login
  -> Landing
  -> Enroll free
  -> Learning room
  -> Playback
  -> Progress update
  -> Refresh
  -> Resume
```

Nếu demo này chưa chạy, Ngày 4 ưu tiên sửa luồng này trước mọi tính năng mới.

---

# 9. Ngày 4 — Admin curriculum, hardening và integration

## Mục tiêu cuối ngày

- Admin tạo được course/section/lesson.
- Admin upload và gắn video.
- Learner thấy nội dung mới.
- Các lỗi access và data consistency được xử lý.

---

## Agent 1 — Sáng Ngày 4

### Nhiệm vụ 1: Admin course CRUD

Implement:

```text
POST  /api/admin/courses
PATCH /api/admin/courses/:courseId
```

Fields MVP:

- Name.
- Slug.
- Short description.
- Description.
- Thumbnail.
- Track/target.
- Level.
- Access type.
- Price.
- Status.

### Nhiệm vụ 2: Section/lesson CRUD

Implement:

```text
POST  /api/admin/courses/:courseId/sections
PATCH /api/admin/sections/:sectionId
POST  /api/admin/sections/:sectionId/lessons
PATCH /api/admin/lessons/:lessonId
```

Hỗ trợ:

- Create.
- Edit.
- Publish.
- Sort order.
- Preview.
- Attach video asset.

Delete có thể soft delete hoặc chưa làm nếu rủi ro.

---

## Agent 1 — Chiều Ngày 4

### Nhiệm vụ 3: Hardening

- Transaction cho thao tác nhiều bảng.
- Ownership creator.
- Validate slug duplicate.
- Validate target.
- Validate lesson thuộc section/course.
- Sanitize/limit input.
- Aggregate lesson count/duration.

### Nhiệm vụ 4: Migration verify

Kiểm tra:

- Database trống.
- Database dev hiện có.
- Seed.
- Constraint.
- Index.

### Checklist Agent 1 cuối Ngày 4

- [ ] Creator chỉ sửa course của mình.
- [ ] Admin sửa mọi course.
- [ ] Course draft không xuất hiện public.
- [ ] Duration/count đúng.
- [ ] Migration order rõ ràng.

---

## Agent 2 — Sáng Ngày 4

### Nhiệm vụ 1: Admin course editor

Form tối thiểu:

- Basic info.
- Track.
- Target.
- Level.
- Access type.
- Price.
- Status.
- Cover URL/upload public tạm thời.

### Nhiệm vụ 2: Admin curriculum builder

UI:

- Danh sách section.
- Add/edit section.
- Danh sách lesson.
- Add/edit lesson.
- Lesson type.
- Preview.
- Publish.
- Duration.
- Gắn video asset.

Không bắt buộc drag/drop trong sprint. Có thể dùng nút lên/xuống hoặc nhập sort order.

---

## Agent 2 — Chiều Ngày 4

### Nhiệm vụ 3: Responsive pass

Kiểm tra:

- 375px.
- 768px.
- 1024px.
- 1440px.

Sửa:

- Overflow.
- Sticky card.
- Learning sidebar.
- Player ratio.
- Footer nav.
- Modal admin.

### Nhiệm vụ 4: Accessibility pass

- Button label.
- Keyboard accordion.
- Focus visible.
- Dialog semantics.
- Form label/error.
- Color contrast cơ bản.

### Checklist Agent 2 cuối Ngày 4

- [ ] Không reload toàn trang sau CRUD.
- [ ] Form báo validation.
- [ ] Mobile learning room sử dụng được.
- [ ] Catalog gần mẫu nhưng dùng branding CSCA.
- [ ] UI không phụ thuộc field cũ.

---

## Agent 3 — Sáng Ngày 4

### Nhiệm vụ 1: Multipart upload

Chỉ làm nếu single PUT và playback đã ổn.

Implement:

- Create multipart.
- Presign từng part.
- Upload 3 part song song.
- Retry.
- Complete.
- Abort.

Nếu không đủ thời gian:

- Giới hạn MVP file dưới threshold.
- Ghi multipart vào backlog rõ ràng.

### Nhiệm vụ 2: Media cleanup

- Abort session.
- Mark failed.
- Soft delete asset.
- Không xóa object đang được lesson dùng.

---

## Agent 3 — Chiều Ngày 4

### Nhiệm vụ 3: Integration tests

Test:

- Guest catalog.
- Guest landing.
- Guest không học private.
- User enroll.
- User playback.
- User progress.
- Admin upload.
- Admin attach.
- Creator ownership.
- Expired signed URL.
- Invalid upload.

### Nhiệm vụ 4: Security review

Kiểm tra:

- Secret không nằm frontend.
- Signed URL không nằm logs.
- Private bucket không public.
- CORS origin cụ thể.
- MIME/size validation.
- Object key unpredictable.
- UserId không lấy từ request body.

### Checklist Agent 3 cuối Ngày 4

- [ ] R2 setup docs đầy đủ.
- [ ] Test access video có bằng chứng.
- [ ] Upload cancellation không để session active vô hạn.
- [ ] Known issues được ghi.

---

## Checkpoint chung cuối Ngày 4

Feature freeze vào cuối ngày.

Sau checkpoint:

- Không thêm tính năng.
- Chỉ sửa bug.
- Chỉ tối ưu blocking issue.
- Không refactor rộng.

Phải có danh sách:

- P0 bug.
- P1 bug.
- Known limitation.
- Owner từng bug.

---

# 10. Ngày 5 — Ổn định, test và bàn giao

## Mục tiêu cuối ngày

- End-to-end demo ổn định.
- Không còn P0 blocker.
- Migration và setup có tài liệu.
- Có báo cáo những gì hoàn thành/chưa hoàn thành.

---

## Agent 1 — Sáng Ngày 5

### Nhiệm vụ

- Sửa P0 backend.
- Kiểm tra SQL injection parameterization.
- Kiểm tra transaction.
- Kiểm tra error codes.
- Kiểm tra access control.
- Chạy migration/seed verification.
- Soát API trả đúng contract.

### Đầu ra

- Backend checklist.
- Migration checklist.
- API endpoint list thực tế.

---

## Agent 1 — Chiều Ngày 5

### Nhiệm vụ

- Hỗ trợ Agent 3 fix integration backend.
- Viết phần database/API trong release note.
- Ghi known migrations/deprecations.
- Xác nhận không đụng database `csca_db`.

### Definition of done Agent 1

- [ ] Core API hoạt động.
- [ ] Access control đúng.
- [ ] Migration có thứ tự.
- [ ] Seed demo có dữ liệu.
- [ ] Không dùng MongoDB.

---

## Agent 2 — Sáng Ngày 5

### Nhiệm vụ

- Sửa P0/P1 frontend.
- Test responsive.
- Test loading/error/empty.
- Test auth transition.
- Test route refresh.
- Test progress resume.
- Kiểm tra console error.

### Đầu ra

- UI checklist.
- Danh sách screenshot cần chụp.
- Known UI limitations.

---

## Agent 2 — Chiều Ngày 5

### Nhiệm vụ

- Polish spacing/typography.
- Bám mẫu ở mức layout và behavior.
- Giữ branding HSK/HSKK/CSCA.
- Xóa mock khỏi production flow.
- Xóa dead import ở file mới.
- Hỗ trợ Agent 3 chạy regression.

### Definition of done Agent 2

- [ ] Catalog hoàn chỉnh.
- [ ] Landing public hoàn chỉnh.
- [ ] Learning room sử dụng được.
- [ ] Admin curriculum dùng được.
- [ ] Không còn dependency `_id` trong module mới.

---

## Agent 3 — Sáng Ngày 5

### Nhiệm vụ

Chạy full regression:

```text
Guest
  -> Catalog
  -> Landing

Student
  -> Login
  -> Enroll
  -> Learning
  -> Playback
  -> Progress
  -> Resume

Admin
  -> Create course
  -> Create section
  -> Create lesson
  -> Upload video
  -> Attach video
  -> Publish

Student
  -> Thấy course mới
  -> Học video mới
```

### Kiểm tra lỗi

- 401.
- 403.
- 404.
- 409.
- 422.
- 500.
- Network timeout.
- R2 upload failure.
- Expired URL.

---

## Agent 3 — Chiều Ngày 5

### Nhiệm vụ 1: Viết test report

Tạo:

```text
docs/MVP_TEST_REPORT.md
```

Bao gồm:

- Environment.
- Test cases.
- Passed.
- Failed.
- Known issues.
- Security checks.
- R2 configuration status.

### Nhiệm vụ 2: Release checklist

Kiểm tra:

- `.env.example`.
- Không commit `.env`.
- Không commit credential.
- CORS.
- Bucket privacy.
- Migration order.
- Seed optional.
- Build/lint scope module mới.

### Definition of done Agent 3

- [ ] Không còn P0.
- [ ] Test report tồn tại.
- [ ] R2 setup docs đủ dùng.
- [ ] Video private được bảo vệ.
- [ ] Luồng end-to-end có kết quả pass/fail rõ ràng.

---

# 11. Dependency giữa ba Agent

## Agent 2 phụ thuộc Agent 1

| Dependency | Deadline |
|---|---|
| Course list DTO | Trưa Ngày 1 |
| Course detail DTO | Cuối Ngày 1 |
| Catalog API | Trưa Ngày 2 |
| Landing/curriculum API | Cuối Ngày 2 |
| Enrollment API | Trưa Ngày 3 |
| Learning/progress API | Cuối Ngày 3 |
| Admin CRUD | Trưa Ngày 4 |

## Agent 3 phụ thuộc Agent 1

| Dependency | Deadline |
|---|---|
| Video schema relation | Cuối Ngày 1 |
| Lesson ownership/access helper | Trưa Ngày 3 |
| Patch lesson gắn asset | Trưa Ngày 4 |

## Agent 2 phụ thuộc Agent 3

| Dependency | Deadline |
|---|---|
| Upload API contract | Cuối Ngày 1 |
| Single PUT upload | Trưa Ngày 2 |
| Playback API | Trưa Ngày 3 |
| Player integration guide | Cuối Ngày 3 |

## Agent 3 phụ thuộc Agent 2

| Dependency | Deadline |
|---|---|
| Player shell mount point | Trưa Ngày 3 |
| Admin uploader mount point | Trưa Ngày 2 |
| End-to-end UI ready | Cuối Ngày 4 |

---

# 12. Quy tắc giao tiếp

Mỗi agent cập nhật hai lần/ngày:

## Update giữa ngày

```text
Đã xong:
- ...

Đang làm:
- ...

Blocker:
- ...

Contract thay đổi:
- Không / Có: ...
```

## Update cuối ngày

```text
Deliverables:
- ...

Files chính:
- ...

Test đã chạy:
- ...

Known issues:
- ...

Dependency bàn giao:
- ...
```

Không gửi status kiểu “đang làm” mà thiếu file hoặc đầu ra cụ thể.

---

# 13. Quy tắc commit và merge

Nếu dùng branch:

```text
agent/backend-core
agent/frontend-lms
agent/video-r2-qa
```

Commit format:

```text
feat(catalog): add PostgreSQL course list API
feat(learning): add lesson room layout
feat(media): add R2 presigned upload
fix(progress): make completion idempotent
docs(r2): add bucket setup guide
test(mvp): add end-to-end regression report
```

Quy tắc:

- Commit nhỏ theo deliverable.
- Không commit `.env`.
- Không force-push branch người khác.
- Không format toàn repo.
- Không sửa file ngoài ownership nếu chưa báo.
- Conflict phải giải quyết cùng owner file.

---

# 14. Definition of Done chung

Một task chỉ được coi là hoàn thành khi:

- Code/file tồn tại.
- Không còn placeholder quan trọng.
- API hoặc UI có error state.
- Có validation.
- Có kiểm tra quyền nếu là endpoint private/admin.
- Có test hoặc checklist manual.
- Contract đã bàn giao cho agent phụ thuộc.
- Không lộ secret.
- Không dùng field MongoDB cũ trong module mới.

---

# 15. Tiêu chí nghiệm thu cuối sprint

## Database

- [ ] Migration chạy đúng thứ tự.
- [ ] Có taxonomy HSK/HSKK/CSCA.
- [ ] Có section/lesson.
- [ ] Có enrollment.
- [ ] Có lesson progress.
- [ ] Có video asset/variant/session.

## Backend

- [ ] Catalog API.
- [ ] Landing API.
- [ ] Curriculum API.
- [ ] Enrollment API.
- [ ] Learning API.
- [ ] Progress API.
- [ ] Admin CRUD.
- [ ] Upload API.
- [ ] Playback API.
- [ ] Access control.

## Frontend

- [ ] Catalog bám mẫu.
- [ ] Free/Pro sections.
- [ ] Public landing.
- [ ] Curriculum accordion.
- [ ] Enrollment CTA.
- [ ] My Learning.
- [ ] Learning room.
- [ ] Sidebar.
- [ ] Prev/next.
- [ ] Progress/resume.
- [ ] Admin curriculum.
- [ ] Admin uploader.

## Video

- [ ] Private R2 bucket.
- [ ] Direct browser upload.
- [ ] Signed playback.
- [ ] Seek.
- [ ] Resume.
- [ ] 720p.
- [ ] 480p optional.
- [ ] Không proxy video qua Express.

## Security

- [ ] Không có secret frontend.
- [ ] Không log signed URL.
- [ ] User không quyền nhận 403.
- [ ] Creator ownership đúng.
- [ ] Không tin `userId` từ body.
- [ ] Upload validate MIME/size.

## Documentation

- [ ] R2 setup.
- [ ] Migration order.
- [ ] API list.
- [ ] MVP test report.
- [ ] Known limitations.

---

# 16. Phương án cắt phạm vi nếu trễ

Thứ tự cắt:

1. Multipart upload.
2. Quality selector 480p.
3. Related courses API thật.
4. Drag/drop curriculum.
5. Course review/rating.
6. Notes.
7. Comments.
8. Paid/VIP purchase flow.

Tuyệt đối không cắt:

- Catalog.
- Landing.
- Curriculum.
- Enrollment free.
- Learning access.
- Playback private.
- Progress.
- Admin tạo course/section/lesson.
- Admin upload video.

---

# 17. Prompt giao việc cho từng Agent

## Prompt Agent 1

```text
Bạn là Agent 1 phụ trách Backend Core + PostgreSQL.

Đọc đầy đủ:
- CLAUDE.md
- docs/LMS_HSK_HSKK_CSCA_IMPLEMENTATION_PLAN.md
- docs/SPRINT_5_NGAY_3_AGENTS.md

Thực hiện đúng phần Agent 1 theo từng ngày. Chỉ sửa file thuộc ownership Agent 1 và backend/server.js. PostgreSQL là nguồn dữ liệu chuẩn. API dùng camelCase và id, không dùng _id. Không đụng database csca_db. Không tự chạy server/build nếu chưa được yêu cầu. Mỗi nửa ngày báo deliverable, file, test và blocker.
```

## Prompt Agent 2

```text
Bạn là Agent 2 phụ trách Frontend LMS.

Đọc đầy đủ:
- CLAUDE.md
- docs/LMS_HSK_HSKK_CSCA_IMPLEMENTATION_PLAN.md
- docs/SPRINT_5_NGAY_3_AGENTS.md

Thực hiện đúng phần Agent 2 theo từng ngày. Chỉ sửa frontend module/page thuộc ownership Agent 2 và frontend/src/App.jsx. Bám sát UX 7 ảnh mẫu nhưng dùng branding HSK/HSKK/CSCA. Không dùng _id, nameCourse, nameLesson trong module mới. Không sửa backend/database. Mỗi nửa ngày báo deliverable, file, test và blocker.
```

## Prompt Agent 3

```text
Bạn là Agent 3 phụ trách Cloudflare R2, video và QA tích hợp.

Đọc đầy đủ:
- CLAUDE.md
- docs/LMS_HSK_HSKK_CSCA_IMPLEMENTATION_PLAN.md
- docs/SPRINT_5_NGAY_3_AGENTS.md

Thực hiện đúng phần Agent 3 theo từng ngày. Chỉ sửa media/playback/R2/video-player/test docs thuộc ownership Agent 3 và các file package/env được giao. Bucket video phải private. Upload trực tiếp browser -> R2, playback bằng signed URL, Express không proxy bytes. Không lộ secret. Mỗi nửa ngày báo deliverable, file, test và blocker.
```

---

# 18. Kết quả bàn giao mong đợi

Cuối 5 ngày, ba agent phải bàn giao:

```text
Agent 1:
- Migrations
- Seed
- Core LMS APIs
- Admin curriculum APIs

Agent 2:
- Catalog
- Landing
- Learning room
- Admin course/curriculum UI

Agent 3:
- R2 upload/playback
- Admin uploader
- Video player integration
- R2 setup
- Test report
```

Chỉ khi luồng guest → enroll → learning → playback → progress và admin → create → upload → publish chạy được thì sprint mới được xem là đạt mục tiêu.

