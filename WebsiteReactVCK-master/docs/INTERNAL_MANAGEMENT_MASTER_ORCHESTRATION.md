# InternalManagement — Hệ thống tổng điều phối các website

> **Trạng thái:** Kiến trúc chuẩn cần được tuân theo cho CSCA Course LMS và các website sẽ tích hợp sau này.  
> **Quyết định cốt lõi:** `InternalManagement` là nguồn dữ liệu chuẩn và nơi ra quyết định. Mỗi website con chỉ nhận dữ liệu được cấp quyền, vận hành chức năng chuyên môn của mình, và không được tự thay đổi dữ liệu quản trị trung tâm.

> **Kế hoạch thực hiện chi tiết:** [INTERNAL_MANAGEMENT_MULTI_APP_UPGRADE_PLAN.md](INTERNAL_MANAGEMENT_MULTI_APP_UPGRADE_PLAN.md)

---

## 1. Mục tiêu thống nhất

Doanh nghiệp có một hệ thống tổng (`InternalManagement`) và nhiều website/app chuyên biệt, ví dụ:

- `CSCA_COURSE`: LMS học HSK/HSKK/CSCA.
- Các website CSCA khác hiện tại hoặc trong tương lai.
- Những nền tảng bán hàng, tuyển sinh, luyện đề, đào tạo hoặc vận hành khác.

Mỗi người, giáo viên, học viên, lớp học, khóa học, khoản thu và quyền truy cập phải được nhận diện rõ **thuộc công ty nào, sản phẩm/web nào, khóa nào và lớp nào**. Không website nào được hiểu nhầm học viên của web khác là học viên của mình.

```text
                         InternalManagement
        (nguồn chuẩn: người dùng, vai trò, khóa/lớp, ghi danh, học phí)
                                      |
          ----------------------------------------------------
          |                         |                        |
     CSCA Course LMS          Website/App khác         Website/App khác
    (học, bài tập, tiến độ)    (chức năng riêng)        (chức năng riêng)
```

## 2. Phân định trách nhiệm

| Nghiệp vụ | InternalManagement — hệ thống tổng | Website con, ví dụ LMS |
|---|---|---|
| Công ty, đơn vị, sản phẩm/web | Tạo và quản lý danh mục website/app được phép tích hợp | Chỉ dùng mã đã được cấp |
| Danh tính người | Nguồn chuẩn cho `Party`, nhân sự, giáo viên, học viên và user nội bộ | Chỉ lưu bản chiếu tài khoản cần dùng để đăng nhập |
| Vai trò | Quyết định ai là Admin, Giáo viên, Học viên, Kế toán… theo từng website | Áp quyền nhận được; không tự nâng role |
| Khóa học | Tạo khóa học/sản phẩm đào tạo chuẩn, mã khóa và trạng thái kinh doanh | Lưu nội dung học, bài giảng, quiz, tiến độ của khóa đã map |
| Lớp học | Tạo lớp/cohort, lịch, giáo viên phụ trách và danh sách học viên | Hiển thị/làm roster học tập theo mapping |
| Ghi danh và học phí | Nguồn duy nhất quyết định học viên đã ghi danh, đã đóng đủ, bị hoàn tiền hay bị hủy | Chỉ cấp/thu quyền học sau lệnh từ hệ thống tổng |
| Dữ liệu học tập | Nhận báo cáo tổng hợp khi cần | Nguồn chuẩn cho tiến độ, bài nộp, điểm quiz, ghi chú, chứng chỉ LMS |

**Nguyên tắc:** LMS được phép tạo và sửa *dữ liệu học tập*. LMS không được tự tạo học viên chính thức, tự gán giáo viên, tự mở quyền học trả phí, hay tự xác nhận thanh toán.

## 3. Mô hình dữ liệu chuẩn dùng cho mọi web

### 3.1. Các thực thể trung tâm

```text
Company / BusinessUnit
        |
        +-- Party (một con người hoặc tổ chức, danh tính gốc)
        |      +-- Internal User (tài khoản quản trị/nội bộ khi cần)
        |      +-- Application Membership (thành viên của từng web)
        |              +-- Role Assignment (Teacher / Student / Admin...)
        |
        +-- Course Offering (khóa học chuẩn, CourseSourceId)
        |      +-- Class / Cohort (lớp mở bán/giảng dạy, ClassId)
        |              +-- Teacher Assignment
        |              +-- Student Enrollment
        |                      +-- Payment / Entitlement
        |
        +-- Application Course Map (map khóa/lớp sang từng website)
```

### 3.2. Định danh bắt buộc

Mọi bản ghi gửi sang website con phải mang đủ ngữ cảnh sau:

| Trường | Ý nghĩa |
|---|---|
| `company_id` | Phạm vi doanh nghiệp sở hữu dữ liệu |
| `business_unit_id` | Phạm vi đơn vị vận hành, nếu có |
| `application_code` | Mã website/app đích, ví dụ `CSCA_COURSE` |
| `party_id` | Định danh con người chuẩn; không lấy email làm khóa chính |
| `course_id` + `course_source_id` | Khóa học chuẩn của hệ thống tổng |
| `class_id` | Lớp/cohort cụ thể mà người học hoặc giáo viên thuộc về |
| `enrollment_id` | Bản ghi ghi danh, dùng để đối soát học phí/quyền học |
| `external_*_id` | ID bản chiếu ở website con, chỉ dùng để map, không thay thế ID tổng |

Email có thể đổi và một người có thể học nhiều khóa hoặc có nhiều vai trò. Vì vậy email chỉ là thuộc tính liên hệ/đăng nhập; `party_id` là danh tính liên hệ giữa các hệ thống.

### 3.3. Quy tắc nhiều website

- Một `Party` có thể là học viên ở `CSCA_COURSE` nhưng không có bất kỳ quyền nào ở website khác.
- Một `Party` có thể là giáo viên ở một khóa/lớp và đồng thời là học viên ở khóa khác. Hai quyền này được lưu riêng theo `application_code` và phạm vi khóa/lớp.
- Không dùng một cờ chung như `is_student` hoặc `is_teacher` cho toàn bộ hệ sinh thái.
- Mỗi website chỉ nhận các membership, role, course map và entitlement thuộc đúng `application_code` của nó.

## 4. Phân quyền chuẩn

| Role tại website | Ai quyết định | Phạm vi quyền |
|---|---|---|
| `Admin` | InternalManagement | Quản trị website theo phạm vi được giao |
| `Teacher` | InternalManagement qua phân công giáo viên vào khóa/lớp | Dạy, xem roster, chấm/điểm danh đúng khóa/lớp được phân công |
| `Student` | InternalManagement qua ghi danh | Xem hồ sơ và quyền học của chính mình |
| `Finance/Operator` | InternalManagement | Quyền vận hành, không tự tạo quyền học nếu không có nghiệp vụ phù hợp |

Đối với `CSCA_COURSE`, quyền học nội dung trả phí chỉ hợp lệ khi đồng thời thỏa:

```text
application_code = CSCA_COURSE
AND enrollment còn hiệu lực
AND course/class đã map sang LMS
AND payment_status = Paid
AND paid_amount >= tuition_fee
```

Nếu hoàn tiền, hủy hoặc mất điều kiện thanh toán, hệ thống tổng phải gửi lệnh `Suspended`/`Revoked`; LMS phải thu quyền học tương ứng.

## 5. Luồng vận hành bắt buộc cho CSCA Course LMS

### 5.1. Tạo và map khóa/lớp

1. Quản trị tạo **khóa học chuẩn** trong `InternalManagement`.
2. Quản trị tạo **lớp/cohort** thuộc khóa đó, thời gian học, học phí và trạng thái mở bán.
3. Quản trị tạo hoặc chọn khóa nội dung tương ứng trên CSCA Course LMS.
4. Hệ thống tổng lưu `ApplicationCourseMap`:
   - `application_code = CSCA_COURSE`
   - `course_id`, `course_source_id`, và khi cần `class_id`
   - `lms_course_id`, `lms_course_slug`, `external_course_id`
   - trạng thái map `Pending` / `Active` / `Disabled`
5. Chỉ mapping có trạng thái `Active` mới được cấp quyền LMS.

**Quy tắc v1 hiện tại:** một khóa Management map tới một khóa LMS bằng `CourseSourceId` / `external_course_id`. Nếu một gói bán cần nhiều khóa LMS, hệ thống tổng phải dùng bảng mapping nhiều-nhiều thay vì ghi chuỗi ID thủ công.

### 5.2. Phân công giáo viên

1. Quản trị tạo hoặc chọn `Party` là giáo viên trong hệ thống tổng.
2. Phân công giáo viên vào đúng `course_id` hoặc `class_id`.
3. Hệ thống tổng tạo/cập nhật `Application Membership` tại `CSCA_COURSE` với role `Teacher` và phạm vi được cấp.
4. LMS chỉ mở chức năng giảng dạy, roster, điểm danh, bài tập của đúng phạm vi đã nhận.
5. Khi hủy phân công, hệ thống tổng thu role/phạm vi; LMS đồng bộ thu quyền.

### 5.3. Ghi danh học viên và cấp quyền học

1. Nhân viên tạo/chọn học viên trong hệ thống tổng, gắn `party_id`, email và thông tin liên hệ.
2. Nhân viên ghi danh học viên vào `class_id`/`course_id` thuộc `CSCA_COURSE`.
3. Hệ thống tổng provision một tài khoản LMS ở trạng thái `PendingPayment` hoặc `Active`.
4. Khi học phí đạt điều kiện, hệ thống tổng gửi lệnh cấp quyền `Active` cho đúng `external_course_id`.
5. LMS tạo/cập nhật enrollment, mở bài học và ghi nhận tiến độ.
6. Khi thanh toán bị hoàn/hủy, hệ thống tổng gửi lệnh thu quyền. LMS vẫn giữ lịch sử học tập phục vụ đối soát nhưng không cho tiếp tục truy cập nội dung.

Không được có luồng “học viên tự đăng ký vào khóa trả phí trên LMS rồi LMS tự coi là đã đóng tiền”.

## 6. Giao tiếp giữa hệ thống tổng và website con

### 6.1. Hướng đồng bộ

| Hướng | Dữ liệu | Ai là nguồn chuẩn |
|---|---|---|
| InternalManagement → LMS | Membership, role, teacher assignment, course/class map, ghi danh, thanh toán, quyền học | InternalManagement |
| LMS → InternalManagement | Tiến độ, điểm, điểm danh, bài nộp, chứng chỉ, sự kiện học tập | LMS cho dữ liệu học tập |

LMS chỉ gửi báo cáo hoặc event dữ liệu học tập về hệ thống tổng; không gửi ngược một lệnh làm thay đổi học phí, role hoặc ghi danh chuẩn.

### 6.2. Quy tắc kỹ thuật

- Mỗi web dùng database riêng; **không truy cập trực tiếp database của InternalManagement**.
- Dùng API machine-to-machine qua HTTPS, HMAC/signature, service token, timestamp, correlation ID và idempotency key.
- Hệ thống tổng dùng outbox bền vững để retry an toàn; website con xử lý idempotent để không tạo hai tài khoản hay cấp quyền hai lần.
- Một event cũ không được ghi đè trạng thái mới hơn (`source_updated_at`/version).
- Thất bại phải vào hàng retry/dead-letter và có màn hình vận hành để xử lý, không im lặng bỏ qua.

Chi tiết API CSCA Course hiện có nằm trong [MANAGEMENT_LMS_INTEGRATION.md](MANAGEMENT_LMS_INTEGRATION.md).

## 7. Quy tắc cấm

1. Website con không được tự thăng quyền từ `Student` lên `Teacher`/`Admin`.
2. Website con không được coi một email tồn tại là đã thuộc hệ thống hoặc đã có quyền ở web đó.
3. Không cấp quyền theo tên khóa học tự do; phải dựa vào `CourseSourceId`/mapping đã duyệt.
4. Không chia sẻ JWT, database credential hoặc secret giữa các website. Mỗi kết nối dùng credential riêng, giới hạn đúng scope.
5. Không bật worker cấp quyền tự động khi chưa có mapping khóa/lớp và kiểm thử đối soát.
6. Không dùng dữ liệu học viên của `application_code` khác để tạo quyền tại `CSCA_COURSE`.

## 8. Trạng thái hiện tại và khoảng cách cần hoàn thiện

### Đã có cho CSCA Course

- Database LMS riêng và endpoint tích hợp bảo vệ bằng HMAC.
- Provision tài khoản LMS, map khóa theo `external_course_id`, cấp/thu quyền theo trạng thái thanh toán.
- Outbox, trạng thái đồng bộ, dead-letter và màn hình/endpoint vận hành phía InternalManagement.

### Cần làm để trở thành hệ thống tổng đa website đúng nghĩa

1. Tạo registry `Application/Web` trong InternalManagement với `application_code`, owner, URL, trạng thái và chính sách tích hợp.
2. Chuẩn hóa `ApplicationMembership` và `ApplicationRoleAssignment` theo `party_id + application_code + scope` thay cho logic riêng của từng web.
3. Chuẩn hóa `ApplicationCourseMap` và `ApplicationClassMap` để dùng cho một-nhiều website, kể cả bundle nhiều khóa.
4. Tách event/contract chung: `UserProvisioned`, `RoleAssigned`, `TeacherAssigned`, `EnrollmentChanged`, `PaymentSettled`, `EntitlementChanged`, `LearningProgressReported`.
5. Xây dashboard điều phối trong InternalManagement: xem map, quyền, outbox, dead-letter và lịch sử đối soát theo từng website.
6. Chuyển dần CSCA Course từ khóa tương thích hiện tại `externalStudentId = CscaClassStudentId` sang định danh tổng dựa trên `party_id` + membership. Không xóa mapping cũ trước khi migration dữ liệu hoàn tất.

## 9. Checklist trước khi bật một website mới

- [ ] Đã đăng ký `application_code` duy nhất trong InternalManagement.
- [ ] Đã xác định rõ dữ liệu nào hệ thống tổng sở hữu và dữ liệu nào website con sở hữu.
- [ ] Đã có mapping khóa/lớp và mapping role theo `application_code`.
- [ ] Đã có contract API, schema version, signature và idempotency.
- [ ] Đã kiểm thử tạo học viên, phân công giáo viên, đóng tiền, hoàn tiền và thu quyền.
- [ ] Đã có dashboard/retry/dead-letter và người chịu trách nhiệm vận hành.
- [ ] Đã kiểm tra website không nhận nhầm dữ liệu hoặc quyền của web khác.

---

## Quyết định cần được phê duyệt

Từ thời điểm tài liệu này được chấp thuận, mọi website mới phải tích hợp qua `InternalManagement` theo mô hình trên. CSCA Course LMS là website học tập đầu tiên áp dụng mô hình; nó không phải hệ thống quản lý học viên, giáo viên, lớp hay học phí độc lập.
