# Vận hành lớp học Jitsi

## Quyền sở hữu dữ liệu

- `InternalManagement` là nơi tạo và sửa lịch tuần, từng buổi học, trạng thái hủy/đổi lịch và link phòng của lớp được đồng bộ.
- LMS hiển thị dữ liệu đã đồng bộ, kiểm tra quyền vào lớp và nhúng phòng Jitsi.
- Giáo viên không sửa link trên LMS đối với buổi thuộc `InternalManagement`. Buổi được tạo trực tiếp trên LMS vẫn có thể dùng Jitsi, Zoom hoặc Google Meet.

## Quy trình tạo lớp online

1. Tạo lịch tuần trong `InternalManagement`, không chọn phòng học trực tiếp.
2. Có thể để trống link. Khi sinh các buổi học theo lịch, mỗi buổi nhận một URL `meet.jit.si` riêng và khó đoán.
3. Dùng chức năng sinh buổi học cho khoảng ngày cần vận hành. Lịch tuần chưa sinh buổi sẽ chưa có phòng riêng để đồng bộ sang LMS.
4. Kiểm tra hàng đợi đồng bộ; xử lý và retry dead-letter trước giờ học nếu có.
5. Giáo viên mở buổi học từ LMS. Học viên chỉ được lấy link qua API kiểm tra quyền, sớm nhất 15 phút trước giờ bắt đầu.

Buổi học trực tiếp có `ClassroomId` hoặc tên phòng sẽ không được tự tạo link Jitsi. Link được nhập thủ công tiếp tục được giữ nguyên để hỗ trợ Zoom, Google Meet hoặc phòng Jitsi có sẵn.

## Hai lớp diễn ra song song

- Mỗi buổi có URL riêng nên hai lớp có thể chạy đồng thời.
- Không dùng lại một link cho hai lớp khác nhau.
- Trước khi mở lớp thật, chạy thử bằng hai giáo viên và ít nhất một học viên mỗi lớp; kiểm tra camera, micro, chia sẻ màn hình, điện thoại và việc rời/vào lại phòng.

## Cấu hình máy chủ Jitsi riêng

`meet.jit.si` được chấp nhận và nhúng mặc định. Khi chuyển sang JaaS hoặc máy chủ riêng:

```env
# Backend
JITSI_HOST=video.example.com
# Hoặc nhiều hostname chính xác, phân cách bằng dấu phẩy
JITSI_ALLOWED_HOSTS=video.example.com,backup-video.example.com

# Frontend build
VITE_JITSI_ALLOWED_HOSTS=video.example.com,backup-video.example.com
```

Danh sách frontend phải chứa mọi hostname Jitsi cần nhúng mà backend chấp nhận. Host chỉ có ở backend vẫn mở được dưới dạng tab ngoài, nhưng không được tải script vào trong LMS.

## Kiểm tra trước khi phát hành

- Tạo một buổi online không có link và xác nhận `InternalManagement` sinh URL `meet.jit.si`.
- Xác nhận lịch và dashboard chỉ hiển thị nhà cung cấp, không trả URL phòng.
- Xác nhận học viên ngoài lớp hoặc vào quá sớm bị từ chối.
- Xác nhận buổi thuộc `InternalManagement` không thể đổi link từ LMS, kể cả bằng tài khoản admin.
- Xác nhận Jitsi mở trong LMS và nút mở ở tab riêng hoạt động.
- Xác nhận Zoom và Google Meet cũ vẫn mở ở tab ngoài.

## Giới hạn của meet.jit.si

Tên phòng ngẫu nhiên giúp giảm khả năng người lạ đoán được URL, nhưng người đã có URL vẫn có thể chia sẻ nó. Với lớp trả phí cần kiểm soát danh tính nghiêm ngặt, chuyển sang JaaS hoặc Jitsi tự quản có xác thực và cấu hình moderator riêng.
