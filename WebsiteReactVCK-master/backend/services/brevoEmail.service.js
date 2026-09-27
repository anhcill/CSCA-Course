/**
 * ==============================================================================
 * MOLY COURSE - BREVO EMAIL SERVICE (Sendinblue v3 REST API)
 * ==============================================================================
 * Dịch vụ gửi email giao dịch (Transactional Email) sử dụng Brevo REST API v3.
 * Tự động hỗ trợ:
 * 1. Chế độ Mock / Sandbox: Khi chưa cấu hình BREVO_API_KEY (in OTP ra console, không lỗi).
 * 2. Chế độ Production: Gửi email thực qua https://api.brevo.com/v3/smtp/email.
 * 3. Hỗ trợ đầy đủ các loại email: Xác thực đăng ký (OTP), Chào mừng (Welcome),
 *    Quên mật khẩu (Password Reset), Đổi mật khẩu thành công, Thông báo học tập.
 * ==============================================================================
 */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Lấy cấu hình Brevo từ biến môi trường
 */
const getBrevoConfig = () => {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "no-reply@molycourse.com").trim();
  const senderName = (process.env.BREVO_SENDER_NAME || "Moly Course").trim();
  const isConfigured = Boolean(apiKey && apiKey !== "YOUR_BREVO_API_KEY" && apiKey.length > 10);

  return { apiKey, senderEmail, senderName, isConfigured };
};

/**
 * Khung HTML email chuẩn thương hiệu Moly Course
 */
const createBaseEmailHtml = ({ title, preheader = "", bodyContent, showSecurityNote = true }) => {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #dc2626 0%, #ea580c 50%, #f59e0b 100%);
      padding: 32px 30px;
      text-align: center;
      color: #ffffff;
    }
    .logo-badge {
      display: inline-block;
      background-color: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-bottom: 12px;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .header-title {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.3;
    }
    .content {
      padding: 36px 32px;
      line-height: 1.6;
    }
    .otp-box {
      background: linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%);
      border: 2px dashed #f87171;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      margin: 28px 0;
    }
    .otp-label {
      font-size: 12px;
      font-weight: 700;
      color: #991b1b;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 8px;
    }
    .otp-code {
      font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
      font-size: 38px;
      font-weight: 900;
      color: #dc2626;
      letter-spacing: 0.25em;
      margin: 4px 0;
      padding-left: 0.25em;
    }
    .otp-expire {
      font-size: 12px;
      color: #b45309;
      font-weight: 600;
      margin-top: 8px;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 4px 14px 0 rgba(220, 38, 38, 0.39);
      margin: 20px 0;
    }
    .security-note {
      background-color: #f1f5f9;
      border-radius: 12px;
      padding: 16px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
      margin-top: 24px;
      border-left: 4px solid #94a3b8;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .footer a {
      color: #ea580c;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  ${preheader ? `<span style="display:none;font-size:0px;line-height:0px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</span>` : ""}
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-badge">Moly Course</div>
        <h1 class="header-title">${title}</h1>
      </div>
      <div class="content">
        ${bodyContent}
        ${
          showSecurityNote
            ? `<div class="security-note">
                <strong>🔒 Lưu ý an ninh:</strong> Tuyệt đối không cung cấp mã xác thực này cho bất kỳ ai, kể cả nhân viên hỗ trợ Moly Course. Nếu bạn không thực hiện yêu cầu này, vui lòng đổi mật khẩu ngay hoặc bỏ qua email.
              </div>`
            : ""
        }
      </div>
      <div class="footer">
        <p style="margin: 0 0 8px 0;"><strong>Moly Course</strong> — Nền tảng học tập & luyện thi trực tuyến HSK & CSCA</p>
        <p style="margin: 0;">Mọi thắc mắc vui lòng liên hệ: <a href="mailto:support@molycourse.com">support@molycourse.com</a></p>
        <p style="margin: 8px 0 0 0; font-size: 11px; color: #cbd5e1;">© 2026 Moly Course. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Gửi email qua Brevo REST API v3
 * @param {Object} options
 * @param {string} options.to - Địa chỉ email người nhận
 * @param {string} [options.toName] - Tên người nhận
 * @param {string} options.subject - Tiêu đề email
 * @param {string} options.htmlContent - Nội dung HTML
 * @param {string} [options.textContent] - Nội dung text thuần
 * @returns {Promise<{success: boolean, messageId?: string, mock?: boolean, error?: string}>}
 */
export const sendBrevoEmail = async ({ to, toName, subject, htmlContent, textContent }) => {
  const { apiKey, senderEmail, senderName, isConfigured } = getBrevoConfig();

  // ── MOCK / SANDBOX MODE: Khi chưa cấu hình key ────────────────────────────
  if (!isConfigured) {
    console.log("==================================================================");
    console.log(`📧 [BREVO EMAIL SERVICE - MOCK MODE]`);
    console.log(`👉 Trạng thái: Chưa cấu hình BREVO_API_KEY (Sẽ cấu hình sau)`);
    console.log(`📨 Người gửi: "${senderName}" <${senderEmail}>`);
    console.log(`📬 Người nhận: ${toName ? `"${toName}" ` : ""}<${to}>`);
    console.log(`📌 Tiêu đề: ${subject}`);
    if (textContent) {
      console.log(`📝 Nội dung tóm tắt: ${textContent.slice(0, 160)}...`);
    }
    console.log("==================================================================");

    return {
      success: true,
      mock: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  // ── PRODUCTION MODE: Gửi thực tế qua Brevo API ────────────────────────────
  try {
    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: to,
          name: toName || to.split("@")[0],
        },
      ],
      subject,
      htmlContent,
    };

    if (textContent) {
      payload.textContent = textContent;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BREVO API ERROR] Status ${response.status}:`, errorText);
      return {
        success: false,
        error: `Brevo API error: ${response.status}`,
      };
    }

    const result = await response.json().catch(() => ({}));
    console.log(`[BREVO SUCCESS] Email sent to ${to}, messageId: ${result.messageId || "ok"}`);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("[BREVO EMAIL SERVICE EXCEPTION]:", error.message);
    // Không ném exception để tránh làm sập flow đăng ký/đặt lại mật khẩu
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 1. Gửi mã OTP xác nhận đăng ký tài khoản
 */
export const sendSignupOtpEmail = async ({ email, username, otpCode }) => {
  const title = "Mã Xác Thực Đăng Ký Tài Khoản";
  const bodyContent = `
    <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${username || "học viên"}</strong>,</p>
    <p style="font-size: 14px; color: #475569;">
      Cảm ơn bạn đã lựa chọn tham gia học tập tại <strong>Moly Course</strong>. Để hoàn tất quy trình tạo tài khoản và bảo mật email, vui lòng nhập mã xác thực gồm 6 chữ số dưới đây:
    </p>

    <div class="otp-box">
      <div class="otp-label">MÃ XÁC THỰC CỦA BẠN</div>
      <div class="otp-code">${otpCode}</div>
      <div class="otp-expire">⏳ Mã có hiệu lực trong vòng 5 phút</div>
    </div>

    <p style="font-size: 14px; color: #475569;">
      Vui lòng quay lại màn hình đăng ký và nhập mã này để kích hoạt tài khoản của bạn.
    </p>
  `;

  return sendBrevoEmail({
    to: email,
    toName: username,
    subject: `[Moly Course] Mã xác thực đăng ký tài khoản: ${otpCode}`,
    htmlContent: createBaseEmailHtml({
      title,
      preheader: `Mã OTP của bạn là ${otpCode}. Có hiệu lực trong 5 phút.`,
      bodyContent,
      showSecurityNote: true,
    }),
    textContent: `Mã xác thực đăng ký tài khoản Moly Course của bạn là: ${otpCode}. Mã có hiệu lực trong 5 phút.`,
  });
};

/**
 * 2. Gửi email chào mừng học viên gia nhập Moly Course
 */
export const sendWelcomeEmail = async ({ email, username }) => {
  const title = "Chào Mừng Gia Nhập Moly Course!";
  const bodyContent = `
    <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${username}</strong> 🎉,</p>
    <p style="font-size: 14px; color: #475569;">
      Tài khoản của bạn tại <strong>Moly Course</strong> đã được kích hoạt thành công! Giờ đây bạn đã có thể bắt đầu hành trình chinh phục các khóa học chất lượng cao:
    </p>

    <div style="background-color: #f8fafc; border-radius: 12px; padding: 18px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #334155; line-height: 1.8;">
        <li>🎓 <strong>Mục Khóa Học CSCA:</strong> Luyện thi chuẩn hóa Toán học & Dự bị Đại học chuyên sâu.</li>
        <li>🇨🇳 <strong>Mục Khóa Học Tiếng Trung:</strong> Lộ trình chuẩn HSK 1 đến HSK 6 và luyện phản xạ khẩu ngữ HSKK.</li>
        <li>📁 <strong>Kho Tài Liệu:</strong> Slide bài giảng, sổ tay từ vựng và audio luyện nghe miễn phí.</li>
        <li>📝 <strong>Bài Tập Tương Tác:</strong> Làm bài trắc nghiệm ngay dưới video bài học và nhận giải thích chi tiết.</li>
      </ul>
    </div>

    <div style="text-align: center;">
      <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/courses" class="btn">
        Khám Phá Khóa Học Ngay →
      </a>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
      Chúc bạn có những giờ học hiệu quả và đạt thành tích xuất sắc cùng Moly Course!
    </p>
  `;

  return sendBrevoEmail({
    to: email,
    toName: username,
    subject: "Chào mừng bạn đến với nền tảng học tập Moly Course!",
    htmlContent: createBaseEmailHtml({
      title,
      preheader: "Tài khoản của bạn đã được kích hoạt thành công. Bắt đầu học ngay!",
      bodyContent,
      showSecurityNote: false,
    }),
    textContent: `Chào mừng ${username} đến với Moly Course! Tài khoản của bạn đã được kích hoạt thành công.`,
  });
};

/**
 * 3. Gửi mã xác nhận quên mật khẩu / đặt lại mật khẩu
 */
export const sendPasswordResetOtpEmail = async ({ email, resetCode }) => {
  const title = "Yêu Cầu Đặt Lại Mật Khẩu";
  const bodyContent = `
    <p style="font-size: 15px; margin-top: 0;">Xin chào,</p>
    <p style="font-size: 14px; color: #475569;">
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với email <strong>${email}</strong> trên nền tảng <strong>Moly Course</strong>.
    </p>

    <div class="otp-box">
      <div class="otp-label">MÃ ĐẶT LẠI MẬT KHẨU</div>
      <div class="otp-code">${resetCode}</div>
      <div class="otp-expire">⏳ Mã có hiệu lực trong vòng 5 phút</div>
    </div>

    <p style="font-size: 14px; color: #475569;">
      Vui lòng nhập mã này vào trang xác thực để tiến hành thiết lập mật khẩu mới cho tài khoản của bạn.
    </p>
  `;

  return sendBrevoEmail({
    to: email,
    subject: `[Moly Course] Mã xác thực đặt lại mật khẩu: ${resetCode}`,
    htmlContent: createBaseEmailHtml({
      title,
      preheader: `Mã xác thực đặt lại mật khẩu của bạn là ${resetCode}. Hết hạn sau 5 phút.`,
      bodyContent,
      showSecurityNote: true,
    }),
    textContent: `Mã xác thực đặt lại mật khẩu Moly Course của bạn là: ${resetCode}. Mã có hiệu lực trong 5 phút.`,
  });
};

/**
 * 4. Gửi email thông báo đổi mật khẩu thành công
 */
export const sendPasswordChangedNotificationEmail = async ({ email, username }) => {
  const title = "Mật Khẩu Đã Được Thay Đổi";
  const bodyContent = `
    <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${username || "học viên"}</strong>,</p>
    <p style="font-size: 14px; color: #475569;">
      Mật khẩu cho tài khoản Moly Course của bạn (email: <strong>${email}</strong>) vừa được cập nhật thành công vào lúc <strong>${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</strong>.
    </p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 20px 0; color: #166534; font-size: 14px;">
      ✓ Tất cả các phiên đăng nhập cũ trên các thiết bị khác đã được đăng xuất an toàn. Bạn có thể sử dụng mật khẩu mới để đăng nhập lại.
    </div>

    <p style="font-size: 13px; color: #dc2626; font-weight: 600;">
      ⚠️ Cảnh báo: Nếu bạn KHÔNG thực hiện thay đổi này, hãy liên hệ ngay với đội ngũ hỗ trợ của Moly Course tại support@molycourse.com để bảo vệ tài khoản.
    </p>
  `;

  return sendBrevoEmail({
    to: email,
    toName: username,
    subject: "[Moly Course] Mật khẩu tài khoản của bạn đã được thay đổi",
    htmlContent: createBaseEmailHtml({
      title,
      preheader: "Mật khẩu của bạn tại Moly Course vừa được đổi thành công.",
      bodyContent,
      showSecurityNote: false,
    }),
    textContent: `Mật khẩu tài khoản Moly Course của bạn vừa được thay đổi thành công vào lúc ${new Date().toLocaleString("vi-VN")}.`,
  });
};

/**
 * 5. Gửi email thông báo chung (Lịch học, Bài tập, Khóa học mới)
 */
export const sendNotificationEmail = async ({ email, username, title, message, actionUrl, actionText }) => {
  const bodyContent = `
    <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${username || "học viên"}</strong>,</p>
    <p style="font-size: 14px; color: #475569; line-height: 1.7;">
      ${message}
    </p>
    ${
      actionUrl
        ? `<div style="text-align: center; margin: 24px 0;">
            <a href="${actionUrl}" class="btn">${actionText || "Xem Chi Tiết →"}</a>
          </div>`
        : ""
    }
  `;

  return sendBrevoEmail({
    to: email,
    toName: username,
    subject: `[Moly Course] ${title}`,
    htmlContent: createBaseEmailHtml({
      title,
      preheader: message.slice(0, 100),
      bodyContent,
      showSecurityNote: false,
    }),
    textContent: `${title}: ${message}`,
  });
};

/**
 * 6. Gửi email xác nhận đăng ký khóa học thành công
 */
export const sendCourseEnrollmentEmail = async ({ email, username, courseName, courseUrl }) => {
  const title = "Đăng Ký Khóa Học Thành Công!";
  const bodyContent = `
    <p style="font-size: 15px; margin-top: 0;">Xin chào <strong>${username || "học viên"}</strong>,</p>
    <p style="font-size: 14px; color: #475569; line-height: 1.7;">
      Chúc mừng bạn đã đăng ký thành công khóa học <strong>${courseName || "tại Moly Course"}</strong>! Toàn bộ bài giảng video, bài tập và tài liệu học tập của khóa học đã sẵn sàng để bạn trải nghiệm.
    </p>

    <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 18px; margin: 24px 0; text-align: center;">
      <p style="font-size: 13px; color: #9a3412; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 6px 0;">Khóa học của bạn</p>
      <p style="font-size: 18px; font-weight: 800; color: #ea580c; margin: 0;">${courseName || "Khóa học Moly Course"}</p>
    </div>

    ${
      courseUrl
        ? `<div style="text-align: center; margin: 28px 0;">
            <a href="${courseUrl}" class="btn" style="background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%); color: #ffffff; padding: 14px 32px; border-radius: 12px; font-weight: 700; text-decoration: none; display: inline-block;">Bắt Đầu Học Ngay →</a>
          </div>`
        : ""
    }

    <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
      💡 <em>Mẹo học tập: Hãy duy trì thói quen học ít nhất 30 phút mỗi ngày và hoàn thành đầy đủ bài tập để đạt kết quả tốt nhất!</em>
    </p>
  `;

  return sendBrevoEmail({
    to: email,
    toName: username,
    subject: `[Moly Course] Đăng ký thành công khóa học: ${courseName || ""}`,
    htmlContent: createBaseEmailHtml({
      title,
      preheader: `Chúc mừng bạn đã đăng ký thành công khóa học ${courseName || "tại Moly Course"}.`,
      bodyContent,
      showSecurityNote: false,
    }),
    textContent: `Chúc mừng ${username || "bạn"} đã đăng ký thành công khóa học: ${courseName || ""}. Truy cập Moly Course để bắt đầu học ngay!`,
  });
};

export default {
  sendBrevoEmail,
  sendSignupOtpEmail,
  sendWelcomeEmail,
  sendPasswordResetOtpEmail,
  sendPasswordChangedNotificationEmail,
  sendNotificationEmail,
  sendCourseEnrollmentEmail,
};
