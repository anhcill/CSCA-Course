# CSCA LMS — Kế hoạch nâng cấp toàn diện

> **Mục tiêu sản phẩm:** CSCA LMS là sản phẩm chính. Website công khai chỉ là nơi giới thiệu và khám phá khóa học. Khi đăng nhập, học viên vào ngay danh sách khóa học/lớp của mình; từ đó đi tới từng buổi học, bài tập, tài liệu và kết quả mà không phải tìm qua nhiều khu vực.

## 1. Phạm vi và nguyên tắc quyết định

### 1.1. Điều không thay đổi

- Giữ React/Vite ở `frontend`, Express/PostgreSQL ở `backend` và các migration hiện có.
- Giữ bảng `courses`, `live_classes`, `class_schedules`, `class_sessions`, `class_enrollments`, `assignments`, `quizzes`, `lesson_progress` để tránh mất dữ liệu.
- Không xóa dữ liệu học, điểm danh, bài nộp hay lịch sử chấm điểm. Thay đổi dùng trạng thái (`cancelled`, `rescheduled`, `archived`) và audit log.
- LMS là nguồn dữ liệu gốc cho nội dung học, lịch, session, điểm danh, bài tập, quiz, điểm và tài liệu. Nếu có hệ Management, hệ đó là nguồn cho danh tính, thanh toán, entitlement, roster và phân công chính thức.

### 1.2. Mô hình nghiệp vụ bắt buộc

```text
Course (khung nội dung dùng lại)
  └─ Class / cohort (một lớp khai giảng cụ thể)
       └─ Schedule series (lịch cố định hàng tuần)
            └─ Class session (một buổi học theo ngày/giờ cụ thể)
                 ├─ Link Meet/Zoom
                 ├─ Attendance
                 ├─ Session materials
                 ├─ Assignment release
                 ├─ Quiz release
                 └─ Announcement / notification
```

Ví dụ:

| Thực thể | Ví dụ |
|---|---|
| Course | CSCA Toán nền tảng |
| Class | CSCA Toán K01 — tối Thứ 2/Thứ 4 |
| Schedule series | 19:00–21:00 Thứ 2 và Thứ 4, từ 01/10 đến 15/12 |
| Session | Buổi 05 — 14/10/2026, 19:00–21:00 |

**Quy tắc quan trọng:** lịch luôn thuộc `Class`, không thuộc `Course` master. Một Course có thể mở nhiều Class với giáo viên, giờ học và học viên khác nhau. Với học viên, giao diện có thể gọi tất cả là “khóa học của tôi” để đơn giản.

### 1.3. Quyền theo vai trò

| Vai trò | Được làm |
|---|---|
| Student | Chỉ xem/học các class có `class_enrollment` active; xem lịch, buổi học, nộp bài, làm quiz, xem điểm của mình |
| Teacher | Chỉ vận hành class được phân công: lịch, session, điểm danh, tài liệu, bài tập, quiz và chấm điểm |
| Admin | Quản lý course/class, phân công giáo viên, roster, quyền, audit, sync và xử lý vận hành |

Không dùng role toàn cục để bỏ qua ownership của lớp. Giáo viên A không được đọc hay sửa dữ liệu lớp B nếu không có phân công ở `class_teachers`.

---

## 2. Kiến trúc trải nghiệm và route chuẩn

### 2.1. Sản phẩm chính và website phụ

| Khu vực | Mục đích | Route chuẩn |
|---|---|---|
| Website công khai | Giới thiệu, marketing, catalog, bài viết | `/`, `/courses`, `/courses/:slug` |
| Student LMS | Học và quản lý việc học | `/lms` |
| Teacher LMS | Vận hành lớp và giảng dạy | `/lms/teach` |
| Admin LMS | Vận hành toàn hệ thống | `/lms/admin` |

Không hiển thị Navbar/Footer website công khai trong LMS. Trong sidebar LMS chỉ có một link phụ ở cuối: **Khám phá khóa học** → `/courses`.

### 2.2. Landing sau đăng nhập

| Người dùng | Điều hướng mặc định |
|---|---|
| Student | `/lms` → `/lms/my-learning` |
| Teacher | `/lms/teach` |
| Admin | `/lms/admin/overview` |

Sau login/OAuth, phải `navigate()` về route theo role. Không chỉ đóng modal và để người dùng ở website cũ.

### 2.3. Route canonical

```text
/lms                                  → /lms/my-learning
/lms/my-learning                      Danh sách khóa/lớp học viên được học
/lms/courses/:courseId                Chọn lớp nếu user có nhiều lớp cùng course
/lms/courses/:courseId/classes/:classId
  /overview                           Tổng quan lớp
  /learn                              Giáo trình và bài học
  /calendar                           Lịch ngày/tuần/tháng/list
  /sessions/:sessionId                Workspace của một buổi học
  /assignments                        Bài tập và quiz
  /materials                          Tài liệu
  /results                            Điểm, chuyên cần và tiến độ

/lms/teach                            Teacher home
/lms/teach/classes                    Danh sách lớp được phân công
/lms/teach/classes/:classId           Teacher class workspace
/lms/teach/calendar                   Lịch dạy

/lms/admin/overview                   Admin dashboard
/lms/admin/courses                    Course và curriculum
/lms/admin/classes                    Lớp, roster, giáo viên
/lms/admin/calendar                   Calendar toàn trung tâm
/lms/admin/operations                 Sync, audit, permissions
```

Giữ route cũ dưới dạng redirect tạm thời và theo dõi tần suất sử dụng. Không tiếp tục thêm UI vào route legacy như `/shedule`, `/select-course`, `/lms/catalog`, `/lms/my-learning` cũ nếu nghĩa không còn đúng.

---

## 3. Đặc tả UI cho Gemini

> Gemini chỉ làm frontend/UI theo phần này. Không được tự tạo mock API, fake role, fake notification hoặc tự thay đổi schema/API. Tất cả hành động gọi qua `frontend/src/features/api/lmsClient.js`; trạng thái loading, empty, error phải có UI rõ ràng.

### 3.1. Prompt triển khai tổng quát cho Gemini

```text
Bạn là frontend engineer cho CSCA LMS, dùng React 18, Vite, Tailwind, React Router và lucide-react. Hãy triển khai UI production-ready theo các route và trạng thái trong tài liệu này.

LMS là sản phẩm chính; website công khai là khu vực phụ. Không làm dashboard chung rối rắm. Học viên vào LMS thấy “Khóa học của tôi” trước, sau đó vào workspace của lớp.

Không tự tạo API endpoint, không dùng mock data khi API chưa sẵn sàng, không đổi database/backend. Dùng lmsClient hiện hữu hoặc tạo đúng hàm client theo API contract đã ghi. Mọi trang phải có loading, empty state, error state, responsive mobile, dark mode, keyboard focus và text tiếng Việt.

Không hiển thị navigation website công khai trong LMS. Mỗi màn LMS dùng layout chung, có breadcrumb và ngữ cảnh course/class rõ ràng. Không tạo component quá 250 dòng; tách components theo feature. Không dùng biểu đồ hoặc KPI giả.
```

### 3.2. Student shell

**Sidebar:**

```text
CSCA LMS
  Khóa học của tôi
  Lịch học
  Bài tập & Quiz
  Tài liệu
  Kết quả học tập
  Thông báo
  ─────────────────
  Khám phá khóa học
```

**Header:** tìm kiếm thật khi API search sẵn sàng; notification bell; switch light/dark; avatar menu; với teacher/admin có menu chuyển workspace phù hợp.

#### A. `MyLearningPage` — trang đầu của học viên

Mục tiêu: hiển thị danh sách class học viên có quyền học, không phải catalog công khai.

Mỗi card hiển thị:

- Thumbnail, tên course, mã/tên class, giáo viên chính.
- Thanh tiến độ course.
- Dòng nổi bật: `Học hôm nay lúc 19:00` hoặc `Buổi tiếp theo: Thứ 4, 19:00`.
- Badge số bài chưa nộp và quiz sắp hết hạn.
- Nút chính: `Vào học` nếu có session đang mở; nếu không thì `Mở lớp`.
- Nút phụ: `Xem lịch`.

Trạng thái:

- Không có lớp: giải thích ngắn, CTA `Khám phá khóa học`.
- Access bị tạm dừng: card read-only, hiển thị liên hệ hỗ trợ; không lộ nội dung/private link.
- Nhiều class trong cùng course: card Course mở trang chọn class, không tự chọn class đầu tiên.

#### B. `CourseClassWorkspaceLayout`

Header context luôn hiển thị `Course > Class`. Có selector đổi class nếu học viên được học nhiều class cùng course.

Tabs:

1. Tổng quan
2. Bài học
3. Lịch học
4. Bài tập & Quiz
5. Tài liệu
6. Kết quả

Không đưa link Meet/Zoom vào header chung; link chỉ hiển thị trong session hiện tại/sắp mở.

#### C. `ClassOverviewPage`

Bố cục ưu tiên hành động tiếp theo:

1. Một card lớn `Hôm nay` hoặc `Buổi học tiếp theo`, chứa tên session, giờ, giáo viên, trạng thái và CTA phù hợp.
2. `Việc cần hoàn thành`: bài tập/quiz theo hạn gần nhất.
3. `Tiến độ học tập`: progress và lesson tiếp tục học.
4. `Thông báo của lớp`: tối đa 3 item có link sâu.

Không dùng dày đặc KPI card. Nếu không có buổi hôm nay, hiển thị buổi tiếp theo và agenda của tuần.

#### D. `ClassCalendarPage`

Hiển thị calendar theo 4 chế độ:

- **Ngày:** agenda có giờ, loại sự kiện và CTA.
- **Tuần:** mặc định, dễ đọc trên desktop.
- **Tháng:** chỉ biểu thị session/deadline; bấm mở detail.
- **Danh sách:** tối ưu điện thoại và accessibility.

Phân biệt bằng icon + text, không chỉ bằng màu:

| Loại | Nhãn |
|---|---|
| `SESSION` | Buổi học |
| `ASSIGNMENT_DUE` | Hạn nộp bài |
| `QUIZ_OPEN` / `QUIZ_DUE` | Quiz mở / hết hạn |
| `ANNOUNCEMENT` | Thông báo |

Một session bị đổi lịch phải có nhãn **Đã đổi lịch**. Detail phải cho thấy giờ cũ, giờ mới, lý do và người sửa nếu backend trả về.

#### E. `SessionDetailPage` — màn quan trọng nhất

```text
Buổi 05 · Hàm số và đồ thị
14/10/2026 · 19:00–21:00 · Online

[Vào lớp học]  [Tài liệu]  [Bài tập]  [Điểm danh nếu được phép]

Nội dung buổi học
Tài liệu của buổi
Bài tập được giao
Quiz của buổi
Thông báo / ghi chú từ giáo viên
```

CTA `Vào lớp học` chỉ active trong khoảng thời gian do backend trả về (`canJoin`, `joinAvailableAt`, `joinExpiresAt`). Không tự điều kiện bằng thời gian máy khách.

### 3.3. Teacher UI

#### A. `TeacherHomePage`

Ưu tiên 3 việc:

- Buổi đang diễn ra/sắp diễn ra hôm nay.
- Bài cần chấm.
- Các thay đổi lịch đang chờ xử lý.

Danh sách `Lớp tôi dạy` là điểm vào chính. Không dùng cùng component admin để làm màn teacher.

#### B. `TeacherClassWorkspace`

Tabs:

```text
Tổng quan | Học viên | Lịch & Buổi học | Nội dung | Bài tập & Quiz | Tài liệu | Bảng điểm
```

Teacher được tạo lesson content trong phạm vi quyền; không thể gán sang course/class không được phân công.

#### C. Teacher calendar giống Google Calendar

Chức năng UI:

- Day / Week / Month / List.
- Nút `Tạo lịch cố định` khi class chưa có lịch.
- Tạo một `schedule series`: ngày bắt đầu/kết thúc, thứ lặp, giờ, địa điểm/link, giáo viên.
- Tạo buổi bù riêng.
- Kéo-thả session để đề xuất đổi giờ; trước khi submit mở modal xác nhận.
- Khi sửa phải bắt buộc chọn scope:
  - `Chỉ buổi này`
  - `Buổi này và các buổi sau`
  - `Toàn bộ lịch`
- Modal phải có textarea lý do thay đổi và checkbox `Gửi thông báo cho học viên` mặc định bật.
- Hiển thị conflict do API trả về; không tự đoán conflict ở frontend.

#### D. Điểm danh theo session

Màn điểm danh bắt đầu từ session, không bắt đầu từ roster chung:

- Danh sách học viên active của class.
- Các trạng thái: có mặt, muộn, vắng có phép, vắng không phép.
- Bulk action: đánh dấu tất cả có mặt.
- Lưu nháp và submit.
- Sau khi đã chốt, UI hiển thị ai chốt/lúc nào; việc mở lại cần lý do.

### 3.4. Admin UI

Admin có các khu vực tách biệt:

| Khu vực | Chức năng |
|---|---|
| Course & Curriculum | Course, sections, lessons, publish state |
| Class Operations | Tạo class, roster, teacher assignment, thời gian học |
| Calendar Center | Xem lịch mọi class, phát hiện conflict, điều phối lịch |
| Users & Access | Khóa/mở access, timeline entitlement |
| Operations | Sync jobs, audit log, notification delivery, storage status |

Admin chỉnh lịch phải dùng đúng UI/contract như giáo viên, nhưng có quyền mọi class. Những action nguy hiểm cần confirm và reason.

---

## 4. Backend và data plan — do Codex thực hiện

### 4.1. Kiểm tra hiện trạng trước khi sửa

Các phần đã có cần giữ và review kỹ:

- `live_classes`, `class_schedules`, `class_sessions`, `class_enrollments`.
- `class_teachers` cho nhiều giáo viên/lớp.
- `assignments`, `assignment_submissions`, `quiz_attempts`.
- `lms_learning_files`, R2 signed URL, access check.
- Permission matrix, audit events, management sync inbox/outbox.

Các lỗi/rủi ro đã phát hiện:

1. Login hiện không chuyển user vào LMS sau khi thành công.
2. Route và semantic bị chồng: `/lms/catalog` thực tế là khóa học đã đăng ký, nhiều route legacy còn tồn tại.
3. Quiz chưa có release theo lớp/session, nên không phù hợp khi cùng course mở nhiều cohort.
4. `enrollments` theo course và `class_enrollments` theo lớp cần policy source-of-truth rõ.
5. API có cả `/api/...` và `/api/v1/...`; API mới phải versioned nhất quán.
6. Frontend lint hiện lỗi nhiều; phải lập baseline rồi giảm về 0 trước release.
7. Cần review việc `attendanceRouter` được mount hai lần trong `backend/server.js` để đảm bảo route không bị trùng/khó bảo trì.

### 4.2. Migration forward-only đề xuất

Không sửa migration cũ đã chạy. Tạo migration mới, idempotent, có index và backfill theo batch.

#### `020_class_calendar_core.sql`

Tạo/nâng cấp các đối tượng:

```text
class_schedule_series
  id, live_class_id, title, timezone,
  recurrence_rule, start_date, end_date,
  start_time, end_time, meeting_url, location,
  status, created_by, updated_by, created_at, updated_at

class_sessions (nâng cấp)
  schedule_series_id nullable,
  original_start_at, original_end_at,
  start_at, end_at,
  status: scheduled | live | completed | cancelled | rescheduled,
  change_reason, changed_by, changed_at

session_change_log
  session_id, schedule_series_id, scope,
  before JSONB, after JSONB, reason, actor_id, created_at
```

Yêu cầu:

- Lưu thời gian thật ở `TIMESTAMPTZ`/UTC; `timezone` lưu ở series để render đúng `Asia/Ho_Chi_Minh`.
- Không ghi `RRULE` thô từ browser mà không validate. UI gửi form đơn giản; backend sinh recurrence rule hợp lệ.
- Khi tạo/sửa series, materialize session cho toàn bộ kỳ học hoặc ít nhất horizon 180 ngày.
- Không đổi hoặc xóa session đã completed/đã có attendance/submission. Với future session, dùng policy scope.
- Migration dữ liệu cũ: chuyển `class_schedules` thành `class_schedule_series`; link session tương ứng nếu xác định được, không delete dữ liệu cũ trong release đầu.

#### `021_session_learning_delivery.sql`

```text
session_materials
  id, session_id, learning_file_id nullable, title, description,
  availability: draft | published | hidden, available_from, created_by

assignment_releases
  id, assignment_id, live_class_id, session_id nullable,
  available_from, due_at, attempts_allowed, status, published_by

quiz_releases
  id, quiz_id, live_class_id, session_id nullable,
  opens_at, closes_at, duration_minutes, attempts_allowed,
  review_policy, randomization_policy, status, published_by

calendar_events
  id, live_class_id, session_id nullable,
  event_type, starts_at, ends_at, title, deep_link, visibility
```

Quiz attempts phải unique theo `(user_id, quiz_release_id, attempt_number)`, không còn chỉ theo `(user_id, quiz_id)`.

#### `022_notification_delivery.sql`

Thêm event/outbox cho notification:

- `session.rescheduled`, `session.cancelled`, `session.created`
- `material.published`
- `assignment.published`, `assignment.due_soon`
- `quiz.opened`, `quiz.due_soon`
- `grade.published`, `attendance.updated`

Mỗi event có recipient scope, deep link, dedupe key, actor, correlation ID và delivery state. In-app bắt buộc; email/push là phase sau, tùy consent.

### 4.3. API contract chuẩn `/api/v1`

Giữ API cũ trong transition, nhưng không thêm endpoint mới dưới `/api` không version.

```text
GET  /api/v1/lms/me/classes
GET  /api/v1/lms/me/calendar?from=&to=&view=
GET  /api/v1/lms/courses/:courseId/classes
GET  /api/v1/lms/classes/:classId/overview
GET  /api/v1/lms/classes/:classId/calendar?from=&to=

POST /api/v1/lms/classes/:classId/schedule-series
PATCH /api/v1/lms/schedule-series/:seriesId
POST /api/v1/lms/sessions
PATCH /api/v1/lms/sessions/:sessionId
GET  /api/v1/lms/sessions/:sessionId
GET  /api/v1/lms/sessions/:sessionId/access

POST /api/v1/lms/sessions/:sessionId/materials
POST /api/v1/lms/sessions/:sessionId/assignments
POST /api/v1/lms/sessions/:sessionId/quizzes
POST /api/v1/lms/sessions/:sessionId/attendance

GET  /api/v1/lms/teacher/classes
GET  /api/v1/lms/admin/calendar?from=&to=&classId=&teacherId=
```

`PATCH /schedule-series` và `PATCH /sessions/:id` phải nhận:

```json
{
  "scope": "single | this_and_following | all_future",
  "reason": "Nghỉ lễ, học bù thứ Ba",
  "notifyStudents": true,
  "expectedVersion": 4
}
```

Backend trả `409 CONFLICT` nếu event version cũ hoặc teacher/class/location bị overlap. Không overwrite thay đổi của người khác im lặng.

### 4.4. Business rules cho calendar

1. Chỉ admin/teacher có `lms.schedule.manage` và ownership class mới tạo/sửa lịch.
2. Student chỉ đọc session của class enrollment active.
3. Mọi future session sinh từ series có `schedule_series_id`.
4. Sửa `single` chỉ sửa session đó, luôn giữ `original_start_at` và log before/after.
5. Sửa `this_and_following` đóng phiên bản series cũ và tạo version series mới từ session được chọn; past session không thay đổi.
6. Hủy buổi chỉ đổi status `cancelled`, giữ data và gửi notification.
7. Không tạo hai session overlap cho cùng class hoặc lead teacher, trừ khi admin có `force` kèm lý do/audit.
8. Session có `canJoin` do server tính trên timezone/clock server; browser chỉ render kết quả.
9. Khi session đổi thời gian/link/hủy, tạo chính xác một notification/event mỗi recipient bằng dedupe key.
10. Deadline assignment/quiz phải nằm đúng timezone và trả về ISO timestamp rõ ràng.

### 4.5. Course access policy

| Loại học | Quyền hợp lệ |
|---|---|
| Self-paced | `enrollments.status = active` cho course |
| Cohort/live | `class_enrollments.status = active` cho class; course enrollment chỉ là entitlement/projection nếu cần |

Nếu một lesson cần theo dõi riêng cho từng cohort, nâng `lesson_progress` thành scope được theo class. Nếu course có tiến độ dùng chung, ghi rõ policy và không trộn kết quả lớp khác nhau.

### 4.6. File, video và riêng tư

- R2 private: video học, file session, file bài nộp, audio.
- Cloudinary: thumbnail/banner/avatar/ảnh public đã tối ưu.
- Mọi download phải kiểm tra user có course/class/session access trước khi cấp signed URL ngắn hạn.
- File chưa confirm hoặc chưa published không xuất hiện cho học viên.
- Session material chỉ public theo `available_from` và class entitlement.

---

## 5. Thứ tự triển khai

> Đây là một nâng cấp toàn diện về scope, nhưng release theo phase để không làm hỏng lớp đang vận hành.

### Phase 0 — Khóa thiết kế và dữ liệu (2–3 ngày)

- Chốt course/class/session definitions, role matrix, policy enrollment.
- Lập mapping lớp thật: course, class, giáo viên, học viên, ngày bắt đầu/kết thúc, timezone.
- Backup DB; kiểm tra migration ledger; thống kê dữ liệu hiện tại.
- Chụp baseline test/lint/build và không merge tính năng mới không liên quan.

**Done:** có danh sách dữ liệu pilot, route canonical và API contract được duyệt.

### Phase 1 — LMS là điểm vào chính (3–5 ngày)

**Gemini:** Student shell, `MyLearningPage`, class workspace layout, route/UI đổi tên.

**Codex/backend:** redirect sau login/OAuth; API `me/classes`, class overview; route guard; legacy redirect có telemetry.

**Done:** học viên đăng nhập → thấy class của mình → vào workspace class; link về `/courses` là phụ.

### Phase 2 — Calendar core và session generation (5–7 ngày)

**Gemini:** Calendar views, create/edit series modal, session detail, responsive list view.

**Codex/backend:** migration 020, recurrence validation, materialization worker/service, conflict check, optimistic locking, audit.

**Done:** admin/teacher tạo lịch cố định; session tự sinh; sửa một buổi hoặc các buổi sau không phá lịch sử.

### Phase 3 — Daily teaching delivery (5–7 ngày)

**Gemini:** Teacher class workspace, attendance UI, session materials, task/quiz release UI.

**Codex/backend:** migration 021; scope/ownership query; publish window; assignment/quiz release; session access/join policies.

**Done:** giáo viên vào session hôm nay để điểm danh, giao tài liệu/bài tập/quiz; học viên chỉ thấy đúng nội dung đúng thời điểm.

### Phase 4 — Notification và vận hành (3–5 ngày)

**Gemini:** notification center thật, change-history detail, admin calendar center.

**Codex/backend:** notification outbox, delivery worker, idempotency, audit, admin operation APIs.

**Done:** đổi lịch/giao bài/chấm điểm gửi đúng người, đúng một lần, click đến đúng session/tác vụ.

### Phase 5 — Chất lượng, migration và pilot (5–7 ngày)

- Sửa lint về 0 error cho code được hỗ trợ; tách technical debt legacy có kế hoạch rõ.
- API integration tests, browser E2E và migration test DB sạch + upgrade DB.
- Test timezone, conflict, reschedule, entitlement revoked, signed files, assignment, quiz và attendance.
- Pilot một class thật; chỉ mở rộng sau khi staff xác nhận dữ liệu/lịch/notification đúng.

**Done:** có bằng chứng test pass và rollback/runbook; không dùng SQL tay để sửa lịch/roster hằng ngày.

### Phase 6 — Tích hợp Google Calendar (sau pilot)

- Xuất `.ics` cho class/session trước.
- Sau đó OAuth Google Calendar, chỉ đồng bộ LMS → calendar của người đã consent.
- LMS vẫn là source of truth; Google API lỗi không được làm mất hoặc làm lệch session trong LMS.
- Có nút reconnect, revoke access, retry queue và audit.

---

## 6. Checklist kiểm lỗi backend — Codex

### Authorization

- [ ] Student không đọc được class, session, file, assignment, grade của class khác.
- [ ] Teacher không tạo/sửa lịch hoặc chấm bài class không được phân công.
- [ ] Teacher mất assignment khi bị revoke khỏi class.
- [ ] Admin có quyền nhưng mọi override phải audit.
- [ ] Link Meet/Zoom và signed download không lộ qua endpoint public/cached response.

### Calendar

- [ ] Tạo series sinh đúng session theo `Asia/Ho_Chi_Minh` và qua ranh giới DST nếu có class timezone khác.
- [ ] `single`, `this_and_following`, `all_future` có kết quả đúng, past session bất biến.
- [ ] Sửa đồng thời phát hiện `expectedVersion` cũ với HTTP 409.
- [ ] Không tạo conflict class/lead teacher; test cả duration overlap.
- [ ] Hủy session giữ attendance/submission/audit và không xóa object storage.
- [ ] Session change chỉ phát một notification mỗi recipient.

### Learning delivery

- [ ] Tài liệu draft/hidden/future không truy cập được bằng URL trực tiếp.
- [ ] Assignment/quiz release chỉ thấy bởi roster active của đúng class.
- [ ] Quiz attempt quota tính theo `quiz_release`, không lẫn class khác.
- [ ] Deadline/publish window kiểm tra server-side.
- [ ] Grade, submission và attendance giữ lịch sử actor/time/reason.

### Migration và reliability

- [ ] Migration chạy được trên DB sạch và DB cũ có dữ liệu.
- [ ] Migration rerun không lỗi và không tạo duplicate sessions.
- [ ] Backfill chạy batch, có metric record count trước/sau.
- [ ] Worker job idempotent và safe khi chạy song song.
- [ ] Backup/restore được diễn tập trước production migration.
- [ ] Structured log có request/correlation ID, không chứa secret hoặc signed URL dài hạn.

### Quality gate

- [ ] `npm run test:security` pass.
- [ ] API integration suite pass.
- [ ] `npm run lint --prefix frontend` đạt 0 error cho phạm vi release.
- [ ] `npm run build` pass.
- [ ] Browser E2E pass cho Student, Teacher và Admin.
- [ ] Accessibility smoke test: keyboard, focus, dialog, contrast, mobile calendar list.

---

## 7. Definition of Done tổng thể

Một lớp được coi là vận hành đúng khi:

1. Admin tạo course → class → giáo viên → roster → lịch cố định.
2. Hệ thống sinh toàn bộ session; học viên thấy chúng trong calendar.
3. Giáo viên đổi một buổi hoặc tuần học; học viên nhận notification và thấy lịch mới.
4. Đến ngày học, học viên bấm `Vào học` từ session đúng giờ.
5. Giáo viên điểm danh, phát tài liệu, giao bài/quiz ngay trong session.
6. Học viên nộp bài, xem điểm và tiến độ trong đúng class.
7. Người ngoài class không thể xem session, tài liệu, link phòng, bài tập hay điểm.
8. Admin truy được ai đã đổi lịch, khi nào, từ giờ nào sang giờ nào và vì sao.

Kết quả mong muốn: học viên không phải hiểu kiến trúc phía sau. Họ chỉ thấy **khóa học của tôi → hôm nay học gì → vào đúng buổi → làm đúng bài cần làm**.
