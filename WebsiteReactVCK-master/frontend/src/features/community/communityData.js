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
    id: 'post-welcome-admin',
    author: {
      id: '1',
      name: 'Ban Quản Trị Moly Course',
      username: 'ducanhle28072003',
      role: 'admin',
      roleLabel: 'Quản trị viên',
      avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocIMUUAYQp9tYrfmU-FZVh3WWj5MaargvQ1T_rOmum38lvuslpo=s96-c',
      badge: 'admin',
    },
    topic: 'chat',
    title: '🎉 Chào Mừng Toàn Thể Học Viên & Thầy Cô Đến Với Cộng Đồng Moly Course! 🚀✨',
    content: `👋 Xin chào tất cả các bạn học viên thân mến, quý phụ huynh cùng toàn thể thầy cô giáo! 🎓💙

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

Chúc tất cả các bạn có một hành trình học tập bứt phá, nhiều niềm vui và đạt kết quả rực rỡ nhất! 🚀💪✨`,
    imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
    tags: ['ChaoMung', 'MolyCourse', 'CongDongHocTap', 'CSCA2026', 'HSK'],
    createdAt: new Date().toISOString(),
    likesCount: 128,
    likedBy: [],
    commentsCount: 0,
    isPinned: true,
    comments: [],
  },
];

export const TOP_CONTRIBUTORS = [
  {
    id: 'u-admin',
    name: 'Ban Quản Trị Moly Course',
    username: 'ducanhle28072003',
    avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocIMUUAYQp9tYrfmU-FZVh3WWj5MaargvQ1T_rOmum38lvuslpo=s96-c',
    badge: 'Quản trị viên',
    points: 2500,
    postsCount: 1,
  },
];

export const TRENDING_TAGS = [
  { tag: 'ChaoMung', count: 128 },
  { tag: 'MolyCourse', count: 95 },
  { tag: 'CongDongHocTap', count: 86 },
  { tag: 'ToanCSCA2026', count: 72 },
  { tag: 'TiengTrungHSK', count: 54 },
];

const STORAGE_KEY = 'moly_csca_community_posts_v4';
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
