import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  ClipboardCheck,
  FolderOpen,
  GraduationCap,
  Home,
  LayoutDashboard,
  Library,
  MessageSquare,
  Presentation,
  RefreshCw,
  ScrollText,
  Search,
  Shield,
  Sigma,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';

export const ADMIN_NAV_GROUPS = [
  {
    id: 'operations',
    label: 'Vận hành',
    defaultOpen: true,
    items: [
      { title: 'Tổng quan', path: '/admin/dashboard', icon: LayoutDashboard, match: (p) => p === '/admin' || p === '/admin/dashboard' },
      { title: 'Lớp học', path: '/admin/classes', icon: BookOpen },
      { title: 'Lịch học', path: '/admin/calendar', icon: CalendarDays },
      { title: 'Lương & Chấm công', path: '/admin/salaries', icon: Wallet },
      { title: 'Người dùng', path: '/admin/users', icon: Users, adminOnly: true },
    ],
  },
  {
    id: 'academics',
    label: 'Học liệu & Đề thi',
    defaultOpen: true,
    items: [
      { title: 'Khóa học & Giáo trình', path: '/admin/curriculum', icon: GraduationCap },
      { title: 'Khóa video', path: '/admin/video-courses', icon: Clapperboard },
      {
        title: 'Chấm bài & Quiz',
        path: '/admin/assignments/review',
        icon: ClipboardCheck,
        match: (p) => p.startsWith('/admin/assignments/review') || p.startsWith('/admin/quizzes'),
      },
      { title: 'Ngân hàng câu hỏi', path: '/admin/question-bank', icon: Library },
      { title: 'Tài liệu học tập', path: '/admin/files', icon: FolderOpen },
      { title: 'Bản ghi buổi học', path: '/admin/recordings', icon: Video },
      { title: 'Quản lý công thức', path: '/admin/formulas', icon: Sigma },
    ],
  },
  {
    id: 'reports',
    label: 'Báo cáo & Học viên',
    defaultOpen: false,
    items: [
      { title: 'Báo cáo điểm danh', path: '/admin/attendance-report', icon: UserCheck },
      { title: 'Duyệt sửa điểm danh', path: '/admin/attendance-review', icon: CheckSquare },
      { title: 'Báo cáo điểm số', path: '/admin/grades-report', icon: BarChart3 },
      { title: 'Sổ điểm & Tiến độ', path: '/admin/student-progress', icon: TrendingUp },
      { title: 'Hỗ trợ học viên', path: '/admin/support', icon: MessageSquare },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống',
    defaultOpen: false,
    items: [
      { title: 'Phân quyền', path: '/admin/permissions', icon: Shield },
      { title: 'Đồng bộ dữ liệu', path: '/admin/sync', icon: RefreshCw },
      { title: 'Nhật ký hệ thống', path: '/admin/audit-logs', icon: ScrollText },
      { title: 'Màn hình mở đầu', path: '/admin/welcome-screen', icon: Sparkles },
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

function SidebarInner({ collapsed, onNavigate, onToggleCollapse, isMobile = false }) {
  const { authUser } = useAuthContext();
  const location = useLocation();
  const isAdmin = authUser?.role === 'admin';
  const [query, setQuery] = useState('');

  const activeMeta = useMemo(() => getAdminRouteMeta(location.pathname), [location.pathname]);

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    for (const g of ADMIN_NAV_GROUPS) {
      initial[g.id] = g.defaultOpen || g.id === activeMeta.groupId;
    }
    return initial;
  });

  useEffect(() => {
    setOpenGroups((prev) => (prev[activeMeta.groupId] ? prev : { ...prev, [activeMeta.groupId]: true }));
  }, [activeMeta.groupId]);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    return ADMIN_NAV_GROUPS.map((group) => {
      const items = group.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (!normalizedQuery) return true;
        return (
          item.title.toLowerCase().includes(normalizedQuery)
          || group.label.toLowerCase().includes(normalizedQuery)
        );
      });
      return { ...group, items };
    }).filter((group) => group.items.length > 0);
  }, [isAdmin, normalizedQuery]);

  const toggleGroup = (id) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isMini = collapsed && !isMobile;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${isMini ? 'px-2 py-4' : 'px-3.5 py-4'}`}>
      {/* Brand Header */}
      <div className={`shrink-0 flex items-center ${isMini ? 'flex-col gap-2' : 'justify-between px-1'}`}>
        <Link
          to="/admin/dashboard"
          onClick={onNavigate}
          className={`flex items-center gap-2.5 ${isMini ? 'justify-center' : ''}`}
          title={isMini ? 'CSCA Admin' : undefined}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
            <Shield className="h-5 w-5" />
          </span>
          {!isMini && (
            <span className="leading-tight min-w-0">
              <span className="block text-base font-black tracking-tight text-[#102f63] dark:text-white">
                CSCA Admin
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Quản trị trung tâm
              </span>
            </span>
          )}
        </Link>

        {isMobile ? (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Đóng menu"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        ) : onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-[#eef7fd] text-[#102f63] hover:bg-blue-100 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            title={isMini ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            aria-label={isMini ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            {isMini ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {/* Quick Search Filter */}
      {!isMini && (
        <div className="mt-3 shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mục quản trị..."
              className="w-full rounded-xl border border-slate-200/90 bg-slate-50/90 py-1.5 pl-8 pr-7 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Xóa tìm kiếm"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="my-2.5 h-px shrink-0 bg-slate-100 dark:bg-slate-800" />

      {/* Categorized Accordion Nav */}
      <nav
        aria-label="Điều hướng quản trị"
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleGroups.map((group) => {
          const isOpen = Boolean(normalizedQuery) || isMini || Boolean(openGroups[group.id]);
          const groupHasActive = group.items.some((item) => isAdminNavItemActive(item, location.pathname));

          return (
            <div key={group.id} className="space-y-0.5">
              {!isMini && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <span className={groupHasActive ? 'text-blue-600 dark:text-sky-400' : ''}>
                    {group.label}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              )}

              {isOpen && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isAdminNavItemActive(item, location.pathname);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onNavigate}
                        title={isMini ? item.title : undefined}
                        className={`group flex items-center rounded-xl text-xs font-semibold transition ${
                          isMini ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-2.5 py-2'
                        } ${
                          active
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25 font-bold'
                            : 'text-[#17365f] hover:bg-blue-50/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 transition ${
                            active
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-sky-400'
                          }`}
                        />
                        {!isMini && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {visibleGroups.length === 0 && !isMini && (
          <p className="py-6 text-center text-xs text-slate-400">Không tìm thấy mục phù hợp</p>
        )}
      </nav>

      {/* Footer Quick Switchers */}
      <div className="mt-2.5 shrink-0 space-y-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <Link
          to="/lms/teach"
          onClick={onNavigate}
          title={isMini ? 'Chế độ Giảng viên' : undefined}
          className={`flex items-center rounded-xl text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 ${
            isMini ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2'
          }`}
        >
          <Presentation className="h-4 w-4 shrink-0" />
          {!isMini && <span className="truncate">Chế độ Giảng viên</span>}
        </Link>
        <Link
          to="/"
          onClick={onNavigate}
          title={isMini ? 'Trang chủ CSCA' : undefined}
          className={`flex items-center rounded-xl text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${
            isMini ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2'
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          {!isMini && <span className="truncate">Trang chủ CSCA</span>}
        </Link>
      </div>
    </div>
  );
}

const Sidebar = ({ mobileOpen, collapsed, closeMobileSidebar, onToggleCollapse }) => {
  return (
    <>
      {/* Desktop Floating Glass Sidebar Card */}
      <aside
        className={`fixed bottom-4 left-4 top-4 z-50 hidden overflow-hidden rounded-3xl border border-white/85 bg-white/92 shadow-[0_16px_50px_rgba(32,78,120,0.13)] backdrop-blur-xl transition-[width] duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900/94 dark:shadow-none lg:flex lg:flex-col ${
          collapsed ? 'w-[74px]' : 'w-[244px]'
        }`}
      >
        <SidebarInner collapsed={collapsed} onNavigate={closeMobileSidebar} onToggleCollapse={onToggleCollapse} />
      </aside>

      {/* Mobile Floating Drawer */}
      {mobileOpen && (
        <div className="fixed inset-y-3 left-3 z-[60] w-[min(18.5rem,88vw)] overflow-hidden rounded-3xl border border-white/85 bg-white/96 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/96 lg:hidden">
          <SidebarInner collapsed={false} onNavigate={closeMobileSidebar} isMobile />
        </div>
      )}
    </>
  );
};

export default Sidebar;
