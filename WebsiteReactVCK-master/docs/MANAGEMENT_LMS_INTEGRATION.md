# InternalManagement → CSCA Course LMS

> Tài liệu này mô tả contract kỹ thuật riêng cho CSCA Course. Quyết định kiến
> trúc tổng về InternalManagement là hệ thống điều phối nhiều website nằm tại
> [INTERNAL_MANAGEMENT_MASTER_ORCHESTRATION.md](INTERNAL_MANAGEMENT_MASTER_ORCHESTRATION.md).

## Mục đích

`InternalManagement` là nguồn dữ liệu chính cho học viên, lớp, học phí và
quyết định cấp quyền. CSCA Course chỉ giữ bản chiếu LMS: định danh tài khoản,
mapping khóa học và grant theo học viên/khóa học. Hai hệ thống dùng database
riêng; LMS không truy cập database của Management.

## Triển khai an toàn

1. Chạy migration theo thứ tự đến `015_management_lms_integration.sql` trên
   `csca_course_db`. `run_sql.js` đã đưa migration này vào danh sách, nhưng
   không có migration nào được tự chạy khi khởi động server.
2. Mapping từng khóa học đã bán từ Management vào LMS. `external_course_id`
   phải đúng `CourseSourceId`/`ExternalCourseId` đang lưu tại Management và
   không được trùng không phân biệt hoa-thường.

   ```sql
   UPDATE courses
   SET external_course_id = '<management-course-source-id>', is_free = FALSE
   WHERE id = <lms-course-id>;
   ```

   Một khóa đã có `external_course_id` không thể tự đăng ký qua
   `POST /api/enrollments`; chỉ endpoint tích hợp mới thay đổi quyền đó.
3. Đặt cùng ba secret ở hai bên, dùng secret manager ở môi trường production.

   ```text
   LMS
   MANAGEMENT_INTEGRATION_SERVICE_TOKEN
   MANAGEMENT_INTEGRATION_KEY
   MANAGEMENT_INTEGRATION_HMAC_SECRET
   MANAGEMENT_INTEGRATION_MAX_AGE_SECONDS=300

   InternalManagement
   Integrations__CscaCourseLms__BaseUrl=https://<lms-host>
   Integrations__CscaCourseLms__ServiceToken=<same service token>
   Integrations__CscaCourseLms__IntegrationKey=<same integration key>
   Integrations__CscaCourseLms__HmacSecret=<same HMAC secret>
   ```
4. Kiểm tra mapping khóa học và endpoint LMS trước, rồi mới bật
   `Integrations__CscaCourseLms__OutboxWorker__Enabled=true` ở Management.
   Worker vẫn tắt mặc định.

## API máy - máy

Mọi request cần các header sau:

```text
Authorization: Bearer <service token>
X-Integration-Key: <integration key>
X-Event-Timestamp: <UTC ISO-8601 timestamp>
X-Signature: sha256=<HMAC-SHA256(timestamp + "." + raw-json-body)>
X-Correlation-ID: <correlation id>
Idempotency-Key: <outbox id>
```

Timestamp có hiệu lực tối đa 5 phút mặc định. HMAC được tính trên raw JSON,
không phải JSON đã parse/format lại. `Idempotency-Key` được lưu bền; retry cùng
payload nhận lại response cũ và không cấp quyền hai lần. Một request cũ hơn
`sourceUpdatedAt`/`validFrom` đã lưu không thể ghi đè quyết định mới hơn.

### Provision tài khoản

```text
POST /api/integrations/v1/students/provision
```

Payload nhận từ Management:

```json
{
  "externalStudentId": "<ClassStudentId GUID không dấu gạch>",
  "externalPartyId": "<PartyId hoặc null>",
  "fullName": "Nguyễn Văn A",
  "email": "student@example.com",
  "phone": "0900000000",
  "accountStatus": "PendingPayment | Active | Suspended | Revoked",
  "paymentStatus": "Pending | Partial | Paid | Refunded | Cancelled | Failed",
  "courseSourceIds": ["<management course id>"],
  "classSourceId": "<ClassId>",
  "sourceUpdatedAt": "2026-09-16T00:00:00.000Z"
}
```

LMS tạo hoặc liên kết `users.external_student_id`, lưu hồ sơ tên/điện thoại
được Management quản lý, và trả về:

```json
{
  "alreadyExists": false,
  "lmsUserId": 123,
  "provisionStatus": "PendingPayment",
  "correlationId": "..."
}
```

Provision không tự cấp nội dung học. Tài khoản do Management tạo được khóa khi
`PendingPayment`, `Suspended` hoặc `Revoked`. Khi đã `Active`, học viên có thể
liên kết Google bằng đúng email đã provision; local password reset chỉ nên mở
khi dịch vụ gửi email thật được cấu hình.

### Cấp hoặc thu hồi quyền học

```text
PATCH /api/integrations/v1/students/:externalStudentId/access
```

```json
{
  "accessStatus": "Active | Suspended | Revoked",
  "reason": "PaymentPaid",
  "sourcePaymentId": "<payment id hoặc null>",
  "validFrom": "2026-09-16T00:00:00.000Z",
  "validUntil": null,
  "courseSourceIds": ["<management course id>"]
}
```

Request cập nhật cùng lúc `lms_access_grants` và `enrollments` trong một
transaction:

- `Active` → enrollment `active`, học viên vào học được.
- `Suspended`/`Revoked` hoặc grant hết hạn → enrollment không còn `active`.
- Không tìm thấy mapping khóa học → `422 COURSE_MAPPING_MISSING`, không áp
  dụng một phần request.
- Chưa provision học viên → `409 STUDENT_NOT_PROVISIONED`.

Các route video, progress, bài tập/quiz và certificate hiện đều kiểm tra
`enrollments.status = 'active'`; vì vậy quyền được bắt buộc ở backend. Luồng
live class có roster `class_enrollments` riêng và chưa tự suy ra roster từ
grant khóa học — cần mapping lớp học cụ thể nếu muốn tự động cấp Meet/Zoom.

## Bảo trì

- Không nhập secret vào `backend/.env.example`, source code hay payload outbox.
- Không bật worker trước khi có `external_course_id` cho mọi khóa học đang bán.
- Theo dõi `management_integration_requests` theo `correlation_id` và
  `lms_access_grants` theo `source_updated_at` khi đối soát sự cố.
- Email kích hoạt/password reset production vẫn cần provider gửi email riêng;
  phần tích hợp này không log mã xác thực hoặc password vào production.
