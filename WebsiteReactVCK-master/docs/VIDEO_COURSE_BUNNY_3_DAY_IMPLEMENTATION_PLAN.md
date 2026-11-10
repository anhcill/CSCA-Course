# Kế hoạch triển khai khóa video Record với Bunny Stream trong 3 ngày

## 1. Mục tiêu

Xây dựng trải nghiệm khóa học video thống nhất trong MolyCourse với hai loại khóa:

1. `MIRROR`: khóa Record kế thừa nội dung từ một lớp Live chính.
2. `INDEPENDENT`: khóa video độc lập, không cần lớp Live nguồn.

Yêu cầu bắt buộc:

- Chỉ học viên được gán và có entitlement hợp lệ mới truy cập được khóa.
- Học viên có quyền khóa video được giới hạn tối đa hai thiết bị/trình duyệt tin cậy.
- Cùng trình duyệt đăng xuất rồi đăng nhập lại không chiếm thêm thiết bị.
- Chỉ admin được gỡ thiết bị; học viên chỉ được xem danh sách thiết bị.
- Video được upload và phát trực tiếp qua Bunny Stream, không truyền byte video qua Railway.
- InternalManagement tiếp tục là nguồn sự thật duy nhất về lớp, học viên, học phí, công nợ, hoàn tiền và doanh thu.
- Codex phụ trách backend, SQL, tích hợp và bảo mật; Gemini phụ trách giao diện.

## 2. Kiến trúc tổng thể

```text
InternalManagement
  Học viên + lớp + học phí + công nợ + hoàn tiền
                │ entitlement/membership
                ▼
MolyCourse
  Nội dung + thiết bị + tiến độ + quiz + cấp quyền phát video
                │ upload/playback có chữ ký
                ▼
Bunny Stream
  Lưu trữ + encode + CDN + player
```

Phân quyền sở hữu dữ liệu:

- InternalManagement quản lý dữ liệu thương mại, enrollment và trạng thái thanh toán.
- MolyCourse quản lý nội dung học, thiết bị tin cậy, tiến độ xem, bài tập và quyền phát video.
- Bunny Stream quản lý file video, encoding, thumbnail và phân phối CDN.
- Không lưu Bunny API key, token signing key hoặc URL gốc vĩnh viễn ở frontend.

## 3. Hai luồng khóa video

### 3.1. `MIRROR` - Record kế thừa lớp chính

- InternalManagement tạo lớp `RECORDING + MIRROR` và bắt buộc chọn một lớp Live nguồn cùng course.
- MolyCourse dùng cơ chế Record alias hiện có, không sao chép dữ liệu lớp nguồn.
- Nội dung kế thừa trực tiếp gồm:
  - Danh sách buổi học, tiêu đề và kế hoạch buổi.
  - Lý thuyết, slide, PDF, Word và các tài liệu khác.
  - Từ vựng và công thức/kiến thức trọng tâm.
  - Bài tập, quiz và kết quả.
- Video Bunny được gắn vào từng buổi của lớp Live nguồn.
- Khi giáo viên sửa nội dung lớp nguồn, học viên Record nhìn thấy thay đổi ngay.
- Bài nộp của học viên Record vẫn gắn với bài/lớp chính để giáo viên phụ trách chấm; giao diện giáo viên hiển thị nhãn `Học viên Record`.
- Học viên Record không thấy link học Live, lịch Live, điểm danh, check-in hoặc meeting URL.

### 3.2. `INDEPENDENT` - Khóa video độc lập

- InternalManagement tạo lớp `RECORDING + INDEPENDENT`, không cần lớp Live nguồn.
- Nội dung được tạo riêng trong MolyCourse theo cấu trúc `courses -> sections -> lessons`.
- Mỗi bài học tự quản lý:
  - Video Bunny.
  - Lý thuyết và kiến thức trọng tâm.
  - Slide, PDF, Word, PowerPoint và file đính kèm.
  - Từ vựng và công thức.
  - Bài tập, quiz và kết quả.
- Không có lịch Live, meeting URL, điểm danh hoặc check-in.
- Lớp vẫn có học viên, giá bán, công nợ, thu tiền, hoàn tiền và doanh thu riêng trong InternalManagement.

## 4. Trang Khóa học và trải nghiệm học viên

### 4.1. Danh sách khóa học

- Chỉ card có entitlement đang hiệu lực mới mở được nội dung.
- Người chưa được gán có thể không thấy card, hoặc thấy card bị khóa nhưng API tuyệt đối không trả nội dung.
- Card hiển thị:
  - Nhãn `Record kế thừa` hoặc `Video độc lập`.
  - Phần trăm hoàn thành.
  - Bài đang học dở.
  - Số bài đã hoàn thành trên tổng số bài.
  - Nút `Tiếp tục học`.
- Backend phải kiểm tra membership theo đúng lớp Record, không chỉ kiểm tra course grant. Học viên lớp Live không được nhìn thấy khóa Record khác trong cùng course nếu không có membership tương ứng.

### 4.2. Workspace của một buổi/bài học

Luồng điều hướng:

```text
Khóa học -> Chương -> Buổi/Bài học -> Workspace nội dung
```

Thứ tự tab đề xuất:

1. `Video bài giảng` - tab mặc định.
2. `Lý thuyết & Slide` - rich text, PDF, Word và PowerPoint.
3. `Bài tập & Quiz`.
4. `Từ vựng`.
5. `Công thức / Kiến thức trọng tâm`.
6. `Tài liệu`.
7. `Ghi chú cá nhân`.
8. `Kết quả`.

`Hỏi đáp` chỉ triển khai giao diện cơ bản trong MVP nếu còn thời gian. Notification realtime, moderation và thảo luận nâng cao thuộc phase sau.

Player cần hỗ trợ:

- Tiếp tục xem tại vị trí gần nhất.
- Tốc độ phát, chất lượng và phụ đề nếu video có sẵn.
- Chuyển bài trước/bài tiếp theo.
- Trạng thái uploading, processing, chưa phát hành hoặc encode lỗi.
- Đánh dấu hoàn thành khi xem khoảng 85-90%.
- Mobile player không tràn màn hình và có thể giữ ở đầu trang khi cuộn nội dung.

## 5. Chính sách hai thiết bị

Tận dụng hệ thống trusted-device hiện có; không xây lại một hệ thống thiết bị thứ hai.

### 5.1. Quy tắc

- Áp giới hạn hai thiết bị cho học viên có entitlement khóa video được bảo vệ.
- Admin và giáo viên không áp giới hạn này để không ảnh hưởng vận hành.
- Cùng trình duyệt/profile đăng xuất rồi đăng nhập lại không chiếm slot mới.
- Trình duyệt khác, Chrome profile khác, Incognito hoặc xóa cookie được tính là thiết bị mới.
- Thiết bị thứ ba bị từ chối nhưng không tự khóa toàn bộ tài khoản.
- Học viên chỉ được xem danh sách thiết bị.
- Chỉ admin được gỡ thiết bị.
- Khi admin gỡ, toàn bộ session gắn với thiết bị đó bị thu hồi và slot được giải phóng ngay.
- Ghi audit cho đăng ký thiết bị, lần bị từ chối và thao tác admin gỡ thiết bị.
- Tài khoản hiện có hơn hai thiết bị không bị xóa tự động; admin nhận cảnh báo và chọn thiết bị cần gỡ.

### 5.2. Ghi nhớ trình duyệt

- Dùng durable HTTP-only cookie hiện có.
- Cookie chỉ chứa token ngẫu nhiên; database chỉ lưu hash của token.
- Login hiển thị thông báo: `Trình duyệt này sẽ được ghi nhớ; đăng nhập lại trên cùng trình duyệt không chiếm thêm thiết bị.`
- Không dùng checkbox Remember me làm mất token thiết bị khi người dùng đăng xuất thông thường.

## 6. Bunny Stream

### 6.1. Luồng upload

1. Admin chọn file video.
2. Backend tạo video object trong Bunny Stream.
3. Backend sinh TUS upload credentials có thời hạn.
4. Trình duyệt admin upload trực tiếp lên Bunny.
5. Bunny encode video và gọi webhook về MolyCourse.
6. Webhook cập nhật `uploading -> processing -> ready/failed`.
7. Admin chỉ được publish khi video đã `ready`.

Không có byte video nào đi qua Railway.

### 6.2. Luồng playback

1. Học viên mở một buổi/bài học.
2. Backend kiểm tra:
   - Phiên đăng nhập hợp lệ.
   - Trusted device chưa bị thu hồi.
   - Course entitlement còn hiệu lực.
   - Membership đúng lớp Record.
   - Video thuộc đúng buổi/bài, đã `ready` và `published`.
3. Backend tạo signed Bunny embed URL sống khoảng 5-10 phút.
4. Frontend phát video bằng Bunny player.
5. Frontend gửi heartbeat tiến độ; backend không tin phần trăm hoàn thành do client gửi nếu dữ liệu bất hợp lý.

### 6.3. Cấu hình bảo mật

- Bật Bunny token authentication.
- Bật allowed domains/referrer protection cho các domain MolyCourse.
- Bật MediaCage/basic protection.
- Tắt MP4 fallback và tải file gốc nếu sản phẩm không cần download.
- Playback response dùng `Cache-Control: private, no-store`.
- Rate limit các API upload, playback và progress heartbeat.
- Ghi audit cho create, publish, replace, delete và các lần playback bị từ chối.
- Webhook xử lý idempotent theo `EventId` và chịu được sự kiện đến sai thứ tự.

Token và domain protection chống chia sẻ link và tải thông thường, nhưng không hệ thống web nào chống quay màn hình tuyệt đối.

## 7. SQL và dữ liệu MolyCourse

### 7.1. Mở rộng `video_assets`

- `provider`: `r2_legacy | bunny_stream`.
- `provider_library_id`.
- `provider_video_id`.
- `playback_status`: `created | uploading | processing | ready | failed | deleted`.
- `duration_seconds`.
- `storage_bytes`.
- `thumbnail_url`.
- `available_resolutions`.
- `provider_metadata JSONB`.
- `processing_error`.
- `published_at`.
- `deleted_at`.
- Unique constraint theo `(provider, provider_library_id, provider_video_id)`.

Giữ dữ liệu video R2 hoặc Google Drive cũ dưới dạng legacy/fallback; không hard-break nội dung đang dùng trong MVP.

### 7.2. Các bảng mới

#### `video_course_profiles`

- `management_class_id`.
- `mode`: `MIRROR | INDEPENDENT`.
- `source_live_class_id`, nullable với Independent.
- `enforce_trusted_devices`.
- `device_limit`, mặc định `2`.
- `status`.

#### `class_session_videos`

- Gắn video Bunny vào buổi Live nguồn cho luồng Mirror.
- Có loại video chính/phụ, thứ tự, trạng thái phát hành và thời điểm mở.
- Cho phép thay video nhưng giữ lịch sử audit.

#### `video_watch_progress`

- `user_id`, `video_asset_id`, unit/session/lesson target.
- Vị trí cuối, tổng thời gian xem, phần trăm và thời điểm hoàn thành.
- Unique theo học viên và video/unit.

#### `video_provider_webhook_events`

- Lưu Bunny `EventId`, payload hash, trạng thái xử lý và lỗi.
- Ngăn webhook gửi lại tạo dữ liệu trùng.

#### `learning_unit_theory`

- Gắn với đúng một trong `class_session_id` hoặc `lesson_id`.
- Rich text, tóm tắt, kiến thức trọng tâm và transcript/timestamp tùy chọn.

#### `lesson_learning_file_placements`

- Gắn PDF, Word, slide và file học tập vào bài độc lập.

### 7.3. Mở rộng nội dung hiện có

- Vocabulary và formula thêm `lesson_id` để dùng cho khóa Independent.
- Assignment thêm `lesson_id`.
- Quiz tiếp tục sử dụng hỗ trợ `lesson_id` hiện có.
- Áp exactly-one-target constraint: một nội dung chỉ thuộc `class_session_id` hoặc `lesson_id`, không đồng thời thuộc cả hai.

## 8. API contract

### 8.1. Workspace thống nhất

```http
GET /api/video-courses/:offeringId/workspace
GET /api/video-courses/:offeringId/units/:unitId
```

Ví dụ response:

```json
{
  "mode": "RECORD_MIRROR",
  "course": {},
  "sourceClass": {},
  "units": [],
  "activeUnit": {
    "id": "91",
    "type": "class_session",
    "title": "Chương 13",
    "video": {},
    "theory": {},
    "files": [],
    "assignments": [],
    "quizzes": [],
    "vocabulary": [],
    "formulas": []
  },
  "capabilities": {
    "canPlayVideo": true,
    "canJoinLive": false,
    "canCheckIn": false,
    "showCalendar": false,
    "canSubmitAssignments": true
  }
}
```

Gemini render UI theo `capabilities`, không tự suy luận quyền ở frontend.

### 8.2. Video và Bunny

```http
POST   /api/admin/video-assets/upload-intent
POST   /api/webhooks/bunny-stream
POST   /api/admin/learning-units/:unitId/videos
POST   /api/admin/videos/:videoId/publish
POST   /api/admin/videos/:videoId/unpublish
POST   /api/admin/videos/:videoId/replace
DELETE /api/admin/videos/:videoId

POST /api/videos/:videoId/playback-token
PUT  /api/videos/:videoId/progress
```

### 8.3. Thiết bị

```http
GET    /api/admin/users/:userId/trusted-devices
DELETE /api/admin/users/:userId/trusted-devices/:deviceId
GET    /api/account/trusted-devices
```

Mọi endpoint nội dung, video, bài tập và quiz phải kiểm tra cả course grant và membership đúng lớp Record.

## 9. Admin MolyCourse

Tạo menu riêng `Khóa video`, không nhồi toàn bộ tính năng vào trang curriculum hiện tại.

### 9.1. Mirror

- Hiển thị lớp Live nguồn.
- Danh sách buổi kế thừa ở chế độ read-only.
- Quản lý video của từng buổi.
- Trạng thái video: thiếu, uploading, processing, ready, failed, published.
- Cho phép upload, thay video, publish và unpublish.

### 9.2. Independent

- Tạo chương và bài học.
- Kéo thả sắp xếp thứ tự.
- Soạn lý thuyết.
- Quản lý video, file, từ vựng, công thức, bài tập và quiz.
- Checklist trước khi publish:
  - Có ít nhất một bài học.
  - Các video bắt buộc đã encode xong.
  - Có thumbnail.
  - Mapping InternalManagement hợp lệ.
  - Entitlement sync không lỗi.

## 10. Thay đổi InternalManagement

InternalManagement cần sửa, nhưng chỉ ở vai trò commercial/control plane.

### 10.1. Mô hình lớp

```text
ClassType: LIVE | RECORDING
RecordingContentMode: MIRROR | INDEPENDENT
```

Quy tắc:

- `LIVE`: `RecordingContentMode = NULL`, `SourceClassId = NULL`.
- `RECORDING + MIRROR`: `SourceClassId` bắt buộc, cùng course, nguồn là Live và không bị hủy.
- `RECORDING + INDEPENDENT`: `SourceClassId = NULL`.
- Các lớp Record cũ được backfill thành `MIRROR` để giữ nguyên hành vi.

### 10.2. UI Internal

Khi tạo/sửa lớp cho phép chọn:

1. Lớp Live.
2. Record kế thừa lớp Live.
3. Khóa video độc lập.

Chỉ hiển thị dropdown lớp nguồn khi chọn Mirror. Independent phải tự xóa `SourceClassId`.

### 10.3. Tài chính và quyền học

- Cả Mirror và Independent có học phí, công nợ, giảm giá, thu tiền, hoàn tiền và doanh thu riêng.
- Thanh toán đủ/active mới cấp quyền phát video.
- Partial/pending có thể provision tài khoản nhưng chưa được phát video.
- Refunded, Cancelled hoặc Failed phải thu hồi playback entitlement.
- Không tạo attendance, meeting, lịch học hoặc payroll giảng dạy cho lớp Record.
- Không lưu Bunny ID hoặc thiết bị trong InternalManagement.

### 10.4. Payload đồng bộ

```json
{
  "classType": "RECORDING",
  "recordingContentMode": "MIRROR",
  "sourceClassSourceId": "live-class-source-id"
}
```

Hoặc:

```json
{
  "classType": "RECORDING",
  "recordingContentMode": "INDEPENDENT",
  "sourceClassSourceId": null
}
```

Triển khai consumer MolyCourse trước để tương thích payload cũ và mới; sau đó mới deploy producer InternalManagement.

## 11. Phân công triển khai trong ba ngày

| Ngày | Codex - backend, SQL, integration | Gemini - UI |
| --- | --- | --- |
| Ngày 1 | Chốt API contract; migration Moly và Internal; Mirror/Independent; policy hai thiết bị; bỏ auto-lock; entitlement theo class | Card khóa học; badge mode; workspace shell; sidebar chương/buổi; tab system; màn hình thiết bị học viên/admin; UI chọn mode trong Internal |
| Ngày 2 | Bunny TUS upload; webhook idempotent; signed playback; workspace API; progress; nội dung cho lesson độc lập | Bunny player; resume/progress; preview PDF/slide/file; các tab nội dung; trạng thái uploading/processing/error |
| Ngày 3 | CRUD/publish video; sync Internal; finance/revoke; audit; security; test integration và E2E | Trang admin Khóa video; source picker; curriculum builder Independent; upload progress; publish checklist; responsive/accessibility QA |

### Điểm bàn giao

- Cuối ngày 1: Codex giao migration, API contract và response mock cố định cho Gemini.
- Cuối ngày 2: Gemini nối API thật; Codex hoàn tất luồng upload, webhook và playback.
- Ngày 3: ghép E2E InternalManagement -> MolyCourse -> Bunny và sửa lỗi.
- Thứ tự phát hành: MolyCourse consumer/backend trước, sau đó InternalManagement backend và desktop UI.

Gemini chỉ phụ trách giao diện; không tự thay schema, entitlement, Bunny token hoặc logic giới hạn thiết bị.

## 12. Tiêu chí nghiệm thu

### Thiết bị và bảo mật

- Cùng trình duyệt đăng nhập lại không tăng số thiết bị.
- Hai trình duyệt hoạt động; trình duyệt thứ ba bị từ chối.
- Học viên không tự gỡ thiết bị; admin gỡ xong slot được giải phóng ngay.
- Gỡ thiết bị thu hồi toàn bộ session của thiết bị đó.
- API key và Bunny signing key không xuất hiện trong frontend hoặc response công khai.

### Mirror

- Thay đổi nội dung lớp nguồn xuất hiện trong khóa Record mà không tạo dữ liệu trùng.
- Học viên Record không mở được meeting, lịch Live, điểm danh hoặc check-in.
- Bài nộp Record về đúng bài và giáo viên lớp nguồn.
- Học viên lớp Live không truy cập khóa Record sibling nếu thiếu membership.

### Independent

- Tạo và sử dụng được khi không có lớp hoặc giáo viên Live.
- Tạo chương, bài, video, lý thuyết, file, từ vựng, công thức và bài tập độc lập.
- Không phát sinh attendance, schedule hoặc meeting.
- Doanh thu vẫn xuất hiện chính xác trong Finance Workspace của InternalManagement.

### Bunny và video

- Video không truyền qua Railway.
- Video processing, unpublished, thuộc lớp khác hoặc entitlement hết hiệu lực bị backend chặn.
- Refund hoặc hủy enrollment thu hồi quyền lấy playback token.
- Webhook gửi lại không tạo bản ghi trùng.
- Desktop và mobile đều xem được; player không tràn màn hình.
- Resume và phần trăm hoàn thành được lưu đúng.

## 13. Nội dung để phase sau

Ba ngày chỉ nhằm hoàn thành một vertical slice có thể phát hành. Các mục sau để phase tiếp theo:

- Auto transcript, chapter và tìm kiếm trong transcript.
- DRM nâng cao hoặc forensic watermark theo học viên.
- Heatmap, analytics xem video và cảnh báo tài khoản chia sẻ.
- Offline download.
- Hỏi đáp realtime, moderation và notification nâng cao.
- Chuyển hàng loạt toàn bộ video Google Drive/R2 cũ sang Bunny.
- Đồng bộ thao tác gỡ thiết bị từ InternalManagement qua admin-to-admin API.
- Kiểm thử và tối ưu delivery riêng cho người dùng ở Trung Quốc đại lục.

