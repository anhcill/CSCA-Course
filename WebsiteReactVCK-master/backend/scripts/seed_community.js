import { pool } from '../db/connect.js';

async function seed() {
  try {
    const uAdmin = (await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")).rows[0]?.id || 1;

    // Update display name for Admin
    await pool.query(
      "UPDATE users SET management_display_name = 'Ban Quản Trị Moly Course' WHERE id = $1",
      [uAdmin]
    );

    // Clean old posts and their cascading likes/comments/bookmarks
    await pool.query('DELETE FROM posts');

    const welcomeContent = `👋 Xin chào tất cả các bạn học viên thân mến, quý phụ huynh cùng toàn thể thầy cô giáo! 🎓💙

Thay mặt Ban Quản Trị Moly Course, xin gửi lời chào mừng nồng nhiệt nhất tới toàn thể mọi người khi chính thức gia nhập Ngôi nhà chung Moly Course! 🌟✨

Tại đây, chúng ta cùng nhau xây dựng một không gian học tập văn minh, sôi nổi và hỗ trợ lẫn nhau trên hành trình chinh phục kỳ thi CSCA Toán, Dự bị Đại học chuyên sâu cũng như lộ trình Tiếng Trung chuẩn hóa HSK 1–6 & HSKK! 🎯📚

🔥 NHỮNG ĐIỀU TUYỆT VỜI TẠI CỘNG ĐỒNG MOLY COURSE:
📌 💡 Hỏi đáp & Giải bài tập khó: Gặp bài toán hóc búa hay câu tiếng Trung khó hiểu? Hãy đăng bài ngay để nhận lời giải chi tiết và gợi ý phương pháp từ thầy cô & các bạn học viên khác.
📌 📖 Kho tài liệu & Bí quyết độc quyền: Tải miễn phí các bộ đề luyện tập chuẩn cấu trúc, tóm tắt công thức trọng tâm, mẹo bấm máy Casio và từ vựng then chốt.
📌 🤝 Tìm bạn học nhóm & Trao đổi: Lập nhóm cùng ôn thi, chia sẻ kinh nghiệm học tập và tiếp thêm động lực cho nhau mỗi ngày.
📌 📢 Cập nhật thông tin nhanh nhất: Nhận các thông báo mới nhất về lịch học trực tuyến (Live Class), thi thử định kỳ và các sự kiện học thuật của trung tâm.

🛡️ QUY TẮC CỘNG ĐỒNG VĂN MINH:
✅ Luôn giữ tinh thần tích cực, lịch sự và tôn trọng lẫn nhau. 🤝
✅ Đặt tiêu đề rõ ràng, chọn đúng chủ đề (Hỏi đáp, Tài liệu, Kinh nghiệm, Học nhóm...) để mọi người dễ theo dõi và hỗ trợ nhanh nhất. 🔍
✅ Nghiêm cấm mọi hành vi spam quảng cáo rác hoặc nội dung thiếu văn hóa. 🚫

💬 LỜI CHÀO TỪ BẠN:
Hãy để lại một bình luận bên dưới bài viết này để giới thiệu bản thân, mục tiêu điểm số hoặc kỳ thi sắp tới của bạn để mọi người cùng làm quen và kết nối nhé! 👇🎉

Chúc tất cả các bạn có một hành trình học tập bứt phá, nhiều niềm vui và đạt kết quả rực rỡ nhất! 🚀💪✨`;

    const p = await pool.query(
      `INSERT INTO posts (author_id, title, slug, content, image_url, topic, is_pinned, is_approved, tags, likes_count, comments_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        uAdmin,
        '🎉 Chào Mừng Toàn Thể Học Viên & Thầy Cô Đến Với Cộng Đồng Moly Course! 🚀✨',
        'chao-mung-cong-dong-moly-course',
        welcomeContent,
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
        'chat',
        true,
        true,
        ['ChaoMung', 'MolyCourse', 'CongDongHocTap', 'CSCA2026', 'HSK'],
        128,
        0
      ]
    );

    console.log('SEEDED WELCOME COMMUNITY POST SUCCESSFULLY WITH ID:', p.rows[0].id);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
