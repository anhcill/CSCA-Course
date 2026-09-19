# LMS Day 5 — Assignments, Quiz Attempts & Grading

Ngày hoàn thành: 14/09/2026

## Phạm vi đã hoàn thành

- Thêm migration `011_assignment_quiz_hardening.sql` với `submission_assets`, `quiz_attempts`, `assignment_type`, khóa duy nhất cho một lượt làm quiz và các index truy vấn hàng chờ.
- Assignment chỉ hiện cho học viên đã active enrollment trong course/live class; course phải publish và live class phải active. Assignment phải có scope và không thể submit đè.
- Upload bài nộp dùng asset ID do server cấp, R2 presigned PUT URL, giới hạn MIME/kích thước/tên file; API confirm kiểm tra HEAD object thực tế trước khi chuyển asset sang `ready`. API không nhận URL tùy ý từ browser.
- File/audio chỉ mở qua endpoint có kiểm tra owner, admin hoặc giáo viên phụ trách rồi mới redirect tới signed GET URL.
- Chấm điểm khóa submission trong transaction, lưu lịch sử grade, cập nhật trạng thái và tạo notification cho học viên trong cùng transaction.
- Quiz lấy câu hỏi thật từ database; response trước khi nộp không có `correct_answer` hoặc `explanation`. Server tạo attempt, chấm điểm, lưu đáp án, khóa attempt và trả review/explanation sau submit. Submit lại cùng attempt trả đúng kết quả cũ (idempotent).
- Màn hình Gemini Assignment Submit, Quiz Player và Teacher Grading đã bỏ mock/fallback; danh sách assignment có thể hiển thị cả quiz thật từ database.
- Quiz Player vẫn autosave đáp án trên browser để refresh/offline trong phạm vi policy; trạng thái chính thức và điểm vẫn do server quyết định.

## QA đã chạy

- `node --check backend/router/assignment.router.js`
- `node --check backend/services/video.service.js`
- `node run_sql.js` — migration 011 chạy thành công trên database.
- `npm run build --prefix frontend` — pass.
- Fixture QA có student enrollment, assignment và quiz:
  - student nhìn thấy assignment và attempt `in_progress`;
  - quiz trước submit không có `correct_answer`;
  - submit quiz lần hai trả kết quả cũ với `alreadySubmitted: true`;
  - submit assignment lần hai trả `409 SUBMISSION_LOCKED`;
  - gửi `fileUrl` tùy ý trả `422 VALIDATION_ERROR`;
  - teacher/admin chỉ lấy được hàng chờ trong phạm vi được giao;
  - chấm điểm chuyển submission sang `graded`, ghi điểm và tạo notification `grade`.
- Fixture QA đã được xóa sau khi kiểm tra.

## Cấu hình cần có khi dùng upload thật

Backend cần các biến R2 đã dùng cho video: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` và `R2_BUCKET_NAME` hoặc `R2_PRIVATE_BUCKET`. Khi thiếu cấu hình, API upload trả `503 SERVICE_UNAVAILABLE`, không tạo URL giả.

## Ghi chú cho Ngày 6

Dashboard giáo viên vẫn còn một số KPI/pending-submission UI mẫu ở khu vực Teacher Hub; phần đó thuộc phạm vi dashboard/analytics của Ngày 6, không dùng cho hàng chờ chấm thật của Ngày 5.
