import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Clapperboard,
  ClipboardCheck,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Library,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Shield,
  Sigma,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Video,
  Wallet,
} from 'lucide-react';

export const ADMIN_NAV_GROUPS = [
  {
    id: 'operations',
    label: 'Vận hành',
    defaultOpen: true,
    items: [
      {
        title: 'Tổng quan',
        keywords: 'dashboard kpi trang chu thong ke',
        path: '/admin/dashboard',
        icon: LayoutDashboard,
        match: (p) => p === '/admin' || p === '/admin/dashboard',
      },
      { title: 'Lớp học', keywords: 'class live duyet anh xa', path: '/admin/classes', icon: BookOpen },
      { title: 'Lịch học', keywords: 'calendar thoi khoa bieu buoi day', path: '/admin/calendar', icon: CalendarDays },
      { title: 'Lương & Chấm công', keywords: 'salary payroll face id van tay cham cong', path: '/admin/salaries', icon: Wallet },
      { title: 'Người dùng', keywords: 'user tai khoan hoc vien giang vien khoa', path: '/admin/users', icon: Users, adminOnly: true },
    ],
  },
  {
    id: 'academics',
    label: 'Học liệu & Đề thi',
    defaultOpen: true,
    items: [
      { title: 'Khóa học & Giáo trình', keywords: 'course curriculum chuong bai hoc', path: '/admin/curriculum', icon: GraduationCap },
      { title: 'Khóa video', keywords: 'video course bai giang', path: '/admin/video-courses', icon: Clapperboard },
      {
        title: 'Chấm bài & Quiz',
        keywords: 'grading assignment quiz dang de tu luan',
        path: '/admin/assignments/review',
        icon: ClipboardCheck,
        match: (p) => p.startsWith('/admin/assignments/review') || p.startsWith('/admin/quizzes'),
      },
      { title: 'Ngân hàng câu hỏi', keywords: 'question bank cau hoi', path: '/admin/question-bank', icon: Library },
      { title: 'Tài liệu học tập', keywords: 'files pdf slide', path: '/admin/files', icon: FolderOpen },
      { title: 'Bản ghi buổi học', keywords: 'recordings ghi hinh video lop', path: '/admin/recordings', icon: Video },
      { title: 'Quản lý công thức', keywords: 'formula toan ly hoa', path: '/admin/formulas', icon: Sigma },
    ],
  },
  {
    id: 'reports',
    label: 'Báo cáo & Học viên',
    defaultOpen: false,
    items: [
      { title: 'Báo cáo điểm danh', keywords: 'attendance chuyen can', path: '/admin/attendance-report', icon: UserCheck },
      { title: 'Duyệt sửa điểm danh', keywords: 'attendance review sua diem danh', path: '/admin/attendance-review', icon: CheckSquare },
      { title: 'Báo cáo điểm số', keywords: 'grades diem thi ket qua', path: '/admin/grades-report', icon: BarChart3 },
      { title: 'Sổ điểm & Tiến độ', keywords: 'progress tien do hoc tap', path: '/admin/student-progress', icon: TrendingUp },
      { title: 'Hỗ trợ học viên', keywords: 'support ticket hoi dap', path: '/admin/support', icon: MessageSquare },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống',
    defaultOpen: false,
    items: [
      { title: 'Phân quyền', keywords: 'permission role ma tran quyen', path: '/admin/permissions', icon: Shield },
      { title: 'Đồng bộ dữ liệu', keywords: 'sync outbox dlq hang doi', path: '/admin/sync', icon: RefreshCw },
      { title: 'Nhật ký hệ thống', keywords: 'audit log lich su thao tac', path: '/admin/audit-logs', icon: ScrollText },
      { title: 'Màn hình mở đầu', keywords: 'welcome screen banner', path: '/admin/welcome-screen', icon: Sparkles },
    ],
  },
];

export const isAdminNavItemActive = (item, pathname) => {
  if (typeof item.match === 'function') return item.match(pathname);
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
};

export const getAdminRouteMeta = (pathname) => {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (isAdminNavItemActive(item, pathname)) {
        return { group: group.label, title: item.title, groupId: group.id };
      }
    }
  }
  return { group: 'Quản trị', title: 'Tổng quan', groupId: 'operations' };
};
