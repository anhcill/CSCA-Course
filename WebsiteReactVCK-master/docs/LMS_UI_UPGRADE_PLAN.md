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

## Tiêu chí nghiệm thu Phase 2

- Các tab `/lms/live-schedule`, `/lms/assignments`, `/lms/files` và `/lms/notifications` dùng cùng visual system sáng với dashboard.
- Lớp trực tiếp giữ cơ chế join-window 15 phút và chỉ nhận URL phòng từ endpoint đã kiểm tra quyền.
- Bài tập/quiz ở cấp LMS dẫn tới màn làm bài thực, không còn bị redirect về catalog.
- Tài nguyên vẫn mở signed URL do backend phát hành; không lưu URL giả trên frontend.
- Thông báo tải, đánh dấu một/tất cả đã đọc qua notification API; không còn khởi tạo thông báo mẫu hoặc mô phỏng broadcast.

## Tiêu chí nghiệm thu Phase 3

- Chọn lớp hiển thị riêng các lớp active mà học viên đã được cấp quyền từ Management.
- Workspace duy trì `courseId + classId` cho toàn bộ điều hướng Tổng quan, Bài học, Bài tập, Lịch, Tài liệu và Kết quả.
- Tổng quan, kết quả, lựa chọn lớp và chrome của phòng học dùng visual system sáng của LMS; vùng phát video vẫn có nền tối để bảo đảm trải nghiệm xem bài học.
- Điểm, tài liệu, lịch và CTA chỉ lấy từ workspace API của lớp đang mở.

## Tiêu chí nghiệm thu Phase 4

- Mọi loading, empty và error state trên visual system sáng dùng state component sáng tương ứng; các màn tối legacy không bị thay đổi mặc định.
- Admin sync queue và audit log phân trang từ API thay vì chỉ đọc trang đầu, đồng thời có retry/error state rõ ràng.
- Chỉ delivery job ở trạng thái `FAILED` hoặc `DEAD_LETTER` mới hiển thị hành động retry; retry luôn tải lại overview/queue từ backend.
