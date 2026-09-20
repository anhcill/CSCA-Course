# LMS V2 — Kế hoạch nâng cấp tổng thể

**Phạm vi:** CSCA Course LMS, vận hành cùng InternalManagement (Moly Internal).
**Nguyên tắc quyết định:** InternalManagement là hệ thống trung tâm và nguồn dữ liệu gốc cho danh tính, nhân sự, học viên, khóa/lớp, thanh toán và quyền học. LMS là nơi vận hành hoạt động học: nội dung, lịch, điểm danh, bài tập, quiz, chấm điểm, tài liệu và thông báo.

---

## 1. Kết luận audit hiện tại

### Trạng thái production đã xác minh

| Hạng mục | Kết quả |
|---|---|
| Tài khoản `ducanhle28072003@gmail.com` | Đã là `admin` trên production. Middleware đọc role mới từ database ở mỗi API request. |
| Cấu hình Railway | R2, Cloudinary, Google OAuth, JWT và khóa tích hợp Management đều đã được khai báo. Chưa thay thế cho kiểm thử luồng thật. |
| Dữ liệu LMS vận hành | Đang là **0**: khóa học, lớp, học viên Management, quyền học, roster, bài học, bài tập, quiz, lịch, tệp, notification và job đồng bộ. |
| Luồng học viên | UI đã đi theo `khóa được cấp quyền → chọn lớp → workspace của lớp`. Không còn số liệu giả ở trang khóa học của học viên. |
| API học tập hiện có | Có course/lesson/progress, lớp/lịch/session, điểm danh, bài tập/nộp bài/chấm điểm, quiz, tệp R2, quyền LMS, admin audit. |

### Những phần đã có nhưng mới ở mức nền tảng

- Webhook có chữ ký từ Management để provision học viên và cấp/thu quyền khóa học; có idempotency cho hai API đó.
- `lms_access_grants`, `external_course_id`, `management_class_source_id`, ma trận quyền, audit log và màn hình mapping admin đã có schema/API cơ bản.
- Bài tập có thể gắn lớp; chấm điểm tạo notification trong transaction. Quiz có tác giả, trạng thái draft/published và tự chấm.
- R2 hỗ trợ URL upload/download có chữ ký; Cloudinary hỗ trợ chữ ký upload ảnh/tài nguyên.

### Khoảng trống bắt buộc phải xử lý

1. **Đồng bộ lớp chưa hoàn chỉnh.** `classSourceId` từ Management hiện chỉ lưu trên học viên; chưa có sự kiện/API tạo-cập nhật lớp, phân công giáo viên hoặc thêm/xóa `class_enrollments` tự động.
2. **Đồng bộ course chưa có luồng nghiệp vụ đầy đủ.** LMS chỉ nhận quyền học cho course đã được map thủ công bằng `external_course_id`; chưa nhận catalog/course/class từ hệ thống tổng.
3. **Hàng đợi hiện chưa có worker thực thi.** `lms_sync_jobs` mới là log/dashboard và nút đổi trạng thái retry. Chưa có process đọc job, retry theo backoff hoặc đưa job thật vào dead-letter.
4. **Quiz chưa có phạm vi lớp.** Một quiz chỉ gắn course/lesson; attempt unique theo `(user, quiz)`. Không thể giao cùng một đề cho nhiều lớp với hạn nộp, số lượt và điểm riêng theo lớp.
5. **Notification center cũ vẫn dùng dữ liệu mẫu.** API inbox thật có sẵn, nhưng trang trung tâm thông báo/broadcast cũ đang xử lý state tại frontend; chưa có API phát thông báo theo lớp và chưa có delivery worker.
6. **Quyền hiện là role toàn cục.** `admin/creator/user` đủ cho LMS đơn lẻ, nhưng chưa có site membership/role theo từng website cho mô hình nhiều web.
7. **Chưa có dữ liệu pilot để nghiệm thu.** Không có ba khóa CSCA, lớp, giáo viên, học viên trả phí hay giao dịch hoàn tiền thật để kiểm chứng end-to-end.
8. **Kiểm thử và vận hành còn mỏng.** Hiện có test middleware/tích hợp nhỏ; chưa có browser E2E, migration ledger, alert đồng bộ hoặc runbook xử lý lỗi dữ liệu.

---

## 2. Kiến trúc đích và ranh giới sở hữu dữ liệu

```text
InternalManagement (nguồn dữ liệu gốc)
  ├─ User / giáo viên / học viên
  ├─ Course, class, roster, phân công giáo viên
  ├─ Payment, refund, entitlement
  └─ Outbox sự kiện có chữ ký + retry
                 │
                 ▼
LMS Sync Ingress + Worker
  ├─ Inbox/idempotency/audit/dead-letter
  ├─ Projection: users, courses, live_classes, class_enrollments, access grants
  └─ Phát sự kiện cho notification/reporting
                 │
                 ▼
CSCA LMS
  ├─ Nội dung, bài học, tài liệu, bài tập, quiz
  ├─ Lịch học, điểm danh, chấm điểm, tiến độ
  └─ Workspace học viên theo đúng khóa + lớp
```

| Đối tượng | Hệ thống gốc | LMS được phép sở hữu |
|---|---|---|
| Người dùng, email, trạng thái học viên | InternalManagement | Bản chiếu tối thiểu để đăng nhập/học; không tự tạo học viên trả phí bằng tay |
| Giáo viên và phân công lớp | InternalManagement | Hiển thị và kiểm tra ownership theo lớp; có thể thêm metadata dạy học cục bộ |
| Khóa học thương mại, lớp, roster | InternalManagement | Mapping và bản chiếu để chạy lớp; nội dung chương trình chi tiết nằm tại LMS |
| Payment, gia hạn, refund, khóa quyền | InternalManagement | `lms_access_grants` chỉ là projection; LMS không tự quyết định quyền trả phí |
| Lesson, file, assignment, quiz, attendance, grade | LMS | LMS là hệ thống vận hành gốc; chỉ gửi summary/analytics ngược về Management nếu cần |

**Quy tắc an toàn:** mọi khóa CSCA trả phí phải có `external_course_id`. API tự đăng ký chỉ được phép cho khóa thật sự miễn phí, không thuộc Management; production CSCA nên tắt hẳn tính năng này bằng feature flag/policy.

---

## 3. Hợp đồng đồng bộ phải khóa trước khi viết tiếp

Không đồng bộ bằng cách chạy SQL thủ công. InternalManagement tạo event trong outbox cùng transaction nghiệp vụ, gửi lại cho LMS đến khi nhận `2xx`; LMS ghi inbox/idempotency trước khi xử lý.

### Sự kiện inbound bắt buộc

| Event | Dữ liệu tối thiểu | Kết quả tại LMS |
|---|---|---|
| `course.upserted` | `courseSourceId`, tên, category, level, trạng thái | Tạo/cập nhật course projection, giữ nguyên curriculum do LMS quản lý |
| `class.upserted` | `classSourceId`, `courseSourceId`, tên lớp, status, capacity | Tạo/cập nhật `live_classes`, mapping khóa-lớp |
| `class.teacher.assigned` | class, teacher external ID/email, vai trò chính/phụ | Gán giáo viên; hỗ trợ nhiều giáo viên/lớp |
| `student.provisioned` | student external ID, email, tên, trạng thái | Link/tạo tài khoản LMS ở trạng thái phù hợp |
| `class.membership.changed` | student, class, trạng thái, effective time | Upsert `class_enrollments`; không xóa lịch sử |
| `entitlement.changed` | student, danh sách course, paid/refund/suspend, valid range | Upsert/revoke `lms_access_grants` và enrollment projection |
| `payment.refunded` | payment ID, student, course, thời điểm/lý do | Thu quyền theo chính sách, ghi audit và thông báo |

### Envelope chuẩn cho mọi event

```json
{
  "eventId": "uuid-duy-nhat",
  "eventType": "class.membership.changed",
  "occurredAt": "2026-09-20T10:00:00Z",
  "source": "internal-management",
  "correlationId": "uuid-cua-nghiep-vu",
  "payload": {}
}
```

- Header: timestamp, key id, HMAC signature và `Idempotency-Key`.
- LMS từ chối chữ ký sai, timestamp quá hạn, payload version không hỗ trợ và source ID bị map mâu thuẫn.
- Event cũ hơn `sourceUpdatedAt` đang lưu phải trả `200` với `staleIgnored: true`, không ghi đè dữ liệu mới.
- Refund/suspend phải thu quyền ngay, nhưng không được xóa điểm, bài nộp, attendance hay audit history.

---

## 4. Lộ trình nâng cấp

### P0 — Khóa an toàn và đưa cohort thật đầu tiên lên hệ thống (2–4 ngày)

1. Tạo backup production, tạo migration ledger và chỉ chạy migration idempotent qua pipeline có log.
2. Rotate toàn bộ secret từng lộ qua ảnh/chat trước đây: JWT, Management HMAC/token, Google client secret, R2 secret và Cloudinary secret. Cập nhật song song hai đầu integration, không ghi secret vào Git/tài liệu/log.
3. Kiểm thử Google OAuth bằng một tài khoản test: callback production, cookie/session, account đã provision, trạng thái locked/active và logout.
4. Chốt dữ liệu thật cho **3 khóa CSCA**: `courseSourceId`, tên, trạng thái publish, danh sách lớp, mã lớp, giáo viên chính/phụ, học viên và chính sách refund.
5. Không cho phát sinh enrollment tự do ở bất kỳ khóa CSCA nào; review tất cả khóa để không có khóa trả phí nào thiếu `external_course_id`.
6. Cài migration `018_management_sync_core.sql`:
   - `lms_sync_inbox` lưu event đã nhận, hash, state và correlation ID.
   - bổ sung `source_updated_at`, `source_membership_id`, trạng thái/hiệu lực cho `class_enrollments`.
   - bảng `class_teachers` cho lead/co-teacher, thay vì chỉ một `instructor_id`.
   - ràng buộc source ID unique theo site và audit cho thay đổi projection.
7. Nghiệm thu một flow thật: payment paid → provision → cấp course → vào đúng class; refund → khóa workspace/lịch/tài liệu nhưng giữ lịch sử.

**Done khi:** học viên trả phí không cần thao tác ở LMS vẫn thấy đúng 1–n khóa/lớp; học viên không trả phí không thể xem workspace hay link phòng.

### P1 — Đồng bộ course, lớp, roster và worker tin cậy (4–6 ngày)

1. Thay hai webhook hiện có bằng ingress event versioned; vẫn giữ endpoint cũ trong thời gian transition để không phá InternalManagement.
2. Tách service Railway `csca-lms-worker` dùng cùng Postgres:
   - claim job an toàn bằng `FOR UPDATE SKIP LOCKED`;
   - exponential backoff + jitter;
   - giới hạn retry, chuyển `DEAD_LETTER` và cảnh báo;
   - replay theo event id/correlation id, không xử lý trùng.
3. Bảng điều phối admin hiển thị: event, mapping, thời gian chậm, retry count, lỗi được che dữ liệu nhạy cảm, nút replay có lý do/audit.
4. Thêm trang mapping vận hành: course/class/teacher/roster theo source ID, cảnh báo mapping thiếu trước khi cấp quyền học.
5. Implement reconciliation job hằng ngày: so sánh snapshot Management với LMS, chỉ tạo report trước; sửa tự động chỉ sau khi policy được duyệt.
6. Cập nhật workspace học viên để chỉ liệt kê class có `class_enrollment` active của học viên, không dùng lớp suy diễn từ course access.

**Done khi:** tạo lớp, đổi giáo viên, chuyển lớp, hủy lớp, paid/refund và retry event đều idempotent; dashboard không chỉ đổi trạng thái mà có worker xử lý thật.

### P1 — Chuẩn hóa delivery lớp học cho giáo viên và học viên (5–7 ngày)

1. Thêm `class_content_releases`: giáo viên mở nội dung theo lớp, thời điểm, hạn truy cập và prerequisite; course curriculum chung không bị lẫn với tài nguyên của lớp khác.
2. Hoàn thiện workspace theo thứ tự cố định: **Tổng quan lớp → Bài học → Bài tập & Quiz → Lịch học → Tài liệu → Kết quả**. Mỗi tab luôn mang `courseId + classId`.
3. Assignment:
   - template, draft/publish/schedule, rubric, nhóm/bài cá nhân, due date theo timezone `Asia/Ho_Chi_Minh`;
   - nhiều lần nộp theo policy, version bài nộp và lịch sử regrade;
   - gradebook lớp có filter, bulk export/import và nhận xét riêng tư.
4. Quiz với migration `019_quiz_releases.sql`:
   - `quiz_releases` gắn quiz vào một hoặc nhiều lớp, start/end, time limit, attempt policy, randomization;
   - `quiz_attempts` unique theo release thay vì chỉ `(user, quiz)`;
   - question bank, version đề, review policy, manual grading cho tự luận và audit khi đổi điểm.
5. Lịch/điểm danh:
   - recurring schedule tạo session thật; hủy/đổi link phải phát event thông báo;
   - attendance có bulk action, late/online/excused, import và báo cáo chuyên cần theo lớp.

**Done khi:** giáo viên lớp A không thấy/sửa dữ liệu lớp B; một quiz có thể giao riêng cho A và B; học viên chỉ thấy đúng nội dung, lịch, file và điểm của lớp mình.

### P1 — Tài liệu, file, video: R2 là kho riêng tư; Cloudinary là media tối ưu (3–4 ngày)

1. Quy ước sử dụng:
   - **R2 private:** video học, PDF/DOCX/XLSX/PPTX, audio HSKK, file bài nộp; chỉ qua signed URL ngắn hạn.
   - **Cloudinary:** thumbnail course, avatar, banner và ảnh minh họa cần resize/optimization; không dùng làm nguồn quyền truy cập học.
2. Test thật PUT/HEAD/GET signed URL trên production cho video, file giáo viên và bài nộp học viên; kiểm tra CORS bucket, TTL, MIME/size và tải lại URL hết hạn.
3. Bổ sung virus scanning/quarantine hoặc quy trình duyệt trước `ready`; lưu checksum, content type thực tế, version, lifecycle/retention và trạng thái xóa mềm.
4. Không nhận URL bất kỳ từ browser. Mọi object phải có asset record do server tạo và kiểm tra quyền trước download.
5. Theo dõi upload failure/R2 4xx/5xx, dung lượng theo course/class và job cleanup object mồ côi.

**Done khi:** học viên ngoài lớp không tải được tài liệu/bài nộp; giáo viên thấy tiến trình upload/lỗi rõ ràng; object chưa confirm không xuất hiện trong LMS.

### P1 — Notification và communication thật (3–4 ngày)

1. Xóa `INITIAL_NOTIFICATIONS` và broadcast chỉ chạy local state; route notification dùng API database thật.
2. Thêm `notification_events`/outbox và API phát thông báo có quyền theo site/course/class/recipient, có deep link, dedupe key, priority và thời hạn.
3. Trigger chuẩn: giao/sửa/hủy bài tập, chấm/regrade, quiz publish, thay đổi lịch/link phòng, attendance, entitlement granted/revoked, hệ thống.
4. In-app là bắt buộc; email/push là channel bổ sung sau khi có consent, preference, retry/delivery log và unsubscribe policy.
5. Giáo viên chỉ broadcast tới lớp mình; admin có broadcast site; không cho browser tự tạo thông báo giả thành công.

**Done khi:** một thay đổi lịch hoặc điểm tạo đúng một notification cho đúng recipient và click đi tới đúng lớp/tác vụ.

### P2 — Admin tổng và mô hình nhiều website (5–7 ngày)

1. Không dùng `admin/creator/user` toàn cục như mô hình cuối. Thêm:
   - `lms_sites` (CSCA LMS và các web sau này);
   - `site_memberships` (user, site, role, status, source);
   - `site_role_permissions` và scope `platform/site/course/class/own-data`.
2. Quy ước role: `platform_admin`, `site_admin`, `academic_manager`, `teacher`, `teaching_assistant`, `student`, `support`. Role Management được map sang membership; không cấp toàn bộ quyền chỉ vì một user là giáo viên ở website khác.
3. Admin Console mở rộng thành: mapping health, roster/entitlement explorer, user access timeline, permission matrix, job dead-letter, storage usage, content publish, audit log và export report.
4. Mọi thao tác can thiệp dữ liệu phải có reason, actor, before/after state, correlation ID; action nguy hiểm cần confirm và nguyên tắc không xóa history.
5. Không làm impersonation mặc định. Nếu sau này cần support login-as-student, phải có approval, banner, time limit và audit riêng.

**Done khi:** cùng một user có thể là giáo viên ở CSCA và học viên/không có quyền ở web khác mà dữ liệu/quyền không rò chéo.

### P2 — Chất lượng, an ninh và vận hành (song song mọi phase)

1. CI bắt buộc: lint, build, migration test trên DB sạch + DB upgrade, API integration test, browser E2E 4 role và `git diff --check`.
2. E2E production/staging: OAuth, signed Management event, paid, refund, course/class transfer, upload, assignment/grade, quiz release, attendance, notification và admin permission.
3. Security: rate limiting dùng shared store khi scale, CSP/XSS review, CSRF/cookie policy, secret rotation runbook, least-privilege R2 token, audit retention và backup restore drill.
4. Observability: health/readiness, structured log có correlation ID, metrics worker/job/R2/OAuth/database, alert khi dead-letter > 0 hoặc sync lag vượt SLA.
5. Staging tách production, dữ liệu test không phải dữ liệu học viên thật; release checklist có backup và rollback migration cụ thể.

---

## 5. Thứ tự migration đề xuất

| Migration | Mục đích | Điều kiện rollout |
|---|---|---|
| `018_management_sync_core.sql` | Inbox, source version, roster provenance, nhiều giáo viên/lớp | Deploy worker và contract event cùng ngày |
| `019_quiz_releases.sql` | Quiz theo lớp, policy attempt, grade/review | Migrate quiz cũ sang một release mặc định có kiểm thử |
| `020_notifications_delivery.sql` | Event/outbox, recipient scope, delivery/preference | Deploy sender worker trước khi bật email/push |
| `021_learning_asset_lifecycle.sql` | checksum, scan/quarantine, version, soft delete/retention | Xác minh bucket lifecycle và quota |
| `022_multi_site_rbac.sql` | Site registry, membership, permission theo site | Chạy sau khi CSCA pilot ổn định |

Mỗi migration phải có: mô tả forward-only, kiểm tra precondition, index cần thiết, backfill theo batch, métric trước/sau, kế hoạch rollback ứng dụng và backup đã xác minh. Không xóa bảng hay data học tập trong migration production.

---

## 6. Dữ liệu/quyết định cần từ vận hành trước khi chạy pilot

1. Danh sách ba khóa CSCA thật: `courseSourceId`, tên hiển thị, trạng thái, thumbnail và người phụ trách nội dung.
2. Danh sách lớp thật: `classSourceId`, course tương ứng, timezone, ngày bắt đầu/kết thúc, giáo viên chính/phụ, Meet/Zoom policy.
3. Danh sách học viên pilot và external student ID/email; xác nhận ai đã thanh toán, ai đang pending, ai được miễn phí.
4. Chính sách rõ cho refund, bảo lưu, chuyển lớp, đổi khóa, học thử, hết hạn và học viên bị khóa tài khoản.
5. Một tài khoản Google test và một học viên test không phải dữ liệu nhạy cảm để test OAuth + entitlement trên production/staging.
6. Xác nhận R2 bucket policy/CORS/lifecycle và Cloudinary folder/quota; không gửi key qua chat hay commit vào repository.

---

## 7. Mốc nghiệm thu tổng thể

### Milestone A — Pilot dữ liệu thật

- Ba khóa và tối thiểu một lớp/khóa được map từ InternalManagement.
- Một học viên paid, pending và refunded cho kết quả quyền khác nhau đúng policy.
- Không còn SQL thủ công để thêm course/class/roster/access.

### Milestone B — Vận hành lớp hoàn chỉnh

- Giáo viên tạo lịch, session, file, assignment, quiz release và điểm danh trong lớp của mình.
- Học viên chọn course rồi class, chỉ thấy đúng workspace; nộp bài, làm quiz, nhận điểm/thông báo.
- Admin xem được mapping, queue, audit và báo cáo lớp.

### Milestone C — Sẵn sàng mở rộng nhiều website

- Site registry + membership/role theo site đã kiểm thử cross-site isolation.
- Worker, alert, backup/restore, CI/E2E và runbook có bằng chứng chạy pass.

---

## 8. Việc nên làm ngay tiếp theo

1. Chốt bảng mapping dữ liệu thật của ba khóa/lớp và chính sách refund/chuyển lớp.
2. Làm `018_management_sync_core.sql` cùng contract event và worker trước khi thêm tính năng UI mới.
3. Chạy pilot với dữ liệu thật, chỉ sau khi Milestone A pass mới mở giáo viên giao bài/file/quiz đại trà.

Điều này giữ đúng định hướng: **InternalManagement quyết định ai thuộc web nào, khóa nào, lớp nào và có quyền học hay không; LMS chỉ hiển thị và vận hành trải nghiệm học đúng theo quyền đó.**
