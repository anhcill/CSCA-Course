# Hướng dẫn thiết lập AWS Rekognition (Face Liveness + CompareFaces) cho Chấm công Giáo viên

Hệ thống chấm công khuôn mặt Ra / Vào cho giảng viên dùng **AWS Rekognition** (`Face Liveness` + `CompareFaces`) kết hợp **AWS STS (`AssumeRole`)** để cấp quyền tạm 15 phút cho PWA — **không cần cấu hình AWS Cognito** và lưu ảnh riêng tư trực tiếp trên **Cloudflare R2** sẵn có.

Với 5 giảng viên (~200–250 lượt chấm công Ra + Vào/tháng), tổng chi phí thực tế chỉ khoảng **\$3.5 – \$4.5 / tháng (~90.000 – 115.000 VNĐ/tháng)**.

---

## Bước 1: Tạo tài khoản AWS & bật cảnh báo chi phí

1. Đăng ký tài khoản tại [https://aws.amazon.com](https://aws.amazon.com) (cần thẻ Visa/Mastercard debit).
2. Chọn **Region** gần Việt Nam hỗ trợ Face Liveness:
   - Khuyến nghị: **`ap-southeast-7` (Asia Pacific - Thailand / Bangkok)** hoặc **`ap-southeast-5` (Malaysia)** hoặc **`ap-northeast-1` (Tokyo)**.
   - *(Lưu ý: `ap-southeast-1` Singapore chưa hỗ trợ Face Liveness).*
3. Vào **AWS Billing & Cost Management → Budgets → Create budget** → chọn **Zero spend / Monthly cost budget** đặt ngưỡng cảnh báo **\$10/tháng** để nhận email ngay nếu có bất thường.

---

## Bước 2: Tạo IAM User cho Backend (`moly-rekognition-backend`)

1. Vào **IAM → Users → Create user** → đặt tên `moly-rekognition-backend` (không cần bật AWS Management Console access).
2. Vào user vừa tạo → tab **Security credentials → Create access key → Application running outside AWS** → lưu lại:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - và **User ARN** (dạng `arn:aws:iam::<ACCOUNT_ID>:user/moly-rekognition-backend`).

---

## Bước 3: Tạo IAM Role tạm cho trình duyệt PWA (`MolyLivenessClientRole`)

1. Vào **IAM → Roles → Create role → Custom trust policy**.
2. Dán Trust Policy sau (thay `<ACCOUNT_ID>` bằng AWS Account ID 12 số của bạn):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<ACCOUNT_ID>:user/moly-rekognition-backend"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

3. Đặt tên Role là **`MolyLivenessClientRole`**, tạo Role, sau đó gắn **Inline Policy** với đúng 1 quyền tối thiểu:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:StartFaceLivenessSession"
      ],
      "Resource": "*"
    }
  ]
}
```

4. Copy **Role ARN** (dạng `arn:aws:iam::<ACCOUNT_ID>:role/MolyLivenessClientRole`) để điền vào `AWS_LIVENESS_ROLE_ARN`.

---

## Bước 4: Gắn Inline Policy tối thiểu cho User `moly-rekognition-backend`

Quay lại **IAM → Users → `moly-rekognition-backend` → Permissions → Add inline policy**, dán JSON sau (thay `<ACCOUNT_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateFaceLivenessSession",
        "rekognition:GetFaceLivenessSessionResults",
        "rekognition:CompareFaces",
        "rekognition:DetectFaces"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/MolyLivenessClientRole"
    }
  ]
}
```

---

## Bước 5: Điền biến môi trường vào `backend/.env`

```env
AWS_REKOGNITION_REGION=ap-southeast-7
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_LIVENESS_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/MolyLivenessClientRole
AWS_FACE_LIVENESS_MIN_CONFIDENCE=85
AWS_FACE_MATCH_MIN_SIMILARITY=90
AWS_REKOGNITION_MOCK=false
```

### Chế độ test nhanh trên máy local (chưa cần tạo tài khoản AWS)
Trong môi trường phát triển (`NODE_ENV=development`), bạn có thể đặt:
```env
AWS_REKOGNITION_MOCK=true
```
Hệ thống sẽ tự động chạy luồng camera trực tiếp + duyệt Admin + chấm công Ra/Vào + tính lương Cách 1 đầy đủ. *(Trong `NODE_ENV=production`, chế độ Mock luôn bị vô hiệu hóa để đảm bảo an toàn).*

---

## Luồng vận hành thực tế (Cách 1)

1. **Giáo viên đăng ký khuôn mặt gốc**: Vào `/lms/teach/settings` → mục **Khuôn mặt chấm công** → chụp ảnh trực tiếp từ camera & tích đồng ý → gửi trạng thái **Chờ duyệt**.
2. **Admin duyệt & khóa**: Vào trang **Quản lý lương giảng viên** (`/admin/teacher-salaries`) → bảng **Duyệt khuôn mặt gốc giảng viên** → xem ảnh và bấm **Duyệt & Khóa**.
3. **Chấm công Ra / Vào mỗi buổi dạy**:
   - **Vào ca**: Mở từ **30 phút trước giờ bắt đầu** đến hết buổi. Vào sau giờ bắt đầu quá **10 phút** bị đánh dấu **Đi muộn** (ghi rõ số phút).
   - **Ra ca**: Mở sau khi đã Vào ca cho đến **90 phút sau giờ kết thúc**. Ra sớm hơn giờ kết thúc quá **10 phút** bị đánh dấu **Về sớm**.
4. **Tính lương tự động (Cách 1)**:
   - Buổi học sau ngày khuôn mặt mẫu được duyệt: có đủ **Vào + Ra hợp lệ** (hoặc Admin bấm **Duyệt lương**) sẽ tự động cộng đủ thời lượng chuẩn (`duration_hours`).
   - Buổi thiếu Vào hoặc thiếu Ra sẽ giữ trạng thái **Thiếu Ra/Vào** (chưa cộng lương tự động) để Admin xem ảnh đối chiếu và bấm duyệt tay hoặc từ chối.
