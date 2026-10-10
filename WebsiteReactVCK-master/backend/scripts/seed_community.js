import { pool } from '../db/connect.js';

async function seed() {
  try {
    const cnt = await pool.query('SELECT COUNT(*) FROM posts');
    if (parseInt(cnt.rows[0].count, 10) === 0) {
      const uAdmin = (await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1")).rows[0]?.id || 1;
      const uTeacher = (await pool.query("SELECT id FROM users WHERE role = 'creator' LIMIT 1")).rows[0]?.id || uAdmin;
      const uStudent = (await pool.query("SELECT id FROM users WHERE role = 'user' LIMIT 1")).rows[0]?.id || uAdmin;

      const p1 = await pool.query(
        `INSERT INTO posts (author_id, title, slug, content, image_url, topic, is_pinned, is_approved, tags, likes_count, comments_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          uTeacher,
          'Chiến thuật 45 phút đầu cho phần Đại số & Giải tích thi CSCA 2026',
          'chien-thuat-45-phut-dau-csca-2026',
          'Chào các bạn học viên! Qua các đợt thi thử gần đây, thầy thấy nhiều bạn mất quá nhiều thời gian ở 3 câu hàm số ngược mà quên rằng các câu xác suất phía sau cho điểm dễ hơn nhiều.\n\n📌 3 lời khuyên cốt lõi:\n1. Phân loại ngay câu hỏi: Câu nhận biết hoàn thành trong < 1 phút.\n2. Khi gặp bài toán tìm miền giá trị, luôn vẽ nhanh bảng biến thiên trước khi đặt bút tính tích phân.\n3. Đừng để trống bất kỳ câu trắc nghiệm nào trước 5 phút nộp bài.\n\nChúc cả nhà ôn tập tuần này thật tập trung nhé!',
          'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
          'experience',
          true,
          true,
          ['KinhNghiemCSCA', 'ToanCSCA', 'ChienThuatLamBai'],
          38,
          2
        ]
      );

      const p2 = await pool.query(
        `INSERT INTO posts (author_id, title, slug, content, image_url, topic, is_pinned, is_approved, tags, likes_count, comments_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          uStudent,
          'Nhờ mọi người giải thích giúp bài toán tổ hợp phân chia nhóm',
          'nho-giai-thich-to-hop-phan-chia-nhom',
          'Đề bài: "Có 10 học sinh gồm 6 nam và 4 nữ. Cần chia thành 2 nhóm, mỗi nhóm 5 người sao cho nhóm nào cũng có ít nhất 1 nữ. Hỏi có bao nhiêu cách chia?"\n\nMình giải theo hướng tính tổng số cách rồi trừ phần bù không có nữ ở một nhóm, nhưng kết quả ra khác với đáp án tham khảo (120 cách). Nhờ các cao thủ toán trong cộng đồng chỉ giúp lỗi sai với ạ!',
          null,
          'qa',
          false,
          true,
          ['ToHopXacSuat', 'GiaiBaiTap', 'CSCA_Math'],
          24,
          2
        ]
      );

      const p3 = await pool.query(
        `INSERT INTO posts (author_id, title, slug, content, image_url, topic, is_pinned, is_approved, tags, likes_count, comments_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          uStudent,
          'Tìm 2 bạn lập nhóm học Live CSCA & Luyện đề buổi tối 2-4-6',
          'tim-ban-lap-nhom-hoc-live-csca',
          'Chào cả nhà! Mình đang ôn thi CSCA kỳ tháng 11/2026, hiện tại tự học một mình đôi lúc hơi nản và muốn có bạn cùng giải đề, trao đổi bài sau mỗi buổi học trực tuyến.\n\n🎯 Mục tiêu nhóm:\n- Luyện 1 đề toán/ngày vào các tối thứ 2, 4, 6 (20:30 - 22:00).\n- Tạo không gian Google Meet chia sẻ cách bấm máy Casio và mẹo nhận biết dạng.\n- Bạn nào muốn join thì comment username hoặc nhắn mình nhé!',
          'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
          'study_group',
          false,
          true,
          ['HocNhom', 'CSCA2026', 'DongHanh'],
          45,
          1
        ]
      );

      const p4 = await pool.query(
        `INSERT INTO posts (author_id, title, slug, content, image_url, topic, is_pinned, is_approved, tags, likes_count, comments_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          uAdmin,
          'Tổng hợp Bộ đề ôn luyện CSCA Toán chuẩn cấu trúc 2026 đã cập nhật',
          'tong-hop-bo-de-on-luyen-csca-toan-2026',
          'Bộ phận học liệu Moly Course vừa hoàn tất đồng bộ toàn bộ tài liệu và đề luyện tập chuyên sâu cho các phần:\n- Miền xác định và miền giá trị hàm số (40 câu có đáp án chi tiết)\n- Hàm số ngược và tính đơn điệu\n- Tổ hợp, xác suất và phân phối chuẩn\n\nCác bạn học viên vào mục "Tài liệu" hoặc tại không gian buổi học của lớp mình để tải về nhé. Nếu có thắc mắc bài nào, hãy đăng bài trực tiếp lên Cộng đồng này để thầy cô và các bạn trợ giúp nhanh nhất!',
          'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80',
          'materials',
          true,
          true,
          ['TaiLieuChuan', 'DeThiCSCA', 'ThongBao'],
          89,
          1
        ]
      );

      // Comments
      await pool.query(
        'INSERT INTO post_comments (post_id, author_id, content, likes_count) VALUES ($1, $2, $3, $4)',
        [p1.rows[0].id, uStudent, 'Em cảm ơn thầy nhiều ạ! Đợt thi thử vừa rồi em bị kẹt đúng câu hàm số nên lỡ mất 4 câu phía sau. Áp dụng ngay đợt thi tuần này ạ ❤️', 5]
      );
      await pool.query(
        'INSERT INTO post_comments (post_id, author_id, content, likes_count) VALUES ($1, $2, $3, $4)',
        [p1.rows[0].id, uStudent, 'Thầy cho em hỏi phần hàm số mũ và logarit năm nay có dạng đồ thị giao thoa không ạ?', 2]
      );
      await pool.query(
        'INSERT INTO post_comments (post_id, author_id, content, likes_count) VALUES ($1, $2, $3, $4)',
        [p2.rows[0].id, uTeacher, 'Lưu ý việc chia thành 2 nhóm không phân biệt tên nhóm (Nhóm A, Nhóm B) thì sau khi chọn 5 người cho nhóm 1, ta phải chia 2! để tránh đếm trùng lặp nhé em.', 12]
      );
      await pool.query(
        'INSERT INTO post_comments (post_id, author_id, content, likes_count) VALUES ($1, $2, $3, $4)',
        [p2.rows[0].id, uStudent, 'Dạ em hiểu rồi ạ! Em bị quên mất chia cho 2! do 2 nhóm đối xứng. Cảm ơn thầy nhiều!', 4]
      );
      await pool.query(
        'INSERT INTO post_comments (post_id, author_id, content, likes_count) VALUES ($1, $2, $3, $4)',
        [p3.rows[0].id, uStudent, 'Cho mình đăng ký 1 slot với bạn ơi! Khung giờ 20h30 rất vừa với lịch của mình.', 3]
      );
      await pool.query(
        'INSERT INTO post_comments (post_id, author_id, content, likes_count) VALUES ($1, $2, $3, $4)',
        [p4.rows[0].id, uStudent, 'Tài liệu giải thích từng bước cực kỳ dễ hiểu ạ, cảm ơn trung tâm nhiều!', 6]
      );

      console.log('SEEDED COMMUNITY POSTS AND COMMENTS IN POSTGRESQL SUCCESSFULLY!');
    } else {
      console.log('Posts already seeded.');
    }
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
