# InternalManagement → CSCA LMS Event Contract

LMS chỉ nhận event server-to-server. Browser, giáo viên và học viên không được gọi API này.

## Endpoint

```text
POST /api/integrations/v1/events
```

LMS trả `202 Accepted` khi event được ghi vào inbox và đã tạo job xử lý. Đây chưa phải xác nhận projection đã hoàn thành. InternalManagement không gửi lại event chỉ vì nhận `202`; event sẽ được worker LMS retry và theo dõi qua dashboard admin.

## Header bắt buộc

```text
Authorization: Bearer <MANAGEMENT_INTEGRATION_SERVICE_TOKEN>
X-Integration-Key: <MANAGEMENT_INTEGRATION_KEY>
X-Event-Timestamp: 2026-09-21T08:00:00.000Z
X-Correlation-ID: correlation-id-duy-nhat
Idempotency-Key: idempotency-key-duy-nhat
X-Signature: sha256=<HMAC_SHA256(timestamp + "." + raw-request-body)>
Content-Type: application/json
```

- Timestamp tối đa 300 giây, hoặc theo `MANAGEMENT_INTEGRATION_MAX_AGE_SECONDS` của LMS.
- HMAC phải tính trên **raw JSON body** đúng bytes gửi đi, không phải JSON đã parse/format lại.
- `eventId` và `Idempotency-Key` phải ổn định qua mọi lần gửi lại cùng một event.
- Không ghi bất kỳ secret nào vào source code, log hay ảnh chụp màn hình.

## Envelope dùng chung

```json
{
  "eventId": "evt_01J8K8D5R3...",
  "eventType": "class.membership.changed",
  "occurredAt": "2026-09-21T08:00:00.000Z",
  "source": "internal-management",
  "payload": {
    "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
  }
}
```

## Trình tự event bắt buộc

1. `teacher.upserted`
2. `course.upserted`
3. `class.upserted`
4. `class.teacher.assigned`
5. `student.provisioned`
6. `class.membership.changed`
7. `entitlement.changed`

LMS chịu được event đến muộn bằng retry; tuy nhiên InternalManagement vẫn nên phát theo thứ tự trên. `payment.refunded` có thể phát bất cứ lúc nào sau entitlement và luôn thu quyền course tương ứng.

## Payload theo event

### `teacher.upserted`

```json
{
  "teacherSourceId": "teacher-anh-01",
  "fullName": "Lê Đức Anh",
  "email": "teacher@example.com",
  "accountStatus": "active",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

Tạo/link user LMS với role `creator`; không hạ role `admin` hiện hữu.

### `course.upserted`

```json
{
  "courseSourceId": "csca-math-2026",
  "title": "CSCA Toán nền tảng",
  "description": "Khóa luyện CSCA Toán",
  "category": "CSCA",
  "level": "beginner",
  "teacherSourceId": "teacher-anh-01",
  "isPublished": true,
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

LMS tự map vào `courses.external_course_id`, nhưng không tự tạo lesson/curriculum giả.

### `class.upserted`

```json
{
  "classSourceId": "csca-math-k01",
  "courseSourceId": "csca-math-2026",
  "title": "CSCA Toán K01",
  "description": "Lớp tối thứ Ba, Năm",
  "maxStudents": 30,
  "classType": "LIVE",
  "sourceClassSourceId": null,
  "status": "active",
  "leadTeacherSourceId": "teacher-anh-01",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

`classType` nhận một trong hai giá trị:

- `LIVE`: lớp chính có lịch học, link phòng học và điểm danh.
- `RECORDING`: lớp bán qua hình thức xem bản ghi. InternalManagement bắt buộc gửi
  `sourceClassSourceId` trỏ tới `classSourceId` của lớp `LIVE` làm nguồn.

Lớp `RECORDING` là một alias thương mại/quản trị, không tạo bản sao nội dung trong
LMS. Mọi buổi học, tài liệu, từ vựng, lý thuyết/công thức, bản ghi, bài tập và quiz
đều dùng trực tiếp lớp `LIVE` nguồn. InternalManagement phải ngăn chọn một lớp
`RECORDING` khác làm nguồn và không được tạo vòng ánh xạ. Lớp nguồn có thể đang
`active` hoặc đã `completed`; học viên Record vẫn xem nội dung và bản ghi sau khi
lớp nguồn kết thúc, nhưng không được mở lịch, điểm danh hoặc phòng học trực tuyến.
Nếu đổi lớp nguồn của alias, LMS chuyển các ghi danh Record sang nguồn mới trong
cùng giao dịch và giữ nguyên quyền Live mạnh hơn nếu học viên đã có sẵn.

`RECORDING` vẫn là một sản phẩm/lớp có thu phí bình thường. InternalManagement
phải ghi nhận doanh thu, công nợ, thanh toán, hoàn tiền và trạng thái học phí giống
như lớp `LIVE`. Việc ánh xạ nội dung không đồng nghĩa với dùng chung giao dịch và
không được tạo đường tắt cấp quyền miễn phí. Học viên Record chỉ được kích hoạt sau
khi producer phát đầy đủ `student.provisioned`, `class.membership.changed` và
`entitlement.changed` hợp lệ theo luồng thanh toán hiện hành.

Ví dụ lớp Record ánh xạ tới lớp chính:

```json
{
  "classSourceId": "csca-math-k01-record",
  "courseSourceId": "csca-math-2026",
  "title": "CSCA Toán K01 - Học qua bản ghi",
  "classType": "RECORDING",
  "sourceClassSourceId": "csca-math-k01",
  "status": "active",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

### `class.teacher.assigned`

```json
{
  "classSourceId": "csca-math-k01",
  "teacherSourceId": "teacher-anh-01",
  "teachingRole": "lead",
  "status": "active",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

`teachingRole`: `lead`, `co_teacher`, `assistant`. Một lớp có thể có nhiều giáo viên.

### `student.provisioned`

```json
{
  "studentSourceId": "student-1001",
  "fullName": "Nguyễn Văn A",
  "email": "student@example.com",
  "phone": "0900000000",
  "accountStatus": "pending_payment",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

### `class.membership.changed`

```json
{
  "membershipSourceId": "membership-5001",
  "classSourceId": "csca-math-k01",
  "studentSourceId": "student-1001",
  "learningMode": "LIVE",
  "status": "active",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

`status` có thể là `active`, `suspended`, `revoked`. LMS không xóa roster history khi học viên chuyển/hủy lớp.

`learningMode` nhận `LIVE` hoặc `RECORDING`:

- Membership gửi tới lớp `LIVE` thường dùng `LIVE`.
- Membership gửi tới alias lớp Record dùng `RECORDING`; LMS resolve alias về lớp
  `LIVE` nguồn và lưu học viên trong roster của lớp chính với nhãn Record.
- Payload cũ không có `learningMode` mặc định là `LIVE` để giữ tương thích luồng cũ,
  bao gồm tài khoản kiểm thử `khlyp06`.
- `learningMode: "RECORDING"` không thay thế `entitlement.changed`. Nếu chưa có
  entitlement đang hoạt động cho khóa học nguồn, LMS vẫn từ chối quyền học.
- `khlyp06` là tài khoản kiểm thử nội bộ theo cơ chế legacy hiện có; ngoại lệ này
  không được áp dụng cho học viên Record thật hoặc dùng để bỏ qua công nợ/thanh toán.

Ví dụ ghi danh học qua bản ghi:

```json
{
  "membershipSourceId": "membership-5002",
  "classSourceId": "csca-math-k01-record",
  "studentSourceId": "student-1002",
  "learningMode": "RECORDING",
  "status": "active",
  "sourceUpdatedAt": "2026-09-21T08:05:00.000Z"
}
```

InternalManagement UI cần hiển thị trường “Loại lớp” khi tạo lớp. Khi chọn
“Lớp xem bản ghi”, trường “Ánh xạ từ lớp chính” là bắt buộc và chỉ liệt kê lớp
`LIVE` cùng khóa học. Khi xếp học viên vào alias này, producer tự gửi
`learningMode: "RECORDING"`; người vận hành không phải chọn lại lần hai.

### `entitlement.changed`

```json
{
  "studentSourceId": "student-1001",
  "courseSourceIds": ["csca-math-2026"],
  "accessStatus": "active",
  "reason": "payment_paid",
  "sourcePaymentId": "payment-9001",
  "validFrom": "2026-09-21T08:00:00.000Z",
  "validUntil": null,
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

### `payment.refunded`

```json
{
  "studentSourceId": "student-1001",
  "courseSourceIds": ["csca-math-2026"],
  "reason": "payment_refunded",
  "sourcePaymentId": "payment-9001",
  "validFrom": "2026-09-21T08:00:00.000Z",
  "sourceUpdatedAt": "2026-09-21T08:00:00.000Z"
}
```

LMS chuyển quyền course sang `revoked`; bài nộp, điểm, attendance và audit history vẫn được giữ.

## Response và vận hành lỗi

| HTTP | Ý nghĩa | Hành động của Management |
|---|---|---|
| `202` | Event mới đã vào inbox | Không gửi lại; theo dõi completion qua dashboard LMS |
| `200` | Event trùng hợp lệ | Không cần làm gì |
| `401` | Chữ ký/header/timestamp sai | Dừng gửi, kiểm tra cấu hình secret/clock |
| `409` | Event hoặc idempotency key bị dùng cho body khác | Không retry tự động; cần điều tra outbox |
| `422` | Envelope không hợp lệ | Sửa payload producer rồi phát event mới |
| `500` | LMS chưa ghi event | Outbox retry với cùng event ID/key |

Worker retry dependency tạm thời (ví dụ roster đến trước course), theo exponential backoff. Payload sai sẽ đi `DEAD_LETTER` và xuất hiện trong Admin Console để xử lý có audit.

## Triển khai worker LMS

Sau khi chạy migration `018_management_sync_core.sql`, triển khai **hai process** từ cùng source LMS:

1. Web service hiện tại chạy `npm start` để nhận API/event.
2. Worker service riêng chạy `npm run worker` để claim và xử lý `lms_sync_jobs`.

Worker dùng chung `DATABASE_URL` và các biến `MANAGEMENT_INTEGRATION_*` cần thiết với web service, không cần public domain. Không deploy web/worker trước migration vì code mới cần các bảng và cột projection từ migration 018. Để kiểm thử pilot không chạy vòng lặp, có thể đặt `LMS_SYNC_WORKER_ONCE=true`; production để biến này rỗng hoặc `false`.
