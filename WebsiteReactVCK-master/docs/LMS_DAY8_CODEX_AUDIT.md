# LMS Ngày 8 — Gamification, thông báo và chứng chỉ

## Phạm vi đã làm

- Chỉ bổ sung backend, migration và tài liệu. Không chỉnh sửa hoặc xóa UI Gemini.
- Migration `014_gamification_certificates.sql` tạo `xp_events` với unique key theo `(user_id, event_key)` và index cho truy vấn lịch sử/bảng xếp hạng.
- `awardXp()` dùng cùng transaction với hành động nghiệp vụ. Retry lesson, quiz hoặc grade không thể cộng XP trùng.
- Công thức XP hiện tại:
  - hoàn thành bài học: `10 XP`;
  - quiz đạt: `20 XP`, quiz chưa đạt: `5 XP`;
  - bài tập được chấm đạt từ 50%: `15 XP`, dưới 50%: `5 XP`.
- Streak và ngày hoạt động tính theo `Asia/Ho_Chi_Minh`; cùng một ngày không tăng streak lần hai, ngày liền kề tăng một ngày, bỏ quãng thì reset về 1.

## API và quyền truy cập

- `GET /api/notifications?page&limit&unreadOnly&type`: inbox chỉ của user hiện tại, có phân trang và `unreadCount` toàn inbox.
- `PATCH /api/notifications/:id/read`: chỉ owner được cập nhật; notification của user khác trả `404` để không làm lộ trạng thái tồn tại.
- `GET /api/leaderboard?scope=public|class|course&period=all|week|month&page&limit`:
  - `public` chỉ hiển thị learner không bị khóa và không cần đăng nhập;
  - `class` yêu cầu `classId`, đăng nhập và membership/instructor phù hợp;
  - `course` yêu cầu `courseId`, đăng nhập và enrollment/author phù hợp;
  - tie-break cố định: XP giảm dần, streak giảm dần, user id tăng dần.
- `GET /api/certificates/my-certificates`: chỉ trả chứng chỉ của session user.
- `POST /api/certificates/:courseId/claim`: chỉ learner đã enrollment active; một user/course chỉ có một chứng chỉ.
- `GET /api/certificates/verify/:code`: public, chỉ trả mã, tên học viên, tên khóa, ngày cấp, issuer và trạng thái hợp lệ; không trả email, user id hoặc dữ liệu riêng tư.

## Điều kiện cấp chứng chỉ

Certificate chỉ được cấp khi:

1. Có ít nhất một bài học published và learner đã hoàn thành toàn bộ bài học published.
2. Mọi quiz thuộc khóa (trực tiếp hoặc qua lesson) đều có attempt `submitted` và đạt `passing_score`.
3. Mọi assignment thuộc khóa đều đã có submission được chấm; khóa không có assignment/quiz vẫn hợp lệ nếu hoàn thành điều kiện bài học.

Endpoint claim trả `409 CERTIFICATE_NOT_ELIGIBLE` kèm thống kê thiếu (`lessons`, `quizzes`, `assignments`) và dùng unique constraint để retry an toàn.

## Kiểm tra đã chạy

- `node --check` pass cho notification, attendance/leaderboard, certificate, progress, assignment và gamification service.
- `npm run test:auth`: 3/3 pass.
- Smoke test fixture DB đã pass và fixture đã dọn sạch:
  - guest/public và class/course leaderboard;
  - pagination/unread notification và cross-user read trả 404;
  - lesson completion retry: 1 XP event;
  - quiz submit retry: 1 XP event;
  - regrade: 1 XP event;
  - tổng fixture: 3 event, 45 XP;
  - claim sớm bị từ chối, claim đủ điều kiện thành công, claim lần hai idempotent, verify public thành công;
  - mã chứng chỉ không tồn tại trả 404.

