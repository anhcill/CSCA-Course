# Kế hoạch nâng cấp hệ thống khóa học HSK · HSKK · CSCA

## 1. Mục tiêu và phạm vi

Tài liệu này là kế hoạch thiết kế lại module khóa học theo trải nghiệm tham chiếu từ 7 ảnh mẫu:

1. Danh mục khóa học dạng card, tách nhóm miễn phí và trả phí.
2. Trang giới thiệu khóa học công khai.
3. Chương trình học dạng chương/bài có accordion.
4. Mô tả, kết quả đầu ra và khóa học liên quan.
5. Phòng học riêng sau khi đăng ký.
6. Video player, danh sách bài học, khóa/mở bài và tiến độ.
7. Nội dung bài học, ghi chú theo thời điểm, bình luận và điều hướng bài trước/sau.

Sản phẩm không sao chép nguyên bản F8. Bố cục và hành vi được dùng làm chuẩn UX, còn nội dung, taxonomy, màu sắc và logic học tập được thiết kế riêng cho:

- HSK: HSK 1 đến HSK 6.
- HSKK: Sơ cấp, Trung cấp, Cao cấp.
- CSCA: Toán, Vật lí, Hóa học, Tiếng Trung ban Tự nhiên, Tiếng Trung ban Xã hội.

Phạm vi kế hoạch bao gồm frontend, backend Express, PostgreSQL, Cloudflare R2, admin CMS, phân quyền, tiến độ học, video và vận hành ban đầu với kinh phí thấp.

---

## 2. Kết luận kiểm tra hệ thống hiện tại

### 2.1. Công nghệ đang dùng

- Frontend: React 18, Vite, Tailwind CSS, React Router.
- Backend: Node.js, Express.
- Database đích: PostgreSQL qua package `pg`.
- Auth: JWT trong cookie HttpOnly, đăng nhập local và Google OAuth.
- Schema PostgreSQL hiện có 26 bảng.
- UI đã có một số component khóa học, video, ghi chú, bình luận, đánh giá và admin.

### 2.2. Phần đã thực sự nối PostgreSQL

- Đăng ký, xác minh email, đăng nhập, đăng xuất.
- Google OAuth.
- Quản lý user cơ bản.
- Hồ sơ học viên và mục tiêu du học.
- Dashboard hồ sơ đọc từ bảng `progress`.

### 2.3. Phần LMS hiện chưa hoạt động end-to-end

Backend hiện chỉ mount:

- `/api/auth`
- `/api/profile`

Các endpoint mà frontend vẫn gọi nhưng backend PostgreSQL chưa có gồm:

- `/api/course`
- `/api/lesson`
- `/api/exercise`
- `/api/progress`
- `/api/rating`
- `/api/comment`
- `/api/notes`
- `/api/test`
- `/api/schedule`
- `/api/post`
- `/api/chat/message`

Vì vậy các trang khóa học hiện chủ yếu là giao diện di sản từ source GitHub và dữ liệu demo. Không nên tiếp tục vá từng hook theo cấu trúc MongoDB cũ.

### 2.4. Dấu hiệu code di sản cần xử lý

- Frontend dùng lẫn `_id` và `id`.
- Dùng lẫn `nameCourse`/`name`, `nameLesson`/`name`, `courseId`/`course_id`.
- Logic gửi `userId` từ client trong ghi chú, bình luận và tiến độ; backend mới phải lấy user từ JWT.
- `DetailCourse` đang gộp trang bán khóa học với phòng học.
- Trang chi tiết khóa học đang bắt đăng nhập, làm mất trang landing công khai.
- Chưa có bảng enrollment nên chưa thể phân biệt người xem, người đăng ký và người đã mua.
- Chưa có chapter/section; lesson đang gắn thẳng vào course.
- `progress.completed_lessons BIGINT[]` khó truy vấn, khó chống ghi trùng và khó lưu thời gian xem.
- `hsk_levels` đang chứa cả HSK, HSKK và môn CSCA; tên bảng không đúng miền dữ liệu.
- Lint hiện có 367 vấn đề, chủ yếu từ code cũ; cần thiết lập quality gate theo module mới thay vì bắt buộc sửa toàn bộ ngay trong một lần.
- Vite proxy dùng port `8888`; `.env.example` cũng dùng `8888`, trong khi fallback server là `7000`. Cần thống nhất.

### 2.5. Những phần có thể tái sử dụng

- AuthContext sau khi chuẩn hóa DTO.
- Navbar, Footer, theme sáng/tối.
- Profile và student profile.
- Khung admin layout.
- Một phần visual của card khóa học.
- Ý tưởng note, comment, rating và certificate.
- PostgreSQL pool, middleware JWT và role.
- Các cột video R2/HLS hiện có có thể dùng làm nền, nhưng cần tổ chức lại.

---

## 3. Kiến trúc trải nghiệm mục tiêu

### 3.1. Luồng người dùng

```text
Danh mục khóa học
    -> Landing khóa học công khai
        -> Xem video giới thiệu / bài preview
        -> Đăng ký miễn phí hoặc mua quyền truy cập
            -> Enrollment được tạo
                -> Vào phòng học
                    -> Học bài
                    -> Ghi tiến độ
                    -> Làm bài tập
                    -> Ghi chú / bình luận
                    -> Hoàn thành khóa
                    -> Đánh giá / chứng chỉ
```

### 3.2. Route frontend đề xuất

#### Public

- `/courses`: danh mục khóa học.
- `/courses/:slug`: landing khóa học.
- `/courses/:slug/preview/:lessonId`: bài học xem thử nếu cần.

#### Authenticated learner

- `/learning`: các khóa đang học.
- `/learning/:courseSlug`: tự chuyển đến bài gần nhất.
- `/learning/:courseSlug/lessons/:lessonId`: phòng học.
- `/profile`: hồ sơ, tiến độ và chứng chỉ.

#### Admin/creator

- `/admin/courses`
- `/admin/courses/new`
- `/admin/courses/:courseId/edit`
- `/admin/courses/:courseId/curriculum`
- `/admin/courses/:courseId/students`
- `/admin/courses/:courseId/reviews`
- `/admin/media`

Không dùng `/detail-course/:id` cho cả landing và player nữa.

---

## 4. Thiết kế danh mục khóa học

### 4.1. Nhóm nội dung

Danh mục mặc định có ba tab lớn:

- HSK
- HSKK
- CSCA

Bên trong có filter:

- Miễn phí / Có phí / Đã đăng ký.
- Cấp độ.
- Môn học hoặc mục tiêu thi.
- Mới nhất / Phổ biến / Đánh giá cao.

### 4.2. Các section giống tinh thần mẫu

- `Khóa học nổi bật`: khóa được admin ghim.
- `Khóa học Pro`: trả phí, VIP hoặc cần liên hệ.
- `Khóa học miễn phí`: đăng ký trực tiếp.
- `Tiếp tục học`: chỉ hiện khi đăng nhập.

### 4.3. Course card

Mỗi card hiển thị:

- Ảnh cover tỷ lệ 16:9.
- Badge `MỚI`, `HOT`, `PRO`, `MIỄN PHÍ`.
- Tên khóa.
- Giá gốc, giá bán hoặc `Liên hệ`.
- Điểm đánh giá và số lượt.
- Giảng viên.
- Tổng thời lượng.
- Tổng bài.
- Số học viên hoặc tiến độ của chính user.

Card không gọi API rating riêng từng khóa. API danh mục phải trả sẵn aggregate để tránh N+1 request.

---

## 5. Landing khóa học công khai

### 5.1. Cột nội dung chính

- Breadcrumb.
- Tên khóa, mô tả ngắn.
- Rating, số đánh giá, số học viên.
- `Bạn sẽ học được gì?` theo grid 2 cột desktop.
- Yêu cầu đầu vào.
- Đối tượng phù hợp.
- Nội dung khóa học.
- Mô tả dài có `Mở rộng`.
- Giảng viên.
- Đánh giá học viên.
- Khóa học liên quan.

### 5.2. Card sticky bên phải

- Thumbnail/video giới thiệu.
- Giá.
- CTA theo trạng thái:
  - `Đăng ký học` với khóa free.
  - `Mua khóa học` với khóa paid.
  - `Liên hệ tư vấn` với khóa contact.
  - `Tiếp tục học` nếu đã có enrollment.
- Cấp độ.
- Tổng chương.
- Tổng bài.
- Tổng thời lượng.
- Học mọi lúc.
- Quyền truy cập.
- Chứng chỉ nếu có.

### 5.3. Curriculum accordion

Hiển thị:

- Tổng chương, tổng bài, tổng thời lượng.
- `Mở rộng tất cả`.
- Tên chương và số bài.
- Icon loại bài: video, bài đọc, quiz, tài liệu, bài nói.
- Thời lượng từng bài.
- Icon preview hoặc khóa.

Landing chỉ trả metadata cần thiết. Không trả URL video private của các bài bị khóa.

---

## 6. Phòng học

### 6.1. Layout desktop

- Header tối giản, không dùng Navbar marketing đầy đủ.
- Trái: nút quay lại, logo, tên khóa.
- Phải: tiến độ phần trăm và số bài hoàn thành.
- Khu trung tâm: video hoặc nội dung bài học.
- Sidebar phải: curriculum theo chương.
- Footer cố định: `Bài trước`, `Bài tiếp theo`.

### 6.2. Layout mobile

- Video full width.
- Curriculum mở bằng bottom sheet/drawer.
- Điều hướng bài trước/sau cố định dưới.
- Tab nội dung cuộn ngang.

### 6.3. Tab dưới video

- Nội dung bài học.
- Tài liệu.
- Hỏi đáp.
- Ghi chú.

Ghi chú có nút `Thêm ghi chú tại 12:35`, lấy timestamp thực từ player.

### 6.4. Quy tắc hoàn thành bài

MVP:

- Video: hoàn thành khi xem tối thiểu 85% hoặc nhấn `Đánh dấu hoàn thành` sau ngưỡng xem tối thiểu.
- Article: hoàn thành khi user chủ động đánh dấu.
- Quiz: hoàn thành khi submit; có thể yêu cầu đạt điểm tối thiểu.
- Preview lesson không tự tạo enrollment.

Không nên bắt buộc câu hỏi xuất hiện ngẫu nhiên giữa video như code cũ. Nếu cần câu hỏi trong video, phải lưu timestamp do giáo viên cấu hình, không sinh tự động theo khoảng cách đều.

---

## 7. Mô hình nội dung cho HSK, HSKK và CSCA

### 7.1. Taxonomy mới

Không tiếp tục dùng `hsk_levels` như bảng chứa mọi loại.

Đề xuất:

#### `learning_tracks`

- `HSK`
- `HSKK`
- `CSCA`

#### `learning_targets`

Ví dụ:

- HSK 1, HSK 2, ..., HSK 6.
- HSKK Beginner, Intermediate, Advanced.
- CSCA Math, Physics, Chemistry, Chinese Science, Chinese Social.

Mỗi target có:

- `track_id`
- `code`
- `name_vi`
- `name_zh`
- `description`
- `sort_order`
- `metadata JSONB`

`metadata` có thể chứa `vocab_count`, cấu trúc đề hoặc thông tin riêng mà không ép mọi track có cùng cột.

### 7.2. Loại bài học

`lesson_type`:

- `video`
- `article`
- `quiz`
- `document`
- `practice`
- `speaking`

MVP triển khai hoàn chỉnh `video`, `article`, `quiz`, `document`.

`speaking` cho HSKK được chừa schema và phát triển ở phase sau:

- Nghe đề.
- Ghi âm trong browser.
- Upload audio.
- Giáo viên hoặc AI chấm sau.

### 7.3. Cấu trúc khóa gợi ý

#### HSK

- Phát âm.
- Từ vựng.
- Ngữ pháp.
- Nghe.
- Đọc.
- Viết.
- Luyện đề.

#### HSKK

- Phát âm và thanh điệu.
- Nghe nhắc lại.
- Mô tả tranh.
- Trả lời câu hỏi.
- Mô phỏng đề thi.

#### CSCA

- Kiến thức nền.
- Chuyên đề.
- Ví dụ mẫu.
- Bài tập.
- Chữa bài.
- Đề tổng hợp.

---

## 8. Database mục tiêu

### 8.1. Bảng cần thêm hoặc thay đổi

#### Taxonomy và nội dung

- `learning_tracks`
- `learning_targets`
- `course_targets`
- `course_sections`
- `course_outcomes`
- `course_requirements`
- `course_instructors`
- `lesson_resources`

#### Quyền truy cập

- `enrollments`
- `course_orders` nếu bán từng khóa.

Nếu giai đoạn đầu chỉ bán VIP package, `enrollments` vẫn cần để ghi quyền học cụ thể.

#### Tiến độ

- `lesson_progress`
- `course_progress` có thể là aggregate/cache.

Không dùng array `completed_lessons` làm nguồn dữ liệu chính.

#### Video

- `video_assets`
- `video_variants`
- `video_upload_sessions`

#### Tùy chọn sau

- `lesson_quizzes`
- `quiz_questions`
- `quiz_attempts`
- `speaking_submissions`
- `certificates`

### 8.2. Thay đổi bảng `courses`

Các cột nên có:

```text
id
slug
name
short_description
description
thumbnail_url
preview_video_asset_id
author_id
level
access_type           free | paid | vip | contact
price_vnd
compare_at_price_vnd
required_tier
status                draft | review | published | archived
is_featured
is_new
is_hot
certificate_enabled
total_sections
total_lessons
total_duration_seconds
ratings_count
ratings_avg
enrolled_count
published_at
created_at
updated_at
```

Không nên dùng đồng thời `is_premium`, `required_tier`, `price_vnd` mà thiếu một `access_type` xác định rõ CTA.

### 8.3. `course_sections`

```text
id
course_id
title
description
sort_order
is_published
created_at
updated_at
```

### 8.4. `lessons`

```text
id
section_id
course_id
title
slug
lesson_type
summary
content_html
sort_order
is_published
is_free_preview
is_required
video_asset_id
estimated_duration_seconds
passing_score
created_at
updated_at
```

Giữ `course_id` giúp query nhanh nhưng cần constraint/logic đảm bảo section cùng course.

### 8.5. `enrollments`

```text
id
user_id
course_id
source                free | purchase | vip | admin | coupon
status                active | expired | revoked | completed
starts_at
expires_at
completed_at
created_at
updated_at
UNIQUE(user_id, course_id)
```

### 8.6. `lesson_progress`

```text
id
user_id
course_id
lesson_id
status                not_started | in_progress | completed
watched_seconds
max_position_seconds
completion_pct
last_position_seconds
attempt_count
started_at
completed_at
updated_at
UNIQUE(user_id, lesson_id)
```

Backend tự tính course progress:

```text
completed required lessons / total required published lessons
```

### 8.7. Video tables

#### `video_assets`

```text
id
lesson_id nullable
course_id nullable
purpose               lesson | preview
status                pending | uploading | uploaded | processing | ready | failed | deleted
source_r2_key
thumbnail_r2_key
duration_seconds
width
height
source_size_bytes
mime_type
checksum
created_by
created_at
updated_at
```

#### `video_variants`

Mở rộng bảng hiện có:

```text
id
video_asset_id
resolution            360p | 480p | 720p | 1080p
delivery_type         mp4 | hls
r2_key
manifest_r2_key nullable
mime_type
codec
bitrate_kbps
width
height
duration_seconds
file_size_bytes
is_default
is_ready
created_at
updated_at
UNIQUE(video_asset_id, resolution, delivery_type)
```

#### `video_upload_sessions`

```text
id
video_asset_id
provider_upload_id
r2_key
mode                  single | multipart
part_size_bytes
status
expires_at
created_by
created_at
completed_at
```

Không lưu presigned URL vào database.

---

## 9. Kiến trúc Cloudflare R2 tiết kiệm

### 9.1. Quyết định MVP

Sử dụng hai bucket:

1. `csca-course-public`
   - Cover.
   - Thumbnail.
   - Tài liệu thực sự công khai.
   - Có custom domain như `cdn.example.com`.

2. `csca-course-private`
   - Video khóa học.
   - Tài liệu chỉ dành cho học viên.
   - Không bật `r2.dev`.
   - Không public bucket.

Hai bucket giúp catalog tải ảnh nhanh mà không phải ký URL cho từng cover, đồng thời video vẫn private.

### 9.2. Lý do chọn R2 thay Cloudflare Stream ở MVP

- R2 Standard hiện có giá storage thấp và không thu phí egress.
- Hệ thống ban đầu ít học viên nên chưa cần trả phí theo phút video được xem.
- Có thể upload trực tiếp từ browser, không đi qua Express.
- Nhược điểm: R2 không tự encode adaptive bitrate; đội dự án phải chuẩn hóa file.

Cloudflare Stream phù hợp khi cần:

- Auto encode.
- HLS/DASH adaptive bitrate.
- Player, analytics và xử lý video quản lý sẵn.
- Lượng vận hành thủ công bắt đầu lớn hơn chi phí dịch vụ.

### 9.3. Chất lượng video theo ngân sách thấp

#### MVP bắt buộc

- Một bản MP4 720p.
- Codec H.264, pixel format `yuv420p`.
- Audio AAC 96–128 kbps.
- `faststart` để phát trước khi tải hết.
- CRF khoảng 22–24 tùy nội dung.
- Keyframe đều để seek ổn định.

#### Tùy chọn

- 480p cho học viên dùng mạng yếu.
- 1080p chỉ với bài có chữ Hán nhỏ, công thức hoặc slide chi tiết.

Không tạo đủ 360/480/720/1080 cho mọi video ngay từ đầu.

MVP player có thể có selector:

- Tự động: chọn variant mặc định.
- Tiết kiệm dữ liệu: 480p nếu có.
- HD: 720p.

Khi đổi MP4 variant, player giữ lại timestamp hiện tại.

#### Nâng cấp sau

- HLS master playlist.
- 360p/480p/720p/1080p.
- Adaptive bitrate.
- Pipeline encode tự động.

### 9.4. Chuẩn hóa video ban đầu

Để không phải thuê server encode:

- Giáo viên quay nguồn 1080p.
- Admin chạy script FFmpeg cục bộ trước khi upload.
- Upload bản playback 720p.
- Tạo 480p khi bài dài hoặc cần hỗ trợ mạng yếu.
- File nguồn có thể lưu ổ cứng/archive riêng.
- Nếu upload source lên R2, đặt prefix `source-temp/` và lifecycle xóa sau 7–14 ngày khi variant đã được xác nhận.

Một preset tham khảo:

```bash
ffmpeg -i input.mp4 \
  -vf "scale=-2:720" \
  -c:v libx264 -preset medium -crf 23 \
  -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output-720p.mp4
```

Với slide/công thức, có thể dùng CRF 20–22 hoặc giữ 1080p bitrate hợp lý.

### 9.5. Cấu trúc object key

Không dùng tên file user làm key trực tiếp.

```text
public/courses/{courseId}/cover/{uuid}.webp
public/courses/{courseId}/preview/{uuid}.webp
private/courses/{courseId}/lessons/{lessonId}/videos/{assetId}/720p.mp4
private/courses/{courseId}/lessons/{lessonId}/videos/{assetId}/480p.mp4
private/courses/{courseId}/lessons/{lessonId}/resources/{uuid}.pdf
source-temp/{assetId}/source.mp4
```

### 9.6. Upload flow

```text
Admin chọn file
  -> Frontend gọi POST /api/admin/media/uploads
  -> Backend kiểm tra role, MIME, dung lượng, lesson ownership
  -> Backend tạo video_asset + upload_session
  -> Backend trả presigned upload data
  -> Browser upload thẳng R2
  -> Frontend gọi complete
  -> Backend HEAD object để xác nhận size/content type
  -> video_asset chuyển uploaded/ready
  -> Admin gắn asset vào lesson
```

### 9.7. Single PUT và multipart

- File nhỏ hơn khoảng 100 MB: presigned `PUT`.
- File lớn: multipart upload.
- Part size đề xuất: 10–25 MiB.
- Số part upload song song: 3.
- Retry exponential backoff, tối đa 3 lần/part.
- Lưu `uploadId` và danh sách ETag ở client trong quá trình upload.
- Complete chỉ được gọi sau khi đủ part.
- Abort khi user hủy.
- Lifecycle tự hủy multipart dang dở sau 1 ngày cho prefix upload tạm.

Cloudflare yêu cầu các part không phải part cuối có cùng kích thước và tối thiểu 5 MiB.

### 9.8. Playback flow

```text
Player gọi GET /api/learning/lessons/:lessonId/playback
  -> Backend xác thực JWT
  -> Kiểm tra enrollment/VIP/admin/preview
  -> Chọn các variant ready
  -> Sinh presigned GET URL có hạn
  -> Trả URL, resolution, expiry và resume position
  -> Browser phát trực tiếp từ R2
```

Thời hạn URL:

- Preview public: dùng asset public riêng hoặc URL ký ngắn.
- Bài học private: 2–4 giờ, đủ dài cho một buổi học.
- Nếu URL gần hết hạn, frontend gọi refresh playback session.

Presigned URL là bearer token; không log full query string và không gửi vào analytics.

### 9.9. Range request

Video MP4 cần hỗ trợ HTTP `Range` để:

- Seek.
- Resume.
- Không tải cả file.

Player dùng URL R2 trực tiếp. Express không proxy bytes video vì sẽ tăng băng thông, RAM và tải server.

### 9.10. CORS cho private bucket

Ví dụ:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://app.example.com"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": [
      "Content-Type",
      "Range",
      "If-Match",
      "x-amz-checksum-*",
      "x-amz-meta-*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Production phải thay domain mẫu bằng domain thật và không dùng `*` cho origin upload admin.

### 9.11. Cache

- Cover/thumbnail public: custom domain + Cloudflare Cache, TTL dài, filename có UUID/hash.
- Video private bằng presigned S3 URL: ưu tiên quyền truy cập đơn giản ở MVP, không kỳ vọng cache custom-domain.
- Metadata API: cache ngắn với ETag hoặc `Cache-Control`.

### 9.12. Lifecycle

- `source-temp/`: xóa sau 7–14 ngày.
- Multipart chưa hoàn thành: abort sau 1 ngày.
- Asset đã soft-delete: job xóa object sau thời gian grace 7 ngày.
- Không chuyển video đang xem thường xuyên sang Infrequent Access vì có retrieval fee.

### 9.13. Biến môi trường backend

Thêm vào `.env.example`, không commit secret:

```text
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PRIVATE_BUCKET=csca-course-private
R2_PUBLIC_BUCKET=csca-course-public
R2_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://cdn.example.com
R2_UPLOAD_URL_TTL_SECONDS=3600
R2_PLAYBACK_URL_TTL_SECONDS=14400
VIDEO_MAX_UPLOAD_BYTES=
VIDEO_MULTIPART_THRESHOLD_BYTES=104857600
VIDEO_MULTIPART_PART_SIZE_BYTES=20971520
```

Token R2 chỉ cấp quyền object read/write cho đúng bucket, không dùng token toàn tài khoản.

### 9.14. Package backend

Thêm:

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

Module đề xuất:

```text
backend/
  config/
    env.js
  services/
    r2.service.js
    video.service.js
    enrollment.service.js
  controllers/
    media.controllers.js
    playback.controllers.js
  router/
    media.router.js
    playback.router.js
```

---

## 10. API contract mục tiêu

### 10.1. Public courses

- `GET /api/courses`
  - Filter track, target, access type, sort, page.
- `GET /api/courses/:slug`
  - Landing metadata, outcomes, requirements, instructors, aggregates.
- `GET /api/courses/:slug/curriculum`
  - Sections và lesson metadata; không trả private video key.
- `GET /api/courses/:slug/reviews`
- `GET /api/courses/:slug/related`

### 10.2. Enrollment

- `POST /api/courses/:courseId/enroll`
  - Chỉ cho course free hoặc entitlement hợp lệ.
- `GET /api/me/enrollments`
- `GET /api/me/courses/:courseId/access`

### 10.3. Learning

- `GET /api/learning/courses/:courseId`
- `GET /api/learning/lessons/:lessonId`
- `GET /api/learning/lessons/:lessonId/playback`
- `PUT /api/learning/lessons/:lessonId/progress`
- `POST /api/learning/lessons/:lessonId/complete`
- `GET /api/learning/courses/:courseId/progress`

Progress update được throttle phía frontend, ví dụ mỗi 15–30 giây và khi pause/unload; không ghi database mỗi giây.

### 10.4. Notes

- `GET /api/learning/lessons/:lessonId/notes`
- `POST /api/learning/lessons/:lessonId/notes`
- `PATCH /api/learning/notes/:noteId`
- `DELETE /api/learning/notes/:noteId`

Backend lấy `user_id` từ JWT.

### 10.5. Comments

- `GET /api/lessons/:lessonId/comments`
- `POST /api/lessons/:lessonId/comments`
- `POST /api/comments/:commentId/replies`
- `PATCH /api/comments/:commentId`
- `DELETE /api/comments/:commentId`

### 10.6. Ratings

- `GET /api/courses/:courseId/rating-summary`
- `POST /api/courses/:courseId/ratings`
- `PATCH /api/courses/:courseId/ratings/me`

Chỉ user có enrollment và đạt ngưỡng tiến độ mới được đánh giá.

### 10.7. Admin curriculum

- CRUD course.
- CRUD section.
- CRUD lesson.
- Reorder section.
- Reorder lesson.
- Publish/unpublish.
- Preview lesson.
- Aggregate duration tự cập nhật.

### 10.8. Admin media

- `POST /api/admin/media/uploads`
- `POST /api/admin/media/uploads/:sessionId/parts/:partNumber`
- `POST /api/admin/media/uploads/:sessionId/complete`
- `DELETE /api/admin/media/uploads/:sessionId`
- `GET /api/admin/media/:assetId`
- `DELETE /api/admin/media/:assetId`

---

## 11. Backend module structure

Mỗi domain nên có:

```text
router -> middleware -> controller -> service -> repository/query
```

Không viết SQL lớn trực tiếp trong controller.

Module:

- auth
- users
- catalog
- courses
- curriculum
- enrollments
- learning
- progress
- media
- notes
- comments
- ratings
- quizzes
- admin

Chuẩn response:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Chuẩn lỗi:

```json
{
  "success": false,
  "code": "COURSE_ACCESS_DENIED",
  "message": "Bạn chưa có quyền truy cập khóa học này"
}
```

DTO dùng camelCase ở API; PostgreSQL giữ snake_case.

---

## 12. Bảo mật và phân quyền

### 12.1. Role

- `user`: học viên.
- `creator`: quản lý khóa được gán.
- `admin`: toàn quyền.

Creator không được sửa khóa của creator khác.

### 12.2. Không tin dữ liệu client

Không nhận các trường sau làm nguồn quyền:

- `userId`
- `authorId`
- `isVip`
- `role`
- `price`
- `progressPct`

Tất cả lấy/tính từ JWT và database.

### 12.3. Upload

- Whitelist MIME.
- Kiểm tra extension và MIME.
- Giới hạn dung lượng.
- Key do server sinh.
- Không cho overwrite key.
- HEAD object sau upload.
- Có thể thêm checksum.
- Rate limit endpoint tạo upload.

### 12.4. XSS

Code cũ dùng nhiều `dangerouslySetInnerHTML`.

Nội dung rich text phải:

- Sanitize ở backend hoặc trước render.
- Chỉ cho tag/attribute an toàn.
- Chặn script, iframe tùy ý và event handler.

---

## 13. Admin CMS mục tiêu

### 13.1. Course editor

Các bước:

1. Thông tin cơ bản.
2. Phân loại HSK/HSKK/CSCA.
3. Giá và quyền truy cập.
4. Kết quả đầu ra/yêu cầu.
5. Curriculum.
6. Media.
7. SEO.
8. Preview và publish.

### 13.2. Curriculum builder

- Thêm chương.
- Thêm bài.
- Drag/drop reorder.
- Chọn loại bài.
- Đánh dấu preview.
- Gắn video.
- Hiển thị trạng thái upload.
- Tính tổng thời lượng.

### 13.3. Media uploader

- Progress theo part.
- Pause/cancel nếu uploader hỗ trợ.
- Retry.
- Không reload trang sau CRUD.
- Trạng thái: uploading, processing, ready, failed.
- Preview video trước publish.

---

## 14. Kế hoạch triển khai theo phase

## Phase 0 — Chốt nền tảng và migration strategy

### Công việc

- Chốt naming API camelCase.
- Chốt taxonomy track/target.
- Chốt access type.
- Chốt route mới.
- Tạo migration theo version, không sửa production DB ngoài dự án.
- Thống nhất port backend `8888`.
- Tạo error codes.
- Thiết lập ESLint scope cho code mới.

### Nghiệm thu

- ERD được duyệt.
- API contract được duyệt.
- Migration chạy được trên database trống và database dev hiện tại.

## Phase 1 — Catalog + landing khóa học

### Backend

- Track/target APIs.
- Course list/detail/curriculum.
- Rating aggregate read.
- Related courses.
- Admin CRUD course/section/lesson metadata.

### Frontend

- Course catalog bám mẫu.
- Card free/pro.
- Filter HSK/HSKK/CSCA.
- Landing public.
- Sticky enrollment card.
- Curriculum accordion.
- Responsive.

### Nghiệm thu

- Guest xem được course landing.
- Catalog không dùng demo fallback.
- Không còn N+1 rating request.
- Curriculum có chapter và lesson metadata.

## Phase 2 — Enrollment + phòng học cơ bản

### Backend

- Enrollment free/admin/VIP.
- Middleware course access.
- Learning course/lesson APIs.
- Lesson progress normalized.
- Resume last lesson.

### Frontend

- CTA đăng ký.
- My learning.
- Player layout.
- Sidebar curriculum.
- Lock/unlock.
- Prev/next.
- Progress.

### Nghiệm thu

- User đăng ký free và học được.
- User không có quyền không lấy được nội dung private.
- Refresh trang giữ đúng bài và timestamp.

## Phase 3 — R2 media MVP

### Backend

- R2 client config.
- Presigned single PUT.
- Multipart upload.
- Complete/abort.
- Playback signed URL.
- HEAD verification.
- Media ownership.

### Frontend admin

- Upload progress.
- Retry/cancel.
- Variant 720p và optional 480p.
- Gắn asset vào lesson.

### Frontend learner

- MP4 player.
- Resume.
- Quality selector.
- Refresh playback URL.

### Nghiệm thu

- Video không đi qua Express.
- Bucket video không public.
- Không lộ R2 secret.
- Seek hoạt động.
- User không enrollment bị 403.
- Upload lỗi có thể retry.

## Phase 4 — Learning tools

- Notes theo timestamp.
- Comments/replies.
- Resources.
- Quiz chuẩn hóa.
- Rating sau ngưỡng tiến độ.
- Certificate record thật.

### Nghiệm thu

- Notes chỉ owner đọc/sửa/xóa.
- Comment phân quyền đúng.
- Quiz attempt được lưu.
- Course completion không phụ thuộc dữ liệu client tự gửi.

## Phase 5 — Admin và vận hành

- Dashboard course analytics.
- Enrollment management.
- Publish workflow.
- Audit log các thao tác quan trọng.
- Soft delete media.
- Cleanup lifecycle/job.
- Seed khóa HSK/HSKK/CSCA thật.

## Phase 6 — Nâng cấp video khi có nhu cầu

Chỉ thực hiện khi dữ liệu thực tế chứng minh cần:

- HLS adaptive bitrate.
- Encode queue.
- Worker bảo vệ custom domain.
- Cloudflare Stream.
- DRM không nằm trong MVP.

---

## 15. Thứ tự ưu tiên thực tế

### P0 — Bắt buộc để bán/học được

- Course taxonomy đúng.
- Course catalog.
- Landing public.
- Section/lesson.
- Enrollment.
- Access control.
- R2 upload/playback.
- Lesson progress.
- Admin curriculum.

### P1 — Cần cho trải nghiệm tốt

- Notes.
- Comments.
- Ratings.
- Quiz.
- Resume.
- Related courses.
- Course analytics cơ bản.

### P2 — Làm sau

- HSKK recording.
- AI feedback.
- HLS.
- 1080p tự động.
- Live class/Google Meet.
- Advanced certificate verification.

---

## 16. Test plan

### Backend

- Authenticated/unauthenticated.
- Admin/creator ownership.
- Enrollment access.
- Free preview.
- Course publish state.
- Progress idempotency.
- Concurrent progress update.
- Upload create/complete/abort.
- Invalid MIME/oversize.
- Expired presigned URL.
- R2 object missing.

### Frontend

- Catalog responsive.
- Landing sticky card.
- Accordion keyboard accessibility.
- Player resume.
- Quality switch giữ timestamp.
- Mobile drawer.
- Slow network.
- Video unavailable.
- Empty curriculum.
- Course completed.

### Database

- Unique enrollment.
- Unique lesson progress.
- Sort order.
- Cascade/restrict đúng.
- Aggregate duration/count.
- Migration rollback hoặc forward-fix được mô tả.

---

## 17. Theo dõi chi phí video

Theo dõi hàng tháng:

- Tổng GB lưu trữ.
- Tổng Class A operation.
- Tổng Class B operation.
- Số video và tổng thời lượng.
- Dung lượng trung bình/phút.
- Số lượt playback.
- Tỉ lệ user chọn 480p/720p.
- Tỉ lệ buffering/error.

Ước lượng dung lượng:

```text
GB ≈ bitrate Mbps × thời lượng giờ × 0.45
```

Ví dụ 720p ở 2 Mbps:

```text
1 giờ ≈ 0.9 GB
100 giờ ≈ 90 GB
```

Storage R2 Standard hiện được Cloudflare công bố ở mức `$0.015/GB-tháng`, chưa tính operation. Giá có thể thay đổi nên phải kiểm tra lại trang pricing trước khi chốt ngân sách.

---

## 18. Tiêu chí hoàn thành toàn bộ MVP

MVP được coi là hoàn thành khi:

1. Admin tạo khóa, chương, bài và upload video R2 được.
2. Guest xem catalog và landing công khai.
3. User đăng ký khóa free hoặc có entitlement.
4. User không quyền không thể lấy playback URL.
5. User phát, seek, resume và đổi variant được.
6. Tiến độ lưu đúng theo từng lesson.
7. Course progress tính từ database.
8. Notes timestamp hoạt động.
9. Curriculum responsive bám sát trải nghiệm mẫu.
10. Không còn dùng endpoint MongoDB cũ trong luồng LMS mới.
11. DTO mới không dùng `_id`.
12. Không có secret R2 ở frontend hoặc git.

---

## 19. Tài liệu Cloudflare tham chiếu

- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Upload objects: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Object lifecycle: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Public buckets/custom domains: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Cloudflare Stream pricing để so sánh: https://developers.cloudflare.com/stream/pricing/

