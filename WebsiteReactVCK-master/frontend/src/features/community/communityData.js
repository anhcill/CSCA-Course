// Initial seed data and persistence helpers for CSCA & Moly Course Community (Mạng xã hội học tập)

export const COMMUNITY_TOPICS = [
  { id: 'all', label: 'Tất cả', icon: 'Sparkles', color: 'blue' },
  { id: 'qa', label: 'Hỏi đáp & Giải bài', icon: 'HelpCircle', color: 'emerald' },
  { id: 'materials', label: 'Tài liệu & Bí quyết', icon: 'BookOpen', color: 'indigo' },
  { id: 'experience', label: 'Kinh nghiệm thi CSCA', icon: 'Award', color: 'violet' },
  { id: 'study_group', label: 'Tìm bạn học nhóm', icon: 'Users', color: 'amber' },
  { id: 'chat', label: 'Góc trò chuyện', icon: 'MessageCircle', color: 'rose' },
];

export const TOPIC_BADGES = {
  qa: { label: 'Hỏi đáp & Giải bài', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' },
  materials: { label: 'Tài liệu & Bí quyết', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-sky-300 dark:border-blue-800' },
  experience: { label: 'Kinh nghiệm thi', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800' },
  study_group: { label: 'Tìm bạn học nhóm', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' },
  chat: { label: 'Góc trò chuyện', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800' },
};

export const INITIAL_POSTS = [
  {
    id: 'post-101',
    author: {
      id: 'u-1',
      name: 'Thầy Hoàng Minh',
      username: 'hoangminh_csca',
      role: 'creator',
      roleLabel: 'Giảng viên CSCA',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      badge: 'teacher',
    },
    topic: 'experience',
    title: 'Chiến thuật 45 phút đầu cho phần Đại số & Giải tích thi CSCA 2026',
    content: 'Chào các bạn học viên! Qua các đợt thi thử gần đây, thầy thấy nhiều bạn mất quá nhiều thời gian ở 3 câu hàm số ngược mà quên rằng các câu xác suất phía sau cho điểm dễ hơn nhiều.\n\n📌 3 lời khuyên cốt lõi:\n1. Phân loại ngay câu hỏi: Câu nhận biết hoàn thành trong < 1 phút.\n2. Khi gặp bài toán tìm miền giá trị, luôn vẽ nhanh bảng biến thiên trước khi đặt bút tính tích phân.\n3. Đừng để trống bất kỳ câu trắc nghiệm nào trước 5 phút nộp bài.\n\nChúc cả nhà ôn tập tuần này thật tập trung nhé!',
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80',
    tags: ['KinhNghiemCSCA', 'ToanCSCA', 'ChienThuatLamBai'],
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    likesCount: 38,
    likedBy: ['u-2', 'u-4', 'u-5'],
    commentsCount: 6,
    isPinned: true,
    comments: [
      {
        id: 'c-101-1',
        author: {
          id: 'u-2',
          name: 'Nguyễn Thu Trang',
          username: 'thutrang_csca',
          role: 'user',
          roleLabel: 'Học viên CSCA',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
        },
        content: 'Em cảm ơn thầy nhiều ạ! Đợt thi thử vừa rồi em bị kẹt đúng câu hàm số nên lỡ mất 4 câu phía sau. Áp dụng ngay đợt thi tuần này ạ ❤️',
        createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        likesCount: 5,
        likedBy: [],
      },
      {
        id: 'c-101-2',
        author: {
          id: 'u-3',
          name: 'Trần Quốc Bảo',
          username: 'baotran_math',
          role: 'user',
          roleLabel: 'Học viên CSCA',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
        },
        content: 'Thầy cho em hỏi phần hàm số mũ và logarit năm nay có dạng đồ thị giao thoa không ạ?',
        createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        likesCount: 2,
        likedBy: [],
      },
    ],
  },
  {
    id: 'post-102',
    author: {
      id: 'u-4',
      name: 'Lê Hải Đăng',
      username: 'haidang_coder',
      role: 'user',
      roleLabel: 'Học viên tiêu biểu',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
      badge: 'top_student',
    },
    topic: 'qa',
    title: 'Nhờ mọi người giải thích giúp bài toán tổ hợp phân chia nhóm',
    content: 'Đề bài: "Có 10 học sinh gồm 6 nam và 4 nữ. Cần chia thành 2 nhóm, mỗi nhóm 5 người sao cho nhóm nào cũng có ít nhất 1 nữ. Hỏi có bao nhiêu cách chia?"\n\nMình giải theo hướng tính tổng số cách rồi trừ phần bù không có nữ ở một nhóm, nhưng kết quả ra khác với đáp án tham khảo (120 cách). Nhờ các cao thủ toán trong cộng đồng chỉ giúp lỗi sai với ạ!',
    imageUrl: '',
    tags: ['ToHopXacSuat', 'GiaiBaiTap', 'CSCA_Math'],
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    likesCount: 24,
    likedBy: ['u-1', 'u-3'],
    commentsCount: 3,
    comments: [
      {
        id: 'c-102-1',
        author: {
          id: 'u-1',
          name: 'Thầy Hoàng Minh',
          username: 'hoangminh_csca',
          role: 'creator',
          roleLabel: 'Giảng viên CSCA',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
        },
        content: 'Lưu ý việc chia thành 2 nhóm không phân biệt tên nhóm (Nhóm A, Nhóm B) thì sau khi chọn 5 người cho nhóm 1, ta phải chia 2! để tránh đếm trùng lặp nhé em.',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        likesCount: 12,
        likedBy: ['u-4'],
      },
      {
        id: 'c-102-2',
        author: {
          id: 'u-4',
          name: 'Lê Hải Đăng',
          username: 'haidang_coder',
          role: 'user',
          roleLabel: 'Học viên tiêu biểu',
          avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
        },
        content: 'Dạ em hiểu rồi ạ! Em bị quên mất chia cho 2! do 2 nhóm đối xứng. Cảm ơn thầy nhiều!',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        likesCount: 4,
        likedBy: [],
      },
    ],
  },
  {
    id: 'post-103',
    author: {
      id: 'u-5',
      name: 'Vũ Mai Phương',
      username: 'maiphuong_hsk',
      role: 'user',
      roleLabel: 'Học viên CSCA',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&q=80',
    },
    topic: 'study_group',
    title: 'Tìm 2 bạn lập nhóm học Live CSCA & Luyện đề buổi tối 2-4-6',
    content: 'Chào cả nhà! Mình đang ôn thi CSCA kỳ tháng 11/2026, hiện tại tự học một mình đôi lúc hơi nản và muốn có bạn cùng giải đề, trao đổi bài sau mỗi buổi học trực tuyến.\n\n🎯 Mục tiêu nhóm:\n- Luyện 1 đề toán/ngày vào các tối thứ 2, 4, 6 (20:30 - 22:00).\n- Tạo không gian Google Meet chia sẻ cách bấm máy Casio và mẹo nhận biết dạng.\n- Bạn nào muốn join thì comment username hoặc nhắn mình nhé!',
    imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
    tags: ['HocNhom', 'CSCA2026', 'DongHanh'],
    createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    likesCount: 45,
    likedBy: ['u-2', 'u-3', 'u-4'],
    commentsCount: 4,
    comments: [
      {
        id: 'c-103-1',
        author: {
          id: 'u-2',
          name: 'Nguyễn Thu Trang',
          username: 'thutrang_csca',
          role: 'user',
          roleLabel: 'Học viên CSCA',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
        },
        content: 'Cho mình đăng ký 1 slot với bạn ơi! Khung giờ 20h30 rất vừa với lịch của mình.',
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        likesCount: 3,
        likedBy: [],
      },
    ],
  },
  {
    id: 'post-104',
    author: {
      id: 'u-admin',
      name: 'Ban Quản Trị Moly Course',
      username: 'moly_official',
      role: 'admin',
      roleLabel: 'Quản trị viên',
      avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&q=80',
      badge: 'admin',
    },
    topic: 'materials',
    title: 'Tổng hợp Bộ đề ôn luyện CSCA Toán chuẩn cấu trúc 2026 đã cập nhật',
    content: 'Bộ phận học liệu Moly Course vừa hoàn tất đồng bộ toàn bộ tài liệu và đề luyện tập chuyên sâu cho các phần:\n- Miền xác định và miền giá trị hàm số (40 câu có đáp án chi tiết)\n- Hàm số ngược và tính đơn điệu\n- Tổ hợp, xác suất và phân phối chuẩn\n\nCác bạn học viên vào mục "Tài liệu" hoặc tại không gian buổi học của lớp mình để tải về nhé. Nếu có thắc mắc bài nào, hãy đăng bài trực tiếp lên Cộng đồng này để thầy cô và các bạn trợ giúp nhanh nhất!',
    imageUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80',
    tags: ['TaiLieuChuan', 'DeThiCSCA', 'ThongBao'],
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    likesCount: 89,
    likedBy: ['u-1', 'u-2', 'u-3', 'u-4', 'u-5'],
    commentsCount: 8,
    isPinned: true,
    comments: [
      {
        id: 'c-104-1',
        author: {
          id: 'u-3',
          name: 'Trần Quốc Bảo',
          username: 'baotran_math',
          role: 'user',
          roleLabel: 'Học viên CSCA',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
        },
        content: 'Tài liệu giải thích từng bước cực kỳ dễ hiểu ạ, cảm ơn trung tâm nhiều!',
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
        likesCount: 6,
        likedBy: [],
      },
    ],
  },
  {
    id: 'post-105',
    author: {
      id: 'u-3',
      name: 'Trần Quốc Bảo',
      username: 'baotran_math',
      role: 'user',
      roleLabel: 'Học viên CSCA',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    },
    topic: 'chat',
    title: 'Góc động lực: Trải nghiệm vừa học tiếng Trung vừa ôn thi CSCA',
    content: 'Nhiều lúc cảm giác 24 giờ một ngày không đủ: vừa cày từ vựng HSK vừa giải bài tập đạo hàm giải tích. Nhưng mỗi lần giải xong một đề đạt điểm cao hơn lần trước là thấy mọi nỗ lực đều xứng đáng.\n\nChia sẻ một câu ngạn ngữ tiếng Trung mình rất thích:\n"千里之行，始于足下" (Hành trình vạn dặm bắt đầu từ một bước chân).\nChúc toàn thể anh chị em trong cộng đồng giữ vững ngọn lửa nhiệt huyết nhé! 💪🔥',
    imageUrl: '',
    tags: ['DongLucHocTap', 'ChiaSe', 'CSCA_HSK'],
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    likesCount: 62,
    likedBy: ['u-1', 'u-2', 'u-4', 'u-5'],
    commentsCount: 5,
    comments: [],
  },
];

export const TOP_CONTRIBUTORS = [
  {
    id: 'u-1',
    name: 'Thầy Hoàng Minh',
    username: 'hoangminh_csca',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    badge: 'Giảng viên',
    points: 1420,
    postsCount: 18,
  },
  {
    id: 'u-4',
    name: 'Lê Hải Đăng',
    username: 'haidang_coder',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
    badge: 'Học viên tiêu biểu',
    points: 980,
    postsCount: 12,
  },
  {
    id: 'u-2',
    name: 'Nguyễn Thu Trang',
    username: 'thutrang_csca',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
    badge: 'Thành viên tích cực',
    points: 750,
    postsCount: 9,
  },
  {
    id: 'u-3',
    name: 'Trần Quốc Bảo',
    username: 'baotran_math',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    badge: 'Chiến thần giải toán',
    points: 620,
    postsCount: 7,
  },
];

export const TRENDING_TAGS = [
  { tag: 'ToanCSCA2026', count: 142 },
  { tag: 'DeThiThuThang10', count: 98 },
  { tag: 'ToHopXacSuat', count: 76 },
  { tag: 'KinhNghiemCSCA', count: 64 },
  { tag: 'HocNhomOnline', count: 52 },
  { tag: 'GiaiTichHamSo', count: 45 },
];

const STORAGE_KEY = 'moly_csca_community_posts_v2';
const BOOKMARKS_KEY = 'moly_csca_community_bookmarks_v2';

export const getStoredPosts = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_POSTS));
      return INITIAL_POSTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : INITIAL_POSTS;
  } catch {
    return INITIAL_POSTS;
  }
};

export const saveStoredPosts = (posts) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch (err) {
    console.error('Error saving community posts:', err);
  }
};

export const getStoredBookmarks = () => {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const toggleStoredBookmark = (postId) => {
  try {
    const current = getStoredBookmarks();
    const updated = current.includes(postId)
      ? current.filter((id) => id !== postId)
      : [...current, postId];
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
};
