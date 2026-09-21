# CSCA LMS — Kế hoạch nâng cấp UI và chức năng

## Mục tiêu

Đưa khu vực học viên về trải nghiệm LMS thống nhất với mockup CSCA LMS: sáng, thoáng, ưu tiên tiến độ học, lịch live, bài cần làm và quyền học thật từ InternalManagement.

## Lộ trình

### Phase 1 — Student LMS Foundation

- Shell desktop/mobile có sidebar và topbar thống nhất.
- Dashboard học viên dùng dữ liệu thật từ khóa học đã cấp quyền và lịch live.
- Catalog “Khóa học của tôi” hiển thị trạng thái, tiến độ và CTA chọn lớp.
- Trang “Phân tích điểm” bắt đầu từ tiến độ khóa học thật; không dùng số liệu minh họa.
- Chuẩn hóa màu CSCA: xanh dương làm primary, nền xám xanh nhạt, card trắng, trạng thái semantic.

### Phase 2 — Các tab vận hành học tập

- Lớp trực tiếp: lịch tuần, countdown, join window và trạng thái phòng.
- Bài tập & thi: filter theo trạng thái, deadline, nộp bài và quiz release theo lớp.
- Tài nguyên: file riêng tư, signed URL, phân loại theo khóa/lớp.
- Thông báo: chuyển từ state/mẫu frontend sang notification API + delivery log.

### Phase 3 — Workspace theo lớp

- Luôn giữ context `courseId + classId` trên Tổng quan, Bài học, Bài tập, Lịch, Tài liệu và Kết quả.
- Quyền truy cập dựa trên class enrollment active.
- Teacher workspace dùng cùng design system nhưng tách rõ scope lớp.

### Phase 4 — Analytics và vận hành

- Gradebook, attendance, completion và risk signals theo lớp.
- Admin mapping health, sync queue, dead-letter, audit và reconciliation.
- Browser E2E cho các vai trò học viên, giáo viên và admin.

## Nguyên tắc chức năng

- Không tạo enrollment CSCA trả phí từ UI học viên.
- Không hiển thị dữ liệu mock trên dashboard production.
- InternalManagement là nguồn gốc cho danh tính, course/class, roster và entitlement.
- LMS sở hữu lesson, assignment, quiz, attendance, file và kết quả học tập.
- Mọi tab phải có empty/loading/error state rõ ràng và có thể retry.

## Tiêu chí nghiệm thu Phase 1

- `/lms/dashboard` tải được không cần dữ liệu giả; không có khóa học thì hiển thị trạng thái chờ cấp quyền.
- Sidebar có các tab chính và active state đúng route.
- `/lms/catalog` chỉ hiển thị course từ `fetchMyEnrolledCourses`.
- Progress card và CTA dẫn đúng sang chọn lớp/workspace.
- Build frontend pass và không làm mất các thay đổi đang có ở teacher workspace.
