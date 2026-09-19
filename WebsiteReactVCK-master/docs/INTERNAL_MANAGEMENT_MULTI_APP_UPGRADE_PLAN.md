# Kế hoạch nâng cấp InternalManagement thành hệ thống tổng đa website

> **Mục tiêu:** InternalManagement quản lý tập trung danh tính, user, role, giáo viên, học viên, khóa học, lớp học, ghi danh, học phí và quyền truy cập; các website con như CSCA Course LMS chỉ nhận dữ liệu/phân quyền cần thiết để vận hành nghiệp vụ chuyên môn.
>
> **Tài liệu kiến trúc gốc:** [INTERNAL_MANAGEMENT_MASTER_ORCHESTRATION.md](INTERNAL_MANAGEMENT_MASTER_ORCHESTRATION.md)

---

## 1. Kết quả cần đạt

Sau khi hoàn thành, việc thêm một website mới không cần sao chép logic user, role, học phí hay lớp học. Quy trình chuẩn sẽ là:

```text
Đăng ký website trong InternalManagement
        → tạo/map khóa & lớp
        → gán giáo viên/học viên theo website
        → thanh toán thay đổi entitlement
        → event đồng bộ an toàn sang website con
        → website con thực thi quyền và báo dữ liệu nghiệp vụ trở lại
```

Ví dụ CSCA Course LMS:

```text
InternalManagement tạo Khóa HSK 4 + Lớp HSK4-K01
        → map tới LMS course HSK 4
        → phân công giáo viên A
        → ghi danh học viên B
        → B đóng đủ học phí
        → LMS nhận entitlement Active
        → B vào được đúng HSK 4; giáo viên A chỉ thấy đúng lớp được giao
```

## 2. Hiện trạng và khoảng cách

| Hạng mục | Trạng thái | Việc còn thiếu |
|---|---|---|
| CSCA LMS có database riêng | Đã có | Không trộn database với Management |
| Integration CSCA-specific | Đã có provisioning, course link, access grant, outbox, HMAC | Cần map dữ liệu thật và vận hành worker sau kiểm thử |
| Quy tắc đóng tiền mới cấp quyền | Đã có ở luồng CSCA | Cần chuẩn hóa thành entitlement dùng chung |
| InternalManagement là trung tâm cho nhiều web | Chưa hoàn chỉnh | Chưa có registry website, membership/role scope dùng chung, mapping generic |
| Tài khoản/role giáo viên | Mới có logic theo CSCA | Cần application membership và role theo website/khóa/lớp |
| Báo cáo học tập quay về hệ thống tổng | Chưa chuẩn hóa | Cần event/contract cho tiến độ, điểm, điểm danh, chứng chỉ |
| Vận hành production | Có deployment CSCA | Cần monitor, đối soát, backup và quy trình sự cố |

## 3. Nguyên tắc triển khai

1. **Không đổi database trực tiếp giữa các hệ thống.** Chỉ giao tiếp qua API/event có xác thực.
2. **Tăng dần, không thay thế đột ngột.** CSCA connector hiện tại tiếp tục chạy trong khi mô hình generic được xây.
3. **Mọi quyền theo scope.** Role phải kèm `application_code`, và khi cần kèm `course_id`/`class_id`.
4. **Không dùng email làm định danh đồng bộ.** `party_id` là khóa danh tính chuẩn; email là dữ liệu liên hệ/đăng nhập.
5. **Thanh toán không đồng nghĩa với role.** Payment tạo hoặc đổi entitlement; entitlement mới mở/thu nội dung.
6. **Không bật tự động khi chưa map.** Website con chỉ được nhận event cấp quyền khi course/class map đã `Active`.

## 4. Roadmap triển khai

Mỗi phase có thể làm trong một sprint. Chỉ chuyển phase khi tiêu chí nghiệm thu của phase trước đạt.

### Phase 0 — Chốt chính sách và làm sạch production

**Mục tiêu:** Khóa cách hiểu thống nhất trước khi thêm module mới.

**Việc thực hiện**

- Phê duyệt tài liệu kiến trúc tổng và chọn mã website ban đầu: `CSCA_COURSE`.
- Lập danh sách 3 khóa Management hiện có, lớp mở bán và khóa nội dung LMS tương ứng.
- Hoàn thiện Google OAuth production để tài khoản học viên được kích hoạt bằng đúng email đã provision.
- Rotate JWT/HMAC/service token từng bị hiển thị trong ảnh chụp cấu hình; đổi đồng thời hai đầu connector để không gián đoạn đồng bộ.
- Xác định rule tài chính: “đủ học phí”, cho phép trả góp hay không, gia hạn, hoàn tiền, chuyển lớp và quyền học sau hoàn tiền.
- Phân công một người chịu trách nhiệm đối soát payment/entitlement và một người chịu trách nhiệm nội dung LMS.

**Đầu ra**

- Bảng mapping khóa/lớp được duyệt.
- Danh sách role chuẩn và ma trận quyền ban đầu.
- Tài khoản quản trị LMS đầu tiên và tài khoản học viên test.
- Bộ secret production đã được rotate, lưu trong Railway secret manager, không lưu trong chat/source.

**Nghiệm thu**

- Một học viên test đăng nhập Google được vào đúng website LMS.
- Không còn secret thật trong tài liệu, ảnh chụp, source control hoặc file `.env.example`.

---

### Phase 1 — Registry website/app và mô hình membership chung

**Mục tiêu:** Hệ thống tổng biết rõ những website nào tồn tại và một người thuộc website nào.

**Module mới trong InternalManagement**

| Bảng/khái niệm | Trường chính | Mục đích |
|---|---|---|
| `applications` | `code`, `name`, `base_url`, `status`, `owner` | Đăng ký mỗi website/app, ví dụ `CSCA_COURSE` |
| `application_memberships` | `party_id`, `application_id`, `status` | Một Party có phải thành viên của web đó không |
| `application_role_assignments` | `membership_id`, `role`, `scope_type`, `scope_id` | Role theo website, khóa hoặc lớp |
| `external_identity_links` | `party_id`, `application_id`, `external_user_id` | Map định danh tổng với ID ở website con |
| `application_audit_logs` | actor, application, action, before/after | Truy vết mọi quyền được cấp/thu |

**API cần có**

- `GET/POST /api/applications`
- `GET/PUT /api/applications/{id}/memberships`
- `POST /api/applications/{id}/memberships/{membershipId}/roles`
- `DELETE /api/applications/{id}/memberships/{membershipId}/roles/{roleId}`
- `GET /api/parties/{partyId}/application-access`

**Quy tắc dữ liệu**

- `application_code` duy nhất, không đổi sau khi phát hành.
- Một `Party` có một membership cho mỗi website; có thể có nhiều role/scope trong membership đó.
- Không xóa cứng assignment có lịch sử; chuyển trạng thái `Revoked` và ghi audit.

**Nghiệm thu**

- Có thể xem một người thuộc web nào và giữ role gì, không cần mở từng website con.
- Thu quyền tại Management tạo event chính xác cho website đích.

---

### Phase 2 — Chuẩn hóa khóa học, lớp học và mapping đa website

**Mục tiêu:** InternalManagement tạo khóa/lớp chuẩn một lần, sau đó map đúng sang từng web.

**Module mới/mở rộng**

| Bảng/khái niệm | Mục đích |
|---|---|
| `course_offerings` | Khóa/sản phẩm đào tạo chuẩn, giữ `course_source_id` bất biến |
| `classes` / `cohorts` | Lớp mở theo kỳ, lịch, học phí, sĩ số, trạng thái |
| `teacher_assignments` | Giáo viên được giao vào course hoặc class |
| `student_enrollments` | Học viên thuộc lớp/khóa nào; trạng thái ghi danh |
| `application_course_maps` | Một khóa Management map tới khóa ngoài của một website |
| `application_class_maps` | Map lớp/roster/lịch sang website cần quản lý lớp riêng |

**Quy tắc mapping**

- Mỗi mapping mang `company_id`, `business_unit_id`, `application_id`, `course_id` và external ID của website con.
- V1 CSCA: `CourseSourceId` của Management phải bằng `external_course_id` của LMS.
- Bundle nhiều khóa LMS phải là nhiều dòng mapping; không nhét danh sách ID vào một field text.
- Mapping chỉ cấp quyền khi có trạng thái `Active`, đã được người vận hành xác nhận.

**Nghiệm thu**

- Quản trị tạo khóa, lớp, học phí và giáo viên tại Management.
- Không thể map nhầm khóa của `CSCA_COURSE` sang website khác hoặc map trùng external ID.
- Có màn hình hiển thị khóa/lớp nào chưa map hoặc map lỗi.

---

### Phase 3 — Identity, đăng nhập và role projection

**Mục tiêu:** Một người dùng có danh tính trung tâm nhưng đăng nhập/nhận quyền đúng ở từng web.

**Việc thực hiện**

- Chuẩn hóa `Party` làm master identity, quy tắc hợp nhất trùng email/số điện thoại và luồng đổi email.
- Xây `external_identity_links` làm identity map chung; không tạo foreign key xuyên database.
- Định nghĩa payload `UserProvisioned` với `party_id`, thông tin hiển thị, email, application membership và role scopes.
- Thiết lập cơ chế activation theo từng web: Google OAuth trước cho CSCA Course; sau này có thể thêm email provider/SSO.
- Cho phép một người có cả role `Teacher` và `Student`, nhưng permission tính theo scope chứ không tự gộp quyền admin.

**Chuyển đổi CSCA hiện tại**

- Giữ `externalStudentId = CscaClassStudentId` để tương thích connector cũ.
- Bổ sung `party_id` vào payload/event mới và table link.
- Backfill mapping bằng dữ liệu liên hệ đã được duyệt; mọi trường hợp trùng email phải vào manual review.
- Khi đối soát ổn định mới đổi consumer sang `party_id + application_membership_id`.

**Nghiệm thu**

- Cùng một người đổi email vẫn không mất entitlement.
- Giáo viên không nhìn thấy lớp không được phân công.
- Học viên ở web A không thể dùng session/role để truy cập web B.

---

### Phase 4 — Entitlement engine: ghi danh, học phí và quyền truy cập

**Mục tiêu:** Tách rõ “đóng tiền”, “ghi danh” và “được quyền dùng nội dung”.

**Module mới**

| Bảng/khái niệm | Mục đích |
|---|---|
| `entitlements` | Quyền được cấp cho Party trên app/course/class |
| `entitlement_sources` | Liên kết entitlement tới enrollment, invoice/payment, ưu đãi hoặc cấp thủ công |
| `entitlement_history` | Lịch sử Active/Suspended/Revoked và lý do |
| `payment_policy_versions` | Version hóa điều kiện “đủ tiền” theo từng sản phẩm/lớp |

**State machine chuẩn**

```text
Enrollment Draft → PendingPayment → Active → Suspended → Revoked / Completed
                          |              |
                    Payment Partial   Refund / cancellation
```

**Rule CSCA mặc định**

- `Active` khi `payment_status = Paid` và `paid_amount >= tuition_fee`.
- `Partial` tạo `PendingPayment`, không mở bài học trả phí.
- `Refunded`, `Cancelled`, `Failed` tạo `Revoked`.
- Mọi ngoại lệ cấp thủ công phải có reason, người duyệt, hạn quyền và audit log.

**Nghiệm thu**

- Chuyển payment từ Paid sang Refunded thu quyền LMS trong SLA định nghĩa trước.
- Retry event không sinh hai enrollment/grant.
- Kế toán xem được payment nào đã tạo entitlement nào.

---

### Phase 5 — Integration Hub dùng chung cho nhiều website

**Mục tiêu:** Không viết lại một connector hoàn toàn mới cho mỗi website.

**Việc thực hiện**

- Tạo `integration_connections`: application, base URL, auth type, secret reference, schema version, enabled state.
- Chuẩn hóa event envelope:

```json
{
  "eventId": "uuid",
  "eventType": "EntitlementChanged",
  "schemaVersion": 1,
  "occurredAt": "UTC ISO-8601",
  "companyId": "uuid",
  "applicationCode": "CSCA_COURSE",
  "correlationId": "uuid",
  "idempotencyKey": "stable-key",
  "payload": {}
}
```

- Giữ outbox, retry, dead-letter, exponential backoff, correlation ID và HMAC.
- Cài adapter riêng cho từng website: `CscaCourseLmsConnector`, sau này là `MoliStudioConnector`, ...
- Tạo endpoint nhận báo cáo từ website con, xác thực hai chiều và giới hạn scope event.
- Xây cơ chế replay event có chọn lọc theo entity/time window; không cho replay bừa toàn bộ lịch sử.

**Nghiệm thu**

- Một event được gửi tối đa một lần về mặt hiệu lực nghiệp vụ dù network retry nhiều lần.
- Tắt connector một website không ảnh hưởng connector website khác.
- Vận hành có thể xem, retry và xử lý dead-letter mà không cần vào database.

---

### Phase 6 — Hoàn thiện CSCA Course LMS theo contract mới

**Mục tiêu:** CSCA Course trở thành website con mẫu đầu tiên.

**Việc thực hiện phía LMS**

- Nhận role projection cho `Student`, `Teacher`, `Admin` theo application/course/class scope.
- Khóa route giáo viên, roster, điểm danh, bài tập và tạo nội dung theo scope từ Management.
- Chỉ nhận entitlement cho course/class đã map; không cho self-enroll vào khóa managed/paid.
- Bổ sung event ngược: `LearningProgressReported`, `AssessmentGraded`, `AttendanceRecorded`, `CertificateIssued`.
- Hiển thị lý do rõ cho học viên: chưa đóng đủ, bị tạm dừng, hết hạn, hoặc khóa chưa mở.
- Bổ sung trang admin LMS chỉ để quản lý curriculum; không quản lý học phí/role nguồn chuẩn.

**Nghiệm thu end-to-end**

1. Tạo khóa + lớp tại Management.
2. Map tới LMS và phân công giáo viên.
3. Thêm học viên chưa thanh toán: tài khoản tồn tại nhưng không vào được nội dung.
4. Xác nhận thanh toán: mở đúng khóa/lớp.
5. Hoàn tiền: thu quyền.
6. Giáo viên nhập điểm/điểm danh: Management nhận được event báo cáo.

---

### Phase 7 — Dashboard vận hành, đối soát và bảo mật

**Mục tiêu:** Có thể điều hành hệ thống mà không phải SSH hoặc chạy SQL thủ công.

**Dashboard tại InternalManagement**

- Tổng quan theo website: số user, giáo viên, học viên active, entitlement active, map lỗi, event lỗi.
- Màn hình “Một người ở mọi web”: party, membership, role, lớp, payment, entitlement và lịch sử đồng bộ.
- Màn hình “Một khóa/lớp”: mapping từng website, giáo viên, roster, payment summary và quyền học.
- Queue/outbox/dead-letter: retry, resolve, correlation trace, không lộ payload nhạy cảm/secret.
- Đối soát hàng ngày: Payment `Paid` nhưng chưa có entitlement; entitlement `Active` nhưng LMS chưa acknowledge; course/class chưa map.

**Bảo mật và vận hành**

- Rotate secret định kỳ và ngay khi có nguy cơ lộ; dùng secret manager, không lưu vào markdown/source/chat.
- Audit mọi lần cấp/thu role và entitlement.
- Backup database, kiểm thử restore, theo dõi lỗi connector và cảnh báo deadline/SLA.
- Tách quyền vận hành: nội dung LMS, tài chính, quản trị role và kỹ thuật không cùng một quyền mặc định.

**Nghiệm thu**

- Mọi sự cố quyền học truy được từ `party_id` và `correlation_id` trong vài phút.
- Người vận hành retry được event lỗi mà không cần developer can thiệp.

---

### Phase 8 — Onboard website thứ hai và chuẩn hóa thành platform

**Mục tiêu:** Chứng minh mô hình không chỉ chạy cho CSCA Course.

**Việc thực hiện**

- Chọn một website con thứ hai, đăng ký `application_code` và connector riêng.
- Reuse Application Registry, Membership, Role Assignment, Course/Class Map, Entitlement Engine và Integration Hub.
- Chỉ xây adapter/contract nghiệp vụ đặc thù của website thứ hai, không fork bảng user/role/payment.
- So sánh effort onboard với CSCA để bổ sung phần generic còn thiếu.

**Nghiệm thu**

- Website thứ hai nhận quyền đúng mà không có thêm “master user table” riêng.
- CSCA Course vẫn hoạt động không regression.

## 5. Thứ tự ưu tiên thực tế

| Ưu tiên | Việc | Lý do |
|---|---|---|
| P0 | Chốt mapping 3 khóa CSCA, Google OAuth, rotate secret | Không thể test tài khoản thật và quyền học an toàn nếu thiếu |
| P0 | Map course/class + test entitlement Paid/Refunded | Xác minh giá trị nghiệp vụ quan trọng nhất |
| P1 | Application Registry + Membership/Role chung | Nền móng để không tạo logic riêng cho mỗi web |
| P1 | Course/Class Map + Entitlement Engine generic | Điều phối được khóa, lớp, giáo viên, học viên và học phí |
| P1 | Dashboard outbox/dead-letter/đối soát | Có thể vận hành production an toàn |
| P2 | Event ngược từ LMS và dashboard báo cáo | Hoàn thiện vòng đời đào tạo |
| P2 | Onboard website thứ hai | Chứng minh kiến trúc đa website |

## 6. Quyết định cần đại ca chốt trước khi code Phase 1

1. Danh sách website/app sẽ nằm trong hệ sinh thái trong 12 tháng tới.
2. Có dùng một `Party` chung cho toàn bộ website không? Khuyến nghị: **có**.
3. Giáo viên có thể là học viên ở khóa khác không? Khuyến nghị: **có**, nhưng role theo scope.
4. Quy tắc học phí: chỉ full payment hay cho trả góp/mở từng phần?
5. Một lớp có thể học nhiều LMS course không? Nếu có, triển khai mapping nhiều-nhiều ngay từ đầu.
6. Nguồn đăng nhập dài hạn: Google OAuth, email/password + mail provider, hay SSO riêng?
7. Website con nào cần được onboard thứ hai sau CSCA Course?

## 7. Không làm trong roadmap này

- Không gộp các database website con vào một database lớn.
- Không tự động import/seed học viên, khóa học hay giáo viên không có nguồn dữ liệu đã được duyệt.
- Không chuyển password/secret giữa website.
- Không phát triển video-call riêng; Meet/Zoom vẫn là integration nghiệp vụ sau khi mapping lớp đã chuẩn.
- Không xóa mapping CSCA cũ trước khi migration identity và đối soát hoàn tất.

## 8. Definition of Done cho toàn bộ chương trình

Chương trình được coi là hoàn thành khi:

- InternalManagement quản lý được user, role, giáo viên, học viên, khóa, lớp, ghi danh và entitlement theo từng website.
- CSCA Course chỉ cấp/thu quyền theo lệnh có xác thực từ hệ thống tổng.
- Có ít nhất hai website sử dụng chung Application Registry, Membership, Role Assignment, Course/Class Map và Entitlement Engine.
- Hệ thống vận hành có audit, retry, dead-letter, dashboard đối soát và quy trình backup/secret rotation.
- Không có luồng nào cho phép website con tự tạo quyền trả phí, tự nâng role hoặc đọc nhầm dữ liệu của website khác.
